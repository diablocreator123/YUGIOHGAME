import {
  availableChakra,
  canUseSkill,
  confirmTurn,
  createGame,
  exchangeChakra,
  findCharacter,
  getSkill,
  openReady,
  queueAction,
  setActionPayment,
  tickTimer,
  totalChakra,
  validTargets,
  cancelReview,
} from "../game/engine.js";
import { CHARACTER_DATA, CHAKRA_LABELS, CHAKRA_TYPES } from "../game/data.js";

const roster = ["naruto", "sasuke", "sakura"];

export function mountArena(root, { turnSeconds = 60 } = {}) {
  let selectedRoster = new Set();
  let state = null;
  let selectedSkill = null;
  let lastAutoTargetId = null;
  let notice = "";
  let timerId = null;
  let deadline = null;

  const refreshDeadline = () => {
    deadline = Date.now() + state.timerSeconds * 1000;
  };

  const stopClock = () => {
    if (timerId) clearInterval(timerId);
    timerId = null;
  };

  const startClock = () => {
    stopClock();
    refreshDeadline();
    timerId = setInterval(() => {
      if (!state || state.phase === "finished") return;
      const nextSeconds = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      const elapsed = state.timerSeconds - nextSeconds;
      if (elapsed > 0) {
        tickTimer(state, elapsed);
        if (state.turn > 1 && state.timerSeconds === state.turnSeconds) refreshDeadline();
        selectedSkill = null;
        lastAutoTargetId = null;
        render();
      }
    }, 200);
  };

  const enterBattle = () => {
    if (selectedRoster.size !== 3) return;
    state = createGame({ playerRoster: [...selectedRoster], enemyRoster: roster, turnSeconds });
    notice = "Choose one skill per living character, then press when ready.";
    selectedSkill = null;
    lastAutoTargetId = null;
    startClock();
    render();
  };

  const selectSkill = (casterId, skillId) => {
    const skill = getSkill(findCharacter(state, casterId), skillId);
    if (!skill) return;
    const check = canUseSkill(state, "player", casterId, skillId);
    if (!check.ok) {
      notice = `Cannot use ${skill.name}: ${humanize(check.reason)}.`;
      render();
      return;
    }
    lastAutoTargetId = null;
    if (skill.target === "self") {
      const result = queueAction(state, "player", casterId, skillId, casterId);
      notice = result.ok ? `${skill.name} automatically targeted ${findCharacter(state, casterId).name}; its chakra is reserved.` : `Could not queue ${skill.name}.`;
      lastAutoTargetId = casterId;
      selectedSkill = null;
    } else {
      selectedSkill = { casterId, skillId };
      notice = `Select a valid ${skill.target} target.`;
    }
    render();
  };

  const selectTarget = (targetId) => {
    if (!selectedSkill) return;
    const valid = validTargets(state, "player", selectedSkill.casterId, selectedSkill.skillId);
    if (!valid.includes(targetId)) return;
    const result = queueAction(state, "player", selectedSkill.casterId, selectedSkill.skillId, targetId);
    notice = result.ok ? "Action queued and chakra reserved." : `Could not queue action: ${humanize(result.reason)}.`;
    if (result.ok) selectedSkill = null;
    render();
  };

  const renderLobby = () => {
    root.innerHTML = `
      <section class="lobby" aria-labelledby="game-title">
        <p class="eyebrow">Original fan-game alpha</p>
        <h1 id="game-title">Ninja Arena</h1>
        <p class="lead">Select the three available shinobi for your 3v3 battle.</p>
        <div class="roster-select" role="group" aria-label="Player team selection">
          ${roster.map((id) => {
            const character = CHARACTER_DATA[id];
            const selected = selectedRoster.has(id);
            return `<button class="roster-choice ${selected ? "selected" : ""}" data-roster="${id}" aria-pressed="${selected}">
              <span>${character.name}</span><small>${selected ? "Selected" : "Select"}</small>
            </button>`;
          }).join("")}
        </div>
        <button class="primary enter-battle" data-enter ${selectedRoster.size === 3 ? "" : "disabled"}>Enter Battle</button>
        <p class="selection-count">${selectedRoster.size} / 3 selected</p>
      </section>`;
    root.querySelectorAll("[data-roster]").forEach((button) => button.addEventListener("click", () => {
      const id = button.dataset.roster;
      if (selectedRoster.has(id)) selectedRoster.delete(id);
      else if (selectedRoster.size < 3) selectedRoster.add(id);
      render();
    }));
    root.querySelector("[data-enter]").addEventListener("click", enterBattle);
  };

  const characterCard = (teamId, character) => {
    const isTarget = selectedSkill && validTargets(state, "player", selectedSkill.casterId, selectedSkill.skillId).includes(character.id);
    const isAutoTarget = lastAutoTargetId === character.id;
    const targetClass = isTarget || isAutoTarget ? "targetable" : "";
    const stateClass = character.alive ? "alive" : "dead";
    const skills = teamId === "player" ? skillBar(character) : "";
    return `<article class="character-card ${teamId} ${stateClass} ${targetClass}" data-character="${character.id}" data-team="${teamId}" ${isTarget ? "data-targetable=true" : ""} ${isAutoTarget ? "data-auto-target=true" : ""}>
      <div class="portrait" aria-hidden="true">${character.name.slice(0, 1)}</div>
      <div class="character-heading"><h3>${character.name}</h3><span>${character.alive ? "Ready" : "Defeated"}</span></div>
      <div class="hp-label"><span>HP</span><strong data-hp="${character.id}">${character.hp} / ${character.maxHp}</strong></div>
      <div class="hp-track"><div class="hp-fill" style="width:${(character.hp / character.maxHp) * 100}%"></div></div>
      <div class="status-list">${character.statuses.length ? character.statuses.map((status) => `<span class="status" title="${status.id}">${prettyStatus(status.id)} · ${status.duration}</span>`).join("") : "<span class=\"no-status\">No status</span>"}</div>
      ${skills}
    </article>`;
  };

  const skillBar = (character) => {
    const skills = CHARACTER_DATA[character.templateId].skills;
    return `<div class="skill-bar" data-skill-bar="${character.id}" aria-label="${character.name} skills">
      ${skills.map((skill) => {
        const check = canUseSkill(state, "player", character.id, skill.id);
        const active = selectedSkill?.casterId === character.id && selectedSkill?.skillId === skill.id;
        const cooldown = character.cooldowns[skill.id] || 0;
        return `<button class="skill ${active ? "active" : ""}" data-skill="${character.id}:${skill.id}" ${check.ok ? "" : "disabled"} title="${skill.description}">
          <span>${skill.name}</span><small>${costLabel(skill.cost)}${cooldown ? ` · CD ${cooldown}` : ""}</small>
        </button>`;
      }).join("")}
    </div>`;
  };

  const chakraPanel = (teamId) => {
    const team = state.teams[teamId];
    const available = availableChakra(state, teamId);
    const reserved = totalChakra(state.reservations[teamId]);
    return `<section class="chakra-panel ${teamId}" aria-label="${team.name} chakra">
      <h2>${team.name} Chakra</h2>
      <div class="chakra-row">${[...CHAKRA_TYPES, "random"].map((type) => `<span class="chakra ${type}" data-chakra="${teamId}-${type}"><b>${CHAKRA_LABELS[type].slice(0, 1)}</b>${available[type]}<small>/${team.chakra[type]}</small></span>`).join("")}</div>
      <p>Total usable: <strong>${totalChakra(available)}</strong>${reserved ? ` · Reserved: <strong>${reserved}</strong>` : ""}</p>
      ${teamId === "player" ? `<div class="exchange"><label>Exchange 5 chakra for <select data-exchange-type>${CHAKRA_TYPES.map((type) => `<option value="${type}">${CHAKRA_LABELS[type]}</option>`).join("")}</select></label><button data-exchange>Exchange</button></div>` : ""}
    </section>`;
  };

  const queueReview = () => {
    if (state.phase !== "review") return "";
    const actions = state.queues.player;
    return `<section class="queue-modal" role="dialog" aria-label="Action queue">
      <h2>Action Queue</h2>
      <p>Reserved chakra is committed only when you confirm the turn.</p>
      <ol data-queue>${actions.length ? actions.map((action) => queueEntry(action)).join("") : "<li>No actions queued. You may still confirm the turn.</li>"}</ol>
      <div class="queue-actions"><button data-cancel-review>Return to Action Selection</button><button class="primary" data-confirm>Confirm Turn</button></div>
    </section>`;
  };

  const queueEntry = (action) => {
    const caster = findCharacter(state, action.casterId);
    const skill = getSkill(caster, action.skillId);
    const target = action.targetIds.map((id) => findCharacter(state, id)?.name || "Unknown").join(", ");
    const isRandomCost = (skill.cost.random || 0) > 0 && totalChakra(action.payment) === 1;
    const allocated = Object.entries(action.payment).find(([, amount]) => amount > 0)?.[0];
    const selector = isRandomCost ? `<label>Pay with <select data-payment="${action.id}">${[...CHAKRA_TYPES, "random"].map((type) => `<option value="${type}" ${allocated === type ? "selected" : ""}>${CHAKRA_LABELS[type]}</option>`).join("")}</select></label>` : `<span>${paymentLabel(action.payment)}</span>`;
    return `<li><strong>${caster.name}</strong> — ${skill.name} → ${target}. ${selector}</li>`;
  };

  const renderBattle = () => {
    const timer = `${Math.floor(state.timerSeconds / 60)}:${String(state.timerSeconds % 60).padStart(2, "0")}`;
    root.innerHTML = `
      <section class="battle" aria-live="polite">
        <header class="battle-header"><div><p class="eyebrow">Turn ${state.turn}</p><h1>Ninja Arena Alpha</h1></div><div class="timer" data-timer aria-label="Turn timer">${timer}</div></header>
        ${state.winner ? `<div class="winner" data-winner>${state.teams[state.winner].name} wins the battle.</div>` : ""}
        <p class="notice" data-notice>${notice}</p>
        <div class="resource-grid">${chakraPanel("player")}${chakraPanel("enemy")}</div>
        <section class="teams" aria-label="Battle teams">
          <div class="team-column player-team"><h2>Player Team</h2>${state.teams.player.characters.map((character) => characterCard("player", character)).join("")}</div>
          <div class="versus">VS</div>
          <div class="team-column enemy-team"><h2>Enemy Team</h2>${state.teams.enemy.characters.map((character) => characterCard("enemy", character)).join("")}</div>
        </section>
        <section class="controls"><button class="ready" data-ready ${state.phase === "selection" ? "" : "disabled"}>PRESS WHEN READY</button><span>${state.queues.player.length} action${state.queues.player.length === 1 ? "" : "s"} queued</span></section>
        <section class="battle-log"><h2>Battle Log</h2><ul>${state.log.slice(-8).reverse().map((item) => `<li><b>T${item.turn}</b> ${item.message}</li>`).join("")}</ul></section>
        ${queueReview()}`;
    bindBattleEvents();
  };

  const bindBattleEvents = () => {
    root.querySelectorAll("[data-skill]").forEach((button) => button.addEventListener("click", () => {
      const [casterId, skillId] = button.dataset.skill.split(":");
      selectSkill(casterId, skillId);
    }));
    root.querySelectorAll("[data-targetable]").forEach((card) => card.addEventListener("click", () => selectTarget(card.dataset.character)));
    root.querySelector("[data-ready]")?.addEventListener("click", () => {
      const result = openReady(state);
      notice = result.ok ? "Review your queue and confirm when ready." : "Could not open the action queue.";
      render();
    });
    root.querySelector("[data-cancel-review]")?.addEventListener("click", () => {
      cancelReview(state);
      notice = "Queued actions were cancelled and all reserved chakra was released.";
      render();
    });
    root.querySelector("[data-confirm]")?.addEventListener("click", () => {
      confirmTurn(state);
      selectedSkill = null;
      lastAutoTargetId = null;
      refreshDeadline();
      notice = state.winner ? "Battle complete." : "Actions resolved. A new turn has begun.";
      render();
    });
    root.querySelectorAll("[data-payment]").forEach((select) => select.addEventListener("change", () => {
      const payment = { taijutsu: 0, ninjutsu: 0, genjutsu: 0, bloodline: 0, random: 0 };
      payment[select.value] = 1;
      const result = setActionPayment(state, "player", select.dataset.payment, payment);
      notice = result.ok ? "Random chakra allocation updated." : "That chakra is not available for this reservation.";
      render();
    }));
    root.querySelector("[data-exchange]")?.addEventListener("click", () => {
      const desired = root.querySelector("[data-exchange-type]").value;
      const result = exchangeChakra(state, "player", desired);
      notice = result.ok ? "Chakra exchanged." : "Exchange requires 5 usable chakra.";
      render();
    });
  };

  const render = () => {
    if (!state) renderLobby();
    else renderBattle();
  };

  render();
  return {
    getState: () => state,
    destroy: stopClock,
    enterBattle,
  };
}

function costLabel(cost) {
  const entries = Object.entries(cost).filter(([, amount]) => amount > 0);
  return entries.length ? entries.map(([type, amount]) => `${amount} ${CHAKRA_LABELS[type]}`).join(", ") : "Free";
}

function paymentLabel(payment) {
  const entries = Object.entries(payment).filter(([, amount]) => amount > 0);
  return entries.length ? entries.map(([type, amount]) => `${amount} ${CHAKRA_LABELS[type]}`).join(", ") : "Free";
}

function humanize(value = "") {
  return value.replace(/-/g, " ");
}

function prettyStatus(value) {
  return value.replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

const root = document.querySelector("#app");
if (root) window.__ninjaArena = mountArena(root);

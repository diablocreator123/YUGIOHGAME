import { CHARACTER_DATA, CHAKRA_TYPES } from "./data.js";

const emptyChakra = () => Object.fromEntries([...CHAKRA_TYPES, "random"].map((type) => [type, 0]));
const cloneChakra = (chakra) => ({ ...emptyChakra(), ...chakra });
const sum = (value) => Object.values(value).reduce((total, amount) => total + amount, 0);
const opposite = (teamId) => (teamId === "player" ? "enemy" : "player");
const actionId = (state) => `action-${state.nextActionId++}`;

export function createCharacter(templateId, teamId) {
  const template = CHARACTER_DATA[templateId];
  if (!template) throw new Error(`Unknown character template: ${templateId}`);
  return {
    id: `${teamId}-${template.id}`,
    templateId: template.id,
    name: template.name,
    maxHp: template.maxHp,
    hp: template.maxHp,
    alive: true,
    cooldowns: {},
    statuses: [],
  };
}

export function createGame({
  playerRoster = ["naruto", "sasuke", "sakura"],
  enemyRoster = ["naruto", "sasuke", "sakura"],
  turnSeconds = 60,
  rngSequence = ["taijutsu", "ninjutsu", "genjutsu", "bloodline"],
} = {}) {
  const state = {
    version: 1,
    turn: 1,
    turnSeconds,
    timerSeconds: turnSeconds,
    phase: "selection",
    winner: null,
    rngSequence: [...rngSequence],
    rngIndex: 0,
    nextActionId: 1,
    teams: {
      player: { id: "player", name: "Player", chakra: emptyChakra(), characters: playerRoster.map((id) => createCharacter(id, "player")) },
      enemy: { id: "enemy", name: "Enemy", chakra: emptyChakra(), characters: enemyRoster.map((id) => createCharacter(id, "enemy")) },
    },
    queues: { player: [], enemy: [] },
    reservations: { player: emptyChakra(), enemy: emptyChakra() },
    log: [],
  };
  generateChakra(state, "player");
  generateChakra(state, "enemy");
  log(state, "Turn 1 begins. Each living character generated chakra.");
  return state;
}

export const totalChakra = (chakra) => sum(chakra);

export function availableChakra(state, teamId) {
  const pool = state.teams[teamId].chakra;
  const reserved = state.reservations[teamId];
  return Object.fromEntries(Object.keys(pool).map((type) => [type, pool[type] - reserved[type]]));
}

export function findCharacter(state, characterId) {
  for (const team of Object.values(state.teams)) {
    const character = team.characters.find((entry) => entry.id === characterId);
    if (character) return character;
  }
  return null;
}

export function getTeamForCharacter(state, characterId) {
  return Object.values(state.teams).find((team) => team.characters.some((entry) => entry.id === characterId)) || null;
}

export function getSkill(character, skillId) {
  const template = CHARACTER_DATA[character.templateId];
  return template.skills.find((skill) => skill.id === skillId) || null;
}

export function hasStatus(character, statusId) {
  return character.statuses.some((entry) => entry.id === statusId && entry.duration > 0);
}

export function getStatus(character, statusId) {
  return character.statuses.find((entry) => entry.id === statusId && entry.duration > 0) || null;
}

export function validTargets(state, teamId, casterId, skillId) {
  const caster = findCharacter(state, casterId);
  const team = state.teams[teamId];
  if (!caster || !team || !team.characters.includes(caster) || !caster.alive) return [];
  const skill = getSkill(caster, skillId);
  if (!skill) return [];
  const allies = team.characters.filter((character) => character.alive);
  const enemies = state.teams[opposite(teamId)].characters.filter((character) => character.alive);
  if (skill.target === "self") return [caster.id];
  if (skill.target === "ally") return allies.map((character) => character.id);
  if (skill.target === "enemy") return enemies.map((character) => character.id);
  if (skill.target === "all-allies") return allies.map((character) => character.id);
  if (skill.target === "all-enemies") return enemies.map((character) => character.id);
  if (skill.target === "none") return [];
  throw new Error(`Unsupported target type: ${skill.target}`);
}

function normalizeCost(cost = {}) {
  return Object.fromEntries([...CHAKRA_TYPES, "random"].map((type) => [type, Number(cost[type] || 0)]));
}

export function allocatePayment(available, rawCost) {
  const cost = normalizeCost(rawCost);
  const working = cloneChakra(available);
  const payment = emptyChakra();
  for (const type of CHAKRA_TYPES) {
    for (let index = 0; index < cost[type]; index += 1) {
      const source = working[type] > 0 ? type : working.random > 0 ? "random" : null;
      if (!source) return null;
      working[source] -= 1;
      payment[source] += 1;
    }
  }
  for (let index = 0; index < cost.random; index += 1) {
    const source = ["random", ...CHAKRA_TYPES].find((type) => working[type] > 0);
    if (!source) return null;
    working[source] -= 1;
    payment[source] += 1;
  }
  return payment;
}

function paymentMatchesCost(payment, rawCost) {
  const cost = normalizeCost(rawCost);
  if (sum(payment) !== sum(cost)) return false;
  for (const type of CHAKRA_TYPES) {
    if ((payment[type] || 0) + (payment.random || 0) < cost[type]) return false;
  }
  return true;
}

function hasPrerequisites(caster, prerequisites = []) {
  return prerequisites.every((requirement) => !requirement.casterHas || hasStatus(caster, requirement.casterHas));
}

export function canUseSkill(state, teamId, casterId, skillId) {
  const caster = findCharacter(state, casterId);
  const team = state.teams[teamId];
  const aiPlanning = state.phase === "ai-planning" && teamId === "enemy";
  if (state.phase !== "selection" && !aiPlanning) return { ok: false, reason: "not-selecting" };
  if (!team || !caster || !team.characters.includes(caster)) return { ok: false, reason: "wrong-team" };
  if (!caster.alive) return { ok: false, reason: "dead" };
  if (hasStatus(caster, "stun")) return { ok: false, reason: "stunned" };
  if (state.queues[teamId].some((action) => action.casterId === casterId)) return { ok: false, reason: "already-acted" };
  const skill = getSkill(caster, skillId);
  if (!skill) return { ok: false, reason: "unknown-skill" };
  if ((caster.cooldowns[skillId] || 0) > 0) return { ok: false, reason: "cooldown" };
  if (!hasPrerequisites(caster, skill.prerequisites)) return { ok: false, reason: "prerequisite" };
  const payment = allocatePayment(availableChakra(state, teamId), skill.cost);
  if (!payment) return { ok: false, reason: "chakra" };
  return { ok: true, payment, skill };
}

export function queueAction(state, teamId, casterId, skillId, targetIds) {
  const check = canUseSkill(state, teamId, casterId, skillId);
  if (!check.ok) return check;
  const valid = validTargets(state, teamId, casterId, skillId);
  const normalizedTargets = Array.isArray(targetIds) ? targetIds : [targetIds];
  const targets = check.skill.target === "self" ? [casterId] : normalizedTargets;
  const expectedTargets = check.skill.target.startsWith("all-") ? valid : targets;
  if (!expectedTargets.length || expectedTargets.some((id) => !valid.includes(id))) return { ok: false, reason: "invalid-target" };
  const action = { id: actionId(state), teamId, casterId, skillId, targetIds: expectedTargets, payment: check.payment };
  state.queues[teamId].push(action);
  addChakra(state.reservations[teamId], action.payment);
  log(state, `${findCharacter(state, casterId).name} queued ${check.skill.name}.`);
  return { ok: true, action };
}

export function setActionPayment(state, teamId, queuedActionId, replacement) {
  const action = state.queues[teamId].find((entry) => entry.id === queuedActionId);
  if (!action) return { ok: false, reason: "unknown-action" };
  const caster = findCharacter(state, action.casterId);
  const skill = getSkill(caster, action.skillId);
  const payment = cloneChakra(replacement);
  if (!paymentMatchesCost(payment, skill.cost)) return { ok: false, reason: "wrong-cost" };
  const withoutOld = cloneChakra(state.reservations[teamId]);
  subtractChakra(withoutOld, action.payment);
  const possible = cloneChakra(state.teams[teamId].chakra);
  subtractChakra(possible, withoutOld);
  if (Object.keys(payment).some((type) => payment[type] > possible[type])) return { ok: false, reason: "unavailable-chakra" };
  subtractChakra(state.reservations[teamId], action.payment);
  addChakra(state.reservations[teamId], payment);
  action.payment = payment;
  return { ok: true, action };
}

export function cancelQueuedActions(state, teamId) {
  state.queues[teamId] = [];
  state.reservations[teamId] = emptyChakra();
}

export function openReady(state) {
  if (state.phase !== "selection" || state.winner) return { ok: false, reason: "not-selecting" };
  state.phase = "review";
  return { ok: true };
}

export function cancelReview(state) {
  if (state.phase !== "review") return { ok: false, reason: "not-reviewing" };
  cancelQueuedActions(state, "player");
  state.phase = "selection";
  return { ok: true };
}

export function exchangeChakra(state, teamId, desiredType) {
  if (!CHAKRA_TYPES.includes(desiredType)) return { ok: false, reason: "invalid-type" };
  if (state.phase !== "selection") return { ok: false, reason: "not-selecting" };
  const available = availableChakra(state, teamId);
  if (totalChakra(available) < 5) return { ok: false, reason: "insufficient-chakra" };
  const spent = emptyChakra();
  let remaining = 5;
  for (const type of ["random", ...CHAKRA_TYPES]) {
    const amount = Math.min(available[type], remaining);
    state.teams[teamId].chakra[type] -= amount;
    spent[type] += amount;
    remaining -= amount;
    if (!remaining) break;
  }
  state.teams[teamId].chakra[desiredType] += 1;
  log(state, `${state.teams[teamId].name} exchanged 5 chakra for 1 ${desiredType} chakra.`);
  return { ok: true, spent };
}

function addChakra(target, source) {
  for (const type of Object.keys(target)) target[type] += source[type] || 0;
}

function subtractChakra(target, source) {
  for (const type of Object.keys(target)) target[type] -= source[type] || 0;
}

function commitReservations(state, teamId) {
  const team = state.teams[teamId];
  const reservation = state.reservations[teamId];
  if (Object.keys(reservation).some((type) => reservation[type] > team.chakra[type])) throw new Error("Reservation exceeded chakra pool");
  subtractChakra(team.chakra, reservation);
  state.reservations[teamId] = emptyChakra();
}

function nextChakraType(state) {
  const type = state.rngSequence[state.rngIndex % state.rngSequence.length];
  state.rngIndex += 1;
  return CHAKRA_TYPES.includes(type) ? type : "taijutsu";
}

export function generateChakra(state, teamId) {
  const team = state.teams[teamId];
  let generated = 0;
  for (const character of team.characters) {
    if (!character.alive) continue;
    team.chakra[nextChakraType(state)] += 1;
    generated += 1;
  }
  return generated;
}

export function applyStatus(state, target, rawStatus) {
  if (!target.alive) return false;
  const status = { ...rawStatus, duration: rawStatus.duration };
  if (status.harmful && hasStatus(target, "inner-sakura")) return false;
  if (status.defense && getStatus(target, "sharingan-mark")) return false;
  const prior = target.statuses.find((entry) => entry.id === status.id);
  if (prior) Object.assign(prior, status);
  else target.statuses.push(status);
  return true;
}

function resolveDamage(state, source, target, effect) {
  if (!target.alive) return 0;
  let amount = effect.amount;
  if (effect.bonusIfCasterHas && hasStatus(source, effect.bonusIfCasterHas)) amount += effect.bonus || 0;
  if (effect.bonusIfTargetHas && hasStatus(target, effect.bonusIfTargetHas)) amount += effect.bonus || 0;
  const defenseBypassed = hasStatus(target, "sharingan-mark");
  if (!defenseBypassed && hasStatus(target, "invulnerable")) return 0;
  if (!defenseBypassed && !effect.piercing) {
    const reduction = target.statuses.reduce((total, status) => total + (status.damageReduction || 0), 0);
    amount = Math.max(0, amount - reduction);
  }
  target.hp = Math.max(0, target.hp - amount);
  if (target.hp === 0) killCharacter(state, target);
  return amount;
}

function resolveEffect(state, source, target, effect) {
  if (effect.type === "damage") {
    const dealt = resolveDamage(state, source, target, effect);
    log(state, `${source.name}'s attack dealt ${dealt} damage to ${target.name}.`);
  } else if (effect.type === "heal") {
    if (!target.alive) return;
    const restored = Math.min(effect.amount, target.maxHp - target.hp);
    target.hp += restored;
    log(state, `${source.name} restored ${restored} HP to ${target.name}.`);
  } else if (effect.type === "status") {
    const recipient = effect.target === "caster" ? source : target;
    if (applyStatus(state, recipient, effect)) log(state, `${recipient.name} gained ${effect.id}.`);
  }
}

function resolveAction(state, action) {
  if (state.winner) return;
  const caster = findCharacter(state, action.casterId);
  const skill = caster && getSkill(caster, action.skillId);
  if (!caster || !skill || !caster.alive || hasStatus(caster, "stun")) {
    log(state, "A queued action was skipped because its caster could not act.");
    return;
  }
  caster.cooldowns[skill.id] = skill.cooldown ? skill.cooldown + 1 : 0;
  for (const targetId of action.targetIds) {
    const target = findCharacter(state, targetId);
    if (!target || !target.alive) {
      log(state, `${caster.name}'s ${skill.name} had no living target.`);
      continue;
    }
    for (const effect of skill.effects) {
      resolveEffect(state, caster, target, effect);
      if (state.winner) break;
    }
    if (state.winner) break;
  }
}

function chooseAiAction(state, teamId, caster) {
  const skills = CHARACTER_DATA[caster.templateId].skills
    .map((skill) => ({ skill, check: canUseSkill(state, teamId, caster.id, skill.id) }))
    .filter(({ check }) => check.ok);
  if (!skills.length) return null;
  const allies = state.teams[teamId].characters.filter((entry) => entry.alive);
  const wounded = allies.find((entry) => entry.hp <= 45);
  const healing = skills.find(({ skill }) => skill.effects.some((effect) => effect.type === "heal"));
  if (wounded && healing) return { skill: healing.skill, targetId: wounded.id };
  const ranked = [...skills].sort((left, right) => scoreSkill(right.skill) - scoreSkill(left.skill));
  const chosen = ranked[0].skill;
  const targets = validTargets(state, teamId, caster.id, chosen.id);
  return targets.length ? { skill: chosen, targetId: targets[0] } : null;
}

function scoreSkill(skill) {
  return skill.effects.reduce((score, effect) => {
    if (effect.type === "damage") return score + effect.amount + (effect.bonus || 0);
    if (effect.type === "heal") return score + effect.amount / 2;
    if (effect.id === "stun") return score + 12;
    if (effect.id === "shadow-clones" || effect.id === "inner-sakura") return score + 8;
    return score;
  }, 0);
}

export function generateAiActions(state, teamId = "enemy") {
  for (const caster of state.teams[teamId].characters) {
    if (!caster.alive) continue;
    const choice = chooseAiAction(state, teamId, caster);
    if (choice) queueAction(state, teamId, caster.id, choice.skill.id, choice.targetId);
  }
  return state.queues[teamId];
}

function decrementCooldownsAndStatuses(state) {
  for (const team of Object.values(state.teams)) {
    for (const character of team.characters) {
      for (const [skillId, remaining] of Object.entries(character.cooldowns)) {
        character.cooldowns[skillId] = Math.max(0, remaining - 1);
      }
      character.statuses = character.statuses
        .map((status) => ({ ...status, duration: status.duration - 1 }))
        .filter((status) => status.duration > 0);
    }
  }
}

function finishResolution(state) {
  if (state.winner) {
    state.phase = "finished";
    return;
  }
  decrementCooldownsAndStatuses(state);
  cancelQueuedActions(state, "player");
  cancelQueuedActions(state, "enemy");
  state.turn += 1;
  state.timerSeconds = state.turnSeconds;
  generateChakra(state, "player");
  generateChakra(state, "enemy");
  state.phase = "selection";
  log(state, `Turn ${state.turn} begins.`);
}

function resolveCommittedTurn(state, { playerTimedOut = false } = {}) {
  if (playerTimedOut) {
    cancelQueuedActions(state, "player");
    log(state, "Timer expired. Player actions were cancelled.");
  } else {
    commitReservations(state, "player");
  }
  state.phase = "ai-planning";
  generateAiActions(state, "enemy");
  commitReservations(state, "enemy");
  state.phase = "resolving";
  for (const action of state.queues.player) resolveAction(state, action);
  for (const action of state.queues.enemy) resolveAction(state, action);
  finishResolution(state);
  return { ok: true, winner: state.winner };
}

export function confirmTurn(state) {
  if (state.phase !== "review") return { ok: false, reason: "not-reviewing" };
  return resolveCommittedTurn(state);
}

export function tickTimer(state, elapsedSeconds) {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0 || state.phase === "finished") return { ok: false, reason: "no-tick" };
  if (state.phase !== "selection" && state.phase !== "review") return { ok: false, reason: "not-timed" };
  state.timerSeconds = Math.max(0, state.timerSeconds - elapsedSeconds);
  if (state.timerSeconds === 0) return resolveCommittedTurn(state, { playerTimedOut: true });
  return { ok: true, expired: false };
}

export function killCharacter(state, character) {
  if (!character.alive) return;
  character.alive = false;
  character.hp = 0;
  character.statuses = [];
  log(state, `${character.name} was defeated.`);
  const team = getTeamForCharacter(state, character.id);
  if (team.characters.every((entry) => !entry.alive)) {
    state.winner = opposite(team.id);
    log(state, `${state.teams[state.winner].name} wins the battle.`);
  }
}

function log(state, message) {
  state.log.push({ turn: state.turn, message });
  if (state.log.length > 80) state.log.shift();
}

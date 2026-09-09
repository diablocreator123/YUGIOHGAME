import test from "node:test";
import assert from "node:assert/strict";
import {
  applyStatus,
  availableChakra,
  canUseSkill,
  cancelReview,
  confirmTurn,
  createGame,
  exchangeChakra,
  findCharacter,
  generateAiActions,
  generateChakra,
  getStatus,
  hasStatus,
  killCharacter,
  openReady,
  queueAction,
  setActionPayment,
  tickTimer,
  totalChakra,
  validTargets,
} from "../src/game/engine.js";

const chakra = (state, teamId, values = {}) => {
  state.teams[teamId].chakra = { taijutsu: 0, ninjutsu: 0, genjutsu: 0, bloodline: 0, random: 0, ...values };
  state.reservations[teamId] = { taijutsu: 0, ninjutsu: 0, genjutsu: 0, bloodline: 0, random: 0 };
};
const deterministicGame = (options = {}) => createGame({ rngSequence: ["bloodline"], ...options });
const player = (state, id) => findCharacter(state, `player-${id}`);
const enemy = (state, id) => findCharacter(state, `enemy-${id}`);
const readyAndConfirm = (state) => {
  assert.equal(openReady(state).ok, true);
  assert.equal(confirmTurn(state).ok, true);
};

test("regression: starting and later chakra generation uses only living characters", () => {
  const state = deterministicGame();
  assert.equal(totalChakra(state.teams.player.chakra), 3);
  assert.equal(totalChakra(state.teams.enemy.chakra), 3);
  killCharacter(state, player(state, "naruto"));
  chakra(state, "player");
  assert.equal(generateChakra(state, "player"), 2);
  assert.equal(totalChakra(state.teams.player.chakra), 2);
});

test("regression: player and enemy own independent chakra pools", () => {
  const state = deterministicGame();
  chakra(state, "player", { ninjutsu: 3 });
  chakra(state, "enemy");
  assert.equal(queueAction(state, "enemy", "enemy-sasuke", "chidori", "player-naruto").ok, false);
  chakra(state, "enemy", { ninjutsu: 1 });
  assert.equal(queueAction(state, "enemy", "enemy-sasuke", "chidori", "player-naruto").ok, true);
  assert.equal(state.reservations.enemy.ninjutsu, 1);
  assert.equal(state.reservations.player.ninjutsu, 0);
});

test("regression: AI plans legal actions from its own pool during turn resolution", () => {
  const state = deterministicGame();
  chakra(state, "player");
  chakra(state, "enemy", { ninjutsu: 1 });
  state.phase = "ai-planning";
  const actions = generateAiActions(state);
  assert.ok(actions.some((action) => action.casterId === "enemy-naruto" && action.skillId === "shadow-clones"));
  assert.equal(state.reservations.enemy.ninjutsu, 1);
  assert.equal(state.reservations.player.ninjutsu, 0);
});

test("regression: specific costs reserve their type and random costs reserve one actual chakra", () => {
  const state = deterministicGame();
  chakra(state, "player", { taijutsu: 1, genjutsu: 1 });
  const combo = queueAction(state, "player", "player-naruto", "naruto-combo", "enemy-naruto");
  assert.equal(combo.ok, true);
  assert.deepEqual(combo.action.payment, { taijutsu: 1, ninjutsu: 0, genjutsu: 0, bloodline: 0, random: 0 });
  const clones = queueAction(state, "player", "player-sasuke", "lion-combo", "enemy-naruto");
  assert.equal(clones.ok, true);
  assert.equal(availableChakra(state, "player").taijutsu, 0);
  assert.equal(queueAction(state, "player", "player-sakura", "ko-punch", "enemy-naruto").reason, "chakra");
});

test("regression: a random-cost reservation can be manually reassigned without creating chakra", () => {
  const state = deterministicGame();
  chakra(state, "player", { taijutsu: 1, genjutsu: 1 });
  const action = queueAction(state, "player", "player-naruto", "shadow-clones", "player-naruto").action;
  assert.equal(action.payment.taijutsu, 1);
  const changed = setActionPayment(state, "player", action.id, { taijutsu: 0, ninjutsu: 0, genjutsu: 1, bloodline: 0, random: 0 });
  assert.equal(changed.ok, true);
  assert.equal(state.reservations.player.taijutsu, 0);
  assert.equal(state.reservations.player.genjutsu, 1);
  assert.equal(totalChakra(state.reservations.player), 1);
});

test("regression: target lists are explicit and never cross target-type boundaries", () => {
  const state = deterministicGame();
  assert.deepEqual(validTargets(state, "player", "player-naruto", "shadow-clones"), ["player-naruto"]);
  assert.deepEqual(validTargets(state, "player", "player-sasuke", "swift-block"), ["player-sasuke"]);
  assert.deepEqual(validTargets(state, "player", "player-sakura", "inner-sakura"), ["player-sakura"]);
  assert.deepEqual(validTargets(state, "player", "player-naruto", "rasengan"), ["enemy-naruto", "enemy-sasuke", "enemy-sakura"]);
  assert.deepEqual(validTargets(state, "player", "player-sakura", "mystical-palm"), ["player-naruto", "player-sasuke", "player-sakura"]);
});

test("regression: dead characters are not valid targets or allowed to act", () => {
  const state = deterministicGame();
  killCharacter(state, enemy(state, "naruto"));
  assert.deepEqual(validTargets(state, "player", "player-sasuke", "lion-combo"), ["enemy-sasuke", "enemy-sakura"]);
  killCharacter(state, player(state, "sasuke"));
  assert.equal(canUseSkill(state, "player", "player-sasuke", "lion-combo").reason, "dead");
});

test("regression: press when ready works with no selected actions and cancel releases reservations", () => {
  const state = deterministicGame();
  assert.equal(openReady(state).ok, true);
  assert.equal(confirmTurn(state).ok, true);
  assert.equal(state.turn, 2);
  const next = deterministicGame();
  chakra(next, "player", { genjutsu: 1 });
  assert.equal(queueAction(next, "player", "player-naruto", "shadow-clones", "player-naruto").ok, true);
  assert.equal(openReady(next).ok, true);
  assert.equal(cancelReview(next).ok, true);
  assert.equal(totalChakra(next.reservations.player), 0);
  assert.equal(next.queues.player.length, 0);
});

test("regression: queued actions resolve in player queue order before enemy actions", () => {
  const state = deterministicGame();
  chakra(state, "player");
  chakra(state, "enemy");
  assert.equal(queueAction(state, "player", "player-sasuke", "lion-combo", "enemy-naruto").ok, true);
  readyAndConfirm(state);
  assert.equal(enemy(state, "naruto").hp, 70);
  const playerAttack = state.log.findIndex((entry) => entry.message.includes("Sasuke's attack"));
  const enemyAttack = state.log.findIndex((entry) => entry.message.includes("Naruto's attack") || entry.message.includes("Sakura's attack") || entry.message.includes("Enemy"));
  assert.ok(playerAttack >= 0);
  assert.ok(enemyAttack === -1 || playerAttack < enemyAttack);
});

test("regression: cooldown one blocks exactly the following turn", () => {
  const state = deterministicGame();
  chakra(state, "player", { ninjutsu: 1 });
  chakra(state, "enemy");
  assert.equal(queueAction(state, "player", "player-sasuke", "chidori", "enemy-naruto").ok, true);
  readyAndConfirm(state);
  assert.equal(player(state, "sasuke").cooldowns.chidori, 1);
  assert.equal(canUseSkill(state, "player", "player-sasuke", "chidori").reason, "cooldown");
  readyAndConfirm(state);
  assert.equal(player(state, "sasuke").cooldowns.chidori, 0);
  chakra(state, "player", { ninjutsu: 1 });
  assert.equal(canUseSkill(state, "player", "player-sasuke", "chidori").ok, true);
});

test("regression: stun prevents an already queued enemy from acting", () => {
  const state = deterministicGame({ enemyRoster: ["naruto"] });
  chakra(state, "player", { taijutsu: 1 });
  chakra(state, "enemy", { taijutsu: 1 });
  assert.equal(queueAction(state, "player", "player-sakura", "ko-punch", "enemy-naruto").ok, true);
  readyAndConfirm(state);
  assert.equal(player(state, "naruto").hp, 100, "stunned enemy Naruto must not damage the player");
  assert.ok(state.log.some((entry) => entry.message.includes("skipped because its caster could not act")));
});

test("regression: invulnerability and reduction mitigate normal damage, while piercing ignores reduction", () => {
  const invulnerable = deterministicGame();
  chakra(invulnerable, "player", { genjutsu: 1 });
  chakra(invulnerable, "enemy");
  assert.equal(queueAction(invulnerable, "player", "player-naruto", "sexy-technique", "player-naruto").ok, true);
  readyAndConfirm(invulnerable);
  assert.equal(player(invulnerable, "naruto").hp, 100);

  const reduced = deterministicGame();
  chakra(reduced, "player", { taijutsu: 1 });
  chakra(reduced, "enemy");
  assert.equal(queueAction(reduced, "player", "player-naruto", "shadow-clones", "player-naruto").ok, true);
  readyAndConfirm(reduced);
  assert.equal(player(reduced, "naruto").hp, 85);

  const piercing = deterministicGame();
  chakra(piercing, "player", { ninjutsu: 1 });
  chakra(piercing, "enemy");
  applyStatus(piercing, enemy(piercing, "naruto"), { id: "guard", duration: 4, damageReduction: 25 });
  assert.equal(queueAction(piercing, "player", "player-sasuke", "chidori", "enemy-naruto").ok, true);
  readyAndConfirm(piercing);
  assert.equal(enemy(piercing, "naruto").hp, 65);
});

test("regression: healing cannot exceed max HP", () => {
  const state = deterministicGame();
  player(state, "sakura").hp = 83;
  chakra(state, "player", { ninjutsu: 1 });
  chakra(state, "enemy");
  assert.equal(queueAction(state, "player", "player-sakura", "mystical-palm", "player-sakura").ok, true);
  readyAndConfirm(state);
  assert.equal(player(state, "sakura").hp, 100);
});

test("regression: prerequisites and Naruto Combo bonus follow Shadow Clones", () => {
  const state = deterministicGame();
  chakra(state, "player", { taijutsu: 1, genjutsu: 1 });
  chakra(state, "enemy");
  assert.equal(canUseSkill(state, "player", "player-naruto", "rasengan").reason, "prerequisite");
  assert.equal(queueAction(state, "player", "player-naruto", "shadow-clones", "player-naruto").ok, true);
  readyAndConfirm(state);
  assert.equal(hasStatus(player(state, "naruto"), "shadow-clones"), true);
  state.teams.player.chakra.taijutsu += 1;
  assert.equal(queueAction(state, "player", "player-naruto", "naruto-combo", "enemy-naruto").ok, true);
  readyAndConfirm(state);
  assert.equal(enemy(state, "naruto").hp, 70);
});

test("regression: Sharingan mark bypasses existing invulnerability and damage reduction", () => {
  const state = deterministicGame();
  chakra(state, "player", { bloodline: 1 });
  chakra(state, "enemy");
  applyStatus(state, enemy(state, "naruto"), { id: "invulnerable", duration: 4, defense: true });
  applyStatus(state, enemy(state, "naruto"), { id: "guard", duration: 4, damageReduction: 30 });
  assert.equal(queueAction(state, "player", "player-sasuke", "sharingan", "enemy-naruto").ok, true);
  readyAndConfirm(state);
  assert.ok(getStatus(enemy(state, "naruto"), "sharingan-mark"));
  assert.equal(queueAction(state, "player", "player-sasuke", "lion-combo", "enemy-naruto").ok, true);
  readyAndConfirm(state);
  assert.equal(enemy(state, "naruto").hp, 55);
});

test("regression: timer expiration cancels player reservations, resolves enemy turn, and resets to 60", () => {
  const state = deterministicGame({ turnSeconds: 60 });
  chakra(state, "player", { genjutsu: 1 });
  chakra(state, "enemy");
  assert.equal(queueAction(state, "player", "player-naruto", "shadow-clones", "player-naruto").ok, true);
  const before = { ...state.teams.player.chakra };
  assert.equal(tickTimer(state, 60).ok, true);
  assert.equal(state.turn, 2);
  assert.equal(state.timerSeconds, 60);
  assert.equal(totalChakra(state.reservations.player), 0);
  assert.equal(state.teams.player.chakra.genjutsu, before.genjutsu, "timed-out action must not spend its reservation");
});

test("regression: exchange costs exactly five usable chakra and never works below five", () => {
  const state = deterministicGame();
  chakra(state, "player", { taijutsu: 2, ninjutsu: 2, genjutsu: 1 });
  assert.equal(exchangeChakra(state, "player", "bloodline").ok, true);
  assert.equal(totalChakra(state.teams.player.chakra), 1);
  assert.equal(state.teams.player.chakra.bloodline, 1);
  assert.equal(exchangeChakra(state, "player", "ninjutsu").reason, "insufficient-chakra");
});

test("regression: killing the final enemy ends the battle and prevents further turns", () => {
  const state = deterministicGame();
  killCharacter(state, enemy(state, "sasuke"));
  killCharacter(state, enemy(state, "sakura"));
  enemy(state, "naruto").hp = 30;
  chakra(state, "player");
  chakra(state, "enemy");
  assert.equal(queueAction(state, "player", "player-sasuke", "lion-combo", "enemy-naruto").ok, true);
  readyAndConfirm(state);
  assert.equal(state.winner, "player");
  assert.equal(state.phase, "finished");
  assert.equal(state.turn, 1);
});

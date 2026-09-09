// This harness intentionally runs inside Chrome through scripts/run-browser.js.
import "../src/ui/app.js";

const checks = [];
const failures = [];
const errors = [];
let fakeNow = 1_000_000;
let clockCallback = null;
Date.now = () => fakeNow;
window.setInterval = (callback) => {
  clockCallback = callback;
  return 1;
};
window.clearInterval = () => { clockCallback = null; };
window.addEventListener("error", (event) => errors.push(event.error?.message || event.message));
window.addEventListener("unhandledrejection", (event) => errors.push(String(event.reason)));

function assert(condition, message) {
  if (!condition) throw new Error(message);
  checks.push(message);
}

function click(selector) {
  const element = document.querySelector(selector);
  assert(element, `Found ${selector}`);
  element.click();
  return element;
}

function advanceClock(milliseconds) {
  fakeNow += milliseconds;
  if (clockCallback) clockCallback();
}

function chooseDamage(caster, skillId) {
  const button = document.querySelector(`[data-skill="${caster}:${skillId}"]`);
  if (!button || button.disabled) return false;
  button.click();
  const target = document.querySelector("[data-team=enemy].alive[data-targetable]");
  if (!target) return false;
  target.click();
  return true;
}

try {
  click('[data-roster="naruto"]');
  click('[data-roster="sasuke"]');
  click('[data-roster="sakura"]');
  click("[data-enter]");
  assert(document.querySelectorAll("[data-skill-bar]").length === 3, "Each player character renders an independent skill bar");
  assert(document.querySelectorAll("[data-skill-bar=player-naruto] .skill").length === 4, "Naruto has a separate four-skill bar");
  assert(document.querySelector("[data-timer]").textContent === "1:00", "Battle starts with a real 60 second timer");

  click('[data-skill="player-naruto:shadow-clones"]');
  advanceClock(1000);
  assert(document.querySelector('[data-character="player-naruto"][data-auto-target]'), "Shadow Clones automatically selects Naruto");
  assert(document.querySelectorAll("[data-team=enemy].targetable").length === 0, "Shadow Clones never highlights enemies");
  assert(document.querySelector(".chakra-panel.player").textContent.includes("Reserved: 1"), "Shadow Clones immediately reserves chakra");

  click('[data-skill="player-sasuke:lion-combo"]');
  advanceClock(1000);
  assert(document.querySelectorAll("[data-team=enemy].targetable").length === 3, "Lion Combo highlights only living enemies");
  click('[data-character="enemy-naruto"][data-targetable]');
  click("[data-ready]");
  assert(document.querySelector("[data-queue]").textContent.includes("Shadow Clones"), "Ready opens a queue containing Shadow Clones");
  assert(document.querySelector("[data-queue]").textContent.includes("Lion Combo"), "Ready opens a queue containing Lion Combo");
  click("[data-confirm]");
  assert(document.querySelector(".eyebrow").textContent === "Turn 2", "Confirm resolves the queue and advances the turn");
  assert(document.querySelector('[data-hp="enemy-naruto"]').textContent === "70 / 100", "Queued Lion Combo changes underlying enemy HP");
  assert(document.querySelector('[data-character="player-naruto"] .status-list').textContent.includes("Shadow Clones"), "Resolved Shadow Clones status is rendered from GameState");

  let sawDeadCharacter = false;
  for (let turn = 0; turn < 10 && !document.querySelector("[data-winner]"); turn += 1) {
    chooseDamage("player-naruto", "naruto-combo");
    chooseDamage("player-sasuke", "lion-combo");
    chooseDamage("player-sakura", "ko-punch");
    click("[data-ready]");
    click("[data-confirm]");
    const dead = document.querySelector('[data-character="player-naruto"].dead, [data-character="player-sasuke"].dead, [data-character="player-sakura"].dead');
    if (dead) {
      sawDeadCharacter = true;
      assert([...dead.querySelectorAll("[data-skill]")].every((button) => button.disabled), "A dead character's skills are disabled in the UI");
    }
  }
  assert(sawDeadCharacter, "A character can die during browser-driven play");
  assert(document.querySelector("[data-winner]")?.textContent.includes("Player wins"), "Eliminating the enemy team displays victory");
  assert(errors.length === 0, `No browser runtime errors (${errors.join(", ")})`);
  document.body.dataset.browserTest = "PASS";
  document.querySelector("#browser-test-results").textContent = `BROWSER_TESTS: PASS (${checks.length} checks)`;
} catch (error) {
  failures.push(error.message);
  document.body.dataset.browserTest = "FAIL";
  document.querySelector("#browser-test-results").textContent = `BROWSER_TESTS: FAIL\n${failures.join("\n")}\n${checks.length} checks completed`;
}

# Ninja Arena Alpha

An original, dependency-free browser-game alpha for a 3v3 Naruto/Sasuke/Sakura battle. It uses the rules supplied for this task; no third-party game source code, art, or database was copied.

## Run

With Node.js installed:

```powershell
node scripts/serve.js
```

Then open `http://127.0.0.1:4173`.

## Verify

```powershell
node --test tests/engine.test.js
node scripts/run-browser.js
```

The browser test launches locally installed Chrome headlessly against the actual UI and checks selection, the 60-second timer, self/enemy targeting, chakra reservation, queue confirmation, state updates, death, disabled dead-character controls, and victory.

## Structure

- `src/game/data.js` — declarative roster, skills, costs, targeting, and effects.
- `src/game/engine.js` — deterministic state engine, reservation accounting, action resolution, statuses, AI, death, timer, and exchange rules.
- `src/ui/app.js` — browser UI that renders only from engine state.
- `tests/engine.test.js` — 18 combat-engine regression tests.
- `tests/browser-ui.browser.js` — in-browser UI test suite (43 checks).

## Research boundary

I consulted the publicly available [Naruto-Arena mechanics overview](https://narutoarena.fandom.com/wiki/The_Basics) and [Soul Arena manual](https://soul-arena.io/manual) only for high-level conventions such as chakra pools, queues, and cooldowns. The implementation is clean-room and follows the task specification where those sources differ.

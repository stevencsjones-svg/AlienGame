# Alien Platformer

A single-level 2D platformer built with **Phaser 3** and **Vite**. Every visual
is procedural geometry — there are no image assets.

## Run

```bash
npm install
npm run dev
```

Vite will open the game in your browser (default `http://localhost:5173`).

## Controls

| Action        | Keys                     |
| ------------- | ------------------------ |
| Move          | Arrow keys / `A` `D`     |
| Jump          | Up / `W` / `Space`       |
| Double jump   | Jump again while airborne |
| Dash          | Double-tap a direction (← ← or → →) |
| Attack        | `Z` (visual only for now) |
| Pause         | `Esc`                    |

Press **Space** at the main menu to begin. Reach the orange **exit portal**
in Zone 5 to trigger *LEVEL COMPLETE*. Touching an enemy or falling into the
Zone 3 pit respawns you — at the **Zone 3 checkpoint** once you've reached it,
otherwise at the start.

## Project layout

```
src/
  main.js          Phaser config & boot
  constants.js     All tuning values & colours
  scenes/
    Preload.js     Boot scene (no external assets)
    Game.js        The level — geometry, enemies, collectibles, camera
    UI.js          Parallel HUD overlay (collectibles + dash bar)
  entities/
    Player.js      Run / jump / double-jump / dash / attack
    GroundDrone.js Patrolling enemy
    HoverSentinel.js Bobbing/rotating floater
    Seeker.js      Range-triggered chaser
```

Tweak gameplay in [`src/constants.js`](src/constants.js).

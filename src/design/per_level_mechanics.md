# Per-Level Unique Mechanics — Design Pass (IGN-004)

> Backlog item IGN-004: *"Every Celeste chapter has one mechanic exclusive to it
> that is fully explored and then left behind."* One mechanic per level,
> introduced in the first 30 seconds of contact, twisted mid-level, resolved at
> the end, never seen again.
>
> Constraints for unbuilt levels (5–10): Phaser 3 arcade physics + procedural
> geometry only; environmental mechanics only (the player kit stays double jump
> / dash / attack); mechanically distinct from every other level; fits the
> level's social tier and palette. Backlog-designed mechanics are used where
> they exist: L6 wind zones, L8 gravity wells, L9 crumbling platforms.
>
> Status note (2026-06-12): inventory below was read from the actual codebase,
> not assumed. Names for L5–L10 are working titles — only L1–L4 have names in
> code. Palette hexes are each level's `LEVEL_PALETTES` platform colour /
> complete-beat accent from `constants.js`.

---

## Level 1 — Alien City (`#00ff88` alien jade)

- **Unique mechanic:** Ability Unlock Arc (`AbilityPickup`)
- **Player-facing:** *When you touch a glowing hexagon, a new movement ability unlocks — and the level ahead is built around it.*
- **Introduction:** Zone 1 is beatable with run + jump only. The first pickup (double jump) sits in early Zone 2 on a pedestal platform, impossible to miss, with a freebie jump right after that needs it.
- **Mid-level twist:** Zone 3's vertical climb gates on the dash pickup — geometry the player just learned to read with two jumps suddenly needs lateral reach, re-teaching spacing.
- **Resolution:** By Zone 4 the kit (minus attack) is complete; Zones 4–5 are an exam of both abilities together. The arc itself never recurs — every later level starts fully equipped (attack is handed off in L2's opening as the arc's epilogue).
- **Status:** **BUILT** (`src/entities/AbilityPickup.js`, wired in `Game.js`; attack hand-off in `Level2.js`)

## Level 2 — The Descent (`#00cc66` dark jade)

- **Unique mechanic:** One-Hit Shield (`ShieldPickup`) + the U-shaped shaft traversal it protects
- **Player-facing:** *When you grab the shield, the next hit breaks it instead of you.*
- **Introduction:** The shield sits on the descent path before The Deep — its ring, label, and pickup flash teach "this is armor" without text.
- **Mid-level twist:** The Deep's seeker introduces a chase the shield can absorb exactly once — the player learns to *spend* it deliberately before the ascent shaft, not hoard it.
- **Resolution:** The ascent shaft's camera look-ahead finale runs shield-or-not; the break effect (green flash, shake) is the level's exclamation mark.
- **Status:** **BUILT** (`src/entities/ShieldPickup.js`; shaft look-ahead in `CameraController.updateShaftLookAhead`). *Caveat: L4's spec reuses a shield placement, so the pickup is no longer strictly L2-exclusive — the shaft structure still is.*

## Level 3 — Transit Network (`#00ddff` electric blue)

- **Unique mechanic:** Falling Platforms + Proximity Mines (`FallingPlatform`, `ProximityMine`)
- **Player-facing:** *When you land, the platform shakes and drops — and straying near a mine arms it.*
- **Introduction:** First faller sits beside a static backbone over a survivable gap; its shake-tint (blue→amber→red) telegraphs the rule with zero stakes.
- **Mid-level twist:** Section 3 stacks fallers over lethal gaps *between* mines — the safe pause the shake demands is exactly what arming mines punishes; speed vs. caution becomes the read.
- **Resolution:** The final stretch returns to solid floor; the last mine guards an optional collectible, not the path. Confirmed imported by no other scene.
- **Status:** **BUILT** (`src/entities/FallingPlatform.js`, `src/entities/ProximityMine.js`, both `Level3.js`-only)

## Level 4 — Market Towers (`#3366ff` deep blue)

- **Unique mechanic:** Crowd Pressure Zones (placement-driven, no dedicated entity)
- **Player-facing:** *When patrol routes overlap on a bridge, you read the combined rhythm and move through the gaps.*
- **Introduction:** Bridge 1 entry fires the one-shot cinematic pull (camera frames both towers), then three zones layer drone + sentinel patrols with safe islands between.
- **Mid-level twist:** The seeker debuts in Bridge 1's final zone — a pattern that *chases* breaks the pure-rhythm read the first zones taught.
- **Resolution:** Bridge 2 is the exam: all three enemy types over rail-timed moving platforms; the summit climb afterwards is clean and crowd-free.
- **Status:** **BUILT** — but via enemy placement tables in `level4Layout.js` + the cinematic pull in `Level4.js`, not an entity class. If a reusable "patrol choreographer" is ever wanted, it would be a new entity; not currently needed.

---

## Level 5 — The Glass Tier *(working title)* (`#6633ff` violet)

- **Unique mechanic:** Holo-Sweep Platforms — platforms solid only while a security sweep beam passes over them
- **Player-facing:** *When the sweep light crosses a holo-platform, it turns solid — for as long as the light holds it.*
- **Introduction:** First holo-platform hangs over safe floor with one slow, metronomic beam; the player stands on it, feels it vanish, lands harmlessly.
- **Mid-level twist:** Beams reverse direction mid-route and run in offset pairs — crossing long gaps means riding one platform's window into the next, planning two lights ahead.
- **Resolution:** The exit room's sweeps accelerate to strobe, then the beams shatter as the player breaks through — *"Power managed from behind glass. Glass breaks."* Never used again.
- **Feasibility:** static body `enable` toggling + tween-driven beam — pure arcade physics. Distinct from L3 fallers (timed external clock, not landing-triggered) and L9 crumble (reversible, rhythmic).
- **Status:** **STUB** — `src/entities/HoloSweepPlatform.js`

## Level 6 — Broadcast Spire (`#cc00ff` magenta)

- **Unique mechanic:** Wind Zones *(from backlog)* — air volumes that bend jump arcs while airborne
- **Player-facing:** *When you jump through a wind zone, the gust pushes you mid-air — your arc bends with it.*
- **Introduction:** A steady horizontal gust corridor over safe ground, with particle streams showing direction before the player ever jumps into it.
- **Mid-level twist:** Gusts pulse on the spire's transmission cycle — a visible antenna flash precedes each surge — and vertical updraft shafts let the player ride thermals upward, turning the hazard into transport.
- **Resolution:** Reaching the transmitter silences it: the wind dies antenna by antenna on the final stretch, and the last jumps are eerily still. *"The narrative they built about you ends here."*
- **Feasibility:** per-frame velocity addition while overlapping + airborne; pooled particles. Distinct from L8 wells (uniform directional force vs. radial pull).
- **Status:** **STUB** — `src/entities/WindZone.js`

## Level 7 — Rooftop Run *(working title)* (`#ff6600` amber)

- **Unique mechanic:** Ziplines — grabbable cables ridden across the skyline, released with a jump
- **Player-facing:** *When you jump onto a cable, you grab it and ride — jump off whenever you choose.*
- **Introduction:** A short, unmissable downhill line over a wide roof: falling anywhere near it grabs it, and the ride ends safely.
- **Mid-level twist:** Branching and bidirectional lines with mid-air transfers; releasing with dash inherits the cable's momentum for max distance — route choice becomes expression.
- **Resolution:** The final line snaps mid-ride (scripted) and drops the player at the crimson tier's threshold. *"You can see everything from up here."*
- **Feasibility:** path-parameter attachment (gravity off while attached), catenary drawing reuses L4's cable pattern. Distinct from MovingPlatform (player chooses entry/exit/timing; it's traversal, not a schedule).
- **Status:** **STUB** — `src/entities/Zipline.js`

## Level 8 — The Incomprehensible *(working title)* (`#ff3366` crimson)

- **Unique mechanic:** Gravity Wells *(from backlog)* — radial fields that bend the player's trajectory toward (or away from) their core
- **Player-facing:** *When you pass near a gravity well, your jump bends toward it.*
- **Introduction:** One large, visible well (slow orbiting ring particles) over a wide pit; jumping anywhere near it pulls the player to a safe central platform — the well *helps* first.
- **Mid-level twist:** Paired wells form slingshot routes — entering with dash speed whips the player around the core and flings them across gaps no kit move could clear; inverse (repulsor) wells guard secrets.
- **Resolution:** The exit detonates the master well: one final, screen-wide pull the player must dash *against* — then stillness. *"Their architecture was built to be incomprehensible. You comprehended it."*
- **Feasibility:** per-frame radial acceleration scaled by 1/distance within a radius — classic arcade-physics field. Distinct from wind (radial + position-dependent vs. uniform).
- **Status:** **NOT STARTED** (design only — stubs were scoped to L5–7)

## Level 9 — Last Line *(working title)* (`#ff0033` blood red)

- **Unique mechanic:** Crumbling Platforms *(from backlog)* — ledges that disintegrate permanently after one touch
- **Player-facing:** *When you land on a crumbling ledge, it falls apart moments later — for good.*
- **Introduction:** A short crumble chain over solid floor; the player watches the route consume itself behind them with no danger.
- **Mid-level twist:** Optional branches share crumble ledges with the return path — going for a secret *burns the way back*, so the player chooses what to spend. Respawn restores only the spine, not the branches.
- **Resolution:** The final gauntlet crumbles as it spawns — a one-way sprint where hesitation deletes the floor. Crossing the threshold, everything behind collapses at once. *"The last line of defence. Behind you now."*
- **Feasibility:** L3's FallingPlatform state machine minus the reset state, plus persistent-until-respawn bookkeeping. Distinct from L3 precisely by permanence (resource management vs. timing).
- **Status:** **NOT STARTED** (design only)

## Level 10 — The Source (`#ffffff` white finale, all palettes cycling)

- **Unique mechanic:** Reveal Pulse — architecture hidden in white-out, exposed in rings by the player's attack
- **Player-facing:** *When you attack, a pulse of light rolls outward and reveals the hidden geometry around you.*
- **Introduction:** A small sealed chamber, fully white; the only readable thing is the attack prompt's muscle memory — one swing outlines the room in expanding wireframe, fading over ~2s.
- **Mid-level twist:** Each chamber tints the pulse with one prior level's palette (the memory-palace beat from the backlog), and later chambers put geometry in *motion* — only visible as strobed snapshots, so the player times pulses like a lighthouse.
- **Resolution:** The final chamber needs no pulse: everything is plainly visible in full white, the portal waiting. The city has nothing left to hide. *"You were at the top. They took everything. You took it back."*
- **Feasibility:** geometry rendered at alpha ~0, an expanding-circle tween driving per-object alpha by distance band — no physics changes at all; attack already exists. Distinct from everything: it changes *information*, not forces or solidity.
- **Status:** **NOT STARTED** (design only)

---

## Stub files created (shells only, no logic, unimported)

| Level | Mechanic | Stub |
|---|---|---|
| 5 | Holo-Sweep Platforms | `src/entities/HoloSweepPlatform.js` |
| 6 | Wind Zones | `src/entities/WindZone.js` |
| 7 | Ziplines | `src/entities/Zipline.js` |

Each stub: class named for the mechanic, `constructor(scene, x, y, config)`,
empty `update(delta)`, and a TODO block specifying the implementation contract
(visuals, physics approach, scene wiring, culling) in this codebase's idioms.

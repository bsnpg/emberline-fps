# Emberline — Dustline Yard

A round-based tactical first-person shooter in the browser, built on three.js
0.187.0, in the style Counter-Strike made famous — with its own map, art, sounds
and names, never a copy.

**Play it:** serve `game/` with any static file server (or `node serve.ts`) and
open `http://localhost:8080` in desktop Chrome. No build step, no network
request: everything the game needs is vendored under `game/`.

## The game

Dustline Yard is a container yard at dusk. Two teams of five — Azure attacks,
Ember defends — fight short rounds, first to 5.

- **Objective:** plant the spike at Foundry (site A) or Depot (site B) by
  holding `E`, then defend it until it blows; Ember wins the round by wiping
  Azure out, running the clock out, or defusing the spike.
- **Gunplay:** four guns (Kestrel-9 pistol, Harrier AR, Wasp SMG, Longbow DMR)
  plus a frag grenade. Hitscan against bodies, headshots pay more, recoil and
  spread punish firing on the move, stopping to aim pays. Right-click to aim,
  `R` to reload, `Shift` to walk slow, `Ctrl` to crouch, `Space` to jump.
- **Economy:** money between rounds — $800 to start, $300 a kill, $300 a plant,
  $3,250 for a round win, $1,900 for a loss. Press `B` in the buy phase to buy
  guns, grenades and Kevlar.
- **Bots:** nine bots that walk waypoint routes through the lanes, hold
  positions, react to what they see and hear, fire in bursts, plant and defuse.
- **HUD:** health and armour, ammunition, round timer, score, squad alive
  counts, kill feed, money, and plant progress.

## Layout

- `game/index.html` — page, HUD, buy menu, import map for three.js
- `game/src/main.js` — boot and the fixed 60 Hz simulation / render loop
- `game/src/map.js` — the Dustline Yard map, waypoint graph, line-of-sight test
- `game/src/bots.js` — bot AI: routes, sight, hearing, bursts, plant/defuse
- `game/src/player.js` — movement: acceleration, friction, crouch, jump, collision
- `game/src/weapons.js` — the arsenal and its view models
- `game/src/spike.js` — the plant/defuse objective
- `game/src/economy.js` — round money and the buy menu's prices
- `game/src/rounds.js` — round and match flow
- `game/src/effects.js` — pooled tracers, sparks and the explosion
- `game/src/audio.js` — synthesised WebAudio sound, no audio files
- `game/src/hud.js` — the DOM HUD (never touches the simulation)
- `game/src/input.js` — keyboard, mouse and pointer lock
- `game/src/state.js` — the one state store
- `game/src/palette.js`, `game/src/rng.js` — look plan and seeded randomness
- `main.ts` — the make.fun entry program: copies `game/` and `screenshots/`
  to `/output` and writes `dossier.json`
- `screenshots/` — real renders of the game's own code (`?shot=` captures)

## Screenshots

The four captures are deterministic frames of the game's own code, taken in a
headless browser with WebGL 2:

1. `1-start.jpg` — the menu over the yard at dusk (cover)
2. `2-play.jpg` — mid-round firefight on the mid lane
3. `3-buy.jpg` — the buy phase menu
4. `4-plant.jpg` — the spike planted at Foundry, timer running

## Development

```sh
node serve.ts            # play at http://localhost:8080
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts   # build the dossier
```

Built for the make.fun competition `threejs-fps-01` by
[lively-ibis-81](https://make.fun) — referral code `26zqsqqz`.

## License

MIT — see `LICENSE`.

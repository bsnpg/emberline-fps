// Emberline — boot and the one loop. A fixed 60 Hz simulation feeds a render at
// the display's rate; rendering never mutates the simulation. The player shoots
// hitscan rays against bot bodies (headshots pay more) and the map; bots shoot back
// through the events their module emits. Rounds, the spike, the grenade and the
// buy menu all live here, wired to the modules that own them.
//
// ?shot=start|play|buy|plant with &seed=N sets up a deterministic frame, renders
// it twice, freezes it and sets window.__shotReady — the capture mode the
// screenshots are taken from.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { mulberry32, clamp } from './rng.js';
import { createMap } from './map.js';
import { createPlayer } from './player.js';
import { createWeapons, WEAPONS, GRENADE_PRICE, ARMOR_PRICE } from './weapons.js';
import { createBots } from './bots.js';
import { createSpike, PLANT_TIME } from './spike.js';
import { createEconomy, KILL_REWARD } from './economy.js';
import { createRounds, BUY_SECONDS } from './rounds.js';
import { createEffects } from './effects.js';
import { createHud } from './hud.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createGameState } from './state.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;
const random = mulberry32(seed);

window.addEventListener('error', (event) => {
  window.__gameError = String(event.message || event.error || 'error');
});

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.sky);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.sky), 26, 60);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const map = createMap(scene);
const audio = createAudio();
const game = createGameState();
const state = game.state;
const economy = createEconomy();
const rounds = createRounds();
const spike = createSpike(scene);
const effects = createEffects(scene);
const bots = createBots(scene, map, random);
const player = createPlayer(map.colliders, map.azureSpawn);
const weapons = createWeapons(camera);
const input = createInput(renderer.domElement, onLockChange);

// Clicking the canvas while a round is live but the pointer is free re-locks it,
// so a failed lock request after closing the buy menu never strands the player.
renderer.domElement.addEventListener('mousedown', () => {
  if (shot) return;
  if (!input.state.locked && (rounds.state.phase === 'live' || rounds.state.phase === 'buy') && !state.buyOpen) {
    input.requestLock();
  }
});

const raycaster = new THREE.Raycaster();
raycaster.far = 90;
const direction = new THREE.Vector3();
const muzzle = new THREE.Vector3();
const aimPoint = new THREE.Vector3();
const worldView = {
  time: 0,
  playerAlive: true,
  playerPos: player.state.position,
  playerCrouching: false,
  playerSpeed: 0,
  noise: null,
  spike: spike.state,
};

let frozen = false;
let overlayTimer = -1;
let stepSoundAt = 0;
let lastClockSecond = -1;
let beepAccumulator = 0;

const hud = createHud({
  onBuy: buyItem,
  onBuyClose: closeBuy,
});
hud.onPlay(() => {
  if (shot) return;
  audio.unlock();
  if (rounds.state.phase === 'match') {
    restartMatch();
    return;
  }
  if (rounds.state.phase === 'ended') {
    nextRound();
    return;
  }
  if (rounds.state.phase === 'menu') {
    startMatch();
    return;
  }
  input.requestLock();
});

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    hud.hideOverlay();
    if (state.buyOpen) closeBuy();
  } else if (rounds.state.phase === 'live' && !state.buyOpen && overlayTimer < 0) {
    hud.showOverlay('paused');
  }
}

function syncCamera() {
  const body = player.state;
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
  const targetFov = body.aiming ? weapons.def().zoomFov : 74;
  if (Math.abs(camera.fov - targetFov) > 0.05) {
    camera.fov += (targetFov - camera.fov) * 0.2;
    camera.updateProjectionMatrix();
  }
}

function aimAt(point) {
  const body = player.state;
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(clamp(dy / length, -1, 1));
  syncCamera();
}

function muzzleWorld() {
  muzzle.set(0.24, -0.17, -0.95);
  return camera.localToWorld(muzzle);
}

function applyPlayerDamage(amount, fromName, head) {
  if (!state.alive) return;
  let remaining = amount;
  if (state.armor > 0) {
    const absorbed = Math.min(state.armor, Math.round(amount * 0.5));
    state.armor -= absorbed;
    remaining -= absorbed;
  }
  state.health -= remaining;
  state.damageFlash = 1;
  audio.hurt();
  hud.setHealth(state.health);
  hud.setArmor(state.armor);
  if (state.health <= 0) {
    state.health = 0;
    state.alive = false;
    state.deaths += 1;
    game.addFeed(`${fromName} ▸ You${head ? ' (headshot)' : ''}`, 'ember');
    hud.addFeed(`${fromName} ▸ You${head ? ' (headshot)' : ''}`, 'ember');
    hud.showBanner('You are down — your squad fights on', 3000);
    if (spike.state.carriedBy === 'player') {
      spike.drop(player.state.position.x, player.state.position.z);
      hud.showBanner('Spike dropped — a teammate will recover it', 3000);
    }
    input.exitLock();
    checkRoundEnd();
  }
}

function shoot(spread) {
  if (!weapons.takeRound()) {
    audio.dryFire();
    return false;
  }
  camera.getWorldDirection(direction);
  direction.x += (random() * 2 - 1) * spread;
  direction.y += (random() * 2 - 1) * spread;
  direction.z += (random() * 2 - 1) * spread;
  direction.normalize();
  const from = muzzleWorld().clone();
  scene.updateMatrixWorld(true);
  raycaster.set(camera.position, direction);
  const targets = map.shootables.concat(bots.hitMeshes());
  const hit = raycaster.intersectObjects(targets, false)[0];
  const end = hit ? hit.point.clone() : camera.position.clone().add(direction.clone().multiplyScalar(60));
  effects.tracer(from, end);
  state.noise = { x: player.state.position.x, z: player.state.position.z, time: state.time };
  audio.shot(weapons.def().kind, 1);
  if (hit && hit.object.userData.bot) {
    const bot = hit.object.userData.bot;
    const head = hit.object.userData.part === 'head';
    const def = weapons.def();
    const damage = Math.round(def.damage * (head ? def.headMult : 1));
    bots.damageBot(bot, damage, { name: 'You', team: 'azure' }, head);
    hud.hitMarker(!bot.alive, 4000);
    audio.hit();
    if (!bot.alive) {
      audio.kill();
      state.kills += 1;
      economy.rewardKill();
      game.addFeed(`You ▸ ${bot.name}${head ? ' (headshot)' : ''}`, 'azure');
      hud.addFeed(`You ▸ ${bot.name}${head ? ' (headshot)' : ''}`, 'azure');
      hud.setMoney(economy.state.money);
      checkRoundEnd();
    }
  } else if (hit) {
    effects.spark(hit.point);
  }
  weapons.pullTrigger();
  player.recoil(weapons.def().recoil * (0.9 + random() * 0.3), (random() * 2 - 1) * 0.004);
  hud.setAmmo(weapons.state.ammo[weapons.state.current].mag, weapons.state.ammo[weapons.state.current].reserve);
  return true;
}

function throwGrenade() {
  if (state.grenades <= 0 || state.grenade || rounds.state.phase !== 'live') return;
  state.grenades -= 1;
  audio.grenadePin();
  camera.getWorldDirection(direction);
  state.grenade = {
    x: camera.position.x, y: camera.position.y, z: camera.position.z,
    vx: direction.x * 17 + player.state.velocity.x,
    vy: direction.y * 17 + 3.5,
    vz: direction.z * 17 + player.state.velocity.z,
    fuse: 1.6,
  };
  hud.setWeapon(weapons.def().name, state.grenades);
}

function stepGrenade(dt) {
  const grenade = state.grenade;
  if (!grenade) return;
  grenade.fuse -= dt;
  grenade.vy -= 13 * dt;
  grenade.x += grenade.vx * dt;
  grenade.y += grenade.vy * dt;
  grenade.z += grenade.vz * dt;
  if (grenade.y < 0.12) {
    grenade.y = 0.12;
    grenade.vy = Math.abs(grenade.vy) * 0.45;
    grenade.vx *= 0.7;
    grenade.vz *= 0.7;
    audio.bounce();
  }
  for (const box of map.colliders) {
    if (box.max.y <= 0.05) continue;
    if (grenade.x > box.min.x - 0.1 && grenade.x < box.max.x + 0.1 && grenade.y > box.min.y - 0.1 && grenade.y < box.max.y + 0.1 && grenade.z > box.min.z - 0.1 && grenade.z < box.max.z + 0.1) {
      grenade.vx *= -0.45;
      grenade.vz *= -0.45;
      grenade.x += grenade.vx * dt * 2;
      grenade.z += grenade.vz * dt * 2;
      audio.bounce();
      break;
    }
  }
  if (grenade.fuse <= 0) {
    state.grenade = null;
    const at = new THREE.Vector3(grenade.x, Math.max(0.3, grenade.y), grenade.z);
    effects.explosion(at);
    audio.explosion();
    state.noise = { x: grenade.x, z: grenade.z, time: state.time };
    for (const bot of bots.bots) {
      if (!bot.alive) continue;
      const dist = Math.hypot(bot.position.x - grenade.x, bot.position.z - grenade.z);
      if (dist < 7) {
        const damage = Math.round(110 - (dist / 7) * 90);
        bots.damageBot(bot, damage, { name: 'You', team: 'azure' }, false);
        if (!bot.alive) {
          state.kills += 1;
          economy.rewardKill();
          hud.addFeed(`You ▸ ${bot.name} (frag)`, 'azure');
          hud.setMoney(economy.state.money);
        }
      }
    }
    const playerDist = Math.hypot(player.state.position.x - grenade.x, player.state.position.z - grenade.z);
    if (playerDist < 7 && state.alive) applyPlayerDamage(Math.round((110 - (playerDist / 7) * 90) * 0.5), 'Your frag', false);
    checkRoundEnd();
  }
}

function checkRoundEnd() {
  if (rounds.state.phase !== 'live') return;
  const azureAlive = (state.alive ? 1 : 0) + bots.aliveCount('azure');
  const emberAlive = bots.aliveCount('ember');
  if (emberAlive === 0 && !spike.state.planted) endRound('azure', 'Ember squad eliminated');
  else if (azureAlive === 0) endRound('ember', 'Azure squad eliminated');
}

function endRound(winner, reason) {
  if (!rounds.endRound(winner, reason)) return;
  economy.rewardRound(winner === 'azure');
  hud.setMoney(economy.state.money);
  hud.setScore(rounds.state.scoreAzure, rounds.state.scoreEmber, rounds.state.round);
  if (winner === 'azure') audio.roundWin();
  else audio.roundLoss();
  overlayTimer = 1.4;
}

function startMatch() {
  game.resetMatch();
  economy.resetMatch();
  weapons.resetMatch();
  rounds.startMatch();
  startRound();
  hud.setMoney(economy.state.money);
  hud.setScore(0, 0, 1);
  hud.hideOverlay();
  input.requestLock();
}

function restartMatch() {
  startMatch();
}

function startRound() {
  game.resetRound();
  spike.resetRound();
  weapons.refillRound();
  bots.resetRound(seed + rounds.state.round);
  player.respawn(map.azureSpawn, 0);
  state.owned = new Set(['kestrel', ...[...state.owned].filter((id) => id !== 'kestrel')]);
  rounds.startRound();
  hud.setHealth(100);
  hud.setArmor(state.armor);
  hud.setMoney(economy.state.money);
  hud.setScore(rounds.state.scoreAzure, rounds.state.scoreEmber, rounds.state.round);
  hud.setObjective('Plant the spike at Foundry (A) or Depot (B)');
  hud.setAmmo(weapons.state.ammo[weapons.state.current].mag, weapons.state.ammo[weapons.state.current].reserve);
  hud.setWeapon(weapons.def().name, state.grenades);
  hud.setAlive(5, 5);
  if (!shot) openBuy();
  syncCamera();
}

function nextRound() {
  if (rounds.state.phase === 'match') {
    restartMatch();
    return;
  }
  rounds.nextRound();
  startRound();
  hud.hideOverlay();
  input.requestLock();
}

function openBuy() {
  if (rounds.state.phase !== 'buy') return;
  state.buyOpen = true;
  hud.showBuy(economy.state.money, state.owned, state.grenades, state.armor > 0);
  input.exitLock();
}

function closeBuy() {
  state.buyOpen = false;
  hud.hideBuy();
  if (!shot && rounds.state.phase !== 'menu') input.requestLock();
}

function buyItem(id) {
  if (rounds.state.phase !== 'buy') return;
  if (id === 'grenade') {
    if (economy.buyGrenade(state.grenades)) {
      state.grenades += 1;
      audio.buy();
    } else audio.denied();
  } else if (id === 'armor') {
    if (economy.buyArmor(state.armor > 0)) {
      state.armor = 100;
      audio.buy();
    } else audio.denied();
  } else {
    const bought = economy.buyWeapon(id, state.owned);
    if (bought) {
      weapons.give(id);
      audio.buy();
      hud.setAmmo(weapons.state.ammo[id].mag, weapons.state.ammo[id].reserve);
      hud.setWeapon(weapons.def().name, state.grenades);
    } else audio.denied();
  }
  hud.setMoney(economy.state.money);
  hud.setArmor(state.armor);
  hud.refreshBuy(economy.state.money, state.owned, state.grenades, state.armor > 0);
}

function drainBotEvents() {
  for (const event of bots.events) {
    if (event.type === 'shot') {
      effects.tracer(event.from, event.to);
      const dist = event.from.distanceTo(camera.position);
      audio.shot('rifle', clamp(1.4 - dist / 40, 0.08, 0.7));
      state.noise = { x: event.from.x, z: event.from.z, time: state.time };
    } else if (event.type === 'damage-player') {
      applyPlayerDamage(event.amount, event.from, event.head);
    } else if (event.type === 'kill') {
      const killer = event.killerTeam === 'azure' ? 'azure' : 'ember';
      game.addFeed(`${event.killerName} ▸ ${event.victim.name}${event.head ? ' (headshot)' : ''}`, killer);
      hud.addFeed(`${event.killerName} ▸ ${event.victim.name}${event.head ? ' (headshot)' : ''}`, killer);
      checkRoundEnd();
    } else if (event.type === 'planted') {
      spike.plant(event.site);
      economy.rewardPlant();
      hud.setMoney(economy.state.money);
      hud.showBanner(`${event.bot.name} planted the spike at site ${event.site.id} — defend it`, 3500);
      hud.setObjective(`Spike planted at ${event.site.name} — defend it`);
      audio.plantBeep(true);
    } else if (event.type === 'defused') {
      endRound('ember', 'Spike defused');
    } else if (event.type === 'spike-picked') {
      spike.pickUpByBot(event.bot);
      hud.showBanner(`${event.bot.name} recovered the spike`, 2500);
    }
  }
  bots.events.length = 0;
}

function step(dt) {
  state.time += dt;
  worldView.time = state.time;
  worldView.playerAlive = state.alive;
  worldView.playerCrouching = player.state.crouching;
  worldView.playerSpeed = player.groundSpeed();
  worldView.noise = state.noise;
  worldView.canFight = rounds.state.phase === 'live';

  rounds.tick(dt);
  if (rounds.state.phase === 'buy' && rounds.state.clock <= 0) {
    rounds.beginLive();
    closeBuy();
    hud.showBanner(`Round ${rounds.state.round} — plant the spike`, 3000);
    hud.setObjective('Plant the spike at Foundry (A) or Depot (B)');
  }
  if (rounds.state.phase === 'live') {
    if (spike.state.planted) {
      spike.state.timer -= dt;
      spike.syncMesh(state.time);
      beepAccumulator += dt;
      const interval = spike.state.timer > 20 ? 1 : spike.state.timer > 10 ? 0.5 : 0.25;
      if (beepAccumulator >= interval) {
        beepAccumulator = 0;
        audio.plantBeep(spike.state.timer <= 10);
      }
      if (spike.state.timer <= 0) {
        const site = spike.state.site;
        effects.explosion(new THREE.Vector3(site.x, 0.5, site.z));
        audio.explosion();
        endRound('azure', 'Spike detonated');
      }
    } else if (rounds.state.clock <= 0) {
      endRound('ember', 'Time expired — spike never planted');
    }
  }

  if (rounds.state.phase === 'buy' || rounds.state.phase === 'live') {
    player.step(dt, input.state.keys, input.state.aiming && state.alive);
    weapons.step(dt, input.state.aiming);
    bots.step(dt, worldView);
    drainBotEvents();
    stepGrenade(dt);

    // Spike pickup and planting by the player.
    if (state.alive && rounds.state.phase === 'live') {
      if (spike.state.dropped) {
        const dx = player.state.position.x - spike.state.x;
        const dz = player.state.position.z - spike.state.z;
        if (dx * dx + dz * dz < 2.25) {
          spike.pickUpByPlayer();
          hud.showBanner('Spike recovered', 2000);
        }
      }
      const site = map.siteAt(player.state.position.x, player.state.position.z);
      if (spike.state.carriedBy === 'player' && site && input.state.keys.has('KeyE')) {
        state.plantHeld += dt;
        hud.setProgress(`Planting at site ${site.id}`, state.plantHeld / PLANT_TIME);
        if (state.plantHeld >= PLANT_TIME) {
          state.plantHeld = 0;
          hud.setProgress('', 0);
          spike.plant(site);
          economy.rewardPlant();
          hud.setMoney(economy.state.money);
          hud.showBanner(`Spike planted at site ${site.id} — defend it`, 3500);
          hud.setObjective(`Spike planted at ${site.name} — defend it`);
          audio.plantBeep(true);
        }
      } else {
        state.plantHeld = Math.max(0, state.plantHeld - dt * 2);
        hud.setProgress('', 0);
      }
    }

    // Footsteps while moving on the ground.
    if (player.groundSpeed() > 1.5 && player.state.onGround && state.time - stepSoundAt > 0.38) {
      stepSoundAt = state.time;
      audio.step();
    }
  }

  effects.step(dt);
  state.damageFlash = Math.max(0, state.damageFlash - dt * 1.6);
  hud.damageFlash(state.damageFlash);

  if (overlayTimer > 0) {
    overlayTimer -= dt;
    if (overlayTimer <= 0) {
      overlayTimer = -1;
      if (rounds.state.phase === 'match') {
        hud.showOverlay('match', { won: rounds.state.matchWinner === 'azure', draw: rounds.state.matchWinner === 'draw', scoreAzure: rounds.state.scoreAzure, scoreEmber: rounds.state.scoreEmber });
        input.exitLock();
      } else {
        hud.showOverlay('round', { won: rounds.state.endWinner === 'azure', reason: rounds.state.endReason, scoreAzure: rounds.state.scoreAzure, scoreEmber: rounds.state.scoreEmber });
        input.exitLock();
      }
    }
  }

  const clockSecond = Math.ceil(rounds.state.clock);
  if (clockSecond !== lastClockSecond) {
    lastClockSecond = clockSecond;
    if ((rounds.state.phase === 'buy' || rounds.state.phase === 'live') && clockSecond <= 5 && clockSecond > 0) audio.tick();
  }
  hud.setTimer(spike.state.planted ? spike.state.timer : rounds.state.clock, spike.state.planted);
  hud.setAlive((state.alive ? 1 : 0) + bots.aliveCount('azure'), bots.aliveCount('ember'));
  hud.setCrosshairSpread(state.alive ? weapons.spread(player.groundSpeed(), input.state.aiming) : 0.01);
}

let accumulator = 0;
let lastTime = performance.now();

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    scene.updateMatrixWorld(true);
    const look = input.takeLook();
    if (state.alive && (rounds.state.phase === 'buy' || rounds.state.phase === 'live')) player.look(look.x, look.y);
    // Edge-triggered keys.
    if (input.takePressed('KeyR') && state.alive) {
      if (weapons.reload()) audio.reload();
    }
    if (input.takePressed('KeyG')) throwGrenade();
    if (input.takePressed('KeyB')) {
      if (state.buyOpen) closeBuy();
      else openBuy();
    }
    if (state.buyOpen) {
      if (input.takePressed('Digit1')) buyItem('harrier');
      if (input.takePressed('Digit2')) buyItem('wasp');
      if (input.takePressed('Digit3')) buyItem('longbow');
      if (input.takePressed('Digit4')) buyItem('grenade');
      if (input.takePressed('Digit5')) buyItem('armor');
      if (input.takePressed('Escape')) closeBuy();
    } else {
      if (input.takePressed('Digit1') && state.owned.has('kestrel')) weapons.equip('kestrel');
      if (input.takePressed('Digit2') && state.owned.has('harrier')) weapons.equip('harrier');
      if (input.takePressed('Digit3') && state.owned.has('wasp')) weapons.equip('wasp');
      if (input.takePressed('Digit4') && state.owned.has('longbow')) weapons.equip('longbow');
      if (input.state.firing && state.alive && weapons.ready() && (rounds.state.phase === 'live' || rounds.state.phase === 'buy')) {
        // Automatic weapons fire while held; semi-automatic ones fire once per click.
        if (weapons.def().auto || input.takeClick()) {
          shoot(weapons.spread(player.groundSpeed(), input.state.aiming));
        }
      } else {
        input.takeClick();
      }
    }
    if (rounds.state.phase === 'buy' || rounds.state.phase === 'live' || rounds.state.phase === 'ended' || rounds.state.phase === 'match') {
      accumulator += dt;
      let steps = 0;
      while (accumulator >= FIXED_STEP && steps < 5) {
        step(FIXED_STEP);
        accumulator -= FIXED_STEP;
        steps += 1;
      }
      if (accumulator > FIXED_STEP * 5) accumulator = 0;
    }
    if (state.alive) {
      const slot = weapons.state.ammo[weapons.state.current];
      hud.setAmmo(slot.mag, slot.reserve);
    }
    syncCamera();
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

function nearestEmberBot() {
  let target = null;
  let best = Infinity;
  for (const bot of bots.bots) {
    if (!bot.alive || bot.team !== 'ember') continue;
    const dist = Math.hypot(bot.position.x - player.state.position.x, bot.position.z - player.state.position.z);
    if (dist < best) {
      best = dist;
      target = bot;
    }
  }
  return target;
}

// Capture staging: put the player back on their feet at full health after the
// settle, with a clean feed and no banner, so the frame shows a live fight.
function stagePlayer(x, z) {
  player.respawn({ x, z }, 0);
  state.health = 100;
  state.alive = true;
  state.damageFlash = 0;
  state.feed.length = 0;
  if (spike.state.dropped) spike.pickUpByPlayer();
  hud.setHealth(100);
  hud.damageFlash(0);
  hud.clearFeed();
  hud.clearBanner();
  syncCamera();
}

function runShot(name) {
  hud.hideOverlay();
  hud.hideBuy();
  if (name === 'start') {
    player.respawn(map.azureSpawn, 0);
    bots.resetRound(seed);
    settle(30);
    aimAt(new THREE.Vector3(0, 1.6, -10));
    hud.setHealth(100);
    hud.setMoney(economy.state.money);
    hud.setScore(0, 0, 1);
    hud.setTimer(BUY_SECONDS, false);
    hud.setAlive(5, 5);
    hud.showOverlay('start');
    document.getElementById('overlay').style.background = 'rgba(20, 24, 31, 0.55)';
  } else if (name === 'buy') {
    startMatch();
    economy.state.money = 3500;
    settle(10);
    player.respawn({ x: -2, z: 15 }, 0);
    aimAt(new THREE.Vector3(0, 1.6, -10));
    hud.showBuy(economy.state.money, state.owned, state.grenades, false);
    hud.setMoney(economy.state.money);
  } else if (name === 'play') {
    startMatch();
    rounds.beginLive();
    weapons.give('harrier');
    settle(240);
    // Stage the frame: the settle lets the bots walk into the yard, and they
    // may have killed the player by then — restore the player, clear the feed,
    // and put the nearest defender in the open mid lane to shoot at.
    stagePlayer(3.5, 8);
    const target = nearestEmberBot();
    if (target) {
      target.position.set(2.0, 0, -6.0);
      target.yaw = Math.PI;
      target.group.position.set(2.0, 0, -6.0);
      target.group.rotation.y = Math.PI;
      target.seen = null;
      target.state = 'hold';
      target.holdUntil = state.time + 10;
      aimPoint.set(target.position.x, 1.2, target.position.z);
      aimAt(aimPoint);
      for (let round = 0; round < 4; round += 1) {
        shoot(0);
        settle(6);
      }
    } else {
      aimAt(new THREE.Vector3(0, 1.5, -10));
      shoot(0);
      settle(6);
    }
    hud.setScore(0, 0, 1);
  } else if (name === 'plant') {
    startMatch();
    rounds.beginLive();
    weapons.give('harrier');
    const site = map.sites[0];
    spike.plant(site);
    spike.state.timer = 32;
    settle(120);
    stagePlayer(-16, -2);
    const guard = nearestEmberBot();
    if (guard) {
      guard.position.set(-13.5, 0, -6.5);
      guard.yaw = Math.PI * 0.75;
      guard.group.position.set(-13.5, 0, -6.5);
      guard.group.rotation.y = Math.PI * 0.75;
      guard.seen = null;
      guard.state = 'hold';
      guard.holdUntil = state.time + 10;
    }
    aimAt(new THREE.Vector3(site.x, 1.4, site.z));
    hud.setObjective(`Spike planted at ${site.name} — defend it`);
    hud.setTimer(32, true);
    hud.setScore(0, 0, 1);
  }
  hud.setAmmo(weapons.state.ammo[weapons.state.current].mag, weapons.state.ammo[weapons.state.current].reserve);
  hud.setWeapon(weapons.def().name, state.grenades);
  paintTwiceThenReady();
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

syncCamera();
hud.setHealth(100);
hud.setMoney(economy.state.money);
hud.setScore(0, 0, 1);
hud.setTimer(BUY_SECONDS, false);
hud.setObjective('Plant the spike at Foundry (A) or Depot (B)');
// A read-only handle for play-testing: live state, never used by the game itself.
window.__ember = { state, rounds: rounds.state, money: economy.state, spike: spike.state, bots, player: player.state, weapons: weapons.state };
if (shot) runShot(shot);
else {
  hud.showOverlay('start');
  requestAnimationFrame(frame);
}

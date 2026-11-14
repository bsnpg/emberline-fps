// The nine bots: four Azure attackers beside the player, five Ember defenders.
// Each bot is a small state machine — route, hold, engage, plant, defuse, retrieve —
// walking the map's waypoint graph, so it takes real lanes and holds real corners.
// It sees through line of sight only (segmentBlocked), hears gunshots, reacts after
// a human-ish delay, and fires bursts whose accuracy falls with distance and with
// the target's speed. All combat events go out through the callbacks in `world`.
import * as THREE from 'three';
import { PALETTE, CALLSIGNS } from './palette.js';
import { clamp, range } from './rng.js';

const BOT_SPEED = 3.6;
const EYE_HEIGHT = 1.5;
const SENSE_TICK = 0.15;
const HEAR_RADIUS = 26;

function routeBetween(waypoints, from, to) {
  // Breadth-first search over the waypoint graph; the graph is tiny.
  const prev = new Array(waypoints.length).fill(-1);
  const queue = [from];
  prev[from] = from;
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === to) break;
    for (const next of waypoints[current].links) {
      if (prev[next] === -1) {
        prev[next] = current;
        queue.push(next);
      }
    }
  }
  if (prev[to] === -1) return [to];
  const path = [];
  let node = to;
  while (node !== from) {
    path.unshift(node);
    node = prev[node];
  }
  return path;
}

export function createBots(scene, map, random) {
  const torsoGeometry = new THREE.BoxGeometry(0.54, 0.72, 0.32);
  const headGeometry = new THREE.BoxGeometry(0.3, 0.3, 0.3);
  const legGeometry = new THREE.BoxGeometry(0.2, 0.5, 0.22);
  const gunGeometry = new THREE.BoxGeometry(0.07, 0.09, 0.55);
  const materials = {};
  for (const team of ['azure', 'ember']) {
    materials[team] = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE[team]), roughness: 0.7 });
    materials[`${team}Dark`] = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE[team === 'azure' ? 'steel' : 'rust']), roughness: 0.8 });
    materials[`${team}Visor`] = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE[team]), emissive: new THREE.Color(PALETTE[team]), emissiveIntensity: 1.4, roughness: 0.4 });
  }

  const bots = [];
  const events = [];
  const probe = new THREE.Box3();

  function makeBot(team, name, index) {
    const group = new THREE.Group();
    const mat = materials[team];
    const dark = materials[`${team}Dark`];
    const visor = materials[`${team}Visor`];
    const legL = new THREE.Mesh(legGeometry, dark);
    legL.position.set(-0.13, 0.25, 0);
    const legR = new THREE.Mesh(legGeometry, dark);
    legR.position.set(0.13, 0.25, 0);
    const torso = new THREE.Mesh(torsoGeometry, mat);
    torso.position.y = 0.95;
    torso.userData.part = 'torso';
    const head = new THREE.Mesh(headGeometry, dark);
    head.position.y = 1.52;
    head.userData.part = 'head';
    const visorMesh = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.08, 0.02), visor);
    visorMesh.position.set(0, 1.54, -0.16);
    const gun = new THREE.Mesh(gunGeometry, dark);
    gun.position.set(0.28, 1.05, -0.2);
    group.add(legL, legR, torso, head, visorMesh, gun);
    group.traverse((mesh) => {
      if (mesh.isMesh) {
        mesh.castShadow = true;
      }
    });
    scene.add(group);
    const bot = {
      team, name, index, group, torso, head, legL, legR, gun,
      position: new THREE.Vector3(),
      yaw: 0,
      health: 100,
      armor: 0,
      alive: false,
      deadFor: 0,
      skill: range(random, 0.55, 0.85),
      reaction: range(random, 0.35, 0.7),
      state: 'route',
      route: [],
      routeIndex: 0,
      holdUntil: 0,
      targetSite: null,
      seen: null,
      seenAt: -99,
      seenPos: new THREE.Vector3(),
      hearPos: null,
      burstLeft: 0,
      burstGap: 0,
      aimError: 0,
      walkPhase: 0,
      fall: 0,
      carrying: false,
      planting: 0,
      defusing: 0,
      senseTimer: range(random, 0, SENSE_TICK),
    };
    torso.userData.bot = bot;
    head.userData.bot = bot;
    bots.push(bot);
    return bot;
  }

  for (let i = 0; i < 4; i += 1) makeBot('azure', CALLSIGNS.azure[i], i);
  for (let i = 0; i < 5; i += 1) makeBot('ember', CALLSIGNS.ember[i], i);

  function overlaps(x, z) {
    probe.min.set(x - 0.34, 0.04, z - 0.34);
    probe.max.set(x + 0.34, 1.68, z + 0.34);
    for (const collider of map.colliders) {
      if (probe.intersectsBox(collider)) return true;
    }
    return false;
  }

  function spawnAt(bot, x, z, yaw) {
    bot.position.set(x, 0, z);
    bot.yaw = yaw;
    bot.health = 100;
    bot.armor = 0;
    bot.alive = true;
    bot.state = 'route';
    bot.route = [];
    bot.routeIndex = 0;
    bot.holdUntil = 0;
    bot.seen = null;
    bot.seenAt = -99;
    bot.hearPos = null;
    bot.burstLeft = 0;
    bot.burstGap = 0;
    bot.fall = 0;
    bot.deadFor = 0;
    bot.carrying = false;
    bot.planting = 0;
    bot.defusing = 0;
    bot.group.rotation.set(0, yaw, 0);
    bot.group.position.copy(bot.position);
    bot.group.visible = true;
  }

  function resetRound(roundSeed) {
    const rng = random;
    void roundSeed;
    // Azure attackers spread across the south spawn; Ember defenders across the north.
    const azureSpots = [[-6, 16.5], [-2, 17.2], [2, 17.2], [6, 16.5]];
    const emberSpots = [[-8, -16.5], [-3, -17], [0, -16.2], [4, -17], [9, -16.5]];
    for (let i = 0; i < 4; i += 1) {
      const bot = bots[i];
      spawnAt(bot, azureSpots[i][0], azureSpots[i][1], 0);
      bot.targetSite = rng() < 0.5 ? 'A' : 'B';
      bot.state = 'route';
      bot.route = routeBetween(map.waypoints, map.nearestWaypoint(bot.position.x, bot.position.z), bot.targetSite === 'A' ? 12 : 13);
    }
    for (let i = 0; i < 5; i += 1) {
      const bot = bots[4 + i];
      spawnAt(bot, emberSpots[i][0], emberSpots[i][1], Math.PI);
      // Defenders: two hold the sites, two hold mid lanes, one roams the connector.
      bot.targetSite = i < 2 ? (i === 0 ? 'A' : 'B') : null;
      bot.holdNode = i === 0 ? 12 : i === 1 ? 13 : i === 2 ? 7 : i === 3 ? 9 : 14;
      bot.state = 'route';
      bot.route = routeBetween(map.waypoints, map.nearestWaypoint(bot.position.x, bot.position.z), bot.holdNode);
    }
  }

  function visibleEnemy(bot, world) {
    // Returns {kind:'player'|'bot', ref, x, y, z, distance} or null.
    let best = null;
    let bestDistance = 42;
    if (world.playerAlive) {
      const px = world.playerPos.x;
      const py = world.playerPos.y + (world.playerCrouching ? 1.0 : 1.5);
      const pz = world.playerPos.z;
      const dx = px - bot.position.x;
      const dy = py - EYE_HEIGHT;
      const dz = pz - bot.position.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist < bestDistance) {
        const facing = Math.cos(bot.yaw) * -dz + Math.sin(bot.yaw) * -dx;
        const forward = Math.hypot(dx, dz) || 1;
        if (dist < 6 || facing / forward > 0.25) {
          if (!map.segmentBlocked(bot.position.x, EYE_HEIGHT, bot.position.z, px, py, pz)) {
            best = { kind: 'player', ref: null, x: px, y: py, z: pz, distance: dist };
            bestDistance = dist;
          }
        }
      }
    }
    for (const other of bots) {
      if (!other.alive || other.team === bot.team) continue;
      const dx = other.position.x - bot.position.x;
      const dy = EYE_HEIGHT - EYE_HEIGHT;
      const dz = other.position.z - bot.position.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist >= bestDistance) continue;
      const facing = Math.cos(bot.yaw) * -dz + Math.sin(bot.yaw) * -dx;
      const forward = Math.hypot(dx, dz) || 1;
      if (dist < 6 || facing / forward > 0.25) {
        if (!map.segmentBlocked(bot.position.x, EYE_HEIGHT, bot.position.z, other.position.x, 1.2, other.position.z)) {
          best = { kind: 'bot', ref: other, x: other.position.x, y: 1.2, z: other.position.z, distance: dist };
          bestDistance = dist;
        }
      }
    }
    return best;
  }

  function setRoute(bot, nodeIndex) {
    bot.route = routeBetween(map.waypoints, map.nearestWaypoint(bot.position.x, bot.position.z), nodeIndex);
    bot.routeIndex = 0;
    bot.state = 'route';
  }

  function moveToward(bot, dt, x, z, speed) {
    const dx = x - bot.position.x;
    const dz = z - bot.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.05) return true;
    const targetYaw = Math.atan2(-dx, -dz);
    let dyaw = targetYaw - bot.yaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    bot.yaw += clamp(dyaw, -3.2 * dt, 3.2 * dt);
    const stepDistance = Math.min(dist, speed * dt);
    const nx = bot.position.x + Math.sin(bot.yaw) * -stepDistance;
    const nz = bot.position.z + Math.cos(bot.yaw) * -stepDistance;
    // Bots steer with their yaw, so a blocked step means slide along the wall instead.
    if (!overlaps(nx, bot.position.z)) bot.position.x = nx;
    if (!overlaps(bot.position.x, nz)) bot.position.z = nz;
    bot.walkPhase += dt * speed * 2.4;
    return dist < 0.4;
  }

  function fireBurst(bot, world, target, dt) {
    bot.burstGap -= dt;
    if (bot.burstLeft <= 0 || bot.burstGap > 0) return;
    bot.burstGap = 0.11;
    bot.burstLeft -= 1;
    const muzzle = new THREE.Vector3(bot.position.x, 1.15, bot.position.z);
    const spread = 0.02 + target.distance * 0.0016 + (target.kind === 'player' ? world.playerSpeed * 0.006 : 0);
    const hitChance = clamp(bot.skill * (1.15 - target.distance / 55) - spread * 4, 0.08, 0.85);
    const hit = random() < hitChance;
    const head = hit && random() < 0.16;
    const damage = head ? 66 : Math.round(range(random, 19, 27));
    const end = new THREE.Vector3(target.x, target.y, target.z);
    if (!hit) {
      end.x += range(random, -1.6, 1.6);
      end.y += range(random, -0.6, 1.2);
      end.z += range(random, -1.6, 1.6);
    }
    events.push({ type: 'shot', from: muzzle, to: end, team: bot.team, loud: true });
    if (!hit) return;
    if (target.kind === 'player') {
      events.push({ type: 'damage-player', amount: damage, from: bot.name, head });
    } else {
      damageBot(target.ref, damage, bot, head);
    }
  }

  function damageBot(bot, amount, killer, head) {
    if (!bot.alive) return;
    let remaining = amount;
    if (bot.armor > 0) {
      const absorbed = Math.min(bot.armor, Math.round(amount * 0.5));
      bot.armor -= absorbed;
      remaining -= absorbed;
    }
    bot.health -= remaining;
    if (bot.health <= 0) {
      bot.health = 0;
      bot.alive = false;
      bot.fall = 0;
      events.push({ type: 'kill', victim: bot, killerName: killer ? killer.name : '—', killerTeam: killer ? killer.team : bot.team, head });
    }
  }

  function stepBot(bot, dt, world) {
    if (!bot.alive) {
      if (bot.fall < 1) {
        bot.fall = Math.min(1, bot.fall + dt / 0.5);
        bot.group.rotation.x = bot.fall * 1.5;
        bot.group.position.y = -bot.fall * 0.1;
      } else {
        bot.deadFor += dt;
        if (bot.deadFor > 6) bot.group.visible = false;
      }
      return;
    }
    bot.senseTimer -= dt;
    if (bot.senseTimer <= 0 && world.canFight !== false) {
      bot.senseTimer = SENSE_TICK;
      const seen = visibleEnemy(bot, world);
      if (seen) {
        if (!bot.seen || bot.seen.kind !== seen.kind || bot.seen.ref !== seen.ref) {
          bot.seenAt = world.time + bot.reaction;
          bot.burstLeft = 0;
        }
        bot.seen = seen;
        bot.seenPos.set(seen.x, seen.y, seen.z);
      } else if (bot.seen && world.time - bot.seenAt > 1.2) {
        bot.seen = null;
      }
    }

    // Hearing: a loud shot within range pulls a bot toward the sound.
    if (world.noise && world.noise.time > world.time - 0.4) {
      const dx = world.noise.x - bot.position.x;
      const dz = world.noise.z - bot.position.z;
      if (dx * dx + dz * dz < HEAR_RADIUS * HEAR_RADIUS && bot.state !== 'engage' && !bot.seen) {
        bot.hearPos = { x: world.noise.x, z: world.noise.z };
        if (bot.state === 'hold') setRoute(bot, map.nearestWaypoint(world.noise.x, world.noise.z));
      }
    }

    // The buy phase is safe: bots walk to their positions but never engage.
    if (world.canFight === false) {
      bot.seen = null;
      bot.burstLeft = 0;
    }
    const engaging = world.canFight !== false && bot.seen && world.time >= bot.seenAt;
    if (engaging) {
      bot.state = 'engage';
      const target = bot.seen;
      const dx = target.x - bot.position.x;
      const dz = target.z - bot.position.z;
      const targetYaw = Math.atan2(-dx, -dz);
      let dyaw = targetYaw - bot.yaw;
      while (dyaw > Math.PI) dyaw -= Math.PI * 2;
      while (dyaw < -Math.PI) dyaw += Math.PI * 2;
      bot.yaw += clamp(dyaw, -6 * dt, 6 * dt);
      // Strafe sideways while fighting, and close distance if far.
      const dist = Math.hypot(dx, dz);
      if (dist > 16) {
        moveToward(bot, dt, target.x, target.z, BOT_SPEED * 0.8);
      } else if (Math.abs(dyaw) < 0.3) {
        const strafe = Math.sin(world.time * 0.9 + bot.index * 2.1) > 0 ? 1 : -1;
        const sx = bot.position.x + Math.cos(bot.yaw) * strafe * BOT_SPEED * 0.4 * dt;
        const sz = bot.position.z - Math.sin(bot.yaw) * strafe * BOT_SPEED * 0.4 * dt;
        if (!overlaps(sx, bot.position.z)) bot.position.x = sx;
        if (!overlaps(bot.position.x, sz)) bot.position.z = sz;
      }
      if (bot.burstLeft <= 0 && bot.burstGap <= 0) {
        bot.burstLeft = 3 + Math.floor(random() * 3);
        bot.burstGap = range(random, 0.35, 0.8);
      }
      fireBurst(bot, world, target, dt);
      bot.planting = 0;
      bot.defusing = 0;
      return;
    }

    bot.burstLeft = 0;
    // Objective behaviour, only when nothing is in sight.
    if (world.spike.planted) {
      if (bot.team === 'ember') {
        bot.state = 'defuse';
        const site = world.spike.site;
        if (moveToward(bot, dt, site.x, site.z, BOT_SPEED)) {
          bot.defusing += dt;
          events.push({ type: 'defuse-progress', bot, progress: bot.defusing / 5 });
          if (bot.defusing >= 5) {
            bot.defusing = 0;
            events.push({ type: 'defused', bot });
          }
        } else {
          bot.defusing = 0;
        }
        return;
      }
      // Azure bots guard the planted spike from mid-range holds.
      if (bot.state !== 'hold') {
        bot.state = 'hold';
        bot.holdUntil = world.time + range(random, 6, 12);
        bot.holdYaw = bot.yaw + range(random, -1, 1);
      }
    } else if (bot.team === 'azure' && bot.carrying) {
      const site = map.sites.find((s) => s.id === bot.targetSite) || map.sites[0];
      bot.state = 'plant';
      if (moveToward(bot, dt, site.x, site.z, BOT_SPEED)) {
        bot.planting += dt;
        events.push({ type: 'plant-progress', bot, progress: bot.planting / 3.5 });
        if (bot.planting >= 3.5) {
          bot.planting = 0;
          bot.carrying = false;
          events.push({ type: 'planted', bot, site });
        }
      } else {
        bot.planting = 0;
      }
      return;
    } else if (bot.team === 'azure' && world.spike.dropped) {
      bot.state = 'retrieve';
      if (moveToward(bot, dt, world.spike.x, world.spike.z, BOT_SPEED)) {
        events.push({ type: 'spike-picked', bot });
        bot.carrying = true;
        bot.state = 'plant';
      }
      return;
    } else if (bot.state === 'route') {
      if (bot.routeIndex < bot.route.length) {
        const node = map.waypoints[bot.route[bot.routeIndex]];
        if (moveToward(bot, dt, node.x, node.z, BOT_SPEED)) bot.routeIndex += 1;
      } else {
        bot.state = 'hold';
        bot.holdUntil = world.time + range(random, 2.5, 6);
        bot.holdYaw = bot.yaw;
        // Attackers who reach a site hold it; defenders hold their node.
        if (bot.team === 'azure' && bot.targetSite) {
          const site = map.sites.find((s) => s.id === bot.targetSite);
          bot.holdYaw = Math.atan2(-(site.x - bot.position.x), -(site.z - bot.position.z));
        }
      }
      return;
    }

    // Hold: scan the lane slowly, then move on.
    if (bot.state === 'hold') {
      bot.yaw += Math.sin(world.time * 0.5 + bot.index) * 0.35 * dt;
      if (world.time >= bot.holdUntil) {
        if (bot.team === 'ember') {
          // Defenders rotate between mid and their site.
          const next = bot.holdNode === 12 || bot.holdNode === 13 ? (random() < 0.5 ? 8 : bot.holdNode) : (bot.targetSite === 'A' ? 12 : bot.targetSite === 'B' ? 13 : 8);
          bot.holdNode = next;
          setRoute(bot, next);
        } else {
          // Attackers push to the other site or re-peek mid.
          bot.targetSite = bot.targetSite === 'A' ? 'B' : 'A';
          setRoute(bot, bot.targetSite === 'A' ? 12 : 13);
        }
      }
    }
  }

  return {
    bots,
    events,
    resetRound,
    damageBot,
    aliveCount(team) {
      let count = 0;
      for (const bot of bots) if (bot.alive && bot.team === team) count += 1;
      return count;
    },
    hitMeshes() {
      const meshes = [];
      for (const bot of bots) {
        if (bot.alive) meshes.push(bot.torso, bot.head);
      }
      return meshes;
    },
    step(dt, world) {
      for (const bot of bots) stepBot(bot, dt, world);
      // Sync the meshes: one write per bot per frame, no new objects.
      for (const bot of bots) {
        if (!bot.alive && bot.fall >= 1) continue;
        bot.group.position.set(bot.position.x, bot.fall < 1 && !bot.alive ? -bot.fall * 0.1 : 0, bot.position.z);
        bot.group.rotation.y = bot.yaw;
        if (bot.alive) {
          const swing = Math.sin(bot.walkPhase) * 0.35;
          bot.legL.rotation.x = swing;
          bot.legR.rotation.x = -swing;
        }
      }
    },
  };
}

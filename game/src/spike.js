// The spike: the objective beyond killing. The player carries it, plants it at
// site A or B by holding E, and it blows 40 seconds later unless an Ember bot
// defuses it. Dropped on death, picked up by walking over it — or by a friendly
// bot, which will carry it to a site and plant it. One mesh, one beeping light.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const PLANT_TIME = 3.5;
export const DEFUSE_TIME = 5;
export const SPIKE_TIMER = 40;

export function createSpike(scene) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.22, 0.5),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.steel), roughness: 0.4, metalness: 0.6 }),
  );
  const light = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 0.06, 0.1),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ember), emissive: new THREE.Color(PALETTE.ember), emissiveIntensity: 2 }),
  );
  light.position.set(0, 0.14, 0.1);
  group.add(body, light);
  group.visible = false;
  scene.add(group);

  const state = {
    carriedBy: 'player', // 'player' | bot object | null (dropped)
    dropped: false,
    planted: false,
    x: 0,
    z: 0,
    site: null,
    timer: SPIKE_TIMER,
    plantProgress: 0,
    defuseProgress: 0,
    beepAt: 0,
  };

  return {
    state,
    group,
    resetRound() {
      state.carriedBy = 'player';
      state.dropped = false;
      state.planted = false;
      state.x = 0;
      state.z = 0;
      state.site = null;
      state.timer = SPIKE_TIMER;
      state.plantProgress = 0;
      state.defuseProgress = 0;
      state.beepAt = 0;
      group.visible = false;
    },
    drop(x, z) {
      state.carriedBy = null;
      state.dropped = true;
      state.x = x;
      state.z = z;
      group.position.set(x, 0.12, z);
      group.visible = true;
    },
    pickUpByPlayer() {
      state.carriedBy = 'player';
      state.dropped = false;
      group.visible = false;
    },
    pickUpByBot(bot) {
      state.carriedBy = bot;
      state.dropped = false;
      bot.carrying = true;
      group.visible = false;
    },
    plant(site) {
      state.planted = true;
      state.dropped = false;
      state.carriedBy = null;
      state.site = site;
      state.timer = SPIKE_TIMER;
      group.position.set(site.x, 0.12, site.z);
      group.visible = true;
    },
    syncMesh(time) {
      if (!state.planted) return;
      // The beeping light pulses faster as the timer runs down.
      const rate = state.timer > 20 ? 1 : state.timer > 10 ? 2 : 4;
      const on = Math.sin(time * Math.PI * rate) > 0;
      light.material.emissiveIntensity = on ? 3 : 0.3;
    },
  };
}

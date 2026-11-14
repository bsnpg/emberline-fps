// The arsenal: four guns and a frag grenade, each with its own damage, headshot
// multiplier, magazine, fire rate, reload and spread. Stopping to aim pays: spread
// grows with movement speed and shrinks while aiming, and every shot kicks the view.
// The view model is built from boxes per weapon; the camera in main.js owns the ray.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  kestrel: {
    id: 'kestrel', name: 'Kestrel-9', kind: 'pistol', price: 0,
    damage: 26, headMult: 3.5, magSize: 12, reserveMax: 48,
    fireGap: 0.16, reloadTime: 1.4, auto: false,
    spreadStill: 0.004, spreadMoving: 0.03, spreadAim: 0.0015,
    recoil: 0.011, kick: 0.035, moveSpeed: 5.6, zoomFov: 74,
  },
  harrier: {
    id: 'harrier', name: 'Harrier AR', kind: 'rifle', price: 2700,
    damage: 33, headMult: 4, magSize: 30, reserveMax: 90,
    fireGap: 0.1, reloadTime: 2.0, auto: true,
    spreadStill: 0.002, spreadMoving: 0.03, spreadAim: 0.0008,
    recoil: 0.013, kick: 0.05, moveSpeed: 5.2, zoomFov: 66,
  },
  wasp: {
    id: 'wasp', name: 'Wasp SMG', kind: 'smg', price: 1500,
    damage: 22, headMult: 3, magSize: 28, reserveMax: 84,
    fireGap: 0.07, reloadTime: 1.7, auto: true,
    spreadStill: 0.006, spreadMoving: 0.035, spreadAim: 0.003,
    recoil: 0.008, kick: 0.032, moveSpeed: 5.5, zoomFov: 70,
  },
  longbow: {
    id: 'longbow', name: 'Longbow DMR', kind: 'dmr', price: 4200,
    damage: 78, headMult: 4, magSize: 8, reserveMax: 24,
    fireGap: 0.9, reloadTime: 2.6, auto: false,
    spreadStill: 0.0008, spreadMoving: 0.022, spreadAim: 0.0003,
    recoil: 0.03, kick: 0.09, moveSpeed: 4.8, zoomFov: 46,
  },
};

export const GRENADE_PRICE = 300;
export const ARMOR_PRICE = 650;

function buildModel(def) {
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.steel), roughness: 0.55, metalness: 0.5 });
  const light = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.concrete), roughness: 0.5, metalness: 0.35 });
  const accent = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.sodium), roughness: 0.5, metalness: 0.2 });
  const group = new THREE.Group();
  const add = (w, h, d, x, y, z, mat) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  };
  if (def.kind === 'pistol') {
    add(0.05, 0.09, 0.2, 0, 0, -0.1, dark);
    add(0.045, 0.1, 0.05, 0, -0.08, 0.02, light);
    add(0.02, 0.02, 0.02, 0, 0.055, -0.19, accent);
  } else if (def.kind === 'dmr') {
    add(0.07, 0.09, 0.55, 0, 0, -0.12, dark);
    add(0.035, 0.035, 0.5, 0, 0.02, -0.55, light);
    add(0.06, 0.05, 0.08, 0, 0.07, -0.1, accent);
    add(0.06, 0.07, 0.2, 0, -0.02, 0.22, light);
    add(0.03, 0.03, 0.1, 0, 0.09, -0.28, dark);
  } else {
    add(0.08, 0.1, 0.44, 0, 0, -0.1, dark);
    add(0.04, 0.04, 0.36, 0, 0.025, -0.42, light);
    add(0.07, 0.08, 0.2, 0, -0.02, 0.24, light);
    add(0.05, 0.09, 0.06, 0, -0.09, -0.08, dark);
    if (def.kind === 'rifle') add(0.02, 0.02, 0.3, 0, 0.06, -0.2, accent);
    else add(0.09, 0.03, 0.12, 0, 0.06, -0.05, accent);
  }
  group.position.set(0.24, -0.2, -0.42);
  return group;
}

export function createWeapons(camera) {
  const models = {};
  for (const def of Object.values(WEAPONS)) {
    const model = buildModel(def);
    model.visible = false;
    camera.add(model);
    models[def.id] = model;
  }
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.26, 0.26),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.sodium), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.17, -0.95);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.sodium), 0, 6);
  flashLight.position.set(0.24, -0.15, -0.6);
  camera.add(flashLight);

  const state = {
    current: 'kestrel',
    ammo: {},
    grenades: 0,
    armor: 0,
    cooldown: 0,
    reloadLeft: 0,
    flash: 0,
    kick: 0,
    aimBlend: 0,
  };
  for (const def of Object.values(WEAPONS)) {
    state.ammo[def.id] = { mag: def.magSize, reserve: def.reserveMax };
  }

  function def() {
    return WEAPONS[state.current];
  }

  function step(dt, aiming) {
    const d = def();
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    state.aimBlend += ((aiming ? 1 : 0) - state.aimBlend) * Math.min(1, dt * 10);
    const model = models[state.current];
    model.position.z = -0.42 + state.kick + state.aimBlend * 0.1;
    model.position.x = 0.24 - state.aimBlend * 0.24;
    model.position.y = -0.2 + state.aimBlend * 0.045;
    model.rotation.x = state.kick * 2.2;
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 16 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      model.rotation.x = -0.55 * Math.sin(Math.PI * Math.min(1, (d.reloadTime - state.reloadLeft) / d.reloadTime));
      if (state.reloadLeft === 0) {
        const slot = state.ammo[state.current];
        const take = Math.min(d.magSize - slot.mag, slot.reserve);
        slot.mag += take;
        slot.reserve -= take;
      }
    }
  }

  return {
    state,
    defs: WEAPONS,
    def,
    step,
    currentDef() {
      return def();
    },
    ready() {
      const slot = state.ammo[state.current];
      return slot.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      const d = def();
      state.cooldown = d.fireGap;
      state.flash = 0.06;
      state.kick = d.kick;
    },
    takeRound() {
      const slot = state.ammo[state.current];
      if (slot.mag <= 0) return false;
      slot.mag -= 1;
      return true;
    },
    reload() {
      const d = def();
      const slot = state.ammo[state.current];
      if (state.reloadLeft > 0 || slot.mag === d.magSize || slot.reserve === 0) return false;
      state.reloadLeft = d.reloadTime;
      return true;
    },
    spread(speed, aiming) {
      const d = def();
      const moving = Math.min(1, speed / 5.2);
      const base = aiming ? d.spreadAim : d.spreadStill;
      return base + moving * d.spreadMoving;
    },
    equip(id) {
      if (!WEAPONS[id] || state.current === id) return false;
      models[state.current].visible = false;
      state.current = id;
      models[id].visible = true;
      state.reloadLeft = 0;
      state.cooldown = Math.max(state.cooldown, 0.25);
      return true;
    },
    give(id) {
      const d = WEAPONS[id];
      state.ammo[id] = { mag: d.magSize, reserve: d.reserveMax };
      this.equip(id);
    },
    refillRound() {
      // Between rounds every owned gun is topped up to a fresh magazine; reserves
      // stay as bought, so running dry still matters across the match.
      for (const d of Object.values(WEAPONS)) {
        const slot = state.ammo[d.id];
        const need = d.magSize - slot.mag;
        const take = Math.min(need, slot.reserve);
        slot.mag += take;
        slot.reserve -= take;
      }
    },
    resetMatch() {
      for (const d of Object.values(WEAPONS)) {
        state.ammo[d.id] = { mag: d.magSize, reserve: d.reserveMax };
      }
      state.grenades = 0;
      state.armor = 0;
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
      models.kestrel.visible = true;
      for (const id of Object.keys(models)) if (id !== 'kestrel') models[id].visible = false;
      state.current = 'kestrel';
    },
  };
}

// Dustline Yard: an original container yard at dusk. Two bomb sites (A Foundry west,
// B Depot east), three lanes from the Azure spawn in the south to the Ember spawn in
// the north, stacked containers for long sightlines and crates for close corners.
// Every box is a collider and a bullet stopper. Bots walk a waypoint graph laid over
// the lanes, so they take real routes instead of beelining through walls.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

// [width, height, depth, x, y, z, palette colour] — y is the box centre.
const BOXES = [
  // Floor and perimeter.
  [46.4, 0.4, 38.4, 0, -0.2, 0, 'asphalt'],
  [0.6, 5.0, 38.4, -23.1, 2.5, 0, 'concrete'],
  [0.6, 5.0, 38.4, 23.1, 2.5, 0, 'concrete'],
  [46.4, 5.0, 0.6, 0, 2.5, -19.1, 'concrete'],
  [46.4, 5.0, 0.6, 0, 2.5, 19.1, 'concrete'],
  // Site A Foundry: west block, a low hall of containers around the plant pad.
  [6.0, 2.6, 2.6, -16.0, 1.3, -12.0, 'teal'],
  [6.0, 2.6, 2.6, -16.0, 3.9, -12.0, 'rust'],
  [2.6, 2.6, 6.0, -19.5, 1.3, -7.0, 'ochre'],
  [2.6, 2.6, 6.0, -12.5, 1.3, -7.0, 'steel'],
  [1.2, 1.2, 1.2, -14.2, 0.6, -4.6, 'hazard'],
  [1.2, 1.2, 1.2, -17.8, 0.6, -4.6, 'hazard'],
  [3.2, 1.1, 1.2, -16.0, 0.55, -10.5, 'concrete'],
  // Site B Depot: east block, mirrored in spirit, different in shape.
  [6.0, 2.6, 2.6, 16.0, 1.3, -12.0, 'rust'],
  [2.6, 2.6, 6.0, 19.5, 1.3, -7.0, 'teal'],
  [2.6, 2.6, 6.0, 12.5, 1.3, -7.0, 'ochre'],
  [6.0, 2.6, 2.6, 16.0, 3.9, -12.0, 'steel'],
  [1.2, 1.2, 1.2, 14.2, 0.6, -4.6, 'hazard'],
  [1.2, 1.2, 1.2, 17.8, 0.6, -4.6, 'hazard'],
  [1.2, 1.1, 3.2, 16.0, 0.55, -9.2, 'concrete'],
  // Mid: the crossroads stack — the map's longest sightline runs past it.
  [6.0, 2.6, 2.6, -1.5, 1.3, -1.0, 'teal'],
  [6.0, 2.6, 2.6, -1.5, 3.9, -1.0, 'ochre'],
  [2.6, 2.6, 2.6, 4.5, 1.3, 1.5, 'rust'],
  [1.2, 1.2, 1.2, 3.2, 0.6, -3.4, 'hazard'],
  [1.2, 1.2, 1.2, -5.4, 0.6, 3.2, 'hazard'],
  // West lane cover and east lane cover.
  [2.6, 2.6, 6.0, -10.5, 1.3, 3.0, 'steel'],
  [1.2, 1.1, 1.2, -13.5, 0.55, 6.5, 'concrete'],
  [1.2, 1.1, 1.2, -7.5, 0.55, 8.0, 'concrete'],
  [2.6, 2.6, 6.0, 10.5, 1.3, 3.0, 'steel'],
  [1.2, 1.1, 1.2, 13.5, 0.55, 6.5, 'concrete'],
  [1.2, 1.1, 1.2, 7.5, 0.55, 8.0, 'concrete'],
  // South spawn cover: low walls the attackers leave through.
  [3.6, 1.1, 1.2, -6.0, 0.55, 13.5, 'concrete'],
  [3.6, 1.1, 1.2, 6.0, 0.55, 13.5, 'concrete'],
  [1.2, 1.1, 1.2, 0, 0.55, 12.0, 'hazard'],
  // North spawn cover for the defenders.
  [3.6, 1.1, 1.2, -6.0, 0.55, -15.5, 'concrete'],
  [3.6, 1.1, 1.2, 6.0, 0.55, -15.5, 'concrete'],
  // Barrels: cylinders, approximated by their bounding box for collision.
  [0.9, 1.1, 0.9, -9.0, 0.55, -9.5, 'rust'],
  [0.9, 1.1, 0.9, 9.0, 0.55, -9.5, 'teal'],
  [0.9, 1.1, 0.9, -2.0, 0.55, 9.0, 'ochre'],
  [0.9, 1.1, 0.9, 2.0, 0.55, 9.0, 'rust'],
];

// Waypoint graph over the lanes. Each entry: [x, z, ...linked indices].
const WAYPOINTS = [
  [0, 16, 1, 2, 3], // 0 azure spawn
  [-8, 12, 0, 4, 5], // 1 west approach
  [0, 11, 0, 5, 6], // 2 mid approach
  [8, 12, 0, 5, 6], // 3 east approach
  [-13, 8, 1, 7, 8], // 4 west lane
  [0, 7, 1, 2, 3, 7, 8, 9], // 5 mid crossroads
  [13, 8, 3, 8, 9], // 6 east lane
  [-13, 0, 4, 5, 10], // 7 west mid
  [0, 1, 5, 7, 9, 10, 11], // 8 centre
  [13, 0, 5, 6, 11], // 9 east mid
  [-16, -6, 7, 8, 12], // 10 site A approach
  [16, -6, 8, 9, 13], // 11 site B approach
  [-16, -9, 10, 14], // 12 site A pad
  [16, -9, 11, 14], // 13 site B pad
  [0, -13, 12, 13, 15], // 14 north connector
  [0, -16, 14], // 15 ember spawn
];

function letterTexture(letter, colour) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#14181f';
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = colour;
  ctx.lineWidth = 6;
  ctx.strokeRect(8, 8, 112, 112);
  ctx.fillStyle = colour;
  ctx.font = 'bold 84px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(letter, 64, 70);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createMap(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'asphalt' ? 0.96 : name === 'steel' ? 0.55 : 0.85,
      metalness: name === 'steel' ? 0.45 : 0.05,
    });
  }
  const colliders = [];
  const shootables = [];
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  for (const [w, h, d, x, y, z, colour] of BOXES) {
    const mesh = new THREE.Mesh(boxGeometry, materials[colour]);
    mesh.scale.set(w, h, d);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
  }

  // Site pads: glowing floor strips and a letter board over each site.
  const sites = [
    { id: 'A', name: 'Foundry', x: -16, z: -8, half: 4.2 },
    { id: 'B', name: 'Depot', x: 16, z: -8, half: 4.2 },
  ];
  const padMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.sodium), transparent: true, opacity: 0.22 });
  for (const site of sites) {
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(site.half * 2, site.half * 2), padMaterial);
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(site.x, 0.02, site.z);
    group.add(pad);
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(2.2, 2.2),
      new THREE.MeshBasicMaterial({ map: letterTexture(site.id, PALETTE.sodium), transparent: true }),
    );
    sign.position.set(site.x, 3.4, -18.6);
    group.add(sign);
    const lamp = new THREE.PointLight(new THREE.Color(PALETTE.sodium), 26, 22, 1.8);
    lamp.position.set(site.x, 4.4, site.z);
    scene.add(lamp);
  }
  const midLamp = new THREE.PointLight(new THREE.Color(PALETTE.azure), 14, 18, 1.8);
  midLamp.position.set(0, 4.6, 2);
  scene.add(midLamp);

  // Dusk light: low warm sun, cool sky fill, fog to the yard's edge.
  const sky = new THREE.HemisphereLight(new THREE.Color('#5a6f92'), new THREE.Color(PALETTE.asphalt), 1.05);
  scene.add(sky);
  const sun = new THREE.DirectionalLight(new THREE.Color('#ffb066'), 2.6);
  sun.position.set(-18, 12, 14);
  sun.target.position.set(4, 0, -6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -28;
  sun.shadow.camera.right = 28;
  sun.shadow.camera.top = 24;
  sun.shadow.camera.bottom = -24;
  sun.shadow.camera.far = 70;
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);

  const waypoints = WAYPOINTS.map(([x, z, ...links]) => ({ x, z, links }));

  // Segment vs AABB slab test, allocation-free, used for bot line of sight.
  const inv = { x: 0, y: 0, z: 0 };
  function segmentBlocked(ax, ay, az, bx, by, bz) {
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    inv.x = dx === 0 ? 1e9 : 1 / dx;
    inv.y = dy === 0 ? 1e9 : 1 / dy;
    inv.z = dz === 0 ? 1e9 : 1 / dz;
    for (const box of colliders) {
      // Skip the floor slab: it never blocks sight between standing fighters.
      if (box.max.y <= 0.05) continue;
      let t0 = 0;
      let t1 = 1;
      let ok = true;
      const axes = [
        [ax, dx, inv.x, box.min.x, box.max.x],
        [ay, dy, inv.y, box.min.y, box.max.y],
        [az, dz, inv.z, box.min.z, box.max.z],
      ];
      for (const [o, d, iv, mn, mx] of axes) {
        if (d === 0) {
          if (o < mn || o > mx) { ok = false; break; }
          continue;
        }
        let ta = (mn - o) * iv;
        let tb = (mx - o) * iv;
        if (ta > tb) { const tmp = ta; ta = tb; tb = tmp; }
        t0 = Math.max(t0, ta);
        t1 = Math.min(t1, tb);
        if (t0 > t1) { ok = false; break; }
      }
      if (ok) return true;
    }
    return false;
  }

  return {
    colliders,
    shootables,
    sites,
    waypoints,
    azureSpawn: { x: 0, z: 16 },
    emberSpawn: { x: 0, z: -16 },
    bounds: { minX: -22.4, maxX: 22.4, minZ: -18.4, maxZ: 18.4 },
    segmentBlocked,
    siteAt(x, z) {
      for (const site of sites) {
        if (Math.abs(x - site.x) <= site.half && Math.abs(z - site.z) <= site.half) return site;
      }
      return null;
    },
    nearestWaypoint(x, z) {
      let best = 0;
      let bestDistance = Infinity;
      for (let i = 0; i < waypoints.length; i += 1) {
        const dx = waypoints[i].x - x;
        const dz = waypoints[i].z - z;
        const d = dx * dx + dz * dz;
        if (d < bestDistance) { bestDistance = d; best = i; }
      }
      return best;
    },
  };
}

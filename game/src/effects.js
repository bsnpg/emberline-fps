// Transient effects, pooled so the hot loops allocate nothing: tracer lines for
// every shot, impact sparks where bullets land, and the spike explosion. Each pool
// slot is reused; nothing is created per frame.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const TRACERS = 24;
const SPARKS = 10;

export function createEffects(scene) {
  const tracerMaterial = new THREE.LineBasicMaterial({ color: new THREE.Color(PALETTE.sodium), transparent: true, opacity: 0.85 });
  const tracers = [];
  for (let i = 0; i < TRACERS; i += 1) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(geometry, tracerMaterial);
    line.visible = false;
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }
  let tracerIndex = 0;

  const sparkMaterial = new THREE.PointsMaterial({ color: new THREE.Color(PALETTE.sodium), size: 0.14, transparent: true, opacity: 0.95 });
  const sparks = [];
  for (let i = 0; i < SPARKS; i += 1) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0]), 3));
    const points = new THREE.Points(geometry, sparkMaterial);
    points.visible = false;
    points.frustumCulled = false;
    scene.add(points);
    sparks.push({ points, life: 0, velocity: new THREE.Vector3() });
  }
  let sparkIndex = 0;

  const explosionMesh = new THREE.Mesh(
    new THREE.SphereGeometry(1, 20, 14),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.sodium), transparent: true, opacity: 0 }),
  );
  explosionMesh.visible = false;
  scene.add(explosionMesh);
  const explosionLight = new THREE.PointLight(new THREE.Color(PALETTE.sodium), 0, 30, 1.5);
  scene.add(explosionLight);
  let explosionLife = 0;

  return {
    tracer(from, to) {
      const slot = tracers[tracerIndex];
      tracerIndex = (tracerIndex + 1) % TRACERS;
      const positions = slot.line.geometry.attributes.position.array;
      positions[0] = from.x;
      positions[1] = from.y;
      positions[2] = from.z;
      positions[3] = to.x;
      positions[4] = to.y;
      positions[5] = to.z;
      slot.line.geometry.attributes.position.needsUpdate = true;
      slot.line.visible = true;
      slot.life = 0.07;
    },
    spark(at) {
      const slot = sparks[sparkIndex];
      sparkIndex = (sparkIndex + 1) % SPARKS;
      const positions = slot.points.geometry.attributes.position.array;
      positions[0] = at.x;
      positions[1] = at.y;
      positions[2] = at.z;
      slot.points.geometry.attributes.position.needsUpdate = true;
      slot.points.visible = true;
      slot.life = 0.25;
      slot.velocity.set((Math.random() - 0.5) * 2, 1.4, (Math.random() - 0.5) * 2);
    },
    explosion(at) {
      explosionMesh.position.copy(at);
      explosionMesh.visible = true;
      explosionLife = 0.7;
      explosionLight.position.copy(at);
      explosionLight.position.y += 1;
    },
    step(dt) {
      for (const slot of tracers) {
        if (slot.life <= 0) continue;
        slot.life -= dt;
        if (slot.life <= 0) slot.line.visible = false;
      }
      for (const slot of sparks) {
        if (slot.life <= 0) continue;
        slot.life -= dt;
        const positions = slot.points.geometry.attributes.position.array;
        positions[0] += slot.velocity.x * dt;
        positions[1] += slot.velocity.y * dt;
        positions[2] += slot.velocity.z * dt;
        slot.velocity.y -= 6 * dt;
        slot.points.geometry.attributes.position.needsUpdate = true;
        if (slot.life <= 0) slot.points.visible = false;
      }
      if (explosionLife > 0) {
        explosionLife -= dt;
        const t = 1 - explosionLife / 0.7;
        const radius = 1 + t * 9;
        explosionMesh.scale.set(radius, radius, radius);
        explosionMesh.material.opacity = Math.max(0, 0.85 * (1 - t));
        explosionLight.intensity = Math.max(0, 120 * (1 - t));
        if (explosionLife <= 0) {
          explosionMesh.visible = false;
          explosionLight.intensity = 0;
        }
      }
    },
  };
}

import * as THREE from 'three';

/** Efeitos visuais baratos em pools: tracers e partículas de impacto (puramente visuais). */
export class FX {
  constructor(scene) {
    this.scene = scene; this.tracers = []; this.parts = [];
    for (let i = 0; i < 10; i++) {
      const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, 1)]);
      const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0 })); l.frustumCulled = false; l.visible = false; scene.add(l);
      this.tracers.push({ l, life: 0 });
    }
    const geo = new THREE.SphereGeometry(0.045, 4, 3);
    for (let i = 0; i < 48; i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true })); m.visible = false; scene.add(m);
      this.parts.push({ m, life: 0, v: new THREE.Vector3() });
    }
    this._ti = 0; this._pi = 0;
  }
  tracer(a, b) {
    const t = this.tracers[this._ti++ % this.tracers.length], p = t.l.geometry.attributes.position;
    p.setXYZ(0, a.x, a.y, a.z); p.setXYZ(1, b.x, b.y, b.z); p.needsUpdate = true; t.l.visible = true; t.l.material.opacity = 0.9; t.life = 0.07;
  }
  burst(pt, color, n = 6, speed = 3, life = 0.35) {
    for (let i = 0; i < n; i++) {
      const p = this.parts[this._pi++ % this.parts.length];
      p.m.position.set(pt.x, pt.y, pt.z); p.m.material.color.setHex(color); p.m.material.opacity = 1; p.m.visible = true; p.life = life * (0.6 + Math.random() * 0.6);
      p.v.set((Math.random() - 0.5) * speed, Math.random() * speed * 0.7, (Math.random() - 0.5) * speed);
    }
  }
  update(dt) {
    for (const t of this.tracers) if (t.life > 0) { t.life -= dt; t.l.material.opacity = Math.max(0, t.life / 0.07) * 0.9; if (t.life <= 0) t.l.visible = false; }
    for (const p of this.parts) if (p.life > 0) { p.life -= dt; p.v.y -= 9 * dt; p.m.position.addScaledVector(p.v, dt); p.m.material.opacity = Math.max(0, p.life * 3); if (p.life <= 0) p.m.visible = false; }
  }
}

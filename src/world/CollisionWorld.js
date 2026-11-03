/**
 * Mundo de colisão por camadas (GDD 4.3 regra 10 / 9.8): malhas simplificadas, sem raycast em geometria visual.
 * Camadas (flags): move (bloqueia corpos), bullet (bloqueia tiros e linha de visão), camera (bloqueia a câmera).
 * Colisores: caixas alinhadas aos eixos e cilindros verticais. `y` = base.
 */
const EPS = 1e-9;
export const PLAYER_HEIGHT = 1.7;

export class CollisionWorld {
  constructor(bounds = [-50, -50, 50, 50]) {
    this.bounds = bounds;     // [x0, z0, x1, z1]
    this.list = [];
    this.byId = new Map();
  }
  add(c) {
    const col = { enabled: true, move: false, bullet: false, camera: false, y0: 0, y1: 2, ...c };
    if (col.type === 'box') { col.cx = (col.x0 + col.x1) / 2; col.cz = (col.z0 + col.z1) / 2; }
    this.list.push(col); if (col.id) this.byId.set(col.id, col);
    return col;
  }
  addBox(id, cx, cz, w, h, d, y = 0, flags = ['move', 'bullet', 'camera'], extra = {}) {
    const f = Object.fromEntries(flags.map((k) => [k, true]));
    return this.add({ id, type: 'box', x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2, y0: y, y1: y + h, ...f, ...extra });
  }
  addCyl(id, x, z, r, h, y = 0, flags = ['move', 'bullet', 'camera'], extra = {}) {
    const f = Object.fromEntries(flags.map((k) => [k, true]));
    return this.add({ id, type: 'cyl', x, z, r, y0: y, y1: y + h, ...f, ...extra });
  }
  /** Remove definitivamente (guarda em `removed` para `restoreById`, usado ao recarregar saves). */
  removeById(id) {
    const c = this.byId.get(id); if (!c) return false;
    this.list = this.list.filter((x) => x !== c); this.byId.delete(id);
    (this.removed ??= new Map()).set(id, c); return true;
  }
  restoreById(id) {
    const c = this.removed?.get(id); if (!c) return false;
    this.removed.delete(id); this.list.push(c); this.byId.set(id, c); return true;
  }
  setEnabled(id, v) { const c = this.byId.get(id); if (c) c.enabled = v; }

  /** Empurra um corpo circular (x,z,r) para fora dos colisores `move`. Retorna posição corrigida. */
  resolveCircle(x, z, r, { yBottom = 0, yTop = PLAYER_HEIGHT, ignore = null } = {}) {
    let hit = false;
    for (let pass = 0; pass < 3; pass++) {
      let moved = false;
      for (const c of this.list) {
        if (!c.enabled || !c.move || c === ignore) continue;
        if (c.y1 <= yBottom + 0.02 || c.y0 >= yTop) continue;
        if (c.type === 'cyl') {
          const dx = x - c.x, dz = z - c.z, rr = c.r + r, d2 = dx * dx + dz * dz;
          if (d2 < rr * rr) {
            const d = Math.sqrt(d2) || 1e-4; const push = rr - d;
            x += (dx / d) * push; z += (dz / d) * push; moved = hit = true;
          }
        } else {
          const nx = Math.max(c.x0, Math.min(x, c.x1)), nz = Math.max(c.z0, Math.min(z, c.z1));
          let dx = x - nx, dz = z - nz; const d2 = dx * dx + dz * dz;
          if (d2 < r * r) {
            if (d2 > EPS) { const d = Math.sqrt(d2); const push = r - d; x += (dx / d) * push; z += (dz / d) * push; }
            else { // centro dentro da caixa: sai pelo menor eixo
              const l = x - c.x0, rgt = c.x1 - x, t = z - c.z0, b = c.z1 - z; const m = Math.min(l, rgt, t, b);
              if (m === l) x = c.x0 - r; else if (m === rgt) x = c.x1 + r; else if (m === t) z = c.z0 - r; else z = c.z1 + r;
            }
            moved = hit = true;
          }
        }
      }
      if (!moved) break;
    }
    const [bx0, bz0, bx1, bz1] = this.bounds;
    const cx = Math.max(bx0 + r, Math.min(bx1 - r, x)), cz = Math.max(bz0 + r, Math.min(bz1 - r, z));
    if (cx !== x || cz !== z) hit = true;
    return { x: cx, z: cz, hit };
  }

  /** Há obstáculo `move` neste ponto circular? (usado por sensores de IA) */
  blockedAt(x, z, r) {
    const p = this.resolveCircle(x, z, r);
    return Math.abs(p.x - x) > 1e-4 || Math.abs(p.z - z) > 1e-4;
  }

  /**
   * Raycast contra uma camada. `radius` infla os colisores (aproxima um spherecast — câmera).
   * Retorna { t, collider } do primeiro impacto, ou null. `dir` deve estar normalizado.
   */
  raycast(ox, oy, oz, dx, dy, dz, maxT, layer = 'bullet', radius = 0) {
    let best = null;
    for (const c of this.list) {
      if (!c.enabled || !c[layer]) continue;
      const t = c.type === 'box' ? this._rayBox(c, ox, oy, oz, dx, dy, dz, maxT, radius) : this._rayCyl(c, ox, oy, oz, dx, dy, dz, maxT, radius);
      if (t !== null && (best === null || t < best.t)) best = { t, collider: c };
    }
    return best;
  }
  _rayBox(c, ox, oy, oz, dx, dy, dz, maxT, r) {
    let t0 = 0, t1 = maxT;
    const slabs = [[ox, dx, c.x0 - r, c.x1 + r], [oy, dy, c.y0 - r, c.y1 + r], [oz, dz, c.z0 - r, c.z1 + r]];
    for (const [o, d, lo, hi] of slabs) {
      if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) return null; continue; }
      let a = (lo - o) / d, b = (hi - o) / d; if (a > b) [a, b] = [b, a];
      t0 = Math.max(t0, a); t1 = Math.min(t1, b);
      if (t0 > t1) return null;
    }
    return t0;
  }
  _rayCyl(c, ox, oy, oz, dx, dy, dz, maxT, r) {
    const R = c.r + r, lx = ox - c.x, lz = oz - c.z;
    const a = dx * dx + dz * dz;
    let tE, tX;
    if (a < 1e-12) { if (lx * lx + lz * lz > R * R) return null; tE = 0; tX = maxT; }
    else {
      const b = 2 * (lx * dx + lz * dz), cc = lx * lx + lz * lz - R * R;
      const disc = b * b - 4 * a * cc; if (disc < 0) return null;
      const s = Math.sqrt(disc); tE = (-b - s) / (2 * a); tX = (-b + s) / (2 * a);
    }
    tE = Math.max(tE, 0); tX = Math.min(tX, maxT); if (tE > tX) return null;
    // restringe ao intervalo em que y está dentro da altura do cilindro
    const ylo = c.y0 - r, yhi = c.y1 + r;
    if (Math.abs(dy) < 1e-9) { if (oy < ylo || oy > yhi) return null; return tE; }
    let ta = (ylo - oy) / dy, tb = (yhi - oy) / dy; if (ta > tb) [ta, tb] = [tb, ta];
    const lo = Math.max(tE, ta), hi = Math.min(tX, tb);
    return lo <= hi ? lo : null;
  }

  /** Segmento A→B livre na camada? (linha de visão / tiro). */
  segmentBlocked(ax, ay, az, bx, by, bz, layer = 'bullet', radius = 0) {
    const dx = bx - ax, dy = by - ay, dz = bz - az, len = Math.hypot(dx, dy, dz);
    if (len < 1e-6) return false;
    return !!this.raycast(ax, ay, az, dx / len, dy / len, dz / len, len, layer, radius);
  }
  /** Varredura de esfera da câmera: distância segura ao longo do raio (ou `maxT`). */
  sweepCamera(ox, oy, oz, dx, dy, dz, maxT, radius) {
    const h = this.raycast(ox, oy, oz, dx, dy, dz, maxT, 'camera', radius);
    return h ? { t: Math.max(0, h.t), collider: h.collider, hit: true } : { t: maxT, collider: null, hit: false };
  }
  /** Colisores com `fade` entre dois pontos (para oclusão localizada, GDD 4.3 regra 3). */
  occluders(ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dy = by - ay, dz = bz - az, len = Math.hypot(dx, dy, dz) || 1;
    const out = [];
    for (const c of this.list) {
      if (!c.enabled || !c.fade) continue;
      const t = c.type === 'box' ? this._rayBox(c, ax, ay, az, dx / len, dy / len, dz / len, len, 0.05) : this._rayCyl(c, ax, ay, az, dx / len, dy / len, dz / len, len, 0.05);
      if (t !== null) out.push(c);
    }
    return out;
  }
}

/**
 * LOD visual conservador para pequenos objetos decorativos do cenário.
 * Nunca remove colisores, meshes, materiais ou conteúdo do save.
 * Estruturas, portas, painéis e interactables permanecem visíveis.
 */
export const DETAIL_HIDE_AT = 44;
export const DETAIL_SHOW_AT = 36;
const DECORATIVE_VISUALS = new Set(['crate', 'wood', 'metal', 'rock', 'container', 'truck']);

export function isCullableSceneryDetail(structure, data) {
  if (structure?.kind !== 'box' || !structure.size || !DECORATIVE_VISUALS.has(structure.visual)) return false;
  const [w, h, d] = structure.size;
  if (Math.max(w, d) > 5.5 || h > 2.7 || structure.fade || structure.gate || structure.pit) return false;
  // Não ocultar barreiras de tiro/câmera (cobertura), painéis interativos ou itens destrutíveis.
  if (structure.flags?.includes('camera') || structure.flags?.includes('bullet')) return false;
  if (/_deck$|lever_post|_platform$/.test(structure.id)) return false;
  if ((data.interactables ?? []).some(it => (it.colliderId ?? it.id) === structure.id)) return false;
  return true;
}

export function createVisualDetailCuller(data, meshes, { hideAt = DETAIL_HIDE_AT, showAt = DETAIL_SHOW_AT } = {}) {
  if (!(showAt > 0 && hideAt > showAt)) throw new Error('LOD: hideAt deve superar showAt');
  const entries = (data.structures ?? [])
    .filter(s => isCullableSceneryDetail(s, data) && meshes.has(s.id))
    .map(s => ({
      id: s.id, mesh: meshes.get(s.id),
      x: s.pos[0], z: s.pos[1],
      // Mesma regra para posições próximas à borda de detalhes grandes.
      radius: Math.hypot(s.size[0], s.size[2]) / 2,
    }));
  return {
    entries,
    update(pos) {
      if (!pos) return;
      for (const d of entries) {
        const r = Math.hypot(pos.x - d.x, pos.z - d.z);
        if (d.mesh.visible && r > hideAt + d.radius) d.mesh.visible = false;
        else if (!d.mesh.visible && r < showAt + d.radius) d.mesh.visible = true;
      }
    },
    restore() { for (const d of entries) d.mesh.visible = true; },
    get culled() { return entries.reduce((n, d) => n + (!d.mesh.visible ? 1 : 0), 0); },
  };
}

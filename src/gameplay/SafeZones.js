/**
 * Salas de salvamento/compra: a IA não as invade. A física do jogador continua
 * usando CollisionWorld normalmente; só agentes são repelidos.
 */
export function safeRooms(data) {
  return data?.safeRooms ?? [];
}

export function safeRoomAt(data, x, z, margin = 0) {
  return safeRooms(data).find(r => Math.hypot(x - r.center[0], z - r.center[1]) <= r.radius + margin) ?? null;
}

/**
 * Empurra um dinossauro para a borda externa do abrigo, sem atravessar
 * paredes. Testa alternativas com o CollisionWorld em vez de teletransportar
 * para dentro de uma estrutura. Sem randomização para manter o QA reprodutível.
 */
export function keepDinosaurOutside(data, world, x, z, radius = 0.6) {
  let nx = x, nz = z, moved = false;
  for (const room of safeRooms(data)) {
    const dx = nx - room.center[0], dz = nz - room.center[1], d = Math.hypot(dx, dz);
    const limit = room.radius + Math.max(0, radius) + 0.1;
    if (d + 1e-6 >= limit) continue; // tolerância evita correção repetida na borda
    const base = d > 0.001 ? Math.atan2(dz, dx) : 0;
    for (let k = 0; k < 16; k++) {
      const offset = k === 0 ? 0 : Math.ceil(k / 2) * (k % 2 ? 1 : -1) * (Math.PI / 8);
      const angle = base + offset;
      const px = room.center[0] + Math.cos(angle) * limit;
      const pz = room.center[1] + Math.sin(angle) * limit;
      if (world?.blockedAt?.(px, pz, radius)) continue;
      nx = px; nz = pz; moved = true; break;
    }
  }
  return { x: nx, z: nz, moved };
}

export function safeRoomDescription(room) {
  return room ? room.name ?? 'Área segura' : '';
}

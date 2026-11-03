import { describe, it, expect } from 'vitest';
import { getChapter } from '../src/chapters/index.js';
import { safeRooms, safeRoomAt, keepDinosaurOutside } from '../src/gameplay/SafeZones.js';

describe('Salas seguras — save, loja e IA', () => {
  it('todos os cinco terminais protegidos existem e possuem acesso à sala', () => {
    const counts = [3, 2];
    ['ch01', 'ch02'].forEach((id, i) => {
      const data = getChapter(id).data;
      expect(safeRooms(data)).toHaveLength(counts[i]);
      for (const room of safeRooms(data)) {
        const terminal = data.terminals.find(t => t.id === room.terminalId);
        expect(terminal, room.id).toBeTruthy();
        expect(room.radius).toBeGreaterThan(2);
        expect(safeRoomAt(data, terminal.safe[0], terminal.safe[1])?.id).toBe(room.id);
        expect(safeRoomAt(data, room.center[0], room.center[1])?.id).toBe(room.id);
      }
    });
  });
  it('projeta criaturas com raio de colisão fora do perímetro, sem alterar posição de jogador', () => {
    for (const id of ['ch01', 'ch02']) {
      const data = getChapter(id).data;
      const world = { blockedAt: () => false };
      for (const room of safeRooms(data)) {
        const [cx, cz] = room.center, radius = 0.8;
        const out = keepDinosaurOutside(data, world, cx, cz, radius);
        expect(out.moved).toBe(true);
        expect(Math.hypot(out.x - cx, out.z - cz)).toBeGreaterThan(room.radius + radius);
        expect(safeRoomAt(data, out.x, out.z, radius)).toBeNull();
        expect(keepDinosaurOutside(data, world, out.x, out.z, radius).moved).toBe(false);
      }
    }
  });
  it('não atravessa obstáculo quando primeiro ângulo de saída está bloqueado', () => {
    const data = getChapter('ch01').data;
    const room = data.safeRooms[0];
    const blocked = (x, z) => x > room.center[0] + room.radius + 0.5 && Math.abs(z - room.center[1]) < 0.1;
    const result = keepDinosaurOutside(data, { blockedAt: blocked }, ...room.center, 0.7);
    expect(result.moved).toBe(true);
    expect(blocked(result.x, result.z)).toBe(false);
    expect(safeRoomAt(data, result.x, result.z, 0.7)).toBeNull();
  });
});

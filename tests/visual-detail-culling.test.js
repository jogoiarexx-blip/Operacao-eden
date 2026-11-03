import { describe, it, expect } from 'vitest';
import { getChapter } from '../src/chapters/index.js';
import { createVisualDetailCuller, isCullableSceneryDetail } from '../src/world/VisualDetailCulling.js';
import { zoneAtPoint } from '../src/world/ShoulderCameraController.js';

describe('LOD visual (sem mexer em colisões ou saves)', () => {
  it('seleciona apenas pequenos detalhes, jamais portas, cobertura ou interativos', () => {
    for (const id of ['ch01', 'ch02']) {
      const data = getChapter(id).data;
      const selected = data.structures.filter((s) => isCullableSceneryDetail(s, data));
      expect(selected.length).toBeGreaterThan(0);
      const names = new Set(selected.map(s => s.id));
      for (const important of ['archive_door_leaf', 'yard_gate_leaf', 'exit_gate', 'generator', 'radio_console', 'cover_a', 'shed_roof', 'gate_leaf', 'crates_shed']) {
        expect(names.has(important), `${id}: ${important} não deve desaparecer`).toBe(false);
      }
    }
  });

  it('oculta longe, restaura perto e mantém uma margem de histerese', () => {
    const mesh = { visible: true };
    const data = { structures: [{ id: 'desk', kind: 'box', visual: 'wood', size: [1, 1, 1], flags: ['move'], pos: [0, 0] }], interactables: [] };
    const c = createVisualDetailCuller(data, new Map([['desk', mesh]]));
    c.update({ x: 46, z: 0 });
    expect(mesh.visible).toBe(false);
    expect(c.culled).toBe(1);
    c.update({ x: 40, z: 0 }); // entre show e hide: preserva o estado anterior
    expect(mesh.visible).toBe(false);
    c.update({ x: 30, z: 0 });
    expect(mesh.visible).toBe(true);
    c.update({ x: 40, z: 0 });
    expect(mesh.visible).toBe(true);
    c.restore();
    expect(mesh.visible).toBe(true);
    expect(() => createVisualDetailCuller(data, new Map(), { showAt: 40, hideAt: 30 })).toThrow();
  });

  it('não altera as definições do cenário e não cria/inativa colisores', () => {
    const d = getChapter('ch02').data, json = JSON.stringify(d);
    const meshes = new Map(d.structures.map((s) => [s.id, { visible: true }]));
    const c = createVisualDetailCuller(d, meshes);
    c.update({ x: 1000, z: 1000 });
    expect(c.culled).toBe(c.entries.length);
    expect(JSON.stringify(d)).toBe(json);
    expect(meshes.get('yard_gate_leaf').visible).toBe(true);
    expect(meshes.get('radio_console').visible).toBe(true);
    expect(meshes.get('crates_shed').visible).toBe(true);
  });
});

describe('Câmera sobre o ombro em portais (sem mudança de controle)', () => {
  it.each([
    [11.3, 27, 'cz_portal_breach'],
    [16, 12, 'cz_portal_shed'],
    [-12.5, 11.2, 'cz_portal_admin'],
    [0, -4, 'cz_portal_yard'],
    [11, -30, 'cz_portal_archive'],
    [22, -28, 'cz_portal_exit'],
  ])('entra na zona curta correta em %s, %s', (x, z, id) => {
    const d = getChapter('ch02').data;
    const zone = zoneAtPoint(d.cameraZones, d.zones, x, z);
    expect(zone?.id).toBe(id);
    expect(zone.exploreDistance).toBeLessThan(2.1);
    expect(zone.aimDistance).toBeGreaterThanOrEqual(1.4);
  });
});

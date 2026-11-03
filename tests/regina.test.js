import { describe, expect, it } from 'vitest';
import { stateForRegina } from '../src/actors/ReginaRig.js';

const player = (overrides = {}) => ({
  dead: false, dodging: false, hurtT: 0, using: null, reloading: false,
  aiming: false, simShooting: false, sprinting: false, speed: 0,
  ...overrides,
});

describe('Regina — controlador de estados (sem alterar gameplay)', () => {
  it('seleciona idle, walk e run pela velocidade e corrida', () => {
    expect(stateForRegina(player(), 0)).toBe('idle');
    expect(stateForRegina(player({ speed: 2 }), 0)).toBe('walk');
    expect(stateForRegina(player({ speed: 5, sprinting: true }), 0)).toBe('run');
  });
  it('seleciona aim, aimWalk e shoot sem misturar as prioridades', () => {
    expect(stateForRegina(player({ aiming: true }), 0)).toBe('aim');
    expect(stateForRegina(player({ aiming: true, speed: 2 }), 0)).toBe('aimWalk');
    expect(stateForRegina(player({ aiming: true }), 0.08)).toBe('shoot');
  });
  it('recarga, uso de item, esquiva e dano interrompem ações inferiores', () => {
    expect(stateForRegina(player({ reloading: true, aiming: true }), 0)).toBe('reload');
    expect(stateForRegina(player({ using: { kind:'medkit' } }), 0)).toBe('use');
    expect(stateForRegina(player({ dodging: true, hurtT: 0.2 }), 0)).toBe('dodge');
    expect(stateForRegina(player({ hurtT: 0.2, reloading: true }), 0)).toBe('hurt');
  });
  it('morte sempre prevalece', () => {
    expect(stateForRegina(player({ dead:true, dodging:true, hurtT:1 }), 1)).toBe('death');
  });
});

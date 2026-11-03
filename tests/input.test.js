import { describe, it, expect } from 'vitest';
import { selectGamepad, padHasInput } from '../src/input/Input.js';

const pad = (o = {}) => ({ connected: true, mapping: 'standard', index: 0, buttons: Array.from({ length: 17 }, () => ({ pressed: false })), axes: [0, 0, 0, 0], ...o });
describe('seleção de gamepad', () => {
  it('ignora pads sem mapeamento standard e desconectados', () => {
    expect(selectGamepad([pad({ mapping: '' }), null, pad({ connected: false })])).toBe(null);
    const ok = pad({ index: 2 });
    expect(selectGamepad([pad({ mapping: '' }), ok])).toBe(ok);
    expect(selectGamepad(undefined)).toBe(null);
  });
  it('só conta como entrada deliberada botão pressionado ou eixo além da zona morta', () => {
    expect(padHasInput(pad())).toBe(false);
    expect(padHasInput(pad({ axes: [0.1, -0.05, 0, 0] }), 0.15)).toBe(false);
    expect(padHasInput(pad({ axes: [0, 0, 0.6, 0] }), 0.15)).toBe(true);
    const b = pad(); b.buttons[7] = { pressed: true };
    expect(padHasInput(b)).toBe(true);
  });
});

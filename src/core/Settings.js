/** Configurações do jogador (não pertencem ao save narrativo). Persistidas em localStorage com try/catch. */
export const DEFAULT_BINDINGS = {
  forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD', run: 'ShiftLeft', aim: 'Mouse2', fire: 'Mouse0',
  dodge: 'Space', reload: 'KeyR', interact: 'KeyF', swap: 'KeyV', utility: 'KeyQ', turn180: 'KeyE',
  map: 'KeyM', inventory: 'KeyI', medkit: 'Digit1', hemo: 'Digit2', pause: 'Escape',
};
export const ACTION_LABELS = {
  forward: 'Andar para frente', back: 'Andar para trás', left: 'Andar à esquerda', right: 'Andar à direita', run: 'Corrida',
  aim: 'Mirar', fire: 'Atirar', dodge: 'Esquivar', reload: 'Recarregar', interact: 'Interagir', swap: 'Trocar ombro',
  utility: 'Ferramenta elétrica', turn180: 'Meia-volta', map: 'Mapa', inventory: 'Diário/Inventário', medkit: 'Usar kit médico', hemo: 'Usar hemostático', pause: 'Pausa',
};
export const DEFAULTS = {
  version: 1, sensX: 1, sensY: 1, invertY: false, fovOffset: 0, shoulder: 'right',
  reduceShake: false, reduceFlash: false, quality: 'medium', volMaster: 0.8, volSfx: 1, volAmbient: 0.7,
  subtitleSize: 'normal', hideComboHud: false, hideStyleFeed: false, assist: 'auto', highContrastThreat: false,
  deadzone: 0.15, bindings: { ...DEFAULT_BINDINGS },
};
export const QUALITY = {
  low: { label: 'Baixo', dpr: 1.0, shadows: false, shadowMap: 0, foliage: 0.45, rain: false, flashlight: false, fogFar: 62, far: 120 },
  medium: { label: 'Médio', dpr: 1.5, shadows: true, shadowMap: 1024, foliage: 0.8, rain: true, flashlight: true, fogFar: 78, far: 150 },
  high: { label: 'Alto', dpr: 2.0, shadows: true, shadowMap: 2048, foliage: 1.0, rain: true, flashlight: true, fogFar: 92, far: 180 },
};
const KEY = 'eden.settings.v1';
export function loadSettings(storage = globalThis.localStorage) {
  try { const raw = storage?.getItem(KEY); if (raw) { const o = JSON.parse(raw); return { ...DEFAULTS, ...o, bindings: { ...DEFAULT_BINDINGS, ...(o.bindings ?? {}) } }; } } catch { /* sem storage */ }
  return structuredClone(DEFAULTS);
}
export function saveSettings(s, storage = globalThis.localStorage) { try { storage?.setItem(KEY, JSON.stringify(s)); } catch { /* ignora */ } }
export const keyLabel = (code) => ({ Mouse0: 'Botão esq.', Mouse1: 'Botão meio', Mouse2: 'Botão dir.', Space: 'Espaço', ShiftLeft: 'Shift', Escape: 'Esc' }[code] ?? code.replace(/^Key/, '').replace(/^Digit/, ''));

/**
 * Apresentações breves de ambientes: não mudam o estado de jogo, não congelam
 * combate/IA e não alteram saves. Só aparecem uma vez por entrada de runtime.
 */
export const AREA_REVEAL_GAP_MS = 1800;
export const AREA_REVEAL_DURATION_MS = 2600;

export function getAreaBeat(data, trigger, storyFlags = {}) {
  const beat = data.areaTransitions?.find((item) => item.trigger === trigger);
  return beat && (!beat.requires || storyFlags[beat.requires]) ? beat : null;
}

export function revealArea(rt, trigger) {
  const g = rt.g;
  if (!g?.sm?.is('PLAYING') || !g.uiRoot || g.mapOpen) return false;
  const beat = getAreaBeat(rt.data, trigger, g.save?.storyFlags);
  if (!beat) return false;
  const seen = (rt.areaBeatsShown ??= new Set());
  if (seen.has(beat.id) || g.simMs < (rt.areaBeatUntil ?? -1)) return false;

  const layer = document.createElement('div');
  layer.className = 'area-reveal' + (beat.tone === 'danger' ? ' danger' : '');
  layer.dataset.areaBeat = beat.id;
  const tag = document.createElement('small');
  tag.textContent = beat.tag ?? 'LOCALIZAÇÃO';
  const title = document.createElement('strong');
  title.textContent = beat.title;
  const sub = document.createElement('span');
  sub.textContent = beat.subtitle ?? '';
  layer.append(tag, title, sub);
  g.uiRoot.querySelector('.area-reveal')?.remove();
  g.uiRoot.append(layer);

  seen.add(beat.id);
  rt.areaBeatUntil = g.simMs + AREA_REVEAL_GAP_MS;
  if (beat.sound) g.audio?.play(beat.sound);
  setTimeout(() => layer.remove(), AREA_REVEAL_DURATION_MS);
  return true;
}

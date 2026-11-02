/** Multi-touch: movimento à esquerda, câmera no cenário e ações à direita. */
export class TouchControls {
  constructor(input, root) {
    this.input = input;
    this.root = document.createElement('div'); this.root.id = 'touch-controls';
    this.root.setAttribute('aria-label', 'Controles de toque');
    const stick = document.createElement('div'); stick.className = 'touch-stick';
    stick.setAttribute('aria-label', 'Arraste para mover');
    const knob = document.createElement('i'); stick.append(knob); this.root.append(stick);
    const releases = [];
    let moveId = null, lookId = null, origin = null, last = null;
    const reset = () => { moveId = lookId = null; input.touchMove.x = input.touchMove.y = 0; knob.style.transform = ''; for (const release of releases) release(); };
    input.onReset = reset;
    const move = (e) => {
      const dx = e.clientX - origin.x, dy = e.clientY - origin.y;
      const r = Math.min(stick.clientWidth * 0.36, 48), d = Math.max(r, Math.hypot(dx, dy));
      input.touchMove.x = dx / d; input.touchMove.y = -dy / d;
      knob.style.transform = `translate(${dx / d * r}px, ${dy / d * r}px)`;
    };
    stick.addEventListener('pointerdown', (e) => {
      if (!input.enabled || moveId != null) return;
      e.preventDefault(); moveId = e.pointerId; input.touchActive = true; input.lastDevice = 'touch';
      const b = stick.getBoundingClientRect(); origin = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
      stick.setPointerCapture(e.pointerId); move(e);
    });
    stick.addEventListener('pointermove', (e) => { if (e.pointerId === moveId) move(e); });
    const stopMove = (e) => { if (e.pointerId === moveId) { moveId = null; input.touchMove.x = input.touchMove.y = 0; knob.style.transform = ''; } };
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) stick.addEventListener(type, stopMove);
    const actions = document.createElement('div'); actions.className = 'touch-actions';
    const toolbar = document.createElement('div'); toolbar.className = 'touch-toolbar';
    for (const [action, label, bar] of [
      ['fire', 'Atirar'], ['aim', 'Mirar'], ['interact', 'Interagir'], ['reload', 'Recarregar'],
      ['dodge', 'Esquivar'], ['run', 'Correr'], ['utility', 'Elétrica'],
      ['map', 'Mapa', true], ['inventory', 'Diário', true], ['medkit', 'Cura', true],
      ['hemo', 'Estancar', true], ['swap', 'Ombro', true], ['pause', 'Pausa', true],
    ]) {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
      button.dataset.action = action; button.setAttribute('aria-label', label);
      let pointer = null; releases.push(() => { pointer = null; });
      button.addEventListener('pointerdown', (e) => {
        if (!input.enabled || pointer != null) return;
        e.preventDefault(); pointer = e.pointerId; button.setPointerCapture(e.pointerId); input.touchAction(action, true);
      });
      const release = (e) => { if (e.pointerId === pointer) { pointer = null; input.touchAction(action, false); } };
      for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(type, release);
      (bar ? toolbar : actions).append(button);
    }
    this.root.append(actions, toolbar); root.append(this.root);
    input.el.addEventListener('pointerdown', (e) => {
      if (!input.enabled || e.pointerType !== 'touch' || lookId != null) return;
      e.preventDefault(); lookId = e.pointerId; last = { x: e.clientX, y: e.clientY };
      input.touchActive = true; input.lastDevice = 'touch'; input.el.setPointerCapture(e.pointerId);
    });
    input.el.addEventListener('pointermove', (e) => {
      if (e.pointerId !== lookId || !input.enabled) return;
      input.look.x += (e.clientX - last.x) * 1.5; input.look.y += (e.clientY - last.y) * 1.5;
      last = { x: e.clientX, y: e.clientY };
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) input.el.addEventListener(type, (e) => { if (e.pointerId === lookId) lookId = null; });
  }
}

/** Mapa de setor em canvas 2D: layout, objetivo atual, área SUSPEITA aproximada (nunca o ponto exato do segredo). */
export function drawMap(canvas, { data, playerPos, playerYaw, objectiveTarget, suspicious, visited, terminals, gateOpen }) {
  const [x0, z0, x1, z1] = data.bounds, W = x1 - x0, H = z1 - z0;
  const maxH = Math.min(innerHeight * 0.78, 760), scale = Math.min((innerWidth * 0.86) / W, maxH / H);
  canvas.width = Math.round(W * scale); canvas.height = Math.round(H * scale);
  const c = canvas.getContext('2d'), tx = (x) => (x - x0) * scale, tz = (z) => (z - z0) * scale;
  c.fillStyle = '#071311'; c.fillRect(0, 0, canvas.width, canvas.height);
  c.strokeStyle = 'rgba(87,230,224,.12)'; c.lineWidth = 1;
  for (let x = Math.ceil(x0 / 10) * 10; x < x1; x += 10) { c.beginPath(); c.moveTo(tx(x), 0); c.lineTo(tx(x), canvas.height); c.stroke(); }
  for (let z = Math.ceil(z0 / 10) * 10; z < z1; z += 10) { c.beginPath(); c.moveTo(0, tz(z)); c.lineTo(canvas.width, tz(z)); c.stroke(); }
  // água ao sul
  c.fillStyle = '#0d2a35'; c.fillRect(0, tz(41), canvas.width, canvas.height - tz(41));
  // trilhas
  c.lineCap = 'round'; c.lineJoin = 'round';
  for (const p of data.paths) { c.strokeStyle = 'rgba(160,130,90,.55)'; c.lineWidth = Math.max(2, p.w * scale * 0.7); c.beginPath(); p.pts.forEach(([x, z], i) => (i ? c.lineTo(tx(x), tz(z)) : c.moveTo(tx(x), tz(z)))); c.stroke(); }
  // estruturas
  for (const s of data.structures) {
    if (s.visual === 'wood' && s.id.startsWith('pier_rail')) continue;
    if (s.kind === 'box') {
      if (s.visual === 'ravine') c.fillStyle = '#020405';
      else if (s.visual === 'rock') c.fillStyle = '#4b4f4a';
      else if (s.id === 'gate_leaf') c.fillStyle = gateOpen ? 'rgba(82,224,138,.5)' : '#c9a227';
      else if (s.visual === 'terminal') { continue; }
      else c.fillStyle = 'rgba(140,150,140,.7)';
      c.fillRect(tx(s.pos[0] - s.size[0] / 2), tz(s.pos[1] - s.size[2] / 2), s.size[0] * scale, s.size[2] * scale);
    } else { c.fillStyle = 'rgba(90,110,100,.8)'; c.beginPath(); c.arc(tx(s.pos[0]), tz(s.pos[1]), Math.max(2, s.r * scale), 0, 7); c.fill(); }
  }
  // ponte
  c.fillStyle = '#7a5c3a'; c.fillRect(tx(7), tz(-12), 2 * scale, 6 * scale);
  // terminais
  for (const t of terminals) { c.fillStyle = '#57e6e0'; c.fillRect(tx(t.pos[0]) - 4, tz(t.pos[1]) - 4, 8, 8); }
  // área suspeita
  for (const s of suspicious) { c.strokeStyle = 'rgba(255,179,71,.85)'; c.setLineDash([6, 5]); c.lineWidth = 2; c.beginPath(); c.arc(tx(s.x), tz(s.z), s.r * scale, 0, 7); c.stroke(); c.setLineDash([]); c.fillStyle = 'rgba(255,179,71,.9)'; c.font = `${Math.max(14, scale * 2.4)}px sans-serif`; c.textAlign = 'center'; c.fillText('?', tx(s.x), tz(s.z) + 5); }
  // objetivo
  if (objectiveTarget) { const x = tx(objectiveTarget.x), z = tz(objectiveTarget.z); c.fillStyle = '#ffb347'; c.beginPath(); c.moveTo(x, z - 9); c.lineTo(x + 8, z); c.lineTo(x, z + 9); c.lineTo(x - 8, z); c.closePath(); c.fill(); }
  // jogador
  const px = tx(playerPos.x), pz = tz(playerPos.z);
  c.save(); c.translate(px, pz); c.rotate(-playerYaw); c.fillStyle = '#52e08a'; c.beginPath(); c.moveTo(0, -10); c.lineTo(7, 8); c.lineTo(0, 4); c.lineTo(-7, 8); c.closePath(); c.fill(); c.restore();
  c.fillStyle = 'rgba(215,231,228,.7)'; c.font = '12px sans-serif'; c.textAlign = 'left'; c.fillText('N ↑', 8, 16);
}

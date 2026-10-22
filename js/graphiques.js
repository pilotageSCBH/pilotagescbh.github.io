// Petits graphiques en SVG, sans bibliothèque : barres (simples ou empilées), anneau, courbe.
// Barres fines à bout arrondi, grille discrète, info-bulle au survol, légende dès deux séries ; texte jamais en couleur de série.
import { h } from './ui.js';

const NS = 'http://www.w3.org/2000/svg';
function s(tag, attrs = {}, ...enfants) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined && v !== false) el.setAttribute(k, v);
  for (const e of enfants.flat(Infinity)) if (e !== null && e !== undefined && e !== false) el.append(e instanceof Node ? e : document.createTextNode(String(e)));
  return el;
}
export const nb = (n, d = 1) => (n === null || n === undefined || Number.isNaN(n) ? '—' : String(Math.round(n * 10 ** d) / 10 ** d).replace('.', ','));

// ------------------------------------------------------------------------------------------- info-bulle commune
let bulle = null;
function info(el, texte) {
  el.addEventListener('mouseenter', () => {
    if (!bulle) { bulle = h('div', { class: 'bulle-graph' }); document.body.append(bulle); }
    bulle.textContent = typeof texte === 'function' ? texte() : texte;
    bulle.style.display = 'block';
  });
  el.addEventListener('mousemove', (e) => {
    if (!bulle) return;
    const l = Math.min(e.clientX + 14, window.innerWidth - bulle.offsetWidth - 8);
    bulle.style.left = l + 'px'; bulle.style.top = (e.clientY + 14) + 'px';
  });
  el.addEventListener('mouseleave', () => { if (bulle) bulle.style.display = 'none'; });
}

// chemin d'un rectangle arrondi seulement du côté de la donnée (4 px), carré à la base
function barre(x, y, l, ht, sens) {
  const r = Math.min(4, (sens === 'h' ? ht : l) / 2, sens === 'h' ? l : ht);
  if (l <= 0 || ht <= 0) return '';
  if (sens === 'h') return `M${x},${y} H${x + l - r} Q${x + l},${y} ${x + l},${y + r} V${y + ht - r} Q${x + l},${y + ht} ${x + l - r},${y + ht} H${x} Z`;
  return `M${x},${y + ht} V${y + r} Q${x},${y} ${x + r},${y} H${x + l - r} Q${x + l},${y} ${x + l},${y + r} V${y + ht} Z`;
}
// graduations « rondes » entre 0 et max
function graduations(max, n = 4) {
  if (max <= 0) return [0, 1];
  const pas0 = max / n, p = 10 ** Math.floor(Math.log10(pas0));
  const pas = [1, 2, 2.5, 5, 10].map((k) => k * p).find((k) => k >= pas0) || pas0;
  const t = []; for (let v = 0; v <= max + 1e-9; v += pas) t.push(Math.round(v * 1000) / 1000);
  if (t[t.length - 1] < max) t.push(t[t.length - 1] + pas);
  return t;
}

export function legende(series) {
  return h('div', { class: 'legende-graph' }, series.map((x) => h('span', {}, h('i', { style: { background: x.couleur } }), x.nom)));
}
export const carteGraph = (titre, sous, ...contenu) => h('figure', { class: 'carte-graph' },
  h('figcaption', {}, h('b', {}, titre), sous ? h('span', {}, sous) : null), contenu);

// ------------------------------------------------------------------------------------------- barres horizontales
// lignes : [{ label, valeur, couleur, info }] ; opts : { max, format, unite }
export function barresH(lignes, { max = null, format = (v) => nb(v), largeur = 420 } = {}) {
  const hl = 26, ep = 16, gauche = 140, droite = 54;
  const grad = graduations(Math.max(1e-9, ...lignes.map((l) => l.valeur || 0)));
  const echelle = max ?? grad.at(-1);
  const W = largeur, H = lignes.length * hl + 6, L = W - gauche - droite;
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'graph', role: 'img', style: `max-width:${W}px` });
  (max ? graduations(max) : grad).filter((t) => t <= echelle).forEach((t) => { const x = gauche + (t / echelle) * L; svg.append(s('line', { x1: x, x2: x, y1: 0, y2: H - 4, class: 'grille' })); });
  lignes.forEach((l, i) => {
    const y = i * hl + (hl - ep) / 2, lv = Math.max(0, (l.valeur || 0) / echelle) * L;
    const g = s('g', { class: 'marque' },
      s('rect', { x: 0, y: i * hl, width: W, height: hl, fill: 'transparent' }),
      s('text', { x: gauche - 8, y: y + ep / 2 + 4, 'text-anchor': 'end', class: 'etiq' }, l.label.length > 22 ? l.label.slice(0, 21) + '…' : l.label),
      s('line', { x1: gauche, x2: gauche, y1: i * hl, y2: (i + 1) * hl, class: 'axe' }),
      s('path', { d: barre(gauche, y, lv, ep, 'h'), fill: l.couleur || 'var(--g1)' }),
      s('text', { x: gauche + lv + 6, y: y + ep / 2 + 4, class: 'val' }, l.valeur === null || l.valeur === undefined ? '—' : format(l.valeur)));
    info(g, l.info || `${l.label} : ${format(l.valeur)}`);
    svg.append(g);
  });
  return svg;
}

// ------------------------------------------------------------------------------------------- barres empilées horizontales
// lignes : [{ label, valeurs: [..] }] ; series : [{ nom, couleur }] ; pourcent : barres ramenées à 100 %
export function empileH(lignes, series, { pourcent = false, largeur = 440, format = (v) => nb(v, 0) } = {}) {
  const hl = 24, ep = 15, gauche = 140, droite = 40;
  const tot = (l) => l.valeurs.reduce((a, b) => a + (b || 0), 0);
  const M = pourcent ? 1 : Math.max(1e-9, ...lignes.map(tot));
  const W = largeur, H = lignes.length * hl + 6, L = W - gauche - droite;
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'graph', role: 'img', style: `max-width:${W}px` });
  lignes.forEach((l, i) => {
    const y = i * hl + (hl - ep) / 2, T = tot(l) || 1;
    let x = gauche;
    svg.append(s('text', { x: gauche - 8, y: y + ep / 2 + 4, 'text-anchor': 'end', class: 'etiq' }, l.label.length > 22 ? l.label.slice(0, 21) + '…' : l.label));
    const visibles = l.valeurs.map((v, k) => [v, k]).filter(([v]) => v > 0);
    visibles.forEach(([v, k], j) => {
      const lv = (pourcent ? v / T : v / M) * L;
      const dernier = j === visibles.length - 1;
      const larg = Math.max(0, lv - (dernier ? 0 : 2));
      const forme = dernier ? s('path', { d: barre(x, y, larg, ep, 'h'), fill: series[k].couleur }) : s('rect', { x, y, width: larg, height: ep, fill: series[k].couleur });
      const g = s('g', { class: 'marque' }, forme);
      info(g, `${l.label} · ${series[k].nom} : ${format(v)}${pourcent ? ` (${Math.round((v / T) * 100)} %)` : ''}`);
      svg.append(g);
      x += lv;
    });
    if (!pourcent) svg.append(s('text', { x: x + 6, y: y + ep / 2 + 4, class: 'val' }, format(tot(l))));
  });
  return h('div', {}, svg, legende(series));
}

// ------------------------------------------------------------------------------------------- colonnes (histogramme)
// colonnes : [{ label, valeur, couleur, info }]
export function colonnes(cols, { hauteur = 180, largeur = 420, format = (v) => nb(v, 0), couleur = 'var(--g1)' } = {}) {
  const bas = 26, haut = 18, gauche = 34, W = largeur, H = hauteur, Ht = H - bas - haut, L = W - gauche - 6;
  const M = Math.max(1e-9, ...cols.map((c) => c.valeur || 0)), grad = graduations(M), Mx = grad.at(-1);
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'graph', role: 'img', style: `max-width:${W}px` });
  grad.forEach((t) => { const y = haut + Ht - (t / Mx) * Ht; svg.append(s('line', { x1: gauche, x2: W, y1: y, y2: y, class: t === 0 ? 'axe' : 'grille' }), s('text', { x: gauche - 6, y: y + 4, 'text-anchor': 'end', class: 'graduation' }, format(t))); });
  const pas = L / cols.length, ep = Math.min(24, pas * 0.6);
  cols.forEach((c, i) => {
    const x = gauche + i * pas + (pas - ep) / 2, ht = ((c.valeur || 0) / Mx) * Ht;
    const g = s('g', { class: 'marque' },
      s('rect', { x: gauche + i * pas, y: haut, width: pas, height: Ht, fill: 'transparent' }),
      s('path', { d: barre(x, haut + Ht - ht, ep, ht, 'v'), fill: c.couleur || couleur }),
      c.valeur && cols.length <= 16 ? s('text', { x: x + ep / 2, y: haut + Ht - ht - 5, 'text-anchor': 'middle', class: 'val' }, format(c.valeur)) : null,
      i % Math.ceil(cols.length / 14) === 0 ? s('text', { x: x + ep / 2, y: H - 8, 'text-anchor': 'middle', class: 'etiq' }, c.label) : null);
    info(g, c.info || `${c.label} : ${format(c.valeur)}`);
    svg.append(g);
  });
  return svg;
}

// ------------------------------------------------------------------------------------------- anneau (camembert)
// parts : [{ nom, valeur, couleur }] ; centre : texte au centre
export function anneau(parts, { centre = '', sous = '', taille = 170 } = {}) {
  const T = parts.reduce((a, p) => a + (p.valeur || 0), 0);
  const R = taille / 2 - 4, r = R * 0.62, c = taille / 2;
  const svg = s('svg', { viewBox: `0 0 ${taille} ${taille}`, class: 'graph anneau', role: 'img', width: taille, height: taille });
  if (!T) svg.append(s('circle', { cx: c, cy: c, r: (R + r) / 2, fill: 'none', stroke: 'var(--ligne)', 'stroke-width': R - r }));
  let a0 = -Math.PI / 2;
  const visibles = parts.filter((p) => p.valeur > 0);
  for (const p of visibles) {
    const a = (p.valeur / T) * Math.PI * 2, ecart = visibles.length > 1 ? 0.025 : 0, a1 = a0 + a;
    const pt = (rr, ang) => `${c + rr * Math.cos(ang)},${c + rr * Math.sin(ang)}`;
    const grand = a - 2 * ecart > Math.PI ? 1 : 0;
    const d = visibles.length === 1
      ? `M${c - R},${c} A${R},${R} 0 1 1 ${c + R},${c} A${R},${R} 0 1 1 ${c - R},${c} M${c - r},${c} A${r},${r} 0 1 0 ${c + r},${c} A${r},${r} 0 1 0 ${c - r},${c} Z`
      : `M${pt(R, a0 + ecart)} A${R},${R} 0 ${grand} 1 ${pt(R, a1 - ecart)} L${pt(r, a1 - ecart)} A${r},${r} 0 ${grand} 0 ${pt(r, a0 + ecart)} Z`;
    const g = s('g', { class: 'marque' }, s('path', { d, fill: p.couleur, 'fill-rule': 'evenodd' }));
    info(g, `${p.nom} : ${nb(p.valeur, 1)} (${Math.round((p.valeur / T) * 100)} %)`);
    svg.append(g);
    a0 = a1;
  }
  svg.append(s('text', { x: c, y: c + (sous ? 2 : 7), 'text-anchor': 'middle', class: 'centre-anneau' }, centre),
    sous ? s('text', { x: c, y: c + 18, 'text-anchor': 'middle', class: 'graduation' }, sous) : null);
  return h('div', { class: 'bloc-anneau' }, svg, h('div', { class: 'legende-graph colonne' },
    parts.map((p) => h('span', {}, h('i', { style: { background: p.couleur } }), `${p.nom} : `, h('b', {}, nb(p.valeur, 1)), T ? h('small', {}, ` (${Math.round(((p.valeur || 0) / T) * 100)} %)`) : null))));
}

// ------------------------------------------------------------------------------------------- courbe
// points : [{ label, valeur, info }] (dans l'ordre) ; opts : { min, max, reference: { valeur, nom } }
export function courbe(points, { min = 0, max = null, hauteur = 190, largeur = 440, format = (v) => nb(v), reference = null, couleur = 'var(--g1)' } = {}) {
  const bas = 30, haut = 16, gauche = 34, droite = 16, W = largeur, H = hauteur, Ht = H - bas - haut, L = W - gauche - droite;
  const vals = points.map((p) => p.valeur).filter((v) => v !== null && v !== undefined);
  const Mx = max ?? graduations(Math.max(1e-9, ...vals)).at(-1);
  const grad = graduations(Mx - min).map((t) => t + min).filter((t) => t <= Mx + 1e-9);
  const y = (v) => haut + Ht - ((v - min) / (Mx - min || 1)) * Ht;
  const x = (i) => gauche + (points.length === 1 ? L / 2 : (i / (points.length - 1)) * L);
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'graph', role: 'img', style: `max-width:${W}px` });
  grad.forEach((t) => svg.append(s('line', { x1: gauche, x2: W - droite, y1: y(t), y2: y(t), class: t === min ? 'axe' : 'grille' }),
    s('text', { x: gauche - 6, y: y(t) + 4, 'text-anchor': 'end', class: 'graduation' }, format(t))));
  if (reference) svg.append(s('line', { x1: gauche, x2: W - droite, y1: y(reference.valeur), y2: y(reference.valeur), class: 'reference' }),
    s('text', { x: W - droite, y: y(reference.valeur) - 5, 'text-anchor': 'end', class: 'graduation' }, reference.nom));
  const pts = points.map((p, i) => [p, i]).filter(([p]) => p.valeur !== null && p.valeur !== undefined);
  if (pts.length > 1) {
    svg.append(s('path', { d: `M${x(pts[0][1])},${y(Mx > min ? min : 0)} ` + pts.map(([p, i]) => `L${x(i)},${y(p.valeur)}`).join(' ') + ` L${x(pts.at(-1)[1])},${y(min)} Z`, class: 'aire', fill: couleur }));
    svg.append(s('path', { d: pts.map(([p, i], k) => `${k ? 'L' : 'M'}${x(i)},${y(p.valeur)}`).join(' '), class: 'ligne', stroke: couleur }));
  }
  const pasLib = Math.ceil(points.length / 8);
  points.forEach((p, i) => { if (i % pasLib === 0 || i === points.length - 1) svg.append(s('text', { x: x(i), y: H - 10, 'text-anchor': 'middle', class: 'etiq' }, p.label)); });
  pts.forEach(([p, i]) => {
    const g = s('g', { class: 'marque' }, s('circle', { cx: x(i), cy: y(p.valeur), r: 12, fill: 'transparent' }), s('circle', { cx: x(i), cy: y(p.valeur), r: 4.5, class: 'point', fill: couleur }));
    info(g, p.info || `${p.label} : ${format(p.valeur)}`);
    svg.append(g);
  });
  if (pts.length) { const [p, i] = pts.at(-1); svg.append(s('text', { x: Math.min(x(i) + 8, W - droite), y: y(p.valeur) - 9, 'text-anchor': i === points.length - 1 ? 'end' : 'start', class: 'val' }, format(p.valeur))); }
  return svg;
}

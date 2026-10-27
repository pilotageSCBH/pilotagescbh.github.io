// Générateur de QR codes (mode octets, correction d'erreur M, versions 1 à 40), sans bibliothèque externe.
// Algorithme d'après la norme ISO/IEC 18004 (même principe que le générateur de Project Nayuki, licence MIT).
// qrMatrice(texte) → tableau carré de booléens (true = module noir) ; qrSVG(texte, taille) → élément <svg>.

const ECC_M = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28];
const BLOCS_M = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49];
const FORMAT_M = 0;

function modulesBruts(v) {
  let r = (16 * v + 128) * v + 64;
  if (v >= 2) { const n = Math.floor(v / 7) + 2; r -= (25 * n - 10) * n - 55; if (v >= 7) r -= 36; }
  return r;
}
const motsDonnees = (v) => Math.floor(modulesBruts(v) / 8) - ECC_M[v] * BLOCS_M[v];
const mul = (x, y) => { let z = 0; for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11D); z ^= ((y >>> i) & 1) * x; } return z & 0xFF; };
function diviseur(n) {
  const r = new Array(n).fill(0); r[n - 1] = 1; let racine = 1;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) { r[j] = mul(r[j], racine); if (j + 1 < n) r[j] ^= r[j + 1]; }
    racine = mul(racine, 0x02);
  }
  return r;
}
function reste(donnees, div) {
  const r = new Array(div.length).fill(0);
  for (const b of donnees) { const f = b ^ r.shift(); r.push(0); div.forEach((c, i) => { r[i] ^= mul(c, f); }); }
  return r;
}
function positionsAlignement(v) {
  if (v === 1) return [];
  const n = Math.floor(v / 7) + 2, pas = v === 32 ? 26 : Math.ceil((v * 4 + 4) / (n * 2 - 2)) * 2, r = [6];
  for (let p = v * 4 + 10; r.length < n; p -= pas) r.splice(1, 0, p);
  return r;
}

export function qrMatrice(texte) {
  const octets = [...new TextEncoder().encode(String(texte))];
  let v = 1;
  for (; v <= 40; v++) if (4 + (v < 10 ? 8 : 16) + octets.length * 8 <= motsDonnees(v) * 8) break;
  if (v > 40) throw new Error('Texte trop long pour un QR code');
  // flux de bits
  const bits = [];
  const ajout = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  ajout(4, 4); ajout(octets.length, v < 10 ? 8 : 16); octets.forEach((b) => ajout(b, 8));
  const cap = motsDonnees(v) * 8;
  ajout(0, Math.min(4, cap - bits.length));
  ajout(0, (8 - (bits.length % 8)) % 8);
  for (let p = 0xEC; bits.length < cap; p ^= 0xEC ^ 0x11) ajout(p, 8);
  const donnees = [];
  for (let i = 0; i < bits.length; i += 8) donnees.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  // blocs, correction d'erreur, entrelacement
  const nb = BLOCS_M[v], ecc = ECC_M[v], bruts = Math.floor(modulesBruts(v) / 8);
  const courts = nb - (bruts % nb), longCourt = Math.floor(bruts / nb), div = diviseur(ecc);
  const blocs = [];
  for (let i = 0, k = 0; i < nb; i++) {
    const d = donnees.slice(k, k + longCourt - ecc + (i < courts ? 0 : 1)); k += d.length;
    const e = reste(d, div); if (i < courts) d.push(0);
    blocs.push(d.concat(e));
  }
  const mots = [];
  for (let i = 0; i < blocs[0].length; i++) blocs.forEach((b, j) => { if (i !== longCourt - ecc || j >= courts) mots.push(b[i]); });
  // matrice
  const N = v * 4 + 17;
  const mod = Array.from({ length: N }, () => new Array(N).fill(false));
  const fonc = Array.from({ length: N }, () => new Array(N).fill(false));
  const fixe = (x, y, noir) => { mod[y][x] = noir; fonc[y][x] = true; };
  for (let i = 0; i < N; i++) { fixe(6, i, i % 2 === 0); fixe(i, 6, i % 2 === 0); }
  const chercheur = (x, y) => { for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
    const d = Math.max(Math.abs(dx), Math.abs(dy)), xx = x + dx, yy = y + dy;
    if (xx >= 0 && xx < N && yy >= 0 && yy < N) fixe(xx, yy, d !== 2 && d !== 4);
  } };
  chercheur(3, 3); chercheur(N - 4, 3); chercheur(3, N - 4);
  const al = positionsAlignement(v), na = al.length;
  for (let i = 0; i < na; i++) for (let j = 0; j < na; j++) {
    if ((i === 0 && j === 0) || (i === 0 && j === na - 1) || (i === na - 1 && j === 0)) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) fixe(al[i] + dx, al[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }
  const format = (masque) => {
    const d = (FORMAT_M << 3) | masque; let r = d;
    for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
    const b = ((d << 10) | r) ^ 0x5412, bit = (i) => ((b >>> i) & 1) !== 0;
    for (let i = 0; i <= 5; i++) fixe(8, i, bit(i));
    fixe(8, 7, bit(6)); fixe(8, 8, bit(7)); fixe(7, 8, bit(8));
    for (let i = 9; i < 15; i++) fixe(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) fixe(N - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) fixe(8, N - 15 + i, bit(i));
    fixe(8, N - 8, true);
  };
  format(0);
  if (v >= 7) {
    let r = v; for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1F25);
    const b = (v << 12) | r;
    for (let i = 0; i < 18; i++) { const n = ((b >>> i) & 1) !== 0, a = N - 11 + (i % 3), c = Math.floor(i / 3); fixe(a, c, n); fixe(c, a, n); }
  }
  // placement des mots
  let i = 0;
  for (let droite = N - 1; droite >= 1; droite -= 2) {
    if (droite === 6) droite = 5;
    for (let vert = 0; vert < N; vert++) for (let j = 0; j < 2; j++) {
      const x = droite - j, monte = ((droite + 1) & 2) === 0, y = monte ? N - 1 - vert : vert;
      if (!fonc[y][x] && i < mots.length * 8) { mod[y][x] = ((mots[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0; i++; }
    }
  }
  // masque : celui qui donne la plus faible pénalité
  const inverse = (m, x, y) => [(x + y) % 2 === 0, y % 2 === 0, x % 3 === 0, (x + y) % 3 === 0, (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
    ((x * y) % 2) + ((x * y) % 3) === 0, (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (((x + y) % 2) + ((x * y) % 3)) % 2 === 0][m];
  const appliquer = (m) => { for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (!fonc[y][x] && inverse(m, x, y)) mod[y][x] = !mod[y][x]; };
  const penalite = () => {
    let p = 0, noirs = 0;
    for (let a = 0; a < N; a++) {
      let cl = 1, cc = 1;
      for (let b = 1; b < N; b++) {
        if (mod[a][b] === mod[a][b - 1]) { cl++; if (cl === 5) p += 3; else if (cl > 5) p++; } else cl = 1;
        if (mod[b][a] === mod[b - 1][a]) { cc++; if (cc === 5) p += 3; else if (cc > 5) p++; } else cc = 1;
      }
    }
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      if (mod[y][x]) noirs++;
      if (x < N - 1 && y < N - 1 && mod[y][x] === mod[y][x + 1] && mod[y][x] === mod[y + 1][x] && mod[y][x] === mod[y + 1][x + 1]) p += 3;
    }
    return p + Math.floor(Math.abs(noirs * 20 - N * N * 10) / (N * N)) * 10;
  };
  let meilleur = 0, min = Infinity;
  for (let m = 0; m < 8; m++) { appliquer(m); format(m); const p = penalite(); if (p < min) { min = p; meilleur = m; } appliquer(m); }
  appliquer(meilleur); format(meilleur);
  return mod;
}

// image SVG (marge de 4 modules), à insérer dans la page
export function qrSVG(texte, taille = 96) {
  const m = qrMatrice(texte), N = m.length, T = N + 8;
  let d = '';
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (m[y][x]) d += `M${x + 4} ${y + 4}h1v1h-1z`;
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${T} ${T}`); svg.setAttribute('width', taille); svg.setAttribute('height', taille);
  svg.setAttribute('shape-rendering', 'crispEdges'); svg.setAttribute('class', 'qr');
  const fond = document.createElementNS(ns, 'rect'); fond.setAttribute('width', T); fond.setAttribute('height', T); fond.setAttribute('fill', '#fff');
  const p = document.createElementNS(ns, 'path'); p.setAttribute('d', d); p.setAttribute('fill', '#000');
  svg.append(fond, p);
  return svg;
}

// adresses web trouvées dans un texte (http, https ou www.)
export function liensDe(texte) {
  const r = [];
  for (const m of String(texte || '').matchAll(/\b(?:https?:\/\/|www\.)[^\s<>"«»]+/gi)) {
    const u = m[0].replace(/[.,;:!?)\]]+$/, '');
    const url = /^www\./i.test(u) ? 'https://' + u : u;
    if (!r.includes(url)) r.push(url);
  }
  return r;
}

// liens avec leur libellé : texte écrit avant l'adresse sur la même ligne (« Vidéo : https://… » → « Vidéo »)
export function liensLibelles(texte) {
  const r = [];
  for (const ligne of String(texte || '').split('\n')) for (const url of liensDe(ligne)) {
    if (r.some((x) => x.url === url)) continue;
    const bas = ligne.toLowerCase();
    let i = bas.indexOf(url.toLowerCase());
    if (i < 0) i = bas.indexOf(url.replace(/^https:\/\/(?=www\.)/i, '').toLowerCase());
    const lib = (i > 0 ? ligne.slice(0, i) : '').replace(/[\s:–—-]+$/, '').replace(/^[\s•*-]+/, '').trim();
    r.push({ url, lib: lib.length > 60 ? lib.slice(0, 59) + '…' : lib });
  }
  return r;
}

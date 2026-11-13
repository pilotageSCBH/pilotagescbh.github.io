// Documents PDF (A4 portrait) construits dans le navigateur avec pdf-lib (js/lib), regroupés dans un .zip (JSZip).
// Un document = une liste de blocs : titre, infos (paires libellé / valeur), rubrique (bandeau + texte), table, cadre, note,
// étapes numérotées, cases à cocher, lignes de réponse, QR codes.
// Les bibliothèques ne sont chargées qu'au premier téléchargement.

import { qrMatrice } from './qr.js';

const charges = {};
function charger(src, nom) {
  if (window[nom]) return Promise.resolve(window[nom]);
  if (!charges[src]) {
    charges[src] = new Promise((ok, ko) => {
      const s = document.createElement('script');
      s.src = src; s.onload = () => ok(window[nom]); s.onerror = () => ko(new Error('Chargement impossible de ' + src));
      document.head.append(s);
    });
  }
  return charges[src];
}
export const chargerOutils = () => Promise.all([charger('js/lib/pdf-lib.min.js', 'PDFLib'), charger('js/lib/jszip.min.js', 'JSZip')]);

// caractères hors de l'encodage des polices standard (WinAnsi) : remplacés
const REMPLACE = { '→': '->', '←': '<-', '≤': '<=', '≥': '>=', '✔': 'v', '✓': 'v', '✖': 'x', '⚠': '!', '•': '•', ' ': ' ', ' ': ' ', '\t': '  ' };
const WINANSI = new Set([...'€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ']);
export function nettoyer(t) {
  return [...String(t ?? '')].map((c) => {
    if (REMPLACE[c] !== undefined) return REMPLACE[c];
    const n = c.codePointAt(0);
    if (c === '\n' || (n >= 32 && n <= 126) || (n >= 160 && n <= 255) || WINANSI.has(c)) return c;
    return '';
  }).join('');
}

const A4 = [595.28, 841.89], MARGE = 40;
const coul = (hex) => { const n = parseInt(hex.slice(1), 16); return window.PDFLib.rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255); };

export async function creerPDF(doc, logoOctets, { pied = true } = {}) {
  const { PDFDocument, StandardFonts, degrees } = window.PDFLib;
  const pdf = await PDFDocument.create();
  pdf.setTitle(nettoyer(doc.titre)); pdf.setCreator('Pilotage BTS SCBH');
  const F = await pdf.embedFont(StandardFonts.Helvetica), FB = await pdf.embedFont(StandardFonts.HelveticaBold), FI = await pdf.embedFont(StandardFonts.HelveticaOblique);
  const logo = logoOctets ? await pdf.embedJpg(logoOctets) : null;
  const FONCE = coul('#146B63'), CLAIR = coul('#E3F1EF'), TEAL = coul('#1E8F86'), LIGNE = coul('#A9B5B2'), TEXTE = coul('#1F2D2B'), GRIS = coul('#5F6F6C'), BLANC = coul('#FFFFFF');
  const L = A4[0] - 2 * MARGE;
  let page, y, gauche = MARGE, largeur = L;
  const pages = [];
  const nouvellePage = () => { page = pdf.addPage(A4); pages.push(page); y = A4[1] - MARGE; };
  nouvellePage();
  const place = (hauteur) => { if (y - hauteur < MARGE + 14) { nouvellePage(); return true; } return false; };

  // découpage d'un texte en lignes tenant dans une largeur
  const lignes = (texte, font, taille, larg) => {
    const out = [];
    for (const para of nettoyer(texte).split('\n')) {
      if (!para.trim()) { out.push(''); continue; }
      let cur = '';
      for (const mot of para.split(/ +/)) {
        const essai = cur ? cur + ' ' + mot : mot;
        if (font.widthOfTextAtSize(essai, taille) <= larg) { cur = essai; continue; }
        if (cur) out.push(cur);
        if (font.widthOfTextAtSize(mot, taille) <= larg) { cur = mot; continue; }
        let m = '';                                        // mot plus long que la largeur : coupé
        for (const ch of mot) { if (font.widthOfTextAtSize(m + ch, taille) > larg) { out.push(m); m = ch; } else m += ch; }
        cur = m;
      }
      out.push(cur);
    }
    return out;
  };
  const texte = (t, x, yy, font, taille, couleur = TEXTE, opts = {}) => page.drawText(nettoyer(t), { x, y: yy, font, size: taille, color: couleur, ...opts });

  // ------------------------------------------------------------------ blocs
  const B = {
    titre(b) {
      const h = 46;
      place(h + 10);
      if (logo) { const s = 34 / logo.height; page.drawImage(logo, { x: gauche, y: y - 38, width: logo.width * s, height: 34 }); }
      const x0 = gauche + (logo ? 34 / logo.height * logo.width + 12 : 0);
      texte(b.texte, x0, y - 16, FB, 14, FONCE);
      lignes(b.sous || '', FB, 10.5, largeur - (x0 - gauche)).slice(0, 2).forEach((l, i) => texte(l, x0, y - 31 - i * 12, FB, 10.5, coul(b.couleur || '#7A4FA0')));
      y -= h;
      page.drawLine({ start: { x: gauche, y }, end: { x: gauche + largeur, y }, thickness: 1.6, color: coul(b.couleur || '#7A4FA0') });
      y -= 10;
    },
    infos(b) {
      const lib = largeur * 0.17, val = largeur * 0.33, taille = 8.5;
      for (let i = 0; i < b.paires.length; i += 2) {
        const ps = b.paires.slice(i, i + 2);
        const hs = ps.map(([a, v]) => Math.max(lignes(a, FB, taille, lib - 8).length, lignes(v || '—', F, taille, val - 8).length));
        const h = Math.max(...hs) * 10.5 + 7;
        place(h);
        ps.forEach(([a, v], k) => {
          const x = gauche + k * (lib + val);
          page.drawRectangle({ x, y: y - h, width: lib, height: h, color: CLAIR, borderColor: LIGNE, borderWidth: 0.6 });
          page.drawRectangle({ x: x + lib, y: y - h, width: val, height: h, color: b.gris ? coul('#EFF1F0') : BLANC, borderColor: LIGNE, borderWidth: 0.6 });
          lignes(a, FB, taille, lib - 8).forEach((l, j) => texte(l, x + 4, y - 10.5 - j * 10.5, FB, taille, FONCE));
          lignes(v || '—', F, taille, val - 8).forEach((l, j) => texte(l, x + lib + 4, y - 10.5 - j * 10.5, F, taille));
        });
        if (ps.length < 2) page.drawRectangle({ x: gauche + lib + val, y: y - h, width: lib + val, height: h, borderColor: LIGNE, borderWidth: 0.6 });
        y -= h;
      }
      y -= 6;
    },
    rubrique(b) {
      const taille = 9, pas = 11.5, ls = lignes(b.texte || '—', b.gras ? FB : F, taille, largeur - 12);
      place(16 + pas * Math.min(ls.length, 2) + 8);
      page.drawRectangle({ x: gauche, y: y - 16, width: largeur, height: 16, color: FONCE });
      texte(nettoyer(b.titre).toUpperCase(), gauche + 6, y - 11.5, FB, 8.5, BLANC);
      y -= 16;
      let haut = y;
      const fond = b.gris ? coul('#EFF1F0') : null;
      const fermer = (bas) => page.drawRectangle({ x: gauche, y: bas, width: largeur, height: haut - bas, borderColor: LIGNE, borderWidth: 0.6, color: fond || undefined, opacity: fond ? 1 : undefined });
      // le fond est dessiné avant le texte : on mémorise les lignes de la page puis on les écrit
      let tampon = [];
      const vider = (bas) => { fermer(bas); tampon.forEach(([l, yy]) => texte(l, gauche + 6, yy, b.gras ? FB : F, taille)); tampon = []; };
      y -= 4;
      for (const l of ls) {
        if (y - pas < MARGE + 14) { vider(y - 2); nouvellePage(); haut = y; y -= 4; }
        y -= pas; tampon.push([l, y + 2.5]);
      }
      y -= 5; vider(y);
      y -= 8;
    },
    // bandeau de titre seul (début d'une rubrique dessinée à la main)
    bandeau(titre, hMin) {
      place(16 + hMin);
      page.drawRectangle({ x: gauche, y: y - 16, width: largeur, height: 16, color: FONCE });
      texte(nettoyer(titre).toUpperCase(), gauche + 6, y - 11.5, FB, 8.5, BLANC);
      y -= 16;
    },
    // paragraphe simple (sans bandeau)
    texte(b) {
      const taille = 9.5, pas = 12.5;
      y -= 2;
      for (const l of lignes(b.texte, b.gras ? FB : F, taille, largeur - 8)) { place(pas); y -= pas; texte(l, gauche + 4, y + 2.5, b.gras ? FB : F, taille); }
      y -= 8;
    },
    // étapes numérotées (pastille avec le numéro, texte à côté)
    etapes(b) {
      const taille = 9, pas = 11.5, ret = 26;
      B.bandeau(b.titre, 30);
      y -= 6;
      b.items.forEach((it, i) => {
        const ls = lignes(it, F, taille, largeur - ret - 8);
        const h = Math.max(18, ls.length * pas + 6);
        if (place(h)) { /* suite sur une nouvelle page */ }
        page.drawCircle({ x: gauche + 12, y: y - 9, size: 8, color: TEAL });
        const n = String(i + 1), w = FB.widthOfTextAtSize(n, 8.5);
        texte(n, gauche + 12 - w / 2, y - 12, FB, 8.5, BLANC);
        ls.forEach((l, j) => texte(l, gauche + ret, y - 12 - j * pas, F, taille));
        y -= h;
      });
      y -= 8;
    },
    // liste à cocher : une case vide devant chaque ligne
    cases(b) {
      const taille = 9, pas = 11.5, ret = 22;
      B.bandeau(b.titre, 30);
      y -= 6;
      for (const it of b.items) {
        const ls = lignes(it, F, taille, largeur - ret - 8);
        const h = Math.max(16, ls.length * pas + 5);
        place(h);
        page.drawRectangle({ x: gauche + 6, y: y - 12.5, width: 9, height: 9, borderColor: FONCE, borderWidth: 0.9 });
        ls.forEach((l, j) => texte(l, gauche + ret, y - 11 - j * pas, F, taille));
        y -= h;
      }
      y -= 8;
    },
    // zone de réponse : n lignes pointillées
    lignes(b) {
      const pas = 20;
      B.bandeau(b.titre, pas * 2);
      let haut = y;
      const cadre = (bas) => page.drawRectangle({ x: gauche, y: bas, width: largeur, height: haut - bas, borderColor: LIGNE, borderWidth: 0.6 });
      for (let i = 0; i < b.n; i++) {
        if (y - pas < MARGE + 14) { cadre(y - 4); nouvellePage(); haut = y; }
        y -= pas;
        page.drawLine({ start: { x: gauche + 8, y }, end: { x: gauche + largeur - 8, y }, thickness: 0.5, color: LIGNE, dashArray: [1.5, 2.5] });
      }
      y -= 8; cadre(y); y -= 8;
    },
    note(b) { lignes(b.texte, FI, 7.5, largeur).forEach((l) => { place(10); y -= 9.5; texte(l, gauche, y, FI, 7.5, GRIS); }); y -= 4; },
    // table : colonnes [{ titre, part, centre }], lignes : [[cellules]] ou { groupe: texte } ; teteVerticale : titres tournés (noms d'élèves)
    table(b) {
      const taille = b.taille || 8, pas = taille + 2.6, pad = 3.5;
      const tot = b.colonnes.reduce((a, c) => a + c.part, 0);
      const W = b.colonnes.map((c) => (c.part / tot) * largeur);
      const X = W.map((_, i) => gauche + W.slice(0, i).reduce((a, w) => a + w, 0));
      const enTete = () => {
        if (b.titre) {
          place(16 + 30);
          page.drawRectangle({ x: gauche, y: y - 16, width: largeur, height: 16, color: FONCE });
          texte(nettoyer(b.titre).toUpperCase(), gauche + 6, y - 11.5, FB, 8.5, BLANC); y -= 16;
        }
        const hs = b.colonnes.map((c, i) => (b.teteVerticale && i >= b.teteVerticale
          ? Math.max(...lignes(c.titre, FB, 7, 200).map((l) => FB.widthOfTextAtSize(l, 7))) + 8
          : lignes(c.titre, FB, taille, W[i] - 2 * pad).length * pas + 6));
        const h = Math.max(...hs);
        place(h + pas + 6);
        b.colonnes.forEach((c, i) => {
          page.drawRectangle({ x: X[i], y: y - h, width: W[i], height: h, color: CLAIR, borderColor: LIGNE, borderWidth: 0.6 });
          if (b.teteVerticale && i >= b.teteVerticale) {
            lignes(c.titre, FB, 7, 200).forEach((l, j) => texte(l, X[i] + W[i] / 2 + 2.5 - j * 8 + (lignes(c.titre, FB, 7, 200).length - 1) * 4, y - h + 4, FB, 7, FONCE, { rotate: degrees(90) }));
          } else lignes(c.titre, FB, taille, W[i] - 2 * pad).forEach((l, j) => texte(l, X[i] + pad, y - pas - 1 - j * pas, FB, taille, FONCE));
        });
        y -= h;
      };
      enTete();
      for (const r of b.lignes) {
        if (r.groupe !== undefined) {
          const ls = lignes(r.groupe, FB, taille, largeur - 2 * pad), h = ls.length * pas + 5;
          if (place(h + pas + 6)) enTete();
          page.drawRectangle({ x: gauche, y: y - h, width: largeur, height: h, color: TEAL, borderColor: LIGNE, borderWidth: 0.6 });
          ls.forEach((l, j) => texte(l, gauche + pad, y - pas - j * pas, FB, taille, BLANC));
          y -= h; continue;
        }
        const cells = r.cellules || r;
        const ls = cells.map((v, i) => lignes(v ?? '', r.gras || b.colonnes[i].gras ? FB : F, taille, W[i] - 2 * pad));
        const h = Math.max(1, ...ls.map((x) => x.length)) * pas + 5;
        if (place(h)) enTete();
        cells.forEach((v, i) => {
          page.drawRectangle({ x: X[i], y: y - h, width: W[i], height: h, color: r.fond ? coul(r.fond) : BLANC, borderColor: LIGNE, borderWidth: 0.6 });
          ls[i].forEach((l, j) => {
            const font = r.gras || b.colonnes[i].gras ? FB : F;
            const x = b.colonnes[i].centre ? X[i] + (W[i] - font.widthOfTextAtSize(l, taille)) / 2 : X[i] + pad;
            texte(l, x, y - pas - j * pas, font, taille);
          });
        });
        y -= h;
      }
      y -= 10;
    },
    // QR codes des liens (accès direct depuis un téléphone), avec l'adresse sous chaque code
    qr(b) {
      const cote = 74, lc = 132, parLigne = Math.max(1, Math.floor(largeur / lc)), tl = 6.3;
      for (let i = 0; i < b.liens.length; i += parLigne) {
        const rang = b.liens.slice(i, i + parLigne).map(({ url, lib }) => ({ u: url, lb: lib ? lignes(lib, FB, 7.5, lc - 12).slice(0, 2) : [], ls: lignes(url, F, tl, lc - 12).slice(0, 4) }));
        const hLib = Math.max(...rang.map((r) => r.lb.length)) * 9.5;
        const hRang = hLib + cote + 8 + Math.max(...rang.map((r) => r.ls.length)) * (tl + 1.6) + 6;
        place(hRang);
        rang.forEach(({ u, lb, ls }, k) => {
          const x0 = gauche + k * lc, m = qrMatrice(u), N = m.length, t = cote / (N + 2), xq = x0 + (lc - cote) / 2, yq = y - hLib;
          page.drawRectangle({ x: x0 + 2, y: y - hRang + 2, width: lc - 6, height: hRang - 4, borderColor: LIGNE, borderWidth: 0.5, color: BLANC });
          lb.forEach((l, j) => { const w = FB.widthOfTextAtSize(l, 7.5); texte(l, x0 + (lc - w) / 2 - 2, y - 11 - j * 9.5, FB, 7.5, TEXTE); });
          for (let yy = 0; yy < N; yy++) for (let xx = 0; xx < N; xx++) if (m[yy][xx]) page.drawRectangle({ x: xq + (xx + 1) * t, y: yq - 6 - (yy + 2) * t, width: t + 0.05, height: t + 0.05, color: coul('#000000') });
          ls.forEach((l, j) => { const w = F.widthOfTextAtSize(l, tl); texte(l, x0 + (lc - w) / 2 - 2, yq - cote - 12 - j * (tl + 1.6), F, tl, FONCE); });
        });
        y -= hRang + 4;
      }
    },
    // cours ressources : bandeau d'un dossier (chemin complet)
    dossier(b) {
      const ls = lignes(b.texte, FB, 10, largeur - 30);
      const h = ls.length * 13 + 10;
      place(h + 60);
      y -= 4;
      page.drawRectangle({ x: gauche, y: y - h, width: largeur, height: h, color: FONCE });
      texte('>', gauche + 8, y - 15, FB, 10, coul('#B9D98A'));
      ls.forEach((l, j) => texte(l, gauche + 22, y - 15 - j * 13, FB, 10, BLANC));
      y -= h + 8;
    },
    // cours ressources : titre du cours, sommaire en retrait par niveau, savoirs associés, mots-clés et lien
    cours(b) {
      const tt = lignes(b.titre, FB, 11, largeur - 20);
      const hT = tt.length * 13 + 9;
      place(hT + 40);
      page.drawRectangle({ x: gauche, y: y - hT, width: largeur, height: hT, color: CLAIR });
      page.drawRectangle({ x: gauche, y: y - hT, width: 4, height: hT, color: TEAL });
      tt.forEach((l, j) => texte(l, gauche + 12, y - 14 - j * 13, FB, 11, FONCE));
      y -= hT + 5;
      if (!b.lignes.length) { place(12); y -= 11; texte('Sommaire non renseigné.', gauche + 12, y, FI, 8.5, GRIS); y -= 3; }
      for (const it of b.lignes) {
        const n = it.n || 0, ret = 12 + n * 16, font = n === 0 ? FB : F, taille = n === 0 ? 9.5 : n === 1 ? 9 : 8.5, pas = taille + 3;
        const ls = lignes(it.t, font, taille, largeur - ret - 14);
        ls.forEach((l, j) => {
          if (place(pas + 1)) { /* suite sur une nouvelle page */ }
          y -= pas + (n === 0 && j === 0 ? 2 : 0);
          if (j === 0 && n > 0) texte(n === 1 ? '•' : '-', gauche + ret - 8, y, F, taille, TEAL);
          texte(l, gauche + ret, y, font, taille, n === 0 ? FONCE : TEXTE);
        });
      }
      const pied = [];
      if (b.savoirs?.length) pied.push(['Savoirs associés', b.savoirs]);
      if (b.motsCles) pied.push(['Mots-clés', [b.motsCles]]);
      if (b.lien) pied.push(['Lien', [b.lien]]);
      if (pied.length) y -= 4;
      for (const [lib, vals] of pied) {
        const wl = FB.widthOfTextAtSize(lib + ' :', 8) + 6;
        vals.forEach((v, i) => {
          lignes(v, F, 8, largeur - 12 - wl).forEach((l, j) => {
            place(11); y -= 10.5;
            if (i === 0 && j === 0) texte(lib + ' :', gauche + 12, y, FB, 8, FONCE);
            texte(l, gauche + 12 + wl, y, F, 8, lib === 'Lien' ? TEAL : GRIS);
          });
        });
      }
      y -= 7;
      page.drawLine({ start: { x: gauche, y }, end: { x: gauche + largeur, y }, thickness: 0.5, color: LIGNE });
      y -= 10;
    },
    // question de QCM : numéro, énoncé, réponses avec une case ; corrigé : bonnes réponses cochées et explication
    question(b) {
      const taille = 9.5, pas = 12, ret = 24, tc = 9, pc = 11.5;
      const lt = lignes(b.texte || '', FB, taille, largeur - ret - 4);
      const lc = b.choix.map((c) => lignes(c.texte || '', F, tc, largeur - ret - 22));
      const le = b.corrige && b.explication ? lignes('Explication : ' + b.explication, FI, 8, largeur - ret - 4) : [];
      const hTot = lt.length * pas + 8 + (b.aide ? 11 : 0) + lc.reduce((x, l) => x + l.length * pc + 4, 0) + le.length * 10 + 10;
      place(Math.min(hTot, 320));
      page.drawCircle({ x: gauche + 10, y: y - 8, size: 9, color: TEAL });
      const n = String(b.num), w = FB.widthOfTextAtSize(n, 8.5);
      texte(n, gauche + 10 - w / 2, y - 11, FB, 8.5, BLANC);
      lt.forEach((l, j) => texte(l, gauche + ret, y - 11 - j * pas, FB, taille, FONCE));
      y -= lt.length * pas + 6;
      if (b.aide) { texte(b.aide, gauche + ret, y - 8, FI, 7.5, GRIS); y -= 11; }
      b.choix.forEach((c, i) => {
        const ls = lc[i]; place(ls.length * pc + 4);
        const coche = b.corrige && c.bon;
        page.drawRectangle({ x: gauche + ret, y: y - 10, width: 9, height: 9, borderColor: coche ? TEAL : LIGNE, borderWidth: 1, color: coche ? TEAL : BLANC });
        ls.forEach((l, j) => texte(l, gauche + ret + 16, y - 8.5 - j * pc, coche ? FB : F, tc, coche ? FONCE : TEXTE));
        y -= ls.length * pc + 4;
      });
      le.forEach((l) => { place(10); texte(l, gauche + ret, y - 8, FI, 8, GRIS); y -= 10; });
      y -= 9;
    },
    // nouvelle page (une fiche par élève)
    saut() { if (y < A4[1] - MARGE - 1) nouvellePage(); },
    // identifiant et code en grand, dans un encadré (fiche de connexion d'un élève)
    acces(b) {
      const hh = 26 + b.lignes.length * 30;
      place(hh + 10);
      page.drawRectangle({ x: gauche, y: y - hh, width: largeur, height: hh, color: CLAIR, borderColor: TEAL, borderWidth: 1.4 });
      texte(b.titre || '', gauche + 12, y - 16, FB, 9, TEAL);
      b.lignes.forEach(([lib, val], i) => {
        const yy = y - 40 - i * 30;
        texte(lib, gauche + 12, yy, F, 10, GRIS);
        texte(val, gauche + 150, yy - 1, FB, 17, FONCE);
      });
      y -= hh + 12;
    },
    // cadre de couleur autour d'un groupe de blocs (travail à la maison)
    cadre(b) {
      const c = coul(b.couleur || '#E8893A');
      place(40);
      const debut = { page, y };
      texte(b.titre, gauche + 8, y - 13, FB, 10, c);
      y -= 20;
      const [g0, l0] = [gauche, largeur];
      gauche += 8; largeur -= 16;
      b.blocs.forEach((x) => B[x.t](x));
      gauche = g0; largeur = l0;
      // bordure, page par page
      const fin = { page, y: y + 4 };
      const iDeb = pages.indexOf(debut.page), iFin = pages.indexOf(fin.page);
      for (let i = iDeb; i <= iFin; i++) {
        const haut = i === iDeb ? debut.y : A4[1] - MARGE, bas = i === iFin ? fin.y : MARGE + 14;
        pages[i].drawRectangle({ x: gauche, y: bas, width: largeur, height: haut - bas, borderColor: c, borderWidth: 1.6 });
      }
      y -= 8;
    },
  };
  for (const b of doc.blocs) {
    if (!B[b.t]) throw new Error('Version du site incomplète dans le navigateur : rechargez la page avec Ctrl+F5.');
    B[b.t](b);
  }
  // pied de page : titre du document et numéro de page
  if (pied) pages.forEach((p, i) => {
    p.drawText(nettoyer(doc.pied || doc.titre).slice(0, 110), { x: MARGE, y: 22, size: 7, font: F, color: GRIS });
    const n = `${i + 1} / ${pages.length}`;
    p.drawText(n, { x: A4[0] - MARGE - F.widthOfTextAtSize(n, 7), y: 22, size: 7, font: F, color: GRIS });
  });
  return pdf.save();
}

export async function zipDePDF(docs, logoOctets) {
  const zip = new window.JSZip();
  for (const d of docs) zip.file(d.fichier, await creerPDF(d, logoOctets));
  return zip.generateAsync({ type: 'blob' });
}

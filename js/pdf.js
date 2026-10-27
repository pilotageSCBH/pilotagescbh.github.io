// Documents PDF (A4 portrait) construits dans le navigateur avec pdf-lib (js/lib), regroupés dans un .zip (JSZip).
// Un document = une liste de blocs : titre, infos (paires libellé / valeur), rubrique (bandeau + texte), table, cadre, note.
// Les bibliothèques ne sont chargées qu'au premier téléchargement.

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

export async function creerPDF(doc, logoOctets) {
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
  for (const b of doc.blocs) B[b.t](b);
  // pied de page : titre du document et numéro de page
  pages.forEach((p, i) => {
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

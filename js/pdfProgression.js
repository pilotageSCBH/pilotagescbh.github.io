// PDF de la progression en A3 paysage : vue « frise » (une page par année) et vue « tableau » (deux pages par année).
// d = { promo, Y, annees: [0, 1], vues: ['frise', 'tableau'], mats: [{ id, nom, couleur, code }],
//       vacances(w), apprentis(w), evenements(w) → [{ k, ev }], cle(m, w), seance(m, w) → { num, titre, seq } | null, texte(m, w),
//       suite(m, w), compte(m) → [placées, total] }
import { nettoyer } from './pdf.js';
import { lundi, jourDe, jj, semaineIso, SEM_AN, MOIS } from './pilotage.js';

const A3 = [1190.55, 841.89], M = 26;
const hex = (c) => { const n = parseInt(String(c || '#1E8F86').slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };
const COUL_VAC = { Vacances: ['#F6B3AA', '#EC7A6B', '#FFFFFF'], Epreuves: ['#F8DE84', '#EDC12F', '#3F2F00'], Stage: ['#B5E0A0', '#6DBA4A', '#FFFFFF'] };
const COUL_APP = { PFMP: '#E3191E', 'Présents': '#1DB33A' };
const COUL_EV = { 'Férié / pont': '#9B6FD0', 'Sortie scolaire': '#4A8FD0', 'Épreuve': '#D4AC0D' };
const JOURS = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];

export async function creerPDFProgression(d, logoOctets) {
  const { PDFDocument, StandardFonts, rgb, degrees } = window.PDFLib;
  const pdf = await PDFDocument.create();
  pdf.setTitle(nettoyer(`Progression · promotion ${d.promo}`)); pdf.setCreator('Pilotage BTS SCBH');
  const F = await pdf.embedFont(StandardFonts.Helvetica), FB = await pdf.embedFont(StandardFonts.HelveticaBold), FI = await pdf.embedFont(StandardFonts.HelveticaOblique);
  const logo = logoOctets ? await pdf.embedJpg(logoOctets).catch(() => null) : null;
  const C = (c) => rgb(...hex(c));
  const mix = (c, t) => { const [r, g, b] = hex(c); return rgb(1 - (1 - r) * t, 1 - (1 - g) * t, 1 - (1 - b) * t); };
  const FONCE = C('#146B63'), TEXTE = C('#1F2D2B'), GRIS = C('#5F6F6C'), LIGNE = C('#C5CFCC'), BLANC = C('#FFFFFF'), FOND = C('#F4F6F5');
  const pages = [];
  let page;
  const W = A3[0], H = A3[1];
  const rect = (x, y, w, h, opts) => page.drawRectangle({ x, y, width: w, height: h, ...opts });
  const txt = (t, x, y, font, size, color = TEXTE) => page.drawText(nettoyer(t), { x, y, font, size, color });
  const larg = (t, font, size) => font.widthOfTextAtSize(nettoyer(t), size);
  const couper = (t, font, size, w) => {                                  // une ligne tronquée avec « … »
    let s = nettoyer(t);
    if (larg(s, font, size) <= w) return s;
    while (s && larg(s + '…', font, size) > w) s = s.slice(0, -1);
    return s ? s + '…' : '';
  };
  const lignes = (t, font, size, w, max) => {                            // texte découpé en lignes (max lignes)
    const out = []; let cur = '';
    for (const mot of nettoyer(t).split(/\s+/).filter(Boolean)) {
      const e = cur ? cur + ' ' + mot : mot;
      if (larg(e, font, size) <= w) { cur = e; continue; }
      if (cur) out.push(cur);
      cur = larg(mot, font, size) <= w ? mot : couper(mot, font, size, w);
      if (out.length >= max) break;
    }
    if (cur && out.length < max) out.push(cur);
    if (out.length === max && nettoyer(t).length > out.join(' ').length + 1) out[max - 1] = couper(out[max - 1] + ' …', font, size, w);
    return out.slice(0, max);
  };
  function nouvellePage(titre, sous) {
    page = pdf.addPage(A3); pages.push(page);
    let x = M;
    if (logo) { const s = 30 / logo.height; page.drawImage(logo, { x: M, y: H - M - 30, width: logo.width * s, height: 30 }); x += logo.width * s + 12; }
    txt(titre, x, H - M - 13, FB, 15, FONCE);
    txt(sous, x, H - M - 28, F, 9.5, GRIS);
    page.drawLine({ start: { x: M, y: H - M - 36 }, end: { x: W - M, y: H - M - 36 }, thickness: 1.4, color: C('#1E8F86') });
    return H - M - 44;
  }
  const libAnnee = (a) => `${a ? '2e' : '1re'} année ${d.Y + a}-${d.Y + a + 1}`;
  // plages de semaines consécutives de même valeur
  const plages = (ws, valeur) => {
    const r = [];
    for (const w of ws) { const v = valeur(w), p = r[r.length - 1]; if (v && p && p.v === v && p.fin === w - 1) p.fin = w; else if (v) r.push({ debut: w, fin: w, v }); }
    return r;
  };
  function legende(y) {
    let x = M;
    const item = (fond, t, coulT) => { rect(x, y - 2, 18, 9, { color: fond }); x += 22; txt(t, x, y, F, 7.5, coulT || TEXTE); x += larg(t, F, 7.5) + 14; };
    Object.entries(COUL_VAC).forEach(([k, [, b]]) => item(C(b), k));
    item(C(COUL_APP['Présents']), 'Apprentis présents'); item(C(COUL_APP.PFMP), 'Apprentis en PFMP');
    Object.entries(COUL_EV).forEach(([k, c]) => item(C(c), k));
  }

  // ------------------------------------------------------------------------------------------- frise
  function frise(a) {
    const ws = Array.from({ length: SEM_AN }, (_, i) => a * SEM_AN + i);
    let y = nouvellePage('PROGRESSION · FRISE', `Promotion ${d.promo}  ·  ${libAnnee(a)}  ·  ${d.mats.map((m) => m.nom).join(', ')}`);
    const LIB = 128, x0 = M + LIB, cw = (W - 2 * M - LIB) / SEM_AN;
    const X = (w) => x0 + (w - ws[0]) * cw;
    const hMois = 13, hSem = 20, hBande = 13, hEv = 11;
    const bas = M + 26;
    const nM = Math.max(1, d.mats.length);
    const dispo = y - hMois - hSem - 3 * (hBande + 2) - 6 - bas;
    const hM = Math.min(120, Math.max(36, dispo / nM - 4));
    // fond : mois alternés et vacances
    const yHaut = y, yBas = y - hMois - hSem - 3 * (hBande + 2) - 6 - nM * (hM + 4);
    ws.forEach((w) => {
      if (jourDe(d.Y, w, 2).getMonth() % 2) rect(X(w), yBas, cw, yHaut - hMois - yBas, { color: FOND });
      const v = d.vacances(w);
      if (v) rect(X(w), yBas, cw, yHaut - hMois - hSem - yBas, { color: mix(COUL_VAC[v]?.[0] || '#F6B3AA', 0.45) });
    });
    // mois
    plages(ws, (w) => { const j = jourDe(d.Y, w, 2); return `${MOIS[j.getMonth()]} ${j.getFullYear()}`; }).forEach((p) => {
      const x = X(p.debut), w = (p.fin - p.debut + 1) * cw;
      rect(x + 0.5, y - hMois, w - 1, hMois - 1, { color: C('#E3F1EF') });
      const t = couper(p.v, FB, 7, w - 4); txt(t, x + (w - larg(t, FB, 7)) / 2, y - hMois + 3.5, FB, 7, FONCE);
    });
    y -= hMois;
    // semaines
    txt('Semaine', M, y - 12, FB, 8, GRIS);
    ws.forEach((w) => {
      const s = 'S' + semaineIso(lundi(d.Y, w)), dt = jj(lundi(d.Y, w)).slice(0, 5);
      txt(s, X(w) + (cw - larg(s, FB, 6.5)) / 2, y - 9, FB, 6.5, TEXTE);
      txt(dt, X(w) + (cw - larg(dt, F, 5)) / 2, y - 17, F, 5, GRIS);
    });
    y -= hSem;
    // bandes communes
    const bande = (lib, ws2, val, couleurs) => {
      txt(lib, M, y - hBande + 3.5, FB, 7.5, TEXTE);
      plages(ws2, val).forEach((p) => {
        const [fond, coulT] = couleurs(p.v), x = X(p.debut), w = (p.fin - p.debut + 1) * cw;
        rect(x + 0.5, y - hBande, w - 1, hBande, { color: fond });
        const t = couper(p.v, FB, 6.5, w - 4); if (t) txt(t, x + (w - larg(t, FB, 6.5)) / 2, y - hBande + 3.8, FB, 6.5, coulT);
      });
      y -= hBande + 2;
    };
    bande('Vacances / autres', ws, (w) => d.vacances(w), (v) => [C(COUL_VAC[v]?.[1] || '#999999'), C(COUL_VAC[v]?.[2] || '#FFFFFF')]);
    bande('Apprentis', ws, (w) => d.apprentis(w), (v) => [C(COUL_APP[v] || '#999999'), BLANC]);
    txt('Évènements', M, y - hEv + 2.5, FB, 7.5, TEXTE);
    ws.forEach((w) => d.evenements(w).forEach((e, i) => {
      const cx = X(w) + 4 + (e.k / 6) * (cw - 8), cy = y - hEv / 2 - 1;
      page.drawCircle({ x: cx, y: cy + (i % 2) * 0, size: 2.6, color: C(COUL_EV[e.ev] || '#E67E22') });
    }));
    y -= hBande + 6;
    // une bande par matière
    for (const m of d.mats) {
      const [nP, nT] = d.compte(m);
      rect(M, y - hM, 4, hM, { color: C(m.couleur) });
      lignes(m.nom, FB, 8.5, LIB - 14, 2).forEach((l, i) => txt(l, M + 8, y - 11 - i * 10, FB, 8.5, TEXTE));
      txt(`${nP} / ${nT} séances placées`, M + 8, y - 34, F, 6.5, GRIS);
      page.drawLine({ start: { x: x0, y: y - hM - 2 }, end: { x: W - M, y: y - hM - 2 }, thickness: 0.4, color: LIGNE });
      // séquences (fine bande)
      plages(ws, (w) => { const x = d.seance(m, w); return x ? String(x.seq.id) : ''; }).forEach((p) => {
        const x = d.seance(m, p.debut), xx = X(p.debut), w = (p.fin - p.debut + 1) * cw;
        rect(xx + 0.5, y - 10, w - 1, 10, { color: mix(m.couleur, 0.3) });
        const t = couper(`Séq. ${x.seq.numero}${x.seq.intitule ? ' · ' + x.seq.intitule : ''}`, FB, 6, w - 4); if (t) txt(t, xx + 2, y - 7.5, FB, 6, TEXTE);
      });
      // séances (blocs)
      plages(ws, (w) => d.cle(m, w)).forEach((p) => {
        const xx = X(p.debut), w = (p.fin - p.debut + 1) * cw, x = d.seance(m, p.debut), hb = hM - 14;
        const yb = y - 12 - hb;
        rect(xx + 0.8, yb, w - 1.6, hb, { color: x ? mix(m.couleur, 0.22) : C('#ECEFEE'), borderColor: x ? C(m.couleur) : LIGNE, borderWidth: 0.6 });
        if (x) rect(xx + 0.8, yb, 2, hb, { color: C(m.couleur) });
        const wt = w - 6;
        if (x) {
          txt(couper(x.num, FB, 7, wt), xx + 4, y - 20, FB, 7, C(m.couleur));
          if (w < 48) {                                                  // bloc étroit : titre écrit verticalement
            const n = Math.max(1, Math.floor((w - 5) / 6.4));
            lignes(x.titre || '', F, 5.6, hb - 18, n).forEach((l, i) => page.drawText(l, { x: xx + 3 + 6.4 * (i + 1), y: yb + 3, font: F, size: 5.6, color: TEXTE, rotate: degrees(90) }));
          } else lignes(x.titre || '', F, 5.6, wt, Math.max(1, Math.floor((hb - 12) / 6.6))).forEach((l, i) => txt(l, xx + 4, y - 28 - i * 6.6, F, 5.6, TEXTE));
        } else lignes(d.texte(m, p.debut), FI, 5.8, wt, Math.max(1, Math.floor((hb - 4) / 6.8))).forEach((l, i) => txt(l, xx + 4, y - 20 - i * 6.8, FI, 5.8, GRIS));
      });
      y -= hM + 4;
    }
    legende(M + 8);
  }

  // ------------------------------------------------------------------------------------------- tableau
  function tableau(a) {
    const moities = [Array.from({ length: 22 }, (_, i) => a * SEM_AN + i), Array.from({ length: SEM_AN - 22 }, (_, i) => a * SEM_AN + 22 + i)];
    moities.forEach((ws, mi) => {
      const de = jourDe(d.Y, ws[0], 2), a2 = jourDe(d.Y, ws[ws.length - 1], 2);
      let y = nouvellePage('PROGRESSION · TABLEAU', `Promotion ${d.promo}  ·  ${libAnnee(a)}  ·  ${MOIS[de.getMonth()]} ${de.getFullYear()} à ${MOIS[a2.getMonth()]} ${a2.getFullYear()}  ·  partie ${mi + 1} / 2`);
      const fixes = [['Semaine', 62], ['Évènements', 92], ['Apprentis', 46], ['Vacances', 48]];
      const reste = W - 2 * M - fixes.reduce((s, c) => s + c[1], 0), cm = reste / Math.max(1, d.mats.length);
      const cols = [...fixes.map(([t, w]) => ({ t, w })), ...d.mats.map((m) => ({ t: m.nom, w: cm, m }))];
      let x = M; cols.forEach((c) => { c.x = x; x += c.w; });
      const hT = 24, hL = (y - M - 30 - hT) / ws.length;
      // en-tête
      cols.forEach((c) => {
        rect(c.x, y - hT, c.w, hT, { color: c.m ? C(c.m.couleur) : C('#146B63'), borderColor: BLANC, borderWidth: 0.6 });
        const l = lignes(c.t, FB, 7.5, c.w - 6, 2);
        l.forEach((t, i) => txt(t, c.x + (c.w - larg(t, FB, 7.5)) / 2, y - (l.length === 1 ? 14.5 : 10 + i * 9), FB, 7.5, BLANC));
      });
      y -= hT;
      let moisP = null;
      ws.forEach((w) => {
        const v = d.vacances(w), ap = d.apprentis(w), mois = jourDe(d.Y, w, 2).getMonth();
        const fondL = v ? mix(COUL_VAC[v]?.[0] || '#F6B3AA', 0.85) : null;
        if (fondL) rect(M, y - hL, W - 2 * M, hL, { color: fondL });
        // semaine
        rect(cols[0].x, y - hL, cols[0].w, hL, { color: C('#EFF1F0') });
        txt('S' + semaineIso(lundi(d.Y, w)), cols[0].x + 4, y - 9, FB, 7.5, FONCE);
        txt(`${jj(lundi(d.Y, w))} > ${jj(jourDe(d.Y, w, 4))}`, cols[0].x + 4, y - 17.5, F, 6, GRIS);
        // évènements
        d.evenements(w).slice(0, Math.max(1, Math.floor((hL - 3) / 7.2))).forEach((e, i) => {
          page.drawCircle({ x: cols[1].x + 5, y: y - 6.5 - i * 7.2, size: 2, color: C(COUL_EV[e.ev] || '#E67E22') });
          txt(couper(`${JOURS[e.k]} ${jj(jourDe(d.Y, w, e.k))} : ${e.ev}`, F, 6, cols[1].w - 12), cols[1].x + 10, y - 8.5 - i * 7.2, F, 6, TEXTE);
        });
        // apprentis, vacances
        if (ap) { rect(cols[2].x + 3, y - hL + 3, cols[2].w - 6, hL - 6, { color: C(COUL_APP[ap] || '#999999') }); const t = couper(ap, FB, 6.5, cols[2].w - 8); txt(t, cols[2].x + (cols[2].w - larg(t, FB, 6.5)) / 2, y - hL / 2 - 2.3, FB, 6.5, BLANC); }
        if (v) { rect(cols[3].x + 3, y - hL + 3, cols[3].w - 6, hL - 6, { color: C(COUL_VAC[v]?.[1] || '#999999') }); const t = couper(v, FB, 6.5, cols[3].w - 8); txt(t, cols[3].x + (cols[3].w - larg(t, FB, 6.5)) / 2, y - hL / 2 - 2.3, FB, 6.5, C(COUL_VAC[v]?.[2] || '#FFFFFF')); }
        // matières
        cols.slice(4).forEach((c) => {
          const m = c.m, x = d.seance(m, w), cle = d.cle(m, w);
          if (!cle) return;
          const suite = d.suite(m, w);
          const maxL = Math.max(1, Math.floor((hL - 10) / 6.8));
          if (x) {
            rect(c.x + 2, y - hL + 2, c.w - 4, hL - 4, { color: suite ? mix(m.couleur, 0.08) : mix(m.couleur, 0.2) });
            rect(c.x + 2, y - hL + 2, 2, hL - 4, { color: C(m.couleur) });
            if (suite) txt(couper(`${x.num} (suite)`, FI, 6.5, c.w - 12), c.x + 7, y - 10, FI, 6.5, GRIS);
            else {
              const tete = `${x.num}`, dx = larg(tete, FB, 7) + 4;
              txt(tete, c.x + 7, y - 10, FB, 7, C(m.couleur));
              lignes(x.titre || '', F, 6.2, c.w - 12 - dx, maxL).forEach((t, i) => txt(t, c.x + 7 + dx, y - 10 - i * 6.8, F, 6.2, TEXTE));
            }
          } else {
            rect(c.x + 2, y - hL + 2, c.w - 4, hL - 4, { color: C('#ECEFEE') });
            lignes(d.texte(m, w), FI, 6.2, c.w - 10, maxL).forEach((t, i) => txt(t, c.x + 5, y - 10 - i * 6.8, FI, 6.2, GRIS));
          }
        });
        // lignes
        const epais = moisP !== null && mois !== moisP;
        page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: epais ? 1.2 : 0.35, color: epais ? FONCE : LIGNE });
        if (epais || moisP === null) txt(MOIS[mois].toUpperCase(), cols[0].x + cols[0].w - larg(MOIS[mois].toUpperCase(), FB, 5) - 3, y - 6, FB, 5, C('#1E8F86'));
        moisP = mois;
        y -= hL;
      });
      page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.6, color: LIGNE });
      cols.forEach((c) => page.drawLine({ start: { x: c.x, y }, end: { x: c.x, y: y + hL * ws.length }, thickness: 0.35, color: LIGNE }));
      page.drawLine({ start: { x: W - M, y }, end: { x: W - M, y: y + hL * ws.length }, thickness: 0.35, color: LIGNE });
      legende(M + 8);
    });
  }

  for (const a of d.annees) {
    if (d.vues.includes('frise')) frise(a);
    if (d.vues.includes('tableau')) tableau(a);
  }
  pages.forEach((p, i) => {
    const n = `${i + 1} / ${pages.length}`;
    p.drawText(nettoyer(`Progression · promotion ${d.promo}`), { x: M, y: 12, size: 7, font: F, color: GRIS });
    p.drawText(n, { x: W - M - F.widthOfTextAtSize(n, 7), y: 12, size: 7, font: F, color: GRIS });
  });
  return pdf.save();
}

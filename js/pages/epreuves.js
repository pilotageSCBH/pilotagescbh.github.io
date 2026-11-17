// Épreuves et CCF : les épreuves de l'examen pour la promotion (pré-remplies d'après le règlement d'examen du
// BTS SCBH), les dates de leurs situations (calendrier) et, pour chaque épreuve, une grille élèves × compétences
// évaluées, remplie avec le meilleur niveau déjà obtenu (contrats sommatifs, évaluations directes, N-1).
// Les élèves voient le calendrier et leur propre grille dans « Mes épreuves » (script SQL 39).
import { db } from '../api.js';
import { h, vider, toast, erreur, fenetre, confirmer, dateFr, imprimer } from '../ui.js';
import { niveau } from './contrat.js';
import { meilleursNiveaux, codesDe } from '../competencesPromo.js';
import { badgeRedoublant, badgePap } from '../redoublants.js';

// règlement d'examen du BTS SCBH (annexe IV) et compétences évaluées par unité (annexe V) — candidats scolaires
export const EPREUVES_SCBH = [
  { code: 'E1', unite: 'U1', intitule: 'Culture générale et expression', coefficient: 3, forme: 'Ponctuelle écrite', duree: '4 h', competences: [] },
  { code: 'E2', unite: 'U2', intitule: 'Langue vivante étrangère 1', coefficient: 3, forme: 'CCF · 2 situations', duree: '', competences: [] },
  { code: 'E31', unite: 'U31', intitule: 'Mathématiques', coefficient: 2, forme: 'CCF · 2 situations', duree: '55 min par situation', competences: [] },
  { code: 'E32', unite: 'U32', intitule: 'Physique-chimie', coefficient: 2, forme: 'CCF · 3 situations', duree: '2 h maxi par situation', competences: [] },
  { code: 'E41', unite: 'U41', intitule: 'Répondre à une affaire', coefficient: 2, forme: 'Ponctuelle orale', duree: '20 min', competences: ['C2-2', 'C2-3', 'C5-1'] },
  { code: 'E42', unite: 'U42', intitule: 'Analyse, dimensionnement et choix de composants', coefficient: 4, forme: 'Ponctuelle écrite', duree: '4 h', competences: ['C1-2'] },
  { code: 'E51', unite: 'U51', intitule: 'Conception de systèmes constructifs bois', coefficient: 6, forme: 'Ponctuelle pratique et orale', duree: '40 min', competences: ['C1-1', 'C1-4', 'C2-1', 'C2-4', 'C4-2', 'C5-2', 'C5-3', 'C6'] },
  { code: 'E52', unite: 'U52', intitule: 'Suivi de chantier (rapport de stage)', coefficient: 2, forme: 'Ponctuelle orale', duree: '30 min', competences: ['C3-1', 'C4-1', 'C4-3', 'C4-4'] },
  { code: 'E6', unite: 'U6', intitule: 'Expérimentation et mise en œuvre', coefficient: 4, forme: 'CCF · 2 situations', duree: '', competences: ['C1-3', 'C3-2', 'C3-3', 'C3-4'] },
  { code: 'EF1', unite: 'UF1', intitule: 'Langue vivante 2 (facultative)', coefficient: null, forme: 'Ponctuelle orale', duree: '20 min + 20 min de préparation', competences: [], facultative: true },
  { code: 'EF2', unite: 'UF2', intitule: 'Culture design et architecture (facultative)', coefficient: null, forme: 'CCF · 1 situation', duree: '20 min', competences: [], facultative: true },
];
const NIV = { A: 'niv-a', EVA: 'niv-eva', NA: 'niv-na', NE: 'niv-ne' };

export async function pageEpreuves(zone, _arg, ctx) {
  const P = ctx.promo, ref = await ctx.referentiel(), modif = ctx.peutEcrire();
  let epreuves;
  try { epreuves = await db.lire('epreuves', `promotion_id=eq.${P.id}&order=ordre,id`); }
  catch (e) {
    vider(zone, h('header', { class: 'entete-page' }, h('h1', {}, '🎓  Épreuves et CCF')),
      h('div', { class: 'erreur-page' }, h('h2', {}, 'Pas encore installé'), h('p', {}, 'L’administrateur doit exécuter le script « 39_stages_epreuves_annonces.sql » dans Supabase, puis recharger la page.'), h('p', { class: 'aide' }, e.message)));
    return;
  }
  const eleves = (await db.lire('eleves', `promotion_id=eq.${P.id}&order=nom,prenom`)).filter((e) => !e.arret);
  const best = await meilleursNiveaux(ctx, eleves);
  const familles = [...new Map(ref.competences.map((c) => [c.famille, c.famille_libelle])).entries()];
  const libFamille = (f) => familles.find(([k]) => k === f)?.[1] || '';
  const ouvertes = new Set();
  const sousTitre = h('p', { class: 'sous-titre' });
  const corps = h('div', {});

  const situations = () => epreuves.flatMap((x) => (x.situations || []).map((s, i) => ({ x, s, i }))).sort((a, b) => String(a.s.debut || '9999').localeCompare(String(b.s.debut || '9999')));
  function dessiner() {
    sousTitre.textContent = `Promotion ${P.libelle} · ${epreuves.length} épreuve(s)`;
    const sit = situations(), auj = new Date().toISOString().slice(0, 10);
    vider(corps,
      !epreuves.length ? h('div', { class: 'carte-detail accueil-cours' }, h('h2', {}, 'Aucune épreuve pour cette promotion'),
        h('p', {}, 'Importez les épreuves du BTS SCBH (règlement d’examen : formes, coefficients, compétences évaluées), puis placez les dates des situations.'),
        modif ? h('button', { class: 'btn principal', onclick: importer }, '⇩ Importer les épreuves du BTS SCBH') : null) : null,
      sit.length ? h('section', { class: 'bloc' }, h('h2', {}, '📅 Calendrier des épreuves'),
        h('table', { class: 'liste calendrier-epreuves' }, h('thead', {}, h('tr', {}, ['Date', 'Épreuve', 'Situation', 'Lieu'].map((t) => h('th', {}, t)))),
          h('tbody', {}, sit.map(({ x, s }) => h('tr', { class: s.fin ? (s.fin < auj ? 'passee' : '') : (s.debut && s.debut < auj ? 'passee' : '') },
            h('td', { class: 'num' }, s.debut ? dateFr(s.debut) + (s.fin && s.fin !== s.debut ? ' → ' + dateFr(s.fin) : '') : 'à fixer'),
            h('td', {}, h('b', {}, x.code), ' ', x.intitule), h('td', {}, s.libelle || ''), h('td', {}, s.lieu || '')))))) : null,
      epreuves.length ? h('section', { class: 'grille-epreuves' }, epreuves.map(carte)) : null);
  }
  function carte(x) {
    const comps = (x.competences || []).flatMap((c) => codesDe(ref.competences, c));
    const ouverte = ouvertes.has(x.id);
    // part des compétences de l'épreuve déjà acquises (A) par la promotion
    let a = 0, t = 0; for (const e of eleves) for (const c of comps) { const b = best.get(e.id)?.get(c.code); if (b) { t++; if (niveau(b.n).code === 'A') a++; } }
    return h('article', { class: 'carte-epreuve' + (x.facultative ? ' facultative' : '') },
      h('div', { class: 'tete-epreuve' }, h('span', { class: 'code-epreuve' }, x.code), h('div', {}, h('h3', {}, x.intitule),
        h('p', { class: 'gris' }, [x.unite, x.coefficient ? `coefficient ${String(x.coefficient).replace('.', ',')}` : (x.facultative ? 'facultative' : ''), x.forme, x.duree].filter(Boolean).join(' · '))),
        modif ? h('button', { class: 'lien petit ecran', onclick: () => editer(x) }, '✎ modifier') : null),
      (x.competences || []).length ? h('div', { class: 'comps-epreuve' }, x.competences.map((c) => h('span', { class: 'chip-comp', title: libFamille(c) }, c, ' ', h('small', {}, libFamille(c))))) : null,
      (x.situations || []).length ? h('ul', { class: 'situations' }, x.situations.map((s) => h('li', {}, '📅 ', h('b', {}, s.libelle || 'Situation'), ' · ', s.debut ? dateFr(s.debut) + (s.fin && s.fin !== s.debut ? ' → ' + dateFr(s.fin) : '') : 'date à fixer', s.lieu ? ' · ' + s.lieu : '', s.note ? h('span', { class: 'gris' }, ' · ' + s.note) : null)))
        : h('p', { class: 'gris petit' }, 'Dates des situations à fixer.'),
      x.notes ? h('p', { class: 'notes-stage' }, x.notes) : null,
      comps.length ? h('div', { class: 'pied-epreuve' },
        h('span', {}, `Promotion : ${t ? Math.round((a / t) * 100) : 0} % de compétences acquises (${t} évaluation(s) sur ${eleves.length * comps.length} possibles)`),
        h('button', { class: 'btn petit', onclick: () => { ouverte ? ouvertes.delete(x.id) : ouvertes.add(x.id); dessiner(); } }, ouverte ? '▴ Masquer la grille' : '▾ Grille des élèves')) : null,
      ouverte ? grille(comps) : null);
  }
  function grille(comps) {
    return h('div', { class: 'tableau-defile' }, h('table', { class: 'validation grille-epreuve' },
      h('thead', {}, h('tr', {}, h('th', { class: 'nom' }, 'Élève'), comps.map((c) => h('th', { class: 'comp', title: `${c.code} · ${c.libelle}` }, h('span', {}, c.code))), h('th', {}, 'A'), h('th', {}, 'à évaluer'))),
      h('tbody', {}, eleves.map((e) => {
        let a = 0, ne = 0;
        const cells = comps.map((c) => { const b = best.get(e.id)?.get(c.code), nv = niveau(b ? b.n : null).code; if (nv === 'A') a++; if (nv === 'NE') ne++;
          return h('td', { class: NIV[nv], title: `${c.code} : ${b ? nv + (b.date ? ' · ' + dateFr(b.date) : '') + (b.mat ? ' · ' + b.mat : '') : 'non évaluée'}` }, h('b', {}, nv)); });
        return h('tr', {}, h('td', { class: 'nom' }, h('b', {}, e.nom), ' ', e.prenom, ' ', badgeRedoublant(e, ctx), ' ', badgePap(e)), cells, h('td', { class: 'total' }, a), h('td', { class: 'total' }, ne));
      }))));
  }

  async function importer() {
    const deja = new Set(epreuves.map((x) => x.code));
    const aAjouter = EPREUVES_SCBH.filter((x) => !deja.has(x.code));
    if (!aAjouter.length) { toast('Toutes les épreuves du BTS SCBH sont déjà là.'); return; }
    try {
      const l = await db.ajouter('epreuves', aAjouter.map((x, i) => ({ ...x, facultative: !!x.facultative, promotion_id: P.id, ordre: (epreuves.length + i + 1) * 10, situations: [] })));
      epreuves.push(...l); toast(`${l.length} épreuve(s) importée(s)`); dessiner();
    } catch (e) { erreur(e); }
  }

  async function editer(x) {
    const v = x || { code: '', unite: '', intitule: '', coefficient: null, forme: '', duree: '', competences: [], situations: [], facultative: false, notes: '' };
    const ch = (k, ph = '') => h('input', { class: 'champ', value: v[k] ?? '', placeholder: ph });
    const F = { code: ch('code', 'ex. E51'), unite: ch('unite', 'ex. U51'), intitule: ch('intitule'), coefficient: ch('coefficient'), forme: ch('forme', 'ex. CCF · 2 situations'), duree: ch('duree', 'ex. 4 h') };
    const facu = h('input', { type: 'checkbox', checked: !!v.facultative });
    const coches = new Set(v.competences || []);
    const boiteC = h('div', { class: 'liste-choix comps-choix' }, familles.map(([f, lib]) => h('label', { class: 'option' }, h('input', { type: 'checkbox', checked: coches.has(f), onchange: (e) => (e.target.checked ? coches.add(f) : coches.delete(f)) }), h('b', {}, f), ' ', lib)));
    let sits = (v.situations || []).map((s) => ({ ...s }));
    const boiteS = h('div', { class: 'situations-edit' });
    const dessinerS = () => vider(boiteS, sits.map((s, i) => h('div', { class: 'ligne-situation' },
      h('input', { class: 'champ', value: s.libelle || '', placeholder: `Situation ${i + 1}`, oninput: (e) => { s.libelle = e.target.value; } }),
      h('input', { class: 'champ', type: 'date', value: s.debut || '', title: 'Début', oninput: (e) => { s.debut = e.target.value; } }),
      h('input', { class: 'champ', type: 'date', value: s.fin || '', title: 'Fin (facultatif)', oninput: (e) => { s.fin = e.target.value; } }),
      h('input', { class: 'champ', value: s.lieu || '', placeholder: 'Lieu', oninput: (e) => { s.lieu = e.target.value; } }),
      h('input', { class: 'champ', value: s.note || '', placeholder: 'Précision (facultatif)', oninput: (e) => { s.note = e.target.value; } }),
      h('button', { class: 'lien petit', type: 'button', title: 'Retirer', onclick: () => { sits.splice(i, 1); dessinerS(); } }, '✖'))),
      h('button', { class: 'btn petit', type: 'button', onclick: () => { sits.push({ libelle: `Situation ${sits.length + 1}` }); dessinerS(); } }, '＋ Situation'));
    dessinerS();
    const notes = h('textarea', { class: 'champ', rows: 2 }, v.notes || '');
    const boutons = [{ texte: 'Annuler', valeur: false }];
    if (x) boutons.unshift({ texte: 'Supprimer l’épreuve', classe: 'danger gauche', action: async () => {
      if (!(await confirmer('Supprimer l’épreuve', `Supprimer l’épreuve ${x.code} · ${x.intitule} et ses dates ?`, 'Supprimer'))) return false;
      await db.supprimer('epreuves', x.id); epreuves = epreuves.filter((y) => y.id !== x.id); return 'maj';
    } });
    boutons.push({ texte: 'Enregistrer', classe: 'principal', action: async () => {
      const d = Object.fromEntries(Object.entries(F).map(([k, el]) => [k, el.value.trim()]));
      if (!d.code && !d.intitule) throw new Error('Indiquez au moins le code ou l’intitulé.');
      d.coefficient = d.coefficient === '' ? null : Number(String(d.coefficient).replace(',', '.'));
      if (d.coefficient !== null && !Number.isFinite(d.coefficient)) throw new Error('Coefficient : un nombre.');
      Object.assign(d, { facultative: facu.checked, competences: familles.map(([f]) => f).filter((f) => coches.has(f)), notes: notes.value.trim(),
        situations: sits.map((s) => ({ libelle: (s.libelle || '').trim(), debut: s.debut || null, fin: s.fin || null, lieu: (s.lieu || '').trim(), note: (s.note || '').trim() })), maj_le: new Date().toISOString() });
      if (x) { const r = await db.modifier('epreuves', x.id, d); Object.assign(x, r || d); }
      else epreuves.push(await db.ajouter('epreuves', { ...d, promotion_id: P.id, ordre: (Math.max(0, ...epreuves.map((y) => y.ordre)) + 10) }));
      toast('Épreuve enregistrée'); return 'maj';
    } });
    const r = await fenetre(x ? `${x.code} · ${x.intitule}` : 'Nouvelle épreuve', h('div', { class: 'formulaire' },
      h('label', {}, 'Code', F.code), h('label', {}, 'Unité', F.unite), h('label', { class: 'large' }, 'Intitulé', F.intitule),
      h('label', {}, 'Coefficient', F.coefficient), h('label', { class: 'case-form' }, facu, ' Épreuve facultative'),
      h('label', {}, 'Forme', F.forme), h('label', {}, 'Durée', F.duree),
      h('div', { class: 'large' }, h('span', { class: 'lib-form' }, 'Situations et dates (visibles des élèves)'), boiteS),
      h('div', { class: 'large' }, h('span', { class: 'lib-form' }, 'Compétences évaluées'), boiteC),
      h('label', { class: 'large' }, 'Notes (enseignants seulement)', notes)), boutons, { large: true });
    if (r === 'maj') dessiner();
  }

  vider(zone,
    h('header', { class: 'entete-page' },
      h('div', {}, h('h1', {}, '🎓  Épreuves et CCF'), sousTitre),
      h('div', { class: 'actions-page' },
        modif ? h('button', { class: 'btn', onclick: importer, title: 'Ajouter les épreuves du règlement d’examen du BTS SCBH qui manquent' }, '⇩ Épreuves du BTS SCBH') : null,
        modif ? h('button', { class: 'btn principal', onclick: () => editer(null) }, '＋ Épreuve') : null,
        h('button', { class: 'btn', onclick: () => { epreuves.forEach((x) => ouvertes.add(x.id)); dessiner(); setTimeout(() => imprimer('A4 landscape'), 300); } }, '🖶  Imprimer / PDF'))),
    h('p', { class: 'aide ecran' }, 'Épreuves de l’examen (forme et coefficient pour les candidats scolaires, d’après le règlement d’examen), dates des situations et, pour chaque épreuve, la grille des élèves sur les compétences évaluées : meilleur niveau déjà obtenu dans les contrats sommatifs, les évaluations directes (ENT) et, pour les redoublants, la promotion d’origine. Les élèves voient le calendrier et leur propre grille dans « Mes épreuves ».'),
    corps);
  dessiner();
}

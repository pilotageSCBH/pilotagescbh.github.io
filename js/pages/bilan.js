// Bilan de l'année : effectifs, réalisé / prévu, couverture du référentiel, évaluations et compétences, stages, épreuves ;
// préparation de l'année suivante : séances prévues et non faites (à reporter), décision pour chaque élève.
import { db } from '../api.js';
import { h, vider, toast, erreur, dateFr, imprimer, fenetre } from '../ui.js';
import { chargerSuivi, semaineActuelle, SEM_AN, NB_SEM } from '../pilotage.js';
import { niveau } from './contrat.js';
import { meilleursNiveaux, codesDe } from '../competencesPromo.js';
import { badgeRedoublant, badgePap } from '../redoublants.js';

const DECISIONS = ['', 'Passe en 2e année', 'Redouble la 1re année', 'Diplôme visé cette session', 'Redouble la 2e année', 'Quitte la formation (réorientation)', 'Quitte la formation (emploi)', 'Autre'];

export async function pageBilan(zone, arg, ctx) {
  const P = ctx.promo, Y = P.annee_debut, ref = await ctx.referentiel();
  const wAuj = semaineActuelle(Y);
  let annee = arg === '2' ? 2 : arg === '1' ? 1 : (wAuj >= SEM_AN ? 2 : 1);
  const [D, tous] = await Promise.all([chargerSuivi(ctx), db.lire('eleves', `promotion_id=eq.${P.id}&order=nom,prenom`)]);
  const eleves = tous.filter((e) => !e.arret);
  const [best, stages, epreuves] = await Promise.all([meilleursNiveaux(ctx, eleves),
    db.lire('stages', `promotion_id=eq.${P.id}`).catch(() => null), db.lire('epreuves', `promotion_id=eq.${P.id}&order=ordre,id`).catch(() => null)]);
  const admin = ctx.estAdmin();
  const corps = h('div', {});
  const pc = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const barre = (p, cl = '') => h('div', { class: 'jauge-bilan ' + cl }, h('i', { style: { width: Math.min(100, p) + '%' } }), h('span', {}, p + ' %'));

  function dessiner() {
    const w0 = annee === 1 ? 0 : SEM_AN, w1 = annee === 1 ? SEM_AN : NB_SEM, fin = Math.min(w1, wAuj + 1);   // semaines déjà passées de l'année
    const dansAnnee = (w) => w >= w0 && w < w1;
    const cases = D.cases.filter((c) => c.seance_id && dansAnnee(c.semaine));
    const seancesAn = [...new Map(cases.map((c) => [c.seance_id, D.seances.get(c.seance_id)])).values()].filter(Boolean);
    const passees = [...new Map(cases.filter((c) => c.semaine < fin).map((c) => [c.seance_id, c])).values()];
    const faites = D.faites ? passees.filter((c) => D.faites.has(c.seance_id)) : [];
    const nonFaites = D.faites ? passees.filter((c) => !D.faites.has(c.seance_id)).map((c) => ({ c, x: D.seances.get(c.seance_id) })).filter((y) => y.x) : [];
    // couverture du référentiel par les séances de l'année
    const compsT = new Set(seancesAn.flatMap((x) => x.competences || []).filter((c) => ref.comp[c]));
    const savT = new Set(seancesAn.flatMap((x) => x.savoirs || []).filter((c) => ref.sav[c]));
    // compétences évaluées (meilleur niveau, toute la formation jusqu'ici)
    const n = { A: 0, EVA: 0, NA: 0, NE: 0 };
    for (const e of eleves) for (const c of ref.competences) { const b = best.get(e.id)?.get(c.code); n[b ? niveau(b.n).code : 'NE']++; }
    const ev = n.A + n.EVA + n.NA;
    const contratsAn = D.contrats.filter((c) => c.type === 'sommatif' && (!c.date_eval || (annee === 1 ? c.date_eval < `${Y + 1}-09-01` : c.date_eval >= `${Y + 1}-09-01`)));
    const evalsAn = D.evaluations.filter((v) => !v.date_eval || (annee === 1 ? v.date_eval < `${Y + 1}-09-01` : v.date_eval >= `${Y + 1}-09-01`));
    const mats = ctx.matieres.map((m) => {
      const cs = cases.filter((c) => D.seances.get(c.seance_id)?.mat?.id === m.id), ps = passees.filter((c) => D.seances.get(c.seance_id)?.mat?.id === m.id);
      return { m, prevues: new Set(cs.map((c) => c.seance_id)).size, passees: ps.length, faites: D.faites ? ps.filter((c) => D.faites.has(c.seance_id)).length : null };
    });
    const st = stages || [];
    vider(corps,
      h('section', { class: 'chiffres-cles' },
        h('div', { class: 'tuile' }, h('strong', {}, eleves.length), h('span', {}, 'en formation')),
        h('div', { class: 'tuile' }, h('strong', {}, eleves.filter((e) => e.statut === 'Apprenti').length), h('span', {}, 'apprentis')),
        h('div', { class: 'tuile' }, h('strong', {}, eleves.filter((e) => e.redoublant).length), h('span', {}, 'redoublant(s)')),
        h('div', { class: 'tuile' }, h('strong', {}, tous.length - eleves.length), h('span', {}, 'arrêt(s)')),
        h('div', { class: 'tuile' }, h('strong', {}, eleves.filter((e) => e.pap).length), h('span', {}, 'PAP'))),
      h('section', { class: 'bloc bilan-bloc' }, h('h2', {}, `🗂 Réalisé / prévu · ${annee === 1 ? '1re' : '2e'} année`),
        D.faites ? h('p', {}, `${faites.length} séance(s) faite(s) sur ${passees.length} prévue(s) aux semaines déjà passées (${seancesAn.length} séance(s) placée(s) sur l’année).`)
          : h('p', { class: 'aide' }, 'Le suivi des séances faites n’est pas encore installé (script SQL 33).'),
        h('table', { class: 'liste bilan-mat' }, h('thead', {}, h('tr', {}, ['Matière', 'Placées', 'Passées', 'Faites', 'Réalisé'].map((t) => h('th', {}, t)))),
          h('tbody', {}, mats.map(({ m, prevues, passees: p, faites: f }) => h('tr', {}, h('td', {}, h('span', { class: 'pastille', style: { background: m.couleur } }), ' ', m.nom),
            h('td', { class: 'num' }, prevues), h('td', { class: 'num' }, p), h('td', { class: 'num' }, f ?? '—'), h('td', {}, f === null ? '—' : barre(pc(f, p), pc(f, p) < 70 ? 'faible' : ''))))))),
      h('section', { class: 'bloc bilan-bloc' }, h('h2', {}, '📚 Couverture du référentiel'),
        h('div', { class: 'ligne-jauge' }, h('span', {}, `Compétences traitées dans les séances de l’année : ${compsT.size} / ${ref.competences.length}`), barre(pc(compsT.size, ref.competences.length))),
        h('div', { class: 'ligne-jauge' }, h('span', {}, `Savoirs traités : ${savT.size} / ${ref.savoirs.length}`), barre(pc(savT.size, ref.savoirs.length)))),
      h('section', { class: 'bloc bilan-bloc' }, h('h2', {}, '🏅 Évaluations et compétences'),
        h('p', {}, `${contratsAn.length} contrat(s) sommatif(s) et ${evalsAn.length} résultat(s) intermédiaire(s) sur l’année.`),
        h('div', { class: 'ligne-jauge' }, h('span', {}, `Compétences évaluées (toute la formation) : ${pc(ev, ev + n.NE)} % des cases élève × compétence`), barre(pc(ev, ev + n.NE))),
        h('div', { class: 'barre-niv' }, [['A', 'a', 'Acquis'], ['EVA', 'eva', 'En voie'], ['NA', 'na', 'Non acquis']].map(([k, cl, l]) => n[k] ? h('span', { class: 'seg seg-' + cl, style: { flex: n[k] }, title: `${l} : ${n[k]}` }, `${l} ${pc(n[k], ev)} %`) : null))),
      stages ? h('section', { class: 'bloc bilan-bloc' }, h('h2', {}, '🏭 Stages et entreprises'),
        h('p', {}, `${st.length} période(s) · ${st.filter((s) => s.convention === 'Signée').length} convention(s) signée(s) · ${st.filter((s) => s.type === 'Stage' && s.attestation).length} attestation(s) de stage reçue(s) · ${eleves.filter((e) => !st.some((s) => s.eleve_id === e.id)).length} élève(s) sans période.`),
        h('a', { class: 'lien ecran', href: '#/stages' }, 'Ouvrir « Stages et entreprises » →')) : null,
      epreuves?.length ? h('section', { class: 'bloc bilan-bloc' }, h('h2', {}, '🎓 Épreuves'),
        h('table', { class: 'liste' }, h('thead', {}, h('tr', {}, ['Épreuve', 'Dates', 'Compétences acquises (promotion)'].map((t) => h('th', {}, t)))),
          h('tbody', {}, epreuves.map((x) => {
            const cs = (x.competences || []).flatMap((c) => codesDe(ref.competences, c)); let a = 0;
            for (const e of eleves) for (const c of cs) { const b = best.get(e.id)?.get(c.code); if (b && niveau(b.n).code === 'A') a++; }
            const dates = (x.situations || []).filter((s) => s.debut).map((s) => dateFr(s.debut));
            return h('tr', {}, h('td', {}, h('b', {}, x.code), ' ', x.intitule), h('td', {}, dates.join(', ') || 'à fixer'), h('td', {}, cs.length ? barre(pc(a, cs.length * eleves.length)) : '—'));
          })))) : null,
      h('section', { class: 'bloc bilan-bloc' }, h('h2', {}, '➡ Préparer l’année suivante'),
        h('h3', {}, `Séances prévues et non faites (${nonFaites.length})`),
        nonFaites.length ? h('ul', { class: 'liste-reporter' }, nonFaites.sort((a, b) => (a.x.mat?.ordre ?? 0) - (b.x.mat?.ordre ?? 0) || a.c.semaine - b.c.semaine).map(({ c, x }) => h('li', {},
          h('span', { class: 'pastille', style: { background: x.mat?.couleur } }), ' ', h('b', {}, `${x.mat?.nom || ''} ${x.seq?.numero ?? ''}.${x.numero}`), ' ', x.titre || 'Séance', h('span', { class: 'gris' }, ` · prévue semaine ${c.semaine + 1}`))))
          : h('p', { class: 'gris' }, D.faites ? 'Toutes les séances des semaines passées sont marquées faites.' : '—'),
        nonFaites.length ? h('p', { class: 'aide ecran' }, 'À reporter dans la progression (glisser la séance vers une semaine à venir), ou à marquer « faite » dans la progression si elle a bien eu lieu.') : null,
        h('h3', {}, 'Décision pour chaque élève'),
        h('table', { class: 'liste decisions' }, h('thead', {}, h('tr', {}, ['Élève', 'Statut', 'Compétences acquises', 'Décision / suite du parcours'].map((t) => h('th', {}, t)))),
          h('tbody', {}, eleves.map((e) => {
            let a = 0; for (const c of ref.competences) { const b = best.get(e.id)?.get(c.code); if (b && niveau(b.n).code === 'A') a++; }
            const sel = h('select', { class: 'champ', disabled: !admin, onchange: async () => { try { let v = sel.value; if (v === 'Autre') { const ch = h('input', { class: 'champ', value: DECISIONS.includes(e.devenir || '') ? '' : e.devenir || '' }); const ok = await fenetre(`Suite du parcours · ${e.prenom} ${e.nom}`, h('label', {}, 'Précisez', ch), [{ texte: 'Annuler', valeur: false }, { texte: 'Enregistrer', classe: 'principal', valeur: true }]); if (!ok) { dessiner(); return; } v = ch.value.trim() || 'Autre'; } await db.modifier('eleves', e.id, { devenir: v }); e.devenir = v; toast('Décision enregistrée'); dessiner(); } catch (x) { erreur(x); } } },
              (DECISIONS.includes(e.devenir || '') ? DECISIONS : [...DECISIONS, e.devenir]).map((d) => h('option', { value: d, selected: (e.devenir || '') === d }, d || '—')));
            return h('tr', {}, h('td', {}, h('b', {}, e.nom), ' ', e.prenom, ' ', badgeRedoublant(e, ctx), ' ', badgePap(e)), h('td', {}, e.statut),
              h('td', {}, barre(pc(a, ref.competences.length))), h('td', {}, sel));
          }))),
        admin ? h('p', { class: 'aide ecran' }, 'La décision est notée dans la fiche de l’élève (« Suite du parcours »). Pour inscrire un redoublant dans la promotion suivante : Élèves → « ↻ Accueillir des redoublants » (dans la nouvelle promotion). Pour reprendre le séquençage dans une nouvelle promotion : « Dupliquer » dans l’administration.')
          : h('p', { class: 'aide ecran' }, 'Seul l’administrateur enregistre les décisions.')));
  }

  vider(zone,
    h('header', { class: 'entete-page' },
      h('div', {}, h('h1', {}, '📊  Bilan de l’année'), h('p', { class: 'sous-titre' }, `Promotion ${P.libelle} · bilan et préparation de l’année suivante`)),
      h('div', { class: 'actions-page' },
        h('div', { class: 'bascule' }, [[1, '1re année'], [2, '2e année']].map(([a, t]) => h('button', { class: 'btn' + (annee === a ? ' principal' : ''), onclick: (ev) => { annee = a; ev.currentTarget.parentElement.querySelectorAll('button').forEach((b, i) => b.classList.toggle('principal', i === a - 1)); dessiner(); } }, t))),
        h('button', { class: 'btn', onclick: () => imprimer('A4 portrait') }, '🖶  Imprimer / PDF'))),
    corps);
  dessiner();
}

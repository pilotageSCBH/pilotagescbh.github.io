// Couverture des compétences ou des savoirs : pour chaque code du référentiel et chaque matière,
// « prévue » (case cochée par l'enseignant) et « traitée » (nombre de séances du séquençage qui la citent).
import { db } from '../api.js';
import { h, vider, toast, erreur, imprimer } from '../ui.js';

const STATUTS = {
  couverte: ['Couverte', 'st-ok'], prevue: ['Prévue, pas encore traitée', 'st-prevue'], non: ['Non couverte', 'st-non'],
};

export async function pageCouverture(zone, arg, ctx) {
  const type = arg === 'savoirs' ? 'savoir' : 'competence';
  const ref = await ctx.referentiel();
  const items = type === 'competence' ? ref.competences : ref.savoirs;
  const col = type === 'competence' ? 'competences' : 'savoirs';
  const [sequences, coches] = await Promise.all([
    db.lire('sequences', `promotion_id=eq.${ctx.promo.id}`), db.lire('couverture', `promotion_id=eq.${ctx.promo.id}&type=eq.${type}`)]);
  const seances = sequences.length ? await db.lire('seances', `sequence_id=in.(${sequences.map((s) => s.id).join(',')})`) : [];
  const prevues = new Set(coches.map((c) => `${c.matiere_id}:${c.code}`));
  let filtre = 'tout';

  // séances de chaque matière qui citent chaque code
  const traitees = new Map();
  for (const x of seances) {
    const sq = sequences.find((s) => s.id === x.sequence_id);
    for (const c of x[col] || []) {
      const k = `${sq.matiere_id}:${c}`;
      traitees.set(k, (traitees.get(k) || []).concat(`${sq.numero}.${x.numero}`));
    }
  }
  const groupe = (it) => (type === 'competence' ? `${it.famille} · ${it.famille_libelle}` : (it.code.match(/^S\d\d?/) || [''])[0]);
  const statut = (it) => {
    const tot = ctx.matieres.reduce((a, m) => a + (traitees.get(`${m.id}:${it.code}`) || []).length, 0);
    if (tot > 0) return 'couverte';
    return ctx.matieres.some((m) => prevues.has(`${m.id}:${it.code}`)) ? 'prevue' : 'non';
  };

  function dessiner() {
    const compte = { couverte: 0, prevue: 0, non: 0 };
    items.forEach((it) => compte[statut(it)]++);
    const lignes = [];
    let g = null;
    for (const it of items) {
      const st = statut(it);
      if (filtre !== 'tout' && st !== filtre) continue;
      if (groupe(it) !== g) { g = groupe(it); lignes.push(h('tr', { class: 'ligne-groupe' }, h('td', { colspan: 3 + ctx.matieres.length * 2 }, g))); }
      let total = 0;
      lignes.push(h('tr', {},
        h('td', { class: 'code' }, it.code),
        h('td', { class: 'lib' }, it.libelle, type === 'savoir' && it.taxonomie ? h('span', { class: 'taxo' }, ` · niveau ${it.taxonomie}`) : null),
        ctx.matieres.flatMap((m) => {
          const k = `${m.id}:${it.code}`, p = prevues.has(k), t = traitees.get(k) || [];
          total += t.length;
          const etat = p && t.length ? 'ok' : p ? 'attente' : t.length ? 'hors' : '';
          return [
            h('td', { class: 'prevue ' + etat }, h('input', { type: 'checkbox', checked: p, disabled: !ctx.peutMatiere(m.id), title: `Prévue en ${m.nom}`,
              onchange: (e) => cocher(m, it.code, e.target.checked, e.target) })),
            h('td', { class: 'nb ' + etat, title: t.length ? 'Séances : ' + t.join(', ') : '' }, t.length || ''),
          ];
        }),
        h('td', { class: 'total' }, total),
        h('td', { class: 'statut ' + STATUTS[st][1] }, STATUTS[st][0])));
    }
    vider(zone,
      h('header', { class: 'entete-page' }, h('div', {}, h('h1', {}, type === 'competence' ? 'Couverture des compétences' : 'Couverture des savoirs associés'),
        h('p', { class: 'sous-titre' }, `Promotion ${ctx.promo.libelle}  ·  « Prévue » : à cocher par l’enseignant ; « Séances » : calculé d’après les séquençages`)),
        h('div', { class: 'actions-page' },
          h('select', { class: 'champ choix-mat', onchange: (e) => { filtre = e.target.value; dessiner(); } },
            [['tout', 'Tout afficher'], ['non', 'Non couvertes'], ['prevue', 'Prévues, pas encore traitées'], ['couverte', 'Couvertes']]
              .map(([v, t]) => h('option', { value: v, selected: v === filtre }, t))),
          h('button', { class: 'btn', onclick: () => imprimer('A3 landscape') }, '🖶  Imprimer'))),
      h('section', { class: 'chiffres-cles' },
        h('div', { class: 'tuile' }, h('strong', {}, `${compte.couverte} / ${items.length}`), h('span', {}, 'couvertes (au moins une séance)')),
        h('div', { class: 'tuile' }, h('strong', {}, compte.prevue), h('span', {}, 'prévues, pas encore traitées')),
        h('div', { class: 'tuile' }, h('strong', {}, compte.non), h('span', {}, 'non couvertes'))),
      h('p', { class: 'legende-couv' }, h('span', { class: 'ok' }, 'prévue et traitée'), h('span', { class: 'attente' }, 'prévue, sans séance'),
        h('span', { class: 'hors' }, 'traitée sans être cochée « prévue »')),
      h('div', { class: 'tableau-couverture' }, h('table', { class: 'couverture' },
        h('thead', {},
          h('tr', {}, h('th', { rowspan: 2 }, 'Code'), h('th', { rowspan: 2 }, type === 'competence' ? 'Compétence' : 'Savoir associé'),
            ctx.matieres.map((m) => h('th', { colspan: 2, class: 'mat', style: { '--couleur': m.couleur } }, m.nom)),
            h('th', { rowspan: 2 }, 'Total'), h('th', { rowspan: 2 }, 'Statut')),
          h('tr', {}, ctx.matieres.flatMap(() => [h('th', { class: 'sous' }, 'Prévue'), h('th', { class: 'sous' }, 'Séances')]))),
        h('tbody', {}, lignes))));
  }

  async function cocher(m, code, oui, caseACocher) {
    try {
      if (oui) await db.enregistrer('couverture', [{ promotion_id: ctx.promo.id, matiere_id: m.id, type, code }], 'promotion_id,matiere_id,type,code');
      else await db.supprimer('couverture', code, `promotion_id=eq.${ctx.promo.id}&matiere_id=eq.${m.id}&type=eq.${type}&code`);
      oui ? prevues.add(`${m.id}:${code}`) : prevues.delete(`${m.id}:${code}`);
      toast('Enregistré'); dessiner();
    } catch (e) { caseACocher.checked = !oui; erreur(e); }
  }

  dessiner();
}

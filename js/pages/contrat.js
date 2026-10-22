// Contrat d'évaluation (sommatif d'une séquence ou formatif d'une séance) : en-tête, critères, grille de notation des élèves.
// Note de 0 à 5 (ou NE) par critère ; moyenne pondérée par les coefficients :
//   < 2 → NA (non acquis) · 2 à < 4 → EVA (en voie d'acquisition) · ≥ 4 → A (acquis) · aucune note → NE.
import { db } from '../api.js';
import { h, vider, champ, toast, erreur, confirmer, dateFr } from '../ui.js';

export const FORMES = ['Devoir surveillé', 'Travaux pratiques', 'QCM', 'Exposé oral', 'Dossier', 'Étude de cas', 'Mise en situation'];
export const LIEUX = ['En salle', 'En atelier', 'En extérieur', 'À la maison'];
export const ORGAS = ['Individuel', 'Binôme', 'Demi-classe', 'Classe entière'];

export function niveau(n) {
  if (n === null || n === undefined) return { code: 'NE', lib: 'non évalué' };
  if (n < 2) return { code: 'NA', lib: 'non acquis' };
  if (n < 4) return { code: 'EVA', lib: 'en voie d’acquisition' };
  return { code: 'A', lib: 'acquis' };
}
export const arrondi = (n) => (n === null ? '' : String(Math.round(n * 10) / 10).replace('.', ','));
// moyenne pondérée des notes (0 à 5) d'un élève sur une liste de critères ; null si aucune note chiffrée
export function moyenne(criteres, notes, eleveId) {
  let s = 0, c = 0;
  for (const k of criteres) {
    const v = notes.get(`${k.id}:${eleveId}`);
    if (v === undefined || v === 'NE' || v === '') continue;
    const co = Number(k.coefficient) || 0;
    s += Number(v) * co; c += co;
  }
  return c > 0 ? s / c : null;
}

// zone : élément où dessiner ; opts : {type, id (séquence ou séance), modif, ctx, titreGroupe(groupe) → {code, libelle}}
export async function dessinerContrat(zone, opts) {
  const { type, ctx, modif } = opts;
  const champCle = type === 'sommatif' ? 'sequence_id' : 'seance_id';
  let contrat = (await db.lire('contrats', `type=eq.${type}&${champCle}=eq.${opts.id}`))[0];
  if (!contrat && modif) {
    try { const id = await db.rpc(type === 'sommatif' ? 'contrat_sommatif' : 'contrat_formatif', type === 'sommatif' ? { s: opts.id } : { x: opts.id });
      contrat = (await db.lire('contrats', `id=eq.${id}`))[0]; } catch (e) { erreur(e); }
  }
  if (!contrat) { vider(zone, h('p', { class: 'vide' }, 'Le contrat n’a pas encore été créé par l’enseignant de la matière.')); return; }
  const eleves = (await db.lire('eleves', `promotion_id=eq.${ctx.promo.id}&order=nom,prenom`)).filter((e) => !e.arret);
  let criteres = await db.lire('criteres', `contrat_id=eq.${contrat.id}&order=groupe_ordre,ordre,id`);
  const notesL = criteres.length ? await db.lire('notes', `critere_id=in.(${criteres.map((k) => k.id).join(',')})&order=critere_id,eleve_id`) : [];
  const notes = new Map(notesL.map((n) => [`${n.critere_id}:${n.eleve_id}`, n.valeur]));
  let voirRetires = false;

  const majContrat = (col) => async (v) => { await db.modifier('contrats', contrat.id, { [col]: v || (col === 'date_eval' ? null : '') }); contrat[col] = v; };
  const liste = (id, valeurs) => h('datalist', { id }, valeurs.map((v) => h('option', { value: v })));

  function dessiner() {
    const groupes = [];
    for (const k of criteres) {
      let g = groupes.find((x) => x.nom === k.groupe);
      if (!g) { g = { nom: k.groupe, ordre: k.groupe_ordre, criteres: [] }; groupes.push(g); }
      g.criteres.push(k);
    }
    groupes.sort((a, b) => a.ordre - b.ordre);
    const actifs = (g) => g.criteres.filter((k) => k.actif);
    const finale = (e) => {
      if (type === 'sommatif') {
        const ms = groupes.map((g) => moyenne(actifs(g), notes, e.id)).filter((x) => x !== null);
        return ms.length ? ms.reduce((a, b) => a + b, 0) / ms.length : null;
      }
      return moyenne(criteres.filter((k) => k.actif), notes, e.id);
    };
    const n5 = (n) => { const nv = niveau(n); return h('td', { class: 'moy niv-' + nv.code.toLowerCase(), title: nv.lib }, n === null ? 'NE' : h('span', {}, h('b', {}, nv.code), h('small', {}, arrondi(n)))); };

    const tete = h('div', { class: 'grille-infos contrat-infos' },
      h('label', {}, 'Date', champ(contrat.date_eval || '', majContrat('date_eval'), { type: 'date', lecture: !modif })),
      h('label', {}, 'Type', h('div', { class: 'valeur' }, type === 'sommatif' ? 'Évaluation sommative' : 'Évaluation formative')),
      h('label', {}, 'Forme', champ(contrat.forme, majContrat('forme'), { lecture: !modif, placeholder: 'ex. Devoir surveillé' })),
      h('label', {}, 'Lieu', champ(contrat.lieu, majContrat('lieu'), { lecture: !modif, placeholder: 'ex. En salle' })),
      h('label', {}, 'Organisation', champ(contrat.organisation, majContrat('organisation'), { lecture: !modif, placeholder: 'ex. Individuel' })),
      h('label', {}, 'Durée', champ(contrat.duree, majContrat('duree'), { lecture: !modif, placeholder: 'ex. 2 h' })),
      liste('dl-formes', FORMES), liste('dl-lieux', LIEUX), liste('dl-orgas', ORGAS));
    // listes de choix proposées (saisie libre possible)
    const inp = tete.querySelectorAll('input.champ');
    if (inp[1]) inp[1].setAttribute('list', 'dl-formes');
    if (inp[2]) inp[2].setAttribute('list', 'dl-lieux');
    if (inp[3]) inp[3].setAttribute('list', 'dl-orgas');

    const nomsEleves = eleves.map((e) => h('th', { class: 'eleve' }, h('span', {}, `${e.nom} ${e.prenom}`)));
    const lignes = [];
    for (const g of groupes) {
      const t = opts.titreGroupe(g.nom);
      lignes.push(h('tr', { class: 'groupe' },
        h('td', { colspan: 2 }, h('b', {}, t.code), t.libelle ? ' · ' + t.libelle : '',
          modif ? h('button', { class: 'lien petit clair', onclick: () => ajouterCritere(g) }, '＋ critère') : null),
        eleves.map(() => h('td', {}))));
      for (const k of g.criteres) {
        if (!k.actif && !voirRetires) continue;
        lignes.push(h('tr', { class: 'critere' + (k.actif ? '' : ' retire') },
          h('td', { class: 'texte-critere' },
            champ(k.texte, async (v) => { await db.modifier('criteres', k.id, { texte: v }); k.texte = v; }, { multi: true, lecture: !modif, placeholder: 'Critère d’évaluation observable' }),
            modif ? (k.actif ? h('button', { class: 'icone petit', title: 'Retirer ce critère', onclick: () => retirer(k) }, '✖')
              : h('button', { class: 'lien petit', onclick: () => remettre(k) }, 'remettre')) : null),
          h('td', { class: 'coef' }, champ(String(k.coefficient), async (v) => {
            const n = Number(String(v).replace(',', '.'));
            if (!Number.isFinite(n) || n < 0) throw new Error('Coefficient : un nombre positif.');
            await db.modifier('criteres', k.id, { coefficient: n }); k.coefficient = n; dessiner();
          }, { lecture: !modif, classe: 'centre' })),
          eleves.map((e) => celluleNote(k, e))));
      }
      lignes.push(h('tr', { class: 'ligne-moy' }, h('td', { colspan: 2 }, type === 'sommatif' ? `Niveau de la compétence ${t.code} (note / 5)` : 'Note de l’objectif / 5'),
        eleves.map((e) => n5(moyenne(actifs(g), notes, e.id)))));
    }
    if (type === 'formatif') lignes.push(h('tr', { class: 'ligne-moy forte' }, h('td', { colspan: 2 }, 'OBJECTIF INTERMÉDIAIRE (note / 5)'), eleves.map((e) => n5(finale(e)))));
    lignes.push(h('tr', { class: 'ligne-finale' }, h('td', { colspan: 2 }, 'NOTE FINALE / 20'),
      eleves.map((e) => { const f = finale(e); return h('td', { class: 'finale' }, f === null ? '—' : arrondi(f * 4)); })));

    vider(zone,
      tete,
      h('div', { class: 'barre-contrat' },
        h('span', { class: 'aide' }, type === 'sommatif'
          ? 'Critères = indicateurs de performance du référentiel pour chaque compétence de la séquence.'
          : 'Critères = résultats attendus du référentiel pour chaque objectif opérationnel de la séance.'),
        type === 'sommatif' && modif ? h('button', { class: 'btn petit', onclick: actualiser }, '↻ Ajouter les compétences ajoutées au séquençage') : null,
        criteres.some((k) => !k.actif) ? h('label', { class: 'interrupteur' }, h('input', { type: 'checkbox', checked: voirRetires, onchange: (e) => { voirRetires = e.target.checked; dessiner(); } }), 'voir les critères retirés') : null),
      eleves.length ? null : h('p', { class: 'aide' }, 'Aucun élève dans cette promotion : ajoutez-les dans la page Élèves.'),
      h('div', { class: 'tableau-defile' }, h('table', { class: 'grille-notes' },
        h('thead', {}, h('tr', {}, h('th', { class: 'col-critere' }, type === 'sommatif' ? 'Compétences et indicateurs de performance' : 'Objectifs opérationnels et critères d’évaluation'),
          h('th', { class: 'coef' }, 'Coef.'), nomsEleves)),
        h('tbody', {}, lignes))),
      h('div', { class: 'legende-niveaux' },
        h('span', { class: 'niv-na' }, 'NA : non acquis (0 à moins de 2 / 5)'), h('span', { class: 'niv-eva' }, 'EVA : en voie d’acquisition (2 à moins de 4)'),
        h('span', { class: 'niv-a' }, 'A : acquis (4 à 5)'), h('span', { class: 'niv-ne' }, 'NE : non évalué')));
    zone.querySelectorAll('textarea.champ').forEach((t) => { t.style.height = 'auto'; t.style.height = Math.max(t.scrollHeight + 2, 26) + 'px'; });
  }

  function celluleNote(k, e) {
    const cle = `${k.id}:${e.id}`, v = notes.get(cle) || '';
    const classe = (x) => 'note-sel n' + (x === '' ? 'vide' : x === 'NE' ? 'ne' : x);
    if (!modif || !k.actif) return h('td', { class: 'note' }, h('span', { class: classe(v) }, v));
    const s = h('select', { class: classe(v), title: `${e.nom} ${e.prenom}` }, ['', '0', '1', '2', '3', '4', '5', 'NE'].map((o) => h('option', { value: o, selected: o === v }, o)));
    s.addEventListener('change', async () => {
      const nv = s.value;
      try {
        if (nv === '') await db.supprimer('notes', k.id, `eleve_id=eq.${e.id}&critere_id`).catch(() => {});
        else await db.enregistrer('notes', [{ critere_id: k.id, eleve_id: e.id, valeur: nv }], 'critere_id,eleve_id');
        if (nv === '') notes.delete(cle); else notes.set(cle, nv);
        dessiner();
      } catch (x) { erreur(x); s.value = v; }
    });
    return h('td', { class: 'note' }, s);
  }

  async function ajouterCritere(g) {
    const ordre = Math.max(0, ...g.criteres.map((k) => k.ordre)) + 1;
    try {
      const k = await db.ajouter('criteres', { contrat_id: contrat.id, groupe: g.nom, groupe_ordre: g.ordre, ordre, texte: '', libre: true });
      criteres.push(k); criteres.sort((a, b) => a.groupe_ordre - b.groupe_ordre || a.ordre - b.ordre || a.id - b.id);
      dessiner();
      const t = zone.querySelectorAll('tr.critere textarea')[criteres.filter((x) => x.actif || voirRetires).indexOf(k)];
      if (t) t.focus();
    } catch (e) { erreur(e); }
  }
  async function retirer(k) {
    const n = eleves.filter((e) => notes.has(`${k.id}:${e.id}`)).length;
    if (!(await confirmer('Retirer le critère', `Retirer ce critère${n ? ` et ses ${n} note(s)` : ''} ?` + (k.libre ? '' : ' (Il pourra être remis : « voir les critères retirés ».)'), 'Retirer'))) return;
    try {
      if (k.libre) { await db.supprimer('criteres', k.id); criteres = criteres.filter((x) => x.id !== k.id); }
      else {
        await db.modifier('criteres', k.id, { actif: false }); k.actif = false;
        if (n) await db.supprimer('notes', k.id, 'critere_id');
        eleves.forEach((e) => notes.delete(`${k.id}:${e.id}`));
      }
      dessiner();
    } catch (e) { erreur(e); }
  }
  async function remettre(k) {
    try { await db.modifier('criteres', k.id, { actif: true }); k.actif = true; dessiner(); } catch (e) { erreur(e); }
  }
  async function actualiser() {
    try {
      await db.rpc('contrat_sommatif', { s: opts.id });
      criteres = await db.lire('criteres', `contrat_id=eq.${contrat.id}&order=groupe_ordre,ordre,id`);
      toast('Contrat à jour'); dessiner();
    } catch (e) { erreur(e); }
  }

  dessiner();
  return { contrat, dateFr };
}

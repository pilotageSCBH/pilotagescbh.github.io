// Tableau de bord : promotion, effectifs, avancement des séquençages de chaque matière.
import { db } from '../api.js';
import { h, vider, heures } from '../ui.js';
import { choixPromotion } from '../app.js';

export async function pageAccueil(zone, _arg, ctx) {
  const p = ctx.promo.id;
  const [eleves, sequences] = await Promise.all([db.lire('eleves', `promotion_id=eq.${p}`), db.lire('sequences', `promotion_id=eq.${p}`)]);
  const seances = sequences.length ? await db.lire('seances', `sequence_id=in.(${sequences.map((s) => s.id).join(',')})`) : [];
  const enFormation = eleves.filter((e) => !e.arret);
  const apprentis = enFormation.filter((e) => e.statut === 'Apprenti').length;
  const seqDe = (m) => sequences.filter((s) => s.matiere_id === m.id);
  const seaDe = (m) => { const ids = new Set(seqDe(m).map((s) => s.id)); return seances.filter((x) => ids.has(x.sequence_id)); };
  const remplie = (x) => !!(x.titre || x.objectif_inter);
  let totS = 0, totH = 0, totSeq = 0;

  const cartes = ctx.matieres.map((m) => {
    const sq = seqDe(m), se = seaDe(m).filter(remplie);
    const hrs = se.reduce((a, x) => a + (Number(x.duree) || 0), 0);
    const nSeq = sq.filter((s) => s.intitule).length;
    totS += se.length; totH += hrs; totSeq += nSeq;
    const etat = se.length === 0 ? ['À compléter', 'gris'] : ['En cours', 'vert'];
    const profs = ctx.enseignantsDe(m.id);
    return h('a', { class: 'carte-matiere', href: '#/sequencage/' + m.id, style: { '--couleur': m.couleur } },
      h('div', { class: 'bandeau' }, h('h3', {}, m.nom), h('span', { class: 'etat ' + etat[1] }, etat[0])),
      h('div', { class: 'profs' }, profs.length ? profs.join(' · ') : 'Enseignant à attribuer'),
      h('div', { class: 'chiffres' },
        h('div', {}, h('strong', {}, nSeq), h('span', {}, 'séquences')),
        h('div', {}, h('strong', {}, se.length), h('span', {}, 'séances')),
        h('div', {}, h('strong', {}, heures(hrs) || '0 h'), h('span', {}, 'volume'))),
      h('div', { class: 'ouvrir' }, ctx.peutMatiere(m.id) ? '▶  Ouvrir et modifier' : '▶  Consulter'));
  });

  vider(zone,
    h('header', { class: 'entete-page' },
      h('div', {}, h('h1', {}, 'Tableau de bord'),
        h('p', { class: 'sous-titre' }, 'BTS Systèmes Constructifs Bois et Habitat')),
      h('div', { class: 'actions-page' }, h('label', { class: 'grand-choix' }, 'Promotion affichée', choixPromotion('grand')))),
    h('section', { class: 'chiffres-cles' },
      h('div', { class: 'tuile' }, h('strong', {}, enFormation.length), h('span', {}, 'élèves en formation')),
      h('div', { class: 'tuile' }, h('strong', {}, apprentis), h('span', {}, 'apprentis')),
      h('div', { class: 'tuile' }, h('strong', {}, enFormation.length - apprentis), h('span', {}, 'scolaires')),
      h('div', { class: 'tuile' }, h('strong', {}, totSeq), h('span', {}, 'séquences')),
      h('div', { class: 'tuile' }, h('strong', {}, totS), h('span', {}, 'séances')),
      h('div', { class: 'tuile' }, h('strong', {}, heures(totH) || '0 h'), h('span', {}, 'volume total'))),
    h('h2', { class: 'titre-section' }, 'Matières professionnelles'),
    h('section', { class: 'grille-matieres' }, cartes),
    h('h2', { class: 'titre-section' }, 'Mode d’emploi'),
    h('section', { class: 'etapes' },
      [['1', 'Réglages', "Choisir la promotion dans le menu. L'administrateur règle les matières et l'équipe, puis autorise les comptes des collègues."],
       ['2', 'Séquences', 'Dans le séquençage de sa matière : intitulé et objectif principal de chaque séquence (10 au plus).'],
       ['3', 'Séances', 'Pour chaque séance : titre, durée, objectifs, cours, compétences et savoirs choisis dans le référentiel.'],
       ['4', 'Réorganiser', 'Glisser une séance par la poignée ⠿ pour la déplacer : la numérotation suit toute seule.'],
       ['5', 'Enregistrement', "Chaque case est enregistrée dès qu'on la quitte : rien à sauvegarder, les collègues voient la même chose."]]
        .map(([n, t, d]) => h('div', { class: 'etape' }, h('span', { class: 'num' }, n), h('h3', {}, t), h('p', {}, d)))));
}

// Page d'accueil (tableau de bord) présentée comme l'accueil d'un site : bandeau de bienvenue, accès rapides,
// « cette semaine » (évaluations, notes à saisir, alertes), la promotion en chiffres, les matières et un pied de page.
import { db, identifiantDe, emailConnecte } from '../api.js';
import { h, vider, heures, dateFr } from '../ui.js';
import { choixPromotion } from '../app.js';
import { chargerSuivi, listeEvaluations, calculerAlertes, mesMatieres, semaineActuelle, semaineIso, lundi, aujourdhui, semaineDe, SEM_AN, NB_SEM, TYPES_EVAL } from '../pilotage.js';

const majuscule = (t) => t.charAt(0).toUpperCase() + t.slice(1);

export async function pageAccueil(zone, _arg, ctx) {
  const P = ctx.promo;
  const [D, tous, ref] = await Promise.all([chargerSuivi(ctx), db.lire('eleves', `promotion_id=eq.${P.id}`), ctx.referentiel()]);
  const pc = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const seances = [...D.seances.values()];

  // ------------------------------------------------------------------ chiffres de la promotion
  const enFormation = tous.filter((e) => !e.arret), arrets = tous.length - enFormation.length;
  const apprentis = enFormation.filter((e) => e.statut === 'Apprenti').length;
  const redoublants = enFormation.filter((e) => e.redoublant).length;
  const compsTraitees = new Set(seances.flatMap((x) => x.competences || []).filter((c) => ref.comp[c]));
  const coeur = ref.competences.filter((c) => !ctx.transversale(c.code)), trans = ref.competences.filter((c) => ctx.transversale(c.code));
  const coeurT = coeur.filter((c) => compsTraitees.has(c.code)).length, transT = trans.filter((c) => compsTraitees.has(c.code)).length;
  const savTraites = new Set(seances.flatMap((x) => x.savoirs || []).filter((c) => ref.sav[c])).size;

  // ------------------------------------------------------------------ la semaine en cours
  const Y = D.Y, w = semaineActuelle(Y), auj = aujourdhui();
  const dansFormation = w >= 0 && w < NB_SEM;
  const sem = dansFormation ? D.semaines.get(w) || {} : {};
  const mats = mesMatieres(ctx), ids = new Set(mats.map((m) => m.id)), perso = ctx.matieres.some((m) => ctx.enseigne(m.id));
  const evals = listeEvaluations(D, ctx);
  const dans3sem = new Date(); dans3sem.setDate(dans3sem.getDate() + 21);
  const limite = `${dans3sem.getFullYear()}-${String(dans3sem.getMonth() + 1).padStart(2, '0')}-${String(dans3sem.getDate()).padStart(2, '0')}`;
  const prochaines = evals.filter((e) => e.date && e.date >= auj && e.date <= limite).sort((a, b) => a.date.localeCompare(b.date));
  const aNoter = evals.filter((e) => ids.has(e.mat.id) && e.type !== 'formatif' && e.date && e.date < auj && !e.notee);
  const alertes = calculerAlertes(D, ctx, ref, [...ids]);
  const nbImp = alertes.filter((a) => a.gravite === 3).reduce((s, a) => s + a.elements.length, 0);
  const nbAl = alertes.filter((a) => a.gravite >= 2).reduce((s, a) => s + a.elements.length, 0);
  const mesSeancesSemaine = dansFormation ? D.cases.filter((c) => c.semaine === w && c.seance_id && ids.has(c.matiere_id)).length : 0;

  // ------------------------------------------------------------------ bienvenue
  const nomAffiche = ctx.profil?.nom || identifiantDe(emailConnecte()) || '';
  const prenom = majuscule(String(nomAffiche).split(/[\s.]+/)[0] || '');
  const heure = new Date().getHours();
  const salut = heure >= 18 ? 'Bonsoir' : 'Bonjour';
  const dateDuJour = majuscule(new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
  const infoSemaine = !dansFormation ? 'hors période de formation'
    : `semaine ${semaineIso(lundi(Y, w))} · ${w < SEM_AN ? '1re' : '2e'} année${sem.vacances ? ' · ' + sem.vacances : ''}`;
  const monSeq = ctx.matieres.find((m) => ctx.enseigne(m.id));

  // ------------------------------------------------------------------ accès rapides
  const tuiles = [
    ['📘', 'Séquençages', 'Séquences et séances de chaque matière', monSeq ? '#/sequencage/' + monSeq.id : '#/synthese'],
    ['🗓', 'Progression', 'Placement des séances sur les deux années', '#/progression'],
    ['📂', 'Documents professeurs', 'Fiches de préparation, de déroulement et contrats', '#/fiches/preparation'],
    ['📆', 'Calendrier des évaluations', 'Toutes les évaluations de la promotion', '#/evaluations'],
    ['📌', 'Contrats hors séquence', 'Créer un contrat formatif ou sommatif sur n’importe quelle compétence', '#/contrats'],
    ['🏆', 'Résultats', 'Validation des compétences, moyennes, livrets', '#/validation'],
    ['📖', 'Référentiel', 'Activités, compétences et savoirs associés', '#/referentiel'],
    ['👥', 'Élèves', 'Liste, effectifs et fiches des élèves', '#/eleves'],
  ];

  const jauge = (lib, val, total, lien, detail) => h('a', { class: 'chiffre-ligne', href: lien },
    h('div', { class: 'chiffre-tete' }, h('span', {}, lib), h('b', {}, `${val} / ${total}`), h('em', {}, `${pc(val, total)} %`)),
    h('div', { class: 'chiffre-jauge' }, h('i', { style: { width: pc(val, total) + '%' } })),
    detail ? h('small', {}, detail) : null);

  vider(zone,
    // ---------------------------------------------------------------- bandeau d'accueil
    h('section', { class: 'hero-accueil' },
      h('div', { class: 'hero-texte' },
        h('p', { class: 'hero-sur' }, 'Lycée André Malraux · Remiremont'),
        h('h1', {}, prenom ? `${salut} ${prenom}` : salut),
        h('p', { class: 'hero-date' }, `${dateDuJour} · ${infoSemaine}`),
        h('p', { class: 'hero-accroche' }, 'Bienvenue sur l’espace de pilotage du BTS Systèmes constructifs bois et habitat : séquençages, progression, documents et résultats de la promotion, partagés par toute l’équipe.'),
        h('div', { class: 'hero-actions' },
          h('a', { class: 'hero-btn principal', href: '#/semaine' }, '🗓  Ma semaine'),
          monSeq ? h('a', { class: 'hero-btn', href: '#/sequencage/' + monSeq.id }, `📘  Mon séquençage · ${monSeq.nom}`) : null,
          h('a', { class: 'hero-btn', href: '#/progression' }, '▦  Progression'),
          ctx.peutEcrire() ? h('a', { class: 'hero-btn', href: '#/cours' }, '📚  Mes cours ressources') : null)),
      h('div', { class: 'hero-carte' },
        h('img', { src: 'img/logo.jpg', alt: 'BTS Systèmes constructifs bois et habitat' }),
        h('label', { class: 'hero-promo' }, h('span', {}, 'Promotion affichée'), choixPromotion('grand')))),

    // ---------------------------------------------------------------- accès rapides
    h('section', { class: 'bloc-accueil' },
      h('h2', { class: 'titre-accueil' }, 'Accès rapides'),
      h('div', { class: 'tuiles-accueil' }, tuiles.map(([ic, t, d, l]) => h('a', { class: 'tuile-accueil', href: l },
        h('span', { class: 'tuile-icone' }, ic), h('div', {}, h('h3', {}, t), h('p', {}, d)), h('span', { class: 'tuile-fleche' }, '→'))))),

    // ---------------------------------------------------------------- actualité + chiffres
    h('div', { class: 'accueil-colonnes' },
      h('section', { class: 'bloc-accueil carte-accueil' },
        h('div', { class: 'carte-accueil-tete' }, h('h2', { class: 'titre-accueil' }, 'À la une cette semaine'), h('a', { href: '#/semaine' }, 'Voir ma semaine →')),
        h('div', { class: 'puces-une' },
          h('a', { class: 'puce-une', href: '#/semaine' }, h('b', {}, mesSeancesSemaine), h('span', {}, perso ? 'séance(s) de mes matières cette semaine' : 'séance(s) placée(s) cette semaine')),
          h('a', { class: 'puce-une' + (aNoter.length ? ' attention' : ''), href: '#/semaine' }, h('b', {}, aNoter.length), h('span', {}, 'évaluation(s) à noter')),
          h('a', { class: 'puce-une' + (nbImp ? ' alerte' : nbAl ? ' attention' : ''), href: '#/alertes' }, h('b', {}, nbAl), h('span', {}, nbImp ? `alerte(s) dont ${nbImp} importante(s)` : 'alerte(s) de pilotage'))),
        h('h3', { class: 'sous-titre-une' }, 'Prochaines évaluations (3 semaines)'),
        prochaines.length ? h('ul', { class: 'liste-une' }, prochaines.slice(0, 6).map((e) => {
          const d = new Date(e.date + 'T12:00:00');
          return h('li', { class: ids.has(e.mat.id) && perso ? 'mienne' : '' },
            h('span', { class: 'date-une' }, h('b', {}, d.getDate()), h('small', {}, d.toLocaleDateString('fr-FR', { month: 'short' }))),
            h('div', {}, h('a', { href: e.lien }, e.titre), h('small', {}, h('i', { class: 'pastille', style: { background: e.mat.couleur } }), `${e.mat.nom} · ${TYPES_EVAL[e.type]} · ${d.toLocaleDateString('fr-FR', { weekday: 'long' })}`)));
        })) : h('p', { class: 'vide petit' }, 'Aucune évaluation datée dans les trois prochaines semaines.'),
        prochaines.length > 6 ? h('a', { class: 'lien-plus', href: '#/evaluations' }, `+ ${prochaines.length - 6} autre(s) : calendrier des évaluations →`) : null),

      h('section', { class: 'bloc-accueil carte-accueil' },
        h('div', { class: 'carte-accueil-tete' }, h('h2', { class: 'titre-accueil' }, `La promotion ${P.libelle} en chiffres`)),
        h('a', { class: 'effectif-accueil', href: '#/eleves' },
          h('div', { class: 'effectif-nb' }, h('b', {}, enFormation.length), h('span', {}, 'élèves en formation')),
          h('div', { class: 'effectif-detail' },
            h('div', { class: 'barre-effectif' }, h('i', { class: 'app', style: { flex: apprentis || 0.0001 } }), h('i', { class: 'sco', style: { flex: (enFormation.length - apprentis) || 0.0001 } })),
            h('small', {}, h('i', { class: 'pastille app' }), `${apprentis} apprenti(s)  `, h('i', { class: 'pastille sco' }), `${enFormation.length - apprentis} scolaire(s)`, redoublants ? `  ·  ${redoublants} redoublant(s)` : '', arrets ? `  ·  ${arrets} arrêt(s)` : ''))),
        h('p', { class: 'aide petit' }, 'Couverture du référentiel par les séances (au moins une séance)'),
        jauge('Compétences cœur de métier', coeurT, coeur.length, '#/couverture/competences', 'C1 à C4'),
        jauge('Compétences transversales', transT, trans.length, '#/couverture/competences', 'C5 et C6'),
        jauge('Savoirs associés', savTraites, ref.savoirs.length, '#/couverture/savoirs'))),

    // ---------------------------------------------------------------- matières
    h('section', { class: 'bloc-accueil' },
      h('h2', { class: 'titre-accueil' }, 'Les matières professionnelles'),
      h('div', { class: 'matieres-accueil' }, ctx.matieres.map((m) => {
        const sq = D.sequences.filter((s) => s.matiere_id === m.id);
        const se = seances.filter((x) => x.mat?.id === m.id && (x.titre || x.objectif_inter));
        const hrs = se.reduce((a, x) => a + (Number(x.duree) || 0), 0);
        const profs = ctx.enseignantsDe(m.id);
        return h('a', { class: 'matiere-accueil', href: '#/sequencage/' + m.id, style: { '--couleur': m.couleur } },
          h('span', { class: 'mat-pastille' }, ctx.codeMat(m)),
          h('div', { class: 'mat-corps' }, h('h3', {}, m.nom), h('p', {}, profs.length ? profs.join(' · ') : 'Enseignant à attribuer'),
            h('small', {}, `${sq.filter((s) => s.intitule).length} séquence(s) · ${se.length} séance(s) · ${heures(hrs) || '0 h'}`)),
          ctx.enseigne(m.id) ? h('span', { class: 'mat-mienne' }, 'ma matière') : null);
      }))),

    // ---------------------------------------------------------------- pied de page
    h('footer', { class: 'pied-accueil' },
      h('img', { src: 'img/logo.jpg', alt: '' }),
      h('div', {}, h('b', {}, 'BTS Systèmes constructifs bois et habitat'), h('span', {}, 'Lycée André Malraux · Remiremont (Vosges)'),
        h('span', { class: 'gris' }, 'Chaque modification est enregistrée automatiquement et partagée avec l’équipe.')),
      h('nav', {}, h('a', { href: '#/aide' }, '❓ Aide et mode d’emploi'), h('a', { href: '#/compte' }, '👤 Mon compte'), h('a', { href: '#/historique' }, '🕘 Historique des modifications'))));
}

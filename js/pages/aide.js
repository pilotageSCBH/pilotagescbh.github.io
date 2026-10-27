// Aide intégrée : prise en main de chaque partie de l'application.
import { h, vider } from '../ui.js';

const SECTIONS = [
  ['demarrer', 'Premiers pas', [
    ['Se connecter', "Identifiant = votre adresse académique, ou seulement « prenom.nom ». La première fois, cliquez sur « Première connexion ? Choisir mon code » : votre compte doit d'abord avoir été autorisé par l'administrateur."],
    ['Choisir la promotion', "Le menu « Promotion » (en haut du menu de gauche et sur le tableau de bord) change la promotion affichée dans toutes les pages. Chaque poste retient le dernier choix."],
    ['Cellules grises', "Une cellule grise est remplie automatiquement : calculée (moyennes, notes / 20 des contrats, nombre de séances, numéros, dates) ou reprise d'une autre page (les fiches reprennent le séquençage). Elle ne se modifie pas à cet endroit : modifiez la source (séquençage, notes du contrat…)."],
    ['Graphiques', "Les pages Élèves, Résultats, Validation, Couvertures, Synthèse, les contrats et le suivi des connexions présentent leurs chiffres en graphiques (sous les tableaux). Survolez une barre, une part ou un point pour lire la valeur exacte. Ils se mettent à jour avec les données et s'impriment avec la page."],
    ['Rien à enregistrer', "Chaque case est enregistrée dès que vous la quittez (elle devient brièvement verte). Les collègues voient la même chose ; rechargez la page (F5) pour voir leurs dernières modifications."],
    ['Qui peut modifier quoi ?', "Chaque enseignant modifie seulement les matières cochées pour lui dans « Matières et équipe » (séquençage, progression, fiches, contrats, résultats, couvertures) et consulte tout le reste. Le séquençage et la progression d'une matière sont réservés à ses enseignants, même pour un administrateur. Le calendrier commun (vacances, apprentis, évènements) est modifiable par tous les enseignants. Seul l'administrateur ajoute, modifie ou supprime les élèves. Un compte « Lecture seule » (DDFPT…) consulte tout sans rien pouvoir modifier."],
    ['Annuler', "Le bouton « ↶ Annuler » des pages à remplir défait votre dernière modification sur la page (survolez-le pour voir laquelle) ; cliquez de nouveau pour remonter plus loin. Un déplacement de séance ou une suppression de séquence comptent pour une seule opération. Seules vos propres modifications sont annulées, et une valeur changée depuis par un collègue n'est pas écrasée."],
    ['Code oublié', "Créez dès maintenant votre code de secours dans « Mon compte » et notez-le. En cas d'oubli : écran de connexion → « Code oublié ? » → identifiant + code de secours + nouveau code. Sans code de secours : « Prévenir l'administrateur » ; il vous donnera un code provisoire, que vous remplacerez par le vôtre en vous connectant."],
    ['Mettre à jour l’affichage', "Après une mise à jour de l'application, faites Ctrl + F5 pour être sûr d'avoir la dernière version."],
  ]],
  ['sequencage', 'Séquençages', [
    ['Séquences', "« Ajouter une séquence » crée une séquence numérotée (10 au plus par matière) ; saisissez son intitulé et son objectif principal dans l'en-tête. Le ✖ de l'en-tête supprime la séquence et renumérote les suivantes."],
    ['Séances', "Au survol du numéro d'une séance : ＋ insère une séance juste après, ✖ la supprime ; la numérotation suit toute seule. Pour réordonner, faites glisser la séance par la poignée ⠿."],
    ['Compétences et savoirs', "« ＋ choisir » ouvre la liste du référentiel avec une recherche : cochez les codes, leur libellé s'affiche dans la case."],
    ['Prérequis (antériorités)', "Colonne « Prérequis » : « ＋ séances prérequises » ouvre la liste de toutes les séances de la promotion, toutes matières (recherche possible) ; cochez celles qui doivent être faites avant. Elles s'affichent avec leur code (OR 1.2 = Organisation, séquence 1, séance 2). Le champ en dessous accueille d'autres prérequis rédigés librement. Dans la progression, « ⚠ antériorité » signale une séance placée avant l'une de ses séances prérequises (ou dont un prérequis n'est pas encore placé) ; la fiche de déroulement les reprend."],
    ['Objectifs opérationnels', "Un objectif par ligne. « ＋ depuis les tâches » ajoute des objectifs tirés des tâches professionnelles du référentiel, avec leur code [A1-T1] : il sert ensuite au contrat formatif."],
    ['Nouvelle promotion', "Dans une promotion vide, « Reprendre ce séquençage » recopie celui d'une autre promotion, modifiable ensuite."],
  ]],
  ['progression', 'Progression', [
    ['Vue frise', "Bouton « ▬ Frise » : la progression en frise chronologique, le temps de gauche à droite (mois, semaines), une bande par matière avec ses séquences et ses séances en blocs colorés, les vacances, PFMP et évènements en haut, la semaine en cours marquée d'un trait rouge. Glissez un bloc pour déplacer la séance, cliquez un bloc ou une case pour modifier, cliquez les lignes du haut pour les vacances, les apprentis et les évènements. « ☷ Tableau » revient à la vue habituelle ; le choix est mémorisé."],
    ['Le calendrier', "Une ligne par semaine sur deux années de 45 semaines (boutons « 1re année / 2e année »). Choisissez une seule matière en haut à droite pour voir le détail de ses séances."],
    ['Calendrier commun', "Cliquez un jour pour noter un évènement (Férié / pont, Sortie scolaire, Épreuve ou un texte). Les menus « Apprentis » et « Vacances / autres » se règlent par semaine ; une semaine de vacances, d'épreuves ou de stage ne reçoit pas de séance."],
    ['Placer une séance', "Cliquez une case : choisissez la séance, ou écrivez un texte libre, et une note pour la semaine. Avec une seule matière affichée, faites glisser une séance du bandeau « Séances à placer » vers une semaine : si elle est occupée, les suivantes descendent."],
    ['Déplacer une séance', "Faites-la glisser vers une autre semaine : elle y commence (avec toutes ses semaines si elle en dure plusieurs) et les séances situées entre les deux se décalent, en sautant les semaines de vacances."],
    ['Une séance sur plusieurs semaines', "Dans la fenêtre de la case : « Prolonger d’une semaine »."],
    ['Retirer une séance placée', "Au survol d'une séance, le petit ✖ rouge (ou « ✖ Retirer de la progression » dans la fenêtre de la case) la retire de toutes ses semaines : elle retourne dans « Séances à placer » et reste dans le séquençage. Sur une semaine « (suite) », le ✖ supprime seulement cette semaine. Dans la frise, « － » raccourcit un bloc d'une semaine. Cochez « Faire remonter les séances suivantes » pour combler la place libérée."],
    ['Commentaires', "Cliquez une séance placée : en bas de la fenêtre, chaque enseignant peut écrire un commentaire sur la séance, visible par tous ou, en cochant « Visible par moi seul », par lui seul (🔒). Une bulle 💬 indique les séances commentées. Vous pouvez modifier ou supprimer vos commentaires."],
  ]],
  ['fiches', 'Fiches et contrats', [
    ['Ouvrir les fiches', "Bouton vert « ▶ Fiches » d'une séquence (séquençage), ou menu « Fiches et contrats ». Onglets : préparation de séquence, contrat sommatif, puis un onglet par séance, qui sépare la « Fiche de déroulement » et le « Contrat d’évaluation formative » (deux boutons sous les onglets ; chacun s'imprime séparément)."],
    ['Télécharger', "Bouton « ⬇ Télécharger » : cochez les documents voulus (fiche de préparation, contrat sommatif, et pour chaque séance la fiche de déroulement avec le travail à la maison et le contrat formatif) — tous ou seulement certains. Chaque document est un PDF A4 portrait ; l'ensemble est regroupé dans un fichier .zip."],
    ['Travail à la maison (option)', "Dans la fiche de déroulement d'une séance : « ＋ Ajouter un travail préparatoire avant la séance (classe inversée) » ajoute un cadre avant le tableau du déroulement (objectif, travail demandé, ressources, exploitation en classe, date, durée) ; « ＋ Ajouter un travail à la maison après la séance (devoirs) » ajoute un cadre après le tableau (travail demandé, ressources, modalités de rendu, correction, date de rendu). « ✖ retirer » supprime un cadre. Ils s'impriment avec la fiche."],
    ['Ce qui est automatique', "Matière, enseignant, promotion, effectif, volume, objectifs, compétences et savoirs sont repris du séquençage : pour les modifier, passez par le séquençage."],
    ['Contrat sommatif', "Une rubrique par compétence de la séquence, avec les indicateurs de performance du référentiel comme critères. « ↻ Ajouter les compétences… » complète le contrat si le séquençage a changé."],
    ['Contrat formatif', "Une rubrique par objectif opérationnel de la séance ; les critères sont les résultats attendus de la tâche citée [A1-T1], sinon deux critères à rédiger."],
    ['Noter', "Pour chaque élève et chaque critère : 0 à 5, ou NE (non évalué). Les coefficients (case jaune) pondèrent la moyenne. Niveau : NA (moins de 2 / 5), EVA (2 à moins de 4), A (4 et plus) ; note finale sur 20."],
    ['Critères', "« ＋ critère » ajoute un critère à rédiger ; ✖ retire un critère (un critère du référentiel peut être remis : « voir les critères retirés »)."],
  ]],
  ['validation', 'Validation des compétences', [
    ['Cœur de métier et transversales', "Les compétences C1 à C4 sont les compétences cœur de métier ; à partir de C5-1 (C5 et C6), ce sont les compétences transversales. Les deux catégories sont séparées dans le tableau de validation (bandeau violet pour les transversales), dans la couverture des compétences, dans les graphiques et sur le tableau de bord."],
    ['Le tableau', "Élèves × compétences, rempli à partir des contrats sommatifs de toutes les matières. Si une compétence est évaluée plusieurs fois, la meilleure évaluation est retenue (à égalité, la plus récente). Chaque case indique le niveau, la date du contrat et la matière."],
  ]],
  ['resultats', 'Résultats et moyennes', [
    ['Ce qui est automatique', "Chaque contrat sommatif donne une note / 20 par élève (moyenne des niveaux des compétences × 4), reprise automatiquement dans la colonne « Contrat séq. … » de la matière."],
    ['Résultats intermédiaires', "Choisissez une matière, puis « ＋ Résultat intermédiaire » : intitulé, date, coefficient, « noté sur » (ramené sur 20). Saisissez les notes dans le tableau (Entrée : élève suivant) ; « abs » = absent, « ne » = non évalué : non comptés dans la moyenne. Cliquez l'intitulé pour le modifier ou le supprimer."],
    ['Coefficients et moyennes', "La ligne jaune « Coefficient » règle le poids de chaque contrat ou résultat (0 = non compté). Moyenne de la matière = moyenne pondérée ; moyenne générale = moyenne des matières pondérée par leurs coefficients (réglés par l'administrateur dans la vue « Toutes les matières »). En bas : moyenne de la classe, notes la plus basse et la plus haute."],
    ['Périodes', "Le menu choisit toute la formation, une année ou un semestre (septembre → janvier, février → juillet). Une évaluation sans date n'est comptée que dans « Toute la formation »."],
  ]],
  ['pilotage', 'Ma semaine, évaluations et alertes', [
    ['Ma semaine', "Menu « Ma semaine » : vos séances de la semaine (d'après la progression), le travail préparatoire demandé, les devoirs à récupérer, les évaluations des 4 semaines suivantes (les vôtres en clair, celles des collègues en grisé) et les notes à saisir. ◀ ▶ pour changer de semaine."],
    ['Calendrier des évaluations', "Suivi → « Calendrier des évaluations » : contrats sommatifs (S) et résultats intermédiaires (R) de toutes les matières, semaine par semaine. La ligne « Total » passe en orange à 2 évaluations la même semaine et en rouge à 3. Les contrats formatifs (F) peuvent être affichés, mais ne comptent pas dans la charge. Une évaluation sans date n'apparaît pas : renseignez la date dans le contrat."],
    ['Alertes de pilotage', "Suivi → « Alertes de pilotage » : prérequis non respectés, notes à saisir, semaines chargées, séquences sans contrat sommatif, contrats sans date, séances non placées, compétences prévues sans séance ou non couvertes (plus grave après la mi-parcours), séances sans fiche… Cliquez une ligne pour aller la corriger. Le menu choisit vos matières ou toutes."],
  ]],
  ['dupliquer', 'Dupliquer, sauvegarder, PDF A3', [
    ['Dupliquer une séquence', "Dans un séquençage, bouton « ⧉ Dupliquer » d'une séquence : elle est recopiée (séances, fiches, contrats, sans les notes ni les dates) dans une de vos matières, dans cette promotion ou une autre. On peut ainsi reprendre la séquence d'un collègue dans sa propre matière."],
    ['Dupliquer une séance', "Survolez le numéro d'une séance puis cliquez ⧉ : la séance (avec sa fiche de déroulement et son contrat formatif) est ajoutée à la fin de la séquence choisie."],
    ['Sauvegarde', "Administration → « Sauvegarde » (administrateur) : télécharge un fichier contenant toutes les données. « Restaurer » remet le site dans l'état d'un fichier : toutes les données actuelles sont remplacées (une sauvegarde de l'état actuel est d'abord téléchargée). Les comptes de connexion ne changent pas."],
    ['PDF de la progression', "Progression → « ⬇ PDF A3 » : frise (une page par année) et/ou tableau (deux pages par année), en A3 paysage, pour les matières affichées."],
  ]],
  ['eleve', 'Fiche élève et livret', [
    ['La fiche', "Menu Suivi → « Fiche élève et livret ». Choisissez l'élève (◀ ▶ pour passer au précédent ou au suivant) et la période. La fiche reprend sa moyenne par matière comparée à celle de la classe, sa moyenne générale, le détail de ses notes et leur évolution."],
    ['Appréciations', "Une appréciation par matière (rédigée par les enseignants de la matière) et une appréciation générale (tout enseignant). Elles s'enregistrent en quittant la case."],
    ['Livret de compétences', "Pour chaque compétence C1 à C6, séparées en cœur de métier et transversales : le meilleur niveau obtenu dans les contrats sommatifs (A, EVA, NA ou NE), avec la date et la matière."],
    ['PDF', "« PDF de l'élève » télécharge sa fiche et son livret (A4 portrait) ; « Toute la classe » télécharge un .zip contenant une fiche par élève."],
  ]],
  ['couverture', 'Couvertures et synthèse', [
    ['Couvertures', "Pour chaque compétence (ou savoir) et chaque matière : cochez « Prévue » ; le nombre de séances qui la traitent est calculé d'après les séquençages. Vert = prévue et traitée, jaune = prévue sans séance, bleu = traitée sans être prévue. Le menu permet de n'afficher que les non couvertes."],
    ['Synthèse', "Toutes les séquences de toutes les matières sur une page, avec leurs séances et leur volume."],
  ]],
  ['impressions', 'Impressions', [
    ['Imprimer', "Bouton « Imprimer » de chaque page : le format est choisi automatiquement (progression, couvertures et validation en A3 paysage ; séquençages et synthèse en A4 paysage ; fiches en A4 portrait). Dans la fenêtre d'impression, choisissez « Enregistrer au format PDF » pour obtenir un fichier."],
    ['Si le format ne suit pas', "Dans la fenêtre d'impression, vérifiez « Mise en page » (portrait / paysage) et le format de papier, et cochez « Graphiques d'arrière-plan » pour garder les couleurs."],
  ]],
  ['admin', 'Administration (administrateur)', [
    ['Autoriser un collègue', "Administration → « Autoriser un collègue » : identifiant, nom, enseignant de l'équipe correspondant. Envoyez-lui l'adresse du site : il choisit son code à sa première connexion."],
    ['Code oublié, départ', "Les demandes « code oublié » apparaissent en haut de la page Administration (et dans le menu) : « Donner un code provisoire », à communiquer au collègue, qui devra le remplacer à sa connexion. « Nouveau code » fait de même pour n'importe quel compte. Décocher l'accès suspend immédiatement un compte."],
    ['Suivi des connexions', "Administration → « Suivi des connexions » : pour chaque compte, nombre de connexions, temps total et moyen, dernière connexion, sur 7 jours, 30 jours, depuis la rentrée ou depuis le début. Cliquez une ligne pour le détail (date, heures, durée). Le temps n'est compté que lorsque l'application est affichée et utilisée ; après 30 minutes sans activité, une nouvelle connexion commence."],
    ['Administrateurs', "Administration → onglet « Administrateurs » : « Nommer administrateur » donne ce rôle à un compte (plusieurs administrateurs possibles). Pour changer d'administrateur, nommez d'abord le nouveau puis retirez l'ancien (« Quitter ce rôle » sur sa propre carte). Il reste toujours au moins un administrateur actif."],
    ['Maintenance', "Administration → onglet « Maintenance » : « Fermer le site pour maintenance » bloque l'accès à tous les comptes sauf les administrateurs ; le message saisi s'affiche sur l'écran de connexion et à la place des pages. Un bandeau rouge rappelle aux administrateurs que le site est fermé. « Rouvrir le site » rétablit l'accès."],
    ['Compte en lecture seule', "Pour le DDFPT (ou une inspection) : autorisez le compte avec le rôle « Lecture seule ». Il voit toutes les pages et peut imprimer, mais ne peut rien modifier."],
    ['Élèves', "Seul l'administrateur ajoute, modifie ou supprime les élèves (page Élèves) ; « Imprimer la liste » imprime la liste de la promotion."],
    ['Équipe et matières', "« Matières et équipe » : couleurs et noms des matières, enseignants et matières qu'ils peuvent modifier."],
    ['Reprendre une promotion', "Administration → « Reprendre une promotion » : recopie séquençages, calendrier, progression, fiches et contrats (sans les notes) d'une promotion vers une autre. Seules les parties encore vides sont remplies."],
  ]],
  ['historique', 'Historique des modifications', [
    ['Retrouver une modification', "Chaque ajout, modification ou suppression est noté : qui, quand, quoi. Filtrez par type, matière ou personne ; cliquez une ligne pour voir les valeurs avant / après (utile pour retrouver un texte effacé par erreur)."],
  ]],
  ['questions', 'Questions fréquentes', [
    ['La page affiche une erreur', "Faites Ctrl + F5. Si l'erreur continue, l'administrateur vérifie que le dernier fichier SQL fourni a bien été exécuté dans Supabase."],
    ['Le site ne répond plus après les vacances', "Dans l'offre gratuite, Supabase met le projet en pause après une semaine sans utilisation. L'administrateur l'ouvre sur supabase.com et clique « Restore project » ; les données sont conservées."],
    ['Deux collègues modifient la même case', "La dernière modification enregistrée l'emporte ; l'historique garde la trace des deux."],
  ]],
];

const ICONES = { demarrer: '🚀', sequencage: '🧱', progression: '📅', fiches: '📝', validation: '✅', resultats: '📈', eleve: '🎓', pilotage: '🗓', dupliquer: '⧉', couverture: '🧩',
  impressions: '🖨', admin: '🛡', historique: '🕘', questions: '❓' };
const normaliser = (t) => String(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export async function pageAide(zone, arg) {
  const actif = SECTIONS.some(([k]) => k === arg) ? arg : null;
  const recherche = h('input', { class: 'champ recherche-aide', type: 'search', placeholder: 'Rechercher dans l’aide : code oublié, imprimer, coefficient, frise…' });
  const resultat = h('p', { class: 'resultat-aide' });
  const sections = SECTIONS.map(([k, t, items]) => {
    const fiches = items.map(([q, r]) => {
      const el = h('details', { class: 'question-aide', open: !!actif && k === actif }, h('summary', {}, q), h('p', {}, r));
      el.dataset.texte = normaliser(q + ' ' + r);
      return el;
    });
    const sec = h('section', { class: 'aide-section' + (k === actif ? ' cible' : ''), id: 'aide-' + k },
      h('div', { class: 'tete-aide' }, h('span', { class: 'icone-aide' }, ICONES[k] || '•'), h('h2', {}, t), h('span', { class: 'nb-aide' }, `${items.length} fiche(s)`)),
      h('div', { class: 'questions-aide' }, fiches));
    return { k, sec, fiches };
  });
  recherche.addEventListener('input', () => {
    const q = normaliser(recherche.value.trim());
    let n = 0;
    for (const s of sections) {
      let vis = 0;
      for (const f of s.fiches) { const ok = !q || f.dataset.texte.includes(q); f.hidden = !ok; f.open = !!q && ok; if (ok) vis++; }
      s.sec.hidden = vis === 0; n += vis;
    }
    resultat.textContent = q ? (n ? `${n} réponse(s) trouvée(s)` : 'Aucune réponse : essayez un autre mot.') : '';
  });
  vider(zone,
    h('section', { class: 'hero-aide' },
      h('div', {}, h('h1', {}, 'Aide'), h('p', {}, 'Tout ce qu’il faut pour prendre en main l’application. Cherchez un mot, ou choisissez un thème.')),
      recherche, resultat),
    h('nav', { class: 'themes-aide' }, SECTIONS.map(([k, t, items]) => h('a', { href: '#/aide/' + k, class: 'theme-aide' + (k === actif ? ' actif' : '') },
      h('span', { class: 'icone-aide' }, ICONES[k] || '•'), h('b', {}, t), h('small', {}, `${items.length} fiche(s)`)))),
    sections.map((s) => s.sec));
  if (actif) requestAnimationFrame(() => document.getElementById('aide-' + actif)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  else recherche.focus();
}

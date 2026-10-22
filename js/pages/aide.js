// Aide intégrée : prise en main de chaque partie de l'application.
import { h, vider } from '../ui.js';

const SECTIONS = [
  ['demarrer', 'Premiers pas', [
    ['Se connecter', "Identifiant = votre adresse académique, ou seulement « prenom.nom ». La première fois, cliquez sur « Première connexion ? Choisir mon code » : votre compte doit d'abord avoir été autorisé par l'administrateur."],
    ['Choisir la promotion', "Le menu « Promotion » (en haut du menu de gauche et sur le tableau de bord) change la promotion affichée dans toutes les pages. Chaque poste retient le dernier choix."],
    ['Cellules grises', "Une cellule grise est remplie automatiquement : calculée (moyennes, notes / 20 des contrats, nombre de séances, numéros, dates) ou reprise d'une autre page (les fiches reprennent le séquençage). Elle ne se modifie pas à cet endroit : modifiez la source (séquençage, notes du contrat…)."],
    ['Graphiques', "Les pages Tableau de bord, Élèves, Résultats, Validation, Couvertures, Synthèse, les contrats et le suivi des connexions présentent leurs chiffres en graphiques (sous les tableaux). Survolez une barre, une part ou un point pour lire la valeur exacte. Ils se mettent à jour avec les données et s'impriment avec la page."],
    ['Rien à enregistrer', "Chaque case est enregistrée dès que vous la quittez (elle devient brièvement verte). Les collègues voient la même chose ; rechargez la page (F5) pour voir leurs dernières modifications."],
    ['Qui peut modifier quoi ?', "Chaque enseignant modifie seulement les matières cochées pour lui dans « Matières et équipe » (séquençage, progression, fiches, contrats, résultats, couvertures) et consulte tout le reste. Le calendrier commun (vacances, apprentis, évènements) est modifiable par tous les enseignants. Seul l'administrateur ajoute, modifie ou supprime les élèves. Un compte « Lecture seule » (DDFPT…) consulte tout sans rien pouvoir modifier."],
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
    ['Le calendrier', "Une ligne par semaine sur deux années de 45 semaines (boutons « 1re année / 2e année »). Choisissez une seule matière en haut à droite pour voir le détail de ses séances."],
    ['Calendrier commun', "Cliquez un jour pour noter un évènement (Férié / pont, Sortie scolaire, Épreuve ou un texte). Les menus « Apprentis » et « Vacances / autres » se règlent par semaine ; une semaine de vacances, d'épreuves ou de stage ne reçoit pas de séance."],
    ['Placer une séance', "Cliquez une case : choisissez la séance, ou écrivez un texte libre, et une note pour la semaine. Avec une seule matière affichée, faites glisser une séance du bandeau « Séances à placer » vers une semaine : si elle est occupée, les suivantes descendent."],
    ['Déplacer une séance', "Faites-la glisser vers une autre semaine : elle y commence (avec toutes ses semaines si elle en dure plusieurs) et les séances situées entre les deux se décalent, en sautant les semaines de vacances."],
    ['Une séance sur plusieurs semaines', "Dans la fenêtre de la case : « Prolonger d’une semaine »."],
    ['Commentaires', "Cliquez une séance placée : en bas de la fenêtre, chaque enseignant peut écrire un commentaire sur la séance, visible par tous ou, en cochant « Visible par moi seul », par lui seul (🔒). Une bulle 💬 indique les séances commentées. Vous pouvez modifier ou supprimer vos commentaires."],
  ]],
  ['fiches', 'Fiches et contrats', [
    ['Ouvrir les fiches', "Bouton vert « ▶ Fiches » d'une séquence (séquençage), ou menu « Fiches et contrats ». Onglets : préparation de séquence, contrat sommatif, puis un onglet par séance, qui sépare la « Fiche de déroulement » et le « Contrat d’évaluation formative » (deux boutons sous les onglets ; chacun s'imprime séparément)."],
    ['Ce qui est automatique', "Matière, enseignant, promotion, effectif, volume, objectifs, compétences et savoirs sont repris du séquençage : pour les modifier, passez par le séquençage."],
    ['Contrat sommatif', "Une rubrique par compétence de la séquence, avec les indicateurs de performance du référentiel comme critères. « ↻ Ajouter les compétences… » complète le contrat si le séquençage a changé."],
    ['Contrat formatif', "Une rubrique par objectif opérationnel de la séance ; les critères sont les résultats attendus de la tâche citée [A1-T1], sinon deux critères à rédiger."],
    ['Noter', "Pour chaque élève et chaque critère : 0 à 5, ou NE (non évalué). Les coefficients (case jaune) pondèrent la moyenne. Niveau : NA (moins de 2 / 5), EVA (2 à moins de 4), A (4 et plus) ; note finale sur 20."],
    ['Critères', "« ＋ critère » ajoute un critère à rédiger ; ✖ retire un critère (un critère du référentiel peut être remis : « voir les critères retirés »)."],
  ]],
  ['validation', 'Validation des compétences', [
    ['Le tableau', "Élèves × compétences, rempli à partir des contrats sommatifs de toutes les matières. Si une compétence est évaluée plusieurs fois, la meilleure évaluation est retenue (à égalité, la plus récente). Chaque case indique le niveau, la date du contrat et la matière."],
  ]],
  ['resultats', 'Résultats et moyennes', [
    ['Ce qui est automatique', "Chaque contrat sommatif donne une note / 20 par élève (moyenne des niveaux des compétences × 4), reprise automatiquement dans la colonne « Contrat séq. … » de la matière."],
    ['Résultats intermédiaires', "Choisissez une matière, puis « ＋ Résultat intermédiaire » : intitulé, date, coefficient, « noté sur » (ramené sur 20). Saisissez les notes dans le tableau (Entrée : élève suivant) ; « abs » = absent, « ne » = non évalué : non comptés dans la moyenne. Cliquez l'intitulé pour le modifier ou le supprimer."],
    ['Coefficients et moyennes', "La ligne jaune « Coefficient » règle le poids de chaque contrat ou résultat (0 = non compté). Moyenne de la matière = moyenne pondérée ; moyenne générale = moyenne des matières pondérée par leurs coefficients (réglés par l'administrateur dans la vue « Toutes les matières »). En bas : moyenne de la classe, notes la plus basse et la plus haute."],
    ['Périodes', "Le menu choisit toute la formation, une année ou un semestre (septembre → janvier, février → juillet). Une évaluation sans date n'est comptée que dans « Toute la formation »."],
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

export async function pageAide(zone, arg) {
  const actif = SECTIONS.some(([k]) => k === arg) ? arg : null;
  vider(zone,
    h('header', { class: 'entete-page' }, h('div', {}, h('h1', {}, 'Aide'), h('p', { class: 'sous-titre' }, 'Prise en main de l’application'))),
    h('nav', { class: 'sommaire-aide' }, SECTIONS.map(([k, t]) => h('a', { href: '#/aide/' + k, class: k === actif ? 'actif' : '' }, t))),
    SECTIONS.map(([k, t, items]) => h('section', { class: 'bloc aide-section' + (k === actif ? ' cible' : ''), id: 'aide-' + k },
      h('h2', {}, t), h('dl', {}, items.map(([q, r]) => [h('dt', {}, q), h('dd', {}, r)])))));
  if (actif) requestAnimationFrame(() => document.getElementById('aide-' + actif)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
}

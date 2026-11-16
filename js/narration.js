// Voix off des vidéos de l'aide : lue par la synthèse vocale du navigateur (rien n'est envoyé sur Internet).
// Chaque repère : [début en secondes, texte dit pendant la scène]. Les textes tiennent dans la durée de leur scène.
export const NARRATION = {
  decouverte: [
    [0.3, 'Pilotage BTS SCBH : découvrez le site en trois minutes.'],
    [5.3, 'Votre page d’accueil : les séances de la semaine, les évaluations à venir, les alertes et la promotion en chiffres.'],
    [15.3, 'Des accès rapides vers chaque rubrique. Tout est partagé par l’équipe pédagogique.'],
    [23.3, 'Le séquençage : les séquences et les séances de chaque matière, avec objectifs, durée, compétences et savoirs.'],
    [34.3, 'La progression place les séances de toutes les matières sur les deux années, avec les vacances et les périodes en entreprise.'],
    [45.3, 'La frise donne la vue d’ensemble. On glisse une séance pour la déplacer.'],
    [53.3, 'Ma semaine : les séances, les fiches à préparer, les évaluations à noter et le travail à la maison.'],
    [62.3, 'Fiches de préparation, de déroulement et fiches contrats : les critères viennent du référentiel, notés de zéro à cinq.'],
    [73.3, 'La validation des compétences se remplit toute seule à partir des contrats sommatifs de toutes les matières.'],
    [83.3, 'Les moyennes par matière et par élève, avec graphiques et coefficients : rien à recalculer.'],
    [92.3, 'Pour chaque élève : résultats, compétences acquises, appréciations, et le livret en PDF.'],
    [101.3, 'Vos fichiers restent sur Nuage ; le site les range, les cherche et les ouvre.'],
    [110.3, 'On partage un document avec des collègues ou la classe. Les cours du séquençage sont visibles des élèves.'],
    [120.3, 'Les QCM : écrits à la main, proposés par une IA, ou importés d’un fichier H5P.'],
    [128.3, 'Une série de questions par critère : les résultats remplissent automatiquement la fiche contrat.'],
    [138.3, 'Chaque élève a son compte : sa semaine, sa formation, ses documents, ses QCM et ses résultats.'],
    [148.3, 'Une question ? L’assistant de l’aide répond avec vos mots et ouvre la bonne page.'],
    [157.3, 'Bonne découverte ! Pour aller plus loin, voyez le tutoriel.'],
  ],
  tutoriel: [
    [0.3, 'Apprendre à travailler avec Pilotage BTS SCBH, chapitre par chapitre.'],
    [6.3, 'Premier chapitre : les premiers pas.'],
    [11.3, 'Pour se connecter : prénom point nom, ou l’adresse académique. La première fois, choisissez votre code.'],
    [20.3, 'Les pages sont rangées par rubriques. Le crayon signale les matières que vous enseignez.'],
    [29.3, 'Ce menu change la promotion affichée dans toutes les pages.'],
    [37.3, 'Tapez un mot dans Rechercher, puis Entrée : le site cherche partout dans la promotion.'],
    [46.3, 'Chapitre deux : les séquençages.'],
    [51.3, 'Une page par matière : ajoutez une séquence, puis ses séances. Tout s’enregistre tout seul.'],
    [60.3, 'Pour chaque séance : le titre, la durée, les objectifs, un par ligne, les compétences et les savoirs.'],
    [70.3, 'Le bouton « depuis mes cours » relie vos documents à la séance : ils deviennent visibles des élèves.'],
    [80.3, 'Le bouton IA prépare une demande pour l’IA de votre choix. Aucune donnée d’élève n’est envoyée.'],
    [90.3, 'Chapitre trois : la progression.'],
    [95.3, 'Une colonne par matière, une ligne par semaine. Cliquez une case pour y placer une séance.'],
    [105.3, 'Glissez une séance vers une autre semaine. Décaler repousse aussi toutes les suivantes.'],
    [114.3, 'Vacances, périodes en entreprise et jours fériés sont saisis une fois pour toute l’équipe.'],
    [123.3, 'La frise montre toute l’année d’un coup d’œil.'],
    [131.3, 'Chapitre quatre : les documents pédagogiques.'],
    [136.3, 'La fiche de préparation de séquence est déjà pré-remplie à partir du séquençage.'],
    [145.3, 'Une fiche de déroulement par séance : les phases, les durées, les activités et le travail à la maison.'],
    [154.3, 'La fiche contrat se complète en quelques clics : date, forme, lieu, organisation.'],
    [162.3, 'On note chaque critère de zéro à cinq, pour chaque élève. La moyenne et le niveau sont calculés.'],
    [173.3, 'Pour évaluer en dehors du séquençage, créez un contrat hors séquence.'],
    [181.3, 'Chapitre cinq : évaluer et suivre.'],
    [186.3, 'La validation montre le meilleur niveau obtenu par compétence, pour toute la promotion.'],
    [195.3, 'Ajoutez des résultats intermédiaires, avec les coefficients et les périodes de votre choix.'],
    [204.3, 'Chaque semaine : les séances, les fiches à remplir, les évaluations à noter.'],
    [212.3, 'Toutes les évaluations de la promotion, avec une alerte si une semaine est trop chargée.'],
    [220.3, 'Les alertes signalent ce qui manque : contrats, compétences non couvertes, fiches à faire.'],
    [228.3, 'Chapitre six : les élèves.'],
    [233.3, 'La liste de la promotion : statut, entreprise des apprentis, redoublants.'],
    [241.3, 'La fiche élève réunit résultats, compétences et appréciations, et s’imprime en PDF.'],
    [251.3, 'Chapitre sept : mes ressources.'],
    [256.3, 'Collez une seule fois les liens de partage de vos dossiers Nuage dans les réglages.'],
    [266.3, 'Ma bibliothèque : des tuiles par thème, et une fiche par ouvrage.'],
    [274.3, 'Un clic sur une ligne du sommaire ouvre le PDF à la bonne page.'],
    [283.3, 'Dans Mes cours, le type de chaque document est deviné d’après le nom du fichier.'],
    [292.3, 'Cochez des documents ou des dossiers entiers, puis des collègues ou une promotion d’élèves.'],
    [302.3, 'Publier aux élèves rend un document visible. Ceux du séquençage le sont automatiquement.'],
    [312.3, 'Chapitre huit : les QCM.'],
    [317.3, 'Un QCM se crée à partir d’un cours, d’une séance ou d’un fichier H5P, et se couple à une fiche contrat.'],
    [327.3, 'Une ou plusieurs bonnes réponses, une explication et un savoir pour chaque question.'],
    [336.3, 'Chaque série de questions évalue un critère de la fiche contrat.'],
    [346.3, 'Ouvrez le QCM en ligne : promotion, dates, nombre de tentatives.'],
    [356.3, 'Les résultats par élève, par question et par critère. La fiche contrat est déjà remplie.'],
    [366.3, 'Chapitre neuf : l’espace élèves.'],
    [371.3, 'L’administrateur crée les comptes, et imprime une fiche de connexion par élève.'],
    [380.3, 'L’élève retrouve sa semaine, ses documents et ses QCM. Il ne voit que ses propres résultats.'],
    [390.3, 'Les documents s’ouvrent sans jamais montrer l’adresse de votre Nuage.'],
    [399.3, 'Chapitre dix : l’administration.'],
    [404.3, 'Matières, couleurs, coefficients et enseignants : réglés une fois par l’administrateur.'],
    [412.3, 'Autoriser un collègue, codes oubliés, maintenance, et sauvegarde complète.'],
    [421.3, 'Dernier chapitre : l’aide.'],
    [426.3, 'Écrivez votre question avec vos mots : l’assistant trouve la réponse et ouvre la bonne page.'],
    [436.3, 'À vous de jouer ! Tout est aussi expliqué dans la page Aide.'],
  ],
};

// voix françaises de l'appareil, de la plus naturelle à la moins naturelle
const scoreVoix = (x) => (/natural|neural/i.test(x.name) ? 6 : 0) + (/online/i.test(x.name) ? 3 : 0) + (/google/i.test(x.name) ? 3 : 0)
  + (/denise|vivienne|henri|eloise|remy|amélie|amelie|thomas|audrey|aurélie|hortense|julie|paul/i.test(x.name) ? 2 : 0) + (/fr-FR/i.test(x.lang) ? 1 : 0);
export const voixFrancaises = () => (window.speechSynthesis?.getVoices() || []).filter((x) => /^fr(-|_|$)/i.test(x.lang)).sort((a, b) => scoreVoix(b) - scoreVoix(a));
export const voixNaturelle = (x) => scoreVoix(x) >= 6;
// voix retenue : « Julie » (Windows), sinon la plus naturelle disponible
export function voixFrancaise() {
  const l = voixFrancaises();
  return l.find((x) => /julie/i.test(x.name)) || l[0] || null;
}
// texte plus fluide à l'oral : pas de deux-points ni de guillemets, qui font marquer des pauses
const lisse = (t) => String(t).replace(/\s*[:;]\s+/g, ', ').replace(/[«»"]/g, '').replace(/\s+/g, ' ').trim();

// faux seulement si l'appareil liste des voix mais aucune en français (liste vide = pas encore chargée : on essaie)
export function francaisPossible() {
  const l = window.speechSynthesis?.getVoices() || [];
  return !l.length || l.some((x) => /^fr(-|_|$)/i.test(x.lang));
}

// branche la voix off sur un élément <video> ; renvoie { actif, basculer, arreter }
// Contournements des navigateurs : petite attente entre cancel() et speak() (Chrome perd sinon la phrase),
// énoncé gardé en mémoire (sinon Chrome peut l'abandonner en route), pas de pause()/resume() (souvent bloqués).
export function brancherVoix(video, cle, { actif = true, surEtat, vitesse = 1 } = {}) {
  const S = window.speechSynthesis, cues = NARRATION[cle] || [];
  if (!S || !window.SpeechSynthesisUtterance || !cues.length) return null;
  let on = actif, dernier = -1, voix = voixFrancaise(), minuterie = null, attente = 0;
  const gardes = new Set();   // énoncés gardés en mémoire jusqu'à leur fin (sinon Chrome peut les abandonner)
  const majVoix = () => { voix = voixFrancaise(); };
  try { S.addEventListener('voiceschanged', majVoix); } catch { S.onvoiceschanged = majVoix; }
  const indice = (t) => { let k = -1; cues.forEach(([d], i) => { if (t >= d - 0.05) k = i; }); return k; };
  const finDe = (k) => (cues[k + 1]?.[0] ?? video.duration ?? 1e9);
  const taire = () => { clearTimeout(minuterie); attente = 0; gardes.clear(); try { S.cancel(); } catch { /* rien */ } };
  const enonce = (texte) => {
    const u = new SpeechSynthesisUtterance(lisse(texte));
    u.lang = 'fr-FR'; u.rate = vitesse; u.pitch = 1;
    try { if (voix) u.voice = voix; } catch { /* voix refusée : celle par défaut */ }
    attente++; gardes.add(u);
    u.onstart = () => { attente = Math.max(0, attente - 1); };
    u.onend = u.onerror = () => { gardes.delete(u); };
    return u;
  };
  // couper = on interrompt ce qui se dit (saut, pause) ; sinon la phrase suit la précédente sans la couper
  const parler = (texte, couper) => {
    if (!francaisPossible()) return;
    if (couper || attente > 0) {   // une phrase attend déjà : on a pris du retard, on repart sur la scène actuelle
      taire();
      minuterie = setTimeout(() => { try { S.resume(); S.speak(enonce(texte)); } catch { /* synthèse indisponible */ } }, 60);
    } else {
      try { S.speak(enonce(texte)); } catch { /* synthèse indisponible */ }
    }
  };
  const tic = () => {
    if (video.paused || !on) return;
    const k = indice(video.currentTime);
    if (k === dernier) return;
    const suite = k === dernier + 1;   // lecture continue : scène suivante
    dernier = k;
    if (k < 0) return;
    // à la reprise au milieu d'une scène : on ne parle que s'il reste assez de temps
    if (suite || finDe(k) - video.currentTime > 2.5) parler(cues[k][1], !suite); else taire();
  };
  video.addEventListener('timeupdate', tic);
  video.addEventListener('play', () => { dernier = -2; tic(); });
  video.addEventListener('pause', () => { taire(); dernier = -2; });
  video.addEventListener('seeking', () => { taire(); dernier = -2; });
  video.addEventListener('ended', taire);
  return {
    get actif() { return on; },
    basculer() {
      on = !on; dernier = -2;
      if (!on) taire();
      else if (video.paused) parler('Voix activée.', true); else tic();
      surEtat?.(on); return on;
    },
    arreter() { taire(); try { S.removeEventListener('voiceschanged', majVoix); } catch { /* rien */ } },
    get voix() { return voix; },
    regler(r) { if ('vitesse' in r) vitesse = r.vitesse; if (!on) return; dernier = -2;
      if (video.paused) parler('Voici la vitesse choisie pour commenter les vidéos.', true); else tic(); },
  };
}

// Séquençage d'une matière : séquences (intitulé, objectif principal) et leurs séances.
import { db } from '../api.js';
import { boutonAnnuler } from '../annuler.js';
import { boutonIA, champs, codesDans, enListe, nombreDe, listeCompetences, listeSavoirs, aEcrire, resume } from '../ia.js';
import { h, vider, champ, toast, erreur, confirmer, fenetre, nombre, heures, ajusterTout, imprimer } from '../ui.js';

export async function pageSequencage(zone, id, ctx) {
  const m = ctx.matieres.find((x) => String(x.id) === String(id));
  if (!m) { vider(zone, h('p', {}, 'Matière introuvable.')); return; }
  const ref = await ctx.referentiel();
  const modif = ctx.enseigne(m.id);
  const mesMatieres = ctx.matieres.filter((y) => ctx.enseigne(y.id));        // matières où l'on peut dupliquer

  // toutes les séances de la promotion (toutes matières) : pour choisir et afficher les prérequis
  let toutes = new Map();
  async function charger() {
    const tousSeq = await db.lire('sequences', `promotion_id=eq.${ctx.promo.id}&order=matiere_id,numero`);
    const ids = tousSeq.map((s) => s.id);
    const tout = ids.length ? await db.lire('seances', `sequence_id=in.(${ids.join(',')})&order=sequence_id,numero`) : [];
    const seqs = new Map(tousSeq.map((s) => [s.id, s]));
    toutes = new Map(tout.map((x) => [x.id, { ...x, seq: seqs.get(x.sequence_id), mat: ctx.matieres.find((y) => y.id === seqs.get(x.sequence_id)?.matiere_id) }]));
    const sequences = tousSeq.filter((s) => s.matiere_id === m.id).sort((a, b) => a.numero - b.numero);
    const mes = new Set(sequences.map((s) => s.id));
    const seances = tout.filter((x) => mes.has(x.sequence_id)).sort((a, b) => a.numero - b.numero);
    return { sequences, seances };
  }
  const etiquette = (y) => `${ctx.codeMat(y.mat)} ${y.seq.numero}.${y.numero}`;
  const rangMat = (y) => ctx.matieres.findIndex((z) => z.id === y.mat?.id);
  const trier = (a, b) => rangMat(a) - rangMat(b) || a.seq.numero - b.seq.numero || a.numero - b.numero;

  async function dessiner() {
    const { sequences, seances } = await charger();
    const remplie = (x) => !!(x.titre || x.objectif_inter);
    const tot = seances.filter(remplie);
    const totH = tot.reduce((a, x) => a + (Number(x.duree) || 0), 0);
    const profs = ctx.enseignantsDe(m.id);
    const garde = window.scrollY;
    vider(zone,
      h('header', { class: 'entete-page', style: { '--couleur': m.couleur } },
        h('div', {},
          h('h1', {}, h('span', { class: 'pastille', style: { background: m.couleur } }), 'Séquençage · ' + m.nom),
          h('p', { class: 'sous-titre' }, `Promotion ${ctx.promo.libelle}  ·  ` + (profs.length ? 'Enseignant : ' + profs.join(', ') : 'Enseignant à attribuer') +
            `  ·  ${sequences.length} séquence(s)  ·  ${tot.length} séance(s)  ·  ${heures(totH) || '0 h'}`)),
        h('div', { class: 'actions-page' },
          modif ? boutonAnnuler(ctx, 'sequencage') : null,
          h('button', { class: 'btn', onclick: () => imprimer('A4 landscape') }, '🖶  Imprimer'),
          sequences.length ? h('button', { class: 'btn', title: 'Un seul PDF : page de garde, sommaire, séquençage, fiches et contrats de la matière', onclick: async () => {
            const { telechargerClasseur } = await import('../classeur.js'); await telechargerClasseur(m, ctx); } }, '📘  Classeur PDF') : null,
          modif ? h('button', { class: 'btn principal', onclick: ajouterSequence }, '＋  Ajouter une séquence') : null,
          !modif ? h('span', { class: 'badge-lecture' }, 'Consultation seule') : null)),
      sequences.map((s) => carteSequence(s, seances.filter((x) => x.sequence_id === s.id))),
      sequences.length === 0 ? await videPromotion() : null);
    ajusterTout(zone);
    window.scrollTo(0, garde);
  }

  // ------------------------------------------------------------------------------------- séquence
  function carteSequence(s, seances) {
    const remplies = seances.filter((x) => x.titre || x.objectif_inter);
    const hrs = remplies.reduce((a, x) => a + (Number(x.duree) || 0), 0);
    const maj = (col) => (v) => db.modifier('sequences', s.id, { [col]: v });
    return h('section', { class: 'sequence', style: { '--couleur': m.couleur } },
      h('div', { class: 'tete-sequence' },
        h('div', { class: 'num-sequence' }, 'SÉQUENCE ' + s.numero),
        champ(s.intitule, maj('intitule'), { lecture: !modif, placeholder: 'Intitulé de la séquence', classe: 'intitule' }),
        h('div', { class: 'resume' }, `${remplies.length} séance(s) · ${heures(hrs) || '0 h'}`),
        h('a', { class: 'btn petit fiches', href: `#/fiches/${s.id}` }, '▶ Fiches'),
        modif ? boutonIA(iaSequence(s, seances), 'btn petit') : null,
        mesMatieres.length ? h('button', { class: 'btn petit', title: 'Dupliquer la séquence (séances, fiches et contrats) vers une de vos matières, dans cette promotion ou une autre', onclick: () => dupliquerSequence(s) }, '⧉ Dupliquer') : null,
        modif ? h('button', { class: 'icone', title: 'Supprimer la séquence', onclick: () => supprimerSequence(s, seances) }, '✖') : null),
      h('div', { class: 'objectif-sequence' }, h('label', {}, 'Objectif principal'),
        champ(s.objectif, maj('objectif'), { multi: true, lecture: !modif, placeholder: 'Objectif principal de la séquence' })),
      h('div', { class: 'tableau-defile' }, h('table', { class: 'seances' },
        h('colgroup', {}, [3, 4, 11, 5, 10, 11, 25, 10, 10.5, 10.5].map((w) => h('col', { style: { width: w + '%' } }))),
        h('thead', {}, h('tr', {},
          ['', 'N°', 'Séance', 'Durée', 'Prérequis (antériorités)', 'Objectif intermédiaire', 'Objectifs opérationnels', 'Cours mobilisés', 'Compétences', 'Savoirs associés']
            .map((t) => h('th', {}, t)))),
        h('tbody', {}, seances.map((x) => ligneSeance(s, x, seances.length))))));
  }

  // ------------------------------------------------------------------------------------- séance
  function ligneSeance(s, x, nb) {
    const maj = (col, conv = (v) => v) => (v) => db.modifier('seances', x.id, { [col]: conv(v) });
    const zSav = codes(x, 'savoirs', ref.savoirs, ref.sav);
    const durees = [{ valeur: '', texte: '—' }, ...ref.durees.map((d) => ({ valeur: d.heures, texte: heures(Number(d.heures)) }))];
    if (x.duree != null && !ref.durees.some((d) => Number(d.heures) === Number(x.duree))) durees.push({ valeur: x.duree, texte: heures(Number(x.duree)) });
    const tr = h('tr', { 'data-id': x.id },
      h('td', { class: 'poignee-cell' }, modif ? h('span', { class: 'poignee', title: 'Glisser pour déplacer la séance' }, '⠿') : null),
      h('td', { class: 'num' }, `${s.numero}.${x.numero}`,
        mesMatieres.length ? h('button', { class: 'icone petit dupliquer', title: 'Dupliquer la séance (avec sa fiche et son contrat formatif) à la fin d’une autre séquence', onclick: () => dupliquerSeance(s, x) }, '⧉') : null,
        modif ? h('div', { class: 'mini-actions' },
          h('button', { class: 'icone petit', title: 'Insérer une séance après celle-ci', onclick: () => insererSeance(s, x) }, '＋'),
          nb > 1 ? h('button', { class: 'icone petit', title: 'Supprimer la séance', onclick: () => supprimerSeance(s, x) }, '✖') : null) : null),
      h('td', {}, champ(x.titre, maj('titre'), { multi: true, lecture: !modif, placeholder: 'Titre', classe: 'gras' })),
      h('td', {}, champ(x.duree ?? '', maj('duree', (v) => nombre(v)), { lecture: !modif, options: durees })),
      h('td', {}, prerequis(x),
        champ(x.prerequis_texte || '', maj('prerequis_texte'), { multi: true, lecture: !modif, placeholder: modif ? 'autres prérequis…' : '', classe: 'petit-texte' })),
      h('td', {}, champ(x.objectif_inter, maj('objectif_inter'), { multi: true, lecture: !modif })),
      h('td', {}, champ(x.objectifs_ops, maj('objectifs_ops'), { multi: true, lecture: !modif, placeholder: '- un objectif par ligne' }),
        modif ? h('button', { class: 'lien petit', onclick: (e) => choisirTaches(x, e.target.closest('td').querySelector('textarea')) }, '＋ depuis les tâches') : null),
      celluleCours(x, maj, () => zSav.maj()),
      h('td', {}, codes(x, 'competences', ref.competences, ref.comp)),
      h('td', {}, zSav));
    if (modif) glisser(tr, s, x);
    return tr;
  }

  // codes compétences / savoirs : pastilles avec leur libellé, choix dans le référentiel
  function codes(x, col, liste, index) {
    const zoneC = h('div', { class: 'codes' });
    // savoirs repris d'un cours relié (« Cours mobilisés ») : marqués 📘
    const viaCours = (c) => (col === 'savoirs' ? (x.cours_lies || []).filter((k) => (k.savoirs || []).includes(c)).map((k) => k.titre) : []);
    const afficher = () => vider(zoneC,
      (x[col] || []).map((c) => { const v = viaCours(c); return h('div', { class: 'code' + (v.length ? ' via-cours' : ''), title: (index[c]?.libelle || 'Code absent du référentiel') + (v.length ? `\nRepris du cours : ${v.join(', ')}` : '') },
        h('b', { class: index[c] ? '' : 'inconnu' }, c), h('span', {}, index[c]?.libelle_court || index[c]?.libelle || ''), v.length ? h('i', { class: 'marque-cours' }, ' 📘') : null); }),
      modif ? h('button', { class: 'lien petit', onclick: choisir }, (x[col] || []).length ? '✎ modifier' : '＋ choisir') : null);
    async function choisir() {
      const choix = new Set(x[col] || []);
      const recherche = h('input', { class: 'champ', placeholder: 'Rechercher (code ou mot)…' });
      const corps = h('div', { class: 'liste-choix' });
      const remplir = () => {
        const q = recherche.value.trim().toLowerCase();
        let fam = null;
        vider(corps, liste.filter((r) => !q || (r.code + ' ' + r.libelle + ' ' + (r.contenus || []).join(' ')).toLowerCase().includes(q)).flatMap((r) => {
          const out = [];
          if (col === 'competences' && r.famille !== fam) { fam = r.famille; out.push(h('div', { class: 'groupe' }, `${r.famille} – ${r.famille_libelle}`)); }
          out.push(h('label', { class: 'option' }, h('input', { type: 'checkbox', checked: choix.has(r.code),
            onchange: (e) => (e.target.checked ? choix.add(r.code) : choix.delete(r.code)) }), h('b', {}, r.code), ' ', r.libelle,
            col === 'savoirs' && (r.contenus || []).length ? h('small', { class: 'detail-choix' }, r.contenus.join(' · ')) : null));
          return out;
        }));
      };
      recherche.addEventListener('input', remplir);
      remplir();
      const ok = await fenetre(col === 'competences' ? 'Compétences développées' : 'Savoirs associés',
        h('div', {}, recherche, corps), [{ texte: 'Annuler', valeur: false }, { texte: 'Valider', classe: 'principal', valeur: true }], { large: true });
      if (!ok) return;
      const ordre = liste.map((r) => r.code);
      const val = [...choix].sort((a, b) => ordre.indexOf(a) - ordre.indexOf(b));
      try { await db.modifier('seances', x.id, { [col]: val }); x[col] = val; afficher(); toast('Enregistré'); } catch (e) { erreur(e); }
    }
    afficher();
    zoneC.maj = afficher;
    return zoneC;
  }

  // cours mobilisés : cours cochés dans « Mes cours ressources » (titre + savoirs repris) et saisie libre
  function celluleCours(x, maj, apres) {
    const td = h('td', { class: 'cell-cours' });
    const dessinerC = () => vider(td,
      (x.cours_lies || []).length ? h('div', { class: 'cours-lies' }, x.cours_lies.map((c) => h('a', { class: 'cours-lie', href: '#/cours/' + c.id,
        title: 'Cours ressource' + ((c.savoirs || []).length ? ' · savoirs associés : ' + c.savoirs.join(', ') : '') }, '📘 ', c.titre || 'Cours sans titre'))) : null,
      champ(x.cours, maj('cours'), { multi: true, lecture: !modif, placeholder: modif ? ((x.cours_lies || []).length ? 'autres cours…' : 'cours mobilisés…') : '' }),
      modif ? h('button', { class: 'lien petit', onclick: () => choisirCours(x, () => { dessinerC(); apres(); ajusterTout(td); }) }, (x.cours_lies || []).length ? '✎ cours de la liste' : '＋ depuis mes cours') : null);
    dessinerC();
    return td;
  }
  async function choisirCours(x, apres) {
    let rows, collegues = [];
    try { [rows, collegues] = await Promise.all([db.lire('cours', 'order=ordre,id'), db.rpc('collegues').catch(() => [])]); }
    catch { erreur(new Error('« Mes cours ressources » n’est pas encore installé : l’administrateur doit exécuter le script SQL 23.')); return; }
    const R = new Map(rows.map((r) => [r.id, r]));
    const anciens = x.cours_lies || [];
    const choix = new Set(anciens.map((c) => c.id));
    const moi = ctx.profil.id;
    const nomDe = (u) => collegues.find((c) => c.id === u)?.nom || 'Un collègue';
    const chemin = (r) => { const l = []; let p = R.get(r.parent_id); let n = 0; while (p && n++ < 50) { l.unshift(p.titre || 'Dossier'); p = R.get(p.parent_id); } return l.join(' › '); };
    // ordre de l'arborescence (dossiers dans l'ordre, puis leur contenu)
    const ordre = [];
    const parcourir = (parent, proprio) => rows.filter((r) => (r.parent_id ?? null) === parent && r.proprietaire === proprio)
      .forEach((r) => { if (r.type === 'cours') ordre.push(r); else parcourir(r.id, proprio); });
    const proprios = [moi, ...new Set(rows.filter((r) => r.proprietaire !== moi).map((r) => r.proprietaire))];
    for (const u of proprios) { parcourir(null, u); rows.filter((r) => r.proprietaire === u && r.parent_id && !R.has(r.parent_id)).forEach((r) => { if (r.type === 'cours') ordre.push(r); else parcourir(r.id, u); }); }
    const disparus = anciens.filter((c) => !R.has(c.id));
    const rech = h('input', { class: 'champ', placeholder: 'Rechercher un cours (titre, savoir)…' });
    const corps = h('div', { class: 'liste-choix' });
    const sans = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const remplir = () => {
      const q = sans(rech.value).split(/\s+/).filter(Boolean);
      let grp = null;
      const ok = (r) => !q.length || q.every((m) => sans(r.titre + ' ' + (r.savoirs || []).join(' ') + ' ' + chemin(r)).includes(m));
      vider(corps, ordre.filter(ok).flatMap((r) => {
        const out = [];
        const g = (r.proprietaire === moi ? 'Mes cours' : 'Partagés par ' + nomDe(r.proprietaire)) + (chemin(r) ? ' · ' + chemin(r) : '');
        if (g !== grp) { grp = g; out.push(h('div', { class: 'groupe' }, g)); }
        out.push(h('label', { class: 'option' }, h('input', { type: 'checkbox', checked: choix.has(r.id), onchange: (e) => (e.target.checked ? choix.add(r.id) : choix.delete(r.id)) }),
          '📘 ', h('b', {}, r.titre || 'Cours sans titre'), (r.savoirs || []).length ? h('small', { class: 'detail-choix' }, 'Savoirs : ' + r.savoirs.join(', ')) : h('small', { class: 'detail-choix' }, 'aucun savoir associé')));
        return out;
      }), disparus.length ? [h('div', { class: 'groupe' }, 'Cours plus disponibles (supprimés ou plus partagés)'),
        disparus.map((c) => h('label', { class: 'option' }, h('input', { type: 'checkbox', checked: choix.has(c.id), onchange: (e) => (e.target.checked ? choix.add(c.id) : choix.delete(c.id)) }), '📘 ', h('b', {}, c.titre)))] : null,
      !ordre.length ? h('p', { class: 'vide' }, 'Aucun cours renseigné : ajoutez vos cours dans « Documents professeurs → Mes cours ressources ».') : null);
    };
    rech.addEventListener('input', remplir); remplir();
    const ok = await fenetre(`Cours mobilisés · séance ${x.titre || ''}`, h('div', {},
      h('p', { class: 'aide' }, 'Cochez les cours de « Mes cours ressources » (les vôtres et ceux partagés avec vous) mobilisés dans cette séance : leurs savoirs associés sont ajoutés automatiquement à la séance. La saisie libre reste possible sous la liste.'),
      rech, corps), [{ texte: 'Annuler', valeur: false }, { texte: 'Valider', classe: 'principal', valeur: true }], { large: true });
    if (!ok) return;
    const savDe = (id) => R.get(id)?.savoirs || anciens.find((c) => c.id === id)?.savoirs || [];
    let sav = [...(x.savoirs || [])];
    // cours décochés : on retire les savoirs qu'ils avaient ajoutés (sauf s'ils viennent aussi d'un cours encore coché)
    for (const a of anciens) if (!choix.has(a.id)) for (const c of a.ajoutes || []) if (![...choix].some((id) => savDe(id).includes(c))) sav = sav.filter((y) => y !== c);
    const auto = new Set(anciens.flatMap((c) => c.ajoutes || []));      // savoirs déjà apportés par des cours
    const ids = [...ordre.map((r) => r.id), ...disparus.map((c) => c.id)].filter((id) => choix.has(id));
    const lies = ids.map((id) => {
      const r = R.get(id), a = anciens.find((c) => c.id === id);
      const savoirs = r ? (r.savoirs || []) : (a?.savoirs || []);
      const ajoutes = savoirs.filter((c) => auto.has(c) && sav.includes(c));
      for (const c of savoirs) if (!sav.includes(c)) { sav.push(c); ajoutes.push(c); auto.add(c); }
      return { id, titre: r ? r.titre : a.titre, savoirs, ajoutes };
    });
    const rang = ref.savoirs.map((y) => y.code);
    sav.sort((a, b) => rang.indexOf(a) - rang.indexOf(b));
    try {
      await db.modifier('seances', x.id, { cours_lies: lies, savoirs: sav });
      x.cours_lies = lies; x.savoirs = sav;
      toast(lies.length ? `${lies.length} cours relié(s) · savoirs mis à jour` : 'Cours retirés');
      apres();
    } catch (e) { erreur(e); }
  }

  // prérequis : séances de la promotion (toutes matières) à faire avant celle-ci
  function prerequis(x) {
    const zoneP = h('div', { class: 'codes prerequis' });
    const afficher = () => {
      const liste = (x.prerequis || []).map((i) => toutes.get(Number(i))).filter(Boolean).sort(trier);
      vider(zoneP, liste.map((y) => h('div', { class: 'code pre', style: { '--couleur': y.mat?.couleur || '#888' }, title: `${y.mat?.nom || ''} · séquence ${y.seq.numero} ${y.seq.intitule || ''}` },
        h('b', {}, etiquette(y)), h('span', {}, y.titre || 'sans titre'))),
      modif ? h('button', { class: 'lien petit', onclick: choisir }, liste.length ? '✎ modifier' : '＋ séances prérequises') : null);
    };
    async function choisir() {
      const choix = new Set((x.prerequis || []).map(Number));
      const recherche = h('input', { class: 'champ', placeholder: 'Rechercher (matière, n°, titre)…' });
      const corps = h('div', { class: 'liste-choix' });
      const candidates = [...toutes.values()].filter((y) => y.id !== x.id).sort(trier);
      const remplir = () => {
        const q = recherche.value.trim().toLowerCase();
        let grp = null;
        vider(corps, candidates.filter((y) => !q || `${etiquette(y)} ${y.mat?.nom} ${y.titre} ${y.seq.intitule}`.toLowerCase().includes(q)).flatMap((y) => {
          const out = [];
          const g = `${y.mat?.nom} · Séquence ${y.seq.numero}${y.seq.intitule ? ' · ' + y.seq.intitule : ''}`;
          if (g !== grp) { grp = g; out.push(h('div', { class: 'groupe', style: { borderLeft: `4px solid ${y.mat?.couleur || '#888'}` } }, g)); }
          out.push(h('label', { class: 'option' }, h('input', { type: 'checkbox', checked: choix.has(y.id),
            onchange: (e) => (e.target.checked ? choix.add(y.id) : choix.delete(y.id)) }), h('b', {}, etiquette(y)), ' ', y.titre || 'sans titre'));
          return out;
        }));
      };
      recherche.addEventListener('input', remplir);
      remplir();
      const ok = await fenetre(`Prérequis de la séance ${toutes.get(x.id) ? etiquette(toutes.get(x.id)) : ''}`,
        h('div', {}, h('p', { class: 'aide' }, 'Cochez les séances (de toutes les matières) qui doivent avoir été faites avant celle-ci. La progression signalera cette séance si elle est placée avant l’une d’elles.'),
          recherche, corps), [{ texte: 'Annuler', valeur: false }, { texte: 'Valider', classe: 'principal', valeur: true }], { large: true });
      if (!ok) return;
      const val = [...choix].map((i) => toutes.get(i)).filter(Boolean).sort(trier).map((y) => y.id);
      try { await db.modifier('seances', x.id, { prerequis: val }); x.prerequis = val; afficher(); toast('Enregistré'); } catch (e) { erreur(e); }
    }
    afficher();
    return zoneP;
  }

  // objectifs opérationnels tirés des tâches professionnelles du référentiel
  async function choisirTaches(x, zoneTexte) {
    const choix = new Set();
    const corps = h('div', { class: 'liste-choix' });
    let act = null;
    ref.taches.forEach((t) => {
      if (t.activite !== act) { act = t.activite; const a = ref.activites.find((y) => y.code === act); corps.append(h('div', { class: 'groupe' }, `${act} – ${a?.libelle || ''}`)); }
      corps.append(h('label', { class: 'option' }, h('input', { type: 'checkbox', onchange: (e) => (e.target.checked ? choix.add(t) : choix.delete(t)) }),
        h('b', {}, t.code), ' ', t.libelle));
    });
    const ok = await fenetre('Ajouter des objectifs à partir des tâches professionnelles', corps,
      [{ texte: 'Annuler', valeur: false }, { texte: 'Ajouter', classe: 'principal', valeur: true }], { large: true });
    if (!ok || !choix.size) return;
    const ajout = [...choix].map((t) => ` - [${t.code}] ${t.libelle.charAt(0).toLowerCase() + t.libelle.slice(1)}`).join('\n');
    const val = (zoneTexte.value ? zoneTexte.value.replace(/\s+$/, '') + '\n' : '') + ajout;
    try { await db.modifier('seances', x.id, { objectifs_ops: val }); zoneTexte.value = val; zoneTexte.dispatchEvent(new Event('input')); toast('Enregistré'); }
    catch (e) { erreur(e); }
  }

  // ------------------------------------------------------------------------------------- glisser-déposer
  let glisse = null;
  function glisser(tr, s, x) {
    const poignee = tr.querySelector('.poignee');
    poignee.addEventListener('mousedown', () => { tr.draggable = true; });
    poignee.addEventListener('mouseup', () => { tr.draggable = false; });
    tr.addEventListener('dragstart', (e) => { glisse = { s, x }; tr.classList.add('glisse'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(x.id)); });
    tr.addEventListener('dragend', () => { tr.draggable = false; tr.classList.remove('glisse'); zone.querySelectorAll('.cible').forEach((t) => t.classList.remove('cible')); });
    tr.addEventListener('dragover', (e) => { if (glisse && glisse.s.id === s.id) { e.preventDefault(); tr.classList.add('cible'); } });
    tr.addEventListener('dragleave', () => tr.classList.remove('cible'));
    tr.addEventListener('drop', async (e) => {
      e.preventDefault();
      if (!glisse || glisse.s.id !== s.id || glisse.x.id === x.id) return;
      const g = glisse; glisse = null;
      try { await db.rpc('deplacer_seance', { x: g.x.id, nouveau: x.numero }); toast(`Séance déplacée en ${s.numero}.${x.numero}`); await dessiner(); }
      catch (err) { erreur(err); }
    });
  }

  // ------------------------------------------------------------------------------------- promotion sans séquençage
  async function videPromotion() {
    const autres = await db.lire('sequences', `matiere_id=eq.${m.id}&promotion_id=neq.${ctx.promo.id}`);
    const ids = [...new Set(autres.map((s) => s.promotion_id))];
    const sources = ctx.promotions.filter((p) => ids.includes(p.id));
    const bloc = h('section', { class: 'bloc vide-promo' },
      h('h2', {}, `Aucune séquence en ${m.nom} pour la promotion ${ctx.promo.libelle}`));
    if (!modif) { bloc.append(h('p', { class: 'aide' }, 'Le séquençage de cette matière n’a pas encore été commencé pour cette promotion.')); return bloc; }
    if (sources.length) {
      const choix = h('select', { class: 'champ' }, sources.map((p) => h('option', { value: p.id }, 'Promotion ' + p.libelle)));
      bloc.append(h('p', {}, 'Reprendre le séquençage d’une autre promotion (séquences et séances recopiées, modifiables ensuite) :'),
        h('div', { class: 'ligne-actions' }, choix, h('button', { class: 'btn principal', onclick: async () => {
          try {
            const n = await db.rpc('copier_sequencage', { m: m.id, source: Number(choix.value), cible: ctx.promo.id });
            toast(`${n} séquence(s) reprise(s)`); await dessiner();
          } catch (e) { erreur(e); }
        } }, 'Reprendre ce séquençage')),
        h('p', { class: 'aide' }, 'ou commencer un séquençage vide avec le bouton « Ajouter une séquence ».'));
    } else bloc.append(h('p', { class: 'aide' }, 'Commencez avec le bouton « Ajouter une séquence ».'));
    return bloc;
  }

  // ------------------------------------------------------------------------------------- duplication
  const optPromos = (sel) => ctx.promotions.map((p) => h('option', { value: p.id, selected: p.id === sel }, 'Promotion ' + p.libelle));
  async function dupliquerSequence(s) {
    const mat = h('select', { class: 'champ' }, mesMatieres.map((y) => h('option', { value: y.id, selected: y.id === m.id }, y.nom)));
    const pro = h('select', { class: 'champ' }, optPromos(ctx.promo.id));
    const r = await fenetre(`Dupliquer la séquence ${s.numero}`, h('div', { class: 'formulaire' },
      h('p', {}, `« ${s.intitule || 'Séquence ' + s.numero} » (${m.nom}) est recopiée avec ses séances, ses fiches et ses contrats (sans les notes ni les dates). La copie prend le numéro suivant dans la matière choisie.`),
      h('label', {}, 'Vers la matière', mat), h('label', {}, 'Dans la promotion', pro)),
    [{ texte: 'Annuler', valeur: null }, { texte: '⧉  Dupliquer', classe: 'principal', action: async () => {
      const id = await db.rpc('dupliquer_sequence', { s: s.id, m: Number(mat.value), p: Number(pro.value) });
      return { id, mat: Number(mat.value), pro: Number(pro.value) };
    } }]);
    if (!r) return;
    const y = ctx.matieres.find((z) => z.id === r.mat), p = ctx.promotions.find((z) => z.id === r.pro);
    toast(`Séquence dupliquée en ${y.nom}` + (r.pro !== ctx.promo.id ? ` (promotion ${p.libelle})` : ''));
    if (r.pro === ctx.promo.id && r.mat !== m.id) location.hash = '#/sequencage/' + r.mat; else await dessiner();
  }
  async function dupliquerSeance(s, x) {
    const pro = h('select', { class: 'champ' }, optPromos(ctx.promo.id));
    const seq = h('select', { class: 'champ' });
    const remplir = async () => {
      const liste = await db.lire('sequences', `promotion_id=eq.${pro.value}&matiere_id=in.(${mesMatieres.map((y) => y.id).join(',')})&order=matiere_id,numero`);
      vider(seq, liste.length ? liste.map((q) => h('option', { value: q.id, selected: q.id === s.id && mesMatieres.some((y) => y.id === m.id) },
        `${mesMatieres.find((y) => y.id === q.matiere_id)?.nom} · séquence ${q.numero}${q.intitule ? ' · ' + q.intitule : ''}`))
        : h('option', { value: '' }, 'Aucune séquence dans vos matières pour cette promotion'));
    };
    pro.onchange = remplir; await remplir();
    const r = await fenetre(`Dupliquer la séance ${s.numero}.${x.numero}`, h('div', { class: 'formulaire' },
      h('p', {}, `« ${x.titre || 'Séance ' + s.numero + '.' + x.numero} » est recopiée avec sa fiche de déroulement et son contrat formatif, à la fin de la séquence choisie.`),
      h('label', {}, 'Promotion', pro), h('label', {}, 'Vers la séquence', seq)),
    [{ texte: 'Annuler', valeur: null }, { texte: '⧉  Dupliquer', classe: 'principal', action: async () => {
      if (!seq.value) throw new Error('Choisissez une séquence.');
      await db.rpc('dupliquer_seance', { x: x.id, cible: Number(seq.value) });
      return { seq: Number(seq.value), pro: Number(pro.value), lib: seq.selectedOptions[0].textContent };
    } }]);
    if (!r) return;
    toast(`Séance dupliquée : ${r.lib}`);
    await dessiner();
  }

  // ------------------------------------------------------------------------------------- structure
  async function ajouterSequence() {
    try { await db.rpc('ajouter_sequence', { m: m.id, p: ctx.promo.id }); toast('Séquence ajoutée'); await dessiner(); window.scrollTo(0, document.body.scrollHeight); }
    catch (e) { erreur(e); }
  }
  async function supprimerSequence(s, seances) {
    if (!(await confirmer('Supprimer la séquence', `Supprimer définitivement la séquence ${s.numero}${s.intitule ? ' « ' + s.intitule + ' »' : ''} et ses ${seances.length} séance(s) ? Les séquences suivantes seront renumérotées.`, 'Supprimer'))) return;
    try { await db.rpc('supprimer_sequence', { s: s.id }); toast('Séquence supprimée'); await dessiner(); } catch (e) { erreur(e); }
  }
  // ------------------------------------------------------------------------------------- remplir avec une IA
  function iaSequence(s, seances) {
    const promo = ctx.promo.libelle;
    return {
      titre: `Séquençage · séquence ${s.numero} · ${m.nom}`,
      demande: async () => `DOCUMENT À REMPLIR : le séquençage de la séquence ${s.numero} de la matière « ${m.nom} » (promotion ${promo}).
Intitulé actuel : ${s.intitule || '(vide)'}
Objectif principal actuel : ${s.objectif || '(vide)'}
Séances existantes : ${seances.length ? '\n' + seances.map((x) => `- Séance ${s.numero}.${x.numero} (numéro ${x.numero}) · ${x.titre || 'sans titre'} · ${x.duree ? x.duree + ' h' : 'durée ?'} · objectif : ${x.objectif_inter || '—'}`).join('\n') : 'aucune'}
Durées possibles d’une séance (en heures) : ${ref.durees.map((d) => Number(d.heures)).join(', ')}.

TÂCHE : propose l’intitulé et l’objectif principal de la séquence, puis pour chaque séance : son numéro, un titre, une durée, un objectif intermédiaire, des objectifs opérationnels (verbes d’action observables, un par ligne, en citant si utile le code d’une tâche professionnelle entre crochets, ex. [A1-T2]), les compétences et les savoirs associés (codes du référentiel ci-dessous). Si des séances existent déjà, garde leur numéro et complète-les, sauf si les précisions de l’enseignant demandent autre chose.

COMPÉTENCES DU RÉFÉRENTIEL :
${listeCompetences(ref)}

SAVOIRS ASSOCIÉS DU RÉFÉRENTIEL :
${listeSavoirs(ref)}

TÂCHES PROFESSIONNELLES DU RÉFÉRENTIEL :
${ref.taches.map((t) => `${t.code} : ${t.libelle}`).join('\n')}`,
      format: `=== SEQUENCE ===
Intitulé : …
Objectif principal : …
=== SEANCE ===
Numéro : 1
Titre : …
Durée : 4
Objectif intermédiaire : …
Objectifs opérationnels :
- …
- …
Compétences : C1-1, C2-3
Savoirs : S11-1, S21-2
(un bloc === SEANCE === par séance)
=== FIN ===`,
      lire: (B) => {
        const items = [], data = { seq: {}, seances: [] };
        const codesC = ref.competences.map((c) => c.code), codesS = ref.savoirs.map((c) => c.code);
        for (const b of B) {
          if (b.nom === 'SEQUENCE') {
            const c = champs(b.corps, { intitule: ['Intitulé', 'Intitule de la séquence'], objectif: ['Objectif principal', 'Objectif'] });
            if (c.intitule) { data.seq.intitule = c.intitule; items.push({ cle: 'seq-intitule', titre: 'Intitulé de la séquence', detail: c.intitule }); }
            if (c.objectif) { data.seq.objectif = c.objectif; items.push({ cle: 'seq-objectif', titre: 'Objectif principal', detail: resume(c.objectif) }); }
          } else if (b.nom === 'SEANCE') {
            const c = champs(b.corps, { numero: ['Numéro', 'N°', 'Numero de séance'], titre: ['Titre'], duree: ['Durée', 'Duree (h)'], inter: ['Objectif intermédiaire'],
              ops: ['Objectifs opérationnels'], comps: ['Compétences', 'Compétences développées'], savs: ['Savoirs', 'Savoirs associés'] });
            const x = { numero: nombreDe(c.numero), titre: c.titre || '', duree: nombreDe(c.duree), inter: c.inter || '', ops: c.ops ? enListe(c.ops) : '',
              comps: codesDans(c.comps, codesC), savs: codesDans(c.savs, codesS), i: data.seances.length };
            if (!x.titre && !x.inter && !x.ops) continue;
            data.seances.push(x);
            items.push({ cle: 'seance-' + x.i, titre: `Séance ${s.numero}.${x.numero || x.i + 1} · ${x.titre || 'sans titre'}`,
              detail: [x.duree ? x.duree + ' h' : '', x.inter, x.comps.join(' '), x.savs.join(' ')].filter(Boolean).join(' · ') });
          }
        }
        return { items, data };
      },
      appliquer: async (data, coches, remplacer) => {
        const patchSeq = {};
        if (coches.has('seq-intitule') && aEcrire(s.intitule, data.seq.intitule, remplacer)) patchSeq.intitule = data.seq.intitule;
        if (coches.has('seq-objectif') && aEcrire(s.objectif, data.seq.objectif, remplacer)) patchSeq.objectif = data.seq.objectif;
        if (Object.keys(patchSeq).length) await db.modifier('sequences', s.id, patchSeq);
        let liste = [...seances].sort((a, b) => a.numero - b.numero), n = 0, crees = 0;
        const rang = (l, codes) => [...new Set(l)].sort((a, b) => codes.indexOf(a) - codes.indexOf(b));
        for (const x of data.seances) {
          if (!coches.has('seance-' + x.i)) continue;
          let cible = x.numero ? liste.find((y) => y.numero === x.numero) : liste[x.i];
          if (!cible) {
            const apres = liste.length ? liste[liste.length - 1].numero : 0;
            const id = await db.rpc('inserer_seance', { s: s.id, apres });
            cible = (await db.lire('seances', `id=eq.${id}`))[0]; liste.push(cible); crees++;
          }
          const p = {};
          if (aEcrire(cible.titre, x.titre, remplacer)) p.titre = x.titre;
          if (x.duree && (remplacer || cible.duree == null)) p.duree = x.duree;
          if (aEcrire(cible.objectif_inter, x.inter, remplacer)) p.objectif_inter = x.inter;
          if (aEcrire(cible.objectifs_ops, x.ops, remplacer)) p.objectifs_ops = x.ops;
          const cc = ref.competences.map((c) => c.code), cs = ref.savoirs.map((c) => c.code);
          if (x.comps.length) p.competences = rang(remplacer ? x.comps : [...(cible.competences || []), ...x.comps], cc);
          if (x.savs.length) p.savoirs = rang(remplacer ? x.savs : [...(cible.savoirs || []), ...x.savs], cs);
          if (Object.keys(p).length) { await db.modifier('seances', cible.id, p); n++; }
        }
        await dessiner();
        return `Séquence remplie : ${n} séance(s) complétée(s)${crees ? `, dont ${crees} créée(s)` : ''}`;
      },
    };
  }

  async function insererSeance(s, x) {
    try { await db.rpc('inserer_seance', { s: s.id, apres: x.numero }); toast(`Séance ${s.numero}.${x.numero + 1} insérée`); await dessiner(); } catch (e) { erreur(e); }
  }
  async function supprimerSeance(s, x) {
    if (!(await confirmer('Supprimer la séance', `Supprimer définitivement la séance ${s.numero}.${x.numero}${x.titre ? ' « ' + x.titre + ' »' : ''} ? Les suivantes seront renumérotées.`, 'Supprimer'))) return;
    try { await db.rpc('supprimer_seance', { x: x.id }); toast('Séance supprimée'); await dessiner(); } catch (e) { erreur(e); }
  }

  await dessiner();
}

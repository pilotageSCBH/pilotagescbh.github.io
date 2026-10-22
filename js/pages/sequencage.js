// Séquençage d'une matière : séquences (intitulé, objectif principal) et leurs séances.
import { db } from '../api.js';
import { h, vider, champ, toast, erreur, confirmer, fenetre, nombre, heures, ajusterTout } from '../ui.js';

export async function pageSequencage(zone, id, ctx) {
  const m = ctx.matieres.find((x) => String(x.id) === String(id));
  if (!m) { vider(zone, h('p', {}, 'Matière introuvable.')); return; }
  const ref = await ctx.referentiel();
  const modif = ctx.peutMatiere(m.id);

  async function charger() {
    const sequences = await db.lire('sequences', `matiere_id=eq.${m.id}&promotion_id=eq.${ctx.promo.id}&order=numero`);
    const ids = sequences.map((s) => s.id);
    const seances = ids.length ? await db.lire('seances', `sequence_id=in.(${ids.join(',')})&order=numero`) : [];
    return { sequences, seances };
  }

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
        modif ? h('button', { class: 'icone', title: 'Supprimer la séquence', onclick: () => supprimerSequence(s, seances) }, '✖') : null),
      h('div', { class: 'objectif-sequence' }, h('label', {}, 'Objectif principal'),
        champ(s.objectif, maj('objectif'), { multi: true, lecture: !modif, placeholder: 'Objectif principal de la séquence' })),
      h('div', { class: 'tableau-defile' }, h('table', { class: 'seances' },
        h('colgroup', {}, [3, 4, 13, 6, 13, 19, 13, 14.5, 14.5].map((w) => h('col', { style: { width: w + '%' } }))),
        h('thead', {}, h('tr', {},
          ['', 'N°', 'Séance', 'Durée', 'Objectif intermédiaire', 'Objectifs opérationnels', 'Cours mobilisés', 'Compétences', 'Savoirs associés']
            .map((t) => h('th', {}, t)))),
        h('tbody', {}, seances.map((x) => ligneSeance(s, x, seances.length))))));
  }

  // ------------------------------------------------------------------------------------- séance
  function ligneSeance(s, x, nb) {
    const maj = (col, conv = (v) => v) => (v) => db.modifier('seances', x.id, { [col]: conv(v) });
    const durees = [{ valeur: '', texte: '—' }, ...ref.durees.map((d) => ({ valeur: d.heures, texte: heures(Number(d.heures)) }))];
    if (x.duree != null && !ref.durees.some((d) => Number(d.heures) === Number(x.duree))) durees.push({ valeur: x.duree, texte: heures(Number(x.duree)) });
    const tr = h('tr', { 'data-id': x.id },
      h('td', { class: 'poignee-cell' }, modif ? h('span', { class: 'poignee', title: 'Glisser pour déplacer la séance' }, '⠿') : null),
      h('td', { class: 'num' }, `${s.numero}.${x.numero}`,
        modif ? h('div', { class: 'mini-actions' },
          h('button', { class: 'icone petit', title: 'Insérer une séance après celle-ci', onclick: () => insererSeance(s, x) }, '＋'),
          nb > 1 ? h('button', { class: 'icone petit', title: 'Supprimer la séance', onclick: () => supprimerSeance(s, x) }, '✖') : null) : null),
      h('td', {}, champ(x.titre, maj('titre'), { multi: true, lecture: !modif, placeholder: 'Titre', classe: 'gras' })),
      h('td', {}, champ(x.duree ?? '', maj('duree', (v) => nombre(v)), { lecture: !modif, options: durees })),
      h('td', {}, champ(x.objectif_inter, maj('objectif_inter'), { multi: true, lecture: !modif })),
      h('td', {}, champ(x.objectifs_ops, maj('objectifs_ops'), { multi: true, lecture: !modif, placeholder: '- un objectif par ligne' }),
        modif ? h('button', { class: 'lien petit', onclick: (e) => choisirTaches(x, e.target.closest('td').querySelector('textarea')) }, '＋ depuis les tâches') : null),
      h('td', {}, champ(x.cours, maj('cours'), { multi: true, lecture: !modif })),
      h('td', {}, codes(x, 'competences', ref.competences, ref.comp)),
      h('td', {}, codes(x, 'savoirs', ref.savoirs, ref.sav)));
    if (modif) glisser(tr, s, x);
    return tr;
  }

  // codes compétences / savoirs : pastilles avec leur libellé, choix dans le référentiel
  function codes(x, col, liste, index) {
    const zoneC = h('div', { class: 'codes' });
    const afficher = () => vider(zoneC,
      (x[col] || []).map((c) => h('div', { class: 'code', title: index[c]?.libelle || 'Code absent du référentiel' },
        h('b', { class: index[c] ? '' : 'inconnu' }, c), h('span', {}, index[c]?.libelle_court || index[c]?.libelle || ''))),
      modif ? h('button', { class: 'lien petit', onclick: choisir }, (x[col] || []).length ? '✎ modifier' : '＋ choisir') : null);
    async function choisir() {
      const choix = new Set(x[col] || []);
      const recherche = h('input', { class: 'champ', placeholder: 'Rechercher (code ou mot)…' });
      const corps = h('div', { class: 'liste-choix' });
      const remplir = () => {
        const q = recherche.value.trim().toLowerCase();
        let fam = null;
        vider(corps, liste.filter((r) => !q || (r.code + ' ' + r.libelle).toLowerCase().includes(q)).flatMap((r) => {
          const out = [];
          if (col === 'competences' && r.famille !== fam) { fam = r.famille; out.push(h('div', { class: 'groupe' }, `${r.famille} – ${r.famille_libelle}`)); }
          out.push(h('label', { class: 'option' }, h('input', { type: 'checkbox', checked: choix.has(r.code),
            onchange: (e) => (e.target.checked ? choix.add(r.code) : choix.delete(r.code)) }), h('b', {}, r.code), ' ', r.libelle));
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
    return zoneC;
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

  // ------------------------------------------------------------------------------------- structure
  async function ajouterSequence() {
    try { await db.rpc('ajouter_sequence', { m: m.id, p: ctx.promo.id }); toast('Séquence ajoutée'); await dessiner(); window.scrollTo(0, document.body.scrollHeight); }
    catch (e) { erreur(e); }
  }
  async function supprimerSequence(s, seances) {
    if (!(await confirmer('Supprimer la séquence', `Supprimer définitivement la séquence ${s.numero}${s.intitule ? ' « ' + s.intitule + ' »' : ''} et ses ${seances.length} séance(s) ? Les séquences suivantes seront renumérotées.`, 'Supprimer'))) return;
    try { await db.rpc('supprimer_sequence', { s: s.id }); toast('Séquence supprimée'); await dessiner(); } catch (e) { erreur(e); }
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

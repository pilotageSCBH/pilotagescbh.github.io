// Stages et entreprises : pour chaque élève, ses périodes en entreprise (stage de 1re année, PFMP, apprentissage),
// l'entreprise, le tuteur, l'enseignant référent, la convention, l'attestation de stage (exigée pour l'épreuve U52)
// et les visites (date, mode, compte rendu). Visible des enseignants seulement (script SQL 39).
import { db } from '../api.js';
import { h, vider, toast, erreur, fenetre, confirmer, dateFr, imprimer } from '../ui.js';
import { chargerCollegues, nomCollegue } from '../ressources.js';
import { badgeRedoublant, badgePap } from '../redoublants.js';

const TYPES = ['Stage', 'PFMP', 'Apprentissage', 'Autre'];
const CONVENTIONS = ['À faire', 'Envoyée', 'Signée', 'Sans objet'];
const MODES = ['Sur place', 'Téléphone', 'Visio'];
const jours = (a, b) => (a && b ? Math.round((new Date(b) - new Date(a)) / 86400000) + 1 : null);
const semaines = (a, b) => { const j = jours(a, b); return j ? Math.round(j / 7 * 10) / 10 : null; };

export async function pageStages(zone, _arg, ctx) {
  const P = ctx.promo;
  let eleves, stages, visites;
  try {
    [eleves, stages, visites] = await Promise.all([db.lire('eleves', `promotion_id=eq.${P.id}&order=nom,prenom`), db.lire('stages', `promotion_id=eq.${P.id}&order=date_debut.nullslast,id`), chargerCollegues()]);
    visites = stages.length ? await db.lire('visites', `stage_id=in.(${stages.map((s) => s.id).join(',')})&order=date_visite.nullslast,id`) : [];
  } catch (e) {
    vider(zone, h('header', { class: 'entete-page' }, h('h1', {}, '🏭  Stages et entreprises')),
      h('div', { class: 'erreur-page' }, h('h2', {}, 'Pas encore installé'), h('p', {}, 'L’administrateur doit exécuter le script « 39_stages_epreuves_annonces.sql » dans Supabase, puis recharger la page.'), h('p', { class: 'aide' }, e.message)));
    return;
  }
  const modif = ctx.peutEcrire();
  const actifs = eleves.filter((e) => !e.arret);
  let filtre = 'tous';
  const collegues = (await chargerCollegues()) || [];
  const corps = h('div', {});
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const etat = (s) => (!s.date_debut ? 'à placer' : s.date_debut > aujourdhui ? 'à venir' : s.date_fin && s.date_fin < aujourdhui ? 'terminé' : 'en cours');

  function dessiner() {
    const vis = (s) => visites.filter((v) => v.stage_id === s.id);
    const liste = (filtre === 'sans' ? actifs.filter((e) => !stages.some((s) => s.eleve_id === e.id))
      : actifs).map((e) => ({ e, ss: stages.filter((s) => s.eleve_id === e.id && (filtre === 'tous' || filtre === 'sans' || etat(s) === filtre || (filtre === 'convention' && s.convention !== 'Signée' && s.convention !== 'Sans objet') || (filtre === 'attestation' && s.type === 'Stage' && !s.attestation))) }))
      .filter((x) => filtre === 'tous' || filtre === 'sans' || x.ss.length);
    const n = { total: stages.length, cours: stages.filter((s) => etat(s) === 'en cours').length, conv: stages.filter((s) => s.convention !== 'Signée' && s.convention !== 'Sans objet').length,
      att: stages.filter((s) => s.type === 'Stage' && !s.attestation && s.date_fin && s.date_fin < aujourdhui).length, sans: actifs.filter((e) => !stages.some((s) => s.eleve_id === e.id)).length };
    vider(corps,
      h('section', { class: 'chiffres-cles' },
        h('div', { class: 'tuile' }, h('strong', {}, n.total), h('span', {}, 'période(s) en entreprise')),
        h('div', { class: 'tuile' }, h('strong', {}, n.cours), h('span', {}, 'en cours')),
        h('div', { class: 'tuile' + (n.conv ? ' alerte' : '') }, h('strong', {}, n.conv), h('span', {}, 'convention(s) non signée(s)')),
        h('div', { class: 'tuile' + (n.att ? ' alerte' : '') }, h('strong', {}, n.att), h('span', {}, 'attestation(s) de stage manquante(s)')),
        h('div', { class: 'tuile' }, h('strong', {}, n.sans), h('span', {}, 'élève(s) sans période'))),
      h('div', { class: 'filtres-stages ecran' }, [['tous', 'Tous'], ['en cours', 'En cours'], ['à venir', 'À venir'], ['terminé', 'Terminés'], ['convention', 'Convention à suivre'], ['attestation', 'Attestation manquante'], ['sans', 'Sans période']]
        .map(([k, t]) => h('button', { class: 'btn petit' + (filtre === k ? ' principal' : ''), onclick: () => { filtre = k; dessiner(); } }, t))),
      liste.length ? h('div', { class: 'liste-stages' }, liste.map(({ e, ss }) => h('section', { class: 'carte-stage-eleve' },
        h('div', { class: 'tete-stage-eleve' }, h('h3', {}, h('b', {}, e.nom), ' ', e.prenom, ' ', badgeRedoublant(e, ctx), ' ', badgePap(e)),
          h('span', { class: 'badge ' + (e.statut === 'Apprenti' ? 'apprenti' : 'scolaire') }, e.statut),
          modif ? h('button', { class: 'btn petit ecran', onclick: () => editer(null, e) }, '＋ Période') : null),
        ss.length ? ss.map((s) => carte(s, vis(s))) : h('p', { class: 'vide petit' }, 'Aucune période en entreprise saisie.'))))
        : h('p', { class: 'vide' }, 'Aucun élève ne correspond à ce filtre.'));
  }
  function carte(s, vs) {
    const st = etat(s), sem = semaines(s.date_debut, s.date_fin);
    return h('article', { class: 'stage etat-' + st.replace(/\s|à/g, '') },
      h('div', { class: 'ligne-stage' },
        h('span', { class: 'type-stage' }, s.type), h('b', {}, s.entreprise || 'Entreprise à renseigner'), s.commune ? h('span', { class: 'gris' }, ' · ' + s.commune) : null,
        h('span', { class: 'pastille-etat' }, st),
        modif ? h('span', { class: 'boutons-stage ecran' }, h('button', { class: 'lien petit', onclick: () => visite(s, null) }, '＋ visite'), h('button', { class: 'lien petit', onclick: () => editer(s) }, '✎ modifier')) : null),
      h('div', { class: 'details-stage' },
        h('span', {}, '📅 ', s.date_debut ? `du ${dateFr(s.date_debut)} au ${dateFr(s.date_fin) || '…'}` : 'dates à fixer', sem ? ` (${String(sem).replace('.', ',')} sem.)` : ''),
        s.tuteur ? h('span', {}, '👷 Tuteur : ', h('b', {}, s.tuteur), s.tuteur_fonction ? ` (${s.tuteur_fonction})` : '', s.tuteur_tel ? ' · ' + s.tuteur_tel : '', s.tuteur_mail ? ' · ' + s.tuteur_mail : '') : null,
        s.referent ? h('span', {}, '🎓 Référent : ', nomCollegue(s.referent)) : null,
        h('span', { class: 'conv-' + (s.convention === 'Signée' || s.convention === 'Sans objet' ? 'ok' : 'ko') }, '📄 Convention : ', s.convention),
        s.type === 'Stage' ? h('span', { class: 'conv-' + (s.attestation ? 'ok' : 'ko') }, s.attestation ? '✔ Attestation de stage reçue' : '✖ Attestation de stage non reçue') : null),
      s.notes ? h('p', { class: 'notes-stage' }, s.notes) : null,
      vs.length ? h('ul', { class: 'visites' }, vs.map((v) => h('li', {},
        h('b', {}, `${v.mode} · ${dateFr(v.date_visite) || 'date ?'}`), v.par ? h('span', { class: 'gris' }, ' · ' + nomCollegue(v.par)) : null,
        modif ? h('button', { class: 'lien petit ecran', onclick: () => visite(s, v) }, ' ✎') : null,
        v.compte_rendu ? h('div', { class: 'cr-visite' }, v.compte_rendu) : null))) : null);
  }

  async function editer(s, eleve = null) {
    const e = eleve || eleves.find((x) => x.id === s.eleve_id);
    const v = s || { type: e.statut === 'Apprenti' ? 'Apprentissage' : 'Stage', entreprise: e.statut === 'Apprenti' ? e.entreprise || '' : '', commune: e.statut === 'Apprenti' ? e.entreprise_commune || '' : '', convention: 'À faire' };
    const ch = (k, ph = '', type = 'text') => h('input', { class: 'champ', type, value: v[k] ?? '', placeholder: ph });
    const sel = (k, l) => h('select', { class: 'champ' }, l.map((o) => h('option', { selected: (v[k] ?? l[0]) === o }, o)));
    const F = { type: sel('type', TYPES), entreprise: ch('entreprise', 'Raison sociale'), adresse: ch('adresse'), commune: ch('commune'), entreprise_tel: ch('entreprise_tel', '', 'tel'), entreprise_mail: ch('entreprise_mail', '', 'email'),
      tuteur: ch('tuteur', 'Prénom NOM'), tuteur_fonction: ch('tuteur_fonction', 'ex. conducteur de travaux'), tuteur_tel: ch('tuteur_tel', '', 'tel'), tuteur_mail: ch('tuteur_mail', '', 'email'),
      date_debut: ch('date_debut', '', 'date'), date_fin: ch('date_fin', '', 'date'), convention: sel('convention', CONVENTIONS) };
    const referent = h('select', { class: 'champ' }, h('option', { value: '' }, '—'), collegues.map((c) => h('option', { value: c.id, selected: v.referent === c.id }, c.nom)));
    const attestation = h('input', { type: 'checkbox', checked: !!v.attestation });
    const notes = h('textarea', { class: 'champ', rows: 3 }, v.notes || '');
    const boutons = [{ texte: 'Annuler', valeur: false }];
    if (s) boutons.unshift({ texte: 'Supprimer', classe: 'danger gauche', action: async () => {
      if (!(await confirmer('Supprimer la période', `Supprimer cette période en entreprise de ${e.prenom} ${e.nom} et ses visites ?`, 'Supprimer'))) return false;
      await db.supprimer('stages', s.id); stages = stages.filter((x) => x.id !== s.id); visites = visites.filter((x) => x.stage_id !== s.id); return 'maj';
    } });
    boutons.push({ texte: 'Enregistrer', classe: 'principal', action: async () => {
      const d = Object.fromEntries(Object.entries(F).map(([k, el]) => [k, el.value.trim()]));
      d.date_debut = d.date_debut || null; d.date_fin = d.date_fin || null;
      if (d.date_debut && d.date_fin && d.date_fin < d.date_debut) throw new Error('La date de fin est avant la date de début.');
      Object.assign(d, { referent: referent.value || null, attestation: attestation.checked, notes: notes.value.trim(), maj_le: new Date().toISOString() });
      if (s) { const r = await db.modifier('stages', s.id, d); Object.assign(s, r || d); }
      else stages.push(await db.ajouter('stages', { ...d, promotion_id: P.id, eleve_id: e.id }));
      toast('Période enregistrée'); return 'maj';
    } });
    const r = await fenetre(`${s ? 'Période en entreprise' : 'Nouvelle période'} · ${e.prenom} ${e.nom}`, h('div', { class: 'formulaire' },
      h('label', {}, 'Type', F.type), h('label', {}, 'Convention', F.convention),
      h('label', {}, 'Du', F.date_debut), h('label', {}, 'Au', F.date_fin),
      h('p', { class: 'sous-titre-choix large' }, '🏭 Entreprise'),
      h('label', { class: 'large' }, 'Entreprise', F.entreprise), h('label', { class: 'large' }, 'Adresse', F.adresse), h('label', {}, 'Commune', F.commune),
      h('label', {}, 'Téléphone', F.entreprise_tel), h('label', { class: 'large' }, 'Mail', F.entreprise_mail),
      h('p', { class: 'sous-titre-choix large' }, '👷 Tuteur'),
      h('label', {}, 'Nom', F.tuteur), h('label', {}, 'Fonction', F.tuteur_fonction), h('label', {}, 'Téléphone', F.tuteur_tel), h('label', {}, 'Mail', F.tuteur_mail),
      h('p', { class: 'sous-titre-choix large' }, '🎓 Suivi'),
      h('label', {}, 'Enseignant référent', referent), h('label', { class: 'case-form' }, attestation, ' Attestation (certificat) de stage reçue'),
      h('label', { class: 'large' }, 'Notes (visibles des enseignants seulement)', notes)), boutons, { large: true });
    if (r === 'maj') dessiner();
  }

  async function visite(s, v) {
    const d = h('input', { class: 'champ', type: 'date', value: v?.date_visite || aujourdhui });
    const mode = h('select', { class: 'champ' }, MODES.map((m) => h('option', { selected: (v?.mode || 'Sur place') === m }, m)));
    const cr = h('textarea', { class: 'champ', rows: 8, placeholder: 'Activités observées, avis du tuteur, points à travailler, suite à donner…' }, v?.compte_rendu || '');
    const boutons = [{ texte: 'Annuler', valeur: false }];
    if (v) boutons.unshift({ texte: 'Supprimer', classe: 'danger gauche', action: async () => { await db.supprimer('visites', v.id); visites = visites.filter((x) => x.id !== v.id); return 'maj'; } });
    boutons.push({ texte: 'Enregistrer', classe: 'principal', action: async () => {
      const x = { date_visite: d.value || null, mode: mode.value, compte_rendu: cr.value.trim(), maj_le: new Date().toISOString() };
      if (v) { const r = await db.modifier('visites', v.id, x); Object.assign(v, r || x); } else visites.push(await db.ajouter('visites', { ...x, stage_id: s.id }));
      toast('Visite enregistrée'); return 'maj';
    } });
    const e = eleves.find((x) => x.id === s.eleve_id);
    const r = await fenetre(`Visite · ${e?.prenom || ''} ${e?.nom || ''} · ${s.entreprise || s.type}`, h('div', { class: 'formulaire' },
      h('label', {}, 'Date', d), h('label', {}, 'Mode', mode), h('label', { class: 'large' }, 'Compte rendu', cr)), boutons, { large: true });
    if (r === 'maj') dessiner();
  }

  vider(zone,
    h('header', { class: 'entete-page' },
      h('div', {}, h('h1', {}, '🏭  Stages et entreprises'), h('p', { class: 'sous-titre' }, `Promotion ${P.libelle} · stages, PFMP, apprentissage, visites`)),
      h('div', { class: 'actions-page' }, h('button', { class: 'btn', onclick: () => imprimer('A4 portrait') }, '🖶  Imprimer / PDF'))),
    h('p', { class: 'aide ecran' }, 'Pour chaque élève : ses périodes en entreprise, l’entreprise et le tuteur, l’enseignant référent, la convention, l’attestation de stage (exigée pour se présenter à l’épreuve E5 – U52) et les visites. Visible des enseignants seulement.'),
    corps);
  dessiner();
}

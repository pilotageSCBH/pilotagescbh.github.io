// Choix de documents reliés à une séance : « Cours mobilisés » (esp = 'cours', Mes cours) ou « Ressources » (esp = 'divers',
// Mes ressources diverses). Enregistre seances.cours_lies (et les savoirs repris des cours) ; renvoie true si enregistré.
// Utilisé par le séquençage et par la fiche de déroulement (les deux restent synchronisés : même séance).
import { db } from './api.js';
import { h, vider, toast, erreur, fenetre } from './ui.js';
import { iconeDoc } from './pages/cours.js';
import { chargerReglages, masqueeNuage } from './ressources.js';

export async function choisirDocuments(ctx, ref, x, esp = 'cours') {
  const divers = esp === 'divers';
  let rows, collegues = [];
  try {
    let themes, livres;
    [themes, livres, collegues] = await Promise.all([db.lire('biblio_themes', `espace=eq.${esp}&order=ordre,id`), db.lire('biblio_livres', `espace=eq.${esp}&order=ordre,id`), db.rpc('collegues').catch(() => [])]);
    await chargerReglages().catch(() => null);
    livres = livres.filter((l) => !masqueeNuage(l));   // ressources plus partagées sur Nuage : non proposées
    // dossiers et documents de « Mes cours » sous une forme commune (les dossiers ont un identifiant « d… »)
    rows = [...themes.map((t) => ({ id: 'd' + t.id, type: 'dossier', parent_id: t.parent_id ? 'd' + t.parent_id : null, titre: t.nom, proprietaire: t.proprietaire, ordre: t.ordre, espace: t.espace })),
      ...livres.map((l) => ({ id: l.id, type: 'cours', parent_id: l.theme_id ? 'd' + l.theme_id : null, titre: l.titre, proprietaire: l.proprietaire, ordre: 1e6 + l.ordre, savoirs: l.savoirs || [], lien: l.lien || '', genre: l.genre || 'cours', espace: l.espace }))];
  } catch { erreur(new Error('« Mes cours » n’est pas encore installé : l’administrateur doit exécuter le script SQL 26.')); return false; }
  const R = new Map(rows.map((r) => [r.id, r]));
  const autres = (x.cours_lies || []).filter((c) => (c.espace === 'divers') !== divers);   // l'autre colonne : inchangée
  const anciens = (x.cours_lies || []).filter((c) => (c.espace === 'divers') === divers);
  const choix = new Set(anciens.map((c) => c.id));
  const moi = ctx.profil.id;
  const nomDe = (u) => collegues.find((c) => c.id === u)?.nom || 'Un collègue';
  const chemin = (r) => { const l = []; let p = R.get(r.parent_id); let n = 0; while (p && n++ < 50) { l.unshift(p.titre || 'Dossier'); p = R.get(p.parent_id); } return l.join(' › '); };
  // ordre de l'arborescence (dossiers dans l'ordre, puis leur contenu)
  const ordre = [];
  const parcourir = (parent, proprio) => rows.filter((r) => (r.parent_id ?? null) === parent && r.proprietaire === proprio)
    .forEach((r) => { if (r.type === 'cours') ordre.push(r); else parcourir(r.id, proprio); });
  const proprios = [moi, ...new Set(rows.filter((r) => r.proprietaire !== moi).map((r) => r.proprietaire))];
  const ESP = [esp], parcourirE = (parent, proprio, esp) => rows.filter((r) => (r.parent_id ?? null) === parent && r.proprietaire === proprio && (parent !== null || (r.espace || 'cours') === esp))
    .forEach((r) => { if (r.type === 'cours') ordre.push(r); else parcourir(r.id, proprio); });
  for (const u of proprios) for (const esp of ESP) { parcourirE(null, u, esp); rows.filter((r) => r.proprietaire === u && (r.espace || 'cours') === esp && r.parent_id && !R.has(r.parent_id)).forEach((r) => { if (r.type === 'cours') ordre.push(r); else parcourir(r.id, u); }); }
  const disparus = anciens.filter((c) => !R.has(c.id));
  const rech = h('input', { class: 'champ', placeholder: divers ? 'Rechercher une ressource (titre)…' : 'Rechercher un cours (titre, savoir)…' });
  const corps = h('div', { class: 'liste-choix' });
  const sans = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const remplir = () => {
    const q = sans(rech.value).split(/\s+/).filter(Boolean);
    let grp = null;
    const ok = (r) => !q.length || q.every((m) => sans(r.titre + ' ' + (r.savoirs || []).join(' ') + ' ' + chemin(r)).includes(m));
    vider(corps, ordre.filter(ok).flatMap((r) => {
      const out = [];
      const nomE = r.espace === 'divers' ? 'Ressources diverses' : 'Cours';
      const g = (r.proprietaire === moi ? (r.espace === 'divers' ? 'Mes ressources diverses' : 'Mes cours') : nomE + ' partagés par ' + nomDe(r.proprietaire)) + (chemin(r) ? ' · ' + chemin(r) : '');
      if (g !== grp) { grp = g; out.push(h('div', { class: 'groupe' }, g)); }
      out.push(h('label', { class: 'option' }, h('input', { type: 'checkbox', checked: choix.has(r.id), onchange: (e) => (e.target.checked ? choix.add(r.id) : choix.delete(r.id)) }),
        iconeDoc(r) + ' ', h('b', {}, r.titre || 'Document sans titre'), (r.savoirs || []).length ? h('small', { class: 'detail-choix' }, 'Savoirs : ' + r.savoirs.join(', ')) : h('small', { class: 'detail-choix' }, 'aucun savoir associé')));
      return out;
    }), disparus.length ? [h('div', { class: 'groupe' }, divers ? 'Ressources plus disponibles (supprimées ou plus partagées)' : 'Cours plus disponibles (supprimés ou plus partagés)'),
      disparus.map((c) => h('label', { class: 'option' }, h('input', { type: 'checkbox', checked: choix.has(c.id), onchange: (e) => (e.target.checked ? choix.add(c.id) : choix.delete(c.id)) }), '📘 ', h('b', {}, c.titre)))] : null,
    !ordre.length ? h('p', { class: 'vide' }, divers ? 'Aucune ressource : ajoutez vos documents dans « Mes ressources → Mes ressources diverses ».' : 'Aucun document renseigné : ajoutez vos cours, exercices, évaluations… dans « Mes ressources → Mes cours ».') : null);
  };
  rech.addEventListener('input', remplir); remplir();
  const ok = await fenetre(divers ? `Ressources · séance ${x.titre || ''}` : `Cours mobilisés · séance ${x.titre || ''}`, h('div', {},
    h('p', { class: 'aide' }, divers ? 'Cochez les documents de « Mes ressources diverses » (les vôtres et ceux partagés avec vous) utiles à cette séance : ils s’affichent dans la colonne « Ressources », dans la fiche de déroulement (Matériel et ressources) et, s’ils sont sur Nuage, dans « Mes ressources diverses » de l’espace élève.'
      : 'Cochez les documents de « Mes cours » (cours, exercices, TD/TP, évaluations… : les vôtres et ceux partagés avec vous) mobilisés dans cette séance : leurs savoirs associés sont ajoutés à la séance.'),
    rech, corps), [{ texte: 'Annuler', valeur: false }, { texte: 'Valider', classe: 'principal', valeur: true }], { large: true });
  if (!ok) return false;
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
    if (!divers) for (const c of savoirs) if (!sav.includes(c)) { sav.push(c); ajoutes.push(c); auto.add(c); }
    return { id, titre: r ? r.titre : a.titre, savoirs, ajoutes, lien: r ? (r.lien || '') : (a?.lien || ''), genre: r ? (r.genre || 'cours') : (a?.genre || 'cours'), espace: r ? (r.espace || esp) : (a?.espace || esp) };
  });
  const rang = ref.savoirs.map((y) => y.code);
  sav.sort((a, b) => rang.indexOf(a) - rang.indexOf(b));
  try {
    const tous = divers ? [...autres, ...lies] : [...lies, ...autres];
    await db.modifier('seances', x.id, { cours_lies: tous, savoirs: sav });
    x.cours_lies = tous; x.savoirs = sav;
    toast(divers ? (lies.length ? `${lies.length} ressource(s) reliée(s)` : 'Ressources retirées') : (lies.length ? `${lies.length} cours relié(s) · savoirs mis à jour` : 'Cours retirés'));
    return true;
  } catch (e) { erreur(e); }
  return false;
}

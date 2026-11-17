// Annonces aux élèves : messages courts pour une promotion (ex. « apportez vos EPI jeudi »), affichés en haut de
// « Ma semaine » dans l'espace élève, de la date de début à la date de fin (script SQL 39).
import { db } from '../api.js';
import { h, vider, toast, erreur, fenetre, confirmer, dateFr } from '../ui.js';
import { chargerCollegues, nomCollegue } from '../ressources.js';
import { apercuEleve } from '../app.js';

export async function pageAnnonces(zone, _arg, ctx) {
  const P = ctx.promo, modif = ctx.peutEcrire();
  let annonces;
  try { [annonces] = await Promise.all([db.lire('annonces', `promotion_id=eq.${P.id}&order=debut.desc,id.desc`), chargerCollegues()]); }
  catch (e) {
    vider(zone, h('header', { class: 'entete-page' }, h('h1', {}, '📣  Annonces aux élèves')),
      h('div', { class: 'erreur-page' }, h('h2', {}, 'Pas encore installé'), h('p', {}, 'L’administrateur doit exécuter le script « 39_stages_epreuves_annonces.sql » dans Supabase, puis recharger la page.'), h('p', { class: 'aide' }, e.message)));
    return;
  }
  const auj = new Date().toISOString().slice(0, 10);
  const etat = (a) => (a.debut > auj ? 'à venir' : a.fin && a.fin < auj ? 'terminée' : 'en ligne');
  const corps = h('div', {});
  function dessiner() {
    const groupes = [['en ligne', '🟢 En ligne (visibles des élèves)'], ['à venir', '🕒 Programmées'], ['terminée', '⚪ Terminées']];
    vider(corps, annonces.length ? groupes.map(([k, t]) => {
      const l = annonces.filter((a) => etat(a) === k).sort((a, b) => (b.importante - a.importante) || String(b.debut).localeCompare(String(a.debut)));
      return l.length ? h('section', { class: 'bloc-annonces' }, h('h2', { class: 'titre-section' }, `${t} · ${l.length}`), l.map(carte)) : null;
    }) : h('p', { class: 'vide' }, 'Aucune annonce pour cette promotion. « ＋ Nouvelle annonce » pour en écrire une.'));
  }
  const carte = (a) => h('article', { class: 'annonce' + (a.importante ? ' importante' : '') + ' etat-' + etat(a).replace(/\s|à/g, '') },
    h('div', { class: 'tete-annonce' }, a.importante ? h('span', { class: 'badge-important' }, '❗ Importante') : null, h('b', {}, a.titre || 'Annonce'),
      h('span', { class: 'gris petit' }, ` · du ${dateFr(a.debut)}${a.fin ? ' au ' + dateFr(a.fin) : ' (sans fin)'} · ${nomCollegue(a.auteur)}`),
      modif ? h('button', { class: 'lien petit', onclick: () => editer(a) }, '✎ modifier') : null),
    a.texte ? h('p', { class: 'texte-annonce' }, a.texte) : null);

  async function editer(a) {
    const titre = h('input', { class: 'champ', value: a?.titre || '', maxlength: 160, placeholder: 'ex. Visite de chantier jeudi' });
    const texte = h('textarea', { class: 'champ', rows: 5, maxlength: 3000, placeholder: 'ex. Rendez-vous à 8 h devant l’atelier, EPI obligatoires (chaussures, casque, gilet).' }, a?.texte || '');
    const debut = h('input', { class: 'champ', type: 'date', value: a?.debut || auj });
    const fin = h('input', { class: 'champ', type: 'date', value: a?.fin || '' });
    const imp = h('input', { type: 'checkbox', checked: !!a?.importante });
    const boutons = [{ texte: 'Annuler', valeur: false }];
    if (a) boutons.unshift({ texte: 'Supprimer', classe: 'danger gauche', action: async () => {
      if (!(await confirmer('Supprimer l’annonce', `Supprimer l’annonce « ${a.titre || 'sans titre'} » ?`, 'Supprimer'))) return false;
      await db.supprimer('annonces', a.id); annonces = annonces.filter((x) => x.id !== a.id); return 'maj';
    } });
    boutons.push({ texte: a ? 'Enregistrer' : 'Publier', classe: 'principal', action: async () => {
      const d = { titre: titre.value.trim(), texte: texte.value.trim(), debut: debut.value || auj, fin: fin.value || null, importante: imp.checked };
      if (!d.titre && !d.texte) throw new Error('Écrivez au moins un titre ou un texte.');
      if (d.fin && d.fin < d.debut) throw new Error('La date de fin est avant la date de début.');
      if (a) { const r = await db.modifier('annonces', a.id, d); Object.assign(a, r || d); } else annonces.unshift(await db.ajouter('annonces', { ...d, promotion_id: P.id }));
      toast(a ? 'Annonce enregistrée' : 'Annonce publiée'); return 'maj';
    } });
    const r = await fenetre(a ? 'Modifier l’annonce' : `Nouvelle annonce · promotion ${P.libelle}`, h('div', { class: 'formulaire' },
      h('label', { class: 'large' }, 'Titre', titre), h('label', { class: 'large' }, 'Texte', texte),
      h('label', {}, 'Visible à partir du', debut), h('label', {}, 'Jusqu’au (vide = sans fin)', fin),
      h('label', { class: 'case-form large' }, imp, ' Importante (affichée en premier, en couleur)'),
      h('p', { class: 'aide large' }, 'Les élèves de la promotion la voient en haut de « Ma semaine » dans leur espace, pendant la période choisie. Pas de données personnelles dans une annonce : elle est vue par toute la classe.')), boutons, { large: true });
    if (r === 'maj') dessiner();
  }

  vider(zone,
    h('header', { class: 'entete-page' },
      h('div', {}, h('h1', {}, '📣  Annonces aux élèves'), h('p', { class: 'sous-titre' }, `Promotion ${P.libelle} · affichées en haut de « Ma semaine » dans l’espace élève`)),
      h('div', { class: 'actions-page' },
        h('button', { class: 'btn', onclick: () => apercuEleve(P.id), title: 'Voir l’espace élève de cette promotion comme un élève fictif' }, '👁  Voir comme un élève'),
        modif ? h('button', { class: 'btn principal', onclick: () => editer(null) }, '＋  Nouvelle annonce') : null)),
    corps);
  dessiner();
}

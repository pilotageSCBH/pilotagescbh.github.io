// Contrats hors séquence : fiches contrat formatif ou sommatif rattachées seulement à une promotion et une matière,
// pour évaluer des compétences (souvent transversales) qui ne sont pas prévues dans le séquençage.
// #/contrats : liste par matière et création ; #/contrats/ID : la fiche contrat (en-tête, critères, notes).
import { db } from '../api.js';
import { h, vider, champ, toast, erreur, confirmer, fenetre, imprimer, dateFr } from '../ui.js';
import { dessinerContrat } from './contrat.js';

const TYPES = { formatif: ['Fiche contrat formatif', '✅'], sommatif: ['Fiche contrat sommatif', '🏁'] };

export async function pageContratsLibres(zone, arg, ctx) {
  if (/^\d+$/.test(String(arg || ''))) return fiche(zone, Number(arg), ctx);
  const P = ctx.promo;
  const contrats = await db.lire('contrats', `promotion_id=eq.${P.id}&order=date_eval.nullslast,id`);
  const ids = contrats.map((c) => c.id);
  const criteres = ids.length ? await db.lire('criteres', `contrat_id=in.(${ids.join(',')})&select=contrat_id,groupe,actif`) : [];
  const comps = (c) => [...new Set(criteres.filter((k) => k.contrat_id === c.id && k.actif).map((k) => k.groupe))];
  const peutCreer = ctx.matieres.some((m) => ctx.peutMatiere(m.id));

  vider(zone,
    h('header', { class: 'entete-page' },
      h('div', {}, h('h1', {}, '📌  Contrats hors séquence'),
        h('p', { class: 'sous-titre' }, `Documents professeurs · Documents d’évaluation  ·  Promotion ${P.libelle}`)),
      h('div', { class: 'actions-page' }, peutCreer ? h('button', { class: 'btn principal', onclick: () => creer(ctx) }, '＋  Nouveau contrat') : null)),
    h('p', { class: 'aide' }, 'Fiches contrat formatif ou sommatif qui ne dépendent d’aucune séquence : par exemple pour évaluer des compétences transversales (C5, C6) non prévues dans le séquençage. '
      + 'Les contrats sommatifs comptent comme les autres dans la validation des compétences, les résultats et moyennes, la fiche élève et le livret.'),
    h('section', { class: 'grille-libres' }, ctx.matieres.map((m) => {
      const l = contrats.filter((c) => c.matiere_id === m.id);
      if (!l.length && !ctx.peutMatiere(m.id)) return null;
      return h('div', { class: 'carte-matiere', style: { '--couleur': m.couleur } },
        h('div', { class: 'bandeau' }, h('h3', {}, m.nom), h('span', { class: 'etat' }, `${l.length} contrat(s)`)),
        l.length ? h('ul', { class: 'liste-libres' }, l.map((c) => h('li', {},
          h('a', { href: '#/contrats/' + c.id }, h('span', { class: 'type-libre ' + c.type }, TYPES[c.type][1]),
            h('span', {}, h('b', {}, c.titre || 'Sans titre'),
              h('small', {}, `${c.type === 'sommatif' ? 'Sommatif' : 'Formatif'}${c.date_eval ? ' · ' + dateFr(c.date_eval) : ' · sans date'}${comps(c).length ? ' · ' + comps(c).join(' ') : ''}`))))))
          : h('p', { class: 'profs' }, 'Aucun contrat hors séquence.'),
        ctx.peutMatiere(m.id) ? h('button', { class: 'lien petit ajout-libre', onclick: () => creer(ctx, m.id) }, '＋ nouveau contrat dans cette matière') : null);
    })));
}

// création : type, matière, titre, date, compétences à évaluer (transversales en tête)
async function creer(ctx, matiere = null) {
  const ref = await ctx.referentiel();
  const mats = ctx.matieres.filter((m) => ctx.peutMatiere(m.id));
  if (!matiere) matiere = ctx.matieres.find((m) => ctx.enseigne(m.id))?.id ?? null;   // par défaut : sa matière
  const type = h('select', { class: 'champ' }, h('option', { value: 'formatif' }, 'Fiche contrat formatif'), h('option', { value: 'sommatif' }, 'Fiche contrat sommatif'));
  const mat = h('select', { class: 'champ' }, mats.map((m) => h('option', { value: m.id, selected: m.id === matiere }, m.nom)));
  const titre = h('input', { class: 'champ', placeholder: 'ex. Communication orale – présentation du projet' });
  const date = h('input', { class: 'champ', type: 'date' });
  const cases = new Map();
  const bloc = (t, cs, ouvert) => h('details', { class: 'groupe-comps', open: ouvert }, h('summary', {}, t),
    cs.map((c) => { const cb = h('input', { type: 'checkbox' }); cases.set(c.code, cb); return h('label', { class: 'choix-doc' }, cb, h('b', {}, c.code), ' ', c.libelle); }));
  const r = await fenetre('Nouveau contrat hors séquence', h('div', { class: 'creation-libre' },
    h('div', { class: 'formulaire' }, h('label', {}, 'Type', type), h('label', {}, 'Matière', mat), h('label', { class: 'large' }, 'Titre de l’évaluation', titre), h('label', {}, 'Date', date)),
    h('p', { class: 'aide' }, 'Compétences évaluées : une rubrique par compétence, avec ses indicateurs de performance comme critères (modifiables ensuite). Vous pourrez aussi ajouter des rubriques libres.'),
    bloc('Compétences transversales (C5 · C6)', ref.competences.filter((c) => ctx.transversale(c.code)), true),
    bloc('Compétences cœur de métier (C1 à C4)', ref.competences.filter((c) => !ctx.transversale(c.code)), false)),
  [{ texte: 'Annuler', valeur: null }, { texte: '＋  Créer le contrat', classe: 'principal', action: async () => {
    if (!titre.value.trim()) throw new Error('Donnez un titre à l’évaluation.');
    const comps = [...cases].filter(([, cb]) => cb.checked).map(([k]) => k);
    return db.rpc('creer_contrat_libre', { t: type.value, p: ctx.promo.id, m: Number(mat.value), titre: titre.value.trim(), d: date.value || null, comps });
  } }], { large: true });
  if (r) { toast('Contrat créé'); location.hash = '#/contrats/' + r; }
}

// la fiche d'un contrat hors séquence
async function fiche(zone, id, ctx) {
  const c = (await db.lire('contrats', `id=eq.${id}`))[0];
  if (!c || !c.matiere_id) { vider(zone, h('p', { class: 'vide' }, 'Contrat introuvable.')); return; }
  const m = ctx.matieres.find((x) => x.id === c.matiere_id);
  const modif = ctx.peutMatiere(m.id);
  const promo = ctx.promotions.find((p) => p.id === c.promotion_id);
  if (promo && promo.id !== ctx.promo.id) { ctx.choisirPromo(promo.annee_debut); return; }   // la grille de notes est celle de la promotion du contrat
  const profs = ctx.enseignantsDe(m.id).join(', ') || '—';
  const corps = h('div', {});
  vider(zone,
    h('header', { class: 'entete-page ecran' },
      h('div', {}, h('h1', {}, h('span', { class: 'pastille', style: { background: m.couleur } }), c.titre || 'Contrat hors séquence'),
        h('p', { class: 'sous-titre' }, `${m.nom}  ·  ${TYPES[c.type][0]} hors séquence  ·  Promotion ${promo?.libelle || ''}`)),
      h('div', { class: 'actions-page' },
        h('a', { class: 'btn', href: '#/contrats' }, '☰  Tous les contrats hors séquence'),
        h('button', { class: 'btn', onclick: () => imprimer('A4 landscape') }, '🖶  Imprimer'),
        modif ? h('button', { class: 'btn danger', onclick: async () => {
          if (!(await confirmer('Supprimer le contrat', `Supprimer « ${c.titre || 'ce contrat'} », ses critères et toutes les notes saisies ?`, 'Supprimer'))) return;
          try { await db.supprimer('contrats', c.id); toast('Contrat supprimé'); location.hash = '#/contrats'; } catch (e) { erreur(e); }
        } }, '✖  Supprimer') : null)),
    !modif ? h('p', { class: 'badge-lecture ecran' }, 'Consultation seule : vous n’enseignez pas cette matière.') : null,
    h('article', { class: 'feuille large' },
      h('div', { class: 'tete-fiche', style: { '--couleur': m.couleur } }, h('img', { src: 'img/logo.jpg', alt: '' }),
        h('div', {}, h('h2', {}, c.type === 'sommatif' ? 'FICHE CONTRAT SOMMATIF' : 'FICHE CONTRAT FORMATIF'),
          h('p', {}, champ(c.titre, async (v) => { await db.modifier('contrats', c.id, { titre: v }); c.titre = v; }, { lecture: !modif, classe: 'titre-libre', placeholder: 'Titre de l’évaluation' })))),
      h('div', { class: 'grille-infos' },
        h('div', { class: 'info' }, h('span', { class: 'lib' }, 'Matière'), h('span', { class: 'val' }, m.nom)),
        h('div', { class: 'info' }, h('span', { class: 'lib' }, 'Enseignant'), h('span', { class: 'val' }, profs)),
        h('div', { class: 'info' }, h('span', { class: 'lib' }, 'Promotion'), h('span', { class: 'val' }, promo?.libelle || '')),
        h('div', { class: 'info' }, h('span', { class: 'lib' }, 'Cadre'), h('span', { class: 'val' }, 'Hors séquence'))),
      corps));
  const ref = await ctx.referentiel();
  await dessinerContrat(corps, { type: c.type, contratId: c.id, modif, ctx,
    titreGroupe: (g) => ({ code: g, libelle: ref.comp[g]?.libelle || '' }) });
}

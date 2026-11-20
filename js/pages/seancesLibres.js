// Séances hors séquence : séances rattachées seulement à une promotion et une matière (cas particuliers : séance de
// rattrapage, intervention extérieure, visite…), avec leur fiche de déroulement et leur fiche contrat formatif.
// Elles n'apparaissent ni dans le séquençage, ni dans la progression, ni dans la couverture du référentiel.
// #/seances-hors : liste par matière et création ; la fiche s'ouvre dans #/fiches/h-ID.
import { db } from '../api.js';
import { h, vider, toast, erreur, confirmer, fenetre, heures } from '../ui.js';
import { codesDans, enListe } from '../ia.js';

const installe = (e) => !/promotion_id|matiere_id|seances_rattachement|sequence_id/.test(String(e?.message || e));

export async function pageSeancesLibres(zone, arg, ctx) {
  const P = ctx.promo;
  let seances;
  try { seances = await db.lire('seances', `promotion_id=eq.${P.id}&sequence_id=is.null&order=matiere_id,numero`); }
  catch (e) {
    if (installe(e)) throw e;
    vider(zone, h('div', { class: 'erreur-page' }, h('h2', {}, 'Pas encore installé'), h('p', {}, 'L’administrateur doit exécuter le script SQL 41 (séances hors séquence) dans Supabase.')));
    return;
  }
  const peutCreer = ctx.matieres.some((m) => ctx.enseigne(m.id));
  vider(zone,
    h('header', { class: 'entete-page' },
      h('div', {}, h('h1', {}, '🧩  Séances hors séquence'),
        h('p', { class: 'sous-titre' }, `Documents pédagogiques · Fiches de préparation  ·  Promotion ${P.libelle}`)),
      h('div', { class: 'actions-page' }, peutCreer ? h('button', { class: 'btn principal', onclick: () => creer(ctx) }, '＋  Nouvelle séance hors séquence') : null)),
    h('p', { class: 'aide' }, 'Pour les cas particuliers (rattrapage, intervention extérieure, visite d’entreprise ou de chantier…) : une séance qui n’appartient à aucune séquence, avec sa fiche de déroulement et sa fiche contrat formatif. '
      + 'Elle n’apparaît ni dans le séquençage, ni dans la progression. Supprimer la séance supprime ses fiches.'),
    h('section', { class: 'grille-libres' }, ctx.matieres.map((m) => {
      const l = seances.filter((x) => x.matiere_id === m.id);
      if (!l.length && !ctx.enseigne(m.id)) return null;
      const modif = ctx.enseigne(m.id);
      return h('div', { class: 'carte-matiere', style: { '--couleur': m.couleur } },
        h('div', { class: 'bandeau' }, h('h3', {}, m.nom), h('span', { class: 'etat' }, `${l.length} séance(s)`)),
        l.length ? h('ul', { class: 'liste-libres' }, l.map((x) => h('li', { class: 'seance-libre' },
          h('a', { href: `#/fiches/h-${x.id}:seance-${x.id}` }, h('span', { class: 'type-libre formatif' }, '📝'),
            h('span', {}, h('b', {}, x.titre || 'Sans titre'),
              h('small', {}, [x.duree ? heures(Number(x.duree)) : 'durée ?', (x.competences || []).join(' ')].filter(Boolean).join(' · ')))),
          h('span', { class: 'actions-libre' },
            h('a', { class: 'lien petit', href: `#/fiches/h-${x.id}:formatif-${x.id}`, title: 'Fiche contrat formatif' }, '✅'),
            modif ? h('button', { class: 'lien petit', title: 'Modifier la séance', onclick: async () => { if (await modifierSeanceLibre(ctx, x)) pageSeancesLibres(zone, arg, ctx); } }, '✎') : null,
            modif ? h('button', { class: 'lien petit', title: 'Supprimer la séance et ses fiches', onclick: async () => {
              if (!(await confirmer('Supprimer la séance', `Supprimer définitivement la séance hors séquence « ${x.titre || 'sans titre'} », sa fiche de déroulement et sa fiche contrat formatif (avec les notes) ?`, 'Supprimer'))) return;
              try { await db.supprimer('seances', x.id); toast('Séance supprimée'); pageSeancesLibres(zone, arg, ctx); } catch (e) { erreur(e); }
            } }, '✖') : null))))
          : h('p', { class: 'profs' }, 'Aucune séance hors séquence.'),
        modif ? h('button', { class: 'lien petit ajout-libre', onclick: () => creer(ctx, m.id) }, '＋ nouvelle séance dans cette matière') : null);
    })));
}

// formulaire commun (création / modification) ; renvoie les valeurs ou null
async function formulaire(ctx, x, matiereId) {
  const ref = await ctx.referentiel();
  const mes = ctx.matieres.filter((m) => ctx.enseigne(m.id));
  const mat = h('select', { class: 'champ' }, mes.map((m) => h('option', { value: m.id, selected: m.id === (x?.matiere_id ?? matiereId) }, m.nom)));
  const titre = h('input', { class: 'champ', value: x?.titre || '', placeholder: 'ex. Visite du chantier du collège, intervention d’un professionnel…' });
  const durees = [...new Set([...ref.durees.map((d) => Number(d.heures)), ...(x?.duree ? [Number(x.duree)] : [])])].sort((a, b) => a - b);
  const duree = h('select', { class: 'champ' }, h('option', { value: '' }, '—'), durees.map((d) => h('option', { value: d, selected: Number(x?.duree ?? 4) === d }, heures(d))));
  const inter = h('textarea', { class: 'champ', rows: 2 }, x?.objectif_inter || '');
  const ops = h('textarea', { class: 'champ', rows: 4, placeholder: '- un objectif par ligne (ex. [A4-T1] réaliser le plan d’installation de chantier)' }, x?.objectifs_ops || '');
  const comps = h('input', { class: 'champ', value: (x?.competences || []).join(' '), placeholder: 'ex. C2-2a C4-1' });
  const savs = h('input', { class: 'champ', value: (x?.savoirs || []).join(' '), placeholder: 'ex. S21-2 S26-4' });
  const cours = h('textarea', { class: 'champ', rows: 2 }, x?.cours || '');
  const ress = h('textarea', { class: 'champ', rows: 2, placeholder: 'documents, vidéos, liens, matériel…' }, x?.ressources || '');
  const codesC = ref.competences.map((c) => c.code), codesS = ref.savoirs.map((c) => c.code);
  return fenetre(x ? 'Modifier la séance hors séquence' : 'Nouvelle séance hors séquence', h('div', { class: 'formulaire' },
    x ? null : h('label', {}, 'Matière', mat),
    h('label', {}, 'Durée', duree),
    h('label', { class: 'large' }, 'Titre de la séance', titre),
    h('label', { class: 'large' }, 'Objectif intermédiaire', inter),
    h('label', { class: 'large' }, 'Objectifs opérationnels', ops),
    h('label', {}, 'Compétences (codes)', comps),
    h('label', {}, 'Savoirs associés (codes)', savs),
    h('label', { class: 'large' }, 'Cours mobilisés', cours),
    h('label', { class: 'large' }, 'Ressources', ress),
    h('p', { class: 'aide large' }, 'Seuls les codes présents dans le référentiel sont gardés. La fiche contrat formatif reprend une rubrique par objectif opérationnel.')),
  [{ texte: 'Annuler', valeur: null }, { texte: x ? 'Enregistrer' : '＋  Créer', classe: 'principal', action: () => {
    if (!titre.value.trim()) throw new Error('Donnez un titre à la séance.');
    return { matiere_id: Number(mat.value), titre: titre.value.trim(), duree: duree.value ? Number(duree.value) : null, objectif_inter: inter.value.trim(),
      objectifs_ops: enListe(ops.value), competences: codesDans(comps.value, codesC), savoirs: codesDans(savs.value, codesS), cours: cours.value.trim(),
      ...(ress.value.trim() || (x && 'ressources' in x) ? { ressources: ress.value.trim() } : {}) };
  } }], { large: true });
}

async function creer(ctx, matiereId = null) {
  const mes = ctx.matieres.filter((m) => ctx.enseigne(m.id));
  if (!mes.length) return erreur(new Error('Seuls les enseignants d’une matière peuvent créer une séance hors séquence.'));
  const v = await formulaire(ctx, null, matiereId ?? mes[0].id);
  if (!v) return;
  try {
    const deja = await db.lire('seances', `promotion_id=eq.${ctx.promo.id}&matiere_id=eq.${v.matiere_id}&sequence_id=is.null&select=numero&order=numero.desc&limit=1`);
    const x = await db.ajouter('seances', { ...v, promotion_id: ctx.promo.id, sequence_id: null, numero: (deja[0]?.numero || 0) + 1 });
    toast('Séance créée : rédigez maintenant sa fiche de déroulement');
    location.hash = `#/fiches/h-${x.id}:seance-${x.id}`;
  } catch (e) {
    if (installe(e)) erreur(e); else erreur(new Error('L’administrateur doit d’abord exécuter le script SQL 41 (séances hors séquence) dans Supabase.'));
  }
}

export async function modifierSeanceLibre(ctx, x) {
  const v = await formulaire(ctx, x);
  if (!v) return false;
  delete v.matiere_id;
  try { await db.modifier('seances', x.id, v); Object.assign(x, v); toast('Séance enregistrée'); return true; } catch (e) { erreur(e); return false; }
}

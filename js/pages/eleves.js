// Élèves de la promotion : liste, effectifs ; ajout et modification par l'administrateur.
import { db } from '../api.js';
import { boutonAnnuler } from '../annuler.js';
import { anneau, barresH, carteGraph } from '../graphiques.js';
import { h, vider, toast, erreur, fenetre, confirmer, dateFr, imprimer } from '../ui.js';
import { badgeRedoublant, libPromo } from '../redoublants.js';

const CHAMPS = [
  ['nom', 'NOM'], ['prenom', 'Prénom'], ['naissance', 'Né(e) le', 'date'], ['statut', 'Statut', ['Scolaire', 'Apprenti']],
  ['telephone', 'Téléphone'], ['mail', 'Mail', 'email'], ['commune', "Commune d'origine"], ['code_postal', 'Code postal'],
  ['departement', 'Département'], ['entreprise', 'Entreprise'], ['entreprise_commune', 'Commune de l’entreprise'],
  ['entreprise_cp', 'Code postal de l’entreprise'], ['etudes', 'Études précédentes'], ['etablissement', 'Établissement précédent'],
  ['projet', 'Projet post-BTS'], ['arret', 'Arrêt de la formation (date ou motif ; vide = en formation)'],
  ['redoublant', 'Redoublant(e)', 'case'], ['date_arrivee', 'Arrivé(e) dans la promotion le (vide = dès le début)', 'date'],
  ['devenir', 'Suite du parcours (ex. redouble avec la promotion suivante)'],
];

export async function pageEleves(zone, _arg, ctx) {
  const admin = ctx.estAdmin();

  async function dessiner() {
    const eleves = await db.lire('eleves', `promotion_id=eq.${ctx.promo.id}&order=nom,prenom`);
    eleves.sort((a, b) => (!!a.arret - !!b.arret) || a.nom.localeCompare(b.nom, 'fr') || a.prenom.localeCompare(b.prenom, 'fr'));
    const actifs = eleves.filter((e) => !e.arret);
    const app = actifs.filter((e) => e.statut === 'Apprenti').length;
    const red = actifs.filter((e) => e.redoublant).length;
    // élèves partis redoubler dans une autre promotion (fiches qui pointent vers une fiche de celle-ci)
    const suites = eleves.length ? await db.lire('eleves', `origine_eleve_id=in.(${eleves.map((e) => e.id).join(',')})&select=id,origine_eleve_id,promotion_id`).catch(() => []) : [];
    let n = 0;
    vider(zone,
      h('header', { class: 'entete-page' },
        h('div', {}, h('h1', {}, 'Élèves de la promotion'), h('p', { class: 'sous-titre' }, 'Promotion ' + ctx.promo.libelle)),
        h('div', { class: 'actions-page' },
          admin ? boutonAnnuler(ctx, 'eleves') : null,
          h('button', { class: 'btn', onclick: () => imprimer('A4 landscape') }, '🖶  Imprimer la liste'),
          admin ? h('button', { class: 'btn', onclick: accueillir, title: 'Inscrire dans cette promotion des élèves d’une promotion précédente qui redoublent' }, '↻  Accueillir des redoublants') : null,
          admin ? h('button', { class: 'btn principal', onclick: () => formulaire(null) }, '＋  Ajouter un élève') : null)),
      h('section', { class: 'chiffres-cles' },
        h('div', { class: 'tuile' }, h('strong', {}, actifs.length), h('span', {}, 'en formation')),
        h('div', { class: 'tuile' }, h('strong', {}, app), h('span', {}, 'apprentis')),
        h('div', { class: 'tuile' }, h('strong', {}, actifs.length - app), h('span', {}, 'scolaires')),
        red ? h('div', { class: 'tuile redoublants' }, h('strong', {}, red), h('span', {}, 'redoublant(s)')) : null,
        eleves.length > actifs.length ? h('div', { class: 'tuile' }, h('strong', {}, eleves.length - actifs.length), h('span', {}, 'arrêts')) : null),
      h('div', { class: 'tableau-defile' }, h('table', { class: 'liste' },
        h('thead', {}, h('tr', {}, ['N°', 'NOM Prénom', 'Né(e) le', 'Statut', 'Contact', 'Origine', 'Entreprise', 'Parcours', 'Arrêt'].map((t) => h('th', {}, t)))),
        h('tbody', {}, eleves.map((e) => h('tr', { class: (e.arret ? 'arret ' : '') + (admin ? 'cliquable' : ''), onclick: admin ? () => formulaire(e) : null,
          title: admin ? 'Cliquer pour modifier' : null },
          h('td', { class: 'num' }, e.arret ? '' : ++n),
          h('td', {}, h('b', {}, e.nom), ' ', e.prenom, ' ', badgeRedoublant(e, ctx),
            e.redoublant ? h('div', { class: 'petit gris' }, [e.origine_promotion_id ? `vient de la promotion ${libPromo(ctx, e.origine_promotion_id)}` : 'redoublant(e)',
              e.date_arrivee ? ` · arrivé(e) le ${dateFr(e.date_arrivee)}` : ''].join('')) : null,
            e.devenir || suites.some((x) => x.origine_eleve_id === e.id) ? h('div', { class: 'petit suite-parcours' }, '→ ' + (e.devenir || 'redouble dans une autre promotion')) : null),
          h('td', {}, dateFr(e.naissance)),
          h('td', {}, h('span', { class: 'badge ' + (e.statut === 'Apprenti' ? 'apprenti' : 'scolaire') }, e.statut)),
          h('td', { class: 'petit' }, e.telephone, h('br'), e.mail),
          h('td', { class: 'petit' }, e.commune, ' ', e.code_postal, h('br'), e.departement),
          h('td', { class: 'petit' }, e.entreprise, h('br'), [e.entreprise_commune, e.entreprise_cp].filter(Boolean).join(' ')),
          h('td', { class: 'petit' }, e.etudes, h('br'), e.etablissement, e.projet ? h('div', {}, '→ ' + e.projet) : null),
          h('td', { class: 'petit' }, e.arret)))))),
      eleves.length === 0 ? h('p', { class: 'vide' }, 'Aucun élève saisi.') : null,
      actifs.length ? graphiques(actifs, app) : null);
  }

  // répartitions : statut, département d'origine, études précédentes (élèves en formation)
  function graphiques(actifs, app) {
    const repartir = (cle) => {
      const m = new Map(); actifs.forEach((e) => { const v = (e[cle] || '').trim() || 'Non renseigné'; m.set(v, (m.get(v) || 0) + 1); });
      return [...m].sort((a, b) => b[1] - a[1]).map(([label, valeur]) => ({ label, valeur, couleur: label === 'Non renseigné' ? 'var(--g-ne)' : 'var(--g1)', info: `${label} : ${valeur} élève(s)` }));
    };
    return h('section', { class: 'graphiques' },
      carteGraph('Statut', `${actifs.length} élève(s) en formation`, anneau([{ nom: 'Scolaires', valeur: actifs.length - app, couleur: 'var(--g1)' },
        { nom: 'Apprentis', valeur: app, couleur: 'var(--g2)' }], { centre: String(actifs.length), sous: 'élèves' })),
      carteGraph('Département d’origine', 'nombre d’élèves', barresH(repartir('departement'), { format: (v) => String(v) })),
      carteGraph('Études précédentes', 'nombre d’élèves', barresH(repartir('etudes'), { format: (v) => String(v) })));
  }

  async function formulaire(e) {
    const val = {};
    const champs = CHAMPS.map(([k, lab, t]) => {
      let el;
      if (Array.isArray(t)) el = h('select', { class: 'champ' }, t.map((o) => h('option', { selected: (e?.[k] || 'Scolaire') === o }, o)));
      else if (t === 'case') { el = h('input', { type: 'checkbox', checked: !!e?.[k] }); val[k] = el; return h('label', { class: 'case-form' }, el, ' ', lab); }
      else el = h('input', { class: 'champ', type: t || 'text', value: e?.[k] ?? '' });
      val[k] = el;
      return h('label', { class: k === 'arret' || k === 'devenir' ? 'large' : '' }, lab, el);
    });
    const boutons = [{ texte: 'Annuler', valeur: false }];
    if (e) boutons.unshift({ texte: 'Supprimer l’élève', classe: 'danger gauche', action: async () => {
      if (!(await confirmer('Supprimer un élève', `Supprimer définitivement ${e.nom} ${e.prenom} ? (Pour un élève qui quitte la formation, renseignez plutôt « Arrêt ».)`, 'Supprimer'))) return false;
      await db.supprimer('eleves', e.id); toast('Élève supprimé'); return 'maj';
    } });
    boutons.push({ texte: 'Enregistrer', classe: 'principal', action: async () => {
      const d = Object.fromEntries(Object.entries(val).map(([k, el]) => [k, el.type === 'checkbox' ? el.checked : el.value.trim()]));
      d.date_arrivee = d.date_arrivee || null;
      d.nom = d.nom.toUpperCase();
      if (!d.nom && !d.prenom) throw new Error('Saisissez au moins le nom ou le prénom.');
      d.naissance = d.naissance || null;
      if (e) await db.modifier('eleves', e.id, d); else await db.ajouter('eleves', { ...d, promotion_id: ctx.promo.id });
      toast('Enregistré');
      return 'maj';
    } });
    const origine = e?.origine_promotion_id ? h('p', { class: 'aide large' }, `↻ Fiche recopiée depuis la promotion ${libPromo(ctx, e.origine_promotion_id)} : ses notes et compétences de cette promotion restent sur sa fiche d’origine et sont reprises dans la validation des compétences et son livret.`) : null;
    const r = await fenetre(e ? `${e.nom} ${e.prenom}` : 'Nouvel élève', h('div', { class: 'formulaire' }, origine, champs), boutons, { large: true });
    if (r === 'maj') await dessiner();
  }

  // accueillir des redoublants : élèves d'une promotion précédente recopiés dans celle-ci, reliés à leur fiche d'origine
  async function accueillir() {
    const P = ctx.promo, Y = P.annee_debut;
    const precedentes = ctx.promotions.filter((p) => p.annee_debut < Y).sort((a, b) => b.annee_debut - a.annee_debut);
    if (!precedentes.length) { toast('Aucune promotion plus ancienne que celle-ci.'); return; }
    let source = precedentes[0];
    const deja = new Set((await db.lire('eleves', `promotion_id=eq.${P.id}&select=origine_eleve_id`)).map((x) => x.origine_eleve_id).filter(Boolean));
    const dateArr = h('input', { class: 'champ', type: 'date', value: `${Y + 1}-09-01` });
    const liste = h('div', { class: 'liste-redoublants' });
    const choix = new Map();
    async function charger() {
      choix.clear();
      const el = await db.lire('eleves', `promotion_id=eq.${source.id}&order=nom,prenom`);
      liste.replaceChildren(el.length ? h('table', { class: 'liste' },
        h('thead', {}, h('tr', {}, h('th', {}, ''), h('th', {}, 'Élève'), h('th', {}, 'Statut l’an dernier'), h('th', {}, 'Statut dans cette promotion'), h('th', {}, 'Remarque'))),
        h('tbody', {}, el.map((x) => {
          const fait = deja.has(x.id);
          const cb = h('input', { type: 'checkbox', disabled: fait });
          const st = h('select', { class: 'champ petit', disabled: fait }, ['Scolaire', 'Apprenti'].map((o) => h('option', { selected: o === x.statut }, o)));
          if (!fait) choix.set(x.id, { cb, st });
          return h('tr', { class: fait ? 'gris' : '' }, h('td', {}, cb), h('td', {}, h('b', {}, x.nom), ' ', x.prenom),
            h('td', {}, x.statut + (x.entreprise ? ` · ${x.entreprise}` : '')), h('td', {}, st),
            h('td', { class: 'petit' }, fait ? '✓ déjà dans cette promotion' : x.arret ? `arrêt : ${x.arret}` : x.devenir || ''));
        }))) : h('p', { class: 'vide' }, 'Aucun élève dans cette promotion.'));
    }
    const selSource = h('select', { class: 'champ', onchange: async (ev) => { source = precedentes.find((p) => String(p.id) === ev.target.value); await charger(); } },
      precedentes.map((p) => h('option', { value: p.id }, 'Promotion ' + p.libelle)));
    await charger();
    const r = await fenetre('Accueillir des élèves redoublants', h('div', { class: 'accueil-redoublants' },
      h('p', { class: 'aide' }, `Les élèves cochés sont inscrits dans la promotion ${P.libelle} avec la mention « redoublant(e) ». Leur fiche (identité, contact, origine, entreprise, parcours) est recopiée ; leur fiche d’origine reste intacte dans leur ancienne promotion, avec ses notes, ses contrats et ses appréciations.`),
      h('ul', { class: 'aide liste-puces' },
        h('li', {}, 'Les compétences déjà validées dans l’ancienne promotion sont reprises dans la validation des compétences et le livret (repérées « N-1 »).'),
        h('li', {}, 'Les évaluations datées d’avant leur arrivée ne les concernent pas : elles n’entrent pas dans leurs moyennes ni dans celles de la classe.'),
        h('li', {}, `Leur ancienne fiche indique « Redouble avec la promotion ${P.libelle} ».`),
        h('li', {}, 'Statut (scolaire / apprenti), entreprise, coordonnées : modifiables ensuite en cliquant sur l’élève.')),
      h('div', { class: 'formulaire' }, h('label', {}, 'Promotion d’origine', selSource), h('label', {}, 'Arrivée dans la promotion le', dateArr)),
      liste),
    [{ texte: 'Annuler', valeur: false }, { texte: 'Inscrire les élèves cochés', classe: 'principal', action: async () => {
      const c = [...choix].filter(([, v]) => v.cb.checked).map(([id, v]) => ({ id, statut: v.st.value }));
      if (!c.length) throw new Error('Cochez au moins un élève.');
      const n = await db.rpc('accueillir_redoublants', { p_cible: P.id, choix: c, p_date: dateArr.value || null });
      toast(`${n} élève(s) redoublant(s) inscrit(s) dans la promotion ${P.libelle}`);
      return 'maj';
    } }], { large: true });
    if (r === 'maj') await dessiner();
  }

  try { await dessiner(); } catch (e) { erreur(e); throw e; }
}

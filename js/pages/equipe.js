// Matières et équipe : les matières professionnelles (nom, abréviation, couleur, avancement du séquençage) et
// le tableau des attributions enseignants × matières (une seule saisie : on coche qui enseigne quoi).
import { db } from '../api.js';
import { h, vider, champ, toast, erreur, confirmer, heures } from '../ui.js';
import { rafraichirMenu } from '../app.js';

const initiales = (nom) => String(nom || '?').split(/[\s-]+/).filter(Boolean).slice(0, 2).map((x) => x[0].toUpperCase()).join('');

export async function pageEquipe(zone, _arg, ctx) {
  const admin = ctx.estAdmin();

  async function dessiner() {
    await ctx.chargerBase();
    rafraichirMenu();
    // séquençage de la promotion affichée : séquences, séances et volume par matière
    const sequences = await db.lire('sequences', `promotion_id=eq.${ctx.promo.id}`);
    const seances = sequences.length ? await db.lire('seances', `sequence_id=in.(${sequences.map((s) => s.id).join(',')})`) : [];
    const bilan = (m) => {
      const sq = sequences.filter((s) => s.matiere_id === m.id), ids = new Set(sq.map((s) => s.id));
      const se = seances.filter((x) => ids.has(x.sequence_id) && (x.titre || x.objectif_inter));
      return { nSeq: sq.length, nSe: se.length, h: se.reduce((a, x) => a + (Number(x.duree) || 0), 0) };
    };
    const profsDe = (m) => ctx.enseignants.filter((e) => (e.matieres || []).map(Number).includes(m.id));
    const avecCompte = ctx.enseignants.filter((e) => e.profil_id).length;
    const sansProf = ctx.matieres.filter((m) => !profsDe(m).length);

    vider(zone,
      h('header', { class: 'entete-page' }, h('div', {}, h('h1', {}, 'Matières et équipe'),
        h('p', { class: 'sous-titre' }, (admin ? 'Réglages communs à toutes les promotions (administrateur)' : 'Consultation : seul l’administrateur peut modifier ces réglages')
          + `  ·  avancement du séquençage de la promotion ${ctx.promo.libelle}`))),

      // ------------------------------------------------------------------ matières
      h('div', { class: 'titre-bloc' }, h('h2', {}, '📚  Matières professionnelles'), h('span', { class: 'compteur' }, `${ctx.matieres.length} matières`)),
      h('section', { class: 'grille-mat-equipe' }, ctx.matieres.map((m) => {
        const b = bilan(m), n = profsDe(m).length;
        return h('article', { class: 'mat-equipe', style: { '--couleur': m.couleur } },
          h('div', { class: 'mat-bandeau' },
            h('span', { class: 'mat-code' }, ctx.codeMat(m)),
            h('div', { class: 'mat-titre' },
              admin ? champ(m.nom, async (v) => { await db.modifier('matieres', m.id, { nom: v }); m.nom = v; rafraichirMenu(); }, { classe: 'mat-nom' }) : h('h3', {}, m.nom),
              h('div', { class: 'mat-sous' }, h('span', {}, 'Abréviation'),
                champ(m.abreviation, (v) => db.modifier('matieres', m.id, { abreviation: v }), { lecture: !admin, classe: 'mat-abrev' }),
                h('span', { class: 'mat-nb-profs' + (n ? '' : ' manque') }, n ? `${n} enseignant${n > 1 ? 's' : ''}` : 'aucun enseignant'))),
            admin ? h('label', { class: 'mat-couleur', title: 'Couleur de la matière' }, champ(m.couleur, async (v) => {
              await db.modifier('matieres', m.id, { couleur: v }); m.couleur = v; rafraichirMenu(); dessiner(); }, { type: 'color', classe: 'couleur' })) : null),
          h('a', { class: 'mat-chiffres auto', href: '#/sequencage/' + m.id, title: 'Ouvrir le séquençage de la matière' },
            h('div', {}, h('strong', {}, b.nSeq), h('span', {}, 'séquences')),
            h('div', {}, h('strong', {}, b.nSe), h('span', {}, 'séances')),
            h('div', {}, h('strong', {}, heures(b.h) || '0 h'), h('span', {}, 'volume')),
            h('div', { class: 'fleche' }, '▶')));
      })),

      // ------------------------------------------------------------------ attributions
      h('div', { class: 'titre-bloc' }, h('h2', {}, '👥  Équipe pédagogique et attributions'),
        h('span', { class: 'compteur' }, `${ctx.enseignants.length} enseignant(s) · ${avecCompte} avec un compte`)),
      h('p', { class: 'aide' }, admin
        ? 'Cochez les matières enseignées par chacun : il pourra modifier le séquençage, la progression, les fiches, les contrats et les résultats de ces matières (et consulter les autres). Le compte de connexion se relie dans Administration.'
        : 'Chaque enseignant modifie les matières cochées sur sa ligne et consulte les autres.'),
      sansProf.length ? h('div', { class: 'avertissement' }, `⚠  Matière(s) sans enseignant : ${sansProf.map((m) => m.nom).join(', ')}.`) : null,
      h('section', { class: 'bloc tableau-equipe-bloc' }, h('div', { class: 'tableau-defile' }, h('table', { class: 'tableau-equipe' },
        h('thead', {}, h('tr', {},
          h('th', { class: 'col-prof' }, 'Enseignant'),
          ctx.matieres.map((m) => h('th', { class: 'col-mat-eq', style: { '--couleur': m.couleur }, title: m.nom }, h('span', { class: 'code' }, ctx.codeMat(m)), h('small', {}, m.nom))),
          h('th', { class: 'col-compte' }, 'Compte'), admin ? h('th', { class: 'col-act' }, '') : null)),
        h('tbody', {}, ctx.enseignants.map((e) => {
          const mats = new Set((e.matieres || []).map(Number));
          return h('tr', {},
            h('td', { class: 'col-prof' }, h('div', { class: 'prof-ligne' }, h('span', { class: 'avatar petit' + (e.profil_id ? '' : ' gris') }, initiales(e.nom)),
              champ(e.nom, async (v) => { await db.modifier('enseignants', e.id, { nom: v }); e.nom = v; }, { lecture: !admin, classe: 'nom-prof' }))),
            ctx.matieres.map((m) => {
              const oui = mats.has(m.id);
              return h('td', { class: 'col-mat-eq', style: { '--couleur': m.couleur } },
                h('button', { class: 'coche-mat' + (oui ? ' oui' : ''), type: 'button', disabled: !admin, 'aria-pressed': String(oui),
                  title: `${e.nom} · ${m.nom} : ${oui ? 'enseigne' : 'n’enseigne pas'}${admin ? ' (cliquer pour changer)' : ''}`,
                  onclick: async () => {
                    const s = new Set(mats); oui ? s.delete(m.id) : s.add(m.id);
                    try { await db.modifier('enseignants', e.id, { matieres: [...s] }); if (e.profil_id && e.profil_id === ctx.profil.id) { ctx.profil.matieres = [...s].map(Number); rafraichirMenu(); } toast(oui ? `${m.nom} retirée à ${e.nom}` : `${m.nom} attribuée à ${e.nom}`); await dessiner(); }
                    catch (err) { erreur(err); }
                  } }, oui ? '✓' : ''));
            }),
            h('td', { class: 'col-compte' }, e.profil_id ? h('span', { class: 'badge-compte ok' }, '● actif') : h('span', { class: 'badge-compte' }, '○ pas de compte')),
            admin ? h('td', { class: 'col-act' }, h('button', { class: 'icone', title: 'Retirer de l’équipe', onclick: async () => {
              if (!(await confirmer('Retirer un enseignant', `Retirer ${e.nom} de l’équipe ? (Son compte de connexion n’est pas supprimé.)`, 'Retirer'))) return;
              try { await db.supprimer('enseignants', e.id); await dessiner(); } catch (err) { erreur(err); }
            } }, '✖')) : null);
        })),
        h('tfoot', {}, h('tr', {}, h('td', { class: 'col-prof' }, 'Enseignants par matière'),
          ctx.matieres.map((m) => { const n = profsDe(m).length; return h('td', { class: 'col-mat-eq total' + (n ? '' : ' manque') }, n); }),
          h('td', {}), admin ? h('td', {}) : null))))),
      admin ? h('button', { class: 'btn ajout-ligne', onclick: async () => {
        try { await db.ajouter('enseignants', { nom: 'Nouvel enseignant', ordre: ctx.enseignants.length + 1 }); await dessiner(); } catch (err) { erreur(err); }
      } }, '＋  Ajouter un enseignant') : null);
  }
  await dessiner();
}

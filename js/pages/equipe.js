// Matières professionnelles et équipe pédagogique (communes à toutes les promotions ; modifiables par l'administrateur).
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
    const avecCompte = ctx.enseignants.filter((e) => e.profil_id).length;

    vider(zone,
      h('header', { class: 'entete-page' }, h('div', {}, h('h1', {}, 'Matières et équipe'),
        h('p', { class: 'sous-titre' }, (admin ? 'Réglages communs à toutes les promotions (administrateur)' : 'Consultation : seul l’administrateur peut modifier ces réglages')
          + `  ·  chiffres du séquençage de la promotion ${ctx.promo.libelle}`))),

      // ------------------------------------------------------------------ matières
      h('div', { class: 'titre-bloc' }, h('h2', {}, 'Matières professionnelles'), h('span', { class: 'compteur' }, `${ctx.matieres.length} matières`)),
      h('section', { class: 'grille-mat-equipe' }, ctx.matieres.map((m) => {
        const b = bilan(m), profs = ctx.enseignants.filter((e) => (e.matieres || []).map(Number).includes(m.id));
        return h('article', { class: 'mat-equipe', style: { '--couleur': m.couleur } },
          h('div', { class: 'mat-bandeau' },
            h('span', { class: 'mat-code' }, ctx.codeMat(m)),
            admin ? champ(m.nom, async (v) => { await db.modifier('matieres', m.id, { nom: v }); m.nom = v; rafraichirMenu(); }, { classe: 'mat-nom' })
              : h('h3', {}, m.nom),
            admin ? h('label', { class: 'mat-couleur', title: 'Couleur de la matière' }, champ(m.couleur, async (v) => {
              await db.modifier('matieres', m.id, { couleur: v }); m.couleur = v; rafraichirMenu(); dessiner(); }, { type: 'color', classe: 'couleur' })) : null),
          h('div', { class: 'mat-corps' },
            h('div', { class: 'mat-ligne' }, h('span', { class: 'lib' }, 'Abréviation'),
              champ(m.abreviation, (v) => db.modifier('matieres', m.id, { abreviation: v }), { lecture: !admin, classe: 'mat-abrev' })),
            h('div', { class: 'mat-ligne' }, h('span', { class: 'lib' }, 'Enseignant(s)'),
              h('div', { class: 'mat-profs auto' }, profs.length ? profs.map((e) => h('span', { class: 'pastille-prof' }, h('i', {}, initiales(e.nom)), e.nom))
                : h('span', { class: 'gris' }, 'à attribuer (équipe ci-dessous)'))),
            h('div', { class: 'mat-chiffres auto' },
              h('div', {}, h('strong', {}, b.nSeq), h('span', {}, 'séquences')),
              h('div', {}, h('strong', {}, b.nSe), h('span', {}, 'séances')),
              h('div', {}, h('strong', {}, heures(b.h) || '0 h'), h('span', {}, 'volume')))),
          h('a', { class: 'mat-lien', href: '#/sequencage/' + m.id }, '▶  Séquençage de la matière'));
      })),

      // ------------------------------------------------------------------ équipe
      h('div', { class: 'titre-bloc' }, h('h2', {}, 'Équipe pédagogique'),
        h('span', { class: 'compteur' }, `${ctx.enseignants.length} enseignant(s) · ${avecCompte} avec un compte`)),
      h('p', { class: 'aide' }, admin
        ? 'Cliquez une matière pour l’attribuer ou la retirer à un enseignant : il pourra modifier le séquençage, la progression, les fiches, les contrats et les résultats de cette matière (et consulter les autres). Le compte de connexion se relie dans Administration.'
        : 'Chaque enseignant modifie les matières surlignées et consulte les autres.'),
      h('section', { class: 'grille-equipe' }, ctx.enseignants.map((e) => {
        const mats = new Set((e.matieres || []).map(Number));
        return h('article', { class: 'carte-prof' },
          h('div', { class: 'prof-tete' },
            h('span', { class: 'avatar' }, initiales(e.nom)),
            h('div', { class: 'prof-nom' },
              champ(e.nom, async (v) => { await db.modifier('enseignants', e.id, { nom: v }); e.nom = v; }, { lecture: !admin, classe: 'nom-prof' }),
              e.profil_id ? h('span', { class: 'badge-compte ok auto' }, '● compte actif') : h('span', { class: 'badge-compte auto' }, '○ pas encore de compte')),
            admin ? h('button', { class: 'icone', title: 'Retirer de l’équipe', onclick: async () => {
              if (!(await confirmer('Retirer un enseignant', `Retirer ${e.nom} de l’équipe ? (Son compte de connexion n’est pas supprimé.)`, 'Retirer'))) return;
              try { await db.supprimer('enseignants', e.id); await dessiner(); } catch (err) { erreur(err); }
            } }, '✖') : null),
          h('div', { class: 'prof-matieres' }, ctx.matieres.map((m) => {
            const oui = mats.has(m.id);
            return h('button', { class: 'puce-mat' + (oui ? ' active' : ''), type: 'button', style: { '--couleur': m.couleur }, disabled: !admin,
              title: admin ? (oui ? `Retirer ${m.nom}` : `Attribuer ${m.nom}`) : m.nom,
              onclick: async () => {
                const s = new Set(mats); oui ? s.delete(m.id) : s.add(m.id);
                try { await db.modifier('enseignants', e.id, { matieres: [...s] }); toast(oui ? `${m.nom} retirée` : `${m.nom} attribuée`); await dessiner(); }
                catch (err) { erreur(err); }
              } }, oui ? '✓ ' : '', m.nom);
          })));
      }),
      admin ? h('button', { class: 'carte-prof ajout-prof', type: 'button', onclick: async () => {
        try { await db.ajouter('enseignants', { nom: 'Nouvel enseignant', ordre: ctx.enseignants.length + 1 }); await dessiner(); } catch (err) { erreur(err); }
      } }, h('span', { class: 'avatar' }, '＋'), 'Ajouter un enseignant') : null));
  }
  await dessiner();
}

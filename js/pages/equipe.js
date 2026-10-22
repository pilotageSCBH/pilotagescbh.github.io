// Promotion, matières professionnelles et équipe pédagogique (modifiables par l'administrateur).
import { db } from '../api.js';
import { h, vider, champ, toast, erreur, confirmer } from '../ui.js';
import { rafraichirMenu } from '../app.js';

export async function pageEquipe(zone, _arg, ctx) {
  const admin = ctx.estAdmin();

  async function dessiner() {
    await ctx.chargerBase();
    rafraichirMenu();
    const p = ctx.promotion || {};
    vider(zone,
      h('header', { class: 'entete-page' }, h('div', {}, h('h1', {}, 'Matières et équipe'),
        h('p', { class: 'sous-titre' }, admin ? 'Réglages de la promotion (administrateur)' : 'Consultation : seul l’administrateur peut modifier ces réglages'))),
      h('section', { class: 'bloc' }, h('h2', {}, 'Promotion'),
        h('div', { class: 'formulaire etroit' },
          h('label', {}, 'Promotion (2 ans)', champ(p.libelle, async (v) => {
            const a = parseInt(v, 10);
            if (!/^\d{4}-\d{4}$/.test(v.trim())) throw new Error('Format attendu : 2026-2028');
            await db.modifier('promotion', 1, { libelle: v.trim(), annee_debut: a }); ctx.promotion.libelle = v.trim(); rafraichirMenu();
          }, { lecture: !admin, placeholder: '2026-2028' })),
          h('label', {}, 'Établissement', champ(p.etablissement, (v) => db.modifier('promotion', 1, { etablissement: v }), { lecture: !admin, placeholder: 'Lycée…' })))),
      h('section', { class: 'bloc' }, h('h2', {}, 'Matières professionnelles'),
        h('table', { class: 'liste' },
          h('thead', {}, h('tr', {}, h('th', {}, 'Couleur'), h('th', {}, 'Matière'), h('th', {}, 'Abréviation'), h('th', {}, 'Enseignant(s)'))),
          h('tbody', {}, ctx.matieres.map((m) => h('tr', {},
            h('td', {}, admin ? champ(m.couleur, async (v) => { await db.modifier('matieres', m.id, { couleur: v }); m.couleur = v; rafraichirMenu(); }, { type: 'color', classe: 'couleur' })
              : h('span', { class: 'pastille', style: { background: m.couleur } })),
            h('td', {}, champ(m.nom, async (v) => { await db.modifier('matieres', m.id, { nom: v }); m.nom = v; rafraichirMenu(); }, { lecture: !admin })),
            h('td', {}, champ(m.abreviation, (v) => db.modifier('matieres', m.id, { abreviation: v }), { lecture: !admin })),
            h('td', {}, ctx.enseignantsDe(m.id).join(', ') || '—')))))),
      h('section', { class: 'bloc' }, h('h2', {}, 'Équipe pédagogique'),
        h('p', { class: 'aide' }, 'Cocher les matières de chaque enseignant : il pourra modifier le séquençage de ces matières (et consulter les autres).'),
        h('table', { class: 'liste equipe' },
          h('thead', {}, h('tr', {}, h('th', {}, 'Enseignant'), ctx.matieres.map((m) => h('th', { class: 'centre' }, m.nom)), h('th', {}, 'Compte'), admin ? h('th', {}) : null)),
          h('tbody', {}, ctx.enseignants.map((e) => h('tr', {},
            h('td', {}, champ(e.nom, (v) => db.modifier('enseignants', e.id, { nom: v }), { lecture: !admin })),
            ctx.matieres.map((m) => h('td', { class: 'centre' }, h('input', { type: 'checkbox', disabled: !admin, checked: (e.matieres || []).map(Number).includes(m.id),
              onchange: async (ev) => {
                const s = new Set((e.matieres || []).map(Number));
                ev.target.checked ? s.add(m.id) : s.delete(m.id);
                try { await db.modifier('enseignants', e.id, { matieres: [...s] }); e.matieres = [...s]; toast('Enregistré'); }
                catch (err) { ev.target.checked = !ev.target.checked; erreur(err); }
              } }))),
            h('td', { class: 'petit' }, e.profil_id ? h('span', { class: 'badge scolaire' }, 'compte actif') : h('span', { class: 'gris' }, 'pas de compte')),
            admin ? h('td', {}, h('button', { class: 'icone', title: 'Retirer de l’équipe', onclick: async () => {
              if (!(await confirmer('Retirer un enseignant', `Retirer ${e.nom} de l’équipe ? (Son compte de connexion n’est pas supprimé.)`, 'Retirer'))) return;
              try { await db.supprimer('enseignants', e.id); await dessiner(); } catch (err) { erreur(err); }
            } }, '✖')) : null)))),
        admin ? h('button', { class: 'btn', onclick: async () => {
          try { await db.ajouter('enseignants', { nom: 'Nouvel enseignant', ordre: ctx.enseignants.length + 1 }); await dessiner(); } catch (err) { erreur(err); }
        } }, '＋  Ajouter un enseignant') : null));
  }
  await dessiner();
}

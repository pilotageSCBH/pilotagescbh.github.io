// Mon compte : identité, rôle et matières, changement de code, code de secours.
import { changerCode, identifiantDe, emailConnecte, db } from '../api.js';
import { h, vider, toast, erreur, fenetre, confirmer, imprimer } from '../ui.js';

const initiales = (t) => String(t || '?').replace(/@.*/, '').split(/[\s.\-]+/).filter(Boolean).slice(0, 2).map((x) => x[0].toUpperCase()).join('');

export async function pageCompte(zone, _arg, ctx) {
  const ident = identifiantDe(emailConnecte());
  const nom = ctx.profil.nom || ident;
  const mats = ctx.matieres.filter((m) => ctx.profil.matieres.includes(m.id));
  const role = ctx.estAdmin() ? ['admin', '🛡  Administrateur'] : ctx.peutEcrire() ? ['enseignant', '✏️  Enseignant'] : ['lecture', '👁  Lecture seule'];

  // code : champs masqués/affichés, robustesse indicative
  const c1 = h('input', { class: 'champ', type: 'password', autocomplete: 'new-password', minlength: 6, placeholder: '6 caractères au moins' });
  const c2 = h('input', { class: 'champ', type: 'password', autocomplete: 'new-password', minlength: 6, placeholder: 'le même code' });
  const jauge = h('div', { class: 'force-code' }, h('i', {}), h('span', {}, ''));
  const force = () => {
    const v = c1.value; let n = 0;
    if (v.length >= 6) n++; if (v.length >= 10) n++; if (/[0-9]/.test(v) && /[a-zA-Z]/.test(v)) n++; if (/[^0-9a-zA-Z]/.test(v) || /[A-Z]/.test(v) && /[a-z]/.test(v)) n++;
    const [lib, cl] = !v ? ['', ''] : v.length < 6 ? ['trop court', 'faible'] : n <= 1 ? ['faible', 'faible'] : n === 2 ? ['correct', 'moyen'] : ['solide', 'fort'];
    jauge.className = 'force-code ' + cl; jauge.querySelector('i').style.width = (v ? Math.max(15, n * 25) : 0) + '%'; jauge.querySelector('span').textContent = lib;
  };
  c1.addEventListener('input', force);
  const voir = h('label', { class: 'interrupteur' }, h('input', { type: 'checkbox', onchange: (e) => { c1.type = c2.type = e.target.checked ? 'text' : 'password'; } }), 'afficher');

  vider(zone,
    h('header', { class: 'entete-page' }, h('div', {}, h('h1', {}, 'Mon compte'), h('p', { class: 'sous-titre' }, 'Votre profil, votre code de connexion et votre code de secours'))),
    // carte d'identité
    h('section', { class: 'profil-carte' },
      h('span', { class: 'avatar grand ' + role[0] }, initiales(nom)),
      h('div', { class: 'profil-infos' },
        h('h2', {}, nom),
        h('p', {}, h('span', { class: 'gris' }, 'Identifiant : '), h('b', {}, ident), h('span', { class: 'gris' }, `  ·  ${emailConnecte()}`)),
        h('div', { class: 'profil-badges' }, h('span', { class: 'role-pill ' + role[0] }, role[1]),
          ctx.profil.a_secours ? h('span', { class: 'role-pill ok' }, '🔑  code de secours créé') : h('span', { class: 'role-pill manque' }, '⚠  pas de code de secours'))),
      h('div', { class: 'profil-mats' }, h('span', { class: 'lib' }, 'Mes matières'),
        mats.length ? h('div', { class: 'liste-mats' }, mats.map((m) => h('a', { class: 'puce-mat active', href: '#/sequencage/' + m.id, style: { '--couleur': m.couleur }, title: 'Ouvrir le séquençage' }, m.nom)))
          : h('span', { class: 'gris' }, ctx.peutEcrire() ? 'aucune : demandez à l’administrateur de vous relier à votre fiche enseignant' : 'consultation de toutes les matières'),
        h('p', { class: 'aide' }, ctx.estAdmin()
          ? 'Vous modifiez le séquençage et la progression de vos matières ; comme administrateur, vous modifiez aussi les fiches, contrats et résultats de toutes les matières.'
          : ctx.peutEcrire() ? 'Vous modifiez le séquençage, la progression, les fiches, contrats et résultats de vos matières, et consultez les autres.'
            : 'Votre compte permet de tout consulter et d’imprimer, sans modification.'))),
    h('div', { class: 'grille-compte' },
      // changer le code
      h('section', { class: 'bloc carte-compte-bloc' }, h('div', { class: 'tete-carte' }, h('span', { class: 'kpi-icone' }, '🔒'), h('h2', {}, 'Changer mon code')),
        h('form', { class: 'formulaire-code', onsubmit: async (e) => {
          e.preventDefault();
          if (c1.value.length < 6) return erreur(new Error('Le code doit contenir au moins 6 caractères.'));
          if (c1.value !== c2.value) return erreur(new Error('Les deux codes ne sont pas identiques.'));
          try { await changerCode(c1.value); c1.value = c2.value = ''; force(); toast('Code modifié'); } catch (x) { erreur(x); }
        } }, h('label', {}, 'Nouveau code', c1), jauge, h('label', {}, 'Confirmer le nouveau code', c2),
        h('div', { class: 'ligne-com' }, voir, h('button', { class: 'btn principal', type: 'submit' }, 'Enregistrer le nouveau code'))),
        h('p', { class: 'aide' }, 'Conseil : au moins 10 caractères, en mélangeant lettres et chiffres. Ne réutilisez pas le code de votre messagerie académique.')),
      // code de secours
      h('section', { class: 'bloc carte-compte-bloc secours ' + (ctx.profil.a_secours ? 'ok' : 'manque') },
        h('div', { class: 'tete-carte' }, h('span', { class: 'kpi-icone' }, '🔑'), h('h2', {}, 'Code de secours')),
        h('div', { class: 'etat-secours' }, h('span', { class: 'gros' }, ctx.profil.a_secours ? '✅' : '⚠️'),
          h('div', {}, h('b', {}, ctx.profil.a_secours ? 'Vous avez un code de secours.' : 'Vous n’avez pas encore de code de secours.'),
            h('p', {}, ctx.profil.a_secours ? 'Gardez-le en lieu sûr. S’il est perdu, remplacez-le : l’ancien ne fonctionnera plus.'
              : 'Créez-le maintenant : en cas d’oubli de votre code, vous pourrez en choisir un nouveau sans attendre l’administrateur.'))),
        h('ol', { class: 'etapes-secours' },
          h('li', {}, 'Créez le code de secours et notez-le (carnet, téléphone) : il n’est affiché qu’une fois.'),
          h('li', {}, 'Code oublié ? Écran de connexion → « Code oublié ? ».'),
          h('li', {}, 'Saisissez votre identifiant, le code de secours et votre nouveau code.')),
        h('button', { class: 'btn ' + (ctx.profil.a_secours ? '' : 'principal'), onclick: creerSecours }, ctx.profil.a_secours ? 'Remplacer mon code de secours' : 'Créer mon code de secours'))));

  async function creerSecours() {
    if (ctx.profil.a_secours && !(await confirmer('Nouveau code de secours', 'L’ancien code de secours ne fonctionnera plus. Continuer ?', 'Remplacer'))) return;
    try {
      const code = await db.rpc('creer_code_secours');
      ctx.profil.a_secours = true;
      await fenetre('Votre code de secours', h('div', { class: 'code-secours' },
        h('p', {}, 'Notez ce code maintenant : il ne sera plus jamais affiché.'),
        h('div', { class: 'valeur-secours' }, code),
        h('p', { class: 'aide' }, `Identifiant : ${ident}. En cas d’oubli de votre code : écran de connexion → « Code oublié ? ».`)),
      [{ texte: '🖶  Imprimer', action: () => { imprimer('A5 portrait'); return false; } }, { texte: 'C’est noté', classe: 'principal', valeur: true }]);
      pageCompte(zone, _arg, ctx);
    } catch (e) { erreur(e); }
  }
}

// Petits outils d'interface : création d'éléments, messages, fenêtres, champs enregistrés automatiquement.

// h('div', {class: 'x', onclick: f}, enfant1, 'texte', …) — le texte est toujours inséré comme texte (jamais comme HTML)
export function h(tag, props = {}, ...enfants) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') {
      for (const [p, x] of Object.entries(v)) { if (p.startsWith('--')) el.style.setProperty(p, x); else el.style[p] = x; }
    }
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else if (k === 'checked') el.checked = !!v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  ajouter(el, enfants);
  return el;
}
function ajouter(el, enfants) {
  for (const e of enfants.flat(Infinity)) {
    if (e === null || e === undefined || e === false) continue;
    el.append(e instanceof Node ? e : document.createTextNode(String(e)));
  }
}
export const vider = (el, ...enfants) => { el.replaceChildren(); ajouter(el, enfants); return el; };

// ------------------------------------------------------------------------------------------- messages
let minuteur = null;
export function toast(texte, type = 'ok') {
  const t = document.getElementById('toast');
  t.textContent = texte;
  t.className = 'visible ' + type;
  clearTimeout(minuteur);
  minuteur = setTimeout(() => { t.className = ''; }, type === 'erreur' ? 6000 : 2200);
}
export const erreur = (e) => toast(e?.message || String(e), 'erreur');

// ------------------------------------------------------------------------------------------- fenêtres
export function fenetre(titre, contenu, boutons = [], { large = false } = {}) {
  return new Promise((resolve) => {
    const fond = h('div', { class: 'fond-fenetre' });
    const fermer = (v) => { fond.remove(); document.removeEventListener('keydown', touche); resolve(v); };
    const touche = (e) => { if (e.key === 'Escape') fermer(null); };
    const pied = h('div', { class: 'pied-fenetre' },
      boutons.map((b) => h('button', {
        class: 'btn ' + (b.classe || ''), type: 'button',
        onclick: async () => {
          if (b.action) {
            try { const r = await b.action(); if (r === false) return; fermer(r === undefined ? b.valeur : r); }
            catch (e) { erreur(e); }
          } else fermer(b.valeur);
        },
      }, b.texte)));
    const boite = h('div', { class: 'fenetre' + (large ? ' large' : ''), role: 'dialog', 'aria-modal': 'true' },
      h('div', { class: 'tete-fenetre' }, h('h2', {}, titre), h('button', { class: 'fermer', type: 'button', 'aria-label': 'Fermer', onclick: () => fermer(null) }, '✕')),
      h('div', { class: 'corps-fenetre' }, contenu), pied);
    fond.append(boite);
    fond.addEventListener('mousedown', (e) => { if (e.target === fond) fermer(null); });
    document.addEventListener('keydown', touche);
    document.body.append(fond);
    const premier = boite.querySelector('input, textarea, select');
    if (premier) setTimeout(() => premier.focus(), 30);
  });
}
export const confirmer = (titre, texte, ok = 'Confirmer') =>
  fenetre(titre, h('p', {}, texte), [{ texte: 'Annuler', valeur: false }, { texte: ok, classe: 'danger', valeur: true }]).then((v) => !!v);

// ------------------------------------------------------------------------------------------- champs
// champ de saisie enregistré automatiquement quand on le quitte (ou après une pause de frappe)
export function champ(valeur, enregistrer, { multi = false, lecture = false, placeholder = '', type = 'text', classe = '', options = null } = {}) {
  let initial = valeur ?? '';
  let el;
  if (options) {
    el = h('select', { class: 'champ ' + classe, disabled: lecture },
      options.map((o) => h('option', { value: o.valeur, selected: String(o.valeur) === String(initial) }, o.texte)));
  } else if (multi) {
    el = h('textarea', { class: 'champ ' + classe, rows: 1, placeholder, readonly: lecture });
    el.value = initial;
  } else {
    el = h('input', { class: 'champ ' + classe, type, placeholder, readonly: lecture });
    el.value = initial;
  }
  if (lecture) { el.classList.add('lecture'); return el; }
  let attente = null;
  const valider = async () => {
    clearTimeout(attente);
    const v = el.value;
    if (v === String(initial)) return;
    el.classList.add('envoi');
    try {
      await enregistrer(v);
      initial = v;
      el.classList.remove('envoi', 'echec');
      el.classList.add('ok');
      setTimeout(() => el.classList.remove('ok'), 900);
    } catch (e) {
      el.classList.remove('envoi');
      el.classList.add('echec');
      erreur(e);
    }
  };
  el.addEventListener(options ? 'change' : 'blur', valider);
  if (!options) el.addEventListener('input', () => { clearTimeout(attente); attente = setTimeout(valider, 1500); if (multi) ajuster(el); });
  if (multi) requestAnimationFrame(() => ajuster(el));
  return el;
}
export function ajuster(t) {
  t.style.height = 'auto';
  t.style.height = Math.max(t.scrollHeight + 2, 30) + 'px';
}
// les zones de texte de la page prennent la hauteur de leur contenu
export function ajusterTout(racine) {
  racine.querySelectorAll('textarea.champ').forEach(ajuster);
}

export const nombre = (v) => {
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
export const heures = (n) => (n == null ? '' : (Number.isInteger(n) ? n : String(n).replace('.', ',')) + ' h');
export const dateFr = (d) => (d ? new Date(d + 'T12:00:00').toLocaleDateString('fr-FR') : '');

// ------------------------------------------------------------------------------------------- impression
// format : 'A4 portrait', 'A4 landscape', 'A3 landscape'… ; les zones de texte sont remplacées par leur texte complet
export function imprimer(format = 'A4 portrait') {
  let st = document.getElementById('format-impression');
  if (!st) { st = document.createElement('style'); st.id = 'format-impression'; document.head.append(st); }
  st.textContent = `@page { size: ${format}; margin: 8mm; }`;
  window.print();
}
window.addEventListener('beforeprint', () => {
  document.querySelectorAll('.texte-impression').forEach((d) => d.remove());
  document.querySelectorAll('textarea.champ').forEach((t) => {
    const d = document.createElement('div');
    d.className = 'texte-impression';
    d.textContent = t.value;
    t.after(d);
  });
});
window.addEventListener('afterprint', () => document.querySelectorAll('.texte-impression').forEach((d) => d.remove()));

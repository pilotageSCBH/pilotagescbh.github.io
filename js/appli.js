// Le site comme une application : installation (icône sur l'écran d'accueil), fichiers gardés sur l'appareil,
// et message « Nouvelle version disponible » quand le site a été mis à jour.
import { h } from './ui.js';

let invitation = null;          // proposition d'installation du navigateur (Chrome, Edge, Android)
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault(); invitation = e;
  document.querySelectorAll('.bouton-installer').forEach((b) => { b.hidden = false; });
});
window.addEventListener('appinstalled', () => { invitation = null; document.querySelectorAll('.bouton-installer').forEach((b) => { b.hidden = true; }); });

export const estInstallee = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const appareil = () => (/iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ? 'ios'
  : /android/i.test(navigator.userAgent) ? 'android' : 'ordinateur');

// fichiers du site gardés sur l'appareil (site en https seulement)
if ('serviceWorker' in navigator && (location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname))) {
  navigator.serviceWorker.register('sw.js').catch(() => { /* navigateur sans prise en charge : le site marche quand même */ });
  navigator.serviceWorker.addEventListener('message', (e) => { if (e.data?.type === 'nouvelle-version') bandeauVersion(); });
}
function bandeauVersion() {
  if (document.querySelector('.bandeau-version')) return;
  document.body.append(h('div', { class: 'bandeau-version', role: 'status' },
    h('span', {}, '🔄  Une nouvelle version du site est disponible.'),
    h('button', { class: 'btn petit principal', type: 'button', onclick: () => location.reload() }, 'Recharger'),
    h('button', { class: 'btn petit', type: 'button', onclick: (e) => e.target.closest('.bandeau-version').remove() }, 'Plus tard')));
}

// bloc « Application » (page Mon compte)
export function blocInstallation() {
  const a = appareil();
  const etapes = {
    ios: ['Ouvrez le site dans Safari.', 'Touchez le bouton Partager (carré avec une flèche vers le haut).', 'Choisissez « Sur l’écran d’accueil », puis « Ajouter ».'],
    android: ['Ouvrez le site dans Chrome.', 'Touchez « Installer l’application » ci-dessous, ou le menu ⋮ puis « Installer l’application » (ou « Ajouter à l’écran d’accueil »).'],
    ordinateur: ['Dans Chrome ou Edge : bouton « Installer » ci-dessous, ou l’icône d’installation à droite de la barre d’adresse.', 'Le site s’ouvre ensuite dans sa propre fenêtre, comme un logiciel.'],
  }[a];
  return h('section', { class: 'bloc carte-compte-bloc appli-bloc' },
    h('div', { class: 'tete-carte' }, h('span', { class: 'kpi-icone' }, '📲'), h('h2', {}, 'Application sur téléphone et ordinateur')),
    estInstallee() ? h('p', {}, '✅ Le site est installé sur cet appareil.')
      : [h('p', { class: 'aide' }, 'Installez le site comme une application : une icône sur l’écran d’accueil, une ouverture plus rapide et en plein écran. Rien à télécharger depuis un magasin d’applications.'),
        h('ol', { class: 'etapes-installation' }, etapes.map((t) => h('li', {}, t))),
        h('button', { class: 'btn principal bouton-installer', type: 'button', hidden: !invitation, onclick: async () => {
          if (!invitation) return; invitation.prompt(); try { await invitation.userChoice; } catch { /* refus */ } invitation = null;
        } }, '📲  Installer l’application')],
    h('p', { class: 'aide' }, 'Mises à jour : le site ouvre toujours sa dernière version quand vous êtes connecté à internet ; la copie gardée sur l’appareil ne sert que hors connexion.'));
}

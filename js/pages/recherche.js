// Recherche dans tout le site (promotion affichée) : pages, séquences, séances, fiches de préparation et de déroulement,
// contrats et critères, Ma bibliothèque, Mes cours et documents partagés. Un clic mène à l'endroit trouvé (surligné).
// #/recherche/<texte>
import { db } from '../api.js';
import { h, vider } from '../ui.js';
import { nomCollegue, chargerCollegues } from '../ressources.js';
import { GENRES } from './espace.js';

const sansAccent = (t) => String(t ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
export const CLE_CIBLE = 'pilotage-scbh-cible';
// mémorise l'endroit à surligner à l'arrivée sur la page (lu par app.js après l'affichage)
export function viser(hash, { sel = '', terme = '' } = {}) {
  try { sessionStorage.setItem(CLE_CIBLE, JSON.stringify({ hash, sel, terme, t: Date.now() })); } catch { /* sans stockage */ }
}

export async function pageRecherche(zone, arg, ctx) {
  let q = ''; try { q = decodeURIComponent(arg || ''); } catch { q = arg || ''; }
  const champ = h('input', { class: 'recherche-globale', type: 'search', value: q, placeholder: 'Rechercher dans tout le site…', 'aria-label': 'Rechercher dans tout le site',
    onkeydown: (e) => { if (e.key === 'Enter' && champ.value.trim()) location.hash = '#/recherche/' + encodeURIComponent(champ.value.trim()); } });
  const resultats = h('div', { class: 'resultats-globaux' }, h('p', { class: 'aide' }, q ? 'Recherche…' : 'Tapez un ou plusieurs mots puis Entrée.'));
  vider(zone,
    h('header', { class: 'entete-page' }, h('div', {}, h('h1', {}, '🔎  Rechercher'),
      h('p', { class: 'sous-titre' }, `Promotion ${ctx.promo?.libelle || ''} · séquençages, fiches, contrats` + (ctx.peutEcrire() ? ', bibliothèque et cours' : '')))),
    h('div', { class: 'barre-recherche-globale' }, champ, h('button', { class: 'btn principal', onclick: () => { if (champ.value.trim()) location.hash = '#/recherche/' + encodeURIComponent(champ.value.trim()); } }, 'Rechercher')),
    resultats);
  setTimeout(() => { champ.focus(); champ.setSelectionRange(champ.value.length, champ.value.length); }, 30);
  const termes = sansAccent(q).split(/\s+/).filter((t) => t.length > 1 || /\d/.test(t));
  if (!termes.length) return;

  const trouve = (...textes) => { const s = sansAccent(textes.flat().filter(Boolean).join(' ')); return termes.every((m) => s.includes(m)); };
  // extrait autour du premier mot trouvé, mots surlignés
  const extrait = (...textes) => {
    const t = textes.flat().filter(Boolean).map(String).join(' · ').replace(/\s+/g, ' ');
    const s = sansAccent(t);
    let i = Math.min(...termes.map((m) => { const k = s.indexOf(m); return k < 0 ? Infinity : k; }));
    if (!isFinite(i)) i = 0;
    const a = Math.max(0, i - 60), b = Math.min(t.length, i + 140);
    const morceau = (a ? '…' : '') + t.slice(a, b) + (b < t.length ? '…' : ''), sm = sansAccent(morceau);
    if (sm.length !== morceau.length) return morceau;
    const z = []; for (const m of termes) { let k = sm.indexOf(m); while (k >= 0) { z.push([k, k + m.length]); k = sm.indexOf(m, k + m.length); } }
    z.sort((x, y) => x[0] - y[0]);
    const out = []; let pos = 0;
    for (const [x, y] of z) { if (x < pos) continue; if (x > pos) out.push(morceau.slice(pos, x)); out.push(h('mark', {}, morceau.slice(x, y))); pos = y; }
    if (pos < morceau.length) out.push(morceau.slice(pos)); return out;
  };
  const champTrouve = (obj, champs) => champs.find((c) => trouve(obj[c]));

  const P = ctx.promo, mats = new Map(ctx.matieres.map((m) => [m.id, m]));
  const groupes = [];   // { titre, icone, items: [{ titre, contexte, extrait, hash, sel, terme }] }
  const ajouter = (titre, icone, items) => { if (items.length) groupes.push({ titre, icone, items }); };

  // pages du site (liens du menu)
  const pages = [...document.querySelectorAll('nav.menu a.lien-menu[href]')].map((a) => ({ titre: a.textContent.trim(), hash: a.getAttribute('href') }))
    .filter((p, i, l) => p.titre && l.findIndex((x) => x.hash === p.hash) === i && trouve(p.titre));
  ajouter('Pages', '🧭', pages.map((p) => ({ titre: p.titre, hash: p.hash })));

  try {
    const seqs = P ? await db.lire('sequences', `promotion_id=eq.${P.id}&order=matiere_id,numero`) : [];
    const S = new Map(seqs.map((s) => [s.id, s])), ids = seqs.map((s) => s.id);
    const lot = (l) => (l.length ? l.join(',') : '0');
    const [seances, fichesSeq, contratsP, contratsS] = await Promise.all([
      db.lire('seances', `sequence_id=in.(${lot(ids)})&order=sequence_id,numero`),
      db.lire('fiches_sequence', `sequence_id=in.(${lot(ids)})`),
      P ? db.lire('contrats', `promotion_id=eq.${P.id}`) : [], db.lire('contrats', `sequence_id=in.(${lot(ids)})`)]);
    const contrats = [...new Map([...contratsP, ...contratsS].map((c) => [c.id, c])).values()];
    const X = new Map(seances.map((x) => [x.id, x]));
    const [fichesSea, criteres] = await Promise.all([
      db.lire('fiches_seance', `seance_id=in.(${lot(seances.map((x) => x.id))})`),
      db.lire('criteres', `contrat_id=in.(${lot(contrats.map((c) => c.id))})&actif=eq.true`)]);
    const nomMat = (id) => mats.get(id)?.nom || '';
    const ctxSeq = (s) => `${nomMat(s.matiere_id)} · séquence ${s.numero}${s.intitule ? ' · ' + s.intitule : ''}`;
    const etiq = (x) => { const s = S.get(x.sequence_id); return `${ctx.codeMat(mats.get(s?.matiere_id))} ${s?.numero}.${x.numero}`; };

    ajouter('Séquences', '🧱', seqs.filter((s) => trouve(s.intitule, s.objectif, nomMat(s.matiere_id))).map((s) => ({
      titre: `Séquence ${s.numero} · ${s.intitule || 'sans intitulé'}`, contexte: nomMat(s.matiere_id), extrait: extrait(s.intitule, s.objectif),
      hash: '#/sequencage/' + s.matiere_id, sel: `[data-seq="${s.id}"]` })));
    ajouter('Séances', '📍', seances.filter((x) => trouve(x.titre, x.objectif_inter, x.objectifs_ops, x.cours, x.prerequis_texte, x.savoirs, x.competences, etiq(x),
      (x.cours_lies || []).map((c) => c.titre))).map((x) => ({
      titre: `${etiq(x)} · ${x.titre || 'sans titre'}`, contexte: ctxSeq(S.get(x.sequence_id)),
      extrait: extrait(x.titre, x.objectif_inter, x.objectifs_ops, x.cours, x.prerequis_texte, (x.cours_lies || []).map((c) => c.titre), (x.savoirs || []).join(' '), (x.competences || []).join(' ')),
      hash: '#/sequencage/' + S.get(x.sequence_id)?.matiere_id, sel: `tr[data-id="${x.id}"]` })));
    const CH_SEQ = ['activites', 'situation', 'prerequis', 'modalites', 'ressources', 'bilan'];
    ajouter('Fiches de préparation de séquence', '📋', fichesSeq.filter((f) => S.has(f.sequence_id) && trouve(CH_SEQ.map((c) => f[c]))).map((f) => {
      const s = S.get(f.sequence_id);
      return { titre: `Fiche de préparation · séquence ${s.numero}`, contexte: ctxSeq(s), extrait: extrait(CH_SEQ.map((c) => f[c])), hash: `#/fiches/${s.id}:preparation`, terme: termes[0] };
    }));
    const texteJson = (v) => JSON.stringify(v || '').replace(/"[a-z_]+":/gi, ' ').replace(/[{}[\]"]/g, ' ').replace(/\\n/g, ' ');
    const CH_SEA = ['salle', 'prerequis', 'materiel', 'evaluation', 'differenciation', 'bilan'];
    ajouter('Fiches de déroulement de séance', '📝', fichesSea.filter((f) => X.has(f.seance_id) && trouve(CH_SEA.map((c) => f[c]), texteJson(f.phases), texteJson(f.maison_avant), texteJson(f.maison_apres), texteJson(f.activites))).map((f) => {
      const x = X.get(f.seance_id), s = S.get(x.sequence_id);
      const ou = trouve(texteJson(f.maison_avant)) ? 'avant' : trouve(texteJson(f.maison_apres)) ? 'apres' : 'seance';
      return { titre: `Déroulement · ${etiq(x)} ${x.titre || ''}`, contexte: ctxSeq(s) + (ou !== 'seance' ? ' · travail à la maison' : ''),
        extrait: extrait(CH_SEA.map((c) => f[c]), texteJson(f.phases), texteJson(f.maison_avant), texteJson(f.maison_apres), texteJson(f.activites)),
        hash: `#/fiches/${s.id}:${ou}-${x.id}`, terme: termes[0] };
    }));
    const critDe = (c) => criteres.filter((k) => k.contrat_id === c.id);
    ajouter('Contrats et critères', '✅', contrats.filter((c) => trouve(c.titre, c.forme, c.lieu, c.organisation, critDe(c).map((k) => [k.groupe, k.texte]))).map((c) => {
      const s = S.get(c.sequence_id), x = X.get(c.seance_id);
      const hash = s ? `#/fiches/${s.id}:${c.type === 'formatif' && x ? 'formatif-' + x.id : 'sommatif'}` : '#/contrats/' + c.id;
      return { titre: `Contrat ${c.type}${c.titre ? ' · ' + c.titre : x ? ' · ' + etiq(x) : s ? ' · séquence ' + s.numero : ''}`,
        contexte: s ? ctxSeq(s) : `${nomMat(c.matiere_id)} · hors séquence`, extrait: extrait(c.titre, c.forme, c.organisation, critDe(c).map((k) => [k.groupe, k.texte])), hash, terme: termes[0] };
    }));
  } catch (e) { groupes.push({ titre: 'Séquençages et fiches', icone: '⚠', erreur: e.message, items: [] }); }

  // ressources (enseignants) : bibliothèque et cours, les miens et ceux partagés avec moi
  if (ctx.peutEcrire()) {
    try {
      const [themes, livres] = await Promise.all([db.lire('biblio_themes', 'order=ordre,id'), db.lire('biblio_livres', 'order=ordre,id'), chargerCollegues()]);
      const T = new Map(themes.map((t) => [t.id, t]));
      const chemin = (id) => { const l = []; let t = T.get(id), n = 0; while (t && n++ < 30) { l.unshift(t.nom); t = T.get(t.parent_id); } return l.join(' › '); };
      for (const [espace, titre, icone, base] of [['biblio', 'Ma bibliothèque', '📖', '#/biblio'], ['cours', 'Mes cours', '🎓', '#/cours']]) {
        const items = [];
        for (const t of themes.filter((t) => t.espace === espace && trouve(t.nom))) items.push({ titre: '📁 ' + t.nom, contexte: chemin(t.parent_id) || (t.proprietaire === ctx.profil.id ? 'Accueil' : 'Partagé par ' + nomCollegue(t.proprietaire)), hash: `${base}/t-${t.id}` });
        for (const l of livres.filter((l) => l.espace === espace)) {
          const som = (l.sommaire || []).map((e) => e.t);
          if (!trouve(l.titre, l.auteur, l.editeur, l.notes, l.savoirs, som, espace === 'cours' ? (GENRES[l.genre] || GENRES.cours)[1] : '')) continue;
          const ligne = (l.sommaire || []).find((e) => trouve(e.t)) || (l.sommaire || []).find((e) => termes.some((m) => sansAccent(e.t).includes(m)));
          items.push({ titre: (espace === 'cours' ? (GENRES[l.genre] || GENRES.cours)[0] : '📕') + ' ' + (l.titre || 'Sans titre'),
            contexte: [chemin(l.theme_id) || 'Non classé', l.proprietaire !== ctx.profil.id ? 'partagé par ' + nomCollegue(l.proprietaire) : ''].filter(Boolean).join(' · '),
            extrait: ligne ? extrait(ligne.t + (ligne.p ? ` (p. ${ligne.p})` : '')) : extrait(l.titre, l.auteur, l.notes, som), hash: `${base}/l-${l.id}` });
        }
        ajouter(titre, icone, items);
      }
    } catch { /* espaces pas encore installés */ }
  }

  const total = groupes.reduce((n, g) => n + g.items.length, 0);
  vider(resultats,
    h('p', { class: 'compte-recherche' }, total ? `${total} résultat(s) pour « ${q} »` : `Aucun résultat pour « ${q} » dans la promotion ${P?.libelle || ''}.`),
    groupes.map((g) => h('section', { class: 'groupe-resultats' },
      h('h2', { class: 'titre-section' }, `${g.icone} ${g.titre}`, g.items.length ? h('small', { class: 'gris' }, `  ${g.items.length}`) : null),
      g.erreur ? h('p', { class: 'erreur-ia' }, g.erreur) : null,
      h('ul', { class: 'liste-resultats' }, g.items.slice(0, 60).map((it) => h('li', {},
        h('a', { href: it.hash, onclick: () => viser(it.hash, { sel: it.sel || '', terme: it.terme || '' }) },
          h('b', {}, it.titre), it.contexte ? h('small', { class: 'gris' }, ' · ' + it.contexte) : null,
          it.extrait ? h('span', { class: 'extrait-resultat' }, it.extrait) : null))),
      g.items.length > 60 ? h('li', { class: 'aide' }, `… et ${g.items.length - 60} autre(s) : précisez la recherche.`) : null))));
}

// après l'affichage d'une page : faire défiler jusqu'à l'endroit trouvé et le surligner
export function allerALaCible(zone) {
  let c = null; try { c = JSON.parse(sessionStorage.getItem(CLE_CIBLE) || 'null'); } catch { c = null; }
  if (!c || Date.now() - c.t > 60000 || c.hash !== location.hash) return;
  try { sessionStorage.removeItem(CLE_CIBLE); } catch { /* sans stockage */ }
  let el = c.sel ? zone.querySelector(c.sel) : null;
  if (!el && c.terme) el = [...zone.querySelectorAll('textarea, input[type=text], input:not([type])')].find((x) => sansAccent(x.value).includes(c.terme));
  if (!el) return;
  setTimeout(() => {
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.classList.add('cible-recherche'); setTimeout(() => el.classList.remove('cible-recherche'), 3500);
  }, 150);
}

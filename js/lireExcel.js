// Lecture d'un classeur Excel (.xlsx / .xlsm) dans le navigateur, sans envoi : texte des cellules, feuille par feuille.
// lireExcel(fichier) → [{ nom, lignes: [[texte, texte…], …] }]  (lignes et colonnes vides conservées pour garder les positions)

const col = (ref) => { let n = 0; for (const c of ref.replace(/\d+/g, '')) n = n * 26 + (c.charCodeAt(0) - 64); return n - 1; };
const texteDe = (el) => [...el.getElementsByTagName('t')].map((t) => t.textContent).join('');

export async function lireExcel(fichier) {
  if (!/\.(xlsx|xlsm)$/i.test(fichier.name || '')) throw new Error(`« ${fichier.name} » : seuls les classeurs Excel récents (.xlsx, .xlsm) peuvent être lus.`);
  const P = await import('./pdf.js?v=20261113'); await P.chargerOutils();
  const zip = await window.JSZip.loadAsync(await fichier.arrayBuffer());
  const xml = async (chemin) => { const f = zip.file(chemin); return f ? new DOMParser().parseFromString(await f.async('string'), 'application/xml') : null; };
  const [wb, rels, ss] = await Promise.all([xml('xl/workbook.xml'), xml('xl/_rels/workbook.xml.rels'), xml('xl/sharedStrings.xml')]);
  if (!wb) throw new Error(`« ${fichier.name} » n’est pas un classeur Excel lisible.`);
  const partages = ss ? [...ss.getElementsByTagName('si')].map(texteDe) : [];
  const cibles = new Map([...(rels?.getElementsByTagName('Relationship') || [])].map((r) => [r.getAttribute('Id'), r.getAttribute('Target')]));
  const feuilles = [];
  for (const sh of [...wb.getElementsByTagName('sheet')]) {
    const rid = sh.getAttribute('r:id') || sh.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
    let cible = cibles.get(rid) || '';
    cible = cible.startsWith('/') ? cible.slice(1) : 'xl/' + cible.replace(/^\.\//, '');
    const doc = await xml(cible); if (!doc) continue;
    const lignes = [];
    for (const row of [...doc.getElementsByTagName('row')]) {
      const r = Number(row.getAttribute('r')) - 1;
      const L = [];
      for (const c of [...row.getElementsByTagName('c')]) {
        const t = c.getAttribute('t'), v = c.getElementsByTagName('v')[0]?.textContent ?? '';
        let val = '';
        if (t === 's') val = partages[Number(v)] ?? '';
        else if (t === 'inlineStr') val = texteDe(c);
        else if (t === 'b') val = v === '1' ? 'VRAI' : 'FAUX';
        else val = v;
        L[col(c.getAttribute('r'))] = String(val);
      }
      lignes[r] = Array.from(L, (x) => x ?? '');
    }
    feuilles.push({ nom: sh.getAttribute('name'), lignes: Array.from(lignes, (x) => x || []) });
  }
  return feuilles;
}

/*
 * Vérifie, sans navigateur, quelle règle de fond l'emporte en thème clair.
 *
 * Toutes les surcharges de `theme.css` portent `!important`, et Tailwind
 * injecte sa feuille après la nôtre : à spécificité égale c'est donc l'ordre
 * qui tranche, et une règle trop large peut silencieusement en coiffer une
 * autre. Ce script rejoue la cascade pour les classes réellement produites par
 * l'interface et signale tout cas où deux règles se disputent la même classe.
 *
 * Usage : node outils-verifier-css-clair.cjs
 */
const fs = require('fs');
const path = require('path');

const feuille = path.join(__dirname, 'front', 'css', 'theme.css');
if (!fs.existsSync(feuille)) {
  console.error('front/css/theme.css introuvable — lancez d\'abord outils-sync-front.cjs');
  process.exit(2);
}
const css = fs.readFileSync(feuille, 'utf8');

/* Découpe en règles en conservant leur ordre d'apparition. */
const regles = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m, i) => ({
  ordre: i,
  selecteurs: m[1].split(',').map((s) => s.trim()),
  corps: m[2].trim(),
}));

/* Vrai si un sélecteur simple de la forme `.pp-clair .X` ou
   `.pp-clair [class*="X"]` s'applique à la classe donnée. */
const correspond = (sel, classe) => {
  const t = sel.replace(/^\.pp-clair\s+/, '');
  const attribut = /^\[class\*="(.*)"\]$/.exec(t);
  if (attribut) {
    // La valeur est échappée pour CSS (`bg-sky-400\/`) alors que la classe du
    // DOM porte la barre oblique nue : on compare après déséchappement.
    return classe.includes(attribut[1].replace(/\\(.)/g, '$1'));
  }
  const exact = /^\.(.+)$/.exec(t);
  if (!exact) return false;
  return classe === exact[1].replace(/\\(.)/g, '$1');
};

/* Classes telles qu'elles apparaissent dans le DOM, relevées dans les pages. */
const classes = [
  'bg-sky-400/10', 'bg-teal-400/10', 'bg-violet-400/10', 'bg-rose-400/10',
  'bg-red-400/10', 'bg-amber-400/10', 'bg-emerald-400/10', 'bg-slate-400/10',
  'bg-sky-400', 'bg-amber-400', 'bg-emerald-400', 'bg-rose-400', 'bg-slate-400',
  'bg-red-500', 'bg-emerald-500', 'bg-amber-500', 'bg-violet-500', 'bg-pink-500',
];

let litiges = 0;
for (const classe of classes) {
  const applicables = regles.filter(
    (r) => /background-color/.test(r.corps) && r.selecteurs.some((s) => correspond(s, classe)),
  );
  if (applicables.length === 0) {
    console.log(`  ${classe.padEnd(22)} aucune surcharge (Tailwind décide)`);
    continue;
  }
  const gagnante = applicables[applicables.length - 1];
  const valeur = /background-color:\s*([^;!]+)/.exec(gagnante.corps)?.[1].trim();
  const concourt = applicables.length > 1;
  if (concourt) litiges++;
  console.log(
    `  ${classe.padEnd(22)} ${concourt ? 'CONCOURS' : 'ok      '} -> ${valeur}  [règle ${gagnante.ordre}]`,
  );
}

console.log(`\n${litiges} classe(s) disputée(s) par plusieurs règles.`);
process.exit(litiges === 0 ? 0 : 1);

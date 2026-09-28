/* Vérifie que les dictionnaires français et anglais ont exactement les mêmes
   clefs, et que toutes les clefs utilisées dans le code existent.

   Usage : node outils-verifier-i18n.cjs

   Pourquoi c'est nécessaire : une clef présente d'un seul côté ne casse rien —
   l'application retombe silencieusement sur le français. Le défaut est donc
   invisible à l'usage, et ne se voit qu'en comparant les deux dictionnaires. */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

/* ---------- Chargement des dictionnaires, sans navigateur ---------- */
const bac = { console };
bac.window = bac;
bac.globalThis = bac;
bac.document = { documentElement: {}, querySelectorAll: () => [] };
vm.createContext(bac);

const charger = (f) => vm.runInContext(fs.readFileSync(f, 'utf8'), bac, { filename: f });
charger('js/i18n/i18n.js');

const dictionnaires = {};
bac.PP.i18n.enregistrer = (code, dico) => { dictionnaires[code] = dico; };
charger('js/i18n/fr.js');
charger('js/i18n/en.js');

/* ---------- Aplatissement : { a: { b: 'x' } } -> ['a.b'] ---------- */
const aplatir = (objet, prefixe = '') => Object.entries(objet).flatMap(([clef, valeur]) => {
  const chemin = prefixe ? `${prefixe}.${clef}` : clef;
  if (valeur && typeof valeur === 'object' && !Array.isArray(valeur)) return aplatir(valeur, chemin);
  return [chemin];
});

const fr = aplatir(dictionnaires.fr);
const en = aplatir(dictionnaires.en);

let erreurs = 0;

/* ---------- 1. Parité des clefs ---------- */
const seulementFr = fr.filter((k) => !en.includes(k));
const seulementEn = en.filter((k) => !fr.includes(k));

console.log(`Clefs français : ${fr.length}`);
console.log(`Clefs anglais  : ${en.length}`);

if (seulementFr.length) {
  erreurs += seulementFr.length;
  console.log(`\n✗ ${seulementFr.length} clef(s) absente(s) de l'anglais :`);
  seulementFr.forEach((k) => console.log('   ' + k));
}
if (seulementEn.length) {
  erreurs += seulementEn.length;
  console.log(`\n✗ ${seulementEn.length} clef(s) absente(s) du français :`);
  seulementEn.forEach((k) => console.log('   ' + k));
}
if (!seulementFr.length && !seulementEn.length) {
  console.log('\n✓ Parité des clefs : identique');
}

/* ---------- 2. Jetons {param} identiques des deux côtés ----------
   Le français pluralise en ajoutant un jeton vide derrière le mot
   (« employé{s} »), que l'anglais n'a pas besoin d'écrire. Ces suffixes
   sont donc tolérés : on ne compare que les jetons porteurs de sens. */
const MOTIF_PLURIEL = /^s\d*$/;
const jetons = (v) => (String(v).match(/\{(\w+)\}/g) || [])
  .map((j) => j.slice(1, -1))
  .filter((nom) => !MOTIF_PLURIEL.test(nom))
  .sort()
  .join(',');
const chercher = (dico, clef) => String(clef).split('.').reduce((v, p) => (v == null ? undefined : v[p]), dico);

const jetonsDiff = fr.filter((k) => {
  const a = chercher(dictionnaires.fr, k);
  const b = chercher(dictionnaires.en, k);
  return typeof a === 'string' && typeof b === 'string' && jetons(a) !== jetons(b);
});
if (jetonsDiff.length) {
  erreurs += jetonsDiff.length;
  console.log(`\n✗ ${jetonsDiff.length} clef(s) dont les jetons {…} diffèrent :`);
  jetonsDiff.forEach((k) => {
    console.log(`   ${k}`);
    console.log(`      fr : ${chercher(dictionnaires.fr, k)}`);
    console.log(`      en : ${chercher(dictionnaires.en, k)}`);
  });
} else {
  console.log('✓ Jetons {param} : identiques des deux côtés');
}

/* ---------- 3. Clefs utilisées dans le code mais absentes des dictionnaires ---------- */
const fichiers = [];
const parcourir = (d) => {
  fs.readdirSync(d).forEach((n) => {
    const p = path.join(d, n);
    if (fs.statSync(p).isDirectory()) { parcourir(p); return; }
    if (n.endsWith('.js') && !p.includes('i18n') && !p.includes('vendor')) fichiers.push(p);
  });
};
parcourir('js');

const utilisees = new Set();
fichiers.forEach((f) => {
  const src = fs.readFileSync(f, 'utf8');
  [...src.matchAll(/\b(?:t|tx)\(['"]([a-zA-Z0-9_.]+)['"]/g)].forEach((m) => utilisees.add(m[1]));
  /* Les clefs construites dynamiquement, comme `'absences.periode_' + code`,
     ne sont pas détectables : elles sont signalées pour vérification manuelle. */
  [...src.matchAll(/\b(?:t|tx)\(['"]([a-zA-Z0-9_.]+)['"]\s*\+/g)].forEach((m) => utilisees.add(m[1] + '…'));
});

/* Certaines clefs désignent des OBJETS (table des jours, des mois, des fériés)
   et non du texte : on les accepte si le chemin existe, quelle que soit sa nature. */
const existe = (dico, clef) => chercher(dico, clef) !== undefined;

const manquantes = [...utilisees].filter((k) => {
  if (k.endsWith('…')) return false;          /* concaténation, vérifiée plus bas */
  if (fr.includes(k)) return false;           /* clef de texte connue */
  if (existe(dictionnaires.fr, k)) return false; /* objet (jours, mois, fériés…) */
  /* Une clef préfixe d'une concaténation est signalée comme « absences.periode_… »
     ailleurs : on ne la compte pas deux fois. */
  if ([...utilisees].some((u) => u.endsWith('…') && u.startsWith(k))) return false;
  return true;
});
if (manquantes.length) {
  erreurs += manquantes.length;
  console.log(`\n✗ ${manquantes.length} clef(s) utilisée(s) dans le code mais absente(s) du dictionnaire :`);
  manquantes.forEach((k) => console.log('   ' + k));
} else {
  console.log(`✓ ${utilisees.size} clef(s) du code : toutes présentes`);
}

const dynamiques = [...utilisees].filter((k) => k.endsWith('…'));
if (dynamiques.length) {
  /* Ces clefs sont assemblées à l'exécution : « absences.periode_ » + code.
     On vérifie que chaque code du jeu de données correspondant a bien sa clef. */
  const prefixesAttendus = {
    'absences.periode_': ['journee', 'matin', 'apresmidi', 'heures'],
  };
  let ko = 0;
  dynamiques.forEach((k) => {
    const prefixe = k.replace('…', '');
    const suffixes = prefixesAttendus[prefixe];
    if (!suffixes) {
      console.log(`\nℹ ${prefixe}… : aucun jeu de valeurs connu, vérification manuelle requise.`);
      return;
    }
    const absentes = suffixes.filter((s) => !fr.includes(prefixe + s));
    if (absentes.length) {
      erreurs += absentes.length;
      console.log(`\n✗ ${prefixe}… : clef(s) manquante(s) pour ${absentes.join(', ')}`);
    } else {
      console.log(`✓ ${prefixe}… : les ${suffixes.length} valeurs ont leur clef`);
    }
    ko += absentes.length;
  });
}

console.log('');
if (erreurs) {
  console.log(`ÉCHEC : ${erreurs} problème(s) à corriger.`);
  process.exit(1);
}
console.log('TOUT EST EN ORDRE.');

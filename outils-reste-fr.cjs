/* Liste les chaînes françaises restantes dans le code, avec fichier et ligne,
   en ignorant les commentaires. Sert à vérifier qu'il ne reste pas de texte
   d'interface non traduit. */
const fs = require('fs');
const path = require('path');

const ACCENTS = /[àâäéèêëîïôöùûüçÀÂÉÈÊÎÔÙÛÇ]/;
const resultat = [];

const parcourir = (dossier) => {
  fs.readdirSync(dossier).forEach((nom) => {
    const p = path.join(dossier, nom);
    if (fs.statSync(p).isDirectory()) { parcourir(p); return; }
    if (!nom.endsWith('.js') || p.includes('i18n')) return;

    fs.readFileSync(p, 'utf8').split('\n').forEach((ligne, i) => {
      const sansCommentaire = ligne
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/, '');
      const trouves = [...sansCommentaire.matchAll(/["'`]([^"'`]*[àâäéèêëîïôöùûüçÀÂÉÈÊÎÔÙÛÇ][^"'`]*)["'`]/g)];
      trouves.forEach((t) => resultat.push([p, i + 1, t[1].slice(0, 95)]));
    });
  });
};

parcourir('js');
resultat.forEach(([f, l, s]) => {
  console.log(f.replace(/\\/g, '/') + ':' + l + '  « ' + s + ' »');
});
console.log('--- ' + resultat.length + ' occurrence(s)');

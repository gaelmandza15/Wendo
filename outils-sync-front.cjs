/* Recopie le front dans « front/ » pour l'application de bureau.

   Pourquoi cette copie : Tauri exige que le front soit dans un dossier dédié,
   sinon il tente d'embarquer aussi les sources Rust et le dossier de
   compilation. Plutôt que de dupliquer les sources à la main — et de risquer
   des copies divergentes — on garde une seule source à la racine et on la
   recopie au moment de construire.

   Usage :
     node outils-sync-front.cjs     prépare front/
     cargo tauri dev                lance l'application (après cette copie)

   Ne jamais modifier les fichiers de « front/ » : ils sont écrasés à chaque
   copie. Les sources sont celles de la racine. */

const fs = require('fs');
const path = require('path');

const RACINE = __dirname;
const CIBLE = path.join(RACINE, 'front');
const A_COPIER = ['assets', 'css', 'js', 'vendor', 'index.html'];

const copier = (source, destination) => {
  const stat = fs.statSync(source);
  if (stat.isDirectory()) {
    fs.mkdirSync(destination, { recursive: true });
    fs.readdirSync(source).forEach((nom) => copier(path.join(source, nom), path.join(destination, nom)));
    return;
  }
  fs.copyFileSync(source, destination);
};

const compter = (chemin, depart = 0) => {
  const stat = fs.statSync(chemin);
  if (!stat.isDirectory()) return depart + 1;
  return fs.readdirSync(chemin).reduce((n, nom) => compter(path.join(chemin, nom), n), depart);
};

fs.rmSync(CIBLE, { recursive: true, force: true });
fs.mkdirSync(CIBLE, { recursive: true });

A_COPIER.forEach((nom) => {
  const source = path.join(RACINE, nom);
  if (!fs.existsSync(source)) throw new Error(`Source manquante : ${nom}`);
  copier(source, path.join(CIBLE, nom));
});

const total = A_COPIER.reduce((n, nom) => compter(path.join(CIBLE, nom), n), 0);
console.log(`front/ prêt — ${total} fichiers copiés depuis les sources de la racine.`);

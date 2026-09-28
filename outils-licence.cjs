/* Génère la paire de clés Ed25519 du système de licences, et renseigne les
   deux fichiers qui en dépendent : l'application (clé publique) et le serveur
   (URL + clé publique pour diagnostic).

   Usage : node outils-licence.cjs
           node outils-licence.cjs --url https://mon-serveur.workers.dev

   À n'exécuter QU'UNE FOIS. Changer la paire après la première vente invalide
   toutes les activations déjà faites : chaque application distribuée embarque
   la clé publique, et il faudrait republier une mise à jour.

   La clé privée n'est jamais affichée à l'écran : elle est écrite dans
   serveur/.dev.vars (ignoré par git) pour être poussée ensuite vers le serveur. */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/* Ed25519 n'est pas exposé par `crypto.generateKeyPairSync` avant Node 12 dans
   certaines versions ; on passe par l'API moderne, disponible partout depuis
   Node 16. Si l'environnement ne la fournit pas, on le dit clairement plutôt
   que de produire une paire invalide. */
const generer = () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  /* Export DER : l'Ed25519 a une structure fixe, donc on sait où se trouvent
     les octets utiles (32 pour la graine privée, 32 pour la clé publique). */
  const derPrive = privateKey.export({ type: 'pkcs8', format: 'der' });
  const derPublic = publicKey.export({ type: 'spki', format: 'der' });
  return {
    graine: derPrive.subarray(derPrive.length - 32),
    publique: derPublic.subarray(derPublic.length - 32),
  };
};

const hex = (buf) => buf.toString('hex');

/* ---------- Arguments ---------- */
const args = process.argv.slice(2);
const indexUrl = args.indexOf('--url');
const urlFournie = indexUrl >= 0 ? args[indexUrl + 1] : null;
const forcer = args.includes('--force');

/* ---------- Garde-fou : ne jamais écraser une paire existante ---------- */
const cheminServeur = path.join('serveur', '.dev.vars');
const cheminApp = path.join('src', 'licence.rs');
const cheminActivation = path.join('src', 'activation.rs');

const clePubliqueActuelle = fs.existsSync(cheminApp)
  ? (fs.readFileSync(cheminApp, 'utf8').match(/CLE_PUBLIQUE_HEX: Option<&str> = Some\("([0-9a-f]+)"\)/) || [])[1]
  : null;

/* ---------- Deux usages bien distincts ----------
   1. Renseigner l'URL du serveur : --url https://…
      On ne touche PAS aux clés. Régénérer la paire ici serait une faute
      grave : le serveur déployé garderait l'ancienne clé privée (les secrets
      Cloudflare sont en écriture seule, on ne les relit pas), et toutes les
      activations échoueraient silencieusement.

   2. Régénérer la paire : sans --url, ou avec --force.
      À ne faire qu'avant la première vente, ou si la clé privée a fuité. */
const urlSeule = Boolean(urlFournie) && !forcer && !args.includes('--regenerer');

if (urlSeule) {
  if (!clePubliqueActuelle) {
    console.error('');
    console.error('✗ Aucune paire de clés n\'est encore configurée.');
    console.error('  Lancez d\'abord : node outils-licence.cjs');
    console.error('');
    process.exit(1);
  }
  const sourceActivation = fs.readFileSync(cheminActivation, 'utf8');
  const modifiee = sourceActivation.replace(
    /pub const URL_SERVEUR: Option<&str> = (None|Some\("[^"]*"\));/,
    `pub const URL_SERVEUR: Option<&str> = Some("${urlFournie.replace(/\/+$/, '')}");`,
  );
  if (modifiee === sourceActivation) {
    console.error('✗ Repère URL_SERVEUR introuvable dans ' + cheminActivation);
    process.exit(1);
  }
  fs.writeFileSync(cheminActivation, modifiee);
  console.log('');
  console.log('=== URL du serveur renseignée ===');
  console.log('');
  console.log('  ' + urlFournie.replace(/\/+$/, ''));
  console.log('  → écrite dans ' + cheminActivation);
  console.log('');
  console.log('  Les clés n\'ont pas été touchées.');
  console.log('  Recompilez :  cargo build');
  console.log('');
  process.exit(0);
}

if (clePubliqueActuelle && !forcer) {
  console.log('');
  console.log('⚠  Une clé publique est DÉJÀ configurée :');
  console.log('   ' + clePubliqueActuelle);
  console.log('');
  console.log('   La remplacer invaliderait toutes les licences déjà émises, ET');
  console.log('   désaccorderait le serveur déployé : ses secrets sont en écriture');
  console.log('   seule, il faudrait les repousser à la main.');
  console.log('');
  console.log('   Pour seulement renseigner l\'URL du serveur :');
  console.log('     node outils-licence.cjs --url https://…');
  console.log('');
  console.log('   Pour régénérer réellement la paire : relancez avec --force.');
  console.log('');
  process.exit(1);
}

/* ---------- Génération ---------- */
const { graine, publique } = generer();
const publiqueHex = hex(publique);

/* ---------- Écriture dans l'application ---------- */
const sourceApp = fs.readFileSync(cheminApp, 'utf8');
const appModifiee = sourceApp.replace(
  /pub const CLE_PUBLIQUE_HEX: Option<&str> = (None|Some\("[0-9a-f]*"\));/,
  `pub const CLE_PUBLIQUE_HEX: Option<&str> = Some("${publiqueHex}");`,
);
if (appModifiee === sourceApp) {
  throw new Error('Repère CLE_PUBLIQUE_HEX introuvable dans ' + cheminApp);
}
fs.writeFileSync(cheminApp, appModifiee);

/* ---------- Écriture de l'URL dans l'application ---------- */
if (urlFournie) {
  const sourceActivation = fs.readFileSync(cheminActivation, 'utf8');
  const activationModifiee = sourceActivation.replace(
    /pub const URL_SERVEUR: Option<&str> = (None|Some\("[^"]*"\));/,
    `pub const URL_SERVEUR: Option<&str> = Some("${urlFournie.replace(/\/+$/, '')}");`,
  );
  if (activationModifiee === sourceActivation) {
    throw new Error('Repère URL_SERVEUR introuvable dans ' + cheminActivation);
  }
  fs.writeFileSync(cheminActivation, activationModifiee);
}

/* ---------- Écriture des secrets serveur ---------- */
const contenuServeur = [
  '# Secrets du serveur de licences — NE PAS VERSIONNER',
  '# À pousser avec : npx wrangler secret put LICENSE_PRIVATE_KEY < serveur/.dev.vars',
  'LICENSE_PRIVATE_KEY=' + hex(graine),
  '# Clé API du fournisseur de paiement (Chariow, Gumroad, Lemon Squeezy…)',
  'PROVIDER_API_KEY=',
  '# Sentinelle : laisser vide pour utiliser l\'adaptateur générique',
  'PROVIDER=generique',
  `LICENSE_PUBLIC_KEY=${publiqueHex}`,
  '',
].join('\n');

fs.mkdirSync('serveur', { recursive: true });
fs.writeFileSync(cheminServeur, contenuServeur);

/* ---------- Résumé ---------- */
console.log('');
console.log('=== Paire de clés générée ===');
console.log('');
console.log('Clé PUBLIQUE (embarquée dans l\'application) :');
console.log('  ' + publiqueHex);
console.log('   → écrite dans ' + cheminApp);
if (urlFournie) console.log('   → URL du serveur écrite dans ' + cheminActivation);
console.log('');
console.log('Clé PRIVÉE :');
console.log('  écrite dans ' + cheminServeur + ' (à ne jamais versionner ni afficher)');
console.log('');
console.log('=== À faire maintenant ===');
console.log('');
console.log('  1. SAUVEGARDEZ la clé privée dans votre gestionnaire de mots de passe.');
console.log('     Les secrets Cloudflare sont en écriture seule : perdue, elle est');
console.log('     définitivement irrécupérable, et vous ne pourrez plus émettre de');
console.log('     licence (les clients déjà activés continueraient de fonctionner).');
console.log('');
console.log('  2. Déployez le serveur :');
console.log('       cd serveur');
console.log('       npx wrangler secret put LICENSE_PRIVATE_KEY   (coller la ligne de .dev.vars)');
console.log('       npx wrangler secret put PROVIDER_API_KEY');
console.log('       npx wrangler deploy');
console.log('');
console.log('  3. Renseignez l\'URL obtenue dans l\'application :');
console.log('       node outils-licence.cjs --url https://…workers.dev --force');
console.log('     (ou modifiez URL_SERVEUR à la main dans src/activation.rs)');
console.log('');
console.log('  4. Recompilez :  cargo build');
console.log('');

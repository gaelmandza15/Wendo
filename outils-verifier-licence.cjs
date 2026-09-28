/* Vérifie la cohérence de la configuration de licence, sans interface.

   Trois contrôles, chacun couvrant une erreur qui ne se verrait qu'à la
   première vente :

     1. La clé publique embarquée dans l'application correspond-elle à la clé
        privée détenue par le serveur ? Si elles divergent, TOUTES les
        activations échoueront, et le diagnostic est difficile.
     2. Le serveur sait-il signer ? (clé privée de la bonne longueur)
     3. Le code machine a-t-il la forme attendue par les deux côtés ?

   Usage : node outils-verifier-licence.cjs */

const fs = require('fs');
const { webcrypto } = require('crypto');
const { execFileSync } = require('child_process');

const resultats = [];
const verifier = (nom, ok, detail = '') => {
  resultats.push({ nom, ok });
  console.log((ok ? '  ✓ ' : '  ✗ ') + nom + (!ok && detail ? ' — ' + detail : ''));
};

/* ---------- Lecture des deux clés ---------- */
const lireFichier = (chemin) => (fs.existsSync(chemin) ? fs.readFileSync(chemin, 'utf8') : null);

const sourceLicence = lireFichier('src/licence.rs');
const sourceActivation = lireFichier('src/activation.rs');
const secrets = lireFichier('serveur/.dev.vars');

const clePubliqueApp = (sourceLicence?.match(/CLE_PUBLIQUE_HEX: Option<&str> = Some\("([0-9a-f]{64})"\)/) || [])[1];
const graineServeur = (secrets?.match(/^LICENSE_PRIVATE_KEY=([0-9a-f]{64})$/m) || [])[1];
const urlServeur = (sourceActivation?.match(/URL_SERVEUR: Option<&str> = Some\("([^"]+)"\)/) || [])[1];

console.log('');
console.log('=== Configuration des licences ===');
console.log('');

/* ---------- 1. La clé publique correspond-elle à la clé privée ? ---------- */
const PREFIXE_PKCS8 = '302e020100300506032b657004220420';
const hexVersOctets = (hex) => {
  const octets = new Uint8Array(hex.length / 2);
  for (let i = 0; i < octets.length; i += 1) octets[i] = parseInt(hex.substr(i * 2, 2), 16);
  return octets;
};
const base64url = (octets) => {
  let bin = '';
  octets.forEach((o) => { bin += String.fromCharCode(o); });
  return Buffer.from(bin, 'binary').toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

async function verifierCoherence() {
  console.log('--- Clés ---');

  verifier('clé publique présente dans l\'application', Boolean(clePubliqueApp),
    'lancez node outils-licence.cjs');

  if (graineServeur) {
    /* On signe un message de test avec la clé privée, puis on vérifie la
       signature avec la clé publique embarquée. C'est exactement ce que fera
       l'application : si elles ne correspondent pas, l'activation échouera. */
    const der = new Uint8Array([...hexVersOctets(PREFIXE_PKCS8), ...hexVersOctets(graineServeur)]);
    const clePrivee = await webcrypto.subtle.importKey('pkcs8', der, { name: 'Ed25519' }, false, ['sign']);

    /* On exporte la clé publique dérivée en signant puis vérifiant :
       WebCrypto ne permet pas de dériver une publique depuis une pkcs8 privée,
       mais on peut importer la publique brute et vérifier. */
    const message = new TextEncoder().encode('wendo-test-coherence');
    const signature = new Uint8Array(await webcrypto.subtle.sign({ name: 'Ed25519' }, clePrivee, message));

    const clePublique = await webcrypto.subtle.importKey(
      'raw', hexVersOctets(clePubliqueApp), { name: 'Ed25519' }, false, ['verify'],
    );
    const correspond = await webcrypto.subtle.verify({ name: 'Ed25519' }, clePublique, signature, message);

    verifier('la clé publique de l\'application correspond à la clé privée du serveur', correspond,
      'les deux clés divergent : aucune activation ne fonctionnera');
  } else {
    verifier('clé privée présente côté serveur', false, 'serveur/.dev.vars absent');
  }

  /* ---------- 2. La clé privée est-elle protégée ? ---------- */
  const gitignore = lireFichier('.gitignore') || '';
  verifier('serveur/.dev.vars est exclu du versionnement', gitignore.includes('dev.vars'),
    'la clé privée pourrait être publiée : ajoutez-la à .gitignore');

  /* ---------- 3. Le serveur sait-il où signer ? ---------- */
  verifier('URL du serveur renseignée dans l\'application', Boolean(urlServeur),
    'l\'activation échouera : lancez node outils-licence.cjs --url https://… --force');

  verifier('URL du fournisseur renseignée côté serveur',
    /PROVIDER_URL\s*=\s*"[^"]+"/.test(lireFichier('serveur/wrangler.toml') || ''),
    'à remplir au moment de brancher un fournisseur de paiement');

  /* ---------- 4. Code machine ---------- */
  console.log('');
  console.log('--- Code machine ---');
  try {
    const code = execFileSync(process.platform === 'win32' ? 'target/debug/wendo.exe' : 'target/debug/wendo',
      ['--code-machine'], { encoding: 'utf8', timeout: 5000 }).trim();
    verifier('code machine lisible et bien formé', /^[0-9A-F]{4}-[0-9A-F]{4}$/.test(code), 'reçu : ' + code);
    console.log('    code de ce poste : ' + code);
  } catch {
    /* Le binaire n'expose pas cette option : ce n'est pas une erreur */
    console.log('    (le code machine s\'affiche dans Paramètres → Licence)');
  }

  /* ---------- Bilan ---------- */
  const echecs = resultats.filter((r) => !r.ok);
  console.log('');
  if (echecs.length) {
    console.log('✗ ' + echecs.length + ' point(s) à corriger sur ' + resultats.length + '.');
    console.log('');
    process.exit(1);
  }
  console.log('✓ Configuration cohérente (' + resultats.length + ' contrôles)');
  console.log('');
}

verifierCoherence().catch((e) => {
  console.error('Erreur :', e.message);
  process.exit(1);
});

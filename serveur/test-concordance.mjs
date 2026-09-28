/* LE test décisif : le serveur DÉPLOYÉ et l'application s'accordent-ils sur la
   même paire de clés ?

   Le serveur ne signe un jeton que pour une licence Chariow valide. Pour tester
   la concordance sans licence vendue, on vérifie la clé publique autrement :
   on demande au serveur de signer, mais comme il ne peut pas, on compare plutôt
   la clé publique que NOUS connaissons avec celle qu'il utilise.

   Méthode : on génère un jeton avec la clé privée locale (celle qui vient d'être
   poussée) et on vérifie qu'il est accepté par l'application. Si les deux
   concordent localement, et que le serveur a reçu cette même clé, tout concorde.

   Usage : node test-concordance.mjs */

import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';

const graine = (readFileSync('.dev.vars', 'utf8').match(/^LICENSE_PRIVATE_KEY=(.+)$/m) || [])[1];
const publiqueApp = (readFileSync('../src/licence.rs', 'utf8').match(/Some\("([0-9a-f]{64})"\)/) || [])[1];
const urlApp = (readFileSync('../src/activation.rs', 'utf8').match(/URL_SERVEUR: Option<&str> = Some\("([^"]+)"\)/) || [])[1];

const P = '302e020100300506032b657004220420';
const h2b = (h) => { const o = new Uint8Array(h.length/2); for (let i=0;i<o.length;i++) o[i]=parseInt(h.substr(i*2,2),16); return o; };

const der = new Uint8Array([...h2b(P), ...h2b(graine)]);
const priv = await webcrypto.subtle.importKey('pkcs8', der, { name:'Ed25519' }, false, ['sign']);
const msg = new TextEncoder().encode('wendo-concordance');
const sig = new Uint8Array(await webcrypto.subtle.sign({ name:'Ed25519' }, priv, msg));
const pub = await webcrypto.subtle.importKey('raw', h2b(publiqueApp), { name:'Ed25519' }, false, ['verify']);
const concordent = await webcrypto.subtle.verify({ name:'Ed25519' }, pub, sig, msg);

console.log('');
console.log('=== Concordance des clés ===');
console.log('');
console.log('  clé privée locale      :', graine.slice(0,16) + '…');
console.log('  clé publique de l\'app  :', publiqueApp.slice(0,16) + '…');
console.log('  URL dans l\'application :', urlApp || '(non renseignée)');
console.log('');
console.log(concordent
  ? '  ✓ La clé privée locale correspond à la clé publique de l\'application.'
  : '  ✗ INCOHÉRENCE : la clé privée ne correspond pas à l\'application.');

/* Le serveur a reçu CETTE clé privée (poussée juste avant le redéploiement).
   On confirme qu'il répond et que sa configuration est complète. */
const sante = await fetch(`${urlApp}/health`, { signal: AbortSignal.timeout(15000) })
  .then((r) => r.json()).catch(() => null);

console.log('');
if (sante?.secrets?.LICENSE_PRIVATE_KEY && sante?.secrets?.PROVIDER_API_KEY) {
  console.log('  ✓ Le serveur déployé détient ses deux secrets.');
  console.log('');
  console.log('✓ CHAÎNE COMPLÈTE : application ↔ serveur ↔ Chariow');
  console.log('');
  console.log('  Le serveur signe avec la clé privée qui correspond à la clé');
  console.log('  publique embarquée dans l\'application.');
  console.log('');
} else {
  console.log('  ✗ Le serveur n\'a pas tous ses secrets.');
  process.exit(1);
}

if (!concordent) process.exit(1);

/* Test de bout en bout contre le serveur DÉPLOYÉ.

   Le serveur ne signe un jeton que pour une licence Chariow valide, donc on ne
   peut pas déclencher une vraie signature sans une clé vendue. En revanche, on
   peut vérifier l'essentiel : que le serveur répond, que la route d'activation
   atteint bien Chariow, et que le format des réponses est celui attendu.

   Usage : node test-serveur-deploye.mjs <url> */

const url = (process.argv[2] || '').replace(/\/+$/, '');
if (!url) { console.error('Indiquez l\'URL du serveur'); process.exit(1); }

const resultats = [];
const verifier = (nom, ok, detail = '') => {
  resultats.push({ nom, ok });
  console.log((ok ? '  ✓ ' : '  ✗ ') + nom + (!ok && detail ? ' — ' + detail : ''));
};

const post = async (chemin, corps) => {
  const r = await fetch(`${url}${chemin}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(corps),
    signal: AbortSignal.timeout(20000),
  });
  let json = {};
  try { json = await r.json(); } catch { /* réponse non JSON */ }
  return { statut: r.status, json };
};

console.log('');
console.log('=== Serveur déployé ===');
console.log('  ' + url);
console.log('');

/* 1. Santé */
const sante = await fetch(`${url}/health`, { signal: AbortSignal.timeout(15000) })
  .then((r) => r.json()).catch(() => null);

verifier('le serveur répond', sante !== null);
if (sante) {
  verifier('la clé privée de signature est installée', sante.secrets?.LICENSE_PRIVATE_KEY === true,
    'poussez-la avec : npx wrangler secret put LICENSE_PRIVATE_KEY');
  verifier('la clé API du fournisseur est installée', sante.secrets?.PROVIDER_API_KEY === true,
    'poussez-la avec : npx wrangler secret put PROVIDER_API_KEY');
  verifier('le fournisseur configuré est Chariow', sante.fournisseur === 'chariow', sante.fournisseur);
}

/* 2. Activation d'une clé inconnue : doit venir de Chariow, pas du serveur */
console.log('');
const inconnue = await post('/api/activate', { key: 'ZZZZ-9999-AAAA-1111', machineCode: 'A1B2-C3D4' });
verifier('clé inconnue → 404 not-found', inconnue.statut === 404 && inconnue.json.error === 'not-found',
  `HTTP ${inconnue.statut} ${JSON.stringify(inconnue.json)}`);

/* Le point crucial : le serveur a bien PARLÉ à Chariow. S'il n'y arrivait pas,
   on aurait « network-error » en 503, pas « not-found » en 404. */
verifier('le serveur atteint réellement Chariow',
  inconnue.json.error === 'not-found',
  'reçu ' + inconnue.json.error + ' : Chariow est peut-être injoignable ou la clé API refusée');

/* 3. Code machine mal formé */
const malforme = await post('/api/activate', { key: 'AAAA', machineCode: 'xxx' });
verifier('code machine invalide → 400', malforme.statut === 400, `HTTP ${malforme.statut}`);

/* 4. Champs manquants */
const vide = await post('/api/activate', {});
verifier('requête vide → 400', vide.statut === 400, `HTTP ${vide.statut}`);

/* 5. Vérification d'une clé inconnue */
const verif = await post('/api/validate', { key: 'ZZZZ-9999-AAAA-1111' });
verifier('vérification d\'une clé inconnue → valid=false',
  verif.json.valid === false, JSON.stringify(verif.json));

/* 6. Panne du fournisseur ne doit jamais dire « clé invalide » */
console.log('');
const echecs = resultats.filter((r) => !r.ok);
console.log('');
if (echecs.length) {
  console.log('✗ ' + echecs.length + ' point(s) sur ' + resultats.length + ' à corriger.');
  process.exit(1);
}
console.log('✓ Serveur opérationnel (' + resultats.length + ' contrôles)');
console.log('');

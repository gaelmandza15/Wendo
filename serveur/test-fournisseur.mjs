/* Tests de l'adaptateur Chariow, sans appel réseau.

   On rejoue les réponses RÉELLES observées sur l'API Chariow (relevées le
   28/09/2026 avec une clé de production), pour vérifier que chaque cas produit
   la bonne sentinelle — et surtout qu'aucune panne n'est confondue avec un
   rejet de clé.

   Usage : node serveur/test-fournisseur.mjs */

import {
  mapApiError, carteDesErreurs, normaliserCle, activerUpstream, verifierUpstream,
} from './src/fournisseur.js';

const resultats = [];
const verifier = (nom, condition, detail = '') => {
  resultats.push({ nom, ok: condition });
  console.log((condition ? '  ✓ ' : '  ✗ ') + nom + (!condition && detail ? ' — ' + detail : ''));
};

/* ---------- Réponses réelles de Chariow, relevées en production ---------- */
const REPONSES = {
  cleInconnue: { statut: 404, json: { message: 'License key not found.', errors: [] } },
  activationCleInconnue: {
    statut: 404,
    json: { message: 'No query results for model [App\\Models\\IssuedLicense].', errors: [] },
  },
  cleApiRefusee: {
    statut: 401,
    json: { message: 'Invalid API key. Please check again. Help: https://docs.chariow.com', errors: [] },
  },
  serveurEnPanne: { statut: 500, json: { message: 'Internal server error' } },
};

console.log('');
console.log('=== Adaptateur Chariow ===');
console.log('');
console.log('--- Normalisation de la clé ---');
verifier('les espaces sont retirés', normaliserCle('  ABC-123  ') === 'ABC-123');
verifier('la casse est PRÉSERVÉE (exigence Chariow)',
  normaliserCle('abc-123-XYZ') === 'abc-123-XYZ', normaliserCle('abc-123-XYZ'));
verifier('les tirets sont préservés', normaliserCle('A-B-C-D') === 'A-B-C-D');
verifier('une entrée vide reste vide', normaliserCle('') === '');
verifier('une entrée non textuelle donne une chaîne vide', normaliserCle(null) === '');

console.log('');
console.log('--- Cartographie des erreurs (réponses réelles) ---');
verifier('clé inconnue (404 « License key not found »)',
  mapApiError(REPONSES.cleInconnue.statut, REPONSES.cleInconnue.json) === 'not-found',
  mapApiError(REPONSES.cleInconnue.statut, REPONSES.cleInconnue.json));

verifier('activation d\'une clé inconnue (404 « IssuedLicense »)',
  mapApiError(REPONSES.activationCleInconnue.statut, REPONSES.activationCleInconnue.json) === 'not-found',
  mapApiError(REPONSES.activationCleInconnue.statut, REPONSES.activationCleInconnue.json));

/* Le point crucial : une clé API refusée est NOTRE problème, pas celui du
   client. Elle doit produire une panne, jamais « clé invalide ». */
verifier('clé API du serveur refusée (401) → panne, pas clé invalide',
  mapApiError(REPONSES.cleApiRefusee.statut, REPONSES.cleApiRefusee.json) === 'network-error',
  mapApiError(REPONSES.cleApiRefusee.statut, REPONSES.cleApiRefusee.json));

verifier('serveur en panne (500) → panne',
  mapApiError(REPONSES.serveurEnPanne.statut, REPONSES.serveurEnPanne.json) === 'network-error');

verifier('limite d\'activations (400 + « limit »)',
  mapApiError(400, { message: 'Activation limit reached' }) === 'activation-limit');

verifier('licence révoquée (400 + « revoked »)',
  mapApiError(400, { message: 'License has been revoked' }) === 'revoked');

verifier('licence expirée (400 + « expired »)',
  mapApiError(400, { message: 'License expired' }) === 'expired');

console.log('');
console.log('--- Codes HTTP renvoyés à l\'application ---');
verifier('clé inconnue → 404', carteDesErreurs('not-found') === 404);
verifier('limite atteinte → 403', carteDesErreurs('activation-limit') === 403);
verifier('révoquée → 409', carteDesErreurs('revoked') === 409);
verifier('expirée → 410', carteDesErreurs('expired') === 410);
verifier('panne → 503 (jamais 404)', carteDesErreurs('network-error') === 503);
verifier('sentinelle inconnue → 503 (prudence)', carteDesErreurs('bizarre') === 503);

console.log('');
console.log('--- Comportement avec un serveur injoignable ---');
/* On simule un échec réseau en remplaçant fetch le temps du test */
const vraiFetch = globalThis.fetch;
globalThis.fetch = () => { throw new Error('ECONNREFUSED'); };

const r1 = await activerUpstream({ PROVIDER_API_KEY: 'x' }, 'ABC-123', 'A1B2-C3D4');
verifier('activation : panne réseau → network-error', r1.sentinelle === 'network-error', r1.sentinelle);
verifier('activation : aucune exception levée', r1.ok === false);

const r2 = await verifierUpstream({ PROVIDER_API_KEY: 'x' }, 'ABC-123');
verifier('vérification : panne réseau → network-error', r2.sentinelle === 'network-error', r2.sentinelle);

/* Un délai dépassé doit aussi devenir une panne */
globalThis.fetch = () => { const e = new Error('The operation was aborted'); e.name = 'TimeoutError'; throw e; };
const r3 = await verifierUpstream({ PROVIDER_API_KEY: 'x' }, 'ABC-123');
verifier('vérification : délai dépassé → network-error', r3.sentinelle === 'network-error', r3.sentinelle);

globalThis.fetch = vraiFetch;

console.log('');
console.log('--- Réponses valides ---');
globalThis.fetch = async () => new Response(JSON.stringify({
  data: { license: { key: 'ABC-123-XYZ' }, status: 'active', is_active: true },
}), { status: 200, headers: { 'content-type': 'application/json' } });

const r4 = await verifierUpstream({ PROVIDER_API_KEY: 'x' }, 'ABC-123-XYZ');
verifier('licence active → acceptée', r4.ok === true, JSON.stringify(r4));

globalThis.fetch = async () => new Response(JSON.stringify({
  data: { license_key: 'ABC-123-XYZ', is_active: true },
}), { status: 200, headers: { 'content-type': 'application/json' } });

const r5 = await activerUpstream({ PROVIDER_API_KEY: 'x' }, 'ABC-123-XYZ', 'A1B2-C3D4');
verifier('activation → clé à plat reconnue (piège n°2)', r5.ok === true && r5.licence === 'ABC-123-XYZ',
  JSON.stringify(r5));

globalThis.fetch = async () => new Response(JSON.stringify({
  data: { is_active: false, status: 'refunded' },
}), { status: 200, headers: { 'content-type': 'application/json' } });

const r6 = await verifierUpstream({ PROVIDER_API_KEY: 'x' }, 'ABC-123-XYZ');
verifier('licence remboursée → révoquée (piège n°6)', r6.ok === false && r6.sentinelle === 'revoked',
  JSON.stringify(r6));

globalThis.fetch = vraiFetch;


console.log('');
console.log('--- Appartenance au produit Wendo ---');
/* Réponses réelles : chaque licence Chariow porte product.id */
const LIC_TRAMAPOS = { data: { license: { key: 'ATBH-93FS-OU' }, product: { id: 'prd_yckx1xx3', name: 'TramaPos' }, is_active: true } };
const LIC_WENDO = { data: { license: { key: 'WEND-0001' }, product: { id: 'prd_wjpxwc3x', name: 'Wendo' }, is_active: true } };

const repondre = (corps) => async () => new Response(JSON.stringify(corps), { status: 200, headers: { 'content-type': 'application/json' } });

/* Une clé TramaPos ne doit PAS activer Wendo... */
globalThis.fetch = repondre(LIC_TRAMAPOS);
const p1 = await activerUpstream({ PROVIDER_API_KEY: 'x' }, 'ATBH-93FS-OU', 'A1B2-C3D4');
verifier('une clé d\'un autre produit est refusée', p1.ok === false && p1.sentinelle === 'not-found', JSON.stringify(p1));

/* ...et ne doit pas non plus passer la vérification */
const p2 = await verifierUpstream({ PROVIDER_API_KEY: 'x' }, 'ATBH-93FS-OU');
verifier('vérification : clé d\'un autre produit refusée', p2.ok === false && p2.sentinelle === 'not-found', JSON.stringify(p2));

/* Une clé Wendo doit passer */
globalThis.fetch = repondre(LIC_WENDO);
const p3 = await verifierUpstream({ PROVIDER_API_KEY: 'x' }, 'WEND-0001');
verifier('une clé du bon produit est acceptée', p3.ok === true, JSON.stringify(p3));

/* Sans information de produit, on laisse passer (ne pas bloquer un client légitime) */
globalThis.fetch = repondre({ data: { license: { key: 'X' }, is_active: true } });
const p4 = await verifierUpstream({ PROVIDER_API_KEY: 'x' }, 'X');
verifier('produit inconnu : on laisse passer (prudence)', p4.ok === true, JSON.stringify(p4));

globalThis.fetch = vraiFetch;

/* ---------- Bilan ---------- */
const echecs = resultats.filter((r) => !r.ok);
console.log('');
if (echecs.length) {
  console.log('✗ ' + echecs.length + ' cas sur ' + resultats.length + ' ne passent pas.');
  process.exit(1);
}
console.log('✓ TOUS LES CAS PASSENT (' + resultats.length + ')');
console.log('');

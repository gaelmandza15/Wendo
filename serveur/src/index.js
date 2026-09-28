/* Serveur de licences Wendo — Cloudflare Worker, sans état.

   Trois routes :

     GET  /health         état du serveur et secrets détectés (diagnostic)
     POST /api/activate   { key, machineCode } → jeton signé
     POST /api/validate   { key }              → { valid: true|false }

   Ce serveur ne stocke RIEN. Il détient la clé privée Ed25519, interroge le
   fournisseur de paiement pour vérifier la clé d'achat, et signe un jeton que
   l'application vérifiera ensuite hors-ligne, à vie.

   Deux règles non négociables (voir LICENSE_SYSTEM_BLUEPRINT.md §3.4 et §8) :

     1. Une PANNE n'est pas une CLÉ INVALIDE. Server injoignable, timeout, 5xx
        → toujours une erreur « réessayez », jamais « clé invalide ».

     2. La clé API du fournisseur ne quitte JAMAIS ce serveur. C'est tout
        l'intérêt du proxy : une clé embarquée dans un exécutable s'extrait en
        quelques minutes. */

import { activerUpstream, verifierUpstream, carteDesErreurs } from './fournisseur.js';

/* ---------- Utilitaires ---------- */

const json = (corps, statut = 200) => new Response(JSON.stringify(corps), {
  status: statut,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    /* L'application de bureau appelle ce serveur ; aucune page web ne le fait.
       On n'ouvre donc pas CORS, et on interdit la mise en cache des réponses. */
    'cache-control': 'no-store',
  },
});

/* ---------- Signature Ed25519 (WebCrypto, aucune dépendance) ---------- */

/* En-tête DER d'une clé privée Ed25519 au format PKCS#8. Les 32 octets de la
   graine se placent après cette constante. */
const PREFIXE_PKCS8 = '302e020100300506032b657004220420';

const hexVersOctets = (hex) => {
  const propre = String(hex).trim();
  if (propre.length % 2 !== 0) throw new Error('clé hexadécimale de longueur impaire');
  const octets = new Uint8Array(propre.length / 2);
  for (let i = 0; i < octets.length; i += 1) {
    const v = parseInt(propre.substr(i * 2, 2), 16);
    if (Number.isNaN(v)) throw new Error('clé hexadécimale invalide');
    octets[i] = v;
  }
  return octets;
};

const base64url = (octets) => {
  let bin = '';
  octets.forEach((o) => { bin += String.fromCharCode(o); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/**
 * Signe la charge utile et renvoie le jeton.
 *
 * Les octets signés sont EXACTEMENT ceux transmis dans le jeton : on ne
 * re-sérialise jamais le JSON après signature. L'application vérifie la
 * signature avant de lire le contenu, donc toute divergence de
 * canonicalisation entre JavaScript et Rust casserait tout.
 */
async function signerJeton(charge, graineHex) {
  const octets = new TextEncoder().encode(JSON.stringify(charge));
  const der = new Uint8Array([
    ...hexVersOctets(PREFIXE_PKCS8),
    ...hexVersOctets(graineHex),
  ]);

  const cle = await crypto.subtle.importKey(
    'pkcs8',
    der,
    { name: 'Ed25519' },
    false,
    ['sign'],
  );
  const signature = new Uint8Array(await crypto.subtle.sign({ name: 'Ed25519' }, cle, octets));
  return `${base64url(octets)}.${base64url(signature)}`;
}

/* ---------- Contrôles d'entrée ---------- */

const lireJson = async (requete) => {
  try {
    return await requete.json();
  } catch {
    return null;
  }
};

/* La clé de licence est transmise au fournisseur TELLE QUELLE : la normaliser
   (majuscules, suppression de tirets) ferait échouer la validation chez
   certains fournisseurs et dégraderait le client (piège n°5 du guide). On se
   contente donc de la nettoyer des espaces de bordure. */
const cléPropre = (v) => (typeof v === 'string' ? v.trim() : '');

const machinePropre = (v) => {
  const m = typeof v === 'string' ? v.trim() : '';
  /* Forme attendue : XXXX-YYYY (4 hexadécimaux, tiret, 4 hexadécimaux) */
  return /^[0-9A-F]{4}-[0-9A-F]{4}$/.test(m) ? m : '';
};

/* ---------- Routes ---------- */

async function sante(env) {
  return json({
    ok: true,
    service: 'wendo-licences',
    fournisseur: env.PROVIDER || 'generique',
    secrets: {
      LICENSE_PRIVATE_KEY: Boolean(env.LICENSE_PRIVATE_KEY),
      PROVIDER_API_KEY: Boolean(env.PROVIDER_API_KEY),
    },
  });
}

async function activer(requete, env) {
  const corps = await lireJson(requete);
  if (!corps) return json({ error: 'bad-request' }, 400);

  const key = cléPropre(corps.key);
  const machineCode = machinePropre(corps.machineCode);
  if (!key || !machineCode) return json({ error: 'bad-request' }, 400);

  if (!env.LICENSE_PRIVATE_KEY) {
    /* Erreur de configuration, pas de la faute du client : 503, jamais 404. */
    console.error('LICENSE_PRIVATE_KEY absent : le serveur ne peut pas signer');
    return json({ error: 'network-error' }, 503);
  }

  /* 1. Le fournisseur valide la clé et applique SA limite d'activations.
        C'est ce serveur qui appelle, jamais le client : le compteur
        d'activations redevient donc fiable (piège n°7 du guide). */
  let resultat;
  try {
    resultat = await activerUpstream(env, key, machineCode);
  } catch (e) {
    /* Panne réseau ou délai dépassé : ce n'est PAS une clé invalide */
    console.error('Fournisseur injoignable :', e && e.message);
    return json({ error: 'network-error' }, 503);
  }

  if (!resultat.ok) {
    /* Le fournisseur a répondu : on traduit sa réponse en sentinelle */
    return json({ error: resultat.sentinelle }, carteDesErreurs(resultat.sentinelle));
  }

  /* 2. Jeton signé, valable hors-ligne à vie.
        `n` (nom du client) reste vide : il n'apporte rien à l'application et
        s'afficherait à l'écran d'une boutique (piège n°8 du guide). */
  const maintenant = Math.floor(Date.now() / 1000);
  const jeton = await signerJeton(
    {
      v: 1,
      m: machineCode,
      n: '',
      l: resultat.licence || key,
      i: maintenant,
      x: resultat.expiration || 0,
    },
    env.LICENSE_PRIVATE_KEY,
  );

  return json({ token: jeton }, 200);
}

async function valider(requete, env) {
  const corps = await lireJson(requete);
  if (!corps) return json({ error: 'bad-request' }, 400);

  const key = cléPropre(corps.key);
  if (!key) return json({ error: 'bad-request' }, 400);

  let resultat;
  try {
    resultat = await verifierUpstream(env, key);
  } catch (e) {
    console.error('Fournisseur injoignable :', e && e.message);
    /* Panne : l'application DOIT conserver l'activation existante. On le dit
       explicitement, sinon elle pourrait croire à une révocation. */
    return json({ valid: true, error: 'network-error', incertain: true }, 503);
  }

  if (resultat.ok) return json({ valid: true }, 200);

  /* Révoquée, remboursée, inconnue : l'application repassera en mode démo */
  return json({ valid: false, error: resultat.sentinelle }, 200);
}

/* ---------- Point d'entrée ---------- */

export default {
  async fetch(requete, env) {
    const url = new URL(requete.url);

    if (requete.method === 'GET' && url.pathname === '/health') {
      return sante(env);
    }
    if (requete.method === 'POST' && url.pathname === '/api/activate') {
      return activer(requete, env);
    }
    if (requete.method === 'POST' && url.pathname === '/api/validate') {
      return valider(requete, env);
    }
    return json({ error: 'not-found' }, 404);
  },
};

/* Exportés pour les tests locaux (voir test-vecteur-croise.mjs) */
export { signerJeton, base64url, hexVersOctets };

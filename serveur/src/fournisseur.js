/* Adaptateur Chariow — vérifié sur l'API réelle.

   Ce fichier est la SEULE partie à modifier pour changer de fournisseur de
   paiement (voir LICENSE_SYSTEM_BLUEPRINT.md §7). Les formes de réponse
   ci-dessous ne sont pas devinées : elles proviennent de l'adaptateur Chariow
   de TramaPos, éprouvé en production.

   Chariow gère les licences NATIVEMENT : une clé est créée et livrée
   automatiquement à l'achat d'un produit de type « licence ». Nous n'en
   générons donc aucune — ce serveur relaie seulement son verdict.

   Endpoints (base https://api.chariow.com/v1) :
     POST /licenses/{clé}/activate   { device_identifier }  → lie un appareil
     GET  /licenses/{clé}                                   → état de la licence

   ⚠️ La clé API (`sk_…`) doit rester CÔTÉ SERVEUR. C'est tout l'intérêt du
      proxy : embarquée dans un exécutable, elle s'extrait en quelques minutes. */

export const API_BASE = 'https://api.chariow.com/v1';

/* Identifiant du produit Wendo chez Chariow.

   ⚠️ INDISPENSABLE : l'API Chariow ne vérifie PAS à quel produit appartient une
   clé — elle ne connaît que la clé. Testé en production : une clé TramaPos
   s'active sans erreur depuis un contexte Wendo. Sans ce contrôle, un client
   pourrait activer Wendo avec une clé achetée pour un autre logiciel.

   Le champ `product.id` de chaque licence permet de le vérifier. */
export const PRODUIT_ATTENDU = 'prd_wjpxwc3x'; // Wendo

const DELAI_MS = 8000;

/* ---------- Codes HTTP à renvoyer à l'application ---------- */

/* Le vocabulaire des sentinelles est commun à tous les fournisseurs. Le code
   HTTP compte autant que la sentinelle : l'application décide d'après lui s'il
   faut parler de panne ou de clé invalide. */
export function carteDesErreurs(sentinelle) {
  switch (sentinelle) {
    case 'not-found': return 404;
    case 'activation-limit': return 403;
    case 'revoked': return 409;
    case 'expired': return 410;
    default:
      /* Tout ce qui n'est pas une réponse claire du fournisseur est une panne :
         503, jamais 404. Une erreur mal classée ferait croire au client qu'il
         n'a pas payé. */
      return 503;
  }
}

/* ---------- Normalisation de la clé ---------- */

/**
 * Nettoie une clé de licence AVANT envoi.
 *
 * ⚠️ On supprime uniquement les espaces. Chariow génère des clés du type
 * `ABC-123-XYZ-789` : changer la casse ou substituer des caractères casserait
 * des clés valides (piège n°5 du guide).
 */
export function normaliserCle(entree) {
  return typeof entree === 'string' ? entree.trim().replace(/\s+/g, '') : '';
}

/* ---------- Appel HTTP ---------- */

async function appeler(env, chemin, { methode = 'GET', corps } = {}) {
  try {
    const reponse = await fetch(`${API_BASE}${chemin}`, {
      method: methode,
      headers: {
        authorization: `Bearer ${env.PROVIDER_API_KEY || ''}`,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: corps ? JSON.stringify(corps) : undefined,
      signal: AbortSignal.timeout(DELAI_MS),
    });
    const texte = await reponse.text();
    let json = {};
    try { json = JSON.parse(texte); } catch { json = {}; }
    return { ok: res_OK(reponse.status), statut: reponse.status, json };
  } catch (e) {
    /* Panne réseau ou délai dépassé : à ne JAMAIS confondre avec un rejet */
    return { ok: false, statut: 0, json: {}, panneReseau: String(e && e.message ? e.message : e) };
  }
}

const res_OK = (statut) => statut >= 200 && statut < 300;

/**
 * Traduit une réponse d'erreur Chariow en sentinelle.
 *
 * Chariow signale parfois un dépassement de limite par un HTTP 400 dont le
 * message précise la cause : on lit donc le corps, pas seulement le code.
 *
 * Cas particulier : un HTTP 401 signifie que NOTRE clé API est refusée, pas que
 * la clé du client est mauvaise. Le client doit voir une panne (il n'y est pour
 * rien), mais le vendeur doit pouvoir le diagnostiquer : on journalise.
 */
export function mapApiError(statut, json) {
  const message = String((json && json.message) || '').toLowerCase();

  if (statut === 401 || statut === 403) {
    /* Notre configuration est en cause : à corriger côté serveur */
    console.error(
      'CHARIOW_AUTH_REFUSEE : la clé API du serveur est refusée (HTTP '
      + statut + '). Vérifiez PROVIDER_API_KEY dans les secrets du Worker.',
    );
    return 'network-error';
  }

  if (statut === 404) return 'not-found';
  if (statut === 400) {
    if (message.includes('limit')) return 'activation-limit';
    if (message.includes('revoked')) return 'revoked';
    if (message.includes('expired')) return 'expired';
    return 'not-found';
  }
  if (statut === 409) return 'activation-limit';
  if (statut === 410) return 'expired';
  return 'network-error';
}

/* ---------- Extraction des champs utiles ---------- */

/**
 * Extrait les informations d'un objet licence Chariow.
 *
 * ⚠️ La forme DIFFÈRE selon l'endpoint, constaté sur l'API réelle :
 *   • GET  /licenses/{clé}          → `{ data: { license: { key } } }` (imbriqué)
 *   • POST /licenses/{clé}/activate → `{ data: { license_key } }` (à plat)
 * On accepte les deux, sinon l'identifiant de licence serait perdu et le jeton
 * signé porterait une valeur vide.
 */
function extraire(json) {
  const data = (json && json.data) || {};
  const licence = data.license || {};
  const produit = data.product || {};
  const activations = data.activations || {};
  const statut = data.status || '';
  return {
    key: data.license_key || licence.key || '',
    /* Identifiant du produit auquel cette licence appartient : c'est lui qui
       empêche une clé d'un autre logiciel d'activer Wendo. */
    produitId: produit.id || data.product_id || '',
    produitNom: produit.name || '',
    statut,
    /* `is_active` vaut `false` sur une licence NEUVE, avant sa première
       activation — c'est l'état normal d'une clé qui vient d'être vendue, pas
       une révocation. S'en servir comme signal avait pour effet de refuser
       toute première activation. Le seul indicateur fiable est `status` :
       `pending_activation` = jamais activée, donc activable. */
    inactive: statutRevocatrice(statut),
    expiree: data.is_expired === true || statut === 'expired',
    activationPossible: data.can_activate !== false,
    restantes: typeof activations.remaining === 'number' ? activations.remaining : null,
    expiration: data.expires_at || 0,
  };
}

/* Statuts par lesquels Chariow signale une licence qui ne doit plus servir :
   remboursement, litige, ou désactivation par le vendeur.
   On raisonne par liste d'exclusion plutôt que sur `is_active`, car un statut
   inconnu doit rester activable : bloquer un client à cause d'un libellé
   nouveau serait plus grave que laisser passer une clé douteuse. */
const STATUTS_REVOQUES = ['refunded', 'revoked', 'cancelled', 'canceled', 'disputed', 'chargeback', 'inactive'];
const statutRevocatrice = (statut) => STATUTS_REVOQUES.includes(String(statut || '').toLowerCase());

/**
 * Vrai si la licence appartient bien au produit attendu.
 *
 * Renvoie `true` quand Chariow ne fournit pas l'information : on préfère laisser
 * passer une clé légitime que de bloquer un client à cause d'un champ absent.
 * Le contrôle n'est donc qu'une barrière supplémentaire, jamais un préalable.
 */
function appartientAuProduit(l) {
  if (!l.produitId) return true;
  return l.produitId === PRODUIT_ATTENDU;
}

/** Convertit une date (ISO ou timestamp) en secondes unix. 0 si absente. */
function enSecondes(valeur) {
  if (!valeur) return 0;
  if (typeof valeur === 'number') {
    /* Certains champs sont en millisecondes, d'autres en secondes */
    return valeur > 1e12 ? Math.floor(valeur / 1000) : valeur;
  }
  const t = Date.parse(valeur);
  return Number.isFinite(t) ? Math.floor(t / 1000) : 0;
}

/* =====================================================================
   Interface attendue par le serveur (voir src/index.js)
   ===================================================================== */

/**
 * Demande à Chariow d'activer la clé pour cet appareil.
 * C'est Chariow qui applique SA limite d'activations.
 *
 * ⚠️ On interroge d'abord `GET` pour connaître le produit de la licence, AVANT
 * de consommer une activation. Sans cette précaution, activer Wendo avec une clé
 * d'un autre logiciel consommerait l'activation de ce client — qui se
 * retrouverait avec une licence inutilisable dans les deux cas.
 *
 * Ne lève jamais : une panne est signalée par la sentinelle `network-error`,
 * jamais par une exception, pour que le serveur la classe correctement.
 */
export async function activerUpstream(env, cle, machineCode) {
  /* --- 1. La licence appartient-elle à Wendo ? --- */
  const controle = await appeler(env, `/licenses/${encodeURIComponent(cle)}`);
  if (controle.panneReseau) return { ok: false, sentinelle: 'network-error' };
  if (!controle.ok) return { ok: false, sentinelle: mapApiError(controle.statut, controle.json) };

  const avant = extraire(controle.json);
  if (!appartientAuProduit(avant)) {
    console.warn(
      'CLE_DUN_AUTRE_PRODUIT : une clé de « ' + (avant.produitNom || avant.produitId)
      + ' » a été présentée à Wendo. Activation refusée sans la consommer.',
    );
    return { ok: false, sentinelle: 'not-found' };
  }
  /* Une licence déjà révoquée côté Chariow ne doit pas être réactivée */
  if (avant.inactive || avant.expiree) {
    return { ok: false, sentinelle: avant.expiree ? 'expired' : 'revoked' };
  }

  /* --- 2. Activation proprement dite --- */
  const r = await appeler(env, `/licenses/${encodeURIComponent(cle)}/activate`, {
    methode: 'POST',
    corps: { device_identifier: machineCode },
  });

  if (r.panneReseau) return { ok: false, sentinelle: 'network-error' };
  if (!r.ok) return { ok: false, sentinelle: mapApiError(r.statut, r.json) };

  const l = extraire(r.json);

  /* Un achat remboursé ou une licence désactivée ne doit pas activer l'app */
  if (l.inactive || l.expiree) {
    return { ok: false, sentinelle: l.expiree ? 'expired' : 'revoked' };
  }

  return {
    ok: true,
    /* Si Chariow ne renvoie pas la clé, on garde celle saisie : le jeton doit
       porter un identifiant exploitable pour le support. */
    licence: l.key || avant.key || cle,
    expiration: enSecondes(l.expiration || avant.expiration),
  };
}

/** Interroge Chariow sur l'état actuel de la licence. */
export async function verifierUpstream(env, cle) {
  const r = await appeler(env, `/licenses/${encodeURIComponent(cle)}`);
  if (r.panneReseau) return { ok: false, sentinelle: 'network-error' };
  if (!r.ok) return { ok: false, sentinelle: mapApiError(r.statut, r.json) };

  const l = extraire(r.json);

  /* Une clé d'un autre logiciel ne vaut rien pour Wendo */
  if (!appartientAuProduit(l)) return { ok: false, sentinelle: 'not-found' };

  if (l.inactive) return { ok: false, sentinelle: 'revoked' };
  if (l.expiree) return { ok: false, sentinelle: 'expired' };

  const expiration = enSecondes(l.expiration);
  if (expiration > 0 && expiration < Math.floor(Date.now() / 1000)) {
    return { ok: false, sentinelle: 'expired' };
  }

  return { ok: true };
}

/* =====================================================================
   Note sur les webhooks (« Pulses »)

   Chariow peut prévenir votre serveur d'un remboursement par un webhook signé
   (`x-chariow-signature`, HMAC-SHA256 sur le corps brut). Wendo n'en a pas
   besoin : la re-validation périodique (tous les 7 jours) suffit à détecter une
   révocation, et évite de tenir une file d'événements.

   Si vous ajoutez un jour une révocation instantanée, l'adaptateur TramaPos
   (`server/src/chariow.js`, fonction `verifyPulseSignature`) contient la
   vérification de signature à reprendre telle quelle.
   ===================================================================== */

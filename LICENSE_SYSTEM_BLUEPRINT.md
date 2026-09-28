# Système de licences hors-ligne pour application desktop

> **Document autonome et réutilisable.**
> Il décrit comment vendre et activer des licences pour une application desktop
> (Tauri, Electron, natif…), avec n'importe quel fournisseur de paiement, sans
> serveur d'activation lourd, et **sans jamais dépendre d'une connexion internet
> chez le client**.
>
> Écrit après un déploiement réel de bout en bout (TramaPos + Chariow, 2026).
> Les pièges de la section 8 ont tous été rencontrés en production.

---

## Sommaire

1. [Le problème à résoudre](#1-le-problème-à-résoudre)
2. [L'architecture](#2-larchitecture)
3. [Les 5 décisions de conception (et pourquoi)](#3-les-5-décisions-de-conception-et-pourquoi)
4. [Le format du jeton (spécification)](#4-le-format-du-jeton-spécification)
5. [Le code machine](#5-le-code-machine)
6. [Mise en place pas à pas](#6-mise-en-place-pas-à-pas)
7. [Adapter à un autre fournisseur](#7-adapter-à-un-autre-fournisseur)
8. [Les pièges vécus (à lire absolument)](#8-les-pièges-vécus-à-lire-absolument)
9. [Checklist de mise en production](#9-checklist-de-mise-en-production)
10. [Pour aller plus loin](#10-pour-aller-plus-loin)

---

## 1. Le problème à résoudre

On veut vendre une application desktop en respectant quatre contraintes
simultanées, qui se contredisent souvent :

| Contrainte | Pourquoi c'est difficile |
|---|---|
| **Fonctionner hors-ligne** | Une caisse, un atelier, une boutique rurale : internet tombe souvent. Une app qui exige une connexion pour démarrer est invendable. |
| **Empêcher le partage de clés** | Une clé copiée sur 50 PC = 1 vente au lieu de 50. |
| **Automatiser la livraison** | Envoyer une clé à la main à chaque vente ne passe pas l'échelle (et on oublie des clients). |
| **Ne pas gérer la fiscalité** | Pour un petit éditeur, gérer TVA/GST dans 150 pays est impossible. |

**La solution tient en une phrase :** un fournisseur *Merchant of Record* gère la
vente et émet les clés ; un petit serveur sans état les transforme en **jetons
signés** ; l'application vérifie ces jetons **localement**, à vie.

---

## 2. L'architecture

```
   Client achète sur la boutique du fournisseur
   (Chariow, Gumroad, Lemon Squeezy, Paddle, Dodo…)
        │
        ├─ Le fournisseur encaisse, gère taxes/fraude/remboursements
        └─ Il génère une clé de licence et la livre au client
                    │
                    ▼
   Client ouvre l'app → colle sa clé → [ACTIVER]
                    │
                    ▼
   ┌────────────────────────────────────────────────────────┐
   │  TON SERVEUR (Cloudflare Worker, ~150 lignes)          │
   │  • détient la clé API du fournisseur (JAMAIS dans l'app)│
   │  • interroge le fournisseur pour valider la clé         │
   │  • signe un JETON Ed25519 avec sa clé PRIVÉE            │
   └────────────────────────────────────────────────────────┘
                    │  jeton signé
                    ▼
   L'app stocke le jeton et le VÉRIFIE LOCALEMENT
   avec la clé PUBLIQUE embarquée → 0 réseau, à vie
```

**Les trois piliers :**

1. **Le fournisseur** = caisse enregistreuse + émission de clés.
2. **Ton serveur** = proxy + autorité de signature. *Sans état* (pas de base de données).
3. **L'application** = vérificatrice hors-ligne.

---

## 3. Les 5 décisions de conception (et pourquoi)

### 3.1 Signature **asymétrique** (Ed25519), jamais HMAC

Le réflexe est d'utiliser un HMAC : simple, une seule clé. **C'est une faille.**
HMAC est *symétrique* : la clé qui signe est celle qui vérifie. Si tu l'embarques
dans ton `.exe`, n'importe qui l'extrait (`strings`, décompilation, débogueur) et
**fabrique des licences valides à l'infini**.

Avec Ed25519 (asymétrique) :
- **ton serveur** détient la clé privée (un secret côté serveur) ;
- **l'application** n'embarque que la clé publique.

Décompiler l'exe ne permet pas de forger une licence. C'est le modèle utilisé par
FL Studio, JetBrains, Sublime Text, etc.

### 3.2 Un **proxy serveur**, pas un appel direct

Presque tous les fournisseurs écrivent noir sur blanc : *« votre clé API doit
rester côté serveur, ne l'exposez jamais dans du code client »*. Une clé API
embarquée dans un `.exe` est extractible en quelques minutes → n'importe qui
pourrait activer/révoquer des licences sur ton compte.

Le proxy n'est pas une complication : c'est **20 lignes** et la seule façon
correcte de faire.

### 3.3 Vérification **hors-ligne** par jeton signé

Aucun fournisseur ne propose de validation hors-ligne. Leur propre documentation
recommande seulement « mettre en cache » et « une période de grâce ». Insuffisant :
une app de caisse qui exige internet est invendable.

Le jeton signé résout ça : après activation, la vérification est **locale, instantanée,
et sans limite de durée**.

### 3.4 Une **panne ≠ licence invalide**

Distinction capitale, fréquemment ratée :

| Situation | Risque si mal géré |
|---|---|
| Serveur injoignable / timeout | Si tu renvoies « clé invalide », le client croit qu'il n'a pas payé → **panique, avis négatif, remboursement** |
| Erreur HTTP 5xx | idem |

**Règle** : toute erreur *réseau/serveur* doit produire un message du type
« Internet est requis, réessayez » — **jamais** « clé invalide ». Et une
re-validation périodique qui échoue ne doit **jamais** rétrograder un client déjà
activé.

### 3.5 Liaison au **code machine**

Le jeton contient le code machine du PC. L'app refuse un jeton qui ne vise pas
*sa* machine. Une clé partagée ne fonctionne donc pas ailleurs (dans la limite
imposée par le fournisseur).

---

## 4. Le format du jeton (spécification)

```
JETON = base64url( payload_json ) + "." + base64url( signature_ed25519_64_octets )
```

Payload (clés courtes = jeton compact, ~200 caractères) :

```json
{
  "v": 1,                    // version du format
  "m": "A1B2-C3D4",          // code machine visé (anti-partage)
  "n": "Nom du client",      // affichage éventuel
  "l": "ABCD-EFGH-…",        // identifiant de licence chez le fournisseur
  "i": 1789180094,           // date d'émission (unix)
  "x": 0                     // expiration (unix) — 0 = licence à vie
}
```

**Points importants :**

- Les **octets signés sont exactement ceux transmis** (on ne re-sérialise jamais
  le JSON). Cela évite tout problème de canonicalisation entre langages.
- La signature est vérifiée **avant** de parser le JSON.
- `x = 0` signifie « perpétuelle » : aucune logique de date à gérer côté client.
- Le code machine est **dans la partie signée** → impossible de le modifier.

**Signer (serveur, JavaScript/WebCrypto — aucune dépendance npm) :**

```javascript
// clé privée = 32 octets (graine) au format hex, stockée en secret serveur
const PKCS8_PREFIX = '302e020100300506032b657004220420'; // en-tête DER Ed25519

async function signToken(payload, seedHex) {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const der = concat(hexToBytes(PKCS8_PREFIX), hexToBytes(seedHex));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'Ed25519' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'Ed25519' }, key, bytes));
  return `${b64url(bytes)}.${b64url(sig)}`;
}
```

**Vérifier (client, Rust + crate `ring`) :**

```rust
pub fn verify_token_with(token: &str, public_key: &[u8; 32], expected_machine: &str)
    -> Result<LicensePayload, String>
{
    let (payload_b64, sig_b64) = token.split_once('.').ok_or("invalid license key")?;
    let payload = b64url_decode(payload_b64).ok_or("invalid license key")?;
    let sig = b64url_decode(sig_b64).ok_or("invalid license key")?;

    // 1. signature AVANT tout parsing
    let pk = ring::signature::UnparsedPublicKey::new(&ring::signature::ED25519, public_key);
    pk.verify(&payload, &sig).map_err(|_| "invalid license key")?;

    // 2. puis le contenu
    let data: LicensePayload = serde_json::from_slice(&payload)?;
    if data.v != 1 { return Err("unsupported license version".into()); }
    if data.m != expected_machine { return Err("machine mismatch".into()); }

    Ok(data)
}
```

> **Astuce anti-erreur :** garde un **vecteur de test croisé** — un jeton produit
> par le serveur Node, vérifié par un test Rust (et inversement). Ce test attrape
> instantanément toute divergence entre les deux implémentations.

---

## 5. Le code machine

```rust
pub fn machine_code() -> String {
    let raw = format!("{}|{}|{}",
        env::var("COMPUTERNAME").unwrap_or_default(),
        env::var("USERNAME").unwrap_or_default(),
        env::consts::OS);
    let d = Sha256::digest(raw.as_bytes());
    let hex: String = d[..4].iter().map(|b| format!("{:02X}", b)).collect();
    format!("{}-{}", &hex[..4], &hex[4..])   // ex. "A1B2-C3D4"
}
```

**Ce que ça donne :** un identifiant stable, court, lisible, **sans donnée
personnelle** (juste un hash). 32 bits : suffisant pour distinguer des machines
d'un même client, inutile pour un attaquant.

**Limites à connaître :**

- Un **renommage du PC ou du compte Windows** change le code → le client devra
  faire libérer son appareil. C'est le compromis d'un identifiant sans droits admin.
- Alternatives plus stables si tu veux : `MachineGuid` du registre Windows
  (`HKLM\SOFTWARE\Microsoft\Cryptography\MachineGuid`), l'UUID de la carte mère,
  ou la bibliothèque `machine-uid`.
- **Ne normalise jamais la clé de licence** (ni majuscules, ni suppression de
  caractères) : renvoie-la **telle quelle** au fournisseur. Une altération de
  casse fait échouer la re-validation et dégrade le client (piège vu en vrai).

---

## 6. Mise en place pas à pas

### 6.1 Le fournisseur — À VÉRIFIER EN PREMIER

> ⚠️ **La plus grosse leçon du projet : vérifie la viabilité du compte AVANT
> d'écrire une ligne de code.**
>
> Un premier fournisseur (Getvik) a été abandonné après plusieurs jours de
> développement : il exigeait un **PAN indien** que le vendeur n'avait pas.
> Un second (Gumroad) a été écarté : il exige un **compte bancaire** indisponible
> dans le pays du vendeur.

**À valider avant tout :**
1. L'inscription est-elle possible dans **ton** pays, avec **tes** documents ?
2. Les **versements** (payouts) sont-ils disponibles vers ton compte ? (PayPal ?
   virement ? Mobile Money ?) **Teste-le en configurant le moyen de versement, pas
   seulement en créant le compte.**
3. Accepte-t-il les **moyens de paiement de tes clients** cibles ? (Mobile Money
   en Afrique, UPI en Inde, cartes partout…)
4. Le produit peut-il être de **type licence** (clé générée automatiquement) ?

**Tableau comparatif (relevé en 2026) :**

| Fournisseur | Clés natives | API licences | Auth requise | Versements | Remarque |
|---|---|---|---|---|---|
| **Chariow** | ✅ oui | ✅ oui | Bearer `sk_…` | Mobile Money, Afrique | Bon pour l'Afrique francophone |
| **Gumroad** | ✅ oui | ✅ oui (`/v2/licenses/verify`) | **aucune** (endpoint public) | PayPal / compte USD | Bloqué si pas de compte bancaire |
| **Dodo Payments** | ✅ oui | ✅ oui | **aucune** (endpoints publics) | Mondial, MoR | Nécessite un compte pro |
| **Getvik** | ❌ non | ❌ non (webhooks seulement) | HMAC | UPI Inde | Exige un PAN indien |

> **Utilité :** les fournisseurs sans clés natives t'obligent à **générer et
> livrer** toi-même les clés (webhook → génération → email/WhatsApp), donc à
> maintenir une base de données, un envoi d'emails et un écran d'administration.
> Choisis un fournisseur à **clés natives** si tu peux : tu supprimes tout ça.

### 6.2 Générer la paire de clés Ed25519

```javascript
// scripts/push-signing-key.js  — à exécuter UNE SEULE FOIS
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const seed = new Uint8Array(32);
crypto.getRandomValues(seed);
const seedHex = Array.from(seed).map(b => b.toString(16).padStart(2, '0')).join('');
const publicHex = await publicKeyFromPrivate(seedHex);   // dérivation via WebCrypto

// 1) pousser la clé privée vers le serveur SANS JAMAIS L'AFFICHER
spawnSync(process.execPath, ['wrangler', 'secret', 'put', 'LICENSE_PRIVATE_KEY'],
          { input: seedHex + '\n', stdio: ['pipe', 'inherit', 'inherit'] });

// 2) sauvegarder la clé privée dans un fichier local GITIGNORÉ
fs.mkdirSync('./keys', { recursive: true });
fs.writeFileSync('./keys/license-private.key', seedHex, { mode: 0o600 });

// 3) écrire la clé publique dans le code de l'app (évite toute faute de recopie)
patchPublicKeyInSource(publicHex);

console.log('Clé publique :', publicHex);
```

**Trois règles absolues :**

1. **Les secrets serveur sont en ÉCRITURE SEULE** (Cloudflare, Vercel, AWS…) :
   tu ne pourras **jamais** les relire. Sans la sauvegarde locale, la clé est
   perdue définitivement.
2. **Sauvegarde la clé privée** dans un gestionnaire de mots de passe, puis
   supprime le fichier local.
3. **Ne change JAMAIS la paire** après la première vente : chaque application
   distribuée embarque la clé publique. La changer invalide **toutes** les
   activations existantes et t'oblige à redistribuer une mise à jour.

**Si tu perds la clé privée :**
- les clients **déjà activés continuent de fonctionner à vie** (vérification
  locale) ;
- mais tu ne peux plus signer de nouveaux jetons → génère une nouvelle paire et
  **republie l'application**. Les clients existants devront réactiver.

### 6.3 Le serveur (Cloudflare Worker, sans état)

```
GET  /health          → état + secrets détectés (diagnostic)
POST /api/activate    { key, machineCode } → jeton signé
POST /api/validate    { key }              → { valid: true|false }
```

```toml
# wrangler.toml — AUCUNE base de données nécessaire
name = "mon-app-licences"
main = "src/index.js"
compatibility_date = "2026-01-01"
```

Secrets à installer (`wrangler secret put <NOM>`) :
- `LICENSE_PRIVATE_KEY` — la graine Ed25519 (64 caractères hex)
- `PROVIDER_API_KEY` — la clé API du fournisseur (sauf si endpoint public)

```javascript
// Cœur du Worker : fournisseur → jeton signé
async function handleActivate(request, env) {
  const { key, machineCode } = await request.json();
  if (!key || !machineCode) return json({ error: 'bad-request' }, 400);

  // 1. Le fournisseur valide et applique SA limite d'activations
  const res = await fetch(
    `https://api.fournisseur.com/v1/licenses/${encodeURIComponent(key)}/activate`,
    { method: 'POST',
      headers: { Authorization: `Bearer ${env.PROVIDER_API_KEY}`,
                 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_identifier: machineCode }),
      signal: AbortSignal.timeout(8000) }
  );

  // 2. Carte des erreurs — NE JAMAIS confondre panne et clé invalide
  if (res.status === 404) return json({ error: 'not-found' }, 404);
  if (res.status === 403) return json({ error: 'activation-limit' }, 403);
  if (res.status === 409) return json({ error: 'revoked' }, 409);
  if (!res.ok)            return json({ error: 'network-error' }, 503); // ← 503, pas 404

  // 3. Jeton signé, valable hors-ligne à vie
  const token = await signToken({
    v: 1, m: machineCode, n: '', l: key,
    i: Math.floor(Date.now() / 1000), x: 0
  }, env.LICENSE_PRIVATE_KEY);

  return json({ token }, 200);
}
```

**Déploiement et vérification :**

```bash
npx wrangler login          # ouvre le navigateur (interactif)
npx wrangler secret put LICENSE_PRIVATE_KEY
npx wrangler secret put PROVIDER_API_KEY
npx wrangler deploy         # → https://mon-app-licences.<compte>.workers.dev
curl https://…/health       # doit afficher tous les "configured": true
```

### 6.4 L'application

**Fichier local** (`%APPDATA%/<App>/data/license.json`) :

```json
{
  "key": "ABCD-EFGH-JKLM-NPQR",
  "token": "eyJ2IjoxLCJtIjoi…",
  "machineCode": "A1B2-C3D4",
  "customer": "…",
  "activatedAt": 1789180094,
  "lastValidatedAt": 1789180094
}
```

**Commandes Tauri :**

```rust
#[tauri::command]
pub async fn get_license_status() -> LicenseStatus {
    std::thread::spawn(crate::license::refresh_if_stale);
    license::status()          // local, instantané, sans réseau
}

#[tauri::command]
pub async fn activate_license(key: String) -> Result<LicenseStatus, String> {
    // ⚠️ spawn_blocking OBLIGATOIRE — voir piège n°1
    match tokio::task::spawn_blocking(move || license::activate(&key)).await {
        Ok(r) => r,
        Err(e) => Err(format!("network error: {}", e)),
    }
}
```

**Re-validation périodique (révocation) :**

```rust
pub fn should_refresh(last: i64, now: i64) -> bool {
    last <= 0 || (now - last) > 7 * 86_400      // tous les 7 jours
}

pub fn refresh_if_stale() {
    // … appel /api/validate …
    match result {
        Ok(v) if v["valid"] == true  => { /* mettre à jour lastValidatedAt */ }
        Ok(_)                        => { /* RÉVOQUÉ → repasser en mode démo */ }
        Err(_)                       => { /* HORS-LIGNE → on GARDE l'activation */ }
    }
}
```

**Mode démo (sans licence)** — indispensable pour que le client essaie avant
d'acheter : un plafond volontairement gênant mais utilisable (ex. 50 produits)
+ un filigrane discret sur les documents imprimés. C'est ce qui déclenche l'achat.

**Ne pas afficher le nom du client** dans l'interface : il vient de la fiche
d'achat, n'apporte rien, et se retrouve exposé à l'écran d'une boutique.

### 6.5 Les tests à écrire (dans cet ordre d'importance)

1. **Vecteur croisé Node ↔ Rust** (le plus précieux) : un jeton produit par le
   serveur, vérifié par un test de l'app. Attrape toute divergence.
2. **Rejets** : jeton falsifié, jeton d'une autre machine, payload modifié,
   jetons malformés (`""`, `"abc."`, `".def"`).
3. **API simulée** : 200, 404, 403, 409, 5xx, timeout → vérifier chaque mapping.
4. **Bout en bout réel** : achat → clé → activation → vérifier côté fournisseur
   que l'activation est comptée → tester un **second PC** (doit échouer) et une
   **réinstallation sur le même PC** (doit fonctionner).

---

## 7. Adapter à un autre fournisseur

**C'est tout l'intérêt de l'architecture : un seul fichier change.**

| Couche | Change ? |
|---|---|
| L'application (Rust + UI) | ❌ **jamais** |
| Le format du jeton, la signature Ed25519 | ❌ jamais |
| La vérification hors-ligne | ❌ jamais |
| Le mode démo | ❌ jamais |
| **L'adaptateur du fournisseur** | ✅ **oui, uniquement ça** |

L'adaptateur se résume à trois fonctions :

```javascript
export async function getLicense(env, key)          // état de la licence
export async function activateLicense(env, key, machineCode)
export function mapApiError(status, body)           // → sentinelles normalisées
```

**Les sentinelles** (vocabulaire commun à tous les fournisseurs) :

| Sentinelle | Signification | Message affiché |
|---|---|---|
| `not-found` | clé inconnue | « Clé invalide, vérifiez la saisie » |
| `activation-limit` | déjà activée ailleurs | « Déjà activée sur un autre ordinateur » |
| `revoked` | remboursée / révoquée | « Cette licence a été révoquée » |
| `expired` | expirée | « Cette licence a expiré » |
| `network-error` | panne, timeout, 5xx | « Vérifiez votre connexion, réessayez » |

**Pour supporter DEUX fournisseurs en même temps** (ex. Afrique + international) :
le Worker essaie le premier, puis le second si la clé est inconnue. Le client
colle sa clé **sans savoir d'où elle vient** — aucune modification de
l'application n'est nécessaire.

**Attention :** `mapApiError` doit refléter la réalité de chaque API. Exemple :
un fournisseur peut renvoyer HTTP 200 avec `success: false`, ou **HTTP 200 avec
`success: true` pour un achat remboursé** (voir piège n°6).

---

## 8. Les pièges vécus (à lire absolument)

Ces dix pièges ont tous été rencontrés en production. Aucun n'était détectable
sans un test d'achat réel.

### 1. ⚠️ Runtime imbriqué → l'activation reste figée à l'infini

**Symptôme** : le bouton « Activer » tourne sans fin, le serveur ne reçoit **rien**.

**Cause** : dans une commande Tauri `async fn`, on appelait `block_on` sur un
runtime tokio dédié (imbriqué dans le runtime async de Tauri) → la requête était
figée **avant même d'être envoyée**.

**Diagnostic** : `get_license_status` répondait (aucun `block_on` sur son chemin)
alors que `activate_license` se bloquait. Confirmation côté fournisseur :
0 activation, aucune trace de requête.

**Correctif** : `tokio::task::spawn_blocking(move || …).await` — le code bloquant
s'exécute sur un thread dédié, hors du contexte async. **Et** un délai maximal
côté interface (25 s) pour qu'un chargement sans fin ne soit plus possible.

### 2. Les champs d'API **imbriqués**

La documentation annonçait `license_key`, la réalité renvoyait
`{ "license": { "key": "…" } }`. Résultat : un identifiant vide dans le jeton.
**Toujours inspecter une réponse réelle** avant de figer le code, et accepter les
deux formes.

### 3. Le **secret** interprété comme de l'hex/base64

Un webhook signé avec un secret **en texte** était vérifié en décodant le secret
comme de l'hexadécimal ou du base64 → signature systématiquement fausse, **100 %
des webhooks rejetés**, invisible jusqu'à la première vraie vente.
**Lire l'exemple de code officiel du fournisseur** : `createHmac("sha256", secret)`
signifie secret **en texte**.

### 4. Le **cache d'icône** (Tauri)

Changer `icon.ico` ne suffit pas : `tauri-build` compile l'icône dans un *build
script* Cargo dont la sortie est **mise en cache**. L'exe garde l'ancienne icône
dans la barre des tâches, alors que l'installateur se met bien à jour → résultat
incohérent, très déroutant.

```bash
npx tauri icon assets/logo.png
rm -rf src-tauri/target/release/build/<crate>-*    # ← l'étape qu'on oublie
npm run tauri build
```

Et côté Windows, il reste le **cache d'icônes du système** : purge avec
`ie4uinit.exe -show` ou en supprimant `%LOCALAPPDATA%\Microsoft\Windows\Explorer\iconcache*`
(Explorateur arrêté).

### 5. Les **webhooks de test** créent de vraies licences

Le bouton « envoyer un webhook de test » du fournisseur envoie un
`order.completed` avec des valeurs bidon (`dummy_order_…`, `isTest: true`) →
il créait une **fausse licence** à chaque clic dans la liste de livraison.
**Toujours filtrer l'événement ET le drapeau de test.**

### 6. Un achat **remboursé** qui reste valide

Certains fournisseurs renvoient `success: true` même pour un achat remboursé,
impayé ou contesté. **Il faut inspecter explicitement les champs
`refunded` / `chargebacked` / `disputed`** du payload — sinon un client remboursé
conserve sa licence indéfiniment.

### 7. Le **compteur d'activations** n'est pas fiable côté client

Chez certains fournisseurs, le compteur compte les *vérifications*, pas les
*installations*, et c'est **le client qui décide** d'incrémenter ou non → un
utilisateur peut le contourner.

**Bonne nouvelle** : si c'est **ton serveur** qui appelle l'API (jamais le
client), le compteur redevient fiable. C'est un argument de plus pour le proxy.

### 8. Le **nom du client** affiché dans l'interface

Sans intérêt (déjà dans le dashboard vendeur) et **exposé à l'écran d'une
boutique**, devant les employés et les clients.

### 9. La **version qui ne change jamais**

Tous les installateurs s'appelaient `MonApp_1.0.0_x64-setup.exe` avec la version
1.0.0 → impossible de distinguer un build récent d'un ancien, ni pour toi ni pour
le client. **Incrémente la version à chaque build publié** (`Cargo.toml` +
`tauri.conf.json` + `package.json`).

### 10. Le panneau « Applications » et le dossier d'installation

- **Désinstaller ne supprime pas les données** si elles vivent dans
  `%APPDATA%` : le désinstalleur ne connaît que ce que l'installateur a créé.
  **C'est voulu** (une boutique ne doit jamais perdre ses ventes en réinstallant),
  mais documente-le, car la case « effacer les données » du désinstalleur induit
  en erreur.
- Une entrée de désinstallation absente de la liste Windows alors que le dossier
  existe : vérifie `SystemComponent` dans
  `HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\<id>` (s'il vaut 1,
  l'entrée est masquée), puis redémarre.

---

## 9. Checklist de mise en production

**Avant de coder**
- [ ] Fournisseur : inscription possible dans mon pays avec mes documents
- [ ] Fournisseur : les **versements** fonctionnent (testé, pas supposé)
- [ ] Fournisseur : accepte les moyens de paiement de mes clients
- [ ] Fournisseur : produit de **type licence** disponible

**Serveur**
- [ ] Paire Ed25519 générée, **clé privée sauvegardée** hors du dépôt
- [ ] Clé privée poussée en secret (jamais affichée, jamais commitée)
- [ ] Clé publique écrite dans le code de l'app (idéalement par script)
- [ ] `/health` renvoie `true` pour tous les secrets
- [ ] Carte des erreurs vérifiée (404 / 403 / 409 / 5xx / timeout)
- [ ] Aucun secret dans le dépôt (`git log` + `git ls-files` vérifiés)

**Application**
- [ ] Vérification locale du jeton au démarrage (aucun réseau)
- [ ] Code machine vérifié (jeton d'une autre machine rejeté)
- [ ] `spawn_blocking` sur **tous** les appels réseau bloquants
- [ ] Délai maximal côté interface sur l'activation
- [ ] Panne réseau ≠ clé invalide
- [ ] Re-validation périodique qui ne rétrograde jamais sur erreur réseau
- [ ] Mode démo fonctionnel et gênant juste ce qu'il faut
- [ ] Messages d'erreur distincts (clé invalide / limite / révoquée / réseau)

**Distribution**
- [ ] Version incrémentée
- [ ] **Installateur testé sur une machine vierge** (pas seulement en développement)
- [ ] Achat réel effectué : le fichier livré active correctement
- [ ] Second PC testé (doit refuser) et réinstallation même PC testée (doit passer)
- [ ] Le fichier de la fiche produit est **celui que tu viens de builder**
- [ ] Guide utilisateur : activation, désinstallation, sauvegarde des données

---

## 10. Pour aller plus loin

| Besoin | Piste |
|---|---|
| **Réinstallation gratuite sans consommer d'activation** | Faire envoyer par l'app son jeton existant lors d'une réactivation : le serveur reconnaît « même licence + même machine » et ne rappelle pas le fournisseur. Entièrement sans état. |
| **Liaison d'appareil exacte** | Un stockage clé-valeur (Cloudflare KV) qui retient `licence → [machines]`. Permet les réinstallations gratuites même si le client a effacé ses données. |
| **Version d'essai** | Un jeton avec `x` = date d'expiration (déjà géré par le format) + un compte à rebours dans le stockage local. |
| **Multi-produits** | Un champ `p` (produit) dans le payload, vérifié par l'app. |
| **Révocation immédiate** | Un webhook de remboursement → le serveur marque la licence révoquée → la re-validation périodique (≤ 7 j) la désactive. |
| **Changer de fournisseur** | Écrire un second adaptateur (section 7), garder les deux en parallèle, migrer progressivement. Aucune réinstallation client. |

---

## Résumé en cinq lignes

1. Le fournisseur vend et émet les clés (Merchant of Record : zéro fiscalité à gérer).
2. Un Worker sans état garde la clé API et **signe** des jetons Ed25519.
3. L'application vérifie le jeton **localement** — hors-ligne, à vie.
4. Une panne réseau n'invalide **jamais** un client.
5. La clé privée ne quitte **jamais** le serveur ; l'app n'embarque que la publique.

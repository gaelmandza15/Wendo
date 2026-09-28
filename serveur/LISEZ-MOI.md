# Serveur de licences Wendo

Cloudflare Worker sans état. Il reçoit une clé d'achat, interroge le fournisseur
de paiement, et renvoie un **jeton signé** que l'application vérifiera ensuite
hors-ligne, à vie.

> Ce serveur est **générique** : il fonctionne avec n'importe quel fournisseur à
> clé API. Une seule partie est à adapter, `src/fournisseur.js`.
> La démarche complète et les pièges vécus sont dans
> `../LICENSE_SYSTEM_BLUEPRINT.md`.

## Ce que le serveur ne fait pas

- **Il ne stocke rien.** Aucune base de données, aucun journal de licences.
- **Il ne gère pas la fiscalité ni les remboursements** : c'est le rôle du
  fournisseur, qui agit comme *Merchant of Record*.

## Les trois routes

| Route | Corps | Réponse |
|---|---|---|
| `GET /health` | — | état du serveur et secrets détectés |
| `POST /api/activate` | `{ key, machineCode }` | `{ token }` ou `{ error }` |
| `POST /api/validate` | `{ key }` | `{ valid: true \| false }` |

## Déploiement

```bash
cd serveur
npx wrangler login

# Secrets — jamais dans le fichier de configuration
npx wrangler secret put LICENSE_PRIVATE_KEY   # coller la graine de .dev.vars
npx wrangler secret put PROVIDER_API_KEY      # votre clé API de vendeur

npx wrangler deploy
```

Puis déclarez l'URL obtenue dans l'application :

```bash
node ../outils-licence.cjs --url https://wendo-licences.<compte>.workers.dev --force
cd .. && cargo build
```

Vérification :

```bash
curl https://…/health
# → {"ok":true,"secrets":{"LICENSE_PRIVATE_KEY":true,"PROVIDER_API_KEY":true}}
```

## Configuration actuelle : Chariow

L'adaptateur Chariow est **écrit et testé** (`src/fournisseur.js`). Les formes de
réponse ne sont pas devinées : elles proviennent de l'adaptateur Chariow de
TramaPos, éprouvé en production, et ont été confirmées sur l'API réelle de votre
compte.

| Point | Valeur |
|---|---|
| Fournisseur | Chariow (`PROVIDER = "chariow"`) |
| Base de l'API | `https://api.chariow.com/v1` |
| Clé API | dans `PROVIDER_API_KEY` (secret du Worker) |
| Produits existants | Otelyo, TramaPos — tous deux de type « licence » |

**Il reste à créer un produit « Wendo »** sur Chariow, de type *licence*. Aucune
licence n'est encore émise sur ce compte (l'API répond « No query results for
model IssuedLicense »), donc l'activation ne peut pas être testée de bout en bout
avec une vraie clé tant que ce produit n'existe pas.

### Formes de réponse constatées

```text
GET  /licenses/{clé}
       404  {"message":"License key not found."}
       200  { data: { license: { key } } }     ← imbriqué

POST /licenses/{clé}/activate
       200  { data: { license_key } }          ← à plat
       404  {"message":"No query results for model [IssuedLicense]"}

Clé API refusée
       401  {"message":"Invalid API key. Please check again."}
```

Ces deux formes — imbriquée pour `GET`, à plat pour `POST /activate` — sont le
**piège n°2** du guide : ne lire que l'une des deux ferait signer un jeton avec un
identifiant de licence vide, donc inexploitable pour le support. L'adaptateur
accepte les deux, et un test le vérifie.

Un **401** signifie que *notre* clé API est refusée, pas que la clé du client est
mauvaise. L'adaptateur le classe donc comme une panne — le client n'y est pour
rien — et journalise `CHARIOW_AUTH_REFUSEE` pour que vous puissiez le
diagnostiquer dans les journaux du Worker.

### Vérifier l'adaptateur

```bash
node test-fournisseur.mjs    # 25 cas, sans appel réseau
```

## Brancher votre fournisseur

**Un seul fichier change : `src/fournisseur.js`.** Ni l'application, ni le format
du jeton, ni la vérification hors-ligne n'y touchent (voir §7 du guide).

Trois fonctions à adapter :

```js
activerUpstream(env, cle, machineCode)  // → { ok, sentinelle, licence, expiration }
verifierUpstream(env, cle)              // → { ok, sentinelle }
carteDesErreurs(sentinelle)             // → code HTTP
```

Les sentinelles forment le vocabulaire commun à tous les fournisseurs :

| Sentinelle | Signification | Ce que voit le client |
|---|---|---|
| `not-found` | clé inconnue | « Cette clé n'existe pas » |
| `activation-limit` | déjà activée ailleurs | « Déjà activée sur un autre ordinateur » |
| `revoked` | remboursée, litige | « Cette licence a été révoquée » |
| `expired` | expirée | « Cette licence a expiré » |
| `network-error` | panne, 5xx, délai | « Vérifiez votre connexion » |

### Avant de figer le code

1. **Faites un achat réel** et inspectez la réponse de votre fournisseur. Deux
   pièges ne se voient qu'à ce moment :
   - les champs **imbriqués** (`{ license: { key } }` au lieu de `license_key`) ;
   - un achat **remboursé** qui renvoie quand même `success: true`.
2. **Vérifiez que `PROVIDER_URL` est renseigné** dans `wrangler.toml`.
3. **Testez un second PC** : l'activation doit échouer.

## Les deux règles à ne jamais enfreindre

**1. Une panne n'est pas une clé invalide.**
Un serveur injoignable, un délai dépassé ou une erreur 5xx doivent produire
`network-error` → **HTTP 503**, jamais 404. Un client à qui l'on dit « clé
invalide » alors qu'il a payé panique, laisse un avis négatif et demande un
remboursement.

**2. La clé API du fournisseur ne quitte jamais ce serveur.**
C'est la raison d'être du proxy. Une clé embarquée dans un exécutable s'extrait
en quelques minutes, et permettrait à n'importe qui d'activer ou de révoquer des
licences sur votre compte.

## Ce qui protège vos licences

| Menace | Protection |
|---|---|
| Extraction de la clé dans l'exécutable | Signature **asymétrique** : l'application ne détient que la clé publique. Vérifié par test. |
| Partage de la clé entre postes | Le jeton contient le **code machine** ; un jeton vise un seul ordinateur. |
| Fabrication d'un jeton | Impossible sans la clé privée, qui n'est que sur le serveur. |
| Client hors-ligne | La licence reste valable : la vérification est locale. |
| Compteur d'activations trafiqué | C'est **le serveur** qui appelle le fournisseur, jamais le client. |

## Fichiers

```
src/index.js             Routes, signature Ed25519 (WebCrypto, sans dépendance)
src/fournisseur.js       Adaptateur Chariow — la seule partie liée au vendeur
wrangler.toml            Configuration du déploiement
.dev.vars                Secrets locaux — NE PAS VERSIONNER
test-vecteur-croise.mjs  Vérifie que l'application accepte les jetons du serveur
test-fournisseur.mjs     Vérifie l'adaptateur Chariow (sans appel réseau)
```

## Sécurité des clés

Deux secrets protègent la vente. Aucun ne doit sortir de son emplacement.

| Secret | Où il vit | Que se passe-t-il s'il fuit |
|---|---|---|
| `LICENSE_PRIVATE_KEY` | secret du Worker + votre gestionnaire de mots de passe | N'importe qui peut **fabriquer des licences valides à l'infini** |
| `PROVIDER_API_KEY` (`sk_…`) | secret du Worker | N'importe qui peut activer, révoquer ou lire vos licences Chariow |

Ces clés circulent normalement pendant la mise en place : elles passent par un
terminal, un gestionnaire de mots de passe, parfois un échange de messages avec
un développeur. Ce n'est pas une fuite.

Il faut en revanche les **régénérer** si elles ont atteint un canal durable ou
public : dépôt de code accessible à d'autres, capture d'écran partagée, billet
d'assistance, courriel groupé, ou fil de discussion auquel des tiers ont accès.
Le critère n'est pas « la clé a été vue », c'est « la clé a été conservée
quelque part que je ne contrôle pas ».

Ce qu'il faut faire :

1. **Clé API Chariow** — régénérez-la dans votre tableau de bord, puis
   `npx wrangler secret put PROVIDER_API_KEY`. Les licences déjà vendues ne sont
   pas affectées : seule la clé d'accès au tableau de bord change. C'est rapide et
   sans conséquence, donc à faire sans hésiter au moindre doute.
2. **Clé privée de signature** — la régénérer est plus lourd : l'application
   embarque la clé publique correspondante, donc il faudrait **republier une
   version** et faire réactiver les clients existants. À ne faire
   que si la fuite est avérée. `node ../outils-licence.cjs --force` régénère la
   paire ; `cargo build` réintègre la nouvelle clé publique.

## Test du vecteur croisé

Le test le plus précieux : il signe un jeton avec ce serveur et le fait vérifier
par le **vrai code de l'application** (Rust). Il attrape toute divergence
d'encodage entre JavaScript et Rust — un défaut qui ne se verrait qu'à la
première vraie vente.

```bash
node test-vecteur-croise.mjs
```

Il vérifie 9 cas : jeton valide, accents, autre machine, falsification, signature
étrangère, version inconnue, licence expirée. **Relancez-le après toute
modification** de `src/index.js` ou de `src/licence.rs`.

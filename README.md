# Wendo

Outil de gestion du pointage des employés.
HTML + Tailwind CSS + JavaScript vanilla, empaqueté en **application de bureau Tauri** —
**100 % local**, aucun serveur, aucune donnée envoyée sur internet.

Deux façons de l'utiliser, à partir des mêmes sources :

| | Application de bureau | Navigateur |
|---|---|---|
| Lancement | `wendo.exe` (fenêtre native) | double-clic sur `index.html` |
| Données | fichier `donnees.json` sur le disque | stockage du navigateur |
| Exports | écrits dans vos Documents | téléchargés |

Interface **bilingue français / anglais**, choisie dans les Paramètres.

## Langues

Le sélecteur se trouve dans **Paramètres → Formats & affichage → Langue de l'interface**.
Le changement est immédiat : ni enregistrement, ni rechargement.

| Élément | Suit la langue |
|---|---|
| Interface, libellés, messages, toasts | oui |
| Motifs d'absence livrés par défaut | oui |
| Jours fériés, mois, jours de la semaine | oui |
| Documents Word / PDF exportés | oui |
| Symbole et décimales des montants | oui (les valeurs saisies ne sont pas converties) |

Ne changent **pas** avec la langue, par choix :

- les **motifs que vous avez créés ou renommés** gardent le nom que vous leur avez donné ;
- les **noms d'employés, postes et départements** sont vos données ;
- les **contrats** (`CDI`, `CDD`, `Intérim`…) : cette liste sert de validateur de stockage,
  la traduire réinitialiserait le contrat des employés déjà enregistrés.

Deux mécanismes méritent d'être connus :

- **Motifs par défaut** — ils portent une clef de traduction (`clef`) plutôt qu'un libellé
  figé, et changent donc avec la langue. Une migration (`motifsV3` dans `js/app.js`)
  convertit les anciens motifs non renommés au premier démarrage, en laissant intacts
  ceux que vous avez personnalisés.
- **Langue de référence** — le français. Une clef absente d'une traduction s'affiche en
  français, et une clef absente partout s'affiche telle quelle : un oubli se voit à
  l'écran plutôt que de laisser un blanc.

### Ajouter une langue

1. Créer `js/i18n/xx.js` sur le modèle de `js/i18n/en.js` : `PP.i18n.enregistrer('xx', { … })`
   avec exactement les mêmes clefs.
2. Déclarer la langue dans `PP.i18n.LANGUES` (`js/i18n/i18n.js`).
3. Charger le fichier dans `index.html`, après `js/i18n/i18n.js`.

## Contrôles automatiques

```bash
node outils-verifier-i18n.cjs      # fr et en ont-ils exactement les mêmes clefs ?
node outils-verifier-licence.cjs   # la clé publique correspond-elle au serveur ?
node outils-simuler-activation.cjs # rejoue un parcours d'achat complet
node outils-reste-fr.cjs           # texte français restant (hors commentaires)
node outils-sync-front.cjs         # recopie le front pour le paquet Tauri
node outils-composer-icone.cjs     # compose assets/icone.png (logo sur fond arrondi)
node outils-icones.cjs             # décline cette icône en .ico/.png/.rgba
```

## Licences

Wendo se vend avec une activation **hors-ligne** : le client achète une clé,
l'active une fois, et l'application fonctionne ensuite **sans jamais redemander
internet**. La démarche complète est dans `LICENSE_SYSTEM_BLUEPRINT.md` (le guide
général) et `serveur/LISEZ-MOI.md` (la mise en œuvre).

### Comment ça marche

```
Client achète  →  le fournisseur émet une clé
                       ↓
        le serveur (Cloudflare Worker) valide la clé
        auprès du fournisseur, puis signe un JETON
                       ↓
        l'application vérifie le jeton LOCALEMENT,
        avec la clé publique qu'elle embarque → à vie
```

**Ce qui protège la vente :**

| Menace | Protection |
|---|---|
| Extraction de la clé dans l'exécutable | Signature **asymétrique** (Ed25519) : l'application ne détient que la clé **publique**. Un test vérifie que la clé privée est absente du binaire. |
| Clé partagée entre plusieurs postes | Le jeton contient le **code machine** ; il ne vaut que pour un ordinateur. |
| Fabrication d'un jeton | Impossible sans la clé privée, qui ne quitte pas le serveur. |
| Client sans internet | La licence reste valable : la vérification est locale. |
| Panne du serveur | Jamais confondue avec une clé invalide. Une re-validation qui échoue ne rétrograde jamais un client activé. |

### Mode démonstration

Sans licence, l'application reste **pleinement utilisable mais plafonnée** :
5 employés et aucun export de documents. C'est volontairement gênant sans être
inutilisable : le client doit pouvoir essayer sérieusement, pas tenir une
boutique. Les limites sont déclarées à un seul endroit, `PP.licence.limites()`
(`js/core/licence.js`), et les exports sont filtrés en un unique point de passage
(`PP.io.enregistrer`), ce qui évite d'en oublier un.

Dans un simple navigateur, l'activation n'est pas disponible : la version ouverte
en double-clic reste en mode démonstration. Le système protège l'application de
bureau distribuée, pas les sources.

### Mise en service

```bash
node outils-licence.cjs                           # 1. génère la paire de clés
cd serveur && npx wrangler deploy                 # 2. déploie le serveur
cd .. && node outils-licence.cjs --url https://… --force   # 3. déclare l'URL
cargo build                                       # 4. recompile
```

Renseignez ensuite `PROVIDER_URL` et `PROVIDER_API_KEY` pour votre fournisseur de
paiement, et adaptez `serveur/src/fournisseur.js` à son API.

> ⚠ **Sauvegardez la clé privée** (`serveur/.dev.vars`) dans un gestionnaire de
> mots de passe. Les secrets Cloudflare sont en écriture seule : perdue, elle est
> définitivement irrécupérable et vous ne pourrez plus émettre de licence. Les
> clients déjà activés continueraient toutefois de fonctionner.
>
> **Ne changez jamais la paire après la première vente** : chaque application
> distribuée embarque la clé publique, et la changer invaliderait toutes les
> activations existantes.


## Icône de l'application

L'icône affichée hors de l'application (barre des tâches, explorateur Windows,
alt-tab, installateur) est composée en deux temps, parce qu'aucun des logos
fournis ne convient tel quel :

| Fichier | Contenu | Utilisable comme icône ? |
|---|---|---|
| `assets/logo.png` | logo blanc, fond transparent | **non** — disparaît sur un fond clair |
| `icons/Logo-wendo.png` | logo sur fond **noir plein** | **non** — s'affiche en carré noir |
| `assets/icone.png` | logo sur fond arrondi sombre | **oui** — produit par `outils-composer-icone.cjs` |

Le logo est blanc : sans fond il devient invisible sur une barre des tâches
claire ; avec le fond noir fourni, il apparaît comme un carré noir sur les
thèmes clairs. `assets/icone.png` ajoute donc un fond arrondi sombre, ce qui
tient sur les trois fonds possibles (clair, sombre, couleur de sélection).

```bash
node outils-composer-icone.cjs   # assets/icone.png  (logo 72 % sur fond arrondi)
node outils-icones.cjs           # icons/ : .ico (9 tailles), .png, .rgba
cargo build                      # intègre icons/icon.rgba au binaire
```

`icons/icon.rgba` est l'image en pixels bruts, incluse dans le binaire Rust pour
l'icône de fenêtre : `tauri::image::Image::new` attend des pixels et non un PNG,
ce qui évite d'embarquer un décodeur PNG dans l'exécutable.

Après avoir régénéré les icônes, **relancez `cargo build`** : sans cela,
l'exécutable garde l'ancienne icône, car les ressources Windows ne sont pas
reconstruites automatiquement. En cas de doute, touchez `build.rs` pour forcer la
régénération.

## Lancer

### Application de bureau

```bash
node outils-sync-front.cjs     # recopie les sources du front dans front/
cargo build                    # produit target/debug/wendo.exe
cargo run                      # compile et lance
cargo build --release          # version optimisée (target/release/wendo.exe)
```

Prérequis : Rust et les outils de compilation C++ (Visual Studio Build Tools).
WebView2 est requis à l'exécution — il est présent sur Windows 10/11 à jour.

### Navigateur

Ouvrir `index.html` (double-clic suffit). **Aucune connexion internet n'est nécessaire** :
Tailwind, la bibliothèque Excel, les modules Word et la police Inter sont embarqués
dans `vendor/`.

Un jeu de démonstration (8 employés) est créé à la première ouverture.

## Devises

132 monnaies sont gérées, classées par zone géographique : Europe, Afrique de l'Ouest,
Afrique centrale, Afrique du Nord, Afrique de l'Est, Afrique australe, Moyen-Orient,
Asie du Sud, Asie du Sud-Est, Asie de l'Est, Asie centrale, Amériques et Océanie.

Le choix se fait dans **Paramètres → Formats & affichage**, avec un champ de recherche qui
comprend les codes (`XOF`, `NGN`), les noms français, les appellations locales (`rupiah`,
`ringgit`, `kwacha`) et les zones. La recherche porte sur des **mots entiers** : « yen » ne
remonte donc pas « Libye », et « afrique ouest » ne montre que les 9 monnaies de la zone.

Le nombre de décimales suit la monnaie : le franc CFA, le yen, le won, le dong et la roupie
indonésienne s'affichent sans centimes ; le dinar tunisien, koweïtien et bahreïni en comptent
trois. Changer de devise change l'affichage, jamais les montants saisis.

```js
PP.settings.devise()                        // { code, symbole, libelle, decimales, zone }
PP.settings.formaterMonetaire(18.5)         // « 18,50 € » · « 19 F CFA » · « 19 ¥ »
PP.settings.devisesParZone()                // liste groupée, pour construire un menu
PP.settings.deviseCorrespond('XOF', 'cfa')  // recherche par mots entiers
```

Ajouter une monnaie se fait dans `js/data/settings.js` : une ligne dans `DEVISES`
(`{ symbole, libelle, decimales, zone }`) et, si le nom courant diffère du libellé,
quelques mots-clés dans `ALIAS` pour la recherche.

## Où sont mes données ?

### Application de bureau

Dans un fichier JSON lisible :

```
%APPDATA%\fr.wendo.pointage\donnees.json
```

soit en clair : `C:\Users\<vous>\AppData\Roaming\fr.wendo.pointage\donnees.json`.
Le chemin exact est affiché dans **Paramètres → Sauvegardes & exports** et en tête du
**Guide d'utilisation**.

**Copier ce fichier suffit à sauvegarder l'ensemble de la base.** Il survit à la
fermeture de l'application et à une réinstallation.

L'écriture est **atomique** (fichier temporaire puis remplacement) : une coupure en
cours d'enregistrement ne peut pas laisser un fichier tronqué. Si le fichier est
illisible au démarrage, il est conservé sous un nom `donnees.json.corrompu-<date>` et
l'application repart sur une base vide plutôt que de perdre le contenu.

Les exports (Word, Excel, CSV) sont enregistrés dans vos **Documents**.

### Navigateur

Dans le stockage du site (clé `pointagepro.v1`). Vider les données du navigateur ou en
changer les efface : exportez régulièrement la base complète en JSON.

## Dépendances embarquées (`vendor/`)

| Fichier | Rôle | Origine |
|---|---|---|
| `tailwind.js` | Classes utilitaires de mise en forme | Tailwind CSS 3.4.16 (build Play CDN) |
| `xlsx.full.min.js` | Export Excel `.xlsx` | SheetJS 0.20.3 |
| `fflate.js` | Écriture et lecture des `.docx` (ZIP/DEFLATE) | fflate 0.8.2 |
| `jszip.js` | Lecture des `.docx` pour l'aperçu fidèle | JSZip 3.7.1 |
| `docx-preview.js` | Aperçu du `.docx` tel qu'il s'affichera dans Word | docx-preview 0.3.3 |
| `inter.css` + `fonts/` | Police Inter (graisses 400 à 800) | Google Fonts, fichiers `.woff2` |
| `tauri-api.js` | Pont vers l'application de bureau (écrit pour ce projet) | — |

Inutile en version navigateur : `tauri-api.js` ne fait rien quand l'API de bureau est
absente, et le code retombe alors sur les comportements web (téléchargements,
localStorage).

## Structure du projet

Le front et le code de bureau cohabitent à la racine :

```
index.html              Page unique — sidebar, entête, conteneur de page
tauri.conf.json         Fenêtre, sécurité (CSP), paquet Windows
Cargo.toml              Dépendances Rust
build.rs                Construction (généré par tauri-build)
capabilities/           Autorisations accordées à la fenêtre
icons/                  Icônes de l'application (générées par outils-icones.cjs)
src/                    Code Rust
  stockage.rs           Données dans un fichier JSON, chemins système, exports
  licence.rs            Code machine, stockage et vérification Ed25519 des jetons
  activation.rs         Appels au serveur, re-validation périodique
  commandes_licence.rs  Commandes exposées à l'interface
serveur/                Serveur de licences (Cloudflare Worker, voir son LISEZ-MOI)
front/                  Copie du front pour le paquet (ne pas modifier : générée)
css/
  theme.css             Styles complémentaires (formulaires, boutons, thème clair)
  editeur-document.css  Aperçu modifiable (feuille blanche, barre d'outils, impression)
js/core/
  utils.js              Utilitaires (échappement HTML, initiales, uid…)
  store.js              Persistance : fichier disque (bureau) ou localStorage (web)
  io.js                 Enregistrement des exports, import, CSV
  licence.js            État de licence, activation, limites du mode démonstration
  dates.js              Semaines ISO, jours fériés français
  time.js               Saisie d'heures flexible, durées, passage à minuit
  docx.js               Écriture de fichiers .docx (WordprocessingML + fflate)
  docx-lecture.js       Lecture d'un .docx vers du HTML modifiable + aperçu Word
js/i18n/
  i18n.js               Moteur de traduction (t, tx, changement de langue à chaud)
  fr.js / en.js         Dictionnaires — ils doivent avoir exactement les mêmes clefs
js/ui/
  icons.js              Bibliothèque d'icônes SVG
  components.js         Toasts, modale, confirmation, avatar, badge
  editeur-document.js   Aperçu modifiable : barre d'outils, exports, raccourcis
js/data/                Modèles et accès aux données (employés, pointages, absences…)
js/pages/               Une page par route (#/dashboard, #/pointage…)
js/app.js               Amorçage : données initiales, entête, routeur
outils-sync-front.cjs   Recopie le front dans front/ avant de construire
outils-composer-icone.cjs  Compose l'icône : logo détouré sur fond arrondi sombre
outils-icones.cjs       Décline cette icône en .ico / .png / .rgba pour Windows
```

`front/` est une copie générée : modifiez toujours les fichiers de la racine, puis
relancez `node outils-sync-front.cjs`. Tauri exige en effet que le front soit isolé
dans un dossier, sinon il tenterait d'embarquer aussi les sources Rust et le dossier
de compilation.

## Documents : aperçu modifiable, Word et PDF

Les pages **Rapports** et **Récapitulatif** ne lancent pas l'impression directement.
Le bouton **« Aperçu & modification »** ouvre le document en plein écran, sous forme de
page blanche modifiable :

- corriger n'importe quel texte, cellule de tableau, titre ;
- **Gras**, *italique*, alignements (G / C / D / J), hauteur de police ;
- ajouter un titre de section, un tableau, un paragraphe ; supprimer un bloc ;
- régler les marges et la largeur de page ;
- exporter en **Word (.docx)**, en **PDF** (impression du navigateur) ou en **HTML** ;
- **« Word direct »** exporte le .docx sans passer par l'aperçu.

Le document affiché est l'unique source : le `.docx` est produit à partir de ce que
vous voyez, pas d'un modèle séparé. Le `.docx` généré est un
WordprocessingML valide (A4, marges 2 cm, police Calibri), ouvrable dans Word,
LibreOffice et Google Docs.

### Notes techniques

- **Écriture** (`js/core/docx.js`) : assemblage du XML WordprocessingML puis
  compression ZIP avec `fflate`. Pas d'API `docx` externe.
- **Relecture** (`js/core/docx-lecture.js`) : décompression avec `fflate` puis
  parcours de `word/document.xml` via le `DOMParser` natif. mammoth n'est
  **pas** utilisé : sa lecture en mémoire passe par JSZip, dont l'inflation
  asynchrone n'aboutit pas dans le navigateur. Le sous-ensemble OOXML couvert
  (paragraphes, titres, tableaux, listes, gras, italique) correspond à ce que
  Wendo produit et à l'usage courant.
- **Aperçu fidèle** : `docx-preview` restitue la pagination réelle et sert de
  contrôle avant diffusion.

## Feuille de route — section par section

- [x] **Étape 1** — Fondations (shell, stockage, routeur) + **Section 1 : Gestion des employés**
- [x] **Étape 2** — Section 2 : Calendrier & jours fériés (vue annuelle, semaines ISO, fériés d'entreprise)
- [x] **Étape 3** — Section 3 : Pointage quotidien (4 créneaux, calculs, incohérences, validation)
- [x] **Étape 4** — Section 4 : Absences & motifs (demandes, validation, justificatifs, récurrences)
- [x] **Étape 5** — Section 5 : Moteur de calcul des heures (HS, seuil, absences comptabilisées, majorations, contingent)
- [x] **Étape 6** — Section 6 : Tableau de bord + Récapitulatif (la maquette prend vie, export CSV, impression)
- [x] **Étape 7** — Section 8 : Paramétrage général (seuils, majorations, formats, identité, réinitialisation)
- [x] **Étape 8** — Section 7 : Alertes & notifications (centre d'alertes temps réel dans la cloche)
- [x] **Étape 9** — Section 10 : Import / Export & sauvegardes (JSON, CSV, Excel, instantanés versionnés)
- [x] **Étape 10** — Section 9 : Sécurité & droits d'accès (auth, rôles, 2FA, session, journal, clôtures)
- [x] **Étape 11** — Section 11 : Rapports & documents (générateur imprimable, paie, attestation, signature)
- [x] **Étape 12** — Section 13 : Statistiques & analyses (absentéisme, coût HS, prévisions, anomalies, benchmark)
- [x] **Étape 13** — Sections 12 / 14 / 15 : Planning type, annonces & notes internes, thème clair, champs personnalisés
- [x] **Étape 14** — Section 15 : Guide d'utilisation intégré — **projet complet ✅**
- [x] **Étape 15** — Documents éditables : aperçu modifiable avant export, sortie Word `.docx`, PDF et HTML
- [x] **Étape 16** — Application de bureau Tauri : fenêtre native, données dans un fichier JSON sur le disque, exports enregistrés dans les Documents

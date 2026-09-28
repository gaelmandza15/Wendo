# Audit de la section Calendrier

*Audit du 2026-09-27, même méthode que les sections Pointage, Absences et Paramètres : lecture statique puis vérification interactive en navigateur (navigation d'année, bascule jours ouvrés, ajout/suppression de fériés, modification de la date de début, collecteur d'erreurs JavaScript).*

---

## Problème 1 : compteurs de l'année incohérents ✅ CORRIGÉ

### Constat
L'en-tête additionnait trois catégories **qui se recouvrent** : les jours fériés tombant un week-end étaient comptés à la fois comme férié et comme week-end. En 2026 (Assomption le samedi 15/08, Toussaint le dimanche 01/11), l'affichage donnait :

> 252 jours ouvrés · 11 jours fériés · 104 jours de week-end

soit **367 jours pour une année de 365** — un total qui ne tombe juste pour personne.

### Correction
Le nombre de fériés tombant en semaine est désormais précisé :

> 252 jours ouvrés · 11 jours fériés (dont 9 en semaine) · 104 jours de week-end

Les trois chiffres se recoupent maintenant correctement (252 + 9 + 104 = 365).

### Vérifié en navigateur
- 2026 : « 252 jours ouvrés · 11 jours fériés (dont 9 en semaine) · 104 jours de week-end » ✓
- Après ajout d'un férié le lundi 15/06/2026 : « 251 ouvrés · 12 fériés (dont 10 en semaine) » — cohérent ✓
- Après suppression : retour à 252 / 11 / 9 ✓

---

## Problème 2 : bandeau de la date de début factuellement faux ✅ CORRIGÉ

### Constat
Le bandeau annonçait : « Modifier la date de début du calendrier **réinitialise la base de saisie**. » C'est faux et alarmant : aucun code ne réinitialise quoi que ce soit. La date de début ne fait que **délimiter le périmètre** — les jours antérieurs restent consultables, sont signalés « hors périmètre » dans la page Pointage et exclus des alertes (`alertes.js` filtre sur `iso >= dateDebut`).

### Correction
Texte remplacé par une description exacte : « La date de début délimite le périmètre : les jours antérieurs restent consultables mais sont signalés hors périmètre dans le pointage et exclus des alertes. » Le renvoi vers l'export a été laissé dans la boîte de confirmation (où il a sa place).

### Vérifié en navigateur
Bandeau relu après rechargement : formulation exacte ✓ ; le comportement réel correspond (les jours antérieurs sont grisés, pas supprimés).

---

## Problème 3 : annulation du dialogue laissant une date non appliquée ✅ CORRIGÉ

### Constat
Après avoir saisi une nouvelle date de début et **annulé** la boîte de confirmation, le champ `#cal-date-debut` conservait la date saisie alors que le réglage n'avait pas changé — l'utilisateur voyait une date qui n'était pas appliquée, sans moyen de savoir laquelle était réellement active.

### Correction
`confirmDialog()` accepte désormais un `onClose` (transmis à `modal()`). Le calendrier s'en sert pour **toujours réafficher la date réellement appliquée** à la fermeture de la boîte, quelle que soit la sortie : Annuler, touche Échap, clic hors de la modale. Sur le chemin de confirmation, `dessiner()` réaffiche ensuite la nouvelle date.

### Vérifié en navigateur
- Annulation → champ revenu à `2026-01-01` (valeur appliquée), réglage inchangé ✓
- Confirmation → réglage passé à `2026-09-01`, 243 jours grisés, champ et toast cohérents ; puis retour à `2026-01-01` avec 0 jour grisé ✓
- Les 9 pages parcourues après modification de `components.js` (composant partagé) : aucune régression, zéro erreur ✓

---

## Problème 4 : férié ajouté hors de l'année affichée, invisible ✅ CORRIGÉ

### Constat
Ajouter un férié pour 2027 alors que le calendrier affiche 2026 donnait un simple « Jour férié d'entreprise ajouté. » sans qu'aucune ligne n'apparaisse — la liste affichait toujours 11 entrées. L'utilisateur pouvait croire l'ajout perdu (ou le refaire).

### Correction
Le message nomme désormais l'année concernée quand elle diffère de celle affichée : « Jour férié ajouté pour 2027 — affichez cette année pour le retrouver. » Les champs date et libellé sont également vidés après ajout (avant, seule la date restait, ce qui gênait les ajouts en série).

### Vérifié en navigateur
Ajout au 19/03/2027 en affichant 2026 → message mentionnant 2027, champs vidés ✓ ; ajout au 15/06/2026 → apparaît immédiatement dans la liste, message standard ✓

---

## Points vérifiés sans anomalie

| Vérification | Résultat |
|---|---|
| 365 lignes générées pour l'année, semaines ISO, mois, type | ✓ |
| Bascule « Jours ouvrés uniquement » : 365 → 252 lignes, interrupteur synchronisé | ✓ |
| Navigation d'année (précédente / suivante) | ✓ |
| Fériés légaux calculés + personnalisés affichés avec badges « auto » / supprimables | ✓ |
| Refus d'un férié sur une date déjà fériée légalement | ✓ |
| Refus d'un doublon de férié personnalisé | ✓ |
| Suppression d'un férié personnalisé (compteurs mis à jour) | ✓ |
| Cohérence avec `PP.calculs.estFerie` (utilisé par les absences) — même source de données | ✓ |
| Zéro erreur JavaScript sur l'ensemble du parcours des 9 pages | ✓ |

## Remarques de conception ✅ TRAITÉES

### 5. Fériés d'entreprise des autres années invisibles ✅ CORRIGÉ

#### Constat
La liste latérale ne montre que l'année affichée : un férié ajouté pour 2027 disparaissait complètement de l'écran une fois revenu sur 2026, sans aucun rappel de son existence.

#### Correction
Un compteur global est affiché dans le panneau « Férié d'entreprise » (`#cal-ferie-total`), recalculé à chaque dessin :
- Aucun : « Aucun férié d'entreprise enregistré. »
- Tous dans l'année : « 1 férié d'entreprise enregistré (tous sur 2026). »
- Répartis : « 2 fériés d'entreprise enregistrés — hors de 2026 : 1 en 2027. »

#### Vérifié en navigateur
Les trois états s'enchaînent correctement lors d'ajouts successifs dans l'année affichée puis hors année ✓

### 6. Aucune borne sur la date d'un férié ✅ CORRIGÉ

#### Constat
Une faute de frappe sur l'année (2040 au lieu de 2026) créait un férié invisible et sans effet, accepté sans le moindre avertissement — là où la fermeture annuelle des Paramètres est plafonnée à un an.

#### Correction
Plage acceptée : **±5 ans autour de l'année courante** (`ANNEES_MARGE = 5`), appliquée à deux niveaux :
- attributs `min`/`max` sur le champ date (validation native du navigateur) ;
- garde-fou dans `ajouterFerie` avec message explicite : « Année 2040 hors plage (2021 à 2031) — vérifiez la date saisie. »

#### Vérifié en navigateur
Bornes du champ `2021-01-01` → `2031-12-31` ✓ ; ajout au 01/05/2040 refusé, aucun férié créé ✓

### 7. Date de début future silencieuse ✅ CORRIGÉ

#### Constat
Si la date de début d'utilisation était postérieure à aujourd'hui, les alertes de pointage manquant et d'incohérence horaire disparaissaient (filtre `iso >= dateDebut`) **sans aucune explication** : l'utilisateur pouvait croire le contrôle défaillant.

#### Correction
Nouveau type d'alerte `perimetre` (libellé « Périmètre de saisie »), gravité *info*, émise quand `dateDebut > aujourd'hui` :

> **Périmètre de saisie non commencé** — Date de début d'utilisation fixée au 01/01/2027 : les alertes de pointage manquant et d'incohérence horaire ne couvrent pas les jours antérieurs.

Elle apparaît dans le centre d'alertes (cloche + badge) et renvoie vers le Calendrier, où la date se modifie.

#### Vérifié en navigateur
Date de début passée au 01/01/2027 : **10 alertes → 3** (les 7 alertes de pointage manquant suspendues), l'alerte de périmètre visible dans le panneau avec son libellé de type, badge d'en-tête mis à jour à 3 ✓ Retour à 2026-01-01 : alerte disparue, 10 alertes à nouveau ✓

---

## Bilan

| # | Problème | Verdict |
|---|----------|---------|
| 1 | Compteurs de l'année incohérents (367 jours) | **Corrigé** |
| 2 | Bandeau « réinitialise la base » factuellement faux | **Corrigé** |
| 3 | Annulation laissant une date non appliquée | **Corrigé** |
| 4 | Férié hors année invisible | **Corrigé** |
| 5 | Fériés des autres années sans rappel | **Corrigé** (compteur global) |
| 6 | Aucune borne sur la date d'un férié | **Corrigé** (±5 ans) |
| 7 | Date de début future silencieuse | **Corrigé** (alerte info) |

*État final vérifié : 8 employés, 3 pointages, 5 absences, 7 motifs, 0 férié personnalisé, date de début 2026-01-01, 10 alertes (justificatifs + pointages manquants), zéro erreur JavaScript sur l'ensemble des 9 pages.*

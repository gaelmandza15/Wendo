# Audit de la section Tableau de bord

*Audit du 2026-09-27, même méthode que les sections précédentes : lecture statique puis vérification interactive en navigateur (mesures de rendu, tests de contournement avec compte restreint, collecteur d'erreurs JavaScript).*

---

## Problème 1 : contournement de la clôture de période ⚠️ LE PLUS GRAVE ✅ CORRIGÉ

### Constat
La page Pointage bloque toute saisie sur une période clôturée (`periodeCloturee` vérifiée dans la saisie inline **et** dans la modale, avec bandeau « Période clôturée — saisies bloquées »). La **saisie rapide du tableau de bord ne faisait aucun contrôle** : il suffisait de passer par l'accueil pour modifier un pointage d'une période verrouillée.

C'est une faille de cohérence comptable : une période clôturée l'est typiquement parce que la paie est transmise. Toute la protection mise en place dans Paramètres devenait contournable en un clic depuis l'accueil.

### Preuve avant correction
Clôture posée sur la journée du 27/09/2026 (active au moment du test) → saisie rapide → **le pointage a été créé** (`creePendantCloture: true`), alors que la page Pointage aurait bloqué (`pointagePageBloquerait: true`).

### Correction
La saisie rapide est neutralisée quand la période est clôturée : sélecteur, champs, bouton « maintenant » et bouton d'enregistrement **désactivés**, avec une note explicative « Période clôturée — *libellé* : saisies bloquées. » Et garde-fou dans `enregistrerRapide` (défense en profondeur, indépendante de l'état de l'interface).

### Vérifié en navigateur
Bouton, champs et sélecteur désactivés ✓ · note affichée ✓ · **clic forcé après réactivation manuelle du champ : aucune écriture** ✓

---

## Problème 2 : contournement des droits d'accès ✅ CORRIGÉ

### Constat
Le sélecteur de la saisie rapide listait **tous les employés actifs**, sans filtrer selon les droits, et `enregistrerRapide` ne vérifiait pas `peutEditerPointage`. Un compte de rôle « Employé » — qui ne doit saisir que **ses propres** pointages — pouvait donc enregistrer (ou écraser) les heures de n'importe quel collègue depuis l'accueil.

### Preuve avant correction
Compte « Employé » lié à Amani, connecté : le sélecteur proposait les **8 employés**, Junior inclus, et la saisie a bien **écrit un pointage pour Junior** (`ecritPourAutre: true`) alors que `peutEditerPointage(Junior)` valait `false`.

### Correction
- Le sélecteur ne liste que les employés que l'utilisateur peut pointer (donc son seul nom pour un compte « Employé ») ; si aucun, message « Aucun employé que vous pouvez pointer » et saisie désactivée avec la note « Votre rôle ne permet pas de saisir de pointage. »
- Garde-fou dans `enregistrerRapide` : droit vérifié **avant** toute écriture.

### Vérifié en navigateur
Compte « Employé » connecté : sélecteur limité à « Amani Mbemba », Junior absent de la liste ✓ · tentative d'écriture forcée pour Junior → **son pointage de démonstration reste intact** (08:15 → 12:00, 7h47) ✓ · saisie pour soi-même toujours possible (08:00 → 12:00 enregistré, puis valeurs d'origine rétablies) ✓

---

## Problème 3 : ligne de seuil du graphique hors du cadre ✅ CORRIGÉ

### Constat
La ligne pointillée matérialisant le seuil hebdomadaire — et sa légende « Seuil 40h » — était positionnée avec un décalage de 96 px en trop : `bottom: 179,5 px` dans un conteneur de **176 px**. Elle se retrouvait **entièrement au-dessus du graphique**, donc invisible, alors que la légende du graphique l'annonce explicitement (« Seuil hebdomadaire »).

### Correction
La ligne est désormais placée à la hauteur qu'occuperait une barre au niveau du seuil (`(seuil × 60 / maxVal) × hauteurMax`), les barres reposant sur le bas du conteneur.

### Vérifié en navigateur (mesures réelles)
`bottom: 83,48 px` dans un conteneur de 176 px → ligne **visible** et alignée, légende « Seuil 40h » affichée ✓

---

## Problème 4 : titre d'accueil codé en dur ✅ CORRIGÉ

### Constat
La page affichait « **Bonjour Gaël** » en toutes circonstances — reliquat de la maquette. Un utilisateur connecté sous le nom « Administrateur » (ou tout autre compte) voyait le prénom du développeur.

### Correction
Le titre utilise le premier mot du nom du compte connecté : « Bonjour Administrateur », « Bonjour Léa »… (et simplement « Bonjour » si aucun nom).

### Vérifié en navigateur
Administrateur → « Bonjour Administrateur » ✓ · compte de test « Léa Audit » → « Bonjour Léa » ✓

---

## Problème 5 : bandeau de la date de début, même affirmation fausse que dans le Calendrier ✅ CORRIGÉ

### Constat
Le bandeau annonçait « Modifier la date de début du calendrier **réinitialise les données saisies** » — même affirmation erronée que celle corrigée dans le Calendrier : la date de début ne fait que délimiter le périmètre.

### Correction
Texte aligné sur la formulation exacte du Calendrier. Le renvoi à l'export a été retiré (il reste dans la boîte de confirmation, où il a sa place).

### Vérifié en navigateur
Nouveau texte affiché, avec la date de début toujours rappelée ✓

---

## Problème 6 : modale d'annonce non scopée ✅ CORRIGÉ

### Constat
Dernier représentant du défaut récurrent : `document.getElementById('db-annonce-ok')` et `('db-annonce-texte')` pour la publication d'une annonce, et `modal({…})` dont le retour n'était pas capturé.

### Correction
Modale capturée dans `fermer`, requêtes limitées à `fermer.overlay`. Import `closeModal` devenu inutile retiré.

### Vérifié en navigateur
Message vide rejeté (« Le message est vide. ») ✓ · publication valide → annonce visible dans la section, modale fermée ✓ · annonce de test supprimée après vérification ✓

---

## Points vérifiés sans anomalie

| Vérification | Résultat |
|---|---|
| 4 cartes statistiques (présents, HS du mois, absences du jour, moyenne) cohérentes avec les données | ✓ |
| Derniers pointages du jour : tri, horaires matin/après-midi, totaux, statuts, badge d'absence | ✓ |
| Panneau « Aujourd'hui » (présents, à valider, absences, HS équipe) | ✓ |
| Demandes d'absence en attente (4 max, période, demi-journée) | ✓ |
| Statistiques du mois : taux de présence, HS du mois, absences en jours | ✓ |
| Graphique des 4 dernières semaines (moyennes, semaine courante mise en avant) | ✓ |
| Graphique des absences par motif (poids des demi-journées, facteurs HS) | ✓ |
| Saisie rapide : remplissage à l'heure courante, total du jour, cumul semaine + jauge | ✓ |
| Zéro erreur JavaScript ; parcours des 9 pages sans régression | ✓ |

## Remarques de conception (non modifiées)

- **« Absences du jour » compte en occurrences, pas en personnes** : deux absences du même employé le même jour (matin + après-midi) comptent pour 2.
- **Taux de présence approximatif** : le dénominateur est « jours ouvrés écoulés × effectif actif actuel », sans tenir compte des embauches en cours de mois ni des jours précédant la date de début.
- **Un week-end d'absence ne compte pas** dans le graphique par motif (seuls les jours non-week-end sont additionnés) — cohérent avec la perte de jours travaillés, mais l'écart avec le compteur de la carte « Absences du jour » peut surprendre.

#### Incident de test (résolu)
Le test de contournement des droits a écrasé le pointage de démonstration de Junior, et son nettoyage l'a supprimé. Il a été **intégralement restauré** (08:15 → 12:00 / 13:00 → 17:02 = 7h47) et vérifié après coup. État final contrôlé avant/après : identique.

*État final vérifié : 8 employés, 3 pointages (Amani 8h03, Junior 7h47, Fatou 3h27), 5 absences, 7 motifs, 0 message, 0 clôture, seul le compte admin, 10 alertes — zéro erreur JavaScript sur les 9 pages.*

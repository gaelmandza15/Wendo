# Audit de la section Employés

*Audit du 2026-09-27, même méthode que les sections Pointage, Absences, Paramètres et Calendrier : lecture statique puis vérification interactive en navigateur (formulaire, photo, discussion, planning, suppression, import, collecteur d'erreurs JavaScript).*

---

## Problème 1 : modales non scopées (le défaut récurrent) ✅ CORRIGÉ

### Constat
La section cumulait **14 appels `document.getElementById` / `document.querySelector`** répartis sur ses trois modales (fiche employé, discussion, planning type) — le même défaut structurel que celui corrigé dans les quatre sections précédentes.

Le cas le plus dangereux : `ouvrirPlanning` interrogeait `document.querySelectorAll('[data-jour]')` à l'échelle du **document entier**, alors que ce même attribut sert aux cases « jours ouvrés » de la page **Paramètres**. Les deux écrans ne sont jamais affichés simultanément, donc le conflit restait latent — mais tout affichage futur de ces deux éléments ensemble aurait attaché le recalcul du planning aux mauvaises cases.

### Correction
Les trois modales passent par `fermer.overlay` et toutes leurs requêtes (`#emp-form`, `#emp-photo-*`, `#emp-form-erreur`, `#emp-submit`, `#emp-fil`, `#emp-message*`, `[data-jour]`, `[data-total-jour]`, `#emp-planning-*`) sont désormais limitées à la modale. Les deux modales qui ne capturaient pas le retour de `modal()` (discussion, planning) l'enregistrent maintenant dans `fermer`.

### Vérifié en navigateur
Formulaire, discussion et planning fonctionnent à l'identique ✓ ; **les 7 cases « jours ouvrés » de Paramètres restent indépendantes** (coche du samedi enregistrée puis rétablie) ✓

---

## Problème 2 : bouton « Retirer » de la photo inutilisable ✅ CORRIGÉ

### Constat
Le même défaut que le logo (Paramètres) et le justificatif (Absences) :
- le bouton n'était rendu **que si une photo existait à l'ouverture** — choisir une photo dans un formulaire de création n'affichait donc aucun bouton pour la retirer ;
- au premier clic il était **supprimé du DOM** (`btnSuppr.remove()`), donc définitivement perdu pour la suite de la session.

### Correction
Bouton toujours rendu (masqué sans photo), bascule visibilité/état, aucun retrait du DOM. Il est réutilisable indéfiniment.

### Vérifié en navigateur
Masqué à l'ouverture sans photo ✓ · apparaît après ajout · retrait effectif, aperçu revenu aux initiales ✓ · **deux cycles complets** sans recharge ✓

---

## Problème 3 : taux horaire non numérique stocké en NaN ✅ CORRIGÉ

### Constat
`normalise` faisait `Number(d.tauxHoraire)` sans contrôle : une valeur non numérique produisait `NaN`, stocké tel quel.
- Origine réelle : **l'import CSV** (les valeurs arrivent sous forme de texte) — le champ `type="number"` du formulaire, lui, vide la valeur, ce qui masquait le problème en saisie manuelle.
- Conséquence : la carte affichait « **NaN €/h** » et le `NaN` se propageait dans les coûts calculés (rapports HS, bulletins estimés, statistiques).

Le contrôle de validation existant (`Number(d.tauxHoraire) < 0`) ne détectait rien : `NaN < 0` est faux.

### Correction
- `js/data/employes.js` : `tauxHoraire` vaut `null` si la valeur n'est pas un nombre fini (`Number.isFinite`) — garde-fou au niveau des données, donc valable pour **toutes** les voies d'entrée (formulaire, import CSV, import JSON, API interne).
- `js/pages/employes.js` : message explicite « Le taux horaire doit être un nombre. » si une valeur non numérique est soumise depuis le formulaire.

### Vérifié en navigateur
`create({ tauxHoraire: 'abc' })` → `null` (jamais `NaN`), affichage « — » ✓ ; photo, planning et enregistrement de fiche intacts ✓

---

## Problème 4 : données orphelines à la suppression d'un employé ✅ CORRIGÉ

### Constat
`PP.employes.remove(id)` ne supprimait que la fiche. Les **pointages** (`employeId|date`), **absences**, **messages** et **planning type** de l'employé restaient dans le stockage local : invisibles dans l'interface, mais bien présents dans la base — donc exportés en JSON et restaurés lors d'un import. (Constaté concrètement lors d'un test de nettoyage : il fallait supprimer les pointages à la main.)

### Correction
- `PP.employes.remove(id)` supprime désormais la fiche **et ses données rattachées**, et renvoie le décompte.
- Nouvelle fonction `PP.employes.donneesLiees(id)` (pointages, absences, messages, planning) utilisée par le dialogue de confirmation, qui **annonce exactement ce qui sera effacé** : « … sera définitivement supprimé, ainsi que ses données rattachées (2 pointages, 1 absence, 1 message, son planning type). Cette action est irréversible — préférez la désactivation pour conserver l'historique. »

### Vérifié en navigateur
Employé de test chargé avec 2 pointages, 1 absence, 1 message et 1 planning : le dialogue les énumère tous les quatre, la confirmation vide l'ensemble (0 restant dans chaque collection) ✓

---

## Problème 5 : clés de permission hétérogènes ✅ CORRIGÉ (robustesse)

### Constat
Trois styles coexistaient pour un même besoin :
- `peut('supprimer')` (pointage, messages) — **clé non déclarée** dans la matrice ;
- `peut('employes.supprimer')` — clé non déclarée non plus ;
- `peut('absence.supprimer')` — clé bien déclarée (RH l'a).

Les deux premières n'étaient donc satisfaites que par le joker `'*'` de l'administrateur : le comportement était correct, mais **la matrice ne documentait pas ces actions** et aucun autre rôle n'aurait pu se voir accorder explicitement la suppression.

### Correction
- Clés explicites et homogènes : `pointage.supprimer`, `employes.supprimer`, `messages.supprimer`, `absence.supprimer`.
- Commentaire dans `securite.js` listant **toutes les actions connues** et précisant que les suppressions sont volontairement réservées à l'administrateur (sauf `absence.supprimer`, accordée au RH).
- Guide d'utilisation mis à jour pour refléter la matrice : « RH — gestion des employés (ajout, modification, activation), pointages, validations et suppression d'absences, exports. »

**Comportement inchangé** : administrateur conserve tout (joker), RH/manager/employé n'obtiennent aucune nouvelle permission.

---

## Points vérifiés sans anomalie

| Vérification | Résultat |
|---|---|
| Recherche (nom, poste, département, matricule) et filtres tous/actifs/inactifs | ✓ |
| Bascule actif/inactif avec redessin de la carte | ✓ |
| Unicité du matricule (création et modification) | ✓ |
| Validation prénom/nom, email, heures hebdo (1–80) | ✓ |
| Champs personnalisés (paramétrés dans Paramètres) dans le formulaire et sur les cartes | ✓ |
| Téléversement réel de photo : PNG → JPEG redimensionné (1 Ko) → enregistré → avatar sur la carte | ✓ |
| Discussion : envoi, horodatage, auteur, suppression de message | ✓ |
| Planning type : recalcul par jour et par semaine (8h00 → 12h00), enregistrement en minutes, retrait | ✓ |
| Suppression d'employé avec décompte précis des données liées | ✓ |
| Zéro erreur JavaScript ; parcours des 9 pages sans régression | ✓ |

## Remarques de conception (non modifiées)

- **Compte lié non nettoyé** : supprimer un employé ne touche pas au compte utilisateur qui lui était rattaché (`compte.employeId` restant). Un compte « Employé » pointant vers une fiche supprimée ne peut plus rien saisir (sa propre fiche n'existe plus) ; il faudrait le délier ou le supprimer depuis Paramètres → Comptes.
- **Heures contractuelles et taux horaire sans historique** : modifier ces valeurs change rétroactivement les calculs de coûts des périodes passées (aucune notion de « valeur à la date »).
- **Manager supprimé** : le champ `managerId` des subordonnés n'est pas réinitialisé — la carte affiche « — » mais l'identifiant pointe dans le vide.

*État final vérifié : 8 employés (EMP-001 → EMP-008, tous actifs), 3 pointages, 5 absences, 7 motifs, 0 message, 0 planning, 0 férié personnalisé, date de début 2026-01-01, jours ouvrés lun–ven, 10 alertes — identique à l'état d'origine.*

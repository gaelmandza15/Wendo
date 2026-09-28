# Audit de la section Guide d'utilisation

*Audit du 2026-09-27. Le guide étant une page de documentation statique, l'audit a porté sur **l'exactitude de chaque affirmation** face au comportement réel de l'application, sur les liens internes et sur la structure.*

---

## Problème : une affirmation fausse sur les fermetures annuelles ✅ CORRIGÉ

### Constat
L'étape « Calendrier » du démarrage rapide invitait à « ajouter vos fériés d'entreprise **ou fermetures annuelles** » depuis le Calendrier. Or le Calendrier ne permet d'ajouter que des **fériés isolés** (une date + un libellé) : il n'existe aucun formulaire de plage de dates sur cette page. Les fermetures annuelles (du … au …) se créent dans **Paramètres → Semaine de travail**, où chaque date de la plage est inscrite comme jour non ouvré.

Le mot « Fermeture annuelle » apparaît bien dans le Calendrier, mais uniquement comme **exemple de libellé** dans le champ de saisie — ce qui rendait la confusion d'autant plus facile.

### Correction
La phrase renvoie désormais chaque action à sa page, avec un lien cliquable vers **Paramètres → Semaine de travail**. Au passage, les ancres écrites à la main dans le contenu ont été remplacées par un petit helper `lien(route, texte)` — le `href` n'est plus dupliqué neuf fois, et l'artefact `${'<a …>'}` qui traînait dans le premier point a disparu.

### Vérifié en navigateur
Phrase affichée : « Calendrier — vérifiez l'année générée automatiquement (semaines ISO, week-ends, jours fériés) et ajoutez vos fériés d'entreprise. Les fermetures annuelles (plages de dates) se créent dans Paramètres → Semaine de travail. » ✓

---

## Affirmations vérifiées une à une (toutes exactes)

| Affirmation du guide | Vérification |
|---|---|
| Compte `admin / admin` créé au premier lancement | ✓ `securite.init()` le crée si aucun compte |
| Formats d'heure acceptés partout : « 8 », « 8h », « 8h30 », « 08:00 », « 1:30 PM » | ✓ les 5 formats sont analysés correctement |
| « La touche Entrée valide la saisie » (Pointage) | ✓ testé : la valeur est bien enregistrée |
| « Le crayon ouvre les créneaux du soir, le commentaire et l'historique » | ✓ conforme à la modale d'édition |
| « ‹ › navigue entre les périodes » (Récapitulatif) | ✓ vérifié lors de l'audit de la section |
| « Cliquez sur un en-tête de colonne pour trier » | ✓ tri par nom et par colonne numérique |
| HS par semaine ISO : MAX(0 ; heures + absences − seuil) | ✓ conforme au moteur |
| « Aucune HS le dimanche » | ✓ dimanche exclu de la base, compté au total |
| Nuit 22 h–6 h, y compris à travers minuit (22:00 → 02:00 = 4 h) | ✓ vérifié lors de l'audit du moteur |
| Arrondi : minute, quart d'heure, demi-heure | ✓ les trois options existent dans Paramètres |
| « Une période clôturée devient non modifiable » | ✓ Pointage **et** saisie rapide du tableau de bord (après correction) |
| « Arrivée après l'heure de référence → rapport des retards » | ✓ rapport dédié présent |
| « Sauvegardes locales automatiques (10 versions) » | ✓ 12 créations successives → 10 conservées |
| 2FA par compte, session expirant après inactivité configurée | ✓ bouton 2FA par compte, durées 10/30/60 min ou jamais |
| Thème clair et police agrandie dans Paramètres → Apparence | ✓ les deux options sont appliquées immédiatement |
| Droits par rôle (Administrateur / RH / Manager / Employé) | ✓ conformes à la matrice réelle |
| Fonctions nécessitant un serveur (e-mail, cloud, API, QR, mobile) | ✓ aucune trace dans le code — bien annoncées comme absentes |

## Structure et navigation

| Vérification | Résultat |
|---|---|
| 7 sections dépliables, la première ouverte par défaut | ✓ |
| 9 liens internes vers les pages de l'outil | ✓ tous mènent à une page valide |
| Aucun artefact de gabarit dans le HTML rendu | ✓ |
| Zéro erreur JavaScript | ✓ |

## Remarques (non modifiées)

- **Le guide n'est pas dynamique** : il décrit l'outil en texte figé. Si un réglage change (seuil, majorations), le guide n'affiche pas les valeurs en vigueur — seuls les rapports et le récapitulatif le font.
- **Pas de sommaire ancré** : les 7 sections se replient mais aucun lien « aller à » ne permet de sauter directement à une section.
- **Impression** : le guide s'imprime tel quel, sections repliées comprises (seule la première est ouverte par défaut).

*État final préparé : instantané « Automatique » recréé (8 employés) — l'instantané automatique initial avait été évincé par les 12 sauvegardes de test du plafond de 10 versions ; aucune donnée n'était affectée.*

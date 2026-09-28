# Audit complet Wendo — synthèse

*Audit mené section par section du 2026-09-27 : lecture statique du code, puis vérification interactive dans le navigateur (saisies réelles, comptes de test à droits restreints, données contrôlées, mesures de rendu, interceptation des exports, collecteur d'erreurs JavaScript actif en permanence).*

**9 sections auditées — 26 bugs corrigés, 10 évolutions livrées.**

---

## Résultats par section

| Section | Rapport | Bugs corrigés | Évolutions |
|---|---|---|---|
| **Pointage** | `BUGS-POINTAGE.md` | Modales non scopées (12 sélecteurs globaux) | Validation des heures à la frappe (bordure + message) · nettoyage du parseur |
| **Absences** | `BUGS-ABSENCES.md` | Modales non scopées · bouton « Retirer » du justificatif inaccessible | Jours ouvrés (au lieu de calendaires) · contrôle de chevauchement · récurrence sans week-ends ni fériés |
| **Paramètres** | `BUGS-PARAMETRES.md` | Modales non scopées · **validation numérique trouée** (champ vidé → 0, `majorationHS` jamais validée, `NaN` non détecté) · bouton « Retirer » du logo à usage unique | « Tout effacer » réellement vide · plafond explicite des fermetures · dates CSV désambiguïsées et validées |
| **Calendrier** | `BUGS-CALENDRIER.md` | Compteurs incohérents (367 jours pour 365) · bandeau factuellement faux · annulation laissant une date non appliquée · férié hors année invisible | Compteur global des fériés · bornes ±5 ans · alerte de périmètre |
| **Employés** | `BUGS-EMPLOYES.md` | Modales non scopées (dont un sélecteur entrant en collision avec Paramètres) · bouton « Retirer » de la photo · **taux horaire stocké en `NaN`** (propagé aux coûts) · **données orphelines** à la suppression · clés de permission non déclarées | Cascade de suppression avec décompte annoncé · matrice documentée |
| **Tableau de bord** | `BUGS-DASHBOARD.md` | **Contournement de la clôture de période** · **contournement des droits d'accès** · ligne de seuil hors cadre · titre « Bonjour Gaël » codé en dur · bandeau faux · modale non scopée | Saisie rapide neutralisée et expliquée (clôture / droits) |
| **Rapports** | `BUGS-RAPPORTS.md` | **Flèches de période inversées** · anomalies détectées pour le seul premier employé · **exports CSV vides** pour 4 types · mauvais millésime du contingent | Lignes d'export construites depuis l'affichage · en-têtes alignés |
| **Récapitulatif** | `BUGS-RECAPITULATIF.md` | **Page entièrement cassée** pour les rôles sans droit d'export · flèches inversées (mois/année) · « Heures total » ne correspondant pas à la période | Colonnes cohérentes et additionnables |
| **Guide** | `BUGS-GUIDE.md` | Fermetures annuelles attribuées à la mauvaise page | 17 affirmations vérifiées une à une · liens factorisés |

---

## Les défauts de fond (motifs récurrents)

**1. Modales non scopées — 5 sections sur 9.** Les formulaires en modale interrogeaient le document entier (`document.getElementById`) au lieu de leur propre boîte. Corrigé partout via `fermer.overlay` exposé par `PP.ui.modal()`. Le cas le plus révélateur : le planning type des Employés interrogeait `[data-jour]`, attribut également utilisé par les cases « jours ouvrés » de Paramètres.

**2. Boutons « Retirer » détruits au premier clic — 3 occurrences.** Logo de l'établissement, justificatif d'absence, photo d'employé : le bouton était retiré du DOM (ou jamais rendu) au lieu d'être masqué, le rendant inutilisable pour le reste de la session.

**3. Flèches de période inversées — 2 sections.** Dans Rapports, les deux flèches étaient inversées ; dans le Récapitulatif, seuls les mois et les années l'étaient (les semaines fonctionnaient), car les trois découpages n'utilisaient pas la même convention d'offset. Une convention unique (offset vers le passé) a été adoptée dans les deux pages.

**4. Bandeau « la date de début réinitialise les données » — 2 sections.** Calendrier et Tableau de bord annonçaient une remise à zéro qui n'existe pas dans le code : la date ne fait que délimiter le périmètre.

**5. Contournements de règles depuis le Tableau de bord.** La saisie rapide échappait à la fois au verrou de clôture et aux contrôles de droits — les deux protections les plus importantes de l'outil. Corrigé avec contrôle dans le code **et** neutralisation visible de l'interface.

---

## Ce qui a été vérifié sans anomalie

- **Moteur de calcul** : HS par semaine ISO, dimanche exclu de la base, nuit à travers minuit, arrondis, contingent annuel, poids des absences — avec contrôle arithmétique indépendant sur le bulletin (3h27 dimanche à 13,50 € → 46,58 € + 23,29 € = 69,86 €) et sur le prévisionnel (22 jours ouvrés × 8 h = 176h00).
- **Sécurité** : hachage des mots de passe, 2FA (cycle complet avec code valide calculé par l'algorithme), session et expiration, clôtures, journal, matrice des droits — tout conforme, aucune nouvelle permission accordée par les corrections.
- **Données** : persistance locale, exports/imports (JSON, CSV, Excel), sauvegardes versionnées (plafond de 10 confirmé), unicité du matricule, validations de saisie.
- **Interface** : les 9 pages se rendent sans erreur, sur les 9 sections, à chaque étape de l'audit.

## Honnêteté méthodologique

Le premier rapport de la section Pointage annonçait 7 bugs issus d'une lecture statique : **6 étaient des faux positifs**, écartés après tests (« 8h5 » était correctement interprété en 8h05, le cumul semaine se mettait à jour, etc.). La méthode a donc été systématiquement ajustée pour les sections suivantes : chaque suspect est d'abord **reproduit en navigateur** avant d'être annoncé comme bug.

Trois incidents de test sont à signaler, tous réparés et vérifiés : les pointages de démonstration du 27/09 ont été restaurés deux fois (une fois par réimport depuis un export Excel trouvé dans le dossier Téléchargements, une fois par saisie directe des valeurs d'origine), et un instantané automatique évincé par un test de plafond a été recréé.

---

## Correctif demandé après l'audit

**Le badge de la cloche ne se remettait jamais à zéro.** Il affichait en permanence le **nombre total** d'alertes (`PP.alertes.nombre()`) : ouvrir le panneau ne changeait rien, et le compteur ne redescendait que si les données elles-mêmes changeaient.

Nouveau comportement (`js/ui/centre-alertes.js`) :
- les alertes consultées sont mémorisées par leur **identifiant**, ce qui permet au badge de ne compter que les nouvelles — un identifiant change dès qu'une situation évolue (nouveau jour manquant, nouvelle semaine, absence injustifiée créée…) ;
- le badge compte uniquement les alertes **non consultées** — il disparaît donc à l'ouverture du panneau, et **réapparaît dès qu'une alerte nouvelle** apparaît, avec l'infobulle « N nouvelles alertes » ;
- dans la liste, les alertes non encore vues portent un fond bleuté et la mention <span>nouveau</span>, y compris après extinction du badge ;
- le panneau continue d'afficher le **total** en en-tête (le chiffre reste une information utile).

**Marqueur propre à chaque compte** : la mémorisation est stockée sous une clé par compte (`alertesVues|<idCompte>`) — sur un poste partagé, la lecture d'un utilisateur n'éteint plus le badge des autres. Deux automatismes d'entretien :
- **migration** : l'ancien marqueur global des versions précédentes est repris par le compte courant, puis supprimé ;
- **purge** : les marqueurs laissés par des comptes supprimés sont effacés au démarrage.

Vérifié en navigateur : migration d'un ancien marqueur global ✓ · admin lit → badge éteint ✓ · connexion d'un autre compte → badge à **10** (il n'a rien consulté) ✓ · ce compte lit → éteint ✓ · retour admin → **son** état de lecture conservé ✓ · marqueur du compte de test supprimé après suppression du compte ✓ · les 9 pages rechargées sans erreur, données intactes.

---

## État final de l'application

8 employés (EMP-001 → EMP-008), 3 pointages (Amani 8h03, Junior 7h47, Fatou 3h27), 5 absences, 7 motifs, 10 alertes, aucune clôture, aucun férié personnalisé, aucun planning, seul le compte `admin`, une sauvegarde automatique — **zéro erreur JavaScript**.

/* Moteur d'alertes (section 7) — calculé en temps réel à partir des données :
   seuil hebdomadaire, contingent annuel, absences injustifiées, justificatifs manquants,
   pointages manquants et incohérences horaires (sur les 14 derniers jours ouvrés). */
window.PP = window.PP || {};

PP.alertes = (() => {
  const JOURS_RECENTS = 14;

  const TYPES = {
    seuil: 'Seuil hebdomadaire',
    contingent: 'Contingent annuel',
    injustifiee: 'Absence injustifiée',
    justificatif: 'Justificatif manquant',
    manquant: 'Pointage manquant',
    incoherence: 'Incohérence horaire',
    perimetre: 'Périmètre de saisie',
  };

  /* Tous les jours ouvrés passés des JOURS_RECENTS derniers jours */
  const joursRecents = (aujISO) => {
    const jours = [];
    const d = PP.dates.fromISO(aujISO);
    d.setDate(d.getDate() - JOURS_RECENTS);
    for (let garde = 0; garde < JOURS_RECENTS + 1; garde += 1) {
      const iso = PP.dates.toISO(d);
      if (iso < aujISO && iso >= PP.settings.get('dateDebut')
        && !PP.dates.isWeekend(d) && !PP.calculs.estFerie(iso)) {
        jours.push(iso);
      }
      d.setDate(d.getDate() + 1);
    }
    return jours;
  };

  const liste = () => {
    const alertes = [];
    const aujISO = PP.dates.toISO(new Date());
    const actifs = PP.employes.actifs();
    const annee = new Date().getFullYear();

    /* 0. Date de début d'utilisation dans le futur : sans ce rappel, l'absence
       d'alertes de pointage manquant resterait inexpliquée */
    const debutPerimetre = PP.settings.get('dateDebut');
    if (debutPerimetre > aujISO) {
      alertes.push({
        id: `perimetre|${debutPerimetre}`,
        type: 'perimetre',
        gravite: 'info',
        titre: t('alertes.perimetreTitre'),
        detail: t('alertes.perimetreDetail', { date: PP.dates.formatCourt(PP.dates.fromISO(debutPerimetre)) }),
        route: '#/calendrier',
      });
    }

    /* 1. Seuil hebdomadaire dépassé */
    actifs.forEach((e) => {
      const s = PP.calculs.detailSemaine(e.id, aujISO);
      if (s.hs > 0) {
        alertes.push({
          id: `seuil|${e.id}|${s.lundiISO}`,
          type: 'seuil',
          gravite: 'warning',
          titre: t('alertes.seuilTitre', { employe: `${e.prenom} ${e.nom}` }),
          detail: t('alertes.seuilDetail', { base: PP.time.formatHM(s.base), seuil: PP.settings.get('seuilHebdo'), hs: PP.time.formatHM(s.hs) }),
          route: '#/pointage',
        });
      }
    });

    /* 2. Contingent annuel dépassé */
    actifs.forEach((e) => {
      const c = PP.calculs.contingentAnnuel(e.id, annee);
      if (c.depasse) {
        alertes.push({
          id: `contingent|${e.id}|${annee}`,
          type: 'contingent',
          gravite: 'error',
          titre: t('alertes.contingentTitre', { employe: `${e.prenom} ${e.nom}` }),
          detail: t('alertes.contingentDetail', { hs: PP.time.formatHM(c.hs), contingent: PP.settings.get('contingentAnnuelHS') }),
          route: '#/recapitulatif',
        });
      }
    });

    /* 3. Absences injustifiées (motif ABS) */
    PP.absences.list()
      .filter((a) => a.motif === 'ABS' && a.statut !== 'refusee')
      .forEach((a) => {
        const e = PP.employes.get(a.employeId);
        alertes.push({
          id: `injustifiee|${a.id}`,
          type: 'injustifiee',
          gravite: 'warning',
          titre: t('alertes.injustifieeTitre', { employe: e ? `${e.prenom} ${e.nom}` : t('alertes.inconnu') }),
          detail: `${PP.dates.formatCourt(PP.dates.fromISO(a.dateDebut))}${a.dateFin !== a.dateDebut ? ` → ${PP.dates.formatCourt(PP.dates.fromISO(a.dateFin))}` : ''}${a.commentaire ? ` — ${a.commentaire}` : ''}`,
          route: '#/absences',
        });
      });

    /* 3 bis. Justificatif manquant (Maladie / Accident du travail approuvés) */
    PP.absences.list()
      .filter((a) => ['Mal', 'AT'].includes(a.motif) && a.statut === 'approuvee' && !a.justificatif)
      .forEach((a) => {
        const e = PP.employes.get(a.employeId);
        alertes.push({
          id: `justificatif|${a.id}`,
          type: 'justificatif',
          gravite: 'info',
          titre: t('alertes.justificatifTitre', { employe: e ? `${e.prenom} ${e.nom}` : t('alertes.inconnu') }),
          detail: t('alertes.justificatifDetail', { motif: PP.motifs.libelle(a.motif), date: PP.dates.formatCourt(PP.dates.fromISO(a.dateDebut)) }),
          route: '#/absences',
        });
      });

    /* 4. Pointages manquants (regroupés par employé) et 5. incohérences horaires */
    const jours = joursRecents(aujISO);
    actifs.forEach((e) => {
      const manquants = [];
      jours.forEach((iso) => {
        if (e.dateEmbauche && e.dateEmbauche > iso) return;
        const p = PP.pointages.get(e.id, iso);
        const absence = PP.absences.pour(e.id, iso);
        if (!p && !absence) {
          manquants.push(iso);
        } else if (p) {
          const anomalies = PP.pointages.anomalies(p);
          if (anomalies.length) {
            alertes.push({
              id: `incoherence|${e.id}|${iso}`,
              type: 'incoherence',
              gravite: 'warning',
              titre: t('alertes.incoherenceTitre', { employe: `${e.prenom} ${e.nom}` }),
              detail: t('alertes.incoherenceDetail', { date: PP.dates.formatCourt(PP.dates.fromISO(iso)), anomalies: anomalies.join(' · ') }),
              route: '#/pointage',
            });
          }
        }
      });
      if (manquants.length) {
        alertes.push({
          id: `manquant|${e.id}|${manquants[manquants.length - 1]}`,
          type: 'manquant',
          gravite: 'info',
          titre: manquants.length > 1 ? t('alertes.manquantTitrePlusieurs', { employe: `${e.prenom} ${e.nom}` }) : t('alertes.manquantTitreUn', { employe: `${e.prenom} ${e.nom}` }),
          detail: (manquants.length > 1
            ? t('alertes.manquantDetailPlusieurs', {
              n: manquants.length,
              liste: `${manquants.slice(-5).reverse().map((x) => PP.dates.formatCourt(PP.dates.fromISO(x))).join(', ')}${manquants.length > 5 ? '…' : ''}`,
            })
            : t('alertes.manquantDetailUn', {
              liste: manquants.slice(-5).reverse().map((x) => PP.dates.formatCourt(PP.dates.fromISO(x))).join(', '),
            })),
          route: '#/pointage',
        });
      }
    });

    const ordre = { error: 0, warning: 1, info: 2 };
    return alertes.sort((a, b) => ordre[a.gravite] - ordre[b.gravite] || a.id.localeCompare(b.id));
  };

  const nombre = () => liste().length;

  const parGravite = () => {
    const groupes = { error: [], warning: [], info: [] };
    liste().forEach((a) => groupes[a.gravite].push(a));
    return groupes;
  };

  return { TYPES, liste, nombre, parGravite };
})();

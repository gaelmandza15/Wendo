/* Moteur de calcul des heures (section 5)
   — heures normales / supplémentaires par semaine ISO (lundi → dimanche)
   — seuil hebdomadaire configurable, absences comptabilisées au facteur du motif
   — aucune HS le dimanche (heures exclues de la base)
   — répartition nuit (22 h – 6 h) / dimanche / férié pour les majorations
   — arrondi configurable (minute, quart d'heure, demi-heure) et contingent annuel

   Convention de catégorisation : chaque minute appartient à une seule catégorie,
   par priorité nuit > dimanche > férié > normal. */
window.PP = window.PP || {};

PP.calculs = (() => {

  /* ---------- Arrondi ---------- */
  const arrondir = (minutes) => {
    const mode = PP.settings.get('arrondi');
    if (mode === 'quart') return Math.round(minutes / 15) * 15;
    if (mode === 'demi') return Math.round(minutes / 30) * 30;
    return Math.round(minutes);
  };

  /* ---------- Fériés (légaux + entreprise) ---------- */
  const feriesAnnee = (annee) => {
    const map = { ...PP.dates.feries(annee) };
    PP.store.get('feries', []).forEach((f) => {
      if (PP.dates.fromISO(f.date).getFullYear() === annee) map[f.date] = f.libelle;
    });
    return map;
  };

  const estFerie = (dateISO) => feriesAnnee(PP.dates.fromISO(dateISO).getFullYear())[dateISO] || null;

  /* ---------- Journée théorique et contribution des absences ---------- */
  /* Heures journalières théoriques : heures contractuelles / nb de jours ouvrés */
  const heuresJournalieres = (employe) => {
    const nbJours = Math.max(1, PP.settings.get('joursOuvres').length);
    return ((employe?.heuresHebdo || 40) / nbJours) * 60; // minutes
  };

  /* Part d'une absence comptabilisée dans la base hebdomadaire des HS (minutes) */
  const contributionAbsence = (absence, employe) => {
    const facteur = PP.motifs.byCode(absence.motif)?.compteHS ?? 0;
    if (!facteur) return 0;
    if (absence.periode === 'heures') {
      return Math.round(PP.time.dureePaire(absence.heureDebut, absence.heureFin) * facteur);
    }
    const poids = absence.periode === 'journee' ? 1 : 0.5;
    return Math.round(heuresJournalieres(employe) * poids * facteur);
  };

  const absenceDuJour = (employeId, dateISO) => PP.absences.list().find((a) =>
    a.employeId === employeId
    && a.statut === 'approuvee'
    && a.dateDebut <= dateISO && dateISO <= a.dateFin) || null;

  /* ---------- Découpe des créneaux (passage à minuit) ---------- */
  const chevauche = (d1, f1, d2, f2) => Math.max(0, Math.min(f1, f2) - Math.max(d1, d2));
  const minutesNuit = (debut, fin) => chevauche(debut, fin, 0, 6 * 60) + chevauche(debut, fin, 22 * 60, 1440);

  const segments = (p, dateISO) => {
    if (!p) return [];
    const res = [];
    [[p.t1, p.t2], [p.t3, p.t4], [p.t5, p.t6]].forEach(([a, d]) => {
      if (a === null || d === null) return;
      if (d >= a) {
        res.push({ dateISO, debut: a, fin: d });
      } else {
        res.push({ dateISO, debut: a, fin: 1440 });
        const lendemain = PP.dates.fromISO(dateISO);
        lendemain.setDate(lendemain.getDate() + 1);
        res.push({ dateISO: PP.dates.toISO(lendemain), debut: 0, fin: d });
      }
    });
    return res;
  };

  /* ---------- Détail d'un jour ---------- */
  /* p (facultatif) permet de calculer sur des créneaux non encore enregistrés (modal) */
  const detailJour = (employeId, dateISO, p = PP.pointages.get(employeId, dateISO)) => {
    const employe = PP.employes.get(employeId);
    const date = PP.dates.fromISO(dateISO);
    const estDimanche = date.getDay() === 0;
    const ferieNom = estFerie(dateISO);

    let travaille = 0, nuit = 0, dimanche = 0, ferie = 0;
    segments(p, dateISO).forEach((s) => {
      const duree = s.fin - s.debut;
      const nuitSeg = minutesNuit(s.debut, s.fin);
      travaille += duree;
      nuit += nuitSeg;
      const jd = PP.dates.fromISO(s.dateISO);
      if (jd.getDay() === 0) dimanche += duree - nuitSeg;
      else if (estFerie(s.dateISO)) ferie += duree - nuitSeg;
    });

    const absence = absenceDuJour(employeId, dateISO);
    const absenceBase = absence ? contributionAbsence(absence, employe) : 0;

    return {
      dateISO,
      estDimanche,
      ferie: ferieNom,
      travaille,
      nuit,
      dimanche,
      ferieHeures: ferie,
      normal: travaille - nuit - dimanche - ferie,
      absence: absence ? absence.motif : null,
      absenceBase,
      total: travaille,
      arrondi: arrondir(travaille),
    };
  };

  /* ---------- Détail d'une semaine ISO (lundi → dimanche) ---------- */
  const detailSemaine = (employeId, dateISO) => {
    const lundi = PP.pointages.lundiDe(dateISO);
    const seuil = PP.settings.get('seuilHebdo') * 60;

    let travaille = 0, nuit = 0, dimanche = 0, ferie = 0, base = 0, absenceBase = 0;
    const jours = [];
    const d = PP.dates.fromISO(lundi);
    for (let i = 0; i < 7; i += 1) {
      const iso = PP.dates.toISO(d);
      const dj = detailJour(employeId, iso);
      jours.push(dj);
      travaille += dj.travaille;
      nuit += dj.nuit;
      dimanche += dj.dimanche;
      ferie += dj.ferieHeures;
      absenceBase += dj.absenceBase;
      /* Aucune HS le dimanche : heures travaillées et absences du dimanche hors base */
      if (!dj.estDimanche) base += dj.travaille + dj.absenceBase;
      d.setDate(d.getDate() + 1);
    }

    const hs = Math.max(0, base - seuil);
    return {
      lundiISO: lundi,
      jours,
      travaille,
      nuit,
      dimanche,
      ferie,
      absenceBase,
      base,
      seuil,
      hs,
      normales: Math.max(0, travaille - hs),
      depassement: hs > 0,
    };
  };

  /* ---------- Résumé d'une période [debutISO, finISO] ---------- */
  /* Les HS sont comptées par semaine ISO, rattachées au mois de leur lundi. */
  const resumePeriode = (employeId, debutISO, finISO) => {
    const resultat = {
      debutISO, finISO,
      travaille: 0, nuit: 0, dimanche: 0, ferie: 0,
      normales: 0, hs: 0,
      joursAbsence: 0,
      jours: [],
      semaines: [],
    };

    /* Jours de la période */
    const d = PP.dates.fromISO(debutISO);
    const fin = PP.dates.fromISO(finISO);
    for (let garde = 0; d <= fin && garde < 500; garde += 1) {
      const iso = PP.dates.toISO(d);
      const dj = detailJour(employeId, iso);
      resultat.jours.push(dj);
      resultat.travaille += dj.travaille;
      resultat.nuit += dj.nuit;
      resultat.dimanche += dj.dimanche;
      resultat.ferie += dj.ferieHeures;
      if (dj.absence) {
        const absence = absenceDuJour(employeId, iso);
        const poids = PP.absences.PERIODES.find((x) => x.code === absence.periode)?.poids ?? 1;
        resultat.joursAbsence += poids;
      }
      d.setDate(d.getDate() + 1);
    }

    /* Semaines chevauchant la période (rattachées au lundi, pas de double comptage) */
    const lundis = [...new Set(resultat.jours.map((j) => PP.pointages.lundiDe(j.dateISO)))];
    lundis.forEach((lundi) => {
      const s = detailSemaine(employeId, lundi);
      resultat.semaines.push(s);
      resultat.hs += s.hs;
      resultat.normales += s.normales;
    });

    return resultat;
  };

  /* ---------- Contingent annuel d'heures supplémentaires ---------- */
  const contingentAnnuel = (employeId, annee) => {
    const resume = resumePeriode(employeId, `${annee}-01-01`, `${annee}-12-31`);
    const contingent = PP.settings.get('contingentAnnuelHS') * 60;
    return {
      annee,
      hs: resume.hs,
      contingent,
      depasse: resume.hs > contingent,
      reste: Math.max(0, contingent - resume.hs),
    };
  };

  return { arrondir, feriesAnnee, estFerie, heuresJournalieres, contributionAbsence, absenceDuJour, detailJour, detailSemaine, resumePeriode, contingentAnnuel };
})();

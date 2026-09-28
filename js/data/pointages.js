/* Pointages quotidiens — modèle, traçabilité, cumuls (section 3)
   Les heures sont stockées en minutes depuis minuit (null = non renseigné).
   Clés : "employeId|AAAA-MM-JJ" */
window.PP = window.PP || {};

PP.pointages = (() => {
  const CLE = 'pointages';
  const CHAMPS = ['t1', 't2', 't3', 't4', 't5', 't6']; // matin, après-midi, soir

  const list = () => PP.store.get(CLE, {});
  const cle = (employeId, dateISO) => `${employeId}|${dateISO}`;

  const get = (employeId, dateISO) => list()[cle(employeId, dateISO)] || null;

  const base = () => ({
    t1: null, t2: null, t3: null, t4: null, t5: null, t6: null,
    commentaire: '',
    statut: 'saisie',          // saisie | valide | refuse
    statutCommentaire: '',
    historique: [],
  });

  const fmtMin = (m) => (m === null || m === undefined ? '—' : PP.time.toHHMM(m));

  /* Enregistre un patch : tient le journal des modifications et repasse
     un pointage déjà validé en « à valider » dès qu'il change */
  const save = (employeId, dateISO, patch) => {
    const tous = list();
    const c = cle(employeId, dateISO);
    const precedent = { ...base(), ...(tous[c] || {}) };

    const modifs = [];
    CHAMPS.forEach((k) => {
      if (patch[k] !== undefined && patch[k] !== precedent[k]) {
        modifs.push(`${k} : ${fmtMin(precedent[k])} → ${fmtMin(patch[k])}`);
      }
    });
    if (patch.commentaire !== undefined && patch.commentaire !== precedent.commentaire) {
      modifs.push(t('pointage.commentaireModifie'));
    }

    const suivant = { ...precedent, ...patch };
    if (modifs.length) {
      if (precedent.statut === 'valide') suivant.statut = 'saisie';
      suivant.historique = [
        ...precedent.historique,
        { horodatage: new Date().toISOString(), detail: modifs.join(' · '), par: PP.securite?.utilisateur()?.nom || t('securite.utilisateurSysteme') },
      ].slice(-30);
    }
    suivant.modifieLe = new Date().toISOString();
    tous[c] = suivant;
    PP.store.set(CLE, tous);
    return suivant;
  };

  const valider = (employeId, dateISO) =>
    save(employeId, dateISO, { statut: 'valide', statutCommentaire: '' });

  const refuser = (employeId, dateISO, commentaire) =>
    save(employeId, dateISO, { statut: 'refuse', statutCommentaire: commentaire });

  const supprimer = (employeId, dateISO) => {
    const tous = list();
    delete tous[cle(employeId, dateISO)];
    PP.store.set(CLE, tous);
  };

  /* Total travaillé du jour (3 paires, soir compris), en minutes */
  const heuresJour = (p) =>
    p ? PP.time.totalJour([[p.t1, p.t2], [p.t3, p.t4], [p.t5, p.t6]]) : 0;

  /* Incohérences et oublis d'une journée */
  const anomalies = (p) => {
    if (!p) return [];
    const res = [];
    const plages = [
      [p.t1, p.t2, t('pointage.periodeMatinAnomalie')],
      [p.t3, p.t4, t('pointage.periodeApresMidiAnomalie')],
      [p.t5, p.t6, t('pointage.periodeSoirAnomalie')],
    ];
    plages.forEach(([a, d, periode]) => {
      if (a !== null && d === null) res.push(t('pointage.departManquant', { periode }));
      else if (a === null && d !== null) res.push(t('pointage.arriveeManquante', { periode }));
      else if (a !== null && d !== null && d < a) res.push(t('pointage.departApresMinuit', { periode }));
    });
    return res;
  };

  /* Lundi de la semaine ISO contenant la date */
  const lundiDe = (dateISO) => {
    const d = PP.dates.fromISO(dateISO);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return PP.dates.toISO(d);
  };

  /* Cumul de la semaine ISO (lundi → dimanche) pour un employé */
  const heuresSemaine = (employeId, dateISO) => {
    const d = PP.dates.fromISO(lundiDe(dateISO));
    let total = 0;
    for (let i = 0; i < 7; i += 1) {
      total += heuresJour(get(employeId, PP.dates.toISO(d)));
      d.setDate(d.getDate() + 1);
    }
    return total;
  };

  /* Statistiques d'une date (pour l'en-tête de la page Pointage) */
  const statsJour = (dateISO) => {
    const employes = PP.employes.actifs();
    let pointes = 0, aValider = 0, valides = 0, refuses = 0;
    employes.forEach((e) => {
      const p = get(e.id, dateISO);
      if (!p) return;
      pointes += 1;
      if (p.statut === 'valide') valides += 1;
      else if (p.statut === 'refuse') refuses += 1;
      else aValider += 1;
    });
    return { total: employes.length, pointes, aValider, valides, refuses };
  };

  return { list, get, save, valider, refuser, supprimer, heuresJour, heuresSemaine, anomalies, lundiDe, statsJour, CHAMPS };
})();

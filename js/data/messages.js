/* Communication (section 14) — annonces générales + notes internes par employé
   (notifications e-mail / SMS / push : non applicables en 100 % local, voir guide) */
window.PP = window.PP || {};

PP.messages = (() => {
  const CLE = 'messages';

  const list = () => PP.store.get(CLE, []);
  const pour = (employeId) => list()
    .filter((m) => m.employeId === employeId)
    .sort((a, b) => a.horodatage.localeCompare(b.horodatage));
  const annonces = () => list()
    .filter((m) => !m.employeId)
    .sort((a, b) => b.horodatage.localeCompare(a.horodatage));

  const envoyer = (employeId, texte) => {
    /* Le message d'erreur nomme le contenu attendu : annonce générale
       (employeId null) ou note interne rattachée à un employé */
    if (!texte || !texte.trim()) {
      return { erreur: employeId ? t('messages.noteVide') : t('messages.annonceVide') };
    }
    const message = {
      id: PP.utils.uid(),
      employeId,           // null = annonce générale
      auteur: PP.securite?.utilisateur()?.nom || t('messages.systeme'),
      texte: texte.trim(),
      horodatage: new Date().toISOString(),
    };
    PP.store.set(CLE, [...list(), message]);
    return { message };
  };

  const supprimer = (id) => {
    PP.store.set(CLE, list().filter((m) => m.id !== id));
    return { ok: true };
  };

  return { CLE, list, pour, annonces, envoyer, supprimer };
})();

/* Planning type hebdomadaire (section 12) — prévisionnel comparé au réalisé */
window.PP = window.PP || {};

PP.plannings = (() => {
  const CLE = 'plannings';

  const list = () => PP.store.get(CLE, {});
  const de = (employeId) => list()[employeId] || null;

  const enregistrer = (employeId, jours) => {
    PP.store.set(CLE, { ...list(), [employeId]: jours });
    return { ok: true };
  };

  const supprimer = (employeId) => {
    const plannings = list();
    delete plannings[employeId];
    PP.store.set(CLE, plannings);
    return { ok: true };
  };

  /* Heures prévues pour un jour de semaine (0 = dimanche … 6 = samedi) */
  const heuresJour = (planning, jourIndex) => {
    if (!planning) return null;
    const j = planning[String(jourIndex)];
    if (!j) return 0;
    return PP.time.totalJour([[j.t1 ?? null, j.t2 ?? null], [j.t3 ?? null, j.t4 ?? null]]);
  };

  return { CLE, list, de, enregistrer, supprimer, heuresJour };
})();

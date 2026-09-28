/* Employés — modèle + CRUD (section 1) */
window.PP = window.PP || {};

PP.employes = (() => {
  const CLE = 'employes';
  /* Le type de contrat est une DONNÉE persistée : ses valeurs restent en
     français dans le stockage, quel que soit la langue de l'interface. */
  const CONTRATS = ['CDI', 'CDD', 'Intérim', 'Stage', 'Alternance'];

  const list = () => PP.store.get(CLE, []);
  const actifs = () => list().filter((e) => e.actif);
  const get = (id) => list().find((e) => e.id === id) || null;

  /* Normalise et nettoie un enregistrement (anti-injection : échappement fait au rendu) */
  const normalise = (d) => ({
    nom: (d.nom || '').trim(),
    prenom: (d.prenom || '').trim(),
    matricule: (d.matricule || '').trim(),
    poste: (d.poste || '').trim(),
    departement: (d.departement || '').trim(),
    contrat: CONTRATS.includes(d.contrat) ? d.contrat : 'CDI',
    dateEmbauche: d.dateEmbauche || '',
    heuresHebdo: Number(d.heuresHebdo) > 0 ? Number(d.heuresHebdo) : 40,
    tauxHoraire: (d.tauxHoraire === '' || d.tauxHoraire == null) ? null
      : (Number.isFinite(Number(d.tauxHoraire)) ? Number(d.tauxHoraire) : null),
    email: (d.email || '').trim(),
    telephone: (d.telephone || '').trim(),
    managerId: d.managerId || '',
    photo: d.photo || '',
    actif: d.actif === undefined ? true : !!d.actif,
    custom: d.custom && typeof d.custom === 'object' ? d.custom : {},
  });

  const create = (data) => {
    const max = PP.settings.get('maxEmployes');
    if (list().length >= max) return { erreur: t('employes.errMaximumAtteint', { max }) };
    /* Mode démo : plafond volontairement bas. Le refus explique comment lever
       la limite, plutôt que de laisser l'utilisateur devant un bouton inerte. */
    if (PP.licence && !PP.licence.estActive()) {
      const plafond = PP.licence.limites().maxEmployes;
      if (list().length >= plafond) {
        return { erreur: t('licence.demoPlafond', { n: plafond }), demo: true };
      }
    }
    const employe = normalise(data);
    if (!employe.prenom || !employe.nom) return { erreur: t('employes.errNom') };
    if (employe.matricule && list().some((e) => e.matricule.toLowerCase() === employe.matricule.toLowerCase())) {
      return { erreur: t('employes.errMatriculeExiste', { matricule: employe.matricule }) };
    }
    employe.id = PP.utils.uid();
    employe.creeLe = new Date().toISOString();
    PP.store.set(CLE, [...list(), employe]);
    return { employe };
  };

  const update = (id, data) => {
    const employes = list();
    const i = employes.findIndex((e) => e.id === id);
    if (i === -1) return { erreur: t('employes.errIntrouvable') };
    employes[i] = { ...normalise({ ...employes[i], ...data }), id, modifieLe: new Date().toISOString() };
    PP.store.set(CLE, employes);
    return { employe: employes[i] };
  };

  /* Compte les données rattachées à un employé (utilisé avant suppression) */
  const donneesLiees = (id) => ({
    pointages: Object.keys(PP.pointages.list()).filter((cle) => cle.split('|')[0] === id).length,
    absences: PP.absences.list().filter((a) => a.employeId === id).length,
    messages: PP.messages.pour(id).length,
    planning: PP.plannings.de(id) ? 1 : 0,
  });

  /* Supprime l'employé ET ses données rattachées (sinon elles restent
     orphelines dans le stockage, invisibles mais exportées avec la base) */
  const remove = (id) => {
    const compte = donneesLiees(id);
    const pointages = PP.pointages.list();
    Object.keys(pointages).forEach((cle) => {
      if (cle.split('|')[0] === id) delete pointages[cle];
    });
    PP.store.set('pointages', pointages);
    PP.store.set('absences', PP.absences.list().filter((a) => a.employeId !== id));
    PP.store.set('messages', PP.messages.list().filter((m) => m.employeId !== id));
    PP.plannings.supprimer(id);
    PP.store.set(CLE, list().filter((e) => e.id !== id));
    return { ok: true, supprime: compte };
  };

  /* Active / désactive sans supprimer les données */
  const toggleActif = (id) => {
    const employes = list();
    const e = employes.find((x) => x.id === id);
    if (!e) return;
    e.actif = !e.actif;
    e.modifieLe = new Date().toISOString();
    PP.store.set(CLE, employes);
  };

  return { list, actifs, get, create, update, remove, toggleActif, donneesLiees, CONTRATS };
})();

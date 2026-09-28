/* Sauvegardes locales (section 10) — instantanés versionnés de la base, automatiques et manuels */
window.PP = window.PP || {};

PP.sauvegardes = (() => {
  const CLE = 'sauvegardes';
  const MAX_VERSIONS = 10;

  const list = () => PP.store.get(CLE, []);

  /* Les libellés « Manuelle » / « Automatique » sont persistés avec la
     sauvegarde et affichés tels quels : ce sont des valeurs de données, pas de
     l'interface — les traduire ferait diverger l'historique. */

  /* Instantané de toute la base (hors instantanés eux-mêmes) */
  const creer = (label = 'Manuelle') => {
    const donnees = PP.store.tout();
    delete donnees.sauvegardes;
    const entree = {
      id: PP.utils.uid(),
      horodatage: new Date().toISOString(),
      label,
      taille: JSON.stringify(donnees).length,
      nbEmployes: (donnees.employes || []).length,
      donnees,
    };
    PP.store.set(CLE, [entree, ...list()].slice(0, MAX_VERSIONS));
    return entree;
  };

  const supprimer = (id) => {
    PP.store.set(CLE, list().filter((s) => s.id !== id));
    return { ok: true };
  };

  /* Restaure un instantané en préservant l'historique des sauvegardes */
  const restaurer = (id) => {
    const s = list().find((x) => x.id === id);
    if (!s) return { erreur: t('sauvegardesLocales.introuvable') };
    const historique = list();
    PP.store.remplacer(s.donnees);
    PP.store.set(CLE, historique);
    return { ok: true };
  };

  /* Sauvegarde automatique selon l'intervalle configuré (appelée au démarrage) */
  const auto = () => {
    const heures = PP.settings.get('intervalleSauvegardeAuto');
    if (!heures) return null;
    const dernier = PP.store.get('meta', {}).derniereSauvegardeAuto;
    if (dernier && Date.now() - new Date(dernier).getTime() < heures * 3600 * 1000) return null;
    const entree = creer('Automatique');
    PP.store.set('meta', { ...PP.store.get('meta', {}), derniereSauvegardeAuto: new Date().toISOString() });
    return entree;
  };

  const formatTaille = (octets) => (octets < 1024 ? `${octets} o`
    : octets < 1024 * 1024 ? `${(octets / 1024).toFixed(1)} Ko`
    : `${(octets / 1024 / 1024).toFixed(1)} Mo`);

  return { CLE, MAX_VERSIONS, list, creer, supprimer, restaurer, auto, formatTaille };
})();

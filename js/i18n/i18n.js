/* Internationalisation — moteur de traduction.

   Principe : tout le texte visible passe par `PP.t('clef')`, qui lit le
   dictionnaire de la langue courante. La clef est une chaîne pointée
   (« pointage.titre ») ; si elle manque, on retombe sur le français puis sur la
   clef elle-même, pour qu'un oubli se voie sans casser l'écran.

   Les dictionnaires sont dans js/i18n/fr.js et js/i18n/en.js. Ajouter une langue
   revient à créer un fichier de plus et à l'enregistrer ici. */

window.PP = window.PP || {};

PP.i18n = (() => {
  const LANGUES = [
    { code: 'fr', libelle: 'Français', drapeau: 'FR' },
    { code: 'en', libelle: 'English', drapeau: 'EN' },
  ];

  /* Dictionnaires disponibles : { fr: {...}, en: {...} } */
  const dictionnaires = {};

  /* Langue de référence : sert de repli si une clef manque ailleurs */
  const LANGUE_REFERENCE = 'fr';

  let courante = LANGUE_REFERENCE;
  const abonnes = new Set();

  const enregistrer = (code, dico) => { dictionnaires[code] = dico; };

  /** Résout une clef pointée dans un dictionnaire. */
  const chercher = (dico, clef) => {
    if (!dico) return undefined;
    return String(clef).split('.').reduce((v, part) => (v == null ? undefined : v[part]), dico);
  };

  /**
   * Traduit une clef. Les `params` remplacent les jetons {nom} :
   *   PP.t('pointage.jours', { n: 3 })  →  « 3 jours »
   *
   * Une clef peut désigner un objet ou un tableau (listes de mois, table des
   * jours fériés) : on le renvoie alors tel quel, sans le convertir en texte.
   */
  const t = (clef, params = null) => {
    let valeur = chercher(dictionnaires[courante], clef);
    if (valeur === undefined) valeur = chercher(dictionnaires[LANGUE_REFERENCE], clef);
    /* Une clef absente partout s'affiche telle quelle : l'oubli est visible à
       l'écran plutôt que de laisser un blanc inexplicable. */
    if (valeur === undefined) return clef;
    if (typeof valeur !== 'string') return valeur;
    if (!params) return valeur;
    return valeur.replace(/\{(\w+)\}/g, (m, nom) => (params[nom] !== undefined ? params[nom] : m));
  };

  /** Traduit une clef en texte ; utilise `t` en convertissant le résultat. */
  const texte = (clef, params) => {
    const v = t(clef, params);
    return v == null ? '' : String(v);
  };

  /** Choisit la langue : 'fr' | 'en'. Notifie les abonnés. */
  const definir = (code) => {
    if (!dictionnaires[code] || code === courante) return;
    courante = code;
    document.documentElement.lang = code;
    abonnes.forEach((fn) => {
      try { fn(code); } catch (e) { console.error(e); }
    });
  };

  /** S'abonne aux changements de langue (retourne une fonction de désabonnement). */
  const surChangement = (fn) => {
    abonnes.add(fn);
    return () => abonnes.delete(fn);
  };

  const langue = () => courante;
  const langueReference = () => LANGUE_REFERENCE;

  /** Applique la langue aux éléments marqués `data-i18n` (utilisé dans index.html). */
  const appliquerAuDom = (racine = document) => {
    racine.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = t(el.dataset.i18n);
    });
    racine.querySelectorAll('[data-i18n-titre]').forEach((el) => {
      el.title = t(el.dataset.i18nTitre);
    });
    racine.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      el.placeholder = t(el.dataset.i18nPlaceholder);
    });
  };

  return {
    LANGUES, enregistrer, t, texte, definir, langue, langueReference, surChangement, appliquerAuDom,
    get pret() { return Object.keys(dictionnaires).length > 0; },
  };
})();

/* Raccourcis globaux : `t` renvoie la valeur brute (chaîne, tableau ou objet),
   `tx` garantit une chaîne — à utiliser quand le résultat est inséré dans du HTML. */
window.t = (clef, params) => PP.i18n.t(clef, params);
window.tx = (clef, params) => PP.i18n.texte(clef, params);

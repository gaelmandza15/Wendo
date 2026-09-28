/* Persistance : stockage + notification des changements par clé.

   Deux modes, choisis automatiquement au démarrage :

   • Application de bureau (Tauri) — la vérité est un fichier JSON sur le disque
     (%APPDATA%\Wendo\donnees.json). Comme l'écriture disque est asynchrone alors
     que tout le code appelant est synchrone, l'état complet est gardé en mémoire :
     `get` lit la mémoire, `set` met à jour la mémoire puis déclenche une écriture
     différée (regroupée, pour ne pas écrire 20 fois lors d'une saisie).

   • Navigateur — l'ancien comportement localStorage est conservé tel quel, pour
     que `index.html` ouvert directement continue de fonctionner. */

window.PP = window.PP || {};

PP.store = (() => {
  const KEY = 'pointagepro.v1';
  /* Délai de regroupement : une rafale de modifications (import, sauvegarde)
     ne produit qu'une seule écriture disque. */
  const DELAI_ECRITURE = 400;

  let state = {};
  let pret = false;
  let mode = 'web';                 /* 'web' | 'bureau' */
  let cheminFichier = null;
  let minuterie = null;
  const listeners = new Map();      /* clé -> Set<fn> */
  const enAttente = [];             /* appels résolus après le chargement */
  let echecEcriture = null;

  const estBureau = () => typeof window.__TAURI_INTERNALS__ !== 'undefined';

  /* ---------- Diagnostics ---------- */
  const etat = () => ({
    mode,
    chemin: cheminFichier,
    pret,
    erreur: echecEcriture,
    cles: Object.keys(state).length,
  });

  /* ---------- Mode navigateur ---------- */
  const chargerLocal = () => {
    try { state = JSON.parse(localStorage.getItem(KEY)) || {}; }
    catch { state = {}; }
  };

  const ecrireLocal = () => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) { console.error('Sauvegarde impossible (stockage plein ?)', e); }
  };

  /* ---------- Mode bureau ---------- */
  const appeler = (commande, args = {}) => {
    /* On passe par l'API globale exposée par Tauri : cela évite d'embarquer un
       paquet npm et garde le projet sans étape de construction front. */
    return window.__TAURI_INTERNALS__.invoke(commande, args);
  };

  const chargerDisque = async () => {
    cheminFichier = await appeler('chemin_donnees');
    const contenu = await appeler('lire_donnees');
    if (contenu) {
      try { state = JSON.parse(contenu) || {}; }
      catch (e) {
        /* Fichier corrompu : on le met de côté plutôt que de le perdre, et on
           repart d'une base vide pour que l'application reste utilisable. */
        const secours = `${cheminFichier}.corrompu-${Date.now()}`;
        try { await appeler('ecrire_fichier', { chemin: secours, contenu: Array.from(new TextEncoder().encode(contenu)) }); } catch (e2) { /* on continue */ }
        console.error('Fichier de données illisible, copie conservée sous', secours, e);
        echecEcriture = t('donnees.fichierIllisible', { secours });
        state = {};
      }
    } else {
      state = {};
    }
  };

  const ecrireDisque = () => {
    if (minuterie) clearTimeout(minuterie);
    minuterie = setTimeout(async () => {
      minuterie = null;
      try {
        await appeler('ecrire_donnees', { contenu: JSON.stringify(state) });
        echecEcriture = null;
      } catch (e) {
        echecEcriture = String(e);
        console.error('Écriture du fichier de données impossible :', e);
        if (PP.ui && PP.ui.toast) PP.ui.toast(t('donnees.enregistrementEchec', { erreur: echecEcriture }), 'error');
      }
    }, DELAI_ECRITURE);
  };

  /* Écriture immédiate — utilisée avant une fermeture ou un rechargement,
     pour ne pas perdre les dernières modifications en attente. */
  const forcerEcriture = () => {
    if (mode !== 'bureau') return Promise.resolve();
    if (minuterie) { clearTimeout(minuterie); minuterie = null; }
    return appeler('ecrire_donnees', { contenu: JSON.stringify(state) })
      .catch((e) => { echecEcriture = String(e); console.error(e); });
  };

  /* ---------- Démarrage ---------- */
  const demarrer = async () => {
    if (estBureau()) {
      mode = 'bureau';
      try {
        await chargerDisque();
      } catch (e) {
        /* Le fichier est inaccessible : on continue en mémoire pour que
           l'utilisateur voie l'interface et puisse exporter ses données. */
        echecEcriture = t('donnees.fichierInaccessible', { erreur: e });
        console.error(echecEcriture);
        state = {};
      }
    } else {
      mode = 'web';
      chargerLocal();
    }
    pret = true;
    enAttente.splice(0).forEach((fn) => fn());
  };

  /* Les modules qui lisent le stockage dès leur chargement attendent que le
     fichier soit lu (voir la fin de ce fichier). */
  const quandPret = (fn) => (pret ? fn() : enAttente.push(fn));

  /* ---------- API publique ---------- */
  const get = (key, defaut) =>
    (key in state && state[key] !== undefined) ? state[key] : defaut;

  const set = (key, value) => {
    state[key] = value;
    if (mode === 'bureau') ecrireDisque(); else ecrireLocal();
    (listeners.get(key) || []).forEach((fn) => {
      try { fn(value); } catch (e) { console.error(e); }
    });
  };

  const subscribe = (key, fn) => {
    if (!listeners.has(key)) listeners.set(key, new Set());
    listeners.get(key).add(fn);
    return () => listeners.get(key).delete(fn);
  };

  /* Réinitialisation complète (restauration / remise à zéro) */
  const reset = () => {
    state = {};
    if (mode === 'bureau') forcerEcriture(); else localStorage.removeItem(KEY);
  };

  /* Accès à l'état complet (export / sauvegarde) */
  const tout = () => ({ ...state });

  /* Remplace l'état complet (import / restauration) */
  const remplacer = (nouvelEtat) => {
    state = { ...nouvelEtat };
    if (mode === 'bureau') forcerEcriture(); else ecrireLocal();
  };

  /* Enregistre avant que la fenêtre ne se ferme */
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => { if (mode === 'bureau') forcerEcriture(); });
    /* Ctrl+S dans l'application enregistre aussi : réflexe courant */
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && mode === 'bureau') {
        e.preventDefault();
        forcerEcriture().then(() => { if (PP.ui && PP.ui.toast) PP.ui.toast(t('donnees.donneesEnregistrees'), 'success'); });
      }
    });
  }

  return {
    get, set, subscribe, reset, tout, remplacer, KEY,
    demarrer, quandPret, forcerEcriture, etat,
    get estPret() { return pret; },
    get mode() { return mode; },
  };
})();

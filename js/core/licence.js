/* Licences côté interface.

   Ce module est le seul point de contact entre l'interface et le système de
   licences. Il expose :

     • PP.licence.etat()       — état courant, lu localement (instantané)
     • PP.licence.activer(cle) — échange la clé d'achat contre une activation
     • PP.licence.autorise()   — vrai si l'action demandée est permise
     • PP.licence.limites()    — plafonds du mode démo

   EN NAVIGATEUR, il n'y a pas de vérification : les commandes Tauri n'existent
   pas. L'application reste alors en mode démo. C'est volontaire — le système de
   licences protège la version de bureau distribuée, pas la page ouverte en
   double-clic (qui suppose que l'utilisateur a déjà les sources). */

window.PP = window.PP || {};

PP.licence = (() => {
  /* Plafonds du mode démo. Choisis « gênants mais utilisables » : le client
     doit pouvoir essayer sérieusement, pas tenir une boutique (voir §6.4 du
     guide de licences). */
  const DEMO = {
    maxEmployes: 5,
    exports: false,
  };

  /* Ce que le mode démo autorise malgré tout : tout le reste. */
  const actif = () => typeof window.__TAURI_INTERNALS__ !== 'undefined';

  const appeler = (commande, args = {}) => window.__TAURI_INTERNALS__.invoke(commande, args);

  let cache = null;

  /** État courant. En navigateur : mode démo sans code machine. */
  const etat = () => {
    if (!actif()) {
      return {
        active: false,
        situation: 'demo',
        codeMachine: '',
        activeLe: 0,
        verifieLe: 0,
      };
    }
    return cache || { active: false, situation: 'demo', codeMachine: '', activeLe: 0, verifieLe: 0 };
  };

  /** Recharge l'état depuis le processus principal (lecture locale, sans réseau). */
  const rafraichir = async () => {
    if (!actif()) return etat();
    try {
      cache = await appeler('etat_licence');
    } catch (e) {
      console.error('État de licence illisible :', e);
    }
    return etat();
  };

  /**
   * Active une licence à partir de la clé d'achat.
   * @returns {Promise<{ok: boolean, message: string, code: string}>}
   */
  const activer = async (cle) => {
    if (!actif()) {
      return {
        ok: false,
        message: t('licence.navigateur'),
        code: 'navigateur',
      };
    }
    try {
      const resultat = await appeler('activer_licence', { cle: String(cle || '').trim() });
      await rafraichir();
      return resultat;
    } catch (e) {
      /* Une erreur de transport n'est PAS un rejet de la clé : le message doit
         inviter à réessayer, jamais laisser croire à une clé invalide. */
      return {
        ok: false,
        message: t('licence.erreurTransport'),
        code: 'network-error',
      };
    }
  };

  const desactiver = async () => {
    if (!actif()) return etat();
    try {
      cache = await appeler('desactiver_licence');
    } catch (e) {
      console.error(e);
    }
    return etat();
  };

  /* Adresse de la boutique, dupliquée ici pour le mode navigateur où le
     processus principal n'existe pas. Elle doit rester identique à
     `URL_ACHAT` dans src/commandes_licence.rs. */
  const URL_ACHAT = 'https://litelogic-software.mychariow.store/prd_wjpxwc3x';

  /**
   * Ouvre la page d'achat.
   *
   * En application de bureau, on passe par le processus principal : ouvrir le
   * navigateur du système depuis une page web est bloqué par la CSP. Dans un
   * simple navigateur, on ouvre un onglet — c'est le même résultat.
   */
  const ouvrirPageAchat = async () => {
    if (actif()) {
      try {
        await appeler('ouvrir_page_achat');
        return;
      } catch (e) {
        /* Le système n'a pas pu ouvrir le navigateur : on affiche l'adresse */
        PP.ui.toast(t('licence.copierAdresse'), 'info');
        return;
      }
    }
    /* Mode navigateur : nouvel onglet. `noopener` empêche la page ouverte de
       manipuler celle-ci (protection standard contre le tabnabbing). */
    const fenetre = window.open(URL_ACHAT, '_blank', 'noopener');
    /* Un bloqueur de fenêtres peut refuser : on donne alors l'adresse. */
    if (!fenetre) PP.ui.toast(t('licence.copierAdresse'), 'info');
  };

  /** Vrai si l'application est activée. */
  const estActive = () => etat().active;

  /**
   * Vrai si l'action demandée est permise.
   * Utilisé par les écrans pour bloquer ce que le mode démo n'autorise pas.
   */
  const autorise = (quoi) => {
    if (estActive()) return true;
    switch (quoi) {
      case 'exporter':
        return DEMO.exports;
      case 'ajouterEmploye': {
        /* On autorise tant qu'on n'a pas atteint le plafond ; le refus est
           expliqué au moment de l'ajout, pas en cachant le bouton. */
        const nombre = PP.employes ? PP.employes.list().length : 0;
        return nombre < DEMO.maxEmployes;
      }
      default:
        return true;
    }
  };

  /** Plafonds du mode démo, pour les afficher à l'utilisateur. */
  const limites = () => ({ ...DEMO });

  /** Nombre d'employés restants avant le plafond démo (0 si activé). */
  const margeEmployes = () => {
    if (estActive()) return Infinity;
    const nombre = PP.employes ? PP.employes.list().length : 0;
    return Math.max(0, DEMO.maxEmployes - nombre);
  };

  /** Code machine, à communiquer à l'éditeur en cas de problème. */
  const codeMachine = async () => {
    if (!actif()) return '';
    try {
      return await appeler('code_machine');
    } catch {
      return '';
    }
  };

  /* L'état est chargé au démarrage, puis rafraîchi à chaque affichage de
     l'écran de licence. Aucun appel réseau ici : la fonction `etat_licence`
     du processus principal déclenche en arrière-plan une re-validation si
     elle est échue. */
  if (typeof window !== 'undefined') {
    window.addEventListener('load', () => { rafraichir(); });
  }

  return {
    DEMO, etat, rafraichir, activer, desactiver, ouvrirPageAchat,
    estActive, autorise, limites, margeEmployes, codeMachine,
    get actif() { return actif(); },
  };
})();

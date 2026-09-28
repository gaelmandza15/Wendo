/* Pont vers l'application de bureau.

   Ces quelques fonctions remplacent les paquets @tauri-apps/* : ils sont écrits
   en modules ES, alors que Wendo est bâti en scripts classiques (pour rester
   ouvrable en double-clic). Les appels sous-jacents sont de simples `invoke`,
   donc les réécrire ici évite d'introduire une étape de construction côté front.

   Dans un navigateur, ce fichier ne fait rien : `window.__TAURI__` reste absent
   et le code retombe sur les comportements web (téléchargements, localStorage). */
(() => {
  if (typeof window.__TAURI_INTERNALS__ === 'undefined') return;

  const appeler = (commande, args) => window.__TAURI_INTERNALS__.invoke(commande, args);

  window.__TAURI__ = {
    /* Boîte de dialogue native « Enregistrer sous ». Renvoie le chemin choisi,
       ou null si l'utilisateur annule. */
    dialog: {
      save: (options = {}) => appeler('plugin:dialog|save', { options }),
      open: (options = {}) => appeler('plugin:dialog|open', { options }),
      message: (message, options = {}) => {
        const opts = typeof options === 'string' ? { title: options } : options;
        return appeler('plugin:dialog|message', {
          message: String(message),
          title: opts.title,
          kind: opts.kind,
        });
      },
      ask: (message, options = {}) => {
        const opts = typeof options === 'string' ? { title: options } : options;
        return appeler('plugin:dialog|ask', {
          message: String(message),
          title: opts.title,
          kind: opts.kind,
        });
      },
    },
    /* Accès direct aux commandes de l'application (stockage, chemins, fichiers) */
    invoke: appeler,
  };

  /* Le bureau signale sa présence pour les tests et les messages d'interface */
  window.__WENDO_BUREAU__ = true;
})();

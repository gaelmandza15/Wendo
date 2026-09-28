/* Entrées / sorties fichiers — enregistrement des exports, lecture, CSV.

   Deux modes, choisis à l'exécution :

   • Application de bureau (Tauri) — les exports sont écrits directement dans un
     fichier, à côté de l'application, et l'utilisateur est prévenu du chemin.
     Aucune boîte de dialogue n'est imposée : « Word direct », « Exporter (CSV) »
     et l'export Excel restent des gestes en un clic.

   • Navigateur — l'ancien téléchargement par lien Blob est conservé. */
window.PP = window.PP || {};

PP.io = (() => {
  const estBureau = () => typeof window.__TAURI_INTERNALS__ !== 'undefined';
  const appeler = (commande, args = {}) => window.__TAURI_INTERNALS__.invoke(commande, args);

  /* Dossier de destination des exports, résolu une fois puis mémorisé */
  let dossierExports = null;

  const dossierCible = async () => {
    if (dossierExports) return dossierExports;
    try {
      /* Documents s'il existe, sinon le dossier de travail de l'application */
      dossierExports = await appeler('chemin_dossier', { quel: 'documents' });
    } catch (e) {
      dossierExports = await appeler('chemin_dossier', { quel: 'donnees' });
    }
    return dossierExports;
  };

  /** Convertit le contenu (texte, Blob ou octets) en tableau d'octets. */
  const enOctets = async (contenu) => {
    if (contenu instanceof Blob) return Array.from(new Uint8Array(await contenu.arrayBuffer()));
    if (contenu instanceof Uint8Array) return Array.from(contenu);
    if (contenu instanceof ArrayBuffer) return Array.from(new Uint8Array(contenu));
    return Array.from(new TextEncoder().encode(String(contenu)));
  };

  /* Nettoie un nom de fichier des caractères interdits par Windows */
  const nomSur = (nom) => nom.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').replace(/\s+/g, ' ').trim();

  /**
   * Enregistre un fichier.
   *
   * C'est le point de passage UNIQUE de tous les exports (Word, Excel, CSV,
   * PDF, HTML) : la vérification de licence s'y trouve donc une seule fois,
   * et aucun export ne peut l'oublier.
   *
   * @returns {Promise<{chemin: string, navigateur: boolean}|null>} `null` si
   *          l'enregistrement a échoué — l'appelant décide quoi dire à l'utilisateur.
   */
  const enregistrer = async (nom, contenu, type = 'text/plain;charset=utf-8') => {
    /* Mode démo : les exports sont réservés à la version activée. On refuse
       ici plutôt que de masquer les boutons, pour que la raison soit dite. */
    if (PP.licence && !PP.licence.estActive() && !PP.licence.limites().exports) {
      PP.ui.toast(t('licence.demoExport'), 'warning');
      return null;
    }
    if (estBureau()) {
      try {
        const dossier = await dossierCible();
        const chemin = `${dossier}\\${nomSur(nom)}`;
        const ecrit = await appeler('ecrire_fichier', { chemin, contenu: await enOctets(contenu) });
        return { chemin: ecrit, navigateur: false };
      } catch (e) {
        console.error('Enregistrement impossible :', e);
        return null;
      }
    }
    /* Navigateur : lien de téléchargement classique */
    const blob = contenu instanceof Blob ? contenu : new Blob([contenu], { type });
    const lien = document.createElement('a');
    lien.href = URL.createObjectURL(blob);
    lien.download = nomSur(nom);
    lien.click();
    URL.revokeObjectURL(lien.href);
    return { chemin: nomSur(nom), navigateur: true };
  };

  /* Version synchrone conservée pour le code existant : elle lance
     l'enregistrement et le signale par un toast quand c'est terminé. */
  const telecharger = (nom, contenu, type = 'text/plain;charset=utf-8') => {
    enregistrer(nom, contenu, type).then((r) => {
      if (!r) { PP.ui.toast(t('donnees.enregistrementImpossible'), 'error'); return; }
      if (!r.navigateur) PP.ui.toast(t('donnees.enregistre', { chemin: r.chemin }), 'success');
    });
  };

  /** Ouvre une boîte de dialogue « Enregistrer sous » et écrit le fichier. */
  const enregistrerSous = async (nom, contenu, filtres = null) => {
    if (!estBureau()) { telecharger(nom, contenu); return null; }
    try {
      const { save } = window.__TAURI__.dialog;
      const chemin = await save({
        defaultPath: `${await dossierCible()}\\${nomSur(nom)}`,
        filters: filtres || undefined,
      });
      if (!chemin) return null; /* l'utilisateur a annulé */
      const ecrit = await appeler('ecrire_fichier', { chemin, contenu: await enOctets(contenu) });
      PP.ui.toast(t('donnees.enregistre', { chemin: ecrit }), 'success');
      return ecrit;
    } catch (e) {
      PP.ui.toast(t('donnees.enregistrementEchec', { erreur: e }), 'error');
      return null;
    }
  };

  /* Lit un fichier texte (import) */
  const lireTexte = (fichier) => new Promise((res, rej) => {
    const lecteur = new FileReader();
    lecteur.onload = () => res(String(lecteur.result));
    lecteur.onerror = rej;
    lecteur.readAsText(fichier);
  });

  /* Parse un CSV simple (détection ; ou , — sans échappement de guillemets multi-lignes) */
  const parserCSV = (texte) => {
    const lignes = texte.replace(/^\ufeff/, '').split(/\r?\n/).filter((l) => l.trim());
    if (lignes.length === 0) return [];
    const separateur = (lignes[0].match(/;/g) || []).length >= (lignes[0].match(/,/g) || []).length ? ';' : ',';
    const enleverGuillemets = (v) => v.trim().replace(/^"(.*)"$/, '$1');
    const entetes = lignes[0].split(separateur).map((h) => enleverGuillemets(h));
    return lignes.slice(1).map((ligne) => {
      const cellules = ligne.split(separateur).map(enleverGuillemets);
      const objet = {};
      entetes.forEach((h, i) => { objet[h.trim()] = (cellules[i] ?? '').trim(); });
      return objet;
    });
  };

  const horodatageFichier = () => {
    const d = new Date();
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
  };

  /* Ouvre le dossier des exports dans l'explorateur — utile quand on vient
     d'enregistrer plusieurs documents d'affilée. */
  const ouvrirDossierExports = async () => {
    if (!estBureau()) return;
    const dossier = await dossierCible();
    try {
      await appeler('plugin:opener|open_path', { path: dossier });
    } catch (e) {
      PP.ui.toast(t('donnees.dossierExports', { dossier }), 'info');
    }
  };

  return {
    telecharger, enregistrer, enregistrerSous, lireTexte, parserCSV,
    horodatageFichier, ouvrirDossierExports,
    get dossierExports() { return dossierExports; },
  };
})();

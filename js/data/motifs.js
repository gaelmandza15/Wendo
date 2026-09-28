/* Motifs d'absence — CRUD complet (section 4)
   compteHS : part comptabilisée dans le seuil hebdomadaire (0, 1/3, 1/2, 1) */
window.PP = window.PP || {};

PP.motifs = (() => {
  const CLE = 'motifs';
  const COULEURS = ['sky', 'emerald', 'amber', 'rose', 'red', 'violet', 'teal', 'slate'];

  /* `libelleOrigine` est le nom français d'origine : il sert uniquement à la
     migration (reconnaître un motif que l'utilisateur n'a pas renommé), jamais
     à l'affichage. Voir la migration « motifsV3 » dans js/app.js. */
  const DEFAUTS = [
    { code: 'ABS',  clef: 'motifs.ABS',  libelleOrigine: 'Absence injustifiée', compteHS: 0,   couleur: 'red',    exigeCommentaire: true },
    { code: 'CP',   clef: 'motifs.CP',   libelleOrigine: 'Congé payé',          compteHS: 0,   couleur: 'sky',    exigeCommentaire: false },
    { code: 'Form', clef: 'motifs.Form', libelleOrigine: 'Formation',           compteHS: 1/3, couleur: 'violet', exigeCommentaire: false },
    { code: 'EF',   clef: 'motifs.EF',   libelleOrigine: 'Événement familial',  compteHS: 1/3, couleur: 'teal',   exigeCommentaire: false },
    { code: 'Mal',  clef: 'motifs.Mal',  libelleOrigine: 'Maladie',             compteHS: 0,   couleur: 'rose',   exigeCommentaire: false },
    { code: 'AT',   clef: 'motifs.AT',   libelleOrigine: 'Accident de travail', compteHS: 0,   couleur: 'slate',  exigeCommentaire: false },
    { code: 'RTT',  clef: 'motifs.RTT',  libelleOrigine: 'RTT',                 compteHS: 0,   couleur: 'amber',  exigeCommentaire: false },
  ];

  /**
   * Motifs pour l'AFFICHAGE : `libelle` est résolu dans la langue courante.
   *
   * Les motifs livrés par défaut portent une clef de traduction (`clef`) ; les
   * motifs créés par l'utilisateur portent leur propre `libelle`, affiché tel
   * quel dans la langue où il a été saisi — le traduire n'aurait pas de sens.
   *
   * On expose `libelle` (et non un autre nom) pour que tout le code existant,
   * qui lit `m.libelle`, suive la langue sans modification.
   */
  const list = () => PP.store.get(CLE, DEFAUTS).map((m) => ({
    ...m,
    libelle: m.clef ? t(m.clef) : (m.libelle || m.code),
  }));

  /** Motifs BRUTS, tels qu'enregistrés : à utiliser pour modifier ou sauvegarder. */
  const listBrute = () => PP.store.get(CLE, DEFAUTS).map((m) => ({ ...m }));

  const byCode = (code) => list().find((m) => m.code === code) || null;

  /** Nom affiché d'un motif (accepte un code ou un motif déjà résolu). */
  const libelle = (codeOuMotif) => {
    const m = (codeOuMotif && typeof codeOuMotif === 'object') ? codeOuMotif : byCode(codeOuMotif);
    if (!m) return '';
    if (m.libelle) return m.libelle;
    if (m.clef) return t(m.clef);
    return m.code;
  };

  /* Libellé du facteur HS (pour l'affichage) */
  const facteurLibelle = (f) => {
    if (!f) return '—';
    if (Math.abs(f - 1/3) < 0.01) return '⅓ HS';
    if (Math.abs(f - 0.5) < 0.01) return '½ HS';
    if (f === 1) return 'HS ×1';
    return `×${f}`;
  };

  const create = (d) => {
    const motifs = listBrute();
    const code = (d.code || '').trim();
    if (!code) return { erreur: t('motifs.errCodeObligatoire') };
    if (code.length > 6) return { erreur: t('motifs.errCodeLong') };
    if (motifs.some((m) => m.code.toLowerCase() === code.toLowerCase())) {
      return { erreur: t('motifs.errCodeExiste', { code }) };
    }
    const motif = {
      code,
      libelle: (d.libelle || '').trim() || code,
      compteHS: Number(d.compteHS) || 0,
      couleur: COULEURS.includes(d.couleur) ? d.couleur : 'sky',
      exigeCommentaire: !!d.exigeCommentaire,
    };
    PP.store.set(CLE, [...motifs, motif]);
    return { motif };
  };

  const update = (code, patch) => {
    const motifs = listBrute();
    const i = motifs.findIndex((m) => m.code === code);
    if (i === -1) return { erreur: t('motifs.errIntrouvable') };
    motifs[i] = {
      ...motifs[i],
      libelle: (patch.libelle !== undefined ? patch.libelle : motifs[i].libelle).trim() || code,
      compteHS: patch.compteHS !== undefined ? Number(patch.compteHS) || 0 : motifs[i].compteHS,
      couleur: patch.couleur !== undefined && COULEURS.includes(patch.couleur) ? patch.couleur : motifs[i].couleur,
      exigeCommentaire: patch.exigeCommentaire !== undefined ? !!patch.exigeCommentaire : motifs[i].exigeCommentaire,
    };
    PP.store.set(CLE, motifs);
    return { motif: motifs[i] };
  };

  /* Suppression refusée si le motif est utilisé par des absences */
  const remove = (code) => {
    if (PP.absences?.parMotif(code).length) {
      return { erreur: t('motifs.errUtilise', { code }) };
    }
    PP.store.set(CLE, listBrute().filter((m) => m.code !== code));
    return { ok: true };
  };

  return { CLE, DEFAUTS, COULEURS, list, listBrute, byCode, libelle, facteurLibelle, create, update, remove };
})();

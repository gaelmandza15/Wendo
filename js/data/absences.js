/* Absences — modèle, statuts, récurrences hebdomadaires, justificatifs (section 4) */
window.PP = window.PP || {};

PP.absences = (() => {
  const CLE = 'absences';

  /* `code` est la valeur persistée dans les absences : elle ne change jamais.
     `clef` résout le libellé dans la langue courante ; on expose `libelle` pour
     que le code qui le lit (aucun aujourd'hui, mais l'API l'a toujours offert)
     continue de fonctionner. */
  const PERIODES = [
    { code: 'journee',   clef: 'absences.periode_journee',   poids: 1 },
    { code: 'matin',     clef: 'absences.periode_matin',     poids: 0.5 },
    { code: 'apresmidi', clef: 'absences.periode_apresmidi', poids: 0.5 },
    { code: 'heures',    clef: 'absences.periode_heures',    poids: 0 },
  ];

  const list = () => PP.store.get(CLE, []);
  const get = (id) => list().find((a) => a.id === id) || null;
  const parMotif = (code) => list().filter((a) => a.motif === code);

  /* Accepte « 10h30 », « 10:30 » ou déjà des minutes → minutes depuis minuit ou null */
  const heure = (v) => {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return v;
    return PP.time.parse(v);
  };

  const normalise = (d) => ({
    employeId: d.employeId || '',
    motif: d.motif || '',
    dateDebut: d.dateDebut || '',
    dateFin: d.dateFin || d.dateDebut || '',
    periode: PERIODES.some((p) => p.code === d.periode) ? d.periode : 'journee',
    heureDebut: d.periode === 'heures' ? heure(d.heureDebut) : null,
    heureFin: d.periode === 'heures' ? heure(d.heureFin) : null,
    commentaire: (d.commentaire || '').trim(),
    justificatif: d.justificatif || null, // { nom, taille, type, data }
    statut: ['attente', 'approuvee', 'refusee'].includes(d.statut) ? d.statut : 'attente',
    statutCommentaire: d.statutCommentaire || '',
  });

  /* Jour ouvré : ni week-end ni férié (légaux + personnalisés) */
  const estOuvre = (iso) => !PP.dates.isWeekend(PP.dates.fromISO(iso)) && !PP.calculs.estFerie(iso);

  /* Contrôles métier — renvoie un message d'erreur ou null.
     idExclu : id de l'absence en cours de modification (pour ignorer son propre chevauchement) */
  const controle = (a, idExclu) => {
    if (!a.employeId || !PP.employes.get(a.employeId)) return t('absences.employeRequis');
    if (!PP.motifs.byCode(a.motif)) return t('absences.errMotifRequis');
    if (!a.dateDebut) return t('absences.errDateDebut');
    if (a.dateFin < a.dateDebut) return t('absences.errDateFinAvantDebut');
    if (a.periode === 'heures' && (a.heureDebut === null || a.heureFin === null)) return t('absences.errPlageIncomplete');
    if (a.periode === 'heures' && a.heureDebut !== null && a.heureFin !== null && a.heureFin === a.heureDebut) return t('absences.errPlageVide');
    const motif = PP.motifs.byCode(a.motif);
    if (motif.exigeCommentaire && !a.commentaire) return t('absences.errCommentaireMotif', { motif: motif.libelle });
    /* Chevauchement avec une autre absence non refusée du même employé */
    const doublon = list().find((x) =>
      x.id !== idExclu
      && x.employeId === a.employeId
      && x.statut !== 'refusee'
      && x.dateDebut <= a.dateFin && a.dateDebut <= x.dateFin);
    if (doublon) {
      const plage = doublon.dateDebut === doublon.dateFin
        ? t('absences.plageUnJour', { date: PP.dates.formatCourt(PP.dates.fromISO(doublon.dateDebut)) })
        : t('absences.plagePlusieursJours', {
          debut: PP.dates.formatCourt(PP.dates.fromISO(doublon.dateDebut)),
          fin: PP.dates.formatCourt(PP.dates.fromISO(doublon.dateFin)),
        });
      return t('absences.errDoublon', { motif: doublon.motif, plage });
    }
    return null;
  };

  const create = (d) => {
    const a = normalise(d);
    const erreur = controle(a);
    if (erreur) return { erreur };
    a.id = PP.utils.uid();
    a.creeLe = new Date().toISOString();
    PP.store.set(CLE, [...list(), a]);
    return { absence: a };
  };

  /* Absence récurrente : une occurrence par semaine jusqu'à la date donnée (plafonnée à 100).
     Les dates tombant un week-end ou un férié sont ignorées (comptées dans « ignorees »). */
  const creerRecurrent = (d, jusquaISO) => {
    const resultat = { crees: 0, ignorees: 0, erreurs: [] };
    const curseur = PP.dates.fromISO(d.dateDebut);
    for (let garde = 0; garde < 100 && PP.dates.toISO(curseur) <= jusquaISO; garde += 1) {
      const iso = PP.dates.toISO(curseur);
      if (estOuvre(iso)) {
        const r = create({ ...d, dateDebut: iso, dateFin: iso });
        if (r.erreur) resultat.erreurs.push(`${PP.dates.formatCourt(curseur)} : ${r.erreur}`);
        else resultat.crees += 1;
      } else {
        resultat.ignorees += 1;
      }
      curseur.setDate(curseur.getDate() + 7);
    }
    return resultat;
  };

  const update = (id, patch) => {
    const absences = list();
    const i = absences.findIndex((a) => a.id === id);
    if (i === -1) return { erreur: t('absences.errIntrouvable') };
    const fusion = normalise({ ...absences[i], ...patch });
    fusion.id = id;
    fusion.creeLe = absences[i].creeLe;
    /* Traçabilité des changements de statut (validations / refus) */
    if (fusion.statut !== absences[i].statut) {
      fusion.historique = [...(absences[i].historique || []), {
        horodatage: new Date().toISOString(),
        detail: `statut : ${absences[i].statut} → ${fusion.statut}${fusion.statutCommentaire ? ` (${fusion.statutCommentaire})` : ''}`,
        par: PP.securite?.utilisateur()?.nom || t('securite.utilisateurSysteme'),
      }].slice(-30);
    }
    const erreur = controle(fusion, id);
    if (erreur) return { erreur };
    fusion.modifieLe = new Date().toISOString();
    absences[i] = fusion;
    PP.store.set(CLE, absences);
    return { absence: absences[i] };
  };

  const remove = (id) => {
    PP.store.set(CLE, list().filter((a) => a.id !== id));
    return { ok: true };
  };

  const approuver = (id) => update(id, { statut: 'approuvee', statutCommentaire: '' });

  const refuser = (id, commentaire) => {
    if (!commentaire || !commentaire.trim()) return { erreur: 'Le commentaire est obligatoire pour un refus.' };
    return update(id, { statut: 'refusee', statutCommentaire: commentaire.trim() });
  };

  /* Absence approuvée couvrant une date pour un employé (badge sur la page Pointage) */
  const pour = (employeId, dateISO) => list().find((a) =>
    a.employeId === employeId
    && a.statut === 'approuvee'
    && a.dateDebut <= dateISO && dateISO <= a.dateFin) || null;

  return { CLE, PERIODES, list, get, parMotif, create, creerRecurrent, update, remove, approuver, refuser, pour, estOuvre };
})();

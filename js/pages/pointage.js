/* Page Pointage (section 3) — saisie quotidienne par employé, calculs, validation */
window.PP = window.PP || {};
PP.pages = PP.pages || {};

PP.pages.pointage = (() => {
  const { escapeHtml, capitalize } = PP.utils;
  const { icon, toast, modal, confirmDialog, avatar } = PP.ui;

  const etat = { dateISO: PP.dates.toISO(new Date()) };
  let racine = null;

  const aujourdhuiISO = () => PP.dates.toISO(new Date());

  /* Détail de période d'une absence (pour l'infobulle du badge) */
  const periodeAbsenceLibelle = (a) => {
    if (a.periode === 'matin') return tx('pointage.periodeMatin');
    if (a.periode === 'apresmidi') return tx('pointage.periodeApresMidi');
    if (a.periode === 'heures' && a.heureDebut !== null) return tx('pointage.periodeHeures', { debut: PP.time.toHHMM(a.heureDebut), fin: PP.time.toHHMM(a.heureFin) });
    return '';
  };

  const maintenantHHMM = () => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  /* ---------- Informations sur le jour affiché ---------- */
  const infoJour = () => {
    const d = PP.dates.fromISO(etat.dateISO);
    const feries = { ...PP.dates.feries(d.getFullYear()) };
    PP.store.get('feries', []).forEach((f) => { if (f.date === etat.dateISO) feries[f.date] = f.libelle; });
    const ferie = feries[etat.dateISO] || null;
    const weekend = PP.dates.isWeekend(d);
    return {
      date: d,
      jourSemaine: PP.dates.JOURS[d.getDay()],
      ferie,
      weekend,
      ouvre: !weekend && !ferie,
    };
  };

  /* ================= Rendu ================= */
  const render = (root) => {
    racine = root;

    root.innerHTML = `
      <div class="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 class="text-4xl font-semibold tracking-tight">${tx('pages.pointage.titre')}</h1>
          <p id="ptp-compte" class="mt-2 text-white/50"></p>
        </div>
        <div class="flex items-center gap-2">
          <button id="ptp-jour-avant" title="${tx('pointage.jourPrecedent')}" class="rounded-xl border border-white/10 p-2.5 text-white/60 transition hover:bg-white/5 hover:text-white">${icon('i-arrow-r', 'h-4 w-4 rotate-180')}</button>
          <input type="date" id="ptp-date" class="pp-input w-44 text-xs">
          <button id="ptp-jour-apres" title="${tx('pointage.jourSuivant')}" class="rounded-xl border border-white/10 p-2.5 text-white/60 transition hover:bg-white/5 hover:text-white">${icon('i-arrow-r', 'h-4 w-4')}</button>
          <button id="ptp-aujourdhui" class="pp-btn-ghost px-3 py-2.5 text-xs">${tx('pointage.aujourdhui')}</button>
        </div>
      </div>

      <div id="ptp-type-jour" class="mt-6"></div>

      <section class="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-white/10 text-[11px] uppercase tracking-[0.12em] text-white/35">
              <th class="pb-3 pl-1 text-left font-medium">${tx('tableau.employe')}</th>
              <th class="pb-3 text-center font-medium">${tx('pointage.nomColonne.debutMatin')}</th>
              <th class="pb-3 text-center font-medium">${tx('pointage.nomColonne.finMatin')}</th>
              <th class="pb-3 text-center font-medium">${tx('pointage.nomColonne.debutApresMidi')}</th>
              <th class="pb-3 text-center font-medium">${tx('pointage.nomColonne.finApresMidi')}</th>
              <th class="pb-3 text-right font-medium">${tx('tableau.total')}</th>
              <th class="pb-3 text-right font-medium">${tx('pointage.nomColonne.semaine')}</th>
              <th class="pb-3 text-right font-medium">${tx('tableau.statut')}</th>
              <th class="pb-3 pr-1 text-right font-medium">${tx('tableau.actions')}</th>
            </tr>
          </thead>
          <tbody id="ptp-corps" class="divide-y divide-white/5"></tbody>
        </table>
        <p class="mt-4 text-[11px] leading-relaxed text-white/35">
          ${tx('pointage.aideSaisie')}
        </p>
      </section>`;

    /* Événements */
    racine.querySelector('#ptp-date').value = etat.dateISO;
    racine.querySelector('#ptp-date').addEventListener('change', (e) => {
      if (!e.target.value) return;
      etat.dateISO = e.target.value;
      dessiner();
    });
    racine.querySelector('#ptp-jour-avant').addEventListener('click', () => decaler(-1));
    racine.querySelector('#ptp-jour-apres').addEventListener('click', () => decaler(1));
    racine.querySelector('#ptp-aujourdhui').addEventListener('click', () => { etat.dateISO = aujourdhuiISO(); dessiner(); });

    /* Délégation sur le tableau */
    racine.querySelector('#ptp-corps').addEventListener('change', (e) => {
      const input = e.target.closest('[data-champ]');
      if (!input) return;
      saisirInline(input);
    });
    racine.querySelector('#ptp-corps').addEventListener('click', (e) => {
      const emp = (attr) => e.target.closest(`[${attr}]`)?.getAttribute(attr);
      const edit = e.target.closest('[data-editer]');
      if (edit) return ouvrirModal(emp('data-editer'));
      const val = e.target.closest('[data-valider]');
      if (val) {
        if (!PP.securite.peut('pointage.valider')) { toast(tx('securite.nonAutorise'), 'error'); return; }
        PP.pointages.valider(emp('data-valider'), etat.dateISO);
        toast(tx('pointage.pointageValide'), 'success');
        return dessiner();
      }
      const ref = e.target.closest('[data-refuser]');
      if (ref) {
        if (!PP.securite.peut('pointage.valider')) { toast(tx('securite.nonAutorise'), 'error'); return; }
        return ouvrirRefus(emp('data-refuser'));
      }
      const sup = e.target.closest('[data-supprimer]');
      if (sup) {
        if (!PP.securite.peut('pointage.supprimer')) { toast(tx('pointage.supprAdminSeul'), 'error'); return; }
        return confirmerSuppression(emp('data-supprimer'));
      }
    });

    dessiner();
  };

  const decaler = (jours) => {
    const d = PP.dates.fromISO(etat.dateISO);
    d.setDate(d.getDate() + jours);
    etat.dateISO = PP.dates.toISO(d);
    dessiner();
  };

  const dessiner = () => {
    if (!racine) return;
    racine.querySelector('#ptp-date').value = etat.dateISO;
    dessinerEntete();
    dessinerTableau();
  };

  const dessinerEntete = () => {
    const j = infoJour();
    const stats = PP.pointages.statsJour(etat.dateISO);
    const debut = PP.settings.get('dateDebut');
    const cloture = PP.securite.periodeCloturee(etat.dateISO);

    racine.querySelector('#ptp-compte').textContent = tx('pointage.compte', {
      total: stats.total,
      s: stats.total > 1 ? 's' : '',
      pointes: stats.pointes,
      s2: stats.total > 1 ? 's' : '',
      s2b: stats.pointes > 1 ? 's' : '',
      aValider: stats.aValider,
      refuses: stats.refuses,
      s3: stats.refuses > 1 ? 's' : '',
    });
    let type;
    if (j.ferie) type = `<span class="rounded-full bg-amber-400/10 px-2.5 py-1 text-[11px] font-medium text-amber-300">${escapeHtml(j.ferie)}</span>`;
    else if (j.weekend) type = `<span class="rounded-full bg-white/5 px-2.5 py-1 text-[11px] text-white/50">${tx('pointage.weekEnd')}</span>`;
    else type = `<span class="rounded-full bg-emerald-400/10 px-2.5 py-1 text-[11px] font-medium text-emerald-300">${tx('pointage.jourOuvre')}</span>`;

    const horsPerimetre = etat.dateISO < debut
      ? `<span class="inline-flex items-center gap-1.5 text-[11px] text-amber-300/80">${icon('i-alert', 'h-3.5 w-3.5')} ${tx('pointage.avantDebut', { date: PP.dates.formatCourt(PP.dates.fromISO(debut)) })}</span>`
      : '';

    const periodeCloturee = cloture
      ? `<span class="inline-flex items-center gap-1.5 rounded-full bg-red-400/10 px-2.5 py-1 text-[11px] font-medium text-red-300" title="${tx('pointage.deblocageParametres')}">${icon('i-alert', 'h-3.5 w-3.5')} ${tx('pointage.saisiesBloquees', { label: escapeHtml(cloture.label) })}</span>`
      : '';

    racine.querySelector('#ptp-type-jour').innerHTML = `
      <div class="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
        <span class="text-sm font-medium capitalize text-white/85">${capitalize(PP.dates.formatLong(j.date))}</span>
        ${type}
        ${periodeCloturee}
        ${horsPerimetre}
      </div>`;
  };

  /* ================= Tableau ================= */
  const champHeure = (empId, champ, valeur, placeholder, editable) => `
    <input type="text" data-champ="${champ}" data-emp="${empId}" value="${valeur}"
      placeholder="${placeholder}" maxlength="6" ${editable ? '' : 'disabled'}
      class="pp-input mx-auto w-[4.7rem] px-1 py-1.5 text-center text-xs tabular-nums ${editable ? '' : 'cursor-not-allowed opacity-45'}">`;

  const badgeStatut = (p) => {
    const statut = p?.statut || 'saisie';
    if (statut === 'valide') return `<span class="inline-flex items-center gap-1.5 rounded-full bg-emerald-400/10 px-2.5 py-1 text-[11px] font-medium text-emerald-300"><span class="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>${tx('statut.valide')}</span>`;
    if (statut === 'refuse') return `<span title="${escapeHtml(p.statutCommentaire || '')}" class="inline-flex items-center gap-1.5 rounded-full bg-red-400/10 px-2.5 py-1 text-[11px] font-medium text-red-300"><span class="h-1.5 w-1.5 rounded-full bg-red-400"></span>${tx('statut.refuse')}</span>`;
    return `<span class="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1 text-[11px] text-white/55"><span class="h-1.5 w-1.5 rounded-full bg-white/30"></span>${tx('statut.attente')}</span>`;
  };

  const dessinerTableau = () => {
    const employes = [...PP.employes.actifs()].sort((a, b) => a.nom.localeCompare(b.nom, 'fr') || a.prenom.localeCompare(b.prenom, 'fr'));
    const corps = racine.querySelector('#ptp-corps');
    const seuil = PP.settings.get('seuilHebdo');
    const cloture = PP.securite.periodeCloturee(etat.dateISO);

    if (employes.length === 0) {
      corps.innerHTML = `<tr><td colspan="9" class="py-8 text-center text-sm text-white/40">${tx('pointage.aucuneEmployeActif')} <a href="#/employes" class="underline hover:text-white">${tx('nav.employes')}</a>.</td></tr>`;
      return;
    }

    corps.innerHTML = employes.map((e) => {
      const p = PP.pointages.get(e.id, etat.dateISO);
      const v = (k) => (p && p[k] !== null && p[k] !== undefined ? PP.time.toHHMM(p[k]) : '');
      const total = PP.pointages.heuresJour(p);
      const anomalies = PP.pointages.anomalies(p);
      const calcSemaine = PP.calculs.detailSemaine(e.id, etat.dateISO);
      const semaine = calcSemaine.travaille;
      const depassement = calcSemaine.hs > 0;

      /* Absence approuvée couvrant ce jour */
      const absence = PP.absences.pour(e.id, etat.dateISO);
      const motifAbsence = absence ? PP.motifs.byCode(absence.motif) : null;
      const badgeAbsence = absence ? `
        <span title="${tx('pointage.absenceInfobulle', { motif: escapeHtml(PP.motifs.libelle(motifAbsence) || absence.motif) })}${periodeAbsenceLibelle(absence)}"
          class="inline-flex items-center rounded-md bg-${motifAbsence?.couleur || 'white'}-400/10 px-1.5 py-0.5 text-[10px] font-semibold text-${motifAbsence?.couleur || 'white'}-300">${escapeHtml(absence.motif)}</span>` : '';

      /* Droits : édition globale ou de sa propre ligne — bloquée si période clôturée */
      const editable = PP.securite.peutEditerPointage(e.id) && !cloture;
      const peutValider = PP.securite.peut('pointage.valider') && !cloture;
      const peutSupprimer = PP.securite.peut('pointage.supprimer') && !cloture;

      return `
      <tr class="transition-colors hover:bg-white/[0.02]">
        <td class="py-2.5 pl-1">
          <div class="flex items-center gap-3">
            ${avatar(e, 'h-8 w-8 text-[10px]')}
            <div class="min-w-0">
              <p class="truncate text-sm font-medium leading-tight">${escapeHtml(e.prenom)} ${escapeHtml(e.nom)}</p>
              <p class="truncate text-[11px] text-white/35">${escapeHtml(e.poste || '')}</p>
            </div>
          </div>
        </td>
        <td class="py-2.5 text-center">${champHeure(e.id, 't1', v('t1'), '08:00', editable)}</td>
        <td class="py-2.5 text-center">${champHeure(e.id, 't2', v('t2'), '12:00', editable)}</td>
        <td class="py-2.5 text-center">${champHeure(e.id, 't3', v('t3'), '13:00', editable)}</td>
        <td class="py-2.5 text-center">${champHeure(e.id, 't4', v('t4'), '17:00', editable)}</td>
        <td class="py-2.5 text-right">
          <span class="text-sm font-semibold tabular-nums ${total ? '' : 'text-white/30'}">${total ? PP.time.formatHM(total) : '—'}</span>
          ${anomalies.length ? `<span title="${escapeHtml(anomalies.join(' · '))}" class="ml-1.5 inline-flex align-middle text-amber-300">${icon('i-alert', 'h-3.5 w-3.5')}</span>` : ''}
          ${p && (p.t5 !== null || p.t6 !== null) ? `<span class="ml-1 rounded-md bg-violet-400/10 px-1.5 py-0.5 text-[9px] font-semibold text-violet-300">${tx('pointage.soir')}</span>` : ''}
        </td>
        <td class="py-2.5 text-right text-xs tabular-nums ${depassement ? 'font-medium text-amber-300' : 'text-white/60'}"
            title="${tx('pointage.baseHS', { base: PP.time.formatHM(calcSemaine.base) })}${calcSemaine.absenceBase ? tx('pointage.baseAbsences', { absences: PP.time.formatHM(calcSemaine.absenceBase) }) : ''}${tx('pointage.baseSeuil', { seuil })}">
          ${PP.time.formatHM(semaine)} / ${seuil}h
          ${calcSemaine.hs > 0 ? `<span class="block text-[10px] font-medium text-amber-300/90">+${PP.time.formatHM(calcSemaine.hs)} HS</span>` : ''}
        </td>
        <td class="py-2.5 text-right">${badgeAbsence}${badgeStatut(p)}</td>
        <td class="py-2.5 pr-1">
          <div class="flex justify-end gap-0.5">
            ${editable ? `<button data-editer="${e.id}" title="${tx('pointage.editerTitre')}" class="rounded-lg p-2 text-white/50 transition hover:bg-white/5 hover:text-white">${icon('i-edit', 'h-4 w-4')}</button>` : ''}
            ${p && peutValider && p.statut !== 'valide' ? `<button data-valider="${e.id}" title="${tx('action.valider')}" class="rounded-lg p-2 text-white/50 transition hover:bg-emerald-400/10 hover:text-emerald-300">${icon('i-check', 'h-4 w-4')}</button>` : ''}
            ${p && peutValider && p.statut !== 'refuse' ? `<button data-refuser="${e.id}" title="${tx('action.refuser')}" class="rounded-lg p-2 text-white/50 transition hover:bg-red-500/10 hover:text-red-300">${icon('i-x', 'h-4 w-4')}</button>` : ''}
            ${p && peutSupprimer ? `<button data-supprimer="${e.id}" title="${tx('pointage.effacerTitre')}" class="rounded-lg p-2 text-white/50 transition hover:bg-red-500/10 hover:text-red-300">${icon('i-trash', 'h-4 w-4')}</button>` : ''}
          </div>
        </td>
      </tr>`;
    }).join('');
  };

  /* ================= Saisie inline ================= */
  const saisirInline = (input) => {
    const empId = input.dataset.emp;
    if (!PP.securite.peutEditerPointage(empId)) { toast(tx('pointage.nonModifiable'), 'error'); return; }
    if (PP.securite.periodeCloturee(etat.dateISO)) { toast(tx('pointage.periodeClotureeSaisie'), 'error'); return; }
    const brut = input.value.trim();
    const champ = input.dataset.champ;

    let minutes = null;
    if (brut) {
      minutes = PP.time.parse(brut);
      if (minutes === null) {
        input.classList.add('border-red-400/60');
        toast(tx('pointage.heureNonReconnue', { brut }), 'error');
        return;
      }
    }

    const resultat = PP.pointages.save(empId, etat.dateISO, { [champ]: minutes });
    const anomalies = PP.pointages.anomalies(resultat);
    toast(anomalies.length ? tx('pointage.enregistreAnomalie', { anomalie: anomalies[0] }) : tx('pointage.pointageEnregistre'), anomalies.length ? 'warning' : 'success');
    dessiner();
  };

  /* ================= Modal d'édition complète ================= */
  const ouvrirModal = (empId) => {
    const e = PP.employes.get(empId);
    if (!e) return;
    if (!PP.securite.peutEditerPointage(empId)) { toast(tx('pointage.nonModifiable'), 'error'); return; }
    if (PP.securite.periodeCloturee(etat.dateISO)) { toast(tx('pointage.periodeClotureeSaisie'), 'error'); return; }
    const p = PP.pointages.get(empId, etat.dateISO);
    const j = infoJour();

    const champModal = (champ, label) => `
      <label class="block">
        <span class="pp-label flex items-center justify-between">${label}
          <button type="button" data-maintenant="${champ}" class="text-[9px] normal-case tracking-normal text-white/40 transition hover:text-white">${tx('pointage.maintenent', { heure: maintenantHHMM() })}</button>
        </span>
        <input type="text" name="${champ}" maxlength="6" placeholder="—" class="pp-input text-center tabular-nums"
          value="${p && p[champ] !== null && p[champ] !== undefined ? PP.time.toHHMM(p[champ]) : ''}">
      </label>`;

    const body = `
      <form id="ptp-form" class="space-y-5" novalidate>
        <div class="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
          ${avatar(e, 'h-10 w-10 text-xs')}
          <div class="min-w-0 flex-1">
            <p class="text-sm font-medium">${escapeHtml(e.prenom)} ${escapeHtml(e.nom)}</p>
            <p class="text-[11px] text-white/40 capitalize">${capitalize(PP.dates.formatLong(j.date))} — ${j.ferie ? escapeHtml(j.ferie) : j.weekend ? tx('pointage.weekEnd') : tx('pointage.jourOuvre')}</p>
          </div>
          <div class="text-right">
            <p class="text-[10px] uppercase tracking-wider text-white/35">${tx('pointage.totalDuJour')}</p>
            <p id="ptp-modal-total" class="text-lg font-semibold tabular-nums">—</p>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-4">
          ${champModal('t1', tx('pointage.nomColonne.debutMatin'))}
          ${champModal('t2', tx('pointage.nomColonne.finMatin'))}
          ${champModal('t3', tx('pointage.debutApresMidi'))}
          ${champModal('t4', tx('pointage.finApresMidi'))}
          ${champModal('t5', tx('pointage.debutSoir'))}
          ${champModal('t6', tx('pointage.finSoir'))}
        </div>

        <div id="ptp-modal-anomalies" class="space-y-1"></div>
        <div id="ptp-modal-categories" class="flex flex-wrap gap-2"></div>

        <label class="block">
          <span class="pp-label">${tx('pointage.commentaire')}</span>
          <textarea name="commentaire" rows="2" class="pp-input" placeholder="${tx('pointage.commentairePlaceholder')}">${escapeHtml(p?.commentaire || '')}</textarea>
        </label>

        ${p?.statut === 'refuse' && p.statutCommentaire ? `
          <p class="rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-2.5 text-xs text-red-200">
            <span class="font-medium">${tx('pointage.refusManager')}</span> ${escapeHtml(p.statutCommentaire)}
          </p>` : ''}

        ${p && p.historique?.length ? `
          <div>
            <p class="pp-label">${tx('pointage.tracabilite')}</p>
            <ul class="space-y-1 text-[11px] text-white/45">
              ${[...p.historique].reverse().slice(0, 3).map((h) => {
                const d = new Date(h.horodatage);
                return `<li>${PP.dates.formatCourt(d)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} — ${escapeHtml(h.detail)} <span class="text-white/30">(${escapeHtml(h.par)})</span></li>`;
              }).join('')}
            </ul>
          </div>` : ''}

        <p id="ptp-modal-erreur" class="hidden rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-2.5 text-xs text-red-200"></p>
      </form>`;

    const fermer = modal({
      title: tx('pointage.titreModal'),
      size: 'max-w-2xl',
      body,
      footer: `
        ${p ? `<button id="ptp-modal-refuser" class="mr-auto rounded-xl px-3 py-2.5 text-xs text-red-300 transition hover:bg-red-500/10">${tx('pointage.refuserBouton')}</button>` : ''}
        ${p && p.statut !== 'valide' && PP.securite.peut('pointage.valider') ? `<button id="ptp-modal-valider" class="pp-btn-ghost">${tx('action.valider')}</button>` : ''}
        <button data-close class="pp-btn-ghost">${tx('action.annuler')}</button>
        <button id="ptp-modal-ok" class="pp-btn-primary">${tx('action.enregistrer')}</button>`,
    });

    /* Toutes les requêtes restent limitées à cette modale (jamais globales) */
    const boiteModale = fermer.overlay;
    const form = boiteModale.querySelector('#ptp-form');

    /* Recalcul du total, des anomalies et de la validation à chaque frappe */
    const recalculer = () => {
      const invalides = [];
      const creneaux = PP.pointages.CHAMPS.map((k) => {
        const champ = form.querySelector(`[name="${k}"]`);
        const brut = champ.value.trim();
        const minutes = brut ? PP.time.parse(brut) : null;
        champ.classList.toggle('border-red-400/60', Boolean(brut && minutes === null));
        if (brut && minutes === null) invalides.push({ brut });
        return minutes;
      });
      const total = PP.time.totalJour([[creneaux[0], creneaux[1]], [creneaux[2], creneaux[3]], [creneaux[4], creneaux[5]]]);
      boiteModale.querySelector('#ptp-modal-total').textContent = total ? PP.time.formatHM(total) : '—';

      const faux = { t1: creneaux[0], t2: creneaux[1], t3: creneaux[2], t4: creneaux[3], t5: creneaux[4], t6: creneaux[5] };
      const lignes = invalides.map(({ brut }) => ({
        texte: tx('pointage.heureNonReconnue', { brut }),
        erreur: true,
      }));
      if (!invalides.length) PP.pointages.anomalies(faux).forEach((a) => lignes.push({ texte: a, erreur: false }));
      boiteModale.querySelector('#ptp-modal-anomalies').innerHTML = lignes
        .map((l) => `<p class="flex items-center gap-2 text-xs ${l.erreur ? 'text-red-300' : 'text-amber-300/90'}">${icon('i-alert', 'h-3.5 w-3.5')} ${escapeHtml(l.texte)}</p>`)
        .join('');

      /* Répartition du jour pour les majorations (nuit / dimanche / férié) */
      const detail = PP.calculs.detailJour(empId, etat.dateISO, faux);
      const categories = [];
      if (detail.nuit) categories.push([tx('pointage.nuit'), detail.nuit, 'violet']);
      if (detail.dimanche) categories.push([tx('pointage.dimanche'), detail.dimanche, 'sky']);
      if (detail.ferieHeures) categories.push([`${tx('pointage.ferie')}${detail.ferie ? ` — ${detail.ferie}` : ''}`, detail.ferieHeures, 'amber']);
      boiteModale.querySelector('#ptp-modal-categories').innerHTML = categories
        .map(([nom, min, couleur]) => `<span class="rounded-md bg-${couleur}-400/10 px-2 py-0.5 text-[10px] font-semibold text-${couleur}-300">${nom} · ${PP.time.formatHM(min)}</span>`)
        .join('');
      return { creneaux, invalides };
    };
    form.addEventListener('input', recalculer);
    recalculer();

    /* Boutons « maintenant » (pointage en temps réel) */
    form.addEventListener('click', (ev) => {
      const btn = ev.target.closest('[data-maintenant]');
      if (!btn) return;
      const champ = btn.dataset.maintenant;
      const champInput = form.querySelector(`[name="${champ}"]`);
      champInput.value = maintenantHHMM();
      recalculer();
    });

    /* Soumission */
    const soumettre = () => {
      const { creneaux, invalides } = recalculer();
      const patch = { commentaire: form.querySelector('[name="commentaire"]').value.trim() };
      PP.pointages.CHAMPS.forEach((k, i) => { patch[k] = creneaux[i]; });

      const boite = boiteModale.querySelector('#ptp-modal-erreur');
      if (invalides.length) {
        boite.textContent = tx('pointage.heuresInvalides');
        boite.classList.remove('hidden');
        return;
      }

      PP.pointages.save(empId, etat.dateISO, patch);
      fermer();
      toast(tx('pointage.pointageEnregistre'), 'success');
      dessiner();
    };
    boiteModale.querySelector('#ptp-modal-ok').addEventListener('click', soumettre);
    form.addEventListener('submit', (ev) => { ev.preventDefault(); soumettre(); });

    const btnValider = boiteModale.querySelector('#ptp-modal-valider');
    if (btnValider) btnValider.addEventListener('click', () => {
      soumettre();
      PP.pointages.valider(empId, etat.dateISO);
      toast(tx('pointage.pointageValide'), 'success');
      dessiner();
    });

    const btnRefuser = boiteModale.querySelector('#ptp-modal-refuser');
    if (btnRefuser) btnRefuser.addEventListener('click', () => { fermer(); ouvrirRefus(empId); });
  };

  /* ================= Refus avec commentaire ================= */
  const ouvrirRefus = (empId) => {
    const e = PP.employes.get(empId);
    if (!e) return;

    const fermer = modal({
      title: tx('pointage.titreRefus', { nom: `${escapeHtml(e.prenom)} ${escapeHtml(e.nom)}` }),
      size: 'max-w-md',
      body: `
        <label class="block">
          <span class="pp-label">${tx('pointage.refusCommentaire')}</span>
          <textarea id="ptp-refus-commentaire" rows="3" class="pp-input" placeholder="${tx('pointage.refusPlaceholder')}"></textarea>
        </label>`,
      footer: `
        <button data-close class="pp-btn-ghost">${tx('action.annuler')}</button>
        <button id="ptp-refus-ok" class="rounded-xl bg-red-500/90 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-500">${tx('action.refuser')}</button>`,
    });

    /* Requêtes limitées à cette modale */
    const boiteModale = fermer.overlay;
    boiteModale.querySelector('#ptp-refus-ok').addEventListener('click', () => {
      const commentaire = boiteModale.querySelector('#ptp-refus-commentaire').value.trim();
      if (!commentaire) { toast(tx('pointage.refusObligatoire'), 'warning'); return; }
      PP.pointages.refuser(empId, etat.dateISO, commentaire);
      fermer();
      toast(tx('pointage.pointageRefuse'), 'success');
      dessiner();
    });
  };

  /* ================= Suppression ================= */
  const confirmerSuppression = (empId) => {
    const e = PP.employes.get(empId);
    if (!e) return;
    confirmDialog({
      title: tx('pointage.effacerTitreQuestion'),
      message: tx('pointage.effacerMessage', { nom: `<span class="font-medium text-white">${escapeHtml(e.prenom)} ${escapeHtml(e.nom)}</span>` }),
      confirmLabel: tx('pointage.effacer'),
      onConfirm: () => {
        PP.pointages.supprimer(empId, etat.dateISO);
        toast(tx('pointage.pointageEfface'), 'success');
        dessiner();
      },
    });
  };

  return { render };
})();

/* Page Absences (section 4) — demandes, validation, motifs personnalisables */
window.PP = window.PP || {};
PP.pages = PP.pages || {};

PP.pages.absences = (() => {
  const { escapeHtml } = PP.utils;
  const { icon, toast, modal, confirmDialog, avatar, badge } = PP.ui;

  const TAILLE_JUSTIFICATIF_MAX = 500 * 1024; // 500 Ko

  const etat = { employe: '', statut: '' };
  let racine = null;

  const periodeLibelle = (a) => {
    if (a.periode === 'matin') return tx('jours.matin');
    if (a.periode === 'apresmidi') return tx('jours.apresmidi');
    if (a.periode === 'heures') return `${PP.time.toHHMM(a.heureDebut)} – ${PP.time.toHHMM(a.heureFin)}`;
    return '';
  };

  /* Nombre de jours OUVRÉS couverts (week-ends et fériés exclus) */
  const nbJours = (a) => {
    const d = PP.dates.fromISO(a.dateDebut);
    const fin = PP.dates.fromISO(a.dateFin);
    let n = 0;
    let garde = 0;
    while (d <= fin && garde < 400) {
      if (PP.absences.estOuvre(PP.dates.toISO(d))) n += 1;
      d.setDate(d.getDate() + 1);
      garde += 1;
    }
    return n;
  };

  const badgeStatut = (a) => {
    if (a.statut === 'approuvee') return `<span class="inline-flex items-center gap-1.5 rounded-full bg-emerald-400/10 px-2.5 py-1 text-[11px] font-medium text-emerald-300"><span class="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>${tx('statut.approuvee')}</span>`;
    if (a.statut === 'refusee') return `<span title="${escapeHtml(a.statutCommentaire)}" class="inline-flex items-center gap-1.5 rounded-full bg-red-400/10 px-2.5 py-1 text-[11px] font-medium text-red-300"><span class="h-1.5 w-1.5 rounded-full bg-red-400"></span>${tx('statut.refusee')}</span>`;
    return `<span class="inline-flex items-center gap-1.5 rounded-full bg-amber-400/10 px-2.5 py-1 text-[11px] font-medium text-amber-300"><span class="h-1.5 w-1.5 rounded-full bg-amber-400"></span>${tx('statut.enAttente')}</span>`;
  };

  /* ================= Rendu ================= */
  const render = (root) => {
    racine = root;
    etat.statut = '';
    /* Mode employé : on ne voit et ne demande que pour soi-même */
    const c = PP.securite.utilisateur();
    const modeEmploye = c?.role === 'employe';
    etat.employe = modeEmploye && c.employeId ? c.employeId : '';

    root.innerHTML = `
      <div class="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 class="text-4xl font-semibold tracking-tight">${tx('pages.absences.titre')}</h1>
          <p id="abs-compte" class="mt-2 text-white/50"></p>
        </div>
        <div class="flex items-center gap-2.5">
          ${PP.securite.peut('absence.valider') ? `<button id="abs-motif-ajout" class="pp-btn-ghost">${icon('i-plus', 'h-4 w-4')} ${tx('absences.nouveauMotif')}</button>` : ''}
          <button id="abs-ajout" class="pp-btn-primary">${icon('i-plus', 'h-4 w-4')} ${modeEmploye ? tx('absences.demanderAbsence') : tx('absences.nouvelleAbsence')}</button>
        </div>
      </div>

      <div class="mt-7 flex flex-wrap items-center gap-3">
        <select id="abs-filtre-employe" class="pp-select w-56 text-xs" ${modeEmploye ? 'disabled' : ''}><option value="">${tx('absences.tousEmployes')}</option></select>
        <select id="abs-filtre-statut" class="pp-select w-44 text-xs">
          <option value="">${tx('absences.tousStatuts')}</option>
          <option value="attente">${tx('absences.enAttentePluriel')}</option>
          <option value="approuvee">${tx('absences.approuveesPluriel')}</option>
          <option value="refusee">${tx('absences.refuseesPluriel')}</option>
        </select>
      </div>

      <div class="mt-5 grid grid-cols-12 gap-5">
        <section class="col-span-8 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-white/10 text-[11px] uppercase tracking-[0.12em] text-white/35">
                <th class="pb-3 pl-1 text-left font-medium">${tx('tableau.employe')}</th>
                <th class="pb-3 text-left font-medium">${tx('absences.motif')}</th>
                <th class="pb-3 text-left font-medium">${tx('absences.periode')}</th>
                <th class="pb-3 text-right font-medium">${tx('absences.duree')}</th>
                <th class="pb-3 text-right font-medium">${tx('tableau.statut')}</th>
                <th class="pb-3 pr-1 text-right font-medium">${tx('tableau.actions')}</th>
              </tr>
            </thead>
            <tbody id="abs-corps" class="divide-y divide-white/5"></tbody>
          </table>
        </section>

        <section class="col-span-4 space-y-5">
          <div class="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <h2 class="flex items-center gap-2 text-sm font-semibold">${icon('i-cal-x', 'h-4 w-4 text-white/85')} ${tx('absences.motifsTitre')}</h2>
            <ul id="abs-liste-motifs" class="mt-4 space-y-2.5"></ul>
            <p class="mt-4 border-t border-white/5 pt-3 text-[11px] leading-relaxed text-white/35">
              ${tx('absences.aideMotifs', { facteur: `<span class="text-violet-300/80">⅓ HS</span>` })}
            </p>
          </div>
        </section>
      </div>`;

    /* Filtres */
    const selEmploye = racine.querySelector('#abs-filtre-employe');
    if (!modeEmploye) {
      [...PP.employes.actifs()].sort((a, b) => a.nom.localeCompare(b.nom, 'fr')).forEach((e) => {
        const opt = document.createElement('option');
        opt.value = e.id;
        opt.textContent = `${e.prenom} ${e.nom}`;
        selEmploye.appendChild(opt);
      });
    } else {
      const moi = PP.employes.get(etat.employe);
      if (moi) {
        const opt = document.createElement('option');
        opt.value = moi.id;
        opt.textContent = `${moi.prenom} ${moi.nom} ${tx('absences.moi')}`;
        selEmploye.appendChild(opt);
      }
    }
    selEmploye.addEventListener('change', (e) => { etat.employe = e.target.value; dessinerTableau(); });
    racine.querySelector('#abs-filtre-statut').addEventListener('change', (e) => { etat.statut = e.target.value; dessinerTableau(); });

    racine.querySelector('#abs-ajout').addEventListener('click', () => ouvrirModalAbsence(null));
    racine.querySelector('#abs-motif-ajout').addEventListener('click', () => ouvrirModalMotif(null));

    /* Délégation : actions table + suppression motif */
    racine.addEventListener('click', (e) => {
      const attr = (sel) => e.target.closest(`[${sel}]`)?.getAttribute(sel);
      const just = e.target.closest('[data-justif]');
      if (just) return telechargerJustificatif(just.dataset.justif);
      const app = e.target.closest('[data-approuver]');
      if (app) {
        if (!PP.securite.peut('absence.valider')) { toast(tx('securite.nonAutorise'), 'error'); return; }
        PP.absences.approuver(attr('data-approuver'));
        toast(tx('absences.approuvee'), 'success');
        return dessiner();
      }
      const ref = e.target.closest('[data-refuser]');
      if (ref) {
        if (!PP.securite.peut('absence.valider')) { toast(tx('securite.nonAutorise'), 'error'); return; }
        return ouvrirRefus(attr('data-refuser'));
      }
      const edit = e.target.closest('[data-editer]');
      if (edit) return ouvrirModalAbsence(attr('data-editer'));
      const sup = e.target.closest('[data-supprimer]');
      if (sup) {
        if (!PP.securite.peut('absence.supprimer')) { toast(tx('absences.suppressionReservee'), 'error'); return; }
        return confirmerSuppressionAbsence(attr('data-supprimer'));
      }
      const editM = e.target.closest('[data-editer-motif]');
      if (editM) return ouvrirModalMotif(editM.getAttribute('data-editer-motif'));
      const supM = e.target.closest('[data-supprimer-motif]');
      if (supM) {
        if (!PP.securite.peut('absence.valider')) { toast(tx('securite.nonAutorise'), 'error'); return; }
        return confirmerSuppressionMotif(supM.getAttribute('data-supprimer-motif'));
      }
    });

    dessiner();
  };

  const dessiner = () => { dessinerCompte(); dessinerTableau(); dessinerMotifs(); };

  const dessinerCompte = () => {
    const toutes = PP.absences.list();
    const attente = toutes.filter((a) => a.statut === 'attente').length;
    racine.querySelector('#abs-compte').textContent = tx('absences.compte', {
      n: toutes.length,
      s: toutes.length > 1 ? 's' : '',
      s2: toutes.length > 1 ? 's' : '',
      attente,
    });
  };

  /* ================= Tableau des absences ================= */
  const dessinerTableau = () => {
    const motifs = Object.fromEntries(PP.motifs.list().map((m) => [m.code, m]));
    const liste = PP.absences.list()
      .filter((a) => (!etat.employe || a.employeId === etat.employe) && (!etat.statut || a.statut === etat.statut))
      .sort((a, b) => b.dateDebut.localeCompare(a.dateDebut));

    const corps = racine.querySelector('#abs-corps');
    const peutValider = PP.securite.peut('absence.valider');
    const peutSupprimer = PP.securite.peut('absence.supprimer');
    if (liste.length === 0) {
      corps.innerHTML = `<tr><td colspan="6" class="py-8 text-center text-sm text-white/40">${PP.absences.list().length ? tx('absences.aucunePourFiltres') : tx('absences.aucune')}${tx('absences.aucuneClic')}</td></tr>`;
      return;
    }

    corps.innerHTML = liste.map((a) => {
      const e = PP.employes.get(a.employeId);
      const m = motifs[a.motif];
      const jours = nbJours(a);
      const poids = PP.absences.PERIODES.find((p) => p.code === a.periode)?.poids ?? 1;
      const duree = a.periode === 'heures' && a.heureDebut !== null
        ? `${PP.time.formatHM(PP.time.dureePaire(a.heureDebut, a.heureFin))}`
        : jours === 1 ? `${poids === 0.5 ? tx('absences.demiJour') : tx('absences.unJour')}` : tx('absences.joursOuvres', { n: jours, s: jours > 1 ? 's' : '' });

      return `
      <tr class="transition-colors hover:bg-white/[0.02]">
        <td class="py-3 pl-1">
          <div class="flex items-center gap-3">
            ${avatar(e || {}, 'h-8 w-8 text-[10px]')}
            <div class="min-w-0">
              <p class="truncate text-sm font-medium leading-tight">${e ? `${escapeHtml(e.prenom)} ${escapeHtml(e.nom)}` : '—'}</p>
              ${a.commentaire ? `<p class="truncate text-[11px] text-white/35" title="${escapeHtml(a.commentaire)}">${escapeHtml(a.commentaire)}</p>` : ''}
            </div>
          </div>
        </td>
        <td class="py-3">
          ${badge(a.motif, m?.couleur || 'white')}
          <span class="ml-1.5 text-[11px] text-white/40">${escapeHtml(m?.libelle || '')}</span>
        </td>
        <td class="py-3 text-xs">
          <span class="tabular-nums text-white/75">${PP.dates.formatCourt(PP.dates.fromISO(a.dateDebut))}</span>
          ${a.dateFin !== a.dateDebut ? `<span class="text-white/30"> → </span><span class="tabular-nums text-white/75">${PP.dates.formatCourt(PP.dates.fromISO(a.dateFin))}</span>` : ''}
          ${periodeLibelle(a) ? `<span class="block text-[11px] text-white/40">${escapeHtml(periodeLibelle(a))}</span>` : ''}
        </td>
        <td class="py-3 text-right text-xs tabular-nums text-white/70" ${a.periode !== 'heures' && jours > 1 ? `title="${tx('absences.joursOuvresTitre')}"` : ''}>${duree}</td>
        <td class="py-3 text-right">${badgeStatut(a)}</td>
        <td class="py-3 pr-1">
          <div class="flex justify-end gap-0.5">
            ${a.justificatif ? `<button data-justif="${a.id}" title="${tx('absences.justificatifTitre', { nom: escapeHtml(a.justificatif.nom) })}" class="rounded-lg p-2 text-sky-300/80 transition hover:bg-sky-400/10">${icon('i-download', 'h-4 w-4')}</button>` : ''}
            ${peutValider && a.statut === 'attente' ? `
              <button data-approuver="${a.id}" title="${tx('absences.approuver')}" class="rounded-lg p-2 text-white/50 transition hover:bg-emerald-400/10 hover:text-emerald-300">${icon('i-check', 'h-4 w-4')}</button>
              <button data-refuser="${a.id}" title="${tx('action.refuser')}" class="rounded-lg p-2 text-white/50 transition hover:bg-red-500/10 hover:text-red-300">${icon('i-x', 'h-4 w-4')}</button>` : ''}
            <button data-editer="${a.id}" title="${tx('action.modifier')}" class="rounded-lg p-2 text-white/50 transition hover:bg-white/5 hover:text-white">${icon('i-edit', 'h-4 w-4')}</button>
            ${peutSupprimer ? `<button data-supprimer="${a.id}" title="${tx('action.supprimer')}" class="rounded-lg p-2 text-white/50 transition hover:bg-red-500/10 hover:text-red-300">${icon('i-trash', 'h-4 w-4')}</button>` : ''}
          </div>
        </td>
      </tr>`;
    }).join('');
  };

  /* ================= Panneau des motifs ================= */
  const dessinerMotifs = () => {
    const ul = racine.querySelector('#abs-liste-motifs');
    ul.innerHTML = PP.motifs.list().map((m) => `
      <li class="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2.5">
        ${badge(m.code, m.couleur)}
        <div class="min-w-0 flex-1">
          <p class="truncate text-xs text-white/85">${escapeHtml(m.libelle)}</p>
          ${m.exigeCommentaire ? `<p class="text-[10px] text-amber-300/70">${tx('absences.commentaireObligatoireCourt')}</p>` : ''}
        </div>
        <span class="shrink-0 text-[10px] font-semibold ${m.compteHS ? 'text-violet-300/90' : 'text-white/30'}">${PP.motifs.facteurLibelle(m.compteHS)}</span>
        <div class="flex shrink-0 gap-0.5">
          <button data-editer-motif="${m.code}" title="${tx('action.modifier')}" class="rounded-lg p-1.5 text-white/40 transition hover:bg-white/5 hover:text-white">${icon('i-edit', 'h-3.5 w-3.5')}</button>
          <button data-supprimer-motif="${m.code}" title="${tx('action.supprimer')}" class="rounded-lg p-1.5 text-white/40 transition hover:bg-red-500/10 hover:text-red-300">${icon('i-trash', 'h-3.5 w-3.5')}</button>
        </div>
      </li>`).join('');
  };

  /* ================= Modal absence ================= */
  const ouvrirModalAbsence = (id) => {
    const creation = !id;
    const a = id ? PP.absences.get(id) : null;
    const c = PP.securite.utilisateur();
    const modeEmploye = c?.role === 'employe';
    /* En mode employé : uniquement ses propres demandes, tant qu'elles sont en attente */
    if (modeEmploye && a && (a.employeId !== c.employeId || a.statut !== 'attente')) {
      toast(tx('absences.proprietaire'), 'error');
      return;
    }
    let employeForce = null;
    if (modeEmploye) employeForce = c.employeId || null;
    let justificatif = a?.justificatif || null;

    /* Liste des employés proposés (soi-même en mode employé) */
    const employes = modeEmploye
      ? [PP.employes.get(employeForce)].filter(Boolean)
      : [...PP.employes.actifs()].sort((x, y) => x.nom.localeCompare(y.nom, 'fr'));
    if (employes.length === 0) {
      toast(tx('absences.aucunEmployeActif'), 'warning');
      return;
    }

    const champ = (label, input) => `<label class="block"><span class="pp-label">${label}</span>${input}</label>`;
    const optionsEmployes = employes.map((e) => `<option value="${e.id}" ${e.id === (a?.employeId || etat.employe) ? 'selected' : ''}>${escapeHtml(e.prenom)} ${escapeHtml(e.nom)}</option>`).join('');
    const optionsMotifs = PP.motifs.list().map((m) => `<option value="${m.code}" ${m.code === a?.motif ? 'selected' : ''}>${m.code} — ${escapeHtml(m.libelle)}</option>`).join('');
    const optionsPeriodes = PP.absences.PERIODES.map((p) => `
      <label class="flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-xs has-[:checked]:border-white/30">
        <input type="radio" name="periode" value="${p.code}" ${p.code === (a?.periode || 'journee') ? 'checked' : ''} class="accent-emerald-400">
        <span class="text-white/70">${tx('absences.periode_' + p.code)}</span>
      </label>`).join('');

    const body = `
      <form id="abs-form" class="space-y-5" novalidate>
        <div class="grid grid-cols-2 gap-4">
          ${champ(tx('absences.employeChamp'), `<select name="employeId" class="pp-select"><option value="">${tx('absences.choisir')}</option>${optionsEmployes}</select>`)}
          ${champ(tx('absences.motifChamp'), `<select name="motif" class="pp-select">${optionsMotifs}</select>`)}
          ${champ(tx('absences.duChamp'), `<input type="date" name="dateDebut" value="${a?.dateDebut || PP.dates.toISO(new Date())}" class="pp-input">`)}
          ${champ(tx('absences.auChamp'), `<input type="date" name="dateFin" value="${a?.dateFin || ''}" class="pp-input">`)}
        </div>

        <div>
          <span class="pp-label">${tx('absences.typeJournee')}</span>
          <div class="grid grid-cols-2 gap-2">${optionsPeriodes}</div>
        </div>

        <div id="abs-heures" class="${a?.periode === 'heures' ? '' : 'hidden'} grid grid-cols-2 gap-4">
          ${champ(tx('absences.deChamp'), `<input type="text" name="heureDebut" placeholder="10:30" maxlength="6" class="pp-input text-center tabular-nums" value="${a?.heureDebut !== null && a?.heureDebut !== undefined ? PP.time.toHHMM(a.heureDebut) : ''}">`)}
          ${champ(tx('absences.aChamp'), `<input type="text" name="heureFin" placeholder="12:00" maxlength="6" class="pp-input text-center tabular-nums" value="${a?.heureFin !== null && a?.heureFin !== undefined ? PP.time.toHHMM(a.heureFin) : ''}">`)}
        </div>

        ${creation ? `
          <label class="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
            <input type="checkbox" name="recurrent" class="h-4 w-4 accent-emerald-400">
            <span class="text-sm text-white/75">${tx('absences.repetter')}</span>
            <input type="date" name="recurrenceFin" class="pp-input w-40 py-1.5 text-xs">
          </label>
          <p class="text-[11px] text-white/35">${tx('absences.recurrenceAide')}</p>` : ''}

        <label class="block">
          <span class="pp-label" id="abs-label-commentaire">${tx('absences.commentaire')}</span>
          <textarea name="commentaire" rows="2" class="pp-input" placeholder="${tx('absences.commentairePlaceholder')}">${escapeHtml(a?.commentaire || '')}</textarea>
        </label>

        <div class="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
          ${icon('i-download', 'h-4 w-4 shrink-0 text-white/50')}
          <div class="min-w-0 flex-1">
            <p id="abs-justif-nom" class="truncate text-xs text-white/70">${justificatif ? escapeHtml(justificatif.nom) : tx('absences.aucunJustificatif')}</p>
            <p class="text-[10px] text-white/35">${tx('absences.justificatifAide')}</p>
          </div>
          <input type="file" id="abs-justif-fichier" class="hidden">
          <button type="button" id="abs-justif-choisir" class="pp-btn-ghost px-3 py-2 text-xs">${tx('absences.joindre')}</button>
          <button type="button" id="abs-justif-retirer" class="pp-btn-ghost px-3 py-2 text-xs ${justificatif ? '' : 'hidden'}">${tx('absences.retirer')}</button>
        </div>

        ${creation && !modeEmploye ? `
          <label class="block">
            <span class="pp-label">${tx('absences.statutDemande')}</span>
            <select name="statut" class="pp-select">
              <option value="attente">${tx('absences.enAttenteValidation')}</option>
              <option value="approuvee">${tx('absences.approuveeDirecte')}</option>
            </select>
          </label>` : ''}

        <p id="abs-form-erreur" class="hidden rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-2.5 text-xs text-red-200"></p>
      </form>`;

    const fermer = modal({
      title: creation ? tx('absences.nouvelleAbsence') : tx('absences.titreModifier'),
      size: 'max-w-2xl',
      body,
      footer: `
        <button data-close class="pp-btn-ghost">${tx('action.annuler')}</button>
        <button id="abs-ok" class="pp-btn-primary">${creation ? tx('action.enregistrer') : tx('absences.enregistrerModifications')}</button>`,
    });

    /* Toutes les requêtes restent limitées à cette modale (jamais globales) */
    const boiteModale = fermer.overlay;
    const form = boiteModale.querySelector('#abs-form');

    /* Type de journée → plage horaire visible si « heures » */
    form.addEventListener('change', (e) => {
      if (e.target.name === 'periode') {
        boiteModale.querySelector('#abs-heures').classList.toggle('hidden', e.target.value !== 'heures');
      }
    });

    /* Commentaire obligatoire selon le motif */
    const majLabelCommentaire = () => {
      const m = PP.motifs.byCode(form.querySelector('[name="motif"]').value);
      boiteModale.querySelector('#abs-label-commentaire').textContent =
        `${tx('absences.commentaire')}${m?.exigeCommentaire ? tx('absences.commentaireObligatoire') : ''}`;
    };
    form.querySelector('[name="motif"]').addEventListener('change', majLabelCommentaire);
    majLabelCommentaire();

    /* Justificatif */
    boiteModale.querySelector('#abs-justif-choisir').addEventListener('click', () => boiteModale.querySelector('#abs-justif-fichier').click());
    boiteModale.querySelector('#abs-justif-fichier').addEventListener('change', (e) => {
      const f = e.target.files[0];
      if (!f) return;
      if (f.size > TAILLE_JUSTIFICATIF_MAX) {
        toast(tx('absences.fichierTropGros'), 'error');
        return;
      }
      const lecteur = new FileReader();
      lecteur.onload = () => {
        justificatif = { nom: f.name, taille: f.size, type: f.type, data: lecteur.result };
        boiteModale.querySelector('#abs-justif-nom').textContent = f.name;
        boiteModale.querySelector('#abs-justif-retirer').classList.remove('hidden');
      };
      lecteur.readAsDataURL(f);
    });
    boiteModale.querySelector('#abs-justif-retirer').addEventListener('click', () => {
      justificatif = null;
      boiteModale.querySelector('#abs-justif-nom').textContent = tx('absences.aucunJustificatif');
      boiteModale.querySelector('#abs-justif-retirer').classList.add('hidden');
    });

    /* Soumission */
    const soumettre = () => {
      const periode = form.querySelector('[name="periode"]:checked').value;
      const data = {
        employeId: form.querySelector('[name="employeId"]').value,
        motif: form.querySelector('[name="motif"]').value,
        dateDebut: form.querySelector('[name="dateDebut"]').value,
        dateFin: form.querySelector('[name="dateFin"]').value || form.querySelector('[name="dateDebut"]').value,
        periode,
        heureDebut: form.querySelector('[name="heureDebut"]').value,
        heureFin: form.querySelector('[name="heureFin"]').value,
        commentaire: form.querySelector('[name="commentaire"]').value,
        justificatif,
        statut: creation ? (modeEmploye ? 'attente' : form.querySelector('[name="statut"]')?.value || 'attente') : a.statut,
      };
      if (periode === 'heures') {
        data.heureDebut = PP.time.parse(data.heureDebut);
        data.heureFin = PP.time.parse(data.heureFin);
        if (data.heureDebut === null || data.heureFin === null) {
          const boite = boiteModale.querySelector('#abs-form-erreur');
          boite.textContent = tx('absences.plageInvalide');
          boite.classList.remove('hidden');
          return;
        }
      }

      let resultat;
      if (creation && form.querySelector('[name="recurrent"]').checked) {
        const jusqua = form.querySelector('[name="recurrenceFin"]').value;
        if (!jusqua || jusqua < data.dateDebut) {
          const boite = boiteModale.querySelector('#abs-form-erreur');
          boite.textContent = tx('absences.recurrenceFinInvalide');
          boite.classList.remove('hidden');
          return;
        }
        resultat = PP.absences.creerRecurrent(data, jusqua);
        if (resultat.crees === 0) {
          const boite = boiteModale.querySelector('#abs-form-erreur');
          boite.textContent = resultat.erreurs.length
            ? resultat.erreurs[0]
            : tx('absences.aucuneOccurrence');
          boite.classList.remove('hidden');
          return;
        }
        if (resultat.erreurs.length) {
          toast(tx('absences.occurrencesCreeesErreur', { n: resultat.crees, s: resultat.crees > 1 ? 's' : '', s2: resultat.crees > 1 ? 's' : '', erreur: resultat.erreurs[0] }), 'warning');
        } else if (resultat.ignorees) {
          toast(tx('absences.occurrencesCreeesIgnorees', { n: resultat.crees, s: resultat.crees > 1 ? 's' : '', s2: resultat.crees > 1 ? 's' : '', ignorees: resultat.ignorees, s3: resultat.ignorees > 1 ? 's' : '' }), 'success');
        } else {
          toast(tx('absences.occurrencesAbsence', { n: resultat.crees, s: resultat.crees > 1 ? 's' : '', s2: resultat.crees > 1 ? 's' : '' }), 'success');
        }
      } else if (creation) {
        resultat = PP.absences.create(data);
        if (resultat.erreur) {
          const boite = boiteModale.querySelector('#abs-form-erreur');
          boite.textContent = resultat.erreur;
          boite.classList.remove('hidden');
          return;
        }
        toast(tx('absences.absenceEnregistree'), 'success');
      } else {
        resultat = PP.absences.update(id, data);
        if (resultat.erreur) {
          const boite = boiteModale.querySelector('#abs-form-erreur');
          boite.textContent = resultat.erreur;
          boite.classList.remove('hidden');
          return;
        }
        toast(tx('absences.absenceMaj'), 'success');
      }

      fermer();
      dessiner();
    };

    boiteModale.querySelector('#abs-ok').addEventListener('click', soumettre);
    form.addEventListener('submit', (e) => { e.preventDefault(); soumettre(); });
  };

  /* ================= Refus d'absence ================= */
  const ouvrirRefus = (id) => {
    const a = PP.absences.get(id);
    if (!a) return;
    const e = PP.employes.get(a.employeId);
    const fermer = modal({
      title: tx('absences.titreRefus', { nom: e ? escapeHtml(`${e.prenom} ${e.nom}`) : '' }),
      size: 'max-w-md',
      body: `
        <label class="block">
          <span class="pp-label">${tx('absences.refusCommentaire')}</span>
          <textarea id="abs-refus-commentaire" rows="3" class="pp-input" placeholder="${tx('absences.refusPlaceholder')}"></textarea>
        </label>`,
      footer: `
        <button data-close class="pp-btn-ghost">${tx('action.annuler')}</button>
        <button id="abs-refus-ok" class="rounded-xl bg-red-500/90 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-500">${tx('action.refuser')}</button>`,
    });
    /* Requêtes limitées à cette modale */
    const boiteModale = fermer.overlay;
    boiteModale.querySelector('#abs-refus-ok').addEventListener('click', () => {
      const commentaire = boiteModale.querySelector('#abs-refus-commentaire').value;
      const r = PP.absences.refuser(id, commentaire);
      if (r.erreur) { toast(r.erreur, 'warning'); return; }
      fermer();
      toast(tx('absences.absenceRefusee'), 'success');
      dessiner();
    });
  };

  /* ================= Modal motif ================= */
  const ouvrirModalMotif = (code) => {
    const creation = !code;
    const m = code ? PP.motifs.byCode(code) : null;
    const FACTEURS = [
      { valeur: 0, libelle: tx('absences.facteurAucune') },
      { valeur: 1 / 3, libelle: tx('absences.facteurTiers') },
      { valeur: 0.5, libelle: tx('absences.facteurMoitie') },
      { valeur: 1, libelle: tx('absences.facteurTotal') },
    ];

    const body = `
      <form id="motif-form" class="space-y-5" novalidate>
        <div class="grid grid-cols-2 gap-4">
          <label class="block">
            <span class="pp-label">${tx('absences.codeChamp')}</span>
            <input name="code" maxlength="6" ${creation ? '' : 'disabled'} value="${escapeHtml(m?.code || '')}" placeholder="${tx('absences.codePlaceholder')}" class="pp-input uppercase ${creation ? '' : 'opacity-40'}">
          </label>
          <label class="block">
            <span class="pp-label">${tx('absences.libelleChamp')}</span>
            <input name="libelle" value="${escapeHtml(m?.libelle || '')}" placeholder="${tx('absences.libellePlaceholder')}" class="pp-input">
          </label>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <label class="block">
            <span class="pp-label">${tx('absences.compteHSChamp')}</span>
            <select name="compteHS" class="pp-select">
              ${FACTEURS.map((f) => `<option value="${f.valeur}" ${Math.abs((m?.compteHS || 0) - f.valeur) < 0.01 ? 'selected' : ''}>${f.libelle}</option>`).join('')}
            </select>
          </label>
          <label class="block">
            <span class="pp-label">${tx('absences.couleurChamp')}</span>
            <select name="couleur" class="pp-select">
              ${PP.motifs.COULEURS.map((c) => `<option value="${c}" ${m?.couleur === c ? 'selected' : ''}>${c}</option>`).join('')}
            </select>
          </label>
        </div>
        <label class="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
          <input type="checkbox" name="exigeCommentaire" ${m?.exigeCommentaire ? 'checked' : ''} class="h-4 w-4 accent-emerald-400">
          <span class="text-sm text-white/75">${tx('absences.exigeCommentaire')}</span>
        </label>
        <p id="motif-form-erreur" class="hidden rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-2.5 text-xs text-red-200"></p>
      </form>`;

    const fermer = modal({
      title: creation ? tx('absences.titreNouveauMotif') : tx('absences.titreModifierMotif', { code }),
      size: 'max-w-lg',
      body,
      footer: `
        <button data-close class="pp-btn-ghost">${tx('action.annuler')}</button>
        <button id="motif-ok" class="pp-btn-primary">${creation ? tx('absences.creerMotif') : tx('action.enregistrer')}</button>`,
    });

    /* Requêtes limitées à cette modale */
    const boiteModale = fermer.overlay;

    const soumettre = () => {
      const form = boiteModale.querySelector('#motif-form');
      const data = {
        code: form.querySelector('[name="code"]').value,
        libelle: form.querySelector('[name="libelle"]').value,
        compteHS: Number(form.querySelector('[name="compteHS"]').value),
        couleur: form.querySelector('[name="couleur"]').value,
        exigeCommentaire: form.querySelector('[name="exigeCommentaire"]').checked,
      };
      const r = creation ? PP.motifs.create(data) : PP.motifs.update(code, data);
      const boite = boiteModale.querySelector('#motif-form-erreur');
      if (r.erreur) { boite.textContent = r.erreur; boite.classList.remove('hidden'); return; }
      fermer();
      toast(creation ? tx('absences.motifCree') : tx('absences.motifMaj'), 'success');
      dessiner();
    };

    boiteModale.querySelector('#motif-ok').addEventListener('click', soumettre);
    boiteModale.querySelector('#motif-form').addEventListener('submit', (e) => { e.preventDefault(); soumettre(); });
  };

  /* ================= Suppressions ================= */
  const confirmerSuppressionAbsence = (id) => {
    const a = PP.absences.get(id);
    if (!a) return;
    const e = PP.employes.get(a.employeId);
    confirmDialog({
      title: tx('absences.titreSupprimer'),
      message: tx('absences.supprimerMessage', {
        motif: escapeHtml(a.motif),
        date: PP.dates.formatCourt(PP.dates.fromISO(a.dateDebut)),
        employe: e ? tx('absences.deEmploye', { nom: `${escapeHtml(e.prenom)} ${escapeHtml(e.nom)}` }) : '',
      }),
      confirmLabel: tx('action.supprimer'),
      onConfirm: () => {
        PP.absences.remove(id);
        toast(tx('absences.absenceSupprimee'), 'success');
        dessiner();
      },
    });
  };

  const confirmerSuppressionMotif = (code) => {
    confirmDialog({
      title: tx('absences.titreSupprimerMotif', { code }),
      message: tx('absences.supprimerMotifMessage'),
      confirmLabel: tx('action.supprimer'),
      onConfirm: () => {
        const r = PP.motifs.remove(code);
        if (r.erreur) { toast(r.erreur, 'error'); return; }
        toast(tx('absences.motifSupprime'), 'success');
        dessiner();
      },
    });
  };

  /* ================= Justificatif ================= */
  const telechargerJustificatif = (id) => {
    const a = PP.absences.get(id);
    if (!a?.justificatif) return;
    const lien = document.createElement('a');
    lien.href = a.justificatif.data;
    lien.download = a.justificatif.nom;
    lien.click();
  };

  return { render };
})();

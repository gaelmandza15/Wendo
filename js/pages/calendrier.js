/* Page Calendrier (section 2) — vue annuelle, semaines ISO, week-ends et jours fériés,
   date de début d'utilisation, fériés d'entreprise personnalisés */
window.PP = window.PP || {};
PP.pages = PP.pages || {};

PP.pages.calendrier = (() => {
  const { escapeHtml, capitalize, uid } = PP.utils;
  const { icon, toast, confirmDialog } = PP.ui;

  const etat = { annee: new Date().getFullYear(), ouvertsSeulement: false };
  let racine = null;

  /* ---------- Données ---------- */

  const feriesPersonnalises = () => PP.store.get('feries', []);

  /* Fériés légaux (calculés) + fériés d'entreprise, pour une année */
  const feriesAnnee = (annee) => {
    const map = { ...PP.dates.feries(annee) };
    feriesPersonnalises().forEach((f) => {
      if (PP.dates.fromISO(f.date).getFullYear() === annee) map[f.date] = f.libelle;
    });
    return map;
  };

  const feriesPersonnalisesAnnee = (annee) => feriesPersonnalises()
    .filter((f) => PP.dates.fromISO(f.date).getFullYear() === annee)
    .sort((a, b) => a.date.localeCompare(b.date));

  /* Plage d'années acceptée pour un férié d'entreprise : ±5 ans autour de l'année
     courante (garde-fou contre une faute de frappe sur l'année) */
  const ANNEES_MARGE = 5;
  const bornesFerie = () => {
    const annee = new Date().getFullYear();
    return { min: `${annee - ANNEES_MARGE}-01-01`, max: `${annee + ANNEES_MARGE}-12-31` };
  };

  /* Génère tous les jours de l'année avec semaine ISO, week-end et férié */
  const genererJours = (annee) => {
    const feries = feriesAnnee(annee);
    const jours = [];
    const d = new Date(annee, 0, 1);
    while (d.getFullYear() === annee) {
      const iso = PP.dates.toISO(d);
      const estFerie = feries[iso] || null;
      const weekend = PP.dates.isWeekend(d);
      jours.push({
        date: new Date(d),
        iso,
        jourSemaine: PP.dates.JOURS[d.getDay()],
        mois: PP.dates.MOIS[d.getMonth()],
        moisIndex: d.getMonth(),
        semaine: PP.dates.isoWeek(d).week,
        weekend,
        estFerie,
        ouvre: !weekend && !estFerie,
      });
      d.setDate(d.getDate() + 1);
    }
    return jours;
  };

  /* ---------- Rendu ---------- */

  const render = (root) => {
    racine = root;

    root.innerHTML = `
      <div class="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 class="text-4xl font-semibold tracking-tight">${t('pages.calendrier.titre')}</h1>
          <p id="cal-compte" class="mt-2 text-white/50"></p>
        </div>
        <div class="flex items-center gap-3">
          <div class="flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
            <button id="cal-annee-avant" title="${t('calendrier.anneePrecedente')}" class="rounded-lg p-2 text-white/60 transition hover:bg-white/5 hover:text-white">${icon('i-arrow-r', 'h-4 w-4 rotate-180')}</button>
            <span id="cal-annee" class="min-w-[4.5rem] text-center text-sm font-semibold tabular-nums"></span>
            <button id="cal-annee-apres" title="${t('calendrier.anneeSuivante')}" class="rounded-lg p-2 text-white/60 transition hover:bg-white/5 hover:text-white">${icon('i-arrow-r', 'h-4 w-4')}</button>
          </div>
          <button id="cal-toggle-ouvres" class="flex items-center gap-2.5 rounded-xl border border-white/10 px-4 py-2.5 text-xs text-white/60 transition hover:text-white">
            <span class="pp-switch" data-on="false"></span> ${t('calendrier.joursOuvresUniquement')}
          </button>
        </div>
      </div>

      <!-- Date de début d'utilisation -->
      <div class="mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-amber-400/15 bg-amber-400/[0.05] px-4 py-3">
        ${icon('i-alert', 'h-4 w-4 shrink-0 text-amber-300')}
        <p class="text-xs leading-relaxed text-amber-200/80">
          ${t('calendrier.dateDebutTexte', {
            titre: `<span class="font-medium text-amber-100">${t('calendrier.dateDebutTitre')}</span>`,
          })}
        </p>
        <div class="ml-auto flex items-center gap-2">
          <input type="date" id="cal-date-debut" class="pp-input w-44 py-1.5 text-xs">
          <button id="cal-date-debut-ok" class="pp-btn-ghost px-3 py-1.5 text-xs">${t('calendrier.appliquer')}</button>
        </div>
      </div>

      <div class="mt-5 grid grid-cols-12 gap-5">
        <!-- Tableau des jours -->
        <section class="col-span-8 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <div class="flex items-center justify-between">
            <h2 class="flex items-center gap-2.5 font-semibold">${icon('i-calendar', 'h-5 w-5 text-white/85')} ${t('calendrier.joursAnnee')} <span id="cal-annee-badge" class="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-normal text-white/50"></span></h2>
            <span class="text-[11px] text-white/35">${t('calendrier.semainesIso')}</span>
          </div>
          <div class="mt-4 max-h-[62vh] overflow-y-auto">
            <table class="w-full text-sm">
              <thead class="sticky top-0 z-10 bg-[#0a0a0a]">
                <tr class="border-b border-white/10 text-left text-[11px] uppercase tracking-[0.12em] text-white/35">
                  <th class="py-3 pl-1 font-medium">${t('calendrier.colDate')}</th>
                  <th class="py-3 font-medium">${t('tableau.jour')}</th>
                  <th class="py-3 font-medium">${t('app.semaine')}</th>
                  <th class="py-3 font-medium">${t('calendrier.colMois')}</th>
                  <th class="py-3 pr-1 text-right font-medium">${t('calendrier.colType')}</th>
                </tr>
              </thead>
              <tbody id="cal-corps" class="divide-y divide-white/5"></tbody>
            </table>
          </div>
        </section>

        <!-- Panneau fériés -->
        <section class="col-span-4 space-y-5">
          <div class="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <h2 class="flex items-center gap-2 text-sm font-semibold">${icon('i-cal-x', 'h-4 w-4 text-white/85')} ${t('calendrier.joursFeries')} <span id="cal-annee-2"></span></h2>
            <ul id="cal-liste-feries" class="mt-4 space-y-2.5"></ul>
          </div>

          <div class="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <h2 class="flex items-center gap-2 text-sm font-semibold">${icon('i-plus', 'h-4 w-4 text-white/85')} ${t('calendrier.ferieEntreprise')}</h2>
            <p class="mt-1.5 text-[11px] leading-relaxed text-white/40">${t('calendrier.ferieAide')}</p>
            <p id="cal-ferie-total" class="mt-2 rounded-lg border border-white/5 bg-white/[0.03] px-2.5 py-1.5 text-[11px] leading-relaxed text-white/50"></p>
            <div class="mt-3 space-y-3">
              <input type="date" id="cal-ferie-date" min="${bornesFerie().min}" max="${bornesFerie().max}" class="pp-input text-xs">
              <input type="text" id="cal-ferie-libelle" placeholder="${t('calendrier.feriePlaceholder')}" class="pp-input text-xs">
              <button id="cal-ferie-ajout" class="pp-btn-primary w-full justify-center py-2 text-xs">${t('calendrier.ferieAjouter')}</button>
            </div>
          </div>
        </section>
      </div>`;

    /* Événements */
    racine.querySelector('#cal-annee-avant').addEventListener('click', () => { etat.annee -= 1; dessiner(); });
    racine.querySelector('#cal-annee-apres').addEventListener('click', () => { etat.annee += 1; dessiner(); });

    const toggle = racine.querySelector('#cal-toggle-ouvres');
    toggle.addEventListener('click', () => {
      etat.ouvertsSeulement = !etat.ouvertsSeulement;
      toggle.querySelector('.pp-switch').dataset.on = etat.ouvertsSeulement;
      dessinerTableau();
    });

    racine.querySelector('#cal-date-debut-ok').addEventListener('click', appliquerDateDebut);

    racine.querySelector('#cal-ferie-ajout').addEventListener('click', ajouterFerie);
    racine.querySelector('#cal-liste-feries').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-suppr-ferie]');
      if (!btn) return;
      PP.store.set('feries', feriesPersonnalises().filter((f) => f.id !== btn.dataset.supprFerie));
      toast(t('calendrier.ferieSupprime'), 'success');
      dessiner();
    });

    dessiner();
  };

  const dessiner = () => {
    if (!racine) return;
    racine.querySelector('#cal-annee').textContent = etat.annee;
    racine.querySelector('#cal-annee-badge').textContent = `— ${etat.annee}`;
    racine.querySelector('#cal-annee-2').textContent = etat.annee;
    racine.querySelector('#cal-date-debut').value = PP.settings.get('dateDebut');

    const jours = genererJours(etat.annee);
    const feries = feriesAnnee(etat.annee);
    const nbOuvres = jours.filter((j) => j.ouvre).length;
    const nbFeries = Object.keys(feries).length;
    /* Les fériés tombant un week-end sont comptés dans les deux catégories :
       on précise combien tombent en semaine pour que le total reste lisible */
    const nbFeriesSemaine = Object.keys(feries)
      .filter((iso) => !PP.dates.isWeekend(PP.dates.fromISO(iso))).length;
    const nbWeekends = jours.filter((j) => j.weekend).length;
    racine.querySelector('#cal-compte').textContent = t('calendrier.compte', {
      ouvres: nbOuvres, feries: nbFeries, semaine: nbFeriesSemaine, weekends: nbWeekends,
    });

    dessinerTableau();
    dessinerFeries();
  };

  /* ---------- Tableau des jours ---------- */

  const dessinerTableau = () => {
    const debut = PP.settings.get('dateDebut');
    const jours = genererJours(etat.annee)
      .filter((j) => (etat.ouvertsSeulement ? j.ouvre : true));

    racine.querySelector('#cal-corps').innerHTML = jours.map((j) => {
      const avantDebut = j.iso < debut;
      const semainePaire = j.semaine % 2 === 0;

      let type;
      if (j.estFerie) {
        type = `<span class="inline-flex items-center gap-1.5 rounded-full bg-amber-400/10 px-2.5 py-1 text-[11px] font-medium text-amber-300"><span class="h-1.5 w-1.5 rounded-full bg-amber-400"></span>${escapeHtml(j.estFerie)}</span>`;
      } else if (j.weekend) {
        type = `<span class="text-[11px] text-white/35">${t('calendrier.typeWeekend')}</span>`;
      } else {
        type = `<span class="inline-flex items-center gap-1.5 rounded-full bg-emerald-400/10 px-2.5 py-1 text-[11px] font-medium text-emerald-300"><span class="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>${t('calendrier.typeOuvre')}</span>`;
      }

      return `
      <tr class="transition-colors hover:bg-white/[0.02] ${avantDebut ? 'opacity-40' : ''} ${semainePaire ? 'bg-white/[0.015]' : ''}">
        <td class="py-2 pl-1 text-xs tabular-nums text-white/85">${j.iso.slice(8, 10)}/${j.iso.slice(5, 7)}</td>
        <td class="py-2 text-xs capitalize ${j.weekend && !j.estFerie ? 'text-white/40' : 'text-white/75'}">${escapeHtml(j.jourSemaine)}</td>
        <td class="py-2 text-xs tabular-nums text-white/50">S${String(j.semaine).padStart(2, '0')}</td>
        <td class="py-2 text-xs capitalize text-white/50">${escapeHtml(j.mois)}</td>
        <td class="py-2 pr-1 text-right">${type}</td>
      </tr>`;
    }).join('');
  };

  /* ---------- Panneau des fériés ---------- */

  const dessinerFeries = () => {
    const auto = PP.dates.feries(etat.annee);
    const persos = feriesPersonnalisesAnnee(etat.annee);

    const ligneFerie = (iso, libelle, perso) => `
      <li class="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2.5">
        <span class="w-16 shrink-0 text-xs tabular-nums text-white/60">${PP.dates.formatCourt(PP.dates.fromISO(iso)).slice(0, 5)}</span>
        <span class="min-w-0 flex-1 truncate text-xs ${perso ? 'text-teal-200' : 'text-white/80'}">${escapeHtml(libelle)}</span>
        ${perso
          ? `<button data-suppr-ferie="${perso.id}" title="${t('action.supprimer')}" class="rounded-lg p-1.5 text-white/40 transition hover:bg-red-500/10 hover:text-red-300">${icon('i-trash', 'h-3.5 w-3.5')}</button>`
          : `<span class="shrink-0 rounded-md bg-white/5 px-2 py-0.5 text-[10px] text-white/35">${t('calendrier.ferieAuto')}</span>`}
      </li>`;

    const lignesAuto = Object.entries(auto)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([iso, libelle]) => ligneFerie(iso, libelle, null));

    const lignesPersos = persos.map((f) => ligneFerie(f.date, f.libelle, f));

    const tout = [...lignesAuto, ...lignesPersos];
    racine.querySelector('#cal-liste-feries').innerHTML = tout.length
      ? tout.join('')
      : `<li class="text-xs text-white/35">${t('calendrier.ferieAucun')}</li>`;

    /* Rappel des fériés d'entreprise enregistrés sur les autres années :
       la liste latérale ne montre que l'année affichée */
    const toutes = feriesPersonnalises();
    const elTotal = racine.querySelector('#cal-ferie-total');
    if (!toutes.length) {
      elTotal.textContent = t('calendrier.ferieAucunEnregistre');
      return;
    }
    const parAnnee = {};
    toutes.forEach((f) => {
      const an = PP.dates.fromISO(f.date).getFullYear();
      parAnnee[an] = (parAnnee[an] || 0) + 1;
    });
    const s = toutes.length > 1 ? 's' : '';
    const total = t('calendrier.ferieTotal', { n: toutes.length, s });
    const autres = Object.keys(parAnnee)
      .map(Number).sort()
      .filter((an) => an !== etat.annee)
      .map((an) => t('calendrier.ferieAnnee', { n: parAnnee[an], annee: an }));
    elTotal.textContent = autres.length
      ? total + t('calendrier.ferieReste', { annee: etat.annee, liste: autres.join(', ') })
      : total + t('calendrier.ferieTous', { annee: etat.annee });
  };

  /* ---------- Actions ---------- */

  const appliquerDateDebut = () => {
    const valeur = racine.querySelector('#cal-date-debut').value;
    if (!valeur) return;
    if (valeur === PP.settings.get('dateDebut')) return;

    confirmDialog({
      title: t('calendrier.dateDebutModifierTitre'),
      message: t('calendrier.dateDebutModifierTexte', {
        avant: `<span class="font-medium text-white">${PP.dates.formatCourt(PP.dates.fromISO(PP.settings.get('dateDebut')))}</span>`,
        apres: `<span class="font-medium text-white">${PP.dates.formatCourt(PP.dates.fromISO(valeur))}</span>`,
      }),
      /* Les boutons de la boîte de confirmation sont figés en français dans le
         composant : on leur applique la langue courante ici, sans le modifier. */
      onOpen: (overlay) => {
        const annuler = overlay.querySelector('[data-close]');
        if (annuler) annuler.textContent = t('calendrier.annuler');
      },
      confirmLabel: t('calendrier.confirmer'),
      /* Le champ revient toujours à la valeur réellement appliquée (annulation, Échap, clic hors modale) */
      onClose: () => {
        if (racine) racine.querySelector('#cal-date-debut').value = PP.settings.get('dateDebut');
      },
      onConfirm: () => {
        PP.settings.save({ dateDebut: valeur });
        toast(t('calendrier.dateDebutMaj'), 'success');
        dessiner();
      },
    });
  };

  const ajouterFerie = () => {
    const date = racine.querySelector('#cal-ferie-date').value;
    const libelle = racine.querySelector('#cal-ferie-libelle').value.trim();

    if (!date) { toast(t('calendrier.errDate'), 'warning'); return; }
    if (!libelle) { toast(t('calendrier.errLibelle'), 'warning'); return; }

    /* Garde-fou : date trop éloignée (faute de frappe sur l'année) */
    const bornes = bornesFerie();
    if (date < bornes.min || date > bornes.max) {
      const annee = PP.dates.fromISO(date).getFullYear();
      toast(t('calendrier.errAnneeHorsPlage', { annee, min: bornes.min.slice(0, 4), max: bornes.max.slice(0, 4) }), 'warning');
      return;
    }

    if (PP.dates.feries(PP.dates.fromISO(date).getFullYear())[date]) {
      toast(t('calendrier.errDejaLegal'), 'warning');
      return;
    }
    if (feriesPersonnalises().some((f) => f.date === date)) {
      toast(t('calendrier.errDejaExiste'), 'warning');
      return;
    }

    PP.store.set('feries', [...feriesPersonnalises(), { id: uid(), date, libelle }]);
    racine.querySelector('#cal-ferie-libelle').value = '';
    racine.querySelector('#cal-ferie-date').value = '';

    const anneeFerie = PP.dates.fromISO(date).getFullYear();
    if (anneeFerie !== etat.annee) {
      toast(t('calendrier.ajouteAutreAnnee', { annee: anneeFerie }), 'success');
    } else {
      toast(t('calendrier.ajouteToast'), 'success');
    }
    dessiner();
  };

  return { render };
})();

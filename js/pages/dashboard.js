/* Page Tableau de bord (section 6) — la maquette alimentée par les données réelles */
window.PP = window.PP || {};
PP.pages = PP.pages || {};

PP.pages.dashboard = (() => {
  const { escapeHtml, capitalize, initials } = PP.utils;
  const { icon, toast, avatar, badge, modal } = PP.ui;

  const aujourdhuiISO = () => PP.dates.toISO(new Date());
  const maintenantHHMM = () => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  let racine = null;
  let employeRapide = null;

  /* ================= Rendu ================= */
  const render = (root) => {
    racine = root;
    employeRapide = null;

    /* Salutation : premier mot du nom du compte connecté */
    const utilisateur = PP.securite.utilisateur();
    const prenom = (utilisateur?.nom || '').trim().split(/\s+/)[0];

    root.innerHTML = `
      <h1 class="text-4xl font-semibold tracking-tight">${prenom ? tx('dashboard.bonjour', { nom: escapeHtml(prenom) }) : tx('app.nom')}</h1>
      <p class="mt-2 text-white/50">${tx('pages.dashboard.sousTitre')}</p>

      <div id="db-cartes" class="mt-8 grid grid-cols-4 gap-5"></div>

      <div class="mt-5 flex items-center gap-3 rounded-xl border border-amber-400/15 bg-amber-400/[0.05] px-4 py-3">
        ${icon('i-alert', 'h-4 w-4 shrink-0 text-amber-300')}
        <p class="text-xs leading-relaxed text-amber-200/80">
          ${tx('dashboard.perimetreTexte')}
          <span class="text-amber-100/60">${tx('dashboard.debutUtilisation', { date: PP.dates.formatCourt(PP.dates.fromISO(PP.settings.get('dateDebut'))) })}</span>
        </p>
      </div>

      <div class="mt-5 grid grid-cols-12 gap-5">
        <section class="col-span-5 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <div class="flex items-center justify-between">
            <h2 class="flex items-center gap-2.5 font-semibold">${PP.htmlLogo('h-5 w-5 opacity-85')} ${tx('dashboard.derniersPointages')}</h2>
            <a href="#/pointage" class="flex items-center gap-1.5 text-xs text-white/45 transition hover:text-white">${tx('action.voirTout')} ${icon('i-arrow-r', 'h-3.5 w-3.5')}</a>
          </div>
          <div id="db-pointages"></div>
        </section>

        <section class="col-span-4 flex flex-col rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.05] via-white/[0.02] to-transparent p-6">
          <div class="flex w-full items-center justify-between text-xs">
            <span class="flex items-center gap-2 font-medium text-white/75">${PP.htmlLogo('h-4 w-4 opacity-85')} ${tx('dashboard.saisieRapide')}</span>
            <span class="text-white/40 capitalize">${capitalize(PP.dates.formatLong(new Date()))}</span>
          </div>

          <select id="db-rapide-select" class="pp-select mt-4 text-xs"></select>

          <div class="relative mt-4 flex h-32 w-32 items-center justify-center self-center rounded-full border border-white/15 bg-gradient-to-b from-white/[0.08] to-transparent shadow-[0_0_90px_-20px_rgba(255,255,255,0.45)]">
            <span class="animate-ring absolute inset-0 rounded-full border border-white/20"></span>
            <button id="db-rapide-maintenant" title="${tx('dashboard.remplirCreneau')}" class="flex h-24 w-24 items-center justify-center rounded-full border border-white/20 bg-gradient-to-br from-white/25 via-white/10 to-transparent transition hover:scale-[1.04]">
              ${icon('i-clock', 'h-8 w-8')}
            </button>
          </div>

          <div class="mt-4 grid w-full grid-cols-2 gap-3">
            <label class="block"><span class="pp-label">${tx('pointage.nomColonne.debutMatin')}</span><input type="text" id="db-t1" maxlength="6" placeholder="08:00" class="pp-input text-center text-sm tabular-nums"></label>
            <label class="block"><span class="pp-label">${tx('dashboard.finMatin')}</span><input type="text" id="db-t2" maxlength="6" placeholder="12:00" class="pp-input text-center text-sm tabular-nums"></label>
            <label class="block"><span class="pp-label">${tx('pointage.nomColonne.debutApresMidi')}</span><input type="text" id="db-t3" maxlength="6" placeholder="13:00" class="pp-input text-center text-sm tabular-nums"></label>
            <label class="block"><span class="pp-label">${tx('dashboard.finApresMidi')}</span><input type="text" id="db-t4" maxlength="6" placeholder="17:00" class="pp-input text-center text-sm tabular-nums"></label>
          </div>

          <div class="mt-4 w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
            <div class="flex items-center justify-between text-xs">
              <span class="text-white/50">${tx('pointage.totalDuJour')}</span>
              <span id="db-rapide-total" class="font-semibold tabular-nums">—</span>
            </div>
            <div class="mt-2 flex items-center justify-between text-xs">
              <span class="text-white/50">${tx('app.semaine')}</span>
              <span id="db-rapide-semaine" class="tabular-nums text-white/80">—</span>
            </div>
            <div class="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div id="db-rapide-barre" class="h-full w-0 rounded-full bg-gradient-to-r from-white/60 to-white"></div>
            </div>
          </div>

          <button id="db-rapide-enregistrer" class="pp-btn-primary mt-4 w-full justify-center">${tx('dashboard.enregistrerJournee')}</button>
          <a href="#/absences" class="mt-2 w-full rounded-xl border border-white/10 py-3 text-center text-sm font-medium text-white/70 transition hover:bg-white/5 hover:text-white">${tx('dashboard.declarerAbsence')}</a>
        </section>

        <div class="col-span-3 space-y-5">
          <section class="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <h2 class="flex items-center gap-2 text-sm font-semibold">${icon('i-sun', 'h-4 w-4 text-white/85')} ${tx('dashboard.aujourdhuiTitre')}</h2>
            <ul id="db-aujourdhui" class="mt-4 space-y-3.5"></ul>
          </section>

          <section class="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <div class="flex items-center justify-between">
              <h2 class="flex items-center gap-2 text-sm font-semibold">${icon('i-cal-x', 'h-4 w-4 text-white/85')} ${tx('dashboard.demandesAbsence')}</h2>
              <a href="#/absences" class="flex items-center gap-1 text-[11px] text-white/45 transition hover:text-white">${tx('action.voirTout')} ${icon('i-arrow-r', 'h-3 w-3')}</a>
            </div>
            <ul id="db-demandes" class="mt-4 space-y-4"></ul>
          </section>

          <section id="db-annonces" class="rounded-2xl border border-white/10 bg-white/[0.03] p-5"></section>

          <section class="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <div class="flex items-center justify-between">
              <h2 class="flex items-center gap-2 text-sm font-semibold">${icon('i-trend', 'h-4 w-4 text-white/85')} ${tx('dashboard.statsMois')}</h2>
              <span class="text-[11px] text-white/35">${PP.dates.MOIS[new Date().getMonth()]}</span>
            </div>
            <div id="db-stats-mois" class="mt-4 flex items-center gap-4"></div>
          </section>
        </div>
      </div>

      <div class="mt-5 grid grid-cols-2 gap-5">
        <section class="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <div class="flex items-center justify-between">
            <h2 class="flex items-center gap-2.5 font-semibold">${icon('i-chart', 'h-5 w-5 text-white/85')} ${tx('dashboard.heuresMoyennes')}</h2>
            <span class="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/50">${tx('dashboard.seuilSemaine', { n: PP.settings.get('seuilHebdo') })}</span>
          </div>
          <div id="db-graph-semaines" class="relative mt-8 h-44 px-2"></div>
          <div class="mt-6 flex items-center gap-5 border-t border-white/5 pt-4 text-[11px] text-white/40">
            <span class="flex items-center gap-2"><span class="h-2 w-2 rounded-sm bg-white/60"></span> ${tx('dashboard.heuresTravaillees')}</span>
            <span class="flex items-center gap-2"><span class="h-px w-4 border-t border-dashed border-white/50"></span> ${tx('dashboard.seuilHebdo')}</span>
            <span class="ml-auto text-white/30">${tx('dashboard.auDessusSeuilLegende')}</span>
          </div>
        </section>

        <section class="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <div class="flex items-center justify-between">
            <h2 class="flex items-center gap-2.5 font-semibold">${icon('i-cal-x', 'h-5 w-5 text-white/85')} ${tx('dashboard.absencesParMotif')}</h2>
            <span id="db-absences-total" class="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/50"></span>
          </div>
          <ul id="db-graph-motifs" class="mt-6 space-y-4"></ul>
          <p class="mt-6 border-t border-white/5 pt-4 text-[11px] leading-relaxed text-white/35">
            ${tx('dashboard.noteFacteurHS')}
          </p>
        </section>
      </div>`;

    dessinerCartes();
    dessinerPointages();
    initSaisieRapide();
    dessinerAujourdhui();
    dessinerDemandes();
    dessinerAnnonces();
    dessinerStatsMois();
    dessinerGraphiqueSemaines();
    dessinerGraphiqueMotifs();
  };

  /* ================= Annonces générales ================= */
  const dessinerAnnonces = () => {
    const section = racine.querySelector('#db-annonces');
    const annonces = PP.messages.annonces();
    const peutPublier = PP.securite.peut('absence.valider');
    if (!annonces.length && !peutPublier) { section.classList.add('hidden'); return; }
    section.classList.remove('hidden');
    section.innerHTML = `
      <div class="flex items-center justify-between">
        <h2 class="flex items-center gap-2 text-sm font-semibold">${icon('i-alert', 'h-4 w-4 text-amber-300/80')} ${tx('dashboard.annonces')}</h2>
        ${peutPublier ? `<button id="db-annonce-ajout" class="text-[11px] text-white/45 transition hover:text-white">${tx('dashboard.annoncer')}</button>` : ''}
      </div>
      <ul class="mt-4 space-y-3">
        ${annonces.slice(0, 3).map((a) => `
          <li class="rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2.5">
            <p class="text-xs leading-relaxed text-white/80">${escapeHtml(a.texte)}</p>
            <p class="mt-1 text-[10px] text-white/30">${escapeHtml(a.auteur)} · ${PP.dates.formatCourt(new Date(a.horodatage))}</p>
          </li>`).join('') || `<li class="text-xs text-white/35">${tx('dashboard.aucuneAnnonce')}</li>`}
      </ul>`;

    section.querySelector('#db-annonce-ajout')?.addEventListener('click', () => {
      const fermer = modal({
        title: tx('dashboard.nouvelleAnnonce'),
        size: 'max-w-md',
        body: `
          <label class="block"><span class="pp-label">${tx('dashboard.messageChamp')}</span>
          <textarea id="db-annonce-texte" rows="3" class="pp-input" placeholder="${tx('dashboard.annoncePlaceholder')}"></textarea></label>`,
        footer: `
          <button data-close class="pp-btn-ghost">${tx('action.annuler')}</button>
          <button id="db-annonce-ok" class="pp-btn-primary">${tx('dashboard.annoncePublier')}</button>`,
      });
      /* Requêtes limitées à cette modale */
      const boiteModale = fermer.overlay;
      boiteModale.querySelector('#db-annonce-ok').addEventListener('click', () => {
        const r = PP.messages.envoyer(null, boiteModale.querySelector('#db-annonce-texte').value);
        if (r.erreur) { toast(r.erreur, 'warning'); return; }
        fermer();
        dessinerAnnonces();
        toast(tx('dashboard.annoncePubliee'), 'success');
      });
    });
  };

  /* ================= Cartes statistiques ================= */
  const dessinerCartes = () => {
    const actifs = PP.employes.actifs();
    const auj = aujourdhuiISO();
    const pointes = actifs.filter((e) => PP.pointages.get(e.id, auj));
    const stats = PP.pointages.statsJour(auj);

    const debutMois = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`;
    let hsMois = 0;
    actifs.forEach((e) => { hsMois += PP.calculs.resumePeriode(e.id, debutMois, auj).hs; });

    const auDessusSeuil = actifs.filter((e) => PP.calculs.detailSemaine(e.id, auj).hs > 0).length;

    const absAuj = PP.absences.list().filter((a) => a.statut !== 'refusee' && a.dateDebut <= auj && auj <= a.dateFin);
    const parMotif = absAuj.map((a) => a.motif).reduce((acc, m) => { acc[m] = (acc[m] || 0) + 1; return acc; }, {});
    const detailMotifs = Object.entries(parMotif).map(([m, n]) => `${n} ${m}`).join(' · ') || tx('dashboard.aucuneAbsence');

    const minutes = pointes.map((e) => PP.pointages.heuresJour(PP.pointages.get(e.id, auj)));
    const moyenne = minutes.length ? Math.round(minutes.reduce((a, b) => a + b, 0) / minutes.length) : 0;

    const carte = (icone, titre, valeur, sous, ligneFin, classe = '') => `
      <div class="rounded-2xl ${classe || 'border border-white/10 bg-white/[0.03]'} p-5">
        <div class="flex items-center gap-3">
          <span class="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5">${icon(icone, 'h-5 w-5 text-white/85')}</span>
          <span class="text-sm text-white/60">${titre}</span>
        </div>
        <p class="mt-5 text-4xl font-semibold tracking-tight">${valeur}</p>
        <p class="mt-1 text-xs text-white/40">${sous}</p>
        <p class="mt-4 flex items-center gap-1.5 text-xs ${ligneFin.classe}">${ligneFin.texte}</p>
      </div>`;

    racine.querySelector('#db-cartes').innerHTML = `
      ${carte('i-users', tx('dashboard.presents'), pointes.length, tx('dashboard.surEmployesActifs', { n: actifs.length }),
        { texte: tx('dashboard.aValiderRefuses', { aValider: stats.aValider, n: stats.refuses, s: stats.refuses > 1 ? 's' : '' }), classe: 'text-white/50' },
        'border border-white/25 bg-white/[0.05] shadow-[0_0_70px_-18px_rgba(255,255,255,0.45)]')}
      ${carte('i-trend', tx('dashboard.heuresSupMois'), PP.time.formatHM(hsMois), tx('dashboard.seuilSemaineEmploye', { n: PP.settings.get('seuilHebdo') }),
        { texte: tx('dashboard.employesAuDessus', { n: auDessusSeuil, s: auDessusSeuil > 1 ? 's' : '' }), classe: auDessusSeuil ? 'text-amber-300/90' : 'text-white/50' })}
      ${carte('i-cal-x', tx('dashboard.absencesJour'), absAuj.length, detailMotifs,
        { texte: tx('dashboard.demandesEnAttente', { n: PP.absences.list().filter((a) => a.statut === 'attente').length, s: PP.absences.list().filter((a) => a.statut === 'attente').length > 1 ? 's' : '' }), classe: 'text-white/50' })}
      ${carte('i-clock', tx('dashboard.tempsTravailMoy'), minutes.length ? PP.time.formatHM(moyenne) : '—', tx('dashboard.moyennePresents'),
        { texte: `${pointes.length ? tx('dashboard.donneesCompletes') : tx('dashboard.aucunPointageEnregistre')}`, classe: 'text-white/50' })}`;
  };

  /* ================= Derniers pointages ================= */
  const dessinerPointages = () => {
    const auj = aujourdhuiISO();
    const lignes = PP.employes.actifs()
      .map((e) => ({ e, p: PP.pointages.get(e.id, auj) }))
      .filter(({ p }) => p)
      .sort((a, b) => (b.p.t1 ?? 9999) - (a.p.t1 ?? 9999))
      .slice(0, 8);

    if (lignes.length === 0) {
      racine.querySelector('#db-pointages').innerHTML = `
        <p class="mt-5 rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-white/40">
          ${tx('dashboard.aucunPointage')} <a href="#/pointage" class="underline hover:text-white">${tx('dashboard.saisirPagePointage')}</a>.
        </p>`;
      return;
    }

    racine.querySelector('#db-pointages').innerHTML = `
      <table class="mt-5 w-full text-sm">
        <thead>
          <tr class="border-b border-white/10 text-left text-[11px] uppercase tracking-[0.12em] text-white/35">
            <th class="pb-3 font-medium">${tx('tableau.employe')}</th>
            <th class="pb-3 font-medium">${tx('jours.matin')}</th>
            <th class="pb-3 font-medium">${tx('jours.apresmidi')}</th>
            <th class="pb-3 text-right font-medium">${tx('tableau.total')}</th>
            <th class="pb-3 text-right font-medium">${tx('tableau.statut')}</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-white/5">
          ${lignes.map(({ e, p }) => {
            const h = (k) => (p[k] !== null && p[k] !== undefined ? PP.time.toHHMM(p[k]) : '—');
            const absence = PP.absences.pour(e.id, auj);
            const badgeAbs = absence ? badge(absence.motif, PP.motifs.byCode(absence.motif)?.couleur || 'white') : '';
            return `
            <tr class="transition-colors hover:bg-white/[0.02]">
              <td class="py-3">
                <div class="flex items-center gap-3">
                  ${avatar(e, 'h-9 w-9 text-[11px]')}
                  <span><span class="block text-sm font-medium leading-tight">${escapeHtml(e.prenom)} ${escapeHtml(e.nom)}</span><span class="block text-[11px] text-white/35">${escapeHtml(e.poste || '')}</span></span>
                </div>
              </td>
              <td class="whitespace-nowrap py-3 text-xs tabular-nums text-white/65">${h('t1')} → ${h('t2')}</td>
              <td class="whitespace-nowrap py-3 text-xs tabular-nums text-white/65">${h('t3')} → ${h('t4')}</td>
              <td class="py-3 text-right text-sm font-semibold tabular-nums">${PP.pointages.heuresJour(p) ? PP.time.formatHM(PP.pointages.heuresJour(p)) : '—'}</td>
              <td class="py-3 text-right whitespace-nowrap">${badgeAbs}${badgeStatutSimple(p)}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`;
  };

  const badgeStatutSimple = (p) => {
    if (p.statut === 'valide') return `<span class="ml-1 inline-flex items-center gap-1.5 rounded-full bg-emerald-400/10 px-2.5 py-1 text-[11px] font-medium text-emerald-300"><span class="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>${tx('statut.valide')}</span>`;
    if (p.statut === 'refuse') return `<span class="ml-1 inline-flex items-center gap-1.5 rounded-full bg-red-400/10 px-2.5 py-1 text-[11px] font-medium text-red-300"><span class="h-1.5 w-1.5 rounded-full bg-red-400"></span>${tx('statut.refuse')}</span>`;
    return `<span class="ml-1 inline-flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1 text-[11px] text-white/55"><span class="h-1.5 w-1.5 rounded-full bg-white/30"></span>${tx('statut.attente')}</span>`;
  };

  /* ================= Saisie rapide ================= */
  const initSaisieRapide = () => {
    const select = racine.querySelector('#db-rapide-select');
    const auj = aujourdhuiISO();
    /* Seuls les employés que l'utilisateur a le droit de pointer sont proposés
       (un compte « Employé » ne saisit que pour lui-même) */
    const pointables = [...PP.employes.actifs()]
      .filter((e) => PP.securite.peutEditerPointage(e.id))
      .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
    const cloture = PP.securite.periodeCloturee(auj);
    const bloque = Boolean(cloture) || pointables.length === 0;

    const btnEnregistrer = racine.querySelector('#db-rapide-enregistrer');
    const champs = ['t1', 't2', 't3', 't4'].map((k) => racine.querySelector(`#db-${k}`));

    if (pointables.length === 0) {
      select.innerHTML = `<option>${PP.employes.actifs().length ? tx('dashboard.aucunEmployePointable') : tx('tableau.aucunEmployeActif')}</option>`;
    } else {
      select.innerHTML = pointables.map((e) => `<option value="${e.id}">${escapeHtml(e.prenom)} ${escapeHtml(e.nom)}</option>`).join('');
      employeRapide = pointables[0].id;
    }

    /* Période clôturée ou aucun droit : la saisie rapide est neutralisée,
       comme sur la page Pointage — avec l'explication affichée */
    if (bloque) {
      select.disabled = true;
      champs.forEach((c) => { c.disabled = true; c.classList.add('cursor-not-allowed', 'opacity-45'); });
      ['#db-rapide-maintenant', '#db-rapide-enregistrer'].forEach((sel) => {
        const b = racine.querySelector(sel);
        b.disabled = true;
        b.classList.add('cursor-not-allowed', 'opacity-40');
      });
      const note = document.createElement('p');
      note.className = 'mt-3 rounded-xl border border-red-400/20 bg-red-400/10 px-3 py-2 text-[11px] leading-relaxed text-red-200';
      note.textContent = cloture
        ? tx('dashboard.periodeClotureeSaisies', { label: cloture.label })
        : tx('dashboard.roleSansSaisie');
      btnEnregistrer.insertAdjacentElement('afterend', note);
      return;
    }

    select.addEventListener('change', () => { employeRapide = select.value; chargerRapide(); });
    champs.forEach((champ, i) => champ.addEventListener('input', calculerRapide));
    racine.querySelector('#db-rapide-maintenant').addEventListener('click', () => {
      for (const k of ['t1', 't2', 't3', 't4']) {
        const champ = racine.querySelector(`#db-${k}`);
        if (!champ.value.trim()) { champ.value = maintenantHHMM(); break; }
      }
      calculerRapide();
    });
    btnEnregistrer.addEventListener('click', enregistrerRapide);
    chargerRapide();
  };

  const chargerRapide = () => {
    const p = PP.pointages.get(employeRapide, aujourdhuiISO());
    ['t1', 't2', 't3', 't4'].forEach((k) => {
      racine.querySelector(`#db-${k}`).value = p && p[k] !== null && p[k] !== undefined ? PP.time.toHHMM(p[k]) : '';
    });
    calculerRapide();
  };

  const calculerRapide = () => {
    const creneaux = ['t1', 't2', 't3', 't4'].map((k) => {
      const brut = racine.querySelector(`#db-${k}`).value.trim();
      return brut ? PP.time.parse(brut) : null;
    });
    const total = PP.time.totalJour([[creneaux[0], creneaux[1]], [creneaux[2], creneaux[3]]]);
    racine.querySelector('#db-rapide-total').textContent = total ? PP.time.formatHM(total) : '—';

    if (employeRapide) {
      const s = PP.calculs.detailSemaine(employeRapide, aujourdhuiISO());
      racine.querySelector('#db-rapide-semaine').textContent = `${PP.time.formatHM(s.travaille)} / ${PP.settings.get('seuilHebdo')}h`;
      racine.querySelector('#db-rapide-barre').style.width = `${Math.min(100, (s.travaille / (PP.settings.get('seuilHebdo') * 60)) * 100)}%`;
    }
    return creneaux;
  };

  const enregistrerRapide = () => {
    if (!employeRapide) return;
    /* Garde-fous identiques à la page Pointage (la saisie rapide ne doit
       pas être une voie de contournement des droits ni d'une clôture) */
    if (!PP.securite.peutEditerPointage(employeRapide)) {
      toast(tx('dashboard.nonModifiable'), 'error');
      return;
    }
    const cloture = PP.securite.periodeCloturee(aujourdhuiISO());
    if (cloture) {
      toast(tx('dashboard.periodeClotureeSaisie', { label: cloture.label }), 'error');
      return;
    }
    const creneaux = calculerRapide();
    const e = PP.employes.get(employeRapide);
    for (let i = 0; i < 4; i += 1) {
      const brut = racine.querySelector(`#db-t${i + 1}`).value.trim();
      if (brut && creneaux[i] === null) {
        toast(tx('pointage.heureNonReconnue', { brut }), 'error');
        return;
      }
    }
    PP.pointages.save(employeRapide, aujourdhuiISO(), { t1: creneaux[0], t2: creneaux[1], t3: creneaux[2], t4: creneaux[3] });
    toast(tx('dashboard.journeeEnregistree', { nom: `${e.prenom} ${e.nom}` }), 'success');
    render(racine); // rafraîchit tout le tableau de bord
  };

  /* ================= Aujourd'hui ================= */
  const dessinerAujourdhui = () => {
    const auj = aujourdhuiISO();
    const stats = PP.pointages.statsJour(auj);
    const abs = PP.absences.list().filter((a) => a.statut !== 'refusee' && a.dateDebut <= auj && auj <= a.dateFin).length;
    const hsSemaine = PP.employes.actifs().reduce((t, e) => t + PP.calculs.detailSemaine(e.id, auj).hs, 0);

    const ligne = (icone, titre, sous, classeTitre = 'text-white/90', classeIcone = 'text-white/75') => `
      <li class="flex items-center gap-3">
        <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5">${icon(icone, `h-4 w-4 ${classeIcone}`)}</span>
        <span class="h-6 w-px bg-white/10"></span>
        <div>
          <p class="text-sm font-medium tabular-nums ${classeTitre}">${titre}</p>
          <p class="text-[11px] text-white/40">${sous}</p>
        </div>
      </li>`;

    racine.querySelector('#db-aujourdhui').innerHTML = `
      ${ligne('i-users', `${stats.pointes} / ${stats.total}`, tx('dashboard.presentsAujourdhui'))}
      ${ligne('i-clock', `${stats.aValider}`, tx('dashboard.pointagesAValider'), stats.aValider ? 'text-amber-200/90' : 'text-white/90', stats.aValider ? 'text-amber-300/80' : 'text-white/75')}
      ${ligne('i-cal-x', `${abs}`, tx('dashboard.absencesDuJour'))}
      ${ligne('i-trend', hsSemaine ? `+${PP.time.formatHM(hsSemaine)}` : '0h00', tx('dashboard.hsEquipeSemaine'), hsSemaine ? 'text-amber-200/90' : 'text-white/90', hsSemaine ? 'text-amber-300/80' : 'text-white/75')}`;
  };

  /* ================= Demandes d'absence ================= */
  const dessinerDemandes = () => {
    const attente = PP.absences.list()
      .filter((a) => a.statut === 'attente')
      .sort((a, b) => a.dateDebut.localeCompare(b.dateDebut))
      .slice(0, 4);

    const ul = racine.querySelector('#db-demandes');
    if (attente.length === 0) {
      ul.innerHTML = `<li class="text-xs text-white/40">${tx('dashboard.aucuneDemandeAttente')}</li>`;
      return;
    }
    ul.innerHTML = attente.map((a) => {
      const e = PP.employes.get(a.employeId);
      const m = PP.motifs.byCode(a.motif);
      const periode = a.dateDebut === a.dateFin
        ? PP.dates.formatCourt(PP.dates.fromISO(a.dateDebut))
        : `${PP.dates.formatCourt(PP.dates.fromISO(a.dateDebut))} → ${PP.dates.formatCourt(PP.dates.fromISO(a.dateFin))}`;
      return `
      <li class="flex items-center gap-2">
        ${avatar(e || {}, 'h-9 w-9 text-[10px]')}
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-medium text-white">${e ? `${escapeHtml(e.prenom)} ${escapeHtml(e.nom)}` : '—'}</p>
          <p class="mt-0.5 flex items-center gap-1.5 truncate text-[11px] text-white/40">
            ${badge(a.motif, m?.couleur || 'white')} ${periode}${a.periode === 'matin' ? tx('pointage.periodeMatin') : a.periode === 'apresmidi' ? tx('pointage.periodeApresMidi') : ''}
          </p>
        </div>
        <!-- Colonne étroite : une pastille plutôt qu'un libellé complet, la
             demande étant déjà comptée dans la carte « Absences du jour » -->
        <span class="h-2 w-2 shrink-0 rounded-full bg-amber-400/80" title="${tx('absences.enAttenteValidation')}"></span>
      </li>`;
    }).join('');
  };

  /* ================= Statistiques du mois ================= */
  const dessinerStatsMois = () => {
    const auj = new Date();
    const debutMois = `${auj.getFullYear()}-${String(auj.getMonth() + 1).padStart(2, '0')}-01`;
    const aujISO = aujourdhuiISO();
    const actifs = PP.employes.actifs();

    let absJours = 0, hsMois = 0;
    actifs.forEach((e) => {
      const r = PP.calculs.resumePeriode(e.id, debutMois, aujISO);
      absJours += r.joursAbsence;
      hsMois += r.hs;
    });

    /* Jours ouvrés écoulés du mois (hors week-ends et fériés) */
    let attends = 0;
    const d = PP.dates.fromISO(debutMois);
    const feries = PP.calculs.feriesAnnee(auj.getFullYear());
    while (PP.dates.toISO(d) <= aujISO) {
      if (!PP.dates.isWeekend(d) && !feries[PP.dates.toISO(d)]) attends += actifs.length;
      d.setDate(d.getDate() + 1);
    }
    const taux = attends > 0 ? Math.max(0, Math.round(((attends - absJours) / attends) * 100)) : 100;

    /* Colonne étroite (3/12) : disposition verticale — anneau centré, puis
       les deux compteurs côte à côte sous le libellé */
    racine.querySelector('#db-stats-mois').innerHTML = `
      <div class="flex flex-col items-center gap-3">
        <div class="relative h-24 w-24 shrink-0">
          <svg viewBox="0 0 36 36" class="h-24 w-24 -rotate-90">
            <circle cx="18" cy="18" r="15.5" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="4"/>
            <circle cx="18" cy="18" r="15.5" fill="none" stroke="white" stroke-width="4" stroke-linecap="round" pathLength="100" stroke-dasharray="${Math.min(100, taux)} 100"/>
          </svg>
          <span class="absolute inset-0 flex items-center justify-center text-lg font-semibold">${taux}%</span>
        </div>
        <div class="text-center">
          <p class="text-sm font-medium text-white/90">${tx('dashboard.tauxPresence')}</p>
          <p class="mt-0.5 text-[11px] text-white/40">${tx('dashboard.joursOuvresEcoules')}</p>
        </div>
      </div>
      <div class="mt-4 flex flex-col gap-2">
        <div class="rounded-xl border border-white/5 bg-white/[0.04] px-3 py-2.5 text-center">
          <p class="text-sm font-semibold tabular-nums">${PP.time.formatHM(hsMois)}</p>
          <p class="mt-0.5 text-[10px] uppercase tracking-wider text-white/35">${tx('dashboard.hsCeMois')}</p>
        </div>
        <div class="rounded-xl border border-white/5 bg-white/[0.04] px-3 py-2.5 text-center">
          <p class="text-sm font-semibold tabular-nums">${absJours % 1 ? absJours.toFixed(1).replace('.', ',') : absJours} j</p>
          <p class="mt-0.5 text-[10px] uppercase tracking-wider text-white/35">${tx('nav.absences')}</p>
        </div>
      </div>`;
  };

  /* ================= Graphique : heures moyennes par semaine ================= */
  const dessinerGraphiqueSemaines = () => {
    const actifs = PP.employes.actifs();
    const seuil = PP.settings.get('seuilHebdo');
    const lundiCourant = PP.pointages.lundiDe(aujourdhuiISO());
    const semaines = [];
    for (let w = 3; w >= 0; w -= 1) {
      const lundi = PP.dates.fromISO(lundiCourant);
      lundi.setDate(lundi.getDate() - 7 * w);
      let total = 0;
      actifs.forEach((e) => { total += PP.calculs.detailSemaine(e.id, PP.dates.toISO(lundi)).travaille; });
      semaines.push({
        lundi: PP.dates.toISO(lundi),
        label: `S${PP.dates.isoWeek(lundi).week}`,
        moyenne: actifs.length ? total / actifs.length : 0,
        courante: w === 0,
      });
    }

    const maxVal = Math.max(seuil * 60, ...semaines.map((s) => s.moyenne)) * 1.15;
    const hauteurMax = 96;
    /* La ligne pointillée s'aligne sur la hauteur qu'aurait une barre au seuil :
       les barres reposent sur le bas du conteneur */
    const ySeuil = (seuil * 60 / maxVal) * hauteurMax;

    racine.querySelector('#db-graph-semaines').innerHTML = `
      <div class="pointer-events-none absolute inset-x-2 border-t border-dashed border-white/25" style="bottom:${ySeuil}px">
        <span class="absolute -top-1 right-0 -translate-y-full text-[10px] text-white/40">${tx('dashboard.seuilGraphique', { n: seuil })}</span>
      </div>
      <div class="flex h-full items-end justify-around">
        ${semaines.map((s) => `
        <div class="flex h-full w-20 flex-col items-center justify-end gap-2">
          <span class="text-[11px] tabular-nums ${s.courante ? 'font-semibold text-white' : 'text-white/60'}">${PP.time.formatHM(s.moyenne)}</span>
          <div class="w-full rounded-t-md ${s.courante ? 'bg-gradient-to-t from-white/25 to-white shadow-[0_0_30px_-6px_rgba(255,255,255,0.4)]' : 'bg-gradient-to-t from-white/10 to-white/50'}" style="height:${Math.max(2, (s.moyenne / maxVal) * hauteurMax)}px"></div>
          <span class="text-[11px] ${s.courante ? 'font-medium text-white/80' : 'text-white/40'}">${s.label}</span>
        </div>`).join('')}
      </div>`;
  };

  /* ================= Graphique : absences par motif ================= */
  const dessinerGraphiqueMotifs = () => {
    const auj = new Date();
    const debutMois = `${auj.getFullYear()}-${String(auj.getMonth() + 1).padStart(2, '0')}-01`;
    const finMois = `${auj.getFullYear()}-${String(auj.getMonth() + 1).padStart(2, '0')}-31`;

    const jours = {};
    PP.absences.list().forEach((a) => {
      if (a.statut === 'refusee') return;
      const debut = a.dateDebut < debutMois ? debutMois : a.dateDebut;
      const fin = a.dateFin > finMois ? finMois : a.dateFin;
      if (debut > fin || a.periode === 'heures') return;
      const d = PP.dates.fromISO(debut);
      let nb = 0;
      for (let garde = 0; PP.dates.toISO(d) <= fin && garde < 62; garde += 1) {
        if (!PP.dates.isWeekend(d)) nb += 1;
        d.setDate(d.getDate() + 1);
      }
      const poids = PP.absences.PERIODES.find((p) => p.code === a.periode)?.poids ?? 1;
      jours[a.motif] = (jours[a.motif] || 0) + nb * poids;
    });

    const entrees = PP.motifs.list()
      .map((m) => ({ ...m, nb: jours[m.code] || 0 }))
      .sort((x, y) => y.nb - x.nb);
    const maxNb = Math.max(1, ...entrees.map((x) => x.nb));
    const total = entrees.reduce((t, x) => t + x.nb, 0);

    racine.querySelector('#db-absences-total').textContent =
      `${total % 1 ? total.toFixed(1).replace('.', ',') : total} ${tx('dashboard.joursCourt')} · ${PP.dates.MOIS[auj.getMonth()]}`;

    racine.querySelector('#db-graph-motifs').innerHTML = entrees.map((m) => `
      <li class="flex items-center gap-3">
        <span class="w-12 shrink-0 text-center">${badge(m.code, m.couleur)}</span>
        <span class="w-32 shrink-0 text-xs text-white/60">${escapeHtml(PP.motifs.libelle(m.code))}${m.compteHS ? ` <span class="text-[10px] text-violet-300/70">${PP.motifs.facteurLibelle(m.compteHS)}</span>` : ''}</span>
        <div class="h-2 flex-1 rounded-full bg-white/[0.06]"><div class="h-full rounded-full bg-${m.couleur}-400/70" style="width:${(m.nb / maxNb) * 100}%"></div></div>
        <span class="w-9 shrink-0 text-right text-xs tabular-nums ${m.nb ? 'text-white/70' : 'text-white/40'}">${m.nb % 1 ? m.nb.toFixed(1).replace('.', ',') : m.nb} j</span>
      </li>`).join('');
  };

  return { render };
})();

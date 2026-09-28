/* Page Paramètres (section 8) — seuils, majorations, formats, jours ouvrés, identité, données */
window.PP = window.PP || {};
PP.pages = PP.pages || {};

PP.pages.parametres = (() => {
  const { escapeHtml } = PP.utils;
  const { icon, toast, confirmDialog, badge, modal } = PP.ui;

  /* Le libellé du jour est une clef de traduction (résolue au rendu, donc dans la
     langue courante) : la liste reste une simple table d'indices. */
  const JOURS_SEMAINE = [
    { index: 1, clef: 'jours.lundi' }, { index: 2, clef: 'jours.mardi' }, { index: 3, clef: 'jours.mercredi' },
    { index: 4, clef: 'jours.jeudi' }, { index: 5, clef: 'jours.vendredi' }, { index: 6, clef: 'jours.samedi' }, { index: 0, clef: 'jours.dimanche' },
  ];

  let racine = null;
  let logo = null;

  const champ = (label, input, note = '') => `
    <label class="block">
      <span class="pp-label">${label}</span>${input}
      ${note ? `<span class="mt-1 block text-[11px] text-white/35">${note}</span>` : ''}
    </label>`;

  const render = (root) => {
    racine = root;

    /* Page réservée aux administrateurs */
    const role = PP.securite.utilisateur()?.role;
    if (!PP.securite.peut('parametres.voir')) {
      root.innerHTML = `
        <h1 class="text-4xl font-semibold tracking-tight">${tx('nav.parametres')}</h1>
        <div class="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-12 text-center">
          <span class="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-red-300">${icon('i-alert', 'h-6 w-6')}</span>
          <h2 class="mt-5 text-xl font-semibold">${tx('parametres.accesReserve')}</h2>
          <p class="mx-auto mt-2 max-w-md text-sm leading-relaxed text-white/45">
            ${tx('parametres.accesReserveTexte', { role: role ? tx(`roles.${role}`) : tx('parametres.accesRoleInconnu') })}
          </p>
        </div>`;
      return;
    }

    const s = PP.settings.all();
    logo = s.logo;
    const fuseau = Intl.DateTimeFormat().resolvedOptions().timeZone || tx('parametres.systeme');

    root.innerHTML = `
      <div class="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 class="text-4xl font-semibold tracking-tight">${tx('nav.parametres')}</h1>
          <p class="mt-2 text-white/50">${tx('parametres.sousTitre')}</p>
        </div>
        <button id="par-enregistrer" class="pp-btn-primary">${icon('i-check', 'h-4 w-4')} ${tx('action.enregistrer')}</button>
      </div>

      <p id="par-erreur" class="hidden mt-5 rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-2.5 text-xs text-red-200"></p>

      <div class="mt-6 grid grid-cols-2 gap-5">
        <!-- Établissement -->
        <section class="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <h2 class="flex items-center gap-2.5 font-semibold">${icon('i-home', 'h-5 w-5 text-white/85')} ${tx('parametres.etablissement.titre')}</h2>
          <div class="mt-5 space-y-4">
            ${champ(tx('parametres.etablissement.nom'), `<input id="par-nom" value="${escapeHtml(s.nomEtablissement)}" placeholder="${tx('parametres.etablissement.nomPlaceholder')}" class="pp-input">`, tx('parametres.etablissement.nomNote'))}
            <div class="flex items-center gap-4">
              <span id="par-logo-apercu" class="flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-white/5">
                ${logo ? `<img src="${logo}" alt="${tx('parametres.etablissement.logoAlt')}" class="h-full w-full object-cover">` : PP.htmlLogo('h-12 w-12')}
              </span>
              <div>
                <input type="file" id="par-logo-fichier" accept="image/*" class="hidden">
                  <div class="flex gap-2">
                    <button type="button" id="par-logo-choisir" class="pp-btn-ghost px-3 py-2 text-xs">${tx('parametres.etablissement.choisirLogo')}</button>
                    <button type="button" id="par-logo-retirer" class="pp-btn-ghost px-3 py-2 text-xs ${logo ? '' : 'hidden'}">${tx('action.retirer')}</button>
                  </div>
                <p class="mt-1.5 text-[11px] text-white/35">${tx('parametres.etablissement.logoAide')}</p>
              </div>
            </div>
            ${champ(tx('parametres.etablissement.dateDebut'), `<input type="date" id="par-date-debut" value="${s.dateDebut}" class="pp-input">`, tx('parametres.etablissement.dateDebutNote'))}
            ${champ(tx('parametres.etablissement.maxEmployes'), `<input type="number" id="par-max-employes" value="${s.maxEmployes}" min="1" max="500" class="pp-input">`)}
            ${champ(tx('parametres.etablissement.heureReference'), `<input type="time" id="par-heure-reference" value="${PP.time.toHHMM(s.heureReference)}" class="pp-input">`, tx('parametres.etablissement.heureReferenceNote'))}
          </div>
        </section>

        <!-- Heures supplémentaires -->
        <section class="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <h2 class="flex items-center gap-2.5 font-semibold">${icon('i-trend', 'h-5 w-5 text-white/85')} ${tx('parametres.hs.titre')}</h2>
          <div class="mt-5 grid grid-cols-2 gap-4">
            ${champ(tx('parametres.hs.seuil'), `<input type="number" id="par-seuil" value="${s.seuilHebdo}" min="1" max="80" step="0.5" class="pp-input">`, tx('parametres.hs.seuilNote'))}
            ${champ(tx('parametres.hs.arrondi'), `<select id="par-arrondi" class="pp-select">
              <option value="minute" ${s.arrondi === 'minute' ? 'selected' : ''}>${tx('parametres.hs.arrondiMinute')}</option>
              <option value="quart" ${s.arrondi === 'quart' ? 'selected' : ''}>${tx('parametres.hs.arrondiQuart')}</option>
              <option value="demi" ${s.arrondi === 'demi' ? 'selected' : ''}>${tx('parametres.hs.arrondiDemi')}</option>
            </select>`)}
            ${champ(tx('parametres.hs.contingent'), `<input type="number" id="par-contingent" value="${s.contingentAnnuelHS}" min="0" max="5000" class="pp-input">`, tx('parametres.hs.contingentNote'))}
            ${champ(tx('parametres.hs.majHS'), `<input type="number" id="par-maj-hs" value="${s.majorationHS}" min="0" max="200" class="pp-input">`, tx('parametres.hs.notePourcent'))}
            ${champ(tx('parametres.hs.majNuit'), `<input type="number" id="par-maj-nuit" value="${s.majorationNuit}" min="0" max="200" class="pp-input">`, tx('parametres.hs.notePourcent'))}
            ${champ(tx('parametres.hs.majDimanche'), `<input type="number" id="par-maj-dimanche" value="${s.majorationDimanche}" min="0" max="200" class="pp-input">`, tx('parametres.hs.notePourcent'))}
            ${champ(tx('parametres.hs.majFerie'), `<input type="number" id="par-maj-ferie" value="${s.majorationFerie}" min="0" max="200" class="pp-input">`, tx('parametres.hs.notePourcent'))}
          </div>
        </section>

        <!-- Formats & affichage -->
        <section class="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <h2 class="flex items-center gap-2.5 font-semibold">${icon('i-gear', 'h-5 w-5 text-white/85')} ${tx('parametres.formats.titre')}</h2>
          <div class="mt-5 grid grid-cols-2 gap-4">
            ${champ(tx('parametres.formats.devise'), `
              <input id="par-devise-recherche" type="search" class="pp-input mb-2 text-xs" placeholder="${tx('parametres.formats.deviseRecherche')}">
              <select id="par-devise" class="pp-select">
                ${PP.settings.devisesParZone().map((g) => `
                  <optgroup label="${escapeHtml(g.zone)}">
                    ${g.devises.map(([code, d]) => `<option value="${code}" ${s.devise === code ? 'selected' : ''}>${code} — ${escapeHtml(d.libelle)} (${escapeHtml(d.symbole)})</option>`).join('')}
                  </optgroup>`).join('')}
              </select>`,
              tx('parametres.formats.deviseNote'))}
            ${champ(tx('parametres.formats.formatDate'), `<select id="par-format-date" class="pp-select">
              <option value="JJ/MM/AAAA" ${s.formatDate === 'JJ/MM/AAAA' ? 'selected' : ''}>JJ/MM/AAAA</option>
              <option value="MM/JJ/AAAA" ${s.formatDate === 'MM/JJ/AAAA' ? 'selected' : ''}>MM/JJ/AAAA</option>
            </select>`)}
            ${champ(tx('parametres.formats.formatHeure'), `<select id="par-format-heure" class="pp-select">
              <option value="24h" ${s.formatHeure === '24h' ? 'selected' : ''}>24 h</option>
              <option value="12h" ${s.formatHeure === '12h' ? 'selected' : ''}>12 h (AM/PM)</option>
            </select>`, tx('parametres.formats.formatHeureNote'))}
            ${champ(tx('parametres.formats.langue'), `<select id="par-langue" class="pp-select">
              ${PP.i18n.LANGUES.map((l) => `<option value="${l.code}" ${(PP.settings.get('langue') || 'fr') === l.code ? 'selected' : ''}>${escapeHtml(l.libelle)}</option>`).join('')}
            </select>`, tx('parametres.formats.langueNote'))}
            ${champ(tx('parametres.formats.fuseau'), `<input class="pp-input opacity-50" value="${escapeHtml(fuseau)}" readonly>`, tx('parametres.formats.fuseauNote'))}
          </div>
        </section>

        <!-- Semaine de travail -->
        <section class="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <h2 class="flex items-center gap-2.5 font-semibold">${icon('i-calendar', 'h-5 w-5 text-white/85')} ${tx('parametres.semaine.titre')}</h2>
          <div class="mt-5 grid grid-cols-4 gap-2">
            ${JOURS_SEMAINE.map((j) => `
              <label class="flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-xs has-[:checked]:border-white/30">
                <input type="checkbox" data-jour="${j.index}" ${s.joursOuvres.includes(j.index) ? 'checked' : ''} class="h-4 w-4 accent-emerald-400">
                <span class="text-white/70">${tx(j.clef)}</span>
              </label>`).join('')}
          </div>
          <p class="mt-3 text-[11px] text-white/35">${tx('parametres.semaine.aide')}</p>

          <h3 class="mt-6 flex items-center gap-2 text-sm font-semibold">${icon('i-plus', 'h-4 w-4 text-white/85')} ${tx('parametres.fermeture.titre')}</h3>
          <div class="mt-3 flex flex-wrap items-end gap-3">
            <label class="block"><span class="pp-label">${tx('parametres.du')}</span><input type="date" id="par-fermeture-debut" class="pp-input w-40 text-xs"></label>
            <label class="block"><span class="pp-label">${tx('parametres.au')}</span><input type="date" id="par-fermeture-fin" class="pp-input w-40 text-xs"></label>
            <label class="block flex-1"><span class="pp-label">${tx('parametres.libelle')}</span><input id="par-fermeture-libelle" placeholder="${tx('parametres.fermeture.libellePlaceholder')}" class="pp-input text-xs"></label>
            <button id="par-fermeture-ajout" class="pp-btn-ghost px-3 py-2 text-xs whitespace-nowrap">${tx('action.ajouter')}</button>
          </div>
          <p class="mt-2 text-[11px] text-white/35">${tx('parametres.fermeture.aide')}</p>
        </section>
      </div>

      <!-- Liens vers les autres réglages -->
      <div class="mt-5 grid grid-cols-2 gap-5">
        <a href="#/absences" class="group flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-white/25">
          ${icon('i-cal-x', 'h-6 w-6 text-white/70')}
          <div class="min-w-0 flex-1">
            <p class="text-sm font-medium">${tx('parametres.liens.motifs')}</p>
            <p class="mt-0.5 text-[11px] text-white/40">${tx('parametres.liens.motifsDetail', { n: PP.motifs.list().length })}</p>
          </div>
          <div class="flex gap-1.5">${PP.motifs.list().slice(0, 5).map((m) => badge(m.code, m.couleur)).join('')}</div>
          ${icon('i-arrow-r', 'h-4 w-4 text-white/40 group-hover:text-white')}
        </a>
        <a href="#/calendrier" class="group flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-white/25">
          ${icon('i-calendar', 'h-6 w-6 text-white/70')}
          <div class="min-w-0 flex-1">
            <p class="text-sm font-medium">${tx('parametres.liens.feries')}</p>
            <p class="mt-0.5 text-[11px] text-white/40">${tx('parametres.liens.feriesDetail', { n: PP.store.get('feries', []).length })}</p>
          </div>
          ${icon('i-arrow-r', 'h-4 w-4 text-white/40 group-hover:text-white')}
        </a>
        <!-- Apparence -->
        <section class="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <h2 class="flex items-center gap-2.5 font-semibold">${icon('i-sun', 'h-5 w-5 text-white/85')} ${tx('parametres.apparence.titre')}</h2>
          <div class="mt-5 grid grid-cols-2 gap-4">
            ${champ(tx('parametres.apparence.theme'), `<select id="par-theme" class="pp-select">
              <option value="sombre" ${s.theme !== 'clair' ? 'selected' : ''}>${tx('parametres.apparence.sombre')}</option>
              <option value="clair" ${s.theme === 'clair' ? 'selected' : ''}>${tx('parametres.apparence.clair')}</option>
            </select>`, tx('parametres.apparence.themeNote'))}
            ${champ(tx('parametres.apparence.lisibilite'), `<select id="par-texte" class="pp-select">
              <option value="0" ${!s.texteAgrandi ? 'selected' : ''}>${tx('parametres.apparence.policeNormale')}</option>
              <option value="1" ${s.texteAgrandi ? 'selected' : ''}>${tx('parametres.apparence.policeAgrandie')}</option>
            </select>`, tx('parametres.apparence.lisibiliteNote'))}
          </div>
        </section>

        <!-- Champs personnalisés -->
        <section class="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <h2 class="flex items-center gap-2.5 font-semibold">${icon('i-edit', 'h-5 w-5 text-white/85')} ${tx('parametres.champs.titre')}</h2>
          <p class="mt-1.5 text-[11px] text-white/40">${tx('parametres.champs.aide')}</p>
          <div class="mt-4 flex items-end gap-2">
            <label class="block flex-1"><span class="pp-label">${tx('parametres.champs.nouveau')}</span>
            <input id="par-champ-libelle" placeholder="${tx('parametres.champs.libellePlaceholder')}" class="pp-input text-xs"></label>
            <button id="par-champ-ajout" class="pp-btn-ghost px-3 py-2 text-xs">${tx('action.ajouter')}</button>
          </div>
          <ul id="par-liste-champs" class="mt-4 space-y-2"></ul>
        </section>
      </div>

      <!-- Sauvegardes & exports -->
      <section class="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
        <h2 class="flex items-center gap-2.5 font-semibold">${icon('i-download', 'h-5 w-5 text-white/85')} ${tx('parametres.sauvegardes.titre')}</h2>
        <div id="par-emplacement" class="mt-2"></div>

        <div class="mt-5 grid grid-cols-2 gap-6">
          <div>
            <h3 class="text-sm font-medium text-white/85">${tx('parametres.sauvegardes.exports')}</h3>
            <div class="mt-3 flex flex-wrap gap-2">
              <button id="par-export-json" class="pp-btn-ghost px-3 py-2 text-xs">${tx('parametres.sauvegardes.exportJSON')}</button>
              <button id="par-export-xlsx" class="pp-btn-ghost px-3 py-2 text-xs">${tx('parametres.sauvegardes.exportXLSX')}</button>
              <button id="par-export-employes" class="pp-btn-ghost px-3 py-2 text-xs">${tx('parametres.sauvegardes.exportEmployes')}</button>
              <button id="par-export-pointages" class="pp-btn-ghost px-3 py-2 text-xs">${tx('parametres.sauvegardes.exportPointages')}</button>
              <button id="par-ouvrir-exports" class="pp-btn-ghost hidden px-3 py-2 text-xs">${tx('parametres.sauvegardes.ouvrirDossier')}</button>
            </div>

            <h3 class="mt-6 text-sm font-medium text-white/85">${tx('parametres.sauvegardes.imports')}</h3>
            <div class="mt-3 flex flex-wrap gap-2">
              <button id="par-import-json" class="pp-btn-ghost px-3 py-2 text-xs">${tx('parametres.sauvegardes.importJSON')}</button>
              <button id="par-import-employes" class="pp-btn-ghost px-3 py-2 text-xs">${tx('parametres.sauvegardes.exportEmployes')}</button>
              <button id="par-import-pointages" class="pp-btn-ghost px-3 py-2 text-xs">${tx('parametres.sauvegardes.exportPointages')}</button>
            </div>
            <input type="file" id="par-fichier-json" accept=".json,application/json" class="hidden">
            <input type="file" id="par-fichier-employes" accept=".csv,text/csv" class="hidden">
            <input type="file" id="par-fichier-pointages" accept=".csv,text/csv" class="hidden">

            <p class="mt-4 text-[11px] leading-relaxed text-white/35">
              ${tx('parametres.sauvegardes.cloud')}<br>
              ${tx('parametres.sauvegardes.importAide')}
            </p>
          </div>

          <div>
            <div class="flex items-center justify-between gap-3">
              <h3 class="text-sm font-medium text-white/85">${tx('parametres.sauvegardes.locales')}</h3>
              <select id="par-auto" class="pp-select w-48 text-xs">
                <option value="0" ${s.intervalleSauvegardeAuto === 0 ? 'selected' : ''}>${tx('parametres.sauvegardes.autoOff')}</option>
                <option value="6" ${s.intervalleSauvegardeAuto === 6 ? 'selected' : ''}>${tx('parametres.sauvegardes.auto6h')}</option>
                <option value="24" ${s.intervalleSauvegardeAuto === 24 ? 'selected' : ''}>${tx('parametres.sauvegardes.auto24h')}</option>
                <option value="168" ${s.intervalleSauvegardeAuto === 168 ? 'selected' : ''}>${tx('parametres.sauvegardes.autoSemaine')}</option>
              </select>
            </div>
            <button id="par-sauvegarde-creer" class="pp-btn-primary mt-3 w-full justify-center py-2 text-xs">${tx('parametres.sauvegardes.creer')}</button>
            <ul id="par-liste-sauvegardes" class="mt-3 max-h-60 space-y-2 overflow-y-auto"></ul>
          </div>
        </div>
      </section>

      <!-- Sécurité : comptes, clôtures, journal -->
      <div class="mt-5 grid grid-cols-2 gap-5">
        <section class="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <div class="flex items-center justify-between">
            <h2 class="flex items-center gap-2.5 font-semibold">${icon('i-users', 'h-5 w-5 text-white/85')} ${tx('parametres.comptes.titre')}</h2>
            <button id="par-compte-ajout" class="pp-btn-ghost px-3 py-2 text-xs">${icon('i-plus', 'h-3.5 w-3.5')} ${tx('parametres.comptes.nouveau')}</button>
          </div>
          <ul id="par-liste-comptes" class="mt-4 space-y-2.5"></ul>
          <div class="mt-4 flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2.5">
            <span class="text-xs text-white/60">${tx('parametres.comptes.session')}</span>
            <select id="par-session-minutes" class="pp-select w-36 text-xs">
              <option value="10" ${s.sessionMinutes === 10 ? 'selected' : ''}>${tx('parametres.comptes.minutes10')}</option>
              <option value="30" ${s.sessionMinutes === 30 ? 'selected' : ''}>${tx('parametres.comptes.minutes30')}</option>
              <option value="60" ${s.sessionMinutes === 60 ? 'selected' : ''}>${tx('parametres.comptes.heure1')}</option>
              <option value="0" ${s.sessionMinutes === 0 ? 'selected' : ''}>${tx('parametres.comptes.jamais')}</option>
            </select>
          </div>
          ${PP.securite.cryptoDisponible ? '' : `<p class="mt-3 text-[11px] leading-relaxed text-amber-300/80">${tx('parametres.comptes.webcrypto')}</p>`}
        </section>

        <section class="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <h2 class="flex items-center gap-2.5 font-semibold">${icon('i-cal-x', 'h-5 w-5 text-white/85')} ${tx('parametres.clotures.titre')}</h2>
          <p class="mt-1.5 text-[11px] text-white/40">${tx('parametres.clotures.aide')}</p>
          <div class="mt-4 flex flex-wrap items-end gap-2">
            <label class="block"><span class="pp-label">${tx('parametres.libelle')}</span><input id="par-cloture-label" placeholder="${tx('parametres.clotures.libellePlaceholder')}" class="pp-input w-36 text-xs"></label>
            <label class="block"><span class="pp-label">${tx('parametres.du')}</span><input type="date" id="par-cloture-debut" class="pp-input w-36 text-xs"></label>
            <label class="block"><span class="pp-label">${tx('parametres.au')}</span><input type="date" id="par-cloture-fin" class="pp-input w-36 text-xs"></label>
            <button id="par-cloture-ajout" class="pp-btn-ghost px-3 py-2 text-xs">${tx('parametres.clotures.cloturer')}</button>
          </div>
          <ul id="par-liste-clotures" class="mt-4 space-y-2.5"></ul>
        </section>
      </div>

      <section class="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
        <h2 class="flex items-center gap-2.5 font-semibold">${icon('i-book', 'h-5 w-5 text-white/85')} ${tx('parametres.journal.titre')}</h2>
        <p class="mt-1.5 text-[11px] text-white/40">${tx('parametres.journal.aide')}</p>
        <ul id="par-liste-journal" class="mt-4 max-h-64 space-y-1.5 overflow-y-auto"></ul>
      </section>

      <!-- Licence -->
      <section id="par-licence" class="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] p-6"></section>

      <!-- Zone sensible -->
      <section class="mt-5 rounded-2xl border border-red-400/20 bg-red-400/[0.04] p-6">
        <h2 class="flex items-center gap-2.5 font-semibold text-red-300">${icon('i-alert', 'h-5 w-5')} ${tx('parametres.zoneSensible.titre')}</h2>
        <div class="mt-4 flex flex-wrap items-center gap-3">
          <button id="par-reset-demo" class="pp-btn-ghost px-3 py-2 text-xs">${tx('parametres.zoneSensible.restaurerDemo')}</button>
          <button id="par-reset-tout" class="rounded-xl bg-red-500/90 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-red-500">${tx('parametres.zoneSensible.toutEffacer')}</button>
          <p class="text-[11px] text-white/40">${tx('parametres.zoneSensible.aide')}</p>
        </div>
      </section>`;

    /* Événements */
    racine.querySelector('#par-enregistrer').addEventListener('click', enregistrer);
    /* Recherche de devise : le filtre masque les options non concernées mais ne
       les RETIRE jamais du menu — sinon la devise enregistrée serait perdue quand
       elle ne correspond pas à la recherche en cours. */
    const rechercheDevise = racine.querySelector('#par-devise-recherche');
    const menuDevise = racine.querySelector('#par-devise');
    const optionsDevise = Array.from(menuDevise.querySelectorAll('option'));
    rechercheDevise.addEventListener('input', () => {
      const q = rechercheDevise.value.trim();
      let visibles = 0;
      optionsDevise.forEach((opt) => {
        const correspond = PP.settings.deviseCorrespond(opt.value, q);
        opt.hidden = !correspond;
        opt.disabled = !correspond;
        if (correspond) visibles += 1;
      });
      /* Les groupes sans résultat restent visibles mais vides : on les masque
         pour ne pas laisser de titres orphelins dans la liste. */
      menuDevise.querySelectorAll('optgroup').forEach((g) => {
        g.hidden = !Array.from(g.querySelectorAll('option')).some((o) => !o.hidden);
      });
      /* Si la sélection courante est filtrée, on montre la première proposition
         pour rester cohérent à l'écran — sans toucher à la valeur enregistrée
         tant que l'utilisateur n'a pas validé. */
      if (visibles && menuDevise.selectedOptions[0]?.hidden) {
        menuDevise.value = optionsDevise.find((o) => !o.hidden).value;
      }
    });
    racine.querySelector('#par-logo-choisir').addEventListener('click', () => racine.querySelector('#par-logo-fichier').click());
    racine.querySelector('#par-logo-fichier').addEventListener('change', (e) => {
      const f = e.target.files[0];
      if (!f) return;
      redimensionnerLogo(f, (dataUrl) => {
        logo = dataUrl;
        racine.querySelector('#par-logo-apercu').innerHTML = `<img src="${logo}" alt="Logo" class="h-full w-full object-cover">`;
        racine.querySelector('#par-logo-retirer').classList.remove('hidden');
      });
    });
    racine.querySelector('#par-logo-retirer').addEventListener('click', () => {
      logo = '';
      racine.querySelector('#par-logo-apercu').innerHTML = PP.htmlLogo('h-12 w-12');
      racine.querySelector('#par-logo-retirer').classList.add('hidden');
    });
    racine.querySelector('#par-fermeture-ajout').addEventListener('click', ajouterFermeture);
    dessinerLicence();
    PP.majBoutonActiver?.();
    /* Langue : l'effet est immédiat — on enregistre et on reconstruit l'écran,
       sans attendre le bouton « Enregistrer » qui ne concerne que les paramètres
       métier. L'utilisateur voit tout de suite le résultat de son choix. */
    racine.querySelector('#par-langue').addEventListener('change', (e) => {
      PP.settings.save({ langue: e.target.value });
      PP.appliquerLangue();
      toast(tx('parametres.formats.langueChangee'), 'success');
    });
    racine.querySelector('#par-reset-demo').addEventListener('click', () => confirmerReinitialisation(true));
    racine.querySelector('#par-reset-tout').addEventListener('click', () => confirmerReinitialisation(false));

    /* Exports */
    racine.querySelector('#par-export-json').addEventListener('click', exporterJSON);
    racine.querySelector('#par-export-xlsx').addEventListener('click', exporterXLSX);
    racine.querySelector('#par-export-employes').addEventListener('click', exporterEmployesCSV);
    racine.querySelector('#par-export-pointages').addEventListener('click', exporterPointagesCSV);
    racine.querySelector('#par-ouvrir-exports').addEventListener('click', () => PP.io.ouvrirDossierExports());

    /* Où sont les données : information décisive pour sauvegarder ou dépanner,
       et l'emplacement diffère entre application de bureau et navigateur. */
    const blocEmplacement = racine.querySelector('#par-emplacement');
    if (PP.store.mode === 'bureau') {
      blocEmplacement.innerHTML = `
        <p class="text-[11px] leading-relaxed text-white/40">
          ${tx('parametres.sauvegardes.emplacementBase')} <span class="font-medium text-white/70">${escapeHtml(PP.store.etat().chemin || '—')}</span><br>
          ${tx('parametres.sauvegardes.emplacementBureau')}
        </p>`;
      racine.querySelector('#par-ouvrir-exports').classList.remove('hidden');
    } else {
      blocEmplacement.innerHTML = `
        <p class="text-[11px] text-white/40">${tx('parametres.sauvegardes.emplacementNavigateur')}</p>`;
    }

    /* Imports */
    racine.querySelector('#par-import-json').addEventListener('click', () => racine.querySelector('#par-fichier-json').click());
    racine.querySelector('#par-import-employes').addEventListener('click', () => racine.querySelector('#par-fichier-employes').click());
    racine.querySelector('#par-import-pointages').addEventListener('click', () => racine.querySelector('#par-fichier-pointages').click());
    racine.querySelector('#par-fichier-json').addEventListener('change', (e) => { if (e.target.files[0]) importerJSON(e.target.files[0]); e.target.value = ''; });
    racine.querySelector('#par-fichier-employes').addEventListener('change', (e) => { if (e.target.files[0]) importerEmployesCSV(e.target.files[0]); e.target.value = ''; });
    racine.querySelector('#par-fichier-pointages').addEventListener('change', (e) => { if (e.target.files[0]) importerPointagesCSV(e.target.files[0]); e.target.value = ''; });

    /* Sauvegardes locales */
    racine.querySelector('#par-auto').addEventListener('change', (e) => {
      PP.settings.save({ intervalleSauvegardeAuto: Number(e.target.value) });
      toast(e.target.value === '0' ? tx('parametres.sauvegardes.autoDesactivee') : tx('parametres.sauvegardes.autoMaj'), 'success');
    });
    racine.querySelector('#par-sauvegarde-creer').addEventListener('click', () => {
      PP.sauvegardes.creer('Manuelle');
      toast(tx('parametres.sauvegardes.creee'), 'success');
      dessinerSauvegardes();
    });
    racine.querySelector('#par-liste-sauvegardes').addEventListener('click', (e) => {
      const attr = (sel) => e.target.closest(`[${sel}]`)?.getAttribute(sel);
      if (e.target.closest('[data-restaurer]')) {
        const id = attr('data-restaurer');
        confirmDialog({
          title: tx('parametres.sauvegardes.restaurerTitre'),
          message: tx('parametres.sauvegardes.restaurerMessage'),
          confirmLabel: tx('parametres.sauvegardes.restaurer'),
          onConfirm: () => { PP.sauvegardes.restaurer(id); location.reload(); },
        });
      } else if (e.target.closest('[data-telecharger-sauvegarde]')) {
        const s = PP.sauvegardes.list().find((x) => x.id === attr('data-telecharger-sauvegarde'));
        if (s) PP.io.telecharger(`pointagepro-${s.horodatage.slice(0, 10)}.json`, JSON.stringify({ application: 'Wendo', version: 1, exporteLe: s.horodatage, donnees: s.donnees }, null, 2), 'application/json');
      } else if (e.target.closest('[data-suppr-sauvegarde]')) {
        PP.sauvegardes.supprimer(attr('data-suppr-sauvegarde'));
        toast(tx('parametres.sauvegardes.supprimee'), 'success');
        dessinerSauvegardes();
      }
    });

    dessinerSauvegardes();
    /* Apparence */
    racine.querySelector('#par-theme').addEventListener('change', (e) => {
      PP.settings.save({ theme: e.target.value });
      PP.appliquerTheme();
      toast(e.target.value === 'clair' ? tx('parametres.apparence.themeClairToast') : tx('parametres.apparence.themeSombreToast'), 'success');
    });
    racine.querySelector('#par-texte').addEventListener('change', (e) => {
      PP.settings.save({ texteAgrandi: e.target.value === '1' });
      PP.appliquerTheme();
      toast(e.target.value === '1' ? tx('parametres.apparence.policeAgrandieToast') : tx('parametres.apparence.policeNormaleToast'), 'success');
    });

    /* Champs personnalisés */
    racine.querySelector('#par-champ-ajout').addEventListener('click', () => {
      const libelle = racine.querySelector('#par-champ-libelle').value.trim();
      if (!libelle) { toast(tx('parametres.champs.errLibelle'), 'warning'); return; }
      const champs = PP.settings.get('champsPersonnalises');
      PP.settings.save({ champsPersonnalises: [...champs, { id: PP.utils.uid(), libelle }] });
      toast(tx('parametres.champs.ajoute'), 'success');
      dessinerChamps();
    });
    racine.querySelector('#par-liste-champs').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-suppr-champ]');
      if (!btn) return;
      PP.settings.save({ champsPersonnalises: PP.settings.get('champsPersonnalises').filter((f) => f.id !== btn.getAttribute('data-suppr-champ')) });
      toast(tx('parametres.champs.supprime'), 'success');
      dessinerChamps();
    });

    dessinerChamps();
    dessinerComptes();
    dessinerClotures();
    dessinerJournal();

    /* Comptes */
    racine.querySelector('#par-compte-ajout').addEventListener('click', () => ouvrirModalCompte());
    racine.querySelector('#par-session-minutes').addEventListener('change', (e) => {
      PP.settings.save({ sessionMinutes: Number(e.target.value) });
      toast(tx('parametres.comptes.sessionMaj'), 'success');
    });
    racine.querySelector('#par-liste-comptes').addEventListener('click', (e) => {
      const attr = (sel) => e.target.closest(`[${sel}]`)?.getAttribute(sel);
      const mdp = e.target.closest('[data-compte-mdp]');
      if (mdp) return ouvrirModalMdp(mdp.getAttribute('data-compte-mdp'));
      const dfa = e.target.closest('[data-compte-2fa]');
      if (dfa) return basculer2FA(dfa.getAttribute('data-compte-2fa'));
      const actif = e.target.closest('[data-compte-actif]');
      if (actif) {
        const c = PP.securite.comptes().find((x) => x.id === actif.getAttribute('data-compte-actif'));
        const r = PP.securite.majCompte(c.id, { actif: !c.actif });
        if (r.erreur) { toast(r.erreur, 'error'); return; }
        toast(c.actif ? tx('parametres.comptes.desactive') : tx('parametres.comptes.active'), 'success');
        return dessinerComptes();
      }
      const suppr = e.target.closest('[data-compte-suppr]');
      if (suppr) {
        const c = PP.securite.comptes().find((x) => x.id === suppr.getAttribute('data-compte-suppr'));
        confirmDialog({
          title: tx('parametres.comptes.supprimerTitre'),
          message: tx('parametres.comptes.supprimerMessage', { identifiant: `<span class="font-medium text-white">${escapeHtml(c.identifiant)}</span>` }),
          confirmLabel: tx('action.supprimer'),
          onConfirm: () => {
            const r = PP.securite.supprimerCompte(c.id);
            if (r.erreur) { toast(r.erreur, 'error'); return; }
            toast(tx('parametres.comptes.supprime'), 'success');
            dessinerComptes();
          },
        });
      }
    });

    /* Clôtures */
    racine.querySelector('#par-cloture-ajout').addEventListener('click', () => {
      const r = PP.securite.cloturer({
        label: val('#par-cloture-label'),
        debut: val('#par-cloture-debut'),
        fin: val('#par-cloture-fin') || val('#par-cloture-debut'),
      });
      if (r.erreur) { toast(r.erreur, 'warning'); return; }
      toast(tx('parametres.clotures.creee'), 'success');
      dessinerClotures();
    });
    racine.querySelector('#par-liste-clotures').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-decloturer]');
      if (!btn) return;
      PP.securite.decloturer(btn.getAttribute('data-decloturer'));
      toast(tx('parametres.clotures.deverrouillee'), 'success');
      dessinerClotures();
    });
  };

  /* ---------- Logo ---------- */
  const redimensionnerLogo = (fichier, cb) => {
    const lecteur = new FileReader();
    lecteur.onload = () => {
      const img = new Image();
      img.onload = () => {
        const TAILLE = 160;
        const echelle = Math.min(1, TAILLE / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * echelle);
        canvas.height = Math.round(img.height * echelle);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        cb(canvas.toDataURL(fichier.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.85));
      };
      img.src = lecteur.result;
    };
    lecteur.readAsDataURL(fichier);
  };

  /* ---------- Fermeture annuelle ---------- */
  const JOURS_FERMETURE_MAX = 366; // une fermeture ne peut pas couvrir plus d'un an

  const ajouterFermeture = () => {
    const debut = racine.querySelector('#par-fermeture-debut').value;
    const fin = racine.querySelector('#par-fermeture-fin').value || debut;
    const libelle = racine.querySelector('#par-fermeture-libelle').value.trim() || tx('parametres.fermeture.libelleDefaut');
    if (!debut || fin < debut) { toast(tx('parametres.fermeture.errPlage'), 'warning'); return; }

    const debutD = PP.dates.fromISO(debut);
    const nbJours = Math.round((PP.dates.fromISO(fin) - debutD) / 86400000) + 1;
    if (nbJours > JOURS_FERMETURE_MAX) {
      toast(tx('parametres.fermeture.errPlageLongue', { n: nbJours, max: JOURS_FERMETURE_MAX }), 'warning');
      return;
    }

    const existants = PP.store.get('feries', []);
    const d = PP.dates.fromISO(debut);
    let ajoutes = 0;
    let ignores = 0;
    for (let i = 0; i < nbJours; i += 1) {
      const iso = PP.dates.toISO(d);
      if (existants.some((f) => f.date === iso) || PP.dates.feries(d.getFullYear())[iso]) {
        ignores += 1; // déjà férié (légal) ou déjà déclaré
      } else {
        existants.push({ id: PP.utils.uid(), date: iso, libelle });
        ajoutes += 1;
      }
      d.setDate(d.getDate() + 1);
    }
    PP.store.set('feries', existants);

    if (!ajoutes) { toast(tx('parametres.fermeture.errAucun'), 'warning'); return; }
    toast(tx('parametres.fermeture.ajoute', { n: ajoutes, ignores }), 'success');
  };

  /* ---------- Sauvegarde ---------- */
  const val = (id) => racine.querySelector(id).value;

  /* Champ numérique obligatoire : vide ou non numérique → NaN (rejeté par les contrôles) */
  const num = (id) => {
    const brut = val(id).trim();
    if (!brut) return NaN;
    const n = Number(brut);
    return Number.isFinite(n) ? n : NaN;
  };

  const enregistrer = () => {
    const boite = racine.querySelector('#par-erreur');
    const afficherErreur = (msg) => { boite.textContent = msg; boite.classList.remove('hidden'); };

    const jours = [...racine.querySelectorAll('[data-jour]')].filter((c) => c.checked).map((c) => Number(c.dataset.jour));
    const patch = {
      nomEtablissement: val('#par-nom').trim(),
      logo,
      maxEmployes: num('#par-max-employes'),
      heureReference: PP.time.parse(val('#par-heure-reference')) ?? 540,
      seuilHebdo: num('#par-seuil'),
      arrondi: val('#par-arrondi'),
      contingentAnnuelHS: num('#par-contingent'),
      majorationHS: num('#par-maj-hs'),
      majorationNuit: num('#par-maj-nuit'),
      majorationDimanche: num('#par-maj-dimanche'),
      majorationFerie: num('#par-maj-ferie'),
      devise: val('#par-devise'),
      formatDate: val('#par-format-date'),
      formatHeure: val('#par-format-heure'),
      joursOuvres: jours,
    };

    if (!Number.isFinite(patch.seuilHebdo) || patch.seuilHebdo < 1 || patch.seuilHebdo > 80) return afficherErreur(tx('parametres.errSeuil'));
    if (!Number.isFinite(patch.maxEmployes) || patch.maxEmployes < PP.employes.list().length) return afficherErreur(tx('parametres.errMaxEmployes', { n: PP.employes.list().length }));
    if (!Number.isFinite(patch.contingentAnnuelHS) || patch.contingentAnnuelHS < 0 || patch.contingentAnnuelHS > 5000) return afficherErreur(tx('parametres.errContingent'));
    if (jours.length === 0) return afficherErreur(tx('parametres.errJours'));
    if (![patch.majorationHS, patch.majorationNuit, patch.majorationDimanche, patch.majorationFerie]
      .every((m) => Number.isFinite(m) && m >= 0 && m <= 200)) {
      return afficherErreur(tx('parametres.errMajorations'));
    }

    const appliquer = (dateDebut) => {
      PP.settings.save(dateDebut ? { ...patch, dateDebut } : patch);
      PP.appliquerIdentite();
      boite.classList.add('hidden');
      toast(tx('parametres.enregistres'), 'success');
    };

    const nouvelleDate = val('#par-date-debut');
    if (!nouvelleDate) return afficherErreur(tx('parametres.errDateDebut'));
    if (nouvelleDate !== PP.settings.get('dateDebut')) {
      confirmDialog({
        title: tx('parametres.modifierDateTitre'),
        message: tx('parametres.modifierDateMessage', {
          avant: `<span class="font-medium text-white">${PP.dates.formatCourt(PP.dates.fromISO(PP.settings.get('dateDebut')))}</span>`,
          apres: `<span class="font-medium text-white">${PP.dates.formatCourt(PP.dates.fromISO(nouvelleDate))}</span>`,
        }),
        confirmLabel: tx('parametres.modifierDateBouton'),
        onConfirm: () => appliquer(nouvelleDate),
      });
      return;
    }
    appliquer(null);
  };

  /* ---------- Réinitialisation ---------- */
  const confirmerReinitialisation = (avecDemo) => {
    confirmDialog({
      title: avecDemo ? tx('parametres.resetDemoTitre') : tx('parametres.resetToutTitre'),
      message: avecDemo
        ? tx('parametres.resetDemoMessage')
        : tx('parametres.resetToutMessage'),
      confirmLabel: avecDemo ? tx('parametres.resetDemoBouton') : tx('parametres.resetToutBouton'),
      onConfirm: () => {
        PP.store.reset();
        if (!avecDemo) {
          /* Marqueur lu au démarrage : empêche la réinstallation du jeu de démonstration.
             Les motifs standard font partie de la configuration de l'outil, on les réinstalle. */
          PP.store.set('meta', { semeLe: new Date().toISOString(), motifsV2: true, vide: true });
          PP.store.set('motifs', PP.motifs.DEFAUTS);
        }
        location.reload();
      },
    });
  };

  /* ================= Exports ================= */
  const h = (m) => (m === null || m === undefined ? '' : PP.time.toHHMM(m));

  const exporteDonnees = () => {
    const donnees = PP.store.tout();
    delete donnees.sauvegardes;
    return { application: 'Wendo', version: 1, exporteLe: new Date().toISOString(), donnees };
  };

  /* ================= Licence ================= */
  /* L'écran change complètement selon l'état : activée on affiche l'état et le
     code machine (utile au support) ; en démo on affiche le champ de saisie et
     ce que la version complète apporte. */
  const dessinerLicence = async () => {
    const zone = racine.querySelector('#par-licence');
    if (!zone) return;

    await PP.licence.rafraichir();
    const etat = PP.licence.etat();
    const code = etat.codeMachine || (await PP.licence.codeMachine());

    if (etat.active) {
      const date = etat.activeLe
        ? PP.dates.formatCourt(new Date(etat.activeLe * 1000))
        : '—';
      zone.innerHTML = `
        <h2 class="flex items-center gap-2.5 font-semibold">${icon('i-check', 'h-5 w-5 text-emerald-300')} ${tx('licence.titre')}</h2>
        <div class="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.06] px-4 py-3">
          <p class="text-sm font-medium text-emerald-200">${tx('licence.activee')}</p>
          <p class="mt-1 text-[11px] text-emerald-100/70">${tx('licence.activeeDetail', { date })}</p>
        </div>
        <div class="mt-4 flex flex-wrap items-end gap-3">
          <div>
            <p class="pp-label">${tx('licence.codeMachine')}</p>
            <code class="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs tracking-wider">${escapeHtml(code)}</code>
          </div>
          <button id="par-licence-copier" class="pp-btn-ghost px-3 py-2 text-xs">${tx('licence.copier')}</button>
          <button id="par-licence-retirer" class="pp-btn-ghost px-3 py-2 text-xs text-red-300">${tx('licence.retirer')}</button>
        </div>
        <p class="mt-3 text-[11px] leading-relaxed text-white/40">${tx('licence.codeAide')}</p>`;

      zone.querySelector('#par-licence-copier').addEventListener('click', () => {
        navigator.clipboard?.writeText(code);
        toast(tx('licence.copie'), 'success');
      });
      zone.querySelector('#par-licence-retirer').addEventListener('click', () => {
        confirmDialog({
          title: tx('licence.retirerTitre'),
          message: tx('licence.retirerTexte'),
          confirmLabel: tx('licence.retirer'),
          onConfirm: async () => {
            await PP.licence.desactiver();
            toast(tx('licence.retiree'), 'info');
            dessinerLicence();
    PP.majBoutonActiver?.();
          },
        });
      });
      return;
    }

    /* --- Mode démo --- */
    const limites = PP.licence.limites();
    /* Situation particulière : un jeton existe mais ne vaut plus rien pour ce
       poste. On l'explique clairement, sinon le client croira à un bug. */
    const explication = {
      'autre-machine': tx('licence.situationAutreMachine'),
      invalide: tx('licence.situationInvalide'),
      expiree: tx('licence.situationExpiree'),
    }[etat.situation];

    zone.innerHTML = `
      <h2 class="flex items-center gap-2.5 font-semibold">${icon('i-power', 'h-5 w-5 text-white/85')} ${tx('licence.titre')}</h2>

      ${explication ? `<div class="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-4 py-3 text-xs leading-relaxed text-amber-100/85">${escapeHtml(explication)}</div>` : ''}

      <div class="mt-4 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
        <p class="text-xs font-medium text-white/70">${tx('licence.demoTitre')}</p>
        <p class="mt-1 text-[11px] leading-relaxed text-white/45">${tx('licence.demoDetail', { n: limites.maxEmployes })}</p>
      </div>

      <div class="mt-4 flex flex-wrap items-end gap-3">
        <div class="min-w-[18rem] flex-1">
          <label class="pp-label" for="par-licence-cle">${tx('licence.cle')}</label>
          <input id="par-licence-cle" class="pp-input" placeholder="XXXX-XXXX-XXXX-XXXX" autocomplete="off" spellcheck="false">
        </div>
        <button id="par-licence-activer" class="pp-btn-primary">${tx('licence.activer')}</button>
        <button id="par-licence-acheter" class="pp-btn-ghost px-3 py-2.5 text-xs">${tx('licence.acheter')}</button>
      </div>
      <p id="par-licence-message" class="mt-3 hidden text-xs"></p>

      <div class="mt-4 flex flex-wrap items-end gap-3 border-t border-white/5 pt-4">
        <div>
          <p class="pp-label">${tx('licence.codeMachine')}</p>
          <code class="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs tracking-wider">${escapeHtml(code || '—')}</code>
        </div>
        <button id="par-licence-copier" class="pp-btn-ghost px-3 py-2 text-xs">${tx('licence.copier')}</button>
      </div>
      <p class="mt-3 text-[11px] leading-relaxed text-white/40">${tx('licence.codeAide')}</p>`;

    const champ = zone.querySelector('#par-licence-cle');
    const message = zone.querySelector('#par-licence-message');
    const bouton = zone.querySelector('#par-licence-activer');

    const afficherMessage = (texte, ok) => {
      message.textContent = texte;
      message.className = `mt-3 text-xs ${ok ? 'text-emerald-300' : 'text-red-300'}`;
      message.classList.remove('hidden');
    };

    const lancerActivation = async () => {
      const cle = champ.value.trim();
      if (!cle) { afficherMessage(tx('licence.cleRequise'), false); champ.focus(); return; }

      bouton.disabled = true;
      const libelle = bouton.textContent;
      bouton.textContent = tx('licence.activationEnCours');
      /* Délai maximal : un chargement sans fin ne doit pas être possible, même
         si le serveur ne répond jamais (piège n°1 du guide). */
      const garde = setTimeout(() => {
        bouton.disabled = false;
        bouton.textContent = libelle;
        afficherMessage(tx('licence.erreurTransport'), false);
      }, 25000);

      try {
        const resultat = await PP.licence.activer(cle);
        clearTimeout(garde);
        if (resultat.ok) {
          toast(tx('licence.activeeToast'), 'success');
          dessinerLicence();
    PP.majBoutonActiver?.();
          return;
        }
        afficherMessage(resultat.message, false);
      } finally {
        clearTimeout(garde);
        bouton.disabled = false;
        bouton.textContent = libelle;
      }
    };

    bouton.addEventListener('click', lancerActivation);
    champ.addEventListener('keydown', (e) => { if (e.key === 'Enter') lancerActivation(); });
    zone.querySelector('#par-licence-acheter').addEventListener('click', () => PP.licence.ouvrirPageAchat());
    zone.querySelector('#par-licence-copier').addEventListener('click', () => {
      navigator.clipboard?.writeText(code);
      toast(tx('licence.copie'), 'success');
    });
  };

  const exporterJSON = () => {
    PP.io.telecharger(`pointagepro-${PP.io.horodatageFichier()}.json`, JSON.stringify(exporteDonnees(), null, 2), 'application/json');
    toast(tx('parametres.exportJSON'), 'success');
  };

  const exporterEmployesCSV = () => {
    const lignes = [[tx('tableau.nom'), tx('tableau.prenom'), tx('tableau.matricule'), tx('tableau.poste'), tx('tableau.departement'), tx('tableau.contrat'), tx('tableau.dateEmbauche'), tx('tableau.heuresHebdo'), tx('tableau.tauxHoraire'), tx('tableau.email'), tx('tableau.telephone'), tx('tableau.actif')].join(';')];
    PP.employes.list().forEach((e) => lignes.push([
      e.nom, e.prenom, e.matricule, e.poste, e.departement, e.contrat, e.dateEmbauche,
      e.heuresHebdo, e.tauxHoraire ?? '', e.email, e.telephone, e.actif ? tx('action.oui') : tx('action.non'),
    ].join(';')));
    PP.io.telecharger(`employes-${PP.io.horodatageFichier()}.csv`, '\ufeff' + lignes.join('\r\n'), 'text/csv;charset=utf-8');
    toast(tx('parametres.exportEmployesCSV'), 'success');
  };

  const exporterPointagesCSV = () => {
    const lignes = [[tx('tableau.matricule'), tx('tableau.date'), tx('pointage.nomColonne.debutMatin'), tx('pointage.nomColonne.finMatin'), tx('pointage.debutApresMidi'), tx('pointage.finApresMidi'), tx('pointage.debutSoir'), tx('pointage.finSoir'), tx('tableau.statut')].join(';')];
    Object.entries(PP.pointages.list()).forEach(([cle, p]) => {
      const [empId, date] = cle.split('|');
      const e = PP.employes.get(empId);
      if (!e) return;
      lignes.push([e.matricule, date, h(p.t1), h(p.t2), h(p.t3), h(p.t4), h(p.t5), h(p.t6), p.statut].join(';'));
    });
    PP.io.telecharger(`pointages-${PP.io.horodatageFichier()}.csv`, '\ufeff' + lignes.join('\r\n'), 'text/csv;charset=utf-8');
    toast(tx('parametres.exportPointagesCSV'), 'success');
  };

  const exporterXLSX = () => {
    if (typeof XLSX === 'undefined') {
      toast(tx('parametres.exportModuleExcel'), 'error');
      return;
    }
    const wb = XLSX.utils.book_new();

    const employes = PP.employes.list().map((e) => ({
      [tx('tableau.nom')]: e.nom, [tx('tableau.prenom')]: e.prenom, [tx('tableau.matricule')]: e.matricule, [tx('tableau.poste')]: e.poste,
      [tx('tableau.departement')]: e.departement, [tx('tableau.contrat')]: e.contrat, [tx('tableau.dateEmbauche')]: e.dateEmbauche,
      [tx('tableau.heuresHebdo')]: e.heuresHebdo, [tx('tableau.tauxHoraire')]: e.tauxHoraire ?? '',
      [tx('tableau.email')]: e.email, [tx('tableau.telephone')]: e.telephone, [tx('tableau.actif')]: e.actif ? tx('action.oui') : tx('action.non'),
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(employes), tx('tableau.employes'));

    const pointages = Object.entries(PP.pointages.list()).map(([cle, p]) => {
      const [empId, date] = cle.split('|');
      const e = PP.employes.get(empId);
      return {
        [tx('tableau.employe')]: e ? `${e.prenom} ${e.nom}` : empId, [tx('tableau.date')]: date,
        [tx('pointage.nomColonne.debutMatin')]: h(p.t1), [tx('pointage.nomColonne.finMatin')]: h(p.t2),
        [tx('pointage.debutApresMidi')]: h(p.t3), [tx('pointage.finApresMidi')]: h(p.t4),
        [tx('pointage.debutSoir')]: h(p.t5), [tx('pointage.finSoir')]: h(p.t6),
        [tx('tableau.total')]: PP.time.formatHM(PP.pointages.heuresJour(p)), [tx('tableau.statut')]: p.statut,
      };
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(pointages), tx('pages.pointage.titre'));

    const absences = PP.absences.list().map((a) => {
      const e = PP.employes.get(a.employeId);
      return {
        [tx('tableau.employe')]: e ? `${e.prenom} ${e.nom}` : a.employeId, [tx('absences.motif')]: a.motif,
        [tx('parametres.du')]: a.dateDebut, [tx('parametres.au')]: a.dateFin, [tx('absences.periode')]: a.periode,
        [tx('absences.commentaire')]: a.commentaire, [tx('tableau.statut')]: a.statut,
      };
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(absences), tx('pages.absences.titre'));

    /* `writeFile` déclenche un téléchargement : on produit les octets puis on les
       confie à PP.io, qui sait enregistrer sur disque en application de bureau. */
    const octets = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    PP.io.enregistrer(`wendo-${PP.io.horodatageFichier()}.xlsx`,
      new Uint8Array(octets),
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .then((r) => {
        if (!r) { toast(tx('parametres.exportEchec'), 'error'); return; }
        if (!r.navigateur) toast(tx('parametres.exportEnregistre', { chemin: r.chemin }), 'success');
        else toast(tx('parametres.exportTelecharge'), 'success');
      });
  };

  /* ================= Imports ================= */
  /* Normalise une date d'import CSV vers AAAA-MM-JJ, ou '' si illisible.
     Accepte AAAA-MM-JJ, JJ/MM/AAAA, JJ.MM.AAAA (zéros de remplissage ajoutés).
     En cas d'ambiguïté (les deux premiers nombres ≤ 12), le format choisi dans
     « Formats & affichage » tranche ; un nombre > 12 lève l'ambiguïté. */
  const dateFlexible = (v) => {
    const brut = String(v ?? '').trim();
    if (!brut) return '';

    let annee, mois, jour;
    const iso = brut.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    const fr = brut.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/);

    if (iso) {
      [, annee, mois, jour] = iso;
    } else if (fr) {
      const [, a, b, an] = fr;
      annee = an;
      if (+a > 12) { jour = a; mois = b; }                              // 25/12 → jour d'abord
      else if (+b > 12) { jour = b; mois = a; }                          // 12/25 → mois d'abord
      else if (PP.settings.get('formatDate') === 'MM/JJ/AAAA') { jour = b; mois = a; }
      else { jour = a; mois = b; }                                      // défaut français JJ/MM
    } else {
      return '';
    }

    const isoFinal = `${annee}-${PP.utils.pad(+mois)}-${PP.utils.pad(+jour)}`;
    /* Vérifie que la date existe réellement (rejette 30/02, mois 13…) */
    return PP.dates.toISO(PP.dates.fromISO(isoFinal)) === isoFinal ? isoFinal : '';
  };

  const importerJSON = (fichier) => PP.io.lireTexte(fichier).then((texte) => {
    let obj;
    try { obj = JSON.parse(texte); } catch { toast(tx('parametres.importJSONInvalide'), 'error'); return; }
    if (!obj || typeof obj !== 'object' || !obj.donnees || typeof obj.donnees !== 'object') {
      toast(tx('parametres.importJSONStructure'), 'error');
      return;
    }
    confirmDialog({
      title: tx('parametres.importTitre'),
      message: tx('parametres.importMessage', {
        date: obj.exporteLe ? PP.dates.formatCourt(new Date(obj.exporteLe)) : tx('parametres.importDateInconnue'),
        avertissement: `<span class="font-medium text-red-300">${tx('parametres.importAvertissement')}</span>`,
      }),
      confirmLabel: tx('parametres.importRemplacer'),
      onConfirm: () => { PP.store.remplacer(obj.donnees); location.reload(); },
    });
  });

  const importerEmployesCSV = (fichier) => PP.io.lireTexte(fichier).then((texte) => {
    const lignes = PP.io.parserCSV(texte);
    if (lignes.length === 0) { toast(tx('parametres.csvIllisible'), 'error'); return; }
    let crees = 0;
    let datesIgnorees = 0;
    const erreurs = [];
    lignes.forEach((l, i) => {
      const dateBrute = l['Date embauche'] ?? l['Date d\'embauche'] ?? '';
      const dateEmbauche = dateFlexible(dateBrute);
      if (String(dateBrute).trim() && !dateEmbauche) datesIgnorees += 1;
      const r = PP.employes.create({
        nom: l.Nom ?? l.nom,
        prenom: l['Prénom'] ?? l.Prenom ?? l.prenom,
        matricule: l.Matricule ?? l.matricule,
        poste: l.Poste ?? l.poste,
        departement: l['Département'] ?? l.Departement ?? l.departement,
        contrat: l.Contrat ?? l.contrat,
        dateEmbauche,
        heuresHebdo: l['Heures hebdo'] ?? 40,
        tauxHoraire: l['Taux horaire'] ?? l.Taux,
        email: l.Email ?? l.email,
        telephone: l['Téléphone'] ?? l.Telephone ?? l.telephone,
        actif: (l.Actif ?? 'Oui') !== 'Non',
      });
      if (r.erreur) erreurs.push(tx('parametres.importLigne', { n: i + 2, erreur: r.erreur }));
      else crees += 1;
    });
    toast(tx('parametres.importEmployesToast', {
      n: crees,
      erreurs: erreurs.length ? tx('parametres.importRejetes', { n: erreurs.length, premiere: erreurs[0] }) : '',
      dates: datesIgnorees ? tx('parametres.importDates', { n: datesIgnorees }) : '',
    }), erreurs.length || datesIgnorees ? 'warning' : 'success');
    if (crees) PP.appliquerIdentite();
  });

  const importerPointagesCSV = (fichier) => PP.io.lireTexte(fichier).then((texte) => {
    const lignes = PP.io.parserCSV(texte);
    if (lignes.length === 0) { toast(tx('parametres.csvIllisible'), 'error'); return; }
    let crees = 0;
    let rejetes = 0;
    lignes.forEach((l) => {
      const e = PP.employes.list().find((x) => x.matricule && x.matricule.toLowerCase() === (l.Matricule || '').toLowerCase());
      if (!e || !/^\d{4}-\d{2}-\d{2}$/.test(dateFlexible(l.Date))) { rejetes += 1; return; }
      PP.pointages.save(e.id, dateFlexible(l.Date), {
        t1: PP.time.parse(l['Début matin'] ?? ''),
        t2: PP.time.parse(l['Fin matin'] ?? ''),
        t3: PP.time.parse(l['Début après-midi'] ?? ''),
        t4: PP.time.parse(l['Fin après-midi'] ?? ''),
        t5: PP.time.parse(l['Début soir'] ?? ''),
        t6: PP.time.parse(l['Fin soir'] ?? ''),
      });
      crees += 1;
    });
    toast(tx('parametres.importPointagesToast', {
      n: crees,
      rejetes: rejetes ? tx('parametres.importPointagesIgnores', { n: rejetes }) : '',
    }), rejetes && !crees ? 'error' : 'success');
  });

  /* ================= Liste des sauvegardes locales ================= */
  const dessinerSauvegardes = () => {
    const ul = racine.querySelector('#par-liste-sauvegardes');
    const liste = PP.sauvegardes.list();
    if (liste.length === 0) {
      ul.innerHTML = `<li class="text-xs text-white/35">${tx('parametres.sauvegardes.aucune')}</li>`;
      return;
    }
    ul.innerHTML = liste.map((s) => {
      const d = new Date(s.horodatage);
      return `
      <li class="flex items-center gap-2 rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2.5">
        <div class="min-w-0 flex-1">
          <p class="text-xs text-white/80">${PP.dates.formatCourt(d)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} <span class="text-white/35">· ${escapeHtml(s.label)}</span></p>
          <p class="text-[10px] text-white/35">${tx('parametres.sauvegardes.nbEmployes', { n: s.nbEmployes })} · ${PP.sauvegardes.formatTaille(s.taille)}</p>
        </div>
        <button data-restaurer="${s.id}" title="${tx('parametres.sauvegardes.restaurer')}" class="rounded-lg p-1.5 text-white/40 transition hover:bg-emerald-400/10 hover:text-emerald-300">${icon('i-check', 'h-3.5 w-3.5')}</button>
        <button data-telecharger-sauvegarde="${s.id}" title="${tx('parametres.sauvegardes.telecharger')}" class="rounded-lg p-1.5 text-white/40 transition hover:bg-white/5 hover:text-white">${icon('i-download', 'h-3.5 w-3.5')}</button>
        <button data-suppr-sauvegarde="${s.id}" title="${tx('action.supprimer')}" class="rounded-lg p-1.5 text-white/40 transition hover:bg-red-500/10 hover:text-red-300">${icon('i-trash', 'h-3.5 w-3.5')}</button>
      </li>`;
    }).join('');
  };

  /* ================= Champs personnalisés ================= */
  const dessinerChamps = () => {
    const ul = racine.querySelector('#par-liste-champs');
    const champs = PP.settings.get('champsPersonnalises');
    ul.innerHTML = champs.length ? champs.map((f) => `
      <li class="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2.5">
        <span class="min-w-0 flex-1 truncate text-xs text-white/85">${escapeHtml(f.libelle)}</span>
        <button data-suppr-champ="${f.id}" title="${tx('action.supprimer')}" class="rounded-lg p-1.5 text-white/40 transition hover:bg-red-500/10 hover:text-red-300">${icon('i-trash', 'h-3.5 w-3.5')}</button>
      </li>`).join('') : `<li class="text-xs text-white/35">${tx('parametres.champs.aucun')}</li>`;
  };

  /* ================= Comptes & rôles ================= */
  const dessinerComptes = () => {
    const ul = racine.querySelector('#par-liste-comptes');
    ul.innerHTML = PP.securite.comptes().map((c) => `
      <li class="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2.5">
        <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/15 bg-gradient-to-br from-white/25 to-white/5 text-[10px] font-semibold text-white/85">${escapeHtml((c.identifiant[0] || '?').toUpperCase())}</span>
        <div class="min-w-0 flex-1">
          <p class="truncate text-xs text-white/85">${escapeHtml(c.identifiant)}
            ${c.mdpParDefaut ? `<span class="rounded bg-amber-400/10 px-1.5 py-0.5 text-[9px] font-semibold text-amber-300">${tx('parametres.comptes.mdpDefaut')}</span>` : ''}
            ${c.totpSecret ? '<span class="rounded bg-emerald-400/10 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-300">2FA</span>' : ''}
            ${c.actif ? '' : `<span class="rounded bg-red-400/10 px-1.5 py-0.5 text-[9px] font-semibold text-red-300">${tx('parametres.comptes.desactiveBadge')}</span>`}
          </p>
          <p class="text-[10px] text-white/35">${escapeHtml(c.nom)}${c.employeId && PP.employes.get(c.employeId) ? ` · ${tx('parametres.comptes.lie', { nom: escapeHtml(`${PP.employes.get(c.employeId).prenom} ${PP.employes.get(c.employeId).nom}`) })}` : ''}</p>
        </div>
        <span class="shrink-0 rounded-md bg-white/5 px-2 py-0.5 text-[10px] font-medium text-white/60">${tx(`roles.${c.role}`)}</span>
        <div class="flex shrink-0 gap-0.5">
          <button data-compte-mdp="${c.id}" title="${tx('parametres.comptes.changerMdp')}" class="rounded-lg p-1.5 text-white/40 transition hover:bg-white/5 hover:text-white">${icon('i-edit', 'h-3.5 w-3.5')}</button>
          <button data-compte-2fa="${c.id}" title="${c.totpSecret ? tx('parametres.comptes.desactiver2fa') : tx('parametres.comptes.activer2fa')}" class="rounded-lg p-1.5 ${c.totpSecret ? 'text-emerald-300/80' : 'text-white/40'} transition hover:bg-white/5 hover:text-white">${icon('i-power', 'h-3.5 w-3.5')}</button>
          <button data-compte-actif="${c.id}" title="${c.actif ? tx('parametres.comptes.desactiver') : tx('parametres.comptes.reactiver')}" class="rounded-lg p-1.5 text-white/40 transition hover:bg-amber-400/10 hover:text-amber-300">${icon('i-x', 'h-3.5 w-3.5')}</button>
          <button data-compte-suppr="${c.id}" title="${tx('action.supprimer')}" class="rounded-lg p-1.5 text-white/40 transition hover:bg-red-500/10 hover:text-red-300">${icon('i-trash', 'h-3.5 w-3.5')}</button>
        </div>
      </li>`).join('');
  };

  const ouvrirModalCompte = () => {
    const employes = [...PP.employes.actifs()].sort((x, y) => x.nom.localeCompare(y.nom, 'fr'));
    const fermer = modal({
      title: tx('parametres.comptes.nouveauTitre'),
      size: 'max-w-md',
      body: `
        <form id="par-compte-form" class="space-y-4" novalidate>
          <label class="block"><span class="pp-label">${tx('parametres.comptes.identifiant')}</span><input id="par-c-id" class="pp-input" placeholder="${tx('parametres.comptes.identifiantPlaceholder')}"></label>
          <label class="block"><span class="pp-label">${tx('parametres.comptes.nomAffiche')}</span><input id="par-c-nom" class="pp-input" placeholder="${tx('parametres.comptes.nomAffichePlaceholder')}"></label>
          <label class="block"><span class="pp-label">${tx('parametres.comptes.role')}</span><select id="par-c-role" class="pp-select">
            ${PP.securite.ROLES.map((r) => `<option value="${r}">${tx(`roles.${r}`)}</option>`).join('')}
          </select></label>
          <label class="block"><span class="pp-label">${tx('parametres.comptes.employeLie')}</span><select id="par-c-employe" class="pp-select">
            <option value="">${tx('parametres.comptes.aucunGestion')}</option>
            ${employes.map((e) => `<option value="${e.id}">${escapeHtml(e.prenom)} ${escapeHtml(e.nom)}</option>`).join('')}
          </select>
            <span class="mt-1 block text-[11px] text-white/35">${tx('parametres.comptes.employeLieNote')}</span></label>
          <label class="block"><span class="pp-label">${tx('parametres.comptes.motDePasse')}</span><input id="par-c-mdp" type="password" class="pp-input"></label>
          <p id="par-c-erreur" class="hidden rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-2.5 text-xs text-red-200"></p>
        </form>`,
      footer: `
        <button data-close class="pp-btn-ghost">${tx('action.annuler')}</button>
        <button id="par-c-ok" class="pp-btn-primary">${tx('parametres.comptes.creer')}</button>`,
    });
    /* Requêtes limitées à cette modale */
    const boiteModale = fermer.overlay;
    boiteModale.querySelector('#par-c-ok').addEventListener('click', async () => {
      const r = await PP.securite.creerCompte({
        identifiant: boiteModale.querySelector('#par-c-id').value,
        nom: boiteModale.querySelector('#par-c-nom').value,
        role: boiteModale.querySelector('#par-c-role').value,
        employeId: boiteModale.querySelector('#par-c-employe').value,
        motDePasse: boiteModale.querySelector('#par-c-mdp').value,
      });
      const boite = boiteModale.querySelector('#par-c-erreur');
      if (r.erreur) { boite.textContent = r.erreur; boite.classList.remove('hidden'); return; }
      fermer();
      toast(tx('parametres.comptes.cree'), 'success');
      dessinerComptes();
    });
  };

  const ouvrirModalMdp = (id) => {
    const c = PP.securite.comptes().find((x) => x.id === id);
    if (!c) return;
    const fermer = modal({
      title: tx('parametres.comptes.changerTitre', { identifiant: escapeHtml(c.identifiant) }),
      size: 'max-w-sm',
      body: `
        <label class="block"><span class="pp-label">${tx('parametres.comptes.nouveauMdp')}</span>
        <input id="par-mdp-nouveau" type="password" class="pp-input"></label>
        <p id="par-mdp-erreur" class="mt-2 hidden text-xs text-red-300"></p>`,
      footer: `
        <button data-close class="pp-btn-ghost">${tx('action.annuler')}</button>
        <button id="par-mdp-ok" class="pp-btn-primary">${tx('action.enregistrer')}</button>`,
    });
    /* Requêtes limitées à cette modale */
    const boiteModale = fermer.overlay;
    boiteModale.querySelector('#par-mdp-ok').addEventListener('click', async () => {
      const r = await PP.securite.definirMotDePasse(id, boiteModale.querySelector('#par-mdp-nouveau').value);
      if (r.erreur) {
        const boite = boiteModale.querySelector('#par-mdp-erreur');
        boite.textContent = r.erreur;
        boite.classList.remove('hidden');
        return;
      }
      fermer();
      toast(tx('parametres.comptes.mdpMaj'), 'success');
      dessinerComptes();
    });
  };

  const basculer2FA = async (id) => {
    const c = PP.securite.comptes().find((x) => x.id === id);
    if (!c) return;
    if (c.totpSecret) {
      confirmDialog({
        title: tx('parametres.comptes.desactiver2faTitre'),
        message: tx('parametres.comptes.desactiver2faMessage', { identifiant: `<span class="font-medium text-white">${escapeHtml(c.identifiant)}</span>` }),
        confirmLabel: tx('parametres.comptes.desactiver'),
        onConfirm: () => {
          PP.securite.majCompte(id, { totpSecret: '' });
          toast(tx('parametres.comptes.desactive2fa'), 'success');
          dessinerComptes();
        },
      });
      return;
    }
    const secret = PP.securite.genererSecretTotp();
    const uri = `otpauth://totp/Wendo:${encodeURIComponent(c.identifiant)}?secret=${secret}&issuer=Wendo`;
    const fermer = modal({
      title: tx('parametres.comptes.activer2faTitre', { identifiant: escapeHtml(c.identifiant) }),
      size: 'max-w-md',
      body: `
        <p class="text-xs leading-relaxed text-white/60">${tx('parametres.comptes.etape1')}</p>
        <p class="mt-3 select-all rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-center font-mono text-sm tracking-[0.25em]">${secret}</p>
        <p class="mt-2 break-all text-[10px] text-white/30">${uri}</p>
        <label class="mt-4 block"><span class="pp-label">${tx('parametres.comptes.etape2')}</span>
        <input id="par-2fa-code" maxlength="6" inputmode="numeric" class="pp-input text-center tabular-nums"></label>
        <p id="par-2fa-erreur" class="mt-2 hidden text-xs text-red-300"></p>`,
      footer: `
        <button data-close class="pp-btn-ghost">${tx('action.annuler')}</button>
        <button id="par-2fa-ok" class="pp-btn-primary">${tx('parametres.comptes.verifier')}</button>`,
    });
    /* Requêtes limitées à cette modale */
    const boiteModale = fermer.overlay;
    boiteModale.querySelector('#par-2fa-ok').addEventListener('click', async () => {
      const ok = await PP.securite.totpValide(secret, boiteModale.querySelector('#par-2fa-code').value);
      if (!ok) {
        const boite = boiteModale.querySelector('#par-2fa-erreur');
        boite.textContent = tx('parametres.comptes.codeInvalide');
        boite.classList.remove('hidden');
        return;
      }
      PP.securite.majCompte(id, { totpSecret: secret });
      fermer();
      toast(tx('parametres.comptes.active2fa'), 'success');
      dessinerComptes();
    });
  };

  /* ================= Clôtures & journal ================= */
  const dessinerClotures = () => {
    const ul = racine.querySelector('#par-liste-clotures');
    const liste = PP.securite.clotures();
    ul.innerHTML = liste.length ? liste.map((c) => `
      <li class="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2.5">
        <div class="min-w-0 flex-1">
          <p class="truncate text-xs text-white/85">${escapeHtml(c.label)}</p>
          <p class="text-[10px] text-white/35">${PP.dates.formatCourt(PP.dates.fromISO(c.debut))} → ${PP.dates.formatCourt(PP.dates.fromISO(c.fin))}</p>
        </div>
        <button data-decloturer="${c.id}" title="${tx('parametres.clotures.deverrouiller')}" class="rounded-lg p-1.5 text-white/40 transition hover:bg-emerald-400/10 hover:text-emerald-300">${icon('i-trash', 'h-3.5 w-3.5')}</button>
      </li>`).join('') : `<li class="text-xs text-white/35">${tx('parametres.clotures.aucune')}</li>`;
  };

  const dessinerJournal = () => {
    const ul = racine.querySelector('#par-liste-journal');
    const liste = PP.securite.journal();
    ul.innerHTML = liste.length ? liste.map((j) => {
      const d = new Date(j.horodatage);
      const couleur = j.type === 'echec' ? 'red' : j.type === 'connexion' ? 'emerald' : j.type === 'cloture' ? 'amber' : 'white';
      return `
      <li class="flex items-center gap-3 text-xs">
        <span class="w-32 shrink-0 tabular-nums text-white/40">${PP.dates.formatCourt(d)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}</span>
        <span class="w-20 shrink-0">${badge(j.type, couleur)}</span>
        <span class="w-24 shrink-0 truncate text-white/70">${escapeHtml(j.compte)}</span>
        <span class="min-w-0 flex-1 truncate text-white/40">${escapeHtml(j.detail)}</span>
      </li>`;
    }).join('') : `<li class="text-xs text-white/35">${tx('parametres.journal.aucune')}</li>`;
  };

  /**
   * Fait défiler jusqu'à la section Licence et attire l'œil dessus.
   *
   * Exposée à app.js : le bouton « Activer » de l'entête l'appelle après avoir
   * ouvert cette page. Le bref contour ambre sert de repère — sans lui, arriver
   * au milieu d'une longue page laisse l'utilisateur chercher où agir.
   */
  const allerVersLicence = () => {
    const section = racine?.querySelector('#par-licence');
    if (!section) return;

    section.scrollIntoView({ behavior: 'smooth', block: 'center' });

    /* Le champ de saisie est le but réel : on y place le curseur pour que
       l'utilisateur n'ait plus qu'à coller sa clé. */
    const champ = section.querySelector('#par-licence-cle');
    if (champ) setTimeout(() => champ.focus({ preventScroll: true }), 400);

    /* Repère visuel temporaire */
    section.classList.add('ring-2', 'ring-amber-400/40');
    setTimeout(() => section.classList.remove('ring-2', 'ring-amber-400/40'), 1600);
  };
  PP.parametresAllerLicence = allerVersLicence;

  return { render, allerVersLicence };
})();

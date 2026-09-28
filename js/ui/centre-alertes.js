/* Centre d'alertes (section 7) — panneau déroulant sous la cloche de l'entête */
window.PP = window.PP || {};

PP.centreAlertes = (() => {
  const { icon, badge } = PP.ui;

  const CLE_VUES = 'alertesVues';
  const MAX_VUES = 400;
  let panneau = null;

  const STYLES_GRAVITE = {
    error: { puce: 'bg-red-400', libelle: 'Critique' },
    warning: { puce: 'bg-amber-400', libelle: 'Attention' },
    info: { puce: 'bg-sky-400', libelle: 'Info' },
  };

  /* Alertes déjà consultées : mémorisées par identifiant, ce qui permet au
     badge de ne compter que les nouvelles (un identifiant change dès que la
     situation évolue : nouveau jour manquant, nouvelle semaine, etc.).
     Le marqueur est propre à chaque compte : sur un poste partagé, la lecture
     d'un utilisateur n'éteint pas le badge des autres. */
  const cleVues = () => `${CLE_VUES}|${PP.securite.utilisateur()?.id || 'local'}`;
  const vues = () => PP.store.get(cleVues(), []);
  const nonVues = () => {
    const connues = vues();
    return PP.alertes.liste().filter((a) => !connues.includes(a.id));
  };
  const marquerVues = () => {
    const ids = PP.alertes.liste().map((a) => a.id);
    PP.store.set(cleVues(), [...new Set([...vues(), ...ids])].slice(-MAX_VUES));
  };

  /* Reprise du marqueur global des versions précédentes au profit du compte
     courant, pour ne pas lui présenter d'un coup toutes les alertes comme neuves */
  const migrer = () => {
    const ancien = PP.store.get(CLE_VUES);
    if (Array.isArray(ancien)) {
      PP.store.set(cleVues(), ancien);
      PP.store.set(CLE_VUES, undefined);
    }
  };

  /* Supprime les marqueurs laissés par des comptes qui n'existent plus */
  const purger = () => {
    const idsComptes = PP.securite.comptes().map((c) => c.id);
    Object.keys(PP.store.tout())
      .filter((k) => k.startsWith(`${CLE_VUES}|`))
      .forEach((k) => {
        const id = k.slice(CLE_VUES.length + 1);
        if (id !== 'local' && !idsComptes.includes(id)) PP.store.set(k, undefined);
      });
  };

  /* Badge compteur sur la cloche : nombre d'alertes non encore consultées */
  const rafraichir = () => {
    const badgeEl = document.getElementById('alertes-badge');
    if (!badgeEl) return;
    const nb = nonVues().length;
    badgeEl.textContent = nb > 99 ? '99+' : String(nb);
    badgeEl.classList.toggle('hidden', nb === 0);
    badgeEl.title = nb > 1 ? t('alertes.badgePlusieurs', { n: nb }) : nb === 1 ? t('alertes.badgeUne') : t('alertes.badgeAucune');
  };

  const fermer = () => {
    if (panneau) { panneau.remove(); panneau = null; }
  };

  const basculer = () => (panneau ? fermer() : ouvrir());

  const ouvrir = () => {
    fermer();
    const groupes = PP.alertes.parGravite();
    const total = groupes.error.length + groupes.warning.length + groupes.info.length;
    /* Repérées avant de marquer comme vues : les nouvelles restent signalées
       dans la liste, même une fois le badge remis à zéro */
    const nouvelles = new Set(nonVues().map((a) => a.id));

    const ligne = (a) => `
      <button data-route-alerte="${a.route}" data-id-alerte="${a.id}"
        class="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-white/[0.05] ${nouvelles.has(a.id) ? 'bg-sky-400/[0.06]' : ''}">
        <span class="mt-1.5 h-2 w-2 shrink-0 rounded-full ${STYLES_GRAVITE[a.gravite].puce}"></span>
        <span class="min-w-0 flex-1">
          <span class="block truncate text-sm font-medium text-white/90">${a.titre}${nouvelles.has(a.id) ? ` <span class="ml-1 align-middle text-[10px] font-normal text-sky-300/90">${t('alertes.nouveau')}</span>` : ''}</span>
          <span class="mt-0.5 block text-[11px] leading-relaxed text-white/45">${a.detail}</span>
        </span>
        ${badge(PP.alertes.TYPES[a.type], a.gravite === 'error' ? 'red' : a.gravite === 'warning' ? 'amber' : 'sky')}
      </button>`;

    const groupe = (cle, titre) => groupes[cle].length ? `
      <div class="mt-3">
        <p class="px-3 text-[10px] uppercase tracking-[0.12em] text-white/35">${titre} · ${groupes[cle].length}</p>
        <div class="mt-1.5">${groupes[cle].map(ligne).join('')}</div>
      </div>` : '';

    panneau = document.createElement('div');
    panneau.id = 'panneau-alertes';
    panneau.className = 'fixed right-10 top-20 z-40 w-[30rem] max-h-[70vh] overflow-y-auto rounded-2xl border border-white/10 bg-[#0b0b0b] p-4 shadow-2xl';
    panneau.innerHTML = `
      <div class="flex items-center justify-between border-b border-white/10 px-2 pb-3">
        <h3 class="flex items-center gap-2 text-sm font-semibold">${icon('i-bell', 'h-4 w-4 text-white/85')} ${t('alertes.tempsReel')}</h3>
        <span class="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/60">${total}</span>
      </div>
      ${total === 0
        ? `<p class="px-3 py-8 text-center text-sm text-white/40">${t('alertes.toutEnOrdre')}</p>`
        : groupe('error', t('alertes.groupeCritiques')) + groupe('warning', t('alertes.groupeSurveiller')) + groupe('info', t('alertes.groupeInformatives'))}
      <p class="mt-3 border-t border-white/5 px-2 pt-3 text-[10px] leading-relaxed text-white/30">
        ${t('alertes.emailSms')}
      </p>`;

    document.body.appendChild(panneau);

    /* Le panneau ouvert vaut consultation : le badge repasse à zéro */
    marquerVues();
    rafraichir();

    panneau.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-route-alerte]');
      if (!btn) return;
      fermer();
      location.hash = btn.dataset.routeAlerte;
    });

    /* Referme si clic ailleurs */
    setTimeout(() => document.addEventListener('click', fermerAuClicExterieur), 0);
  };

  const fermerAuClicExterieur = (e) => {
    if (panneau && !panneau.contains(e.target) && !e.target.closest('#bouton-alertes')) fermer();
    else if (!panneau) document.removeEventListener('click', fermerAuClicExterieur);
  };

  const init = () => {
    const bouton = document.getElementById('bouton-alertes');
    if (!bouton) return;
    migrer();
    purger();
    bouton.addEventListener('click', (e) => { e.stopPropagation(); basculer(); });
    rafraichir();
  };

  return { init, rafraichir, fermer };
})();

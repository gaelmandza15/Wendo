/* Écran de connexion (section 9) — overlay d'authentification affiché sans session valide */
window.PP = window.PP || {};

PP.connexion = (() => {
  const { toast } = PP.ui;

  let overlay = null;

  const affiche = () => !!overlay;

  const afficher = (message = '') => {
    masquer();

    const adminParDefaut = PP.securite.comptes().some((c) => c.mdpParDefaut);
    overlay = document.createElement('div');
    overlay.id = 'pp-connexion';
    overlay.className = 'fixed inset-0 z-[80] flex items-center justify-center bg-[#050505] p-6';
    overlay.innerHTML = `
      <div class="pointer-events-none absolute inset-0 overflow-hidden">
        <div class="absolute -top-48 right-[-6%] h-[900px] w-[420px] rotate-[28deg] bg-gradient-to-b from-white/[0.12] via-white/[0.03] to-transparent blur-2xl"></div>
      </div>
      <form id="pp-connexion-form" class="relative w-full max-w-sm rounded-2xl border border-white/10 bg-[#0b0b0b] p-8 shadow-2xl" novalidate>
        <div class="flex items-center gap-3">
          <span id="pp-connexion-logo" class="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl">${PP.htmlLogo('h-12 w-12')}</span>
          <div>
            <p class="text-lg font-bold tracking-tight">Wendo</p>
            <p class="text-[11px] text-white/40">${PP.settings.all().nomEtablissement || t('connexion.requise')}</p>
          </div>
        </div>

        <h1 class="mt-7 text-xl font-semibold">${t('connexion.content')}</h1>
        <p class="mt-1 text-xs text-white/40">${t('connexion.invite')}</p>

        ${message ? `<p class="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/10 px-4 py-2.5 text-xs text-amber-200">${message}</p>` : ''}
        <p id="pp-connexion-erreur" class="mt-4 hidden rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-2.5 text-xs text-red-200"></p>

        <label class="mt-5 block">
          <span class="pp-label">${t('connexion.identifiant')}</span>
          <input id="pp-connexion-id" autocomplete="username" class="pp-input" placeholder="admin">
        </label>
        <label class="mt-3 block">
          <span class="pp-label">${t('connexion.motDePasse')}</span>
          <input id="pp-connexion-mdp" type="password" autocomplete="current-password" class="pp-input">
        </label>
        <label id="pp-connexion-bloc-code" class="mt-3 hidden block">
          <span class="pp-label">${t('connexion.code2fa')}</span>
          <input id="pp-connexion-code" inputmode="numeric" maxlength="6" class="pp-input text-center tabular-nums" placeholder="000000">
        </label>

        <button type="submit" class="pp-btn-primary mt-6 w-full justify-center">${t('connexion.seConnecter')}</button>

        ${adminParDefaut ? `
        <p class="mt-5 rounded-xl border border-amber-400/15 bg-amber-400/[0.06] px-3 py-2.5 text-[11px] leading-relaxed text-amber-200/80">
          ${t('connexion.aideInit')}
        </p>` : ''}
      </form>`;

    document.body.appendChild(overlay);
    overlay.querySelector('#pp-connexion-id').focus();

    overlay.querySelector('#pp-connexion-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const boite = overlay.querySelector('#pp-connexion-erreur');
      const resultat = await PP.securite.connecter(
        overlay.querySelector('#pp-connexion-id').value,
        overlay.querySelector('#pp-connexion-mdp').value,
        overlay.querySelector('#pp-connexion-code')?.value || '',
      );
      if (resultat.erreur) {
        boite.textContent = resultat.erreur;
        boite.classList.remove('hidden');
        if (resultat.demanderCode) overlay.querySelector('#pp-connexion-bloc-code').classList.remove('hidden');
        return;
      }
      masquer();
      PP.centreAlertes.rafraichir();
      PP.majCompte?.();
      PP.rafraichirRoute?.();
      toast(t('connexion.reussie', { nom: resultat.compte.nom }), 'success');
      if (resultat.compte.mdpParDefaut) {
        setTimeout(() => toast(t('connexion.mdpDefaut'), 'warning'), 1200);
      }
    });
  };

  const masquer = () => {
    if (overlay) { overlay.remove(); overlay = null; }
  };

  return { afficher, masquer, affiche };
})();

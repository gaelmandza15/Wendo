/* Guide d'utilisation intégré (étape 14) — documentation pas à pas dans l'application */
window.PP = window.PP || {};
PP.pages = PP.pages || {};

PP.pages.guide = (() => {
  const { icon } = PP.ui;
  const { escapeHtml } = PP.utils;

  const lien = (route, texte) => `<a href="#/${route}" class="font-medium text-white/85 underline decoration-white/25 underline-offset-2 transition hover:text-white">${texte}</a>`;

  /* Contenus rédigés une fois pour toutes (hors templates imbriqués).
     Les phrases vivent dans le dictionnaire ; seuls les liens (routes + libellé)
     restent ici, car ils mêlent du HTML à des clefs de navigation. */
  const demo = () => `
    <ol class="list-decimal space-y-2 pl-5">
      <li>${lien('employes', tx('nav.employes'))} — ${t('guide.demoEquipe', { comptes: lien('parametres', tx('guide.lienComptes')) })}</li>
      <li>${lien('calendrier', tx('nav.calendrier'))} — ${t('guide.demoCalendrier', { semaine: lien('parametres', tx('guide.lienSemaineTravail')) })}</li>
      <li>${lien('pointage', tx('nav.pointage'))} — ${t('guide.demoPointage', { dashboard: lien('dashboard', tx('nav.dashboard')) })}</li>
      <li>${lien('absences', tx('nav.absences'))} — ${t('guide.demoAbsences')}</li>
      <li>${lien('recapitulatif', tx('nav.recapitulatif'))} ${tx('app.et')} ${lien('rapports', tx('nav.rapports'))} — ${t('guide.demoRecap')}</li>
    </ol>`;

  const pagesDoc = () => `
    <ul class="space-y-2">
      <li>${t('guide.pagesDashboard')}</li>
      <li>${t('guide.pagesPointage')}</li>
      <li>${t('guide.pagesEmployes')}</li>
      <li>${t('guide.pagesCalendrier')}</li>
      <li>${t('guide.pagesAbsences')}</li>
      <li>${t('guide.pagesRecap')}</li>
      <li>${t('guide.pagesRapports')}</li>
      <li>${t('guide.pagesParametres')}</li>
    </ul>`;

  const securiteDoc = () => `
    <ul class="space-y-2">
      <li>${t('guide.secuAdmin')}</li>
      <li>${t('guide.secuRh')}</li>
      <li>${t('guide.secuManager')}</li>
      <li>${t('guide.secuEmploye')}</li>
    </ul>
    <p class="mt-3">${t('guide.secuTexte')}</p>`;

  const calculsDoc = () => `
    <ul class="space-y-2">
      <li>${t('guide.calcHS')}</li>
      <li>${t('guide.calcDimanche')}</li>
      <li>${t('guide.calcNuit')}</li>
      <li>${t('guide.calcArrondi')}</li>
      <li>${t('guide.calcClotures')}</li>
      <li>${t('guide.calcRetards')}</li>
    </ul>`;

  const sauvegardesDoc = () => `
    <p>${t('guide.sauveIntro')}</p>
    <ul class="mt-2 list-disc space-y-1.5 pl-5">
      <li>${t('guide.sauveSurvit')}</li>
      <li>${t('guide.sauveBase')}</li>
      <li>${t('guide.sauveLocales')}</li>
      <li>${t('guide.sauveExports')}</li>
    </ul>
    <p class="mt-2 text-white/50">${t('guide.sauveNavigateur')}</p>`;

  const limitesDoc = () => `
    <p>${t('guide.limitesTexte')}</p>
    <p class="mt-2">${t('guide.limitesEquivalents')}</p>`;

  const astucesDoc = () => `
    <ul class="list-disc space-y-1.5 pl-5">
      <li>${t('guide.astuceHeures')}</li>
      <li>${t('guide.astuceBouton')}</li>
      <li>${t('guide.astuceEntree')}</li>
      <li>${t('guide.astuceTri')}</li>
      <li>${t('guide.astuceDocuments')}</li>
      <li>${t('guide.astuceEmployes')}</li>
      <li>${t('guide.astuceTheme')}</li>
      <li>${t('guide.astuceExports')}</li>
      <li>${t('guide.astuceLangue')}</li>
    </ul>`;

  const documentsDoc = () => `
    <p>${t('guide.docIntro', { rapports: lien('rapports', tx('nav.rapports')), recap: lien('recapitulatif', tx('nav.recapitulatif')) })}</p>
    <ul class="mt-3 list-disc space-y-1.5 pl-5">
      <li>${t('guide.docCorriger')}</li>
      <li>${t('guide.docMettreEnForme')}</li>
      <li>${t('guide.docCompleter')}</li>
      <li>${t('guide.docSupprimer')}</li>
      <li>${t('guide.docMiseEnPage')}</li>
      <li>${t('guide.docExporter')}</li>
      <li>${t('guide.docAnnuler')}</li>
    </ul>
    <p class="mt-3">${t('guide.docWordDirect')}</p>
    <p class="mt-3 text-white/50">${t('guide.docCompatibilite')}</p>`;

  const devisesDoc = () => `
    <p>${t('guide.devisesIntro', { parametres: lien('parametres', tx('nav.parametres')) })}</p>

    <p class="mt-3">${t('guide.devisesRecherche')}</p>

    <p class="mt-3">${t('guide.devisesDecimales')}</p>

    <div class="mt-3 overflow-x-auto">
      <table class="w-full text-xs">
        <thead><tr class="border-b border-white/10 text-left text-white/40">
          <th class="pb-1.5 font-medium">${t('guide.devisesColDevise')}</th><th class="pb-1.5 font-medium">${t('guide.devisesColAffichage')}</th>
        </tr></thead>
        <tbody class="divide-y divide-white/5 text-white/70">
          <tr><td class="py-1.5">${t('app.euro')}</td><td class="py-1.5 tabular-nums">18,50 €</td></tr>
          <tr><td class="py-1.5">${t('app.francCFA')}</td><td class="py-1.5 tabular-nums">19 F CFA</td></tr>
          <tr><td class="py-1.5">${t('app.devs.naira')}</td><td class="py-1.5 tabular-nums">18,50 ₦</td></tr>
          <tr><td class="py-1.5">${t('app.devs.yen')}</td><td class="py-1.5 tabular-nums">19 ¥</td></tr>
          <tr><td class="py-1.5">${t('app.devs.roupie')}</td><td class="py-1.5 tabular-nums">18,50 ₹</td></tr>
          <tr><td class="py-1.5">${t('app.devs.dinarTN')}</td><td class="py-1.5 tabular-nums">18,500 DT</td></tr>
        </tbody>
      </table>
    </div>
    <p class="mt-3 text-white/50">${t('guide.devisesNote')}</p>`;

  const section = (icone, titre, contenu, ouvert = false) => `
    <details ${ouvert ? 'open' : ''} class="group rounded-2xl border border-white/10 bg-white/[0.03]">
      <summary class="flex cursor-pointer select-none items-center gap-3 px-5 py-4 text-sm font-semibold text-white/90 transition hover:bg-white/[0.02]">
        <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5">${icon(icone, 'h-4 w-4 text-white/80')}</span>
        ${titre}
        <svg class="ml-auto h-4 w-4 text-white/40 transition group-open:rotate-180"><use href="#i-chev-down"/></svg>
      </summary>
      <div class="border-t border-white/5 px-5 py-4 text-sm leading-relaxed text-white/65">${contenu}</div>
    </details>`;

  const render = (racine) => {
    const sections = [
      section('i-home', t('guide.titreDemo'), demo(), true),
      section('i-users', t('guide.titrePages'), pagesDoc()),
      section('i-power', t('guide.titreSecurite'), securiteDoc()),
      section('i-trend', t('guide.titreCalculs'), calculsDoc()),
      section('i-euro', t('guide.titreDevises'), devisesDoc()),
      section('i-doc', t('guide.titreDocuments'), documentsDoc()),
      section('i-download', t('guide.titreSauvegardes'), sauvegardesDoc()),
      section('i-info', t('guide.titreLimites'), limitesDoc()),
      section('i-edit', t('guide.titreAstuces'), astucesDoc()),
    ];

    racine.innerHTML = `
      <h1 class="text-4xl font-semibold tracking-tight">${t('pages.guide.titre')}</h1>
      <p class="mt-2 max-w-2xl text-white/50">${t('guide.sousTitre')}</p>
      <div id="guide-emplacement" class="mt-4 max-w-2xl"></div>
      <div class="mt-8 space-y-3">${sections.join('')}</div>
      <p class="mt-8 text-xs text-white/30">${t('guide.pied')}</p>`;

    /* Où vivent les données : le fichier sur le disque en application de bureau,
       le stockage du navigateur sinon. On l'affiche parce que c'est l'information
       dont on a besoin pour sauvegarder ou dépanner. */
    const emplacement = racine.querySelector('#guide-emplacement');
    if (emplacement && PP.store.mode === 'bureau') {
      emplacement.innerHTML = `
        <div class="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.06] px-4 py-3 text-xs leading-relaxed text-emerald-100/85">
          <p class="font-medium text-emerald-200">${t('guide.bureauTitre')}</p>
          <p class="mt-1">${t('guide.bureauTexte')}
            <span class="font-medium text-emerald-100">${escapeHtml(PP.store.etat().chemin || '—')}</span></p>
          <p class="mt-1 text-emerald-100/60">${t('guide.bureauNote')}</p>
        </div>`;
    } else if (emplacement) {
      emplacement.innerHTML = `
        <div class="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs leading-relaxed text-white/50">
          <p class="font-medium text-white/70">${t('guide.navigateurTitre')}</p>
          <p class="mt-1">${t('guide.navigateurTexte')}</p>
        </div>`;
    }
  };

  return { render };
})();

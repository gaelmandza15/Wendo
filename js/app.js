/* Wendo — amorçage : données initiales, entête, routeur */
(() => {
  const { capitalize, uid, escapeHtml } = PP.utils;
  const { confirmDialog } = PP.ui;

  /* ---------- Jeu de démonstration (première ouverture uniquement) ---------- */
  const semer = () => {
    /* Jeu de démonstration : 5 employés, soit exactement le plafond du mode
       démonstration. En mettre davantage rendrait la limite incompréhensible :
       l'utilisateur verrait 8 personnes alors qu'on lui refuse la 6e.
       Les cinq couvrent cinq services, un CDD, un poste d'encadrement, et
       incluent les employés référencés par les absences de démonstration. */
    const demo = [
      { prenom: 'Amani',  nom: 'Mbemba',    matricule: 'EMP-001', poste: 'Développeur',        departement: 'IT',                   contrat: 'CDI',        dateEmbauche: '2023-03-13', heuresHebdo: 40, tauxHoraire: 18.5, email: 'amani.mbemba@exemple.fr',  telephone: '06 12 34 56 70', managerRef: 'lea' },
      { prenom: 'Sarah',  nom: 'Diallo',    matricule: 'EMP-003', poste: 'Chargée de marketing', departement: 'Marketing',          contrat: 'CDI',        dateEmbauche: '2022-11-21', heuresHebdo: 40, tauxHoraire: 16.5, email: 'sarah.diallo@exemple.fr',  telephone: '06 12 34 56 72', managerRef: 'lea' },
      { prenom: 'Moussa', nom: 'Koné',      matricule: 'EMP-004', poste: 'Commercial',         departement: 'Ventes',               contrat: 'CDI',        dateEmbauche: '2024-01-08', heuresHebdo: 40, tauxHoraire: 15,   email: 'moussa.kone@exemple.fr',   telephone: '06 12 34 56 73', managerRef: 'lea' },
      { prenom: 'Léa',    nom: 'Tchibinda', matricule: 'EMP-005', poste: 'Responsable RH',     departement: 'Ressources humaines',  contrat: 'CDI',        dateEmbauche: '2021-06-15', heuresHebdo: 40, tauxHoraire: 22,   email: 'lea.tchibinda@exemple.fr', telephone: '06 12 34 56 74', managerRef: '' },
      { prenom: 'Fatou',  nom: 'Kanté',     matricule: 'EMP-007', poste: 'Agent de support',   departement: 'Support',              contrat: 'CDD',        dateEmbauche: '2025-04-01', heuresHebdo: 30, tauxHoraire: 13.5, email: 'fatou.kante@exemple.fr',   telephone: '06 12 34 56 76', managerRef: 'lea' },
    ];

    const employes = demo.map((d) => ({
      ...d,
      id: uid(),
      managerId: '',
      photo: '',
      actif: true,
      creeLe: new Date().toISOString(),
    }));

    const parNom = (nom) => employes.find((e) => e.nom === nom);
    employes.forEach((e) => {
      if (e.managerRef === 'lea') e.managerId = parNom('Tchibinda').id;
      if (e.managerRef === 'amani') e.managerId = parNom('Mbemba').id;
      delete e.managerRef;
    });

    PP.store.set('motifs', PP.motifs.DEFAUTS);
    PP.store.set('employes', employes);
    semerAbsences();
  };

  /* Quelques absences de démonstration (installations nouvelles et existantes) */
  const semerAbsences = () => {
    const idDe = (matricule) => PP.employes.list().find((e) => e.matricule === matricule)?.id;
    const isoRelatif = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return PP.dates.toISO(d); };
    const lundi = new Date();
    lundi.setDate(lundi.getDate() + (((8 - lundi.getDay()) % 7) || 7)); // lundi prochain
    const vendredi = new Date(lundi);
    vendredi.setDate(vendredi.getDate() + 4);
    const maintenant = new Date().toISOString();

    PP.store.set('absences', [
      { id: uid(), employeId: idDe('EMP-001'), motif: 'Form', dateDebut: isoRelatif(3), dateFin: isoRelatif(3), periode: 'journee', heureDebut: null, heureFin: null, commentaire: 'Formation accueil et service client', justificatif: null, statut: 'approuvee', statutCommentaire: '', creeLe: maintenant },
      { id: uid(), employeId: idDe('EMP-003'), motif: 'Mal', dateDebut: isoRelatif(-1), dateFin: isoRelatif(0), periode: 'journee', heureDebut: null, heureFin: null, commentaire: 'Arrêt maladie — certificat transmis', justificatif: null, statut: 'approuvee', statutCommentaire: '', creeLe: maintenant },
      { id: uid(), employeId: idDe('EMP-004'), motif: 'CP', dateDebut: PP.dates.toISO(lundi), dateFin: PP.dates.toISO(vendredi), periode: 'journee', heureDebut: null, heureFin: null, commentaire: 'Congés posés à l\'avance', justificatif: null, statut: 'attente', statutCommentaire: '', creeLe: maintenant },
      { id: uid(), employeId: idDe('EMP-007'), motif: 'EF', dateDebut: isoRelatif(7), dateFin: isoRelatif(7), periode: 'matin', heureDebut: null, heureFin: null, commentaire: 'Rendez-vous familial', justificatif: null, statut: 'attente', statutCommentaire: '', creeLe: maintenant },
    ]);
  };

  /* ---------- Données initiales ---------- */
  /* En application de bureau, le fichier de données est lu de façon asynchrone :
     tout ce qui touche au stockage (jeu de démonstration, migrations) doit donc
     attendre la fin de cette lecture. En navigateur, elle est immédiate et rien
     ne change. */
  const preparerDonnees = () => {
    if (!PP.store.get('meta')) {
      semer();
      PP.store.set('meta', { semeLe: new Date().toISOString(), motifsV2: true });
    } else {
      const meta = PP.store.get('meta');
      if (!meta.motifsV2) {
        /* Migration : complète les motifs existants avec le champ exigeCommentaire */
        PP.store.set('motifs', PP.motifs.listBrute().map((m) => ({
          ...m,
          exigeCommentaire: m.exigeCommentaire ?? PP.motifs.DEFAUTS.find((d) => d.code === m.code)?.exigeCommentaire ?? false,
        })));
        PP.store.set('meta', { ...meta, motifsV2: true });
      }
      /* Migration « motifsV3 » : les motifs livrés par défaut passent du libellé
         figé (français) à une clef de traduction, pour qu'ils suivent la langue.
         On ne touche qu'aux motifs dont le nom correspond EXACTEMENT à un nom
         d'origine : un motif que l'utilisateur a renommé garde son nom. */
      if (!PP.store.get('meta').motifsV3) {
        const nomsOrigine = {};
        PP.motifs.DEFAUTS.forEach((d) => { nomsOrigine[d.code] = d.libelleOrigine; });
        PP.store.set('motifs', PP.motifs.listBrute().map((m) => {
          if (m.clef) return m; /* déjà migré */
          const origine = nomsOrigine[m.code];
          if (origine && m.libelle === origine) {
            const { libelle, ...reste } = m;
            return { ...reste, clef: `motifs.${m.code}` };
          }
          return m; /* motif personnalisé : on n'y touche pas */
        }));
        PP.store.set('meta', { ...PP.store.get('meta'), motifsV3: true });
      }
      /* `vide` : base volontairement vidée depuis les Paramètres — on ne réinstalle
         ni les employés ni les absences de démonstration */
      if (!meta.vide && !PP.store.get('absences')) semerAbsences();
    }
  };

  /* ---------- Identité (logo + nom d'établissement dans la sidebar) ---------- */
  /* Logo de l'établissement s'il a été choisi dans Paramètres, sinon le logo
     Wendo livré avec l'outil (assets/logo.png) */
  const LOGO_DEFAUT = 'assets/logo.png';

  const htmlLogo = (classe) => {
    const logo = PP.settings.all().logo;
    return `<img src="${logo || LOGO_DEFAUT}" alt="" class="${classe} object-contain">`;
  };
  PP.htmlLogo = (classe = 'h-12 w-12') => htmlLogo(classe);

  const appliquerIdentite = () => {
    const s = PP.settings.all();
    const logo = document.getElementById('sidebar-logo');
    if (logo) logo.innerHTML = htmlLogo('h-12 w-12');
    const nom = document.getElementById('sidebar-etablissement');
    /* Le slogan par défaut est traduit ; le nom d'établissement saisi par
       l'utilisateur, lui, reste tel quel dans les deux langues. */
    if (nom) nom.textContent = s.nomEtablissement || t('app.slogan');
  };
  PP.appliquerIdentite = appliquerIdentite;

  /* ---------- Langue ---------- */
  /* Applique la langue enregistrée, puis retraduit le shell et la page courante.
     Appelée au démarrage et à chaque changement depuis les Paramètres. */
  const appliquerLangue = () => {
    const code = PP.settings.get('langue') || PP.i18n.langueReference();
    PP.i18n.definir(code);
    PP.i18n.appliquerAuDom(document);
    document.title = t('app.titre');
    appliquerIdentite();
    initEntete();
    /* La page courante est reconstruite : ses textes viennent du dictionnaire.
       On se fie à la présence d'un écran de page, pas à celle d'une session :
       une session peut expirer alors que la page reste affichée, et le texte
       doit malgré tout suivre la langue choisie. */
    if (document.getElementById('page-root')?.childElementCount) {
      PP.rafraichirRoute?.();
    }
  };
  PP.appliquerLangue = appliquerLangue;

  /* ---------- Entête (semaine + date du jour) ---------- */
  const initEntete = () => {
    const d = new Date();
    const { week } = PP.dates.isoWeek(d);
    document.getElementById('header-semaine').textContent = `${t('app.semaine')} ${week}`;
    document.getElementById('header-date').textContent = capitalize(PP.dates.formatLong(d));
  };

  /* ---------- Routeur (navigation par hash) ---------- */
  const CLS_ACTIF = 'flex items-center gap-3 rounded-xl border border-white/10 bg-gradient-to-r from-white/[0.09] to-white/[0.02] px-4 py-3 text-sm font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]';
  const CLS_INACTIF = 'flex items-center gap-3 rounded-xl px-4 py-3 text-sm text-white/55 transition hover:bg-white/[0.04] hover:text-white';

  const ROUTES = ['dashboard', 'pointage', 'employes', 'calendrier', 'absences', 'recapitulatif', 'rapports', 'parametres', 'guide'];

  const naviguer = () => {
    const hash = location.hash.replace(/^#\/?/, '');
    const route = ROUTES.includes(hash) ? hash : 'dashboard';

    document.querySelectorAll('[data-route]').forEach((a) => {
      a.className = a.dataset.route === route ? CLS_ACTIF : CLS_INACTIF;
    });

    /* Le conteneur est renouvelé (clone sans écouteurs) : aucune page ne garde
       d'écouteurs actifs qui intercepteraient les clics d'une autre page */
    const ancien = document.getElementById('page-root');
    const nouveau = ancien.cloneNode(false);
    ancien.replaceWith(nouveau);
    (PP.pages[route] || PP.pages.dashboard).render(nouveau);

    /* Le compteur d'alertes suit les données de la page affichée */
    PP.centreAlertes.rafraichir();

    /* Défilement vers la section Licence, demandé par le bouton de l'entête.
       On le fait APRÈS le rendu, sinon la section n'existe pas encore. */
    if (PP.defilerVersLicence && route === 'parametres') {
      PP.defilerVersLicence = false;
      /* Un délai court laisse la page se poser (polices, images) avant de
         calculer la position ; sans lui, on défile vers une hauteur fausse. */
      setTimeout(() => PP.parametresAllerLicence?.(), 120);
    }
  };

  /* ---------- Apparence (thème, texte) ---------- */
  const appliquerTheme = () => {
    const s = PP.settings.all();
    document.body.classList.toggle('pp-clair', s.theme === 'clair');
    document.body.classList.toggle('pp-texte-grand', !!s.texteAgrandi);
  };
  PP.appliquerTheme = appliquerTheme;

  /* ---------- Pastille de compte (entête) ---------- */
  const majCompte = () => {
    const c = PP.securite.utilisateur();
    const initiales = document.getElementById('compte-initiales');
    const nom = document.getElementById('compte-nom');
    const role = document.getElementById('compte-role');
    if (!initiales || !nom || !role) return;
    if (!c) { nom.textContent = 'Non connecté'; role.textContent = '—'; initiales.textContent = '—'; return; }
    nom.textContent = c.nom;
    role.textContent = PP.securite.LIBELLES_ROLES[c.role] || c.role;
    initiales.textContent = (c.identifiant[0] || '?').toUpperCase();
  };
  PP.majCompte = majCompte;

  /* ---------- Invitation à activer (entête) ----------
     Affichée tant que la licence n'est pas active, pour que l'utilisateur
     sache en permanence comment lever les limites du mode démonstration.
     Le clic mène directement à l'écran d'activation des Paramètres. */
  const majBoutonActiver = () => {
    const bouton = document.getElementById('bouton-activer');
    if (!bouton) return;
    const active = PP.licence ? PP.licence.estActive() : true;
    /* `hidden` et `flex` sont deux classes concurrentes : on les échange
       ensemble, sinon l'élément reste invisible ou mal aligné. */
    bouton.classList.toggle('hidden', active);
    bouton.classList.toggle('flex', !active);
  };
  PP.majBoutonActiver = majBoutonActiver;

  document.getElementById('bouton-activer')?.addEventListener('click', () => {
    /* Si l'utilisateur est déjà sur les Paramètres, on ne fait que défiler :
       recharger la page ferait perdre le défilement qu'on vient de créer. */
    if (location.hash === '#/parametres') {
      PP.parametresAllerLicence();
      return;
    }
    /* On mémorise la demande : après le rendu de la page Paramètres, app.js
       déclenche le défilement vers la section Licence. */
    PP.defilerVersLicence = true;
    location.hash = '#/parametres';
  });

  document.getElementById('bouton-compte')?.addEventListener('click', () => {
    if (!PP.securite.utilisateur()) return;
    confirmDialog({
      title: 'Se déconnecter ?',
      message: `Vous serez déconnecté de <span class="font-medium text-white">${escapeHtml(PP.securite.utilisateur().nom)}</span>.`,
      confirmLabel: 'Se déconnecter',
      onConfirm: () => PP.securite.deconnecter(),
    });
  });

  window.addEventListener('pp-session-fermee', () => PP.connexion.afficher());
  window.addEventListener('pp-session-expiree', () => PP.connexion.afficher('Session expirée après inactivité — reconnectez-vous.'));

  window.addEventListener('hashchange', naviguer);
  PP.rafraichirRoute = naviguer;

  /* ---------- Démarrage ---------- */
  PP.icons.inject();
  /* Les icônes s'injectent tout de suite (elles ne dépendent pas des données) ;
     le reste attend que le stockage soit disponible, car en application de
     bureau la lecture du fichier est asynchrone. */
  PP.store.demarrer()
    .then(() => { preparerDonnees(); return PP.securite.init(); })
    .then(() => {
      appliquerLangue();
      appliquerTheme();
      initEntete();
      PP.centreAlertes.init();
      PP.sauvegardes.auto(); /* instantané automatique si l'intervalle est échu */
      majCompte();
      /* L'état de licence est lu de façon asynchrone (fichier sur disque) :
         le bouton se met à jour quand la réponse arrive, sans bloquer le
         démarrage. */
      PP.licence?.rafraichir?.().then(majBoutonActiver).catch(() => majBoutonActiver());
      if (PP.securite.utilisateur()) naviguer();
      else PP.connexion.afficher();
    })
    .catch((e) => {
      console.error('Démarrage impossible :', e);
      document.body.innerHTML = '<div style="padding:3rem;font-family:system-ui;color:#eee;background:#050505;min-height:100vh">'
        + '<h1 style="font-size:1.4rem">Wendo n\'a pas pu démarrer</h1>'
        + '<p style="margin-top:1rem;color:#f87171">' + String(e && e.message ? e.message : e) + '</p>'
        + '<p style="margin-top:1rem;color:#999">Vos données n\'ont pas été modifiées. Relancez l\'application.</p></div>';
    });
})();

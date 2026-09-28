/* Page Employés (section 1) — liste, recherche, filtres actifs/inactifs, CRUD complet */
window.PP = window.PP || {};
PP.pages = PP.pages || {};

PP.pages.employes = (() => {
  const { escapeHtml } = PP.utils;
  const { icon, toast, modal, confirmDialog, avatar, badge } = PP.ui;

  /* Clé du dictionnaire par type de contrat : le libellé du contrat est une
     donnée utilisateur, seule la couleur Tailwind associée est traduite. */
  const CONTRAT_COULEURS = {
    'CDI': t('contrats.cdi'),
    'CDD': t('contrats.cdd'),
    'Intérim': t('contrats.interimaire'),
    'Stage': t('contrats.stage'),
    'Alternance': t('contrats.alternance'),
  };

  const etat = { recherche: '', filtre: 'tous' };
  let racine = null;

  const formatTaux = (t) => (t === null || t === undefined || t === '')
    ? '—' : `${PP.settings.formaterMonetaire(t)}/h`;
  const formatDate = (iso) => (iso ? PP.dates.formatCourt(PP.dates.fromISO(iso)) : '—');

  /* ================= Rendu de la page ================= */
  const render = (root) => {
    racine = root;
    etat.recherche = '';
    etat.filtre = 'tous';

    root.innerHTML = `
      <div class="flex items-end justify-between">
        <div>
          <h1 class="text-4xl font-semibold tracking-tight">${t('pages.employes.titre')}</h1>
          <p id="emp-compte" class="mt-2 text-white/50"></p>
        </div>
        <button id="emp-add" class="pp-btn-primary ${PP.securite.peut('employes.editer') ? '' : 'hidden'}">${icon('i-plus', 'h-4 w-4')} ${t('employes.ajouter')}</button>
      </div>

      <div class="mt-7 flex flex-wrap items-center gap-3">
        <div class="relative w-80">
          <span class="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30">${icon('i-search', 'h-4 w-4')}</span>
          <input id="emp-recherche" type="text" placeholder="${t('employes.recherchePlaceholder')}" class="pp-input pl-10">
        </div>
        <div id="emp-filtres" class="flex rounded-xl border border-white/10 bg-white/5 p-1 text-xs">
          <button data-filtre="tous">${t('employes.filtreTous')}</button>
          <button data-filtre="actifs">${t('employes.filtreActifs')}</button>
          <button data-filtre="inactifs">${t('employes.filtreInactifs')}</button>
        </div>
      </div>

      <div id="emp-grille" class="mt-5 grid grid-cols-2 gap-5 xl:grid-cols-3"></div>`;

    root.querySelector('#emp-recherche').addEventListener('input', (e) => {
      etat.recherche = e.target.value.toLowerCase();
      dessinerGrille();
    });

    root.querySelector('#emp-filtres').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-filtre]');
      if (!btn) return;
      etat.filtre = btn.dataset.filtre;
      dessinerGrille();
    });

    /* Délégation : survit aux redessins de la grille */
    root.addEventListener('click', (e) => {
      if (e.target.closest('#emp-add, #emp-add-vide')) return ouvrirFormulaire(null);
      const edit = e.target.closest('[data-edit]');
      if (edit) return ouvrirFormulaire(PP.employes.get(edit.dataset.edit));
      const chat = e.target.closest('[data-chat]');
      if (chat) return ouvrirNotes(chat.dataset.chat);
      const planning = e.target.closest('[data-planning]');
      if (planning) return ouvrirPlanning(planning.dataset.planning);
      const del = e.target.closest('[data-del]');
      if (del) return confirmerSuppression(PP.employes.get(del.dataset.del));
      const tog = e.target.closest('[data-toggle]');
      if (tog) {
        PP.employes.toggleActif(tog.dataset.toggle);
        dessinerGrille();
      }
    });

    dessinerGrille();
  };

  /* ================= Grille ================= */
  const employesFiltres = () => PP.employes.list()
    .filter((e) => {
      if (etat.filtre === 'actifs' && !e.actif) return false;
      if (etat.filtre === 'inactifs' && e.actif) return false;
      const paille = `${e.prenom} ${e.nom} ${e.poste} ${e.departement} ${e.matricule}`.toLowerCase();
      return paille.includes(etat.recherche);
    })
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr') || a.prenom.localeCompare(b.prenom, 'fr'));

  const dessinerGrille = () => {
    if (!racine) return;
    const liste = employesFiltres();
    const tous = PP.employes.list();
    const nbActifs = tous.filter((e) => e.actif).length;
    const max = PP.settings.get('maxEmployes');

    racine.querySelector('#emp-compte').textContent =
      `${tous.length === 0
        ? t('employes.compteAucun')
        : `${t('employes.compteTotal', { n: tous.length, s: tous.length > 1 ? 's' : '' })} · ${t('employes.compteActifs', { n: nbActifs, s: nbActifs > 1 ? 's' : '' })}`}`
      + `${liste.length !== tous.length ? ` — ${t('employes.compteAffiches', { n: liste.length, s: liste.length > 1 ? 's' : '' })}` : ''}`
      + ` · ${t('employes.compteMaximum', { max })}`;

    racine.querySelectorAll('#emp-filtres [data-filtre]').forEach((btn) => {
      const actif = btn.dataset.filtre === etat.filtre;
      btn.className = `rounded-lg px-4 py-2 transition ${actif ? 'bg-white font-medium text-black' : 'text-white/50 hover:text-white'}`;
    });

    racine.querySelector('#emp-grille').innerHTML = liste.length ? liste.map(carte).join('') : carteVide();
  };

  const ligne = (iconeId, label, valeur) => `
    <div class="flex items-center gap-2">
      <span class="w-4 shrink-0 text-white/30">${icon(iconeId, 'h-3.5 w-3.5')}</span>
      <span class="shrink-0 text-white/40">${label}</span>
      <span class="ml-auto truncate pl-2 text-right text-white/80">${valeur}</span>
    </div>`;

  const carte = (e) => {
    const manager = e.managerId ? PP.employes.get(e.managerId) : null;
    return `
    <article class="rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-white/20 ${e.actif ? '' : 'opacity-55'}">
      <div class="flex items-start gap-3">
        ${avatar(e, 'h-12 w-12 text-sm')}
        <div class="min-w-0 flex-1">
          <p class="truncate font-semibold leading-tight">${escapeHtml(e.prenom)} ${escapeHtml(e.nom)}</p>
          <p class="mt-1 truncate text-xs text-white/40">${escapeHtml(e.poste || '—')}${e.departement ? ` · ${escapeHtml(e.departement)}` : ''}</p>
        </div>
        ${badge(e.contrat, CONTRAT_COULEURS[e.contrat] || 'white')}
      </div>

      <div class="mt-4 space-y-2 border-t border-white/5 pt-4 text-xs">
        ${ligne('i-id', t('employes.matricule'), escapeHtml(e.matricule || '—'))}
        ${ligne('i-calendar', t('employes.embauche'), formatDate(e.dateEmbauche))}
        ${ligne('i-clock', t('employes.heuresContrat'), t('employes.heuresParSemaine', { n: e.heuresHebdo }))}
        ${ligne('i-euro', t('employes.tauxHoraire'), formatTaux(e.tauxHoraire))}
        ${ligne('i-mail', t('employes.champEmail'), e.email ? `<a href="mailto:${escapeHtml(e.email)}" class="hover:text-white hover:underline">${escapeHtml(e.email)}</a>` : '—')}
        ${ligne('i-phone', t('employes.champTelephone'), escapeHtml(e.telephone || '—'))}
        ${ligne('i-user', t('employes.manager'), manager ? escapeHtml(`${manager.prenom} ${manager.nom}`) : '—')}
        ${(PP.settings.get('champsPersonnalises') || []).map((f) => (e.custom && e.custom[f.id])
          ? ligne('i-id', escapeHtml(f.libelle), escapeHtml(e.custom[f.id])) : '').join('')}
      </div>

      <div class="mt-4 flex items-center justify-between border-t border-white/5 pt-4">
        ${PP.securite.peut('employes.editer') ? `
        <button data-toggle="${e.id}" class="flex items-center gap-2.5 text-xs text-white/50 transition hover:text-white">
          <span class="pp-switch" data-on="${e.actif}"></span> ${e.actif ? t('statut.actif') : t('statut.inactif')}
        </button>` : '<span></span>'}
        <div class="flex gap-1.5">
          <button data-chat="${e.id}" title="${t('employes.notesInternes')}" class="rounded-lg p-2 text-white/50 transition hover:bg-white/5 hover:text-white">${icon('i-notes', 'h-4 w-4')}</button>
          ${PP.securite.peut('employes.editer') ? `<button data-planning="${e.id}" title="${t('employes.planningType')}" class="rounded-lg p-2 text-white/50 transition hover:bg-white/5 hover:text-white">${icon('i-calendar', 'h-4 w-4')}</button>` : ''}
          ${PP.securite.peut('employes.editer') ? `<button data-edit="${e.id}" title="${t('employes.titreModifier')}" class="rounded-lg p-2 text-white/50 transition hover:bg-white/5 hover:text-white">${icon('i-edit', 'h-4 w-4')}</button>` : ''}
          ${PP.securite.peut('employes.supprimer') ? `<button data-del="${e.id}" title="${t('employes.titreSupprimer')}" class="rounded-lg p-2 text-white/50 transition hover:bg-red-500/10 hover:text-red-300">${icon('i-trash', 'h-4 w-4')}</button>` : ''}
        </div>
      </div>
    </article>`;
  };

  const carteVide = () => {
    const aucun = PP.employes.list().length === 0;
    return `
    <div class="col-span-full rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-12 text-center">
      <span class="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white/60">${icon('i-users', 'h-6 w-6')}</span>
      <p class="mt-4 font-medium">${aucun ? t('employes.videTitre') : t('employes.sansResultat')}</p>
      <p class="mx-auto mt-1.5 max-w-sm text-sm text-white/40">${aucun ? t('employes.videTexte') : t('employes.sansResultatTexte')}</p>
      ${aucun && PP.securite.peut('employes.editer') ? `<button id="emp-add-vide" class="pp-btn-primary mx-auto mt-5">${icon('i-plus', 'h-4 w-4')} ${t('employes.ajouter')}</button>` : ''}
    </div>`;
  };

  /* ================= Suppression ================= */
  const confirmerSuppression = (e) => {
    if (!e) return;
    const liees = PP.employes.donneesLiees(e.id);
    const detail = [
      liees.pointages ? t('employes.lieesPointages', { n: liees.pointages, s: liees.pointages > 1 ? 's' : '' }) : '',
      liees.absences ? t('employes.lieesAbsences', { n: liees.absences, s: liees.absences > 1 ? 's' : '' }) : '',
      liees.messages ? t('employes.lieesMessages', { n: liees.messages, s: liees.messages > 1 ? 's' : '' }) : '',
      liees.planning ? t('employes.lieesPlanning') : '',
    ].filter(Boolean);
    confirmDialog({
      title: t('employes.supprimerTitre'),
      message: `<span class="font-medium text-white">${escapeHtml(e.prenom)} ${escapeHtml(e.nom)}</span> ${t('employes.supprimerTexte')}`
        + (detail.length ? t('employes.supprimerDonnees', { liste: detail.join(', ') }) : '')
        + t('employes.supprimerSuffixe', { desactivation: t('employes.supprimerDesactivation') }),
      confirmLabel: t('action.supprimer'),
      onConfirm: () => {
        PP.employes.remove(e.id);
        toast(t('employes.supprimeToast'), 'success');
        dessinerGrille();
      },
    });
  };

  /* ================= Formulaire (création / modification) ================= */
  const champ = (label, input) => `<label class="block"><span class="pp-label">${label}</span>${input}</label>`;

  /* Réduit une image choisie à 320 px maximum pour ne pas saturer le stockage local */
  const redimensionner = (fichier, cb) => {
    const lecteur = new FileReader();
    lecteur.onload = () => {
      const img = new Image();
      img.onload = () => {
        const TAILLE = 320;
        const echelle = Math.min(1, TAILLE / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * echelle);
        canvas.height = Math.round(img.height * echelle);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        cb(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = lecteur.result;
    };
    lecteur.readAsDataURL(fichier);
  };

  const valider = (d) => {
    if (!d.prenom.trim() || !d.nom.trim()) return t('employes.errNom');
    if (d.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) return t('employes.errEmail');
    const h = Number(d.heuresHebdo);
    if (!(h > 0) || h > 80) return t('employes.errHeures');
    if (d.tauxHoraire !== '' && d.tauxHoraire != null) {
      if (!Number.isFinite(Number(d.tauxHoraire))) return t('employes.errTauxNombre');
      if (Number(d.tauxHoraire) < 0) return t('employes.errTauxNegatif');
    }
    return null;
  };

  const ouvrirFormulaire = (employe) => {
    const creation = !employe;

    /* Mode démonstration : on refuse AVANT d'ouvrir le formulaire, pas à la
       validation. Laisser l'utilisateur remplir une fiche entière pour la
       rejeter ensuite serait une perte de temps et une mauvaise surprise. */
    if (creation && PP.licence && !PP.licence.estActive()) {
      const plafond = PP.licence.limites().maxEmployes;
      if (PP.employes.list().length >= plafond) {
        toast(t('licence.demoPlafond', { n: plafond }), 'warning');
        return;
      }
    }

    const e = employe || { heuresHebdo: 40, contrat: 'CDI', actif: true };
    let photo = employe?.photo || '';
    const managers = PP.employes.list().filter((x) => x.id !== employe?.id);

    const body = `
    <form id="emp-form" class="space-y-5" novalidate>
      <div class="flex items-center gap-4">
        <span id="emp-photo-apercu">${avatar({ prenom: e.prenom, nom: e.nom, photo }, 'h-16 w-16 text-base')}</span>
        <div>
          <div class="flex gap-2">
            <button type="button" id="emp-photo-btn" class="pp-btn-ghost px-3 py-2 text-xs">${icon('i-image', 'h-3.5 w-3.5')} ${t('employes.choisirPhoto')}</button>
            <button type="button" id="emp-photo-suppr" class="pp-btn-ghost px-3 py-2 text-xs ${photo ? '' : 'hidden'}">${t('employes.retirerPhoto')}</button>
          </div>
          <input type="file" id="emp-photo-fichier" accept="image/*" class="hidden">
          <p class="mt-1.5 text-[11px] text-white/35">${t('employes.photoAide')}</p>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-4">
        ${champ(t('employes.champPrenom'), `<input name="prenom" value="${escapeHtml(e.prenom || '')}" class="pp-input" placeholder="Amani">`)}
        ${champ(t('employes.champNom'), `<input name="nom" value="${escapeHtml(e.nom || '')}" class="pp-input" placeholder="Mbemba">`)}
        ${champ(t('employes.champMatricule'), `<input name="matricule" value="${escapeHtml(e.matricule || '')}" class="pp-input" placeholder="EMP-001">`)}
        ${champ(t('employes.champPoste'), `<input name="poste" value="${escapeHtml(e.poste || '')}" class="pp-input" placeholder="Développeur">`)}
        ${champ(t('employes.champDepartement'), `<input name="departement" value="${escapeHtml(e.departement || '')}" class="pp-input" placeholder="IT">`)}
        ${champ(t('employes.champContrat'), `<select name="contrat" class="pp-select">${PP.employes.CONTRATS.map((c) => `<option ${c === e.contrat ? 'selected' : ''}>${c}</option>`).join('')}</select>`)}
        ${champ(t('employes.champDateEmbauche'), `<input type="date" name="dateEmbauche" value="${e.dateEmbauche || ''}" class="pp-input">`)}
        ${champ(t('employes.champHeuresHebdo'), `<input type="number" name="heuresHebdo" value="${e.heuresHebdo ?? 40}" min="1" max="80" step="0.5" class="pp-input">`)}
        ${champ(t('employes.champTauxHoraire'), `<input type="number" name="tauxHoraire" value="${e.tauxHoraire ?? ''}" min="0" step="0.01" class="pp-input" placeholder="18,50">`)}
        ${champ(t('employes.champTelephone'), `<input type="tel" name="telephone" value="${escapeHtml(e.telephone || '')}" class="pp-input" placeholder="06 12 34 56 78">`)}
        ${champ(t('employes.champEmail'), `<input type="email" name="email" value="${escapeHtml(e.email || '')}" class="pp-input" placeholder="prenom.nom@exemple.fr">`)}
        ${champ(t('employes.champManager'), `<select name="managerId" class="pp-select">
            <option value="">${t('employes.sansManager')}</option>
            ${managers.map((m) => `<option value="${m.id}" ${m.id === e.managerId ? 'selected' : ''}>${escapeHtml(m.prenom)} ${escapeHtml(m.nom)}</option>`).join('')}
          </select>`)}
      </div>

      ${(PP.settings.get('champsPersonnalises') || []).length ? `
        <div class="grid grid-cols-2 gap-4">
          ${(PP.settings.get('champsPersonnalises') || []).map((f) => champ(escapeHtml(f.libelle), `<input name="custom_${f.id}" value="${escapeHtml((e.custom || {})[f.id] || '')}" class="pp-input">`)).join('')}
        </div>` : ''}

      <label class="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
        <input type="checkbox" name="actif" ${e.actif ? 'checked' : ''} class="h-4 w-4 accent-emerald-400">
        <span class="text-sm text-white/75">${t('employes.employeActif')} <span class="text-white/35">${t('employes.employeActifAide')}</span></span>
      </label>

      <p id="emp-form-erreur" class="hidden rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-2.5 text-xs text-red-200"></p>
    </form>`;

    const fermer = modal({
      title: creation ? t('employes.modaleAjout') : t('employes.modaleModifier', { nom: `${escapeHtml(e.prenom)} ${escapeHtml(e.nom)}` }),
      size: 'max-w-2xl',
      body,
      footer: `
        <button data-close class="pp-btn-ghost">${t('action.annuler')}</button>
        <button id="emp-submit" class="pp-btn-primary">${creation ? t('employes.boutonAjouter') : t('employes.boutonEnregistrerModifs')}</button>`,
    });

    /* Toutes les requêtes restent limitées à cette modale (jamais globales) */
    const boiteModale = fermer.overlay;

    /* Photo */
    const fichier = boiteModale.querySelector('#emp-photo-fichier');
    const btnSuppr = boiteModale.querySelector('#emp-photo-suppr');
    boiteModale.querySelector('#emp-photo-btn').addEventListener('click', () => fichier.click());
    fichier.addEventListener('change', () => {
      const f = fichier.files[0];
      if (!f) return;
      redimensionner(f, (dataUrl) => {
        photo = dataUrl;
        boiteModale.querySelector('#emp-photo-apercu').innerHTML =
          avatar({ prenom: e.prenom, nom: e.nom, photo }, 'h-16 w-16 text-base');
        btnSuppr.classList.remove('hidden');
      });
    });
    btnSuppr.addEventListener('click', () => {
      photo = '';
      boiteModale.querySelector('#emp-photo-apercu').innerHTML =
        avatar({ prenom: e.prenom, nom: e.nom }, 'h-16 w-16 text-base');
      btnSuppr.classList.add('hidden');
    });

    /* Soumission (bouton ou touche Entrée) */
    const form = boiteModale.querySelector('#emp-form');
    const soumettre = () => {
      const data = Object.fromEntries(new FormData(form).entries());
      data.photo = photo;
      data.actif = form.querySelector('[name="actif"]').checked;
      const custom = {};
      (PP.settings.get('champsPersonnalises') || []).forEach((f) => {
        custom[f.id] = form.querySelector(`[name="custom_${f.id}"]`)?.value.trim() ?? '';
      });
      data.custom = custom;

      const erreur = valider(data);
      const boite = boiteModale.querySelector('#emp-form-erreur');
      if (erreur) { boite.textContent = erreur; boite.classList.remove('hidden'); return; }

      const resultat = creation ? PP.employes.create(data) : PP.employes.update(employe.id, data);
      if (resultat.erreur) { boite.textContent = resultat.erreur; boite.classList.remove('hidden'); return; }

      fermer();
      toast(creation ? t('employes.ajouteToast') : t('employes.modifieToast'), 'success');
      dessinerGrille();
    };
    boiteModale.querySelector('#emp-submit').addEventListener('click', soumettre);
    form.addEventListener('submit', (ev) => { ev.preventDefault(); soumettre(); });
  };

  /* ================= Notes internes (fil par employé) ================= */
  /* Suivi d'un employé : consignes, rappels, échanges verbaux — l'employé
     n'a pas accès à ce fil, il s'agit de notes de gestion */
  const ouvrirNotes = (empId) => {
    const e = PP.employes.get(empId);
    if (!e) return;
    const peutSupprimer = PP.securite.peut('messages.supprimer');

    const rendu = () => PP.messages.pour(empId).map((m) => {
      const d = new Date(m.horodatage);
      return `
      <li class="flex items-start gap-3 rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2.5">
        <div class="min-w-0 flex-1">
          <p class="text-[10px] text-white/35">${escapeHtml(m.auteur)} · ${PP.dates.formatCourt(d)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}</p>
          <p class="mt-1 whitespace-pre-wrap text-sm text-white/85">${escapeHtml(m.texte)}</p>
        </div>
        ${peutSupprimer ? `<button data-suppr-message="${m.id}" title="${t('employes.titreSupprimer')}" class="rounded-lg p-1.5 text-white/30 transition hover:bg-red-500/10 hover:text-red-300">${icon('i-trash', 'h-3.5 w-3.5')}</button>` : ''}
      </li>`;
    }).join('');

    const fermer = modal({
      title: t('employes.notesTitre', { nom: `${escapeHtml(e.prenom)} ${escapeHtml(e.nom)}` }),
      size: 'max-w-lg',
      body: `
        <ul id="emp-fil" class="max-h-72 space-y-2 overflow-y-auto">${rendu() || `<li class="text-xs text-white/35">${t('employes.notesVide')}</li>`}</ul>
        <div class="mt-4 flex items-end gap-2">
          <textarea id="emp-message" rows="2" class="pp-input" placeholder="${t('employes.notesPlaceholder')}"></textarea>
          <button id="emp-message-envoyer" class="pp-btn-primary px-4 py-2.5 text-xs">${t('action.ajouter')}</button>
        </div>`,
      footer: `<button data-close class="pp-btn-ghost">${t('action.fermer')}</button>`,
    });

    /* Requêtes limitées à cette modale */
    const boiteModale = fermer.overlay;
    const fil = boiteModale.querySelector('#emp-fil');
    boiteModale.querySelector('#emp-message-envoyer').addEventListener('click', () => {
      const champ = boiteModale.querySelector('#emp-message');
      const r = PP.messages.envoyer(empId, champ.value);
      if (r.erreur) { toast(r.erreur, 'warning'); return; }
      champ.value = '';
      fil.innerHTML = rendu();
    });
    fil.addEventListener('click', (ev) => {
      const btn = ev.target.closest('[data-suppr-message]');
      if (!btn) return;
      PP.messages.supprimer(btn.getAttribute('data-suppr-message'));
      fil.innerHTML = rendu();
    });
  };

  /* ================= Planning type hebdomadaire ================= */
  const ouvrirPlanning = (empId) => {
    const e = PP.employes.get(empId);
    if (!e) return;
    const planning = PP.plannings.de(empId) || {};

    const valeur = (jour, k) => {
      const j = planning[String(jour)];
      return j && j[k] !== null && j[k] !== undefined ? PP.time.toHHMM(j[k]) : '';
    };

    const bornesCreneaux = {
      t1: t('employes.planningDebutMatin'),
      t2: t('employes.planningFinMatin'),
      t3: t('employes.planningDebutApresMidi'),
      t4: t('employes.planningFinApresMidi'),
    };

    const lignes = PP.dates.JOURS.map((nom, jour) => `
      <div class="flex items-center gap-2 rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2">
        <span class="w-16 shrink-0 text-xs capitalize text-white/70">${escapeHtml(nom)}</span>
        ${['t1', 't2', 't3', 't4'].map((k) => `<input data-jour="${jour}" data-heure="${k}" value="${valeur(jour, k)}" maxlength="6" placeholder="—" title="${bornesCreneaux[k]}" class="pp-input px-1 py-1.5 text-center text-xs tabular-nums">`).join('')}
        <span data-total-jour="${jour}" class="w-12 shrink-0 text-right text-xs tabular-nums text-white/50"></span>
      </div>`).join('');

    const fermer = modal({
      title: t('employes.planningTitre', { nom: `${escapeHtml(e.prenom)} ${escapeHtml(e.nom)}` }),
      size: 'max-w-xl',
      body: `
        <p class="text-[11px] text-white/40">${t('employes.planningAide')}</p>
        <div class="mt-4 space-y-2">${lignes}</div>
        <p class="mt-3 text-xs text-white/50">${t('employes.planningTotal')} <span id="emp-planning-total" class="font-semibold tabular-nums">—</span></p>`,
      footer: `
        ${planning ? `<button id="emp-planning-retirer" class="mr-auto rounded-xl px-3 py-2.5 text-xs text-red-300 transition hover:bg-red-500/10">${t('employes.planningRetirer')}</button>` : ''}
        <button data-close class="pp-btn-ghost">${t('action.annuler')}</button>
        <button id="emp-planning-ok" class="pp-btn-primary">${t('action.enregistrer')}</button>`,
    });

    /* Requêtes limitées à cette modale (le sélecteur [data-jour] existe aussi
       dans Paramètres : ne jamais l'interroger à l'échelle du document) */
    const boiteModale = fermer.overlay;
    const recalculer = () => {
      let total = 0;
      for (let jour = 0; jour < 7; jour += 1) {
        const creneaux = ['t1', 't2', 't3', 't4'].map((k) => {
          const brut = boiteModale.querySelector(`[data-jour="${jour}"][data-heure="${k}"]`)?.value.trim() ?? '';
          return brut ? PP.time.parse(brut) : null;
        });
        const totalJour = PP.time.totalJour([[creneaux[0], creneaux[1]], [creneaux[2], creneaux[3]]]);
        boiteModale.querySelector(`[data-total-jour="${jour}"]`).textContent = totalJour ? PP.time.formatHM(totalJour) : '—';
        total += totalJour;
      }
      boiteModale.querySelector('#emp-planning-total').textContent = PP.time.formatHM(total);
    };
    boiteModale.querySelectorAll('[data-jour]').forEach((input) => input.addEventListener('input', recalculer));
    recalculer();

    boiteModale.querySelector('#emp-planning-ok').addEventListener('click', () => {
      const jours = {};
      for (let jour = 0; jour < 7; jour += 1) {
        jours[String(jour)] = Object.fromEntries(['t1', 't2', 't3', 't4'].map((k) => {
          const brut = boiteModale.querySelector(`[data-jour="${jour}"][data-heure="${k}"]`).value.trim();
          return [k, brut ? PP.time.parse(brut) : null];
        }));
      }
      PP.plannings.enregistrer(empId, jours);
      fermer();
      toast(t('employes.planningEnregistre'), 'success');
    });
    boiteModale.querySelector('#emp-planning-retirer')?.addEventListener('click', () => {
      PP.plannings.supprimer(empId);
      fermer();
      toast(t('employes.planningRetire'), 'success');
    });
  };

  return { render };
})();

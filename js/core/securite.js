/* Sécurité & droits d'accès (section 9)
   — comptes locaux : mots de passe hachés SHA-256 + salt (WebCrypto)
   — rôles : administrateur, rh, manager, employe (matrice de permissions)
   — session avec expiration d'inactivité, 2FA TOTP (RFC 6238), journal, clôture de périodes */
window.PP = window.PP || {};

PP.securite = (() => {
  const CLE_COMPTES = 'comptes';
  const CLE_JOURNAL = 'journal';
  const CLE_CLOTURES = 'clotures';
  const CLE_SESSION = 'pp-session';
  const ROLES = ['administrateur', 'rh', 'manager', 'employe'];

  /* ================= Hachage ================= */
  const salt = () => PP.utils.uid() + PP.utils.uid();

  /* Repli (non cryptographique) si WebCrypto indisponible — signalé au démarrage */
  const hachageFaible = (texte) => {
    let h1 = 0x811c9dc5, h2 = 0x01000193;
    for (let i = 0; i < texte.length; i += 1) {
      h1 = (h1 ^ texte.charCodeAt(i)) * 0x01000193 >>> 0;
      h2 = (h2 + texte.charCodeAt(i) * (i + 7)) >>> 0;
    }
    return `fnv-${h1.toString(16)}-${h2.toString(16)}`;
  };

  const hacher = async (motDePasse, sel) => {
    const donnees = new TextEncoder().encode(`${sel}:${motDePasse}`);
    if (window.crypto?.subtle) {
      const empreinte = await crypto.subtle.digest('SHA-256', donnees);
      return [...new Uint8Array(empreinte)].map((b) => b.toString(16).padStart(2, '0')).join('');
    }
    return hachageFaible(`${sel}:${motDePasse}`);
  };

  const cryptoDisponible = !!window.crypto?.subtle;

  /* ================= Comptes ================= */
  const comptes = () => PP.store.get(CLE_COMPTES, []);
  const parIdentifiant = (identifiant) => comptes().find((c) => c.identifiant.toLowerCase() === String(identifiant).trim().toLowerCase()) || null;
  const parEmploye = (employeId) => comptes().find((c) => c.employeId === employeId) || null;

  const creerCompte = async ({ identifiant, motDePasse, role, employeId = '', nom = '' }) => {
    if (!identifiant.trim()) return { erreur: t('securite.errIdentifiantRequis') };
    if (parIdentifiant(identifiant)) return { erreur: t('securite.errIdentifiantExiste') };
    if (!ROLES.includes(role)) return { erreur: t('securite.errRoleInvalide') };
    if ((motDePasse || '').length < 4) return { erreur: t('securite.errMdpCourt') };
    const sel = salt();
    const compte = {
      id: PP.utils.uid(),
      identifiant: identifiant.trim(),
      nom: (nom || identifiant).trim(),
      role,
      employeId,
      sel,
      empreinte: await hacher(motDePasse, sel),
      actif: true,
      totpSecret: '',
      mdpParDefaut: false,
      creeLe: new Date().toISOString(),
    };
    PP.store.set(CLE_COMPTES, [...comptes(), compte]);
    return { compte };
  };

  const definirMotDePasse = async (id, motDePasse) => {
    if ((motDePasse || '').length < 4) return { erreur: t('securite.errMdpCourt') };
    const liste = comptes();
    const c = liste.find((x) => x.id === id);
    if (!c) return { erreur: t('securite.errCompteIntrouvable') };
    c.sel = salt();
    c.empreinte = await hacher(motDePasse, c.sel);
    c.mdpParDefaut = false;
    c.modifieLe = new Date().toISOString();
    PP.store.set(CLE_COMPTES, liste);
    return { ok: true };
  };

  const majCompte = (id, patch) => {
    const liste = comptes();
    const i = liste.findIndex((x) => x.id === id);
    if (i === -1) return { erreur: t('securite.errCompteIntrouvable') };
    liste[i] = { ...liste[i], ...patch };
    PP.store.set(CLE_COMPTES, liste);
    return { ok: true };
  };

  const supprimerCompte = (id) => {
    const c = comptes().find((x) => x.id === id);
    if (!c) return { erreur: t('securite.errCompteIntrouvable') };
    if (c.role === 'administrateur' && comptes().filter((x) => x.role === 'administrateur' && x.actif).length <= 1) {
      return { erreur: t('securite.errDernierAdmin') };
    }
    PP.store.set(CLE_COMPTES, comptes().filter((x) => x.id !== id));
    return { ok: true };
  };

  /* ================= 2FA TOTP (RFC 6238) ================= */
  const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

  const genererSecretTotp = () => {
    const octets = crypto.getRandomValues(new Uint8Array(10));
    let bits = '';
    octets.forEach((b) => { bits += b.toString(2).padStart(8, '0'); });
    return bits.match(/.{5}/g).map((x) => BASE32[parseInt(x, 2)]).join('');
  };

  const decoder32 = (secret) => {
    let bits = '';
    secret.replace(/\s/g, '').toUpperCase().split('').forEach((c) => {
      const i = BASE32.indexOf(c);
      if (i >= 0) bits += i.toString(2).padStart(5, '0');
    });
    const octets = [];
    for (let i = 0; i + 8 <= bits.length; i += 8) octets.push(parseInt(bits.slice(i, i + 8), 2));
    return new Uint8Array(octets);
  };

  const totp = async (secret, temps = Date.now()) => {
    if (!window.crypto?.subtle) return null;
    let compteur = Math.floor(temps / 30000);
    const message = new Uint8Array(8);
    for (let i = 7; i >= 0; i -= 1) { message[i] = compteur & 255; compteur = Math.floor(compteur / 256); }
    const cle = await crypto.subtle.importKey('raw', decoder32(secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
    const sig = new Uint8Array(await crypto.subtle.sign('HMAC', cle, message));
    const decalage = sig[sig.length - 1] & 15;
    const binaire = ((sig[decalage] & 127) << 24) | (sig[decalage + 1] << 16) | (sig[decalage + 2] << 8) | sig[decalage + 3];
    return String(binaire % 1000000).padStart(6, '0');
  };

  const totpValide = async (secret, code) => {
    for (const delta of [-1, 0, 1]) {
      if ((await totp(secret, Date.now() + delta * 30000)) === String(code).trim()) return true;
    }
    return false;
  };

  /* ================= Session ================= */
  let session = null;
  try { session = JSON.parse(sessionStorage.getItem(CLE_SESSION) || 'null'); } catch { session = null; }

  const utilisateur = () => {
    if (!session) return null;
    const c = comptes().find((x) => x.id === session.compteId);
    return c && c.actif ? c : null;
  };

  const connecter = async (identifiant, motDePasse, codeTotp = '') => {
    const c = parIdentifiant(identifiant);
    if (!c || !c.actif) {
      journaliser('echec', identifiant, t('securite.journalEchecCompteInconnu'));
      return { erreur: t('securite.errMdpIncorrect') };
    }
    if ((await hacher(motDePasse || '', c.sel)) !== c.empreinte) {
      journaliser('echec', c.identifiant, t('securite.journalMdpIncorrect'));
      return { erreur: t('securite.errMdpIncorrect') };
    }
    if (c.totpSecret && !(await totpValide(c.totpSecret, codeTotp))) {
      journaliser('echec', c.identifiant, t('securite.journalCode2faInvalide'));
      return { erreur: t('securite.errCode2fa'), demanderCode: true };
    }
    session = { compteId: c.id, dernierMouvement: Date.now() };
    sessionStorage.setItem(CLE_SESSION, JSON.stringify(session));
    journaliser('connexion', c.identifiant, '');
    return { compte: c };
  };

  const deconnecter = (raison = null) => {
    if (session) {
      const c = comptes().find((x) => x.id === session.compteId);
      journaliser('deconnexion', c?.identifiant || '?', raison || t('securite.journalDeconnexion'));
    }
    sessionStorage.removeItem(CLE_SESSION);
    session = null;
    window.dispatchEvent(new CustomEvent('pp-session-fermee'));
  };

  /* Inactivité : expiration configurée dans Paramètres (minutes, 0 = jamais) */
  const mouvements = () => { if (session) session.dernierMouvement = Date.now(); };
  let surveillance = false;
  const surveiller = () => {
    if (surveillance) return;
    surveillance = true;
    ['click', 'keydown', 'mousemove', 'touchstart'].forEach((evt) => document.addEventListener(evt, mouvements, { passive: true }));
    setInterval(() => {
      if (!session) return;
      const minutes = PP.settings.get('sessionMinutes');
      if (!minutes) return;
      if (Date.now() - session.dernierMouvement > minutes * 60 * 1000) {
        deconnecter(t('securite.journalInactivite'));
        window.dispatchEvent(new CustomEvent('pp-session-expiree'));
      }
    }, 10000);
  };

  /* ================= Permissions ================= */
  /* Droits par rôle. Actions connues :
       employes.editer · employes.supprimer · pointage.editer · pointage.editer.soimeme
       pointage.valider · pointage.supprimer · absence.valider · absence.supprimer
       absence.demander · messages.supprimer · exporter · alertes.voir · parametres.voir
     Une action absente de la liste d'un rôle est refusée (sauf « * »).
     Les suppressions (employés, pointages, messages) sont volontairement réservées
     à l'administrateur ; RH peut en revanche supprimer une absence. */
  const MATRICE = {
    administrateur: ['*'],
    rh: ['employes.editer', 'pointage.editer', 'pointage.valider', 'absence.valider', 'absence.supprimer', 'exporter', 'alertes.voir'],
    manager: ['pointage.editer', 'pointage.valider', 'absence.valider', 'exporter', 'alertes.voir'],
    employe: ['pointage.editer.soimeme', 'absence.demander', 'alertes.voir'],
  };

  const LIBELLES_ROLES = {
    administrateur: 'Administrateur',
    rh: 'RH',
    manager: 'Manager',
    employe: 'Employé',
  };
  /* Libellés traduits : la table garde les clefs de rôle comme repère stable,
     mais ce qui est affiché suit la langue courante. */
  const libelleRole = (role) => t(`roles.${role}`);

  /* peut(action) — sans session, l'accès reste ouvert (mode mono-utilisateur sans comptes) */
  const peut = (action) => {
    const c = utilisateur();
    if (!c) return true;
    const droits = MATRICE[c.role] || [];
    return droits.includes('*') || droits.includes(action);
  };

  /* Édition d'un pointage : global, soi-même, ou refusé */
  const peutEditerPointage = (employeId) => {
    if (peut('pointage.editer')) return true;
    if (peut('pointage.editer.soimeme')) {
      const c = utilisateur();
      return !!c.employeId && c.employeId === employeId;
    }
    return false;
  };

  /* ================= Journal ================= */
  const journal = () => PP.store.get(CLE_JOURNAL, []);

  const journaliser = (type, compte, detail = '') => {
    const entrees = journal();
    entrees.unshift({ horodatage: new Date().toISOString(), type, compte, detail });
    PP.store.set(CLE_JOURNAL, entrees.slice(0, 200));
  };

  /* ================= Clôture de périodes ================= */
  const clotures = () => PP.store.get(CLE_CLOTURES, []);

  const cloturer = ({ label, debut, fin }) => {
    if (!debut || !fin || fin < debut) return { erreur: t('securite.errPlageDates') };
    const c = { id: PP.utils.uid(), label: (label || '').trim() || t('securite.periodeDefaut', { date: PP.dates.formatCourt(PP.dates.fromISO(debut)) }), debut, fin, clotureLe: new Date().toISOString() };
    PP.store.set(CLE_CLOTURES, [...clotures(), c]);
    journaliser('cloture', utilisateur()?.identifiant || '-', `${c.label} (${debut} → ${fin})`);
    return { cloture: c };
  };

  const decloturer = (id) => {
    PP.store.set(CLE_CLOTURES, clotures().filter((c) => c.id !== id));
    return { ok: true };
  };

  const periodeCloturee = (dateISO) => clotures().find((c) => c.debut <= dateISO && dateISO <= c.fin) || null;

  /* ================= Amorçage ================= */
  const init = async () => {
    /* Compte administrateur par défaut (admin / admin) si aucun compte */
    if (comptes().length === 0) {
      const sel = salt();
      PP.store.set(CLE_COMPTES, [{
        id: PP.utils.uid(),
        identifiant: 'admin',
        nom: 'Administrateur',
        role: 'administrateur',
        employeId: '',
        sel,
        empreinte: await hacher('admin', sel),
        actif: true,
        totpSecret: '',
        mdpParDefaut: true,
        creeLe: new Date().toISOString(),
      }]);
    }
    surveiller();
  };

  return {
    ROLES, LIBELLES_ROLES, libelleRole, MATRICE, cryptoDisponible,
    comptes, parIdentifiant, parEmploye, creerCompte, definirMotDePasse, majCompte, supprimerCompte,
    connecter, deconnecter, utilisateur, peut, peutEditerPointage,
    journal, genererSecretTotp, totp, totpValide,
    clotures, cloturer, decloturer, periodeCloturee,
    init,
  };
})();

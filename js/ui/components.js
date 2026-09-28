/* Composants d'interface réutilisables : toasts, modale, confirmation, avatar, badge */
window.PP = window.PP || {};

PP.ui = (() => {
  const { escapeHtml, initials } = PP.utils;

  const icon = (id, cls = 'h-5 w-5') => `<svg class="${cls}"><use href="#${id}"/></svg>`;

  /* ---------- Toasts ---------- */
  const STYLES_TOAST = {
    success: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200',
    error: 'border-red-400/20 bg-red-400/10 text-red-200',
    warning: 'border-amber-400/20 bg-amber-400/10 text-amber-200',
    info: 'border-white/10 bg-white/[0.06] text-white/80',
  };

  const toast = (message, type = 'info') => {
    let conteneur = document.getElementById('pp-toasts');
    if (!conteneur) {
      conteneur = document.createElement('div');
      conteneur.id = 'pp-toasts';
      conteneur.className = 'fixed bottom-6 right-6 z-[60] flex w-80 flex-col gap-2';
      document.body.appendChild(conteneur);
    }
    const el = document.createElement('div');
    el.className = `rounded-xl border px-4 py-3 text-sm shadow-lg backdrop-blur transition-all duration-300 ${STYLES_TOAST[type] || STYLES_TOAST.info}`;
    el.textContent = message;
    conteneur.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateY(6px)'; }, 3200);
    setTimeout(() => el.remove(), 3600);
  };

  /* ---------- Modale ---------- */
  let fermetureActive = null;

  const closeModal = () => { if (fermetureActive) fermetureActive(); };

  /* `body` et `footer` sont du HTML de confiance : échapper les données utilisateur côté appelant */
  const modal = ({ title, body, footer, size = 'max-w-xl', onClose, onOpen }) => {
    closeModal();
    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-8 backdrop-blur-sm';
    overlay.innerHTML = `
      <div class="mt-10 w-full ${size} overflow-hidden rounded-2xl border border-white/10 bg-[#0b0b0b] shadow-2xl">
        <div class="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <h3 class="text-base font-semibold">${title}</h3>
          <button data-close class="rounded-lg p-1.5 text-white/50 transition hover:bg-white/5 hover:text-white">${icon('i-x', 'h-4 w-4')}</button>
        </div>
        <div class="max-h-[70vh] overflow-y-auto px-6 py-5">${body}</div>
        ${footer ? `<div class="flex items-center justify-end gap-3 border-t border-white/10 bg-white/[0.02] px-6 py-4">${footer}</div>` : ''}
      </div>`;

    const fermer = () => {
      if (!overlay.isConnected) return;
      overlay.remove();
      document.removeEventListener('keydown', surTouche);
      fermetureActive = null;
      if (onClose) onClose();
    };
    const surTouche = (e) => { if (e.key === 'Escape') fermer(); };

    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) fermer(); });
    overlay.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', fermer));
    document.addEventListener('keydown', surTouche);
    document.body.appendChild(overlay);
    fermetureActive = fermer;
    fermer.overlay = overlay; /* permet à l'appelant de limiter ses requêtes à cette modale */
    /* Permet à l'appelant de retoucher un libellé figé (bouton « Annuler ») une
       fois le contenu inséré dans le DOM. */
    if (onOpen) onOpen(overlay);
    return fermer;
  };

  const confirmDialog = ({ title, message, confirmLabel, onConfirm, onClose }) => {
    /* Libellés traduits : « Annuler » et « Supprimer » suivent la langue courante */
    const libelleConfirmer = confirmLabel || tx('action.supprimer');
    const fermer = modal({
      title,
      size: 'max-w-md',
      body: `<p class="text-sm leading-relaxed text-white/60">${message}</p>`,
      footer: `
        <button data-close class="pp-btn-ghost">${tx('action.annuler')}</button>
        <button id="pp-confirm-ok" class="rounded-xl bg-red-500/90 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-500">${escapeHtml(libelleConfirmer)}</button>`,
      onClose,
    });
    fermer.overlay.querySelector('#pp-confirm-ok').addEventListener('click', () => {
      closeModal();
      if (onConfirm) onConfirm();
    });
  };

  /* ---------- Avatar (photo ou initiales) ---------- */
  const avatar = (personne, cls = 'h-9 w-9 text-[11px]') => {
    if (personne && personne.photo) {
      return `<img src="${personne.photo}" alt="" class="${cls} shrink-0 rounded-full border border-white/15 object-cover">`;
    }
    return `<span class="flex ${cls} shrink-0 items-center justify-center rounded-full border border-white/15 bg-gradient-to-br from-white/25 to-white/5 font-semibold text-white/85">${initials(personne?.prenom, personne?.nom)}</span>`;
  };

  /* ---------- Badge coloré ---------- */
  const badge = (texte, couleur = 'white') =>
    `<span class="rounded-md bg-${couleur}-400/10 px-2 py-0.5 text-[10px] font-semibold text-${couleur}-300">${escapeHtml(texte)}</span>`;

  /* ---------- Section à venir ---------- */
  const placeholder = ({ icone = 'i-info', titre, description, etape }) => `
    <section class="rounded-2xl border border-white/10 bg-white/[0.03] p-12 text-center">
      <span class="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white/70">${icon(icone, 'h-6 w-6')}</span>
      <h2 class="mt-5 text-xl font-semibold">${escapeHtml(titre)}</h2>
      <p class="mx-auto mt-2 max-w-md text-sm leading-relaxed text-white/45">${description}</p>
      <p class="mt-4 inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-white/40">${t('tableau.aVenir', { etape })}</p>
    </section>`;

  return { icon, toast, modal, closeModal, confirmDialog, avatar, badge, placeholder };
})();

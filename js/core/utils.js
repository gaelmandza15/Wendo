/* Utilitaires généraux — espace de noms global PP */
window.PP = window.PP || {};
PP.pages = PP.pages || {};

PP.utils = (() => {

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  /* Échappe le HTML — systématique sur toute donnée saisie par l'utilisateur */
  const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));

  const initials = (prenom = '', nom = '') =>
    ((prenom[0] || '') + (nom[0] || '')).toUpperCase() || '?';

  const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');

  const debounce = (fn, ms = 200) => {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  };

  const pad = (n) => String(n).padStart(2, '0');

  return { uid, escapeHtml, initials, capitalize, debounce, pad };
})();

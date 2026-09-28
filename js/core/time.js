/* Heures : saisie flexible, conversions, durées (sera étendu à l'étape « calcul des heures ») */
window.PP = window.PP || {};

PP.time = (() => {
  const { pad } = PP.utils;

  /* Saisie flexible : "08:00", "8h", "8h30", "8h5", "8", "8.30", "1:30 PM" → minutes, ou null */
  const parse = (str) => {
    if (str === null || str === undefined) return null;
    const s = String(str).trim().toLowerCase().replace(/\s/g, '');
    if (!s) return null;
    const suffixe = s.match(/(am|pm)$/)?.[1] || null;
    const corps = suffixe ? s.slice(0, -2) : s;
    if (!corps) return null;

    let h = null;
    let min = null;
    let m = corps.match(/^(\d{1,2})[:h.](\d{1,2})$/);
    if (m) { h = +m[1]; min = +m[2]; }
    else if ((m = corps.match(/^(\d{1,2})$/))) { h = +m[1]; min = 0; }
    else if ((m = corps.match(/^(\d{1,2})h(\d{1,2})?$/))) {
      h = +m[1];
      min = m[2] ? +m[2] : 0;
    } else {
      return null;
    }
    if (h < 0 || h > 23 || min < 0 || min > 59) return null;
    if (suffixe) {
      if (h < 1 || h > 12) return null;
      h = (h % 12) + (suffixe === 'pm' ? 12 : 0);
    }
    return h * 60 + min;
  };

  /* Minutes → "HH:MM" (replie sur 24 h) ou format 12 h configurable (Paramètres) */
  const toHHMM = (minutes) => {
    const m = ((minutes % 1440) + 1440) % 1440;
    const h = Math.floor(m / 60);
    const min = m % 60;
    if ((PP.settings?.get('formatHeure') || '24h') === '12h') {
      return `${h % 12 || 12}:${pad(min)} ${h < 12 ? 'AM' : 'PM'}`;
    }
    return `${pad(h)}:${pad(min)}`;
  };

  /* Minutes → "8h03" */
  const formatHM = (minutes) => `${Math.floor(minutes / 60)}h${pad(Math.round(minutes % 60))}`;

  /* Durée d'une paire [arrivée, départ] ; départ < arrivée ⇒ passage à minuit */
  const dureePaire = (arrivee, depart) => {
    if (arrivee === null || depart === null) return 0;
    return depart >= arrivee ? depart - arrivee : depart + 1440 - arrivee;
  };

  /* Total d'une journée à partir de paires de créneaux : [[a1, d1], [a2, d2], …] */
  const totalJour = (paires) => paires.reduce(
    (t, [a, d]) => (a !== null && d !== null ? t + dureePaire(a, d) : t),
    0,
  );

  return { parse, toHHMM, formatHM, dureePaire, totalJour };
})();

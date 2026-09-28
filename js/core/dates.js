/* Dates : semaines ISO, jours fériés (fixes + mobiles), formats.

   Les noms de jours, de mois et de jours fériés viennent du dictionnaire de
   langue : ils changent donc avec la langue choisie dans les Paramètres.
   Les fonctions qui les exposent lisent `PP.i18n` à chaque appel, jamais au
   chargement, pour que le changement de langue soit immédiat. */
window.PP = window.PP || {};

PP.dates = (() => {
  const { pad } = PP.utils;

  /* Table de traduction d'un nom de férié (clef = libellé français, qui sert
     d'identifiant stable dans les données enregistrées). */
  const traduireFerie = (nom) => {
    const table = PP.i18n ? PP.i18n.t('feries') : null;
    if (table && typeof table === 'object' && table[nom]) return table[nom];
    return nom;
  };

  /* Les listes sont relues à chaque appel : changer de langue se voit
     immédiatement, sans rechargement. */
  const nomsJours = () => {
    const l = PP.i18n ? PP.i18n.t('jours') : null;
    if (!l || typeof l !== 'object') return [];
    return [l.dimanche, l.lundi, l.mardi, l.mercredi, l.jeudi, l.vendredi, l.samedi];
  };
  const listeMois = () => {
    const m = PP.i18n ? PP.i18n.t('mois') : null;
    return (m && m.liste) || [];
  };
  const moisCourts = () => {
    const m = PP.i18n ? PP.i18n.t('mois') : null;
    return (m && m.courts) || [];
  };

  const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  const fromISO = (s) => {
    const [a, m, j] = String(s).split('-').map(Number);
    return new Date(a, m - 1, j);
  };

  /* Numéro de semaine ISO 8601 : { week, year } */
  const isoWeek = (date) => {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const jour = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - jour);
    const debutAnnee = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((d - debutAnnee) / 86400000 + 1) / 7);
    return { week, year: d.getUTCFullYear() };
  };

  /* Dimanche de Pâques — algorithme de Meeus/Jones/Butcher */
  const paques = (annee) => {
    const a = annee % 19;
    const b = Math.floor(annee / 100);
    const c = annee % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const moisIdx = Math.floor((h + l - 7 * m + 114) / 31);
    const jour = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(annee, moisIdx - 1, jour);
  };

  /* Jours fériés d'une année : { 'AAAA-MM-JJ': libellé }.
     Le jeu de fériés est français — c'est un choix de paramétrage, pas une
     traduction : le libellé est traduit, la date reste celle du calendrier
     français. Les jours fériés propres à l'entreprise s'ajoutent dans Calendrier. */
  const feries = (annee) => {
    const p = paques(annee);
    const decaler = (jours2) => { const d = new Date(p); d.setDate(d.getDate() + jours2); return d; };
    const liste = [
      ['1er janvier', new Date(annee, 0, 1)],
      ['Lundi de Pâques', decaler(1)],
      ['Fête du Travail', new Date(annee, 4, 1)],
      ['Victoire 1945', new Date(annee, 4, 8)],
      ['Ascension', decaler(39)],
      ['Lundi de Pentecôte', decaler(50)],
      ['Fête nationale', new Date(annee, 6, 14)],
      ['Assomption', new Date(annee, 7, 15)],
      ['Toussaint', new Date(annee, 10, 1)],
      ['Armistice 1918', new Date(annee, 10, 11)],
      ['Noël', new Date(annee, 11, 25)],
    ];
    const map = {};
    liste.forEach(([nom, d]) => { map[toISO(d)] = traduireFerie(nom); });
    return map;
  };

  const isFerie = (d) => feries(d.getFullYear())[toISO(d)] || null;

  const isWeekend = (d) => d.getDay() === 0 || d.getDay() === 6;

  /* Lundi de la semaine contenant `d` (repère de calcul des HS) */
  const lundiDe = (d) => {
    const x = new Date(d);
    const jour = x.getDay() || 7;
    x.setDate(x.getDate() - (jour - 1));
    x.setHours(0, 0, 0, 0);
    return x;
  };

  const formatLong = (d) => {
    const noms = nomsJours();
    const liste = listeMois();
    const jour = noms[d.getDay()] || '';
    const moisNom = liste[d.getMonth()] || '';
    /* En français le jour précède le mois ; en anglais aussi (« Monday 28
       September 2026 »), donc une seule forme suffit. */
    return `${jour} ${d.getDate()} ${moisNom} ${d.getFullYear()}`.trim();
  };

  /* Format court configurable (Paramètres → Formats) */
  const formatCourt = (d) => {
    const fmt = PP.settings?.get('formatDate') || 'JJ/MM/AAAA';
    const jj = pad(d.getDate());
    const mm = pad(d.getMonth() + 1);
    const aa = d.getFullYear();
    return fmt === 'MM/JJ/AAAA' ? `${mm}/${jj}/${aa}` : `${jj}/${mm}/${aa}`;
  };

  return {
    toISO, fromISO, isoWeek, paques, feries, isFerie, isWeekend, lundiDe,
    formatLong, formatCourt,
    /* Vues compatibles avec l'ancien code : elles recalculent à chaque accès */
    get JOURS() { return nomsJours(); },
    get MOIS() { return listeMois(); },
    get MOIS_COURTS() { return moisCourts(); },
  };
})();

/* Page Récapitulatif (section 6) — tableau global filtrable, tris, totaux, export CSV, impression */
window.PP = window.PP || {};
PP.pages = PP.pages || {};

PP.pages.recapitulatif = (() => {
  const { escapeHtml, capitalize } = PP.utils;
  const { icon, avatar, toast } = PP.ui;

  const etat = { periode: 'mois', offset: 0, employe: '', tri: { col: 'nom', dir: 1 } };
  let racine = null;

  /* ================= Bornes de la période affichée ================= */
  /* `offset` compte les périodes vers le passé (0 = période en cours),
     quel que soit le découpage : ◀ recule, ▶ avance. */
  const bornes = () => {
    const auj = new Date();
    if (etat.periode === 'semaine') {
      const lundi = PP.dates.fromISO(PP.pointages.lundiDe(PP.dates.toISO(auj)));
      lundi.setDate(lundi.getDate() - 7 * etat.offset);
      const dimanche = PP.dates.fromISO(PP.dates.toISO(lundi));
      dimanche.setDate(dimanche.getDate() + 6);
      return {
        debut: PP.dates.toISO(lundi), fin: PP.dates.toISO(dimanche),
        label: t('docs.semaineLabel', {
          n: PP.dates.isoWeek(lundi).week,
          debut: PP.dates.formatCourt(lundi),
          fin: PP.dates.formatCourt(dimanche),
        }),
        fichier: `S${PP.dates.isoWeek(lundi).week}`,
      };
    }
    if (etat.periode === 'mois') {
      const d = new Date(auj.getFullYear(), auj.getMonth() - etat.offset, 1);
      const debut = new Date(d.getFullYear(), d.getMonth(), 1);
      const fin = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      return {
        debut: PP.dates.toISO(debut), fin: PP.dates.toISO(fin),
        label: `${capitalize(PP.dates.MOIS[d.getMonth()])} ${d.getFullYear()}`,
        fichier: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      };
    }
    const annee = auj.getFullYear() - etat.offset;
    return { debut: `${annee}-01-01`, fin: `${annee}-12-31`, label: t('docs.anneeLabel', { annee }), fichier: `${annee}` };
  };

  const heureDec = (minutes) => (minutes / 60).toFixed(2).replace('.', ',');

  /* ================= Rendu ================= */
  const render = (root) => {
    racine = root;
    etat.offset = 0;
    etat.employe = '';

    root.innerHTML = `
      <div class="pp-no-print flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 class="text-4xl font-semibold tracking-tight">${t('pages.recapitulatif.titre')}</h1>
          <p id="rec-compte" class="mt-2 text-white/50"></p>
        </div>
        <div class="flex items-center gap-2.5">
          <div class="flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
            <button id="rec-avant" title="${t('docs.periodePrecedente')}" class="rounded-lg p-2 text-white/60 transition hover:bg-white/5 hover:text-white">${icon('i-arrow-r', 'h-4 w-4 rotate-180')}</button>
            <span id="rec-periode" class="min-w-[13rem] text-center text-xs font-medium text-white/80"></span>
            <button id="rec-apres" title="${t('docs.periodeSuivante')}" class="rounded-lg p-2 text-white/60 transition hover:bg-white/5 hover:text-white">${icon('i-arrow-r', 'h-4 w-4')}</button>
          </div>
          <button id="rec-aujourdhui" class="pp-btn-ghost px-3 py-2.5 text-xs">${t('docs.periodeCourante')}</button>
        </div>
      </div>

      <div class="pp-no-print mt-6 flex flex-wrap items-center gap-3">
        <div id="rec-segments" class="flex rounded-xl border border-white/10 bg-white/5 p-1 text-xs">
          <button data-periode="semaine">${t('docs.semaine')}</button>
          <button data-periode="mois">${t('docs.mois')}</button>
          <button data-periode="annee">${t('docs.annee')}</button>
        </div>
        <select id="rec-filtre-employe" class="pp-select w-56 text-xs"><option value="">${t('recapitulatif.tousEmployes')}</option></select>
        <div class="ml-auto flex items-center gap-2.5">
          ${PP.securite.peut('exporter') ? `
          <button id="rec-csv" class="pp-btn-ghost">${icon('i-download', 'h-4 w-4')} ${t('action.exporter')} (CSV)</button>
          <button id="rec-brouillon" class="pp-btn-ghost" title="${t('docs.wordDirectTitre')}">${icon('i-doc', 'h-4 w-4')} ${t('docs.wordDirect')}</button>
          <button id="rec-editer" class="pp-btn-primary">${icon('i-edit', 'h-4 w-4')} ${t('docs.apercuModifier')}</button>` : `<span class="text-[11px] text-white/35">${t('docs.exportReserve')}</span>`}
        </div>
      </div>

      <section class="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
        <div class="pp-no-print flex flex-wrap items-center justify-between gap-4">
          <h2 class="flex items-center gap-2.5 font-semibold">${icon('i-chart', 'h-5 w-5 text-white/85')} ${t('recapitulatif.tableauTitre')}</h2>
          <span id="rec-badge-periode" class="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/50"></span>
        </div>
        <div class="mt-5 overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-white/10 text-[11px] uppercase tracking-[0.12em] text-white/35">
                <th class="pb-3 pl-1 text-left font-medium"><button data-tri="nom" class="uppercase tracking-[0.12em] hover:text-white">${t('tableau.employe')}</button></th>
                <th class="pb-3 text-right font-medium"><button data-tri="abs" class="uppercase tracking-[0.12em] hover:text-white">${t('recapitulatif.colJoursAbsence')}</button></th>
                <th class="pb-3 text-right font-medium"><button data-tri="norm" class="uppercase tracking-[0.12em] hover:text-white">${t('recapitulatif.colHeuresNormales')}</button></th>
                <th class="pb-3 text-right font-medium"><button data-tri="hs" class="uppercase tracking-[0.12em] hover:text-white">${t('recapitulatif.colHeuresSup')}</button></th>
                <th class="pb-3 text-right font-medium"><button data-tri="total" class="uppercase tracking-[0.12em] hover:text-white">${t('recapitulatif.colHeuresTotal')}</button></th>
                <th class="pb-3 pr-1 text-right font-medium">${t('recapitulatif.colEtat')}</th>
              </tr>
            </thead>
            <tbody id="rec-corps" class="divide-y divide-white/5"></tbody>
            <tfoot id="rec-totaux"></tfoot>
          </table>
        </div>
        <p class="mt-4 text-[11px] leading-relaxed text-white/35">
          ${t('recapitulatif.noteCalcul', {
            seuil: PP.settings.get('seuilHebdo'),
            motifs: PP.motifs.list().filter((m) => m.compteHS).map((m) => `<span class="text-violet-300/70">${m.code}</span>`).join(', ') || t('recapitulatif.noteAucunMotif'),
          })}
        </p>
      </section>`;

    /* Filtre employé */
    const sel = racine.querySelector('#rec-filtre-employe');
    [...PP.employes.actifs()].sort((a, b) => a.nom.localeCompare(b.nom, 'fr')).forEach((e) => {
      const opt = document.createElement('option');
      opt.value = e.id;
      opt.textContent = `${e.prenom} ${e.nom}`;
      sel.appendChild(opt);
    });
    sel.addEventListener('change', (e) => { etat.employe = e.target.value; dessiner(); });

    racine.querySelector('#rec-segments').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-periode]');
      if (!btn) return;
      etat.periode = btn.dataset.periode;
      etat.offset = 0;
      dessiner();
    });
    /* ◀ recule dans le temps, ▶ avance sans dépasser la période en cours */
    racine.querySelector('#rec-avant').addEventListener('click', () => { etat.offset += 1; dessiner(); });
    racine.querySelector('#rec-apres').addEventListener('click', () => { etat.offset = Math.max(0, etat.offset - 1); dessiner(); });
    racine.querySelector('#rec-aujourdhui').addEventListener('click', () => { etat.offset = 0; dessiner(); });
    racine.querySelectorAll('[data-tri]').forEach((b) => b.addEventListener('click', () => {
      const col = b.dataset.tri;
      etat.tri = { col, dir: etat.tri.col === col ? -etat.tri.dir : 1 };
      dessiner();
    }));
    /* Ces boutons ne sont pas rendus pour les rôles sans droit d'export */
    racine.querySelector('#rec-csv')?.addEventListener('click', exporterCSV);
    racine.querySelector('#rec-editer')?.addEventListener('click', ouvrirEditeur);
    racine.querySelector('#rec-brouillon')?.addEventListener('click', exporterWordDirect);

    dessiner();
  };

  /* ================= Données ================= */
  const lignes = () => {
    const { debut, fin } = bornes();
    const employes = [...PP.employes.actifs()]
      .filter((e) => !etat.employe || e.id === etat.employe);
    return employes.map((e) => {
      const r = PP.calculs.resumePeriode(e.id, debut, fin);
      /* « Heures total » = heures réellement travaillées dans la période.
         « Heures normales » = ces heures hors HS : les HS suivent la semaine ISO
         (une semaine à cheval sur deux périodes les rattache à son lundi), donc
         `normales` du moteur peut inclure des heures hors période. */
      return {
        e,
        abs: r.joursAbsence,
        norm: Math.max(0, r.travaille - r.hs),
        hs: r.hs,
        total: r.travaille,
        depasse: r.hs > 0,
      };
    });
  };

  const dessiner = () => {
    const { debut, fin, label, fichier } = bornes();
    racine.dataset.fichier = fichier;

    racine.querySelector('#rec-periode').textContent = label;
    racine.querySelector('#rec-badge-periode').textContent = label;
    racine.querySelectorAll('#rec-segments [data-periode]').forEach((btn) => {
      const actif = btn.dataset.periode === etat.periode;
      btn.className = `rounded-lg px-3 py-1.5 transition ${actif ? 'bg-white font-medium text-black' : 'text-white/50 hover:text-white'}`;
    });

    const liste = lignes().sort((a, b) => {
      const { col, dir } = etat.tri;
      if (col === 'nom') return dir * a.e.nom.localeCompare(b.e.nom, 'fr');
      return dir * (a[col] - b[col]);
    });

    racine.querySelector('#rec-compte').textContent = t('recapitulatif.compte', {
      n: liste.length, s: liste.length > 1 ? 's' : '',
      debut: PP.dates.formatCourt(PP.dates.fromISO(debut)),
      fin: PP.dates.formatCourt(PP.dates.fromISO(fin)),
    });

    const corps = racine.querySelector('#rec-corps');
    if (liste.length === 0) {
      corps.innerHTML = `<tr><td colspan="6" class="py-8 text-center text-sm text-white/40">${t('recapitulatif.aucunEmployeActif')}</td></tr>`;
      racine.querySelector('#rec-totaux').innerHTML = '';
      return;
    }

    corps.innerHTML = liste.map((l) => `
      <tr class="transition-colors hover:bg-white/[0.02]">
        <td class="py-3.5 pl-1">
          <div class="flex items-center gap-3">
            ${avatar(l.e, 'h-8 w-8 text-[10px]')}
            <div><p class="text-sm font-medium text-white">${escapeHtml(l.e.prenom)} ${escapeHtml(l.e.nom)}</p><p class="text-[11px] text-white/35">${escapeHtml(l.e.poste || '')}</p></div>
          </div>
        </td>
        <td class="py-3.5 text-right tabular-nums text-white/70">${l.abs % 1 ? l.abs.toFixed(1).replace('.', ',') : l.abs} j</td>
        <td class="py-3.5 text-right tabular-nums text-white/85">${PP.time.formatHM(l.norm)}</td>
        <td class="py-3.5 text-right font-medium tabular-nums ${l.hs ? 'text-amber-300' : 'text-white/50'}">${PP.time.formatHM(l.hs)}</td>
        <td class="py-3.5 text-right font-semibold tabular-nums">${PP.time.formatHM(l.total)}</td>
        <td class="py-3.5 pr-1 text-right">
          ${l.depasse
            ? `<span class="inline-flex items-center gap-1.5 rounded-full bg-amber-400/10 px-2.5 py-1 text-[11px] font-medium text-amber-300"><span class="h-1.5 w-1.5 rounded-full bg-amber-400"></span>${t('statut.depasse')}</span>`
            : `<span class="inline-flex items-center gap-1.5 rounded-full bg-emerald-400/10 px-2.5 py-1 text-[11px] font-medium text-emerald-300"><span class="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>${t('statut.dansSeuil')}</span>`}
        </td>
      </tr>`).join('');

    const tAbs = liste.reduce((t, l) => t + l.abs, 0);
    const tNorm = liste.reduce((t, l) => t + l.norm, 0);
    const tHs = liste.reduce((t, l) => t + l.hs, 0);
    const tTotal = liste.reduce((t, l) => t + l.total, 0);
    racine.querySelector('#rec-totaux').innerHTML = `
      <tr class="border-t border-white/10 bg-white/[0.03] font-semibold">
        <td class="py-3.5 pl-1 text-sm text-white/90">${t('recapitulatif.totaux')} <span class="pp-no-print font-normal text-white/35">${t('recapitulatif.totauxDetail', { n: liste.length, s: liste.length > 1 ? 's' : '', s2: liste.length > 1 ? 's' : '', actifs: PP.employes.actifs().length })}</span></td>
        <td class="py-3.5 text-right tabular-nums text-white/80">${tAbs % 1 ? tAbs.toFixed(1).replace('.', ',') : tAbs} j</td>
        <td class="py-3.5 text-right tabular-nums text-white/90">${PP.time.formatHM(tNorm)}</td>
        <td class="py-3.5 text-right tabular-nums text-white/90">${PP.time.formatHM(tHs)}</td>
        <td class="py-3.5 text-right tabular-nums">${PP.time.formatHM(tTotal)}</td>
        <td class="py-3.5 pr-1 text-right text-white/30">—</td>
      </tr>`;
  };

  /* ================= Export CSV ================= */
  const exporterCSV = () => {
    const { label, fichier } = bornes();
    const liste = lignes().sort((a, b) => a.e.nom.localeCompare(b.e.nom, 'fr'));
    const sep = ';';
    const lignesCsv = [
      [t('recapitulatif.csvTitre'), label].join(sep),
      [t('recapitulatif.csvGenereLe'), PP.dates.formatCourt(new Date())].join(sep),
      '',
      [t('tableau.employe'), t('tableau.poste'), t('recapitulatif.colJoursAbsence'), t('recapitulatif.colHeuresNormales'), t('recapitulatif.colHeuresSup'), t('recapitulatif.colHeuresTotal'), t('recapitulatif.colEtat')].join(sep),
      ...liste.map((l) => [
        `${l.e.prenom} ${l.e.nom}`,
        l.e.poste || '',
        String(l.abs).replace('.', ','),
        heureDec(l.norm),
        heureDec(l.hs),
        heureDec(l.total),
        l.depasse ? t('statut.depasse') : t('statut.dansSeuil'),
      ].join(sep)),
      '',
      [t('recapitulatif.totaux').toUpperCase(), '', String(liste.reduce((t, l) => t + l.abs, 0)).replace('.', ','), heureDec(liste.reduce((t, l) => t + l.norm, 0)), heureDec(liste.reduce((t, l) => t + l.hs, 0)), heureDec(liste.reduce((t, l) => t + l.total, 0)), ''].join(sep),
    ];

    const blob = new Blob(['\ufeff' + lignesCsv.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const lien = document.createElement('a');
    lien.href = URL.createObjectURL(blob);
    lien.download = `recapitulatif-${fichier}.csv`;
    lien.click();
    URL.revokeObjectURL(lien.href);
    toast(t('docs.exportCsv'), 'success');
  };

  /* ================= Aperçu modifiable et export Word ================= */
  /* Le tableau est décrit en blocs, ce qui donne la même source à l'aperçu
     modifiable, au .docx et à l'impression PDF. */
  const blocsRecapitulatif = () => {
    const { label } = bornes();
    const liste = lignes().sort((a, b) => a.e.nom.localeCompare(b.e.nom, 'fr'));
    const tAbs = liste.reduce((t, l) => t + l.abs, 0);
    const tNorm = liste.reduce((t, l) => t + l.norm, 0);
    const tHs = liste.reduce((t, l) => t + l.hs, 0);
    const tTotal = liste.reduce((t, l) => t + l.total, 0);

    return [
      { t: 'titre', niveau: 1, texte: t('recapitulatif.documentTitre') },
      { t: 'texte', texte: t('recapitulatif.documentSousTitre', { label, n: liste.length, s: liste.length > 1 ? 's' : '' }), style: 'discret' },
      {
        t: 'tableau',
        largeurs: [3800, 1600, 1900, 1800, 1700, 1700],
        entetes: [
          { texte: t('tableau.employe'), align: 'left' },
          { texte: t('recapitulatif.colJoursAbsence'), align: 'right' },
          { texte: t('recapitulatif.colHeuresNormales'), align: 'right' },
          { texte: t('recapitulatif.colHeuresSup'), align: 'right' },
          { texte: t('recapitulatif.colHeuresTotal'), align: 'right' },
          { texte: t('recapitulatif.colEtat'), align: 'right' },
        ],
        lignes: liste.map((l) => ([
          { texte: `${l.e.prenom} ${l.e.nom}${l.e.poste ? ` — ${l.e.poste}` : ''}`, align: 'left' },
          { texte: `${l.abs % 1 ? l.abs.toFixed(1).replace('.', ',') : l.abs} j`, align: 'right' },
          { texte: PP.time.formatHM(l.norm), align: 'right' },
          { texte: PP.time.formatHM(l.hs), align: 'right' },
          { texte: PP.time.formatHM(l.total), align: 'right' },
          { texte: l.depasse ? t('statut.depasse') : t('statut.dansSeuil'), align: 'right' },
        ])),
        pied: [
          { texte: t('recapitulatif.totaux').toUpperCase(), align: 'left', gras: true },
          { texte: `${tAbs % 1 ? tAbs.toFixed(1).replace('.', ',') : tAbs} j`, align: 'right', gras: true },
          { texte: PP.time.formatHM(tNorm), align: 'right', gras: true },
          { texte: PP.time.formatHM(tHs), align: 'right', gras: true },
          { texte: PP.time.formatHM(tTotal), align: 'right', gras: true },
          { texte: '', align: 'right' },
        ],
      },
      {
        t: 'texte',
        style: 'discret',
        texte: t('recapitulatif.documentNote', { seuil: PP.settings.get('seuilHebdo') }),
      },
    ];
  };

  const nomFichierRecap = () => {
    const { fichier } = bornes();
    return `recapitulatif-${fichier}`;
  };

  const exporterWordDirect = async () => {
    try {
      const resultat = await PP.docx.telecharger(blocsRecapitulatif(), nomFichierRecap(), {
        titre: t('recapitulatif.documentTitre'),
        auteur: PP.settings.all().nomEtablissement || 'Wendo',
      });
      /* Un seul message, et seulement si l'enregistrement a réellement abouti */
      if (resultat && !resultat.navigateur) toast(t('donnees.enregistre', { chemin: resultat.chemin }), 'success');
      else if (resultat) toast(t('docs.wordTelechargeSimple'), 'success');
    } catch (e) {
      toast(e.message || t('docs.echecWord'), 'error');
    }
  };

  const ouvrirEditeur = () => {
    PP.editeurDocument.ouvrir({
      titre: t('recapitulatif.editeurTitre'),
      sousTitre: bornes().label,
      nomFichier: nomFichierRecap(),
      blocs: blocsRecapitulatif(),
    });
  };

  return { render };
})();

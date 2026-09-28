/* Page Rapports (sections 11 & 13) — générateur de documents imprimables + statistiques & analyses */
window.PP = window.PP || {};
PP.pages = PP.pages || {};

PP.pages.rapports = (() => {
  const { escapeHtml, capitalize } = PP.utils;
  const { icon, toast, badge } = PP.ui;

  /* Les codes sont des clefs de logique (jamais traduits) ; les libellés sont
     relus dans la langue courante, y compris pour les documents Word exportés. */
  const TYPES = [
    { code: 'mensuel',      clef: 'rapports.types.mensuel',      employe: true,  periode: 'mois' },
    { code: 'annuel',       clef: 'rapports.types.annuel',       employe: true,  periode: 'annee' },
    { code: 'releve',       clef: 'rapports.types.releve',       employe: true,  periode: 'mois' },
    { code: 'bulletin',     clef: 'rapports.types.bulletin',     employe: true,  periode: 'mois' },
    { code: 'attestation',  clef: 'rapports.types.attestation',  employe: true,  periode: null },
    { code: 'departements', clef: 'rapports.types.departements', employe: false, periode: 'mois' },
    { code: 'hs',           clef: 'rapports.types.hs',           employe: false, periode: 'mois' },
    { code: 'absences',     clef: 'rapports.types.absences',     employe: false, periode: 'mois' },
    { code: 'retards',      clef: 'rapports.types.retards',      employe: false, periode: 'mois' },
    { code: 'nuit',         clef: 'rapports.types.nuit',         employe: false, periode: 'mois' },
  ];

  /* Libellé traduit d'un type de rapport */
  const libelleType = (code) => {
    const type = TYPES.find((x) => x.code === code);
    return type ? tx(type.clef) : '';
  };

  const etat = { type: 'mensuel', offset: 0, employe: '', signataire: '', export: null };
  /* Dernier document généré, conservé tel quel pour l'aperçu modifiable : il est
     la source unique de l'affichage, du Word et de l'impression. */
  let documentCourant = null;
  let racine = null;

  /* ================= Bornes de période ================= */
  const bornes = () => {
    const type = TYPES.find((t) => t.code === etat.type);
    const auj = new Date();
    if (!type?.periode) return { debut: null, fin: null, label: '—' };
    if (type.periode === 'mois') {
      const d = new Date(auj.getFullYear(), auj.getMonth() - etat.offset, 1);
      const fin = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      return { debut: PP.dates.toISO(d), fin: PP.dates.toISO(fin), label: `${capitalize(PP.dates.MOIS[d.getMonth()])} ${d.getFullYear()}` };
    }
    const annee = auj.getFullYear() - etat.offset;
    return { debut: `${annee}-01-01`, fin: `${annee}-12-31`, label: tx('docs.anneeLabel', { annee }) };
  };

  /* ================= Aides de mise en forme ================= */
  const documentHtml = (titre, sousTitre, contenu) => `
    <article class="rounded-2xl border border-white/10 bg-white/[0.03] p-8">
      <header class="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 pb-4">
        <div>
          <h2 class="text-lg font-semibold">${titre}</h2>
          <p class="mt-1 text-xs text-white/45">${sousTitre}</p>
        </div>
        <div class="text-right text-[11px] text-white/35">
          <p class="text-white/60">${escapeHtml(PP.settings.all().nomEtablissement || 'Wendo')}</p>
          <p>${t('rapports.genere', { date: PP.dates.formatCourt(new Date()) })}</p>
        </div>
      </header>
      <div class="mt-5">${contenu}</div>
      <footer class="mt-6 border-t border-white/10 pt-4 text-[11px] text-white/40">
        ${etat.signataire
          ? t('rapports.signeLe', { nom: `<span class="text-white/70">${escapeHtml(etat.signataire)}</span>`, date: PP.dates.formatCourt(new Date()) })
          : t('rapports.signatureManuelle')}
      </footer>
    </article>`;

  const tableau = (entetes, lignes, pied = null) => `
    <div class="overflow-x-auto">
    <table class="w-full text-sm">
      <thead><tr class="border-b border-white/10 text-[11px] uppercase tracking-[0.12em] text-white/35">
        ${entetes.map((e, i) => `<th class="pb-2 ${i === 0 ? 'text-left' : 'text-right'} font-medium">${e}</th>`).join('')}
      </tr></thead>
      <tbody class="divide-y divide-white/5">${lignes.map((l) => `<tr class="hover:bg-white/[0.02]">${l.map((c, i) => `<td class="py-2 ${i === 0 ? 'text-left' : 'text-right'}">${c}</td>`).join('')}</tr>`).join('')}</tbody>
      ${pied ? `<tfoot><tr class="border-t border-white/10 font-semibold">${pied.map((c, i) => `<td class="py-2 ${i === 0 ? 'text-left' : 'text-right'}">${c}</td>`).join('')}</tr></tfoot>` : ''}
    </table></div>`;

  /* ================= Mise en forme d'un tableau de blocs ================= */
  /* Chaque rapport est décrit une seule fois, sous forme de blocs. Ces blocs
     alimentent à la fois l'aperçu HTML de la page et l'aperçu modifiable. */
  const TAB_GRAS = (texte, align = 'right') => ({ texte, gras: true, align });
  const TAB_TEXTE = (texte, align = 'right') => ({ texte, align });
  const TAB_GAUCHE = (texte) => ({ texte, align: 'left' });

  /* Transforme un tableau HTML déjà produit en description de blocs : c'est la
     source unique pour le Word et pour l'aperçu fidèle. */
  const blocsDepuisHtml = (conteneur) => {
    const blocs = [];
    const texte = (el) => el.innerText.replace(/\u00a0/g, ' ').replace(/\s+$/, '');
    const parcourir = (el) => {
      Array.from(el.children).forEach((enfant) => {
        const tag = enfant.tagName;
        if (tag === 'H1' || tag === 'H2' || tag === 'H3') {
          blocs.push({ t: 'titre', niveau: Number(tag[1]), texte: texte(enfant) });
        } else if (tag === 'TABLE') {
          const entetes = Array.from(enfant.querySelectorAll('thead th')).map((c) => TAB_GAUCHE(texte(c)));
          /* Les en-têtes sont alignés à droite quand la colonne l'est : on relit
             l'alignement de la première cellule du corps. */
          enfant.querySelectorAll('thead th').forEach((c, i) => {
            const ref = enfant.querySelector(`tbody tr td:nth-child(${i + 1})`);
            const align = ref ? (ref.className.includes('text-right') ? 'right' : ref.className.includes('text-center') ? 'center' : 'left') : 'left';
            entetes[i] = { texte: texte(c), gras: true, align };
          });
          const lignes = Array.from(enfant.querySelectorAll('tbody tr')).map((tr) =>
            Array.from(tr.children).map((c) => ({
              texte: texte(c),
              align: c.className.includes('text-right') ? 'right' : c.className.includes('text-center') ? 'center' : 'left',
            })));
          const pied = Array.from(enfant.querySelectorAll('tfoot td')).map((c) => ({
            texte: texte(c),
            gras: true,
            align: c.className.includes('text-right') ? 'right' : 'left',
          }));
          blocs.push({ t: 'tableau', entetes, lignes, pied });
        } else if (tag === 'P' || tag === 'DIV' || tag === 'SECTION') {
          if (enfant.querySelector('table')) parcourir(enfant);
          else if (texte(enfant).trim()) blocs.push({ t: 'texte', texte: texte(enfant).trim(), style: 'discret' });
        }
      });
    };
    parcourir(conteneur);
    return blocs;
  };

  /* ================= Génération des rapports ================= */
  const generer = () => {
    const { debut, fin, label } = bornes();
    const type = etat.type;
    const employe = PP.employes.get(etat.employe);
    const nomEmploye = employe ? `${escapeHtml(employe.prenom)} ${escapeHtml(employe.nom)}` : '—';
    etat.export = null;
    documentCourant = null;

    if (TYPES.find((t) => t.code === type)?.employe && !employe) {
      racine.querySelector('#rap-document').innerHTML = `
        <p class="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-white/40">${t('rapports.choisirEmployeDocument')}</p>`;
      return;
    }

    let contenu = '';

    /* ---------- Rapport mensuel / annuel par employé ---------- */
    if (type === 'mensuel' || type === 'annuel') {
      const resume = PP.calculs.resumePeriode(employe.id, debut, fin);
      if (type === 'mensuel') {
        /* Prévisionnel : planning type de l'employé s'il existe */
        const planning = PP.plannings.de(employe.id);
        const prevuJour = (iso) => (planning ? PP.plannings.heuresJour(planning, PP.dates.fromISO(iso).getDay()) : null);
        const lignes = resume.jours.map((j) => {
          const p = PP.pointages.get(employe.id, j.dateISO);
          const h = (k) => (p && p[k] !== null && p[k] !== undefined ? PP.time.toHHMM(p[k]) : '—');
          const cat = j.ferie ? escapeHtml(j.ferie) : j.estDimanche ? tx('rapports.dimanchePassage') : tx('rapports.ouvrePassage');
          const pv = prevuJour(j.dateISO);
          const ecart = pv !== null && j.total ? j.total - pv : null;
          const ecartTxt = ecart === null ? '—' : `${ecart >= 0 ? '+' : '−'}${PP.time.formatHM(Math.abs(ecart))}`;
          return [
            `${PP.dates.formatCourt(PP.dates.fromISO(j.dateISO))}`,
            capitalize(j.absence ? tx('rapports.absencePassage', { motif: j.absence }) : PP.dates.JOURS[PP.dates.fromISO(j.dateISO).getDay()]),
            `${h('t1')} → ${h('t2')}`,
            `${h('t3')} → ${h('t4')}`,
            j.total ? PP.time.formatHM(j.total) : '—',
            pv !== null ? PP.time.formatHM(pv) : '—',
            ecartTxt,
            cat,
          ];
        });
        contenu = tableau([tx('tableau.date'), tx('tableau.jour'), tx('rapports.colMatin'), tx('rapports.colApresMidi'), tx('tableau.total'), tx('rapports.colPrevu'), tx('rapports.colEcart'), tx('rapports.colType')], lignes);
        if (planning) {
          const totalPrevu = resume.jours.reduce((t, j) => t + (prevuJour(j.dateISO) || 0), 0);
          const ecartMois = resume.travaille - totalPrevu;
          contenu += `<p class="mt-3 text-[11px] text-white/40">${t('rapports.previsionnel', {
            prevu: PP.time.formatHM(totalPrevu),
            realise: PP.time.formatHM(resume.travaille),
            ecart: `${ecartMois >= 0 ? '+' : '−'}${PP.time.formatHM(Math.abs(ecartMois))}`,
          })}</p>`;
        }
      } else {
        const parMois = new Map();
        resume.jours.forEach((j) => {
          const cle = j.dateISO.slice(0, 7);
          const m = parMois.get(cle) || { travaille: 0, abs: 0, nuit: 0 };
          m.travaille += j.total; m.nuit += j.nuit;
          if (j.absence) m.abs += PP.absences.PERIODES.find((x) => x.code === PP.absences.pour(employe.id, j.dateISO)?.periode)?.poids ?? 1;
          parMois.set(cle, m);
        });
        const lignes = [...parMois.entries()].sort().map(([cle, m]) => [
          capitalize(PP.dates.MOIS[Number(cle.slice(5, 7)) - 1]) + ' ' + cle.slice(0, 4),
          PP.time.formatHM(m.travaille), PP.time.formatHM(m.nuit),
          `${m.abs % 1 ? m.abs.toFixed(1).replace('.', ',') : m.abs} j`,
        ]);
        contenu = tableau([tx('rapports.colMois'), tx('rapports.colHeuresTravaillees'), tx('rapports.colDontNuit'), tx('rapports.colJoursAbsence')], lignes);
      }
      const hs = resume.hs;
      contenu += `
        <div class="mt-5 grid grid-cols-4 gap-3">
          ${carteChiffre(tx('rapports.carteTravaille'), PP.time.formatHM(resume.travaille))}
          ${carteChiffre(tx('rapports.carteNormales'), PP.time.formatHM(resume.normales))}
          ${carteChiffre(tx('rapports.carteHS'), PP.time.formatHM(hs))}
          ${carteChiffre(tx('rapports.carteAbsences'), `${resume.joursAbsence % 1 ? resume.joursAbsence.toFixed(1).replace('.', ',') : resume.joursAbsence} j`)}
        </div>`;
      etat.export = { nom: `rapport-${type}-${employe.nom}-${label}`, entetes: [tx('rapports.exportPeriode'), tx('rapports.exportDonnees')], lignes: [[label, t('rapports.exportSynthese', { travaille: PP.time.formatHM(resume.travaille), hs: PP.time.formatHM(hs), jours: resume.joursAbsence })]] };
      publier(documentHtml(
        type === 'mensuel' ? t('rapports.documents.mensuel') : t('rapports.documents.annuel'),
        `${nomEmploye} — ${employe.poste || ''} · ${label}`,
        contenu,
      ), {
        titre: type === 'mensuel' ? t('rapports.documents.mensuel') : t('rapports.documents.annuel'),
        sousTitre: `${employe.prenom} ${employe.nom} · ${label}`,
        nomFichier: `rapport-${type}-${employe.nom}-${debut.slice(0, 7)}`,
        blocs: [
          { t: 'titre', niveau: 2, texte: t(type === 'mensuel' ? 'rapports.blocs.mensuel' : 'rapports.blocs.annuel', { nom: `${employe.prenom} ${employe.nom}` }) },
          { t: 'texte', texte: `${employe.poste || tx('docs.sansPoste')} · ${label}`, style: 'discret' },
          ...blocsDepuisHtml(blocHtml(contenu)),
        ],
      });
      return;
    }

    /* ---------- Relevé d'heures pour la paie ---------- */
    if (type === 'releve') {
      const resume = PP.calculs.resumePeriode(employe.id, debut, fin);
      const lignes = resume.jours.filter((j) => j.total || j.absence).map((j) => [
        PP.dates.formatCourt(PP.dates.fromISO(j.dateISO)),
        j.total ? PP.time.formatHM(j.arrondi) : '—',
        j.nuit ? PP.time.formatHM(j.nuit) : '—',
        j.dimanche ? PP.time.formatHM(j.dimanche) : '—',
        j.ferieHeures ? PP.time.formatHM(j.ferieHeures) : '—',
        j.absence ? escapeHtml(j.absence) : '',
      ]);
      contenu = tableau([tx('rapports.releveColDate'), tx('rapports.colArrondi'), tx('pointage.nuit'), tx('rapports.colDimanche'), tx('pointage.ferie'), tx('absences.motif')], lignes, [
        tx('recapitulatif.totaux'), PP.time.formatHM(resume.travaille), PP.time.formatHM(resume.nuit),
        PP.time.formatHM(resume.dimanche), PP.time.formatHM(resume.ferie),
        `${resume.joursAbsence} j`,
      ]);
      contenu += `<p class="mt-3 text-[11px] text-white/35">${t('rapports.releveHS', {
        hs: PP.time.formatHM(resume.hs),
        taux: employe.tauxHoraire !== null && employe.tauxHoraire !== undefined ? PP.settings.formaterMonetaire(employe.tauxHoraire) : tx('docs.nonRenseigne'),
      })}</p>`;
      publier(documentHtml(t('rapports.documents.releve'), `${nomEmploye} — ${label}`, contenu), {
        titre: t('rapports.documents.releve'),
        sousTitre: `${employe.prenom} ${employe.nom} · ${label}`,
        nomFichier: `releve-heures-${employe.nom}-${debut.slice(0, 7)}`,
        blocs: [
          { t: 'titre', niveau: 2, texte: t('rapports.blocs.releve', { nom: `${employe.prenom} ${employe.nom}` }) },
          { t: 'texte', texte: `${employe.poste || tx('docs.sansPoste')} · ${label}`, style: 'discret' },
          ...blocsDepuisHtml(blocHtml(contenu)),
        ],
      });
      return;
    }

    /* ---------- Aperçu de bulletin de paie ---------- */
    if (type === 'bulletin') {
      const resume = PP.calculs.resumePeriode(employe.id, debut, fin);
      const taux = Number(employe.tauxHoraire || 0);
      const majHS = 1 + PP.settings.get('majorationHS') / 100;
      const base = resume.normales / 60 * taux;
      const montantHS = resume.hs / 60 * taux * majHS;
      const majorations = (resume.nuit / 60 * taux * PP.settings.get('majorationNuit') / 100)
        + (resume.dimanche / 60 * taux * PP.settings.get('majorationDimanche') / 100)
        + (resume.ferie / 60 * taux * PP.settings.get('majorationFerie') / 100);
      const brut = base + montantHS + majorations;
      contenu = `
        <div class="grid grid-cols-2 gap-5">
          <div class="space-y-2 text-sm">
            <p class="text-white/50">${t('rapports.bulletinEmploye')}</p><p class="font-medium">${nomEmploye} — ${escapeHtml(employe.matricule || tx('docs.sansMatricule'))}</p>
            <p class="text-white/50">${t('rapports.bulletinPeriode')}</p><p class="font-medium">${label}</p>
            <p class="text-white/50">${t('rapports.bulletinTaux')}</p><p class="font-medium">${PP.settings.formaterMonetaire(taux)}</p>
          </div>
          ${tableau([tx('rapports.colElement'), tx('rapports.colBase'), tx('rapports.colMontantEstime')], [
            [t('rapports.bulletinSalaireBase'), `${PP.time.formatHM(resume.normales)}`, PP.settings.formaterMonetaire(base)],
            [t('rapports.bulletinHS', { taux: PP.settings.get('majorationHS') }), PP.time.formatHM(resume.hs), PP.settings.formaterMonetaire(montantHS)],
            [t('rapports.bulletinMajorations'), `—`, PP.settings.formaterMonetaire(majorations)],
          ], [t('rapports.bulletinBrut'), '', PP.settings.formaterMonetaire(brut)])}
        </div>
        <p class="mt-4 rounded-xl border border-amber-400/15 bg-amber-400/[0.06] px-4 py-2.5 text-[11px] text-amber-200/80">
          ${t('rapports.bulletinAvertissement')}
        </p>`;
      publier(documentHtml(t('rapports.documents.bulletin'), `${nomEmploye} — ${label}`, contenu), {
        titre: t('rapports.documents.bulletin'),
        sousTitre: `${employe.prenom} ${employe.nom} · ${label}`,
        nomFichier: `bulletin-${employe.nom}-${debut.slice(0, 7)}`,
        blocs: [
          { t: 'titre', niveau: 2, texte: t('rapports.blocs.bulletin', { nom: `${employe.prenom} ${employe.nom}` }) },
          { t: 'texte', texte: `${employe.matricule || tx('docs.sansMatricule')} · ${label}`, style: 'discret' },
          ...blocsDepuisHtml(blocHtml(contenu)),
        ],
      });
      return;
    }

    /* ---------- Attestation de travail ---------- */
    if (type === 'attestation') {
      contenu = `
        <div class="space-y-4 text-sm leading-relaxed text-white/75">
          <p>${t('rapports.attestationSoussigne', { nom: `<span class="font-medium text-white">${escapeHtml(etat.signataire || '________________')}</span>` })}
          ${PP.settings.all().nomEtablissement ? t('rapports.attestationExploitant', { etablissement: `<span class="font-medium text-white">${escapeHtml(PP.settings.all().nomEtablissement)}</span>` }) : ''}</p>
          <p>${t('rapports.attestationCorps', {
            employe: `<span class="font-medium text-white">${nomEmploye}</span>`,
            depuis: employe.dateEmbauche
              ? t('rapports.attestationDepuis', { date: `<span class="font-medium text-white">${PP.dates.formatCourt(PP.dates.fromISO(employe.dateEmbauche))}</span>` })
              : t('rapports.attestationSansDate'),
            poste: `<span class="font-medium text-white">${escapeHtml(employe.poste || '…')}</span>`,
            departement: employe.departement ? tx('rapports.attestationDepartement', { departement: escapeHtml(employe.departement) }) : '',
            contrat: `<span class="font-medium text-white">${escapeHtml(employe.contrat)}</span>`,
            heures: `<span class="font-medium text-white">${employe.heuresHebdo}</span>`,
          })}</p>
          <p>${t('rapports.attestationDelivree')}</p>
        </div>`;
      publier(documentHtml(t('rapports.documents.attestation'), t('rapports.attestationDelivreeLe', { date: PP.dates.formatCourt(new Date()) }), contenu), {
        titre: t('rapports.documents.attestation'),
        sousTitre: t('rapports.attestationDelivreeLe', { date: PP.dates.formatCourt(new Date()) }),
        nomFichier: `attestation-travail-${employe.nom}`,
        blocs: [
          { t: 'titre', niveau: 1, texte: t('rapports.documents.attestation') },
          { t: 'texte', texte: t('rapports.attestationDelivreeLe', { date: PP.dates.formatCourt(new Date()) }), style: 'discret' },
          ...blocsDepuisHtml(blocHtml(contenu)),
        ],
      });
      return;
    }

    /* ---------- Rapports tabulaires (tous employés) ---------- */
    const actifs = [...PP.employes.actifs()].sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));

    if (type === 'departements') {
      const groupes = new Map();
      actifs.forEach((e) => {
        const cle = e.departement || tx('docs.sansService');
        const r = PP.calculs.resumePeriode(e.id, debut, fin);
        const g = groupes.get(cle) || { effectif: 0, travaille: 0, hs: 0, abs: 0 };
        g.effectif += 1; g.travaille += r.travaille; g.hs += r.hs; g.abs += r.joursAbsence;
        groupes.set(cle, g);
      });
      /* Le nom du département peut être long : on le laisse passer à la ligne
         pour que le tableau tienne sur une page imprimée */
      const lignes = [...groupes.entries()].sort().map(([dept, g]) => [
        `<span class="whitespace-normal">${escapeHtml(dept)}</span>`, g.effectif, PP.time.formatHM(g.travaille),
        PP.time.formatHM(g.hs), `${g.abs % 1 ? g.abs.toFixed(1).replace('.', ',') : g.abs} j`,
        PP.time.formatHM(Math.round(g.travaille / Math.max(1, g.effectif))),
      ]);
      contenu = tableau([tx('rapports.colDepartement'), tx('rapports.colEffectif'), tx('tableau.total'), tx('rapports.colDontHS'), tx('rapports.types.absences'), tx('rapports.colMoyEmploye')], lignes);
      etat.export = { nom: `rapport-departements-${label}`, entetes: [tx('rapports.colDepartement'), tx('rapports.colEffectif'), tx('tableau.total'), 'HS', tx('rapports.types.absences')], lignes: [...groupes.entries()].map(([d, g]) => [d, g.effectif, PP.time.formatHM(g.travaille), PP.time.formatHM(g.hs), `${g.abs} j`]) };
    }

    if (type === 'hs') {
      const anneeContingent = Number(debut.slice(0, 4));
      const donnees = actifs.map((e) => {
        const r = PP.calculs.resumePeriode(e.id, debut, fin);
        const c = PP.calculs.contingentAnnuel(e.id, anneeContingent);
        return {
          employe: `${e.prenom} ${e.nom}`,
          normales: PP.time.formatHM(r.normales),
          hs: PP.time.formatHM(r.hs),
          cout: PP.settings.formaterMonetaire(r.hs / 60 * Number(e.tauxHoraire || 0) * (1 + PP.settings.get('majorationHS') / 100)),
          contingent: `${Math.round(c.hs / 60)} / ${PP.settings.get('contingentAnnuelHS')} h`,
        };
      });
      contenu = tableau([tx('tableau.employe'), tx('rapports.colHeuresNormales'), tx('rapports.colHeuresSup'), tx('rapports.colCoutHS'), tx('rapports.colContingentAnnuel', { annee: anneeContingent })],
        donnees.map((d) => [escapeHtml(d.employe), d.normales, d.hs, d.cout, d.contingent]));
      etat.export = {
        nom: `rapport-hs-${label}`,
        entetes: [tx('tableau.employe'), tx('rapports.colHeuresNormales'), tx('rapports.colHeuresSup'), tx('rapports.colCoutHS'), tx('rapports.colContingentUtilise')],
        lignes: donnees.map((d) => [d.employe, d.normales, d.hs, d.cout, d.contingent]),
      };
    }

    if (type === 'absences') {
      const liste = PP.absences.list()
        .filter((a) => a.statut !== 'refusee' && a.dateDebut <= fin && a.dateFin >= debut)
        .sort((a, b) => b.dateDebut.localeCompare(a.dateDebut));
      const donnees = liste.map((a) => {
        const e = PP.employes.get(a.employeId);
        const jours = nbJoursAbsence(a);
        return {
          employe: e ? `${e.prenom} ${e.nom}` : '—',
          motif: PP.motifs.libelle(a.motif),
          couleur: PP.motifs.byCode(a.motif)?.couleur || 'white',
          periode: `${PP.dates.formatCourt(PP.dates.fromISO(a.dateDebut))} → ${PP.dates.formatCourt(PP.dates.fromISO(a.dateFin))}`,
          duree: t('absences.joursOuvres', { n: jours, s: jours > 1 ? 's' : '' }),
          statut: a.statut === 'approuvee' ? tx('statut.approuvee') : a.statut === 'refusee' ? tx('statut.refusee') : tx('statut.enAttente'),
        };
      });
      contenu = donnees.length ? tableau([tx('tableau.employe'), tx('rapports.colMotif'), tx('rapports.colPeriode'), tx('rapports.colDuree'), tx('tableau.statut')],
        donnees.map((d) => [escapeHtml(d.employe), badge(d.motif, d.couleur), d.periode, d.duree, d.statut]))
        : `<p class="py-6 text-center text-sm text-white/40">${t('rapports.aucuneAbsencePeriode')}</p>`;
      etat.export = {
        nom: `rapport-absences-${label}`,
        entetes: [tx('tableau.employe'), tx('rapports.colMotif'), tx('rapports.colPeriode'), tx('rapports.colDuree'), tx('tableau.statut')],
        lignes: donnees.map((d) => [d.employe, d.motif, d.periode, d.duree, d.statut]),
      };
    }

    if (type === 'retards') {
      const ref = PP.settings.get('heureReference');
      const lignes = [];
      const donnees = [];
      actifs.forEach((e) => {
        Object.entries(PP.pointages.list()).forEach(([cle, p]) => {
          const [empId, dateISO] = cle.split('|');
          if (empId !== e.id || dateISO < debut || dateISO > fin || p.t1 === null || p.t1 <= ref) return;
          const jour = capitalize(PP.dates.JOURS[PP.dates.fromISO(dateISO).getDay()]);
          const retard = `+${PP.time.formatHM(p.t1 - ref)}`;
          lignes.push([nomDe(e), PP.dates.formatCourt(PP.dates.fromISO(dateISO)), PP.time.toHHMM(p.t1), retard, jour]);
          donnees.push({ employe: `${e.prenom} ${e.nom}`, date: PP.dates.formatCourt(PP.dates.fromISO(dateISO)), arrivee: PP.time.toHHMM(p.t1), retard, jour, tri: p.t1 });
        });
      });
      donnees.sort((a, b) => b.tri - a.tri);
      contenu = donnees.length
        ? tableau([tx('tableau.employe'), tx('tableau.date'), tx('rapports.colArrivee'), tx('rapports.colEcart'), tx('tableau.jour')],
          donnees.map((d) => [escapeHtml(d.employe), d.date, d.arrivee, d.retard, d.jour]))
        : `<p class="py-6 text-center text-sm text-white/40">${t('rapports.aucunRetard', { heure: PP.time.toHHMM(ref) })}</p>`;
      etat.export = {
        nom: `rapport-retards-${label}`,
        entetes: [tx('tableau.employe'), tx('tableau.date'), tx('rapports.colArrivee'), tx('rapports.colEcart'), tx('tableau.jour')],
        lignes: donnees.map((d) => [d.employe, d.date, d.arrivee, d.retard, d.jour]),
      };
    }

    if (type === 'nuit') {
      const donnees = actifs.map((e) => {
        const r = PP.calculs.resumePeriode(e.id, debut, fin);
        return {
          employe: `${e.prenom} ${e.nom}`,
          nuit: PP.time.formatHM(r.nuit),
          dimanche: PP.time.formatHM(r.dimanche),
          ferie: PP.time.formatHM(r.ferie),
          total: PP.time.formatHM(r.travaille),
        };
      });
      contenu = tableau([tx('tableau.employe'), tx('rapports.colNuitPlage'), tx('rapports.colHeuresDimanche'), tx('rapports.colHeuresFeriees'), tx('rapports.colTotalTravaille')],
        donnees.map((d) => [escapeHtml(d.employe), d.nuit, d.dimanche, d.ferie, d.total]));
      etat.export = {
        nom: `rapport-nuit-${label}`,
        entetes: [tx('tableau.employe'), tx('rapports.colNuitCourt'), tx('pointage.dimanche'), tx('pointage.ferie'), tx('rapports.colTotalTravaille')],
        lignes: donnees.map((d) => [d.employe, d.nuit, d.dimanche, d.ferie, d.total]),
      };
    }

    const libelle = libelleType(type);
    publier(documentHtml(libelle, label, contenu), {
      titre: libelle,
      sousTitre: label,
      nomFichier: `rapport-${type}-${debut.slice(0, 7)}`,
      blocs: [
        { t: 'titre', niveau: 2, texte: libelle },
        { t: 'texte', texte: label, style: 'discret' },
        ...blocsDepuisHtml(blocHtml(contenu)),
      ],
    });
  };

  /* Un conteneur détaché sert à analyser le HTML déjà produit par `tableau()` :
     c'est la même donnée que celle affichée, donc le Word ne peut pas diverger. */
  const blocHtml = (html) => {
    const d = document.createElement('div');
    d.innerHTML = html;
    return d;
  };

  /* Affiche le document dans la page et retient sa version « blocs » pour
     l'aperçu modifiable. */
  const publier = (html, meta) => {
    racine.querySelector('#rap-document').innerHTML = html;
    documentCourant = meta;
  };

  const nomDe = (e) => `${escapeHtml(e.prenom)} ${escapeHtml(e.nom)}`;

  /* Jours ouvrés couverts par une absence (même convention que la page Absences) */
  const nbJoursAbsence = (a) => {
    const d = PP.dates.fromISO(a.dateDebut);
    const fin = PP.dates.fromISO(a.dateFin);
    let n = 0;
    let garde = 0;
    while (d <= fin && garde < 400) {
      if (PP.absences.estOuvre(PP.dates.toISO(d))) n += 1;
      d.setDate(d.getDate() + 1);
      garde += 1;
    }
    return n;
  };
  const carteChiffre = (titre, valeur) => `
    <div class="rounded-xl border border-white/5 bg-white/[0.04] px-3 py-2.5 text-center">
      <p class="text-sm font-semibold tabular-nums">${valeur}</p>
      <p class="mt-0.5 text-[10px] uppercase tracking-wider text-white/35">${titre}</p>
    </div>`;

  /* ================= Statistiques & analyses (section 13) ================= */
  const dessinerStats = () => {
    const auj = new Date();
    const debutMois = `${auj.getFullYear()}-${String(auj.getMonth() + 1).padStart(2, '0')}-01`;
    const aujISO = PP.dates.toISO(auj);
    const actifs = PP.employes.actifs();
    const joursOuvresMois = (() => {
      let n = 0;
      const d = PP.dates.fromISO(debutMois);
      const feries = PP.calculs.feriesAnnee(auj.getFullYear());
      while (PP.dates.toISO(d) <= aujISO) {
        if (!PP.dates.isWeekend(d) && !feries[PP.dates.toISO(d)]) n += 1;
        d.setDate(d.getDate() + 1);
      }
      return n;
    })();
    const attendu = joursOuvresMois * Math.max(1, actifs.length);

    const resumes = actifs.map((e) => ({ e, r: PP.calculs.resumePeriode(e.id, debutMois, aujISO) }));
    const totalAbs = resumes.reduce((t, x) => t + x.r.joursAbsence, 0);
    const totalHS = resumes.reduce((t, x) => t + x.r.hs, 0);
    const totalNuit = resumes.reduce((t, x) => t + x.r.nuit, 0);
    const totalDimanche = resumes.reduce((t, x) => t + x.r.dimanche, 0);
    const coutHS = resumes.reduce((t, x) => t + x.r.hs / 60 * Number(x.e.tauxHoraire || 0) * (1 + PP.settings.get('majorationHS') / 100), 0);
    const tauxAbsenteisme = attendu ? Math.min(100, (totalAbs / attendu) * 100) : 0;

    /* Prévision du contingent : HS à ce jour + moyenne hebdo (4 dernières semaines) × semaines restantes */
    const lundiCourant = PP.pointages.lundiDe(aujISO);
    let hsRecentes = 0;
    for (let w = 1; w <= 4; w += 1) {
      const lundi = PP.dates.fromISO(lundiCourant);
      lundi.setDate(lundi.getDate() - 7 * w);
      actifs.forEach((e) => { hsRecentes += PP.calculs.detailSemaine(e.id, PP.dates.toISO(lundi)).hs; });
    }
    const semaineDeLAnnee = PP.dates.isoWeek(auj).week;
    const semainesRestantes = 52 - semaineDeLAnnee;
    const hsAnnuel = actifs.reduce((t, e) => t + PP.calculs.contingentAnnuel(e.id, auj.getFullYear()).hs, 0);
    const prevision = hsAnnuel + (hsRecentes / 4) * semainesRestantes;
    const contingent = actifs.length * PP.settings.get('contingentAnnuelHS') * 60;

    /* Anomalies */
    const anomalies = [];
    resumes.forEach(({ e, r }) => {
      if (r.joursAbsence / Math.max(1, joursOuvresMois) > 0.25 && r.joursAbsence >= 2) {
        anomalies.push(t('rapports.anomalieAbsenteisme', { nom: `${e.prenom} ${e.nom}`, jours: r.joursAbsence % 1 ? r.joursAbsence.toFixed(1) : r.joursAbsence }));
      }
    });
    const scanFutur = () => {
      const d = PP.dates.fromISO(aujISO);
      d.setDate(d.getDate() - 30);
      return d;
    };
    actifs.forEach((e) => {
      let longues = 0, dimanches = 0;
      /* Le curseur repart de J-30 pour chaque employé (sinon les suivants
         seraient balayés sur les 31 jours à venir) */
      const scan = scanFutur();
      for (let garde = 0; garde < 31; garde += 1) {
        const p = PP.pointages.get(e.id, PP.dates.toISO(scan));
        if (p) {
          if (PP.pointages.heuresJour(p) > 720) longues += 1;
          if (scan.getDay() === 0 && PP.pointages.heuresJour(p) > 0) dimanches += 1;
        }
        scan.setDate(scan.getDate() + 1);
      }
      if (longues >= 3) anomalies.push(t('rapports.anomalieJourneesLongues', { nom: `${e.prenom} ${e.nom}`, n: longues }));
      if (dimanches >= 2) anomalies.push(t('rapports.anomalieDimanches', { nom: `${e.prenom} ${e.nom}`, n: dimanches }));
    });

    /* Benchmark départements */
    const depts = new Map();
    actifs.forEach((e) => {
      const cle = e.departement || tx('docs.sansService');
      const r = PP.calculs.resumePeriode(e.id, debutMois, aujISO);
      const g = depts.get(cle) || { effectif: 0, travaille: 0, hs: 0, abs: 0 };
      g.effectif += 1; g.travaille += r.travaille; g.hs += r.hs; g.abs += r.joursAbsence;
      depts.set(cle, g);
    });

    const racineStats = racine.querySelector('#rap-stats');
    racineStats.innerHTML = `
      <div class="grid grid-cols-4 gap-5">
        ${carteStats(t('rapports.statsAbsenteisme'), `${tauxAbsenteisme.toFixed(1).replace('.', ',')} %`, t('rapports.statsAbsenteismeSous', { jours: `${totalAbs % 1 ? totalAbs.toFixed(1).replace('.', ',') : totalAbs} j`, attendu: `${attendu} j` }))}
        ${carteStats(t('rapports.statsCoutHS'), PP.settings.formaterMonetaire(coutHS), t('rapports.statsCoutHSSous', { hs: `${PP.time.formatHM(totalHS)}` }))}
        ${carteStats(t('rapports.statsHeuresNuit'), PP.time.formatHM(totalNuit), t('rapports.statsHeuresNuitSous', { dimanche: PP.time.formatHM(totalDimanche) }))}
        ${carteStats(t('rapports.statsPrevisionContingent'), `${Math.round(prevision / 60)} h`, t('rapports.statsPrevisionSous', { contingent: Math.round(contingent / 60), n: actifs.length }))}
      </div>

      <div class="mt-5 grid grid-cols-2 gap-5">
        <section class="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <h3 class="text-sm font-semibold">${t('rapports.statsAbsenteismeParEmploye')}</h3>
          ${actifs.length ? tableau([tx('tableau.employe'), tx('rapports.statsColJoursAbsence'), tx('rapports.statsColTaux')], resumes
            .map(({ e, r }) => [nomDe(e), `${r.joursAbsence % 1 ? r.joursAbsence.toFixed(1).replace('.', ',') : r.joursAbsence} j`,
              `${joursOuvresMois ? Math.min(100, r.joursAbsence / joursOuvresMois * 100).toFixed(0) : 0} %`])) : `<p class="mt-3 text-xs text-white/40">${t('rapports.statsAucunEmployeActif')}</p>`}
        </section>

        <section class="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <h3 class="text-sm font-semibold">${t('rapports.statsBenchmark')}</h3>
          ${tableau([tx('rapports.statsColDep'), tx('rapports.colEffectif'), tx('rapports.colMoyEmploye'), 'HS', tx('rapports.statsColAbs')], [...depts.entries()].sort().map(([d, g]) => [
            escapeHtml(d), g.effectif,
            PP.time.formatHM(Math.round(g.travaille / Math.max(1, g.effectif))),
            PP.time.formatHM(g.hs), `${g.abs % 1 ? g.abs.toFixed(1).replace('.', ',') : g.abs} j`,
          ]))}
        </section>
      </div>

      <section class="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <h3 class="text-sm font-semibold">${t('rapports.statsAnomalies')}</h3>
        ${anomalies.length
          ? `<ul class="mt-3 space-y-1.5">${anomalies.map((a) => `<li class="flex items-center gap-2 text-xs text-amber-200/85">${icon('i-alert', 'h-3.5 w-3.5 text-amber-300/80')} ${escapeHtml(a)}</li>`).join('')}</ul>`
          : `<p class="mt-3 text-xs text-white/40">${t('rapports.statsAucunSchema')}</p>`}
      </section>`;
  };

  const carteStats = (titre, valeur, sous) => `
    <div class="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <p class="text-sm text-white/60">${titre}</p>
      <p class="mt-3 text-3xl font-semibold tracking-tight">${valeur}</p>
      <p class="mt-1 text-xs text-white/40">${sous}</p>
    </div>`;

  /* ================= Rendu ================= */
  const render = (root) => {
    racine = root;

    root.innerHTML = `
      <div class="pp-no-print flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 class="text-4xl font-semibold tracking-tight">${t('pages.rapports.titre')}</h1>
          <p class="mt-2 text-white/50">${t('pages.rapports.sousTitre')}</p>
        </div>
        <div class="flex items-center gap-2.5">
          <button id="rap-csv" class="pp-btn-ghost">${icon('i-download', 'h-4 w-4')} ${t('action.exporter')} (CSV)</button>
          <button id="rap-brouillon" class="pp-btn-ghost" title="${t('docs.wordDirectTitre')}">${icon('i-doc', 'h-4 w-4')} ${t('docs.wordDirect')}</button>
          <button id="rap-editer" class="pp-btn-primary">${icon('i-edit', 'h-4 w-4')} ${t('docs.apercuModifier')}</button>
        </div>
      </div>

      <div class="pp-no-print mt-6 flex flex-wrap items-center gap-3">
        <select id="rap-type" class="pp-select w-72 text-xs">
          ${TYPES.map((x) => `<option value="${x.code}" ${x.code === etat.type ? 'selected' : ''}>${tx(x.clef)}</option>`).join('')}
        </select>
        <select id="rap-employe" class="pp-select w-56 text-xs"><option value="">${t('rapports.choisirEmployePlaceholder')}</option></select>
        <div id="rap-nav-periode" class="flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
          <button id="rap-avant" title="${t('docs.periodePrecedente')}" class="rounded-lg p-2 text-white/60 transition hover:bg-white/5 hover:text-white">${icon('i-arrow-r', 'h-4 w-4 rotate-180')}</button>
          <span id="rap-periode" class="min-w-[10rem] text-center text-xs font-medium text-white/80"></span>
          <button id="rap-apres" title="${t('docs.periodeSuivante')}" class="rounded-lg p-2 text-white/60 transition hover:bg-white/5 hover:text-white">${icon('i-arrow-r', 'h-4 w-4')}</button>
        </div>
        <input id="rap-signataire" placeholder="${t('rapports.signatairePlaceholder')}" class="pp-input w-72 text-xs">
      </div>

      <div id="rap-document" class="mt-5"></div>

      <h2 class="mt-8 flex items-center gap-2.5 text-xl font-semibold tracking-tight">${icon('i-chart', 'h-5 w-5 text-white/85')} ${t('rapports.statsTitre')}</h2>
      <div id="rap-stats" class="mt-5"></div>`;

    /* Contrôles */
    const selEmploye = racine.querySelector('#rap-employe');
    [...PP.employes.actifs()].sort((a, b) => a.nom.localeCompare(b.nom, 'fr')).forEach((e) => {
      const opt = document.createElement('option');
      opt.value = e.id;
      opt.textContent = `${e.prenom} ${e.nom}`;
      selEmploye.appendChild(opt);
    });

    racine.querySelector('#rap-type').addEventListener('change', (e) => {
      etat.type = e.target.value;
      etat.offset = 0;
      dessinerControles();
      generer();
    });
    selEmploye.addEventListener('change', (e) => { etat.employe = e.target.value; generer(); });
    /* L'offset compte les périodes vers le passé : ◀ recule, ▶ avance sans
       jamais dépasser la période courante (un rapport futur est vide) */
    racine.querySelector('#rap-avant').addEventListener('click', () => { etat.offset += 1; dessinerControles(); generer(); });
    racine.querySelector('#rap-apres').addEventListener('click', () => { etat.offset = Math.max(0, etat.offset - 1); dessinerControles(); generer(); });
    racine.querySelector('#rap-signataire').addEventListener('input', (e) => { etat.signataire = e.target.value; generer(); });
    racine.querySelector('#rap-editer').addEventListener('click', ouvrirEditeur);
    racine.querySelector('#rap-brouillon').addEventListener('click', exporterWordDirect);
    racine.querySelector('#rap-csv').addEventListener('click', exporterCSV);

    dessinerControles();
    generer();
    dessinerStats();
  };

  const dessinerControles = () => {
    const type = TYPES.find((t) => t.code === etat.type);
    racine.querySelector('#rap-employe').classList.toggle('hidden', !type.employe);
    racine.querySelector('#rap-nav-periode').classList.toggle('hidden', !type.periode);
    racine.querySelector('#rap-periode').textContent = bornes().label;
  };

  const exporterCSV = () => {
    if (!etat.export) { toast(t('rapports.pasExportCsv'), 'warning'); return; }
    const lignes = [etat.export.entetes.join(';'), ...etat.export.lignes.map((l) => l.join(';'))];
    PP.io.telecharger(`${etat.export.nom}.csv`, '\ufeff' + lignes.join('\r\n'), 'text/csv;charset=utf-8');
    toast(t('docs.exportCsv'), 'success');
  };

  /* ================= Aperçu modifiable et export Word ================= */
  const exporterWordDirect = async () => {
    if (!documentCourant?.blocs?.length) { toast(t('rapports.choisirEmployeDabord'), 'warning'); return; }
    try {
      /* On attend le résultat réel de l'enregistrement : annoncer le succès
         avant de savoir s'il a eu lieu produirait deux messages contradictoires
         (l'un de succès, l'autre d'échec). */
      const resultat = await PP.docx.telecharger(documentCourant.blocs, documentCourant.nomFichier, {
        titre: documentCourant.titre, auteur: PP.settings.all().nomEtablissement || 'Wendo',
      });
      if (resultat && !resultat.navigateur) toast(t('donnees.enregistre', { chemin: resultat.chemin }), 'success');
      else if (resultat) toast(t('docs.wordTelechargeSimple'), 'success');
    } catch (e) {
      toast(e.message || t('docs.echecWord'), 'error');
    }
  };

  const ouvrirEditeur = () => {
    if (!documentCourant) { toast(t('rapports.choisirEmployeDocument'), 'warning'); return; }
    PP.editeurDocument.ouvrir({
      titre: documentCourant.titre,
      sousTitre: documentCourant.sousTitre,
      nomFichier: documentCourant.nomFichier,
      blocs: documentCourant.blocs,
    });
  };

  return { render };
})();

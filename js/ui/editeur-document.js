/* Aperçu modifiable d'un document — composant plein écran.

   Remplace l'ancien « Imprimer / PDF » direct : l'utilisateur voit d'abord le
   document, le corrige (texte, tableaux, titres), puis exporte en .docx, en .pdf
   (impression navigateur) ou en HTML.

   Conception : le document vit dans un conteneur `contenteditable` unique
   (des <div class="ed-paragraphe"> et des <table>). Ce qui est affiché EST ce
   qui sera exporté — pas de double source de vérité. Pour le .docx, on relit le
   DOM par une marche récursive (`blocsDepuisDom`) au lieu de réécrire un parseur
   HTML complet : c'est plus court et cela reste exact pour ce que l'éditeur
   permet de produire. */
window.PP = window.PP || {};

PP.editeurDocument = (() => {
  const { icon, toast } = PP.ui;
  const { escapeHtml } = PP.utils;

  /* Taille en dixièmes de millimètre, comme le format papier : les largeurs de
     colonnes relatives survivent ainsi au passage dans l'export. */
  const DIAPO = { minLargeur: 600, maxLargeur: 980 };

  let session = null;

  /* ================= État ================= */
  const nouvelEtat = () => ({
    nomFichier: 'document',
    titre: 'Document',
    enregistrer: null,   // appelé par « Terminer » (facultatif)

    /* Mise en page */
    marges: 1.4,         // cm
    largeur: 21,         // cm (A4)

    /* Barre d'outils du haut */
    largeurSelection: 21,
    tailleSelection: 3,
    gras: false,
    italique: false,
    align: 'left',

    /* Édition */
    listeModifs: [],
    curseur: 0,
  });

  /* ================= Utilitaires ================= */
  const centrer = (iso) => (iso ? PP.dates.formatCourt(PP.dates.fromISO(iso)) : '');

  /* Hauteur/largeur d'un élément en unités de mise en page */
  const cm = (v) => `${v}cm`;

  /* Compte les éléments feuilles (paragraphes, cellules, titres) pour le
     compteur « mots ». */
  const compterMots = (racine) => {
    const texte = racine.innerText.replace(/\u00a0/g, ' ');
    const mots = texte.trim() ? texte.trim().split(/\s+/).length : 0;
    return { mots, caracteres: texte.replace(/\s/g, '').length };
  };

  /* ================= Construction du document ================= */
  /** Bloc de titre de l'aperçu (non modifiable : il est régénéré). */
  const htmlEnTete = (etat) => {
    const logo = PP.settings.all().logo || 'assets/logo.png';
    const etablissement = PP.settings.all().nomEtablissement || 'Wendo';
    return `
      <div class="ed-entete">
        <img src="${logo}" alt="" class="ed-logo">
        <div class="ed-entete-texte">
          <p class="ed-etablissement">${escapeHtml(etablissement)}</p>
          <p class="ed-genere">${t('docs.editeur.documentDu', { date: PP.dates.formatCourt(new Date()) })}</p>
        </div>
      </div>`;
  };

  /** Applique le zoom et la largeur de page à la feuille. */
  const appliquerMiseEnPage = (etat) => {
    const feuille = session?.feuille;
    if (!feuille) return;
    feuille.style.width = cm(etat.largeur);
    feuille.style.padding = cm(etat.marges);
  };

  /* ================= Blocs → HTML ================= */

  /** Un bloc de texte devient un paragraphe modifiable. */
  const htmlTexte = (b) => {
    const style = b.style || 'normal';
    const classe = style === 'normal' ? '' : ` ed-${style}`;
    return `<div class="ed-paragraphe${classe}" data-ed="texte" style="text-align:${b.align || 'left'}">`
      + `${escapeHtml(b.texte)}</div>`;
  };

  const htmlTitre = (b) => {
    const niveau = Math.min(3, Math.max(1, b.niveau || 1));
    return `<div class="ed-titre ed-titre-${niveau}" data-ed="titre" data-niveau="${niveau}">`
      + `${escapeHtml(b.texte)}</div>`;
  };

  /** Tableau modifiable : `contenteditable` désactivé sur la structure,
      réactivé cellule par cellule. */
  const htmlTableau = (b) => {
    const nbCol = Math.max(b.entetes?.length || 0, b.pied?.length || 0, ...(b.lignes || []).map((l) => l.length), 1);
    const cellules = (liste, balise, estEntete) => {
      const complete = Array.from({ length: nbCol }, (_, i) => liste[i]);
      return '<tr>' + complete.map((c) => {
        const v = (c && typeof c === 'object') ? c : { texte: c };
        return `<${balise} contenteditable="true" data-ed="cellule" style="text-align:${v.align || 'left'}">`
          + `${escapeHtml(v.texte == null ? '' : v.texte)}</${balise}>`;
      }).join('') + '</tr>';
    };
    /* Le pied est un vrai <tfoot> : sans lui, le total serait perdu au moment
       de relire le tableau pour l'export Word. */
    return '<table class="ed-tableau" data-ed="tableau">'
      + (b.entetes?.length ? `<thead>${cellules(b.entetes, 'th', true)}</thead>` : '')
      + `<tbody>${(b.lignes || []).map((l) => cellules(l, 'td', false)).join('')}</tbody>`
      + (b.pied?.length ? `<tfoot>${cellules(b.pied, 'td', false)}</tfoot>` : '')
      + '</table>';
  };

  /** Un bloc décrit (`PP.docx` ou la page Rapports) devient du HTML modifiable. */
  const htmlBloc = (b) => {
    if (!b) return '';
    if (b.t === 'titre') return htmlTitre(b);
    if (b.t === 'texte' || b.t === 'paragraphe') return htmlTexte(b);
    if (b.t === 'tableau') return htmlTableau(b);
    if (b.t === 'saut') return '<div class="ed-saut" data-ed="saut"></div>';
    return '';
  };

  /** Saut entre le titre du document et son contenu. */
  const htmlSeparateur = (etat) => `
    <div class="ed-separateur" data-ed="separateur">
      <span class="ed-separateur-titre">${escapeHtml(etat.titre)}</span>
      <span class="ed-separateur-date">${PP.dates.formatCourt(new Date())}</span>
    </div>`;

  /* ================= DOM → Blocs (pour l'export) ================= */
  /** Marche récursive sur le contenu édité pour reconstruire des blocs `PP.docx`. */
  const blocsDepuisDom = (conteneur) => {
    const blocs = [];
    if (!conteneur) return blocs;
    const texteDe = (el) => (el ? el.innerText.replace(/\u00a0/g, ' ').replace(/\n+$/, '') : '');

    const visiter = (el) => {
      if (!el || !el.children) return;
      Array.from(el.children).forEach((enfant) => {
        const type = enfant.dataset.ed;
        if (type === 'titre') {
          blocs.push({ t: 'titre', texte: texteDe(enfant), niveau: Number(enfant.dataset.niveau || 1) });
          return;
        }
        if (type === 'texte') {
          const classe = [...enfant.classList];
          const style = classe.includes('ed-discret') ? 'discret'
            : classe.includes('ed-avertissement') ? 'avertissement' : 'normal';
          blocs.push({ t: 'texte', texte: texteDe(enfant), style, align: enfant.style.textAlign || 'left' });
          return;
        }
        if (type === 'tableau' || enfant.tagName === 'TABLE') {
          const entetes = Array.from(enfant.querySelectorAll('thead th')).map((c) => ({
            texte: texteDe(c), align: c.style.textAlign || 'left',
          }));
          const lignes = Array.from(enfant.querySelectorAll('tbody tr')).map((tr) =>
            Array.from(tr.children).map((c) => ({ texte: texteDe(c), align: c.style.textAlign || 'left' })));
          const pied = Array.from(enfant.querySelectorAll('tfoot td')).map((c) => ({
            texte: texteDe(c), align: c.style.textAlign || 'left', gras: true,
          }));
          blocs.push({ t: 'tableau', entetes, lignes, ...(pied.length ? { pied } : {}) });
          return;
        }
        if (type === 'saut') { blocs.push({ t: 'saut' }); return; }
        if (type === 'separateur') {
          blocs.push({ t: 'titre', texte: texteDe(enfant.querySelector('.ed-separateur-titre') || enfant), niveau: 1 });
          return;
        }
        /* Éléments non identifiés (donc non produits par l'éditeur) : on ne
           devine pas, on les descend s'ils contiennent des blocs connus. */
        if (enfant.children.length) visiter(enfant);
      });
    };

    visiter(conteneur);
    return blocs;
  };

  /* ================= Export ================= */
  const blocsCourants = () => blocsDepuisDom(session.zone);

  const exporterDocx = async () => {
    try {
      const blocs = blocsCourants();
      if (!blocs.length) { toast(t('docs.editeur.videExport'), 'warning'); return; }
      /* On attend le résultat réel : un seul message, qui dit la vérité. */
      const resultat = await PP.docx.telecharger(
        [{ t: 'texte', texte: session.etat.titre, style: 'discret' }, ...blocs],
        session.etat.nomFichier,
        { titre: session.etat.titre, auteur: PP.settings.all().nomEtablissement || 'Wendo' },
      );
      if (resultat && !resultat.navigateur) toast(t('donnees.enregistre', { chemin: resultat.chemin }), 'success');
      else if (resultat) toast(t('docs.wordTelechargeSimple'), 'success');
      /* Si `resultat` est nul, PP.io a déjà expliqué pourquoi : ne pas en
         rajouter un par-dessus. */
    } catch (e) {
      toast(e.message || t('docs.echecWord'), 'error');
    }
  };

  const exporterHtml = () => {
    const css = `
      body { font-family: Calibri, Inter, sans-serif; font-size: 11pt; color: #111; margin: 2cm; }
      h1 { font-size: 16pt; border-bottom: 1px solid #ccc; padding-bottom: 4pt; }
      table { border-collapse: collapse; width: 100%; font-size: 9pt; }
      th, td { border: 1px solid #d0d0d0; padding: 3pt 5pt; }
      th { background: #f4f4f5; text-align: left; }
      .ed-discret { color: #6b6b6b; font-size: 9pt; font-style: italic; }
      .ed-avertissement { color: #8a6d3b; font-size: 9pt; }
      .ed-separateur-titre { font-weight: 600; font-size: 14pt; }`;
    const corps = session.zone.innerHTML
      .replace(/<div class="ed-separateur"[^>]*>/, '<h1>')
      .replace(/<\/div>(?=\s*<(div class="ed-|table))/g, '</div>');
    const page = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">`
      + `<title>${escapeHtml(session.etat.titre)}</title><style>${css}</style></head>`
      + `<body>${corps}</body></html>`;
    PP.io.telecharger(`${session.etat.nomFichier}.html`, page, 'text/html;charset=utf-8');
    toast(t('docs.editeur.htmlTelecharge'), 'success');
  };

  /* ================= Barre d'outils ================= */
  const rafraichirBarre = () => {
    const e = session.etat;
    session.barre.querySelectorAll('[data-cmd]').forEach((b) => {
      const actif = (b.dataset.cmd === 'bold' && e.gras)
        || (b.dataset.cmd === 'italic' && e.italique)
        || (b.dataset.cmd === 'align-left' && e.align === 'left')
        || (b.dataset.cmd === 'align-center' && e.align === 'center')
        || (b.dataset.cmd === 'align-right' && e.align === 'right')
        || (b.dataset.cmd === 'align-justify' && e.align === 'justify');
      b.dataset.actif = actif ? 'true' : 'false';
    });
  };

  const exec = (cmd, valeur = null) => {
    session.zone.focus();
    /* `styleWithCSS` évite que execCommand ne produise des <b>/<i> que notre
       export ignore : on préfère des styles que blocsDepuisDom sait relire. */
    try { document.execCommand('styleWithCSS', false, true); } catch (e) { /* navigateur sans support : on continue */ }
    document.execCommand(cmd, false, valeur);
    rafraichirBarre();
  };

  const aligner = (align) => {
    session.etat.align = align;
    exec('justifyLeft'); /* remise à zéro, puis alignement demandé */
    if (align !== 'left') exec({ center: 'justifyCenter', right: 'justifyRight', justify: 'justifyFull' }[align]);
    rafraichirBarre();
  };

  const changerTaille = (valeur) => {
    session.etat.tailleSelection = Number(valeur);
    session.zone.style.fontSize = `${Number(valeur) * 2}pt`;
  };

  const changerLargeur = (valeur) => {
    session.etat.largeur = Number(valeur);
    appliquerMiseEnPage(session.etat);
    session.zone.style.fontSize = `${session.etat.tailleSelection * 2}pt`;
  };

  /* ================= Actions document ================= */
  const ajouterParagraphe = (apres = null) => {
    const p = document.createElement('div');
    p.className = 'ed-paragraphe';
    p.dataset.ed = 'texte';
    p.innerHTML = '<br>';
    if (apres && apres.parentNode) apres.parentNode.insertBefore(p, apres.nextSibling);
    else session.zone.appendChild(p);
    placerCurseurFin(p);
    return p;
  };

  const ajouterTitre = () => {
    const courant = session.zone.querySelector('.ed-titre:last-of-type');
    const niveau = Math.min(3, (Number(courant?.dataset.niveau) || 0) + 1);
    const h = document.createElement('div');
    h.className = `ed-titre ed-titre-${niveau}`;
    h.dataset.ed = 'titre';
    h.dataset.niveau = String(niveau);
    h.textContent = niveau === 1 ? t('docs.editeur.nouvelleSection') : t('docs.editeur.nouveauSousTitre');
    session.zone.appendChild(h);
    placerCurseurFin(h);
  };

  const ajouterTableau = (lignes = 2, colonnes = 3) => {
    const table = document.createElement('table');
    table.className = 'ed-tableau';
    table.dataset.ed = 'tableau';
    const thead = document.createElement('thead');
    const trh = document.createElement('tr');
    for (let c = 0; c < colonnes; c += 1) {
      const th = document.createElement('th');
      th.contentEditable = 'true';
      th.dataset.ed = 'cellule';
      th.textContent = t('docs.editeur.colonne', { n: c + 1 });
      trh.appendChild(th);
    }
    thead.appendChild(trh);
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    for (let l = 0; l < lignes; l += 1) {
      const tr = document.createElement('tr');
      for (let c = 0; c < colonnes; c += 1) {
        const td = document.createElement('td');
        td.contentEditable = 'true';
        td.dataset.ed = 'cellule';
        td.innerHTML = '<br>';
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    session.zone.appendChild(table);
    placerCurseurFin(table.querySelector('td'));
  };

  const placerCurseurFin = (el) => {
    const plage = document.createRange();
    plage.selectNodeContents(el);
    plage.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(plage);
    el.focus();
  };

  /* Retire l'élément qui contient le curseur (ou le dernier bloc).
     Aucun message : la disparition du bloc est visible, et l'action reste
     réversible par « Annuler les modifications ». Notifier chaque suppression
     encombrait l'écran sans rien apprendre à l'utilisateur. */
  const supprimerBlocCourant = () => {
    const sel = window.getSelection();
    let noeud = sel && sel.anchorNode;
    while (noeud && noeud !== session.zone && !noeud.dataset?.ed) noeud = noeud.parentNode;
    let cible = (noeud && noeud !== session.zone) ? noeud : null;
    if (cible && cible.dataset.ed === 'cellule') cible = cible.closest('tr') || cible;
    if (!cible) cible = session.zone.lastElementChild;
    if (!cible) return;
    cible.remove();
  };

  /* ================= Intégration au document ================= */
  const monterLaFeuille = (etat, blocs) => {
    session.zone = session.feuille.querySelector('#ed-zone');
    session.zone.innerHTML = blocs.map(htmlBloc).join('');
    if (!session.zone.children.length) ajouterParagraphe();
    session.zone.style.fontSize = `${etat.tailleSelection * 2}pt`;
    appliquerMiseEnPage(etat);
  };

  /* ================= Fermeture ================= */
  const fermer = () => {
    if (!session) return;
    if (session.enregistrer) session.enregistrer(blocsCourants());
    const { racine, etat } = session;
    session = null;
    racine.remove();
    if (etat.onFermer) etat.onFermer();
  };

  /* ================= Ouverture ================= */
  /**
   * Ouvre l'aperçu modifiable.
   * @param {object} options
   *   titre        titre affiché et nom de fichier proposé
   *   blocs        contenu initial (liste de blocs `PP.docx`), ou
   *   html         contenu initial déjà en HTML (prioritaire sur `blocs`)
   *   zone         élément dont le contenu remplace `blocs`/`html` (pour un tableau de page)
   *   nomFichier   nom du fichier exporté (sans extension)
   *   onFermer     appelé après fermeture, avec les blocs courants
   *   enregistrer  appelé à chaque modification (brouillon automatique)
   */
  const ouvrir = ({ titre = 'Document', blocs = [], html = null, zone = null, nomFichier = 'document', onFermer = null, enregistrer = null, sousTitre = '' }) => {
    if (session) fermer();

    const etat = nouvelEtat();
    etat.titre = titre;
    etat.nomFichier = nomFichier;
    etat.enregistrer = enregistrer || onFermer;

    const racine = document.createElement('div');
    racine.className = 'ed-racine';
    racine.innerHTML = `
      <header class="ed-barre" id="ed-barre-edition">
        <div class="ed-barre-groupe">
          <span class="ed-barre-titre">${escapeHtml(titre)}</span>
          ${sousTitre ? `<span class="ed-barre-sous-titre">${escapeHtml(sousTitre)}</span>` : ''}
        </div>

        <div class="ed-barre-groupe ed-barre-outils">
          <button class="ed-outil" data-cmd="bold" title="${t('docs.editeur.grasTitre')}">${icon('i-check', 'h-3.5 w-3.5')}<span class="ed-outil-mot">${t('docs.editeur.gras')}</span></button>
          <button class="ed-outil" data-cmd="italic" title="${t('docs.editeur.italiqueTitre')}"><span class="ed-italique">I</span><span class="ed-outil-mot">${t('docs.editeur.italique')}</span></button>
          <span class="ed-sep"></span>
          <button class="ed-outil" data-cmd="align-left" title="${t('docs.editeur.alignerGauche')}">G</button>
          <button class="ed-outil" data-cmd="align-center" title="${t('docs.editeur.centrer')}">C</button>
          <button class="ed-outil" data-cmd="align-right" title="${t('docs.editeur.alignerDroite')}">D</button>
          <button class="ed-outil" data-cmd="align-justify" title="${t('docs.editeur.justifier')}">J</button>
          <span class="ed-sep"></span>
          <label class="ed-champ">
            <span>${t('docs.editeur.hauteur')}</span>
            <select id="ed-taille" class="ed-select">
              ${[2, 2.5, 3, 3.5, 4, 5, 6, 7].map((v) => `<option value="${v}" ${v === 3 ? 'selected' : ''}>${String(v).replace('.', ',')}</option>`).join('')}
            </select>
          </label>
        </div>

        <div class="ed-barre-groupe ed-barre-outils">
          <button class="ed-outil" id="ed-ajout-titre" title="${t('docs.editeur.ajouterTitre')}">${icon('i-plus', 'h-3.5 w-3.5')}<span class="ed-outil-mot">${t('docs.editeur.blocTitre')}</span></button>
          <button class="ed-outil" id="ed-ajout-tableau" title="${t('docs.editeur.ajouterTableau')}">${icon('i-chart', 'h-3.5 w-3.5')}<span class="ed-outil-mot">${t('docs.editeur.blocTableau')}</span></button>
          <button class="ed-outil" id="ed-ajout-texte" title="${t('docs.editeur.ajouterParagraphe')}">${icon('i-notes', 'h-3.5 w-3.5')}<span class="ed-outil-mot">${t('docs.editeur.blocParagraphe')}</span></button>
          <button class="ed-outil ed-outil-danger" id="ed-supprimer" title="${t('docs.editeur.supprimerBloc')}">${icon('i-trash', 'h-3.5 w-3.5')}</button>
        </div>

        <div class="ed-barre-groupe ed-barre-actions">
          <button class="ed-bouton" id="ed-annuler-modifs">${t('docs.editeur.annulerModifs')}</button>
          <button class="ed-bouton" id="ed-word">${icon('i-doc', 'h-4 w-4')} Word (.docx)</button>
          <button class="ed-bouton" id="ed-pdf">${icon('i-download', 'h-4 w-4')} PDF</button>
          <button class="ed-bouton" id="ed-html">HTML</button>
          <button class="ed-bouton ed-bouton-principal" id="ed-terminer">${icon('i-check', 'h-4 w-4')} ${t('docs.editeur.terminer')}</button>
        </div>
      </header>

      <div class="ed-scene">
        <div class="ed-feuille" id="ed-feuille">
          <div class="ed-zone" id="ed-zone" contenteditable="true" spellcheck="true"></div>
        </div>
      </div>

      <footer class="ed-pied">
        <span id="ed-compteur">0 mot</span>
        <span class="ed-pied-sep"></span>
        <label class="ed-champ">
          <span>${t('docs.editeur.marges')}</span>
          <select id="ed-marges" class="ed-select">
            ${[[1, '1 cm'], [1.4, '1,4 cm'], [2, '2 cm'], [2.5, '2,5 cm']].map(([v, l]) => `<option value="${v}" ${v === 1.4 ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
        </label>
        <label class="ed-champ">
          <span>${t('docs.editeur.largeur')}</span>
          <select id="ed-largeur" class="ed-select">
            ${[[21, 'A4 — 21 cm'], [21.59, 'Letter — 21,6 cm'], [15, 'Compact — 15 cm']].map(([v, l]) => `<option value="${v}" ${v === 21 ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
        </label>
        <span class="ed-pied-note">${t('docs.editeur.piedNote')}</span>
      </footer>`;

    document.body.appendChild(racine);

    session = { racine, etat, feuille: racine.querySelector('#ed-feuille'), barre: racine.querySelector('#ed-barre-edition'), zone: null };

    /* Le contenu vient soit d'une zone DOM existante (tableau d'une page), soit
       d'une liste de blocs, soit de HTML déjà prêt. */
    const contenuHtml = html || (zone ? zone.innerHTML : null);
    if (contenuHtml) {
      session.feuille.querySelector('#ed-zone').innerHTML = contenuHtml;
      session.zone = session.feuille.querySelector('#ed-zone');
      if (!session.zone.children.length) ajouterParagraphe();
      appliquerMiseEnPage(etat);
    } else {
      monterLaFeuille(etat, blocs);
    }
    const zone_ = session.zone;
    zone_.addEventListener('input', () => {
      const c = compterMots(session.zone);
      session.racine.querySelector('#ed-compteur').textContent =
        `${t('docs.editeur.mots', { n: c.mots, s: c.mots > 1 ? 's' : '' })} · ${t('docs.editeur.caracteres', { n: c.caracteres, s: c.caracteres > 1 ? 's' : '' })}`;
      if (session.etat.enregistrer) session.etat.enregistrer(blocsDepuisDom(session.zone));
    });
    const c0 = compterMots(session.zone);
    racine.querySelector('#ed-compteur').textContent = `${t('docs.editeur.mots', { n: c0.mots, s: c0.mots > 1 ? 's' : '' })} · ${t('docs.editeur.caracteres', { n: c0.caracteres, s: c0.caracteres > 1 ? 's' : '' })}`;

    /* Sélection : on mémorise gras/italique/alignement pour allumer les boutons */
    const majSelection = () => {
      try {
        session.etat.gras = document.queryCommandState('bold');
        session.etat.italique = document.queryCommandState('italic');
      } catch (e) { /* certains navigateurs refusent hors focus : sans conséquence */ }
      rafraichirBarre();
    };
    document.addEventListener('selectionchange', majSelection);

    /* Événements */
    session.barre.addEventListener('mousedown', (e) => {
      /* Empêche la perte du focus (et donc de la sélection) avant l'action */
      if (e.target.closest('.ed-outil')) e.preventDefault();
    });
    session.barre.querySelectorAll('[data-cmd]').forEach((b) => {
      b.addEventListener('click', () => {
        const cmd = b.dataset.cmd;
        if (cmd === 'bold') { session.etat.gras = !session.etat.gras; exec('bold'); }
        else if (cmd === 'italic') { session.etat.italique = !session.etat.italique; exec('italic'); }
        else aligner(cmd.replace('align-', ''));
      });
    });
    racine.querySelector('#ed-taille').addEventListener('change', (e) => changerTaille(e.target.value));
    racine.querySelector('#ed-marges').addEventListener('change', (e) => { etat.marges = Number(e.target.value); appliquerMiseEnPage(etat); });
    racine.querySelector('#ed-largeur').addEventListener('change', (e) => { etat.largeur = Number(e.target.value); appliquerMiseEnPage(etat); });
    racine.querySelector('#ed-ajout-titre').addEventListener('click', ajouterTitre);
    racine.querySelector('#ed-ajout-tableau').addEventListener('click', () => ajouterTableau());
    racine.querySelector('#ed-ajout-texte').addEventListener('click', () => ajouterParagraphe());
    racine.querySelector('#ed-supprimer').addEventListener('click', supprimerBlocCourant);
    racine.querySelector('#ed-word').addEventListener('click', exporterDocx);
    racine.querySelector('#ed-html').addEventListener('click', exporterHtml);
    racine.querySelector('#ed-pdf').addEventListener('click', () => window.print());
    racine.querySelector('#ed-terminer').addEventListener('click', fermer);
    racine.querySelector('#ed-annuler-modifs').addEventListener('click', () => {
      PP.ui.confirmDialog({
        title: t('docs.editeur.annulerTitre'),
        message: t('docs.editeur.annulerMessage'),
        confirmLabel: t('docs.editeur.revenirOriginal'),
        onConfirm: () => { ouvrir({ titre, blocs, html, zone, nomFichier, onFermer, enregistrer, sousTitre }); },
      });
    });

    /* Raccourcis clavier : Échap ferme, Ctrl+S exporte en Word */
    racine.tabIndex = -1;
    racine.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); fermer(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); exporterDocx(); }
    });

    session.rafraichir = majSelection;
    rafraichirBarre();
    zone_.focus();
    return session;
  };

  return { ouvrir, blocsDepuisDom, disponible: () => true };
})();

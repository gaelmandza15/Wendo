/* Lecture d'un .docx par nos propres moyens.

   Pourquoi ne pas utiliser mammoth : son chemin mémoire passe par JSZip, dont
   l'inflation asynchrone n'aboutit jamais dans ce navigateur (vérifié : même une
   archive écrite par JSZip lui-même se bloque). Le chemin fichier, lui, est
   interdit au navigateur.

   Ce module fait donc le travail directement, en synchrone :
     1. décompression de l'archive avec fflate (déjà embarqué) ;
     2. parcours de `word/document.xml` pour reconstruire paragraphes, titres,
        tableaux, listes et styles simples (gras / italique).

   Le sous-ensemble OOXML couvert correspond à ce que Wendo écrit (voir
   js/core/docx.js) et à l'essentiel de ce que produit Word pour du texte, des
   titres et des tableaux — c'est-à-dire tout ce dont l'aperçu modifiable a
   besoin. Les images et les objets incorporés ne sont pas extraits : le but est
   de corriger le TEXTE, pas de reproduire la mise en page (c'est le rôle de
   `apercuFidele`, qui passe par docx-preview). */
window.PP = window.PP || {};

PP.docxLecture = (() => {
  const { escapeHtml } = PP.utils;

  const ERR_FFLATE = 'Le module de compression (vendor/fflate.js) n\'est pas chargé.';

  /* ================= Décompression ================= */
  /** Renvoie { 'word/document.xml': '<xml…' } pour un .docx décodé en texte. */
  const lireParties = (donnees) => {
    if (typeof fflate === 'undefined') throw new Error(ERR_FFLATE);
    const brut = donnees instanceof ArrayBuffer
      ? new Uint8Array(donnees)
      : new Uint8Array(donnees.buffer, donnees.byteOffset, donnees.byteLength);
    let contenu;
    try {
      contenu = fflate.unzipSync(brut);
    } catch (e) {
      throw new Error('Ce fichier n\'est pas un document Word lisible (archive ZIP invalide).');
    }
    const parties = {};
    Object.keys(contenu).forEach((nom) => {
      /* Seules les parties XML textuelles nous intéressent. */
      if (/\.xml$|\.rels$/.test(nom)) parties[nom] = fflate.strFromU8(contenu[nom]);
    });
    if (!parties['word/document.xml']) {
      throw new Error('Ce fichier ne contient pas de corps de document (word/document.xml absent).');
    }
    return parties;
  };

  /* ================= Lecture XML ================= */
  /* Le navigateur fournit un analyseur XML natif : on s'en sert plutôt que
     d'écrire une machine à états. Il rend les erreurs de syntaxe visibles. */
  const analyser = (xml) => {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const erreur = doc.querySelector('parsererror');
    if (erreur) throw new Error('document.xml est illisible : ' + erreur.textContent.slice(0, 120));
    return doc;
  };

  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

  /* Récupère les enfants d'un élément dans le namespace WordprocessingML */
  const enfantsW = (el, nom) => Array.from(el.children).filter((c) => c.namespaceURI === W && c.localName === nom);

  /* ================= Styles ================= */
  /** Table des styles : identifiant → { nom, niveau, gras, italique }. */
  const lireStyles = (parties) => {
    const table = {};
    const xml = parties['word/styles.xml'];
    if (!xml) return table;
    try {
      const doc = analyser(xml);
      Array.from(doc.getElementsByTagNameNS(W, 'style')).forEach((st) => {
        const id = st.getAttributeNS(W, 'styleId') || st.getAttribute('w:styleId');
        if (!id) return;
        const nomEl = enfantsW(st, 'name')[0];
        const nom = nomEl ? (nomEl.getAttributeNS(W, 'val') || nomEl.getAttribute('w:val')) : id;
        const rpr = enfantsW(st, 'rPr')[0];
        const ppr = enfantsW(st, 'pPr')[0];
        const niveau = ppr && enfantsW(ppr, 'outlineLvl')[0]
          ? Number(enfantsW(ppr, 'outlineLvl')[0].getAttributeNS(W, 'val')) + 1
          : 0;
        table[id] = {
          nom,
          niveau,
          gras: rpr ? enfantsW(rpr, 'b').length > 0 : false,
          italique: rpr ? enfantsW(rpr, 'i').length > 0 : false,
        };
      });
    } catch (e) { /* styles illisibles : on s'en passe, le texte reste lisible */ }
    return table;
  };

  /* ================= Contenu en ligne ================= */
  /** Un morceau de texte avec ses attributs de mise en forme. */
  const lireRuns = (paragraphe, stylePara, styles) => {
    const morceaux = [];
    const visiter = (el, herite) => {
      Array.from(el.children).forEach((enfant) => {
        if (enfant.namespaceURI !== W) return;
        const nom = enfant.localName;

        if (nom === 'rPr') return; /* traité par l'appelant */
        if (nom === 'r') {
          const rpr = enfantsW(enfant, 'rPr')[0];
          const style = rpr ? enfantsW(rpr, 'rStyle')[0] : null;
          const idStyle = style ? (style.getAttributeNS(W, 'val') || style.getAttribute('w:val')) : null;
          const styleRun = idStyle ? styles[idStyle] : null;
          const etat = {
            gras: herite.gras || (rpr ? enfantsW(rpr, 'b').length > 0 : false) || Boolean(styleRun?.gras),
            italique: herite.italique || (rpr ? enfantsW(rpr, 'i').length > 0 : false) || Boolean(styleRun?.italique),
          };
          /* w:t porte le texte ; w:tab et w:br sont des blancs significatifs */
          Array.from(enfant.children).forEach((f) => {
            if (f.namespaceURI !== W) return;
            if (f.localName === 't') morceaux.push({ texte: f.textContent, ...etat });
            else if (f.localName === 'tab') morceaux.push({ texte: ' ', ...etat });
            else if (f.localName === 'br') morceaux.push({ texte: '\n', ...etat });
          });
          return;
        }
        /* Champs (numéros de page, dates automatiques…) : on garde le résultat */
        if (nom === 'smartTag' || nom === 'hyperlink' || nom === 'ins' || nom === 'sdt' || nom === 'sdtContent') {
          visiter(enfant, herite);
        }
      });
    };
    visiter(paragraphe, { gras: Boolean(stylePara?.gras), italique: Boolean(stylePara?.italique) });
    return morceaux;
  };

  const texteDe = (morceaux) => morceaux.map((m) => m.texte).join('');

  /* ================= Paragraphes ================= */
  /** Niveau d'indentation si le paragraphe appartient à une liste, sinon -1. */
  const niveauListe = (paragraphe) => {
    const ppr = enfantsW(paragraphe, 'pPr')[0];
    if (!ppr) return -1;
    const numPr = enfantsW(ppr, 'numPr')[0];
    if (!numPr) return -1;
    const niveau = enfantsW(numPr, 'ilvl')[0];
    return niveau ? Number(niveau.getAttributeNS(W, 'val') || 0) : 0;
  };

  /* ================= Tableaux ================= */
  const lireTableau = (tableau, styles) => {
    const entetes = [];
    const lignes = [];
    const pied = [];
    let premiereLigne = true;

    Array.from(tableau.children).forEach((section) => {
      if (section.namespaceURI !== W) return;
      if (section.localName !== 'tr') return;
      const cellules = [];
      Array.from(section.children).forEach((cellule) => {
        if (cellule.namespaceURI !== W || cellule.localName !== 'tc') return;
        const paras = enfantsW(cellule, 'p');
        const texte = paras.map((p) => texteDe(lireRuns(p, styleDeParagraphe(p, styles), styles)))
          .join('\n').trim();
        cellules.push(texte);
      });
      if (!cellules.length) return;
      if (premiereLigne) { entetes.push(...cellules); premiereLigne = false; }
      else lignes.push(cellules);
    });

    /* Une dernière ligne qui commence par « Total » est un pied de tableau :
       elle doit rester en gras et ne pas être confondue avec une donnée. */
    const derniere = lignes[lignes.length - 1];
    if (derniere && lignes.length > 1 && /^(total|totaux|somme)/i.test((derniere[0] || '').trim())) {
      lignes.pop();
      pied.push(...derniere);
    }

    return { entetes, lignes, pied };
  };

  /** Style d'un paragraphe : résout w:pStyle dans la table des styles. */
  const styleDeParagraphe = (paragraphe, styles) => {
    const ppr = enfantsW(paragraphe, 'pPr')[0];
    if (!ppr) return null;
    const st = enfantsW(ppr, 'pStyle')[0];
    if (!st) return null;
    const id = st.getAttributeNS(W, 'val') || st.getAttribute('w:val');
    return id ? styles[id] : null;
  };

  /* ================= Corps du document ================= */
  /** Convertit le corps WordprocessingML en liste d'éléments HTML. */
  const corpsVersHtml = (corps, styles) => {
    const sortie = [];

    Array.from(corps.children).forEach((el) => {
      if (el.namespaceURI !== W) return;

      if (el.localName === 'p') {
        const style = styleDeParagraphe(el, styles);
        const morceaux = lireRuns(el, style, styles);
        const texte = texteDe(morceaux);
        if (!texte.trim()) { sortie.push('<div class="ed-paragraphe" data-ed="texte"><br></div>'); return; }

        const niveau = niveauListe(el);
        if (niveau >= 0) {
          sortie.push(`<div class="ed-paragraphe" data-ed="texte" style="padding-left:${1 + niveau * 0.6}rem">• ${inline(morceaux)}</div>`);
          return;
        }

        /* Titre explicite (style Word « Titre 1 »…) */
        const niveauTitre = style?.niveau || 0;
        if (niveauTitre >= 1 && niveauTitre <= 3) {
          sortie.push(`<div class="ed-titre ed-titre-${niveauTitre}" data-ed="titre" data-niveau="${niveauTitre}">${inline(morceaux)}</div>`);
          return;
        }
        /* Un paragraphe entièrement gras et court se lit comme un titre — c'est
           courant dans un document saisi à la main. Le niveau, lui, se déduit de
           l'endroit où il tombe : un titre juste après le début du document est
           un titre principal, les suivants sont des sous-titres. */
        const toutGras = morceaux.length > 0 && morceaux.every((m) => m.gras || !m.texte.trim());
        if (toutGras && texte.trim().length < 80 && texte.trim().length > 2) {
          const dejaVu = sortie.some((h) => h.includes('data-ed="titre"'));
          const niveau = dejaVu ? 3 : 1;
          sortie.push(`<div class="ed-titre ed-titre-${niveau}" data-ed="titre" data-niveau="${niveau}">${inline(morceaux)}</div>`);
          return;
        }

        const ppr = enfantsW(el, 'pPr')[0];
        const jc = ppr ? enfantsW(ppr, 'jc')[0] : null;
        const val = jc ? (jc.getAttributeNS(W, 'val') || jc.getAttribute('w:val')) : null;
        const align = { center: 'center', right: 'right', both: 'justify' }[val] || 'left';
        sortie.push(`<div class="ed-paragraphe" data-ed="texte" style="text-align:${align}">${inline(morceaux)}</div>`);
        return;
      }

      if (el.localName === 'tbl') {
        const t = lireTableau(el, styles);
        const nbCol = Math.max(t.entetes.length, ...t.lignes.map((l) => l.length), 1);
        const ligne = (cellules, balise) => '<tr>' + Array.from({ length: nbCol }, (_, i) => {
          const v = cellules[i] == null ? '' : cellules[i];
          return `<${balise} contenteditable="true" data-ed="cellule" style="text-align:${i === 0 ? 'left' : 'right'}">${escapeHtml(v)}</${balise}>`;
        }).join('') + '</tr>';
        sortie.push('<table class="ed-tableau" data-ed="tableau">'
          + (t.entetes.length ? `<thead>${ligne(t.entetes, 'th')}</thead>` : '')
          + `<tbody>${t.lignes.map((l) => ligne(l, 'td')).join('')}</tbody>`
          + (t.pied.length ? `<tfoot>${ligne(t.pied, 'td')}</tfoot>` : '')
          + '</table>');
      }
      /* Les autres éléments (sectPr, signets…) ne portent pas de contenu visible */
    });

    return sortie.join('');
  };

  /** Assemble les morceaux en ligne en HTML, en fusionnant les mises en forme. */
  const inline = (morceaux) => morceaux.map((m) => {
    const t = escapeHtml(m.texte).replace(/\n/g, '<br>');
    if (m.gras && m.italique) return `<strong><em>${t}</em></strong>`;
    if (m.gras) return `<strong>${t}</strong>`;
    if (m.italique) return `<em>${t}</em>`;
    return t;
  }).join('');

  /* ================= API ================= */
  /** Convertit un .docx (Blob / ArrayBuffer / Uint8Array) en HTML modifiable. */
  const versHtml = async (source) => {
    const donnees = source instanceof Blob ? await source.arrayBuffer() : source;
    const parties = lireParties(donnees);
    const doc = analyser(parties['word/document.xml']);
    const corps = doc.getElementsByTagNameNS(W, 'body')[0];
    if (!corps) throw new Error('Le document Word ne contient pas de corps lisible.');
    const styles = lireStyles(parties);
    return { html: corpsVersHtml(corps, styles), messages: [] };
  };

  /** Restitue le .docx dans un conteneur, à l'identique de Word (docx-preview). */
  const apercuFidele = async (source, conteneur) => {
    if (typeof window.docx === 'undefined' || typeof window.docx.renderAsync !== 'function') {
      throw new Error('L\'aperçu fidèle (vendor/docx-preview.js) n\'est pas chargé.');
    }
    if (typeof window.JSZip === 'undefined') {
      throw new Error('vendor/jszip.js doit être chargé avant vendor/docx-preview.js.');
    }
    const donnees = source instanceof Blob ? await source.arrayBuffer() : source;
    conteneur.innerHTML = '';
    await window.docx.renderAsync(donnees, conteneur, null, {
      className: 'docx',
      inWrapper: true,
      breakPages: true,
      ignoreLastRenderedPageBreak: false,
      useBase64URL: true,
    });
    return conteneur;
  };

  /** Vrai si la lecture est disponible (fflate suffit). */
  const disponible = () => ({
    lecture: typeof fflate !== 'undefined',
    docxPreview: typeof window.docx !== 'undefined' && typeof window.JSZip !== 'undefined',
  });

  return { versHtml, apercuFidele, disponible, lireParties };
})();

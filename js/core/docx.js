/* Écriture de fichiers .docx (WordprocessingML) — bibliothèque locale du projet.
   Aucune dépendance réseau : la compression ZIP est assurée par vendor/fflate.js.

   Un document est décrit par une liste de blocs :
     { t: 'titre',  texte, niveau }        titre de niveau 1 à 3
     { t: 'texte',  texte, style }         paragraphe — style : 'normal' | 'discret' | 'avertissement'
     { t: 'saut' }                         saut de page
     { t: 'tableau', entetes, lignes, largeurs }
                                           `entetes` et `lignes` sont des listes de cellules ;
                                           une cellule est un texte, ou { texte, gras, italique, align, couleur }

   Unités OOXML : les tailles de police sont en demi-points (w:sz), les largeurs
   en twips (1/20 de point). A4 portrait = 11906 × 16838 twips. */
window.PP = window.PP || {};

PP.docx = (() => {
  const LARGEUR_PAGE = 11906;   // A4 portrait : 21 cm
  const HAUTEUR_PAGE = 16838;   // A4 portrait : 29,7 cm
  const MARGE = 1134;           // 2 cm
  const LARGEUR_UTILE = LARGEUR_PAGE - 2 * MARGE;

  const TAILLES = { titre1: 32, titre2: 26, titre3: 22, normal: 20, discret: 16, tableau: 18 };

  const echapper = (v) => String(v == null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  /** Paragraphe complet. `contenu` doit déjà contenir les <w:r> échappés. */
  const paragraphe = (contenu, {
    align = 'left', avant = 0, apres = 60, taille = TAILLES.normal,
    gras = false, italique = false, couleur = null, bordure = false, retrait = 0,
  } = {}) => {
    const pr = [
      `<w:spacing w:before="${avant}" w:after="${apres}"/>`,
      `<w:jc w:val="${align}"/>`,
      retrait ? `<w:ind w:left="${retrait}"/>` : '',
      bordure ? '<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="4" w:color="BFBFBF"/></w:pBdr>' : '',
    ].join('');
    const rpr = [
      `<w:sz w:val="${taille}"/><w:szCs w:val="${taille}"/>`,
      gras ? '<w:b/><w:bCs/>' : '',
      italique ? '<w:i/><w:iCs/>' : '',
      couleur ? `<w:color w:val="${couleur}"/>` : '',
    ].join('');
    return `<w:p><w:pPr>${pr}<w:rPr>${rpr}</w:rPr></w:pPr>`
      + `<w:r><w:rPr>${rpr}</w:rPr>${contenu}</w:r></w:p>`;
  };

  /** Un fragment de texte prêt à être inséré dans un paragraphe. */
  const cours = (valeur, { gras = false, italique = false, couleur = null } = {}) => {
    const rpr = [
      gras ? '<w:b/><w:bCs/>' : '',
      italique ? '<w:i/><w:iCs/>' : '',
      couleur ? `<w:color w:val="${couleur}"/>` : '',
    ].join('');
    return `<w:r><w:rPr>${rpr}</w:rPr><w:t xml:space="preserve">${echapper(valeur)}</w:t></w:r>`;
  };

  /* ---------- Tableaux ---------- */
  const BORDURES = '<w:tblBorders>'
    + '<w:top w:val="single" w:sz="4" w:space="0" w:color="D0D0D0"/>'
    + '<w:left w:val="single" w:sz="4" w:space="0" w:color="D0D0D0"/>'
    + '<w:bottom w:val="single" w:sz="4" w:space="0" w:color="D0D0D0"/>'
    + '<w:right w:val="single" w:sz="4" w:space="0" w:color="D0D0D0"/>'
    + '<w:insideH w:val="single" w:sz="4" w:space="0" w:color="E2E2E2"/>'
    + '<w:insideV w:val="single" w:sz="4" w:space="0" w:color="E2E2E2"/>'
    + '</w:tblBorders>';

  const cellule = (valeur, largeur, estEntete) => {
    const c = (valeur && typeof valeur === 'object') ? valeur : { texte: valeur };
    const rpr = [
      `<w:sz w:val="${TAILLES.tableau}"/><w:szCs w:val="${TAILLES.tableau}"/>`,
      (estEntete || c.gras) ? '<w:b/><w:bCs/>' : '',
      c.italique ? '<w:i/><w:iCs/>' : '',
      c.couleur ? `<w:color w:val="${c.couleur}"/>` : '',
    ].join('');
    return '<w:tc>'
      + `<w:tcPr><w:tcW w:w="${largeur}" w:type="dxa"/><w:vAlign w:val="center"/>`
      + (estEntete ? '<w:shd w:val="clear" w:color="auto" w:fill="F4F4F5"/>' : '')
      + '</w:tcPr>'
      + `<w:p><w:pPr><w:spacing w:before="20" w:after="20"/><w:jc w:val="${c.align || 'left'}"/><w:rPr>${rpr}</w:rPr></w:pPr>`
      + `<w:r><w:rPr>${rpr}</w:rPr><w:t xml:space="preserve">${echapper(c.texte)}</w:t></w:r></w:p>`
      + '</w:tc>';
  };

  const tableauXml = ({ entetes = [], lignes = [], pied = null, largeurs = null }) => {
    const nbCol = Math.max(
      entetes.length,
      pied ? pied.length : 0,
      ...lignes.map((l) => l.length),
      1,
    );
    const cols = (largeurs && largeurs.length === nbCol)
      ? largeurs
      : Array.from({ length: nbCol }, () => Math.floor(LARGEUR_UTILE / nbCol));

    /* Chaque ligne est complétée au nombre de colonnes : un tableau Word doit
       être rectangulaire, sinon LibreOffice refuse le fichier. */
    const ligne = (cellules, { entete = false, gras = false } = {}) => '<w:tr>'
      + (entete ? '<w:trPr><w:tblHeader/></w:trPr>' : '')
      + cols.map((w, i) => {
        const brut = cellules[i];
        const c = (brut && typeof brut === 'object') ? brut : { texte: brut };
        return cellule(gras ? { ...c, gras: true } : c, w, entete);
      }).join('')
      + '</w:tr>';

    return '<w:tbl><w:tblPr>'
      + `<w:tblW w:w="${LARGEUR_UTILE}" w:type="dxa"/>`
      + BORDURES
      + '<w:tblLayout w:type="fixed"/>'
      + '</w:tblPr>'
      + `<w:tblGrid>${cols.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>`
      + (entetes.length ? ligne(entetes, { entete: true }) : '')
      + lignes.map((l) => ligne(l)).join('')
      + (pied ? ligne(pied, { gras: true }) : '')
      + '</w:tbl>';
  };

  /* ---------- Corps du document ---------- */
  const corps = (blocs) => blocs.map((b) => {
    if (!b) return '';
    if (b.t === 'titre') {
      const niveau = Math.min(3, Math.max(1, b.niveau || 1));
      return paragraphe(`<w:t xml:space="preserve">${echapper(b.texte)}</w:t>`, {
        taille: TAILLES[`titre${niveau}`],
        gras: true,
        avant: niveau === 1 ? 0 : 240,
        apres: niveau === 1 ? 140 : 80,
        bordure: niveau === 1,
        couleur: niveau === 1 ? '1A1A1A' : null,
      });
    }
    if (b.t === 'texte' || b.t === 'paragraphe') {
      const style = b.style || 'normal';
      return paragraphe(`<w:t xml:space="preserve">${echapper(b.texte)}</w:t>`, {
        taille: style === 'discret' ? TAILLES.discret : TAILLES.normal,
        italique: style === 'discret',
        couleur: style === 'discret' ? '6B6B6B' : style === 'avertissement' ? '8A6D3B' : null,
        avant: b.avant != null ? b.avant : (style === 'normal' ? 0 : 120),
        apres: b.apres != null ? b.apres : 80,
        align: b.align || 'left',
      });
    }
    if (b.t === 'saut') return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
    if (b.t === 'tableau') return tableauXml(b);
    return '';
  }).join('');

  const documentXml = (blocs) => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
    + ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    + '<w:body>' + corps(blocs)
    + `<w:sectPr><w:pgSz w:w="${LARGEUR_PAGE}" w:h="${HAUTEUR_PAGE}"/>`
    + `<w:pgMar w:top="${MARGE}" w:right="${MARGE}" w:bottom="${MARGE}" w:left="${MARGE}"`
    + ' w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>'
    + '</w:body></w:document>';

  const CONTENU_TYPES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Default Extension="xml" ContentType="application/xml"/>'
    + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
    + '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
    + '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
    + '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>'
    + '</Types>';

  const RELS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
    + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>'
    + '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>'
    + '</Relationships>';

  const RELS_DOC = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
    + '</Relationships>';

  const STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
    + '<w:docDefaults><w:rPrDefault><w:rPr>'
    + '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>'
    + '<w:sz w:val="20"/><w:szCs w:val="20"/><w:lang w:val="fr-FR"/>'
    + '</w:rPr></w:rPrDefault></w:docDefaults>'
    + '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>'
    + '</w:styles>';

  const coreXml = ({ titre, auteur }) => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"'
    + ' xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/"'
    + ' xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
    + `<dc:title>${echapper(titre)}</dc:title>`
    + `<dc:creator>${echapper(auteur || 'Wendo')}</dc:creator>`
    + `<cp:lastModifiedBy>${echapper(auteur || 'Wendo')}</cp:lastModifiedBy>`
    + `<dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</dcterms:created>`
    + '</cp:coreProperties>';

  const APP_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"'
    + ' xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">'
    + '<Application>Wendo</Application></Properties>';

  /** Construit le contenu binaire (.docx) d'un document décrit par des blocs. */
  const construire = (blocs, { titre = 'Document', auteur = null } = {}) => {
    if (typeof fflate === 'undefined') {
      throw new Error('Le module de compression (vendor/fflate.js) n\'est pas chargé.');
    }
    const entrees = {};
    const ajouter = (nom, contenu) => {
      /* Niveau 6 : bon compromis taille / rapidité pour des XML de quelques dizaines de Ko */
      entrees[nom] = [fflate.strToU8(contenu), { level: 6 }];
    };
    ajouter('[Content_Types].xml', CONTENU_TYPES);
    ajouter('_rels/.rels', RELS);
    ajouter('docProps/core.xml', coreXml({ titre, auteur }));
    ajouter('docProps/app.xml', APP_XML);
    ajouter('word/document.xml', documentXml(blocs));
    ajouter('word/styles.xml', STYLES);
    ajouter('word/_rels/document.xml.rels', RELS_DOC);
    return fflate.zipSync(entrees, { level: 6 });
  };

  /** Construit puis déclenche le téléchargement du .docx. */
  /**
   * Construit le .docx et l'enregistre.
   *
   * Renvoie le résultat de l'enregistrement — `{ chemin, navigateur }` ou
   * `null` en cas d'échec. C'est l'APPELANT qui décide quoi dire à
   * l'utilisateur : cette fonction n'affiche aucun message. Sans cela, un seul
   * export produisait plusieurs notifications contradictoires (l'une annonçant
   * le succès, l'autre l'échec).
   */
  const telecharger = async (blocs, nomFichier, options = {}) => {
    const octets = construire(blocs, options);
    const blob = new Blob([octets], {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    const nom = /\.docx$/i.test(nomFichier) ? nomFichier : `${nomFichier}.docx`;
    /* On ne passe pas par PP.io.telecharger : celui-ci affiche ses propres
       messages. On veut un seul retour, maîtrisé par l'appelant. */
    return PP.io.enregistrer(nom, blob,
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  };

  return {
    construire, telecharger, cours, paragraphe, documentXml, LARGEUR_UTILE, TAILLES,
  };
})();

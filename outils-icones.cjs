/* Génère src-tauri/icons/icon.ico et icon.png à partir de assets/logo.png.
   Usage : node outils-icones.cjs
   Aucune dépendance : décode le PNG, redimensionne, puis écrit un ICO
   (format PNG-dans-ICO, accepté par Windows Vista et suivants). */

const fs = require('fs');
const zlib = require('zlib');

/* ---------- Lecture PNG ---------- */
const lirePNG = (chemin) => {
  const b = fs.readFileSync(chemin);
  if (b.readUInt32BE(0) !== 0x89504e47) throw new Error('ce n\'est pas un PNG');
  const largeur = b.readUInt32BE(16);
  const hauteur = b.readUInt32BE(20);
  const profondeur = b[24];
  const typeCouleur = b[25];
  const entrelace = b[28];
  if (profondeur !== 8) throw new Error('profondeur ' + profondeur + ' non gérée (8 attendu)');
  if (typeCouleur !== 6 && typeCouleur !== 2) throw new Error('type de couleur ' + typeCouleur + ' non géré (6 = RGBA, 2 = RGB)');
  if (entrelace !== 0) throw new Error('PNG entrelacé non géré');

  /* Concaténation des morceaux IDAT */
  const morceaux = [];
  let i = 8;
  while (i < b.length) {
    const longueur = b.readUInt32BE(i);
    const nom = b.slice(i + 4, i + 8).toString('latin1');
    if (nom === 'IDAT') morceaux.push(b.slice(i + 8, i + 8 + longueur));
    i += 12 + longueur;
    if (nom === 'IEND') break;
  }
  const brut = zlib.inflateSync(Buffer.concat(morceaux));

  /* Défiltrage : chaque ligne est précédée d'un octet de filtre */
  const canaux = typeCouleur === 6 ? 4 : 3;
  const pas = largeur * canaux;
  const pixels = Buffer.alloc(pas * hauteur);
  let precedent = Buffer.alloc(pas);
  for (let y = 0; y < hauteur; y += 1) {
    const filtre = brut[y * (pas + 1)];
    const ligne = brut.slice(y * (pas + 1) + 1, y * (pas + 1) + 1 + pas);
    const courante = Buffer.alloc(pas);
    for (let x = 0; x < pas; x += 1) {
      const gauche = x >= canaux ? courante[x - canaux] : 0;
      const haut = precedent[x];
      const coin = x >= canaux ? precedent[x - canaux] : 0;
      let v = ligne[x];
      if (filtre === 1) v += gauche;
      else if (filtre === 2) v += haut;
      else if (filtre === 3) v += Math.floor((gauche + haut) / 2);
      else if (filtre === 4) {
        const p = gauche + haut - coin;
        const da = Math.abs(p - gauche); const db = Math.abs(p - haut); const dc = Math.abs(p - coin);
        v += (da <= db && da <= dc) ? gauche : (db <= dc ? haut : coin);
      }
      courante[x] = v & 0xff;
    }
    courante.copy(pixels, y * pas);
    precedent = courante;
  }

  /* Normalisation en RGBA */
  const rgba = Buffer.alloc(largeur * hauteur * 4);
  for (let p = 0; p < largeur * hauteur; p += 1) {
    if (canaux === 4) {
      pixels.copy(rgba, p * 4, p * 4, p * 4 + 4);
    } else {
      rgba[p * 4] = pixels[p * 3];
      rgba[p * 4 + 1] = pixels[p * 3 + 1];
      rgba[p * 4 + 2] = pixels[p * 3 + 2];
      rgba[p * 4 + 3] = 255;
    }
  }
  return { largeur, hauteur, rgba };
};

/* ---------- Réduction (moyenne par blocs — correct pour un logo) ---------- */
const reduire = (img, cible) => {
  const { largeur, hauteur, rgba } = img;
  const sortie = Buffer.alloc(cible * cible * 4);
  const ratio = largeur / cible;
  for (let y = 0; y < cible; y += 1) {
    for (let x = 0; x < cible; x += 1) {
      const x0 = Math.floor(x * ratio); const x1 = Math.max(x0 + 1, Math.floor((x + 1) * ratio));
      const y0 = Math.floor(y * ratio); const y1 = Math.max(y0 + 1, Math.floor((y + 1) * ratio));
      let r = 0; let v = 0; let b = 0; let a = 0; let n = 0;
      for (let sy = y0; sy < y1 && sy < hauteur; sy += 1) {
        for (let sx = x0; sx < x1 && sx < largeur; sx += 1) {
          const p = (sy * largeur + sx) * 4;
          r += rgba[p]; v += rgba[p + 1]; b += rgba[p + 2]; a += rgba[p + 3];
          n += 1;
        }
      }
      const q = (y * cible + x) * 4;
      sortie[q] = Math.round(r / n);
      sortie[q + 1] = Math.round(v / n);
      sortie[q + 2] = Math.round(b / n);
      sortie[q + 3] = Math.round(a / n);
    }
  }
  return sortie;
};

/* ---------- Écriture PNG ---------- */
const ecrirePNG = (rgba, taille) => {
  const pas = taille * 4;
  const brut = Buffer.alloc((pas + 1) * taille);
  for (let y = 0; y < taille; y += 1) {
    brut[y * (pas + 1)] = 0; /* filtre None */
    rgba.copy(brut, y * (pas + 1) + 1, y * pas, y * pas + pas);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(taille, 0);
  ihdr.writeUInt32BE(taille, 4);
  ihdr[8] = 8;  /* profondeur */
  ihdr[9] = 6;  /* RGBA */
  const morceau = (nom, donnees) => {
    const t = Buffer.concat([Buffer.from(nom, 'latin1'), donnees]);
    const l = Buffer.alloc(4);
    l.writeUInt32BE(donnees.length, 0);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc32(t) >>> 0, 0);
    return Buffer.concat([l, t, c]);
  };
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    morceau('IHDR', ihdr),
    morceau('IDAT', zlib.deflateSync(brut, { level: 9 })),
    morceau('IEND', Buffer.alloc(0)),
  ]);
};

/* ---------- CRC32 (requis par le format PNG) ---------- */
const TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = -1;
  for (let i = 0; i < buf.length; i += 1) c = TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return c ^ -1;
};

/* ---------- Écriture ICO (PNG encapsulé) ---------- */
const ecrireICO = (images) => {
  /* images : [{ taille, png }] — la plus grande d'abord est acceptée */
  const entete = Buffer.alloc(6);
  entete.writeUInt16LE(0, 0);              /* réservé */
  entete.writeUInt16LE(1, 2);              /* type 1 = icône */
  entete.writeUInt16LE(images.length, 4);
  const entrees = [];
  let decalage = 6 + images.length * 16;
  images.forEach(({ taille, png }) => {
    const e = Buffer.alloc(16);
    e[0] = taille >= 256 ? 0 : taille;      /* 0 signifie 256 */
    e[1] = taille >= 256 ? 0 : taille;
    e[2] = 0;                                /* couleurs de la palette */
    e[3] = 0;                                /* réservé */
    e.writeUInt16LE(1, 4);                   /* plans */
    e.writeUInt16LE(32, 6);                  /* bits par pixel */
    e.writeUInt32LE(png.length, 8);
    e.writeUInt32LE(decalage, 12);
    decalage += png.length;
    entrees.push(e);
  });
  return Buffer.concat([entete, ...entrees, ...images.map((i) => i.png)]);
};

/* ================= Exécution ================= */
/* La source est l'icône composée (assets/icone.png), produite par
   outils-composer-icone.cjs : le logo détouré sur un fond arrondi sombre.
   Le logo seul disparaît sur fond clair, et le logo à fond noir plein
   s'affiche comme un carré noir dans la barre des tâches. */
const SOURCE = process.argv[2] || 'assets/icone.png';
const img = lirePNG(SOURCE);
console.log('source :', SOURCE, img.largeur + 'x' + img.hauteur);

const TAILLES = [16, 20, 24, 32, 40, 48, 64, 128, 256];
const images = TAILLES.map((taille) => {
  /* On repart toujours de l'image d'origine : réduire de proche en proche
     accumule les pertes. */
  const petit = taille === img.largeur ? img.rgba : reduire(img, taille);
  return { taille, png: ecrirePNG(petit, taille) };
});

fs.mkdirSync('icons', { recursive: true });
fs.writeFileSync('icons/icon.ico', ecrireICO(images));
fs.writeFileSync('icons/icon.png', images[images.length - 1].png);
/* Icônes attendues par le bundle Windows */
fs.writeFileSync('icons/32x32.png', images.find((i) => i.taille === 32).png);
fs.writeFileSync('icons/128x128.png', images.find((i) => i.taille === 128).png);
fs.writeFileSync('icons/128x128@2x.png', images.find((i) => i.taille === 256).png);
fs.writeFileSync('icons/icon.icns', images.find((i) => i.taille === 256).png); /* macOS : hors périmètre, mais évite une erreur de build */

images.forEach(({ taille, png }) => console.log('  ' + String(taille).padStart(3) + 'x' + taille, png.length, 'octets'));

/* Image RGBA brute, incluse dans le binaire Rust pour l'icône de fenêtre.
   `tauri::image::Image::new` attend des pixels, pas un PNG : on lui fournit
   ce fichier, ce qui évite d'embarquer un décodeur PNG dans l'exécutable. */
const COTE_RGBA = 256;
const rgba = img.largeur === COTE_RGBA ? img.rgba : reduire(img, COTE_RGBA);
fs.writeFileSync('icons/icon.rgba', rgba);
console.log('  ' + COTE_RGBA + 'x' + COTE_RGBA + ' (RGBA brut, pour l\'icône de fenêtre) ' + rgba.length + ' octets');

console.log('écrit : icons/ (icon.ico, icon.png, icon.rgba, 32x32.png, 128x128.png, 128x128@2x.png)');
console.log('Rappel : lancer `cargo build` ensuite pour intégrer icons/icon.rgba au binaire.');

/* Compose l'icône de l'application : le logo détouré (blanc) posé sur un fond
   arrondi sombre.

   Pourquoi c'est nécessaire : le logo est blanc à fond transparent. Utilisé tel
   quel, il disparaît sur un fond clair ; avec le fond noir plein fourni, il
   s'affiche comme un carré noir dans la barre des tâches. Un fond arrondi sombre
   sous le logo tient sur les trois fonds (clair, sombre, couleur).

   Usage : node outils-composer-icone.cjs
   Produit : assets/icone.png — image carrée, coins transparents. */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

/* ---------- Lecture PNG ---------- */
const lirePNG = (chemin) => {
  const b = fs.readFileSync(chemin);
  const largeur = b.readUInt32BE(16);
  const hauteur = b.readUInt32BE(20);
  const colorType = b[25];
  if (colorType !== 6 && colorType !== 2) throw new Error('type de couleur non géré : ' + colorType);
  const morceaux = [];
  let i = 8;
  while (i < b.length) {
    const l = b.readUInt32BE(i);
    const nom = b.slice(i + 4, i + 8).toString('latin1');
    if (nom === 'IDAT') morceaux.push(b.slice(i + 8, i + 8 + l));
    i += 12 + l;
    if (nom === 'IEND') break;
  }
  const brut = zlib.inflateSync(Buffer.concat(morceaux));
  const canaux = colorType === 6 ? 4 : 3;
  const pas = largeur * canaux;
  const pixels = Buffer.alloc(pas * hauteur);
  let precedent = Buffer.alloc(pas);
  for (let y = 0; y < hauteur; y += 1) {
    const filtre = brut[y * (pas + 1)];
    const ligne = brut.slice(y * (pas + 1) + 1, y * (pas + 1) + 1 + pas);
    const courante = Buffer.alloc(pas);
    for (let x = 0; x < pas; x += 1) {
      const g = x >= canaux ? courante[x - canaux] : 0;
      const h = precedent[x];
      const c = x >= canaux ? precedent[x - canaux] : 0;
      let v = ligne[x];
      if (filtre === 1) v += g;
      else if (filtre === 2) v += h;
      else if (filtre === 3) v += Math.floor((g + h) / 2);
      else if (filtre === 4) {
        const p = g + h - c;
        const da = Math.abs(p - g); const db = Math.abs(p - h); const dc = Math.abs(p - c);
        v += (da <= db && da <= dc) ? g : (db <= dc ? h : c);
      }
      courante[x] = v & 0xff;
    }
    courante.copy(pixels, y * pas);
    precedent = courante;
  }
  const rgba = Buffer.alloc(largeur * hauteur * 4);
  for (let p = 0; p < largeur * hauteur; p += 1) {
    if (canaux === 4) pixels.copy(rgba, p * 4, p * 4, p * 4 + 4);
    else {
      rgba[p * 4] = pixels[p * 3];
      rgba[p * 4 + 1] = pixels[p * 3 + 1];
      rgba[p * 4 + 2] = pixels[p * 3 + 2];
      rgba[p * 4 + 3] = 255;
    }
  }
  return { largeur, hauteur, rgba };
};

/* ---------- Réduction par moyenne de blocs ---------- */
const reduire = (img, cible) => {
  const { largeur, hauteur, rgba } = img;
  const sortie = Buffer.alloc(cible * cible * 4);
  const ratio = largeur / cible;
  for (let y = 0; y < cible; y += 1) {
    for (let x = 0; x < cible; x += 1) {
      const x0 = Math.floor(x * ratio); const x1 = Math.max(x0 + 1, Math.floor((x + 1) * ratio));
      const y0 = Math.floor(y * ratio); const y1 = Math.max(y0 + 1, Math.floor((y + 1) * ratio));
      let r = 0; let v = 0; let bl = 0; let a = 0; let n = 0;
      for (let sy = y0; sy < y1 && sy < hauteur; sy += 1) {
        for (let sx = x0; sx < x1 && sx < largeur; sx += 1) {
          const p = (sy * largeur + sx) * 4;
          r += rgba[p]; v += rgba[p + 1]; bl += rgba[p + 2]; a += rgba[p + 3];
          n += 1;
        }
      }
      const q = (y * cible + x) * 4;
      sortie[q] = Math.round(r / n);
      sortie[q + 1] = Math.round(v / n);
      sortie[q + 2] = Math.round(bl / n);
      sortie[q + 3] = Math.round(a / n);
    }
  }
  return sortie;
};

/* ---------- Écriture PNG ---------- */
const TABLE_CRC = (() => {
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
  for (let i = 0; i < buf.length; i += 1) c = TABLE_CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};

const ecrirePNG = (rgba, largeur, hauteur) => {
  const pas = largeur * 4;
  const brut = Buffer.alloc((pas + 1) * hauteur);
  for (let y = 0; y < hauteur; y += 1) {
    brut[y * (pas + 1)] = 0;
    rgba.copy(brut, y * (pas + 1) + 1, y * pas, y * pas + pas);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(largeur, 0);
  ihdr.writeUInt32BE(hauteur, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const morceau = (nom, d) => {
    const t = Buffer.concat([Buffer.from(nom, 'latin1'), d]);
    const l = Buffer.alloc(4); l.writeUInt32BE(d.length, 0);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc32(t), 0);
    return Buffer.concat([l, t, c]);
  };
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    morceau('IHDR', ihdr),
    morceau('IDAT', zlib.deflateSync(brut, { level: 9 })),
    morceau('IEND', Buffer.alloc(0)),
  ]);
};

/* ================= Composition ================= */
const COTE = 1024;          /* taille de travail, réduite ensuite par Tauri */
const RATIO_LOGO = 0.72;    /* part de la largeur occupée par le logo */

const logo = reduire(lirePNG(path.join('assets', 'logo.png')), Math.round(COTE * RATIO_LOGO));

const toile = Buffer.alloc(COTE * COTE * 4);

/* Rayon des coins, en proportion : un carré très arrondi, comme les icônes
   d'application modernes. */
const RAYON = COTE * 0.22;

const dansArrondi = (x, y) => {
  const cx = Math.min(Math.max(x, RAYON), COTE - RAYON);
  const cy = Math.min(Math.max(y, RAYON), COTE - RAYON);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= RAYON * RAYON ? 1 : 0;
};

/* Fond : dégradé vertical sombre, du gris ardoise au presque noir. */
for (let y = 0; y < COTE; y += 1) {
  const t = y / (COTE - 1);
  const r = Math.round(38 - 20 * t);
  const v = Math.round(40 - 21 * t);
  const b = Math.round(46 - 24 * t);
  for (let x = 0; x < COTE; x += 1) {
    const o = (y * COTE + x) * 4;
    /* Anticrénelage du bord : on couvre 1,5 px */
    const dedans = dansArrondi(x + 0.5, y + 0.5);
    let couverture = dedans;
    if (!dedans) {
      for (let sy = -1; sy <= 1 && !couverture; sy += 1) {
        for (let sx = -1; sx <= 1; sx += 1) {
          if (dansArrondi(x + 0.5 + sx, y + 0.5 + sy)) { couverture = 0.5; break; }
        }
      }
    }
    toile[o] = r;
    toile[o + 1] = v;
    toile[o + 2] = b;
    toile[o + 3] = Math.round(255 * couverture);
  }
}

/* Logo centré par-dessus */
const offset = Math.round((COTE - Math.round(COTE * RATIO_LOGO)) / 2);
const coteLogo = Math.round(COTE * RATIO_LOGO);
for (let y = 0; y < coteLogo; y += 1) {
  for (let x = 0; x < coteLogo; x += 1) {
    const s = (y * coteLogo + x) * 4;
    const a = logo[s + 3] / 255;
    if (a === 0) continue;
    const o = ((offset + y) * COTE + (offset + x)) * 4;
    toile[o] = Math.round(logo[s] * a + toile[o] * (1 - a));
    toile[o + 1] = Math.round(logo[s + 1] * a + toile[o + 1] * (1 - a));
    toile[o + 2] = Math.round(logo[s + 2] * a + toile[o + 2] * (1 - a));
    /* L'alpha du logo ne doit pas percer le fond : on garde celui du fond */
  }
}

fs.writeFileSync(path.join('assets', 'icone.png'), ecrirePNG(toile, COTE, COTE));
console.log('assets/icone.png écrit —', COTE + 'x' + COTE, '— logo à', Math.round(RATIO_LOGO * 100) + ' % sur fond arrondi sombre');

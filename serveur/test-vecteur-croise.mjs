/* Vecteur croisé : un jeton signé par le SERVEUR (JavaScript, WebCrypto) doit
   être accepté par l'APPLICATION (Rust). Et inversement, un jeton falsifié doit
   être refusé.

   C'est le test le plus précieux du système (voir LICENSE_SYSTEM_BLUEPRINT.md
   §6.5) : il attrape toute divergence d'encodage entre les deux langages, un
   défaut qui ne se verrait qu'à la première vraie vente.

   Usage : node serveur/test-vecteur-croise.mjs

   Prérequis : avoir lancé `node outils-licence.cjs` (paire de clés générée) et
   `cargo build` au moins une fois. */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { webcrypto } from 'node:crypto';

const crypto = webcrypto;

/* ---------- Lecture de la clé privée ---------- */
const cheminSecrets = 'serveur/.dev.vars';
if (!existsSync(cheminSecrets)) {
  console.error('✗ ' + cheminSecrets + ' absent.');
  console.error('  Lancez d\'abord : node outils-licence.cjs');
  process.exit(1);
}
const secrets = readFileSync(cheminSecrets, 'utf8');
const graineHex = (secrets.match(/^LICENSE_PRIVATE_KEY=(.+)$/m) || [])[1];
if (!graineHex) {
  console.error('✗ LICENSE_PRIVATE_KEY introuvable dans ' + cheminSecrets);
  process.exit(1);
}

/* ---------- Reprise de la signature du serveur ---------- */
const PREFIXE_PKCS8 = '302e020100300506032b657004220420';

const hexVersOctets = (hex) => {
  const propre = String(hex).trim();
  const octets = new Uint8Array(propre.length / 2);
  for (let i = 0; i < octets.length; i += 1) {
    octets[i] = parseInt(propre.substr(i * 2, 2), 16);
  }
  return octets;
};

const base64url = (octets) => {
  let bin = '';
  octets.forEach((o) => { bin += String.fromCharCode(o); });
  return Buffer.from(bin, 'binary').toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/** Identique à `signerJeton` de serveur/src/index.js. */
async function signerJeton(charge, graine) {
  const octets = new TextEncoder().encode(JSON.stringify(charge));
  const der = new Uint8Array([...hexVersOctets(PREFIXE_PKCS8), ...hexVersOctets(graine)]);
  const cle = await crypto.subtle.importKey('pkcs8', der, { name: 'Ed25519' }, false, ['sign']);
  const signature = new Uint8Array(await crypto.subtle.sign({ name: 'Ed25519' }, cle, octets));
  return `${base64url(octets)}.${base64url(signature)}`;
}

/* ---------- Vérification côté Rust ---------- */
/* On passe par un petit programme Rust jetable qui utilise le VRAI code de
   vérification (src/licence.rs), et non une réécriture : c'est tout l'intérêt
   du vecteur croisé. */
const FICHIER_TEST = 'src/bin/verif_jeton.rs';

const ecrireVerificateur = () => {
  mkdirSync('src/bin', { recursive: true });
  const source = `/* Binaire de test jetable : vérifie un jeton avec le code de production.
   Généré par serveur/test-vecteur-croise.mjs — ne pas modifier à la main. */
fn main() {
    let mut args = std::env::args().skip(1);
    let jeton = args.next().unwrap_or_default();
    let machine = args.next().unwrap_or_default();
    match wendo_lib::licence::verifier_jeton(&jeton, &machine) {
        Ok(charge) => {
            println!("OK");
            println!("{}", charge.l);
        }
        Err(motif) => {
            println!("REFUS");
            println!("{}", motif);
        }
    }
}
`;
  writeFileSync(FICHIER_TEST, source);
};

const nettoyer = () => {
  try { execFileSync('node', ['-e', `require('fs').unlinkSync('${FICHIER_TEST}')`], { stdio: 'ignore' }); } catch { /* déjà absent */ }
};

/* ---------- Déroulement ---------- */
const MACHINE = 'A1B2-C3D4';
const resultats = [];
const verifier = (nom, condition, detail = '') => {
  resultats.push({ nom, ok: condition, detail });
  console.log((condition ? '  ✓ ' : '  ✗ ') + nom + (detail && !condition ? ' — ' + detail : ''));
};

async function main() {
  console.log('');
  console.log('=== Vecteur croisé serveur → application ===');
  console.log('');

  ecrireVerificateur();

  /* On compile une fois */
  process.stdout.write('  Compilation du vérificateur… ');
  try {
    execFileSync('cargo', ['build', '--bin', 'verif_jeton'], { stdio: 'pipe' });
    console.log('fait');
  } catch (e) {
    console.log('ÉCHEC');
    console.error(e.stderr ? e.stderr.toString().slice(-2000) : e.message);
    nettoyer();
    process.exit(1);
  }

  const binaire = process.platform === 'win32'
    ? 'target/debug/verif_jeton.exe'
    : 'target/debug/verif_jeton';

  const verifierAvecRust = (jeton, machine) => {
    const sortie = execFileSync(binaire, [jeton, machine], { encoding: 'utf8' });
    const lignes = sortie.trim().split('\n');
    return { ok: lignes[0] === 'OK', detail: lignes[1] || '' };
  };

  console.log('');
  console.log('--- Cas attendus comme VALIDES ---');

  /* 1. Jeton normal, à perpétuité */
  const jetonValide = await signerJeton(
    { v: 1, m: MACHINE, n: '', l: 'ABC-123', i: Math.floor(Date.now() / 1000), x: 0 },
    graineHex,
  );
  const r1 = verifierAvecRust(jetonValide, MACHINE);
  verifier('jeton signé par le serveur, accepté par l\'application', r1.ok, r1.detail);
  verifier('identifiant de licence restitué correctement', r1.detail === 'ABC-123', r1.detail);

  /* 2. Caractères accentués et non-ASCII dans la charge utile */
  const jetonAccents = await signerJeton(
    { v: 1, m: MACHINE, n: '', l: 'Boutique-Éàü-42', i: Math.floor(Date.now() / 1000), x: 0 },
    graineHex,
  );
  const r2 = verifierAvecRust(jetonAccents, MACHINE);
  verifier('accents transmis sans altération', r2.ok && r2.detail === 'Boutique-Éàü-42', r2.detail);

  console.log('');
  console.log('--- Cas attendus comme REFUSÉS ---');

  /* 3. Jeton d'une autre machine */
  const jetonAutre = await signerJeton(
    { v: 1, m: 'ZZZZ-ZZZZ', n: '', l: 'ABC-123', i: Math.floor(Date.now() / 1000), x: 0 },
    graineHex,
  );
  const r3 = verifierAvecRust(jetonAutre, MACHINE);
  verifier('jeton visant une autre machine', !r3.ok, r3.detail);
  verifier('message explicite sur le partage d\'appareil', /autre ordinateur/.test(r3.detail), r3.detail);

  /* 4. Charge utile modifiée après signature */
  const parties = jetonValide.split('.');
  const chargeModifiee = Buffer.from(parties[0], 'base64url').toString('utf8').replace('ABC-123', 'XXX-999');
  const jetonFalsifie = base64url(new TextEncoder().encode(chargeModifiee)) + '.' + parties[1];
  const r4 = verifierAvecRust(jetonFalsifie, MACHINE);
  verifier('charge utile modifiée sans resigner', !r4.ok, r4.detail);

  /* 5. Signature d'une autre clé privée */
  const autreGraine = '11'.repeat(32);
  const jetonAutreCle = await signerJeton(
    { v: 1, m: MACHINE, n: '', l: 'ABC-123', i: Math.floor(Date.now() / 1000), x: 0 },
    autreGraine,
  );
  const r5 = verifierAvecRust(jetonAutreCle, MACHINE);
  verifier('jeton signé avec une autre clé privée', !r5.ok, r5.detail);

  /* 6. Version de format inconnue */
  const jetonV2 = await signerJeton(
    { v: 2, m: MACHINE, n: '', l: 'ABC-123', i: Math.floor(Date.now() / 1000), x: 0 },
    graineHex,
  );
  const r6 = verifierAvecRust(jetonV2, MACHINE);
  verifier('version de format inconnue', !r6.ok, r6.detail);

  /* 7. Licence expirée */
  const jetonExpire = await signerJeton(
    { v: 1, m: MACHINE, n: '', l: 'ABC-123', i: 1_000_000_000, x: 1_000_000_001 },
    graineHex,
  );
  const r7 = verifierAvecRust(jetonExpire, MACHINE);
  verifier('licence expirée', !r7.ok && /expir/.test(r7.detail), r7.detail);

  console.log('');
  nettoyer();

  /* ---------- Bilan ---------- */
  const echecs = resultats.filter((r) => !r.ok);
  console.log('');
  if (echecs.length) {
    console.log('✗ ÉCHEC : ' + echecs.length + ' cas sur ' + resultats.length + ' ne passent pas.');
    console.log('');
    console.log('  Si les cas VALIDES échouent, le serveur et l\'application ont');
    console.log('  divergé. Vérifiez en premier l\'encodage base64url (sans remplissage)');
    console.log('  et le fait que les octets signés sont EXACTEMENT ceux transmis.');
    console.log('  Si ce sont les cas REFUSÉS qui échouent, la vérification est trop');
    console.log('  permissive : c\'est une faille, à corriger immédiatement.');
    process.exit(1);
  }
  console.log('✓ TOUS LES CAS PASSENT (' + resultats.length + ')');
  console.log('');
  console.log('  Le serveur et l\'application sont d\'accord sur le format du jeton.');
  console.log('');
}

main().catch(async (e) => {
  console.error(e);
  nettoyer();
  process.exit(1);
});

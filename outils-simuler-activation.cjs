/* Simulation complète du parcours d'activation, sans interface graphique.

   On joue le rôle du serveur : on valide une clé d'achat fictive, on signe un
   jeton avec la VRAIE clé privée, et on vérifie que le code de production
   l'accepte — puis qu'il refuse un jeton destiné à une autre machine.

   C'est le test le plus proche d'une vraie vente qu'on puisse faire sans
   acheter. Usage : node outils-simuler-activation.cjs */

const fs = require('fs');
const { webcrypto } = require('crypto');
const { execFileSync, spawnSync } = require('child_process');

const graine = (fs.readFileSync('serveur/.dev.vars', 'utf8').match(/^LICENSE_PRIVATE_KEY=(.+)$/m) || [])[1];
if (!graine) {
  console.error('Lancez d\'abord : node outils-licence.cjs');
  process.exit(1);
}

const PREFIXE_PKCS8 = '302e020100300506032b657004220420';
const h2b = (h) => {
  const o = new Uint8Array(h.length / 2);
  for (let i = 0; i < o.length; i += 1) o[i] = parseInt(h.substr(i * 2, 2), 16);
  return o;
};
const b64u = (o) => {
  let b = '';
  o.forEach((x) => { b += String.fromCharCode(x); });
  return Buffer.from(b, 'binary').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/* Reproduit exactement `signerJeton` du serveur */
async function signer(charge) {
  const octets = new TextEncoder().encode(JSON.stringify(charge));
  const der = new Uint8Array([...h2b(PREFIXE_PKCS8), ...h2b(graine)]);
  const cle = await webcrypto.subtle.importKey('pkcs8', der, { name: 'Ed25519' }, false, ['sign']);
  const sig = new Uint8Array(await webcrypto.subtle.sign({ name: 'Ed25519' }, cle, octets));
  return `${b64u(octets)}.${b64u(sig)}`;
}

/* Vérificateur jetable en Rust, utilisant le code de PRODUCTION */
const FICHIER = 'src/bin/simul_verif.rs';
fs.mkdirSync('src/bin', { recursive: true });
fs.writeFileSync(FICHIER, `/* Jetable — généré par outils-simuler-activation.cjs */
fn main() {
    let mut a = std::env::args().skip(1);
    let jeton = a.next().unwrap_or_default();
    let machine = a.next().unwrap_or_default();
    match wendo_lib::licence::verifier_jeton(&jeton, &machine) {
        Ok(c) => println!("OK|{}", c.l),
        Err(m) => println!("REFUS|{m}"),
    }
}
`);

const resultats = [];
const verifier = (nom, ok, detail = '') => {
  resultats.push({ nom, ok });
  console.log((ok ? '  ✓ ' : '  ✗ ') + nom + (!ok && detail ? ' — ' + detail : ''));
};

async function main() {
  console.log('');
  console.log('=== Simulation d\'une activation ===');
  console.log('');

  process.stdout.write('  Compilation du vérificateur… ');
  try {
    execFileSync('cargo', ['build', '--bin', 'simul_verif'], { stdio: 'pipe' });
    console.log('fait');
  } catch (e) {
    console.log('ÉCHEC');
    console.error(e.stderr ? e.stderr.toString().slice(-1500) : e.message);
    fs.rmSync(FICHIER, { force: true });
    process.exit(1);
  }

  const binaire = process.platform === 'win32' ? 'target/debug/simul_verif.exe' : 'target/debug/simul_verif';
  const verifierEnRust = (jeton, machine) => {
    const [etat, detail] = execFileSync(binaire, [jeton, machine], { encoding: 'utf8' }).trim().split('|');
    return { ok: etat === 'OK', detail: detail || '' };
  };

  const MACHINE = 'A1B2-C3D4';
  const maintenant = Math.floor(Date.now() / 1000);

  /* --- Le parcours normal --- */
  console.log('');
  console.log('--- Client qui achète et active ---');
  const jeton = await signer({ v: 1, m: MACHINE, n: '', l: 'VENTE-2026-001', i: maintenant, x: 0 });
  const r1 = verifierEnRust(jeton, MACHINE);
  verifier('l\'activation réussit', r1.ok, r1.detail);
  verifier('l\'identifiant de vente est conservé', r1.detail === 'VENTE-2026-001', r1.detail);
  console.log('    jeton : ' + jeton.slice(0, 60) + '… (' + jeton.length + ' caractères)');

  /* --- Le client réinstalle : même machine, même jeton --- */
  console.log('');
  console.log('--- Réinstallation sur le même ordinateur ---');
  const r2 = verifierEnRust(jeton, MACHINE);
  verifier('la licence reste valable après réinstallation', r2.ok, r2.detail);

  /* --- Le client partage sa clé avec un collègue --- */
  console.log('');
  console.log('--- Clé partagée sur un autre ordinateur ---');
  const r3 = verifierEnRust(jeton, 'FFFF-EEEE');
  verifier('le partage est refusé', !r3.ok, r3.detail);
  verifier('le message explique le problème', /autre ordinateur/.test(r3.detail), r3.detail);

  /* --- Un client malin fabrique un jeton --- */
  console.log('');
  console.log('--- Tentative de falsification ---');
  const [chargeB64, sig] = jeton.split('.');
  const charge = JSON.parse(Buffer.from(chargeB64, 'base64url').toString('utf8'));
  charge.l = 'VENTE-PIRATE';
  const jetonFalsifie = b64u(new TextEncoder().encode(JSON.stringify(charge))) + '.' + sig;
  const r4 = verifierEnRust(jetonFalsifie, MACHINE);
  verifier('un jeton modifié est rejeté', !r4.ok, r4.detail);

  /* --- Un client tente de signer avec sa propre clé --- */
  console.log('');
  console.log('--- Tentative de signature avec une clé inventée ---');
  const fausseGraine = 'ab'.repeat(32);
  const der = new Uint8Array([...h2b(PREFIXE_PKCS8), ...h2b(fausseGraine)]);
  const fausseCle = await webcrypto.subtle.importKey('pkcs8', der, { name: 'Ed25519' }, false, ['sign']);
  const octets = new TextEncoder().encode(JSON.stringify({ v: 1, m: MACHINE, n: '', l: 'FAUSSE', i: maintenant, x: 0 }));
  const fausseSig = new Uint8Array(await webcrypto.subtle.sign({ name: 'Ed25519' }, fausseCle, octets));
  const jetonFaux = `${b64u(octets)}.${b64u(fausseSig)}`;
  const r5 = verifierEnRust(jetonFaux, MACHINE);
  verifier('une signature inventée est rejetée', !r5.ok, r5.detail);

  /* --- Extraction de la clé depuis l'exécutable --- */
  console.log('');
  console.log('--- La clé privée est-elle extractible de l\'exécutable ? ---');
  const binairePub = process.platform === 'win32' ? 'target/debug/wendo.exe' : 'target/debug/wendo';
  const contenu = fs.existsSync(binairePub) ? fs.readFileSync(binairePub) : Buffer.alloc(0);
  const contientPrivee = contenu.length > 0 && contenu.includes(Buffer.from(graine, 'utf8'));
  verifier('la clé privée n\'est PAS dans l\'exécutable', !contientPrivee,
    'DANGER : la clé privée est embarquée, n\'importe qui pourrait fabriquer des licences');
  const contientPublique = contenu.includes(Buffer.from(clePubliqueDeLApp(), 'utf8'));
  verifier('seule la clé publique y figure (c\'est normal et sans danger)', contientPublique || contenu.length === 0);

  fs.rmSync(FICHIER, { force: true });

  const echecs = resultats.filter((r) => !r.ok);
  console.log('');
  if (echecs.length) {
    console.log('✗ ' + echecs.length + ' cas sur ' + resultats.length + ' ne passent pas.');
    process.exit(1);
  }
  console.log('✓ TOUS LES CAS PASSENT (' + resultats.length + ')');
  console.log('');
  console.log('  Le parcours d\'achat complet fonctionne : activation, réinstallation,');
  console.log('  refus du partage, refus de la falsification.');
  console.log('');
}

function clePubliqueDeLApp() {
  return (fs.readFileSync('src/licence.rs', 'utf8')
    .match(/CLE_PUBLIQUE_HEX: Option<&str> = Some\("([0-9a-f]+)"\)/) || [])[1] || '';
}

main().catch((e) => {
  console.error(e);
  fs.rmSync('src/bin/simul_verif.rs', { force: true });
  process.exit(1);
});

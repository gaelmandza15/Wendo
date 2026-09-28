/* Vérifie que le Worker signe un jeton que l'application accepte.

   On appelle la VRAIE fonction `signerJeton` du serveur (celle qui tourne dans
   le Worker), puis on fait vérifier le résultat par le VRAI code Rust de
   l'application. C'est le test décisif avant de déployer.

   Usage : node test-signature-locale.mjs */

import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { signerJeton } from './src/index.js';

const graine = (readFileSync('.dev.vars', 'utf8').match(/^LICENSE_PRIVATE_KEY=(.+)$/m) || [])[1];
if (!graine) {
  console.error('LICENSE_PRIVATE_KEY absente de .dev.vars');
  process.exit(1);
}

/* Vérificateur jetable, utilisant le code de production */
const FICHIER = '../src/bin/verif_locale.rs';
mkdirSync('../src/bin', { recursive: true });
writeFileSync(FICHIER, `/* Jetable — généré par serveur/test-signature-locale.mjs */
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

console.log('');
console.log('=== Signature du Worker, vérifiée par l\'application ===');
console.log('');

process.stdout.write('  Compilation du vérificateur… ');
try {
  execFileSync('cargo', ['build', '--bin', 'verif_locale', '--manifest-path', '../Cargo.toml'], { stdio: 'pipe' });
  console.log('fait');
} catch (e) {
  console.log('ÉCHEC');
  console.error(e.stderr ? e.stderr.toString().slice(-1200) : e.message);
  rmSync(FICHIER, { force: true });
  process.exit(1);
}

const binaire = process.platform === 'win32' ? '../target/debug/verif_locale.exe' : '../target/debug/verif_locale';
const MACHINE = 'A1B2-C3D4';

const jeton = await signerJeton(
  { v: 1, m: MACHINE, n: '', l: 'VENTE-LOCALE-001', i: Math.floor(Date.now() / 1000), x: 0 },
  graine,
);
console.log('  jeton produit :', jeton.length, 'caractères');

const sortie = execFileSync(binaire, [jeton, MACHINE], { encoding: 'utf8' }).trim().split('|');
console.log('');
console.log('  résultat de la vérification :', sortie[0]);
console.log('  identifiant de licence      :', sortie[1]);

/* Vérifier aussi qu'un jeton d'une autre machine est refusé */
const sortie2 = execFileSync(binaire, [jeton, 'ZZZZ-ZZZZ'], { encoding: 'utf8' }).trim().split('|');

rmSync(FICHIER, { force: true });

console.log('');
const ok = sortie[0] === 'OK' && sortie[1] === 'VENTE-LOCALE-001' && sortie2[0] === 'REFUS';
if (ok) {
  console.log('✓ Le Worker local signe des jetons que l\'application accepte.');
  console.log('✓ Un jeton visant une autre machine est bien refusé.');
  console.log('');
  console.log('  Le serveur est prêt à être déployé.');
  console.log('');
} else {
  console.log('✗ Anomalie : ne déployez pas en l\'état.');
  console.log('  valide   :', sortie);
  console.log('  autre PC :', sortie2);
  process.exit(1);
}

/* Licences — vérification HORS-LIGNE des jetons signés.

   Principe (voir LICENSE_SYSTEM_BLUEPRINT.md) :

     1. Le client achète sur la boutique du fournisseur, qui émet une clé.
     2. Un petit serveur sans état échange cette clé contre un JETON signé en
        Ed25519 avec SA clé privée.
     3. L'application vérifie ce jeton LOCALEMENT, avec la clé publique
        embarquée ci-dessous. Aucun réseau, aucune limite de durée.

   Pourquoi Ed25519 et non un HMAC : un HMAC est symétrique, donc la clé qui
   vérifie est celle qui signe. Embarquée dans l'exécutable, elle s'extrait en
   quelques minutes et permet de fabriquer des licences à l'infini. Ici,
   l'application ne détient qu'une clé PUBLIQUE : elle peut vérifier, pas signer.

   Le jeton porte le code machine : une clé partagée sur un autre poste est
   refusée. */

use base64::engine::general_purpose::URL_SAFE_NO_PAD as B64URL;
use base64::Engine;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::PathBuf;
use tauri::Manager;

pub const VERSION_JETON: u8 = 1;

#[cfg(test)]
pub const TAILLE_MAX_JETON: usize = 4096;

/* ================= Clé publique ================= */

/* Remplacée par outils-licence.cjs lors de la génération de la paire de clés.
   Tant qu'elle vaut None, l'application refuse toute activation : mieux vaut
   un refus explicite qu'une acceptation silencieuse de n'importe quoi. */
pub const CLE_PUBLIQUE_HEX: Option<&str> = Some("fb279e9f24cd3ce3c5fc5b4d9e8cffda3b18aee400e4ed659f1dbcf887495380");

/// Décode la clé publique hexadécimale en 32 octets.
fn cle_publique() -> Result<[u8; 32], String> {
    let hex = CLE_PUBLIQUE_HEX.ok_or(
        "Aucune clé publique de licence n'est configurée dans cette version. \
         Lancez outils-licence.cjs puis recompilez.",
    )?;
    let octets = decoder_hex(hex).ok_or("Clé publique de licence illisible (hexadécimal attendu)")?;
    if octets.len() != 32 {
        return Err(format!(
            "Clé publique de licence invalide : {} octets au lieu de 32",
            octets.len()
        ));
    }
    let mut cle = [0u8; 32];
    cle.copy_from_slice(&octets);
    Ok(cle)
}

fn decoder_hex(s: &str) -> Option<Vec<u8>> {
    let s = s.trim();
    if s.len() % 2 != 0 { return None; }
    (0..s.len() / 2)
        .map(|i| u8::from_str_radix(&s[i * 2..i * 2 + 2], 16).ok())
        .collect()
}

/* ================= Contenu du jeton ================= */

/// Charge utile du jeton. Les noms courts gardent le jeton compact (~200 caractères).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChargeUtile {
    /// Version du format
    pub v: u8,
    /// Code machine visé (anti-partage)
    pub m: String,
    /// Nom du client — jamais affiché dans l'interface (voir piège n°8 du guide)
    #[serde(default)]
    pub n: String,
    /// Identifiant de licence chez le fournisseur
    #[serde(default)]
    pub l: String,
    /// Date d'émission (unix)
    #[serde(default)]
    pub i: i64,
    /// Expiration (unix) — 0 = licence à perpétuité
    #[serde(default)]
    pub x: i64,
}

/* ================= Vérification ================= */

/// Résultat d'une vérification : le motif est destiné à l'affichage, jamais au diagnostic fin.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EtatLicence {
    pub active: bool,
    /// 'active' | 'demo' | 'expiree' | 'invalide' | 'autre-machine'
    pub situation: String,
    /// Code machine de CE poste (à transmettre au vendeur en cas de problème)
    pub code_machine: String,
    /// Date d'activation (unix), 0 si jamais activée
    pub active_le: i64,
    /// Dernière vérification auprès du serveur (unix)
    pub verifie_le: i64,
}

impl EtatLicence {
    fn demo(motif: &str, code_machine: &str) -> Self {
        Self {
            active: false,
            situation: motif.to_string(),
            code_machine: code_machine.to_string(),
            active_le: 0,
            verifie_le: 0,
        }
    }
}

/// Vérifie un jeton pour ce poste précis.
///
/// L'ordre compte : on vérifie la SIGNATURE avant de lire quoi que ce soit du
/// contenu, pour ne jamais faire confiance à des données non authentifiées.
pub fn verifier_jeton(jeton: &str, code_machine_attendu: &str) -> Result<ChargeUtile, String> {
    let (partie_charge, partie_signature) = jeton
        .split_once('.')
        .ok_or("Clé de licence illisible")?;

    let charge = B64URL.decode(partie_charge).map_err(|_| "Clé de licence illisible")?;
    let signature = B64URL.decode(partie_signature).map_err(|_| "Clé de licence illisible")?;
    if signature.len() != 64 {
        return Err("Clé de licence illisible".into());
    }

    /* 1. La signature, portant sur les octets EXACTEMENT tels que transmis.
       On ne re-sérialise jamais le JSON : cela évite toute divergence de
       canonicalisation entre le serveur (JavaScript) et ce code (Rust). */
    let cle = cle_publique()?;
    let cle_verif = ed25519_dalek::VerifyingKey::from_bytes(&cle)
        .map_err(|_| "Clé publique de licence invalide")?;
    let mut sig = [0u8; 64];
    sig.copy_from_slice(&signature);
    let signature = ed25519_dalek::Signature::from_bytes(&sig);

    use ed25519_dalek::Verifier;
    cle_verif
        .verify(&charge, &signature)
        .map_err(|_| "Cette clé de licence n'est pas valide")?;

    /* 2. Le contenu, désormais digne de confiance */
    let donnees: ChargeUtile =
        serde_json::from_slice(&charge).map_err(|_| "Clé de licence illisible")?;

    if donnees.v != VERSION_JETON {
        return Err("Cette clé de licence n'est pas compatible avec cette version".into());
    }
    if donnees.m != code_machine_attendu {
        return Err("Cette licence a été activée sur un autre ordinateur".into());
    }
    if donnees.x > 0 && donnees.x < maintenant() {
        return Err("Cette licence a expiré".into());
    }

    Ok(donnees)
}

pub fn maintenant() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/* ================= Code machine ================= */

/* Identifiant stable du poste : un hachage du nom de machine, du compte et du
   système. Court, lisible, et SANS donnée personnelle — c'est un condensé, pas
   une identité.

   Limite connue : renommer le PC ou le compte Windows change ce code, et le
   client devra faire libérer son appareil. C'est le prix d'un identifiant qui
   n'exige aucun droit administrateur (voir §5 du guide). */
pub fn code_machine() -> String {
    let brut = format!(
        "{}|{}|{}",
        std::env::var("COMPUTERNAME").unwrap_or_default(),
        std::env::var("USERNAME").unwrap_or_default(),
        std::env::consts::OS
    );
    let empreinte = Sha256::digest(brut.as_bytes());
    let hex: String = empreinte[..4].iter().map(|b| format!("{b:02X}")).collect();
    format!("{}-{}", &hex[..4], &hex[4..])
}

/* ================= Stockage du jeton ================= */

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct LicenceStockee {
    /// Clé saisie par le client, conservée TELLE QUELLE (voir piège n°5 du guide)
    #[serde(default)]
    pub cle: String,
    #[serde(default)]
    pub jeton: String,
    #[serde(default)]
    pub code_machine: String,
    #[serde(default)]
    pub active_le: i64,
    #[serde(default)]
    pub verifie_le: i64,
}

pub fn chemin_licence(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dossier = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Dossier de données introuvable : {e}"))?;
    std::fs::create_dir_all(&dossier).map_err(|e| format!("Dossier inaccessible : {e}"))?;
    Ok(dossier.join("licence.json"))
}

pub fn lire_stockee(app: &tauri::AppHandle) -> LicenceStockee {
    chemin_licence(app)
        .ok()
        .and_then(|c| std::fs::read_to_string(c).ok())
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_default()
}

pub fn ecrire_stockee(app: &tauri::AppHandle, l: &LicenceStockee) -> Result<(), String> {
    let chemin = chemin_licence(app)?;
    let texte = serde_json::to_string_pretty(l).map_err(|e| e.to_string())?;
    /* Écriture atomique : un fichier de licence tronqué ferait perdre
       l'activation, que le client ne pourrait récupérer qu'en réactivant. */
    let temporaire = chemin.with_extension("json.tmp");
    std::fs::write(&temporaire, texte).map_err(|e| format!("Écriture impossible : {e}"))?;
    std::fs::rename(&temporaire, &chemin).map_err(|e| {
        let _ = std::fs::remove_file(&temporaire);
        format!("Enregistrement impossible : {e}")
    })
}

/* ================= État courant ================= */

/// État de licence SANS appel réseau : lecture locale du jeton et vérification.
/// C'est ce que l'interface interroge à chaque affichage.
pub fn etat(app: &tauri::AppHandle) -> EtatLicence {
    let code = code_machine();
    let stockee = lire_stockee(app);

    if stockee.jeton.is_empty() {
        return EtatLicence::demo("demo", &code);
    }

    match verifier_jeton(&stockee.jeton, &code) {
        Ok(charge) => EtatLicence {
            active: true,
            situation: if charge.x > 0 { "expiree" } else { "active" }.to_string(),
            code_machine: code,
            active_le: stockee.active_le,
            verifie_le: stockee.verifie_le,
        },
        Err(motif) => {
            /* Le jeton ne vaut plus rien pour ce poste : on le signale sans le
               supprimer, pour que le client puisse copier son code machine et
               demander de l'aide sans perdre la trace de son achat. */
            let situation = if motif.contains("autre ordinateur") { "autre-machine" } else { "invalide" };
            EtatLicence::demo(situation, &code)
        }
    }
}

/// Enregistre un jeton après vérification, et retourne l'état qui en résulte.
pub fn enregistrer_jeton(app: &tauri::AppHandle, cle: &str, jeton: &str) -> Result<EtatLicence, String> {
    let code = code_machine();
    /* On vérifie AVANT d'écrire : un jeton invalide ne doit jamais remplacer
       une activation qui fonctionnait. */
    let charge = verifier_jeton(jeton, &code)?;

    let maintenant = maintenant();
    let nouvelle = LicenceStockee {
        cle: cle.to_string(),
        jeton: jeton.to_string(),
        code_machine: code.clone(),
        active_le: maintenant,
        verifie_le: maintenant,
    };
    ecrire_stockee(app, &nouvelle)?;

    Ok(EtatLicence {
        active: true,
        situation: if charge.x > 0 { "expiree" } else { "active" }.to_string(),
        code_machine: code,
        active_le: maintenant,
        verifie_le: maintenant,
    })
}

/// Note la date de dernière vérification réseau, sans toucher au reste.
pub fn noter_verification(app: &tauri::AppHandle, quand: i64) {
    let mut stockee = lire_stockee(app);
    if stockee.jeton.is_empty() { return; }
    stockee.verifie_le = quand;
    let _ = ecrire_stockee(app, &stockee);
}

/// Efface l'activation (utilisé par la désactivation, réservée au support).
pub fn oublier(app: &tauri::AppHandle) -> Result<(), String> {
    let chemin = chemin_licence(app)?;
    if chemin.exists() {
        std::fs::remove_file(&chemin).map_err(|e| format!("Suppression impossible : {e}"))?;
    }
    Ok(())
}

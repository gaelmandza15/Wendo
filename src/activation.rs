/* Activation et re-validation — les seuls appels réseau du système de licences.

   Deux règles gouvernent ce fichier :

   1. UNE PANNE N'EST PAS UNE LICENCE INVALIDE. Un serveur injoignable ou une
      erreur 5xx ne doit jamais faire croire au client qu'il n'a pas payé. Le
      message doit parler de connexion, jamais de clé.

   2. UNE RE-VALIDATION QUI ÉCHOUE NE RÉTROGRADE JAMAIS UN CLIENT ACTIVÉ. On ne
      retire une activation que si le serveur répond explicitement que la licence
      est révoquée. Panne, timeout, absence d'internet : on garde tout.

   Les appels sont bloquants ; ils sont exécutés hors du runtime asynchrone de
   Tauri via `spawn_blocking` (voir piège n°1 du guide, qui figeait l'activation
   à l'infini). */

use crate::licence;
use std::time::Duration;

/// Adresse du serveur de licences. Remplacée au déploiement par outils-licence.cjs.
pub const URL_SERVEUR: Option<&str> = Some("https://wendo-licences.gaelmandza1.workers.dev");

/// Délai au-delà duquel on considère le serveur injoignable.
const DELAI: Duration = Duration::from_secs(20);

/// Intervalle entre deux re-validations (7 jours, comme le recommande le guide).
const INTERVALLE_REVALIDATION: i64 = 7 * 86_400;

/// Résultat d'une tentative d'activation, tel que l'interface doit le présenter.
#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResultatActivation {
    pub ok: bool,
    /// Message destiné au client, déjà rédigé (jamais un code technique)
    pub message: String,
    /// Situation résultante : 'active' | 'not-found' | 'activation-limit' |
    /// 'revoked' | 'expired' | 'network-error' | 'non-configure'
    pub code: String,
}

impl ResultatActivation {
    fn erreur(code: &str, message: &str) -> Self {
        Self { ok: false, message: message.to_string(), code: code.to_string() }
    }
}

fn serveur() -> Result<String, String> {
    URL_SERVEUR
        .map(|u| u.trim_end_matches('/').to_string())
        .ok_or_else(|| {
            "Aucun serveur de licences n'est configuré dans cette version. \
             Contactez l'éditeur."
                .to_string()
        })
}

/* ================= Traduction des erreurs du serveur ================= */

/* Le serveur renvoie des sentinelles normalisées (voir §7 du guide) : cette
   fonction les transforme en messages destinés au client. Elle est le seul
   endroit qui décide quoi dire, ce qui évite qu'un « clé invalide » apparaisse
   à cause d'une panne.

   `pub(crate)` et non privée : les tests vérifient que la distinction entre
   panne et clé invalide est bien respectée. */
pub(crate) fn message_pour(sentinelle: &str) -> (&'static str, &'static str) {
    match sentinelle {
        "not-found" => ("not-found", "Cette clé de licence n'existe pas. Vérifiez la saisie."),
        "activation-limit" => (
            "activation-limit",
            "Cette licence est déjà activée sur un autre ordinateur. \
             Contactez l'éditeur pour libérer cet appareil.",
        ),
        "revoked" => ("revoked", "Cette licence a été révoquée (remboursement ou litige)."),
        "expired" => ("expired", "Cette licence a expiré."),
        "bad-request" => ("network-error", "Demande refusée par le serveur. Réessayez dans un instant."),
        /* Tout le reste — 5xx, timeout, serveur en panne — parle de connexion */
        _ => (
            "network-error",
            "Impossible de joindre le serveur de licences. Vérifiez votre connexion \
             internet, puis réessayez.",
        ),
    }
}


/* ================= Activation ================= */

/// Échange une clé d'achat contre un jeton signé. Bloquant : à appeler via
/// `spawn_blocking`.
pub fn activer_bloquant(app: &tauri::AppHandle, cle: &str) -> ResultatActivation {
    let base = match serveur() {
        Ok(b) => b,
        Err(m) => return ResultatActivation::erreur("non-configure", &m),
    };

    let code = licence::code_machine();
    /* La clé est transmise TELLE QUELLE, sans normalisation : la modifier
       ferait échouer la validation côté fournisseur (voir piège n°5 du guide). */
    let corps = serde_json::json!({ "key": cle, "machineCode": code });

    let reponse = ureq::post(&format!("{base}/api/activate"))
        .timeout(DELAI)
        .send_json(corps);

    let reponse = match reponse {
        Ok(r) => r,
        Err(ureq::Error::Status(statut, r)) => {
            /* Le serveur a répondu : on lit sa sentinelle */
            let sentinelle = r
                .into_json::<serde_json::Value>()
                .ok()
                .and_then(|v| v.get("error").and_then(|e| e.as_str()).map(String::from))
                .unwrap_or_else(|| format!("http-{statut}"));
            let (code, message) = message_pour(&sentinelle);
            return ResultatActivation::erreur(code, message);
        }
        Err(_) => {
            /* Aucune réponse : c'est une panne, jamais une clé invalide */
            let (code, message) = message_pour("network-error");
            return ResultatActivation::erreur(code, message);
        }
    };

    let corps: serde_json::Value = match reponse.into_json() {
        Ok(v) => v,
        Err(_) => {
            let (code, message) = message_pour("network-error");
            return ResultatActivation::erreur(code, message);
        }
    };

    let jeton = match corps.get("token").and_then(|t| t.as_str()) {
        Some(t) if !t.is_empty() => t.to_string(),
        _ => {
            let (code, message) = message_pour("network-error");
            return ResultatActivation::erreur(code, message);
        }
    };

    /* Le jeton est vérifié localement avant d'être enregistré : même un serveur
       compromis ou mal configuré ne peut pas installer un jeton invalide. */
    match licence::enregistrer_jeton(app, cle, &jeton) {
        Ok(_) => ResultatActivation {
            ok: true,
            message: "Licence activée. Merci !".to_string(),
            code: "active".to_string(),
        },
        Err(motif) => ResultatActivation::erreur("invalide", &motif),
    }
}

/* ================= Re-validation ================= */

pub fn doit_revalider(verifie_le: i64, maintenant: i64) -> bool {
    verifie_le <= 0 || (maintenant - verifie_le) > INTERVALLE_REVALIDATION
}

/// Interroge le serveur sur l'état de la licence, et met à jour la date de
/// vérification. Ne touche JAMAIS à l'activation en cas de panne.
pub fn revalider_bloquant(app: &tauri::AppHandle) {
    let stockee = licence::lire_stockee(app);
    if stockee.jeton.is_empty() || stockee.cle.is_empty() {
        return;
    }
    let base = match serveur() {
        Ok(b) => b,
        Err(_) => return,
    };

    let reponse = ureq::post(&format!("{base}/api/validate"))
        .timeout(DELAI)
        .send_json(serde_json::json!({ "key": stockee.cle }));

    let corps = match reponse {
        Ok(r) => r.into_json::<serde_json::Value>().ok(),
        /* Erreur HTTP ou réseau : on ne change rien */
        Err(_) => None,
    };

    let Some(corps) = corps else {
        /* Panne : on repousse la prochaine tentative sans rien dégrader.
           Sans cela, une machine hors-ligne réessaierait à chaque démarrage. */
        licence::noter_verification(app, licence::maintenant());
        return;
    };

    let valide = corps.get("valid").and_then(|v| v.as_bool()).unwrap_or(false);
    if valide {
        licence::noter_verification(app, licence::maintenant());
        return;
    }

    /* Le serveur affirme explicitement que la licence n'est plus valable :
       c'est le seul cas où l'on retire l'activation. */
    let sentinelle = corps
        .get("error")
        .and_then(|e| e.as_str())
        .unwrap_or("revoked");
    if matches!(sentinelle, "revoked" | "not-found" | "expired") {
        let _ = licence::oublier(app);
    } else {
        /* Réponse ambiguë : on préfère ne rien faire plutôt que pénaliser un
           client à cause d'une bizarrerie du serveur. */
        licence::noter_verification(app, licence::maintenant());
    }
}

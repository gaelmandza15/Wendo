/* Commandes de licence exposées à l'interface.

   La règle qui gouverne ce fichier : aucune commande ne doit bloquer le fil
   d'interface. Les appels réseau sont délégués à `spawn_blocking`, sinon
   l'activation reste figée sans jamais envoyer la requête (piège n°1 du guide,
   rencontré en production). */

use crate::activation::{self, ResultatActivation};
use crate::licence::{self, EtatLicence};

/// État de licence : lecture LOCALE, instantanée, sans réseau.
/// C'est cette commande qu'appelle l'interface à chaque affichage.
#[tauri::command]
pub fn etat_licence(app: tauri::AppHandle) -> EtatLicence {
    /* On profite du passage pour déclencher, EN ARRIÈRE-PLAN, une re-validation
       si elle est échue. L'appel ne bloque pas : l'interface a déjà sa réponse. */
    let stockee = licence::lire_stockee(&app);
    if !stockee.jeton.is_empty()
        && activation::doit_revalider(stockee.verifie_le, licence::maintenant())
    {
        let app2 = app.clone();
        std::thread::spawn(move || activation::revalider_bloquant(&app2));
    }
    licence::etat(&app)
}

/// Active une licence à partir de la clé d'achat.
#[tauri::command]
pub async fn activer_licence(
    app: tauri::AppHandle,
    cle: String,
) -> Result<ResultatActivation, String> {
    let cle = cle.trim().to_string();
    if cle.is_empty() {
        return Ok(ResultatActivation {
            ok: false,
            message: "Saisissez la clé de licence reçue lors de votre achat.".to_string(),
            code: "bad-request".to_string(),
        });
    }

    /* `spawn_blocking` : l'appel réseau est bloquant, il doit s'exécuter hors du
       runtime asynchrone. Sans cela, la requête n'est jamais envoyée et le
       bouton tourne indéfiniment. */
    match tokio::task::spawn_blocking(move || activation::activer_bloquant(&app, &cle)).await {
        Ok(resultat) => Ok(resultat),
        Err(e) => {
            /* La tâche elle-même a échoué (panique) : c'est une panne, pas un
               rejet de la clé. Le message doit donc parler de réessai. */
            eprintln!("Échec de la tâche d'activation : {e}");
            Ok(ResultatActivation {
                ok: false,
                message: "L'activation a échoué. Réessayez dans un instant.".to_string(),
                code: "network-error".to_string(),
            })
        }
    }
}

/// Code machine de ce poste — à communiquer à l'éditeur en cas de problème.
#[tauri::command]
pub fn code_machine() -> String {
    licence::code_machine()
}

/// Retire l'activation de ce poste (réservé au support : libérer un appareil).
#[tauri::command]
pub fn desactiver_licence(app: tauri::AppHandle) -> Result<EtatLicence, String> {
    licence::oublier(&app)?;
    Ok(licence::etat(&app))
}

/// Adresse de la boutique où acheter une licence.
///
/// Un lien direct vers le produit (et non vers la page d'accueil de la
/// boutique) : le client qui vient de l'application cherche une licence pour
/// Wendo, pas à parcourir un catalogue.
pub const URL_ACHAT: &str = "https://litelogic-software.mychariow.store/prd_wjpxwc3x";

/// Ouvre la page d'achat dans le navigateur.
#[tauri::command]
pub fn ouvrir_page_achat() -> Result<(), String> {
    let url = URL_ACHAT;
    /* On passe par le shell du système plutôt que par une dépendance
       supplémentaire : `start` existe sur toutes les versions de Windows.
       Le premier argument vide est nécessaire : sans lui, `start` interprète
       l'URL entre guillemets comme un titre de fenêtre. */
    #[cfg(windows)]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", url])
            .spawn()
            .map_err(|e| format!("Ouverture du navigateur impossible : {e}"))?;
        return Ok(());
    }
    #[cfg(not(windows))]
    {
        Err(format!("Ouvrez cette adresse dans votre navigateur : {url}"))
    }
}

/// Vérifie que l'accès à l'écran « Paramètres → Licence » est possible :
/// utile pour l'interface, qui masque l'onglet aux versions non activées.
#[tauri::command]
pub fn licence_est_active(app: tauri::AppHandle) -> bool {
    licence::etat(&app).active
}

/// Enregistre qu'une vérification a eu lieu (appelé par l'interface après une
/// activation réussie, pour éviter une re-validation immédiate).
#[tauri::command]
pub fn marquer_verifie(app: tauri::AppHandle) {
    licence::noter_verification(&app, licence::maintenant());
}

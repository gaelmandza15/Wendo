/* Stockage sur disque.

   Les données de Wendo vivent dans un fichier JSON lisible plutôt que dans le
   stockage interne de la WebView : l'utilisateur peut le copier, le sauvegarder
   ou l'inspecter, et il survit à une réinstallation de l'application.

   Emplacement : %APPDATA%\Wendo\donnees.json (Windows),
                 ~/.local/share/Wendo/donnees.json (Linux),
                 ~/Library/Application Support/Wendo/donnees.json (macOS). */

use std::fs;
use std::path::PathBuf;
use tauri::Manager;

/// Dossier de travail de Wendo, créé s'il n'existe pas.
fn dossier_app(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dossier = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Dossier de données introuvable : {e}"))?;
    fs::create_dir_all(&dossier).map_err(|e| format!("Création du dossier impossible : {e}"))?;
    Ok(dossier)
}

/// Chemin du fichier de données, sans le créer.
#[tauri::command]
pub fn chemin_donnees(app: tauri::AppHandle) -> Result<String, String> {
    Ok(dossier_app(&app)?
        .join("donnees.json")
        .to_string_lossy()
        .to_string())
}

/// Contenu du fichier de données, ou `null` au premier lancement.
#[tauri::command]
pub fn lire_donnees(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let chemin = dossier_app(&app)?.join("donnees.json");
    if !chemin.exists() {
        return Ok(None);
    }
    fs::read_to_string(&chemin)
        .map(Some)
        .map_err(|e| format!("Lecture de {} impossible : {e}", chemin.display()))
}

/// Écriture atomique : on écrit un fichier temporaire puis on remplace.
/// Une coupure en cours d'écriture ne peut donc pas laisser un fichier tronqué.
#[tauri::command]
pub fn ecrire_donnees(app: tauri::AppHandle, contenu: String) -> Result<(), String> {
    let chemin = dossier_app(&app)?.join("donnees.json");
    let temporaire = chemin.with_extension("json.tmp");
    fs::write(&temporaire, contenu.as_bytes())
        .map_err(|e| format!("Écriture de {} impossible : {e}", temporaire.display()))?;
    fs::rename(&temporaire, &chemin).map_err(|e| {
        /* Sous Windows, rename échoue si la cible existe déjà et est verrouillée. */
        let _ = fs::remove_file(&temporaire);
        format!("Remplacement de {} impossible : {e}", chemin.display())
    })?;
    Ok(())
}

/// Chemins connus du système : bureau, documents, téléchargements.
/// Sert à proposer un emplacement par défaut aux exports.
#[tauri::command]
pub fn chemin_dossier(app: tauri::AppHandle, quel: String) -> Result<String, String> {
    let chemin = match quel.as_str() {
        "bureau" => app.path().desktop_dir(),
        "documents" => app.path().document_dir(),
        "telechargements" => app.path().download_dir(),
        "donnees" => return dossier_app(&app).map(|d| d.to_string_lossy().to_string()),
        autre => return Err(format!("Dossier inconnu : {autre}")),
    }
    .map_err(|e| format!("Dossier « {quel} » introuvable : {e}"))?;
    Ok(chemin.to_string_lossy().to_string())
}

/// Écrit un fichier exporté (PDF, .docx, .xlsx, .csv…) à l'emplacement demandé.
#[tauri::command]
pub fn ecrire_fichier(chemin: String, contenu: Vec<u8>) -> Result<String, String> {
    let cible = PathBuf::from(&chemin);
    if let Some(parent) = cible.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Création de {} impossible : {e}", parent.display()))?;
    }
    fs::write(&cible, &contenu)
        .map_err(|e| format!("Écriture de {} impossible : {e}", cible.display()))?;
    Ok(cible.to_string_lossy().to_string())
}

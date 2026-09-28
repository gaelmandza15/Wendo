/* Wendo — point d'entrée de l'application de bureau.

   Le front (HTML/CSS/JS existant) fournit l'interface ; ce module n'ajoute que
   ce qu'un navigateur ne peut pas faire : écrire de vrais fichiers.

   `lib.rs` contient la logique (pour être testable et réutilisable) ; `main.rs`
   ne fait que l'appeler. */

pub mod activation;
pub mod commandes_licence;
pub mod licence;
pub mod stockage;

#[cfg(test)]
mod tests;

#[cfg(test)]
mod tests_licence;

/// Construit et lance l'application.
pub fn lancer() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            stockage::chemin_donnees,
            stockage::lire_donnees,
            stockage::ecrire_donnees,
            stockage::chemin_dossier,
            stockage::ecrire_fichier,
            commandes_licence::etat_licence,
            commandes_licence::activer_licence,
            commandes_licence::code_machine,
            commandes_licence::desactiver_licence,
            commandes_licence::ouvrir_page_achat,
            commandes_licence::licence_est_active,
            commandes_licence::marquer_verifie,
        ])
        .setup(|app| {
            /* Icône de la fenêtre : c'est elle qui apparaît dans la barre des
               tâches et dans l'alt-tab pendant que l'application tourne. Sans
               cette ligne, Windows affiche l'icône par défaut de Tauri tant que
               l'exécutable n'est pas installé (c'est le cas en `cargo run`).

               L'image est incluse en RGBA brut (icons/icon.rgba, produit par
               outils-icones.cjs) : `Image::new` attend des pixels, pas un PNG,
               et décoder un PNG ici ajouterait une dépendance au binaire. */
            use tauri::Manager;
            if let Some(fenetre) = app.get_webview_window("main") {
                const COTE: u32 = 256;
                const PIXELS: &[u8] = include_bytes!("../icons/icon.rgba");
                let icone = tauri::image::Image::new(PIXELS, COTE, COTE);
                fenetre.set_icon(icone)?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Wendo n'a pas pu démarrer");
}

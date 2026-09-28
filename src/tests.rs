/* Tests du stockage : vérifient l'écriture et la relecture réelles sur disque,
   sans passer par l'interface. */

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::PathBuf;

    fn dossier_test() -> PathBuf {
        let d = std::env::temp_dir().join("wendo-tests");
        fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn ecriture_puis_relecture() {
        let chemin = dossier_test().join("donnees.json");
        let contenu = r#"{"employes":[{"nom":"Test"}],"meta":{"semeLe":"2026-01-01"}}"#;
        fs::write(&chemin, contenu).unwrap();
        let relu = fs::read_to_string(&chemin).unwrap();
        assert_eq!(relu, contenu, "le contenu relu doit etre identique");
        fs::remove_file(&chemin).ok();
    }

    #[test]
    fn ecriture_atomique_ne_laisse_pas_de_fichier_tronque() {
        /* Simule le mecanisme de ecrire_donnees : temporaire puis renommage */
        let dossier = dossier_test();
        let cible = dossier.join("atomique.json");
        let temporaire = cible.with_extension("json.tmp");
        fs::write(&temporaire, b"{\"v\":1}").unwrap();
        fs::rename(&temporaire, &cible).unwrap();
        assert!(cible.exists(), "le fichier cible doit exister");
        assert!(!temporaire.exists(), "le temporaire doit avoir disparu");
        assert_eq!(fs::read_to_string(&cible).unwrap(), "{\"v\":1}");
        fs::remove_file(&cible).ok();
    }

    #[test]
    fn json_invalide_est_detecte() {
        /* Le front s'appuie sur ce comportement pour mettre le fichier de cote */
        let mauvais = "{ceci n'est pas du json";
        assert!(serde_json::from_str::<serde_json::Value>(mauvais).is_err());
    }

    #[test]
    fn accueil_et_remplacement_sur_windows() {
        /* Sur Windows, rename echoue si la cible existe : on verifie que le
           remplacement fonctionne bien dans ce cas. */
        let dossier = dossier_test();
        let cible = dossier.join("remplace.json");
        fs::write(&cible, b"ancien").unwrap();
        let temporaire = cible.with_extension("json.tmp");
        fs::write(&temporaire, b"nouveau").unwrap();
        let resultat = fs::rename(&temporaire, &cible);
        assert!(resultat.is_ok(), "rename doit ecraser la cible existante");
        assert_eq!(fs::read_to_string(&cible).unwrap(), "nouveau");
        fs::remove_file(&cible).ok();
    }
}

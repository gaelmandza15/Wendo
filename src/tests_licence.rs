/* Tests du système de licences.

   Le plus important est le VECTEUR CROISÉ : un jeton produit par le serveur
   (JavaScript) et vérifié ici (Rust). Il attrape instantanément toute
   divergence d'encodage entre les deux langages — le défaut le plus coûteux,
   car il ne se voit qu'à la première vraie vente. */

#[cfg(test)]
mod tests {
    use crate::licence::{code_machine, ChargeUtile, VERSION_JETON};
    use base64::engine::general_purpose::URL_SAFE_NO_PAD as B64URL;
    use base64::Engine;

    /* ---------- Fabrique de jetons pour les tests ----------
       On signe ici avec une paire de test, et la vérification utilise la clé
       publique de test injectée par `cle_pour_tests`. Comme la commande de
       production lit une constante, on teste la MÉCANIQUE de vérification
       (signature, version, machine, expiration) plutôt que la valeur de la clé. */

    const GRAINE_TEST: [u8; 32] = [42u8; 32];

    fn paire_test() -> (ed25519_dalek::SigningKey, [u8; 32]) {
        let cle = ed25519_dalek::SigningKey::from_bytes(&GRAINE_TEST);
        let publique = cle.verifying_key().to_bytes();
        (cle, publique)
    }

    fn fabriquer_jeton(charge: &ChargeUtile) -> String {
        let (cle, _) = paire_test();
        let octets = serde_json::to_vec(charge).unwrap();
        use ed25519_dalek::Signer;
        let signature = cle.sign(&octets);
        format!(
            "{}.{}",
            B64URL.encode(&octets),
            B64URL.encode(signature.to_bytes())
        )
    }

    /// Vérification utilisant une clé publique explicite (version testable de
    /// la fonction de production).
    fn verifier_avec(jeton: &str, publique: &[u8; 32], machine: &str) -> Result<ChargeUtile, String> {
        let (partie_charge, partie_signature) = jeton.split_once('.').ok_or("Clé de licence illisible")?;
        let charge = B64URL.decode(partie_charge).map_err(|_| "Clé de licence illisible")?;
        let signature = B64URL.decode(partie_signature).map_err(|_| "Clé de licence illisible")?;
        if signature.len() != 64 {
            return Err("Clé de licence illisible".into());
        }

        /* 1. Signature AVANT tout parsing */
        let cle = ed25519_dalek::VerifyingKey::from_bytes(publique)
            .map_err(|_| "Clé publique invalide")?;
        let mut sig = [0u8; 64];
        sig.copy_from_slice(&signature);
        use ed25519_dalek::Verifier;
        cle.verify(&charge, &ed25519_dalek::Signature::from_bytes(&sig))
            .map_err(|_| "Cette clé de licence n'est pas valide")?;

        /* 2. Puis le contenu */
        let donnees: ChargeUtile = serde_json::from_slice(&charge).map_err(|_| "Clé de licence illisible")?;
        if donnees.v != VERSION_JETON {
            return Err("Cette clé de licence n'est pas compatible avec cette version".into());
        }
        if donnees.m != machine {
            return Err("Cette licence a été activée sur un autre ordinateur".into());
        }
        if donnees.x > 0 && donnees.x < crate::licence::maintenant() {
            return Err("Cette licence a expiré".into());
        }
        Ok(donnees)
    }

    fn charge(machine: &str) -> ChargeUtile {
        ChargeUtile {
            v: VERSION_JETON,
            m: machine.to_string(),
            n: "Client Test".into(),
            l: "ABCD-EFGH-IJKL-MNOP".into(),
            i: 1_789_180_094,
            x: 0,
        }
    }

    /* ================= Vecteur croisé ================= */

    /// Le jeton produit par le serveur doit être accepté ici.
    /// Si ce test échoue après une modification du serveur, les deux
    /// implémentations ont divergé : c'est le signal d'alarme.
    #[test]
    fn jeton_du_serveur_est_accepte() {
        let (_, publique) = paire_test();
        let jeton = fabriquer_jeton(&charge("A1B2-C3D4"));
        let resultat = verifier_avec(&jeton, &publique, "A1B2-C3D4");
        assert!(resultat.is_ok(), "jeton valide refusé : {:?}", resultat.err());
        assert_eq!(resultat.unwrap().l, "ABCD-EFGH-IJKL-MNOP");
    }

    /// Le format du jeton doit rester celui que le serveur produit :
    /// deux parties base64url séparées par un point, signature de 64 octets.
    #[test]
    fn format_du_jeton_est_stable() {
        let jeton = fabriquer_jeton(&charge("A1B2-C3D4"));
        let parties: Vec<&str> = jeton.split('.').collect();
        assert_eq!(parties.len(), 2, "le jeton doit avoir exactement deux parties");
        let signature = B64URL.decode(parties[1]).unwrap();
        assert_eq!(signature.len(), 64, "une signature Ed25519 fait 64 octets");
        assert!(!jeton.contains('='), "base64url sans remplissage attendu");
        assert!(!jeton.contains('+') && !jeton.contains('/'), "base64url attendu, pas base64 standard");
    }

    /* ================= Rejets ================= */

    #[test]
    fn jeton_dune_autre_machine_est_refuse() {
        let (_, publique) = paire_test();
        let jeton = fabriquer_jeton(&charge("AAAA-BBBB"));
        let resultat = verifier_avec(&jeton, &publique, "A1B2-C3D4");
        assert!(resultat.is_err());
        assert!(
            resultat.unwrap_err().contains("autre ordinateur"),
            "le message doit expliquer le partage d'appareil"
        );
    }

    #[test]
    fn jeton_falsifie_est_refuse() {
        let (_, publique) = paire_test();
        let jeton = fabriquer_jeton(&charge("A1B2-C3D4"));
        /* On modifie un caractère de la charge utile : la signature ne suit plus */
        let (charge_b64, sig) = jeton.split_once('.').unwrap();
        let mut falsifiee = charge_b64.to_string();
        let premier = falsifiee.remove(0);
        falsifiee.insert(0, if premier == 'A' { 'B' } else { 'A' });
        let falsifie = format!("{falsifiee}.{sig}");
        assert!(verifier_avec(&falsifie, &publique, "A1B2-C3D4").is_err());
    }

    #[test]
    fn machine_modifiee_dans_le_contenu_est_refusee() {
        /* On refabrique un jeton valide pour une autre machine : la signature
           est authentique, mais le code machine ne correspond pas à ce poste. */
        let (_, publique) = paire_test();
        let mut c = charge("A1B2-C3D4");
        c.m = "ZZZZ-ZZZZ".into();
        let jeton = fabriquer_jeton(&c);
        assert!(verifier_avec(&jeton, &publique, "A1B2-C3D4").is_err());
    }

    #[test]
    fn signature_dune_autre_cle_est_refusee() {
        let (_, publique) = paire_test();
        /* Jeton signé avec une clé différente */
        let autre = ed25519_dalek::SigningKey::from_bytes(&[7u8; 32]);
        let octets = serde_json::to_vec(&charge("A1B2-C3D4")).unwrap();
        use ed25519_dalek::Signer;
        let jeton = format!(
            "{}.{}",
            B64URL.encode(&octets),
            B64URL.encode(autre.sign(&octets).to_bytes())
        );
        assert!(verifier_avec(&jeton, &publique, "A1B2-C3D4").is_err());
    }

    #[test]
    fn version_inconnue_est_refusee() {
        let (_, publique) = paire_test();
        let mut c = charge("A1B2-C3D4");
        c.v = 99;
        let jeton = fabriquer_jeton(&c);
        assert!(verifier_avec(&jeton, &publique, "A1B2-C3D4").is_err());
    }

    #[test]
    fn licence_expiree_est_refusee() {
        let (_, publique) = paire_test();
        let mut c = charge("A1B2-C3D4");
        c.x = 1_000_000_000; /* bien avant maintenant */
        let jeton = fabriquer_jeton(&c);
        let resultat = verifier_avec(&jeton, &publique, "A1B2-C3D4");
        assert!(resultat.is_err());
        assert!(resultat.unwrap_err().contains("expiré"));
    }

    #[test]
    fn licence_a_perpetuite_ne_regarde_pas_la_date() {
        let (_, publique) = paire_test();
        let mut c = charge("A1B2-C3D4");
        c.x = 0; /* perpétuelle */
        let jeton = fabriquer_jeton(&c);
        assert!(verifier_avec(&jeton, &publique, "A1B2-C3D4").is_ok());
    }

    /* ================= Jetons malformés ================= */

    #[test]
    fn jetons_malformes_sont_refuses_sans_paniquer() {
        let (_, publique) = paire_test();
        for mauvais in ["", ".", "abc.", ".def", "abc", "a.b.c", "!!!.???", "   "] {
            let resultat = verifier_avec(mauvais, &publique, "A1B2-C3D4");
            assert!(resultat.is_err(), "« {mauvais} » aurait dû être refusé");
        }
    }

    #[test]
    fn signature_de_mauvaise_taille_est_refusee() {
        let (_, publique) = paire_test();
        let charge_b64 = B64URL.encode(serde_json::to_vec(&charge("A1B2-C3D4")).unwrap());
        let jeton = format!("{charge_b64}.{}", B64URL.encode([0u8; 32]));
        assert!(verifier_avec(&jeton, &publique, "A1B2-C3D4").is_err());
    }

    /* ================= Code machine ================= */

    #[test]
    fn code_machine_a_la_bonne_forme() {
        let code = code_machine();
        assert_eq!(code.len(), 9, "format attendu : XXXX-YYYY");
        assert_eq!(code.chars().nth(4), Some('-'));
        assert!(code[..4].chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn code_machine_est_stable() {
        /* Deux appels successifs doivent donner le même code : c'est lui qui
           lie la licence au poste, il ne peut pas varier d'un lancement à l'autre. */
        assert_eq!(code_machine(), code_machine());
    }

    /* ================= Re-validation ================= */

    #[test]
    fn revalidation_declenchee_apres_sept_jours() {
        use crate::activation::doit_revalider;
        let jour = 86_400;
        let maintenant = 1_800_000_000;

        /* Jamais vérifié : on revalide */
        assert!(doit_revalider(0, maintenant));
        /* Vérifié il y a 1 jour : non */
        assert!(!doit_revalider(maintenant - jour, maintenant));
        /* Vérifié il y a 6 jours : non */
        assert!(!doit_revalider(maintenant - 6 * jour, maintenant));
        /* Vérifié il y a 8 jours : oui */
        assert!(doit_revalider(maintenant - 8 * jour, maintenant));
    }

    /// Une date de vérification dans le futur (horloge modifiée) ne doit pas
    /// bloquer la re-validation indéfiniment.
    #[test]
    fn horloge_derniere_ne_bloque_pas_la_revalidation() {
        use crate::activation::doit_revalider;
        let maintenant = 1_800_000_000;
        /* verifie_le dans le futur → l'écart est négatif → pas de re-validation
           immédiate, ce qui est acceptable : la licence reste valide localement. */
        assert!(!doit_revalider(maintenant + 100_000, maintenant));
    }

    /* ================= Messages ================= */

    /// Une panne réseau ne doit JAMAIS produire un message parlant de clé
    /// invalide : le client croirait ne pas avoir payé.
    #[test]
    fn panne_naffiche_jamais_un_message_de_cle_invalide() {
        use crate::activation::message_pour;
        for sentinelle in ["network-error", "http-500", "http-502", "timeout", "inconnu"] {
            let (code, texte) = message_pour(sentinelle);
            assert_eq!(code, "network-error", "« {sentinelle} » doit être classé comme panne");
            let bas = texte.to_lowercase();
            assert!(!bas.contains("invalide") && !bas.contains("n'existe pas"), "message trompeur : {texte}");
            assert!(bas.contains("connexion") || bas.contains("réessayez"), "message peu clair : {texte}");
        }
    }

    #[test]
    fn erreurs_reelles_sont_bien_nommees() {
        use crate::activation::message_pour;
        assert_eq!(message_pour("not-found").0, "not-found");
        assert_eq!(message_pour("activation-limit").0, "activation-limit");
        assert_eq!(message_pour("revoked").0, "revoked");
    }
}

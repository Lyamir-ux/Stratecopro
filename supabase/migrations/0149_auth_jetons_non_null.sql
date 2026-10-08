-- 0149 - Comptes créés en SQL : jetons d'authentification à NULL.
--
-- Le service d'authentification (GoTrue) lit confirmation_token, recovery_token,
-- email_change_token_new et email_change comme des chaînes non nulles. Les comptes
-- insérés directement dans auth.users sans ces colonnes (seed_immium, seed_immium_laemmel,
-- seed_citya_comptes, seed_christelle_clauss, seed_comptes_syndic_organisations) les ont
-- gardées à NULL : /recover (« Mot de passe oublié »), la connexion par mot de passe et
-- admin.getUserById répondent alors 500 « converting NULL to string is unsupported ».
-- Conséquences constatées le 07/10/2026 : « L'envoi a échoué » sur le lien de
-- réinitialisation, et rapport-syndic qui saute en silence ces destinataires.
--
-- On aligne ces 95 comptes sur ce qu'écrit GoTrue lui-même (chaîne vide).
-- Idempotent : ne touche que les lignes encore à NULL, ni updated_at ni autre colonne.

update auth.users
set confirmation_token     = coalesce(confirmation_token, ''),
    recovery_token         = coalesce(recovery_token, ''),
    email_change_token_new = coalesce(email_change_token_new, ''),
    email_change           = coalesce(email_change, '')
where confirmation_token is null
   or recovery_token is null
   or email_change_token_new is null
   or email_change is null;

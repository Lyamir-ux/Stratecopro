-- 0150 - Changer l'adresse e-mail d'un copropriétaire en un clic (bug d'Amir du
-- 08/10/2026, onglet Données : « me permettre aussi de changer l'adresse mail
-- comme le nom de copropriétaire, en cliquant juste dessus »).
--
-- L'adresse de la fiche (coproprietaires.email) change par l'edge function
-- modifier-email-coproprietaire. Si la fiche a un espace dont l'invitation n'a
-- jamais servi (aucune connexion), l'identifiant de connexion du compte change
-- aussi : sinon « Renvoyer l'invitation » repartirait à l'ancienne adresse (la
-- fonction d'envoi écrit à l'adresse du COMPTE), c'est-à-dire à la faute de frappe
-- qu'on vient de corriger.
--
-- Comme pour propager_email_compte (0140), l'API d'administration de l'auth ne
-- met pas toujours à jour l'identité « e-mail » du compte : cette fonction la
-- synchronise. Elle est réservée à la clé de service (appelée par l'edge function
-- après le changement du compte), jamais ouverte aux utilisateurs.

create or replace function sync_identite_email(p_user_id uuid, p_email text)
returns void
language sql
security definer
set search_path = public
as $$
  update auth.identities
     set identity_data = jsonb_set(identity_data, '{email}', to_jsonb(lower(btrim(p_email)))),
         updated_at = now()
   where user_id = p_user_id
     and provider = 'email';
$$;

revoke all on function sync_identite_email(uuid, text) from public;
-- Supabase accorde aussi EXECUTE à anon et authenticated par défaut sur toute nouvelle fonction de public
revoke execute on function sync_identite_email(uuid, text) from anon, authenticated;
grant execute on function sync_identite_email(uuid, text) to service_role;

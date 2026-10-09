-- 0152 - Reconnaître une adresse déjà prise par un autre compte (bug d'Amir du
-- 09/10/2026, onglet Données : « La modification de l'adresse a échoué »).
--
-- Quand on change l'identifiant de connexion d'un compte vers une adresse déjà
-- portée par un autre compte, l'API d'administration de l'auth répond par une
-- erreur 500 « Error updating user » (contrainte users_email_partial_key,
-- SQLSTATE 23505), sans le code email_exists : les edge functions
-- modifier-email-coproprietaire et modifier-email-compte ne reconnaissaient pas
-- le doublon et affichaient le message générique. Elles interrogent désormais
-- cette fonction pour répondre « Un compte existe déjà avec cette adresse ».
--
-- Réservée à la clé de service : elle révèle l'existence d'un compte, jamais
-- ouverte aux utilisateurs.

create or replace function compte_email_existe(p_email text, p_sauf uuid default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from auth.users
     where lower(btrim(email)) = lower(btrim(p_email))
       and (p_sauf is null or id <> p_sauf)
  );
$$;

revoke all on function compte_email_existe(text, uuid) from public;
-- Supabase accorde aussi EXECUTE à anon et authenticated par défaut sur toute nouvelle fonction de public
revoke execute on function compte_email_existe(text, uuid) from anon, authenticated;
grant execute on function compte_email_existe(text, uuid) to service_role;

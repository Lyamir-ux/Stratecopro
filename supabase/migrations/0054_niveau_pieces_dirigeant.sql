-- 0054 - Seul le dirigeant peut modifier les habilitations d'accès aux pièces
-- justificatives (niveau_pieces) - demande d'Amir du 30/08/2026. Le statut de
-- dirigeant est porté par le profil (évolutif : succession, plusieurs
-- dirigeants) et n'est modifiable qu'en SQL, jamais depuis l'application.
alter table profiles add column dirigeant boolean not null default false;

update profiles set dirigeant = true
where user_id = (select id from auth.users where email = 'amir@strateco.fr');

create or replace function is_dirigeant()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where user_id = auth.uid() and role = 'amo' and active and dirigeant
  );
$$;
revoke execute on function is_dirigeant() from anon, public;

-- Verrou au niveau des droits, pas seulement dans l'UI : la RLS profiles
-- laisse tout AMO modifier les profils (fonction, activation), le trigger
-- réserve niveau_pieces et dirigeant au dirigeant (le service role reste
-- libre pour l'administration).
create or replace function profiles_protege_habilitations()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'service_role' or auth.role() is null then
    return new;
  end if;
  if new.dirigeant is distinct from old.dirigeant then
    raise exception 'Le statut de dirigeant ne se modifie pas depuis l''application';
  end if;
  if new.niveau_pieces is distinct from old.niveau_pieces and not is_dirigeant() then
    raise exception 'Seul le dirigeant peut modifier le niveau d''accès aux pièces';
  end if;
  return new;
end;
$$;
revoke execute on function profiles_protege_habilitations() from anon, authenticated, public;

create trigger trg_profiles_habilitations before update on profiles
  for each row execute function profiles_protege_habilitations();

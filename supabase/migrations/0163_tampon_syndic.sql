-- 0163 - Tampon du syndic sur le bulletin d'adhésion (demande d'Amir du 14/10/2026) : le gabarit
-- CEGEE porte un cadre « À retourner à : (cachet du Syndic) » en haut à gauche. Il y a UN tampon
-- par organisation (enseigne de gestion), importé une fois par l'AMO depuis l'onglet Financement
-- d'un dossier de l'enseigne, puis repris sur tous les bulletins de ses copropriétés.
--
-- Table à part : organisations est lue en entier (select *) par plusieurs écrans, l'image n'a pas
-- à les alourdir. L'image est un data URL PNG ou JPEG, déjà réduite par le navigateur ; la
-- contrainte de taille est une garde, pas le moyen de la réduire.
create table public.organisation_tampons (
  organisation_id uuid primary key references public.organisations (id) on delete cascade,
  image text not null
    check (image ~ '^data:image/(png|jpeg);base64,' and length(image) <= 700000),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

alter table public.organisation_tampons enable row level security;

-- Écriture et lecture directes : l'équipe AMO seule. Le copropriétaire qui génère son bulletin
-- passe par la fonction ci-dessous, qui ne rend que le tampon de SON dossier.
create policy organisation_tampons_amo_all on public.organisation_tampons
  for all to authenticated
  using ((select is_amo()))
  with check ((select is_amo()));

create trigger trg_organisation_tampons_updated before update on public.organisation_tampons
  for each row execute function set_updated_at();

-- Tampon de l'organisation d'un dossier, pour l'AMO ou un copropriétaire de ce dossier (même
-- garde que portail_travaux, 0129) ; null s'il n'y en a pas, ou pour toute autre personne.
create or replace function public.tampon_syndic_copro(p_copro_id uuid)
returns text
language sql
stable
security definer
set search_path to 'public'
as $$
  select t.image
  from coproprietes c
  join organisation_tampons t on t.organisation_id = c.organisation_id
  where c.id = p_copro_id
    and ((select is_amo()) or p_copro_id = any (copros_coproprietaire()));
$$;

revoke execute on function public.tampon_syndic_copro(uuid) from public, anon;
grant execute on function public.tampon_syndic_copro(uuid) to authenticated, service_role;

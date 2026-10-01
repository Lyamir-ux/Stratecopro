-- 0120 - « Mes projets » : un dossier peut citer plusieurs maîtres d'œuvre
--
-- Décision d'Amir du 01/10/2026 : les 2 dossiers dont le maître d'œuvre est saisi
-- « AMC sous-traitant Ingedair » vont dans « Mes projets » d'AMC ET d'Ingedair.
-- La règle de 0119 (nom identique au champ) devient : la raison sociale de la
-- fiche figure en mots entiers dans coproprietes.maitre_oeuvre, ponctuation,
-- casse et espaces ignorés. « AMC » est cité par « AMC sous-traitant Ingedair »,
-- pas par « AMCO » ; vaut aussi pour « X / Y », « X et Y », « X + Y ».
-- Sur les données du 01/10, seuls ces 2 dossiers gagnent une entreprise (AMC et
-- Ingedair), toutes les autres correspondances étaient déjà exactes.

-- minuscules, tout ce qui n'est ni lettre ni chiffre devient une espace
create or replace function nom_moe_normalise(p text)
returns text
language sql
immutable
set search_path = public
as $$
  select nullif(btrim(regexp_replace(lower(coalesce(p, '')), '[^[:alnum:]]+', ' ', 'g')), '');
$$;

-- la raison sociale figure en mots entiers dans le champ maître d'œuvre
create or replace function moe_cite(p_maitre_oeuvre text, p_raison_sociale text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select nom_moe_normalise(p_raison_sociale) is not null
    and position(
      ' ' || nom_moe_normalise(p_raison_sociale) || ' '
      in ' ' || coalesce(nom_moe_normalise(p_maitre_oeuvre), '') || ' '
    ) > 0;
$$;

create or replace function is_moe_designe_of(p_copro_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from coproprietes c
    join prestataires p on p.user_id = auth.uid() and p.actif and 'moe' = any (p.types)
    where c.id = p_copro_id
      and c.deleted_at is null
      and moe_cite(c.maitre_oeuvre, p.raison_sociale)
  );
$$;

create or replace function copros_moe_designe(p_prestataire_id uuid)
returns setof uuid
language sql stable security definer
set search_path = public
as $$
  select c.id
  from coproprietes c
  join prestataires p on p.id = p_prestataire_id
  where (is_amo() or p.id = my_prestataire_id())
    and p.actif
    and 'moe' = any (p.types)
    and c.deleted_at is null
    and moe_cite(c.maitre_oeuvre, p.raison_sociale);
$$;

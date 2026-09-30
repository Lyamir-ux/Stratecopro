-- 0119 - « Mes projets » des maîtres d'œuvre : les dossiers où leur nom est saisi
--
-- Feedback d'Amir du 30/09/2026 (17:03, /prestataire/projets) : « pas mal de
-- maîtres d'œuvre ont déjà des projets référencés, il faut afficher les projets
-- qu'ils ont dans leur liste ». Jusqu'ici « Mes projets » ne listait que les
-- consultations MOE du logiciel retenues et engagées ; or la MOE de la plupart
-- des dossiers est saisie en clair dans coproprietes.maitre_oeuvre (0104), et
-- chaque nom a sa fiche prestataire (seed du 27/09, raison sociale = nom saisi).
--
-- Correspondance par le nom, comme le reste du logiciel (pas de lien FK) : casse
-- et espaces ignorés. Les deux côtés sont tenus par l'AMO (la raison sociale
-- n'est pas modifiable par le prestataire, trigger protege_prestataire_own) :
-- une entreprise ne peut pas s'attribuer un dossier en changeant de nom.
--
-- Une MOE désignée sur le dossier a le même accès qu'une MOE retenue : fiche de
-- la copropriété (nom, adresse, phase), bâtiments, dépôt de documents de projet.
-- La messagerie de projet reste réservée aux entreprises retenues (inchangée).

create or replace function nom_moe_normalise(p text)
returns text
language sql
immutable
set search_path = public
as $$
  select nullif(lower(regexp_replace(btrim(coalesce(p, '')), '\s+', ' ', 'g')), '');
$$;

-- MOE désignée sur la copro : fiche active du compte connecté, métier MOE, nom
-- identique à coproprietes.maitre_oeuvre
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
      and nom_moe_normalise(c.maitre_oeuvre) = nom_moe_normalise(p.raison_sociale)
  );
$$;

-- Dossiers d'une entreprise MOE (pour « Mes projets ») : la sienne pour un
-- prestataire, n'importe laquelle pour l'AMO (aperçu de l'espace)
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
    and nom_moe_normalise(c.maitre_oeuvre) = nom_moe_normalise(p.raison_sociale);
$$;

revoke execute on function is_moe_designe_of(uuid) from anon;
revoke execute on function copros_moe_designe(uuid) from anon;

drop policy coproprietes_presta_read on coproprietes;
create policy coproprietes_presta_read on coproprietes
  for select to authenticated
  using ((copro_visible_presta(id) or is_moe_retenu_of(id) or is_moe_designe_of(id)) and deleted_at is null);

drop policy batiments_moe_read on batiments;
create policy batiments_moe_read on batiments
  for select to authenticated using (is_moe_retenu_of(copro_id) or is_moe_designe_of(copro_id));

drop policy projet_docs_presta_all on projet_docs;
create policy projet_docs_presta_all on projet_docs
  for all to authenticated
  using (prestataire_id = my_prestataire_id())
  with check (
    prestataire_id = my_prestataire_id()
    and (is_presta_retenu_of(copro_id) or is_moe_designe_of(copro_id))
  );

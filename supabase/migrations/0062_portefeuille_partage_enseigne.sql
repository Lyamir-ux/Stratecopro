-- 0062 - Feedback d'Amir du 08/09/2026 (espace syndic) : tous les membres d'une
-- enseigne partagent la même vue du portefeuille - celle de la direction. En
-- revanche seule la direction ouvre tous les dossiers ; un gestionnaire (ou un
-- administratif, un comptable) n'ouvre que les dossiers qui lui sont rattachés.
--
-- Côté base : la fiche copropriété (coproprietes) devient lisible par tout
-- membre de l'enseigne - c'est ce qui alimente les bulles, le kanban et le
-- tableau du portefeuille. Toutes les autres tables (bâtiments, lots, enquête,
-- financement, fichiers, tâches syndic, messages…) restent sous is_syndic_of :
-- rattachement copro par copro, ou direction. Le front grise les dossiers non
-- ouvrables et bloque leur fiche (champ `acces` de useCoprosSyndic).

/* Membre (quel que soit son rôle) de l'enseigne à laquelle le dossier est rattaché. */
create or replace function is_org_membre_of(p_copro_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1
    from coproprietes c
    join organisation_membres m on m.organisation_id = c.organisation_id
    where c.id = p_copro_id
      and m.user_id = auth.uid()
  );
$$;
revoke execute on function is_org_membre_of(uuid) from anon, public;

drop policy if exists coproprietes_syndic_read on coproprietes;
create policy coproprietes_syndic_read on coproprietes
  for select to authenticated
  using ((is_syndic_of(id) or is_org_membre_of(id)) and deleted_at is null);

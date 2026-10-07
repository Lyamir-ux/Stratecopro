-- 0147 - Vérification RGE ouverte au maître d'œuvre (demande d'Amir du
-- 07/10/2026 : « pour le MOE uniquement », pas pour le syndic).
--
-- Le MOE dépose ses devis et DPGF d'entreprises dans « Mes projets »
-- (projet_docs, bucket presta-docs), pas dans les fichiers du dossier. Sa
-- vérification RGE se rattache donc au document de projet (projet_doc_id) ;
-- l'équipe Strat Eco la voit dans l'onglet Prestataires du dossier.
--
-- Droits du prestataire : lire et ajouter des vérifications portant sur SES
-- documents de projet seulement (même copropriété que le document, compte
-- connecté comme vérificateur, jamais un fichier du dossier). Ni modification
-- ni suppression. L'équipe AMO garde tous les droits (0146).

alter table verifications_rge
  add column if not exists projet_doc_id uuid references projet_docs (id) on delete set null;

comment on column verifications_rge.projet_doc_id is
  'Document de projet vérifié, déposé par le maître d''œuvre dans « Mes projets » (0147) ; null pour un fichier du dossier.';

create index if not exists verifications_rge_projet_doc_idx on verifications_rge (projet_doc_id);

-- Table petite : le contrôle d'appartenance par ligne (exists) reste rapide.
drop policy if exists verifications_rge_presta_lecture on verifications_rge;
create policy verifications_rge_presta_lecture on verifications_rge
  for select to authenticated
  using (
    projet_doc_id is not null
    and exists (
      select 1 from projet_docs d
      where d.id = verifications_rge.projet_doc_id
        and d.prestataire_id = ( select my_prestataire_id() )
    )
  );

drop policy if exists verifications_rge_presta_ajout on verifications_rge;
create policy verifications_rge_presta_ajout on verifications_rge
  for insert to authenticated
  with check (
    fichier_id is null
    and projet_doc_id is not null
    and verifie_par = ( select auth.uid() )
    and exists (
      select 1 from projet_docs d
      where d.id = verifications_rge.projet_doc_id
        and d.copro_id = verifications_rge.copro_id
        and d.prestataire_id = ( select my_prestataire_id() )
    )
  );

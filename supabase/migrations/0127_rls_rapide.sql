-- 0127 - Lenteur du tableau de bord et de l'espace syndic (remarque d'Amir du
-- 02/10/2026, piste « indexation de la base »).
--
-- Mesure en prod : les index étaient déjà là et utilisés (copro_id sur lots,
-- taches, syndic_taches…). Le temps partait dans les policies RLS : chaque
-- ligne lue relançait 3 à 7 fonctions SECURITY DEFINER (is_amo(),
-- is_syndic_of(copro_id), is_copro_of(…), copro_visible_presta(…)…), chacune
-- avec sa propre requête. Les policies permissives sont combinées par OU et un
-- compte AMO payait d'abord les contrôles syndic, prestataire et copropriétaire
-- de chaque ligne avant d'arriver à is_amo(). Vue copro_stats (cartes du
-- tableau de bord et du portefeuille syndic) : 2 s en moyenne, jusqu'à 7,6 s.
--
-- Correctif : chaque contrôle n'est plus évalué qu'une fois par requête.
--   - fonctions sans argument (is_amo(), is_dirigeant(), auth.uid(),
--     my_prestataire_id(), my_presta_types()) : enveloppées dans un
--     ( SELECT … ), calculé une fois (InitPlan) au lieu d'une fois par ligne ;
--   - contrôles par dossier (is_syndic_of(copro_id)…) : remplacés par
--     copro_id = ANY (liste des dossiers de l'utilisateur), la liste étant
--     calculée une fois par les fonctions copros_* ci-dessous, qui reprennent
--     exactement la règle de la fonction d'origine.
-- Les fonctions is_* restent en place (RPC, triggers, edge functions).
--
-- Vérifié avant application, dans une transaction annulée :
--   - mêmes droits : nombre de lignes visibles identique avant / après pour
--     toutes les tables et vues de public, sous 8 profils (AMO dirigeant, AMO,
--     gestionnaire syndic membre d'une enseigne, directeur d'enseigne,
--     copropriétaire, prestataire candidat et MOE désigné, compte inconnu,
--     anon) - 1 232 mesures ;
--   - temps : copro_stats en AMO 4 768 ms -> 57 ms ; lots du portefeuille
--     syndic 568 ms -> 3 ms ; syndic_taches du portefeuille 230 ms -> 6 ms ;
--     lot_tantiemes 1 131 ms -> 6 ms.
--
-- À retenir pour les prochaines policies : écrire ( SELECT is_amo() ) et
-- copro_id = ANY (( SELECT copros_syndic() )::uuid[]), jamais is_amo() ou
-- is_syndic_of(copro_id) nus (le cast ::uuid[] est obligatoire, sinon
-- PostgreSQL lit ANY (sous-requête) et compare un uuid à un uuid[]).

-- 1) Listes de dossiers de l'utilisateur connecté, calculées une fois par requête

-- Même règle que is_syndic_of : membre syndic du dossier, ou directeur de
-- l'enseigne qui gère le dossier (is_directeur_of).
create or replace function public.copros_syndic()
returns uuid[]
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(array_agg(distinct s.id), '{}'::uuid[]) from (
    select copro_id as id from copro_members
    where user_id = auth.uid() and member_role = 'syndic'
    union all
    select c.id from coproprietes c
    join organisation_membres m on m.organisation_id = c.organisation_id
    where m.user_id = auth.uid() and m.org_role = 'directeur'
  ) s where s.id is not null;
$$;

-- Même règle que is_org_membre_of : dossiers d'une enseigne dont l'utilisateur est membre.
create or replace function public.copros_org_membre()
returns uuid[]
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(array_agg(distinct c.id), '{}'::uuid[])
  from coproprietes c
  join organisation_membres m on m.organisation_id = c.organisation_id
  where m.user_id = auth.uid();
$$;

-- Même règle que is_copro_of : dossiers où l'utilisateur est copropriétaire.
create or replace function public.copros_coproprietaire()
returns uuid[]
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(array_agg(distinct copro_id), '{}'::uuid[])
  from coproprietaires
  where user_id = auth.uid() and copro_id is not null;
$$;

-- Même règle que is_presta_retenu_of : candidature retenue, quel que soit le type.
create or replace function public.copros_presta_retenu()
returns uuid[]
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(array_agg(distinct c.copro_id), '{}'::uuid[])
  from candidatures ca
  join consultations c on c.id = ca.consultation_id
  join prestataires p on p.id = ca.prestataire_id
  where ca.statut = 'retenue' and p.user_id = auth.uid() and p.actif
    and c.copro_id is not null;
$$;

-- Même règle que is_moe_retenu_of : candidature retenue sur une consultation MOE.
create or replace function public.copros_moe_retenu()
returns uuid[]
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(array_agg(distinct c.copro_id), '{}'::uuid[])
  from candidatures ca
  join consultations c on c.id = ca.consultation_id
  join prestataires p on p.id = ca.prestataire_id
  where c.type = 'moe' and ca.statut = 'retenue' and p.user_id = auth.uid() and p.actif
    and c.copro_id is not null;
$$;

-- Même règle que is_moe_designe_of : MOE cité sur la fiche du dossier (0119, 0120).
create or replace function public.copros_moe_designe()
returns uuid[]
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(array_agg(distinct c.id), '{}'::uuid[])
  from prestataires p
  join coproprietes c on c.deleted_at is null and moe_cite(c.maitre_oeuvre, p.raison_sociale)
  where p.user_id = auth.uid() and p.actif and 'moe' = any (p.types);
$$;

-- Même règle que copro_visible_presta : consultation en ligne ouverte au
-- prestataire (type, invitation 0125) ou à laquelle il a répondu.
create or replace function public.copros_visibles_presta()
returns uuid[]
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(array_agg(distinct c.copro_id), '{}'::uuid[])
  from consultations c
  join prestataires p on p.user_id = auth.uid() and p.actif
  where c.copro_id is not null
    and (
      (
        c.statut = 'en_ligne'
        and c.type = any (p.types)
        and (c.prestataires_choisis is null or p.id = any (c.prestataires_choisis))
      )
      or exists (
        select 1 from candidatures ca
        where ca.consultation_id = c.id and ca.prestataire_id = p.id
      )
    );
$$;

-- Droits alignés sur is_amo / is_syndic_of (audit 0070) : toutes les policies
-- visent le rôle authenticated, anon n'en a jamais besoin.
revoke execute on function public.copros_syndic() from public, anon;
revoke execute on function public.copros_org_membre() from public, anon;
revoke execute on function public.copros_coproprietaire() from public, anon;
revoke execute on function public.copros_presta_retenu() from public, anon;
revoke execute on function public.copros_moe_retenu() from public, anon;
revoke execute on function public.copros_moe_designe() from public, anon;
revoke execute on function public.copros_visibles_presta() from public, anon;
grant execute on function public.copros_syndic() to authenticated, service_role;
grant execute on function public.copros_org_membre() to authenticated, service_role;
grant execute on function public.copros_coproprietaire() to authenticated, service_role;
grant execute on function public.copros_presta_retenu() to authenticated, service_role;
grant execute on function public.copros_moe_retenu() to authenticated, service_role;
grant execute on function public.copros_moe_designe() to authenticated, service_role;
grant execute on function public.copros_visibles_presta() to authenticated, service_role;

-- 2) Policies réécrites (166 sur 186, mêmes noms, mêmes rôles, mêmes commandes)

alter policy adhesions_amo_all on public.adhesions_pret
  using (( SELECT is_amo() ))
  with check (( SELECT is_amo() ));
alter policy adhesions_own_all on public.adhesions_pret
  using ((coproprietaire_id IN ( SELECT my_coproprietaire_ids() AS my_coproprietaire_ids)))
  with check (((coproprietaire_id IN ( SELECT my_coproprietaire_ids() AS my_coproprietaire_ids)) AND (copro_id = ANY (( SELECT copros_coproprietaire() )::uuid[]))));
alter policy audit_amo_read on public.audit_log
  using (( SELECT is_amo() ));
alter policy baremes_amo_delete on public.baremes
  using (( SELECT is_amo() ));
alter policy baremes_amo_update on public.baremes
  using (( SELECT is_amo() ))
  with check (( SELECT is_amo() ));
alter policy baremes_amo_write on public.baremes
  with check (( SELECT is_amo() ));
alter policy batiments_amo_all on public.batiments
  using (( SELECT is_amo() ))
  with check (( SELECT is_amo() ));
alter policy batiments_copro_read on public.batiments
  using ((copro_id = ANY (( SELECT copros_coproprietaire() )::uuid[])));
alter policy batiments_moe_read on public.batiments
  using (((copro_id = ANY (( SELECT copros_moe_retenu() )::uuid[])) OR (copro_id = ANY (( SELECT copros_moe_designe() )::uuid[]))));
alter policy batiments_syndic_read on public.batiments
  using ((copro_id = ANY (( SELECT copros_syndic() )::uuid[])));
alter policy bulletins_amo_all on public.bulletins
  using (( SELECT is_amo() ))
  with check (( SELECT is_amo() ));
alter policy bulletins_own_delete on public.bulletins
  using (((cree_par = ( SELECT auth.uid() )) AND (statut = 'brouillon'::bulletin_statut)));
alter policy bulletins_own_insert on public.bulletins
  with check (((cree_par = ( SELECT auth.uid() )) AND (copro_id = ANY (( SELECT copros_coproprietaire() )::uuid[])) AND (coproprietaire_id IN ( SELECT my_coproprietaire_ids() AS my_coproprietaire_ids))));
alter policy bulletins_own_select on public.bulletins
  using ((cree_par = ( SELECT auth.uid() )));
alter policy bulletins_own_update on public.bulletins
  using (((cree_par = ( SELECT auth.uid() )) AND (statut = 'brouillon'::bulletin_statut)))
  with check ((cree_par = ( SELECT auth.uid() )));
alter policy candidatures_amo_all on public.candidatures
  using (( SELECT is_amo() ))
  with check (( SELECT is_amo() ));
alter policy candidatures_presta_insert on public.candidatures
  with check (((prestataire_id = ( SELECT my_prestataire_id() )) AND peut_postuler(consultation_id)));
alter policy candidatures_presta_read on public.candidatures
  using ((prestataire_id = ( SELECT my_prestataire_id() )));
alter policy candidatures_presta_update on public.candidatures
  using ((prestataire_id = ( SELECT my_prestataire_id() )))
  with check ((prestataire_id = ( SELECT my_prestataire_id() )));
alter policy cgu_acceptations_own_insert on public.cgu_acceptations
  with check ((user_id = ( SELECT auth.uid() )));
alter policy cgu_acceptations_own_select on public.cgu_acceptations
  using (((user_id = ( SELECT auth.uid() )) OR ( SELECT is_amo() )));
alter policy checklist_items_amo_all on public.checklist_items
  using (( SELECT is_amo() ))
  with check (( SELECT is_amo() ));
alter policy checklists_amo_all on public.checklists
  using (( SELECT is_amo() ))
  with check (( SELECT is_amo() ));
alter policy choix_amo_all on public.choix_financement
  using (( SELECT is_amo() ))
  with check (( SELECT is_amo() ));
alter policy choix_syndic_insert on public.choix_financement
  with check ((is_scenario_partage(scenario_id) AND (EXISTS ( SELECT 1
   FROM coproprietaires cp
  WHERE ((cp.id = choix_financement.coproprietaire_id) AND (cp.copro_id = ANY (( SELECT copros_syndic() )::uuid[])))))));
alter policy choix_syndic_read on public.choix_financement
  using ((is_scenario_partage(scenario_id) AND (EXISTS ( SELECT 1
   FROM coproprietaires cp
  WHERE ((cp.id = choix_financement.coproprietaire_id) AND (cp.copro_id = ANY (( SELECT copros_syndic() )::uuid[])))))));
alter policy choix_syndic_update on public.choix_financement
  using ((is_scenario_partage(scenario_id) AND (EXISTS ( SELECT 1
   FROM coproprietaires cp
  WHERE ((cp.id = choix_financement.coproprietaire_id) AND (cp.copro_id = ANY (( SELECT copros_syndic() )::uuid[])))))))
  with check ((is_scenario_partage(scenario_id) AND (EXISTS ( SELECT 1
   FROM coproprietaires cp
  WHERE ((cp.id = choix_financement.coproprietaire_id) AND (cp.copro_id = ANY (( SELECT copros_syndic() )::uuid[])))))));
alter policy cles_copro_read on public.cles_repartition
  using ((copro_id = ANY (( SELECT copros_coproprietaire() )::uuid[])));
alter policy cles_repartition_amo_all on public.cles_repartition
  using (( SELECT is_amo() ))
  with check (( SELECT is_amo() ));
alter policy cles_syndic_read on public.cles_repartition
  using ((copro_id = ANY (( SELECT copros_syndic() )::uuid[])));
alter policy consultation_acces_amo_read on public.consultation_acces
  using (( SELECT is_amo() ));
alter policy consultation_acces_presta_insert on public.consultation_acces
  with check (((prestataire_id = ( SELECT my_prestataire_id() )) AND peut_voir_consultation(consultation_id)));
alter policy consultation_acces_presta_read on public.consultation_acces
  using ((prestataire_id = ( SELECT my_prestataire_id() )));
alter policy consultation_acces_presta_update on public.consultation_acces
  using ((prestataire_id = ( SELECT my_prestataire_id() )))
  with check ((prestataire_id = ( SELECT my_prestataire_id() )));
alter policy consultation_docs_amo_all on public.consultation_docs
  using (( SELECT is_amo() ))
  with check (( SELECT is_amo() ));
alter policy notifs_amo_all on public.consultation_notifications
  using (( SELECT is_amo() ))
  with check (( SELECT is_amo() ));
alter policy consultation_questions_amo_all on public.consultation_questions
  using (( SELECT is_amo() ))
  with check (( SELECT is_amo() ));
alter policy consultation_questions_presta_insert on public.consultation_questions
  with check (((prestataire_id = ( SELECT my_prestataire_id() )) AND (reponse IS NULL) AND (answered_at IS NULL) AND (EXISTS ( SELECT 1
   FROM consultations c
  WHERE ((c.id = consultation_questions.consultation_id) AND (c.statut = 'en_ligne'::statut_consultation) AND (c.type = ANY (( SELECT my_presta_types() )::type_consultation[])) AND ((c.prestataires_choisis IS NULL) OR (( SELECT my_prestataire_id() ) = ANY (c.prestataires_choisis))))))));
alter policy consultations_amo_all on public.consultations
  using (( SELECT is_amo() ))
  with check (( SELECT is_amo() ));
alter policy consultations_presta_read on public.consultations
  using ((((statut = 'en_ligne'::statut_consultation) AND (type = ANY (( SELECT my_presta_types() )::type_consultation[])) AND ((prestataires_choisis IS NULL) OR (( SELECT my_prestataire_id() ) = ANY (prestataires_choisis)))) OR a_postule(id)));
alter policy fin_config_amo_all on public.copro_financement_config
  using (( SELECT is_amo() ))
  with check (( SELECT is_amo() ));
alter policy fin_config_copro_read on public.copro_financement_config
  using ((copro_id = ANY (( SELECT copros_coproprietaire() )::uuid[])));
alter policy fin_config_syndic_read on public.copro_financement_config
  using ((copro_id = ANY (( SELECT copros_syndic() )::uuid[])));
alter policy copro_members_amo_all on public.copro_members
  using (( SELECT is_amo() ))
  with check (( SELECT is_amo() ));
alter policy copro_members_own_read on public.copro_members
  using ((user_id = ( SELECT auth.uid() )));
alter policy coproprietaires_amo_all on public.coproprietaires
  using (( SELECT is_amo() ))
  with check (( SELECT is_amo() ));
alter policy coproprietaires_own_read on public.coproprietaires
  using ((user_id = ( SELECT auth.uid() )));
alter policy coproprietaires_syndic_read on public.coproprietaires
  using ((copro_id = ANY (( SELECT copros_syndic() )::uuid[])));
alter policy coproprietes_amo_all on public.coproprietes
  using (( SELECT is_amo() ))
  with check (( SELECT is_amo() ));
alter policy coproprietes_copro_read on public.coproprietes
  using (((id = ANY (( SELECT copros_coproprietaire() )::uuid[])) AND (deleted_at IS NULL)));
alter policy coproprietes_presta_read on public.coproprietes
  using ((((id = ANY (( SELECT copros_visibles_presta() )::uuid[])) OR (id = ANY (( SELECT copros_moe_retenu() )::uuid[])) OR (id = ANY (( SELECT copros_moe_designe() )::uuid[]))) AND (deleted_at IS NULL)));
alter policy coproprietes_syndic_read on public.coproprietes
  using ((((id = ANY (( SELECT copros_syndic() )::uuid[])) OR (id = ANY (( SELECT copros_org_membre() )::uuid[]))) AND (deleted_at IS NULL)));
alter policy demandes_amo_amo_all on public.demandes_amo
  using (( SELECT is_amo() ))
  with check (( SELECT is_amo() ));
alter policy demandes_amo_syndic_insert on public.demandes_amo
  with check (((demandeur_user_id = ( SELECT auth.uid() )) AND (statut = 'nouvelle'::text) AND (traite_par IS NULL) AND (traite_le IS NULL) AND (copro_id IS NULL) AND (((objet = 'amo'::text) AND (ppt_copro_id IS NULL)) OR ((objet = 'consultation_pppt_dpe'::text) AND (ppt_copro_id IS NOT NULL) AND ppt_ouvre(ppt_copro_id)))));
alter policy demandes_amo_syndic_read on public.demandes_amo
  using ((demandeur_user_id = ( SELECT auth.uid() )));
alter policy documents_reference_amo on public.documents_reference
  using (( SELECT is_amo() ))
  with check (( SELECT is_amo() ));
alter policy enquete_reponses_amo_all on public.enquete_reponses
  using (( SELECT is_amo() ))
  with check (( SELECT is_amo() ));
alter policy enquetes_amo_all on public.enquetes
  using (( SELECT is_amo() ))
  with check (( SELECT is_amo() ));
alter policy enquetes_copro_read on public.enquetes
  using ((copro_id = ANY (( SELECT copros_coproprietaire() )::uuid[])));
alter policy enquetes_syndic_read on public.enquetes
  using ((copro_id = ANY (( SELECT copros_syndic() )::uuid[])));
alter policy facturation_clients_amo_lecture on public.facturation_clients
  using (( SELECT is_amo() ));
alter policy facturation_journal_amo_lecture on public.facturation_journal
  using (( SELECT is_amo() ));
alter policy facturation_parametres_amo_lecture on public.facturation_parametres
  using (( SELECT is_amo() ));
alter policy factures_amo_lecture on public.factures
  using (( SELECT is_amo() ));
alter policy feedbacks_amo_delete on public.feedbacks
  using (( SELECT is_amo() ));
alter policy feedbacks_amo_update on public.feedbacks
  using (( SELECT is_amo() ))
  with check (( SELECT is_amo() ));
alter policy feedbacks_insert on public.feedbacks
  with check ((user_id = ( SELECT auth.uid() )));
alter policy feedbacks_own_update on public.feedbacks
  using ((user_id = ( SELECT auth.uid() )))
  with check ((user_id = ( SELECT auth.uid() )));
alter policy feedbacks_select on public.feedbacks
  using ((( SELECT is_amo() ) OR (user_id = ( SELECT auth.uid() ))));
alter policy fiche_etat_sig_read on public.fiche_etat_signatures
  using ((( SELECT is_amo() ) OR (copro_id = ANY (( SELECT copros_syndic() )::uuid[]))));
alter policy fichiers_amo_all on public.fichiers
  using (( SELECT is_amo() ))
  with check (( SELECT is_amo() ));
alter policy fichiers_copro_read on public.fichiers
  using ((partage_copro AND (copro_id = ANY (( SELECT copros_coproprietaire() )::uuid[]))));
alter policy fichiers_syndic_delete_own on public.fichiers
  using (((copro_id = ANY (( SELECT copros_syndic() )::uuid[])) AND (uploaded_by = ( SELECT auth.uid() ))));
alter policy fichiers_syndic_insert on public.fichiers
  with check (((copro_id = ANY (( SELECT copros_syndic() )::uuid[])) AND (uploaded_by = ( SELECT auth.uid() ))));
alter policy fichiers_syndic_read on public.fichiers
  using (((copro_id = ANY (( SELECT copros_syndic() )::uuid[])) AND (NOT confidentiel)));
alter policy honoraires_dossiers_amo_lecture on public.honoraires_dossiers
  using (( SELECT is_amo() ));
alter policy honoraires_jalons_amo_lecture on public.honoraires_jalons
  using (( SELECT is_amo() ));
alter policy honoraires_saisies_amo_lecture on public.honoraires_saisies
  using (( SELECT is_amo() ));
alter policy lot_tantiemes_amo_all on public.lot_tantiemes
  using (( SELECT is_amo() ))
  with check (( SELECT is_amo() ));
alter policy lot_tantiemes_syndic_read on public.lot_tantiemes
  using ((EXISTS ( SELECT 1
   FROM lots l
  WHERE ((l.id = lot_tantiemes.lot_id) AND (l.copro_id = ANY (( SELECT copros_syndic() )::uuid[]))))));
alter policy lots_amo_all on public.lots
  using (( SELECT is_amo() ))
  with check (( SELECT is_amo() ));
alter policy lots_syndic_read on public.lots
  using ((copro_id = ANY (( SELECT copros_syndic() )::uuid[])));
alter policy lots_mutations_amo_all on public.lots_mutations
  using (( SELECT is_amo() ))
  with check (( SELECT is_amo() ));
alter policy lots_mutations_syndic_read on public.lots_mutations
  using ((copro_id = ANY (( SELECT copros_syndic() )::uuid[])));
alter policy lectures_own_all on public.message_lectures
  using ((user_id = ( SELECT auth.uid() )))
  with check ((user_id = ( SELECT auth.uid() )));
alter policy messages_amo_all on public.messages_projet
  using (( SELECT is_amo() ))
  with check (( SELECT is_amo() ));
alter policy messages_copro_insert on public.messages_projet
  with check (((canal = 'coproprietaires'::canal_message) AND (copro_id = ANY (( SELECT copros_coproprietaire() )::uuid[])) AND (user_id = ( SELECT auth.uid() )) AND (prestataire_id IS NULL) AND (coproprietaire_id IN ( SELECT my_coproprietaire_ids_of(messages_projet.copro_id) AS my_coproprietaire_ids_of))));
alter policy messages_copro_read on public.messages_projet
  using (((canal = 'coproprietaires'::canal_message) AND (copro_id = ANY (( SELECT copros_coproprietaire() )::uuid[])) AND ((coproprietaire_id IS NULL) OR (coproprietaire_id IN ( SELECT my_coproprietaire_ids_of(messages_projet.copro_id) AS my_coproprietaire_ids_of)))));
alter policy messages_presta_insert on public.messages_projet
  with check (((canal = 'prestataires'::canal_message) AND (prestataire_id = ( SELECT my_prestataire_id() )) AND (user_id = ( SELECT auth.uid() )) AND (auteur_role = 'presta'::text) AND presta_peut_ecrire_sur(copro_id)));
alter policy messages_presta_read on public.messages_projet
  using (((canal = 'prestataires'::canal_message) AND (((prestataire_id IS NULL) AND (copro_id = ANY (( SELECT copros_presta_retenu() )::uuid[]))) OR (prestataire_id = ( SELECT my_prestataire_id() )))));
alter policy messages_syndic_insert on public.messages_projet
  with check (((canal = 'syndic'::canal_message) AND (copro_id = ANY (( SELECT copros_syndic() )::uuid[])) AND (user_id = ( SELECT auth.uid() )) AND (prestataire_id IS NULL)));
alter policy messages_syndic_read on public.messages_projet
  using (((canal = 'syndic'::canal_message) AND (copro_id = ANY (( SELECT copros_syndic() )::uuid[]))));
alter policy montage_docs_amo_all on public.montage_docs
  using (( SELECT is_amo() ))
  with check (( SELECT is_amo() ));
alter policy montage_docs_syndic_insert on public.montage_docs
  with check (((copro_id = ANY (( SELECT copros_syndic() )::uuid[])) AND (NOT confidentiel)));
alter policy montage_docs_syndic_read on public.montage_docs
  using (((copro_id = ANY (( SELECT copros_syndic() )::uuid[])) AND (NOT confidentiel)));
alter policy montage_docs_syndic_update on public.montage_docs
  using (((copro_id = ANY (( SELECT copros_syndic() )::uuid[])) AND (NOT confidentiel)))
  with check (((copro_id = ANY (( SELECT copros_syndic() )::uuid[])) AND (NOT confidentiel)));
alter policy montage_form_amo_all on public.montage_formulaires
  using (( SELECT is_amo() ))
  with check (( SELECT is_amo() ));
alter policy montage_form_syndic_insert on public.montage_formulaires
  with check ((copro_id = ANY (( SELECT copros_syndic() )::uuid[])));
alter policy montage_form_syndic_read on public.montage_formulaires
  using ((copro_id = ANY (( SELECT copros_syndic() )::uuid[])));
alter policy montage_form_syndic_update on public.montage_formulaires
  using ((copro_id = ANY (( SELECT copros_syndic() )::uuid[])))
  with check ((copro_id = ANY (( SELECT copros_syndic() )::uuid[])));
alter policy notes_projet_amo_all on public.notes_projet
  using (( SELECT is_amo() ))
  with check (( SELECT is_amo() ));
alter policy org_membres_amo_all on public.organisation_membres
  using (( SELECT is_amo() ))
  with check (( SELECT is_amo() ));
alter policy org_membres_own_read on public.organisation_membres
  using ((user_id = ( SELECT auth.uid() )));
alter policy organisations_amo_all on public.organisations
  using (( SELECT is_amo() ))
  with check (( SELECT is_amo() ));
alter policy organisations_membre_read on public.organisations
  using ((EXISTS ( SELECT 1
   FROM organisation_membres m
  WHERE ((m.organisation_id = organisations.id) AND (m.user_id = ( SELECT auth.uid() ))))));
alter policy passations_amo on public.passations
  using (( SELECT is_amo() ))
  with check (( SELECT is_amo() ));
alter policy phase_notes_amo_all on public.phase_notes
  using (( SELECT is_amo() ))
  with check (( SELECT is_amo() ));
alter policy pieces_amo_all on public.pieces_justificatives
  using (( SELECT is_amo() ))
  with check (( SELECT is_amo() ));
alter policy pieces_own_all on public.pieces_justificatives
  using ((coproprietaire_id IN ( SELECT my_coproprietaire_ids() AS my_coproprietaire_ids)))
  with check (((coproprietaire_id IN ( SELECT my_coproprietaire_ids() AS my_coproprietaire_ids)) AND (copro_id = ANY (( SELECT copros_coproprietaire() )::uuid[]))));
alter policy plans_definitifs_amo_all on public.plans_definitifs
  using (( SELECT is_amo() ))
  with check (( SELECT is_amo() ));
alter policy plans_definitifs_copro_read on public.plans_definitifs
  using (((copro_id = ANY (( SELECT copros_coproprietaire() )::uuid[])) AND (statut = 'valide'::text) AND (EXISTS ( SELECT 1
   FROM scenarios_financiers s
  WHERE ((s.plan_definitif_id = plans_definitifs.id) AND (s.statut = 'partage'::statut_scenario))))));
alter policy plans_definitifs_syndic_read on public.plans_definitifs
  using (((copro_id = ANY (( SELECT copros_syndic() )::uuid[])) AND (statut = ANY (ARRAY['partage'::text, 'valide'::text]))));
alter policy plans_individuels_amo_all on public.plans_individuels
  using (( SELECT is_amo() ))
  with check (( SELECT is_amo() ));
alter policy ppt_affectations_read on public.ppt_affectations
  using ((( SELECT is_amo() ) OR ppt_ouvre(ppt_copro_id)));
alter policy ppt_ag_insert on public.ppt_ag
  with check ((ppt_ouvre(ppt_copro_id) AND (saisi_par = ( SELECT auth.uid() ))));
alter policy ppt_analyses_amo_read on public.ppt_analyses
  using (( SELECT is_amo() ));
alter policy ppt_copros_insert on public.ppt_coproprietes
  with check (((( SELECT is_amo() ) OR ppt_is_membre_org(organisation_id)) AND (created_by = ( SELECT auth.uid() ))));
alter policy ppt_copros_read on public.ppt_coproprietes
  using ((( SELECT is_amo() ) OR ((deleted_at IS NULL) AND ppt_is_membre_org(organisation_id))));
alter policy ppt_copros_update on public.ppt_coproprietes
  using ((( SELECT is_amo() ) OR ppt_ouvre(id)))
  with check ((( SELECT is_amo() ) OR ppt_ouvre(id)));
alter policy ppt_corrections_amo_read on public.ppt_corrections
  using (( SELECT is_amo() ));
alter policy ppt_journal_read on public.ppt_journal
  using ((( SELECT is_amo() ) OR ppt_ouvre(ppt_copro_id)));
alter policy ppt_param_amo_write on public.ppt_parametres_org
  using (( SELECT is_amo() ))
  with check (( SELECT is_amo() ));
alter policy ppt_param_read on public.ppt_parametres_org
  using ((( SELECT is_amo() ) OR ppt_is_membre_org(organisation_id)));
alter policy ppt_postes_dirigeant_write on public.ppt_postes
  using (( SELECT is_dirigeant() ))
  with check (( SELECT is_dirigeant() ));
alter policy ppt_postes_read on public.ppt_postes
  using ((( SELECT is_amo() ) OR ppt_ouvre(ppt_copro_id)));
alter policy ppt_rapports_amo_update on public.ppt_rapports
  using (( SELECT is_amo() ))
  with check (( SELECT is_amo() ));
alter policy ppt_rapports_insert on public.ppt_rapports
  with check ((ppt_depose(ppt_copro_id) AND (depose_par = ( SELECT auth.uid() )) AND (statut = 'depose'::text)));
alter policy ppt_rapports_read on public.ppt_rapports
  using ((( SELECT is_amo() ) OR ppt_ouvre(ppt_copro_id)));
alter policy ppt_remarques_dirigeant_write on public.ppt_remarques
  using (( SELECT is_dirigeant() ))
  with check (( SELECT is_dirigeant() ));
alter policy ppt_remarques_read on public.ppt_remarques
  using ((( SELECT is_amo() ) OR (visible_syndic AND ppt_ouvre(ppt_copro_id))));
alter policy ppt_traitements_amo_insert on public.ppt_traitements
  with check (( SELECT is_amo() ));
alter policy ppt_traitements_amo_read on public.ppt_traitements
  using (( SELECT is_amo() ));
alter policy presta_contacts_amo_all on public.prestataire_contacts
  using (( SELECT is_amo() ))
  with check (( SELECT is_amo() ));
alter policy presta_contacts_own_all on public.prestataire_contacts
  using ((prestataire_id = ( SELECT my_prestataire_id() )))
  with check ((prestataire_id = ( SELECT my_prestataire_id() )));
alter policy presta_docs_amo_all on public.prestataire_docs
  using (( SELECT is_amo() ))
  with check (( SELECT is_amo() ));
alter policy presta_docs_own_all on public.prestataire_docs
  using ((prestataire_id = ( SELECT my_prestataire_id() )))
  with check ((prestataire_id = ( SELECT my_prestataire_id() )));
alter policy presta_messages_amo_all on public.prestataire_messages
  using (( SELECT is_amo() ))
  with check (( SELECT is_amo() ));
alter policy presta_messages_own_insert on public.prestataire_messages
  with check (((prestataire_id = ( SELECT my_prestataire_id() )) AND (user_id = ( SELECT auth.uid() )) AND (auteur_role = 'presta'::text)));
alter policy presta_messages_own_read on public.prestataire_messages
  using ((prestataire_id = ( SELECT my_prestataire_id() )));
alter policy presta_messages_lectures_own on public.prestataire_messages_lectures
  using ((user_id = ( SELECT auth.uid() )))
  with check (((user_id = ( SELECT auth.uid() )) AND (( SELECT is_amo() ) OR (prestataire_id = ( SELECT my_prestataire_id() )))));
alter policy prestataires_amo_all on public.prestataires
  using (( SELECT is_amo() ))
  with check (( SELECT is_amo() ));
alter policy prestataires_own_read on public.prestataires
  using ((user_id = ( SELECT auth.uid() )));
alter policy prestataires_own_update on public.prestataires
  using ((user_id = ( SELECT auth.uid() )))
  with check ((user_id = ( SELECT auth.uid() )));
alter policy profiles_amo_delete on public.profiles
  using (( SELECT is_amo() ));
alter policy profiles_amo_update on public.profiles
  using (( SELECT is_amo() ))
  with check (( SELECT is_amo() ));
alter policy profiles_amo_write on public.profiles
  with check (( SELECT is_amo() ));
alter policy profiles_own_read on public.profiles
  using (((user_id = ( SELECT auth.uid() )) OR ( SELECT is_amo() )));
alter policy projet_docs_amo_all on public.projet_docs
  using (( SELECT is_amo() ))
  with check (( SELECT is_amo() ));
alter policy projet_docs_presta_all on public.projet_docs
  using ((prestataire_id = ( SELECT my_prestataire_id() )))
  with check (((prestataire_id = ( SELECT my_prestataire_id() )) AND ((copro_id = ANY (( SELECT copros_presta_retenu() )::uuid[])) OR (copro_id = ANY (( SELECT copros_moe_designe() )::uuid[])))));
alter policy rapport_envois_amo_read on public.rapport_syndic_envois
  using (( SELECT is_amo() ));
alter policy scenarios_copro_read on public.scenarios_financiers
  using (((statut = 'partage'::statut_scenario) AND (copro_id = ANY (( SELECT copros_coproprietaire() )::uuid[]))));
alter policy scenarios_financiers_amo_all on public.scenarios_financiers
  using (( SELECT is_amo() ))
  with check (( SELECT is_amo() ));
alter policy scenarios_syndic_read on public.scenarios_financiers
  using (((statut = 'partage'::statut_scenario) AND (copro_id = ANY (( SELECT copros_syndic() )::uuid[]))));
alter policy signataires_amo_read on public.signataires
  using (( SELECT is_amo() ));
alter policy signataires_own_delete on public.signataires
  using ((EXISTS ( SELECT 1
   FROM bulletins b
  WHERE ((b.id = signataires.bulletin_id) AND (b.cree_par = ( SELECT auth.uid() )) AND (b.statut = 'brouillon'::bulletin_statut)))));
alter policy signataires_own_insert on public.signataires
  with check ((EXISTS ( SELECT 1
   FROM bulletins b
  WHERE ((b.id = signataires.bulletin_id) AND (b.cree_par = ( SELECT auth.uid() )) AND (b.statut = 'brouillon'::bulletin_statut)))));
alter policy signataires_own_select on public.signataires
  using ((EXISTS ( SELECT 1
   FROM bulletins b
  WHERE ((b.id = signataires.bulletin_id) AND (b.cree_par = ( SELECT auth.uid() ))))));
alter policy signataires_own_update on public.signataires
  using ((EXISTS ( SELECT 1
   FROM bulletins b
  WHERE ((b.id = signataires.bulletin_id) AND (b.cree_par = ( SELECT auth.uid() )) AND (b.statut = 'brouillon'::bulletin_statut)))));
alter policy suivi_financier_amo_all on public.suivi_financier
  using (( SELECT is_amo() ))
  with check (( SELECT is_amo() ));
alter policy suivi_financier_syndic_insert on public.suivi_financier
  with check ((copro_id = ANY (( SELECT copros_syndic() )::uuid[])));
alter policy suivi_financier_syndic_read on public.suivi_financier
  using ((copro_id = ANY (( SELECT copros_syndic() )::uuid[])));
alter policy suivi_financier_syndic_update on public.suivi_financier
  using ((copro_id = ANY (( SELECT copros_syndic() )::uuid[])))
  with check ((copro_id = ANY (( SELECT copros_syndic() )::uuid[])));
alter policy syndic_taches_amo_all on public.syndic_taches
  using (( SELECT is_amo() ))
  with check (( SELECT is_amo() ));
alter policy syndic_taches_syndic_read on public.syndic_taches
  using ((copro_id = ANY (( SELECT copros_syndic() )::uuid[])));
alter policy syndic_taches_syndic_update on public.syndic_taches
  using ((copro_id = ANY (( SELECT copros_syndic() )::uuid[])))
  with check ((copro_id = ANY (( SELECT copros_syndic() )::uuid[])));
alter policy taches_amo_all on public.taches
  using (( SELECT is_amo() ))
  with check (( SELECT is_amo() ));

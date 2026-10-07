-- 0141 - Demande d'Amir du 06/10/2026 : « donner accès à la base en lecture à mes
-- collaborateurs pour qu'ils fassent des recherches et exploitent la base, avec Claude ».
--
-- Le plan Supabase est Free : pas de rôle « Read-Only » dans le dashboard, et un
-- compte invité aurait un accès complet. L'accès passe donc par la base elle-même :
-- un rôle de groupe Postgres sans droit sur les tables, qui ne lit que le schéma
-- « exploitation ». Chaque collaborateur aura son propre rôle de connexion, membre de
-- ce groupe (créé à part, avec son mot de passe), relié à un connecteur Postgres
-- de Claude par l'adresse du pooler.
--
-- Périmètre choisi par Amir : dossiers sans données personnelles, plus le nom des
-- copropriétaires et leurs tantièmes. Donc JAMAIS exposés : e-mails, téléphones,
-- adresses personnelles, comptes (user_id), gestionnaires nommés, contacts des
-- prestataires, enquêtes et revenus, pièces, plans individuels, choix de
-- financement individuels, signatures, jetons, codes, facturation et honoraires
-- (réservés au dirigeant).
--
-- Les vues appartiennent à postgres et s'exécutent avec ses droits (pas de
-- security_invoker) : c'est ce qui permet de lire malgré la RLS, qui ne reconnaît
-- pas une connexion directe sans jeton. Le schéma n'est pas exposé à l'API
-- (db_schemas = public) et ni anon ni authenticated n'y ont accès.

create schema if not exists exploitation;
revoke all on schema exploitation from public, anon, authenticated;
comment on schema exploitation is
  'Lecture seule pour l''équipe (0141) : vues sans données personnelles, sauf nom des copropriétaires. Aucune vue ne doit exposer e-mail, téléphone, revenus, pièces, signatures ou facturation.';

-- Dossiers et bâtiments ------------------------------------------------------

create or replace view exploitation.coproprietes as
select id, name, slug, city, code_postal, adresse, phase, fragile,
       energy_before, energy_after, gain_pct, progress, syndic_name, tag,
       chef_projet, maitre_oeuvre, organisation_id, nb_logements,
       denomination_batiments, date_ag, created_at, updated_at, deleted_at
from public.coproprietes;

create or replace view exploitation.batiments as
select id, copro_id, code, label, position, adresse, declare_creation
from public.batiments;

-- Copropriétaires (nom seulement), lots et tantièmes -------------------------

create or replace view exploitation.coproprietaires as
select id, copro_id, nom, type, sortant_le, created_at
from public.coproprietaires;

create or replace view exploitation.lots as
select id, copro_id, batiment_id, coproprietaire_id, num, usage, rattache_a, created_at
from public.lots;

create or replace view exploitation.cles_repartition as
select id, copro_id, code, label, is_default
from public.cles_repartition;

create or replace view exploitation.lot_tantiemes as
select lot_id, cle_id, tantiemes
from public.lot_tantiemes;

-- Vue pratique : un lot, son bâtiment, son copropriétaire et ses tantièmes par clé.
create or replace view exploitation.lots_detail as
select l.id as lot_id, l.copro_id, c.name as copropriete,
       b.code as batiment_code, b.label as batiment,
       l.num as lot, l.usage, l.rattache_a,
       p.id as coproprietaire_id, p.nom as coproprietaire, p.type as coproprietaire_type,
       k.code as cle_code, k.label as cle, t.tantiemes
from public.lots l
join public.coproprietes c on c.id = l.copro_id
left join public.batiments b on b.id = l.batiment_id
left join public.coproprietaires p on p.id = l.coproprietaire_id
left join public.lot_tantiemes t on t.lot_id = l.id
left join public.cles_repartition k on k.id = t.cle_id;

-- Avancement et financement (plans validés ou non, sans le détail individuel) ---

create or replace view exploitation.taches as
select id, copro_id, phase, title, status, due_date, due_label, tag, jalon, position, created_at
from public.taches;

create or replace view exploitation.scenarios_financiers as
select id, copro_id, name, statut, locked, bareme_millesime, params, resultat,
       validated_at, created_at, updated_at, plan_definitif_id
from public.scenarios_financiers;

create or replace view exploitation.plans_definitifs as
select id, copro_id, nom, data, resultat, statut, version, nature,
       estimatif_groupe, scenario_ordre, valide_le, created_at, updated_at
from public.plans_definitifs;

create or replace view exploitation.copro_financement_config as
select copro_id, banque, duree_annees, adhesion_ouverte, date_limite_choix, updated_at
from public.copro_financement_config;

create or replace view exploitation.baremes as
select id, millesime, zone, params, actif, created_at
from public.baremes;

-- Consultations, offres et prestataires (sans contact) -------------------------

create or replace view exploitation.consultations as
select id, copro_id, type, mission, date_limite, budget, statut, published_at,
       copro_externe_nom, copro_externe_adresse, copro_externe_ville, copro_externe_lots,
       options, nb_logements, sous_type, nb_batiments, ppt_copro_id,
       analyse_avis, analyse_candidature_id, analyse_publiee_le, prestataires_choisis
from public.consultations;

create or replace view exploitation.candidatures as
select id, consultation_id, prestataire_id, org_name, received_at, statut, montant,
       tarif_diag_avp, tarif_pro_dce, tarif_chantier, tarif_options,
       tarif_chantier_mode, tarif_pro_dce_mode, tarif_etancheite_avant,
       tarif_etancheite_apres, tarif_conception, tarif_realisation,
       tarif_pppt, tarif_dpe, delai_pppt_semaines, delai_dpe_semaines,
       decision_at, engagement_at, retrait_at, retrait_motif, modifiee_le
from public.candidatures;

create or replace view exploitation.prestataires as
select id, raison_sociale, siret, ville, code_postal, types, actif,
       departements, site_web, ne_pas_consulter, created_at, updated_at
from public.prestataires;

create or replace view exploitation.organisations as
select id, nom, slug, module_ppt, created_at
from public.organisations;

-- Suivi PPT (sans gestionnaire nommé) -------------------------------------------

create or replace view exploitation.ppt_coproprietes as
select id, organisation_id, nom, adresse, code_postal, commune, immatriculation_rnc,
       annee_construction, nb_batiments, nb_lots, nb_logements, surface_m2, surface_type,
       chauffage, energie_chauffage, etiquette_energie, etiquette_ges, cep_kwhep_m2_an,
       date_dpe, fonds_travaux_solde, fonds_travaux_cotisation_annuelle, fonds_travaux_maj,
       budget_previsionnel_annuel, copro_id, plus_de_15_ans, pppt_presente, importe_le,
       created_at, updated_at, deleted_at
from public.ppt_coproprietes;

create or replace view exploitation.ppt_postes as
select id, ppt_copro_id, rapport_id, code_source, libelle, libelle_source, ouvrage,
       batiment, priorite, critere, annee_prevue, annee_origine, cout_ht_base,
       cout_origine, tva_pct, avec_moe, gain_energetique_pct, statut,
       annee_prochaine_presentation, montant_vote, commentaire, position, actif,
       montant_syndic, commentaire_syndic, origine, motif_retrait, retire_le,
       cout_ht_source, reevaluation_prix_coef, regroupe_ids, created_at, updated_at
from public.ppt_postes;

-- Groupe de lecture --------------------------------------------------------------
-- Aucun droit sur public. Les collaborateurs sont créés à part, un rôle chacun,
-- avec « in role lecture_equipe ».

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'lecture_equipe') then
    create role lecture_equipe nologin;
  end if;
end $$;

grant usage on schema exploitation to lecture_equipe;
revoke all on all tables in schema exploitation from public, anon, authenticated;
grant select on all tables in schema exploitation to lecture_equipe;

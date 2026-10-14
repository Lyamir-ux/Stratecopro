-- 0164 - Postes de travaux envisagés d'une consultation (idée de Louis du
-- 13/10/2026, page /consultations) : à la publication d'une consultation de
-- maîtrise d'œuvre, de diagnostic amiante, de contrôle technique ou de SPS,
-- l'équipe complète un tableau des postes de travaux à envisager, en plus du
-- budget estimatif.
--
-- consultations.postes_travaux : liste JSON de lignes
--   { "poste": "Isolation des façades", "montant": 120000, "precisions": "ITE sur 3 bâtiments" }
--   - poste      : texte, obligatoire (une ligne sans poste n'est jamais enregistrée) ;
--   - montant    : estimation en € HT, null si non chiffrée ;
--   - precisions : texte libre, "" si aucune.
-- Lisible comme le reste de la consultation (mêmes politiques RLS : les
-- entreprises du métier, l'équipe) ; aucune politique à modifier.

alter table consultations add column if not exists postes_travaux jsonb not null default '[]'::jsonb;

alter table consultations drop constraint if exists consultations_postes_travaux_liste;
alter table consultations add constraint consultations_postes_travaux_liste
  check (jsonb_typeof(postes_travaux) = 'array');

comment on column consultations.postes_travaux is
  'Postes de travaux envisagés (0164) : [{poste, montant (€ HT ou null), precisions}], complétés par l''équipe à la publication (MOE, amiante, contrôle technique, SPS).';

-- Lecture seule de l'équipe (0141) : la colonne rejoint la vue, en dernier
create or replace view exploitation.consultations as
select id, copro_id, type, mission, date_limite, budget, statut, published_at,
       copro_externe_nom, copro_externe_adresse, copro_externe_ville, copro_externe_lots,
       options, nb_logements, sous_type, nb_batiments, ppt_copro_id,
       analyse_avis, analyse_candidature_id, analyse_publiee_le, prestataires_choisis,
       postes_travaux
from public.consultations;

-- 0118 - Pièces justificatives demandées selon la situation (feedback Marius
-- MAZZANTE du 30/09/2026). L'enquête sociale du portail déduit des réponses les
-- pièces à fournir (src/lib/piecesSituation.ts) ; chacune se dépose dans
-- pieces_justificatives (une par type et par copropriétaire, contrainte
-- existante) et suit la vérification de 0079 (à vérifier / validée / refusée).
--
-- Nouveaux types :
-- - avis_imposition_2 : second déclarant du ménage (deux avis) ;
-- - justificatif_usufruit : taxe foncière au nom de l'usufruitier ou acte ;
-- - pret_usage_notarie, kbis_sci, statuts_sci, avis_associes_sci : SCI à l'IR
--   dont un associé occupe le logement ;
-- - jugement_protection : tutelle ou curatelle.

alter type type_piece add value if not exists 'avis_imposition_2';
alter type type_piece add value if not exists 'justificatif_usufruit';
alter type type_piece add value if not exists 'pret_usage_notarie';
alter type type_piece add value if not exists 'kbis_sci';
alter type type_piece add value if not exists 'statuts_sci';
alter type type_piece add value if not exists 'avis_associes_sci';
alter type type_piece add value if not exists 'jugement_protection';

-- Maîtres d'œuvre connus des portefeuilles Citya (Ruhl Segesca, Immo 4) et
-- IMMIUM (IMMIUM, Laemmel) - fichier d'Amir du 26/09/2026
-- « Copropriétés Citya - IMMIUM 26-09-2026 - MOE.xlsx » (colonne MOE).
-- Graphies harmonisées : « kaleos » -> Khaleos (2 autres dossiers), majuscule
-- initiale pour interaxion, collectivité services, carré d'architectes.
-- « Non renseigné » (6/8 rue d'Obernai, Porte Dauphine) laissé vide.
-- Rapprochement par enseigne + nom exact du dossier. updated_at conservé : le
-- tableau de bord AMO trie le kanban sur la dernière modification.
begin;
alter table coproprietes disable trigger trg_coproprietes_updated;
update coproprietes c
set maitre_oeuvre = v.moe
from (values
  ('Citya Ruhl Segesca', '11 RUE DE ROSHEIM', 'ANBRA'),
  ('Citya Ruhl Segesca', '147 route des romains / 12 rue de capucins (OPAH RU)', 'CHHK'),
  ('Citya Ruhl Segesca', '172-174 ROUTE DU POLYGONE', 'M associés'),
  ('Citya Ruhl Segesca', '53 RUE DE LA COURSE', 'Ingedair'),
  ('Citya Ruhl Segesca', 'ANEMONES', 'Atelier G5'),
  ('Citya Ruhl Segesca', 'BVD ANVERS', 'EPC 67'),
  ('Citya Ruhl Segesca', 'DEPOT', 'Ingedair'),
  ('Citya Ruhl Segesca', 'GLIESBERG 2', 'CHHK'),
  ('Citya Ruhl Segesca', 'LA CITADELLE', 'CNB.archi'),
  ('Citya Ruhl Segesca', 'LE COLISEE', 'CHHK'),
  ('Citya Ruhl Segesca', 'LE LOUVOIS', 'CNB.archi'),
  ('Citya Ruhl Segesca', 'LE MURANO', 'ABK'),
  ('Citya Ruhl Segesca', 'Le Renaissance', 'CHHK'),
  ('Citya Ruhl Segesca', 'LILAS', 'Atelier G5'),
  ('Citya Ruhl Segesca', 'MEINAU', 'CNB.archi'),
  ('Citya Ruhl Segesca', 'PLATANES', 'CNB.archi'),
  ('Citya Ruhl Segesca', 'SLEIDAN', 'ANBRA'),
  ('Citya Ruhl Segesca', 'VERT GALANT 2', 'Goepfert'),
  ('Citya Immo 4', '144 route des romains / 13 rue des brasseurs (OPAH RU)', 'Ingedair'),
  ('Citya Immo 4', '82 RUE DE LA ZIEGELAU', 'Interaxion'),
  ('Citya Immo 4', 'LA VIOLETTE', 'M associés'),
  ('Citya Immo 4', 'LE CATALPA', 'CNB.archi'),
  ('Citya Immo 4', 'LES ANEMONES', 'Ingedair'),
  ('Citya Immo 4', 'LILLA', 'Khaleos'),
  ('Citya Immo 4', 'MELEZES', 'Ingedair'),
  ('Citya Immo 4', 'PRÉS VERT', 'Collectivité services'),
  ('Citya Immo 4', 'QUAI MATHISS', 'ABK'),
  ('IMMIUM', '14-16 rue de Limoges', 'LAMA'),
  ('IMMIUM', '19-21 Faubourg National', 'LAMA'),
  ('IMMIUM', '2-4-6 RUE DE TOURAINE', 'SATIM'),
  ('IMMIUM', '3 rue Mariano', 'Ingedair'),
  ('IMMIUM', '8-10 RUE SAINT YRIEIX', 'LAMA'),
  ('IMMIUM', '9 RUE DE LA GARE (67300)', 'AMC'),
  ('IMMIUM', 'BOUDHORS', 'Khaleos'),
  ('IMMIUM', 'DORNACH III', 'Carré d''architectes'),
  ('IMMIUM', 'GALILEE', 'Ingedair'),
  ('IMMIUM', 'L''HIPPOCRATE', 'ANBRA'),
  ('IMMIUM', 'LE BAYARD', 'Atelier G5'),
  ('IMMIUM', 'LE BELLINI', 'Atelier G5'),
  ('IMMIUM', 'Le Churchill', 'ANBRA'),
  ('IMMIUM', 'LE KURVAU', 'ANBRA'),
  ('IMMIUM', 'Le Rodin', 'LAMA'),
  ('IMMIUM', 'LE SCHIMPER', 'ANBRA'),
  ('IMMIUM', 'LES URBAINES', 'KMA'),
  ('IMMIUM', 'RESIDENCE ECO', 'CNB.archi'),
  ('IMMIUM', 'RUE DE BARR - OBERNAI', 'KMA'),
  ('IMMIUM', 'ST MICHEL - STE MARGUERITE', 'LAMA'),
  ('IMMIUM', 'STOCKHOLM', 'Ingedair'),
  ('IMMIUM Laemmel', '10 RUE THANN', 'Ingedair'),
  ('IMMIUM Laemmel', '16 rue Geroldseck (OPAH RU)', 'Atelier G5'),
  ('IMMIUM Laemmel', '18 RUE FIX', 'Collectivité services'),
  ('IMMIUM Laemmel', '33 RUE DES MALTERIES', 'Atelier G5'),
  ('IMMIUM Laemmel', 'ANCIENNE GARE', 'CNB.archi'),
  ('IMMIUM Laemmel', 'ANDROMEDE', 'Collectivité services'),
  ('IMMIUM Laemmel', 'Baldner', 'Ingedair'),
  ('IMMIUM Laemmel', 'Grossau', 'Ingedair'),
  ('IMMIUM Laemmel', 'LAMARTINE', 'Ingedair'),
  ('IMMIUM Laemmel', 'LE FORUM (OPAH RU)', 'AMC'),
  ('IMMIUM Laemmel', 'LE NEUVILLE', 'Ingedair'),
  ('IMMIUM Laemmel', 'LE POLYGONE', 'Ingedair'),
  ('IMMIUM Laemmel', 'LE TASSIGNY', 'ABK'),
  ('IMMIUM Laemmel', 'LES BATELIERS', 'Imaée'),
  ('IMMIUM Laemmel', 'LES GEMEAUX', 'Khaleos'),
  ('IMMIUM Laemmel', 'LES JARDINS DE MANNET', 'Ingedair'),
  ('IMMIUM Laemmel', 'Les Renards', 'Ingedair'),
  ('IMMIUM Laemmel', 'NOUVELLE CITE DIALOGUE', 'RAL 1023'),
  ('IMMIUM Laemmel', 'OREADES', 'LAMA'),
  ('IMMIUM Laemmel', 'ROND POINT DE L''ESPLANADE', 'CNB.archi'),
  ('IMMIUM Laemmel', 'STADTWAY', 'Ingedair'),
  ('IMMIUM Laemmel', 'STOSSWIHR', 'LAMA'),
  ('IMMIUM Laemmel', 'TUILERIES', 'Ingedair')
) as v(enseigne, nom, moe)
join organisations o on o.nom = v.enseigne
where c.organisation_id = o.id
  and c.name = v.nom
  and c.deleted_at is null;
alter table coproprietes enable trigger trg_coproprietes_updated;
commit;

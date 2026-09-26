-- 0104 - Feedback d'Amir du 26/09/2026 : « voici la liste des maîtres d'œuvre
-- connus par copropriété, rajoute cette information sur les tableaux de bord
-- qui présentent les copropriétés en liste, côté AMO et syndic ».
-- Nom du maître d'œuvre en clair, comme le chef de projet : la MOE d'un dossier
-- n'a pas forcément été retenue par une consultation du logiciel (ni même de
-- fiche prestataire). Saisi par l'AMO dans l'onglet Données, lu par l'espace
-- syndic avec le reste de la fiche (RLS 0062 inchangée). Null = non renseigné.
alter table coproprietes add column if not exists maitre_oeuvre text;

comment on column coproprietes.maitre_oeuvre is
  'Maître d''œuvre du dossier (nom de la société, texte libre) - affiché dans les listes AMO et syndic';

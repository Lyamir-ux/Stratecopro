-- Feedback du 14/08/2026 : le nombre de bâtiments est déclaré à la création du
-- dossier (avec l'adresse de chaque bâtiment s'il y en a plusieurs). Ces bâtiments
-- font foi et ne sont jamais supprimés par le ménage de l'import des lots,
-- même si la répartition des lots référence d'autres bâtiments.

alter table batiments
  add column adresse text,
  add column declare_creation boolean not null default false;

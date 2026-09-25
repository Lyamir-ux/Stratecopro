-- 0101 - Feedback d'Amir du 24/09/2026 (onglet Données d'un dossier) :
-- « lorsque l'on importe une photo, il faut la recadrer correctement ».
-- La photo d'origine reste telle quelle dans le bucket copro-photos ; le
-- cadrage choisi dans la fenêtre « Cadrer la nouvelle photo » / « Recadrer »
-- est enregistré à part : point gardé visible (x, y en % de l'image) et zoom,
-- appliqués au bandeau du dossier, aux cartes du tableau de bord et à l'espace
-- syndic. Null = cadrage centré d'origine (photos existantes inchangées).
alter table coproprietes add column if not exists photo_cadrage jsonb;

alter table coproprietes drop constraint if exists coproprietes_photo_cadrage_objet;
alter table coproprietes add constraint coproprietes_photo_cadrage_objet
  check (photo_cadrage is null or jsonb_typeof(photo_cadrage) = 'object');

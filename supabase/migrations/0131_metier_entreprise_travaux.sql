-- Éco-PTZ individuel (demande d'Amir, 02/10/2026) : les entreprises de travaux
-- RGE saisies au dépôt d'un devis ou d'un CCTP/DPGF rejoignent la base
-- prestataires avec un métier à elles. Ce métier n'est pas un type de
-- consultation : l'AMO ne consulte que des prestations intellectuelles, et
-- aucune alerte de consultation ne part vers une entreprise de travaux (les
-- alertes filtrent sur le métier de la consultation).
--
-- Isolée : la nouvelle valeur d'enum doit être validée avant d'être utilisée
-- (0132 s'en sert).

alter type type_consultation add value if not exists 'travaux';

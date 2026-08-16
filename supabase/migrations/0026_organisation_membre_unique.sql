-- 0026 — Un compte n'appartient qu'à une seule enseigne.
-- Un gestionnaire ne travaille pas pour deux cabinets à la fois, et l'espace
-- syndic affiche une enseigne unique dans son bandeau : on garantit l'invariant
-- côté base plutôt que de le supposer côté écran.
alter table organisation_membres
  add constraint organisation_membres_user_unique unique (user_id);

-- 0051 - Point de départ des relances automatiques (J+3 / J+7 / J+25 / J+30) :
-- date d'envoi des liens aux cosignataires, figée à la signature du principal.
alter table bulletins add column liens_envoyes_le timestamptz;

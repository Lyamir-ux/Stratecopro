-- 0107 - Demande de consultation « PPPT + DPE collectif » depuis le suivi des PPT
--
-- Feedback Amir 27/09/2026 (17:36, page /syndic/ppt) : une colonne « Sans
-- PPPT » en amont de « En analyse » ; un clic sur une copropriété de cette
-- colonne ouvre une fenêtre « Voulez-vous une consultation pour la réalisation
-- du PPPT et du DPE collectif ? ».
--
-- La réponse « oui » est une demande adressée à Strat Eco, comme une demande
-- d'AMO : même boîte de réception (/demandes), mêmes destinataires de l'alerte
-- e-mail (profiles.recoit_demandes_amo, 0100), même suivi (à traiter, prise en
-- charge, classée, suite donnée visible du syndic). Deux colonnes seulement :
-- l'objet de la demande et la copropriété du suivi PPT d'où elle part.
-- Aucune table de la rénovation globale n'est touchée ; la branche PPT reste
-- isolée (la demande pointe vers ppt_coproprietes, jamais l'inverse).

alter table demandes_amo
  add column if not exists objet text not null default 'amo'
    check (objet in ('amo', 'consultation_pppt_dpe')),
  add column if not exists ppt_copro_id uuid references ppt_coproprietes (id) on delete set null;

comment on column demandes_amo.objet is
  'amo = demande d''accompagnement (0089) ; consultation_pppt_dpe = consultation pour la réalisation du PPPT et du DPE collectif, déposée depuis le suivi des PPT (0107).';
comment on column demandes_amo.ppt_copro_id is
  'Copropriété du suivi PPT d''où part une demande de consultation PPPT + DPE collectif (0107).';

create index if not exists idx_demandes_amo_ppt_copro on demandes_amo (ppt_copro_id) where ppt_copro_id is not null;

-- Une seule demande de consultation en attente par copropriété (double clic,
-- deux gestionnaires) ; une demande classée sans suite peut être refaite.
create unique index if not exists uq_demandes_amo_consultation_en_attente
  on demandes_amo (ppt_copro_id)
  where objet = 'consultation_pppt_dpe' and statut = 'nouvelle';

-- Dépôt : une demande de consultation part d'une copropriété du suivi PPT que
-- le demandeur peut ouvrir (direction de l'enseigne ou gestionnaire affecté) ;
-- une demande d'AMO ne pointe vers aucune.
drop policy if exists demandes_amo_syndic_insert on demandes_amo;
create policy demandes_amo_syndic_insert on demandes_amo
  for insert to authenticated
  with check (
    demandeur_user_id = auth.uid()
    and statut = 'nouvelle'
    and traite_par is null
    and traite_le is null
    and copro_id is null
    and (
      (objet = 'amo' and ppt_copro_id is null)
      or (objet = 'consultation_pppt_dpe' and ppt_copro_id is not null and ppt_ouvre(ppt_copro_id))
    )
  );

-- Lecture : en plus des siennes, la demande de consultation d'une copropriété
-- PPT se voit de tous ceux qui ouvrent ce dossier (la direction voit celle de
-- son gestionnaire, le nouveau gestionnaire celle de son prédécesseur) : la
-- carte « Sans PPPT » affiche « consultation demandée » au lieu d'en reproposer une.
drop policy if exists demandes_amo_ppt_read on demandes_amo;
create policy demandes_amo_ppt_read on demandes_amo
  for select to authenticated
  using (ppt_copro_id is not null and ppt_ouvre(ppt_copro_id));

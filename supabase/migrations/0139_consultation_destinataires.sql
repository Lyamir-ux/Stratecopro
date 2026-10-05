-- 0139 - Idée de Louis (Équipe AMO) du 05/10/2026 14:18, page /consultations :
-- « il serait intéressant de pouvoir choisir parmi les mails d'un prestataire
-- l'adresse à qui envoyer la consultation ».
--
-- Une entreprise a une adresse principale (prestataires.email, identifiant du
-- compte), des adresses en copie (emails_secondaires, 0106) et des contacts
-- (prestataire_contacts.email). Jusqu'ici l'alerte partait vers la principale
-- avec les copies. Désormais, dans la fenêtre de choix des entreprises, l'équipe
-- peut dire à quelles adresses de CETTE entreprise la consultation est envoyée.
--
-- Table à part (et non une colonne de consultations) : une entreprise qui peut
-- lire la consultation lirait aussi les adresses de ses concurrentes. Ici, AMO
-- seul ; notifier-consultation lit avec la clé de service.
-- Pas de ligne = comportement d'avant (principale + copies). Une ligne = ces
-- adresses seulement, chacune devant appartenir à l'entreprise au moment de
-- l'envoi (notifier-consultation les recoupe avec la fiche).

create table if not exists consultation_destinataires (
  consultation_id uuid not null references consultations (id) on delete cascade,
  prestataire_id uuid not null references prestataires (id) on delete cascade,
  emails text[] not null,
  created_at timestamptz not null default now(),
  primary key (consultation_id, prestataire_id),
  constraint consultation_destinataires_emails_non_vide check (cardinality(emails) > 0)
);

comment on table consultation_destinataires is
  'Adresses de l''entreprise à qui la consultation est envoyée (0139). Absent = adresse principale + copies. AMO seul.';

alter table consultation_destinataires enable row level security;

drop policy if exists consultation_destinataires_amo_all on consultation_destinataires;
create policy consultation_destinataires_amo_all on consultation_destinataires
  for all to authenticated
  using (( select is_amo() ))
  with check (( select is_amo() ));

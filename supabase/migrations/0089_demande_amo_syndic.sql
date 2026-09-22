-- 0089 - Demande d'AMO déposée par un syndic
--
-- Feedbacks Amir 22/09/2026 (12:58) :
--   • « Dans la colonne Futur projet, mettre un bouton Faire une demande qui
--     sera envoyé à l'assistant à maîtrise d'ouvrage sur une copropriété » ;
--   • « Mettre également en haut, à côté de Suivi des PPPT, faire une demande
--     d'AMO ».
-- Cinq informations seulement : nom de la copropriété, adresse, nombre de lots,
-- mode de chauffage, présence d'une VMC. Le reste (ville, bâtiments, phase…)
-- se remplit quand l'équipe AMO transforme la demande en dossier.

create table demandes_amo (
  id uuid primary key default gen_random_uuid(),
  -- les cinq champs du formulaire
  copro_nom text not null,
  adresse text not null default '',
  nb_lots integer check (nb_lots is null or nb_lots > 0),
  chauffage text,
  vmc boolean,
  -- qui demande (figé au dépôt : le compte peut changer d'enseigne ensuite)
  demandeur_user_id uuid references profiles (user_id) on delete set null,
  demandeur_nom text not null default '',
  demandeur_email text,
  organisation_id uuid references organisations (id) on delete set null,
  syndic_name text,
  -- suivi côté AMO
  statut text not null default 'nouvelle' check (statut in ('nouvelle', 'traitee', 'classee')),
  commentaire_amo text,
  copro_id uuid references coproprietes (id) on delete set null,
  traite_par uuid references profiles (user_id) on delete set null,
  traite_le timestamptz,
  created_at timestamptz not null default now()
);

create index idx_demandes_amo_statut on demandes_amo (statut, created_at desc);
create index idx_demandes_amo_demandeur on demandes_amo (demandeur_user_id, created_at desc);

alter table demandes_amo enable row level security;

-- L'équipe AMO voit et traite toutes les demandes.
create policy demandes_amo_amo_all on demandes_amo
  for all to authenticated using (is_amo()) with check (is_amo());

-- Le syndic dépose une demande en son nom et suit les siennes (pas celles des
-- collègues : une demande d'AMO est un acte commercial personnel).
create policy demandes_amo_syndic_read on demandes_amo
  for select to authenticated using (demandeur_user_id = auth.uid());

create policy demandes_amo_syndic_insert on demandes_amo
  for insert to authenticated
  with check (
    demandeur_user_id = auth.uid()
    and statut = 'nouvelle'
    and traite_par is null
    and traite_le is null
    and copro_id is null
  );

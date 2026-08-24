-- 0046 - Notification des passations de dossier (feedback Wafaa 24/08/2026)
-- Quand le chef de projet d'un dossier change (création ou fiche Données),
-- l'edge function notifier-passation alerte par e-mail le nouveau chef de
-- projet (et l'ancien s'il a un compte). Chaque passation est tracée ici
-- avec le statut de l'envoi - service role côté edge, lecture équipe AMO.
create table passations (
  id uuid primary key default gen_random_uuid(),
  copro_id uuid not null references coproprietes (id) on delete cascade,
  ancien_chef text,
  nouveau_chef text not null,
  -- statut de l'e-mail au nouveau chef de projet
  email_statut text not null default 'simule'
    check (email_statut in ('envoye', 'simule', 'erreur', 'sans_email')),
  notifie_par uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index idx_passations_copro on passations (copro_id, created_at desc);

alter table passations enable row level security;
create policy passations_amo on passations
  for all to authenticated using (is_amo()) with check (is_amo());

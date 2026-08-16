-- 0020 — Retours de test (phase de test avant mise en production)
-- Un module « Feedback » flottant (en bas à droite) est affiché à tous les
-- utilisateurs connectés, quel que soit leur espace (AMO, syndic, copro,
-- prestataire). Chaque remarque est enregistrée ici avec son contexte
-- (auteur, page, navigateur) ; l'équipe compile les retours depuis la page
-- Paramètres. Le widget se désactive via VITE_FEEDBACK=off au moment de la
-- mise en production (la table reste, l'historique est conservé).
create table feedbacks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  -- instantané de l'auteur : lisible même si le compte de test est supprimé
  auteur_nom text not null default '',
  auteur_role text not null default '',
  page text not null default '',
  type text not null default 'remarque' check (type in ('bug', 'idee', 'remarque')),
  message text not null,
  navigateur text,
  statut text not null default 'nouveau' check (statut in ('nouveau', 'traite')),
  created_at timestamptz not null default now()
);
create index idx_feedbacks_created on feedbacks (created_at desc);

-- ========== RLS ==========
alter table feedbacks enable row level security;

-- tout utilisateur connecté dépose un retour en son propre nom
create policy feedbacks_insert on feedbacks
  for insert to authenticated with check (user_id = auth.uid());
-- l'équipe AMO compile tous les retours ; chacun peut relire les siens
create policy feedbacks_select on feedbacks
  for select to authenticated using (is_amo() or user_id = auth.uid());
create policy feedbacks_amo_update on feedbacks
  for update to authenticated using (is_amo()) with check (is_amo());
create policy feedbacks_amo_delete on feedbacks
  for delete to authenticated using (is_amo());

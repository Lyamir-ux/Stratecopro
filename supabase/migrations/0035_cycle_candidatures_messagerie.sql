-- 0035 — Feedbacks du 19/08 :
-- 1. Cycle de vie des candidatures : décision AMO (retenir / refuser) avec
--    e-mail automatique au prestataire, confirmation d'engagement par le
--    prestataire retenu (le projet passe alors dans « Mes projets »),
--    retrait d'une candidature encore à l'étude.
-- 2. Fiche entreprise éditable par le prestataire : logo, e-mails de contact,
--    téléphone, adresse, contacts de l'entreprise, documents de certification.
-- 3. Messagerie de projet par canal (prestataires / syndic / copropriétaires),
--    pilotée depuis l'onglet Communications du dossier copro, avec suivi de
--    lecture (pastille de messages non lus côté prestataire).
-- 4. Notes et documents liés par étape du projet (onglet Projet).
-- 5. Feedbacks modifiables par leur auteur (l'AMO peut déjà tout modifier).

-- ========== 1. Candidatures : décision AMO & engagement du prestataire ==========
alter table candidatures add column decision_at timestamptz;
alter table candidatures add column decision_email_statut text
  check (decision_email_statut in ('envoye', 'simule', 'erreur'));
alter table candidatures add column engagement_at timestamptz;

-- Le prestataire retenu confirme son engagement depuis son espace ; le
-- trigger ci-dessous garantit que c'est le SEUL champ qu'il peut toucher.
create policy candidatures_presta_update on candidatures
  for update to authenticated
  using (prestataire_id = my_prestataire_id() and statut = 'retenue')
  with check (prestataire_id = my_prestataire_id() and statut = 'retenue');

create or replace function protege_candidature_presta()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if is_amo() then return new; end if;
  if to_jsonb(new) - 'engagement_at' <> to_jsonb(old) - 'engagement_at' then
    raise exception 'Seule la confirmation d''engagement est modifiable par le prestataire';
  end if;
  return new;
end;
$$;
create trigger trg_candidatures_presta before update on candidatures
  for each row execute function protege_candidature_presta();

-- Retrait d'une candidature : possible tant qu'elle est à l'étude (reçue)
-- et que la consultation est encore en ligne.
create policy candidatures_presta_delete on candidatures
  for delete to authenticated
  using (
    prestataire_id = my_prestataire_id()
    and statut = 'recue'
    and exists (
      select 1 from consultations c
      where c.id = consultation_id and c.statut = 'en_ligne'
    )
  );

-- ========== 2. Fiche entreprise éditable par le prestataire ==========
alter table prestataires add column adresse text;
alter table prestataires add column email_secondaire text;
alter table prestataires add column logo_path text;   -- bucket presta-docs

create policy prestataires_own_update on prestataires
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Le prestataire n'édite que ses coordonnées ; les métiers, le référencement,
-- la raison sociale et le rattachement de compte restent pilotés par l'AMO.
create or replace function protege_prestataire_own()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  modifiables text[] := array[
    'email', 'email_secondaire', 'telephone', 'adresse', 'ville',
    'logo_path', 'contact_nom', 'updated_at'
  ];
begin
  if is_amo() then return new; end if;
  if to_jsonb(new) - modifiables <> to_jsonb(old) - modifiables then
    raise exception 'Champs réservés à l''équipe AMO (métiers, référencement, raison sociale…)';
  end if;
  return new;
end;
$$;
create trigger trg_prestataires_own before update on prestataires
  for each row execute function protege_prestataire_own();

-- Contacts de l'entreprise (nom, rôle, coordonnées)
create table prestataire_contacts (
  id uuid primary key default gen_random_uuid(),
  prestataire_id uuid not null references prestataires (id) on delete cascade,
  nom text not null,
  role text,
  email text,
  telephone text,
  created_at timestamptz not null default now()
);
create index idx_presta_contacts on prestataire_contacts (prestataire_id);
alter table prestataire_contacts enable row level security;
create policy presta_contacts_amo_all on prestataire_contacts
  for all to authenticated using (is_amo()) with check (is_amo());
create policy presta_contacts_own_all on prestataire_contacts
  for all to authenticated
  using (prestataire_id = my_prestataire_id())
  with check (prestataire_id = my_prestataire_id());

-- Documents de certification (RGE, qualifications, assurances…)
create table prestataire_docs (
  id uuid primary key default gen_random_uuid(),
  prestataire_id uuid not null references prestataires (id) on delete cascade,
  path text not null,   -- bucket presta-docs, dossier = uid du compte
  name text not null,
  size bigint,
  uploaded_at timestamptz not null default now()
);
create index idx_presta_docs on prestataire_docs (prestataire_id);
alter table prestataire_docs enable row level security;
create policy presta_docs_amo_read on prestataire_docs
  for select to authenticated using (is_amo());
create policy presta_docs_own_all on prestataire_docs
  for all to authenticated
  using (prestataire_id = my_prestataire_id())
  with check (prestataire_id = my_prestataire_id());

insert into storage.buckets (id, name, public)
values ('presta-docs', 'presta-docs', false)
on conflict (id) do nothing;

create policy storage_presta_docs_own on storage.objects
  for all to authenticated
  using (bucket_id = 'presta-docs' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'presta-docs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy storage_presta_docs_amo on storage.objects
  for select to authenticated
  using (bucket_id = 'presta-docs' and is_amo());

-- ========== 3. Messagerie de projet par canal ==========
-- Prestataire « du projet » = entreprise dont une candidature a été retenue
-- sur une consultation de la copro (MOE ou autre intervenant).
create or replace function is_presta_retenu_of(p_copro_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from candidatures ca
    join consultations c on c.id = ca.consultation_id
    join prestataires p on p.id = ca.prestataire_id
    where c.copro_id = p_copro_id
      and ca.statut = 'retenue'
      and p.user_id = auth.uid()
      and p.actif
  );
$$;
revoke execute on function is_presta_retenu_of(uuid) from anon;

create type canal_message as enum ('prestataires', 'syndic', 'coproprietaires');

create table messages_projet (
  id uuid primary key default gen_random_uuid(),
  copro_id uuid not null references coproprietes (id) on delete cascade,
  canal canal_message not null,
  -- canal prestataires : null = à tous les prestataires du projet,
  -- sinon message privé avec cette entreprise
  prestataire_id uuid references prestataires (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  auteur_nom text not null default '',
  auteur_role text not null default '',   -- amo | presta | syndic | copro
  body text not null,
  created_at timestamptz not null default now(),
  constraint messages_prive_chk check (prestataire_id is null or canal = 'prestataires')
);
create index idx_messages_copro on messages_projet (copro_id, canal, created_at);

alter table messages_projet enable row level security;
create policy messages_amo_all on messages_projet
  for all to authenticated using (is_amo()) with check (is_amo());
-- prestataire : le fil de ses projets — messages « à tous » + ses messages privés
create policy messages_presta_read on messages_projet
  for select to authenticated
  using (
    canal = 'prestataires'
    and is_presta_retenu_of(copro_id)
    and (prestataire_id is null or prestataire_id = my_prestataire_id())
  );
create policy messages_presta_insert on messages_projet
  for insert to authenticated
  with check (
    canal = 'prestataires'
    and prestataire_id = my_prestataire_id()
    and is_presta_retenu_of(copro_id)
    and user_id = auth.uid()
  );
-- syndic et copropriétaires : RLS prête (l'affichage dans leurs espaces suivra)
create policy messages_syndic_read on messages_projet
  for select to authenticated using (canal = 'syndic' and is_syndic_of(copro_id));
create policy messages_syndic_insert on messages_projet
  for insert to authenticated
  with check (canal = 'syndic' and is_syndic_of(copro_id) and user_id = auth.uid() and prestataire_id is null);
create policy messages_copro_read on messages_projet
  for select to authenticated using (canal = 'coproprietaires' and is_copro_of(copro_id));
create policy messages_copro_insert on messages_projet
  for insert to authenticated
  with check (canal = 'coproprietaires' and is_copro_of(copro_id) and user_id = auth.uid() and prestataire_id is null);

-- Suivi de lecture (pastille « messages non lus ») : un repère par utilisateur
-- et par copro — les messages plus récents que last_read_at sont non lus.
create table message_lectures (
  user_id uuid not null references auth.users (id) on delete cascade,
  copro_id uuid not null references coproprietes (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (user_id, copro_id)
);
alter table message_lectures enable row level security;
create policy lectures_own_all on message_lectures
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ========== 4. Note par étape du projet (onglet Projet) ==========
create table phase_notes (
  id uuid primary key default gen_random_uuid(),
  copro_id uuid not null references coproprietes (id) on delete cascade,
  phase phase_copro not null,
  body text not null default '',
  updated_by uuid references profiles (user_id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (copro_id, phase)
);
alter table phase_notes enable row level security;
create policy phase_notes_amo_all on phase_notes
  for all to authenticated using (is_amo()) with check (is_amo());

-- ========== 5. Feedbacks : l'auteur peut modifier son propre retour ==========
create policy feedbacks_own_update on feedbacks
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

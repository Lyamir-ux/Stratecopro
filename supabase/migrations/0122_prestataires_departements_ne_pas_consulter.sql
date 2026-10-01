-- Fiche « Mon entreprise » : départements, prestations couvertes et
-- « Ne pas consulter » (idées d'Amir du 01/10/2026, 12:13 et 12:15).
--
-- * `departements` : codes des départements où l'entreprise peut être
--   consultée (« 67 », « 2A », « 974 »…). Liste vide = toute la France, ce qui
--   garde le comportement d'avant pour les fiches existantes.
-- * `ne_pas_consulter` : l'entreprise ne souhaite plus être consultée - plus
--   aucune alerte de consultation, et les consultations en ligne ne
--   s'affichent plus dans son espace (sauf celles où elle a déjà répondu).
--   `ne_pas_consulter_le` date le choix (posée par trigger).
-- * Les prestations couvertes (`types`) deviennent modifiables par
--   l'entreprise elle-même (choix d'Amir, 01/10) : au moins une. Raison
--   sociale et référencement (`actif`) restent à l'équipe Strat Eco.
--
-- Le filtre des alertes est dans l'edge function notifier-consultation : le
-- département d'une consultation est celui du code postal de la copropriété
-- (ou du code postal trouvé dans la ville / l'adresse d'une copropriété hors
-- plateforme) ; département inconnu = toutes les entreprises du métier.

alter table prestataires add column departements text[] not null default '{}';
alter table prestataires add column ne_pas_consulter boolean not null default false;
alter table prestataires add column ne_pas_consulter_le timestamptz;

comment on column prestataires.departements is
  'Départements où l''entreprise peut être consultée (codes 01..95, 2A, 2B, 971..976) - vide = toute la France (0122).';
comment on column prestataires.ne_pas_consulter is
  'L''entreprise ne souhaite pas être consultée : aucune alerte de consultation (0122).';

-- Codes de département valides (Corse en 2A / 2B, outre-mer sur 3 chiffres)
create or replace function departements_valides(d text[])
returns boolean
language sql immutable
set search_path = public
as $$
  select coalesce(bool_and(x ~ '^(0[1-9]|1[0-9]|2[1-9]|2A|2B|[3-8][0-9]|9[0-5]|97[1-6])$'), true)
  from unnest(d) as x
$$;

alter table prestataires add constraint prestataires_departements_chk
  check (departements_valides(departements));

-- Date du choix « Ne pas consulter » : posée quand il s'active, effacée quand il se lève
create or replace function prestataires_date_ne_pas_consulter()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' or new.ne_pas_consulter is distinct from old.ne_pas_consulter then
    new.ne_pas_consulter_le := case when new.ne_pas_consulter then now() else null end;
  end if;
  return new;
end;
$$;

-- nom choisi pour passer avant trg_prestataires_own (ordre alphabétique)
create trigger trg_prestataires_ne_pas_consulter
  before insert or update on prestataires
  for each row execute function prestataires_date_ne_pas_consulter();

-- Le prestataire gère aussi ses prestations, ses départements et son choix
-- d'être consulté ; raison sociale, référencement et compte restent AMO.
create or replace function protege_prestataire_own()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  modifiables text[] := array[
    'email', 'emails_secondaires', 'telephone', 'adresse', 'ville',
    'code_postal', 'site_web', 'siret',
    'logo_path', 'contact_nom', 'updated_at',
    'types', 'departements', 'ne_pas_consulter', 'ne_pas_consulter_le'
  ];
begin
  if is_amo() then return new; end if;
  if to_jsonb(new) - modifiables <> to_jsonb(old) - modifiables then
    raise exception 'Champs réservés à l''équipe AMO (raison sociale, référencement…)';
  end if;
  if cardinality(new.types) = 0 then
    raise exception 'Cochez au moins une prestation couverte';
  end if;
  return new;
end;
$$;

revoke execute on function public.protege_prestataire_own() from anon, authenticated;
revoke execute on function public.prestataires_date_ne_pas_consulter() from anon, authenticated;

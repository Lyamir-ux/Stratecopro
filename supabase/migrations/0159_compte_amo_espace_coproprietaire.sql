-- 0159 - Un compte AMO peut aussi être copropriétaire (demande d'Amir du 11/10/2026).
--
-- « Que des chefs de projet puissent mettre leur adresse mail sur un compte test qu'on a déjà
-- créé (par exemple LES BALCONS DE LA LAUCH) : si la personne met son adresse mail et clique sur
-- « Copropriétaire » sur la page de connexion, elle est rattachée, elle est considérée comme un
-- copropriétaire. » Revient sur l'arbitrage du 30/09 (« un compte garde un seul rôle »), pour les
-- seuls comptes AMO : un syndic ou un prestataire ne devient pas copropriétaire par son adresse.
--
-- Règle : une fiche copropriétaire présente (non sortante) dont l'adresse (la première, 0145) est
-- celle d'un compte AMO actif est reliée à ce compte (coproprietaires.user_id). Tous les droits
-- du portail suivent déjà user_id (my_coproprietaire_ids, copros_coproprietaire, signature-flux,
-- notifier-enquete-transmise) : rien d'autre à ouvrir. Le profil reste « amo » ; c'est l'écran qui
-- traite la session en copropriétaire quand la connexion s'est faite par la tuile « Copropriétaire ».
--
-- 1. Déclencheur sur l'adresse de la fiche (onglet Données, fiche, import, SQL) :
--    - fiche libre qui reçoit l'adresse d'un compte AMO actif : reliée à ce compte ;
--    - fiche reliée à un compte AMO dont l'adresse ne porte plus celle du compte : détachée, pour
--      que « Créer l'espace » puisse ouvrir l'espace du vrai copropriétaire ensuite.
--    Une fiche reliée à un compte copropriétaire n'est jamais touchée (règles de 0150).
-- 2. relier_mes_fiches_coproprietaire() : appelée par le portail quand un compte AMO y entre en
--    copropriétaire ; rattrape les fiches qui portaient déjà son adresse (adresse saisie avant la
--    création du compte, compte réactivé) et détache celles qui ne la portent plus.
-- 3. espaces_coproprietaires : role_compte renseigne aussi le rôle du compte RELIÉ, pour que
--    l'onglet Copropriétaires affiche « Compte Strat Eco » au lieu de « Activé ».
-- 4. Dates limites (0117, 0158) : un compte AMO qui agit sur SA fiche est tenu comme un
--    copropriétaire (le test du parcours doit voir les mêmes refus) ; sur les autres fiches,
--    l'équipe garde la main.

-- ---------- 1. Rattachement par l'adresse ----------
create or replace function coproprietaires_compte_amo()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_adresse text := premiere_adresse(new.email);
  v_role app_role;
  v_email_compte text;
  v_amo uuid;
begin
  if tg_op = 'UPDATE' and new.email is not distinct from old.email then
    return new;
  end if;

  -- fiche reliée à un compte AMO : elle le reste tant qu'elle porte son adresse
  if new.user_id is not null then
    select p.role, lower(btrim(u.email)) into v_role, v_email_compte
      from auth.users u
      left join profiles p on p.user_id = u.id
     where u.id = new.user_id;
    if v_role = 'amo' and v_adresse is distinct from v_email_compte then
      new.user_id := null;
    end if;
  end if;

  -- fiche libre et présente qui porte l'adresse d'un compte AMO actif : reliée à ce compte
  if new.user_id is null and new.sortant_le is null and v_adresse is not null then
    select u.id into v_amo
      from auth.users u
      join profiles p on p.user_id = u.id
     where lower(btrim(u.email)) = v_adresse
       and p.role = 'amo'
       and p.active
     limit 1;
    if v_amo is not null then
      new.user_id := v_amo;
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function coproprietaires_compte_amo() from anon, public;

drop trigger if exists trg_coproprietaires_compte_amo on coproprietaires;
create trigger trg_coproprietaires_compte_amo
  before insert or update of email on coproprietaires
  for each row execute function coproprietaires_compte_amo();

-- ---------- 2. Entrée d'un compte AMO dans le portail en copropriétaire ----------
create or replace function relier_mes_fiches_coproprietaire()
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_nb integer;
begin
  if v_uid is null or not is_amo() then
    return 0;
  end if;
  select lower(btrim(email)) into v_email from auth.users where id = v_uid;
  if v_email is null then
    return 0;
  end if;

  -- fiches qui ne portent plus l'adresse du compte : détachées
  update coproprietaires
     set user_id = null
   where user_id = v_uid
     and premiere_adresse(email) is distinct from v_email;

  -- fiches libres et présentes qui la portent : reliées
  update coproprietaires
     set user_id = v_uid
   where user_id is null
     and sortant_le is null
     and premiere_adresse(email) = v_email;

  select count(*) into v_nb from coproprietaires where user_id = v_uid and sortant_le is null;
  return v_nb;
end;
$$;

revoke execute on function relier_mes_fiches_coproprietaire() from anon, public;
grant execute on function relier_mes_fiches_coproprietaire() to authenticated;

-- ---------- 3. État des espaces : rôle du compte relié ----------
create or replace function espaces_coproprietaires(p_copro_id uuid)
returns table (coproprietaire_id uuid, etat text, invite_le timestamptz, role_compte app_role)
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    cp.id,
    case
      when cp.user_id is not null and u.last_sign_in_at is not null then 'actif'
      when cp.user_id is not null then 'invite'
      when premiere_adresse(cp.email) is null then 'sans_email'
      when x.role is not null and x.role <> 'copro' then 'email_pris'
      else 'a_creer'
    end,
    cp.espace_invite_le,
    coalesce(pr.role, x.role)
  from coproprietaires cp
  left join auth.users u on u.id = cp.user_id
  left join public.profiles pr on pr.user_id = cp.user_id
  left join lateral (
    select p.role
    from auth.users u2
    join public.profiles p on p.user_id = u2.id
    where lower(u2.email) = premiere_adresse(cp.email)
    limit 1
  ) x on cp.user_id is null
  where cp.copro_id = p_copro_id
    and cp.sortant_le is null
    and is_amo();
$$;

-- ---------- 4. Dates limites : le compte qui agit sur sa propre fiche ----------
create or replace function choix_financement_date_limite()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cp uuid;
  v_limite date;
begin
  if tg_op = 'DELETE' then
    v_cp := old.coproprietaire_id;
  else
    v_cp := new.coproprietaire_id;
  end if;

  -- un compte copropriétaire, ou un compte AMO sur sa propre fiche (0159), est tenu par la date
  -- limite ; sur les autres fiches, l'équipe garde la main
  if exists (select 1 from profiles where user_id = auth.uid() and role = 'copro')
     or exists (select 1 from coproprietaires where id = v_cp and user_id = auth.uid()) then
    select fc.date_limite_choix into v_limite
    from coproprietaires cp
    join copro_financement_config fc on fc.copro_id = cp.copro_id
    where cp.id = v_cp;

    if v_limite is not null and (now() at time zone 'Europe/Paris')::date > v_limite then
      raise exception 'La date limite pour choisir ou modifier votre financement (%) est passée : contactez votre AMO.',
        to_char(v_limite, 'DD/MM/YYYY')
        using errcode = 'P0001';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function bulletins_date_limite_adhesion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limite date;
begin
  -- un compte copropriétaire, ou un compte AMO sur sa propre fiche (0159), est tenu par la date
  -- limite ; sur les autres fiches, l'équipe garde la main
  if exists (select 1 from profiles where user_id = auth.uid() and role = 'copro')
     or exists (select 1 from coproprietaires where id = new.coproprietaire_id and user_id = auth.uid()) then
    select coalesce(fc.date_limite_adhesion_2, fc.date_limite_adhesion) into v_limite
    from copro_financement_config fc
    where fc.copro_id = new.copro_id;

    if v_limite is not null and (now() at time zone 'Europe/Paris')::date > v_limite then
      raise exception 'La date limite d''adhésion au prêt collectif (%) est passée : contactez votre AMO.',
        to_char(v_limite, 'DD/MM/YYYY')
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

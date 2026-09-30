-- 0117 - Date limite du choix de financement (feedback PIERRE PIERRE du 30/09/2026 :
-- « une fois le financement choisi, montrer ce qui a été choisi et pouvoir le
-- modifier avec une date butoir »).
--
-- L'AMO fixe, par copropriété, la date jusqu'à laquelle un copropriétaire peut
-- choisir, modifier ou retirer son mode de financement depuis son portail
-- (onglet Plans de financement, panneau du prêt collectif). Sans date : pas de
-- limite, comme avant. Le jour même de la date limite est encore ouvert.
--
-- Passé ce jour, le portail n'offre plus la modification, et ce déclencheur la
-- refuse côté serveur pour un compte copropriétaire. L'AMO et le syndic gardent
-- la main (saisie pour le compte d'un copropriétaire après la date).

alter table copro_financement_config add column date_limite_choix date;

comment on column copro_financement_config.date_limite_choix is
  'Dernier jour (inclus, heure de Paris) où le copropriétaire peut choisir ou modifier son financement depuis le portail ; null = sans limite.';

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

  -- seul un compte copropriétaire est tenu par la date limite
  if exists (select 1 from profiles where user_id = auth.uid() and role = 'copro') then
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

revoke execute on function choix_financement_date_limite() from anon, public;

create trigger trg_choix_date_limite
  before insert or update or delete on choix_financement
  for each row execute function choix_financement_date_limite();

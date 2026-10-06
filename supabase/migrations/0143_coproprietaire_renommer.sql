-- 0143 - Corriger le nom d'un copropriétaire en un clic (idée d'Amir du 06/10/2026)
--
-- « Il faut pouvoir renommer le nom du copropriétaire s'il y a des erreurs
-- d'orthographe ou des lettres à changer, rien qu'en cliquant sur le nom »,
-- puis « côté syndic aussi ».
--
-- Le syndic n'a que la lecture sur coproprietaires (RLS) : l'écriture passe par
-- cette fonction, ouverte à l'équipe AMO et au syndic de la copropriété
-- concernée, comme syndic_changer_proprietaire (0090). C'est la même personne,
-- la même fiche : tous ses lots, son enquête, son plan individuel et son
-- historique restent attachés. Seul le texte du nom change.
--
-- Si la fiche a un compte du portail, le nom et les initiales du profil
-- suivent, sauf si le nom du profil n'était déjà plus celui de la fiche
-- (personnalisé par l'équipe) : il reste alors tel quel. Ce que le syndic ne
-- peut pas faire directement (profiles est réservé à l'AMO) se fait ici.
--
-- Fonction SECURITY DEFINER qui écrit : EXECUTE retiré à PUBLIC (0142), accordé
-- aux seuls utilisateurs connectés.

create or replace function coproprietaire_renommer(p_id uuid, p_nom text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_cp coproprietaires%rowtype;
  v_nom text := btrim(regexp_replace(coalesce(p_nom, ''), '[[:space:]]+', ' ', 'g'));
  v_mots text[];
  v_initiales text;
begin
  select * into v_cp from coproprietaires where id = p_id;
  if not found then
    raise exception 'Copropriétaire introuvable';
  end if;
  if not (is_amo() or is_syndic_of(v_cp.copro_id)) then
    raise exception 'Accès refusé à cette copropriété';
  end if;
  if v_nom = '' then
    raise exception 'Le nom ne peut pas être vide';
  end if;
  if length(v_nom) > 120 then
    raise exception 'Le nom est trop long (120 caractères au plus)';
  end if;

  -- rien à changer
  if v_nom = btrim(regexp_replace(v_cp.nom, '[[:space:]]+', ' ', 'g')) then
    return v_cp.nom;
  end if;

  update coproprietaires set nom = v_nom where id = p_id;

  -- compte du portail : même nom d'affichage, sauf s'il avait été personnalisé
  if v_cp.user_id is not null then
    v_mots := regexp_split_to_array(v_nom, '[[:space:]]+');
    v_initiales := upper(
      left(v_mots[1], 1) ||
      case when array_length(v_mots, 1) > 1 then left(v_mots[array_length(v_mots, 1)], 1) else substr(v_mots[1], 2, 1) end
    );
    update profiles
       set full_name = v_nom, initials = v_initiales
     where user_id = v_cp.user_id and full_name = v_cp.nom;
  end if;

  return v_nom;
end;
$$;

revoke all on function coproprietaire_renommer(uuid, text) from public;
-- Supabase accorde aussi EXECUTE à anon par défaut sur toute nouvelle fonction de public
revoke execute on function coproprietaire_renommer(uuid, text) from anon;
grant execute on function coproprietaire_renommer(uuid, text) to authenticated;

-- 0073 - Suivi de l'échéancier PPT par le syndic (feedback Amir 20/09/2026).
-- Sous le récap des postes, le gestionnaire (ou la direction de l'enseigne)
-- décale les travaux d'une année à l'autre au fil des votes : le récap reprend
-- ces décalages via annee_prochaine_presentation (déjà lue par anneeEffective).
-- La RLS d'écriture de ppt_postes reste réservée au dirigeant : cette RPC
-- security definer n'ouvre que la colonne annee_prochaine_presentation, sur les
-- postes actifs encore vivants (ni votés, ni réalisés, ni abandonnés).

create or replace function ppt_decaler_postes(p_decalages jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare
  d record;
  p ppt_postes%rowtype;
  v_nb int := 0;
  v_copro uuid;
  v_detail jsonb := '[]'::jsonb;
  v_nouvelle int;
begin
  if p_decalages is null or jsonb_typeof(p_decalages) <> 'array' then
    raise exception 'Liste de décalages attendue';
  end if;

  for d in select (e->>'poste_id')::uuid as poste_id, (e->>'annee')::int as annee from jsonb_array_elements(p_decalages) e loop
    select * into p from ppt_postes where id = d.poste_id;
    if not found then raise exception 'Poste introuvable'; end if;
    if not ppt_ouvre(p.ppt_copro_id) then raise exception 'Accès refusé à cette copropriété'; end if;
    if not p.actif then raise exception 'Poste archivé : « % »', p.libelle; end if;
    if p.statut in ('vote', 'realise', 'abandonne') then
      raise exception 'Poste déjà voté, réalisé ou abandonné : « % »', p.libelle;
    end if;
    if d.annee is null or d.annee < 2000 or d.annee > 2100 then raise exception 'Année invalide'; end if;
    if v_copro is not null and v_copro <> p.ppt_copro_id then raise exception 'Une seule copropriété par enregistrement'; end if;
    v_copro := p.ppt_copro_id;

    -- retour sur l'année prévue au plan = plus de décalage
    v_nouvelle := case when d.annee = p.annee_prevue then null else d.annee end;
    if v_nouvelle is distinct from p.annee_prochaine_presentation then
      update ppt_postes set annee_prochaine_presentation = v_nouvelle where id = p.id;
      v_nb := v_nb + 1;
      v_detail := v_detail || jsonb_build_object(
        'poste_id', p.id, 'libelle', p.libelle,
        'de', coalesce(p.annee_prochaine_presentation, p.annee_prevue), 'vers', d.annee);
    end if;
  end loop;

  if v_nb > 0 then
    perform ppt_journaliser(v_copro, null, 'decalage', jsonb_build_object('nb', v_nb, 'postes', v_detail));
  end if;
  return v_nb;
end;
$$;
revoke execute on function ppt_decaler_postes(jsonb) from anon, public;
grant execute on function ppt_decaler_postes(jsonb) to authenticated;

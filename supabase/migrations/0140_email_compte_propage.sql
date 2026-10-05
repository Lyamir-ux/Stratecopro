-- 0140 - Feedback d'Amir du 05/10/2026 15:16, page /parametres : « Je dois voir
-- sur cette page les mails de chaque gestionnaire et autres, et également la
-- possibilité de les modifier en direct. »
--
-- L'e-mail d'un membre d'enseigne est son identifiant de connexion (auth.users),
-- modifié par l'edge function modifier-email-compte (clé de service, dirigeant
-- seul). Mais cette adresse sert aussi de clé de rattachement : le gestionnaire
-- d'un dossier est désigné PAR SON E-MAIL (coproprietes.gestionnaire_email,
-- ppt_coproprietes.gestionnaire_email, 0063 / 0072 / 0102). Changer l'adresse du
-- compte sans toucher aux dossiers laisserait donc des dossiers « non attribués »
-- (le compte ne correspondrait plus à l'e-mail du gestionnaire désigné).
--
-- propager_email_compte reporte l'ancienne adresse -> la nouvelle sur les
-- dossiers. À appeler APRÈS le changement de l'adresse du compte : les
-- déclencheurs de 0063 retirent l'accès de l'« ancien » gestionnaire en le
-- retrouvant par son e-mail ; une fois l'adresse du compte changée, plus aucun
-- compte ne porte l'ancienne, rien n'est retiré et rien n'est à rattacher
-- (copro_members est par user_id, inchangé).
--
-- Effet de bord à neutraliser : trg_coproprietes_reset_attribution (0103) remet
-- attribution_gardee_le à null quand l'e-mail change (« la direction a gardé
-- ce dossier »). Ici c'est la même personne : le choix est rétabli.
-- Côté PPT, ppt_sync_affectation clôture l'affectation courante et en ouvre une
-- nouvelle à la nouvelle adresse (historique : l'adresse a bien changé).
-- Testé en SQL le 05/10/2026 (transaction annulée) sur le gestionnaire aux 8
-- dossiers « gardés » et 10 suivis PPT : accès (copro_members) inchangés, les 8
-- « gardés » conservés, 8 + 10 dossiers sur la nouvelle adresse, 0 sur l'ancienne.

create or replace function propager_email_compte(p_ancien text, p_nouveau text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ancien text := lower(btrim(coalesce(p_ancien, '')));
  v_nouveau text := lower(btrim(coalesce(p_nouveau, '')));
  v_ids uuid[];
  v_gardees timestamptz[];
  v_copros int := 0;
  v_ppt int := 0;
begin
  if v_ancien = '' or v_nouveau = '' or v_ancien = v_nouveau then
    return jsonb_build_object('copros', 0, 'ppt', 0);
  end if;

  -- dossiers de rénovation : l'adresse change, le choix « garder » de la direction reste
  select array_agg(id), array_agg(attribution_gardee_le)
    into v_ids, v_gardees
  from coproprietes
  where lower(btrim(coalesce(gestionnaire_email, ''))) = v_ancien;

  update coproprietes
     set gestionnaire_email = v_nouveau
   where lower(btrim(coalesce(gestionnaire_email, ''))) = v_ancien;
  get diagnostics v_copros = row_count;

  update coproprietes c
     set attribution_gardee_le = t.gardee
    from unnest(v_ids, v_gardees) as t(id, gardee)
   where c.id = t.id and t.gardee is not null;

  -- suivi PPT : le déclencheur historise le changement d'adresse
  update ppt_coproprietes
     set gestionnaire_email = v_nouveau
   where lower(btrim(coalesce(gestionnaire_email, ''))) = v_ancien;
  get diagnostics v_ppt = row_count;

  -- identité « e-mail » du compte : l'API d'administration ne la suit pas toujours
  -- (la colonne identities.email en découle) ; sans effet si elle est déjà à jour
  update auth.identities
     set identity_data = jsonb_set(identity_data, '{email}', to_jsonb(v_nouveau)),
         updated_at = now()
   where provider = 'email'
     and lower(coalesce(identity_data ->> 'email', '')) = v_ancien;

  return jsonb_build_object('copros', v_copros, 'ppt', v_ppt);
end;
$$;

revoke execute on function propager_email_compte(text, text) from anon, authenticated, public;
grant execute on function propager_email_compte(text, text) to service_role;

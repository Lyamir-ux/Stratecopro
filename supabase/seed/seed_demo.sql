-- Seed de démonstration — copropriété du prototype (données AMOA Pro anonymisées).
-- Idempotent : s'appuie sur les slugs.
--
-- 15/08/2026 — les 5 autres copropriétés du prototype (Nouvelle Cité, Les Tilleuls,
-- Cours Vauban, Le Belvédère, Parc des Cèdres) ont été effacées de la base : c'était
-- du jeu d'essai, remplacé par les vrais portefeuilles. Elles sont retirées d'ici
-- pour qu'un rejeu du seed ne les ressuscite pas. Seule Renaissance reste : elle
-- porte les trois comptes de démo (syndic, copropriétaire, prestataire).
-- Pour la même raison, ce seed ne touche QUE ses propres dossiers — il ne pose plus
-- de clé MUN ni de rattachement AMO sur les copropriétés réelles (dont les clés de
-- répartition viennent de l'en-tête du fichier des lots, pas d'un gabarit).

-- ========== Copropriétés ==========
insert into coproprietes (slug, name, city, code_postal, adresse, phase, fragile, energy_before, energy_after, gain_pct, progress, syndic_name, tag)
values
  ('renaissance', 'Renaissance', 'Colmar', '68000', '8 rue des Clefs, 68000 Colmar', 'etudes', false, 'E', 'C', 41, 38, 'Foncia Colmar', 'Petite copropriété')
on conflict (slug) do nothing;

-- ========== Clé de répartition générale (MUN) ==========
insert into cles_repartition (copro_id, code, label, is_default)
select c.id, 'MUN', 'Tantièmes généraux', true
from coproprietes c
where c.slug = 'renaissance'
  and not exists (select 1 from cles_repartition k where k.copro_id = c.id and k.code = 'MUN');

-- ========== Rattachement de l'équipe AMO ==========
insert into copro_members (copro_id, user_id, member_role)
select c.id, p.user_id, 'amo_referent'
from coproprietes c
cross join profiles p
where c.slug = 'renaissance' and p.role = 'amo'
on conflict do nothing;

-- ========== Plan de tâches gabarit (mêmes règles que src/lib/taskTemplate.ts) ==========
do $$
declare
  c record;
  r int;
begin
  for c in select id, phase from coproprietes where slug = 'renaissance' loop
    if exists (select 1 from taches t where t.copro_id = c.id) then
      continue;
    end if;
    r := case c.phase when 'diagnostic' then 0 when 'etudes' then 1 else 2 end;
    insert into taches (copro_id, phase, title, status, tag, jalon, due_label, position)
    select
      c.id,
      v.phase::phase_copro,
      v.title,
      case
        when v.rank < r then 'done'
        when v.rank > r then 'todo'
        else v.cur_default
      end::statut_tache,
      v.tag, v.jalon, v.due_label, v.position
    from (values
      ('diagnostic', 0, 'Recensement des copropriétaires & lots', 'doing', null, 'P1a', null, 0),
      ('diagnostic', 0, 'Saisie des tantièmes par bâtiment', 'todo', null, null, null, 1),
      ('diagnostic', 0, 'Consultations diverses', 'todo', null, null, null, 2),
      ('diagnostic', 0, 'Vérif. audit énergétique', 'todo', 'DPE', null, null, 3),
      ('diagnostic', 0, 'Enquête sociale — profils MaPrimeRénov'' · Fiche État', 'todo', 'MPR', 'P1b', null, 4),
      ('etudes', 1, 'Scénarios de travaux & chiffrage', 'doing', null, null, null, 5),
      ('etudes', 1, 'Ingénierie financière (7 étapes)', 'doing', 'Finance', null, null, 6),
      ('etudes', 1, 'Récupération des données essentielles — CEE / MPR Copro', 'todo', 'CEE', null, null, 7),
      ('etudes', 1, 'Récupération des données des entreprises', 'todo', null, null, null, 8),
      ('etudes', 1, 'Plans de financement généraux et individuels', 'todo', null, null, null, 9),
      ('etudes', 1, 'Liasse documentaire pour AG', 'todo', null, 'P1c', null, 10),
      ('travaux', 2, 'Dépôt des dossiers des aides', 'doing', 'CEE', 'P2a', null, 11),
      ('travaux', 2, 'Mobilisation des prêts', 'doing', 'Éco-PTZ', 'P2b', null, 12),
      ('travaux', 2, 'Suivi de chantier', 'doing', null, null, 'En cours', 13),
      ('travaux', 2, 'Demandes d''acompte', 'todo', null, null, null, 14),
      ('travaux', 2, 'Réception des travaux & levée des réserves', 'todo', null, null, null, 15),
      ('travaux', 2, 'Versement des aides & solde', 'todo', null, 'P2c', null, 16)
    ) as v(phase, rank, title, cur_default, tag, jalon, due_label, position);
  end loop;
end $$;

-- ========== Scénarios partagés (chiffrages du prototype) ==========
-- Les params suivent FinanceParams ; Renaissance porte les chiffres réels du doc AMOA Pro.
do $$
declare
  v record;
  cid uuid;
begin
  for v in
    select * from (values
      ('renaissance', 'Rénovation > 35 %', 327944.81, 92156.67, 34000.00, 21366.00, 41283.00, 30, false, 0.54, 141295.00)
    ) as t(slug, name, travaux, honoraires, aleas, cee, fonds, mpr_pct, bonus, taux_aides, reste)
  loop
    select id into cid from coproprietes where slug = v.slug;
    if cid is null or exists (select 1 from scenarios_financiers s where s.copro_id = cid and s.name = v.name) then
      continue;
    end if;
    insert into scenarios_financiers (copro_id, name, statut, bareme_millesime, params, resultat)
    values (
      cid, v.name, 'partage', 2024,
      jsonb_build_object(
        'travaux', v.travaux, 'honoraires', v.honoraires, 'aleas', v.aleas,
        'cle', 'MUN', 'mprCoproPct', v.mpr_pct, 'bonusPassoire', v.bonus,
        'cee', v.cee, 'fonds', v.fonds,
        'profils', jsonb_build_object('Bleu', 0, 'Jaune', 0, 'Violet', 0, 'Rose', 0),
        'primeIndiv', jsonb_build_object('Bleu', 3000, 'Jaune', 2250, 'Violet', 1500, 'Rose', 0),
        'ecoPtz', true, 'ecoPtzDuree', 15, 'ecoPtzPct', 100,
        'avancePct', 70, 'pretComplActif', false, 'pretComplDuree', 12
      ),
      jsonb_build_object(
        'coutTotal', v.travaux + v.honoraires + v.aleas,
        'resteACharge', v.reste,
        'tauxAides', v.taux_aides
      )
    );
  end loop;
end $$;

-- ============================================================================
-- Partie 2 (M11) : lots, batiments, coproprietaires, tantiemes generes,
-- notes de projet et reponses d enquete Renaissance.
-- Le SQL exact execute est conserve dans l historique du projet ; cette
-- partie est generee par bloc plpgsql idempotent (skip si lots existants) —
-- voir le commit M11 pour le detail.
-- ============================================================================

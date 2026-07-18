-- Seed de démonstration — 6 copropriétés du prototype (données AMOA Pro anonymisées).
-- Idempotent : s'appuie sur les slugs. Les lots/copropriétaires détaillés arrivent en M11.

-- ========== Copropriétés ==========
insert into coproprietes (slug, name, city, quartier, adresse, phase, fragile, energy_before, energy_after, gain_pct, progress, syndic_name, tag)
values
  ('nouvelle-cite', 'Nouvelle Cité', 'Strasbourg', 'Hautepierre', '12 rue de Lisbonne, 67200 Strasbourg', 'travaux', true, 'F', 'C', 48, 72, 'Cabinet Niederhoffer', 'Grande copropriété'),
  ('renaissance', 'Renaissance', 'Colmar', 'Centre', '8 rue des Clefs, 68000 Colmar', 'etudes', false, 'E', 'C', 41, 38, 'Foncia Colmar', 'Petite copropriété'),
  ('les-tilleuls', 'Les Tilleuls', 'Mulhouse', 'Rebberg', '24 avenue du Rebberg, 68100 Mulhouse', 'diagnostic', true, 'G', null, null, 14, 'Citya Mulhouse', 'Copropriété fragile'),
  ('cours-vauban', 'Cours Vauban', 'Metz', 'Nouvelle Ville', '5 cours Vauban, 57000 Metz', 'etudes', false, 'D', 'B', 52, 46, 'Square Habitat Metz', 'Gain > 35 %'),
  ('le-belvedere', 'Le Belvédère', 'Nancy', 'Haussonville', '17 boulevard d''Haussonville, 54000 Nancy', 'diagnostic', false, 'E', null, null, 8, 'Nexity Nancy', 'Nouveau dossier'),
  ('parc-des-cedres', 'Parc des Cèdres', 'Strasbourg', 'Meinau', '3 allée des Cèdres, 67100 Strasbourg', 'travaux', false, 'F', 'D', 44, 58, 'Loca Gestion', 'Grande copropriété')
on conflict (slug) do nothing;

-- ========== Clé de répartition générale (MUN) ==========
insert into cles_repartition (copro_id, code, label, is_default)
select c.id, 'MUN', 'Tantièmes généraux', true
from coproprietes c
where not exists (select 1 from cles_repartition k where k.copro_id = c.id and k.code = 'MUN');

-- ========== Rattachement de l'équipe AMO ==========
insert into copro_members (copro_id, user_id, member_role)
select c.id, p.user_id, 'amo_referent'
from coproprietes c
cross join profiles p
where p.role = 'amo'
on conflict do nothing;

-- ========== Plan de tâches gabarit (mêmes règles que src/lib/taskTemplate.ts) ==========
do $$
declare
  c record;
  r int;
begin
  for c in select id, phase from coproprietes loop
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
      ('etudes', 1, 'Consultation & sélection des entreprises', 'todo', null, null, null, 8),
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
      ('nouvelle-cite', 'Colonnes', 1190723.44, 330756.51, 132302.61, 82689.13, 66151.30, 45, true, 0.61, 612400.00),
      ('renaissance', 'Rénovation > 35 %', 327944.81, 92156.67, 34000.00, 21366.00, 41283.00, 30, false, 0.54, 141295.00),
      ('cours-vauban', 'Enveloppe + ENR', 869428.80, 241508.00, 96603.20, 60377.00, 48301.60, 45, false, 0.58, 421000.00),
      ('parc-des-cedres', 'Isolation + chaufferie collective', 1469512.80, 408198.00, 163279.20, 102049.50, 81639.60, 30, true, 0.60, 798300.00)
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
        'cle', 'tantiemes', 'mprCoproPct', v.mpr_pct, 'bonusPassoire', v.bonus,
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

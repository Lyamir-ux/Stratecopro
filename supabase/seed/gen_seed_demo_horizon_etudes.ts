// Générateur du seed « montants fictifs » des copropriétés de l'organisation de
// démo commerciale SYNDIC HORIZON GRAND EST qui n'en avaient pas : les trois
// dossiers en phase études et RESIDENCE STANISLAS (travaux). Voir
// seed_demo_horizon.sql pour l'organisation, gen_seed_demo_horizon.ts pour la
// copro vitrine LE PARC DES CIGOGNES.
//
// Feedback Amir 06/09/2026 : le portefeuille /syndic n'affichait aucun montant
// (travaux, honoraires) pour ces dossiers. Le portefeuille lit le total de
// l'opération TTC et les honoraires syndic dans le PF définitif validé (vue
// copro_stats + useHonorairesSyndic) : on dote donc chaque dossier d'un PF
// définitif validé fictif - c'est en phase études que le PF est établi (tâche
// « Plans de financement généraux et individuels »), avant la liasse pour l'AG ;
// un dossier en travaux l'a forcément derrière lui. Pas de copropriétaires ni
// de plans individuels : seule la vitrine porte le partage au portail.
//
// Comme pour la vitrine, on passe par le vrai moteur (computePlanDefinitif) pour
// que data et resultat soient rigoureusement ce que l'app aurait produit.
//
// Usage :  npx vite-node supabase/seed/gen_seed_demo_horizon_etudes.ts
// Produit : supabase/seed/seed_demo_horizon_etudes.sql (idempotent)
//
// Toutes les données sont FICTIVES (copropriétés, entreprises, montants).

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { computePlanDefinitif, readPlanDefinitif, round2 } from "../../src/lib/finance";
import { graffenstaden, saintLivier, stanislas, troisTours } from "./demo_horizon_pf";

// Les définitions des quatre PF (lots, MOE, aides, paramètres) vivent dans
// demo_horizon_pf.ts, partagées avec gen_seed_demo_stanislas.ts.

// 5. Calcul et émission du SQL
// ---------------------------------------------------------------------------
const q = (s: string) => s.replace(/'/g, "''");
const jsonSql = (v: unknown) => `$json$${JSON.stringify(v)}$json$::jsonb`;
const fmt = (n: number) => round2(n).toLocaleString("fr-FR", { maximumFractionDigits: 0 }).replace(/ | /g, " ");

const blocs: string[] = [];
const resume: string[] = [];

for (const c of [graffenstaden, troisTours, saintLivier, stanislas]) {
  const data = readPlanDefinitif(c.data);
  const r = computePlanDefinitif(data);
  const gainPct = Math.round(r.performancePct * 10) / 10;
  const honorairesSyndic = r.moe
    .filter((l) => /syndic/i.test(l.designation))
    .reduce((s, l) => s + l.montantTtc, 0);
  const depasse = r.gardeFous.filter((g) => !g.ok).map((g) => g.libelle);
  if (depasse.length) throw new Error(`${c.slug} : garde-fou depasse - ${depasse.join(" | ")}`);

  resume.push(
    `--   ${c.data.infos.nomCopro} : travaux TTC ${fmt(r.totalTravauxTtc)} EUR - opération TTC ${fmt(r.totalOperationTtc)} EUR\n` +
      `--     honoraires syndic TTC ${fmt(honorairesSyndic)} EUR - aides ${fmt(r.totalAides)} EUR (dont CEE ${fmt(r.primeCee)}) - couverture ${round2(r.tauxCouverture * 100)} %\n` +
      `--     reste à charge collectif ${fmt(r.resteACharge)} EUR - gain énergétique ${gainPct} %`
  );

  blocs.push(`-- ========== ${c.data.infos.nomCopro} ==========
do $$
declare
  v_copro uuid;
begin
  select id into v_copro from coproprietes where slug = '${c.slug}';
  if v_copro is null then
    raise exception 'Copropriété ${c.slug} absente - jouer seed_demo_horizon.sql d''abord.';
  end if;
  if exists (select 1 from plans_definitifs where copro_id = v_copro) then
    raise notice '${q(c.data.infos.nomCopro)} : PF déjà présent - bloc sauté.';
    return;
  end if;

  insert into plans_definitifs (copro_id, nom, data, resultat, statut, source_fichier)
  values (
    v_copro,
    '${q(c.nomPlan)}',
    ${jsonSql(data)},
    ${jsonSql(r)},
    'valide',
    null
  );

  -- Comme useValiderPlanDefinitif : le PF validé fait foi sur le dossier.
  update coproprietes
  set gain_pct = ${gainPct},
      energy_before = '${c.data.infos.etiquetteInitiale}',
      energy_after = '${c.data.infos.etiquetteProjet}'
  where id = v_copro;
end $$;`);

  console.log(
    `${c.data.infos.nomCopro} : travaux TTC ${fmt(r.totalTravauxTtc)} - opération TTC ${fmt(r.totalOperationTtc)} - honoraires syndic ${fmt(honorairesSyndic)} - aides ${fmt(r.totalAides)} (${round2(r.tauxCouverture * 100)} %) - RAC ${fmt(r.resteACharge)} - gain ${gainPct} %`
  );
  console.log(`  garde-fous : ${r.gardeFous.map((g) => `${g.libelle} ${g.ok ? "ok" : "DEPASSE"}`).join(" | ")}`);
}

const sql = `-- Montants fictifs des copropriétés de la démo commerciale SYNDIC HORIZON
-- GRAND EST qui n'en avaient pas (3 dossiers en études + Résidence Stanislas en
-- travaux) : un PF définitif validé par dossier (feedback Amir 06/09/2026 - le
-- portefeuille /syndic n'affichait ni travaux ni honoraires).
-- GÉNÉRÉ par gen_seed_demo_horizon_etudes.ts - ne pas éditer à la main, relancer :
--   npx vite-node supabase/seed/gen_seed_demo_horizon_etudes.ts
-- Prérequis : seed_demo_horizon.sql (organisation, copropriétés, gestionnaires).
-- Idempotent : chaque bloc se saute si le dossier a déjà un PF définitif.
--
-- Totaux calculés par le moteur de l'app (computePlanDefinitif) :
${resume.join("\n")}

begin;

${blocs.join("\n\n")}

commit;
`;

const out = join(dirname(fileURLToPath(import.meta.url)), "seed_demo_horizon_etudes.sql");
writeFileSync(out, sql, "utf8");
console.log(`Écrit : ${out}`);

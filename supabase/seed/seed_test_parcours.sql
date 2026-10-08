-- Organisation de test « SYNDIC TEST PARCOURS » (100 % fictive) - demande d'Amir du 08/10/2026
-- 4 copropriétés : Metz, Nancy, Strasbourg, Colmar - parcours de test des copropriétés.
-- GÉNÉRÉ par gen_seed_test_parcours.ts - ne pas éditer à la main, relancer :
--   npx vite-node supabase/seed/gen_seed_test_parcours.ts
-- Pas de psql sur le poste : jouer bloc par bloc (séparés par « -- @@BLOC ») via le MCP
-- Supabase execute_sql, dans l'ordre. Chaque bloc est idempotent. Purge : purge_test_parcours.sql.
-- Isolation : slugs test-*, tag « Test parcours », organisation « test-parcours », aucun e-mail sur les
-- copropriétaires fictifs (seuls les trois testeurs de Colmar ont leur vraie adresse).
--
-- LES MIRABELLES (Metz) : 16 copropriétaires, 32 lots (18 logements, 8 caves, 6 garages), 1 bâtiment(s), clé MUN = 10000
--   PF : opération TTC 354 141 EUR, aides 197 707 EUR (dont CEE 14 500), reste à charge 135 433 EUR, gain 56.2 %
--   enquête aucune ; partage non
--   choix : aucun
--
-- LE CLOS DES BRASSEURS (Nancy) : 22 copropriétaires, 42 lots (24 logements, 10 caves, 8 garages), 1 bâtiment(s), clé MUN = 10000
--   PF : opération TTC 436 625 EUR, aides 123 665 EUR (dont CEE 17 000), reste à charge 284 959 EUR, gain 41.2 %
--   enquête brouillon ; partage non
--   choix : aucun
--
-- LES TERRASSES DU NEUDORF (Strasbourg) : 28 copropriétaires, 54 lots (30 logements, 14 caves, 10 garages), 1 bâtiment(s), clé MUN = 10000
--   PF : opération TTC 612 957 EUR, aides 365 049 EUR (dont CEE 22 500), reste à charge 211 908 EUR, gain 51.9 %
--   enquête envoyee : 22 réponses (21 complètes, 1 brouillons), 8 profils vérifiés ; partage oui
--   choix : aucun
--
-- LES BALCONS DE LA LAUCH (Colmar) : 28 copropriétaires, 54 lots (30 logements, 14 caves, 10 garages), 2 bâtiment(s), clé MUN = 10000
--   PF : opération TTC 800 312 EUR, aides 412 530 EUR (dont CEE 31 000), reste à charge 345 783 EUR, gain 65.8 %
--   enquête envoyee : 18 réponses (16 complètes, 2 brouillons), 8 profils vérifiés ; partage oui
--   choix : 18 (fonds 2, collectif 11, individuel 5), adhésions 6 signées / 5 brouillons
--   testeur : Marius ONBUS <marius.onbus@a-renseigner.invalid> lot 7 + cave + garage
--   testeur : Pierre MAXTAFF <pierre.maxtaff@a-renseigner.invalid> lot 21 + cave
--   testeur : Cyrielle ONTHEMIC <cyrielle.onthemic@a-renseigner.invalid> lot 12

-- @@BLOC 0 organisation, copropriétés, bâtiments, plan de tâches
begin;

insert into organisations (nom, slug) values ('SYNDIC TEST PARCOURS', 'test-parcours')
on conflict (slug) do nothing;

with org as (select id from organisations where slug = 'test-parcours'),
src (name, slug, nb_logements, adresse, code_postal, city, phase, chef_projet, energy_before, energy_after, gain_pct, progress, date_ag) as (values
  ('LES MIRABELLES', 'test-les-mirabelles', 18, '9 rue Fabert', '57000', 'Metz', 'etudes', 'Amir', 'F', 'C', 56.2, 40, null::date),
  ('LE CLOS DES BRASSEURS', 'test-le-clos-des-brasseurs', 24, '6 rue des Brasseries', '54000', 'Nancy', 'etudes', 'Amir', 'E', 'C', 41.2, 45, null::date),
  ('LES TERRASSES DU NEUDORF', 'test-les-terrasses-du-neudorf', 30, '14 rue de Lausanne', '67100', 'Strasbourg', 'travaux', 'Amir', 'F', 'C', 51.9, 60, (current_date - 100)),
  ('LES BALCONS DE LA LAUCH', 'test-les-balcons-de-la-lauch', 30, '26 avenue de la République', '68000', 'Colmar', 'travaux', 'Amir', 'F', 'B', 65.8, 55, (current_date - 100))
)
insert into coproprietes (name, slug, nb_logements, adresse, code_postal, city, phase, chef_projet,
  energy_before, energy_after, gain_pct, progress, date_ag, fragile, syndic_name, tag, organisation_id)
select s.name, s.slug, s.nb_logements, s.adresse, s.code_postal, s.city, s.phase::phase_copro, s.chef_projet,
       s.energy_before, s.energy_after, s.gain_pct, s.progress, s.date_ag, false, 'SYNDIC TEST PARCOURS', 'Test parcours', org.id
from src s cross join org
on conflict (slug) do nothing;

-- Bâtiment déclaré (code 01, comme useCreateCopro) ; Colmar a en plus un bâtiment 02.
insert into batiments (copro_id, code, position, declare_creation)
select c.id, '01', 0, true
from coproprietes c
where c.organisation_id = (select id from organisations where slug = 'test-parcours')
  and not exists (select 1 from batiments b where b.copro_id = c.id);

insert into batiments (copro_id, code, position)
select c.id, '02', 1
from coproprietes c
where c.slug = 'test-les-balcons-de-la-lauch'
  and not exists (select 1 from batiments b where b.copro_id = c.id and b.code = '02');

-- Plan de tâches gabarit (miroir de src/lib/taskTemplate.ts)
with tpl (position, phase, title, statut_courant, tag, jalon, due_label) as (values
  (0,  'diagnostic', 'Recensement des copropriétaires & lots',                     'doing', null,                  'P1a', null),
  (1,  'diagnostic', 'Saisie des tantièmes par bâtiment',                          'todo',  null,                  null,  null),
  (2,  'diagnostic', 'Consultations diverses',                                     'todo',  null,                  null,  null),
  (3,  'diagnostic', 'Vérif. audit énergétique',                                   'todo',  'Audit réglementaire', null,  null),
  (4,  'diagnostic', 'Enquête sociale - profils MaPrimeRénov'' · Fiche État',      'todo',  'MPR',                 'P1b', null),
  (5,  'etudes',     'Scénarios de travaux & chiffrage',                           'doing', null,                  null,  null),
  (6,  'etudes',     'Ingénierie financière (7 étapes)',                           'doing', 'Finance',             null,  null),
  (7,  'etudes',     'Récupération des données essentielles - CEE / MPR Copro',    'todo',  'CEE',                 null,  null),
  (8,  'etudes',     'Récupération des données des entreprises',                   'todo',  null,                  null,  null),
  (9,  'etudes',     'Plans de financement généraux et individuels',               'todo',  null,                  null,  null),
  (10, 'etudes',     'Liasse documentaire pour AG',                                'todo',  null,                  'P1c', null),
  (11, 'travaux',    'Dépôt des dossiers des aides',                               'doing', 'CEE',                 'P2a', null),
  (12, 'travaux',    'Mobilisation des prêts',                                     'doing', 'Éco-PTZ',             'P2b', null),
  (13, 'travaux',    'Suivi de chantier',                                          'doing', null,                  null,  'En cours'),
  (14, 'travaux',    'Demandes d''acompte',                                        'todo',  null,                  null,  null),
  (15, 'travaux',    'Réception des travaux & levée des réserves',                 'todo',  null,                  null,  null),
  (16, 'travaux',    'Versement des aides & solde',                                'todo',  null,                  'P2c', null)
),
rk (phase, rang) as (values ('diagnostic', 0), ('etudes', 1), ('travaux', 2))
insert into taches (copro_id, phase, title, status, tag, jalon, due_label, position)
select c.id, t.phase::phase_copro, t.title,
       (case when rt.rang < rc.rang then 'done' when rt.rang > rc.rang then 'todo' else t.statut_courant end)::statut_tache,
       t.tag, t.jalon, t.due_label, t.position
from coproprietes c
cross join tpl t
join rk rt on rt.phase = t.phase
join rk rc on rc.phase = c.phase::text
where c.slug in ('test-les-mirabelles', 'test-le-clos-des-brasseurs', 'test-les-terrasses-du-neudorf', 'test-les-balcons-de-la-lauch')
  and not exists (select 1 from taches x where x.copro_id = c.id);

commit;

-- @@BLOC 1 LES MIRABELLES : PF définitif validé, copropriétaires, lots, tantièmes
begin;

-- PF définitif validé (comme useValiderPlanDefinitif)
do $$
declare
  v_copro uuid;
begin
  select id into v_copro from coproprietes where slug = 'test-les-mirabelles';
  if v_copro is null then
    raise exception 'Copropriété test-les-mirabelles absente - jouer le bloc 0 d''abord.';
  end if;
  if exists (select 1 from plans_definitifs where copro_id = v_copro) then
    raise notice 'PF déjà présent - bloc PF sauté.';
    return;
  end if;
  insert into plans_definitifs (copro_id, nom, data, resultat, statut, source_fichier, version, valide_le, updated_by)
  values (
    v_copro,
    'PF définitif - Les Mirabelles',
    $json${"infos":{"nomCopro":"LES MIRABELLES","adresse":"9 rue Fabert 57000 Metz","nbLogements":18,"nbLogementsEquiv":18,"surfaceHabitable":1180,"nbEtages":5,"nbEntrees":1,"typeChauffage":"Gaz collectif","cepInitial":322,"cepProjet":141,"dispositifClimaxion":true,"etiquetteInitiale":"F","etiquetteProjet":"C"},"lots":[{"numero":1,"titre":"Isolation thermique par l'exterieur","entreprise":"FACADES LORRAINES","remisePct":0,"lignes":[{"retenu":true,"tvaPct":5.5,"montantHt":21800,"designation":"Echafaudage"},{"retenu":true,"tvaPct":5.5,"montantHt":111000,"designation":"Isolation thermique par l'exterieur en laine de roche 160 mm"},{"retenu":true,"tvaPct":5.5,"montantHt":14600,"designation":"Traitement des balcons"},{"retenu":true,"tvaPct":5.5,"montantHt":10300,"designation":"Garde-corps"},{"retenu":true,"tvaPct":5.5,"montantHt":4400,"designation":"Bandeaux et departs"},{"retenu":false,"tvaPct":10,"montantHt":2600,"designation":"Soubassement"},{"retenu":false,"tvaPct":10,"montantHt":3200,"designation":"Peinture des parties communes"}]},{"numero":2,"titre":"Combles et toiture","entreprise":"TOITURES DE MOSELLE","remisePct":0,"lignes":[{"retenu":true,"tvaPct":5.5,"montantHt":12800,"designation":"Isolation des combles perdus en laine soufflee 320 mm"},{"retenu":true,"tvaPct":5.5,"montantHt":8100,"designation":"Isolation du plancher haut des caves"},{"retenu":false,"tvaPct":10,"montantHt":4800,"designation":"Revision de la couverture et zingueries"}]},{"numero":3,"titre":"Chaufferie","entreprise":"LORRAINE ENERGIES","remisePct":0,"lignes":[{"retenu":true,"tvaPct":5.5,"montantHt":27000,"designation":"Pompe a chaleur hybride collective en releve de chaudiere gaz a condensation"},{"retenu":true,"tvaPct":5.5,"montantHt":5300,"designation":"Calorifugeage des reseaux"},{"retenu":true,"tvaPct":5.5,"montantHt":7400,"designation":"Robinets thermostatiques et equilibrage"},{"retenu":false,"tvaPct":10,"montantHt":1900,"designation":"Reprise du conduit de fumee"}]},{"numero":4,"titre":"Ventilation","entreprise":"VENTIL'EST","remisePct":0,"lignes":[{"retenu":true,"tvaPct":5.5,"montantHt":4700,"designation":"Caissons d'extraction hygroreglables"},{"retenu":true,"tvaPct":5.5,"montantHt":5600,"designation":"Gaines, bouches d'extraction et entrees d'air"},{"retenu":true,"tvaPct":5.5,"montantHt":1800,"designation":"Carottages et calfeutrements"}]}],"moe":[{"phase":"etude","tvaPct":20,"montant":{"mode":"forfait","montantHt":1500},"entreprise":"STRAT ECO","designation":"Assistance Maitrise d'Ouvrage (phase conseil)","commentaire":"Phase conseil, assistance technique et approche financiere","eligibleMprAmo":true,"eligibleMprEtudes":false},{"phase":"etude","tvaPct":10,"montant":{"mode":"forfait","montantHt":3900},"entreprise":"CABINET MOSELLE ARCHITECTES","designation":"Maitrise d'oeuvre phase etudes (DIAG-AVP)","commentaire":"Etude, avant-projet","eligibleMprAmo":false,"eligibleMprEtudes":true},{"phase":"etude","tvaPct":20,"montant":{"mode":"forfait","montantHt":900},"entreprise":"EST THERMO CONSEIL","designation":"Audit reglementaire","commentaire":"Mise a jour","eligibleMprAmo":false,"eligibleMprEtudes":false},{"phase":"etude","tvaPct":20,"montant":{"mode":"forfait","montantHt":2400},"entreprise":"DIAG EXPERT 67","designation":"Diagnostic amiante avant travaux","eligibleMprAmo":false,"eligibleMprEtudes":false},{"phase":"projet","tvaPct":20,"montant":{"mode":"forfait","montantHt":2600},"entreprise":"STRAT ECO","designation":"Assistance Maitrise d'Ouvrage (phase projet)","commentaire":"Prestation obligatoire, assistance projet, administrative, financiere","eligibleMprAmo":true,"eligibleMprEtudes":false},{"phase":"projet","tvaPct":10,"montant":{"mode":"forfait","montantHt":18400},"entreprise":"CABINET MOSELLE ARCHITECTES","designation":"Maitrise d'oeuvre phase conception (PRO-DCE)","commentaire":"Cahiers des charges, depot de DP, DCE","eligibleMprAmo":false,"eligibleMprEtudes":true},{"phase":"projet","tvaPct":20,"montant":{"mode":"forfait","montantHt":1500},"designation":"Controle technique","commentaire":"Prestations necessaires","eligibleMprAmo":false,"eligibleMprEtudes":true},{"phase":"projet","tvaPct":20,"montant":{"mode":"forfait","montantHt":900},"designation":"CSPS","commentaire":"Prestations necessaires","eligibleMprAmo":false,"eligibleMprEtudes":true},{"phase":"projet","tvaPct":20,"montant":{"mode":"forfait","montantHt":600},"entreprise":"AERO TEST","designation":"Test d'etancheite a l'air avant travaux","commentaire":"Obligation Climaxion","eligibleMprAmo":false,"eligibleMprEtudes":false},{"phase":"projet","tvaPct":20,"montant":{"mode":"forfait","montantHt":1800},"entreprise":"CABINET MOSELLE ARCHITECTES","designation":"Memoire technique Climaxion","eligibleMprAmo":false,"eligibleMprEtudes":false},{"phase":"travaux","tvaPct":20,"montant":{"mode":"forfait","montantHt":4700},"entreprise":"STRAT ECO","designation":"Assistance Maitrise d'Ouvrage (phase travaux)","commentaire":"Prestation obligatoire, assistance projet, administrative, financiere","eligibleMprAmo":true,"eligibleMprEtudes":false},{"phase":"travaux","tvaPct":5.5,"montant":{"mode":"pctTravauxHt","taux":4},"entreprise":"CABINET MOSELLE ARCHITECTES","designation":"Maitrise d'oeuvre phase travaux","commentaire":"Pilotage et reception des travaux","eligibleMprAmo":false,"eligibleMprEtudes":true},{"phase":"travaux","tvaPct":20,"montant":{"mode":"forfait","montantHt":3200},"designation":"Controle technique","commentaire":"Prestations necessaires","eligibleMprAmo":false,"eligibleMprEtudes":true},{"phase":"travaux","tvaPct":20,"montant":{"mode":"forfait","montantHt":1600},"designation":"CSPS","commentaire":"Prestations necessaires","eligibleMprAmo":false,"eligibleMprEtudes":true},{"phase":"travaux","tvaPct":20,"montant":{"mode":"forfait","montantHt":600},"entreprise":"AERO TEST","designation":"Test d'etancheite a l'air apres travaux","commentaire":"Obligation Climaxion","eligibleMprAmo":false,"eligibleMprEtudes":false},{"phase":"travaux","tvaPct":0,"montant":{"mode":"pctTravauxTtc","taux":2},"entreprise":"ASSURANCES DU RHIN","designation":"Dommage ouvrage","commentaire":"Obligatoire","eligibleMprAmo":false,"eligibleMprEtudes":false},{"phase":"travaux","tvaPct":20,"montant":{"mode":"pctTravauxHt","taux":2.5},"entreprise":"SYNDIC TEST PARCOURS","designation":"Honoraires syndic","commentaire":"Selon informations du syndic","eligibleMprAmo":false,"eligibleMprEtudes":false}],"aides":[{"id":"cee-fiche-par-fiche","groupe":"CEE","libelle":"CEE fiche par fiche","publique":false,"calcul":{"mode":"manuel","montant":14500},"commentaire":"Depend des lots de travaux energetiques et de la surface habitable"},{"id":"maprimerenov-partie-travaux","groupe":"ANAH","libelle":"Maprimerenov' partie travaux","publique":true,"calcul":{"mode":"pctAssietteTravaux","taux":45,"coef":1},"commentaire":"45 % du montant des travaux energetiques HT - plafonne a 11250 EUR par logement"},{"id":"maprimerenov-partie-etudes","groupe":"ANAH","libelle":"Maprimerenov' partie etudes","publique":true,"calcul":{"mode":"pctEtudes","taux":45,"coef":0.9},"commentaire":"45 % du montant des etudes, diags, maitrise d'oeuvre HT"},{"id":"maprimerenov-amo","groupe":"ANAH","libelle":"Maprimerenov' AMO","publique":true,"calcul":{"mode":"pctAmo","taux":50},"commentaire":"50 % du montant de la prestation d'assistance a maitrise d'ouvrage HT"},{"id":"maprimerenov-individuelle","groupe":"ANAH","libelle":"Maprimerenov' individuelle","publique":true,"calcul":{"mode":"info"},"commentaire":"Aide individuelle de 1500 EUR ou de 3000 EUR selon revenus du coproprietaire occupant"},{"id":"climaxion-aide-travaux","groupe":"Climaxion","libelle":"Climaxion aide travaux","publique":true,"calcul":{"mode":"forfaitPlusParLogement","base":10000,"parLogement":2500,"surEquivalent":true},"commentaire":"Dispositif Climaxion sous reserve d'eligibilite"},{"id":"climaxion-aide-amo","groupe":"Climaxion","libelle":"Climaxion aide AMO","publique":true,"calcul":{"mode":"manuel","montant":3000},"commentaire":"Aide Climaxion sur la prestation AMO"}],"params":{"imprevusPct":7,"plafondTravauxParLogement":25000,"plafondMprParLogement":11250,"fondsTravaux":21000,"totalTantiemes":10000,"tantiemesExemples":[420,560,780],"dureeEcoPtzAns":20,"coefAssurance":1.036,"tauxPretAvancePct":5.45,"pctAvanceAides":70,"plafondAmoParLogement":600,"commentaireFondsTravaux":"Fonds travaux loi ALUR disponible au 01/07/2026"},"variantes":{"collectif":true,"collectifSansAvance":false,"individuel":true},"repartitionCles":{}}$json$::jsonb,
    $json${"performancePct":56.2111801242236,"lots":[{"numero":1,"titre":"Isolation thermique par l'exterieur","entreprise":"FACADES LORRAINES","totalHt":167900,"remise":0,"totalHtApresRemise":167900,"totalHtRetenu":162100,"tvaParTaux":[{"taux":10,"montant":580},{"taux":5.5,"montant":8915.5}],"totalTtc":177395.5},{"numero":2,"titre":"Combles et toiture","entreprise":"TOITURES DE MOSELLE","totalHt":25700,"remise":0,"totalHtApresRemise":25700,"totalHtRetenu":20900,"tvaParTaux":[{"taux":10,"montant":480},{"taux":5.5,"montant":1149.5}],"totalTtc":27329.5},{"numero":3,"titre":"Chaufferie","entreprise":"LORRAINE ENERGIES","totalHt":41600,"remise":0,"totalHtApresRemise":41600,"totalHtRetenu":39700,"tvaParTaux":[{"taux":10,"montant":190},{"taux":5.5,"montant":2183.5}],"totalTtc":43973.5},{"numero":4,"titre":"Ventilation","entreprise":"VENTIL'EST","totalHt":12100,"remise":0,"totalHtApresRemise":12100,"totalHtRetenu":12100,"tvaParTaux":[{"taux":5.5,"montant":665.5}],"totalTtc":12765.5}],"totalTravauxHt":247300,"travauxRetenusHt":234800,"assietteMprTravaux":234800,"plafondAssiette":450000,"totalTravauxTtc":261464,"totalTravauxTtcImprevus":279766.48000000004,"moe":[{"designation":"Assistance Maitrise d'Ouvrage (phase conseil)","entreprise":"STRAT ECO","phase":"etude","montantHt":1500,"montantTtc":1800},{"designation":"Maitrise d'oeuvre phase etudes (DIAG-AVP)","entreprise":"CABINET MOSELLE ARCHITECTES","phase":"etude","montantHt":3900,"montantTtc":4290},{"designation":"Audit reglementaire","entreprise":"EST THERMO CONSEIL","phase":"etude","montantHt":900,"montantTtc":1080},{"designation":"Diagnostic amiante avant travaux","entreprise":"DIAG EXPERT 67","phase":"etude","montantHt":2400,"montantTtc":2880},{"designation":"Assistance Maitrise d'Ouvrage (phase projet)","entreprise":"STRAT ECO","phase":"projet","montantHt":2600,"montantTtc":3120},{"designation":"Maitrise d'oeuvre phase conception (PRO-DCE)","entreprise":"CABINET MOSELLE ARCHITECTES","phase":"projet","montantHt":18400,"montantTtc":20240},{"designation":"Controle technique","phase":"projet","montantHt":1500,"montantTtc":1800},{"designation":"CSPS","phase":"projet","montantHt":900,"montantTtc":1080},{"designation":"Test d'etancheite a l'air avant travaux","entreprise":"AERO TEST","phase":"projet","montantHt":600,"montantTtc":720},{"designation":"Memoire technique Climaxion","entreprise":"CABINET MOSELLE ARCHITECTES","phase":"projet","montantHt":1800,"montantTtc":2160},{"designation":"Assistance Maitrise d'Ouvrage (phase travaux)","entreprise":"STRAT ECO","phase":"travaux","montantHt":4700,"montantTtc":5640},{"designation":"Maitrise d'oeuvre phase travaux","entreprise":"CABINET MOSELLE ARCHITECTES","phase":"travaux","montantHt":9892,"montantTtc":10436.06},{"designation":"Controle technique","phase":"travaux","montantHt":3200,"montantTtc":3840},{"designation":"CSPS","phase":"travaux","montantHt":1600,"montantTtc":1920},{"designation":"Test d'etancheite a l'air apres travaux","entreprise":"AERO TEST","phase":"travaux","montantHt":600,"montantTtc":720},{"designation":"Dommage ouvrage","entreprise":"ASSURANCES DU RHIN","phase":"travaux","montantHt":5229.28,"montantTtc":5229.28},{"designation":"Honoraires syndic","entreprise":"SYNDIC TEST PARCOURS","phase":"travaux","montantHt":6182.5,"montantTtc":7419}],"totalMoeTtc":74374.34,"totalOperationTtc":354140.82000000007,"totalPhaseTravauxTtc":314970.82000000007,"aides":[{"id":"cee-fiche-par-fiche","groupe":"CEE","libelle":"CEE fiche par fiche","montant":14500,"publique":false,"commentaire":"Depend des lots de travaux energetiques et de la surface habitable"},{"id":"maprimerenov-partie-travaux","groupe":"ANAH","libelle":"Maprimerenov' partie travaux","montant":105660,"publique":true,"commentaire":"45 % du montant des travaux energetiques HT - plafonne a 11250 EUR par logement"},{"id":"maprimerenov-partie-etudes","groupe":"ANAH","libelle":"Maprimerenov' partie etudes","montant":15147.362911443593,"publique":true,"commentaire":"45 % du montant des etudes, diags, maitrise d'oeuvre HT"},{"id":"maprimerenov-amo","groupe":"ANAH","libelle":"Maprimerenov' AMO","montant":4400,"publique":true,"commentaire":"50 % du montant de la prestation d'assistance a maitrise d'ouvrage HT"},{"id":"maprimerenov-individuelle","groupe":"ANAH","libelle":"Maprimerenov' individuelle","montant":null,"publique":true,"commentaire":"Aide individuelle de 1500 EUR ou de 3000 EUR selon revenus du coproprietaire occupant"},{"id":"climaxion-aide-travaux","groupe":"Climaxion","libelle":"Climaxion aide travaux","montant":55000,"publique":true,"commentaire":"Dispositif Climaxion sous reserve d'eligibilite"},{"id":"climaxion-aide-amo","groupe":"Climaxion","libelle":"Climaxion aide AMO","montant":3000,"publique":true,"commentaire":"Aide Climaxion sur la prestation AMO"}],"totalAides":197707.3629114436,"totalAidesPubliques":183207.36291144358,"primeCee":14500.00000000003,"tauxCouverture":0.5582732962312663,"resteACharge":135433.45708855646,"coutTantiemeAvant":35.41408200000001,"collectif":{"resteAFinancer":149933.4570885565,"coutTantiemeApres":14.99334570885565,"exemples":[{"tantiemes":420,"quotePartAvant":14873.914440000004,"resteAFinancer":6297.205197719373,"mensualiteEcoPtz":27.182935770155296,"subventionsPubliques":7694.709242280631,"coutPretAvance":419.3616537042943,"primeCee":609.0000000000013,"prixRevient":6107.566851423667},{"tantiemes":560,"quotePartAvant":19831.885920000004,"resteAFinancer":8396.273596959163,"mensualiteEcoPtz":36.24391436020705,"subventionsPubliques":10259.612323040841,"coutPretAvance":559.1488716057257,"primeCee":812.0000000000016,"prixRevient":8143.422468564887},{"tantiemes":780,"quotePartAvant":27622.983960000005,"resteAFinancer":11694.809652907406,"mensualiteEcoPtz":50.48259500171697,"subventionsPubliques":14290.174307092599,"coutPretAvance":778.8144997365466,"primeCee":1131.0000000000023,"prixRevient":11342.624152643952}]},"collectifSansAvance":{"resteAFinancer":149933.4570885565,"coutTantiemeApres":14.99334570885565,"exemples":[{"tantiemes":420,"quotePartAvant":14873.914440000004,"resteAFinancer":6297.205197719373,"mensualiteEcoPtz":27.182935770155296,"subventionsPubliques":7694.709242280631,"primeCee":609.0000000000013,"prixRevient":5688.205197719372},{"tantiemes":560,"quotePartAvant":19831.885920000004,"resteAFinancer":8396.273596959163,"mensualiteEcoPtz":36.24391436020705,"subventionsPubliques":10259.612323040841,"primeCee":812.0000000000016,"prixRevient":7584.273596959161},{"tantiemes":780,"quotePartAvant":27622.983960000005,"resteAFinancer":11694.809652907406,"mensualiteEcoPtz":50.48259500171697,"subventionsPubliques":14290.174307092599,"primeCee":1131.0000000000023,"prixRevient":10563.809652907405}]},"individuel":{"aidesAvancees":128245.1540380105,"aidesFinChantier":54962.208873433075,"appelsFonds":204895.66596198955,"coutTantiemeApresAides":13.543345708855647,"coutTantiemeAvecAvance":20.489566596198955,"exemples":[{"tantiemes":420,"quotePartAvant":14873.914440000004,"prixRevient":5688.205197719371,"appelsFonds":8605.61797040356,"remboursementFinChantier":2917.4127726841893,"mensualiteEcoPtz":37.147584238908706},{"tantiemes":560,"quotePartAvant":19831.885920000004,"prixRevient":7584.273596959162,"appelsFonds":11474.157293871414,"remboursementFinChantier":3889.8836969122526,"mensualiteEcoPtz":49.530112318544944},{"tantiemes":780,"quotePartAvant":27622.983960000005,"prixRevient":10563.809652907405,"appelsFonds":15981.861945035185,"remboursementFinChantier":5418.052292127781,"mensualiteEcoPtz":68.9883707294019}]},"gardeFous":[{"libelle":"Plafond travaux < 25 K€/logt","valeur":13044.444444444445,"plafond":25000,"ok":true},{"libelle":"MPR travaux < 11 250 €/logt","valeur":5870,"plafond":11250,"ok":true},{"libelle":"AMO < 1 000 €/logt","valeur":488.8888888888889,"plafond":1000,"ok":true}]}$json$::jsonb,
    'valide',
    null,
    1,
    now() - interval '10 days',
    (select id from auth.users where email = 'amir@strateco.fr' limit 1)
  );
  update coproprietes
  set gain_pct = 56.2,
      energy_before = 'F',
      energy_after = 'C'
  where id = v_copro;
end $$;

-- Onglet Données : clé de répartition, copropriétaires, lots, tantièmes
do $$
declare
  v_copro uuid;
  v_cle uuid;
  r record;
  v_cp uuid;
  v_bat uuid;
  v_parent uuid;
  v_lot uuid;
begin
  select id into v_copro from coproprietes where slug = 'test-les-mirabelles';
  if v_copro is null then return; end if;
  if exists (select 1 from lots where copro_id = v_copro) then
    raise notice 'Lots déjà présents - bloc données sauté.';
    return;
  end if;

  insert into cles_repartition (copro_id, code, label, is_default)
  values (v_copro, 'MUN', 'Tantièmes généraux', true)
  on conflict do nothing;
  select id into v_cle from cles_repartition where copro_id = v_copro and code = 'MUN';

  for r in
    select * from (values
      ('SCI GERARD PATRIMOINE', 'bailleur', null, '06 14 64 59 80', '6 rue de la Republique, 69002 Lyon'),
      ('Bernard et Josiane POIROT', 'bailleur', null, '06 60 75 60 56', '9 rue Serpenoise, 57000 Metz'),
      ('Christophe et Lea THIRIET', 'occupant', null, '06 15 90 50 56', null),
      ('Emilie MANGIN', 'bailleur', null, '06 30 15 17 26', '12 rue des Jardins, 67200 Strasbourg'),
      ('Mehdi et Isabelle HUSSON', 'occupant', null, null, '9 rue Fabert, 57000 Metz'),
      ('Manon et Lucas GERARD', 'bailleur', null, '06 53 19 97 65', '8 rue du Faubourg, 88000 Epinal'),
      ('Laurent COLIN', 'occupant', null, '03 94 65 87 47', '9 rue Fabert, 57000 Metz'),
      ('Chloe MARCHAL', 'occupant', null, '06 23 27 58 31', null),
      ('Christophe PIERRON', 'bailleur', null, null, '4 rue de Metz, 54520 Laxou'),
      ('Patricia BASTIEN', 'occupant', null, '06 35 33 87 15', '9 rue Fabert, 57000 Metz'),
      ('Mehdi CLAUDEL', 'occupant', null, '06 68 86 69 66', null),
      ('Camille GEORGE', 'bailleur', null, null, '12 rue des Jardins, 67200 Strasbourg'),
      ('Laurent VILLEMIN', 'occupant', null, null, null),
      ('Helene POIROT', 'bailleur', null, '06 16 33 34 52', '3 place Kleber, 67000 Strasbourg'),
      ('Sophie MATHIEU', 'bailleur', null, null, '31 boulevard Voltaire, 75011 Paris'),
      ('Celine PERRIN', 'occupant', null, null, '9 rue Fabert, 57000 Metz')
    ) as t(nom, type, email, telephone, adresse)
  loop
    insert into coproprietaires (copro_id, nom, type, email, telephone, adresse)
    values (v_copro, r.nom, r.type, r.email, r.telephone, r.adresse);
  end loop;

  for r in
    select * from (values
      ('1', '01', 'SCI GERARD PATRIMOINE', 'habitation', 547, null),
      ('2', '01', 'Bernard et Josiane POIROT', 'habitation', 400, null),
      ('3', '01', 'Christophe et Lea THIRIET', 'habitation', 694, null),
      ('4', '01', 'Emilie MANGIN', 'habitation', 547, null),
      ('5', '01', 'Mehdi et Isabelle HUSSON', 'habitation', 547, null),
      ('6', '01', 'Manon et Lucas GERARD', 'habitation', 400, null),
      ('7', '01', 'Laurent COLIN', 'habitation', 694, null),
      ('8', '01', 'Chloe MARCHAL', 'habitation', 547, null),
      ('9', '01', 'Christophe PIERRON', 'habitation', 547, null),
      ('10', '01', 'SCI GERARD PATRIMOINE', 'habitation', 400, null),
      ('11', '01', 'Bernard et Josiane POIROT', 'habitation', 694, null),
      ('12', '01', 'Patricia BASTIEN', 'habitation', 547, null),
      ('13', '01', 'Mehdi CLAUDEL', 'habitation', 547, null),
      ('14', '01', 'Camille GEORGE', 'habitation', 400, null),
      ('15', '01', 'Laurent VILLEMIN', 'habitation', 694, null),
      ('16', '01', 'Helene POIROT', 'habitation', 547, null),
      ('17', '01', 'Sophie MATHIEU', 'habitation', 547, null),
      ('18', '01', 'Celine PERRIN', 'habitation', 400, null),
      ('19', '01', 'Celine PERRIN', 'caves', 13, '18'),
      ('20', '01', 'Sophie MATHIEU', 'caves', 12, '17'),
      ('21', '01', 'Helene POIROT', 'caves', 12, '16'),
      ('22', '01', 'Laurent VILLEMIN', 'caves', 12, '15'),
      ('23', '01', 'Camille GEORGE', 'caves', 12, '14'),
      ('24', '01', 'Mehdi CLAUDEL', 'caves', 12, '13'),
      ('25', '01', 'Patricia BASTIEN', 'caves', 12, '12'),
      ('26', '01', 'Christophe PIERRON', 'caves', 12, '9'),
      ('27', '01', 'Christophe et Lea THIRIET', 'garage', 34, '3'),
      ('28', '01', 'Emilie MANGIN', 'garage', 34, '4'),
      ('29', '01', 'Mehdi et Isabelle HUSSON', 'garage', 34, '5'),
      ('30', '01', 'Manon et Lucas GERARD', 'garage', 34, '6'),
      ('31', '01', 'Laurent COLIN', 'garage', 34, '7'),
      ('32', '01', 'Chloe MARCHAL', 'garage', 34, '8')
    ) as t(num, bat, nom, usage, tantiemes, parent_num)
    order by (parent_num is not null), num::int
  loop
    select id into v_cp from coproprietaires where copro_id = v_copro and nom = r.nom;
    select id into v_bat from batiments where copro_id = v_copro and code = r.bat;
    v_parent := null;
    if r.parent_num is not null then
      select id into v_parent from lots where copro_id = v_copro and num = r.parent_num;
    end if;
    insert into lots (copro_id, batiment_id, coproprietaire_id, num, usage, rattache_a)
    values (v_copro, v_bat, v_cp, r.num, r.usage::usage_lot, v_parent)
    returning id into v_lot;
    insert into lot_tantiemes (lot_id, cle_id, tantiemes) values (v_lot, v_cle, r.tantiemes);
  end loop;

end $$;

commit;

-- @@BLOC 3 LE CLOS DES BRASSEURS : PF définitif validé, copropriétaires, lots, tantièmes
begin;

-- PF définitif validé (comme useValiderPlanDefinitif)
do $$
declare
  v_copro uuid;
begin
  select id into v_copro from coproprietes where slug = 'test-le-clos-des-brasseurs';
  if v_copro is null then
    raise exception 'Copropriété test-le-clos-des-brasseurs absente - jouer le bloc 0 d''abord.';
  end if;
  if exists (select 1 from plans_definitifs where copro_id = v_copro) then
    raise notice 'PF déjà présent - bloc PF sauté.';
    return;
  end if;
  insert into plans_definitifs (copro_id, nom, data, resultat, statut, source_fichier, version, valide_le, updated_by)
  values (
    v_copro,
    'PF définitif - Le Clos des Brasseurs',
    $json${"infos":{"nomCopro":"LE CLOS DES BRASSEURS","adresse":"6 rue des Brasseries 54000 Nancy","nbLogements":24,"nbLogementsEquiv":24,"surfaceHabitable":1620,"nbEtages":6,"nbEntrees":2,"typeChauffage":"Gaz collectif","cepInitial":262,"cepProjet":154,"dispositifClimaxion":false,"etiquetteInitiale":"E","etiquetteProjet":"C"},"lots":[{"numero":1,"titre":"Isolation thermique par l'exterieur","entreprise":"FACADES LORRAINES","remisePct":0,"lignes":[{"retenu":true,"tvaPct":5.5,"montantHt":29000,"designation":"Echafaudage"},{"retenu":true,"tvaPct":5.5,"montantHt":148000,"designation":"Isolation thermique par l'exterieur en polystyrene graphite 160 mm"},{"retenu":true,"tvaPct":5.5,"montantHt":19500,"designation":"Traitement des balcons"},{"retenu":true,"tvaPct":5.5,"montantHt":13800,"designation":"Garde-corps"},{"retenu":true,"tvaPct":5.5,"montantHt":5900,"designation":"Bandeaux et departs"},{"retenu":false,"tvaPct":10,"montantHt":3500,"designation":"Soubassement"},{"retenu":false,"tvaPct":10,"montantHt":4200,"designation":"Peinture des parties communes"}]},{"numero":2,"titre":"Toiture terrasse","entreprise":"TOITURES DE MOSELLE","remisePct":0,"lignes":[{"retenu":true,"tvaPct":5.5,"montantHt":10500,"designation":"Depose des complexes existants"},{"retenu":true,"tvaPct":5.5,"montantHt":37800,"designation":"Isolation polyurethane 200 mm et etancheite bicouche"},{"retenu":true,"tvaPct":5.5,"montantHt":7800,"designation":"Releves, acroteres et couvertines"},{"retenu":false,"tvaPct":10,"montantHt":4500,"designation":"Reprise des edicules et sorties de toiture"}]},{"numero":3,"titre":"Ventilation","entreprise":"VENTIL'EST","remisePct":0,"lignes":[{"retenu":true,"tvaPct":5.5,"montantHt":6300,"designation":"Caissons d'extraction hygroreglables"},{"retenu":true,"tvaPct":5.5,"montantHt":7500,"designation":"Gaines, bouches d'extraction et entrees d'air"},{"retenu":true,"tvaPct":5.5,"montantHt":2400,"designation":"Carottages et calfeutrements"}]},{"numero":4,"titre":"Menuiseries des parties communes","entreprise":"MENUISERIES DE LA SEILLE","remisePct":0,"lignes":[{"retenu":true,"tvaPct":5.5,"montantHt":4900,"designation":"Portes de halls isolantes avec gache electrique"},{"retenu":true,"tvaPct":5.5,"montantHt":3600,"designation":"Chassis des cages d'escalier"},{"retenu":false,"tvaPct":10,"montantHt":1300,"designation":"Volets des locaux communs"}]}],"moe":[{"phase":"etude","tvaPct":20,"montant":{"mode":"forfait","montantHt":1500},"entreprise":"STRAT ECO","designation":"Assistance Maitrise d'Ouvrage (phase conseil)","commentaire":"Phase conseil, assistance technique et approche financiere","eligibleMprAmo":true,"eligibleMprEtudes":false},{"phase":"etude","tvaPct":10,"montant":{"mode":"forfait","montantHt":4800},"entreprise":"CABINET MOSELLE ARCHITECTES","designation":"Maitrise d'oeuvre phase etudes (DIAG-AVP)","commentaire":"Etude, avant-projet","eligibleMprAmo":false,"eligibleMprEtudes":true},{"phase":"etude","tvaPct":20,"montant":{"mode":"forfait","montantHt":900},"entreprise":"EST THERMO CONSEIL","designation":"Audit reglementaire","commentaire":"Mise a jour","eligibleMprAmo":false,"eligibleMprEtudes":false},{"phase":"etude","tvaPct":20,"montant":{"mode":"forfait","montantHt":2800},"entreprise":"DIAG EXPERT 67","designation":"Diagnostic amiante avant travaux","eligibleMprAmo":false,"eligibleMprEtudes":false},{"phase":"projet","tvaPct":20,"montant":{"mode":"forfait","montantHt":3300},"entreprise":"STRAT ECO","designation":"Assistance Maitrise d'Ouvrage (phase projet)","commentaire":"Prestation obligatoire, assistance projet, administrative, financiere","eligibleMprAmo":true,"eligibleMprEtudes":false},{"phase":"projet","tvaPct":10,"montant":{"mode":"forfait","montantHt":22600},"entreprise":"CABINET MOSELLE ARCHITECTES","designation":"Maitrise d'oeuvre phase conception (PRO-DCE)","commentaire":"Cahiers des charges, depot de DP, DCE","eligibleMprAmo":false,"eligibleMprEtudes":true},{"phase":"projet","tvaPct":20,"montant":{"mode":"forfait","montantHt":1700},"designation":"Controle technique","commentaire":"Prestations necessaires","eligibleMprAmo":false,"eligibleMprEtudes":true},{"phase":"projet","tvaPct":20,"montant":{"mode":"forfait","montantHt":1000},"designation":"CSPS","commentaire":"Prestations necessaires","eligibleMprAmo":false,"eligibleMprEtudes":true},{"phase":"travaux","tvaPct":20,"montant":{"mode":"forfait","montantHt":5900},"entreprise":"STRAT ECO","designation":"Assistance Maitrise d'Ouvrage (phase travaux)","commentaire":"Prestation obligatoire, assistance projet, administrative, financiere","eligibleMprAmo":true,"eligibleMprEtudes":false},{"phase":"travaux","tvaPct":5.5,"montant":{"mode":"pctTravauxHt","taux":3.8},"entreprise":"CABINET MOSELLE ARCHITECTES","designation":"Maitrise d'oeuvre phase travaux","commentaire":"Pilotage et reception des travaux","eligibleMprAmo":false,"eligibleMprEtudes":true},{"phase":"travaux","tvaPct":20,"montant":{"mode":"forfait","montantHt":3600},"designation":"Controle technique","commentaire":"Prestations necessaires","eligibleMprAmo":false,"eligibleMprEtudes":true},{"phase":"travaux","tvaPct":20,"montant":{"mode":"forfait","montantHt":1800},"designation":"CSPS","commentaire":"Prestations necessaires","eligibleMprAmo":false,"eligibleMprEtudes":true},{"phase":"travaux","tvaPct":0,"montant":{"mode":"pctTravauxTtc","taux":2},"entreprise":"ASSURANCES DU RHIN","designation":"Dommage ouvrage","commentaire":"Obligatoire","eligibleMprAmo":false,"eligibleMprEtudes":false},{"phase":"travaux","tvaPct":20,"montant":{"mode":"pctTravauxHt","taux":2.5},"entreprise":"SYNDIC TEST PARCOURS","designation":"Honoraires syndic","commentaire":"Selon informations du syndic","eligibleMprAmo":false,"eligibleMprEtudes":false}],"aides":[{"id":"cee-fiche-par-fiche","groupe":"CEE","libelle":"CEE fiche par fiche","publique":false,"calcul":{"mode":"manuel","montant":17000},"commentaire":"Depend des lots de travaux energetiques et de la surface habitable"},{"id":"maprimerenov-partie-travaux","groupe":"ANAH","libelle":"Maprimerenov' partie travaux","publique":true,"calcul":{"mode":"pctAssietteTravaux","taux":30,"coef":1},"commentaire":"30 % du montant des travaux energetiques HT - plafonne a 7500 EUR par logement"},{"id":"maprimerenov-partie-etudes","groupe":"ANAH","libelle":"Maprimerenov' partie etudes","publique":true,"calcul":{"mode":"pctEtudes","taux":30,"coef":0.9},"commentaire":"30 % du montant des etudes, diags, maitrise d'oeuvre HT"},{"id":"maprimerenov-amo","groupe":"ANAH","libelle":"Maprimerenov' AMO","publique":true,"calcul":{"mode":"pctAmo","taux":50},"commentaire":"50 % du montant de la prestation d'assistance a maitrise d'ouvrage HT"},{"id":"maprimerenov-individuelle","groupe":"ANAH","libelle":"Maprimerenov' individuelle","publique":true,"calcul":{"mode":"info"},"commentaire":"Aide individuelle de 1500 EUR ou de 3000 EUR selon revenus du coproprietaire occupant"}],"params":{"imprevusPct":7,"plafondTravauxParLogement":25000,"plafondMprParLogement":7500,"fondsTravaux":28000,"totalTantiemes":10000,"tantiemesExemples":[330,420,590],"dureeEcoPtzAns":20,"coefAssurance":1.036,"tauxPretAvancePct":5.45,"pctAvanceAides":70,"plafondAmoParLogement":600,"commentaireFondsTravaux":"Fonds travaux loi ALUR disponible au 01/07/2026"},"variantes":{"collectif":true,"collectifSansAvance":false,"individuel":true},"repartitionCles":{}}$json$::jsonb,
    $json${"performancePct":41.221374045801525,"lots":[{"numero":1,"titre":"Isolation thermique par l'exterieur","entreprise":"FACADES LORRAINES","totalHt":223900,"remise":0,"totalHtApresRemise":223900,"totalHtRetenu":216200,"tvaParTaux":[{"taux":10,"montant":770},{"taux":5.5,"montant":11891}],"totalTtc":236561},{"numero":2,"titre":"Toiture terrasse","entreprise":"TOITURES DE MOSELLE","totalHt":60600,"remise":0,"totalHtApresRemise":60600,"totalHtRetenu":56100,"tvaParTaux":[{"taux":10,"montant":450},{"taux":5.5,"montant":3085.5}],"totalTtc":64135.5},{"numero":3,"titre":"Ventilation","entreprise":"VENTIL'EST","totalHt":16200,"remise":0,"totalHtApresRemise":16200,"totalHtRetenu":16200,"tvaParTaux":[{"taux":5.5,"montant":891}],"totalTtc":17091},{"numero":4,"titre":"Menuiseries des parties communes","entreprise":"MENUISERIES DE LA SEILLE","totalHt":9800,"remise":0,"totalHtApresRemise":9800,"totalHtRetenu":8500,"tvaParTaux":[{"taux":10,"montant":130},{"taux":5.5,"montant":467.5}],"totalTtc":10397.5}],"totalTravauxHt":310500,"travauxRetenusHt":297000,"assietteMprTravaux":297000,"plafondAssiette":600000,"totalTravauxTtc":328185,"totalTravauxTtcImprevus":351157.95,"moe":[{"designation":"Assistance Maitrise d'Ouvrage (phase conseil)","entreprise":"STRAT ECO","phase":"etude","montantHt":1500,"montantTtc":1800},{"designation":"Maitrise d'oeuvre phase etudes (DIAG-AVP)","entreprise":"CABINET MOSELLE ARCHITECTES","phase":"etude","montantHt":4800,"montantTtc":5280},{"designation":"Audit reglementaire","entreprise":"EST THERMO CONSEIL","phase":"etude","montantHt":900,"montantTtc":1080},{"designation":"Diagnostic amiante avant travaux","entreprise":"DIAG EXPERT 67","phase":"etude","montantHt":2800,"montantTtc":3360},{"designation":"Assistance Maitrise d'Ouvrage (phase projet)","entreprise":"STRAT ECO","phase":"projet","montantHt":3300,"montantTtc":3960},{"designation":"Maitrise d'oeuvre phase conception (PRO-DCE)","entreprise":"CABINET MOSELLE ARCHITECTES","phase":"projet","montantHt":22600,"montantTtc":24860.000000000004},{"designation":"Controle technique","phase":"projet","montantHt":1700,"montantTtc":2040},{"designation":"CSPS","phase":"projet","montantHt":1000,"montantTtc":1200},{"designation":"Assistance Maitrise d'Ouvrage (phase travaux)","entreprise":"STRAT ECO","phase":"travaux","montantHt":5900,"montantTtc":7080},{"designation":"Maitrise d'oeuvre phase travaux","entreprise":"CABINET MOSELLE ARCHITECTES","phase":"travaux","montantHt":11799,"montantTtc":12447.945},{"designation":"Controle technique","phase":"travaux","montantHt":3600,"montantTtc":4320},{"designation":"CSPS","phase":"travaux","montantHt":1800,"montantTtc":2160},{"designation":"Dommage ouvrage","entreprise":"ASSURANCES DU RHIN","phase":"travaux","montantHt":6563.7,"montantTtc":6563.7},{"designation":"Honoraires syndic","entreprise":"SYNDIC TEST PARCOURS","phase":"travaux","montantHt":7762.5,"montantTtc":9315}],"totalMoeTtc":85466.645,"totalOperationTtc":436624.59500000003,"totalPhaseTravauxTtc":393044.59500000003,"aides":[{"id":"cee-fiche-par-fiche","groupe":"CEE","libelle":"CEE fiche par fiche","montant":17000,"publique":false,"commentaire":"Depend des lots de travaux energetiques et de la surface habitable"},{"id":"maprimerenov-partie-travaux","groupe":"ANAH","libelle":"Maprimerenov' partie travaux","montant":89100,"publique":true,"commentaire":"30 % du montant des travaux energetiques HT - plafonne a 7500 EUR par logement"},{"id":"maprimerenov-partie-etudes","groupe":"ANAH","libelle":"Maprimerenov' partie etudes","montant":12215.480869565217,"publique":true,"commentaire":"30 % du montant des etudes, diags, maitrise d'oeuvre HT"},{"id":"maprimerenov-amo","groupe":"ANAH","libelle":"Maprimerenov' AMO","montant":5350,"publique":true,"commentaire":"50 % du montant de la prestation d'assistance a maitrise d'ouvrage HT"},{"id":"maprimerenov-individuelle","groupe":"ANAH","libelle":"Maprimerenov' individuelle","montant":null,"publique":true,"commentaire":"Aide individuelle de 1500 EUR ou de 3000 EUR selon revenus du coproprietaire occupant"}],"totalAides":123665.48086956522,"totalAidesPubliques":106665.48086956522,"primeCee":17000,"tauxCouverture":0.2832306798236256,"resteACharge":284959.1141304348,"coutTantiemeAvant":43.662459500000004,"collectif":{"resteAFinancer":301959.1141304348,"coutTantiemeApres":30.195911413043483,"exemples":[{"tantiemes":330,"quotePartAvant":14408.611635000001,"resteAFinancer":9964.650766304349,"mensualiteEcoPtz":43.01407580788044,"subventionsPubliques":3519.960868695652,"coutPretAvance":191.83786734391305,"primeCee":561,"prixRevient":9595.488633648261},{"tantiemes":420,"quotePartAvant":18338.232990000004,"resteAFinancer":12682.282793478264,"mensualiteEcoPtz":54.74518739184784,"subventionsPubliques":4479.95019652174,"coutPretAvance":244.1572857104348,"primeCee":714,"prixRevient":12212.440079188698},{"tantiemes":590,"quotePartAvant":25760.851105,"resteAFinancer":17815.587733695655,"mensualiteEcoPtz":76.90395371711958,"subventionsPubliques":6293.263371304348,"coutPretAvance":342.9828537360869,"primeCee":1003,"prixRevient":17155.570587431743}]},"collectifSansAvance":{"resteAFinancer":301959.1141304348,"coutTantiemeApres":30.195911413043483,"exemples":[{"tantiemes":330,"quotePartAvant":14408.611635000001,"resteAFinancer":9964.650766304349,"mensualiteEcoPtz":43.01407580788044,"subventionsPubliques":3519.960868695652,"primeCee":561,"prixRevient":9403.650766304349},{"tantiemes":420,"quotePartAvant":18338.232990000004,"resteAFinancer":12682.282793478264,"mensualiteEcoPtz":54.74518739184784,"subventionsPubliques":4479.95019652174,"primeCee":714,"prixRevient":11968.282793478264},{"tantiemes":590,"quotePartAvant":25760.851105,"resteAFinancer":17815.587733695655,"mensualiteEcoPtz":76.90395371711958,"subventionsPubliques":6293.263371304348,"primeCee":1003,"prixRevient":16812.587733695655}]},"individuel":{"aidesAvancees":74665.83660869565,"aidesFinChantier":31999.644260869565,"appelsFonds":333958.7583913044,"coutTantiemeApresAides":28.49591141304348,"coutTantiemeAvecAvance":33.39587583913044,"exemples":[{"tantiemes":330,"quotePartAvant":14408.611635000001,"prixRevient":9403.650766304349,"appelsFonds":11020.639026913046,"remboursementFinChantier":1616.988260608697,"mensualiteEcoPtz":47.57242513284132},{"tantiemes":420,"quotePartAvant":18338.23299,"prixRevient":11968.282793478262,"appelsFonds":14026.267852434785,"remboursementFinChantier":2057.985058956523,"mensualiteEcoPtz":60.54672289634349},{"tantiemes":590,"quotePartAvant":25760.851105,"prixRevient":16812.587733695655,"appelsFonds":19703.56674508696,"remboursementFinChantier":2890.9790113913064,"mensualiteEcoPtz":85.05372978295871}]},"gardeFous":[{"libelle":"Plafond travaux < 25 K€/logt","valeur":12375,"plafond":25000,"ok":true},{"libelle":"MPR travaux < 7 500 €/logt","valeur":3712.5,"plafond":7500,"ok":true},{"libelle":"AMO < 600 €/logt","valeur":445.8333333333333,"plafond":600,"ok":true}]}$json$::jsonb,
    'valide',
    null,
    1,
    now() - interval '10 days',
    (select id from auth.users where email = 'amir@strateco.fr' limit 1)
  );
  update coproprietes
  set gain_pct = 41.2,
      energy_before = 'E',
      energy_after = 'C'
  where id = v_copro;
end $$;

-- Onglet Données : clé de répartition, copropriétaires, lots, tantièmes
do $$
declare
  v_copro uuid;
  v_cle uuid;
  r record;
  v_cp uuid;
  v_bat uuid;
  v_parent uuid;
  v_lot uuid;
begin
  select id into v_copro from coproprietes where slug = 'test-le-clos-des-brasseurs';
  if v_copro is null then return; end if;
  if exists (select 1 from lots where copro_id = v_copro) then
    raise notice 'Lots déjà présents - bloc données sauté.';
    return;
  end if;

  insert into cles_repartition (copro_id, code, label, is_default)
  values (v_copro, 'MUN', 'Tantièmes généraux', true)
  on conflict do nothing;
  select id into v_cle from cles_repartition where copro_id = v_copro and code = 'MUN';

  for r in
    select * from (values
      ('SCI VILLEMIN PATRIMOINE', 'bailleur', null, '03 57 19 93 57', '6 rue de la Republique, 69002 Lyon'),
      ('Bernard et Josiane NOEL', 'bailleur', null, '06 34 77 10 40', '9 rue Serpenoise, 57000 Metz'),
      ('Paul et Amina GEORGE', 'occupant', null, '06 42 61 33 47', '6 rue des Brasseries, 54000 Nancy'),
      ('Laurent VILLEMIN', 'occupant', null, null, null),
      ('Jean POIROT', 'occupant', null, '03 54 17 52 81', null),
      ('Christophe MATHIEU', 'occupant', null, '03 80 35 90 25', '6 rue des Brasseries, 54000 Nancy'),
      ('Celine PERRIN', 'occupant', null, '03 76 72 10 77', '6 rue des Brasseries, 54000 Nancy'),
      ('Laurence et Mehdi ANTOINE', 'occupant', null, '03 25 89 31 88', null),
      ('Anne DIDIER', 'bailleur', null, '06 53 21 69 69', '17 rue Saint-Dizier, 54000 Nancy'),
      ('Laurent et Sandrine NOEL', 'occupant', null, '06 74 34 46 91', null),
      ('Christine et Francois VAUTRIN', 'occupant', null, '06 44 79 82 34', null),
      ('Julie HENRY', 'occupant', null, '06 53 45 66 17', null),
      ('Maxime REMY', 'bailleur', null, null, '4 rue de Metz, 54520 Laxou'),
      ('Mehdi JACQUOT', 'occupant', null, null, '6 rue des Brasseries, 54000 Nancy'),
      ('Catherine GRANDJEAN', 'occupant', null, null, null),
      ('Lea et Thomas ROLIN', 'occupant', null, '06 15 69 10 70', '6 rue des Brasseries, 54000 Nancy'),
      ('Nadia et Lucas MASSON', 'bailleur', null, '06 21 96 53 11', '6 rue de la Republique, 69002 Lyon'),
      ('Valerie et Mehdi SCHMITT', 'occupant', null, '06 33 86 33 24', null),
      ('Nathalie WEBER', 'occupant', null, null, null),
      ('Mehdi et Elodie KLEIN', 'occupant', null, '06 64 29 65 39', null),
      ('Paul MULLER', 'occupant', null, '06 73 61 47 17', '6 rue des Brasseries, 54000 Nancy'),
      ('Laurent BENALI', 'occupant', null, '06 88 70 22 81', null)
    ) as t(nom, type, email, telephone, adresse)
  loop
    insert into coproprietaires (copro_id, nom, type, email, telephone, adresse)
    values (v_copro, r.nom, r.type, r.email, r.telephone, r.adresse);
  end loop;

  for r in
    select * from (values
      ('1', '01', 'SCI VILLEMIN PATRIMOINE', 'habitation', 405, null),
      ('2', '01', 'Bernard et Josiane NOEL', 'habitation', 296, null),
      ('3', '01', 'Paul et Amina GEORGE', 'habitation', 513, null),
      ('4', '01', 'Laurent VILLEMIN', 'habitation', 405, null),
      ('5', '01', 'Jean POIROT', 'habitation', 405, null),
      ('6', '01', 'Christophe MATHIEU', 'habitation', 296, null),
      ('7', '01', 'Celine PERRIN', 'habitation', 513, null),
      ('8', '01', 'Laurence et Mehdi ANTOINE', 'habitation', 405, null),
      ('9', '01', 'Anne DIDIER', 'habitation', 405, null),
      ('10', '01', 'Laurent et Sandrine NOEL', 'habitation', 296, null),
      ('11', '01', 'Christine et Francois VAUTRIN', 'habitation', 513, null),
      ('12', '01', 'Julie HENRY', 'habitation', 405, null),
      ('13', '01', 'SCI VILLEMIN PATRIMOINE', 'habitation', 405, null),
      ('14', '01', 'Bernard et Josiane NOEL', 'habitation', 296, null),
      ('15', '01', 'Maxime REMY', 'habitation', 513, null),
      ('16', '01', 'Mehdi JACQUOT', 'habitation', 405, null),
      ('17', '01', 'Catherine GRANDJEAN', 'habitation', 404, null),
      ('18', '01', 'Lea et Thomas ROLIN', 'habitation', 296, null),
      ('19', '01', 'Nadia et Lucas MASSON', 'habitation', 513, null),
      ('20', '01', 'Valerie et Mehdi SCHMITT', 'habitation', 404, null),
      ('21', '01', 'Nathalie WEBER', 'habitation', 404, null),
      ('22', '01', 'Mehdi et Elodie KLEIN', 'habitation', 296, null),
      ('23', '01', 'Paul MULLER', 'habitation', 513, null),
      ('24', '01', 'Laurent BENALI', 'habitation', 404, null),
      ('25', '01', 'Laurent BENALI', 'caves', 9, '24'),
      ('26', '01', 'Paul MULLER', 'caves', 9, '23'),
      ('27', '01', 'Mehdi et Elodie KLEIN', 'caves', 9, '22'),
      ('28', '01', 'Nathalie WEBER', 'caves', 9, '21'),
      ('29', '01', 'Valerie et Mehdi SCHMITT', 'caves', 9, '20'),
      ('30', '01', 'Nadia et Lucas MASSON', 'caves', 9, '19'),
      ('31', '01', 'Lea et Thomas ROLIN', 'caves', 9, '18'),
      ('32', '01', 'Catherine GRANDJEAN', 'caves', 9, '17'),
      ('33', '01', 'Mehdi JACQUOT', 'caves', 9, '16'),
      ('34', '01', 'Maxime REMY', 'caves', 9, '15'),
      ('35', '01', 'Paul et Amina GEORGE', 'garage', 25, '3'),
      ('36', '01', 'Laurent VILLEMIN', 'garage', 25, '4'),
      ('37', '01', 'Jean POIROT', 'garage', 25, '5'),
      ('38', '01', 'Christophe MATHIEU', 'garage', 25, '6'),
      ('39', '01', 'Celine PERRIN', 'garage', 25, '7'),
      ('40', '01', 'Laurence et Mehdi ANTOINE', 'garage', 25, '8'),
      ('41', '01', 'Anne DIDIER', 'garage', 25, '9'),
      ('42', '01', 'Laurent et Sandrine NOEL', 'garage', 25, '10')
    ) as t(num, bat, nom, usage, tantiemes, parent_num)
    order by (parent_num is not null), num::int
  loop
    select id into v_cp from coproprietaires where copro_id = v_copro and nom = r.nom;
    select id into v_bat from batiments where copro_id = v_copro and code = r.bat;
    v_parent := null;
    if r.parent_num is not null then
      select id into v_parent from lots where copro_id = v_copro and num = r.parent_num;
    end if;
    insert into lots (copro_id, batiment_id, coproprietaire_id, num, usage, rattache_a)
    values (v_copro, v_bat, v_cp, r.num, r.usage::usage_lot, v_parent)
    returning id into v_lot;
    insert into lot_tantiemes (lot_id, cle_id, tantiemes) values (v_lot, v_cle, r.tantiemes);
  end loop;

end $$;

commit;

-- @@BLOC 4 LE CLOS DES BRASSEURS : enquête, partage au portail, choix et adhésions
begin;

-- Enquête créée par l'AMO, pas encore envoyée
insert into enquetes (copro_id, questions, statut)
select id, $json$[{"id":"nom","on":true},{"id":"telephone","on":true},{"id":"adresse","on":true},{"id":"email","on":true},{"id":"type-coproprietaire","on":true},{"id":"nb-indivisaires","on":true},{"id":"nb-associes-sci","on":true},{"id":"personne-physique-sci","on":true},{"id":"nb-personnes-foyer","on":true},{"id":"composition-menage","on":true},{"id":"nb-personnes-charge","on":true},{"id":"rfr-foyer","on":true},{"id":"rfr-zero-motif","on":true},{"id":"nb-avis-imposition","on":true},{"id":"rfr-n2","on":true},{"id":"csp-reference","on":true},{"id":"situations-foyer","on":true},{"id":"impayes-charges","on":true},{"id":"accord-visite","on":true},{"id":"curatelle-tutelle","on":true},{"id":"coordonnees-representant","on":true},{"id":"situation-sociale","on":true},{"id":"importance-travaux","on":false},{"id":"etat-parties-communes","on":false},{"id":"securite-parties-communes","on":false},{"id":"usage-lot","on":true},{"id":"lot-parent","on":true},{"id":"type-occupation","on":true},{"id":"nb-habitants","on":true},{"id":"type-residence","on":true},{"id":"mode-location","on":true},{"id":"commodat","on":true},{"id":"associes-occupants","on":true},{"id":"indivisaires-occupants","on":true},{"id":"projet-vente","on":true},{"id":"associes-exploitants","on":true},{"id":"demembrement","on":true},{"id":"nb-fenetres","on":true},{"id":"nb-simple-vitrage","on":true},{"id":"nb-occultations","on":true},{"id":"nb-occultations-origine","on":true},{"id":"nb-stores","on":true},{"id":"changement-menuiseries","on":true},{"id":"type-chauffage","on":true},{"id":"energie-chauffage","on":true},{"id":"date-chaudiere","on":true},{"id":"type-ecs","on":true},{"id":"energie-ecs","on":true},{"id":"emetteurs-chauffage","on":true},{"id":"nb-radiateurs","on":true},{"id":"regulation-radiateurs","on":true},{"id":"pathologies","on":true},{"id":"difficultes-logement","on":true},{"id":"inconforts","on":true},{"id":"duree-occupation","on":false},{"id":"tranches-age","on":false},{"id":"csp","on":false},{"id":"ressenti-ete","on":false},{"id":"ressenti-hiver","on":false},{"id":"confort-phonique","on":false},{"id":"detecteurs","on":false},{"id":"projet-travaux","on":false}]$json$::jsonb, 'brouillon' from coproprietes c
where c.slug = 'test-le-clos-des-brasseurs' and not exists (select 1 from enquetes e where e.copro_id = c.id);

commit;

-- @@BLOC 5 LES TERRASSES DU NEUDORF : PF définitif validé, copropriétaires, lots, tantièmes
begin;

-- PF définitif validé (comme useValiderPlanDefinitif)
do $$
declare
  v_copro uuid;
begin
  select id into v_copro from coproprietes where slug = 'test-les-terrasses-du-neudorf';
  if v_copro is null then
    raise exception 'Copropriété test-les-terrasses-du-neudorf absente - jouer le bloc 0 d''abord.';
  end if;
  if exists (select 1 from plans_definitifs where copro_id = v_copro) then
    raise notice 'PF déjà présent - bloc PF sauté.';
    return;
  end if;
  insert into plans_definitifs (copro_id, nom, data, resultat, statut, source_fichier, version, valide_le, updated_by)
  values (
    v_copro,
    'PF définitif - Les Terrasses du Neudorf',
    $json${"infos":{"nomCopro":"LES TERRASSES DU NEUDORF","adresse":"14 rue de Lausanne 67100 Strasbourg","nbLogements":30,"nbLogementsEquiv":30,"surfaceHabitable":2040,"nbEtages":5,"nbEntrees":2,"typeChauffage":"Chauffage urbain","cepInitial":308,"cepProjet":148,"dispositifClimaxion":true,"etiquetteInitiale":"F","etiquetteProjet":"C"},"lots":[{"numero":1,"titre":"Isolation thermique par l'exterieur","entreprise":"FACADES DE L'ILL","remisePct":0,"lignes":[{"retenu":true,"tvaPct":5.5,"montantHt":36300,"designation":"Echafaudage"},{"retenu":true,"tvaPct":5.5,"montantHt":185000,"designation":"Isolation thermique par l'exterieur en laine de roche 180 mm"},{"retenu":true,"tvaPct":5.5,"montantHt":24400,"designation":"Traitement des balcons"},{"retenu":true,"tvaPct":5.5,"montantHt":17200,"designation":"Garde-corps"},{"retenu":true,"tvaPct":5.5,"montantHt":7400,"designation":"Bandeaux et departs"},{"retenu":false,"tvaPct":10,"montantHt":4300,"designation":"Soubassement"},{"retenu":false,"tvaPct":10,"montantHt":5300,"designation":"Peinture des parties communes"}]},{"numero":2,"titre":"Toiture terrasse","entreprise":"TOITURES DU RIED","remisePct":0,"lignes":[{"retenu":true,"tvaPct":5.5,"montantHt":13100,"designation":"Depose des complexes existants"},{"retenu":true,"tvaPct":5.5,"montantHt":47300,"designation":"Isolation polyurethane 200 mm et etancheite bicouche"},{"retenu":true,"tvaPct":5.5,"montantHt":9800,"designation":"Releves, acroteres et couvertines"},{"retenu":false,"tvaPct":10,"montantHt":5600,"designation":"Reprise des edicules et sorties de toiture"}]},{"numero":3,"titre":"Sous-station et reseaux","entreprise":"THERMIC EST","remisePct":0,"lignes":[{"retenu":true,"tvaPct":5.5,"montantHt":45000,"designation":"Renovation de la sous-station de chauffage urbain"},{"retenu":true,"tvaPct":5.5,"montantHt":8900,"designation":"Calorifugeage des reseaux"},{"retenu":true,"tvaPct":5.5,"montantHt":12400,"designation":"Robinets thermostatiques et equilibrage"},{"retenu":false,"tvaPct":10,"montantHt":3200,"designation":"Reprise du conduit de fumee"}]},{"numero":4,"titre":"Ventilation","entreprise":"AIRFLUX ALSACE","remisePct":0,"lignes":[{"retenu":true,"tvaPct":5.5,"montantHt":7900,"designation":"Caissons d'extraction hygroreglables"},{"retenu":true,"tvaPct":5.5,"montantHt":9300,"designation":"Gaines, bouches d'extraction et entrees d'air"},{"retenu":true,"tvaPct":5.5,"montantHt":2900,"designation":"Carottages et calfeutrements"}]}],"moe":[{"phase":"etude","tvaPct":20,"montant":{"mode":"forfait","montantHt":1500},"entreprise":"STRAT ECO","designation":"Assistance Maitrise d'Ouvrage (phase conseil)","commentaire":"Phase conseil, assistance technique et approche financiere","eligibleMprAmo":true,"eligibleMprEtudes":false},{"phase":"etude","tvaPct":10,"montant":{"mode":"forfait","montantHt":5500},"entreprise":"ARCHILOGIS","designation":"Maitrise d'oeuvre phase etudes (DIAG-AVP)","commentaire":"Etude, avant-projet","eligibleMprAmo":false,"eligibleMprEtudes":true},{"phase":"etude","tvaPct":20,"montant":{"mode":"forfait","montantHt":900},"entreprise":"EST THERMO CONSEIL","designation":"Audit reglementaire","commentaire":"Mise a jour","eligibleMprAmo":false,"eligibleMprEtudes":false},{"phase":"etude","tvaPct":20,"montant":{"mode":"forfait","montantHt":3200},"entreprise":"DIAG EXPERT 67","designation":"Diagnostic amiante avant travaux","eligibleMprAmo":false,"eligibleMprEtudes":false},{"phase":"projet","tvaPct":20,"montant":{"mode":"forfait","montantHt":3800},"entreprise":"STRAT ECO","designation":"Assistance Maitrise d'Ouvrage (phase projet)","commentaire":"Prestation obligatoire, assistance projet, administrative, financiere","eligibleMprAmo":true,"eligibleMprEtudes":false},{"phase":"projet","tvaPct":10,"montant":{"mode":"forfait","montantHt":26900},"entreprise":"ARCHILOGIS","designation":"Maitrise d'oeuvre phase conception (PRO-DCE)","commentaire":"Cahiers des charges, depot de DP, DCE","eligibleMprAmo":false,"eligibleMprEtudes":true},{"phase":"projet","tvaPct":20,"montant":{"mode":"forfait","montantHt":1800},"designation":"Controle technique","commentaire":"Prestations necessaires","eligibleMprAmo":false,"eligibleMprEtudes":true},{"phase":"projet","tvaPct":20,"montant":{"mode":"forfait","montantHt":1100},"designation":"CSPS","commentaire":"Prestations necessaires","eligibleMprAmo":false,"eligibleMprEtudes":true},{"phase":"projet","tvaPct":20,"montant":{"mode":"forfait","montantHt":600},"entreprise":"AERO TEST","designation":"Test d'etancheite a l'air avant travaux","commentaire":"Obligation Climaxion","eligibleMprAmo":false,"eligibleMprEtudes":false},{"phase":"projet","tvaPct":20,"montant":{"mode":"forfait","montantHt":1800},"entreprise":"ARCHILOGIS","designation":"Memoire technique Climaxion","eligibleMprAmo":false,"eligibleMprEtudes":false},{"phase":"travaux","tvaPct":20,"montant":{"mode":"forfait","montantHt":6800},"entreprise":"STRAT ECO","designation":"Assistance Maitrise d'Ouvrage (phase travaux)","commentaire":"Prestation obligatoire, assistance projet, administrative, financiere","eligibleMprAmo":true,"eligibleMprEtudes":false},{"phase":"travaux","tvaPct":5.5,"montant":{"mode":"pctTravauxHt","taux":3.7},"entreprise":"ARCHILOGIS","designation":"Maitrise d'oeuvre phase travaux","commentaire":"Pilotage et reception des travaux","eligibleMprAmo":false,"eligibleMprEtudes":true},{"phase":"travaux","tvaPct":20,"montant":{"mode":"forfait","montantHt":3900},"designation":"Controle technique","commentaire":"Prestations necessaires","eligibleMprAmo":false,"eligibleMprEtudes":true},{"phase":"travaux","tvaPct":20,"montant":{"mode":"forfait","montantHt":2000},"designation":"CSPS","commentaire":"Prestations necessaires","eligibleMprAmo":false,"eligibleMprEtudes":true},{"phase":"travaux","tvaPct":20,"montant":{"mode":"forfait","montantHt":600},"entreprise":"AERO TEST","designation":"Test d'etancheite a l'air apres travaux","commentaire":"Obligation Climaxion","eligibleMprAmo":false,"eligibleMprEtudes":false},{"phase":"travaux","tvaPct":0,"montant":{"mode":"pctTravauxTtc","taux":2},"entreprise":"ASSURANCES DU RHIN","designation":"Dommage ouvrage","commentaire":"Obligatoire","eligibleMprAmo":false,"eligibleMprEtudes":false},{"phase":"travaux","tvaPct":20,"montant":{"mode":"pctTravauxHt","taux":2.5},"entreprise":"SYNDIC TEST PARCOURS","designation":"Honoraires syndic","commentaire":"Selon informations du syndic","eligibleMprAmo":false,"eligibleMprEtudes":false}],"aides":[{"id":"cee-fiche-par-fiche","groupe":"CEE","libelle":"CEE fiche par fiche","publique":false,"calcul":{"mode":"manuel","montant":22500},"commentaire":"Depend des lots de travaux energetiques et de la surface habitable"},{"id":"maprimerenov-partie-travaux","groupe":"ANAH","libelle":"Maprimerenov' partie travaux","publique":true,"calcul":{"mode":"pctAssietteTravaux","taux":45,"coef":1},"commentaire":"45 % du montant des travaux energetiques HT - plafonne a 11250 EUR par logement"},{"id":"maprimerenov-partie-etudes","groupe":"ANAH","libelle":"Maprimerenov' partie etudes","publique":true,"calcul":{"mode":"pctEtudes","taux":45,"coef":0.9},"commentaire":"45 % du montant des etudes, diags, maitrise d'oeuvre HT"},{"id":"maprimerenov-amo","groupe":"ANAH","libelle":"Maprimerenov' AMO","publique":true,"calcul":{"mode":"pctAmo","taux":50},"commentaire":"50 % du montant de la prestation d'assistance a maitrise d'ouvrage HT"},{"id":"maprimerenov-individuelle","groupe":"ANAH","libelle":"Maprimerenov' individuelle","publique":true,"calcul":{"mode":"info"},"commentaire":"Aide individuelle de 1500 EUR ou de 3000 EUR selon revenus du coproprietaire occupant"},{"id":"climaxion-aide-travaux","groupe":"Climaxion","libelle":"Climaxion aide travaux","publique":true,"calcul":{"mode":"forfaitPlusParLogement","base":10000,"parLogement":2500,"surEquivalent":true},"commentaire":"Dispositif Climaxion sous reserve d'eligibilite"},{"id":"climaxion-aide-amo","groupe":"Climaxion","libelle":"Climaxion aide AMO","publique":true,"calcul":{"mode":"manuel","montant":4000},"commentaire":"Aide Climaxion sur la prestation AMO"},{"id":"ems-aide-travaux","groupe":"EMS","libelle":"EMS aide travaux","publique":true,"calcul":{"mode":"parLogement","montant":1000,"surEquivalent":true},"commentaire":"Dispositif Eurometropole de Strasbourg suivant le cahier des charges Climaxion"},{"id":"ems-aide-moe","groupe":"EMS","libelle":"EMS aide MOE","publique":true,"calcul":{"mode":"manuel","montant":3000},"commentaire":"Dispositif EMS pour la maitrise d'oeuvre"}],"params":{"imprevusPct":7,"plafondTravauxParLogement":25000,"plafondMprParLogement":11250,"fondsTravaux":36000,"totalTantiemes":10000,"tantiemesExemples":[260,340,470],"dureeEcoPtzAns":20,"coefAssurance":1.036,"tauxPretAvancePct":5.45,"pctAvanceAides":70,"plafondAmoParLogement":600,"commentaireFondsTravaux":"Fonds travaux loi ALUR mobilise au vote des travaux"},"variantes":{"collectif":true,"collectifSansAvance":false,"individuel":true},"repartitionCles":{}}$json$::jsonb,
    $json${"performancePct":51.94805194805195,"lots":[{"numero":1,"titre":"Isolation thermique par l'exterieur","entreprise":"FACADES DE L'ILL","totalHt":279900,"remise":0,"totalHtApresRemise":279900,"totalHtRetenu":270300,"tvaParTaux":[{"taux":10,"montant":960},{"taux":5.5,"montant":14866.5}],"totalTtc":295726.5},{"numero":2,"titre":"Toiture terrasse","entreprise":"TOITURES DU RIED","totalHt":75800,"remise":0,"totalHtApresRemise":75800,"totalHtRetenu":70200,"tvaParTaux":[{"taux":10,"montant":560},{"taux":5.5,"montant":3861}],"totalTtc":80221},{"numero":3,"titre":"Sous-station et reseaux","entreprise":"THERMIC EST","totalHt":69500,"remise":0,"totalHtApresRemise":69500,"totalHtRetenu":66300,"tvaParTaux":[{"taux":10,"montant":320},{"taux":5.5,"montant":3646.5}],"totalTtc":73466.5},{"numero":4,"titre":"Ventilation","entreprise":"AIRFLUX ALSACE","totalHt":20100,"remise":0,"totalHtApresRemise":20100,"totalHtRetenu":20100,"tvaParTaux":[{"taux":5.5,"montant":1105.5}],"totalTtc":21205.5}],"totalTravauxHt":445300,"travauxRetenusHt":426900,"assietteMprTravaux":426900,"plafondAssiette":750000,"totalTravauxTtc":470619.5,"totalTravauxTtcImprevus":503562.86500000005,"moe":[{"designation":"Assistance Maitrise d'Ouvrage (phase conseil)","entreprise":"STRAT ECO","phase":"etude","montantHt":1500,"montantTtc":1800},{"designation":"Maitrise d'oeuvre phase etudes (DIAG-AVP)","entreprise":"ARCHILOGIS","phase":"etude","montantHt":5500,"montantTtc":6050.000000000001},{"designation":"Audit reglementaire","entreprise":"EST THERMO CONSEIL","phase":"etude","montantHt":900,"montantTtc":1080},{"designation":"Diagnostic amiante avant travaux","entreprise":"DIAG EXPERT 67","phase":"etude","montantHt":3200,"montantTtc":3840},{"designation":"Assistance Maitrise d'Ouvrage (phase projet)","entreprise":"STRAT ECO","phase":"projet","montantHt":3800,"montantTtc":4560},{"designation":"Maitrise d'oeuvre phase conception (PRO-DCE)","entreprise":"ARCHILOGIS","phase":"projet","montantHt":26900,"montantTtc":29590.000000000004},{"designation":"Controle technique","phase":"projet","montantHt":1800,"montantTtc":2160},{"designation":"CSPS","phase":"projet","montantHt":1100,"montantTtc":1320},{"designation":"Test d'etancheite a l'air avant travaux","entreprise":"AERO TEST","phase":"projet","montantHt":600,"montantTtc":720},{"designation":"Memoire technique Climaxion","entreprise":"ARCHILOGIS","phase":"projet","montantHt":1800,"montantTtc":2160},{"designation":"Assistance Maitrise d'Ouvrage (phase travaux)","entreprise":"STRAT ECO","phase":"travaux","montantHt":6800,"montantTtc":8160},{"designation":"Maitrise d'oeuvre phase travaux","entreprise":"ARCHILOGIS","phase":"travaux","montantHt":16476.1,"montantTtc":17382.285499999998},{"designation":"Controle technique","phase":"travaux","montantHt":3900,"montantTtc":4680},{"designation":"CSPS","phase":"travaux","montantHt":2000,"montantTtc":2400},{"designation":"Test d'etancheite a l'air apres travaux","entreprise":"AERO TEST","phase":"travaux","montantHt":600,"montantTtc":720},{"designation":"Dommage ouvrage","entreprise":"ASSURANCES DU RHIN","phase":"travaux","montantHt":9412.39,"montantTtc":9412.39},{"designation":"Honoraires syndic","entreprise":"SYNDIC TEST PARCOURS","phase":"travaux","montantHt":11132.5,"montantTtc":13359}],"totalMoeTtc":109393.6755,"totalOperationTtc":612956.5405,"totalPhaseTravauxTtc":559676.5405,"aides":[{"id":"cee-fiche-par-fiche","groupe":"CEE","libelle":"CEE fiche par fiche","montant":22500,"publique":false,"commentaire":"Depend des lots de travaux energetiques et de la surface habitable"},{"id":"maprimerenov-partie-travaux","groupe":"ANAH","libelle":"Maprimerenov' partie travaux","montant":192105,"publique":true,"commentaire":"45 % du montant des travaux energetiques HT - plafonne a 11250 EUR par logement"},{"id":"maprimerenov-partie-etudes","groupe":"ANAH","libelle":"Maprimerenov' partie etudes","montant":22393.623335841006,"publique":true,"commentaire":"45 % du montant des etudes, diags, maitrise d'oeuvre HT"},{"id":"maprimerenov-amo","groupe":"ANAH","libelle":"Maprimerenov' AMO","montant":6050,"publique":true,"commentaire":"50 % du montant de la prestation d'assistance a maitrise d'ouvrage HT"},{"id":"maprimerenov-individuelle","groupe":"ANAH","libelle":"Maprimerenov' individuelle","montant":null,"publique":true,"commentaire":"Aide individuelle de 1500 EUR ou de 3000 EUR selon revenus du coproprietaire occupant"},{"id":"climaxion-aide-travaux","groupe":"Climaxion","libelle":"Climaxion aide travaux","montant":85000,"publique":true,"commentaire":"Dispositif Climaxion sous reserve d'eligibilite"},{"id":"climaxion-aide-amo","groupe":"Climaxion","libelle":"Climaxion aide AMO","montant":4000,"publique":true,"commentaire":"Aide Climaxion sur la prestation AMO"},{"id":"ems-aide-travaux","groupe":"EMS","libelle":"EMS aide travaux","montant":30000,"publique":true,"commentaire":"Dispositif Eurometropole de Strasbourg suivant le cahier des charges Climaxion"},{"id":"ems-aide-moe","groupe":"EMS","libelle":"EMS aide MOE","montant":3000,"publique":true,"commentaire":"Dispositif EMS pour la maitrise d'oeuvre"}],"totalAides":365048.623335841,"totalAidesPubliques":342548.623335841,"primeCee":22500,"tauxCouverture":0.5955538430800723,"resteACharge":211907.917164159,"coutTantiemeAvant":61.29565405,"collectif":{"resteAFinancer":234407.917164159,"coutTantiemeApres":23.4407917164159,"exemples":[{"tantiemes":260,"quotePartAvant":15936.870052999999,"resteAFinancer":6094.605846268134,"mensualiteEcoPtz":26.308381903057445,"subventionsPubliques":8906.264206731865,"coutPretAvance":485.39139926688665,"primeCee":585,"prixRevient":5994.997245535021},{"tantiemes":340,"quotePartAvant":20840.522377,"resteAFinancer":7969.869183581407,"mensualiteEcoPtz":34.40326864245974,"subventionsPubliques":11646.653193418595,"coutPretAvance":634.7425990413134,"primeCee":765,"prixRevient":7839.61178262272},{"tantiemes":470,"quotePartAvant":28808.9574035,"resteAFinancer":11017.172106715474,"mensualiteEcoPtz":47.55745959398846,"subventionsPubliques":16099.785296784527,"coutPretAvance":877.4382986747567,"primeCee":1057.5,"prixRevient":10837.11040539023}]},"collectifSansAvance":{"resteAFinancer":234407.917164159,"coutTantiemeApres":23.4407917164159,"exemples":[{"tantiemes":260,"quotePartAvant":15936.870052999999,"resteAFinancer":6094.605846268134,"mensualiteEcoPtz":26.308381903057445,"subventionsPubliques":8906.264206731865,"primeCee":585,"prixRevient":5509.605846268134},{"tantiemes":340,"quotePartAvant":20840.522377,"resteAFinancer":7969.869183581407,"mensualiteEcoPtz":34.40326864245974,"subventionsPubliques":11646.653193418595,"primeCee":765,"prixRevient":7204.869183581407},{"tantiemes":470,"quotePartAvant":28808.9574035,"resteAFinancer":11017.172106715474,"mensualiteEcoPtz":47.55745959398846,"subventionsPubliques":16099.785296784527,"primeCee":1057.5,"prixRevient":9959.672106715474}]},"individuel":{"aidesAvancees":239784.0363350887,"aidesFinChantier":102764.5870007523,"appelsFonds":337172.50416491134,"coutTantiemeApresAides":21.1907917164159,"coutTantiemeAvecAvance":33.71725041649113,"exemples":[{"tantiemes":260,"quotePartAvant":15936.870053,"prixRevient":5509.605846268134,"appelsFonds":8766.485108287694,"remboursementFinChantier":3256.87926201956,"mensualiteEcoPtz":37.84199405077522},{"tantiemes":340,"quotePartAvant":20840.522377,"prixRevient":7204.869183581406,"appelsFonds":11463.865141606986,"remboursementFinChantier":4258.995958025579,"mensualiteEcoPtz":49.485684527936826},{"tantiemes":470,"quotePartAvant":28808.9574035,"prixRevient":9959.672106715474,"appelsFonds":15847.107695750832,"remboursementFinChantier":5887.435589035359,"mensualiteEcoPtz":68.40668155332442}]},"gardeFous":[{"libelle":"Plafond travaux < 25 K€/logt","valeur":14230,"plafond":25000,"ok":true},{"libelle":"MPR travaux < 11 250 €/logt","valeur":6403.5,"plafond":11250,"ok":true},{"libelle":"AMO < 600 €/logt","valeur":403.3333333333333,"plafond":600,"ok":true}]}$json$::jsonb,
    'valide',
    null,
    1,
    now() - interval '45 days',
    (select id from auth.users where email = 'amir@strateco.fr' limit 1)
  );
  update coproprietes
  set gain_pct = 51.9,
      energy_before = 'F',
      energy_after = 'C'
  where id = v_copro;
end $$;

-- Onglet Données : clé de répartition, copropriétaires, lots, tantièmes
do $$
declare
  v_copro uuid;
  v_cle uuid;
  r record;
  v_cp uuid;
  v_bat uuid;
  v_parent uuid;
  v_lot uuid;
begin
  select id into v_copro from coproprietes where slug = 'test-les-terrasses-du-neudorf';
  if v_copro is null then return; end if;
  if exists (select 1 from lots where copro_id = v_copro) then
    raise notice 'Lots déjà présents - bloc données sauté.';
    return;
  end if;

  insert into cles_repartition (copro_id, code, label, is_default)
  values (v_copro, 'MUN', 'Tantièmes généraux', true)
  on conflict do nothing;
  select id into v_cle from cles_repartition where copro_id = v_copro and code = 'MUN';

  for r in
    select * from (values
      ('SCI VAUTRIN PATRIMOINE', 'bailleur', null, '06 48 85 97 98', '6 rue de la Republique, 69002 Lyon'),
      ('Bernard et Josiane GRANDJEAN', 'bailleur', null, '06 15 65 62 86', '4 rue de Metz, 54520 Laxou'),
      ('Julie HENRY', 'occupant', null, null, '14 rue de Lausanne, 67100 Strasbourg'),
      ('Amina et Jean REMY', 'occupant', null, null, '14 rue de Lausanne, 67100 Strasbourg'),
      ('Mehdi JACQUOT', 'occupant', null, null, '14 rue de Lausanne, 67100 Strasbourg'),
      ('Catherine et Nicolas GRANDJEAN', 'occupant', null, null, '14 rue de Lausanne, 67100 Strasbourg'),
      ('Laurent ROLIN', 'occupant', null, null, '14 rue de Lausanne, 67100 Strasbourg'),
      ('Nadia et Lucas MASSON', 'occupant', null, '06 19 23 73 56', '14 rue de Lausanne, 67100 Strasbourg'),
      ('Christophe SCHMITT', 'occupant', null, null, null),
      ('Nathalie WEBER', 'occupant', null, null, '14 rue de Lausanne, 67100 Strasbourg'),
      ('Mehdi KLEIN', 'occupant', null, '06 31 74 76 40', '14 rue de Lausanne, 67100 Strasbourg'),
      ('Martine MULLER', 'occupant', null, '03 56 99 79 48', '14 rue de Lausanne, 67100 Strasbourg'),
      ('Claire et Vincent BENALI', 'occupant', null, null, null),
      ('Jean HADDAD', 'occupant', null, '03 34 40 85 66', null),
      ('Christophe et Lea DA COSTA', 'occupant', null, '06 12 69 46 17', '14 rue de Lausanne, 67100 Strasbourg'),
      ('Emilie FERREIRA', 'occupant', null, null, null),
      ('Mehdi NGUYEN', 'occupant', null, null, '14 rue de Lausanne, 67100 Strasbourg'),
      ('Manon TRAN', 'occupant', null, '06 21 54 66 96', null),
      ('Laurent ROSSI', 'occupant', null, '03 42 24 72 96', '14 rue de Lausanne, 67100 Strasbourg'),
      ('Chloe BIANCHI', 'occupant', null, '06 43 18 68 19', '14 rue de Lausanne, 67100 Strasbourg'),
      ('Christophe et Monique LEFEVRE', 'occupant', null, '06 65 20 74 49', '14 rue de Lausanne, 67100 Strasbourg'),
      ('Maxime GAUTHIER', 'occupant', null, '06 89 43 88 49', null),
      ('Mehdi DUPONT', 'bailleur', null, '03 34 90 45 52', '9 rue Serpenoise, 57000 Metz'),
      ('Camille et Jean MOREAU', 'occupant', null, '06 43 58 22 41', null),
      ('Monique et Alain GIRARD', 'occupant', null, '06 11 49 69 90', null),
      ('Jean et Chloe ROBERT', 'occupant', null, '03 77 49 40 60', null),
      ('Christophe FOURNIER', 'occupant', null, null, null),
      ('Maxime et Catherine LAMBERT', 'occupant', null, '06 85 80 48 30', null)
    ) as t(nom, type, email, telephone, adresse)
  loop
    insert into coproprietaires (copro_id, nom, type, email, telephone, adresse)
    values (v_copro, r.nom, r.type, r.email, r.telephone, r.adresse);
  end loop;

  for r in
    select * from (values
      ('1', '01', 'SCI VAUTRIN PATRIMOINE', 'habitation', 326, null),
      ('2', '01', 'Bernard et Josiane GRANDJEAN', 'habitation', 238, null),
      ('3', '01', 'Julie HENRY', 'habitation', 414, null),
      ('4', '01', 'Amina et Jean REMY', 'habitation', 326, null),
      ('5', '01', 'Mehdi JACQUOT', 'habitation', 326, null),
      ('6', '01', 'Catherine et Nicolas GRANDJEAN', 'habitation', 238, null),
      ('7', '01', 'Laurent ROLIN', 'habitation', 414, null),
      ('8', '01', 'Nadia et Lucas MASSON', 'habitation', 326, null),
      ('9', '01', 'Christophe SCHMITT', 'habitation', 326, null),
      ('10', '01', 'Nathalie WEBER', 'habitation', 238, null),
      ('11', '01', 'Mehdi KLEIN', 'habitation', 414, null),
      ('12', '01', 'Martine MULLER', 'habitation', 326, null),
      ('13', '01', 'Claire et Vincent BENALI', 'habitation', 326, null),
      ('14', '01', 'Jean HADDAD', 'habitation', 238, null),
      ('15', '01', 'Christophe et Lea DA COSTA', 'habitation', 414, null),
      ('16', '01', 'SCI VAUTRIN PATRIMOINE', 'habitation', 326, null),
      ('17', '01', 'Bernard et Josiane GRANDJEAN', 'habitation', 326, null),
      ('18', '01', 'Emilie FERREIRA', 'habitation', 238, null),
      ('19', '01', 'Mehdi NGUYEN', 'habitation', 414, null),
      ('20', '01', 'Manon TRAN', 'habitation', 326, null),
      ('21', '01', 'Laurent ROSSI', 'habitation', 326, null),
      ('22', '01', 'Chloe BIANCHI', 'habitation', 238, null),
      ('23', '01', 'Christophe et Monique LEFEVRE', 'habitation', 414, null),
      ('24', '01', 'Maxime GAUTHIER', 'habitation', 326, null),
      ('25', '01', 'Mehdi DUPONT', 'habitation', 326, null),
      ('26', '01', 'Camille et Jean MOREAU', 'habitation', 238, null),
      ('27', '01', 'Monique et Alain GIRARD', 'habitation', 414, null),
      ('28', '01', 'Jean et Chloe ROBERT', 'habitation', 326, null),
      ('29', '01', 'Christophe FOURNIER', 'habitation', 326, null),
      ('30', '01', 'Maxime et Catherine LAMBERT', 'habitation', 238, null),
      ('31', '01', 'Maxime et Catherine LAMBERT', 'caves', 8, '30'),
      ('32', '01', 'Christophe FOURNIER', 'caves', 8, '29'),
      ('33', '01', 'Jean et Chloe ROBERT', 'caves', 8, '28'),
      ('34', '01', 'Monique et Alain GIRARD', 'caves', 8, '27'),
      ('35', '01', 'Camille et Jean MOREAU', 'caves', 8, '26'),
      ('36', '01', 'Mehdi DUPONT', 'caves', 8, '25'),
      ('37', '01', 'Maxime GAUTHIER', 'caves', 8, '24'),
      ('38', '01', 'Christophe et Monique LEFEVRE', 'caves', 8, '23'),
      ('39', '01', 'Chloe BIANCHI', 'caves', 8, '22'),
      ('40', '01', 'Laurent ROSSI', 'caves', 8, '21'),
      ('41', '01', 'Manon TRAN', 'caves', 7, '20'),
      ('42', '01', 'Mehdi NGUYEN', 'caves', 7, '19'),
      ('43', '01', 'Emilie FERREIRA', 'caves', 7, '18'),
      ('44', '01', 'Christophe et Lea DA COSTA', 'caves', 7, '15'),
      ('45', '01', 'Julie HENRY', 'garage', 20, '3'),
      ('46', '01', 'Amina et Jean REMY', 'garage', 20, '4'),
      ('47', '01', 'Mehdi JACQUOT', 'garage', 20, '5'),
      ('48', '01', 'Catherine et Nicolas GRANDJEAN', 'garage', 20, '6'),
      ('49', '01', 'Laurent ROLIN', 'garage', 20, '7'),
      ('50', '01', 'Nadia et Lucas MASSON', 'garage', 20, '8'),
      ('51', '01', 'Christophe SCHMITT', 'garage', 20, '9'),
      ('52', '01', 'Nathalie WEBER', 'garage', 20, '10'),
      ('53', '01', 'Mehdi KLEIN', 'garage', 20, '11'),
      ('54', '01', 'Martine MULLER', 'garage', 20, '12')
    ) as t(num, bat, nom, usage, tantiemes, parent_num)
    order by (parent_num is not null), num::int
  loop
    select id into v_cp from coproprietaires where copro_id = v_copro and nom = r.nom;
    select id into v_bat from batiments where copro_id = v_copro and code = r.bat;
    v_parent := null;
    if r.parent_num is not null then
      select id into v_parent from lots where copro_id = v_copro and num = r.parent_num;
    end if;
    insert into lots (copro_id, batiment_id, coproprietaire_id, num, usage, rattache_a)
    values (v_copro, v_bat, v_cp, r.num, r.usage::usage_lot, v_parent)
    returning id into v_lot;
    insert into lot_tantiemes (lot_id, cle_id, tantiemes) values (v_lot, v_cle, r.tantiemes);
  end loop;

end $$;

commit;

-- @@BLOC 6 LES TERRASSES DU NEUDORF : enquête, partage au portail, choix et adhésions
begin;

-- Enquête sociale envoyée + réponses transmises depuis le portail
do $$
declare
  v_copro uuid;
  v_enq uuid;
  v_verif uuid;
  r record;
  v_cp uuid;
  v_lots jsonb;
begin
  select id into v_copro from coproprietes where slug = 'test-les-terrasses-du-neudorf';
  if v_copro is null then return; end if;
  select id into v_enq from enquetes where copro_id = v_copro order by created_at limit 1;
  if v_enq is null then
    insert into enquetes (copro_id, questions, statut, sent_at, date_limite)
    values (v_copro, $json$[{"id":"nom","on":true},{"id":"telephone","on":true},{"id":"adresse","on":true},{"id":"email","on":true},{"id":"type-coproprietaire","on":true},{"id":"nb-indivisaires","on":true},{"id":"nb-associes-sci","on":true},{"id":"personne-physique-sci","on":true},{"id":"nb-personnes-foyer","on":true},{"id":"composition-menage","on":true},{"id":"nb-personnes-charge","on":true},{"id":"rfr-foyer","on":true},{"id":"rfr-zero-motif","on":true},{"id":"nb-avis-imposition","on":true},{"id":"rfr-n2","on":true},{"id":"csp-reference","on":true},{"id":"situations-foyer","on":true},{"id":"impayes-charges","on":true},{"id":"accord-visite","on":true},{"id":"curatelle-tutelle","on":true},{"id":"coordonnees-representant","on":true},{"id":"situation-sociale","on":true},{"id":"importance-travaux","on":false},{"id":"etat-parties-communes","on":false},{"id":"securite-parties-communes","on":false},{"id":"usage-lot","on":true},{"id":"lot-parent","on":true},{"id":"type-occupation","on":true},{"id":"nb-habitants","on":true},{"id":"type-residence","on":true},{"id":"mode-location","on":true},{"id":"commodat","on":true},{"id":"associes-occupants","on":true},{"id":"indivisaires-occupants","on":true},{"id":"projet-vente","on":true},{"id":"associes-exploitants","on":true},{"id":"demembrement","on":true},{"id":"nb-fenetres","on":true},{"id":"nb-simple-vitrage","on":true},{"id":"nb-occultations","on":true},{"id":"nb-occultations-origine","on":true},{"id":"nb-stores","on":true},{"id":"changement-menuiseries","on":true},{"id":"type-chauffage","on":true},{"id":"energie-chauffage","on":true},{"id":"date-chaudiere","on":true},{"id":"type-ecs","on":true},{"id":"energie-ecs","on":true},{"id":"emetteurs-chauffage","on":true},{"id":"nb-radiateurs","on":true},{"id":"regulation-radiateurs","on":true},{"id":"pathologies","on":true},{"id":"difficultes-logement","on":true},{"id":"inconforts","on":true},{"id":"duree-occupation","on":false},{"id":"tranches-age","on":false},{"id":"csp","on":false},{"id":"ressenti-ete","on":false},{"id":"ressenti-hiver","on":false},{"id":"confort-phonique","on":false},{"id":"detecteurs","on":false},{"id":"projet-travaux","on":false}]$json$::jsonb, 'envoyee', now() - interval '50 days', current_date + 21)
    returning id into v_enq;
  else
    update enquetes set statut = 'envoyee', sent_at = coalesce(sent_at, now() - interval '50 days') where id = v_enq;
  end if;
  if exists (select 1 from enquete_reponses where enquete_id = v_enq) then
    raise notice 'Réponses déjà présentes - bloc enquête sauté.';
    return;
  end if;
  select user_id into v_verif from profiles p join auth.users u on u.id = p.user_id where u.email = 'amir@strateco.fr' limit 1;

  for r in
    select * from (values
      ('Bernard et Josiane GRANDJEAN', $json${"nom":"Bernard et Josiane GRANDJEAN","telephone":"06 15 65 62 86","adresse":"4 rue de Metz, 54520 Laxou","email":"","type-coproprietaire":"Personne physique","nb-personnes-foyer":2,"composition-menage":"Couple sans enfant","nb-personnes-charge":0,"rfr-foyer":76470,"rfr-n2":78300,"accord-visite":"Oui","curatelle-tutelle":"Non","situation-sociale":"Non","importance-travaux":"Utiles"}$json$::jsonb, $json${"type-occupation":"Propriétaire bailleur (logement loué)","nb-habitants":2,"type-residence":"Résidence principale","commodat":"Non","projet-vente":"Je ne sais pas encore","demembrement":"Non","nb-fenetres":4,"nb-simple-vitrage":3,"nb-occultations":4,"nb-occultations-origine":2,"nb-stores":0,"changement-menuiseries":["Non, aucun changement récent"],"type-chauffage":"Collectif","energie-chauffage":"Réseau de chaleur","type-ecs":"Collectif","energie-ecs":"Même système que le chauffage","nb-radiateurs":6,"regulation-radiateurs":"Oui, sur tous les radiateurs","pathologies":["Aucune pathologie"],"inconforts":["Aucun inconfort particulier"]}$json$::jsonb, 2, 76470, 78300, 'bailleur', 'Rose', true, 1, true, 22),
      ('Julie HENRY', $json${"nom":"Julie HENRY","telephone":"","adresse":"14 rue de Lausanne, 67100 Strasbourg","email":"","type-coproprietaire":"Personne physique","nb-personnes-foyer":2,"composition-menage":"Famille monoparentale","nb-personnes-charge":1,"rfr-foyer":27460,"rfr-n2":26810,"accord-visite":"Oui","curatelle-tutelle":"Non","situation-sociale":"Non","importance-travaux":"Indispensables"}$json$::jsonb, $json${"type-occupation":"Propriétaire occupant","nb-habitants":2,"type-residence":"Résidence principale","commodat":"Non","projet-vente":"Non","demembrement":"Non","nb-fenetres":8,"nb-simple-vitrage":0,"nb-occultations":8,"nb-occultations-origine":8,"nb-stores":0,"changement-menuiseries":["Non, aucun changement récent"],"type-chauffage":"Collectif","energie-chauffage":"Réseau de chaleur","type-ecs":"Collectif","energie-ecs":"Même système que le chauffage","nb-radiateurs":7,"regulation-radiateurs":"Je ne sais pas","pathologies":["Aucune pathologie"],"inconforts":["Froid en hiver","Parois ou sols froids"]}$json$::jsonb, 2, 27460, 26810, 'occupant', 'Jaune', false, 3, true, 30),
      ('Amina et Jean REMY', $json${"nom":"Amina et Jean REMY","telephone":"","adresse":"14 rue de Lausanne, 67100 Strasbourg","email":"","type-coproprietaire":"Personne physique","nb-personnes-foyer":4,"composition-menage":"Couple avec enfant(s)","nb-personnes-charge":2,"rfr-foyer":24330,"rfr-n2":24030,"accord-visite":"Oui","curatelle-tutelle":"Non","situation-sociale":"Non","importance-travaux":"Peu utiles"}$json$::jsonb, $json${"type-occupation":"Propriétaire occupant","nb-habitants":4,"type-residence":"Résidence principale","commodat":"Non","projet-vente":"Je ne sais pas encore","demembrement":"Non","nb-fenetres":4,"nb-simple-vitrage":0,"nb-occultations":4,"nb-occultations-origine":2,"nb-stores":2,"changement-menuiseries":["Non, aucun changement récent"],"type-chauffage":"Collectif","energie-chauffage":"Réseau de chaleur","type-ecs":"Collectif","energie-ecs":"Même système que le chauffage","nb-radiateurs":7,"regulation-radiateurs":"Oui, sur une partie seulement","pathologies":["Aucune pathologie"],"inconforts":["Froid en hiver"]}$json$::jsonb, 4, 24330, 24030, 'occupant', 'Bleu', false, 6, true, 29),
      ('Mehdi JACQUOT', $json${"nom":"Mehdi JACQUOT","telephone":"","adresse":"14 rue de Lausanne, 67100 Strasbourg","email":"","type-coproprietaire":"Personne physique","nb-personnes-foyer":3,"composition-menage":"Famille monoparentale","nb-personnes-charge":2,"rfr-foyer":48310,"rfr-n2":48780,"accord-visite":"Oui, sous conditions (précisez)","curatelle-tutelle":"Non","situation-sociale":"Non","importance-travaux":"Utiles"}$json$::jsonb, $json${"type-occupation":"Propriétaire occupant","nb-habitants":3,"type-residence":"Résidence principale","commodat":"Non","projet-vente":"Non","demembrement":"Non","nb-fenetres":5,"nb-simple-vitrage":0,"nb-occultations":5,"nb-occultations-origine":5,"nb-stores":0,"changement-menuiseries":["Oui, les fenêtres"],"type-chauffage":"Collectif","energie-chauffage":"Réseau de chaleur","type-ecs":"Collectif","energie-ecs":"Même système que le chauffage","nb-radiateurs":7,"regulation-radiateurs":"Non","pathologies":["Fissures"],"inconforts":["Aucun inconfort particulier"]}$json$::jsonb, 3, 48310, 48780, 'occupant', 'Violet', true, 5, true, 23),
      ('Laurent ROLIN', $json${"nom":"Laurent ROLIN","telephone":"","adresse":"14 rue de Lausanne, 67100 Strasbourg","email":"","type-coproprietaire":"Personne physique","nb-personnes-foyer":1,"composition-menage":"Personne seule","nb-personnes-charge":0,"rfr-foyer":13170,"rfr-n2":12800,"accord-visite":"Oui","curatelle-tutelle":"Non","situation-sociale":"Non","importance-travaux":"Utiles"}$json$::jsonb, $json${"type-occupation":"Propriétaire occupant","nb-habitants":1,"type-residence":"Résidence principale","commodat":"Non","projet-vente":"Non","demembrement":"Non","nb-fenetres":6,"nb-simple-vitrage":5,"nb-occultations":6,"nb-occultations-origine":3,"nb-stores":0,"changement-menuiseries":["Non, aucun changement récent"],"type-chauffage":"Collectif","energie-chauffage":"Réseau de chaleur","type-ecs":"Collectif","energie-ecs":"Même système que le chauffage","nb-radiateurs":5,"regulation-radiateurs":"Je ne sais pas","pathologies":["Humidité / condensation"],"inconforts":["Froid en hiver","Courants d'air"]}$json$::jsonb, 1, 13170, 12800, 'occupant', 'Bleu', false, 4, true, 18),
      ('Nadia et Lucas MASSON', $json${"nom":"Nadia et Lucas MASSON","telephone":"06 19 23 73 56","adresse":"14 rue de Lausanne, 67100 Strasbourg","email":"","type-coproprietaire":"Personne physique","nb-personnes-foyer":3,"composition-menage":"Couple avec enfant(s)","nb-personnes-charge":1,"rfr-foyer":21940,"rfr-n2":21320,"accord-visite":"Oui, sous conditions (précisez)","curatelle-tutelle":"Non","situation-sociale":"Non","importance-travaux":"Indispensables"}$json$::jsonb, $json${"type-occupation":"Propriétaire occupant","nb-habitants":3,"type-residence":"Résidence principale","commodat":"Non","projet-vente":"Non","demembrement":"Non","nb-fenetres":6,"nb-simple-vitrage":0,"nb-occultations":6,"nb-occultations-origine":6,"nb-stores":0,"changement-menuiseries":["Oui, les fenêtres"],"type-chauffage":"Collectif","energie-chauffage":"Réseau de chaleur","type-ecs":"Collectif","energie-ecs":"Même système que le chauffage","nb-radiateurs":7,"regulation-radiateurs":"Non","pathologies":["Humidité / condensation"],"inconforts":["Chaleur excessive en été"]}$json$::jsonb, 3, 21940, 21320, 'occupant', 'Bleu', false, 3, true, 46),
      ('Christophe SCHMITT', $json${"nom":"Christophe SCHMITT","telephone":"","adresse":"14 rue de Lausanne, 67100 Strasbourg","email":"","type-coproprietaire":"Personne physique","nb-personnes-foyer":1,"composition-menage":"Personne seule","nb-personnes-charge":0,"rfr-foyer":19090,"rfr-n2":18280,"accord-visite":"Non","curatelle-tutelle":"Non","situation-sociale":"Non","importance-travaux":"Indispensables"}$json$::jsonb, $json${"type-occupation":"Propriétaire occupant","nb-habitants":1,"type-residence":"Résidence principale","commodat":"Non","projet-vente":"Non","demembrement":"Non","nb-fenetres":7,"nb-simple-vitrage":0,"nb-occultations":7,"nb-occultations-origine":7,"nb-stores":1,"changement-menuiseries":["Oui, les fenêtres"],"type-chauffage":"Collectif","energie-chauffage":"Réseau de chaleur","type-ecs":"Collectif","energie-ecs":"Même système que le chauffage","nb-radiateurs":4,"regulation-radiateurs":"Je ne sais pas","pathologies":["Aucune pathologie"],"inconforts":["Aucun inconfort particulier"]}$json$::jsonb, 1, 19090, 18280, 'occupant', 'Jaune', true, 7, true, 17),
      ('Mehdi KLEIN', $json${"nom":"Mehdi KLEIN","telephone":"06 31 74 76 40","adresse":"14 rue de Lausanne, 67100 Strasbourg","email":"","type-coproprietaire":"Personne physique","nb-personnes-foyer":3,"composition-menage":"Famille monoparentale","nb-personnes-charge":2,"rfr-foyer":23810,"rfr-n2":24520,"accord-visite":"Oui","curatelle-tutelle":"Non","situation-sociale":"Non","importance-travaux":"Utiles"}$json$::jsonb, $json${"type-occupation":"Propriétaire occupant","nb-habitants":3,"type-residence":"Résidence principale","commodat":"Non","projet-vente":"Non","demembrement":"Non","nb-fenetres":8,"nb-simple-vitrage":1,"nb-occultations":8,"nb-occultations-origine":8,"nb-stores":0,"changement-menuiseries":["Non, aucun changement récent"],"type-chauffage":"Collectif","energie-chauffage":"Réseau de chaleur","type-ecs":"Collectif","energie-ecs":"Même système que le chauffage","nb-radiateurs":6,"regulation-radiateurs":"Je ne sais pas","pathologies":["Aucune pathologie"],"inconforts":["Chaleur excessive en été"]}$json$::jsonb, 3, 23810, 24520, 'occupant', 'Bleu', false, 1, true, 24),
      ('Martine MULLER', $json${"nom":"Martine MULLER","telephone":"03 56 99 79 48","adresse":"14 rue de Lausanne, 67100 Strasbourg","email":"","type-coproprietaire":"Personne physique","nb-personnes-foyer":1,"composition-menage":"Personne seule","nb-personnes-charge":0,"rfr-foyer":22740,"rfr-n2":21820,"accord-visite":"Oui, sous conditions (précisez)","curatelle-tutelle":"Non","situation-sociale":"Non","importance-travaux":"Indispensables"}$json$::jsonb, $json${"type-occupation":"Propriétaire occupant","nb-habitants":1,"type-residence":"Résidence principale","commodat":"Non","projet-vente":"Je ne sais pas encore","demembrement":"Non","nb-fenetres":5,"nb-simple-vitrage":2,"nb-occultations":5,"nb-occultations-origine":1,"nb-stores":0,"changement-menuiseries":["Non, aucun changement récent"],"type-chauffage":"Collectif","energie-chauffage":"Réseau de chaleur","type-ecs":"Collectif","energie-ecs":"Même système que le chauffage","nb-radiateurs":5,"regulation-radiateurs":"Non","pathologies":["Humidité / condensation"],"inconforts":["Froid en hiver","Chaleur excessive en été"]}$json$::jsonb, 1, 22740, 21820, 'occupant', 'Violet', false, 4, true, 9),
      ('Jean HADDAD', $json${"nom":"Jean HADDAD","telephone":"03 34 40 85 66","adresse":"14 rue de Lausanne, 67100 Strasbourg","email":"","type-coproprietaire":"Personne physique","nb-personnes-foyer":2}$json$::jsonb, $json${"type-occupation":"Propriétaire occupant"}$json$::jsonb, null, null, null, 'occupant', null, false, 3, false, 19),
      ('Christophe et Lea DA COSTA', $json${"nom":"Christophe et Lea DA COSTA","telephone":"06 12 69 46 17","adresse":"14 rue de Lausanne, 67100 Strasbourg","email":"","type-coproprietaire":"Personne physique","nb-personnes-foyer":3,"composition-menage":"Couple avec enfant(s)","nb-personnes-charge":1,"rfr-foyer":33720,"rfr-n2":33420,"accord-visite":"Oui, sous conditions (précisez)","curatelle-tutelle":"Non","situation-sociale":"Non","importance-travaux":"Utiles"}$json$::jsonb, $json${"type-occupation":"Propriétaire occupant","nb-habitants":3,"type-residence":"Résidence principale","commodat":"Non","projet-vente":"Non","demembrement":"Non","nb-fenetres":7,"nb-simple-vitrage":0,"nb-occultations":7,"nb-occultations-origine":7,"nb-stores":0,"changement-menuiseries":["Oui, les fenêtres"],"type-chauffage":"Collectif","energie-chauffage":"Réseau de chaleur","type-ecs":"Collectif","energie-ecs":"Même système que le chauffage","nb-radiateurs":7,"regulation-radiateurs":"Je ne sais pas","pathologies":["Humidité / condensation"],"inconforts":["Froid en hiver","Chaleur excessive en été"]}$json$::jsonb, 3, 33720, 33420, 'occupant', 'Jaune', true, 3, true, 10),
      ('Emilie FERREIRA', $json${"nom":"Emilie FERREIRA","telephone":"","adresse":"14 rue de Lausanne, 67100 Strasbourg","email":"","type-coproprietaire":"Personne physique","nb-personnes-foyer":1,"composition-menage":"Personne seule","nb-personnes-charge":0,"rfr-foyer":29170,"rfr-n2":28600,"accord-visite":"Oui","curatelle-tutelle":"Non","situation-sociale":"Non","importance-travaux":"Indispensables"}$json$::jsonb, $json${"type-occupation":"Propriétaire occupant","nb-habitants":1,"type-residence":"Résidence principale","commodat":"Non","projet-vente":"Non","demembrement":"Non","nb-fenetres":8,"nb-simple-vitrage":0,"nb-occultations":8,"nb-occultations-origine":6,"nb-stores":0,"changement-menuiseries":["Oui, les fenêtres"],"type-chauffage":"Collectif","energie-chauffage":"Réseau de chaleur","type-ecs":"Collectif","energie-ecs":"Même système que le chauffage","nb-radiateurs":4,"regulation-radiateurs":"Non","pathologies":["Humidité / condensation"],"inconforts":["Aucun inconfort particulier"]}$json$::jsonb, 1, 29170, 28600, 'occupant', 'Violet', false, 3, true, 15),
      ('Mehdi NGUYEN', $json${"nom":"Mehdi NGUYEN","telephone":"","adresse":"14 rue de Lausanne, 67100 Strasbourg","email":"","type-coproprietaire":"Personne physique","nb-personnes-foyer":1,"composition-menage":"Personne seule","nb-personnes-charge":0,"rfr-foyer":24940,"rfr-n2":24430,"accord-visite":"Non","curatelle-tutelle":"Non","situation-sociale":"Non","importance-travaux":"Indispensables"}$json$::jsonb, $json${"type-occupation":"Propriétaire occupant","nb-habitants":1,"type-residence":"Résidence principale","commodat":"Non","projet-vente":"Non","demembrement":"Non","nb-fenetres":8,"nb-simple-vitrage":0,"nb-occultations":8,"nb-occultations-origine":6,"nb-stores":1,"changement-menuiseries":["Oui, les fenêtres"],"type-chauffage":"Collectif","energie-chauffage":"Réseau de chaleur","type-ecs":"Collectif","energie-ecs":"Même système que le chauffage","nb-radiateurs":5,"regulation-radiateurs":"Oui, sur tous les radiateurs","pathologies":["Moisissures"],"inconforts":["Froid en hiver","Chaleur excessive en été"]}$json$::jsonb, 1, 24940, 24430, 'occupant', 'Violet', false, 4, true, 32),
      ('Laurent ROSSI', $json${"nom":"Laurent ROSSI","telephone":"03 42 24 72 96","adresse":"14 rue de Lausanne, 67100 Strasbourg","email":"","type-coproprietaire":"Personne physique","nb-personnes-foyer":2,"composition-menage":"Famille monoparentale","nb-personnes-charge":1,"rfr-foyer":32210,"rfr-n2":32170,"accord-visite":"Oui","curatelle-tutelle":"Non","situation-sociale":"Non","importance-travaux":"Indispensables"}$json$::jsonb, $json${"type-occupation":"Propriétaire occupant","nb-habitants":2,"type-residence":"Résidence principale","commodat":"Non","projet-vente":"Non","demembrement":"Non","nb-fenetres":4,"nb-simple-vitrage":0,"nb-occultations":4,"nb-occultations-origine":4,"nb-stores":0,"changement-menuiseries":["Oui, les fenêtres"],"type-chauffage":"Collectif","energie-chauffage":"Réseau de chaleur","type-ecs":"Collectif","energie-ecs":"Même système que le chauffage","nb-radiateurs":6,"regulation-radiateurs":"Oui, sur tous les radiateurs","pathologies":["Humidité / condensation"],"inconforts":["Froid en hiver"]}$json$::jsonb, 2, 32210, 32170, 'occupant', 'Jaune', true, 2, true, 37),
      ('Chloe BIANCHI', $json${"nom":"Chloe BIANCHI","telephone":"06 43 18 68 19","adresse":"14 rue de Lausanne, 67100 Strasbourg","email":"","type-coproprietaire":"Personne physique","nb-personnes-foyer":2,"composition-menage":"Famille monoparentale","nb-personnes-charge":1,"rfr-foyer":44750,"rfr-n2":43400,"accord-visite":"Oui, sous conditions (précisez)","curatelle-tutelle":"Non","situation-sociale":"Non","importance-travaux":"Utiles"}$json$::jsonb, $json${"type-occupation":"Propriétaire occupant","nb-habitants":2,"type-residence":"Résidence principale","commodat":"Non","projet-vente":"Oui, après les travaux","demembrement":"Non","nb-fenetres":6,"nb-simple-vitrage":0,"nb-occultations":6,"nb-occultations-origine":6,"nb-stores":0,"changement-menuiseries":["Non, aucun changement récent"],"type-chauffage":"Collectif","energie-chauffage":"Réseau de chaleur","type-ecs":"Collectif","energie-ecs":"Même système que le chauffage","nb-radiateurs":5,"regulation-radiateurs":"Je ne sais pas","pathologies":["Humidité / condensation"],"inconforts":["Aucun inconfort particulier"]}$json$::jsonb, 2, 44750, 43400, 'occupant', 'Violet', true, 2, true, 16),
      ('Christophe et Monique LEFEVRE', $json${"nom":"Christophe et Monique LEFEVRE","telephone":"06 65 20 74 49","adresse":"14 rue de Lausanne, 67100 Strasbourg","email":"","type-coproprietaire":"Personne physique","nb-personnes-foyer":2,"composition-menage":"Couple sans enfant","nb-personnes-charge":0,"rfr-foyer":25840,"rfr-n2":26100,"accord-visite":"Oui","curatelle-tutelle":"Non","situation-sociale":"Non","importance-travaux":"Utiles"}$json$::jsonb, $json${"type-occupation":"Propriétaire occupant","nb-habitants":2,"type-residence":"Résidence principale","commodat":"Non","projet-vente":"Non","demembrement":"Non","nb-fenetres":7,"nb-simple-vitrage":6,"nb-occultations":7,"nb-occultations-origine":7,"nb-stores":0,"changement-menuiseries":["Non, aucun changement récent"],"type-chauffage":"Collectif","energie-chauffage":"Réseau de chaleur","type-ecs":"Collectif","energie-ecs":"Même système que le chauffage","nb-radiateurs":5,"regulation-radiateurs":"Oui, sur tous les radiateurs","pathologies":["Humidité / condensation"],"inconforts":["Aucun inconfort particulier"]}$json$::jsonb, 2, 25840, 26100, 'occupant', 'Jaune', true, 4, true, 24),
      ('Maxime GAUTHIER', $json${"nom":"Maxime GAUTHIER","telephone":"06 89 43 88 49","adresse":"14 rue de Lausanne, 67100 Strasbourg","email":"","type-coproprietaire":"Personne physique","nb-personnes-foyer":3,"composition-menage":"Famille monoparentale","nb-personnes-charge":2,"rfr-foyer":48030,"rfr-n2":47750,"accord-visite":"Oui","curatelle-tutelle":"Non","situation-sociale":"Non","importance-travaux":"Peu utiles"}$json$::jsonb, $json${"type-occupation":"Propriétaire occupant","nb-habitants":3,"type-residence":"Résidence principale","commodat":"Non","projet-vente":"Non","demembrement":"Non","nb-fenetres":6,"nb-simple-vitrage":0,"nb-occultations":6,"nb-occultations-origine":6,"nb-stores":0,"changement-menuiseries":["Non, aucun changement récent"],"type-chauffage":"Collectif","energie-chauffage":"Réseau de chaleur","type-ecs":"Collectif","energie-ecs":"Même système que le chauffage","nb-radiateurs":5,"regulation-radiateurs":"Oui, sur tous les radiateurs","pathologies":["Aucune pathologie"],"inconforts":["Froid en hiver"]}$json$::jsonb, 3, 48030, 47750, 'occupant', 'Violet', false, 5, true, 22),
      ('Mehdi DUPONT', $json${"nom":"Mehdi DUPONT","telephone":"03 34 90 45 52","adresse":"9 rue Serpenoise, 57000 Metz","email":"","type-coproprietaire":"Personne physique","nb-personnes-foyer":2,"composition-menage":"Famille monoparentale","nb-personnes-charge":1,"rfr-foyer":34820,"rfr-n2":35830,"accord-visite":"Oui","curatelle-tutelle":"Non","situation-sociale":"Non","importance-travaux":"Indispensables"}$json$::jsonb, $json${"type-occupation":"Propriétaire bailleur (logement loué)","nb-habitants":3,"type-residence":"Résidence principale","commodat":"Non","projet-vente":"Non","demembrement":"Non","nb-fenetres":6,"nb-simple-vitrage":0,"nb-occultations":6,"nb-occultations-origine":6,"nb-stores":3,"changement-menuiseries":["Non, aucun changement récent"],"type-chauffage":"Collectif","energie-chauffage":"Réseau de chaleur","type-ecs":"Collectif","energie-ecs":"Même système que le chauffage","nb-radiateurs":7,"regulation-radiateurs":"Je ne sais pas","pathologies":["Humidité / condensation"],"inconforts":["Chaleur excessive en été"]}$json$::jsonb, 2, 34820, 35830, 'bailleur', 'Violet', false, 6, true, 16),
      ('Monique et Alain GIRARD', $json${"nom":"Monique et Alain GIRARD","telephone":"06 11 49 69 90","adresse":"14 rue de Lausanne, 67100 Strasbourg","email":"","type-coproprietaire":"Personne physique","nb-personnes-foyer":4,"composition-menage":"Couple avec enfant(s)","nb-personnes-charge":2,"rfr-foyer":99240,"rfr-n2":97130,"accord-visite":"Oui","curatelle-tutelle":"Non","situation-sociale":"Non","importance-travaux":"Utiles"}$json$::jsonb, $json${"type-occupation":"Propriétaire occupant","nb-habitants":4,"type-residence":"Résidence principale","commodat":"Non","projet-vente":"Non","demembrement":"Non","nb-fenetres":8,"nb-simple-vitrage":0,"nb-occultations":8,"nb-occultations-origine":8,"nb-stores":3,"changement-menuiseries":["Oui, les fenêtres"],"type-chauffage":"Collectif","energie-chauffage":"Réseau de chaleur","type-ecs":"Collectif","energie-ecs":"Même système que le chauffage","nb-radiateurs":5,"regulation-radiateurs":"Oui, sur une partie seulement","pathologies":["Aucune pathologie"],"inconforts":["Froid en hiver"]}$json$::jsonb, 4, 99240, 97130, 'occupant', 'Rose', true, 1, true, 22),
      ('Jean et Chloe ROBERT', $json${"nom":"Jean et Chloe ROBERT","telephone":"03 77 49 40 60","adresse":"14 rue de Lausanne, 67100 Strasbourg","email":"","type-coproprietaire":"Personne physique","nb-personnes-foyer":4,"composition-menage":"Couple avec enfant(s)","nb-personnes-charge":2,"rfr-foyer":40240,"rfr-n2":39030,"accord-visite":"Oui","curatelle-tutelle":"Non","situation-sociale":"Non","importance-travaux":"Sans avis"}$json$::jsonb, $json${"type-occupation":"Propriétaire occupant","nb-habitants":4,"type-residence":"Résidence principale","commodat":"Non","projet-vente":"Non","demembrement":"Non","nb-fenetres":5,"nb-simple-vitrage":1,"nb-occultations":5,"nb-occultations-origine":3,"nb-stores":0,"changement-menuiseries":["Non, aucun changement récent"],"type-chauffage":"Collectif","energie-chauffage":"Réseau de chaleur","type-ecs":"Collectif","energie-ecs":"Même système que le chauffage","nb-radiateurs":4,"regulation-radiateurs":"Oui, sur une partie seulement","pathologies":["Aucune pathologie"],"inconforts":["Chaleur excessive en été"]}$json$::jsonb, 4, 40240, 39030, 'occupant', 'Jaune', false, 1, true, 33),
      ('Christophe FOURNIER', $json${"nom":"Christophe FOURNIER","telephone":"","adresse":"14 rue de Lausanne, 67100 Strasbourg","email":"","type-coproprietaire":"Personne physique","nb-personnes-foyer":1,"composition-menage":"Personne seule","nb-personnes-charge":0,"rfr-foyer":23090,"rfr-n2":22320,"accord-visite":"Oui","curatelle-tutelle":"Non","situation-sociale":"Non","importance-travaux":"Indispensables"}$json$::jsonb, $json${"type-occupation":"Propriétaire occupant","nb-habitants":1,"type-residence":"Résidence principale","commodat":"Non","projet-vente":"Oui, après les travaux","demembrement":"Non","nb-fenetres":7,"nb-simple-vitrage":0,"nb-occultations":7,"nb-occultations-origine":5,"nb-stores":2,"changement-menuiseries":["Non, aucun changement récent"],"type-chauffage":"Collectif","energie-chauffage":"Réseau de chaleur","type-ecs":"Collectif","energie-ecs":"Même système que le chauffage","nb-radiateurs":6,"regulation-radiateurs":"Oui, sur une partie seulement","pathologies":["Humidité / condensation"],"inconforts":["Froid en hiver"]}$json$::jsonb, 1, 23090, 22320, 'occupant', 'Violet', false, 2, true, 13),
      ('Maxime et Catherine LAMBERT', $json${"nom":"Maxime et Catherine LAMBERT","telephone":"06 85 80 48 30","adresse":"14 rue de Lausanne, 67100 Strasbourg","email":"","type-coproprietaire":"Personne physique","nb-personnes-foyer":4,"composition-menage":"Couple avec enfant(s)","nb-personnes-charge":2,"rfr-foyer":32400,"rfr-n2":32340,"accord-visite":"Non","curatelle-tutelle":"Non","situation-sociale":"Non","importance-travaux":"Utiles"}$json$::jsonb, $json${"type-occupation":"Propriétaire occupant","nb-habitants":4,"type-residence":"Résidence principale","commodat":"Non","projet-vente":"Non","demembrement":"Non","nb-fenetres":5,"nb-simple-vitrage":0,"nb-occultations":5,"nb-occultations-origine":5,"nb-stores":0,"changement-menuiseries":["Oui, les fenêtres"],"type-chauffage":"Collectif","energie-chauffage":"Réseau de chaleur","type-ecs":"Collectif","energie-ecs":"Même système que le chauffage","nb-radiateurs":4,"regulation-radiateurs":"Oui, sur tous les radiateurs","pathologies":["Fissures"],"inconforts":["Chaleur excessive en été","Parois ou sols froids"]}$json$::jsonb, 4, 32400, 32340, 'occupant', 'Bleu', false, 4, true, 31)
    ) as t(nom, copro, lot_hab, nb_personnes, rfr, rfr_n2, occupation, profil, verifie, jours_verif, complet, jours)
  loop
    select id into v_cp from coproprietaires where copro_id = v_copro and nom = r.nom;
    select coalesce(jsonb_object_agg(l.id::text,
      case l.usage
        when 'habitation' then jsonb_build_object('usage-lot', 'Habitation') || r.lot_hab
        when 'garage' then jsonb_build_object('usage-lot', 'Garage', 'lot-parent', l.rattache_a::text)
        when 'caves' then jsonb_build_object('usage-lot', 'Cave', 'lot-parent', l.rattache_a::text)
        else jsonb_build_object('usage-lot', 'Autre')
      end), '{}'::jsonb)
    into v_lots
    from lots l where l.coproprietaire_id = v_cp;

    insert into enquete_reponses (enquete_id, coproprietaire_id, nb_personnes, rfr, rfr_n2, statut_occupation, profil_mpr,
                                  profil_statut, profil_verifie_le, profil_verifie_par, reponses, updated_at)
    values (
      v_enq, v_cp, r.nb_personnes, r.rfr, r.rfr_n2, r.occupation, r.profil,
      case when r.verifie and v_verif is not null then 'verifie' else 'declaratif' end,
      case when r.verifie and v_verif is not null then now() - (r.jours_verif || ' days')::interval else null end,
      case when r.verifie and v_verif is not null then v_verif else null end,
      jsonb_build_object('copro', r.copro, 'lots', v_lots, 'complet', r.complet)
        || case when r.complet then jsonb_build_object('transmisLe', to_char(now() - (r.jours || ' days')::interval, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'attestation', true) else '{}'::jsonb end,
      now() - (r.jours || ' days')::interval
    );
  end loop;
end $$;

-- Partage du PF validé au portail : scénario pont + plans individuels (comme usePartagerPfCopros)
do $$
declare
  v_copro uuid;
  v_plan uuid;
  v_scen uuid;
  r record;
begin
  select id into v_copro from coproprietes where slug = 'test-les-terrasses-du-neudorf';
  if v_copro is null then return; end if;
  select id into v_plan from plans_definitifs where copro_id = v_copro and statut = 'valide' order by updated_at desc limit 1;
  if v_plan is null then
    raise exception 'PF définitif validé absent - jouer le bloc PF d''abord.';
  end if;
  if exists (select 1 from scenarios_financiers where plan_definitif_id = v_plan) then
    raise notice 'Scénario pont déjà présent - bloc partage sauté.';
    return;
  end if;
  insert into scenarios_financiers (copro_id, name, statut, locked, bareme_millesime, params, plan_definitif_id, created_at, updated_at)
  values (v_copro, 'PF définitif - Les Terrasses du Neudorf', 'partage', true, 2026, $json${"travaux":470619.5,"honoraires":109393.68,"aleas":32943.37,"cle":"MUN","totalCle":10000,"mprCoproPct":72.79,"bonusPassoire":false,"cee":22500,"fonds":36000,"profils":{"Bleu":0,"Jaune":0,"Violet":0,"Rose":0},"primeIndiv":{"Bleu":3000,"Jaune":2250,"Violet":1500,"Rose":0},"ecoPtz":true,"ecoPtzDuree":20,"ecoPtzPct":100,"avancePct":70,"pretComplActif":false,"pretComplDuree":12}$json$::jsonb, v_plan, now() - interval '40 days', now() - interval '40 days')
  returning id into v_scen;

  for r in
    select * from (values
      ('SCI VAUTRIN PATRIMOINE', 652, 39964.77, 1467, 24681.37, 13816.4),
      ('Bernard et Josiane GRANDJEAN', 564, 34570.75, 1269, 21350.14, 11951.61),
      ('Julie HENRY', 434, 26602.31, 976.5, 16429.01, 9196.8),
      ('Laurent ROLIN', 434, 26602.31, 976.5, 16429.01, 9196.8),
      ('Mehdi KLEIN', 434, 26602.31, 976.5, 16429.01, 9196.8),
      ('Christophe et Monique LEFEVRE', 422, 25866.77, 949.5, 15974.75, 8942.51),
      ('Monique et Alain GIRARD', 422, 25866.77, 949.5, 15974.75, 8942.51),
      ('Christophe et Lea DA COSTA', 421, 25805.47, 947.25, 15936.9, 8921.32),
      ('Mehdi NGUYEN', 421, 25805.47, 947.25, 15936.9, 8921.32),
      ('Amina et Jean REMY', 346, 21208.3, 778.5, 13097.78, 7332.01),
      ('Mehdi JACQUOT', 346, 21208.3, 778.5, 13097.78, 7332.01),
      ('Nadia et Lucas MASSON', 346, 21208.3, 778.5, 13097.78, 7332.01),
      ('Christophe SCHMITT', 346, 21208.3, 778.5, 13097.78, 7332.01),
      ('Martine MULLER', 346, 21208.3, 778.5, 13097.78, 7332.01),
      ('Laurent ROSSI', 334, 20472.75, 751.5, 12643.52, 7077.72),
      ('Maxime GAUTHIER', 334, 20472.75, 751.5, 12643.52, 7077.72),
      ('Mehdi DUPONT', 334, 20472.75, 751.5, 12643.52, 7077.72),
      ('Jean et Chloe ROBERT', 334, 20472.75, 751.5, 12643.52, 7077.72),
      ('Christophe FOURNIER', 334, 20472.75, 751.5, 12643.52, 7077.72),
      ('Manon TRAN', 333, 20411.45, 749.25, 12605.67, 7056.53),
      ('Claire et Vincent BENALI', 326, 19982.38, 733.5, 12340.69, 6908.2),
      ('Catherine et Nicolas GRANDJEAN', 258, 15814.28, 580.5, 9766.55, 5467.22),
      ('Nathalie WEBER', 258, 15814.28, 580.5, 9766.55, 5467.22),
      ('Chloe BIANCHI', 246, 15078.73, 553.5, 9312.3, 5212.93),
      ('Camille et Jean MOREAU', 246, 15078.73, 553.5, 9312.3, 5212.93),
      ('Maxime et Catherine LAMBERT', 246, 15078.73, 553.5, 9312.3, 5212.93),
      ('Emilie FERREIRA', 245, 15017.44, 551.25, 9274.44, 5191.74),
      ('Jean HADDAD', 238, 14588.37, 535.5, 9009.46, 5043.41)
    ) as t(nom, tantiemes, quote_part, cee_part, subv_coll_part, reste)
  loop
    insert into plans_individuels (scenario_id, coproprietaire_id, tantiemes, quote_part, mpr_indiv, cee_part, subv_coll_part, eco_ptz_part, reste, mensualite, detail)
    select v_scen, cp.id, r.tantiemes, r.quote_part, 0, r.cee_part, r.subv_coll_part, 0, r.reste, 0,
           jsonb_build_object('source', 'pf', 'planDefinitifId', v_plan)
    from coproprietaires cp where cp.copro_id = v_copro and cp.nom = r.nom;
  end loop;
end $$;

commit;

-- @@BLOC 7 LES BALCONS DE LA LAUCH : PF définitif validé, copropriétaires, lots, tantièmes
begin;

-- PF définitif validé (comme useValiderPlanDefinitif)
do $$
declare
  v_copro uuid;
begin
  select id into v_copro from coproprietes where slug = 'test-les-balcons-de-la-lauch';
  if v_copro is null then
    raise exception 'Copropriété test-les-balcons-de-la-lauch absente - jouer le bloc 0 d''abord.';
  end if;
  if exists (select 1 from plans_definitifs where copro_id = v_copro) then
    raise notice 'PF déjà présent - bloc PF sauté.';
    return;
  end if;
  insert into plans_definitifs (copro_id, nom, data, resultat, statut, source_fichier, version, valide_le, updated_by)
  values (
    v_copro,
    'PF définitif - Les Balcons de la Lauch',
    $json${"infos":{"nomCopro":"LES BALCONS DE LA LAUCH","adresse":"26 avenue de la République 68000 Colmar","nbLogements":30,"nbLogementsEquiv":30,"surfaceHabitable":2060,"nbEtages":5,"nbEntrees":2,"typeChauffage":"Gaz collectif","cepInitial":345,"cepProjet":118,"dispositifClimaxion":true,"etiquetteInitiale":"F","etiquetteProjet":"B"},"lots":[{"numero":1,"titre":"Isolation thermique par l'exterieur","entreprise":"SUD ALSACE FACADES","remisePct":0,"lignes":[{"retenu":true,"tvaPct":5.5,"montantHt":36300,"designation":"Echafaudage"},{"retenu":true,"tvaPct":5.5,"montantHt":185000,"designation":"Isolation thermique par l'exterieur en laine de roche 180 mm"},{"retenu":true,"tvaPct":5.5,"montantHt":24400,"designation":"Traitement des balcons"},{"retenu":true,"tvaPct":5.5,"montantHt":17200,"designation":"Garde-corps"},{"retenu":true,"tvaPct":5.5,"montantHt":7400,"designation":"Bandeaux et departs"},{"retenu":false,"tvaPct":10,"montantHt":4300,"designation":"Soubassement"},{"retenu":false,"tvaPct":10,"montantHt":5300,"designation":"Peinture des parties communes"}]},{"numero":2,"titre":"Toiture terrasse","entreprise":"ETANCHEITE DU HAUT-RHIN","remisePct":0,"lignes":[{"retenu":true,"tvaPct":5.5,"montantHt":13100,"designation":"Depose des complexes existants"},{"retenu":true,"tvaPct":5.5,"montantHt":47300,"designation":"Isolation polyurethane 200 mm et etancheite bicouche"},{"retenu":true,"tvaPct":5.5,"montantHt":9800,"designation":"Releves, acroteres et couvertines"},{"retenu":false,"tvaPct":10,"montantHt":5600,"designation":"Reprise des edicules et sorties de toiture"}]},{"numero":3,"titre":"Menuiseries exterieures","entreprise":"FENETRES RHENANES","remisePct":0,"lignes":[{"retenu":true,"tvaPct":5.5,"montantHt":110600,"designation":"Remplacement des menuiseries des logements par PVC double vitrage Uw 1,3"},{"retenu":true,"tvaPct":5.5,"montantHt":13100,"designation":"Volets roulants isolants"},{"retenu":true,"tvaPct":5.5,"montantHt":7800,"designation":"Portes de halls isolantes avec controle d'acces"}]},{"numero":4,"titre":"Chaufferie et reseaux","entreprise":"THERMIC EST","remisePct":0,"lignes":[{"retenu":true,"tvaPct":5.5,"montantHt":45000,"designation":"Remplacement des chaudieres gaz par chaudieres a condensation en cascade"},{"retenu":true,"tvaPct":5.5,"montantHt":8900,"designation":"Calorifugeage des reseaux"},{"retenu":true,"tvaPct":5.5,"montantHt":12400,"designation":"Robinets thermostatiques et equilibrage"},{"retenu":false,"tvaPct":10,"montantHt":3200,"designation":"Reprise du conduit de fumee"}]},{"numero":5,"titre":"Ventilation","entreprise":"AIRFLUX ALSACE","remisePct":0,"lignes":[{"retenu":true,"tvaPct":5.5,"montantHt":7900,"designation":"Caissons d'extraction hygroreglables"},{"retenu":true,"tvaPct":5.5,"montantHt":9300,"designation":"Gaines, bouches d'extraction et entrees d'air"},{"retenu":true,"tvaPct":5.5,"montantHt":2900,"designation":"Carottages et calfeutrements"}]},{"numero":6,"titre":"Etancheite a l'air","entreprise":"ISOL'AIR GRAND EST","remisePct":0,"lignes":[{"retenu":true,"tvaPct":5.5,"montantHt":19400,"designation":"Travaux d'impermeabilite a l'air"}]}],"moe":[{"phase":"etude","tvaPct":20,"montant":{"mode":"forfait","montantHt":1800},"entreprise":"STRAT ECO","designation":"Assistance Maitrise d'Ouvrage (phase conseil)","commentaire":"Phase conseil, assistance technique et approche financiere","eligibleMprAmo":true,"eligibleMprEtudes":false},{"phase":"etude","tvaPct":10,"montant":{"mode":"forfait","montantHt":5800},"entreprise":"ATELIER RHIN ARCHITECTURE","designation":"Maitrise d'oeuvre phase etudes (DIAG-AVP)","commentaire":"Etude, avant-projet","eligibleMprAmo":false,"eligibleMprEtudes":true},{"phase":"etude","tvaPct":20,"montant":{"mode":"forfait","montantHt":1000},"entreprise":"EST THERMO CONSEIL","designation":"Audit reglementaire","commentaire":"Mise a jour","eligibleMprAmo":false,"eligibleMprEtudes":false},{"phase":"etude","tvaPct":20,"montant":{"mode":"forfait","montantHt":3400},"entreprise":"DIAG EXPERT 67","designation":"Diagnostic amiante avant travaux","eligibleMprAmo":false,"eligibleMprEtudes":false},{"phase":"projet","tvaPct":20,"montant":{"mode":"forfait","montantHt":4100},"entreprise":"STRAT ECO","designation":"Assistance Maitrise d'Ouvrage (phase projet)","commentaire":"Prestation obligatoire, assistance projet, administrative, financiere","eligibleMprAmo":true,"eligibleMprEtudes":false},{"phase":"projet","tvaPct":10,"montant":{"mode":"forfait","montantHt":28200},"entreprise":"ATELIER RHIN ARCHITECTURE","designation":"Maitrise d'oeuvre phase conception (PRO-DCE)","commentaire":"Cahiers des charges, depot de DP, DCE","eligibleMprAmo":false,"eligibleMprEtudes":true},{"phase":"projet","tvaPct":20,"montant":{"mode":"forfait","montantHt":1900},"designation":"Controle technique","commentaire":"Prestations necessaires","eligibleMprAmo":false,"eligibleMprEtudes":true},{"phase":"projet","tvaPct":20,"montant":{"mode":"forfait","montantHt":1200},"designation":"CSPS","commentaire":"Prestations necessaires","eligibleMprAmo":false,"eligibleMprEtudes":true},{"phase":"projet","tvaPct":20,"montant":{"mode":"forfait","montantHt":600},"entreprise":"AERO TEST","designation":"Test d'etancheite a l'air avant travaux","commentaire":"Obligation Climaxion","eligibleMprAmo":false,"eligibleMprEtudes":false},{"phase":"projet","tvaPct":20,"montant":{"mode":"forfait","montantHt":1800},"entreprise":"ATELIER RHIN ARCHITECTURE","designation":"Memoire technique Climaxion","eligibleMprAmo":false,"eligibleMprEtudes":false},{"phase":"travaux","tvaPct":20,"montant":{"mode":"forfait","montantHt":7300},"entreprise":"STRAT ECO","designation":"Assistance Maitrise d'Ouvrage (phase travaux)","commentaire":"Prestation obligatoire, assistance projet, administrative, financiere","eligibleMprAmo":true,"eligibleMprEtudes":false},{"phase":"travaux","tvaPct":5.5,"montant":{"mode":"pctTravauxHt","taux":3.6},"entreprise":"ATELIER RHIN ARCHITECTURE","designation":"Maitrise d'oeuvre phase travaux","commentaire":"Pilotage et reception des travaux","eligibleMprAmo":false,"eligibleMprEtudes":true},{"phase":"travaux","tvaPct":20,"montant":{"mode":"forfait","montantHt":4100},"designation":"Controle technique","commentaire":"Prestations necessaires","eligibleMprAmo":false,"eligibleMprEtudes":true},{"phase":"travaux","tvaPct":20,"montant":{"mode":"forfait","montantHt":2100},"designation":"CSPS","commentaire":"Prestations necessaires","eligibleMprAmo":false,"eligibleMprEtudes":true},{"phase":"travaux","tvaPct":20,"montant":{"mode":"forfait","montantHt":600},"entreprise":"AERO TEST","designation":"Test d'etancheite a l'air apres travaux","commentaire":"Obligation Climaxion","eligibleMprAmo":false,"eligibleMprEtudes":false},{"phase":"travaux","tvaPct":0,"montant":{"mode":"pctTravauxTtc","taux":2},"entreprise":"ASSURANCES DU RHIN","designation":"Dommage ouvrage","commentaire":"Obligatoire","eligibleMprAmo":false,"eligibleMprEtudes":false},{"phase":"travaux","tvaPct":20,"montant":{"mode":"pctTravauxHt","taux":2.5},"entreprise":"SYNDIC TEST PARCOURS","designation":"Honoraires syndic","commentaire":"Selon informations du syndic","eligibleMprAmo":false,"eligibleMprEtudes":false}],"aides":[{"id":"cee-fiche-par-fiche","groupe":"CEE","libelle":"CEE fiche par fiche","publique":false,"calcul":{"mode":"manuel","montant":31000},"commentaire":"Depend des lots de travaux energetiques et de la surface habitable"},{"id":"maprimerenov-partie-travaux","groupe":"ANAH","libelle":"Maprimerenov' partie travaux","publique":true,"calcul":{"mode":"pctAssietteTravaux","taux":45,"coef":1},"commentaire":"45 % du montant des travaux energetiques HT - plafonne a 11250 EUR par logement"},{"id":"maprimerenov-partie-etudes","groupe":"ANAH","libelle":"Maprimerenov' partie etudes","publique":true,"calcul":{"mode":"pctEtudes","taux":45,"coef":0.9},"commentaire":"45 % du montant des etudes, diags, maitrise d'oeuvre HT"},{"id":"maprimerenov-amo","groupe":"ANAH","libelle":"Maprimerenov' AMO","publique":true,"calcul":{"mode":"pctAmo","taux":50},"commentaire":"50 % du montant de la prestation d'assistance a maitrise d'ouvrage HT"},{"id":"maprimerenov-individuelle","groupe":"ANAH","libelle":"Maprimerenov' individuelle","publique":true,"calcul":{"mode":"info"},"commentaire":"Aide individuelle de 1500 EUR ou de 3000 EUR selon revenus du coproprietaire occupant"},{"id":"climaxion-aide-travaux","groupe":"Climaxion","libelle":"Climaxion aide travaux","publique":true,"calcul":{"mode":"forfaitPlusParLogement","base":10000,"parLogement":2500,"surEquivalent":true},"commentaire":"Dispositif Climaxion sous reserve d'eligibilite"},{"id":"climaxion-aide-amo","groupe":"Climaxion","libelle":"Climaxion aide AMO","publique":true,"calcul":{"mode":"manuel","montant":4500},"commentaire":"Aide Climaxion sur la prestation AMO"}],"params":{"imprevusPct":7,"plafondTravauxParLogement":25000,"plafondMprParLogement":11250,"fondsTravaux":42000,"totalTantiemes":10000,"tantiemesExemples":[260,340,470],"dureeEcoPtzAns":20,"coefAssurance":1.036,"tauxPretAvancePct":5.45,"pctAvanceAides":70,"plafondAmoParLogement":600,"commentaireFondsTravaux":"Fonds travaux loi ALUR mobilise au vote des travaux"},"variantes":{"collectif":true,"collectifSansAvance":false,"individuel":true},"repartitionCles":{}}$json$::jsonb,
    $json${"performancePct":65.79710144927536,"lots":[{"numero":1,"titre":"Isolation thermique par l'exterieur","entreprise":"SUD ALSACE FACADES","totalHt":279900,"remise":0,"totalHtApresRemise":279900,"totalHtRetenu":270300,"tvaParTaux":[{"taux":10,"montant":960},{"taux":5.5,"montant":14866.5}],"totalTtc":295726.5},{"numero":2,"titre":"Toiture terrasse","entreprise":"ETANCHEITE DU HAUT-RHIN","totalHt":75800,"remise":0,"totalHtApresRemise":75800,"totalHtRetenu":70200,"tvaParTaux":[{"taux":10,"montant":560},{"taux":5.5,"montant":3861}],"totalTtc":80221},{"numero":3,"titre":"Menuiseries exterieures","entreprise":"FENETRES RHENANES","totalHt":131500,"remise":0,"totalHtApresRemise":131500,"totalHtRetenu":131500,"tvaParTaux":[{"taux":5.5,"montant":7232.5}],"totalTtc":138732.5},{"numero":4,"titre":"Chaufferie et reseaux","entreprise":"THERMIC EST","totalHt":69500,"remise":0,"totalHtApresRemise":69500,"totalHtRetenu":66300,"tvaParTaux":[{"taux":10,"montant":320},{"taux":5.5,"montant":3646.5}],"totalTtc":73466.5},{"numero":5,"titre":"Ventilation","entreprise":"AIRFLUX ALSACE","totalHt":20100,"remise":0,"totalHtApresRemise":20100,"totalHtRetenu":20100,"tvaParTaux":[{"taux":5.5,"montant":1105.5}],"totalTtc":21205.5},{"numero":6,"titre":"Etancheite a l'air","entreprise":"ISOL'AIR GRAND EST","totalHt":19400,"remise":0,"totalHtApresRemise":19400,"totalHtRetenu":19400,"tvaParTaux":[{"taux":5.5,"montant":1067}],"totalTtc":20467}],"totalTravauxHt":596200,"travauxRetenusHt":577800,"assietteMprTravaux":577800,"plafondAssiette":750000,"totalTravauxTtc":629819,"totalTravauxTtcImprevus":673906.3300000001,"moe":[{"designation":"Assistance Maitrise d'Ouvrage (phase conseil)","entreprise":"STRAT ECO","phase":"etude","montantHt":1800,"montantTtc":2160},{"designation":"Maitrise d'oeuvre phase etudes (DIAG-AVP)","entreprise":"ATELIER RHIN ARCHITECTURE","phase":"etude","montantHt":5800,"montantTtc":6380.000000000001},{"designation":"Audit reglementaire","entreprise":"EST THERMO CONSEIL","phase":"etude","montantHt":1000,"montantTtc":1200},{"designation":"Diagnostic amiante avant travaux","entreprise":"DIAG EXPERT 67","phase":"etude","montantHt":3400,"montantTtc":4080},{"designation":"Assistance Maitrise d'Ouvrage (phase projet)","entreprise":"STRAT ECO","phase":"projet","montantHt":4100,"montantTtc":4920},{"designation":"Maitrise d'oeuvre phase conception (PRO-DCE)","entreprise":"ATELIER RHIN ARCHITECTURE","phase":"projet","montantHt":28200,"montantTtc":31020.000000000004},{"designation":"Controle technique","phase":"projet","montantHt":1900,"montantTtc":2280},{"designation":"CSPS","phase":"projet","montantHt":1200,"montantTtc":1440},{"designation":"Test d'etancheite a l'air avant travaux","entreprise":"AERO TEST","phase":"projet","montantHt":600,"montantTtc":720},{"designation":"Memoire technique Climaxion","entreprise":"ATELIER RHIN ARCHITECTURE","phase":"projet","montantHt":1800,"montantTtc":2160},{"designation":"Assistance Maitrise d'Ouvrage (phase travaux)","entreprise":"STRAT ECO","phase":"travaux","montantHt":7300,"montantTtc":8760},{"designation":"Maitrise d'oeuvre phase travaux","entreprise":"ATELIER RHIN ARCHITECTURE","phase":"travaux","montantHt":21463.2,"montantTtc":22643.676},{"designation":"Controle technique","phase":"travaux","montantHt":4100,"montantTtc":4920},{"designation":"CSPS","phase":"travaux","montantHt":2100,"montantTtc":2520},{"designation":"Test d'etancheite a l'air apres travaux","entreprise":"AERO TEST","phase":"travaux","montantHt":600,"montantTtc":720},{"designation":"Dommage ouvrage","entreprise":"ASSURANCES DU RHIN","phase":"travaux","montantHt":12596.38,"montantTtc":12596.38},{"designation":"Honoraires syndic","entreprise":"SYNDIC TEST PARCOURS","phase":"travaux","montantHt":14905,"montantTtc":17886}],"totalMoeTtc":126406.05600000001,"totalOperationTtc":800312.386,"totalPhaseTravauxTtc":743952.386,"aides":[{"id":"cee-fiche-par-fiche","groupe":"CEE","libelle":"CEE fiche par fiche","montant":31000,"publique":false,"commentaire":"Depend des lots de travaux energetiques et de la surface habitable"},{"id":"maprimerenov-partie-travaux","groupe":"ANAH","libelle":"Maprimerenov' partie travaux","montant":260010,"publique":true,"commentaire":"45 % du montant des travaux energetiques HT - plafonne a 11250 EUR par logement"},{"id":"maprimerenov-partie-etudes","groupe":"ANAH","libelle":"Maprimerenov' partie etudes","montant":25419.610313317677,"publique":true,"commentaire":"45 % du montant des etudes, diags, maitrise d'oeuvre HT"},{"id":"maprimerenov-amo","groupe":"ANAH","libelle":"Maprimerenov' AMO","montant":6600,"publique":true,"commentaire":"50 % du montant de la prestation d'assistance a maitrise d'ouvrage HT"},{"id":"maprimerenov-individuelle","groupe":"ANAH","libelle":"Maprimerenov' individuelle","montant":null,"publique":true,"commentaire":"Aide individuelle de 1500 EUR ou de 3000 EUR selon revenus du coproprietaire occupant"},{"id":"climaxion-aide-travaux","groupe":"Climaxion","libelle":"Climaxion aide travaux","montant":85000,"publique":true,"commentaire":"Dispositif Climaxion sous reserve d'eligibilite"},{"id":"climaxion-aide-amo","groupe":"Climaxion","libelle":"Climaxion aide AMO","montant":4500,"publique":true,"commentaire":"Aide Climaxion sur la prestation AMO"}],"totalAides":412529.6103133177,"totalAidesPubliques":381529.6103133177,"primeCee":31000,"tauxCouverture":0.5154607344953894,"resteACharge":345782.7756866824,"coutTantiemeAvant":80.03123860000001,"collectif":{"resteAFinancer":376782.7756866824,"coutTantiemeApres":37.678277568668236,"exemples":[{"tantiemes":260,"quotePartAvant":20808.122036,"resteAFinancer":9796.352167853742,"mensualiteEcoPtz":42.287586857901985,"subventionsPubliques":9919.769868146259,"coutPretAvance":540.6274578139711,"primeCee":806,"prixRevient":9530.979625667713},{"tantiemes":340,"quotePartAvant":27210.621124000005,"resteAFinancer":12810.614373347202,"mensualiteEcoPtz":55.299152044948755,"subventionsPubliques":12972.006750652801,"coutPretAvance":706.9743679105777,"primeCee":1054,"prixRevient":12463.58874125778},{"tantiemes":470,"quotePartAvant":37614.682142000005,"resteAFinancer":17708.79045727407,"mensualiteEcoPtz":76.44294547389974,"subventionsPubliques":17931.89168472593,"coutPretAvance":977.2880968175632,"primeCee":1457,"prixRevient":17229.078554091633}]},"collectifSansAvance":{"resteAFinancer":376782.7756866824,"coutTantiemeApres":37.678277568668236,"exemples":[{"tantiemes":260,"quotePartAvant":20808.122036,"resteAFinancer":9796.352167853742,"mensualiteEcoPtz":42.287586857901985,"subventionsPubliques":9919.769868146259,"primeCee":806,"prixRevient":8990.352167853742},{"tantiemes":340,"quotePartAvant":27210.621124000005,"resteAFinancer":12810.614373347202,"mensualiteEcoPtz":55.299152044948755,"subventionsPubliques":12972.006750652801,"primeCee":1054,"prixRevient":11756.614373347202},{"tantiemes":470,"quotePartAvant":37614.682142000005,"resteAFinancer":17708.79045727407,"mensualiteEcoPtz":76.44294547389974,"subventionsPubliques":17931.89168472593,"primeCee":1457,"prixRevient":16251.79045727407}]},"individuel":{"aidesAvancees":267070.72721932235,"aidesFinChantier":114458.88309399533,"appelsFonds":491241.6587806777,"coutTantiemeApresAides":34.578277568668234,"coutTantiemeAvecAvance":49.12416587806777,"exemples":[{"tantiemes":260,"quotePartAvant":20808.122036,"prixRevient":8990.352167853742,"appelsFonds":12772.28312829762,"remboursementFinChantier":3781.9309604438795,"mensualiteEcoPtz":55.1336888371514},{"tantiemes":340,"quotePartAvant":27210.621124000005,"prixRevient":11756.6143733472,"appelsFonds":16702.21639854304,"remboursementFinChantier":4945.6020251958425,"mensualiteEcoPtz":72.09790078704413},{"tantiemes":470,"quotePartAvant":37614.682142000005,"prixRevient":16251.79045727407,"appelsFonds":23088.35796269185,"remboursementFinChantier":6836.567505417783,"mensualiteEcoPtz":99.66474520561982}]},"gardeFous":[{"libelle":"Plafond travaux < 25 K€/logt","valeur":19260,"plafond":25000,"ok":true},{"libelle":"MPR travaux < 11 250 €/logt","valeur":8667,"plafond":11250,"ok":true},{"libelle":"AMO < 600 €/logt","valeur":440,"plafond":600,"ok":true}]}$json$::jsonb,
    'valide',
    null,
    1,
    now() - interval '45 days',
    (select id from auth.users where email = 'amir@strateco.fr' limit 1)
  );
  update coproprietes
  set gain_pct = 65.8,
      energy_before = 'F',
      energy_after = 'B'
  where id = v_copro;
end $$;

-- Onglet Données : clé de répartition, copropriétaires, lots, tantièmes
do $$
declare
  v_copro uuid;
  v_cle uuid;
  r record;
  v_cp uuid;
  v_bat uuid;
  v_parent uuid;
  v_lot uuid;
begin
  select id into v_copro from coproprietes where slug = 'test-les-balcons-de-la-lauch';
  if v_copro is null then return; end if;
  if exists (select 1 from lots where copro_id = v_copro) then
    raise notice 'Lots déjà présents - bloc données sauté.';
    return;
  end if;

  insert into cles_repartition (copro_id, code, label, is_default)
  values (v_copro, 'MUN', 'Tantièmes généraux', true)
  on conflict do nothing;
  select id into v_cle from cles_repartition where copro_id = v_copro and code = 'MUN';

  for r in
    select * from (values
      ('SCI SCHMITT PATRIMOINE', 'bailleur', null, '03 73 80 27 21', '9 rue Serpenoise, 57000 Metz'),
      ('Bernard et Josiane KLEIN', 'bailleur', null, '03 87 68 45 70', '6 rue de la Republique, 69002 Lyon'),
      ('Martine et Francois MULLER', 'bailleur', null, '06 88 34 10 12', '12 rue des Jardins, 67200 Strasbourg'),
      ('Claire BENALI', 'occupant', null, '06 29 62 50 43', null),
      ('Jean HADDAD', 'bailleur', null, '06 49 98 46 84', '31 boulevard Voltaire, 75011 Paris'),
      ('Sandrine et Alain DA COSTA', 'occupant', null, '06 36 66 58 70', null),
      ('Marius ONBUS', 'occupant', 'marius.onbus@a-renseigner.invalid', null, null),
      ('Maxime et Anne FERREIRA', 'occupant', null, '06 26 37 47 50', '26 avenue de la République, 68000 Colmar'),
      ('Mehdi NGUYEN', 'occupant', null, '06 52 34 91 86', '26 avenue de la République, 68000 Colmar'),
      ('Manon et Lucas TRAN', 'bailleur', null, null, '3 place Kleber, 67000 Strasbourg'),
      ('Laurent ROSSI', 'occupant', null, '06 59 25 71 75', '26 avenue de la République, 68000 Colmar'),
      ('Cyrielle ONTHEMIC', 'occupant', 'cyrielle.onthemic@a-renseigner.invalid', null, null),
      ('Jean et Christine BIANCHI', 'occupant', null, '06 50 89 66 67', null),
      ('Christophe LEFEVRE', 'bailleur', null, null, '22 avenue du General Leclerc, 54500 Vandoeuvre-les-Nancy'),
      ('Patricia GAUTHIER', 'bailleur', null, '06 43 57 68 71', '45 rue des Clefs, 68000 Colmar'),
      ('Isabelle et Vincent DUPONT', 'occupant', null, null, null),
      ('Camille et Jean MOREAU', 'occupant', null, '03 39 70 45 53', '26 avenue de la République, 68000 Colmar'),
      ('Monique GIRARD', 'occupant', null, null, '26 avenue de la République, 68000 Colmar'),
      ('Pierre MAXTAFF', 'bailleur', 'pierre.maxtaff@a-renseigner.invalid', null, '5 rue Sainte-Catherine, 54000 Nancy'),
      ('Jean et Chloe ROBERT', 'occupant', null, '03 59 56 63 59', '26 avenue de la République, 68000 Colmar'),
      ('Sophie et Thomas FOURNIER', 'occupant', null, '06 86 71 47 62', null),
      ('Maxime et Catherine LAMBERT', 'occupant', null, '06 36 54 66 19', null),
      ('Mehdi BONNET', 'bailleur', null, '06 79 54 54 32', '12 rue des Jardins, 67200 Strasbourg'),
      ('Paul MERCIER', 'occupant', null, '03 21 78 44 78', '26 avenue de la République, 68000 Colmar'),
      ('Ines BLANC', 'bailleur', null, '06 58 93 85 55', '8 rue du Faubourg, 88000 Epinal'),
      ('Christine GUERIN', 'bailleur', null, '06 25 19 85 62', '12 rue des Jardins, 67200 Strasbourg'),
      ('Julie et Vincent ROUX', 'occupant', null, null, '26 avenue de la République, 68000 Colmar'),
      ('Maxime DUBOIS', 'occupant', null, '06 27 48 98 74', '26 avenue de la République, 68000 Colmar')
    ) as t(nom, type, email, telephone, adresse)
  loop
    insert into coproprietaires (copro_id, nom, type, email, telephone, adresse)
    values (v_copro, r.nom, r.type, r.email, r.telephone, r.adresse);
  end loop;

  for r in
    select * from (values
      ('1', '01', 'SCI SCHMITT PATRIMOINE', 'habitation', 326, null),
      ('2', '01', 'Bernard et Josiane KLEIN', 'habitation', 238, null),
      ('3', '01', 'Martine et Francois MULLER', 'habitation', 414, null),
      ('4', '01', 'Claire BENALI', 'habitation', 326, null),
      ('5', '01', 'Jean HADDAD', 'habitation', 326, null),
      ('6', '01', 'Sandrine et Alain DA COSTA', 'habitation', 238, null),
      ('7', '01', 'Marius ONBUS', 'habitation', 414, null),
      ('8', '01', 'Maxime et Anne FERREIRA', 'habitation', 326, null),
      ('9', '01', 'Mehdi NGUYEN', 'habitation', 326, null),
      ('10', '01', 'Manon et Lucas TRAN', 'habitation', 238, null),
      ('11', '01', 'Laurent ROSSI', 'habitation', 414, null),
      ('12', '01', 'Cyrielle ONTHEMIC', 'habitation', 326, null),
      ('13', '01', 'Jean et Christine BIANCHI', 'habitation', 326, null),
      ('14', '01', 'Christophe LEFEVRE', 'habitation', 238, null),
      ('15', '01', 'Patricia GAUTHIER', 'habitation', 414, null),
      ('16', '02', 'SCI SCHMITT PATRIMOINE', 'habitation', 326, null),
      ('17', '02', 'Bernard et Josiane KLEIN', 'habitation', 326, null),
      ('18', '02', 'Isabelle et Vincent DUPONT', 'habitation', 238, null),
      ('19', '02', 'Camille et Jean MOREAU', 'habitation', 414, null),
      ('20', '02', 'Monique GIRARD', 'habitation', 326, null),
      ('21', '02', 'Pierre MAXTAFF', 'habitation', 326, null),
      ('22', '02', 'Jean et Chloe ROBERT', 'habitation', 238, null),
      ('23', '02', 'Sophie et Thomas FOURNIER', 'habitation', 414, null),
      ('24', '02', 'Maxime et Catherine LAMBERT', 'habitation', 326, null),
      ('25', '02', 'Mehdi BONNET', 'habitation', 326, null),
      ('26', '02', 'Paul MERCIER', 'habitation', 238, null),
      ('27', '02', 'Ines BLANC', 'habitation', 414, null),
      ('28', '02', 'Christine GUERIN', 'habitation', 326, null),
      ('29', '02', 'Julie et Vincent ROUX', 'habitation', 326, null),
      ('30', '02', 'Maxime DUBOIS', 'habitation', 238, null),
      ('31', '01', 'Marius ONBUS', 'caves', 8, '7'),
      ('32', '02', 'Pierre MAXTAFF', 'caves', 8, '21'),
      ('33', '02', 'Maxime DUBOIS', 'caves', 8, '30'),
      ('34', '02', 'Julie et Vincent ROUX', 'caves', 8, '29'),
      ('35', '02', 'Christine GUERIN', 'caves', 8, '28'),
      ('36', '02', 'Ines BLANC', 'caves', 8, '27'),
      ('37', '02', 'Paul MERCIER', 'caves', 8, '26'),
      ('38', '02', 'Mehdi BONNET', 'caves', 8, '25'),
      ('39', '02', 'Maxime et Catherine LAMBERT', 'caves', 8, '24'),
      ('40', '02', 'Sophie et Thomas FOURNIER', 'caves', 8, '23'),
      ('41', '02', 'Jean et Chloe ROBERT', 'caves', 7, '22'),
      ('42', '02', 'Monique GIRARD', 'caves', 7, '20'),
      ('43', '02', 'Camille et Jean MOREAU', 'caves', 7, '19'),
      ('44', '02', 'Isabelle et Vincent DUPONT', 'caves', 7, '18'),
      ('45', '01', 'Marius ONBUS', 'garage', 20, '7'),
      ('46', '01', 'Martine et Francois MULLER', 'garage', 20, '3'),
      ('47', '01', 'Claire BENALI', 'garage', 20, '4'),
      ('48', '01', 'Jean HADDAD', 'garage', 20, '5'),
      ('49', '01', 'Sandrine et Alain DA COSTA', 'garage', 20, '6'),
      ('50', '01', 'Maxime et Anne FERREIRA', 'garage', 20, '8'),
      ('51', '01', 'Mehdi NGUYEN', 'garage', 20, '9'),
      ('52', '01', 'Manon et Lucas TRAN', 'garage', 20, '10'),
      ('53', '01', 'Laurent ROSSI', 'garage', 20, '11'),
      ('54', '01', 'Jean et Christine BIANCHI', 'garage', 20, '13')
    ) as t(num, bat, nom, usage, tantiemes, parent_num)
    order by (parent_num is not null), num::int
  loop
    select id into v_cp from coproprietaires where copro_id = v_copro and nom = r.nom;
    select id into v_bat from batiments where copro_id = v_copro and code = r.bat;
    v_parent := null;
    if r.parent_num is not null then
      select id into v_parent from lots where copro_id = v_copro and num = r.parent_num;
    end if;
    insert into lots (copro_id, batiment_id, coproprietaire_id, num, usage, rattache_a)
    values (v_copro, v_bat, v_cp, r.num, r.usage::usage_lot, v_parent)
    returning id into v_lot;
    insert into lot_tantiemes (lot_id, cle_id, tantiemes) values (v_lot, v_cle, r.tantiemes);
  end loop;

  -- Compte portail déjà existant (rôle copro) relié à sa fiche, comme creer-espace-coproprietaire
  update coproprietaires cp
  set user_id = u.id,
      espace_invite_le = now(),
      espace_invite_par = (select id from auth.users where email = 'amir@strateco.fr' limit 1)
  from auth.users u
  join profiles p on p.user_id = u.id and p.role = 'copro'
  where cp.copro_id = v_copro and cp.user_id is null
    and lower(u.email) = lower(cp.email)
    and lower(cp.email) in ('cyrielle.onthemic@a-renseigner.invalid');
end $$;

commit;

-- @@BLOC 8 LES BALCONS DE LA LAUCH : enquête, partage au portail, choix et adhésions
begin;

-- Enquête sociale envoyée + réponses transmises depuis le portail
do $$
declare
  v_copro uuid;
  v_enq uuid;
  v_verif uuid;
  r record;
  v_cp uuid;
  v_lots jsonb;
begin
  select id into v_copro from coproprietes where slug = 'test-les-balcons-de-la-lauch';
  if v_copro is null then return; end if;
  select id into v_enq from enquetes where copro_id = v_copro order by created_at limit 1;
  if v_enq is null then
    insert into enquetes (copro_id, questions, statut, sent_at, date_limite)
    values (v_copro, $json$[{"id":"nom","on":true},{"id":"telephone","on":true},{"id":"adresse","on":true},{"id":"email","on":true},{"id":"type-coproprietaire","on":true},{"id":"nb-indivisaires","on":true},{"id":"nb-associes-sci","on":true},{"id":"personne-physique-sci","on":true},{"id":"nb-personnes-foyer","on":true},{"id":"composition-menage","on":true},{"id":"nb-personnes-charge","on":true},{"id":"rfr-foyer","on":true},{"id":"rfr-zero-motif","on":true},{"id":"nb-avis-imposition","on":true},{"id":"rfr-n2","on":true},{"id":"csp-reference","on":true},{"id":"situations-foyer","on":true},{"id":"impayes-charges","on":true},{"id":"accord-visite","on":true},{"id":"curatelle-tutelle","on":true},{"id":"coordonnees-representant","on":true},{"id":"situation-sociale","on":true},{"id":"importance-travaux","on":false},{"id":"etat-parties-communes","on":false},{"id":"securite-parties-communes","on":false},{"id":"usage-lot","on":true},{"id":"lot-parent","on":true},{"id":"type-occupation","on":true},{"id":"nb-habitants","on":true},{"id":"type-residence","on":true},{"id":"mode-location","on":true},{"id":"commodat","on":true},{"id":"associes-occupants","on":true},{"id":"indivisaires-occupants","on":true},{"id":"projet-vente","on":true},{"id":"associes-exploitants","on":true},{"id":"demembrement","on":true},{"id":"nb-fenetres","on":true},{"id":"nb-simple-vitrage","on":true},{"id":"nb-occultations","on":true},{"id":"nb-occultations-origine","on":true},{"id":"nb-stores","on":true},{"id":"changement-menuiseries","on":true},{"id":"type-chauffage","on":true},{"id":"energie-chauffage","on":true},{"id":"date-chaudiere","on":true},{"id":"type-ecs","on":true},{"id":"energie-ecs","on":true},{"id":"emetteurs-chauffage","on":true},{"id":"nb-radiateurs","on":true},{"id":"regulation-radiateurs","on":true},{"id":"pathologies","on":true},{"id":"difficultes-logement","on":true},{"id":"inconforts","on":true},{"id":"duree-occupation","on":false},{"id":"tranches-age","on":false},{"id":"csp","on":false},{"id":"ressenti-ete","on":false},{"id":"ressenti-hiver","on":false},{"id":"confort-phonique","on":false},{"id":"detecteurs","on":false},{"id":"projet-travaux","on":false}]$json$::jsonb, 'envoyee', now() - interval '50 days', current_date + 21)
    returning id into v_enq;
  else
    update enquetes set statut = 'envoyee', sent_at = coalesce(sent_at, now() - interval '50 days') where id = v_enq;
  end if;
  if exists (select 1 from enquete_reponses where enquete_id = v_enq) then
    raise notice 'Réponses déjà présentes - bloc enquête sauté.';
    return;
  end if;
  select user_id into v_verif from profiles p join auth.users u on u.id = p.user_id where u.email = 'amir@strateco.fr' limit 1;

  for r in
    select * from (values
      ('Bernard et Josiane KLEIN', $json${"nom":"Bernard et Josiane KLEIN","telephone":"03 87 68 45 70","adresse":"6 rue de la Republique, 69002 Lyon","email":"","type-coproprietaire":"Personne physique","nb-personnes-foyer":2,"composition-menage":"Couple sans enfant","nb-personnes-charge":0,"rfr-foyer":22510,"rfr-n2":22950,"accord-visite":"Oui","curatelle-tutelle":"Non","situation-sociale":"Non","importance-travaux":"Sans avis"}$json$::jsonb, $json${"type-occupation":"Propriétaire bailleur (logement loué)","nb-habitants":3,"type-residence":"Résidence principale","commodat":"Non","projet-vente":"Non","demembrement":"Non","nb-fenetres":7,"nb-simple-vitrage":0,"nb-occultations":7,"nb-occultations-origine":7,"nb-stores":0,"changement-menuiseries":["Non, aucun changement récent"],"type-chauffage":"Collectif","energie-chauffage":"Gaz","type-ecs":"Collectif","energie-ecs":"Même système que le chauffage","nb-radiateurs":4,"regulation-radiateurs":"Non","pathologies":["Aucune pathologie"],"inconforts":["Froid en hiver","Parois ou sols froids"]}$json$::jsonb, 2, 22510, 22950, 'bailleur', 'Bleu', true, 2, true, 38),
      ('Claire BENALI', $json${"nom":"Claire BENALI","telephone":"06 29 62 50 43","adresse":"26 avenue de la République, 68000 Colmar","email":"","type-coproprietaire":"Personne physique","nb-personnes-foyer":1,"composition-menage":"Personne seule","nb-personnes-charge":0,"rfr-foyer":20950,"rfr-n2":20760,"accord-visite":"Oui","curatelle-tutelle":"Non","situation-sociale":"Non","importance-travaux":"Utiles"}$json$::jsonb, $json${"type-occupation":"Propriétaire occupant","nb-habitants":1,"type-residence":"Résidence principale","commodat":"Non","projet-vente":"Non","demembrement":"Non","nb-fenetres":8,"nb-simple-vitrage":0,"nb-occultations":8,"nb-occultations-origine":8,"nb-stores":3,"changement-menuiseries":["Oui, les fenêtres"],"type-chauffage":"Collectif","energie-chauffage":"Gaz","type-ecs":"Collectif","energie-ecs":"Même système que le chauffage","nb-radiateurs":7,"regulation-radiateurs":"Oui, sur une partie seulement","pathologies":["Aucune pathologie"],"inconforts":["Courants d'air","Parois ou sols froids"]}$json$::jsonb, 1, 20950, 20760, 'occupant', 'Jaune', false, 7, true, 31),
      ('Sandrine et Alain DA COSTA', $json${"nom":"Sandrine et Alain DA COSTA","telephone":"06 36 66 58 70","adresse":"26 avenue de la République, 68000 Colmar","email":"","type-coproprietaire":"Personne physique","nb-personnes-foyer":2,"composition-menage":"Couple sans enfant","nb-personnes-charge":0,"rfr-foyer":30780,"rfr-n2":31440,"accord-visite":"Oui, sous conditions (précisez)","curatelle-tutelle":"Non","situation-sociale":"Non","importance-travaux":"Utiles"}$json$::jsonb, $json${"type-occupation":"Propriétaire occupant","nb-habitants":2,"type-residence":"Résidence principale","commodat":"Non","projet-vente":"Non","demembrement":"Non","nb-fenetres":7,"nb-simple-vitrage":0,"nb-occultations":7,"nb-occultations-origine":7,"nb-stores":0,"changement-menuiseries":["Oui, les fenêtres"],"type-chauffage":"Collectif","energie-chauffage":"Gaz","type-ecs":"Collectif","energie-ecs":"Même système que le chauffage","nb-radiateurs":4,"regulation-radiateurs":"Non","pathologies":["Humidité / condensation","Fissures"],"inconforts":["Froid en hiver"]}$json$::jsonb, 2, 30780, 31440, 'occupant', 'Jaune', false, 4, true, 34),
      ('Mehdi NGUYEN', $json${"nom":"Mehdi NGUYEN","telephone":"06 52 34 91 86","adresse":"26 avenue de la République, 68000 Colmar","email":"","type-coproprietaire":"Personne physique","nb-personnes-foyer":3,"composition-menage":"Famille monoparentale","nb-personnes-charge":2,"rfr-foyer":44540,"rfr-n2":45830,"accord-visite":"Oui","curatelle-tutelle":"Non","situation-sociale":"Non","importance-travaux":"Utiles"}$json$::jsonb, $json${"type-occupation":"Propriétaire occupant","nb-habitants":3,"type-residence":"Résidence principale","commodat":"Non","projet-vente":"Non","demembrement":"Non","nb-fenetres":7,"nb-simple-vitrage":0,"nb-occultations":7,"nb-occultations-origine":5,"nb-stores":0,"changement-menuiseries":["Oui, les fenêtres"],"type-chauffage":"Collectif","energie-chauffage":"Gaz","type-ecs":"Collectif","energie-ecs":"Même système que le chauffage","nb-radiateurs":4,"regulation-radiateurs":"Oui, sur tous les radiateurs","pathologies":["Humidité / condensation"],"inconforts":["Froid en hiver","Courants d'air","Parois ou sols froids"]}$json$::jsonb, 3, 44540, 45830, 'occupant', 'Violet', false, 6, true, 17),
      ('Manon et Lucas TRAN', $json${"nom":"Manon et Lucas TRAN","telephone":"","adresse":"3 place Kleber, 67000 Strasbourg","email":"","type-coproprietaire":"Personne physique","nb-personnes-foyer":2,"composition-menage":"Couple sans enfant","nb-personnes-charge":0,"rfr-foyer":0,"rfr-zero-motif":"Sans activité professionnelle","rfr-n2":0,"accord-visite":"Non","curatelle-tutelle":"Non","situation-sociale":"Non","importance-travaux":"Utiles"}$json$::jsonb, $json${"type-occupation":"Propriétaire bailleur (logement loué)","nb-habitants":1,"type-residence":"Résidence principale","commodat":"Non","projet-vente":"Non","demembrement":"Non","nb-fenetres":4,"nb-simple-vitrage":0,"nb-occultations":4,"nb-occultations-origine":1,"nb-stores":0,"changement-menuiseries":["Non, aucun changement récent"],"type-chauffage":"Collectif","energie-chauffage":"Gaz","type-ecs":"Collectif","energie-ecs":"Même système que le chauffage","nb-radiateurs":6,"regulation-radiateurs":"Oui, sur une partie seulement","pathologies":["Aucune pathologie"],"inconforts":["Aucun inconfort particulier"]}$json$::jsonb, 2, 0, 0, 'bailleur', 'Bleu', true, 2, true, 8),
      ('Laurent ROSSI', $json${"nom":"Laurent ROSSI","telephone":"06 59 25 71 75","adresse":"26 avenue de la République, 68000 Colmar","email":"","type-coproprietaire":"Personne physique","nb-personnes-foyer":1,"composition-menage":"Personne seule","nb-personnes-charge":0,"rfr-foyer":14810,"rfr-n2":15050,"accord-visite":"Oui","curatelle-tutelle":"Non","situation-sociale":"Non","importance-travaux":"Indispensables"}$json$::jsonb, $json${"type-occupation":"Propriétaire occupant","nb-habitants":1,"type-residence":"Résidence principale","commodat":"Non","projet-vente":"Je ne sais pas encore","demembrement":"Non","nb-fenetres":6,"nb-simple-vitrage":4,"nb-occultations":6,"nb-occultations-origine":6,"nb-stores":0,"changement-menuiseries":["Non, aucun changement récent"],"type-chauffage":"Collectif","energie-chauffage":"Gaz","type-ecs":"Collectif","energie-ecs":"Même système que le chauffage","nb-radiateurs":7,"regulation-radiateurs":"Oui, sur une partie seulement","pathologies":["Aucune pathologie"],"inconforts":["Froid en hiver","Chaleur excessive en été"]}$json$::jsonb, 1, 14810, 15050, 'occupant', 'Bleu', false, 4, true, 17),
      ('Jean et Christine BIANCHI', $json${"nom":"Jean et Christine BIANCHI","telephone":"06 50 89 66 67","adresse":"26 avenue de la République, 68000 Colmar","email":"","type-coproprietaire":"Personne physique","nb-personnes-foyer":3}$json$::jsonb, $json${"type-occupation":"Propriétaire occupant"}$json$::jsonb, null, null, null, 'occupant', null, false, 1, false, 23),
      ('Christophe LEFEVRE', $json${"nom":"Christophe LEFEVRE","telephone":"","adresse":"22 avenue du General Leclerc, 54500 Vandoeuvre-les-Nancy","email":"","type-coproprietaire":"Personne physique","nb-personnes-foyer":1,"composition-menage":"Personne seule","nb-personnes-charge":0,"rfr-foyer":48010,"rfr-n2":46220,"accord-visite":"Oui","curatelle-tutelle":"Non","situation-sociale":"Non","importance-travaux":"Indispensables"}$json$::jsonb, $json${"type-occupation":"Propriétaire bailleur (logement loué)","nb-habitants":2,"type-residence":"Résidence principale","commodat":"Non","projet-vente":"Non","demembrement":"Non","nb-fenetres":4,"nb-simple-vitrage":0,"nb-occultations":4,"nb-occultations-origine":3,"nb-stores":0,"changement-menuiseries":["Oui, les fenêtres"],"type-chauffage":"Collectif","energie-chauffage":"Gaz","type-ecs":"Collectif","energie-ecs":"Même système que le chauffage","nb-radiateurs":7,"regulation-radiateurs":"Oui, sur une partie seulement","pathologies":["Humidité / condensation"],"inconforts":["Froid en hiver","Chaleur excessive en été"]}$json$::jsonb, 1, 48010, 46220, 'bailleur', 'Rose', true, 1, true, 46),
      ('Patricia GAUTHIER', $json${"nom":"Patricia GAUTHIER","telephone":"06 43 57 68 71","adresse":"45 rue des Clefs, 68000 Colmar","email":"","type-coproprietaire":"Personne physique","nb-personnes-foyer":1,"composition-menage":"Personne seule","nb-personnes-charge":0,"rfr-foyer":28330,"rfr-n2":29160,"accord-visite":"Non","curatelle-tutelle":"Non","situation-sociale":"Non","importance-travaux":"Peu utiles"}$json$::jsonb, $json${"type-occupation":"Propriétaire bailleur (logement loué)","nb-habitants":3,"type-residence":"Résidence principale","commodat":"Non","projet-vente":"Non","demembrement":"Non","nb-fenetres":7,"nb-simple-vitrage":5,"nb-occultations":7,"nb-occultations-origine":1,"nb-stores":0,"changement-menuiseries":["Non, aucun changement récent"],"type-chauffage":"Collectif","energie-chauffage":"Gaz","type-ecs":"Collectif","energie-ecs":"Même système que le chauffage","nb-radiateurs":6,"regulation-radiateurs":"Oui, sur tous les radiateurs","pathologies":["Aucune pathologie"],"inconforts":["Froid en hiver"]}$json$::jsonb, 1, 28330, 29160, 'bailleur', 'Violet', false, 1, true, 44),
      ('Isabelle et Vincent DUPONT', $json${"nom":"Isabelle et Vincent DUPONT","telephone":"","adresse":"26 avenue de la République, 68000 Colmar","email":"","type-coproprietaire":"Personne physique","nb-personnes-foyer":1}$json$::jsonb, $json${"type-occupation":"Propriétaire occupant"}$json$::jsonb, null, null, null, 'occupant', null, false, 1, false, 12),
      ('Camille et Jean MOREAU', $json${"nom":"Camille et Jean MOREAU","telephone":"03 39 70 45 53","adresse":"26 avenue de la République, 68000 Colmar","email":"","type-coproprietaire":"Personne physique","nb-personnes-foyer":2,"composition-menage":"Couple sans enfant","nb-personnes-charge":0,"rfr-foyer":36950,"rfr-n2":35940,"accord-visite":"Non","curatelle-tutelle":"Non","situation-sociale":"Non","importance-travaux":"Sans avis"}$json$::jsonb, $json${"type-occupation":"Propriétaire occupant","nb-habitants":2,"type-residence":"Résidence principale","commodat":"Non","projet-vente":"Non","demembrement":"Non","nb-fenetres":8,"nb-simple-vitrage":8,"nb-occultations":8,"nb-occultations-origine":2,"nb-stores":0,"changement-menuiseries":["Non, aucun changement récent"],"type-chauffage":"Collectif","energie-chauffage":"Gaz","type-ecs":"Collectif","energie-ecs":"Même système que le chauffage","nb-radiateurs":6,"regulation-radiateurs":"Oui, sur une partie seulement","pathologies":["Aucune pathologie"],"inconforts":["Chaleur excessive en été","Courants d'air"]}$json$::jsonb, 2, 36950, 35940, 'occupant', 'Violet', true, 4, true, 18),
      ('Jean et Chloe ROBERT', $json${"nom":"Jean et Chloe ROBERT","telephone":"03 59 56 63 59","adresse":"26 avenue de la République, 68000 Colmar","email":"","type-coproprietaire":"Personne physique","nb-personnes-foyer":5,"composition-menage":"Couple avec enfant(s)","nb-personnes-charge":3,"rfr-foyer":27960,"rfr-n2":27390,"accord-visite":"Oui","curatelle-tutelle":"Non","situation-sociale":"Non","importance-travaux":"Indispensables"}$json$::jsonb, $json${"type-occupation":"Propriétaire occupant","nb-habitants":5,"type-residence":"Résidence principale","commodat":"Non","projet-vente":"Non","demembrement":"Non","nb-fenetres":8,"nb-simple-vitrage":0,"nb-occultations":8,"nb-occultations-origine":8,"nb-stores":0,"changement-menuiseries":["Oui, les fenêtres"],"type-chauffage":"Collectif","energie-chauffage":"Gaz","type-ecs":"Collectif","energie-ecs":"Même système que le chauffage","nb-radiateurs":4,"regulation-radiateurs":"Oui, sur une partie seulement","pathologies":["Moisissures"],"inconforts":["Froid en hiver","Chaleur excessive en été"]}$json$::jsonb, 5, 27960, 27390, 'occupant', 'Bleu', true, 2, true, 37),
      ('Mehdi BONNET', $json${"nom":"Mehdi BONNET","telephone":"06 79 54 54 32","adresse":"12 rue des Jardins, 67200 Strasbourg","email":"","type-coproprietaire":"Personne physique","nb-personnes-foyer":1,"composition-menage":"Personne seule","nb-personnes-charge":0,"rfr-foyer":18410,"rfr-n2":17900,"accord-visite":"Non","curatelle-tutelle":"Non","situation-sociale":"Non","importance-travaux":"Utiles"}$json$::jsonb, $json${"type-occupation":"Propriétaire bailleur (logement loué)","nb-habitants":1,"type-residence":"Résidence principale","commodat":"Non","projet-vente":"Non","demembrement":"Non","nb-fenetres":6,"nb-simple-vitrage":5,"nb-occultations":6,"nb-occultations-origine":6,"nb-stores":0,"changement-menuiseries":["Non, aucun changement récent"],"type-chauffage":"Collectif","energie-chauffage":"Gaz","type-ecs":"Collectif","energie-ecs":"Même système que le chauffage","nb-radiateurs":7,"regulation-radiateurs":"Oui, sur une partie seulement","pathologies":["Humidité / condensation"],"inconforts":["Froid en hiver","Chaleur excessive en été","Courants d'air"]}$json$::jsonb, 1, 18410, 17900, 'bailleur', 'Jaune', true, 7, true, 10),
      ('Paul MERCIER', $json${"nom":"Paul MERCIER","telephone":"03 21 78 44 78","adresse":"26 avenue de la République, 68000 Colmar","email":"","type-coproprietaire":"Personne physique","nb-personnes-foyer":1,"composition-menage":"Personne seule","nb-personnes-charge":0,"rfr-foyer":53140,"rfr-n2":54500,"accord-visite":"Oui, sous conditions (précisez)","curatelle-tutelle":"Non","situation-sociale":"Non","importance-travaux":"Indispensables"}$json$::jsonb, $json${"type-occupation":"Propriétaire occupant","nb-habitants":1,"type-residence":"Résidence principale","commodat":"Non","projet-vente":"Non","demembrement":"Non","nb-fenetres":4,"nb-simple-vitrage":4,"nb-occultations":4,"nb-occultations-origine":4,"nb-stores":3,"changement-menuiseries":["Non, aucun changement récent"],"type-chauffage":"Collectif","energie-chauffage":"Gaz","type-ecs":"Collectif","energie-ecs":"Même système que le chauffage","nb-radiateurs":6,"regulation-radiateurs":"Oui, sur tous les radiateurs","pathologies":["Humidité / condensation"],"inconforts":["Froid en hiver","Chaleur excessive en été"]}$json$::jsonb, 1, 53140, 54500, 'occupant', 'Rose', false, 7, true, 23),
      ('Ines BLANC', $json${"nom":"Ines BLANC","telephone":"06 58 93 85 55","adresse":"8 rue du Faubourg, 88000 Epinal","email":"","type-coproprietaire":"Personne physique","nb-personnes-foyer":2,"composition-menage":"Famille monoparentale","nb-personnes-charge":1,"rfr-foyer":44060,"rfr-n2":42310,"accord-visite":"Oui","curatelle-tutelle":"Non","situation-sociale":"Non","importance-travaux":"Indispensables"}$json$::jsonb, $json${"type-occupation":"Propriétaire bailleur (logement loué)","nb-habitants":1,"type-residence":"Résidence principale","commodat":"Non","projet-vente":"Non","demembrement":"Non","nb-fenetres":8,"nb-simple-vitrage":0,"nb-occultations":8,"nb-occultations-origine":2,"nb-stores":0,"changement-menuiseries":["Non, aucun changement récent"],"type-chauffage":"Collectif","energie-chauffage":"Gaz","type-ecs":"Collectif","energie-ecs":"Même système que le chauffage","nb-radiateurs":6,"regulation-radiateurs":"Oui, sur tous les radiateurs","pathologies":["Humidité / condensation"],"inconforts":["Froid en hiver","Parois ou sols froids"]}$json$::jsonb, 2, 44060, 42310, 'bailleur', 'Violet', false, 5, true, 37),
      ('Christine GUERIN', $json${"nom":"Christine GUERIN","telephone":"06 25 19 85 62","adresse":"12 rue des Jardins, 67200 Strasbourg","email":"","type-coproprietaire":"Personne physique","nb-personnes-foyer":3,"composition-menage":"Famille monoparentale","nb-personnes-charge":2,"rfr-foyer":41180,"rfr-n2":42290,"accord-visite":"Oui, sous conditions (précisez)","curatelle-tutelle":"Non","situation-sociale":"Non","importance-travaux":"Peu utiles"}$json$::jsonb, $json${"type-occupation":"Propriétaire bailleur (logement loué)","nb-habitants":3,"type-residence":"Résidence principale","commodat":"Non","projet-vente":"Non","demembrement":"Non","nb-fenetres":7,"nb-simple-vitrage":0,"nb-occultations":7,"nb-occultations-origine":7,"nb-stores":0,"changement-menuiseries":["Oui, les fenêtres"],"type-chauffage":"Collectif","energie-chauffage":"Gaz","type-ecs":"Collectif","energie-ecs":"Même système que le chauffage","nb-radiateurs":7,"regulation-radiateurs":"Oui, sur tous les radiateurs","pathologies":["Humidité / condensation"],"inconforts":["Chaleur excessive en été"]}$json$::jsonb, 3, 41180, 42290, 'bailleur', 'Violet', true, 5, true, 37),
      ('Julie et Vincent ROUX', $json${"nom":"Julie et Vincent ROUX","telephone":"","adresse":"26 avenue de la République, 68000 Colmar","email":"","type-coproprietaire":"Personne physique","nb-personnes-foyer":3,"composition-menage":"Couple avec enfant(s)","nb-personnes-charge":1,"rfr-foyer":51200,"rfr-n2":51450,"accord-visite":"Oui","curatelle-tutelle":"Non","situation-sociale":"Non","importance-travaux":"Utiles"}$json$::jsonb, $json${"type-occupation":"Propriétaire occupant","nb-habitants":3,"type-residence":"Résidence principale","commodat":"Non","projet-vente":"Oui, après les travaux","demembrement":"Non","nb-fenetres":7,"nb-simple-vitrage":0,"nb-occultations":7,"nb-occultations-origine":7,"nb-stores":3,"changement-menuiseries":["Non, aucun changement récent"],"type-chauffage":"Collectif","energie-chauffage":"Gaz","type-ecs":"Collectif","energie-ecs":"Même système que le chauffage","nb-radiateurs":4,"regulation-radiateurs":"Oui, sur tous les radiateurs","pathologies":["Aucune pathologie"],"inconforts":["Froid en hiver","Courants d'air"]}$json$::jsonb, 3, 51200, 51450, 'occupant', 'Violet', true, 6, true, 45),
      ('Maxime DUBOIS', $json${"nom":"Maxime DUBOIS","telephone":"06 27 48 98 74","adresse":"26 avenue de la République, 68000 Colmar","email":"","type-coproprietaire":"Personne physique","nb-personnes-foyer":1,"composition-menage":"Personne seule","nb-personnes-charge":0,"rfr-foyer":27530,"rfr-n2":26840,"accord-visite":"Non","curatelle-tutelle":"Non","situation-sociale":"Non","importance-travaux":"Indispensables"}$json$::jsonb, $json${"type-occupation":"Propriétaire occupant","nb-habitants":1,"type-residence":"Résidence principale","commodat":"Non","projet-vente":"Je ne sais pas encore","demembrement":"Non","nb-fenetres":4,"nb-simple-vitrage":0,"nb-occultations":4,"nb-occultations-origine":2,"nb-stores":1,"changement-menuiseries":["Oui, les fenêtres"],"type-chauffage":"Collectif","energie-chauffage":"Gaz","type-ecs":"Collectif","energie-ecs":"Même système que le chauffage","nb-radiateurs":6,"regulation-radiateurs":"Je ne sais pas","pathologies":["Aucune pathologie"],"inconforts":["Froid en hiver","Courants d'air"]}$json$::jsonb, 1, 27530, 26840, 'occupant', 'Violet', false, 2, true, 20)
    ) as t(nom, copro, lot_hab, nb_personnes, rfr, rfr_n2, occupation, profil, verifie, jours_verif, complet, jours)
  loop
    select id into v_cp from coproprietaires where copro_id = v_copro and nom = r.nom;
    select coalesce(jsonb_object_agg(l.id::text,
      case l.usage
        when 'habitation' then jsonb_build_object('usage-lot', 'Habitation') || r.lot_hab
        when 'garage' then jsonb_build_object('usage-lot', 'Garage', 'lot-parent', l.rattache_a::text)
        when 'caves' then jsonb_build_object('usage-lot', 'Cave', 'lot-parent', l.rattache_a::text)
        else jsonb_build_object('usage-lot', 'Autre')
      end), '{}'::jsonb)
    into v_lots
    from lots l where l.coproprietaire_id = v_cp;

    insert into enquete_reponses (enquete_id, coproprietaire_id, nb_personnes, rfr, rfr_n2, statut_occupation, profil_mpr,
                                  profil_statut, profil_verifie_le, profil_verifie_par, reponses, updated_at)
    values (
      v_enq, v_cp, r.nb_personnes, r.rfr, r.rfr_n2, r.occupation, r.profil,
      case when r.verifie and v_verif is not null then 'verifie' else 'declaratif' end,
      case when r.verifie and v_verif is not null then now() - (r.jours_verif || ' days')::interval else null end,
      case when r.verifie and v_verif is not null then v_verif else null end,
      jsonb_build_object('copro', r.copro, 'lots', v_lots, 'complet', r.complet)
        || case when r.complet then jsonb_build_object('transmisLe', to_char(now() - (r.jours || ' days')::interval, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'attestation', true) else '{}'::jsonb end,
      now() - (r.jours || ' days')::interval
    );
  end loop;
end $$;

-- Configuration du prêt collectif (CEGEE, 20 ans, adhésion ouverte, date limite du choix dans 30 jours)
insert into copro_financement_config (copro_id, banque, duree_annees, adhesion_ouverte, date_limite_choix)
select id, 'CEGEE', 20, true, current_date + 30 from coproprietes where slug = 'test-les-balcons-de-la-lauch'
on conflict (copro_id) do nothing;

-- Partage du PF validé au portail : scénario pont + plans individuels (comme usePartagerPfCopros)
do $$
declare
  v_copro uuid;
  v_plan uuid;
  v_scen uuid;
  r record;
begin
  select id into v_copro from coproprietes where slug = 'test-les-balcons-de-la-lauch';
  if v_copro is null then return; end if;
  select id into v_plan from plans_definitifs where copro_id = v_copro and statut = 'valide' order by updated_at desc limit 1;
  if v_plan is null then
    raise exception 'PF définitif validé absent - jouer le bloc PF d''abord.';
  end if;
  if exists (select 1 from scenarios_financiers where plan_definitif_id = v_plan) then
    raise notice 'Scénario pont déjà présent - bloc partage sauté.';
    return;
  end if;
  insert into scenarios_financiers (copro_id, name, statut, locked, bareme_millesime, params, plan_definitif_id, created_at, updated_at)
  values (v_copro, 'PF définitif - Les Balcons de la Lauch', 'partage', true, 2026, $json${"travaux":629819,"honoraires":126406.06,"aleas":44087.33,"cle":"MUN","totalCle":10000,"mprCoproPct":60.58,"bonusPassoire":false,"cee":31000,"fonds":42000,"profils":{"Bleu":0,"Jaune":0,"Violet":0,"Rose":0},"primeIndiv":{"Bleu":3000,"Jaune":2250,"Violet":1500,"Rose":0},"ecoPtz":true,"ecoPtzDuree":20,"ecoPtzPct":100,"avancePct":70,"pretComplActif":false,"pretComplDuree":12}$json$::jsonb, v_plan, now() - interval '40 days', now() - interval '40 days')
  returning id into v_scen;

  for r in
    select * from (values
      ('SCI SCHMITT PATRIMOINE', 652, 52180.37, 2021.2, 27614.13, 22545.04),
      ('Bernard et Josiane KLEIN', 564, 45137.62, 1748.4, 23887.07, 19502.15),
      ('Marius ONBUS', 442, 35373.81, 1370.2, 18720.01, 15283.6),
      ('Martine et Francois MULLER', 434, 34733.56, 1345.4, 18381.19, 15006.97),
      ('Laurent ROSSI', 434, 34733.56, 1345.4, 18381.19, 15006.97),
      ('Sophie et Thomas FOURNIER', 422, 33773.18, 1308.2, 17872.95, 14592.03),
      ('Ines BLANC', 422, 33773.18, 1308.2, 17872.95, 14592.03),
      ('Camille et Jean MOREAU', 421, 33693.15, 1305.1, 17830.6, 14557.45),
      ('Patricia GAUTHIER', 414, 33132.93, 1283.4, 17534.13, 14315.41),
      ('Claire BENALI', 346, 27690.81, 1072.6, 14654.12, 11964.08),
      ('Jean HADDAD', 346, 27690.81, 1072.6, 14654.12, 11964.08),
      ('Maxime et Anne FERREIRA', 346, 27690.81, 1072.6, 14654.12, 11964.08),
      ('Mehdi NGUYEN', 346, 27690.81, 1072.6, 14654.12, 11964.08),
      ('Jean et Christine BIANCHI', 346, 27690.81, 1072.6, 14654.12, 11964.08),
      ('Pierre MAXTAFF', 334, 26730.43, 1035.4, 14145.89, 11549.14),
      ('Maxime et Catherine LAMBERT', 334, 26730.43, 1035.4, 14145.89, 11549.14),
      ('Mehdi BONNET', 334, 26730.43, 1035.4, 14145.89, 11549.14),
      ('Christine GUERIN', 334, 26730.43, 1035.4, 14145.89, 11549.14),
      ('Julie et Vincent ROUX', 334, 26730.43, 1035.4, 14145.89, 11549.14),
      ('Monique GIRARD', 333, 26650.4, 1032.3, 14103.54, 11514.57),
      ('Cyrielle ONTHEMIC', 326, 26090.18, 1010.6, 13807.07, 11272.52),
      ('Sandrine et Alain DA COSTA', 258, 20648.06, 799.8, 10927.06, 8921.2),
      ('Manon et Lucas TRAN', 258, 20648.06, 799.8, 10927.06, 8921.2),
      ('Paul MERCIER', 246, 19687.68, 762.6, 10418.83, 8506.26),
      ('Maxime DUBOIS', 246, 19687.68, 762.6, 10418.83, 8506.26),
      ('Isabelle et Vincent DUPONT', 245, 19607.65, 759.5, 10376.48, 8471.68),
      ('Jean et Chloe ROBERT', 245, 19607.65, 759.5, 10376.48, 8471.68),
      ('Christophe LEFEVRE', 238, 19047.43, 737.8, 10080, 8229.63)
    ) as t(nom, tantiemes, quote_part, cee_part, subv_coll_part, reste)
  loop
    insert into plans_individuels (scenario_id, coproprietaire_id, tantiemes, quote_part, mpr_indiv, cee_part, subv_coll_part, eco_ptz_part, reste, mensualite, detail)
    select v_scen, cp.id, r.tantiemes, r.quote_part, 0, r.cee_part, r.subv_coll_part, 0, r.reste, 0,
           jsonb_build_object('source', 'pf', 'planDefinitifId', v_plan)
    from coproprietaires cp where cp.copro_id = v_copro and cp.nom = r.nom;
  end loop;
end $$;

-- Choix de financement transmis (portail) ou saisis (syndic / AMO), puis adhésions au prêt collectif
do $$
declare
  v_copro uuid;
  v_scen uuid;
  v_amo uuid;
  r record;
  v_cp uuid;
begin
  select id into v_copro from coproprietes where slug = 'test-les-balcons-de-la-lauch';
  if v_copro is null then return; end if;
  select s.id into v_scen from scenarios_financiers s
  where s.copro_id = v_copro and s.statut = 'partage' order by s.updated_at desc limit 1;
  if v_scen is null then
    raise exception 'Scénario partagé absent - jouer le bloc de partage d''abord.';
  end if;
  select u.id into v_amo from auth.users u where u.email = 'amir@strateco.fr' limit 1;

  if not exists (select 1 from choix_financement where scenario_id = v_scen) then
    for r in
      select * from (values
      ('SCI SCHMITT PATRIMOINE', 'fonds', null, 'copro', 35),
      ('Bernard et Josiane KLEIN', 'collectif', null, 'copro', 35),
      ('Claire BENALI', 'collectif', null, 'amo', 34),
      ('Jean HADDAD', 'collectif', null, 'copro', 13),
      ('Manon et Lucas TRAN', 'collectif', null, 'copro', 6),
      ('Laurent ROSSI', 'collectif', null, 'copro', 9),
      ('Jean et Christine BIANCHI', 'collectif', null, 'copro', 25),
      ('Christophe LEFEVRE', 'collectif', null, 'copro', 28),
      ('Patricia GAUTHIER', 'collectif', null, 'copro', 13),
      ('Isabelle et Vincent DUPONT', 'collectif', null, 'copro', 8),
      ('Camille et Jean MOREAU', 'collectif', null, 'copro', 33),
      ('Monique GIRARD', 'individuel', 10, 'copro', 35),
      ('Jean et Chloe ROBERT', 'individuel', 20, 'copro', 16),
      ('Sophie et Thomas FOURNIER', 'individuel', 15, 'copro', 9),
      ('Maxime et Catherine LAMBERT', 'collectif', null, 'copro', 32),
      ('Mehdi BONNET', 'fonds', null, 'copro', 12),
      ('Ines BLANC', 'individuel', 20, 'copro', 6),
      ('Maxime DUBOIS', 'individuel', 20, 'copro', 25)
      ) as t(nom, type, duree, saisi_par, jours)
    loop
      select id into v_cp from coproprietaires where copro_id = v_copro and nom = r.nom;
      insert into choix_financement (scenario_id, coproprietaire_id, type, duree_annees, lot_ids, transmitted_at, updated_at, saisi_par, updated_by)
      values (
        v_scen, v_cp, r.type::type_financement, r.duree,
        case when r.type = 'individuel'
             then coalesce((select array_agg(l.id) from lots l where l.coproprietaire_id = v_cp and l.usage = 'habitation'), '{}'::uuid[])
             else '{}'::uuid[] end,
        now() - (r.jours || ' days')::interval,
        now() - (r.jours || ' days')::interval,
        r.saisi_par,
        case r.saisi_par when 'amo' then v_amo else null end
      );
    end loop;
  end if;

  if not exists (select 1 from adhesions_pret where copro_id = v_copro) then
    for r in
      select * from (values
      ('Bernard et Josiane KLEIN', 'signee', $json${"adherent1":{"nomPrenom":"KLEIN Bernard","nomNaissance":"KLEIN","dateLieuNaissance":"09/06/1960 à Metz","profession":"Cadre commercial","professionDepuis":"01/04/2021","situation":"pacsee","situationDepuis":""},"adherent2":{"nomPrenom":"KLEIN Josiane","nomNaissance":"KLEIN","dateLieuNaissance":"02/04/1966 à Strasbourg","profession":"Agent administratif","professionDepuis":"01/07/1998","situation":"celibataire","situationDepuis":""},"adresse":"6 rue de la Republique","cp":"69002","ville":"Lyon","telDomicile":"","telBureau":"","portable":"03 87 68 45 70","email":"","montantType":"100","montantAutre":"","lieuSignature":"Colmar"}$json$::jsonb, 33, 'concordant'),
      ('Claire BENALI', 'signee', $json${"adherent1":{"nomPrenom":"BENALI Claire","nomNaissance":"BENALI","dateLieuNaissance":"07/06/1975 à Colmar","profession":"Ingenieur(e)","professionDepuis":"01/02/1999","situation":"veuve","situationDepuis":"10/05/1984"},"adherent2":null,"adresse":"26 avenue de la République","cp":"68000","ville":"Colmar","telDomicile":"","telBureau":"","portable":"06 29 62 50 43","email":"","montantType":"100","montantAutre":"","lieuSignature":"Colmar"}$json$::jsonb, 34, 'concordant'),
      ('Jean HADDAD', 'brouillon', $json${"adherent1":{"nomPrenom":"HADDAD Jean","nomNaissance":"ADAM","dateLieuNaissance":"12/03/1956 à Selestat","profession":"Chauffeur-livreur","professionDepuis":"01/11/1995","situation":"veuve","situationDepuis":""},"adherent2":null,"adresse":"31 boulevard Voltaire","cp":"75011","ville":"Paris","telDomicile":"","telBureau":"","portable":"06 49 98 46 84","email":"","montantType":"100","montantAutre":"","lieuSignature":""}$json$::jsonb, 10, null),
      ('Manon et Lucas TRAN', 'brouillon', $json${"adherent1":{"nomPrenom":"TRAN Manon","nomNaissance":"SCHMITT","dateLieuNaissance":"11/08/1980 à Strasbourg","profession":"Comptable","professionDepuis":"01/01/2003","situation":"divorcee","situationDepuis":""},"adherent2":null,"adresse":"3 place Kleber","cp":"67000","ville":"Strasbourg","telDomicile":"","telBureau":"","portable":"","email":"","montantType":"100","montantAutre":"","lieuSignature":""}$json$::jsonb, 6, null),
      ('Laurent ROSSI', 'signee', $json${"adherent1":{"nomPrenom":"ROSSI Laurent","nomNaissance":"ROSSI","dateLieuNaissance":"15/09/1976 à Colmar","profession":"Cadre commercial","professionDepuis":"01/06/2009","situation":"celibataire","situationDepuis":"12/04/2021"},"adherent2":null,"adresse":"26 avenue de la République","cp":"68000","ville":"Colmar","telDomicile":"","telBureau":"","portable":"06 59 25 71 75","email":"","montantType":"100","montantAutre":"","lieuSignature":"Colmar"}$json$::jsonb, 9, 'non_verifie'),
      ('Jean et Christine BIANCHI', 'brouillon', $json${"adherent1":{"nomPrenom":"BIANCHI Jean","nomNaissance":"BIANCHI","dateLieuNaissance":"23/02/1985 à Mulhouse","profession":"Chauffeur-livreur","professionDepuis":"01/04/2021","situation":"mariee","situationDepuis":""},"adherent2":null,"adresse":"26 avenue de la République","cp":"68000","ville":"Colmar","telDomicile":"","telBureau":"","portable":"06 50 89 66 67","email":"","montantType":"100","montantAutre":"","lieuSignature":""}$json$::jsonb, 25, null),
      ('Christophe LEFEVRE', 'signee', $json${"adherent1":{"nomPrenom":"LEFEVRE Christophe","nomNaissance":"LEFEVRE","dateLieuNaissance":"09/01/1977 à Paris","profession":"Ingenieur(e)","professionDepuis":"01/06/2022","situation":"celibataire","situationDepuis":""},"adherent2":null,"adresse":"22 avenue du General Leclerc","cp":"54500","ville":"Vandoeuvre-les-Nancy","telDomicile":"","telBureau":"","portable":"06 56 28 57 54","email":"","montantType":"100","montantAutre":"","lieuSignature":"Colmar"}$json$::jsonb, 26, 'concordant'),
      ('Patricia GAUTHIER', 'brouillon', $json${"adherent1":{"nomPrenom":"GAUTHIER Patricia","nomNaissance":"GAUTHIER","dateLieuNaissance":"11/03/1980 à Paris","profession":"Cadre commercial","professionDepuis":"01/07/2014","situation":"divorcee","situationDepuis":""},"adherent2":null,"adresse":"45 rue des Clefs","cp":"68000","ville":"Colmar","telDomicile":"","telBureau":"","portable":"06 43 57 68 71","email":"","montantType":"100","montantAutre":"","lieuSignature":""}$json$::jsonb, 8, null),
      ('Isabelle et Vincent DUPONT', 'brouillon', $json${"adherent1":{"nomPrenom":"DUPONT Isabelle","nomNaissance":"NGUYEN","dateLieuNaissance":"06/05/1958 à Colmar","profession":"Comptable","professionDepuis":"01/02/2007","situation":"celibataire","situationDepuis":""},"adherent2":null,"adresse":"26 avenue de la République","cp":"68000","ville":"Colmar","telDomicile":"","telBureau":"","portable":"","email":"","montantType":"100","montantAutre":"","lieuSignature":""}$json$::jsonb, 4, null),
      ('Camille et Jean MOREAU', 'signee', $json${"adherent1":{"nomPrenom":"MOREAU Camille","nomNaissance":"MOREAU","dateLieuNaissance":"12/05/1954 à Mulhouse","profession":"Ingenieur(e)","professionDepuis":"01/11/2009","situation":"celibataire","situationDepuis":"09/09/2010"},"adherent2":{"nomPrenom":"MOREAU Jean","nomNaissance":"MOREAU","dateLieuNaissance":"23/02/1984 à Mulhouse","profession":"Pharmacien(ne)","professionDepuis":"01/01/2000","situation":"pacsee","situationDepuis":""},"adresse":"26 avenue de la République","cp":"68000","ville":"Colmar","telDomicile":"","telBureau":"","portable":"03 39 70 45 53","email":"","montantType":"100","montantAutre":"","lieuSignature":"Colmar"}$json$::jsonb, 29, 'concordant'),
      ('Maxime et Catherine LAMBERT', 'signee', $json${"adherent1":{"nomPrenom":"LAMBERT Maxime","nomNaissance":"LAMBERT","dateLieuNaissance":"15/10/1948 à Colmar","profession":"Fonctionnaire territorial(e)","professionDepuis":"01/02/2006","situation":"celibataire","situationDepuis":"21/06/1981"},"adherent2":{"nomPrenom":"LAMBERT Catherine","nomNaissance":"LAMBERT","dateLieuNaissance":"10/04/1987 à Paris","profession":"Artisan","professionDepuis":"01/09/2020","situation":"mariee","situationDepuis":""},"adresse":"26 avenue de la République","cp":"68000","ville":"Colmar","telDomicile":"","telBureau":"","portable":"06 36 54 66 19","email":"","montantType":"100","montantAutre":"","lieuSignature":"Colmar"}$json$::jsonb, 27, 'concordant')
      ) as t(nom, statut, form, jours, rib)
    loop
      select id into v_cp from coproprietaires where copro_id = v_copro and nom = r.nom;
      insert into adhesions_pret (copro_id, coproprietaire_id, scenario_id, statut, form, lieu_signature, signed_at, rib_concordance, created_at, updated_at)
      values (
        v_copro, v_cp, v_scen, r.statut, r.form,
        case when r.statut = 'signee' then 'Colmar' else null end,
        case when r.statut = 'signee' then now() - (r.jours || ' days')::interval else null end,
        r.rib,
        now() - (r.jours || ' days')::interval - interval '1 hour',
        now() - (r.jours || ' days')::interval
      );
    end loop;
  end if;
end $$;

commit;

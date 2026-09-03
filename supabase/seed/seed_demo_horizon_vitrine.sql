-- Copro vitrine de la démo commerciale : LE PARC DES CIGOGNES (fictive).
-- GÉNÉRÉ par gen_seed_demo_horizon.ts - ne pas éditer à la main, relancer :
--   npx vite-node supabase/seed/gen_seed_demo_horizon.ts
-- Prérequis : seed_demo_horizon.sql (organisation, copropriétés, gestionnaires).
-- Idempotent : chaque bloc se saute s'il a déjà été joué.
--
-- Totaux calculés par le moteur de l'app (computePlanDefinitif) :
--   travaux TTC 578125 EUR - opération TTC 732847.71 EUR
--   aides 406989.49 EUR (dont CEE 16000) - couverture 0.6 %
--   reste à charge collectif 254258.22 EUR - gain énergétique 72 %

begin;

-- ========== Copropriétaires, lots et tantièmes (clé unique MUN) ==========
do $$
declare
  v_copro uuid;
  v_bat uuid;
  v_cle uuid;
  r record;
  v_cp uuid;
  v_hab uuid;
  v_lot uuid;
begin
  select id into v_copro from coproprietes where slug = 'demo-parc-des-cigognes';
  if v_copro is null then
    raise exception 'Copropriété demo-parc-des-cigognes absente - jouer seed_demo_horizon.sql d''abord.';
  end if;
  if exists (select 1 from lots where copro_id = v_copro) then
    raise notice 'Lots déjà présents - bloc données sauté.';
    return;
  end if;

  select id into v_bat from batiments where copro_id = v_copro and code = '01';

  insert into cles_repartition (copro_id, code, label, is_default)
  values (v_copro, 'MUN', 'Tantièmes généraux', true)
  on conflict do nothing;
  select id into v_cle from cles_repartition where copro_id = v_copro and code = 'MUN';

  for r in
    select * from (values
      ('Paul et Sophie WEBER', 'occupant', '101', 340, 'G01', 'C01'),
      ('Anne SCHNEIDER', 'occupant', '102', 320, null, null),
      ('Jean MULLER', 'bailleur', '103', 305, 'G02', null),
      ('Marc et Julie KLEIN', 'occupant', '104', 330, 'G03', null),
      ('SCI LES CIGOGNES', 'bailleur', '105', 365, 'G04', null),
      ('Claire HOFFMANN', 'occupant', '106', 275, null, null),
      ('Pierre SCHMITT', 'occupant', '107', 290, null, 'C02'),
      ('Monique LEHMANN', 'occupant', '108', 265, null, null),
      ('Luc et Emma WAGNER', 'occupant', '201', 340, 'G05', null),
      ('Karim BENTAHAR', 'occupant', '202', 320, null, null),
      ('Linh NGUYEN', 'occupant', '203', 305, null, null),
      ('Denis ROTHENBERGER', 'bailleur', '204', 330, null, 'C03'),
      ('Maria DA SILVA', 'occupant', '205', 365, 'G06', null),
      ('David et Laura BAUMANN', 'occupant', '206', 275, null, null),
      ('Indivision FRITSCH', 'occupant', '207', 290, null, null),
      ('Samia AMARA', 'occupant', '208', 265, null, null),
      ('Michel GERBER', 'occupant', '301', 340, 'G07', null),
      ('Nathalie WENDLING', 'bailleur', '302', 320, null, null),
      ('Carlos et Ana LOPEZ', 'occupant', '303', 305, null, null),
      ('Robert KAUFFMANN', 'occupant', '304', 330, null, 'C04'),
      ('Brigitte ZIMMERMANN', 'occupant', '305', 365, null, null),
      ('Francois HECKEL', 'bailleur', '306', 275, 'G08', null),
      ('Julien et Marie ROUSSEL', 'occupant', '307', 290, null, null),
      ('Sylvie KOENIG', 'occupant', '308', 265, null, 'C05'),
      ('Nabil TOUATI', 'occupant', '401', 610, null, null),
      ('Isabelle EBERLE', 'occupant', '402', 590, null, null),
      ('SCI DU RIED', 'bailleur', '403', 560, null, 'C06'),
      ('Hugo et Celine MARTIN', 'occupant', '404', 510, null, null)
    ) as t(nom, type, lot_hab, tant, lot_garage, lot_cave)
  loop
    insert into coproprietaires (copro_id, nom, type)
    values (v_copro, r.nom, r.type)
    returning id into v_cp;

    insert into lots (copro_id, batiment_id, coproprietaire_id, num, usage)
    values (v_copro, v_bat, v_cp, r.lot_hab, 'habitation')
    returning id into v_hab;
    insert into lot_tantiemes (lot_id, cle_id, tantiemes) values (v_hab, v_cle, r.tant);

    if r.lot_garage is not null then
      insert into lots (copro_id, batiment_id, coproprietaire_id, num, usage, rattache_a)
      values (v_copro, v_bat, v_cp, r.lot_garage, 'garage', v_hab)
      returning id into v_lot;
      insert into lot_tantiemes (lot_id, cle_id, tantiemes) values (v_lot, v_cle, 25);
    end if;

    if r.lot_cave is not null then
      insert into lots (copro_id, batiment_id, coproprietaire_id, num, usage, rattache_a)
      values (v_copro, v_bat, v_cp, r.lot_cave, 'caves', v_hab)
      returning id into v_lot;
      insert into lot_tantiemes (lot_id, cle_id, tantiemes) values (v_lot, v_cle, 10);
    end if;
  end loop;
end $$;

-- ========== Enquête sociale (profils MaPrimeRénov) ==========
do $$
declare
  v_copro uuid;
  v_enq uuid;
  r record;
begin
  select id into v_copro from coproprietes where slug = 'demo-parc-des-cigognes';
  if v_copro is null or exists (select 1 from enquetes where copro_id = v_copro) then
    return;
  end if;

  insert into enquetes (copro_id, questions, statut, sent_at)
  values (v_copro, $json$[{"id":"nom","on":true},{"id":"telephone","on":true},{"id":"adresse","on":true},{"id":"email","on":true},{"id":"type-coproprietaire","on":true},{"id":"nb-indivisaires","on":true},{"id":"nb-associes-sci","on":true},{"id":"personne-physique-sci","on":true},{"id":"nb-personnes-foyer","on":true},{"id":"rfr-foyer","on":true},{"id":"accord-visite","on":true},{"id":"curatelle-tutelle","on":true},{"id":"situation-sociale","on":true},{"id":"importance-travaux","on":false},{"id":"etat-parties-communes","on":false},{"id":"securite-parties-communes","on":false},{"id":"usage-lot","on":true},{"id":"lot-parent","on":true},{"id":"type-occupation","on":true},{"id":"nb-habitants","on":true},{"id":"type-residence","on":true},{"id":"commodat","on":true},{"id":"associes-occupants","on":true},{"id":"indivisaires-occupants","on":true},{"id":"projet-vente","on":true},{"id":"associes-exploitants","on":true},{"id":"demembrement","on":true},{"id":"nb-fenetres","on":true},{"id":"nb-simple-vitrage","on":true},{"id":"nb-occultations","on":true},{"id":"nb-occultations-origine","on":true},{"id":"nb-stores","on":true},{"id":"changement-menuiseries","on":true},{"id":"type-chauffage","on":true},{"id":"energie-chauffage","on":true},{"id":"date-chaudiere","on":true},{"id":"type-ecs","on":true},{"id":"energie-ecs","on":true},{"id":"nb-radiateurs","on":true},{"id":"regulation-radiateurs","on":true},{"id":"pathologies","on":true},{"id":"inconforts","on":true},{"id":"duree-occupation","on":false},{"id":"tranches-age","on":false},{"id":"csp","on":false},{"id":"ressenti-ete","on":false},{"id":"ressenti-hiver","on":false},{"id":"confort-phonique","on":false},{"id":"detecteurs","on":false},{"id":"projet-travaux","on":false}]$json$::jsonb, 'envoyee', now() - interval '45 days')
  returning id into v_enq;

  for r in
    select * from (values
      ('Paul et Sophie WEBER', 2, 31800, 'Proprietaire occupant', 'Jaune'),
      ('Anne SCHNEIDER', 1, 17200, 'Proprietaire occupant', 'Bleu'),
      ('Jean MULLER', null, null, 'Proprietaire bailleur (logement loue)', null),
      ('Marc et Julie KLEIN', 3, 44600, 'Proprietaire occupant', 'Violet'),
      ('SCI LES CIGOGNES', null, null, 'Proprietaire bailleur (logement loue)', null),
      ('Claire HOFFMANN', 1, 24900, 'Proprietaire occupant', 'Violet'),
      ('Pierre SCHMITT', 2, 27400, 'Proprietaire occupant', 'Jaune'),
      ('Monique LEHMANN', 1, 14300, 'Proprietaire occupant', 'Bleu'),
      ('Luc et Emma WAGNER', 4, 52300, 'Proprietaire occupant', 'Violet'),
      ('Karim BENTAHAR', 3, 33100, 'Proprietaire occupant', 'Jaune'),
      ('Linh NGUYEN', 2, 41500, 'Proprietaire occupant', 'Violet'),
      ('Denis ROTHENBERGER', null, null, 'Proprietaire bailleur (logement loue)', null),
      ('Maria DA SILVA', 2, 22800, 'Proprietaire occupant', 'Bleu'),
      ('David et Laura BAUMANN', 2, 58200, 'Proprietaire occupant', 'Rose'),
      ('Indivision FRITSCH', 1, 19600, 'Proprietaire occupant', 'Jaune'),
      ('Samia AMARA', 2, 20900, 'Proprietaire occupant', 'Bleu'),
      ('Michel GERBER', 1, 36400, 'Proprietaire occupant', 'Rose'),
      ('Nathalie WENDLING', null, null, 'Proprietaire bailleur (logement loue)', null),
      ('Carlos et Ana LOPEZ', 5, 47800, 'Proprietaire occupant', 'Jaune'),
      ('Robert KAUFFMANN', 1, 12100, 'Proprietaire occupant', 'Bleu'),
      ('Brigitte ZIMMERMANN', 2, 63500, 'Proprietaire occupant', 'Rose'),
      ('Francois HECKEL', null, null, 'Proprietaire bailleur (logement loue)', null),
      ('Julien et Marie ROUSSEL', 4, 38900, 'Proprietaire occupant', 'Jaune'),
      ('Sylvie KOENIG', 1, 15800, 'Proprietaire occupant', 'Bleu'),
      ('Nabil TOUATI', 4, 71200, 'Proprietaire occupant', 'Rose'),
      ('Isabelle EBERLE', 2, 29700, 'Proprietaire occupant', 'Jaune'),
      ('SCI DU RIED', null, null, 'Proprietaire bailleur (logement loue)', null),
      ('Hugo et Celine MARTIN', 3, 26200, 'Proprietaire occupant', 'Bleu')
    ) as t(nom, personnes, rfr, occupation, profil)
  loop
    insert into enquete_reponses (enquete_id, coproprietaire_id, nb_personnes, rfr, statut_occupation, profil_mpr, reponses)
    select v_enq, cp.id, r.personnes, r.rfr, r.occupation, r.profil, '{}'::jsonb
    from coproprietaires cp
    where cp.copro_id = v_copro and cp.nom = r.nom;
  end loop;
end $$;

-- ========== PF définitif validé (data + resultat figés par le moteur) ==========
do $$
declare
  v_copro uuid;
begin
  select id into v_copro from coproprietes where slug = 'demo-parc-des-cigognes';
  if v_copro is null or exists (select 1 from plans_definitifs where copro_id = v_copro) then
    return;
  end if;

  insert into plans_definitifs (copro_id, nom, data, resultat, statut, source_fichier)
  values (
    v_copro,
    'PF définitif - Le Parc des Cigognes',
    $json${"infos":{"nomCopro":"LE PARC DES CIGOGNES","adresse":"12-14 rue des Cigognes 67000 Strasbourg","nbLogements":28,"nbLogementsEquiv":28,"surfaceHabitable":1780,"nbEtages":5,"nbEntrees":2,"typeChauffage":"Fioul collectif","cepInitial":328,"cepProjet":92,"dispositifClimaxion":true,"etiquetteInitiale":"F","etiquetteProjet":"C"},"lots":[{"numero":1,"titre":"Isolation thermique par l'exterieur","entreprise":"FACADES DE L'ILL","remisePct":0,"lignes":[{"retenu":true,"tvaPct":5.5,"montantHt":38000,"designation":"Echafaudage"},{"retenu":true,"tvaPct":5.5,"montantHt":182000,"designation":"Isolation thermique par l'exterieur en laine de roche 200 mm"},{"retenu":true,"tvaPct":5.5,"montantHt":42000,"designation":"Traitement des balcons"},{"retenu":true,"tvaPct":5.5,"montantHt":24000,"designation":"Garde-corps"},{"retenu":true,"tvaPct":5.5,"montantHt":9500,"designation":"Bandeaux et departs"},{"retenu":false,"tvaPct":10,"montantHt":4200,"designation":"Soubassement"},{"retenu":false,"tvaPct":10,"montantHt":9800,"designation":"Sous-faces de balcons"},{"retenu":false,"tvaPct":10,"montantHt":6500,"designation":"Peinture des parties communes"}]},{"numero":2,"titre":"Toiture et etancheite","entreprise":"TOITURES DU RIED","remisePct":0,"lignes":[{"retenu":true,"tvaPct":5.5,"montantHt":16000,"designation":"Depose de la couverture existante"},{"retenu":true,"tvaPct":5.5,"montantHt":21500,"designation":"Isolation sarking 220 mm R=7,5 m2.K/W"},{"retenu":true,"tvaPct":5.5,"montantHt":38500,"designation":"Couverture zinc a joint debout"},{"retenu":true,"tvaPct":5.5,"montantHt":19800,"designation":"Etancheite terrasse avec isolation polyurethane 170 mm"},{"retenu":true,"tvaPct":5.5,"montantHt":8200,"designation":"Zingueries et cheneaux"}]},{"numero":3,"titre":"Chaufferie","entreprise":"THERMIC EST","remisePct":0,"lignes":[{"retenu":true,"tvaPct":5.5,"montantHt":46000,"designation":"Remplacement de la chaudiere fioul par une chaudiere gaz a condensation"},{"retenu":true,"tvaPct":5.5,"montantHt":11500,"designation":"Calorifugeage des reseaux"},{"retenu":true,"tvaPct":5.5,"montantHt":8200,"designation":"Equilibrage des reseaux"},{"retenu":false,"tvaPct":10,"montantHt":5400,"designation":"Reprise du conduit de fumee"}]},{"numero":4,"titre":"Ventilation","entreprise":"AIRFLUX ALSACE","remisePct":0,"lignes":[{"retenu":true,"tvaPct":5.5,"montantHt":8400,"designation":"Caissons d'extraction hygroreglables"},{"retenu":true,"tvaPct":5.5,"montantHt":9600,"designation":"Gaines et bouches d'extraction"},{"retenu":true,"tvaPct":5.5,"montantHt":3800,"designation":"Carottages et calfeutrements"},{"retenu":true,"tvaPct":5.5,"montantHt":1400,"designation":"Mise en service et reglages"}]},{"numero":5,"titre":"Menuiseries des parties communes","entreprise":"FENETRES RHENANES","remisePct":0,"lignes":[{"retenu":true,"tvaPct":5.5,"montantHt":7400,"designation":"Portes de halls avec gache electrique"},{"retenu":true,"tvaPct":5.5,"montantHt":5200,"designation":"Chassis des cages d'escalier"},{"retenu":false,"tvaPct":10,"montantHt":1900,"designation":"Volets des locaux communs"}]},{"numero":6,"titre":"Etancheite a l'air","entreprise":"ISOL'AIR GRAND EST","remisePct":0,"lignes":[{"retenu":true,"tvaPct":5.5,"montantHt":18000,"designation":"Travaux d'impermeabilite a l'air"}]}],"moe":[{"phase":"etude","tvaPct":20,"montant":{"mode":"forfait","montantHt":1200},"entreprise":"STRAT ECO","designation":"Assistance Maitrise d'Ouvrage (phase conseil)","commentaire":"Phase conseil, assistance technique et approche financiere","eligibleMprAmo":true,"eligibleMprEtudes":false},{"phase":"etude","tvaPct":10,"montant":{"mode":"forfait","montantHt":5000},"entreprise":"ARCHILOGIS","designation":"Maitrise d'oeuvre phase etudes (DIAG-AVP)","commentaire":"Etude, avant-projet","eligibleMprAmo":false,"eligibleMprEtudes":true},{"phase":"etude","tvaPct":20,"montant":{"mode":"forfait","montantHt":700},"entreprise":"EST THERMO CONSEIL","designation":"Audit reglementaire","commentaire":"Mise a jour","eligibleMprAmo":false,"eligibleMprEtudes":false},{"phase":"etude","tvaPct":20,"montant":{"mode":"forfait","montantHt":2600},"entreprise":"DIAG EXPERT 67","designation":"Diagnostic amiante avant travaux","eligibleMprAmo":false,"eligibleMprEtudes":false},{"phase":"projet","tvaPct":20,"montant":{"mode":"forfait","montantHt":3400},"entreprise":"STRAT ECO","designation":"Assistance Maitrise d'Ouvrage (phase projet)","commentaire":"Prestation obligatoire, assistance projet, administrative, financiere","eligibleMprAmo":true,"eligibleMprEtudes":false},{"phase":"projet","tvaPct":10,"montant":{"mode":"forfait","montantHt":28000},"entreprise":"ARCHILOGIS","designation":"Maitrise d'oeuvre phase conception (PRO-DCE)","commentaire":"Cahiers des charges, depot de DP, DCE","eligibleMprAmo":false,"eligibleMprEtudes":true},{"phase":"projet","tvaPct":20,"montant":{"mode":"forfait","montantHt":1500},"designation":"Controle technique","commentaire":"Prestations necessaires","eligibleMprAmo":false,"eligibleMprEtudes":true},{"phase":"projet","tvaPct":20,"montant":{"mode":"forfait","montantHt":950},"designation":"CSPS","commentaire":"Prestations necessaires","eligibleMprAmo":false,"eligibleMprEtudes":true},{"phase":"projet","tvaPct":20,"montant":{"mode":"forfait","montantHt":600},"entreprise":"AERO TEST","designation":"Test d'etancheite a l'air avant travaux","commentaire":"Obligation Climaxion","eligibleMprAmo":false,"eligibleMprEtudes":false},{"phase":"projet","tvaPct":20,"montant":{"mode":"forfait","montantHt":1800},"entreprise":"ARCHILOGIS","designation":"Memoire technique Climaxion","eligibleMprAmo":false,"eligibleMprEtudes":false},{"phase":"travaux","tvaPct":20,"montant":{"mode":"forfait","montantHt":6200},"entreprise":"STRAT ECO","designation":"Assistance Maitrise d'Ouvrage (phase travaux)","commentaire":"Prestation obligatoire, assistance projet, administrative, financiere","eligibleMprAmo":true,"eligibleMprEtudes":false},{"phase":"travaux","tvaPct":5.5,"montant":{"mode":"pctTravauxHt","taux":3.6},"entreprise":"ARCHILOGIS","designation":"Maitrise d'oeuvre phase travaux","commentaire":"Pilotage et reception des travaux","eligibleMprAmo":false,"eligibleMprEtudes":true},{"phase":"travaux","tvaPct":20,"montant":{"mode":"forfait","montantHt":3200},"designation":"Controle technique","commentaire":"Prestations necessaires","eligibleMprAmo":false,"eligibleMprEtudes":true},{"phase":"travaux","tvaPct":20,"montant":{"mode":"forfait","montantHt":1600},"designation":"CSPS","commentaire":"Prestations necessaires","eligibleMprAmo":false,"eligibleMprEtudes":true},{"phase":"travaux","tvaPct":20,"montant":{"mode":"forfait","montantHt":600},"entreprise":"AERO TEST","designation":"Test d'etancheite a l'air apres travaux","commentaire":"Obligation Climaxion","eligibleMprAmo":false,"eligibleMprEtudes":false},{"phase":"travaux","tvaPct":0,"montant":{"mode":"pctTravauxTtc","taux":2},"entreprise":"ASSURANCES DU RHIN","designation":"Dommage ouvrage","commentaire":"Obligatoire","eligibleMprAmo":false,"eligibleMprEtudes":false},{"phase":"travaux","tvaPct":20,"montant":{"mode":"pctTravauxHt","taux":2.5},"entreprise":"SYNDIC HORIZON GRAND EST","designation":"Honoraires syndic","commentaire":"Selon informations du syndic","eligibleMprAmo":false,"eligibleMprEtudes":false}],"aides":[{"id":"cee-fiche-par-fiche","groupe":"CEE","libelle":"CEE fiche par fiche","publique":false,"calcul":{"mode":"manuel","montant":16000},"commentaire":"Depend des lots de travaux energetiques et de la surface habitable"},{"id":"maprimerenov-partie-travaux","groupe":"ANAH","libelle":"Maprimerenov' partie travaux","publique":true,"calcul":{"mode":"pctAssietteTravaux","taux":45,"coef":1},"commentaire":"45 % du montant des travaux energetiques HT - plafonne a 11250 EUR par logement"},{"id":"maprimerenov-partie-etudes","groupe":"ANAH","libelle":"Maprimerenov' partie etudes","publique":true,"calcul":{"mode":"pctEtudes","taux":45,"coef":0.9},"commentaire":"45 % du montant des etudes, diags, maitrise d'oeuvre HT"},{"id":"maprimerenov-amo","groupe":"ANAH","libelle":"Maprimerenov' AMO","publique":true,"calcul":{"mode":"pctAmo","taux":50},"commentaire":"50 % du montant de la prestation d'assistance a maitrise d'ouvrage HT"},{"id":"maprimerenov-individuelle","groupe":"ANAH","libelle":"Maprimerenov' individuelle","publique":true,"calcul":{"mode":"info"},"commentaire":"Aide individuelle de 1500 EUR ou de 3000 EUR selon revenus du coproprietaire occupant"},{"id":"climaxion-aide-travaux","groupe":"Climaxion","libelle":"Climaxion aide travaux","publique":true,"calcul":{"mode":"forfaitPlusParLogement","base":10000,"parLogement":2500,"surEquivalent":true},"commentaire":"Dispositif Climaxion sous reserve d'eligibilite"},{"id":"climaxion-aide-amo","groupe":"Climaxion","libelle":"Climaxion aide AMO","publique":true,"calcul":{"mode":"manuel","montant":4000},"commentaire":"Aide Climaxion sur la prestation AMO"},{"id":"ems-aide-travaux","groupe":"EMS","libelle":"EMS aide travaux","publique":true,"calcul":{"mode":"parLogement","montant":1000,"surEquivalent":true},"commentaire":"Dispositif Eurometropole de Strasbourg suivant le cahier des charges Climaxion"},{"id":"ems-aide-moe","groupe":"EMS","libelle":"EMS aide MOE","publique":true,"calcul":{"mode":"manuel","montant":3000},"commentaire":"Dispositif EMS pour la maitrise d'oeuvre"},{"id":"ems-bbc-renovation","groupe":"EMS","libelle":"EMS BBC renovation","publique":true,"calcul":{"mode":"parLogement","montant":500,"surEquivalent":false},"commentaire":"Dispositif EMS pour l'atteinte de 110 kWhEp/m2/an"}],"params":{"imprevusPct":7,"plafondTravauxParLogement":25000,"plafondMprParLogement":11250,"plafondAmoParLogement":600,"fondsTravaux":20000,"totalTantiemes":10000,"tantiemesExemples":[265,340,610],"dureeEcoPtzAns":20,"coefAssurance":1.036,"tauxPretAvancePct":5.45,"pctAvanceAides":70,"commentaireFondsTravaux":"Fonds travaux loi ALUR disponible au 01/07/2026"},"variantes":{"collectif":true,"collectifSansAvance":false,"individuel":false},"repartitionCles":{}}$json$::jsonb,
    $json${"performancePct":71.95121951219512,"lots":[{"numero":1,"titre":"Isolation thermique par l'exterieur","entreprise":"FACADES DE L'ILL","totalHt":316000,"remise":0,"totalHtApresRemise":316000,"totalHtRetenu":295500,"tvaParTaux":[{"taux":10,"montant":2050},{"taux":5.5,"montant":16252.5}],"totalTtc":334302.5},{"numero":2,"titre":"Toiture et etancheite","entreprise":"TOITURES DU RIED","totalHt":104000,"remise":0,"totalHtApresRemise":104000,"totalHtRetenu":104000,"tvaParTaux":[{"taux":5.5,"montant":5720}],"totalTtc":109720},{"numero":3,"titre":"Chaufferie","entreprise":"THERMIC EST","totalHt":71100,"remise":0,"totalHtApresRemise":71100,"totalHtRetenu":65700,"tvaParTaux":[{"taux":10,"montant":540},{"taux":5.5,"montant":3613.5}],"totalTtc":75253.5},{"numero":4,"titre":"Ventilation","entreprise":"AIRFLUX ALSACE","totalHt":23200,"remise":0,"totalHtApresRemise":23200,"totalHtRetenu":23200,"tvaParTaux":[{"taux":5.5,"montant":1276}],"totalTtc":24476},{"numero":5,"titre":"Menuiseries des parties communes","entreprise":"FENETRES RHENANES","totalHt":14500,"remise":0,"totalHtApresRemise":14500,"totalHtRetenu":12600,"tvaParTaux":[{"taux":10,"montant":190},{"taux":5.5,"montant":693}],"totalTtc":15383},{"numero":6,"titre":"Etancheite a l'air","entreprise":"ISOL'AIR GRAND EST","totalHt":18000,"remise":0,"totalHtApresRemise":18000,"totalHtRetenu":18000,"tvaParTaux":[{"taux":5.5,"montant":990}],"totalTtc":18990}],"totalTravauxHt":546800,"travauxRetenusHt":519000,"assietteMprTravaux":519000,"plafondAssiette":700000,"totalTravauxTtc":578125,"totalTravauxTtcImprevus":618593.75,"moe":[{"designation":"Assistance Maitrise d'Ouvrage (phase conseil)","entreprise":"STRAT ECO","phase":"etude","montantHt":1200,"montantTtc":1440},{"designation":"Maitrise d'oeuvre phase etudes (DIAG-AVP)","entreprise":"ARCHILOGIS","phase":"etude","montantHt":5000,"montantTtc":5500},{"designation":"Audit reglementaire","entreprise":"EST THERMO CONSEIL","phase":"etude","montantHt":700,"montantTtc":840},{"designation":"Diagnostic amiante avant travaux","entreprise":"DIAG EXPERT 67","phase":"etude","montantHt":2600,"montantTtc":3120},{"designation":"Assistance Maitrise d'Ouvrage (phase projet)","entreprise":"STRAT ECO","phase":"projet","montantHt":3400,"montantTtc":4080},{"designation":"Maitrise d'oeuvre phase conception (PRO-DCE)","entreprise":"ARCHILOGIS","phase":"projet","montantHt":28000,"montantTtc":30800.000000000004},{"designation":"Controle technique","phase":"projet","montantHt":1500,"montantTtc":1800},{"designation":"CSPS","phase":"projet","montantHt":950,"montantTtc":1140},{"designation":"Test d'etancheite a l'air avant travaux","entreprise":"AERO TEST","phase":"projet","montantHt":600,"montantTtc":720},{"designation":"Memoire technique Climaxion","entreprise":"ARCHILOGIS","phase":"projet","montantHt":1800,"montantTtc":2160},{"designation":"Assistance Maitrise d'Ouvrage (phase travaux)","entreprise":"STRAT ECO","phase":"travaux","montantHt":6200,"montantTtc":7440},{"designation":"Maitrise d'oeuvre phase travaux","entreprise":"ARCHILOGIS","phase":"travaux","montantHt":19684.8,"montantTtc":20767.463999999996},{"designation":"Controle technique","phase":"travaux","montantHt":3200,"montantTtc":3840},{"designation":"CSPS","phase":"travaux","montantHt":1600,"montantTtc":1920},{"designation":"Test d'etancheite a l'air apres travaux","entreprise":"AERO TEST","phase":"travaux","montantHt":600,"montantTtc":720},{"designation":"Dommage ouvrage","entreprise":"ASSURANCES DU RHIN","phase":"travaux","montantHt":11562.5,"montantTtc":11562.5},{"designation":"Honoraires syndic","entreprise":"SYNDIC HORIZON GRAND EST","phase":"travaux","montantHt":13670,"montantTtc":16404}],"totalMoeTtc":114253.96399999999,"totalOperationTtc":732847.714,"totalPhaseTravauxTtc":681247.714,"aides":[{"id":"cee-fiche-par-fiche","groupe":"CEE","libelle":"CEE fiche par fiche","montant":16000,"publique":false,"commentaire":"Depend des lots de travaux energetiques et de la surface habitable"},{"id":"maprimerenov-partie-travaux","groupe":"ANAH","libelle":"Maprimerenov' partie travaux","montant":233550,"publique":true,"commentaire":"45 % du montant des travaux energetiques HT - plafonne a 11250 EUR par logement"},{"id":"maprimerenov-partie-etudes","groupe":"ANAH","libelle":"Maprimerenov' partie etudes","montant":23039.493939283104,"publique":true,"commentaire":"45 % du montant des etudes, diags, maitrise d'oeuvre HT"},{"id":"maprimerenov-amo","groupe":"ANAH","libelle":"Maprimerenov' AMO","montant":5400,"publique":true,"commentaire":"50 % du montant de la prestation d'assistance a maitrise d'ouvrage HT"},{"id":"maprimerenov-individuelle","groupe":"ANAH","libelle":"Maprimerenov' individuelle","montant":null,"publique":true,"commentaire":"Aide individuelle de 1500 EUR ou de 3000 EUR selon revenus du coproprietaire occupant"},{"id":"climaxion-aide-travaux","groupe":"Climaxion","libelle":"Climaxion aide travaux","montant":80000,"publique":true,"commentaire":"Dispositif Climaxion sous reserve d'eligibilite"},{"id":"climaxion-aide-amo","groupe":"Climaxion","libelle":"Climaxion aide AMO","montant":4000,"publique":true,"commentaire":"Aide Climaxion sur la prestation AMO"},{"id":"ems-aide-travaux","groupe":"EMS","libelle":"EMS aide travaux","montant":28000,"publique":true,"commentaire":"Dispositif Eurometropole de Strasbourg suivant le cahier des charges Climaxion"},{"id":"ems-aide-moe","groupe":"EMS","libelle":"EMS aide MOE","montant":3000,"publique":true,"commentaire":"Dispositif EMS pour la maitrise d'oeuvre"},{"id":"ems-bbc-renovation","groupe":"EMS","libelle":"EMS BBC renovation","montant":14000,"publique":true,"commentaire":"Dispositif EMS pour l'atteinte de 110 kWhEp/m2/an"}],"totalAides":406989.49393928313,"totalAidesPubliques":390989.4939392831,"primeCee":16000.000000000058,"tauxCouverture":0.5974177756129441,"resteACharge":254258.2200607169,"coutTantiemeAvant":68.1247714,"collectif":{"resteAFinancer":270258.22006071697,"coutTantiemeApres":27.025822006071696,"exemples":[{"tantiemes":265,"quotePartAvant":18053.064421,"resteAFinancer":7161.842831608999,"mensualiteEcoPtz":30.915288223112185,"subventionsPubliques":10361.221589391002,"coutPretAvance":564.6865766218095,"primeCee":424.00000000000153,"prixRevient":7302.529408230807},{"tantiemes":340,"quotePartAvant":23162.422276,"resteAFinancer":9188.779482064378,"mensualiteEcoPtz":39.6648980975779,"subventionsPubliques":13293.642793935625,"coutPretAvance":724.5035322694916,"primeCee":544.000000000002,"prixRevient":9369.283014333867},{"tantiemes":610,"quotePartAvant":41556.110554,"resteAFinancer":16485.751423703736,"mensualiteEcoPtz":71.16349364565446,"subventionsPubliques":23850.359130296267,"coutPretAvance":1299.8445726011466,"primeCee":976.0000000000035,"prixRevient":16809.595996304877}]},"collectifSansAvance":{"resteAFinancer":270258.22006071697,"coutTantiemeApres":27.025822006071696,"exemples":[{"tantiemes":265,"quotePartAvant":18053.064421,"resteAFinancer":7161.842831608999,"mensualiteEcoPtz":30.915288223112185,"subventionsPubliques":10361.221589391002,"primeCee":424.00000000000153,"prixRevient":6737.842831608998},{"tantiemes":340,"quotePartAvant":23162.422276,"resteAFinancer":9188.779482064378,"mensualiteEcoPtz":39.6648980975779,"subventionsPubliques":13293.642793935625,"primeCee":544.000000000002,"prixRevient":8644.779482064376},{"tantiemes":610,"quotePartAvant":41556.110554,"resteAFinancer":16485.751423703736,"mensualiteEcoPtz":71.16349364565446,"subventionsPubliques":23850.359130296267,"primeCee":976.0000000000035,"prixRevient":15509.751423703732}]},"individuel":{"aidesAvancees":273692.64575749816,"aidesFinChantier":117296.84818178491,"appelsFonds":387555.0682425019,"coutTantiemeApresAides":25.42582200607169,"coutTantiemeAvecAvance":38.75550682425019,"exemples":[{"tantiemes":265,"quotePartAvant":18053.064421,"prixRevient":6737.8428316089985,"appelsFonds":10270.2093084263,"remboursementFinChantier":3532.3664768173026,"mensualiteEcoPtz":44.33307018137353},{"tantiemes":340,"quotePartAvant":23162.422276,"prixRevient":8644.779482064376,"appelsFonds":13176.872320245066,"remboursementFinChantier":4532.09283818069,"mensualiteEcoPtz":56.880165515724535},{"tantiemes":610,"quotePartAvant":41556.110554,"prixRevient":15509.751423703732,"appelsFonds":23640.859162792614,"remboursementFinChantier":8131.107739088885,"mensualiteEcoPtz":102.04970871938812}]},"gardeFous":[{"libelle":"Plafond travaux < 25 K€/logt","valeur":18535.714285714286,"plafond":25000,"ok":true},{"libelle":"MPR travaux < 11 250 €/logt","valeur":8341.07142857143,"plafond":11250,"ok":true},{"libelle":"AMO < 600 €/logt","valeur":385.7142857142857,"plafond":600,"ok":true}]}$json$::jsonb,
    'valide',
    null
  );

  -- Comme useValiderPlanDefinitif : le PF validé fait foi sur le dossier.
  update coproprietes
  set gain_pct = 72, energy_before = 'F', energy_after = 'C'
  where id = v_copro;
end $$;

-- ========== Partage au portail : scénario pont + plans individuels ==========
do $$
declare
  v_copro uuid;
  v_plan uuid;
  v_scen uuid;
  r record;
begin
  select id into v_copro from coproprietes where slug = 'demo-parc-des-cigognes';
  if v_copro is null then return; end if;
  select id into v_plan from plans_definitifs where copro_id = v_copro and statut = 'valide';
  if v_plan is null or exists (select 1 from scenarios_financiers where plan_definitif_id = v_plan) then
    return;
  end if;

  insert into scenarios_financiers (copro_id, name, statut, locked, bareme_millesime, params, plan_definitif_id)
  values (
    v_copro,
    'PF définitif - PF définitif - Le Parc des Cigognes',
    'partage',
    true,
    2026,
    $json${"travaux":578125,"honoraires":114253.96,"aleas":40468.75,"cle":"MUN","totalCle":10000,"mprCoproPct":67.63,"bonusPassoire":false,"cee":16000,"fonds":20000,"profils":{"Bleu":0,"Jaune":0,"Violet":0,"Rose":0},"primeIndiv":{"Bleu":3000,"Jaune":2250,"Violet":1500,"Rose":0},"ecoPtz":true,"ecoPtzDuree":20,"ecoPtzPct":100,"avancePct":70,"pretComplActif":false,"pretComplDuree":12}$json$::jsonb,
    v_plan
  )
  returning id into v_scen;

  for r in
    select * from (values
      ('Nabil TOUATI', 610, 41556.11, 26046.36, 15509.75),
      ('Isabelle EBERLE', 590, 40193.62, 25192.38, 15001.23),
      ('SCI DU RIED', 570, 38831.12, 24338.4, 14492.72),
      ('Hugo et Celine MARTIN', 510, 34743.63, 21776.46, 12967.17),
      ('SCI LES CIGOGNES', 390, 26568.66, 16652.59, 9916.07),
      ('Maria DA SILVA', 390, 26568.66, 16652.59, 9916.07),
      ('Paul et Sophie WEBER', 375, 25546.79, 16012.11, 9534.68),
      ('Luc et Emma WAGNER', 365, 24865.54, 15585.12, 9280.43),
      ('Michel GERBER', 365, 24865.54, 15585.12, 9280.43),
      ('Brigitte ZIMMERMANN', 365, 24865.54, 15585.12, 9280.43),
      ('Marc et Julie KLEIN', 355, 24184.29, 15158.13, 9026.17),
      ('Denis ROTHENBERGER', 340, 23162.42, 14517.64, 8644.78),
      ('Robert KAUFFMANN', 340, 23162.42, 14517.64, 8644.78),
      ('Jean MULLER', 330, 22481.17, 14090.65, 8390.52),
      ('Anne SCHNEIDER', 320, 21799.93, 13663.66, 8136.26),
      ('Karim BENTAHAR', 320, 21799.93, 13663.66, 8136.26),
      ('Nathalie WENDLING', 320, 21799.93, 13663.66, 8136.26),
      ('Linh NGUYEN', 305, 20778.06, 13023.18, 7754.88),
      ('Carlos et Ana LOPEZ', 305, 20778.06, 13023.18, 7754.88),
      ('Pierre SCHMITT', 300, 20437.43, 12809.68, 7627.75),
      ('Francois HECKEL', 300, 20437.43, 12809.68, 7627.75),
      ('Indivision FRITSCH', 290, 19756.18, 12382.7, 7373.49),
      ('Julien et Marie ROUSSEL', 290, 19756.18, 12382.7, 7373.49),
      ('Claire HOFFMANN', 275, 18734.31, 11742.21, 6992.1),
      ('David et Laura BAUMANN', 275, 18734.31, 11742.21, 6992.1),
      ('Sylvie KOENIG', 275, 18734.31, 11742.21, 6992.1),
      ('Monique LEHMANN', 265, 18053.06, 11315.22, 6737.84),
      ('Samia AMARA', 265, 18053.06, 11315.22, 6737.84)
    ) as t(nom, tantiemes, quote_part, subv_coll_part, reste)
  loop
    insert into plans_individuels (scenario_id, coproprietaire_id, tantiemes, quote_part, mpr_indiv, cee_part, subv_coll_part, eco_ptz_part, reste, mensualite, detail)
    select v_scen, cp.id, r.tantiemes, r.quote_part, 0, 0, r.subv_coll_part, 0, r.reste, 0,
           jsonb_build_object('source', 'pf', 'planDefinitifId', v_plan)
    from coproprietaires cp
    where cp.copro_id = v_copro and cp.nom = r.nom;
  end loop;
end $$;

-- ========== Quelques messages dans la messagerie du dossier ==========
do $$
declare
  v_copro uuid;
begin
  select id into v_copro from coproprietes where slug = 'demo-parc-des-cigognes';
  if v_copro is null or exists (select 1 from messages_projet where copro_id = v_copro) then
    return;
  end if;

  insert into messages_projet (copro_id, canal, auteur_nom, auteur_role, body, created_at) values
    (v_copro, 'syndic', 'Thomas Keller', 'syndic',
     'Bonjour, le conseil syndical demande si la date de demarrage du lot toiture est confirmee pour octobre ?',
     now() - interval '6 days'),
    (v_copro, 'syndic', 'Strat Eco - Chef de projet', 'amo',
     'Bonjour, oui : demarrage confirme au 05/10, l''echafaudage sera pose la semaine precedente. Le planning detaille est depose dans l''onglet Fichiers.',
     now() - interval '5 days'),
    (v_copro, 'coproprietaires', 'Strat Eco - Chef de projet', 'amo',
     'Les plans de financement individuels sont disponibles sur votre portail. Vous pouvez y consulter votre quote-part, les aides deduites et votre reste a charge.',
     now() - interval '3 days');
end $$;

-- ========== Compte portail du copropriétaire de démo ==========
-- Identifiants : coproprietaire@syndic-horizon-demo.fr / Horizon-Copro-2026!
do $$
declare
  v_uid uuid := gen_random_uuid();
  v_cp uuid;
begin
  if exists (select 1 from auth.users where email = 'coproprietaire@syndic-horizon-demo.fr') then
    return;
  end if;

  select cp.id into v_cp
  from coproprietaires cp
  join coproprietes c on c.id = cp.copro_id and c.slug = 'demo-parc-des-cigognes'
  where cp.nom = 'Paul et Sophie WEBER';
  if v_cp is null then return; end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new
  ) values (
    '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated',
    'coproprietaire@syndic-horizon-demo.fr', extensions.crypt('Horizon-Copro-2026!', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
  );
  insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  values (
    gen_random_uuid(), v_uid,
    jsonb_build_object('sub', v_uid::text, 'email', 'coproprietaire@syndic-horizon-demo.fr', 'email_verified', true),
    'email', v_uid::text, now(), now(), now()
  );
  insert into profiles (user_id, full_name, initials, role)
  values (v_uid, 'Paul et Sophie WEBER', 'MW', 'copro');

  update coproprietaires set user_id = v_uid, email = 'coproprietaire@syndic-horizon-demo.fr'
  where id = v_cp;
end $$;

commit;

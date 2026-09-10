-- Import fictif de RESIDENCE STANISLAS (démo commerciale SYNDIC HORIZON GRAND EST)
-- Feedback Amir 10/09/2026 : copropriétaires, lots & tantièmes, enquête sociale,
-- partage du PF définitif, choix de financement « plus ou moins » faits, adhésions.
-- GÉNÉRÉ par gen_seed_demo_stanislas.ts - ne pas éditer à la main, relancer :
--   npx vite-node supabase/seed/gen_seed_demo_stanislas.ts
-- Prérequis : seed_demo_horizon.sql (organisation, copropriété) et
-- seed_demo_horizon_etudes.sql (PF définitif validé de Stanislas).
-- Idempotent : chaque bloc se saute s'il a déjà été joué.
-- Aucun fichier Storage : pas de PDF de bulletin, mandat SEPA ni pièce justificative.
--
--   68 copropriétaires (16 sans e-mail), 144 lots : 72 logements, 2 commerces, 30 caves, 40 garages - clé MUN = 10000
--   enquête : 47 réponses (43 transmises complètes, 4 brouillons), 21 profils vérifiés - profils Bleu 13, Violet 13, Jaune 10, Rose 6
--   financement : 42 choix transmis (fonds 9, collectif 21, individuel 12 ; 3 saisis par le syndic), 26 sans choix
--   adhésions prêt collectif : 5 signées, 9 en brouillon
--   PF : opération TTC 1 952 213 EUR - aides 963 128 EUR (dont CEE 52 000) - reste à charge 925 085 EUR

begin;

-- ========== 1. Données : bâtiments, clé MUN, copropriétaires, lots, tantièmes ==========
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
  select id into v_copro from coproprietes where slug = 'demo-residence-stanislas';
  if v_copro is null then
    raise exception 'Copropriété demo-residence-stanislas absente - jouer seed_demo_horizon.sql d''abord.';
  end if;
  if exists (select 1 from lots where copro_id = v_copro) then
    raise notice 'Lots déjà présents - bloc données sauté.';
    return;
  end if;

  -- Bâtiments : 01 existe (déclaré à la création), 02 est créé comme le ferait l'import.
  insert into batiments (copro_id, code, position)
  select v_copro, '02', 1
  where not exists (select 1 from batiments where copro_id = v_copro and code = '02');

  insert into cles_repartition (copro_id, code, label, is_default)
  values (v_copro, 'MUN', 'Tantièmes généraux', true)
  on conflict do nothing;
  select id into v_cle from cles_repartition where copro_id = v_copro and code = 'MUN';

  -- Copropriétaires (nom, type, e-mail, téléphone, adresse postale)
  for r in
    select * from (values
      ('SCI COMMANDERIE', 'bailleur', 'gestion@sci-commanderie-demo.fr', '03 83 35 12 40', '17 rue Saint-Dizier, 54000 Nancy'),
      ('SCI DU PLATEAU DE HAYE', 'bailleur', null, '03 83 28 71 05', '4 rue de Metz, 54520 Laxou'),
      ('Indivision HENRIOT', 'bailleur', 'indivision.henriot@stanislas-demo.fr', '06 52 18 44 90', '9 rue Serpenoise, 57000 Metz'),
      ('Bernard et Josiane LECLERC', 'bailleur', 'bernard.leclerc@stanislas-demo.fr', '03 83 40 22 67', '12 rue des Jardins, 54600 Villers-les-Nancy'),
      ('Christophe THIRIET', 'occupant', 'christophe.thiriet@stanislas-demo.fr', '06 67 11 18 83', '15 rue de la Commanderie, 54000 Nancy'),
      ('Maxime MANGIN', 'occupant', 'maxime.mangin@stanislas-demo.fr', '06 83 35 52 15', '15 rue de la Commanderie, 54000 Nancy'),
      ('Leila HUSSON', 'occupant', 'leila.husson@stanislas-demo.fr', '03 83 88 80 30', '15 rue de la Commanderie, 54000 Nancy'),
      ('Manon GERARD', 'bailleur', 'manon.gerard@stanislas-demo.fr', '06 11 28 33 85', '4 rue de Metz, 54520 Laxou'),
      ('Laurent et Valerie COLIN', 'bailleur', 'laurent.colin@stanislas-demo.fr', '06 69 79 97 51', '6 rue de la Republique, 69002 Lyon'),
      ('Jean MARCHAL', 'occupant', 'jean.marchal@stanislas-demo.fr', '03 83 43 38 92', null),
      ('Christophe PIERRON', 'occupant', 'christophe.pierron@stanislas-demo.fr', null, null),
      ('Patricia BASTIEN', 'bailleur', 'patricia.bastien@stanislas-demo.fr', null, '22 avenue du General Leclerc, 54500 Vandoeuvre-les-Nancy'),
      ('Mehdi CLAUDEL', 'occupant', 'mehdi.claudel@stanislas-demo.fr', '03 83 57 30 16', '15 rue de la Commanderie, 54000 Nancy'),
      ('Camille et Jean GEORGE', 'occupant', null, '06 61 85 34 40', '15 rue de la Commanderie, 54000 Nancy'),
      ('Laurent VILLEMIN', 'bailleur', 'laurent.villemin@stanislas-demo.fr', '03 83 23 14 17', '45 rue de Strasbourg, 67000 Strasbourg'),
      ('Helene POIROT', 'occupant', 'helene.poirot@stanislas-demo.fr', '03 83 25 82 81', '15 rue de la Commanderie, 54000 Nancy'),
      ('Sophie et Thomas MATHIEU', 'occupant', 'sophie.mathieu@stanislas-demo.fr', '06 61 82 63 54', null),
      ('Maxime et Catherine PERRIN', 'occupant', null, '06 44 58 78 17', '15 rue de la Commanderie, 54000 Nancy'),
      ('Laurence et Mehdi ANTOINE', 'occupant', 'laurence.antoine@stanislas-demo.fr', '06 74 28 56 86', '15 rue de la Commanderie, 54000 Nancy'),
      ('Paul DIDIER', 'occupant', null, '06 64 78 98 79', '15 rue de la Commanderie, 54000 Nancy'),
      ('Ines NOEL', 'occupant', 'ines.noel@stanislas-demo.fr', '06 19 55 24 93', '15 rue de la Commanderie, 54000 Nancy'),
      ('Jean VAUTRIN', 'occupant', 'jean.vautrin@stanislas-demo.fr', '06 70 53 52 22', null),
      ('Julie et Vincent HENRY', 'occupant', 'julie.henry@stanislas-demo.fr', '06 73 50 12 16', '15 rue de la Commanderie, 54000 Nancy'),
      ('Amina et Jean REMY', 'occupant', 'amina.remy@stanislas-demo.fr', '06 29 57 60 53', null),
      ('Elodie JACQUOT', 'occupant', 'elodie.jacquot@stanislas-demo.fr', '06 26 52 99 66', null),
      ('Paul et Nathalie GRANDJEAN', 'occupant', 'paul.grandjean@stanislas-demo.fr', '06 73 93 69 30', '15 rue de la Commanderie, 54000 Nancy'),
      ('Laurent ROLIN', 'occupant', null, '06 84 59 10 53', null),
      ('Nadia MASSON', 'occupant', 'nadia.masson@stanislas-demo.fr', '06 44 63 68 92', '15 rue de la Commanderie, 54000 Nancy'),
      ('Christophe SCHMITT', 'occupant', null, '03 83 36 55 13', '15 rue de la Commanderie, 54000 Nancy'),
      ('Maxime et Martine WEBER', 'occupant', 'maxime.weber@stanislas-demo.fr', '06 35 21 37 26', null),
      ('Aurelie KLEIN', 'occupant', 'aurelie.klein@stanislas-demo.fr', null, '15 rue de la Commanderie, 54000 Nancy'),
      ('Martine MULLER', 'occupant', null, '06 35 29 50 68', '15 rue de la Commanderie, 54000 Nancy'),
      ('Claire BENALI', 'occupant', null, '03 83 67 96 68', '15 rue de la Commanderie, 54000 Nancy'),
      ('Marie HADDAD', 'occupant', 'marie.haddad@stanislas-demo.fr', null, '15 rue de la Commanderie, 54000 Nancy'),
      ('Sandrine DA COSTA', 'occupant', null, null, null),
      ('Emilie FERREIRA', 'occupant', null, '03 83 73 86 63', '15 rue de la Commanderie, 54000 Nancy'),
      ('Leila NGUYEN', 'occupant', 'leila.nguyen@stanislas-demo.fr', '03 83 39 31 45', '15 rue de la Commanderie, 54000 Nancy'),
      ('Paul et Emilie TRAN', 'occupant', null, null, null),
      ('Sylvie ROSSI', 'occupant', null, '03 83 28 82 89', null),
      ('Chloe et Rachid BIANCHI', 'occupant', 'chloe.bianchi@stanislas-demo.fr', '06 55 10 90 77', '15 rue de la Commanderie, 54000 Nancy'),
      ('Christophe et Monique LEFEVRE', 'bailleur', 'christophe.lefevre@stanislas-demo.fr', '03 83 91 17 67', '22 avenue du General Leclerc, 54500 Vandoeuvre-les-Nancy'),
      ('Maxime GAUTHIER', 'occupant', null, null, null),
      ('Isabelle DUPONT', 'occupant', 'isabelle.dupont@stanislas-demo.fr', null, '15 rue de la Commanderie, 54000 Nancy'),
      ('Camille et Jean MOREAU', 'bailleur', 'camille.moreau@stanislas-demo.fr', '06 32 35 98 34', '9 rue Serpenoise, 57000 Metz'),
      ('Laurent GIRARD', 'occupant', null, '06 70 58 50 45', '15 rue de la Commanderie, 54000 Nancy'),
      ('Helene ROBERT', 'occupant', 'helene.robert@stanislas-demo.fr', '06 11 76 34 92', '15 rue de la Commanderie, 54000 Nancy'),
      ('Sophie FOURNIER', 'occupant', 'sophie.fournier@stanislas-demo.fr', '06 18 70 17 22', '15 rue de la Commanderie, 54000 Nancy'),
      ('Celine LAMBERT', 'occupant', 'celine.lambert@stanislas-demo.fr', '06 31 28 28 14', '15 rue de la Commanderie, 54000 Nancy'),
      ('Mehdi BONNET', 'occupant', 'mehdi.bonnet@stanislas-demo.fr', '06 49 50 43 23', '15 rue de la Commanderie, 54000 Nancy'),
      ('Paul et Patricia MERCIER', 'occupant', 'paul.mercier@stanislas-demo.fr', '03 83 75 93 71', '15 rue de la Commanderie, 54000 Nancy'),
      ('Laurent BLANC', 'occupant', 'laurent.blanc@stanislas-demo.fr', '06 20 45 29 51', '15 rue de la Commanderie, 54000 Nancy'),
      ('Christine GUERIN', 'occupant', 'christine.guerin@stanislas-demo.fr', '06 76 76 42 73', '15 rue de la Commanderie, 54000 Nancy'),
      ('Julie ROUX', 'occupant', 'julie.roux@stanislas-demo.fr', '03 83 54 91 93', '15 rue de la Commanderie, 54000 Nancy'),
      ('Amina DUBOIS', 'occupant', 'amina.dubois@stanislas-demo.fr', '06 22 43 28 24', '15 rue de la Commanderie, 54000 Nancy'),
      ('Mehdi et Leila PETIT', 'occupant', 'mehdi.petit@stanislas-demo.fr', '06 21 14 55 57', null),
      ('Catherine RENARD', 'occupant', 'catherine.renard@stanislas-demo.fr', '03 83 37 96 97', '15 rue de la Commanderie, 54000 Nancy'),
      ('Lea HUMBERT', 'bailleur', 'lea.humbert@stanislas-demo.fr', '06 37 23 31 27', '6 rue de la Republique, 69002 Lyon'),
      ('Jean et Helene AUBRY', 'bailleur', 'jean.aubry@stanislas-demo.fr', null, '31 boulevard Voltaire, 75011 Paris'),
      ('Valerie et Mehdi ADAM', 'occupant', 'valerie.adam@stanislas-demo.fr', '06 36 75 35 52', '15 rue de la Commanderie, 54000 Nancy'),
      ('Maxime et Martine BOULANGER', 'occupant', 'maxime.boulanger@stanislas-demo.fr', '03 83 95 43 90', '15 rue de la Commanderie, 54000 Nancy'),
      ('Aurelie et Bernard TOUSSAINT', 'occupant', 'aurelie.toussaint@stanislas-demo.fr', '03 83 21 83 38', '15 rue de la Commanderie, 54000 Nancy'),
      ('Paul et Celine CUNY', 'occupant', null, '03 83 90 73 57', null),
      ('Laurent GRANDIDIER', 'bailleur', 'laurent.grandidier@stanislas-demo.fr', null, '17 rue Saint-Dizier, 54000 Nancy'),
      ('Jean et Marie ZIMMERMANN', 'occupant', 'jean.zimmermann@stanislas-demo.fr', '06 46 57 49 89', null),
      ('Christophe LORRAIN', 'occupant', 'christophe.lorrain@stanislas-demo.fr', '06 16 37 87 39', '15 rue de la Commanderie, 54000 Nancy'),
      ('Maxime BARBIER', 'occupant', 'maxime.barbier@stanislas-demo.fr', '03 83 90 90 53', '15 rue de la Commanderie, 54000 Nancy'),
      ('Mehdi CHRETIEN', 'occupant', 'mehdi.chretien@stanislas-demo.fr', '06 49 39 90 87', '15 rue de la Commanderie, 54000 Nancy'),
      ('Manon et Lucas SIMONIN', 'occupant', null, null, null)
    ) as t(nom, type, email, telephone, adresse)
  loop
    insert into coproprietaires (copro_id, nom, type, email, telephone, adresse)
    values (v_copro, r.nom, r.type, r.email, r.telephone, r.adresse);
  end loop;

  -- Lots principaux puis lots annexes rattachés (caves, garages)
  for r in
    select * from (values
      ('1', '01', 'SCI COMMANDERIE', 'habitation', 130, null),
      ('37', '02', 'SCI COMMANDERIE', 'habitation', 130, null),
      ('73', '01', 'SCI COMMANDERIE', 'commerces', 130, null),
      ('74', '02', 'SCI COMMANDERIE', 'commerces', 100, null),
      ('105', '01', 'SCI COMMANDERIE', 'garage', 8, '1'),
      ('2', '01', 'SCI DU PLATEAU DE HAYE', 'habitation', 95, null),
      ('38', '02', 'SCI DU PLATEAU DE HAYE', 'habitation', 95, null),
      ('106', '01', 'SCI DU PLATEAU DE HAYE', 'garage', 8, '2'),
      ('3', '01', 'Indivision HENRIOT', 'habitation', 165, null),
      ('39', '02', 'Indivision HENRIOT', 'habitation', 165, null),
      ('107', '01', 'Indivision HENRIOT', 'garage', 8, '3'),
      ('4', '01', 'Bernard et Josiane LECLERC', 'habitation', 130, null),
      ('40', '02', 'Bernard et Josiane LECLERC', 'habitation', 130, null),
      ('108', '01', 'Bernard et Josiane LECLERC', 'garage', 8, '4'),
      ('5', '01', 'Christophe THIRIET', 'habitation', 130, null),
      ('109', '01', 'Christophe THIRIET', 'garage', 8, '5'),
      ('6', '01', 'Maxime MANGIN', 'habitation', 95, null),
      ('110', '01', 'Maxime MANGIN', 'garage', 8, '6'),
      ('7', '01', 'Leila HUSSON', 'habitation', 165, null),
      ('111', '01', 'Leila HUSSON', 'garage', 8, '7'),
      ('8', '01', 'Manon GERARD', 'habitation', 130, null),
      ('112', '01', 'Manon GERARD', 'garage', 8, '8'),
      ('9', '01', 'Laurent et Valerie COLIN', 'habitation', 130, null),
      ('113', '01', 'Laurent et Valerie COLIN', 'garage', 8, '9'),
      ('10', '01', 'Jean MARCHAL', 'habitation', 95, null),
      ('114', '01', 'Jean MARCHAL', 'garage', 8, '10'),
      ('11', '01', 'Christophe PIERRON', 'habitation', 165, null),
      ('115', '01', 'Christophe PIERRON', 'garage', 8, '11'),
      ('12', '01', 'Patricia BASTIEN', 'habitation', 130, null),
      ('116', '01', 'Patricia BASTIEN', 'garage', 8, '12'),
      ('13', '01', 'Mehdi CLAUDEL', 'habitation', 130, null),
      ('117', '01', 'Mehdi CLAUDEL', 'garage', 8, '13'),
      ('14', '01', 'Camille et Jean GEORGE', 'habitation', 95, null),
      ('118', '01', 'Camille et Jean GEORGE', 'garage', 8, '14'),
      ('15', '01', 'Laurent VILLEMIN', 'habitation', 165, null),
      ('119', '01', 'Laurent VILLEMIN', 'garage', 8, '15'),
      ('16', '01', 'Helene POIROT', 'habitation', 130, null),
      ('120', '01', 'Helene POIROT', 'garage', 8, '16'),
      ('17', '01', 'Sophie et Thomas MATHIEU', 'habitation', 130, null),
      ('121', '01', 'Sophie et Thomas MATHIEU', 'garage', 8, '17'),
      ('18', '01', 'Maxime et Catherine PERRIN', 'habitation', 95, null),
      ('122', '01', 'Maxime et Catherine PERRIN', 'garage', 8, '18'),
      ('19', '01', 'Laurence et Mehdi ANTOINE', 'habitation', 165, null),
      ('123', '01', 'Laurence et Mehdi ANTOINE', 'garage', 8, '19'),
      ('20', '01', 'Paul DIDIER', 'habitation', 130, null),
      ('124', '01', 'Paul DIDIER', 'garage', 8, '20'),
      ('21', '01', 'Ines NOEL', 'habitation', 130, null),
      ('125', '01', 'Ines NOEL', 'garage', 8, '21'),
      ('22', '01', 'Jean VAUTRIN', 'habitation', 95, null),
      ('126', '01', 'Jean VAUTRIN', 'garage', 8, '22'),
      ('23', '01', 'Julie et Vincent HENRY', 'habitation', 165, null),
      ('127', '01', 'Julie et Vincent HENRY', 'garage', 8, '23'),
      ('24', '01', 'Amina et Jean REMY', 'habitation', 130, null),
      ('128', '01', 'Amina et Jean REMY', 'garage', 8, '24'),
      ('25', '01', 'Elodie JACQUOT', 'habitation', 130, null),
      ('129', '01', 'Elodie JACQUOT', 'garage', 8, '25'),
      ('26', '01', 'Paul et Nathalie GRANDJEAN', 'habitation', 95, null),
      ('130', '01', 'Paul et Nathalie GRANDJEAN', 'garage', 8, '26'),
      ('27', '01', 'Laurent ROLIN', 'habitation', 165, null),
      ('131', '01', 'Laurent ROLIN', 'garage', 8, '27'),
      ('28', '01', 'Nadia MASSON', 'habitation', 130, null),
      ('132', '01', 'Nadia MASSON', 'garage', 8, '28'),
      ('29', '01', 'Christophe SCHMITT', 'habitation', 130, null),
      ('133', '01', 'Christophe SCHMITT', 'garage', 8, '29'),
      ('30', '01', 'Maxime et Martine WEBER', 'habitation', 95, null),
      ('134', '01', 'Maxime et Martine WEBER', 'garage', 8, '30'),
      ('31', '01', 'Aurelie KLEIN', 'habitation', 165, null),
      ('135', '01', 'Aurelie KLEIN', 'garage', 8, '31'),
      ('32', '01', 'Martine MULLER', 'habitation', 130, null),
      ('136', '01', 'Martine MULLER', 'garage', 8, '32'),
      ('33', '01', 'Claire BENALI', 'habitation', 130, null),
      ('137', '01', 'Claire BENALI', 'garage', 8, '33'),
      ('34', '01', 'Marie HADDAD', 'habitation', 95, null),
      ('138', '01', 'Marie HADDAD', 'garage', 8, '34'),
      ('35', '01', 'Sandrine DA COSTA', 'habitation', 165, null),
      ('139', '01', 'Sandrine DA COSTA', 'garage', 8, '35'),
      ('36', '01', 'Emilie FERREIRA', 'habitation', 130, null),
      ('140', '01', 'Emilie FERREIRA', 'garage', 8, '36'),
      ('41', '02', 'Leila NGUYEN', 'habitation', 130, null),
      ('141', '02', 'Leila NGUYEN', 'garage', 8, '41'),
      ('42', '02', 'Paul et Emilie TRAN', 'habitation', 95, null),
      ('142', '02', 'Paul et Emilie TRAN', 'garage', 8, '42'),
      ('43', '02', 'Sylvie ROSSI', 'habitation', 165, null),
      ('104', '02', 'Sylvie ROSSI', 'caves', 3, '43'),
      ('143', '02', 'Sylvie ROSSI', 'garage', 8, '43'),
      ('44', '02', 'Chloe et Rachid BIANCHI', 'habitation', 130, null),
      ('103', '02', 'Chloe et Rachid BIANCHI', 'caves', 3, '44'),
      ('144', '02', 'Chloe et Rachid BIANCHI', 'garage', 8, '44'),
      ('45', '02', 'Christophe et Monique LEFEVRE', 'habitation', 130, null),
      ('102', '02', 'Christophe et Monique LEFEVRE', 'caves', 3, '45'),
      ('46', '02', 'Maxime GAUTHIER', 'habitation', 95, null),
      ('101', '02', 'Maxime GAUTHIER', 'caves', 3, '46'),
      ('47', '02', 'Isabelle DUPONT', 'habitation', 165, null),
      ('100', '02', 'Isabelle DUPONT', 'caves', 3, '47'),
      ('48', '02', 'Camille et Jean MOREAU', 'habitation', 130, null),
      ('99', '02', 'Camille et Jean MOREAU', 'caves', 3, '48'),
      ('49', '02', 'Laurent GIRARD', 'habitation', 130, null),
      ('98', '02', 'Laurent GIRARD', 'caves', 3, '49'),
      ('50', '02', 'Helene ROBERT', 'habitation', 95, null),
      ('97', '02', 'Helene ROBERT', 'caves', 3, '50'),
      ('51', '02', 'Sophie FOURNIER', 'habitation', 165, null),
      ('96', '02', 'Sophie FOURNIER', 'caves', 3, '51'),
      ('52', '02', 'Celine LAMBERT', 'habitation', 130, null),
      ('95', '02', 'Celine LAMBERT', 'caves', 3, '52'),
      ('53', '02', 'Mehdi BONNET', 'habitation', 130, null),
      ('94', '02', 'Mehdi BONNET', 'caves', 3, '53'),
      ('54', '02', 'Paul et Patricia MERCIER', 'habitation', 95, null),
      ('93', '02', 'Paul et Patricia MERCIER', 'caves', 3, '54'),
      ('55', '02', 'Laurent BLANC', 'habitation', 165, null),
      ('92', '02', 'Laurent BLANC', 'caves', 3, '55'),
      ('56', '02', 'Christine GUERIN', 'habitation', 130, null),
      ('91', '02', 'Christine GUERIN', 'caves', 3, '56'),
      ('57', '02', 'Julie ROUX', 'habitation', 130, null),
      ('90', '02', 'Julie ROUX', 'caves', 3, '57'),
      ('58', '02', 'Amina DUBOIS', 'habitation', 95, null),
      ('89', '02', 'Amina DUBOIS', 'caves', 3, '58'),
      ('59', '02', 'Mehdi et Leila PETIT', 'habitation', 165, null),
      ('88', '02', 'Mehdi et Leila PETIT', 'caves', 3, '59'),
      ('60', '02', 'Catherine RENARD', 'habitation', 130, null),
      ('87', '02', 'Catherine RENARD', 'caves', 3, '60'),
      ('61', '02', 'Lea HUMBERT', 'habitation', 130, null),
      ('86', '02', 'Lea HUMBERT', 'caves', 3, '61'),
      ('62', '02', 'Jean et Helene AUBRY', 'habitation', 95, null),
      ('85', '02', 'Jean et Helene AUBRY', 'caves', 3, '62'),
      ('63', '02', 'Valerie et Mehdi ADAM', 'habitation', 165, null),
      ('84', '02', 'Valerie et Mehdi ADAM', 'caves', 3, '63'),
      ('64', '02', 'Maxime et Martine BOULANGER', 'habitation', 130, null),
      ('83', '02', 'Maxime et Martine BOULANGER', 'caves', 3, '64'),
      ('65', '02', 'Aurelie et Bernard TOUSSAINT', 'habitation', 130, null),
      ('82', '02', 'Aurelie et Bernard TOUSSAINT', 'caves', 3, '65'),
      ('66', '02', 'Paul et Celine CUNY', 'habitation', 95, null),
      ('81', '02', 'Paul et Celine CUNY', 'caves', 3, '66'),
      ('67', '02', 'Laurent GRANDIDIER', 'habitation', 165, null),
      ('80', '02', 'Laurent GRANDIDIER', 'caves', 3, '67'),
      ('68', '02', 'Jean et Marie ZIMMERMANN', 'habitation', 130, null),
      ('79', '02', 'Jean et Marie ZIMMERMANN', 'caves', 3, '68'),
      ('69', '02', 'Christophe LORRAIN', 'habitation', 130, null),
      ('78', '02', 'Christophe LORRAIN', 'caves', 3, '69'),
      ('70', '02', 'Maxime BARBIER', 'habitation', 95, null),
      ('77', '02', 'Maxime BARBIER', 'caves', 3, '70'),
      ('71', '02', 'Mehdi CHRETIEN', 'habitation', 165, null),
      ('76', '02', 'Mehdi CHRETIEN', 'caves', 3, '71'),
      ('72', '02', 'Manon et Lucas SIMONIN', 'habitation', 130, null),
      ('75', '02', 'Manon et Lucas SIMONIN', 'caves', 3, '72')
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

-- ========== 2. Enquête sociale envoyée + réponses transmises depuis le portail ==========
do $$
declare
  v_copro uuid;
  v_enq uuid;
  v_verif uuid;
  r record;
  v_cp uuid;
  v_lots jsonb;
begin
  select id into v_copro from coproprietes where slug = 'demo-residence-stanislas';
  if v_copro is null then return; end if;

  -- L'enquête existante (brouillon paramétré par l'AMO) est envoyée ; sinon on la crée.
  select id into v_enq from enquetes where copro_id = v_copro order by created_at limit 1;
  if v_enq is null then
    insert into enquetes (copro_id, questions, statut, sent_at)
    values (v_copro, $json$[{"id":"nom","on":true},{"id":"telephone","on":true},{"id":"adresse","on":true},{"id":"email","on":true},{"id":"type-coproprietaire","on":true},{"id":"nb-indivisaires","on":true},{"id":"nb-associes-sci","on":true},{"id":"personne-physique-sci","on":true},{"id":"nb-personnes-foyer","on":true},{"id":"composition-menage","on":true},{"id":"nb-personnes-charge","on":true},{"id":"rfr-foyer","on":true},{"id":"rfr-zero-motif","on":true},{"id":"rfr-n2","on":true},{"id":"accord-visite","on":true},{"id":"curatelle-tutelle","on":true},{"id":"situation-sociale","on":true},{"id":"importance-travaux","on":false},{"id":"etat-parties-communes","on":false},{"id":"securite-parties-communes","on":false},{"id":"usage-lot","on":true},{"id":"lot-parent","on":true},{"id":"type-occupation","on":true},{"id":"nb-habitants","on":true},{"id":"type-residence","on":true},{"id":"commodat","on":true},{"id":"associes-occupants","on":true},{"id":"indivisaires-occupants","on":true},{"id":"projet-vente","on":true},{"id":"associes-exploitants","on":true},{"id":"demembrement","on":true},{"id":"nb-fenetres","on":true},{"id":"nb-simple-vitrage","on":true},{"id":"nb-occultations","on":true},{"id":"nb-occultations-origine","on":true},{"id":"nb-stores","on":true},{"id":"changement-menuiseries","on":true},{"id":"type-chauffage","on":true},{"id":"energie-chauffage","on":true},{"id":"date-chaudiere","on":true},{"id":"type-ecs","on":true},{"id":"energie-ecs","on":true},{"id":"nb-radiateurs","on":true},{"id":"regulation-radiateurs","on":true},{"id":"pathologies","on":true},{"id":"inconforts","on":true},{"id":"duree-occupation","on":false},{"id":"tranches-age","on":false},{"id":"csp","on":false},{"id":"ressenti-ete","on":false},{"id":"ressenti-hiver","on":false},{"id":"confort-phonique","on":false},{"id":"detecteurs","on":false},{"id":"projet-travaux","on":false}]$json$::jsonb, 'envoyee', now() - interval '50 days')
    returning id into v_enq;
  else
    update enquetes set statut = 'envoyee', sent_at = coalesce(sent_at, now() - interval '50 days')
    where id = v_enq;
  end if;
  if exists (select 1 from enquete_reponses where enquete_id = v_enq) then
    raise notice 'Réponses déjà présentes - bloc enquête sauté.';
    return;
  end if;

  select user_id into v_verif from profiles p join auth.users u on u.id = p.user_id
  where u.email = 'amir@strateco.fr' limit 1;

  for r in
    select * from (values
      ('SCI COMMANDERIE', $json${"nom":"SCI COMMANDERIE","telephone":"03 83 35 12 40","adresse":"17 rue Saint-Dizier, 54000 Nancy","email":"gestion@sci-commanderie-demo.fr","type-coproprietaire":"SCI soumise à l'impôt sur le revenu","nb-associes-sci":2,"personne-physique-sci":"Oui","accord-visite":"Oui, sous conditions (précisez)","curatelle-tutelle":"Non","situation-sociale":"Non","importance-travaux":"Utiles"}$json$::jsonb, $json${"type-occupation":"Propriétaire bailleur (logement loué)","nb-habitants":2,"type-residence":"Résidence principale","commodat":"Non","projet-vente":"Non","demembrement":"Non","associes-occupants":0,"nb-fenetres":6,"nb-simple-vitrage":2,"nb-occultations":6,"nb-occultations-origine":3,"nb-stores":1,"changement-menuiseries":["Non, aucun changement récent"],"type-chauffage":"Collectif","energie-chauffage":"Fioul","type-ecs":"Collectif","energie-ecs":"Même système que le chauffage","nb-radiateurs":5,"regulation-radiateurs":"Oui, sur une partie seulement","pathologies":["Aucune pathologie"],"inconforts":["Froid en hiver","Chaleur excessive en été"]}$json$::jsonb, $json${"associes-exploitants":"Non","nb-fenetres":7,"nb-simple-vitrage":4,"nb-occultations":7,"nb-occultations-origine":7,"nb-stores":2,"changement-menuiseries":["Non, aucun changement récent"],"type-chauffage":"Collectif","energie-chauffage":"Fioul","type-ecs":"Collectif","energie-ecs":"Même système que le chauffage","nb-radiateurs":5,"regulation-radiateurs":"Non","pathologies":["Humidité / condensation"],"inconforts":["Aucun inconfort particulier"]}$json$::jsonb, null, null, null, 'bailleur', null, false, 7, true, 30),
      ('Bernard et Josiane LECLERC', $json${"nom":"Bernard et Josiane LECLERC","telephone":"03 83 40 22 67","adresse":"12 rue des Jardins, 54600 Villers-les-Nancy","email":"bernard.leclerc@stanislas-demo.fr","type-coproprietaire":"Personne physique","nb-personnes-foyer":4,"composition-menage":"Couple avec enfant(s)","nb-personnes-charge":2,"rfr-foyer":34540,"rfr-n2":33610,"accord-visite":"Oui, sous conditions (précisez)","curatelle-tutelle":"Non","situation-sociale":"Non","importance-travaux":"Indispensables"}$json$::jsonb, $json${"type-occupation":"Logement vacant","nb-habitants":0,"type-residence":"Résidence principale","commodat":"Non","projet-vente":"Non","demembrement":"Non","nb-fenetres":4,"nb-simple-vitrage":0,"nb-occultations":4,"nb-occultations-origine":4,"nb-stores":0,"changement-menuiseries":["Non, aucun changement récent"],"type-chauffage":"Collectif","energie-chauffage":"Fioul","type-ecs":"Collectif","energie-ecs":"Même système que le chauffage","nb-radiateurs":6,"regulation-radiateurs":"Non","pathologies":["Aucune pathologie"],"inconforts":["Aucun inconfort particulier"]}$json$::jsonb, null, 4, 34540, 33610, 'bailleur', 'Bleu', false, 1, true, 45),
      ('Maxime MANGIN', $json${"nom":"Maxime MANGIN","telephone":"06 83 35 52 15","adresse":"15 rue de la Commanderie, 54000 Nancy","email":"maxime.mangin@stanislas-demo.fr","type-coproprietaire":"Personne physique","nb-personnes-foyer":1,"composition-menage":"Personne seule","nb-personnes-charge":0,"rfr-foyer":27820,"rfr-n2":27130,"accord-visite":"Oui, sous conditions (précisez)","curatelle-tutelle":"Non","situation-sociale":"Non","importance-travaux":"Utiles"}$json$::jsonb, $json${"type-occupation":"Propriétaire occupant","nb-habitants":1,"type-residence":"Résidence principale","commodat":"Non","projet-vente":"Non","demembrement":"Non","nb-fenetres":4,"nb-simple-vitrage":1,"nb-occultations":4,"nb-occultations-origine":4,"nb-stores":3,"changement-menuiseries":["Non, aucun changement récent"],"type-chauffage":"Collectif","energie-chauffage":"Fioul","type-ecs":"Collectif","energie-ecs":"Même système que le chauffage","nb-radiateurs":6,"regulation-radiateurs":"Je ne sais pas","pathologies":["Humidité / condensation"],"inconforts":["Aucun inconfort particulier"]}$json$::jsonb, null, 1, 27820, 27130, 'occupant', 'Violet', false, 2, true, 21),
      ('Manon GERARD', $json${"nom":"Manon GERARD","telephone":"06 11 28 33 85","adresse":"4 rue de Metz, 54520 Laxou","email":"manon.gerard@stanislas-demo.fr","type-coproprietaire":"Personne physique","nb-personnes-foyer":2,"composition-menage":"Famille monoparentale","nb-personnes-charge":1,"rfr-foyer":38940,"rfr-n2":39610,"accord-visite":"Oui","curatelle-tutelle":"Non","situation-sociale":"Non","importance-travaux":"Indispensables"}$json$::jsonb, $json${"type-occupation":"Propriétaire bailleur (logement loué)","nb-habitants":3,"type-residence":"Résidence principale","commodat":"Non","projet-vente":"Oui, après les travaux","demembrement":"Non","nb-fenetres":5,"nb-simple-vitrage":0,"nb-occultations":5,"nb-occultations-origine":5,"nb-stores":0,"changement-menuiseries":["Oui, les fenêtres"],"type-chauffage":"Collectif","energie-chauffage":"Fioul","type-ecs":"Collectif","energie-ecs":"Même système que le chauffage","nb-radiateurs":6,"regulation-radiateurs":"Je ne sais pas","pathologies":["Moisissures"],"inconforts":["Froid en hiver","Courants d'air","Parois ou sols froids"]}$json$::jsonb, null, 2, 38940, 39610, 'bailleur', 'Violet', false, 2, true, 28),
      ('Laurent et Valerie COLIN', $json${"nom":"Laurent et Valerie COLIN","telephone":"06 69 79 97 51","adresse":"6 rue de la Republique, 69002 Lyon","email":"laurent.colin@stanislas-demo.fr","type-coproprietaire":"Personne physique","nb-personnes-foyer":5,"composition-menage":"Couple avec enfant(s)","nb-personnes-charge":3,"rfr-foyer":44070,"rfr-n2":43720,"accord-visite":"Oui","curatelle-tutelle":"Non","situation-sociale":"Non","importance-travaux":"Utiles"}$json$::jsonb, $json${"type-occupation":"Propriétaire bailleur (logement loué)","nb-habitants":3,"type-residence":"Résidence principale","commodat":"Non","projet-vente":"Je ne sais pas encore","demembrement":"Non","nb-fenetres":6,"nb-simple-vitrage":0,"nb-occultations":6,"nb-occultations-origine":6,"nb-stores":0,"changement-menuiseries":["Oui, les fenêtres"],"type-chauffage":"Collectif","energie-chauffage":"Fioul","type-ecs":"Collectif","energie-ecs":"Même système que le chauffage","nb-radiateurs":4,"regulation-radiateurs":"Non","pathologies":["Aucune pathologie"],"inconforts":["Parois ou sols froids"]}$json$::jsonb, null, 5, 44070, 43720, 'bailleur', 'Jaune', false, 3, true, 20),
      ('Jean MARCHAL', $json${"nom":"Jean MARCHAL","telephone":"03 83 43 38 92","adresse":"15 rue de la Commanderie, 54000 Nancy","email":"jean.marchal@stanislas-demo.fr","type-coproprietaire":"Personne physique","nb-personnes-foyer":1,"composition-menage":"Personne seule","nb-personnes-charge":0,"rfr-foyer":23760,"rfr-n2":23740,"accord-visite":"Oui, sous conditions (précisez)","curatelle-tutelle":"Non","situation-sociale":"Non","importance-travaux":"Utiles"}$json$::jsonb, $json${"type-occupation":"Propriétaire occupant","nb-habitants":1,"type-residence":"Résidence principale","commodat":"Non","projet-vente":"Non","demembrement":"Non","nb-fenetres":7,"nb-simple-vitrage":0,"nb-occultations":7,"nb-occultations-origine":7,"nb-stores":0,"changement-menuiseries":["Non, aucun changement récent"],"type-chauffage":"Collectif","energie-chauffage":"Fioul","type-ecs":"Collectif","energie-ecs":"Même système que le chauffage","nb-radiateurs":6,"regulation-radiateurs":"Non","pathologies":["Humidité / condensation"],"inconforts":["Froid en hiver"]}$json$::jsonb, null, 1, 23760, 23740, 'occupant', 'Violet', false, 7, true, 31),
      ('Helene POIROT', $json${"nom":"Helene POIROT","telephone":"03 83 25 82 81","adresse":"15 rue de la Commanderie, 54000 Nancy","email":"helene.poirot@stanislas-demo.fr","type-coproprietaire":"Personne physique","nb-personnes-foyer":1,"composition-menage":"Personne seule","nb-personnes-charge":0,"rfr-foyer":26220,"rfr-n2":26520,"accord-visite":"Oui","curatelle-tutelle":"Non","situation-sociale":"Non","importance-travaux":"Sans avis"}$json$::jsonb, $json${"type-occupation":"Propriétaire occupant","nb-habitants":1,"type-residence":"Résidence principale","commodat":"Non","projet-vente":"Non","demembrement":"Non","nb-fenetres":4,"nb-simple-vitrage":2,"nb-occultations":4,"nb-occultations-origine":4,"nb-stores":0,"changement-menuiseries":["Non, aucun changement récent"],"type-chauffage":"Collectif","energie-chauffage":"Fioul","type-ecs":"Collectif","energie-ecs":"Même système que le chauffage","nb-radiateurs":5,"regulation-radiateurs":"Non","pathologies":["Humidité / condensation"],"inconforts":["Aucun inconfort particulier"]}$json$::jsonb, null, 1, 26220, 26520, 'occupant', 'Violet', true, 5, true, 14),
      ('Maxime et Catherine PERRIN', $json${"nom":"Maxime et Catherine PERRIN","telephone":"06 44 58 78 17","adresse":"15 rue de la Commanderie, 54000 Nancy","email":"","type-coproprietaire":"Personne physique","nb-personnes-foyer":4,"composition-menage":"Couple avec enfant(s)","nb-personnes-charge":2,"rfr-foyer":24890,"rfr-n2":24870,"accord-visite":"Oui","curatelle-tutelle":"Non","situation-sociale":"Non","importance-travaux":"Indispensables"}$json$::jsonb, $json${"type-occupation":"Propriétaire occupant","nb-habitants":4,"type-residence":"Résidence principale","commodat":"Non","projet-vente":"Non","demembrement":"Non","nb-fenetres":7,"nb-simple-vitrage":0,"nb-occultations":7,"nb-occultations-origine":4,"nb-stores":1,"changement-menuiseries":["Non, aucun changement récent"],"type-chauffage":"Collectif","energie-chauffage":"Fioul","type-ecs":"Collectif","energie-ecs":"Même système que le chauffage","nb-radiateurs":6,"regulation-radiateurs":"Je ne sais pas","pathologies":["Moisissures"],"inconforts":["Froid en hiver","Chaleur excessive en été","Parois ou sols froids"]}$json$::jsonb, null, 4, 24890, 24870, 'occupant', 'Bleu', false, 3, true, 12),
      ('Paul DIDIER', $json${"nom":"Paul DIDIER","telephone":"06 64 78 98 79","adresse":"15 rue de la Commanderie, 54000 Nancy","email":"","type-coproprietaire":"Personne physique","nb-personnes-foyer":1,"composition-menage":"Personne seule","nb-personnes-charge":0,"rfr-foyer":16550,"rfr-n2":16260,"accord-visite":"Oui","curatelle-tutelle":"Non","situation-sociale":"Non","importance-travaux":"Indispensables"}$json$::jsonb, $json${"type-occupation":"Propriétaire occupant","nb-habitants":1,"type-residence":"Résidence principale","commodat":"Non","projet-vente":"Non","demembrement":"Non","nb-fenetres":7,"nb-simple-vitrage":7,"nb-occultations":7,"nb-occultations-origine":1,"nb-stores":0,"changement-menuiseries":["Non, aucun changement récent"],"type-chauffage":"Collectif","energie-chauffage":"Fioul","type-ecs":"Collectif","energie-ecs":"Même système que le chauffage","nb-radiateurs":4,"regulation-radiateurs":"Non","pathologies":["Humidité / condensation"],"inconforts":["Froid en hiver","Courants d'air","Parois ou sols froids"]}$json$::jsonb, null, 1, 16550, 16260, 'occupant', 'Bleu', false, 5, true, 31),
      ('Ines NOEL', $json${"nom":"Ines NOEL","telephone":"06 19 55 24 93","adresse":"15 rue de la Commanderie, 54000 Nancy","email":"ines.noel@stanislas-demo.fr","type-coproprietaire":"Personne physique","nb-personnes-foyer":2,"composition-menage":"Famille monoparentale","nb-personnes-charge":1,"rfr-foyer":43890,"rfr-n2":43350,"accord-visite":"Non","curatelle-tutelle":"Non","situation-sociale":"Non","importance-travaux":"Sans avis"}$json$::jsonb, $json${"type-occupation":"Propriétaire occupant","nb-habitants":2,"type-residence":"Résidence principale","commodat":"Non","projet-vente":"Non","demembrement":"Non","nb-fenetres":8,"nb-simple-vitrage":4,"nb-occultations":8,"nb-occultations-origine":7,"nb-stores":0,"changement-menuiseries":["Non, aucun changement récent"],"type-chauffage":"Collectif","energie-chauffage":"Fioul","type-ecs":"Collectif","energie-ecs":"Même système que le chauffage","nb-radiateurs":7,"regulation-radiateurs":"Non","pathologies":["Humidité / condensation"],"inconforts":["Froid en hiver"]}$json$::jsonb, null, 2, 43890, 43350, 'occupant', 'Violet', true, 5, true, 12),
      ('Jean VAUTRIN', $json${"nom":"Jean VAUTRIN","telephone":"06 70 53 52 22","adresse":"15 rue de la Commanderie, 54000 Nancy","email":"jean.vautrin@stanislas-demo.fr","type-coproprietaire":"Personne physique","nb-personnes-foyer":2,"composition-menage":"Famille monoparentale","nb-personnes-charge":1,"rfr-foyer":44170,"rfr-n2":43910,"accord-visite":"Oui","curatelle-tutelle":"Non","situation-sociale":"Non","importance-travaux":"Indispensables"}$json$::jsonb, $json${"type-occupation":"Propriétaire occupant","nb-habitants":2,"type-residence":"Résidence principale","commodat":"Non","projet-vente":"Non","demembrement":"Non","nb-fenetres":5,"nb-simple-vitrage":0,"nb-occultations":5,"nb-occultations-origine":5,"nb-stores":0,"changement-menuiseries":["Oui, les fenêtres"],"type-chauffage":"Collectif","energie-chauffage":"Fioul","type-ecs":"Collectif","energie-ecs":"Même système que le chauffage","nb-radiateurs":6,"regulation-radiateurs":"Oui, sur une partie seulement","pathologies":["Fissures"],"inconforts":["Froid en hiver","Parois ou sols froids"]}$json$::jsonb, null, 2, 44170, 43910, 'occupant', 'Violet', true, 5, true, 14),
      ('Julie et Vincent HENRY', $json${"nom":"Julie et Vincent HENRY","telephone":"06 73 50 12 16","adresse":"15 rue de la Commanderie, 54000 Nancy","email":"julie.henry@stanislas-demo.fr","type-coproprietaire":"Personne physique","nb-personnes-foyer":4,"composition-menage":"Couple avec enfant(s)","nb-personnes-charge":2,"rfr-foyer":19960,"rfr-n2":19560,"accord-visite":"Oui","curatelle-tutelle":"Non","situation-sociale":"Non","importance-travaux":"Utiles"}$json$::jsonb, $json${"type-occupation":"Propriétaire occupant","nb-habitants":4,"type-residence":"Résidence principale","commodat":"Non","projet-vente":"Je ne sais pas encore","demembrement":"Non","nb-fenetres":8,"nb-simple-vitrage":1,"nb-occultations":8,"nb-occultations-origine":8,"nb-stores":0,"changement-menuiseries":["Non, aucun changement récent"],"type-chauffage":"Collectif","energie-chauffage":"Fioul","type-ecs":"Collectif","energie-ecs":"Même système que le chauffage","nb-radiateurs":7,"regulation-radiateurs":"Non","pathologies":["Humidité / condensation"],"inconforts":["Froid en hiver","Parois ou sols froids"]}$json$::jsonb, null, 4, 19960, 19560, 'occupant', 'Bleu', false, 1, true, 16),
      ('Amina et Jean REMY', $json${"nom":"Amina et Jean REMY","telephone":"06 29 57 60 53","adresse":"15 rue de la Commanderie, 54000 Nancy","email":"amina.remy@stanislas-demo.fr","type-coproprietaire":"Personne physique","nb-personnes-foyer":2,"composition-menage":"Couple sans enfant","nb-personnes-charge":0,"rfr-foyer":0,"rfr-zero-motif":"Sans activité professionnelle","rfr-n2":0,"accord-visite":"Oui","curatelle-tutelle":"Non","situation-sociale":"Non","importance-travaux":"Utiles"}$json$::jsonb, $json${"type-occupation":"Propriétaire occupant","nb-habitants":2,"type-residence":"Résidence principale","commodat":"Non","projet-vente":"Oui, après les travaux","demembrement":"Non","nb-fenetres":5,"nb-simple-vitrage":0,"nb-occultations":5,"nb-occultations-origine":5,"nb-stores":2,"changement-menuiseries":["Oui, les fenêtres"],"type-chauffage":"Collectif","energie-chauffage":"Fioul","type-ecs":"Collectif","energie-ecs":"Même système que le chauffage","nb-radiateurs":6,"regulation-radiateurs":"Non","pathologies":["Humidité / condensation"],"inconforts":["Froid en hiver","Parois ou sols froids"]}$json$::jsonb, null, 2, 0, 0, 'occupant', 'Bleu', true, 2, true, 38),
      ('Paul et Nathalie GRANDJEAN', $json${"nom":"Paul et Nathalie GRANDJEAN","telephone":"06 73 93 69 30","adresse":"15 rue de la Commanderie, 54000 Nancy","email":"paul.grandjean@stanislas-demo.fr","type-coproprietaire":"Personne physique","nb-personnes-foyer":4,"composition-menage":"Couple avec enfant(s)","nb-personnes-charge":2,"rfr-foyer":95270,"rfr-n2":97930,"accord-visite":"Oui, sous conditions (précisez)","curatelle-tutelle":"Non","situation-sociale":"Non","importance-travaux":"Indispensables"}$json$::jsonb, $json${"type-occupation":"Propriétaire occupant","nb-habitants":4,"type-residence":"Résidence principale","commodat":"Non","projet-vente":"Oui, après les travaux","demembrement":"Non","nb-fenetres":5,"nb-simple-vitrage":0,"nb-occultations":5,"nb-occultations-origine":5,"nb-stores":2,"changement-menuiseries":["Oui, les fenêtres"],"type-chauffage":"Collectif","energie-chauffage":"Fioul","type-ecs":"Collectif","energie-ecs":"Même système que le chauffage","nb-radiateurs":5,"regulation-radiateurs":"Je ne sais pas","pathologies":["Humidité / condensation"],"inconforts":["Froid en hiver"]}$json$::jsonb, null, 4, 95270, 97930, 'occupant', 'Rose', true, 3, true, 14),
      ('Laurent ROLIN', $json${"nom":"Laurent ROLIN","telephone":"06 84 59 10 53","adresse":"15 rue de la Commanderie, 54000 Nancy","email":"","type-coproprietaire":"Personne physique","nb-personnes-foyer":2,"composition-menage":"Famille monoparentale","nb-personnes-charge":1,"rfr-foyer":42120,"rfr-n2":40770,"accord-visite":"Oui","curatelle-tutelle":"Non","situation-sociale":"Non","importance-travaux":"Utiles"}$json$::jsonb, $json${"type-occupation":"Propriétaire occupant","nb-habitants":2,"type-residence":"Résidence principale","commodat":"Non","projet-vente":"Non","demembrement":"Non","nb-fenetres":5,"nb-simple-vitrage":0,"nb-occultations":5,"nb-occultations-origine":4,"nb-stores":0,"changement-menuiseries":["Non, aucun changement récent"],"type-chauffage":"Collectif","energie-chauffage":"Fioul","type-ecs":"Collectif","energie-ecs":"Même système que le chauffage","nb-radiateurs":5,"regulation-radiateurs":"Oui, sur une partie seulement","pathologies":["Aucune pathologie"],"inconforts":["Froid en hiver","Courants d'air"]}$json$::jsonb, null, 2, 42120, 40770, 'occupant', 'Violet', false, 2, true, 11),
      ('Nadia MASSON', $json${"nom":"Nadia MASSON","telephone":"06 44 63 68 92","adresse":"15 rue de la Commanderie, 54000 Nancy","email":"nadia.masson@stanislas-demo.fr","type-coproprietaire":"Personne physique","nb-personnes-foyer":2,"composition-menage":"Famille monoparentale","nb-personnes-charge":1,"rfr-foyer":19980,"rfr-n2":19450,"accord-visite":"Non","curatelle-tutelle":"Non","situation-sociale":"Non","importance-travaux":"Utiles"}$json$::jsonb, $json${"type-occupation":"Propriétaire occupant","nb-habitants":2,"type-residence":"Résidence principale","commodat":"Non","projet-vente":"Non","demembrement":"Non","nb-fenetres":6,"nb-simple-vitrage":0,"nb-occultations":6,"nb-occultations-origine":1,"nb-stores":0,"changement-menuiseries":["Oui, les fenêtres"],"type-chauffage":"Collectif","energie-chauffage":"Fioul","type-ecs":"Collectif","energie-ecs":"Même système que le chauffage","nb-radiateurs":7,"regulation-radiateurs":"Oui, sur une partie seulement","pathologies":["Humidité / condensation","Moisissures"],"inconforts":["Froid en hiver"]}$json$::jsonb, null, 2, 19980, 19450, 'occupant', 'Bleu', true, 3, true, 46),
      ('Maxime et Martine WEBER', $json${"nom":"Maxime et Martine WEBER","telephone":"06 35 21 37 26","adresse":"15 rue de la Commanderie, 54000 Nancy","email":"maxime.weber@stanislas-demo.fr","type-coproprietaire":"Personne physique","nb-personnes-foyer":2,"composition-menage":"Couple sans enfant","nb-personnes-charge":0,"rfr-foyer":16170,"rfr-n2":16330,"accord-visite":"Oui","curatelle-tutelle":"Non","situation-sociale":"Non","importance-travaux":"Indispensables"}$json$::jsonb, $json${"type-occupation":"Propriétaire occupant","nb-habitants":2,"type-residence":"Résidence principale","commodat":"Non","projet-vente":"Non","demembrement":"Non","nb-fenetres":6,"nb-simple-vitrage":5,"nb-occultations":6,"nb-occultations-origine":6,"nb-stores":0,"changement-menuiseries":["Non, aucun changement récent"],"type-chauffage":"Collectif","energie-chauffage":"Fioul","type-ecs":"Collectif","energie-ecs":"Même système que le chauffage","nb-radiateurs":7,"regulation-radiateurs":"Oui, sur tous les radiateurs","pathologies":["Humidité / condensation","Fissures"],"inconforts":["Froid en hiver","Chaleur excessive en été","Courants d'air"]}$json$::jsonb, null, 2, 16170, 16330, 'occupant', 'Bleu', true, 5, true, 32),
      ('Martine MULLER', $json${"nom":"Martine MULLER","telephone":"06 35 29 50 68","adresse":"15 rue de la Commanderie, 54000 Nancy","email":"","type-coproprietaire":"Personne physique","nb-personnes-foyer":2,"composition-menage":"Famille monoparentale","nb-personnes-charge":1,"rfr-foyer":30550,"rfr-n2":31370,"accord-visite":"Oui","curatelle-tutelle":"Non","situation-sociale":"Non","importance-travaux":"Indispensables"}$json$::jsonb, $json${"type-occupation":"Propriétaire occupant","nb-habitants":2,"type-residence":"Résidence principale","commodat":"Non","projet-vente":"Non","demembrement":"Non","nb-fenetres":8,"nb-simple-vitrage":8,"nb-occultations":8,"nb-occultations-origine":0,"nb-stores":2,"changement-menuiseries":["Non, aucun changement récent"],"type-chauffage":"Collectif","energie-chauffage":"Fioul","type-ecs":"Collectif","energie-ecs":"Même système que le chauffage","nb-radiateurs":7,"regulation-radiateurs":"Je ne sais pas","pathologies":["Moisissures"],"inconforts":["Aucun inconfort particulier"]}$json$::jsonb, null, 2, 30550, 31370, 'occupant', 'Jaune', false, 4, true, 12),
      ('Claire BENALI', $json${"nom":"Claire BENALI","telephone":"03 83 67 96 68","adresse":"15 rue de la Commanderie, 54000 Nancy","email":"","type-coproprietaire":"Personne physique","nb-personnes-foyer":1,"composition-menage":"Personne seule","nb-personnes-charge":0,"rfr-foyer":12090,"rfr-n2":11970,"accord-visite":"Oui","curatelle-tutelle":"Non","situation-sociale":"Non","importance-travaux":"Peu utiles"}$json$::jsonb, $json${"type-occupation":"Propriétaire occupant","nb-habitants":1,"type-residence":"Résidence principale","commodat":"Non","projet-vente":"Non","demembrement":"Non","nb-fenetres":6,"nb-simple-vitrage":0,"nb-occultations":6,"nb-occultations-origine":1,"nb-stores":2,"changement-menuiseries":["Oui, les fenêtres"],"type-chauffage":"Collectif","energie-chauffage":"Fioul","type-ecs":"Collectif","energie-ecs":"Même système que le chauffage","nb-radiateurs":4,"regulation-radiateurs":"Non","pathologies":["Aucune pathologie"],"inconforts":["Froid en hiver"]}$json$::jsonb, null, 1, 12090, 11970, 'occupant', 'Bleu', false, 6, true, 15),
      ('Sandrine DA COSTA', $json${"nom":"Sandrine DA COSTA","telephone":"","adresse":"15 rue de la Commanderie, 54000 Nancy","email":"","type-coproprietaire":"Personne physique","nb-personnes-foyer":1,"composition-menage":"Personne seule","nb-personnes-charge":0,"rfr-foyer":44060,"rfr-n2":44390,"accord-visite":"Oui","curatelle-tutelle":"Non","situation-sociale":"Non","importance-travaux":"Peu utiles"}$json$::jsonb, $json${"type-occupation":"Propriétaire occupant","nb-habitants":1,"type-residence":"Résidence principale","commodat":"Non","projet-vente":"Oui, après les travaux","demembrement":"Non","nb-fenetres":5,"nb-simple-vitrage":2,"nb-occultations":5,"nb-occultations-origine":5,"nb-stores":0,"changement-menuiseries":["Non, aucun changement récent"],"type-chauffage":"Collectif","energie-chauffage":"Fioul","type-ecs":"Collectif","energie-ecs":"Même système que le chauffage","nb-radiateurs":6,"regulation-radiateurs":"Je ne sais pas","pathologies":["Humidité / condensation"],"inconforts":["Chaleur excessive en été","Parois ou sols froids"]}$json$::jsonb, null, 1, 44060, 44390, 'occupant', 'Rose', true, 5, true, 41),
      ('Emilie FERREIRA', $json${"nom":"Emilie FERREIRA","telephone":"03 83 73 86 63","adresse":"15 rue de la Commanderie, 54000 Nancy","email":"","type-coproprietaire":"Personne physique","nb-personnes-foyer":1,"composition-menage":"Personne seule","nb-personnes-charge":0,"rfr-foyer":12250,"rfr-n2":11820,"accord-visite":"Oui","curatelle-tutelle":"Non","situation-sociale":"Non","importance-travaux":"Utiles"}$json$::jsonb, $json${"type-occupation":"Propriétaire occupant","nb-habitants":1,"type-residence":"Résidence principale","commodat":"Non","projet-vente":"Non","demembrement":"Non","nb-fenetres":4,"nb-simple-vitrage":3,"nb-occultations":4,"nb-occultations-origine":4,"nb-stores":0,"changement-menuiseries":["Non, aucun changement récent"],"type-chauffage":"Collectif","energie-chauffage":"Fioul","type-ecs":"Collectif","energie-ecs":"Même système que le chauffage","nb-radiateurs":5,"regulation-radiateurs":"Non","pathologies":["Aucune pathologie"],"inconforts":["Froid en hiver"]}$json$::jsonb, null, 1, 12250, 11820, 'occupant', 'Bleu', true, 1, true, 37),
      ('Leila NGUYEN', $json${"nom":"Leila NGUYEN","telephone":"03 83 39 31 45","adresse":"15 rue de la Commanderie, 54000 Nancy","email":"leila.nguyen@stanislas-demo.fr","type-coproprietaire":"Personne physique","nb-personnes-foyer":1,"composition-menage":"Personne seule","nb-personnes-charge":0,"rfr-foyer":21320,"rfr-n2":21020,"accord-visite":"Non","curatelle-tutelle":"Non","situation-sociale":"Non","importance-travaux":"Indispensables"}$json$::jsonb, $json${"type-occupation":"Propriétaire occupant","nb-habitants":1,"type-residence":"Résidence principale","commodat":"Non","projet-vente":"Non","demembrement":"Non","nb-fenetres":4,"nb-simple-vitrage":0,"nb-occultations":4,"nb-occultations-origine":4,"nb-stores":0,"changement-menuiseries":["Oui, les fenêtres"],"type-chauffage":"Collectif","energie-chauffage":"Fioul","type-ecs":"Collectif","energie-ecs":"Même système que le chauffage","nb-radiateurs":6,"regulation-radiateurs":"Oui, sur une partie seulement","pathologies":["Moisissures"],"inconforts":["Aucun inconfort particulier"]}$json$::jsonb, null, 1, 21320, 21020, 'occupant', 'Jaune', true, 3, true, 22),
      ('Paul et Emilie TRAN', $json${"nom":"Paul et Emilie TRAN","telephone":"","adresse":"15 rue de la Commanderie, 54000 Nancy","email":"","type-coproprietaire":"Personne physique","nb-personnes-foyer":2,"composition-menage":"Couple sans enfant","nb-personnes-charge":0,"rfr-foyer":39550,"rfr-n2":39370,"accord-visite":"Non","curatelle-tutelle":"Non","situation-sociale":"Non","importance-travaux":"Sans avis"}$json$::jsonb, $json${"type-occupation":"Propriétaire occupant","nb-habitants":2,"type-residence":"Résidence principale","commodat":"Non","projet-vente":"Non","demembrement":"Non","nb-fenetres":5,"nb-simple-vitrage":0,"nb-occultations":5,"nb-occultations-origine":5,"nb-stores":0,"changement-menuiseries":["Oui, les fenêtres"],"type-chauffage":"Collectif","energie-chauffage":"Fioul","type-ecs":"Collectif","energie-ecs":"Même système que le chauffage","nb-radiateurs":6,"regulation-radiateurs":"Oui, sur une partie seulement","pathologies":["Aucune pathologie"],"inconforts":["Aucun inconfort particulier"]}$json$::jsonb, null, 2, 39550, 39370, 'occupant', 'Violet', false, 2, true, 8),
      ('Maxime GAUTHIER', $json${"nom":"Maxime GAUTHIER","telephone":"","adresse":"15 rue de la Commanderie, 54000 Nancy","email":"","type-coproprietaire":"Personne physique","nb-personnes-foyer":2,"composition-menage":"Famille monoparentale","nb-personnes-charge":1,"rfr-foyer":37260,"rfr-n2":36160,"accord-visite":"Oui","curatelle-tutelle":"Non","situation-sociale":"Non","importance-travaux":"Indispensables"}$json$::jsonb, $json${"type-occupation":"Propriétaire occupant","nb-habitants":2,"type-residence":"Résidence principale","commodat":"Non","projet-vente":"Non","demembrement":"Non","nb-fenetres":6,"nb-simple-vitrage":0,"nb-occultations":6,"nb-occultations-origine":6,"nb-stores":1,"changement-menuiseries":["Oui, les fenêtres"],"type-chauffage":"Collectif","energie-chauffage":"Fioul","type-ecs":"Collectif","energie-ecs":"Même système que le chauffage","nb-radiateurs":4,"regulation-radiateurs":"Oui, sur tous les radiateurs","pathologies":["Aucune pathologie"],"inconforts":["Froid en hiver"]}$json$::jsonb, null, 2, 37260, 36160, 'occupant', 'Violet', true, 4, true, 14),
      ('Isabelle DUPONT', $json${"nom":"Isabelle DUPONT","telephone":"","adresse":"15 rue de la Commanderie, 54000 Nancy","email":"isabelle.dupont@stanislas-demo.fr","type-coproprietaire":"Personne physique","nb-personnes-foyer":1,"composition-menage":"Personne seule","nb-personnes-charge":0,"rfr-foyer":11470,"rfr-n2":10930,"accord-visite":"Oui, sous conditions (précisez)","curatelle-tutelle":"Non","situation-sociale":"Non","importance-travaux":"Indispensables"}$json$::jsonb, $json${"type-occupation":"Propriétaire occupant","nb-habitants":1,"type-residence":"Résidence principale","commodat":"Non","projet-vente":"Non","demembrement":"Non","nb-fenetres":8,"nb-simple-vitrage":0,"nb-occultations":8,"nb-occultations-origine":8,"nb-stores":0,"changement-menuiseries":["Oui, les fenêtres"],"type-chauffage":"Collectif","energie-chauffage":"Fioul","type-ecs":"Collectif","energie-ecs":"Même système que le chauffage","nb-radiateurs":5,"regulation-radiateurs":"Non","pathologies":["Humidité / condensation"],"inconforts":["Aucun inconfort particulier"]}$json$::jsonb, null, 1, 11470, 10930, 'occupant', 'Bleu', true, 5, true, 8),
      ('Camille et Jean MOREAU', $json${"nom":"Camille et Jean MOREAU","telephone":"06 32 35 98 34","adresse":"9 rue Serpenoise, 57000 Metz","email":"camille.moreau@stanislas-demo.fr","type-coproprietaire":"Personne physique","nb-personnes-foyer":4,"composition-menage":"Couple avec enfant(s)","nb-personnes-charge":2,"rfr-foyer":63820,"rfr-n2":64900,"accord-visite":"Oui","curatelle-tutelle":"Non","situation-sociale":"Non","importance-travaux":"Peu utiles"}$json$::jsonb, $json${"type-occupation":"Propriétaire bailleur (logement loué)","nb-habitants":1,"type-residence":"Résidence principale","commodat":"Non","projet-vente":"Non","demembrement":"Non","nb-fenetres":5,"nb-simple-vitrage":3,"nb-occultations":5,"nb-occultations-origine":5,"nb-stores":2,"changement-menuiseries":["Non, aucun changement récent"],"type-chauffage":"Collectif","energie-chauffage":"Fioul","type-ecs":"Collectif","energie-ecs":"Même système que le chauffage","nb-radiateurs":7,"regulation-radiateurs":"Oui, sur tous les radiateurs","pathologies":["Fissures"],"inconforts":["Froid en hiver","Parois ou sols froids"]}$json$::jsonb, null, 4, 63820, 64900, 'bailleur', 'Violet', false, 3, true, 46),
      ('Laurent GIRARD', $json${"nom":"Laurent GIRARD","telephone":"06 70 58 50 45","adresse":"15 rue de la Commanderie, 54000 Nancy","email":"","type-coproprietaire":"Personne physique","nb-personnes-foyer":1,"composition-menage":"Personne seule","nb-personnes-charge":0,"rfr-foyer":55020,"rfr-n2":52800,"accord-visite":"Oui","curatelle-tutelle":"Non","situation-sociale":"Non","importance-travaux":"Utiles"}$json$::jsonb, $json${"type-occupation":"Propriétaire occupant","nb-habitants":1,"type-residence":"Résidence principale","commodat":"Non","projet-vente":"Non","demembrement":"Non","nb-fenetres":8,"nb-simple-vitrage":0,"nb-occultations":8,"nb-occultations-origine":7,"nb-stores":0,"changement-menuiseries":["Non, aucun changement récent"],"type-chauffage":"Collectif","energie-chauffage":"Fioul","type-ecs":"Collectif","energie-ecs":"Même système que le chauffage","nb-radiateurs":6,"regulation-radiateurs":"Oui, sur tous les radiateurs","pathologies":["Aucune pathologie"],"inconforts":["Chaleur excessive en été"]}$json$::jsonb, null, 1, 55020, 52800, 'occupant', 'Rose', false, 6, true, 12),
      ('Helene ROBERT', $json${"nom":"Helene ROBERT","telephone":"06 11 76 34 92","adresse":"15 rue de la Commanderie, 54000 Nancy","email":"helene.robert@stanislas-demo.fr","type-coproprietaire":"Personne physique","nb-personnes-foyer":2}$json$::jsonb, $json${"type-occupation":"Propriétaire occupant"}$json$::jsonb, null, null, null, null, 'occupant', null, false, 7, false, 10),
      ('Sophie FOURNIER', $json${"nom":"Sophie FOURNIER","telephone":"06 18 70 17 22","adresse":"15 rue de la Commanderie, 54000 Nancy","email":"sophie.fournier@stanislas-demo.fr","type-coproprietaire":"Personne physique","nb-personnes-foyer":1,"composition-menage":"Personne seule","nb-personnes-charge":0,"rfr-foyer":38690,"rfr-n2":37030,"accord-visite":"Oui","curatelle-tutelle":"Non","situation-sociale":"Non","importance-travaux":"Peu utiles"}$json$::jsonb, $json${"type-occupation":"Propriétaire occupant","nb-habitants":1,"type-residence":"Résidence principale","commodat":"Non","projet-vente":"Oui, après les travaux","demembrement":"Non","nb-fenetres":6,"nb-simple-vitrage":0,"nb-occultations":6,"nb-occultations-origine":6,"nb-stores":3,"changement-menuiseries":["Non, aucun changement récent"],"type-chauffage":"Collectif","energie-chauffage":"Fioul","type-ecs":"Collectif","energie-ecs":"Même système que le chauffage","nb-radiateurs":7,"regulation-radiateurs":"Je ne sais pas","pathologies":["Humidité / condensation","Fissures"],"inconforts":["Froid en hiver","Courants d'air"]}$json$::jsonb, null, 1, 38690, 37030, 'occupant', 'Rose', true, 3, true, 8),
      ('Celine LAMBERT', $json${"nom":"Celine LAMBERT","telephone":"06 31 28 28 14","adresse":"15 rue de la Commanderie, 54000 Nancy","email":"celine.lambert@stanislas-demo.fr","type-coproprietaire":"Personne physique","nb-personnes-foyer":1}$json$::jsonb, $json${"type-occupation":"Propriétaire occupant"}$json$::jsonb, null, null, null, null, 'occupant', null, false, 1, false, 37),
      ('Mehdi BONNET', $json${"nom":"Mehdi BONNET","telephone":"06 49 50 43 23","adresse":"15 rue de la Commanderie, 54000 Nancy","email":"mehdi.bonnet@stanislas-demo.fr","type-coproprietaire":"Personne physique","nb-personnes-foyer":1,"composition-menage":"Personne seule","nb-personnes-charge":0,"rfr-foyer":12040,"rfr-n2":12210,"accord-visite":"Oui","curatelle-tutelle":"Non","situation-sociale":"Non","importance-travaux":"Indispensables"}$json$::jsonb, $json${"type-occupation":"Propriétaire occupant","nb-habitants":1,"type-residence":"Résidence principale","commodat":"Non","projet-vente":"Oui, après les travaux","demembrement":"Non","nb-fenetres":4,"nb-simple-vitrage":0,"nb-occultations":4,"nb-occultations-origine":4,"nb-stores":3,"changement-menuiseries":["Oui, les fenêtres"],"type-chauffage":"Collectif","energie-chauffage":"Fioul","type-ecs":"Collectif","energie-ecs":"Même système que le chauffage","nb-radiateurs":6,"regulation-radiateurs":"Oui, sur tous les radiateurs","pathologies":["Aucune pathologie"],"inconforts":["Froid en hiver","Courants d'air"]}$json$::jsonb, null, 1, 12040, 12210, 'occupant', 'Bleu', false, 6, true, 43),
      ('Paul et Patricia MERCIER', $json${"nom":"Paul et Patricia MERCIER","telephone":"03 83 75 93 71","adresse":"15 rue de la Commanderie, 54000 Nancy","email":"paul.mercier@stanislas-demo.fr","type-coproprietaire":"Personne physique","nb-personnes-foyer":2,"composition-menage":"Couple sans enfant","nb-personnes-charge":0,"rfr-foyer":23160,"rfr-n2":23540,"accord-visite":"Non","curatelle-tutelle":"Non","situation-sociale":"Non","importance-travaux":"Indispensables"}$json$::jsonb, $json${"type-occupation":"Propriétaire occupant","nb-habitants":2,"type-residence":"Résidence principale","commodat":"Non","projet-vente":"Je ne sais pas encore","demembrement":"Non","nb-fenetres":4,"nb-simple-vitrage":1,"nb-occultations":4,"nb-occultations-origine":4,"nb-stores":0,"changement-menuiseries":["Non, aucun changement récent"],"type-chauffage":"Collectif","energie-chauffage":"Fioul","type-ecs":"Collectif","energie-ecs":"Même système que le chauffage","nb-radiateurs":4,"regulation-radiateurs":"Je ne sais pas","pathologies":["Aucune pathologie"],"inconforts":["Froid en hiver","Parois ou sols froids"]}$json$::jsonb, null, 2, 23160, 23540, 'occupant', 'Bleu', true, 6, true, 18),
      ('Laurent BLANC', $json${"nom":"Laurent BLANC","telephone":"06 20 45 29 51","adresse":"15 rue de la Commanderie, 54000 Nancy","email":"laurent.blanc@stanislas-demo.fr","type-coproprietaire":"Personne physique","nb-personnes-foyer":1,"composition-menage":"Personne seule","nb-personnes-charge":0,"rfr-foyer":20930,"rfr-n2":20620,"accord-visite":"Oui","curatelle-tutelle":"Non","situation-sociale":"Non","importance-travaux":"Indispensables"}$json$::jsonb, $json${"type-occupation":"Propriétaire occupant","nb-habitants":1,"type-residence":"Résidence principale","commodat":"Non","projet-vente":"Non","demembrement":"Non","nb-fenetres":5,"nb-simple-vitrage":0,"nb-occultations":5,"nb-occultations-origine":5,"nb-stores":0,"changement-menuiseries":["Non, aucun changement récent"],"type-chauffage":"Collectif","energie-chauffage":"Fioul","type-ecs":"Collectif","energie-ecs":"Même système que le chauffage","nb-radiateurs":5,"regulation-radiateurs":"Oui, sur tous les radiateurs","pathologies":["Aucune pathologie"],"inconforts":["Froid en hiver"]}$json$::jsonb, null, 1, 20930, 20620, 'occupant', 'Jaune', true, 7, true, 9),
      ('Christine GUERIN', $json${"nom":"Christine GUERIN","telephone":"06 76 76 42 73","adresse":"15 rue de la Commanderie, 54000 Nancy","email":"christine.guerin@stanislas-demo.fr","type-coproprietaire":"Personne physique","nb-personnes-foyer":1,"composition-menage":"Personne seule","nb-personnes-charge":0,"rfr-foyer":20050,"rfr-n2":19230,"accord-visite":"Oui","curatelle-tutelle":"Non","situation-sociale":"Non","importance-travaux":"Indispensables"}$json$::jsonb, $json${"type-occupation":"Propriétaire occupant","nb-habitants":1,"type-residence":"Résidence principale","commodat":"Non","projet-vente":"Non","demembrement":"Non","nb-fenetres":6,"nb-simple-vitrage":0,"nb-occultations":6,"nb-occultations-origine":6,"nb-stores":2,"changement-menuiseries":["Oui, les fenêtres"],"type-chauffage":"Collectif","energie-chauffage":"Fioul","type-ecs":"Collectif","energie-ecs":"Même système que le chauffage","nb-radiateurs":7,"regulation-radiateurs":"Je ne sais pas","pathologies":["Humidité / condensation"],"inconforts":["Froid en hiver","Courants d'air"]}$json$::jsonb, null, 1, 20050, 19230, 'occupant', 'Jaune', false, 7, true, 23),
      ('Julie ROUX', $json${"nom":"Julie ROUX","telephone":"03 83 54 91 93","adresse":"15 rue de la Commanderie, 54000 Nancy","email":"julie.roux@stanislas-demo.fr","type-coproprietaire":"Personne physique","nb-personnes-foyer":2,"composition-menage":"Famille monoparentale","nb-personnes-charge":1,"rfr-foyer":30040,"rfr-n2":29220,"accord-visite":"Oui","curatelle-tutelle":"Non","situation-sociale":"Non","importance-travaux":"Indispensables"}$json$::jsonb, $json${"type-occupation":"Propriétaire occupant","nb-habitants":2,"type-residence":"Résidence principale","commodat":"Non","projet-vente":"Non","demembrement":"Non","nb-fenetres":4,"nb-simple-vitrage":0,"nb-occultations":4,"nb-occultations-origine":3,"nb-stores":2,"changement-menuiseries":["Non, aucun changement récent"],"type-chauffage":"Collectif","energie-chauffage":"Fioul","type-ecs":"Collectif","energie-ecs":"Même système que le chauffage","nb-radiateurs":7,"regulation-radiateurs":"Oui, sur tous les radiateurs","pathologies":["Humidité / condensation"],"inconforts":["Courants d'air"]}$json$::jsonb, null, 2, 30040, 29220, 'occupant', 'Jaune', false, 4, true, 21),
      ('Amina DUBOIS', $json${"nom":"Amina DUBOIS","telephone":"06 22 43 28 24","adresse":"15 rue de la Commanderie, 54000 Nancy","email":"amina.dubois@stanislas-demo.fr","type-coproprietaire":"Personne physique","nb-personnes-foyer":1,"composition-menage":"Personne seule","nb-personnes-charge":0,"rfr-foyer":55410,"rfr-n2":56600,"accord-visite":"Oui","curatelle-tutelle":"Non","situation-sociale":"Non","importance-travaux":"Sans avis"}$json$::jsonb, $json${"type-occupation":"Propriétaire occupant","nb-habitants":1,"type-residence":"Résidence principale","commodat":"Non","projet-vente":"Non","demembrement":"Non","nb-fenetres":6,"nb-simple-vitrage":0,"nb-occultations":6,"nb-occultations-origine":2,"nb-stores":0,"changement-menuiseries":["Oui, les fenêtres"],"type-chauffage":"Collectif","energie-chauffage":"Fioul","type-ecs":"Collectif","energie-ecs":"Même système que le chauffage","nb-radiateurs":5,"regulation-radiateurs":"Oui, sur une partie seulement","pathologies":["Aucune pathologie"],"inconforts":["Froid en hiver","Chaleur excessive en été","Courants d'air"]}$json$::jsonb, null, 1, 55410, 56600, 'occupant', 'Rose', false, 1, true, 37),
      ('Mehdi et Leila PETIT', $json${"nom":"Mehdi et Leila PETIT","telephone":"06 21 14 55 57","adresse":"15 rue de la Commanderie, 54000 Nancy","email":"mehdi.petit@stanislas-demo.fr","type-coproprietaire":"Personne physique","nb-personnes-foyer":3,"composition-menage":"Couple avec enfant(s)","nb-personnes-charge":1,"rfr-foyer":43480,"rfr-n2":42590,"accord-visite":"Oui","curatelle-tutelle":"Non","situation-sociale":"Non","importance-travaux":"Peu utiles"}$json$::jsonb, $json${"type-occupation":"Propriétaire occupant","nb-habitants":3,"type-residence":"Résidence principale","commodat":"Non","projet-vente":"Je ne sais pas encore","demembrement":"Non","nb-fenetres":7,"nb-simple-vitrage":5,"nb-occultations":7,"nb-occultations-origine":7,"nb-stores":0,"changement-menuiseries":["Non, aucun changement récent"],"type-chauffage":"Collectif","energie-chauffage":"Fioul","type-ecs":"Collectif","energie-ecs":"Même système que le chauffage","nb-radiateurs":7,"regulation-radiateurs":"Oui, sur une partie seulement","pathologies":["Humidité / condensation"],"inconforts":["Aucun inconfort particulier"]}$json$::jsonb, null, 3, 43480, 42590, 'occupant', 'Violet', false, 2, true, 10),
      ('Lea HUMBERT', $json${"nom":"Lea HUMBERT","telephone":"06 37 23 31 27","adresse":"6 rue de la Republique, 69002 Lyon","email":"lea.humbert@stanislas-demo.fr","type-coproprietaire":"Personne physique","nb-personnes-foyer":1}$json$::jsonb, $json${"type-occupation":"Propriétaire bailleur (logement loué)"}$json$::jsonb, null, null, null, null, 'bailleur', null, false, 3, false, 14),
      ('Jean et Helene AUBRY', $json${"nom":"Jean et Helene AUBRY","telephone":"","adresse":"31 boulevard Voltaire, 75011 Paris","email":"jean.aubry@stanislas-demo.fr","type-coproprietaire":"Personne physique","nb-personnes-foyer":4,"composition-menage":"Couple avec enfant(s)","nb-personnes-charge":2,"rfr-foyer":30750,"rfr-n2":30240,"accord-visite":"Oui","curatelle-tutelle":"Non","situation-sociale":"Non","importance-travaux":"Indispensables"}$json$::jsonb, $json${"type-occupation":"Propriétaire bailleur (logement loué)","nb-habitants":2,"type-residence":"Résidence principale","commodat":"Non","projet-vente":"Non","demembrement":"Non","nb-fenetres":5,"nb-simple-vitrage":0,"nb-occultations":5,"nb-occultations-origine":2,"nb-stores":3,"changement-menuiseries":["Oui, les fenêtres"],"type-chauffage":"Collectif","energie-chauffage":"Fioul","type-ecs":"Collectif","energie-ecs":"Même système que le chauffage","nb-radiateurs":4,"regulation-radiateurs":"Oui, sur tous les radiateurs","pathologies":["Aucune pathologie"],"inconforts":["Froid en hiver","Courants d'air"]}$json$::jsonb, null, 4, 30750, 30240, 'bailleur', 'Bleu', true, 7, true, 24),
      ('Valerie et Mehdi ADAM', $json${"nom":"Valerie et Mehdi ADAM","telephone":"06 36 75 35 52","adresse":"15 rue de la Commanderie, 54000 Nancy","email":"valerie.adam@stanislas-demo.fr","type-coproprietaire":"Personne physique","nb-personnes-foyer":2}$json$::jsonb, $json${"type-occupation":"Propriétaire occupant"}$json$::jsonb, null, null, null, null, 'occupant', null, false, 1, false, 23),
      ('Maxime et Martine BOULANGER', $json${"nom":"Maxime et Martine BOULANGER","telephone":"03 83 95 43 90","adresse":"15 rue de la Commanderie, 54000 Nancy","email":"maxime.boulanger@stanislas-demo.fr","type-coproprietaire":"Personne physique","nb-personnes-foyer":4,"composition-menage":"Couple avec enfant(s)","nb-personnes-charge":2,"rfr-foyer":55430,"rfr-n2":52930,"accord-visite":"Oui","curatelle-tutelle":"Non","situation-sociale":"Non","importance-travaux":"Indispensables"}$json$::jsonb, $json${"type-occupation":"Propriétaire occupant","nb-habitants":4,"type-residence":"Résidence principale","commodat":"Non","projet-vente":"Non","demembrement":"Non","nb-fenetres":7,"nb-simple-vitrage":6,"nb-occultations":7,"nb-occultations-origine":7,"nb-stores":2,"changement-menuiseries":["Non, aucun changement récent"],"type-chauffage":"Collectif","energie-chauffage":"Fioul","type-ecs":"Collectif","energie-ecs":"Même système que le chauffage","nb-radiateurs":5,"regulation-radiateurs":"Oui, sur tous les radiateurs","pathologies":["Fissures"],"inconforts":["Froid en hiver","Chaleur excessive en été","Parois ou sols froids"]}$json$::jsonb, null, 4, 55430, 52930, 'occupant', 'Violet', true, 5, true, 45),
      ('Aurelie et Bernard TOUSSAINT', $json${"nom":"Aurelie et Bernard TOUSSAINT","telephone":"03 83 21 83 38","adresse":"15 rue de la Commanderie, 54000 Nancy","email":"aurelie.toussaint@stanislas-demo.fr","type-coproprietaire":"Personne physique","nb-personnes-foyer":4,"composition-menage":"Couple avec enfant(s)","nb-personnes-charge":2,"rfr-foyer":43250,"rfr-n2":42180,"accord-visite":"Oui","curatelle-tutelle":"Non","situation-sociale":"Non","importance-travaux":"Utiles"}$json$::jsonb, $json${"type-occupation":"Propriétaire occupant","nb-habitants":4,"type-residence":"Résidence principale","commodat":"Non","projet-vente":"Non","demembrement":"Non","nb-fenetres":6,"nb-simple-vitrage":0,"nb-occultations":6,"nb-occultations-origine":6,"nb-stores":3,"changement-menuiseries":["Oui, les fenêtres"],"type-chauffage":"Collectif","energie-chauffage":"Fioul","type-ecs":"Collectif","energie-ecs":"Même système que le chauffage","nb-radiateurs":4,"regulation-radiateurs":"Oui, sur une partie seulement","pathologies":["Fissures"],"inconforts":["Froid en hiver","Chaleur excessive en été"]}$json$::jsonb, null, 4, 43250, 42180, 'occupant', 'Jaune', false, 6, true, 37),
      ('Laurent GRANDIDIER', $json${"nom":"Laurent GRANDIDIER","telephone":"","adresse":"17 rue Saint-Dizier, 54000 Nancy","email":"laurent.grandidier@stanislas-demo.fr","type-coproprietaire":"Personne physique","nb-personnes-foyer":1,"composition-menage":"Personne seule","nb-personnes-charge":0,"rfr-foyer":19800,"rfr-n2":19040,"accord-visite":"Oui","curatelle-tutelle":"Non","situation-sociale":"Non","importance-travaux":"Utiles"}$json$::jsonb, $json${"type-occupation":"Propriétaire bailleur (logement loué)","nb-habitants":1,"type-residence":"Résidence principale","commodat":"Non","projet-vente":"Je ne sais pas encore","demembrement":"Non","nb-fenetres":6,"nb-simple-vitrage":1,"nb-occultations":6,"nb-occultations-origine":4,"nb-stores":1,"changement-menuiseries":["Non, aucun changement récent"],"type-chauffage":"Collectif","energie-chauffage":"Fioul","type-ecs":"Collectif","energie-ecs":"Même système que le chauffage","nb-radiateurs":7,"regulation-radiateurs":"Oui, sur tous les radiateurs","pathologies":["Humidité / condensation"],"inconforts":["Froid en hiver"]}$json$::jsonb, null, 1, 19800, 19040, 'bailleur', 'Jaune', true, 6, true, 36),
      ('Jean et Marie ZIMMERMANN', $json${"nom":"Jean et Marie ZIMMERMANN","telephone":"06 46 57 49 89","adresse":"15 rue de la Commanderie, 54000 Nancy","email":"jean.zimmermann@stanislas-demo.fr","type-coproprietaire":"Personne physique","nb-personnes-foyer":5,"composition-menage":"Couple avec enfant(s)","nb-personnes-charge":3,"rfr-foyer":119730,"rfr-n2":117850,"accord-visite":"Oui","curatelle-tutelle":"Non","situation-sociale":"Non","importance-travaux":"Utiles"}$json$::jsonb, $json${"type-occupation":"Propriétaire occupant","nb-habitants":5,"type-residence":"Résidence principale","commodat":"Non","projet-vente":"Non","demembrement":"Non","nb-fenetres":6,"nb-simple-vitrage":0,"nb-occultations":6,"nb-occultations-origine":1,"nb-stores":2,"changement-menuiseries":["Oui, les fenêtres"],"type-chauffage":"Collectif","energie-chauffage":"Fioul","type-ecs":"Collectif","energie-ecs":"Même système que le chauffage","nb-radiateurs":4,"regulation-radiateurs":"Oui, sur tous les radiateurs","pathologies":["Humidité / condensation"],"inconforts":["Aucun inconfort particulier"]}$json$::jsonb, null, 5, 119730, 117850, 'occupant', 'Rose', true, 3, true, 25),
      ('Christophe LORRAIN', $json${"nom":"Christophe LORRAIN","telephone":"06 16 37 87 39","adresse":"15 rue de la Commanderie, 54000 Nancy","email":"christophe.lorrain@stanislas-demo.fr","type-coproprietaire":"Personne physique","nb-personnes-foyer":2,"composition-menage":"Famille monoparentale","nb-personnes-charge":1,"rfr-foyer":31730,"rfr-n2":30320,"accord-visite":"Oui","curatelle-tutelle":"Non","situation-sociale":"Non","importance-travaux":"Indispensables"}$json$::jsonb, $json${"type-occupation":"Propriétaire occupant","nb-habitants":2,"type-residence":"Résidence principale","commodat":"Non","projet-vente":"Non","demembrement":"Non","nb-fenetres":8,"nb-simple-vitrage":0,"nb-occultations":8,"nb-occultations-origine":8,"nb-stores":1,"changement-menuiseries":["Oui, les fenêtres"],"type-chauffage":"Collectif","energie-chauffage":"Fioul","type-ecs":"Collectif","energie-ecs":"Même système que le chauffage","nb-radiateurs":5,"regulation-radiateurs":"Je ne sais pas","pathologies":["Aucune pathologie"],"inconforts":["Froid en hiver"]}$json$::jsonb, null, 2, 31730, 30320, 'occupant', 'Jaune', false, 5, true, 15),
      ('Maxime BARBIER', $json${"nom":"Maxime BARBIER","telephone":"03 83 90 90 53","adresse":"15 rue de la Commanderie, 54000 Nancy","email":"maxime.barbier@stanislas-demo.fr","type-coproprietaire":"Personne physique","nb-personnes-foyer":1,"composition-menage":"Personne seule","nb-personnes-charge":0,"rfr-foyer":17700,"rfr-n2":17920,"accord-visite":"Oui","curatelle-tutelle":"Non","situation-sociale":"Non","importance-travaux":"Utiles"}$json$::jsonb, $json${"type-occupation":"Propriétaire occupant","nb-habitants":1,"type-residence":"Résidence principale","commodat":"Non","projet-vente":"Non","demembrement":"Non","nb-fenetres":8,"nb-simple-vitrage":0,"nb-occultations":8,"nb-occultations-origine":2,"nb-stores":3,"changement-menuiseries":["Oui, les fenêtres"],"type-chauffage":"Collectif","energie-chauffage":"Fioul","type-ecs":"Collectif","energie-ecs":"Même système que le chauffage","nb-radiateurs":6,"regulation-radiateurs":"Oui, sur tous les radiateurs","pathologies":["Humidité / condensation"],"inconforts":["Aucun inconfort particulier"]}$json$::jsonb, null, 1, 17700, 17920, 'occupant', 'Jaune', true, 4, true, 44),
      ('Mehdi CHRETIEN', $json${"nom":"Mehdi CHRETIEN","telephone":"06 49 39 90 87","adresse":"15 rue de la Commanderie, 54000 Nancy","email":"mehdi.chretien@stanislas-demo.fr","type-coproprietaire":"Personne physique","nb-personnes-foyer":1,"composition-menage":"Personne seule","nb-personnes-charge":0,"rfr-foyer":29450,"rfr-n2":30060,"accord-visite":"Oui","curatelle-tutelle":"Non","situation-sociale":"Non","importance-travaux":"Indispensables"}$json$::jsonb, $json${"type-occupation":"Propriétaire occupant","nb-habitants":1,"type-residence":"Résidence principale","commodat":"Non","projet-vente":"Non","demembrement":"Non","nb-fenetres":5,"nb-simple-vitrage":0,"nb-occultations":5,"nb-occultations-origine":5,"nb-stores":3,"changement-menuiseries":["Non, aucun changement récent"],"type-chauffage":"Collectif","energie-chauffage":"Fioul","type-ecs":"Collectif","energie-ecs":"Même système que le chauffage","nb-radiateurs":4,"regulation-radiateurs":"Non","pathologies":["Aucune pathologie"],"inconforts":["Froid en hiver","Chaleur excessive en été","Courants d'air","Parois ou sols froids"]}$json$::jsonb, null, 1, 29450, 30060, 'occupant', 'Violet', true, 6, true, 39)
    ) as t(nom, copro, lot_hab, lot_com, nb_personnes, rfr, rfr_n2, occupation, profil, verifie, jours_verif, complet, jours)
  loop
    select id into v_cp from coproprietaires where copro_id = v_copro and nom = r.nom;
    -- Réponses par lot, clés = id des lots (comme le portail) ; lot-parent = lot principal.
    select coalesce(jsonb_object_agg(l.id::text,
      case l.usage
        when 'habitation' then jsonb_build_object('usage-lot', 'Habitation') || r.lot_hab
        when 'commerces' then jsonb_build_object('usage-lot', 'Commerce') || coalesce(r.lot_com, '{}'::jsonb)
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

-- ========== 3. Configuration du prêt collectif (CEGEE, 20 ans, adhésion ouverte) ==========
insert into copro_financement_config (copro_id, banque, duree_annees, adhesion_ouverte)
select id, 'CEGEE', 20, true from coproprietes where slug = 'demo-residence-stanislas'
on conflict (copro_id) do nothing;

-- ========== 4. Partage du PF définitif : scénario pont + plans individuels ==========
do $$
declare
  v_copro uuid;
  v_plan uuid;
  v_scen uuid;
  r record;
begin
  select id into v_copro from coproprietes where slug = 'demo-residence-stanislas';
  if v_copro is null then return; end if;
  select id into v_plan from plans_definitifs where copro_id = v_copro and statut = 'valide' order by updated_at desc limit 1;
  if v_plan is null then
    raise exception 'PF définitif validé absent - jouer seed_demo_horizon_etudes.sql d''abord.';
  end if;
  if exists (select 1 from scenarios_financiers where plan_definitif_id = v_plan) then
    raise notice 'Scénario pont déjà présent - bloc partage sauté.';
    return;
  end if;

  insert into scenarios_financiers (copro_id, name, statut, locked, bareme_millesime, params, plan_definitif_id, created_at, updated_at)
  values (
    v_copro,
    'PF définitif - Résidence Stanislas',
    'partage',
    true,
    2026,
    $json${"travaux":1564439.5,"honoraires":278262.25,"aleas":109510.77,"cle":"MUN","totalCle":10000,"mprCoproPct":58.24,"bonusPassoire":false,"cee":52000,"fonds":64000,"profils":{"Bleu":0,"Jaune":0,"Violet":0,"Rose":0},"primeIndiv":{"Bleu":3000,"Jaune":2250,"Violet":1500,"Rose":0},"ecoPtz":true,"ecoPtzDuree":20,"ecoPtzPct":100,"avancePct":70,"pretComplActif":false,"pretComplDuree":12}$json$::jsonb,
    v_plan,
    now() - interval '40 days',
    now() - interval '40 days'
  )
  returning id into v_scen;

  for r in
    select * from (values
      ('SCI COMMANDERIE', 498, 97220.18, 2589.6, 48561.37, 46069.21),
      ('Indivision HENRIOT', 338, 65984.78, 1757.6, 32959.33, 31267.86),
      ('Bernard et Josiane LECLERC', 268, 52319.3, 1393.6, 26133.43, 24792.27),
      ('SCI DU PLATEAU DE HAYE', 198, 38653.81, 1029.6, 19307.53, 18316.67),
      ('Sylvie ROSSI', 176, 34358.94, 915.2, 17162.25, 16281.49),
      ('Leila HUSSON', 173, 33773.28, 899.6, 16869.71, 16003.96),
      ('Christophe PIERRON', 173, 33773.28, 899.6, 16869.71, 16003.96),
      ('Laurent VILLEMIN', 173, 33773.28, 899.6, 16869.71, 16003.96),
      ('Laurence et Mehdi ANTOINE', 173, 33773.28, 899.6, 16869.71, 16003.96),
      ('Julie et Vincent HENRY', 173, 33773.28, 899.6, 16869.71, 16003.96),
      ('Laurent ROLIN', 173, 33773.28, 899.6, 16869.71, 16003.96),
      ('Aurelie KLEIN', 173, 33773.28, 899.6, 16869.71, 16003.96),
      ('Sandrine DA COSTA', 173, 33773.28, 899.6, 16869.71, 16003.96),
      ('Isabelle DUPONT', 168, 32797.17, 873.6, 16382.15, 15541.42),
      ('Sophie FOURNIER', 168, 32797.17, 873.6, 16382.15, 15541.42),
      ('Laurent BLANC', 168, 32797.17, 873.6, 16382.15, 15541.42),
      ('Mehdi et Leila PETIT', 168, 32797.17, 873.6, 16382.15, 15541.42),
      ('Valerie et Mehdi ADAM', 168, 32797.17, 873.6, 16382.15, 15541.42),
      ('Laurent GRANDIDIER', 168, 32797.17, 873.6, 16382.15, 15541.42),
      ('Mehdi CHRETIEN', 168, 32797.17, 873.6, 16382.15, 15541.42),
      ('Chloe et Rachid BIANCHI', 141, 27526.2, 733.2, 13749.3, 13043.69),
      ('Christophe THIRIET', 138, 26940.53, 717.6, 13456.77, 12766.17),
      ('Manon GERARD', 138, 26940.53, 717.6, 13456.77, 12766.17),
      ('Laurent et Valerie COLIN', 138, 26940.53, 717.6, 13456.77, 12766.17),
      ('Patricia BASTIEN', 138, 26940.53, 717.6, 13456.77, 12766.17),
      ('Mehdi CLAUDEL', 138, 26940.53, 717.6, 13456.77, 12766.17),
      ('Helene POIROT', 138, 26940.53, 717.6, 13456.77, 12766.17),
      ('Sophie et Thomas MATHIEU', 138, 26940.53, 717.6, 13456.77, 12766.17),
      ('Paul DIDIER', 138, 26940.53, 717.6, 13456.77, 12766.17),
      ('Ines NOEL', 138, 26940.53, 717.6, 13456.77, 12766.17),
      ('Amina et Jean REMY', 138, 26940.53, 717.6, 13456.77, 12766.17),
      ('Elodie JACQUOT', 138, 26940.53, 717.6, 13456.77, 12766.17),
      ('Nadia MASSON', 138, 26940.53, 717.6, 13456.77, 12766.17),
      ('Christophe SCHMITT', 138, 26940.53, 717.6, 13456.77, 12766.17),
      ('Martine MULLER', 138, 26940.53, 717.6, 13456.77, 12766.17),
      ('Claire BENALI', 138, 26940.53, 717.6, 13456.77, 12766.17),
      ('Emilie FERREIRA', 138, 26940.53, 717.6, 13456.77, 12766.17),
      ('Leila NGUYEN', 138, 26940.53, 717.6, 13456.77, 12766.17),
      ('Christophe et Monique LEFEVRE', 133, 25964.43, 691.6, 12969.2, 12303.62),
      ('Camille et Jean MOREAU', 133, 25964.43, 691.6, 12969.2, 12303.62),
      ('Laurent GIRARD', 133, 25964.43, 691.6, 12969.2, 12303.62),
      ('Celine LAMBERT', 133, 25964.43, 691.6, 12969.2, 12303.62),
      ('Mehdi BONNET', 133, 25964.43, 691.6, 12969.2, 12303.62),
      ('Christine GUERIN', 133, 25964.43, 691.6, 12969.2, 12303.62),
      ('Julie ROUX', 133, 25964.43, 691.6, 12969.2, 12303.62),
      ('Catherine RENARD', 133, 25964.43, 691.6, 12969.2, 12303.62),
      ('Lea HUMBERT', 133, 25964.43, 691.6, 12969.2, 12303.62),
      ('Maxime et Martine BOULANGER', 133, 25964.43, 691.6, 12969.2, 12303.62),
      ('Aurelie et Bernard TOUSSAINT', 133, 25964.43, 691.6, 12969.2, 12303.62),
      ('Jean et Marie ZIMMERMANN', 133, 25964.43, 691.6, 12969.2, 12303.62),
      ('Christophe LORRAIN', 133, 25964.43, 691.6, 12969.2, 12303.62),
      ('Manon et Lucas SIMONIN', 133, 25964.43, 691.6, 12969.2, 12303.62),
      ('Maxime MANGIN', 103, 20107.79, 535.6, 10043.82, 9528.37),
      ('Jean MARCHAL', 103, 20107.79, 535.6, 10043.82, 9528.37),
      ('Camille et Jean GEORGE', 103, 20107.79, 535.6, 10043.82, 9528.37),
      ('Maxime et Catherine PERRIN', 103, 20107.79, 535.6, 10043.82, 9528.37),
      ('Jean VAUTRIN', 103, 20107.79, 535.6, 10043.82, 9528.37),
      ('Paul et Nathalie GRANDJEAN', 103, 20107.79, 535.6, 10043.82, 9528.37),
      ('Maxime et Martine WEBER', 103, 20107.79, 535.6, 10043.82, 9528.37),
      ('Marie HADDAD', 103, 20107.79, 535.6, 10043.82, 9528.37),
      ('Paul et Emilie TRAN', 103, 20107.79, 535.6, 10043.82, 9528.37),
      ('Maxime GAUTHIER', 98, 19131.68, 509.6, 9556.25, 9065.83),
      ('Helene ROBERT', 98, 19131.68, 509.6, 9556.25, 9065.83),
      ('Paul et Patricia MERCIER', 98, 19131.68, 509.6, 9556.25, 9065.83),
      ('Amina DUBOIS', 98, 19131.68, 509.6, 9556.25, 9065.83),
      ('Jean et Helene AUBRY', 98, 19131.68, 509.6, 9556.25, 9065.83),
      ('Paul et Celine CUNY', 98, 19131.68, 509.6, 9556.25, 9065.83),
      ('Maxime BARBIER', 98, 19131.68, 509.6, 9556.25, 9065.83)
    ) as t(nom, tantiemes, quote_part, cee_part, subv_coll_part, reste)
  loop
    insert into plans_individuels (scenario_id, coproprietaire_id, tantiemes, quote_part, mpr_indiv, cee_part, subv_coll_part, eco_ptz_part, reste, mensualite, detail)
    select v_scen, cp.id, r.tantiemes, r.quote_part, 0, r.cee_part, r.subv_coll_part, 0, r.reste, 0,
           jsonb_build_object('source', 'pf', 'planDefinitifId', v_plan)
    from coproprietaires cp
    where cp.copro_id = v_copro and cp.nom = r.nom;
  end loop;
end $$;

-- ========== 5. Choix de financement transmis (portail) ou saisis (syndic / AMO) ==========
do $$
declare
  v_copro uuid;
  v_scen uuid;
  v_syndic uuid;
  v_amo uuid;
  r record;
  v_cp uuid;
begin
  select id into v_copro from coproprietes where slug = 'demo-residence-stanislas';
  if v_copro is null then return; end if;
  select s.id into v_scen from scenarios_financiers s
  join plans_definitifs p on p.id = s.plan_definitif_id
  where s.copro_id = v_copro and s.statut = 'partage' order by s.updated_at desc limit 1;
  if v_scen is null or exists (select 1 from choix_financement where scenario_id = v_scen) then
    raise notice 'Choix déjà présents ou scénario absent - bloc choix sauté.';
    return;
  end if;
  -- gestionnaire du dossier (compte syndic rattaché par e-mail) et chef de projet
  select u.id into v_syndic from coproprietes c join auth.users u on lower(u.email) = lower(c.gestionnaire_email)
  where c.id = v_copro limit 1;
  select u.id into v_amo from auth.users u where u.email = 'amir@strateco.fr' limit 1;

  for r in
    select * from (values
      ('SCI DU PLATEAU DE HAYE', 'fonds', null, 'copro', 12),
      ('Indivision HENRIOT', 'collectif', null, 'copro', 34),
      ('Bernard et Josiane LECLERC', 'collectif', null, 'amo', 24),
      ('Christophe THIRIET', 'fonds', null, 'syndic', 8),
      ('Maxime MANGIN', 'collectif', null, 'copro', 12),
      ('Leila HUSSON', 'collectif', null, 'copro', 15),
      ('Manon GERARD', 'individuel', 10, 'copro', 23),
      ('Laurent et Valerie COLIN', 'collectif', null, 'copro', 18),
      ('Christophe PIERRON', 'individuel', 20, 'copro', 32),
      ('Patricia BASTIEN', 'collectif', null, 'copro', 24),
      ('Mehdi CLAUDEL', 'collectif', null, 'copro', 20),
      ('Laurent VILLEMIN', 'individuel', 20, 'copro', 10),
      ('Helene POIROT', 'collectif', null, 'copro', 21),
      ('Jean VAUTRIN', 'collectif', null, 'copro', 29),
      ('Julie et Vincent HENRY', 'fonds', null, 'copro', 26),
      ('Amina et Jean REMY', 'fonds', null, 'copro', 20),
      ('Laurent ROLIN', 'individuel', 20, 'copro', 7),
      ('Christophe SCHMITT', 'collectif', null, 'copro', 10),
      ('Aurelie KLEIN', 'collectif', null, 'copro', 13),
      ('Martine MULLER', 'collectif', null, 'copro', 2),
      ('Claire BENALI', 'collectif', null, 'copro', 32),
      ('Marie HADDAD', 'collectif', null, 'copro', 12),
      ('Sandrine DA COSTA', 'fonds', null, 'syndic', 8),
      ('Emilie FERREIRA', 'individuel', 20, 'copro', 32),
      ('Leila NGUYEN', 'fonds', null, 'copro', 18),
      ('Sylvie ROSSI', 'collectif', null, 'copro', 23),
      ('Chloe et Rachid BIANCHI', 'collectif', null, 'copro', 5),
      ('Christophe et Monique LEFEVRE', 'fonds', null, 'copro', 19),
      ('Maxime GAUTHIER', 'collectif', null, 'copro', 3),
      ('Isabelle DUPONT', 'fonds', null, 'copro', 17),
      ('Camille et Jean MOREAU', 'individuel', 20, 'copro', 2),
      ('Helene ROBERT', 'collectif', null, 'copro', 33),
      ('Sophie FOURNIER', 'individuel', 10, 'copro', 3),
      ('Mehdi BONNET', 'individuel', 10, 'copro', 13),
      ('Paul et Patricia MERCIER', 'collectif', null, 'copro', 3),
      ('Laurent BLANC', 'fonds', null, 'syndic', 13),
      ('Julie ROUX', 'collectif', null, 'copro', 29),
      ('Lea HUMBERT', 'collectif', null, 'copro', 7),
      ('Aurelie et Bernard TOUSSAINT', 'individuel', 10, 'copro', 2),
      ('Jean et Marie ZIMMERMANN', 'individuel', 15, 'copro', 13),
      ('Maxime BARBIER', 'individuel', 20, 'copro', 30),
      ('Manon et Lucas SIMONIN', 'individuel', 10, 'copro', 10)
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
      case r.saisi_par when 'syndic' then v_syndic when 'amo' then v_amo else null end
    );
  end loop;
end $$;

-- ========== 6. Adhésions au prêt collectif (signées ou en brouillon, sans fichiers) ==========
do $$
declare
  v_copro uuid;
  v_scen uuid;
  r record;
  v_cp uuid;
begin
  select id into v_copro from coproprietes where slug = 'demo-residence-stanislas';
  if v_copro is null or exists (select 1 from adhesions_pret where copro_id = v_copro) then
    raise notice 'Adhésions déjà présentes - bloc sauté.';
    return;
  end if;
  select id into v_scen from scenarios_financiers where copro_id = v_copro and statut = 'partage' order by updated_at desc limit 1;

  for r in
    select * from (values
      ('Bernard et Josiane LECLERC', 'brouillon', $json${"adherent1":{"nomPrenom":"LECLERC Bernard","nomNaissance":"MULLER","dateLieuNaissance":"22/11/1949 à Metz","profession":"Ingenieur(e)","professionDepuis":"01/12/2018","situation":"veuve","situationDepuis":""},"adherent2":null,"adresse":"12 rue des Jardins","cp":"54600","ville":"Villers-les-Nancy","telDomicile":"","telBureau":"","portable":"03 83 40 22 67","email":"bernard.leclerc@stanislas-demo.fr","montantType":"100","montantAutre":"","lieuSignature":""}$json$::jsonb, 19, null),
      ('Maxime MANGIN', 'signee', $json${"adherent1":{"nomPrenom":"MANGIN Maxime","nomNaissance":"MANGIN","dateLieuNaissance":"10/06/1975 à Epinal","profession":"Fonctionnaire territorial(e)","professionDepuis":"01/04/2000","situation":"celibataire","situationDepuis":"05/02/1995"},"adherent2":null,"adresse":"15 rue de la Commanderie","cp":"54000","ville":"Nancy","telDomicile":"","telBureau":"","portable":"06 83 35 52 15","email":"maxime.mangin@stanislas-demo.fr","montantType":"100","montantAutre":"","lieuSignature":"Nancy"}$json$::jsonb, 12, 'discordant'),
      ('Leila HUSSON', 'signee', $json${"adherent1":{"nomPrenom":"HUSSON Leila","nomNaissance":"HUSSON","dateLieuNaissance":"19/12/1968 à Toul","profession":"Technicien(ne)","professionDepuis":"01/11/2002","situation":"celibataire","situationDepuis":""},"adherent2":null,"adresse":"15 rue de la Commanderie","cp":"54000","ville":"Nancy","telDomicile":"","telBureau":"","portable":"03 83 88 80 30","email":"leila.husson@stanislas-demo.fr","montantType":"100","montantAutre":"","lieuSignature":"Nancy"}$json$::jsonb, 12, 'non_verifie'),
      ('Patricia BASTIEN', 'signee', $json${"adherent1":{"nomPrenom":"BASTIEN Patricia","nomNaissance":"FOURNIER","dateLieuNaissance":"17/09/1981 à Toul","profession":"Aide-soignant(e)","professionDepuis":"01/01/2012","situation":"veuve","situationDepuis":""},"adherent2":null,"adresse":"22 avenue du General Leclerc","cp":"54500","ville":"Vandoeuvre-les-Nancy","telDomicile":"","telBureau":"","portable":"06 32 77 74 42","email":"patricia.bastien@stanislas-demo.fr","montantType":"100","montantAutre":"","lieuSignature":"Nancy"}$json$::jsonb, 21, 'non_verifie'),
      ('Mehdi CLAUDEL', 'signee', $json${"adherent1":{"nomPrenom":"CLAUDEL Mehdi","nomNaissance":"BIANCHI","dateLieuNaissance":"01/09/1978 à Metz","profession":"Artisan","professionDepuis":"01/08/2007","situation":"mariee","situationDepuis":"11/08/1993"},"adherent2":null,"adresse":"15 rue de la Commanderie","cp":"54000","ville":"Nancy","telDomicile":"","telBureau":"","portable":"03 83 57 30 16","email":"mehdi.claudel@stanislas-demo.fr","montantType":"100","montantAutre":"","lieuSignature":"Nancy"}$json$::jsonb, 19, 'concordant'),
      ('Helene POIROT', 'brouillon', $json${"adherent1":{"nomPrenom":"POIROT Helene","nomNaissance":"GRANDJEAN","dateLieuNaissance":"06/04/1976 à Paris","profession":"Agent administratif","professionDepuis":"01/01/2018","situation":"celibataire","situationDepuis":"23/07/2019"},"adherent2":null,"adresse":"15 rue de la Commanderie","cp":"54000","ville":"Nancy","telDomicile":"","telBureau":"","portable":"03 83 25 82 81","email":"helene.poirot@stanislas-demo.fr","montantType":"100","montantAutre":"","lieuSignature":""}$json$::jsonb, 18, null),
      ('Jean VAUTRIN', 'brouillon', $json${"adherent1":{"nomPrenom":"VAUTRIN Jean","nomNaissance":"VAUTRIN","dateLieuNaissance":"09/01/1970 à Nancy","profession":"Retraite(e)","professionDepuis":"01/02/2006","situation":"celibataire","situationDepuis":""},"adherent2":null,"adresse":"15 rue de la Commanderie","cp":"54000","ville":"Nancy","telDomicile":"","telBureau":"","portable":"06 70 53 52 22","email":"jean.vautrin@stanislas-demo.fr","montantType":"100","montantAutre":"","lieuSignature":""}$json$::jsonb, 27, null),
      ('Aurelie KLEIN', 'signee', $json${"adherent1":{"nomPrenom":"KLEIN Aurelie","nomNaissance":"KLEIN","dateLieuNaissance":"06/02/1985 à Metz","profession":"Retraite(e)","professionDepuis":"01/01/2016","situation":"divorcee","situationDepuis":"09/03/1999"},"adherent2":null,"adresse":"15 rue de la Commanderie","cp":"54000","ville":"Nancy","telDomicile":"","telBureau":"","portable":"06 87 13 21 73","email":"aurelie.klein@stanislas-demo.fr","montantType":"100","montantAutre":"","lieuSignature":"Nancy"}$json$::jsonb, 13, 'concordant'),
      ('Martine MULLER', 'brouillon', $json${"adherent1":{"nomPrenom":"MULLER Martine","nomNaissance":"MULLER","dateLieuNaissance":"16/05/1968 à Toul","profession":"Retraite(e)","professionDepuis":"01/01/1999","situation":"veuve","situationDepuis":""},"adherent2":null,"adresse":"15 rue de la Commanderie","cp":"54000","ville":"Nancy","telDomicile":"","telBureau":"","portable":"06 35 29 50 68","email":"","montantType":"100","montantAutre":"","lieuSignature":""}$json$::jsonb, 0, null),
      ('Marie HADDAD', 'brouillon', $json${"adherent1":{"nomPrenom":"HADDAD Marie","nomNaissance":"HADDAD","dateLieuNaissance":"02/02/1976 à Epinal","profession":"Aide-soignant(e)","professionDepuis":"01/06/2016","situation":"divorcee","situationDepuis":""},"adherent2":null,"adresse":"15 rue de la Commanderie","cp":"54000","ville":"Nancy","telDomicile":"","telBureau":"","portable":"","email":"marie.haddad@stanislas-demo.fr","montantType":"100","montantAutre":"","lieuSignature":""}$json$::jsonb, 10, null),
      ('Sylvie ROSSI', 'brouillon', $json${"adherent1":{"nomPrenom":"ROSSI Sylvie","nomNaissance":"LAMBERT","dateLieuNaissance":"02/08/1988 à Toul","profession":"Ingenieur(e)","professionDepuis":"01/04/2023","situation":"mariee","situationDepuis":"15/06/1991"},"adherent2":null,"adresse":"15 rue de la Commanderie","cp":"54000","ville":"Nancy","telDomicile":"","telBureau":"","portable":"03 83 28 82 89","email":"","montantType":"100","montantAutre":"","lieuSignature":""}$json$::jsonb, 19, null),
      ('Chloe et Rachid BIANCHI', 'brouillon', $json${"adherent1":{"nomPrenom":"BIANCHI Chloe","nomNaissance":"BIANCHI","dateLieuNaissance":"03/03/1967 à Nancy","profession":"Retraite(e)","professionDepuis":"01/05/2019","situation":"veuve","situationDepuis":""},"adherent2":null,"adresse":"15 rue de la Commanderie","cp":"54000","ville":"Nancy","telDomicile":"","telBureau":"","portable":"06 55 10 90 77","email":"chloe.bianchi@stanislas-demo.fr","montantType":"100","montantAutre":"","lieuSignature":""}$json$::jsonb, 4, null),
      ('Julie ROUX', 'brouillon', $json${"adherent1":{"nomPrenom":"ROUX Julie","nomNaissance":"ROUX","dateLieuNaissance":"23/08/1975 à Nancy","profession":"Agent administratif","professionDepuis":"01/03/2016","situation":"mariee","situationDepuis":"26/11/2005"},"adherent2":null,"adresse":"15 rue de la Commanderie","cp":"54000","ville":"Nancy","telDomicile":"","telBureau":"","portable":"03 83 54 91 93","email":"julie.roux@stanislas-demo.fr","montantType":"100","montantAutre":"","lieuSignature":""}$json$::jsonb, 25, null),
      ('Lea HUMBERT', 'brouillon', $json${"adherent1":{"nomPrenom":"HUMBERT Lea","nomNaissance":"HUMBERT","dateLieuNaissance":"07/10/1979 à Metz","profession":"Aide-soignant(e)","professionDepuis":"01/06/2021","situation":"pacsee","situationDepuis":""},"adherent2":null,"adresse":"6 rue de la Republique","cp":"69002","ville":"Lyon","telDomicile":"","telBureau":"","portable":"06 37 23 31 27","email":"lea.humbert@stanislas-demo.fr","montantType":"100","montantAutre":"","lieuSignature":""}$json$::jsonb, 4, null)
    ) as t(nom, statut, form, jours, rib)
  loop
    select id into v_cp from coproprietaires where copro_id = v_copro and nom = r.nom;
    insert into adhesions_pret (copro_id, coproprietaire_id, scenario_id, statut, form, lieu_signature, signed_at, rib_concordance, created_at, updated_at)
    values (
      v_copro, v_cp, v_scen, r.statut, r.form,
      case when r.statut = 'signee' then 'Nancy' else null end,
      case when r.statut = 'signee' then now() - (r.jours || ' days')::interval else null end,
      r.rib,
      now() - (r.jours || ' days')::interval - interval '1 hour',
      now() - (r.jours || ' days')::interval
    );
  end loop;
end $$;

commit;

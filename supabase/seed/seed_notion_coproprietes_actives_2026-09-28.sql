-- Complétude de la base depuis le classeur Notion « Coproprietes_actives_Strateco_2026-09-28_v2.xlsx »
-- (demande d'Amir du 28/09/2026, après la comparaison classeur / logiciel).
-- Les affaires de Kawtar sont exclues : elles ne sont pas à jour dans Notion.
--
-- 1. Organisations : une enseigne par syndic du classeur absent du logiciel (+ ITA 67 pour Armorial).
-- 2. 97 copropriétés créées comme le ferait useCreateCopro() : bâtiment déclaré 01 + plan de tâches
--    gabarit (miroir de src/lib/taskTemplate.ts) ; phase = lecture de l'état Notion, jamais stocké :
--    PASSATION -> diagnostic, P2 voté / P3 prog -> études, P3 voté / Done -> travaux.
--    Gestionnaire : première adresse de la cellule (le logiciel n'en garde qu'une).
-- 3. Corrections tranchées par Amir sur les dossiers existants (updated_at conservé).
-- 4. E-mails des maîtres d'œuvre : principale = adresse la plus citée, les autres en copie ;
--    les boîtes propres à un dossier (stockholm@ingedair.com...) en contacts, sans alerte.
-- Rejouable : inserts idempotents (on conflict / not exists), updates ciblés.

begin;

-- ========== 1. Organisations ==========
insert into organisations (nom, slug) values
  ('Agence Mercor', 'agence-mercor'),
  ('Alsace Promotion Gestion', 'alsace-promotion-gestion'),
  ('Alsace Résidence', 'alsace-residence'),
  ('Ariane Benedic Immobilier', 'ariane-benedic-immobilier'),
  ('ASI / Agence Strasbourg Immobilière', 'asi-agence-strasbourg-immobiliere'),
  ('B&S Immobilier', 'b-s-immobilier'),
  ('Cabinet Univers', 'cabinet-univers'),
  ('CCLV Immo', 'cclv-immo'),
  ('CG IMMO', 'cg-immo'),
  ('Citya POIREL', 'citya-poirel'),
  ('Claude Rizzon', 'claude-rizzon'),
  ('Concept Immobilier Thionville', 'concept-immobilier-thionville'),
  ('Coop de l''Ill', 'coop-de-l-ill'),
  ('Fil à l’Immo', 'fil-a-l-immo'),
  ('Foncia ABFC', 'foncia-abfc'),
  ('Foncia Alsace', 'foncia-alsace'),
  ('Foncia Colmar', 'foncia-colmar'),
  ('Foncia Mulhouse', 'foncia-mulhouse'),
  ('Foncia Sarrebourg', 'foncia-sarrebourg'),
  ('Foncia Strasbourg', 'foncia-strasbourg'),
  ('Foncia Thionville', 'foncia-thionville'),
  ('Groupe Dumur', 'groupe-dumur'),
  ('ICA Gestion', 'ica-gestion'),
  ('Immobilière La Ravinelle', 'immobiliere-la-ravinelle'),
  ('Immoval', 'immoval'),
  ('ITA 67', 'ita-67'),
  ('Laforêt', 'laforet'),
  ('Lamy Metz', 'lamy-metz'),
  ('Liehr', 'liehr'),
  ('Nexity HAGUENAU', 'nexity-haguenau'),
  ('Nexity Mulhouse', 'nexity-mulhouse'),
  ('Nexity NANCY', 'nexity-nancy'),
  ('ORPI Central Immobilier', 'orpi-central-immobilier'),
  ('PHILIPPE PONCET CONSEIL', 'philippe-poncet-conseil'),
  ('Relais Immo Gestion', 'relais-immo-gestion'),
  ('SOGESTRA', 'sogestra'),
  ('Triplex Immobilier', 'triplex-immobilier'),
  ('Troyes Aubes Habitat', 'troyes-aubes-habitat'),
  ('Wicker Immo', 'wicker-immo')
on conflict (slug) do nothing;

-- ========== 2. Les 97 copropriétés ==========
with src (name, slug, nb_logements, adresse, code_postal, city, phase, gestionnaire_nom, gestionnaire_email, chef_projet, org_nom, maitre_oeuvre) as (values
  ('10-14 ZIEGELFELD', '10-14-ziegelfeld', 28, '10/14 rue de Ziegelfeld', '67100', 'Strasbourg', 'diagnostic', 'Olivier PLAT', 'olivier.plat@immium.com', 'Amir', 'IMMIUM', null),
  ('32 rue de la Libération', '32-rue-de-la-liberation', 5, '32 rue de la libération', '67200', 'Strasbourg', 'diagnostic', 'Gaëlle PICART', 'contact@bsimmobilier.net', 'Amir', 'B&S Immobilier', null),
  ('47-49-51-Rue Jean LAFONTAINE', '47-49-51-rue-jean-lafontaine', 24, '47-49-51-Rue Jean LAFONTAINE', '10000', 'Troyes', 'etudes', 'Aline COURQUET LEVERT', 'acourquetlevert@troyes-aube-habitat.fr', 'Amir', 'Troyes Aubes Habitat', 'MS Promotion'),
  ('BUCER 11 Rue Martin BUCER', 'bucer-11-rue-martin-bucer', 15, '11 rue Martin Bucer', '67000', 'Strasbourg', 'etudes', 'Elodie DOMINGOS', 'elodie.domingos@foncia.com', 'Amir', 'Foncia Alsace', null),
  ('BUCER 11A Rue Martin BUCER', 'bucer-11a-rue-martin-bucer', 10, '11A rue Martin Bucer', '67000', 'Strasbourg', 'etudes', 'Elodie DOMINGOS', 'elodie.domingos@foncia.com', 'Amir', 'Foncia Alsace', null),
  ('BUCER 30 rue Sainte-Marguerite', 'bucer-30-rue-sainte-marguerite', 15, '30 rue Sainte-Marguerite', '67000', 'Strasbourg', 'etudes', 'Elodie DOMINGOS', 'elodie.domingos@foncia.com', 'Amir', 'Foncia Alsace', null),
  ('La renaissance - 8 rue Ignace Spies à Selestat', 'la-renaissance-8-rue-ignace-spies-a-selestat', 12, '8 rue Ignace Spies', '67600', 'Sélestat', 'etudes', 'Jean-Philippe LANG', 'gtimmo@hotmail.com', 'Amir', 'GT Immo', 'AMC'),
  ('2-4 rue Léo LAGRANGE', '2-4-rue-leo-lagrange', 8, '2-4 rue Léo LAGRANGE', '10000', 'Troyes', 'travaux', 'Aline COURQUET LEVERT', 'acourquetlevert@troyes-aube-habitat.fr', 'Amir', 'Troyes Aubes Habitat', 'MS Promotion'),
  ('LE MADRID', 'le-madrid', 95, '2 rue d''Amsterdam', '68000', 'Colmar', 'etudes', 'Lionel SEGARD', 'l.segard@tripleximmobilier.fr', 'Louaa', 'Triplex Immobilier', 'Hoffert'),
  ('LES CONTADES', 'les-contades', 162, '1 à 3 rue René Hirschler, 4-5 rue René Hirschler, 1B rue René Hirschler, 20-22-24-26 Avenue de la Paix', '67000', 'Strasbourg', 'etudes', 'Lionel HALPHEN', 'lionel.halphen@immoval.com', 'Louaa', 'Immoval', 'Atelier G5'),
  ('Rue du 8 mai 1945', 'rue-du-8-mai-1945', 80, '56-58-70-72 rue du 8 mai 1945', '10000', 'Troyes', 'etudes', 'Marie AZZOPARDI', 'mazzopardi@troyes-aube-habitat.fr', 'Louaa', 'Troyes Aubes Habitat', 'ACPC'),
  ('1-3 RUE DU JURA', '1-3-rue-du-jura', 16, '1-3 Rue du Jura', '57000', 'Metz', 'travaux', 'Caroline BONY', 'gestcopro2metz@rizzon.com', 'Louaa', 'Claude Rizzon', 'AMC'),
  ('ADELSHOFFEN', 'adelshoffen', 46, '1A rue de Haguenau - 1 rue de la Charrue', '67300', 'Schiltigheim', 'travaux', 'Florent REHEL', 'f.rehel@coopdelill.fr', 'Louaa', 'Coop de l''Ill', 'Ingedair'),
  ('AMAZONE ZAMBEZE', 'amazone-zambeze', 58, '135 rue de la République', '54140', 'Jarville-la-Malgrange', 'travaux', 'Lucas MUTELET', 'lmutelet@lamy-immobilier.fr', 'Louaa', 'Nexity NANCY', 'Acceo'),
  ('BEAUREGARD ST-CLAUDE', 'beauregard-st-claude', 36, '6-8-10 rue Gustave Charpentier', '54000', 'Nancy', 'travaux', 'Lucas MUTELET', 'lmutelet@lamy-immobilier.fr', 'Louaa', 'Nexity NANCY', 'Acceo'),
  ('BEAURIVAGE (Thionville)', 'beaurivage-thionville', 96, '28 rue du Général de Castelnau', '57100', 'Thionville', 'travaux', 'Yannick BAYEUL', 'yannick.bayeul@dumur.fr', 'Louaa', 'Groupe Dumur', 'A.COM'),
  ('LE BALZAC', 'le-balzac', 112, '44-46-48-50 avenue Racine', '67200', 'Strasbourg', 'travaux', 'Kamail AZFAL', 'kamail.afzal@cgimmo.com', 'Louaa', 'CG IMMO', 'CNB.archi'),
  ('LE CALLOT', 'le-callot', 40, '1 Rue Jacques Callot', '54500', 'Vandœuvre-lès-Nancy', 'travaux', 'Julien GARRIC', 'jgarric@citya.com', 'Louaa', 'Citya POIREL', 'PRE CONCEPT'),
  ('LE CONCORDE', 'le-concorde', 46, '1-3-5 rue Thomas Becquet', '67500', 'Haguenau', 'travaux', 'Valentine ALBANESE', 'valbanese@lamy-immobilier.fr', 'Louaa', 'Nexity HAGUENAU', 'Ingedair'),
  ('LES ERABLES (COLMAR)', 'les-erables-colmar', 9, '1-3 rue de l''école', '68000', 'Colmar', 'travaux', 'Frederic BELTZUNG', 'fanny.noyer@foncia.com', 'Louaa', 'Foncia ABFC', 'Vito conseil'),
  ('LES MARAICHERS', 'les-maraichers', 31, '65 RUE DU LAVOIR', '57000', 'Metz', 'travaux', 'Caroline BONY', 'gestcopro2metz@rizzon.com', 'Louaa', 'Claude Rizzon', 'Fischer'),
  ('PARC CHOPIN', 'parc-chopin', 49, '57 rue Emile Bertin', '54000', 'Nancy', 'travaux', 'Mathilde JUNG', 'mjung@immodefrancelorraine.fr', 'Louaa', 'Immobilière La Ravinelle', 'Kern Architectes'),
  ('PLAINE', 'plaine', 20, '5-7 rue de la plaine', '57000', 'Metz', 'travaux', 'Catherine PRATURLON', 'catherine.praturlon@dumur.fr', 'Louaa', 'Groupe Dumur', 'LEBIGOT'),
  ('SQUARE DU CHÂTEAU', 'square-du-chateau', 76, '2-4 square du château', '67300', 'Schiltigheim', 'travaux', 'Alexandre FLORES', 'alexandre.flores@asi67.com', 'Louaa', 'ASI / Agence Strasbourg Immobilière', 'CNB.archi'),
  ('TAMARIS 1', 'tamaris-1', 14, '1 et 3 rue des Tamaris', '57400', 'Sarrebourg', 'travaux', 'Jessica MUNOZ', 'jessica.munoz@foncia.fr', 'Louaa', 'Foncia Sarrebourg', 'Ingedair'),
  ('TAMARIS 2', 'tamaris-2', 15, '5 rue des Tamaris', '57400', 'Sarrebourg', 'travaux', 'Jessica MUNOZ', 'jessica.munoz@foncia.fr', 'Louaa', 'Foncia Sarrebourg', 'Ingedair'),
  ('LA BALOISE', 'la-baloise', 12, '72 route de Bâle', '68000', 'Colmar', 'travaux', 'Audrey BASS', 'audrey.bass@bassimmobilier.fr', 'Louaa', 'ICA Gestion', 'Hoffert'),
  ('Schumann', 'schumann', 111, '23,25,27,29 rue Schumann', '67000', 'Strasbourg', 'travaux', 'Fabien LIPMANN', 'fabien.lipmann@foncia.com', 'Louaa', 'Foncia Strasbourg', 'CNB.archi'),
  ('VERT GALANT 3', 'vert-galant-3', 30, '48-50 Rue d’Altkirch', '67100', 'Strasbourg', 'travaux', 'Sylvie PFRIMMER', 'sylvie.pfrimmer@immoval.com', 'Louaa', 'Immoval', 'Goepfert'),
  ('12 rue de Schurmfeld', '12-rue-de-schurmfeld', 14, '12 rue de Schurmfeld', null, 'Strasbourg', 'etudes', 'Pierre BALTZ', 'pierre.baltz@foncia.com', 'Radia', 'Foncia ABFC', 'Ingedair'),
  ('33-35 RUE MELANIE', '33-35-rue-melanie', 52, '33-35 rue Mélanie', '67200', 'Strasbourg', 'etudes', 'Valentine ALBANESE', 'valbanese@lamy-immobilier.fr', 'Radia', 'Ariane Benedic Immobilier', 'Ingedair'),
  ('34 rue Wimpheling - 34 rue Geiler', '34-rue-wimpheling-34-rue-geiler', 32, '34 rue Wimpheling - 34 rue Geiler', '67000', 'Strasbourg', 'etudes', 'Olivier PLAT', 'olivier.plat@immium.com', 'Radia', 'IMMIUM', 'ANBRA'),
  ('Ami Fritz', 'ami-fritz', 25, '147-157 route du Polygone', '67100', 'Strasbourg', 'etudes', 'Elodie DOMINGOS', 'elodie.domingos@foncia.com', 'Radia', 'Foncia Strasbourg', 'Ingedair'),
  ('GLIESBERG 1', 'gliesberg-1', 64, '12 rue de Haslach', '67200', 'Strasbourg', 'etudes', 'BERNHEIM', 'contact@bsimmobilier.net', 'Radia', 'B&S Immobilier', 'CNB.archi'),
  ('RÉSIDENCE RIEDISHEIM I', 'residence-riedisheim-i', 95, '75-79 RUE NAVIGATION, 3 RUE ALBERT SCHWEITZER, 7-9-11-13-15-17-19-21-23-25 RUE A. SCHWEITZER', '68400', 'Riedisheim', 'etudes', 'Camille WAECHTER', 'cwaechter@lamy-immobilier.fr', 'Radia', 'Nexity Mulhouse', 'Ingedair'),
  ('ILE DU MOULIN', 'ile-du-moulin', 50, '16-18 avenue Pierre Mendes France', '67300', 'Schiltigheim', 'etudes', 'Alexandre FLORES', 'alexandre.flores@asi67.com', 'Radia', 'ASI / Agence Strasbourg Immobilière', 'CHHK'),
  ('SAINT-DIE', 'saint-die', 21, '100 rue de Saint-Dié', '67000', 'Strasbourg', 'etudes', 'Vincent RUCH', 'vincent.ruch@sogestra.fr', 'Radia', 'SOGESTRA', 'Atelier G5'),
  ('17 rue des Alpes', '17-rue-des-alpes', 4, '17 rue des Alpes', '68180', 'Horbourg-Wihr', 'travaux', 'Laurent GANGLOFF', 'syndic@relais-immo-gestion.com', 'Radia', 'Relais Immo Gestion', 'Vito conseil'),
  ('6 RUE D''ENSISHEIM', '6-rue-d-ensisheim', 10, '6 rue d''Ensisheim', '67100', 'Strasbourg', 'travaux', 'Elodie DOMINGOS', 'elodie.domingos@foncia.com', 'Radia', 'Foncia Strasbourg', 'WOLF'),
  ('GROUPE ZIEGELFELD', 'groupe-ziegelfeld', 80, '16-18 rue de Beblenheim, 20-22-24 rue de Zellenberg, 49-51 rue du Ziegelfeld, 1-3-5 rue d’Ebersheim', '67100', 'Strasbourg', 'travaux', 'Paul SCHILLINGER', 'paul.schillinger@asi67.com', 'Radia', 'ASI / Agence Strasbourg Immobilière', 'CNB.archi'),
  ('Hirondelles (Strasbourg)', 'hirondelles-strasbourg', 21, '34-36 rue Stosskopf', '67100', 'Strasbourg', 'travaux', 'Jérémy KIENTZ', 'jeremy.kientz@sogestra.fr', 'Radia', 'SOGESTRA', 'Ingedair'),
  ('LA ROSERAIE', 'la-roseraie', 44, '4 route d''oberhausbergen', '67200', 'Strasbourg', 'travaux', 'Elodie DOMINGOS', 'elodie.domingos@foncia.com', 'Radia', 'Foncia Strasbourg', 'Ingedair'),
  ('LE RUBENS', 'le-rubens', 15, '71 Boulevard De L''Europe', '57070', 'Metz', 'travaux', 'Caroline BONY', 'gestcopro2metz@rizzon.com', 'Radia', 'Claude Rizzon', 'AMC'),
  ('LES PLEIADES', 'les-pleiades', 208, '1-7 Place Lamartine', '67400', 'Illkirch-Graffenstaden', 'travaux', 'Vincent RUCH', 'vincent.ruch@sogestra.fr', 'Radia', 'SOGESTRA', 'CNB.archi'),
  ('PETERSGARTEN', 'petersgarten', 18, '1-3-5 rue du Petersgarten', '67000', 'Strasbourg', 'travaux', 'Philippe PONCET', 'philippe@poncet-syndic.fr', 'Radia', 'PHILIPPE PONCET CONSEIL', 'AMC'),
  ('STOCKMEYER', 'stockmeyer', 12, '6 rue Stockmeyer', '68000', 'Colmar', 'travaux', 'Laurent GANGLOFF', 'syndic@relais-immo-gestion.com', 'Radia', 'Relais Immo Gestion', 'Vito conseil'),
  ('210 route de mittelhausbergen', '210-route-de-mittelhausbergen', 40, '210 route de mittelhausbergen', '67200', 'Strasbourg', 'travaux', 'Clémence THIESEN', 'clemence.thiesen@immoval.com', 'Radia', 'Immoval', 'Collectivité services'),
  ('6 à 12 rue d''orbey', '6-a-12-rue-d-orbey', 72, '6 à 12 rue d''orbey', '67100', 'Strasbourg', 'travaux', 'Virginie CAILLOL', 'cclvimmo@gmail.com', 'Radia', 'CCLV Immo', 'Ingedair'),
  ('ALTORFFER', 'altorffer', 19, '4 Quai Charles Altorffer', '67000', 'Strasbourg', 'travaux', 'Isabelle GEBEL', 'isabelle.gebel@immium.com', 'Radia', 'IMMIUM', 'LAMA'),
  ('LE PETIT PRINCE', 'le-petit-prince', 30, '176 route du Polygone', '67100', 'Strasbourg', 'travaux', 'Fabien LIPMANN', 'fabien.lipmann@foncia.com', 'Radia', 'Foncia ABFC', 'Ingedair'),
  ('Les primevères', 'les-primeveres', 39, '2 à 10 rue de la bretagne', '67150', 'Erstein', 'travaux', 'Virginie CAILLOL', 'cclvimmo@gmail.com', 'Radia', 'CCLV Immo', 'Atelier Briot Gomez'),
  ('12 RUE LAVOISIER - Le CONCORDE', '12-rue-lavoisier-le-concorde', 36, '12 rue Lavoisier', '68330', 'Huningue', 'etudes', 'Olivier LARANJEIRA', 'olivier.laranjeira@foncia.com', 'Wafaa', 'Foncia Mulhouse', 'Vito conseil'),
  ('29 boulevard d''Anvers', '29-boulevard-d-anvers', 11, '29 boulevard d''Anvers', '67000', 'Strasbourg', 'etudes', 'Pierre BALTZ', 'pierre.baltz@foncia.com', 'Wafaa', 'Foncia ABFC', 'DALI Architecture'),
  ('30 Rue Wimpheling', '30-rue-wimpheling', 39, '30 Rue Wimpheling', '67100', 'Strasbourg', 'etudes', 'Matthieu ECK', 'matthieu.eck@foncia.com', 'Wafaa', 'Foncia Strasbourg', 'Ingedair'),
  ('5-7 Bd de la Marne', '5-7-bd-de-la-marne', 32, '5-7 Bd de la Marne', '67100', 'Strasbourg', 'etudes', 'Paul SCHILLINGER', 'paul.schillinger@asi67.com', 'Wafaa', 'ASI / Agence Strasbourg Immobilière', 'AMC sous-traitant Ingedair'),
  ('GAI LOGIS', 'gai-logis', 21, '15 rue Sainte-Elisabeth', '67000', 'Strasbourg', 'etudes', 'Florent REHEL', 'f.rehel@coopdelill.fr', 'Wafaa', 'Coop de l''Ill', 'Atelier G5'),
  ('IM GROETTEL', 'im-groettel', 40, '3-5-7, rue des Merles / 33-34, rue des Tilleuls', '67380', 'Lingolsheim', 'etudes', 'Melissa ZIMMER', 'melissa.zimmer@mercor.fr', 'Wafaa', 'Agence Mercor', 'AMC sous-traitant Ingedair'),
  ('Le Beau site', 'le-beau-site', 12, '16 rue Jacques Preiss', '68000', 'Colmar', 'etudes', 'Adeline LORSON', 'adeline.lorson@foncia.com', 'Wafaa', 'Foncia Colmar', 'Imaée'),
  ('LE RABELAIS', 'le-rabelais', 31, '4 rue des Bonnes Gens', '67000', 'Strasbourg', 'etudes', 'Nicolas LOMMELE', 'nicolas.lommele@cgimmo.com', 'Wafaa', 'CG IMMO', 'Atelier G5'),
  ('Les cèdres', 'les-cedres', 27, '3-3A-3B rue de la Semm', '68000', 'Colmar', 'etudes', 'Ophélie MEYER', 'o.meyer@ap-gest.fr', 'Wafaa', 'Alsace Promotion Gestion', 'Hoffert'),
  ('LES EGLANTINES', 'les-eglantines', 20, '1, rue de la Bagatelle', '68000', 'Colmar', 'etudes', 'Nicolas UDOVICIC', 'nudovicic@liehr.fr', 'Wafaa', 'Liehr', 'Solaresbauen'),
  ('1-3 rue de Soultz', '1-3-rue-de-soultz', 20, '1-3 rue de Soultz', '67100', 'Strasbourg', 'etudes', 'Manon HAROUDJ SCHMITT', 'manon.haroudj-schmitt@foncia.com', 'Wafaa', 'Foncia Strasbourg', 'ANBRA'),
  ('35 rue d’Illkirch', '35-rue-d-illkirch', 10, '35 rue d’Illkirch', null, null, 'etudes', 'Olivier OSWALD', 'contact@alsaceresidence.fr', 'Wafaa', 'Alsace Résidence', 'Ingedair'),
  ('CORBIERES IF', 'corbieres-if', 60, '36-38-40-42 rue du Docteur A. Schweitzer', '68170', 'Rixheim', 'travaux', 'Camille KLEIN', 'camille.klein@foncia.com', 'Wafaa', 'Foncia ABFC', 'Opuntia'),
  ('le Jaures', 'le-jaures', 60, '92 AV. J.JAURES / 106 RUE DE LA ZIEGELAU 59 RUE DE RIBEAUVILLE', '67100', 'Strasbourg', 'travaux', 'Sébastien NORTH', 'sebastien.north@asi67.com', 'Wafaa', 'ASI / Agence Strasbourg Immobilière', 'CNB.archi'),
  ('SAINT LEON', 'saint-leon', 6, '11 rue du Florimont', '68000', 'Colmar', 'travaux', 'Laurent GANGLOFF', 'syndic@relais-immo-gestion.com', 'Wafaa', 'Relais Immo Gestion', 'Vito conseil'),
  ('Saint Michel (Ingersheim)', 'saint-michel-ingersheim', 30, '1 / 3 / 5 rue Saint Michel', '68040', 'Ingersheim', 'travaux', 'Laurent GANGLOFF', 'syndic@relais-immo-gestion.com', 'Wafaa', 'Relais Immo Gestion', 'Vito conseil'),
  ('14 rue des roses', '14-rue-des-roses', 14, '14 rue des roses', '67100', 'Strasbourg', 'etudes', 'Laura WEIL', 'laura.weil@foncia.com', 'Zahra', 'Foncia Strasbourg', 'KMA'),
  ('19/19 bis rue Jean Lacoste', '19-19-bis-rue-jean-lacoste', 16, '19/19bis rue Jean Lacoste', '10000', 'Troyes', 'etudes', 'Marie AZZOPARDI', 'mazzopardi@troyes-aube-habitat.fr', 'Zahra', 'Troyes Aubes Habitat', 'ACPC'),
  ('22-24 Cour de Rome', '22-24-cour-de-rome', 16, '22-24 Cour de Rome', '57100', 'Thionville', 'etudes', 'Victor BARBOSA', 'victor.barbosa@conceptimmobilier.fr', 'Zahra', 'Concept Immobilier Thionville', 'LEBIGOT'),
  ('25-27 Boulevard de Hardeval', '25-27-boulevard-de-hardeval', 40, '25-27 Boulevard de Hardeval', '54520', 'Laxou', 'etudes', 'Manon GODARD', 'manon.godard@cabinetunivers.fr', 'Zahra', 'Cabinet Univers', 'Agence Emmanuel Gehin'),
  ('27 RUE DU GRAND COURONNE', '27-rue-du-grand-couronne', 8, '27 RUE DU GRAND COURONNE', '67100', 'Strasbourg', 'etudes', 'Lina KOENIG', 'carlito.mankafi@foncia.com', 'Zahra', 'Foncia ABFC', 'Atelier G5'),
  ('30 rue des Violettes', '30-rue-des-violettes', 16, '30 rue des Violettes', '57290', 'Fameck', 'etudes', 'Morgane GERARD', 'morgane.gerard@lamy-immobilier.fr', 'Zahra', 'Lamy Metz', 'Acceo'),
  ('31 rue de Queuleu', '31-rue-de-queuleu', 19, '31 rue de Queuleu', '57070', 'Metz', 'etudes', 'Sandra DESUERT', 'sandra.desuert@dumur.fr', 'Zahra', 'Groupe Dumur', 'Acceo'),
  ('Beryl - Saphir - Emeraude', 'beryl-saphir-emeraude', 180, '11 à 21 rue Christian Moench', '54000', 'Nancy', 'etudes', 'Elodie BOURA', 'elodie.boura@immodefrancelorraine.fr', 'Zahra', 'Immobilière La Ravinelle', 'Christophe Guepin + Ingédiag'),
  ('CALMETTE', 'calmette', 16, '13/15 rue Charles Calmette', '57280', 'Maizières-lès-Metz', 'etudes', 'Sandra DESUERT', 'sandra.desuert@dumur.fr', 'Zahra', 'Groupe Dumur', 'Acceo'),
  ('Le Tristan', 'le-tristan', 6, '3 rue Gottfried', '67000', 'Strasbourg', 'etudes', 'Christophe WICKER', 'c.wicker@wickerimmo.com', 'Zahra', 'Wicker Immo', 'AMC'),
  ('LES PLANTIERES', 'les-plantieres', 40, '1 rue Georges Ducrocq', '57000', 'Metz', 'etudes', null, 'assistcopro1metz@rizzon.com', 'Zahra', 'Claude Rizzon', 'Mil''Lieux'),
  ('Muguet', 'muguet', 10, '2, 4 rue du Muguet', '57320', 'Bouzonville', 'etudes', 'Morgane GERARD', 'morgane.gerard@lamy-immobilier.fr', 'Zahra', 'Lamy Metz', 'Acceo'),
  ('Place d’Harling', 'place-d-harling', 60, '1-6 Place d’Harling', '57190', 'Florange', 'etudes', 'Geoffrey HEL', 'geoffrey.hel@foncia.com', 'Zahra', 'Foncia Thionville', 'Lacroix'),
  ('République', 'republique', 15, '2A-B-C, Rue de la République', '57300', 'Hagondange', 'etudes', 'Sandra DESUERT', 'sandra.desuert@dumur.fr', 'Zahra', 'Groupe Dumur', 'Acceo'),
  ('Saint-Hubert', 'saint-hubert', 24, '6/8/10/12 rue Saint-Hubert', '57320', 'Bouzonville', 'etudes', 'Morgane GERARD', 'morgane.gerard@lamy-immobilier.fr', 'Zahra', 'Lamy Metz', 'Acceo'),
  ('28 rue de Bruxelles', '28-rue-de-bruxelles', 12, '28 rue de Bruxelles', '67000', 'Strasbourg', 'etudes', 'Maxime GALLEZOT', 'maxime.gallezot@sogestra.fr', 'Zahra', 'SOGESTRA', 'ABK'),
  ('317 AVENUE DE COLMAR', '317-avenue-de-colmar', 24, '317 Avenue de Colmar', '67000', 'Strasbourg', 'etudes', 'Yasmine SCHNEIDER', 'yasmine.schneider@foncia.com', 'Zahra', 'Foncia ABFC', 'Atelier G5'),
  ('BLANCHE REINE', 'blanche-reine', 24, '35-37 rue Joseph Mougin', '54000', 'Nancy', 'etudes', 'Thomas BARTHELEMY', 'tbarthelemy@citya.com', 'Zahra', 'Citya POIREL', 'A3D'),
  ('Les bouvreuils', 'les-bouvreuils', 84, '79 rue Claude Bernard', '57000', 'Metz', 'etudes', 'Yannick BAYEUL', 'yannick.bayeul@dumur.fr', 'Zahra', 'Groupe Dumur', 'Acceo'),
  ('Résidence Europe', 'residence-europe', 28, '4 Place de la Division de Fer', '54000', 'Nancy', 'etudes', 'Fanny BACLET', 'fbaclet@citya.com', 'Zahra', 'Citya POIREL', 'A3D'),
  ('Vieille Porte', 'vieille-porte', 86, '23 et 29 Rue de la Vieille Porte', '57100', 'Thionville', 'etudes', 'Mathias BRETHENOUX', 'mathias.brethenoux@foncia.com', 'Zahra', 'Foncia Thionville', 'Socotec'),
  ('Degas', 'degas', 71, '31 avenue Jean Jaurès', '54500', 'Vandœuvre-lès-Nancy', 'travaux', 'Camille LAMY', 'gestcopro1nancy@rizzon.com', 'Zahra', 'Claude Rizzon', 'A3D'),
  ('Les Acacias (22-24-26-28 Rue de Ribeauvillé)', 'les-acacias-22-24-26-28-rue-de-ribeauville', 40, '18-20-22-24-26-28 et 30 Rue de Ribeauvillé', '67100', 'Strasbourg', 'travaux', 'Paul SCHILLINGER', 'paul.schillinger@asi67.com', 'Zahra', 'ASI / Agence Strasbourg Immobilière', 'CNB.archi'),
  ('MOZART', 'mozart', 30, '3/5/7 rue Mozart', '54600', 'Villers-lès-Nancy', 'travaux', 'Julien GARRIC', 'jgarric@citya.com', 'Zahra', 'Citya POIREL', 'PRE CONCEPT'),
  ('RESIDENCE SAINT MICHEL (Laxou)', 'residence-saint-michel-laxou', 25, '2 Rue de l''Ornain', '54520', 'Laxou', 'travaux', 'Jean-Louis COLSON', 'jeanlouiscolson@centralimmobilier.fr', 'Zahra', 'ORPI Central Immobilier', 'A3D'),
  ('RUE DE LA ZORN', 'rue-de-la-zorn', 30, '12-14-16 rue de la Zorn', '67300', 'Schiltigheim', 'travaux', 'Clément BAYSSELIER', 'syndic.strasbourgcentre@laforet.com', 'Zahra', 'Laforêt', 'Frög architecture'),
  ('Résidence Saint-Georges', 'residence-saint-georges', 20, '55 rue du Chanoine Clanché', '54200', 'Toul', 'travaux', 'Marie-Françoise TOUSSAINT', 'agence@lefilalimmo.com', 'Zahra', 'Fil à l’Immo', 'BET Huguet'),
  ('2 RUE DE GEISPOLSHEIM', '2-rue-de-geispolsheim', 8, '2 rue de Geispolsheim', '67100', 'Strasbourg', 'diagnostic', 'Florent REHEL', 'f.rehel@coopdelill.fr', null, 'Coop de l''Ill', null),
  ('Bachelard', 'bachelard', 4, '8/10/12/14 rue G. Bachelard', '10000', 'Troyes', 'diagnostic', 'Marie AZZOPARDI', 'mazzopardi@troyes-aube-habitat.fr', null, 'Troyes Aubes Habitat', null),
  ('LES ALOUETTES', 'les-alouettes', 10, '6 rue Grimling', '67200', 'Strasbourg', 'diagnostic', 'Nicolas SCHMIEG', 'nicolas.schmieg@immium.com', null, 'IMMIUM Laemmel', null)
)
insert into coproprietes (name, slug, nb_logements, adresse, code_postal, city, phase,
  gestionnaire_nom, gestionnaire_email, chef_projet, syndic_name, organisation_id, maitre_oeuvre)
select s.name, s.slug, s.nb_logements::int, s.adresse, s.code_postal, s.city, s.phase::phase_copro,
       s.gestionnaire_nom, s.gestionnaire_email, s.chef_projet, o.nom, o.id, s.maitre_oeuvre
from src s
join organisations o on lower(o.nom) = lower(s.org_nom)
on conflict (slug) do nothing;

-- Bâtiment déclaré 01 (les lots ne sont pas encore importés)
insert into batiments (copro_id, code, position, declare_creation)
select c.id, '01', 0, true from coproprietes c
where c.slug in ('10-14-ziegelfeld', '32-rue-de-la-liberation', '47-49-51-rue-jean-lafontaine', 'bucer-11-rue-martin-bucer', 'bucer-11a-rue-martin-bucer', 'bucer-30-rue-sainte-marguerite', 'la-renaissance-8-rue-ignace-spies-a-selestat', '2-4-rue-leo-lagrange', 'le-madrid', 'les-contades', 'rue-du-8-mai-1945', '1-3-rue-du-jura', 'adelshoffen', 'amazone-zambeze', 'beauregard-st-claude', 'beaurivage-thionville', 'le-balzac', 'le-callot', 'le-concorde', 'les-erables-colmar', 'les-maraichers', 'parc-chopin', 'plaine', 'square-du-chateau', 'tamaris-1', 'tamaris-2', 'la-baloise', 'schumann', 'vert-galant-3', '12-rue-de-schurmfeld', '33-35-rue-melanie', '34-rue-wimpheling-34-rue-geiler', 'ami-fritz', 'gliesberg-1', 'residence-riedisheim-i', 'ile-du-moulin', 'saint-die', '17-rue-des-alpes', '6-rue-d-ensisheim', 'groupe-ziegelfeld', 'hirondelles-strasbourg', 'la-roseraie', 'le-rubens', 'les-pleiades', 'petersgarten', 'stockmeyer', '210-route-de-mittelhausbergen', '6-a-12-rue-d-orbey', 'altorffer', 'le-petit-prince', 'les-primeveres', '12-rue-lavoisier-le-concorde', '29-boulevard-d-anvers', '30-rue-wimpheling', '5-7-bd-de-la-marne', 'gai-logis', 'im-groettel', 'le-beau-site', 'le-rabelais', 'les-cedres', 'les-eglantines', '1-3-rue-de-soultz', '35-rue-d-illkirch', 'corbieres-if', 'le-jaures', 'saint-leon', 'saint-michel-ingersheim', '14-rue-des-roses', '19-19-bis-rue-jean-lacoste', '22-24-cour-de-rome', '25-27-boulevard-de-hardeval', '27-rue-du-grand-couronne', '30-rue-des-violettes', '31-rue-de-queuleu', 'beryl-saphir-emeraude', 'calmette', 'le-tristan', 'les-plantieres', 'muguet', 'place-d-harling', 'republique', 'saint-hubert', '28-rue-de-bruxelles', '317-avenue-de-colmar', 'blanche-reine', 'les-bouvreuils', 'residence-europe', 'vieille-porte', 'degas', 'les-acacias-22-24-26-28-rue-de-ribeauville', 'mozart', 'residence-saint-michel-laxou', 'rue-de-la-zorn', 'residence-saint-georges', '2-rue-de-geispolsheim', 'bachelard', 'les-alouettes')
  and not exists (select 1 from batiments b where b.copro_id = c.id);

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
       (case
          when rt.rang < rc.rang then 'done'
          when rt.rang > rc.rang then 'todo'
          else t.statut_courant
        end)::statut_tache,
       t.tag, t.jalon, t.due_label, t.position
from coproprietes c
cross join tpl t
join rk rt on rt.phase = t.phase
join rk rc on rc.phase = c.phase::text
where c.slug in ('10-14-ziegelfeld', '32-rue-de-la-liberation', '47-49-51-rue-jean-lafontaine', 'bucer-11-rue-martin-bucer', 'bucer-11a-rue-martin-bucer', 'bucer-30-rue-sainte-marguerite', 'la-renaissance-8-rue-ignace-spies-a-selestat', '2-4-rue-leo-lagrange', 'le-madrid', 'les-contades', 'rue-du-8-mai-1945', '1-3-rue-du-jura', 'adelshoffen', 'amazone-zambeze', 'beauregard-st-claude', 'beaurivage-thionville', 'le-balzac', 'le-callot', 'le-concorde', 'les-erables-colmar', 'les-maraichers', 'parc-chopin', 'plaine', 'square-du-chateau', 'tamaris-1', 'tamaris-2', 'la-baloise', 'schumann', 'vert-galant-3', '12-rue-de-schurmfeld', '33-35-rue-melanie', '34-rue-wimpheling-34-rue-geiler', 'ami-fritz', 'gliesberg-1', 'residence-riedisheim-i', 'ile-du-moulin', 'saint-die', '17-rue-des-alpes', '6-rue-d-ensisheim', 'groupe-ziegelfeld', 'hirondelles-strasbourg', 'la-roseraie', 'le-rubens', 'les-pleiades', 'petersgarten', 'stockmeyer', '210-route-de-mittelhausbergen', '6-a-12-rue-d-orbey', 'altorffer', 'le-petit-prince', 'les-primeveres', '12-rue-lavoisier-le-concorde', '29-boulevard-d-anvers', '30-rue-wimpheling', '5-7-bd-de-la-marne', 'gai-logis', 'im-groettel', 'le-beau-site', 'le-rabelais', 'les-cedres', 'les-eglantines', '1-3-rue-de-soultz', '35-rue-d-illkirch', 'corbieres-if', 'le-jaures', 'saint-leon', 'saint-michel-ingersheim', '14-rue-des-roses', '19-19-bis-rue-jean-lacoste', '22-24-cour-de-rome', '25-27-boulevard-de-hardeval', '27-rue-du-grand-couronne', '30-rue-des-violettes', '31-rue-de-queuleu', 'beryl-saphir-emeraude', 'calmette', 'le-tristan', 'les-plantieres', 'muguet', 'place-d-harling', 'republique', 'saint-hubert', '28-rue-de-bruxelles', '317-avenue-de-colmar', 'blanche-reine', 'les-bouvreuils', 'residence-europe', 'vieille-porte', 'degas', 'les-acacias-22-24-26-28-rue-de-ribeauville', 'mozart', 'residence-saint-michel-laxou', 'rue-de-la-zorn', 'residence-saint-georges', '2-rue-de-geispolsheim', 'bachelard', 'les-alouettes')
  and not exists (select 1 from taches x where x.copro_id = c.id);

-- ========== 3. Corrections sur les dossiers existants (updated_at conservé) ==========
alter table coproprietes disable trigger trg_coproprietes_updated;
update coproprietes set maitre_oeuvre = 'MB' where name = 'LE TASSIGNY' and deleted_at is null;
update coproprietes set maitre_oeuvre = 'Atelier G5' where name = '14-16 rue de Limoges' and deleted_at is null;
update coproprietes set syndic_name = 'ITA 67', organisation_id = (select id from organisations where slug = 'ita-67')
  where name = 'Armorial' and deleted_at is null;
update coproprietes set code_postal = '67100' where name = '3 rue Mariano' and deleted_at is null;
update coproprietes set chef_projet = 'Wafaa', maitre_oeuvre = 'Atelier G5'
  where name = '6/8 RUE D''OBERNAI - SCHILTIGHEIM' and deleted_at is null;
update coproprietes set maitre_oeuvre = 'Lorr ENR' where name = 'HERMITE' and deleted_at is null;
update coproprietes set nb_logements = 16, code_postal = '67000' where name = 'BOUDHORS' and deleted_at is null;
update coproprietes set adresse = 'rue de Stutzheim et rue Rangen' where name = 'RESIDENCE ECO' and deleted_at is null;
update coproprietes set adresse = '11a rue des Bateliers' where name = 'LES BATELIERS' and deleted_at is null;
alter table coproprietes enable trigger trg_coproprietes_updated;

-- ========== 4. Maîtres d'œuvre ==========
-- Fiches existantes (créées le 27/09 sans e-mail)
update prestataires set email = 'sbrebbia@abk.archi', emails_secondaires = array['aklukowski@abk.archi', 'contact@abk.archi']::text[],
       notes = 'Référencé le 27/09/2026 depuis les maîtres d''œuvre des copropriétés. E-mails repris du classeur Notion du 28/09/2026.'
  where lower(trim(raison_sociale)) = lower('ABK') and email is null;
update prestataires set email = 'stephane@amc-habitat.com', emails_secondaires = array['catherinen@amc-habitat.com']::text[],
       notes = 'Référencé le 27/09/2026 depuis les maîtres d''œuvre des copropriétés. E-mails repris du classeur Notion du 28/09/2026.'
  where lower(trim(raison_sociale)) = lower('AMC') and email is null;
update prestataires set email = 'brice@anbra-architecture.fr', emails_secondaires = array['antoine@anbra-architecture.fr']::text[],
       notes = 'Référencé le 27/09/2026 depuis les maîtres d''œuvre des copropriétés. E-mails repris du classeur Notion du 28/09/2026.'
  where lower(trim(raison_sociale)) = lower('ANBRA') and email is null;
update prestataires set email = 'nicolas@atelierg5.fr', emails_secondaires = array['maxime.chp@atelierg5.fr', 'info@atelierg5.fr']::text[],
       notes = 'Référencé le 27/09/2026 depuis les maîtres d''œuvre des copropriétés. E-mails repris du classeur Notion du 28/09/2026.'
  where lower(trim(raison_sociale)) = lower('Atelier G5') and email is null;
update prestataires set email = 'architectes@chhk.fr', emails_secondaires = array['audrey.beri@chhk.fr']::text[],
       notes = 'Référencé le 27/09/2026 depuis les maîtres d''œuvre des copropriétés. E-mails repris du classeur Notion du 28/09/2026.'
  where lower(trim(raison_sociale)) = lower('CHHK') and email is null;
update prestataires set email = 'celine.ferry@cnb.archi', emails_secondaires = array['chloe.chaillou@cnb.archi', 'justine.jouve@cnb.archi', 'laura.matter@cnb.archi', 'guillaume.christmann@cnb.archi', 'juliette.ladeuil@cnb.archi']::text[],
       notes = 'Référencé le 27/09/2026 depuis les maîtres d''œuvre des copropriétés. E-mails repris du classeur Notion du 28/09/2026.'
  where lower(trim(raison_sociale)) = lower('CNB.archi') and email is null;
update prestataires set email = 'collectivites.services@gmail.com', emails_secondaires = '{}'::text[],
       notes = 'Référencé le 27/09/2026 depuis les maîtres d''œuvre des copropriétés. E-mails repris du classeur Notion du 28/09/2026.'
  where lower(trim(raison_sociale)) = lower('Collectivité services') and email is null;
update prestataires set email = 'jb-epc67@wanadoo.fr', emails_secondaires = '{}'::text[],
       notes = 'Référencé le 27/09/2026 depuis les maîtres d''œuvre des copropriétés. E-mails repris du classeur Notion du 28/09/2026.'
  where lower(trim(raison_sociale)) = lower('EPC 67') and email is null;
update prestataires set email = 'pascal.goepfert@gmx.fr', emails_secondaires = '{}'::text[],
       notes = 'Référencé le 27/09/2026 depuis les maîtres d''œuvre des copropriétés. E-mails repris du classeur Notion du 28/09/2026.'
  where lower(trim(raison_sociale)) = lower('Goepfert') and email is null;
update prestataires set email = 's.rinner@imaee.fr', emails_secondaires = '{}'::text[],
       notes = 'Référencé le 27/09/2026 depuis les maîtres d''œuvre des copropriétés. E-mails repris du classeur Notion du 28/09/2026.'
  where lower(trim(raison_sociale)) = lower('Imaée') and email is null;
update prestataires set email = 'c.stadelmann@ingedair.com', emails_secondaires = array['v.mesnard@ingedair.com', 'l.girolt@ingedair.com', 'e.lacroix@ingedair.com', 's.hatchi@ingedair.com', 'a.ledoux@ingedair.com']::text[],
       notes = 'Référencé le 27/09/2026 depuis les maîtres d''œuvre des copropriétés. E-mails repris du classeur Notion du 28/09/2026.'
  where lower(trim(raison_sociale)) = lower('Ingedair') and email is null;
update prestataires set email = 'm.proko@wanadoo.fr', emails_secondaires = '{}'::text[],
       notes = 'Référencé le 27/09/2026 depuis les maîtres d''œuvre des copropriétés. E-mails repris du classeur Notion du 28/09/2026.'
  where lower(trim(raison_sociale)) = lower('Interaxion') and email is null;
update prestataires set email = 'christophe.westphal@archipart.fr', emails_secondaires = array['denis.uhlmann@archipart.fr']::text[],
       notes = 'Référencé le 27/09/2026 depuis les maîtres d''œuvre des copropriétés. E-mails repris du classeur Notion du 28/09/2026.'
  where lower(trim(raison_sociale)) = lower('Khaleos') and email is null;
update prestataires set email = 'l.koering@kma-architecture.fr', emails_secondaires = '{}'::text[],
       notes = 'Référencé le 27/09/2026 depuis les maîtres d''œuvre des copropriétés. E-mails repris du classeur Notion du 28/09/2026.'
  where lower(trim(raison_sociale)) = lower('KMA') and email is null;
update prestataires set email = 'jean-mathieu.collard@lama-architectes.com', emails_secondaires = array['laure.solvet@lama-architectes.com', 'emilie.depierre@lama-architectes.com']::text[],
       notes = 'Référencé le 27/09/2026 depuis les maîtres d''œuvre des copropriétés. E-mails repris du classeur Notion du 28/09/2026.'
  where lower(trim(raison_sociale)) = lower('LAMA') and email is null;
update prestataires set email = 'myriam-gewinner@m-associes-architectes.fr', emails_secondaires = '{}'::text[],
       notes = 'Référencé le 27/09/2026 depuis les maîtres d''œuvre des copropriétés. E-mails repris du classeur Notion du 28/09/2026.'
  where lower(trim(raison_sociale)) = lower('M associés') and email is null;
update prestataires set email = 'j.knochel@ral1023-architecture.com', emails_secondaires = '{}'::text[],
       notes = 'Référencé le 27/09/2026 depuis les maîtres d''œuvre des copropriétés. E-mails repris du classeur Notion du 28/09/2026.'
  where lower(trim(raison_sociale)) = lower('RAL 1023') and email is null;
update prestataires set email = 'yanez@satim67.com', emails_secondaires = '{}'::text[],
       notes = 'Référencé le 27/09/2026 depuis les maîtres d''œuvre des copropriétés. E-mails repris du classeur Notion du 28/09/2026.'
  where lower(trim(raison_sociale)) = lower('SATIM') and email is null;

-- Nouvelles fiches (MOE cités par les dossiers hors Kawtar)
insert into prestataires (raison_sociale, email, emails_secondaires, types, actif, notes)
select v.nom, v.email, v.sec, array['moe']::type_consultation[], true,
       'Référencé le 28/09/2026 depuis le classeur Notion des copropriétés actives (colonne MOE).'
from (values
  ('A.COM', 'architecture@onceuponabigtime.com', '{}'::text[]),
  ('A3D', 'a3d@a3d-archi.com', array['l.regnier@a3d-archi.com']::text[]),
  ('Acceo', 'julien.metzinger@acceo.eu', array['jules.lebouc@acceo.eu', 'pauline.boulanger@acceo.eu', 'thibault.calmesnil@acceo.eu', 'nathanael.cardone@acceo.eu']::text[]),
  ('ACPC', 'b.laratte@acpc10.fr', array['contact@acpc10.fr', 'l.hacquart@acpc10.fr']::text[]),
  ('Agence Emmanuel Gehin', 'aeg54@orange.fr', '{}'::text[]),
  ('Atelier Briot Gomez', 'gomez-m@wanadoo.fr', '{}'::text[]),
  ('BET Huguet', 'e.michel@inddigo.com', array['m.arnoux@inddigo.com', 'matteo.arnoux@bet-huguet.com']::text[]),
  ('Christophe Guepin + Ingédiag', 'christophe@guepin.fr', '{}'::text[]),
  ('DALI Architecture', 'projet@dali-architecture.com', '{}'::text[]),
  ('Fischer', 'crf.fischer@wanadoo.fr', '{}'::text[]),
  ('Frög architecture', 'ls@frogarchitecture.com', array['mj@frogarchitecture.com']::text[]),
  ('Hoffert', 'contact@martin-hoffert.fr', '{}'::text[]),
  ('Kern Architectes', 'lb-kern.architectes@orange.fr', '{}'::text[]),
  ('Lacroix', 'contact@saslacroix.fr', array['direction-technique@saslacroix.fr', 'service.qhse@saslacroix.fr']::text[]),
  ('LEBIGOT', 'flb@lmo-sas.fr', '{}'::text[]),
  ('Lorr ENR', 'john.pinon@lorr-enr.fr', array['maxime.germonville@lorr-enr.fr', 'sihem.ferah@lorr-enr.fr']::text[]),
  ('MB', 'matthieubelhaddadmoe@gmail.com', '{}'::text[]),
  ('Mil''Lieux', 'a.gueston@mil-lieux.fr', array['c.remy@mil-lieux.fr', 'j.aubertein@mil-lieux.fr']::text[]),
  ('MS Promotion', 'sebastien.mion@hotmail.com', '{}'::text[]),
  ('Opuntia', 'martel.josse@orange.fr', '{}'::text[]),
  ('PRE CONCEPT', 'cordone@preconcept.fr', array['tourneux@preconcept.fr', 'contact@preconcept.fr']::text[]),
  ('Socotec', 'alexandre.divo@socotecsmartsolutions.fr', array['aurelie.villelonge@socotecsmartsolutions.fr', 'florian.rigal@socotecsmartsolutions.fr']::text[]),
  ('Solaresbauen', 'bosch@solares-bauen.fr', '{}'::text[]),
  ('Vito conseil', 'thomas.moritz@vitoconseils.com', array['kevin.turkoglu@vitoconseils.com']::text[]),
  ('WOLF', 'cabinetwolf@hotmail.fr', '{}'::text[])
) as v(nom, email, sec)
where not exists (select 1 from prestataires p where lower(trim(p.raison_sociale)) = lower(v.nom));

-- Boîtes propres à un dossier et contact BE : contacts de la fiche (aucune alerte)
insert into prestataire_contacts (prestataire_id, nom, role, email)
select p.id, v.nom, v.role, v.email
from (values
  ('Ingedair', 'Boîte du dossier 25/27 rue de stockholm', 'Adresse dédiée au dossier', 'stockholm@ingedair.com'),
  ('Ingedair', 'Boîte du dossier 33-35 RUE MELANIE', 'Adresse dédiée au dossier', '33-35_melanie@ingedair.com'),
  ('Ingedair', 'Boîte du dossier GALILEE', 'Adresse dédiée au dossier', 'galilee@ingedair.com'),
  ('Ingedair', 'Boîte du dossier LE CONCORDE', 'Adresse dédiée au dossier', 'concorde@ingedair.com'),
  ('Ingedair', 'Boîte du dossier LE POLYGONE', 'Adresse dédiée au dossier', 'polygone@ingedair.com'),
  ('Ingedair', 'Boîte du dossier Les Renards', 'Adresse dédiée au dossier', 'renards@ingedair.com'),
  ('Ingedair', 'Boîte du dossier RÉSIDENCE RIEDISHEIM I', 'Adresse dédiée au dossier', 'riedisheim@ingedair.com'),
  ('Imaée', 'Bureau d''études - LE MURANO', 'Bureau d''études (pas MOE)', 'm.francisco@imaee.fr')
) as v(fiche, nom, role, email)
join prestataires p on lower(trim(p.raison_sociale)) = lower(v.fiche)
where not exists (select 1 from prestataire_contacts c where c.prestataire_id = p.id and lower(c.email) = lower(v.email));

commit;

-- Affaires de Kawtar : classeur « Affaires_Kawtar_Strateco_2026-09-29_1.xlsx » (relecture du 29/09/2026
-- validée par Amir, 40 copropriétés). Demande d'Amir du 29/09/2026, après la comparaison avec la base.
--
-- Arbitrages d'Amir : la base fait foi pour LA VIOLETTE, PRÉS VERT, LAMARTINE, LE FORUM,
-- ROND POINT DE L'ESPLANADE et 9 RUE DE LA GARE (non touchés) ; Le Rodin garde son adresse mais
-- passe en études (P3 programmé). « 9 rue des Alpes » et « 17 rue des Alpes » sont deux copropriétés
-- distinctes (même syndic, même MOE et mêmes honoraires, confirmé par Amir le 29/09).
--
-- 1. Organisations : les enseignes du classeur absentes du logiciel (syndics bénévoles au format
--    « Syndic Bénévole <DOSSIER> » comme HERMITE ; « Lamy » de la Résidence Wolff = Lamy Strasbourg).
-- 2. 25 copropriétés créées comme le ferait useCreateCopro() : bâtiment déclaré 01 + plan de tâches
--    gabarit (miroir de src/lib/taskTemplate.ts) ; chef de projet Kawtar ; phase = lecture de l'état
--    AG, jamais stocké : P2 voté / P3 prog -> études, P3 voté / Done -> travaux. « Pas de MOE » = vide.
-- 3. Le Rodin -> études : tâches de diagnostic cochées (la phase découle des tâches, 0065), côté
--    syndic comme le ferait le semis (0048) ; updated_at du dossier conservé.
-- 4. E-mail de la fiche MOE Carré d'architectes (vide jusqu'ici).
-- 5. Honoraires AMO des 25 dossiers : extraction Notion AMO COPRO du 28/09/2026 (factu.json), mêmes
--    règles que 0111 : Payé coché -> encaissé, Facturé seul -> facturé, sinon à facturer ; montant
--    vide = null ; seule la dernière date de facture du dossier est connue.
-- Rejouable : inserts idempotents (on conflict / not exists), updates ciblés.

begin;

-- ========== 1. Organisations ==========
insert into organisations (nom, slug) values
  ('Cagim-Sogedim', 'cagim-sogedim'),
  ('Hebding Immobilier', 'hebding-immobilier'),
  ('LA MAISON DU SYNDIC', 'la-maison-du-syndic'),
  ('Lamy Strasbourg', 'lamy-strasbourg'),
  ('Syndic Bénévole 19 RUE SAINT PAUL', 'syndic-benevole-19-rue-saint-paul'),
  ('Syndic Bénévole TROIS FIGUIERS', 'syndic-benevole-trois-figuiers')
on conflict (slug) do nothing;

-- ========== 2. Les 25 copropriétés ==========
with src (name, slug, nb_logements, adresse, code_postal, city, phase, gestionnaire_nom, gestionnaire_email, chef_projet, org_nom, maitre_oeuvre) as (values
  ('24, rue de l’Engelbreit (OPAH RU)', '24-rue-de-l-engelbreit-opah-ru', 6, '24, rue de l''Engelbreit', '67200', 'Strasbourg', 'etudes', 'Chloé PATIN', 'contact@coopdelill.fr', 'Kawtar', 'Coop de l''Ill', null),
  ('4 RUE DE LA POSTE', '4-rue-de-la-poste', 6, '4 rue de la Poste', '67400', 'Illkirch-Graffenstaden', 'etudes', 'Chloé PATIN', 'contact@coopdelill.fr', 'Kawtar', 'Coop de l''Ill', 'Atelier G5'),
  ('5 RUE D’ENSISHEIM', '5-rue-d-ensisheim', 8, '5 rue d’Ensisheim', '67100', 'Strasbourg', 'etudes', 'Florent REHEL', 'f.rehel@coopdelill.fr', 'Kawtar', 'Coop de l''Ill', 'Ingedair'),
  ('BACHMANN II', 'bachmann-ii', 30, '19 rue Théo Bachmann', '68300', 'Saint-Louis', 'etudes', 'Elodie BECHARD', 'e.bechard@cagim-sogedim.fr', 'Kawtar', 'Cagim-Sogedim', 'Vito conseil'),
  ('FOULONS', 'foulons', 8, '3 rue des Foulons', '67000', 'Strasbourg', 'etudes', 'Florent REHEL', 'f.rehel@coopdelill.fr', 'Kawtar', 'Coop de l''Ill', null),
  ('HYSCO', 'hysco', 28, '11 avenue de Bâle', '68330', 'Huningue', 'etudes', 'Rébecca WIEDERKEHR', 'r.wiederkehr@cagim-sogedim.fr', 'Kawtar', 'Cagim-Sogedim', 'Vito conseil'),
  ('MITTELHAUSBERGEN', 'mittelhausbergen', 8, '154 route de Mittelhausbergen', '67200', 'Strasbourg', 'etudes', 'Florent REHEL', 'f.rehel@coopdelill.fr', 'Kawtar', 'Coop de l''Ill', null),
  ('SAVON', 'savon', 19, '3 rue du Savon', '67000', 'Strasbourg', 'etudes', 'Corinne EL HAIK', 'corinne.elhaik@immium.com', 'Kawtar', 'SOGESTRA', 'Khaleos'),
  ('4/6 rue des meules (OPAH RU)', '4-6-rue-des-meules-opah-ru', 20, '4/6 rue des meules', '67200', 'Strasbourg', 'etudes', 'Maxime GALLEZOT', 'maxime.gallezot@sogestra.fr', 'Kawtar', 'SOGESTRA', 'AMC'),
  ('Leclerc Foch', 'leclerc-foch', 132, '7-9 rue Foch, 1-3-5-7-9-11-13-15 rue Leclerc, 2-4-6-8 Rue Leclerc', '67300', 'Schiltigheim', 'etudes', 'Clémence THIESEN', 'clemence.thiesen@immoval.com', 'Kawtar', 'Immoval', 'CNB.archi'),
  ('Pétunia', 'petunia', 84, '3-5-7-9 rue de Montreux', '68300', 'Saint-Louis', 'etudes', 'Elodie BECHARD', 'e.bechard@cagim-sogedim.fr', 'Kawtar', 'Cagim-Sogedim', 'Vito conseil'),
  ('RESIDENCE THEO BACHMANN', 'residence-theo-bachmann', 28, '16 avenue de la Marne', '68300', 'Saint-Louis', 'etudes', 'Mathieu CHRISTEN', 'mathieu.christen@foncia.com', 'Kawtar', 'Foncia Mulhouse', 'Vito conseil'),
  ('105 ROUTE DES ROMAINS (OPAH RU)', '105-route-des-romains-opah-ru', 6, '105 Route des Romains', '67200', 'Strasbourg', 'travaux', 'Marie Aude HEBDING', 'ma.hebding@hebding-immobilier.fr', 'Kawtar', 'Hebding Immobilier', 'M associés'),
  ('19 rue Saint Paul', '19-rue-saint-paul', 4, '19, rue Saint Paul', '67115', 'Plobsheim', 'travaux', 'Annie VIERLING', 'copro19stpaul@gmail.com', 'Kawtar', 'Syndic Bénévole 19 RUE SAINT PAUL', null),
  ('9 rue des Alpes', '9-rue-des-alpes', 4, '9 rue des Alpes', '68180', 'Horbourg-Wihr', 'travaux', 'Laurent GANGLOFF', 'syndic@relais-immo-gestion.com', 'Kawtar', 'Relais Immo Gestion', 'Vito conseil'),
  ('LA BRUXELLOISE', 'la-bruxelloise', 30, '2-4-6 rue de Belgique', '54500', 'Vandœuvre-lès-Nancy', 'travaux', 'Sylvie NAVARRO', 'snavarro@benedic.fr', 'Kawtar', 'Ariane Benedic Immobilier', 'Lorr ENR'),
  ('LA REGENCE', 'la-regence', 19, '17-19 rue Dominique Roos', '67600', 'Sélestat', 'travaux', 'Jean-Philippe LANG', 'gtimmo@hotmail.com', 'Kawtar', 'GT Immo', 'Atelier G5'),
  ('LE FOCH', 'le-foch', 40, '114-116-118-120 rue du Maréchal Foch', '67380', 'Lingolsheim', 'travaux', 'Valérie SCHWENGLER', 'valerie.schwengler@mercor.fr', 'Kawtar', 'Agence Mercor', 'CHHK'),
  ('LE MUGUET', 'le-muguet', 16, '79-81 rue du Ladhof', '68000', 'Colmar', 'travaux', 'Laurent GANGLOFF', 'syndic@relais-immo-gestion.com', 'Kawtar', 'Relais Immo Gestion', 'Vito conseil'),
  ('LES ERABLES (SELESTAT)', 'les-erables-selestat', 16, '42-44 avenue pasteur', '67600', 'Sélestat', 'travaux', 'Jean-Philippe LANG', 'gtimmo@hotmail.com', 'Kawtar', 'GT Immo', 'Atelier G5'),
  ('RESIDENCE WOLFF', 'residence-wolff', 125, '10 rue Sainte Anne', '67200', 'Strasbourg', 'travaux', 'Maxime HEINRICH', 'mheinrich@lamy-immobilier.fr', 'Kawtar', 'Lamy Strasbourg', 'KMA'),
  ('Schumann (Colmar)', 'schumann-colmar', 40, '23,25,27,29 rue Schumann', '68000', 'Colmar', 'travaux', 'Laurent GANGLOFF', 'syndic@relais-immo-gestion.com', 'Kawtar', 'Relais Immo Gestion', 'Vito conseil'),
  ('Tennis', 'tennis', 12, '2 rue de la hollau', '67540', 'Ostwald', 'travaux', 'Virginie CAILLOL', 'cclvimmo@gmail.com', 'Kawtar', 'CCLV Immo', 'Ingedair'),
  ('51 rue du général Leclerc', '51-rue-du-general-leclerc', 2, '51 Rue du Général Leclerc', '57350', 'Stiring-Wendel', 'travaux', 'Thomas FRAPICCINI', 'thomas.frapiccini@lamaisondusyndic.fr', 'Kawtar', 'LA MAISON DU SYNDIC', null),
  ('COPROPRIETE DES TROIS FIGUIERS', 'copropriete-des-trois-figuiers', 2, '33 rue d''Ottrott', '67200', 'Strasbourg', 'travaux', 'Pascal FROMEYER', 'fromale@hotmail.com', 'Kawtar', 'Syndic Bénévole TROIS FIGUIERS', 'EPC 67')
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
where c.slug in ('24-rue-de-l-engelbreit-opah-ru', '4-rue-de-la-poste', '5-rue-d-ensisheim', 'bachmann-ii', 'foulons', 'hysco', 'mittelhausbergen', 'savon', '4-6-rue-des-meules-opah-ru', 'leclerc-foch', 'petunia', 'residence-theo-bachmann', '105-route-des-romains-opah-ru', '19-rue-saint-paul', '9-rue-des-alpes', 'la-bruxelloise', 'la-regence', 'le-foch', 'le-muguet', 'les-erables-selestat', 'residence-wolff', 'schumann-colmar', 'tennis', '51-rue-du-general-leclerc', 'copropriete-des-trois-figuiers')
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
where c.slug in ('24-rue-de-l-engelbreit-opah-ru', '4-rue-de-la-poste', '5-rue-d-ensisheim', 'bachmann-ii', 'foulons', 'hysco', 'mittelhausbergen', 'savon', '4-6-rue-des-meules-opah-ru', 'leclerc-foch', 'petunia', 'residence-theo-bachmann', '105-route-des-romains-opah-ru', '19-rue-saint-paul', '9-rue-des-alpes', 'la-bruxelloise', 'la-regence', 'le-foch', 'le-muguet', 'les-erables-selestat', 'residence-wolff', 'schumann-colmar', 'tennis', '51-rue-du-general-leclerc', 'copropriete-des-trois-figuiers')
  and not exists (select 1 from taches x where x.copro_id = c.id);

-- ========== 3. Le Rodin -> études (updated_at conservé) ==========
alter table coproprietes disable trigger trg_coproprietes_updated;
update taches set status = 'done'
  where copro_id = '7db99b01-3697-4de6-87bb-71be1a06fa83' and phase = 'diagnostic' and status <> 'done';
update taches set status = 'doing'
  where copro_id = '7db99b01-3697-4de6-87bb-71be1a06fa83' and phase = 'etudes' and position in (5, 6) and status = 'todo';
alter table coproprietes enable trigger trg_coproprietes_updated;
update syndic_taches set statut = 'done', updated_at = now()
  where copro_id = '7db99b01-3697-4de6-87bb-71be1a06fa83' and phase = 'diagnostic' and statut <> 'done';

-- ========== 4. Maître d'œuvre ==========
update prestataires set email = 'diartes.siobotea@carreda.fr'
  where lower(trim(raison_sociale)) = lower('Carré d''architectes') and email is null;

-- ========== 5. Honoraires AMO ==========
-- j = 8 jalons dans l'ordre P1a P1b P1c P2a P2b P2c FCEE1 FCEE2, [montant HT, e|f|a].
create temporary table zz_hono on commit drop as
select x.slug, x.d, x.j
from jsonb_to_recordset('[{"slug":"24-rue-de-l-engelbreit-opah-ru","d":null,"j":[[null,"e"],[5125,"e"],[null,"e"],[2106,"a"],[1200,"a"],[null,"a"],[null,"a"],[null,"a"]]},{"slug":"4-rue-de-la-poste","d":"2024-09-17","j":[[1200,"e"],[1200,"a"],[1200,"a"],[2400,"a"],[null,"a"],[null,"a"],[null,"a"],[null,"a"]]},{"slug":"5-rue-d-ensisheim","d":"2026-05-15","j":[[1120,"e"],[1680,"a"],[1680,"a"],[1120,"a"],[null,"a"],[null,"a"],[null,"a"],[null,"a"]]},{"slug":"bachmann-ii","d":null,"j":[[6250,"a"],[6250,"a"],[6250,"a"],[6250,"a"],[null,"a"],[null,"a"],[null,"a"],[null,"a"]]},{"slug":"foulons","d":"2024-09-17","j":[[1600,"e"],[2400,"a"],[2400,"a"],[1600,"a"],[null,"a"],[null,"a"],[null,"a"],[null,"a"]]},{"slug":"hysco","d":"2026-06-18","j":[[3080,"e"],[3570,"a"],[3570,"a"],[3570,"a"],[null,"a"],[null,"a"],[null,"a"],[null,"a"]]},{"slug":"mittelhausbergen","d":"2024-10-14","j":[[600,"e"],[1800,"a"],[1200,"a"],[2400,"a"],[null,"a"],[null,"a"],[null,"a"],[null,"a"]]},{"slug":"savon","d":"2025-07-17","j":[[1197,"e"],[2062.5,"e"],[2062.5,"a"],[1995,"a"],[null,"a"],[null,"a"],[null,"a"],[null,"a"]]},{"slug":"4-6-rue-des-meules-opah-ru","d":null,"j":[[null,"e"],[5125,"e"],[null,"e"],[2106,"a"],[4000,"a"],[null,"a"],[null,"a"],[null,"a"]]},{"slug":"leclerc-foch","d":"2026-06-30","j":[[6550,"e"],[13100,"e"],[13100,"a"],[15000,"a"],[9000,"a"],[6000,"a"],[null,"a"],[null,"a"]]},{"slug":"petunia","d":"2025-10-30","j":[[3780,"e"],[5040,"e"],[7560,"a"],[8820,"a"],[null,"a"],[null,"a"],[null,"a"],[null,"a"]]},{"slug":"residence-theo-bachmann","d":"2026-02-02","j":[[3000,"e"],[4500,"e"],[4500,"e"],[3000,"a"],[null,"a"],[null,"a"],[null,"a"],[null,"a"]]},{"slug":"105-route-des-romains-opah-ru","d":"2025-10-30","j":[[null,"e"],[5125,"e"],[null,"e"],[2106,"e"],[null,"e"],[null,"e"],[null,"e"],[null,"e"]]},{"slug":"19-rue-saint-paul","d":"2025-12-18","j":[[null,"e"],[3000,"e"],[null,"e"],[3000,"e"],[null,"a"],[null,"a"],[null,"a"],[null,"a"]]},{"slug":"9-rue-des-alpes","d":"2025-10-30","j":[[600,"e"],[1800,"e"],[1200,"e"],[2400,"e"],[null,"a"],[null,"a"],[null,"a"],[454.4,"a"]]},{"slug":"la-bruxelloise","d":"2025-12-18","j":[[1890,"e"],[2835,"e"],[2835,"e"],[2100,"e"],[null,"a"],[null,"a"],[2060.25,"a"],[2060.25,"a"]]},{"slug":"la-regence","d":"2026-03-30","j":[[1710,"e"],[2565,"e"],[2565,"e"],[1710,"e"],[null,"e"],[null,"a"],[null,"a"],[null,"a"]]},{"slug":"le-foch","d":"2026-03-12","j":[[3000,"e"],[4500,"e"],[4500,"e"],[3000,"e"],[1800,"e"],[1200,"a"],[null,"a"],[null,"a"]]},{"slug":"le-muguet","d":"2025-12-10","j":[[900,"e"],[2700,"e"],[1800,"e"],[3600,"f"],[null,"a"],[null,"a"],[null,"a"],[null,"a"]]},{"slug":"les-erables-selestat","d":"2026-05-07","j":[[1800,"e"],[2700,"e"],[2700,"e"],[1700,"a"],[1020,"a"],[680,"a"],[837.75,"a"],[837.75,"a"]]},{"slug":"residence-wolff","d":"2025-07-07","j":[[6000,"e"],[6000,"e"],[6000,"e"],[15000,"e"],[9000,"a"],[6000,"a"],[null,"a"],[null,"a"]]},{"slug":"schumann-colmar","d":"2026-05-11","j":[[2800,"e"],[4200,"e"],[4200,"e"],[2800,"e"],[1680,"e"],[1120,"a"],[null,"a"],[null,"a"]]},{"slug":"tennis","d":"2026-03-12","j":[[3850,"e"],[1155,"e"],[1155,"e"],[770,"e"],[770,"a"],[null,"a"],[null,"a"],[null,"a"]]},{"slug":"51-rue-du-general-leclerc","d":"2025-07-16","j":[[300,"e"],[900,"e"],[600,"e"],[1200,"e"],[null,"e"],[null,"e"],[null,"a"],[null,"a"]]},{"slug":"copropriete-des-trois-figuiers","d":"2026-02-02","j":[[600,"e"],[600,"e"],[600,"e"],[1200,"e"],[null,"a"],[null,"a"],[null,"a"],[null,"a"]]}]'::jsonb) as x(slug text, d date, j jsonb);

insert into honoraires_dossiers (copro_id, derniere_facture, source, importe_le)
select c.id, s.d, 'Extraction Notion AMO COPRO du 28/09/2026', now()
from zz_hono s join coproprietes c on c.slug = s.slug and c.deleted_at is null
on conflict (copro_id) do update
  set derniere_facture = excluded.derniere_facture, source = excluded.source, importe_le = excluded.importe_le;

insert into honoraires_jalons (copro_id, jalon, montant_ht, etat)
select c.id,
       (array['P1a', 'P1b', 'P1c', 'P2a', 'P2b', 'P2c', 'FCEE1', 'FCEE2'])[t.ord],
       nullif(t.v->>0, '')::numeric,
       case t.v->>1 when 'e' then 'encaisse' when 'f' then 'facture' else 'a_facturer' end
from zz_hono s
join coproprietes c on c.slug = s.slug and c.deleted_at is null
cross join lateral jsonb_array_elements(s.j) with ordinality as t(v, ord)
on conflict (copro_id, jalon) do update
  set montant_ht = excluded.montant_ht, etat = excluded.etat, updated_at = now()
  where honoraires_jalons.updated_by is null;

commit;

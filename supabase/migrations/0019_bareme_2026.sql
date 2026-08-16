-- Barèmes Anah au 1er janvier 2026 (identiques à src/lib/finance/bareme2026.ts).
-- Le hors Île-de-France devient le barème actif ; l'Île-de-France est disponible
-- mais inactif (l'app sert principalement le Grand Est). Le 2024 est désactivé.

update baremes set actif = false where millesime < 2026;

insert into baremes (millesime, zone, actif, params) values (
  2026,
  'hors_idf',
  true,
  '{
    "millesime": 2026,
    "zone": "hors_idf",
    "mprSeuils": {
      "seuils": {
        "1": [17363, 22259, 31185],
        "2": [25393, 32553, 45842],
        "3": [30540, 39148, 55196],
        "4": [35676, 45735, 64550],
        "5": [40835, 52348, 73907]
      },
      "parPers": [5151, 6598, 9357]
    },
    "primesIndiv": { "Bleu": 3000, "Jaune": 2250, "Violet": 1500, "Rose": 0 },
    "mprCopro": {
      "tauxStandard": 30,
      "tauxMajore": 45,
      "seuilMin": 35,
      "seuilMajore": 50,
      "bonusPassoire": 10
    },
    "ecoPtz": { "plafondParLogement": 50000, "dureeMin": 3, "dureeMax": 20 }
  }'::jsonb
),
(
  2026,
  'idf',
  false,
  '{
    "millesime": 2026,
    "zone": "idf",
    "mprSeuils": {
      "seuils": {
        "1": [24031, 29253, 40851],
        "2": [35270, 42933, 60051],
        "3": [42357, 51564, 71846],
        "4": [49455, 60208, 84562],
        "5": [56580, 68877, 96817]
      },
      "parPers": [7116, 8663, 12257]
    },
    "primesIndiv": { "Bleu": 3000, "Jaune": 2250, "Violet": 1500, "Rose": 0 },
    "mprCopro": {
      "tauxStandard": 30,
      "tauxMajore": 45,
      "seuilMin": 35,
      "seuilMajore": 50,
      "bonusPassoire": 10
    },
    "ecoPtz": { "plafondParLogement": 50000, "dureeMin": 3, "dureeMax": 20 }
  }'::jsonb
)
on conflict (millesime, zone) do nothing;

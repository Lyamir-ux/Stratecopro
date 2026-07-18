-- Barème 2024 hors Île-de-France (identique à src/lib/finance/bareme2024.ts)
insert into baremes (millesime, zone, actif, params) values (
  2024,
  'hors_idf',
  true,
  '{
    "millesime": 2024,
    "zone": "hors_idf",
    "mprSeuils": {
      "seuils": {
        "1": [17173, 22015, 30844],
        "2": [25115, 32197, 45340],
        "3": [30206, 38719, 54592],
        "4": [35285, 45234, 63844],
        "5": [40388, 51775, 73098]
      },
      "parPers": [5094, 6525, 9254]
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

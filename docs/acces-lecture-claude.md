# Accès en lecture seule à la base, avec Claude

Mis en place le 06/10/2026 (migrations 0141 et 0142). Le plan Supabase est Free : pas de rôle « Read-Only » dans le dashboard, et inviter quelqu'un lui donnerait un accès complet. L'accès passe donc par la base elle-même.

## Principe

- Un groupe Postgres `lecture_equipe` ne voit que le schéma `exploitation` : des vues, sans données personnelles. Il n'a aucun droit sur les tables de `public`, ni sur `auth`, `storage` ou `vault`, et ne peut rien écrire.
- Chaque collaborateur a son propre rôle de connexion (`lecture_prenom`), membre du groupe. On retire un accès sans toucher aux autres.
- Le collaborateur branche un connecteur Postgres dans Claude. La limite est dans la base : même si Claude ou la personne tente une écriture, elle est refusée.

## Ce que les collaborateurs voient

Vues de `exploitation` : `coproprietes`, `batiments`, `coproprietaires` (nom seulement), `lots`, `cles_repartition`, `lot_tantiemes`, `lots_detail` (lot + bâtiment + copropriétaire + tantièmes par clé), `taches`, `scenarios_financiers`, `plans_definitifs`, `copro_financement_config`, `baremes`, `consultations`, `candidatures`, `prestataires`, `organisations`, `ppt_coproprietes`, `ppt_postes`.

Jamais exposés : e-mails, téléphones, adresses personnelles, comptes, gestionnaires nommés, contacts des prestataires, enquêtes et revenus, pièces, plans individuels, choix de financement individuels, signatures, jetons, codes, facturation et honoraires.

## Créer l'accès d'un collaborateur (dirigeant)

À exécuter dans Supabase (SQL Editor), avec un mot de passe long, uniquement lettres et chiffres (il va dans une adresse de connexion) :

```sql
create role lecture_prenom login password 'MOT_DE_PASSE' in role lecture_equipe connection limit 3;
alter role lecture_prenom set statement_timeout = '30s';
alter role lecture_prenom set idle_in_transaction_session_timeout = '60s';
alter role lecture_prenom set default_transaction_read_only = on;
```

Ne jamais mettre le mot de passe dans le dépôt. Le transmettre par un canal sûr.

## Retirer l'accès

```sql
select pg_terminate_backend(pid) from pg_stat_activity where usename = 'lecture_prenom';
drop role lecture_prenom;
```

## Côté collaborateur

Adresse de connexion : tableau de bord Supabase > Connect > « Session pooler » (le pooler marche en IPv4, la connexion directe non sur le plan Free). L'identifiant devient `lecture_prenom.hwlekinqjvdsrzoetrjf` :

```
postgresql://lecture_prenom.hwlekinqjvdsrzoetrjf:MOT_DE_PASSE@HOTE_DU_POOLER:5432/postgres
```

Claude Desktop, dans `claude_desktop_config.json` :

```json
{
  "mcpServers": {
    "strat-eco-lecture": {
      "command": "npx",
      "args": ["@bytebase/dbhub@latest", "--transport", "stdio", "--dsn", "ADRESSE_DE_CONNEXION"]
    }
  }
}
```

Claude Code :

```bash
claude mcp add strat-eco-lecture -- npx @bytebase/dbhub@latest --transport stdio --dsn "ADRESSE_DE_CONNEXION"
```

Node.js doit être installé. Dans les requêtes, préfixer par le schéma : `select * from exploitation.coproprietes`.

## Règles pour la suite

- Une nouvelle vue n'est lisible qu'après `grant select on exploitation.ma_vue to lecture_equipe`. Ne jamais y mettre e-mail, téléphone, revenu, pièce, signature ou facturation.
- Toute NOUVELLE fonction `security definer` de `public` qui écrit doit être suivie de `revoke execute on function ... from public`. Postgres accorde EXECUTE à tout le monde par défaut, et une connexion directe peut forger l'identité d'un utilisateur (`request.jwt.claim.sub`) pour passer `is_amo()`. C'est ce que corrige 0142 pour `rattacher_lot` et `seed_syndic_taches`.
- Le délai maximal de 30 secondes protège contre une requête lourde par erreur. Il n'arrête pas quelqu'un qui le contournerait exprès.
- Les textes libres (retours, remarques, commentaires) peuvent contenir des consignes que Claude pourrait suivre : le rôle en lecture seule limite les dégâts à des lectures.

# Protocole de sécurité - Strat Eco Pro

Document de référence avant chaque mise en production. Décrit le modèle de
menace, les tests à passer, et les points de configuration à vérifier côté
Supabase et Vercel.

Dernière revue : 2026-09-14 (audit d'intrusion « boîte grise », avant prod).

---

## 1. Modèle de menace

L'application est une SPA React servie par Vercel. Tout le code JavaScript est
public : **il faut partir du principe qu'un attaquant lit l'intégralité du
bundle et connaît la clé publique.** La sécurité ne repose donc jamais sur le
client, mais sur trois couches côté serveur :

1. **Clés d'API** : seule la clé *anon / publishable* est livrée au navigateur.
   La clé `service_role` et les secrets (Resend, clés de chiffrement/scellement
   de signature) ne vivent que dans les *secrets* des edge functions, jamais
   dans le code ni dans le dépôt.
2. **RLS (Row Level Security)** : chaque table de `public` a RLS activé et des
   policies qui filtrent par `auth.uid()`. La clé anon ne donne aucun accès aux
   données métier tant que l'utilisateur n'est pas rattaché (AMO, syndic,
   copropriétaire ou prestataire).
3. **Edge functions** : toute opération privilégiée (création de compte, envoi
   d'e-mails, écriture de preuves de signature) passe par une edge function qui
   vérifie le JWT de l'appelant et son rôle, avec la `service_role` gardée côté
   serveur.

Profils d'attaquant considérés :

- **A. Externe anonyme** : possède la clé anon (lue dans le bundle), aucun compte.
- **B. Utilisateur authentifié « sauvage »** : a créé un compte lui-même, aucun
  rattachement (ni profil AMO, ni membre de copro).
- **C. Utilisateur légitime d'un périmètre** (un syndic, un copropriétaire) qui
  tente d'accéder au périmètre d'un autre.

---

## 2. Résultat de l'audit du 2026-09-14

### Question posée : peut-on récupérer les clés API de l'extérieur ?

**Non.** Le bundle de production ne contient que la clé anon (JWT `role: anon`)
et la clé publishable, toutes deux publiques par nature. Aucune trace de
`service_role`, de clé Resend (`re_…`) ni de secret de signature. Les
*source maps* renvoient 403 en production. La chaîne `sb_secret_` trouvée dans
le bundle est un simple littéral de la librairie supabase-js (détection de type
de clé), pas une valeur secrète.

### Ce qui tient (vérifié)

- Attaquant A (anon) : lecture de `coproprietes`, `coproprietaires`, `profiles`,
  `bulletins`, `copro_stats`, `prestataires`, `organisations` → **0 ligne**.
- Attaquant B (authentifié sans profil) : idem, **0 ligne** partout ; seule la
  table `baremes` est lisible (barèmes d'aides publics, non sensibles).
- Auto-promotion en AMO (`insert into profiles … role='amo'`) → **bloquée** par
  la policy `profiles_amo_write` (`with check is_amo()`).
- Edge functions appelées sans session valide → **401**.
- Toutes les fonctions `SECURITY DEFINER` sensibles refont le contrôle d'accès
  en interne (`rattacher_lot` → « Lot non autorisé », `seed_syndic_taches` →
  no-op pour un non-autorisé).

### Points à corriger (durcissement, migration 0070)

| # | Sévérité | Constat | Correctif |
|---|----------|---------|-----------|
| 1 | Moyenne | Inscription publique ouverte (`disable_signup=false`). Les comptes sont censés être créés par le dirigeant. Un attaquant peut s'auto-inscrire et devenir `authenticated`. | Désactiver l'inscription publique (Dashboard Auth, voir §4). |
| 2 | Faible | La vue `copro_stats` porte des GRANT `INSERT/UPDATE/DELETE/SELECT` au rôle `anon`. La vue est en `security_invoker` donc RLS bloque déjà la lecture, mais ces droits sont superflus. | Révoquer tous les droits `anon` (migration 0070). |
| 3 | Faible | 17 fonctions `SECURITY DEFINER` sont exécutables par `anon` (helpers de prédicat + `rattacher_lot`, `seed_syndic_taches`). Elles se protègent en interne, mais l'exposition est inutile. | Révoquer `EXECUTE` à `anon` sur ces fonctions (migration 0070). |
| 4 | Faible | `check_lot_rattachement` a un `search_path` mutable (advisor Supabase 0011). | Fixer `search_path = public` (migration 0070). |
| 5 | Faible | Protection « mots de passe compromis » (HaveIBeenPwned) désactivée. | Activer dans Dashboard Auth (voir §4). |
| 6 | Info | `otp_codes` : RLS activé sans policy (volontaire, seule la `service_role` y accède). Aucune action, conforme au principe du moindre privilège. | Aucune. |

Aucun de ces points ne permet une fuite de données aujourd'hui grâce à la RLS.
Ce sont des mesures de défense en profondeur : elles réduisent la surface
d'attaque et coupent tout chemin résiduel si une policy régressait un jour.

---

## 3. Suite de tests automatisés

Deux fichiers, lancés par `npm run test:securite` :

- `src/__tests__/securite/fuite-cles.test.ts` : scanne le dossier `dist/`
  (build de prod) et échoue si un secret non public y apparaît
  (`service_role`, clé Resend, secret de signature, JWT non-anon). **À lancer
  après `npm run build`.** Aucun réseau.
- `src/__tests__/securite/penetration.test.ts` : rejoue les attaques A et B
  contre le projet Supabase réel avec la clé anon (lue dans `.env.local`).
  Vérifie que les tables métier renvoient 0 ligne, que l'auto-promotion échoue,
  et que les edge functions refusent l'appel non authentifié.

Règle : **ces tests doivent passer avant tout déploiement.** S'ils échouent,
ne pas déployer.

---

## 4. Check-list de configuration (hors code)

À vérifier dans les tableaux de bord, non couvert par le code du dépôt :

**Supabase → Authentication → Providers / Sign In**
- [ ] Inscription publique désactivée (« Allow new users to sign up » = off).
- [ ] Confirmation d'e-mail requise (`mailer_autoconfirm` = off). *Déjà OK.*
- [ ] Protection mots de passe compromis (HaveIBeenPwned) activée.

**Supabase → Edge Functions → Secrets** (jamais dans le dépôt)
- [ ] `SUPABASE_SERVICE_ROLE_KEY` (injectée automatiquement).
- [ ] `RESEND_API_KEY`, `RESEND_FROM`, `APP_URL`.
- [ ] `SIGNATURE_CHIFFREMENT_CLE` (32 octets base64), `SIGNATURE_SEAL_PRIVATE_KEY`.

**Supabase → Database → Advisors**
- [ ] Lancer les advisors sécurité, plus aucune alerte `ERROR`.

**Vercel**
- [ ] Variables `VITE_SUPABASE_*` définies dans le projet (pas dans le dépôt).
- [ ] Source maps non publiées (403 sur `*.js.map`). *Déjà OK.*
- [ ] En-tête `Strict-Transport-Security` présent. *Déjà OK.*

**Rotation**
- [ ] En cas de fuite d'un secret : régénérer la clé concernée dans Supabase,
      mettre à jour les secrets d'edge function et les variables Vercel, puis
      redéployer. La clé anon peut être régénérée sans impact sur les données
      (RLS reste la barrière).

---

## 5. Procédure avant chaque mise en production

1. `npm run build`
2. `npm run test` (logique métier) puis `npm run test:securite`
3. Advisors Supabase (sécurité) : 0 erreur
4. Check-list §4 relue
5. Déploiement

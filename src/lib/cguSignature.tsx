// CGU du service de dépôt de pièces et de signature électronique (v1.6).
// Texte affiché sur /cgu-signature et dans les parcours de signature ; la
// version acceptée est figée par signataire (cgu_version) et reportée dans le
// certificat de preuve - toute évolution du texte impose d'incrémenter
// CGU_VERSION.
import { Fragment, type ReactNode } from "react";

export const CGU_VERSION = "1.6";

// ---- mini-rendu markdown (titres, gras, listes, tableaux, citations) ----

function inline(text: string, key: number): ReactNode {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return (
    <Fragment key={key}>
      {parts.map((p, i) => (i % 2 === 1 ? <b key={i}>{p}</b> : <Fragment key={i}>{p}</Fragment>))}
    </Fragment>
  );
}

export function CguTexte({ markdown }: { markdown?: string }) {
  const lignes = (markdown ?? CGU_MARKDOWN).split("\n");
  const out: ReactNode[] = [];
  let i = 0;
  let k = 0;
  while (i < lignes.length) {
    const l = lignes[i];
    if (!l.trim() || l.trim() === "---") { i++; continue; }
    if (l.startsWith("### ")) { out.push(<h4 key={k++}>{inline(l.slice(4), k)}</h4>); i++; continue; }
    if (l.startsWith("## ")) { out.push(<h3 key={k++}>{inline(l.slice(3), k)}</h3>); i++; continue; }
    if (l.startsWith("# ")) { out.push(<h2 key={k++}>{inline(l.slice(2), k)}</h2>); i++; continue; }
    if (l.startsWith("> ")) {
      const bloc: string[] = [];
      while (i < lignes.length && lignes[i].startsWith("> ")) { bloc.push(lignes[i].slice(2)); i++; }
      out.push(<blockquote key={k++}>{bloc.map((b, j) => <p key={j}>{inline(b, j)}</p>)}</blockquote>);
      continue;
    }
    if (l.startsWith("- ")) {
      const items: string[] = [];
      while (i < lignes.length && lignes[i].startsWith("- ")) { items.push(lignes[i].slice(2)); i++; }
      out.push(<ul key={k++}>{items.map((it, j) => <li key={j}>{inline(it, j)}</li>)}</ul>);
      continue;
    }
    if (/^\d+\.\s/.test(l)) {
      const items: string[] = [];
      while (i < lignes.length && /^\d+\.\s/.test(lignes[i])) { items.push(lignes[i].replace(/^\d+\.\s/, "")); i++; }
      out.push(<ol key={k++}>{items.map((it, j) => <li key={j}>{inline(it, j)}</li>)}</ol>);
      continue;
    }
    if (l.startsWith("|")) {
      const rows: string[][] = [];
      while (i < lignes.length && lignes[i].startsWith("|")) {
        const cells = lignes[i].split("|").slice(1, -1).map((c) => c.trim());
        if (!cells.every((c) => /^-+$/.test(c))) rows.push(cells);
        i++;
      }
      out.push(
        <div key={k++} style={{ overflowX: "auto" }}>
          <table>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri}>
                  {r.map((c, ci) =>
                    ri === 0 ? <th key={ci}>{inline(c, ci)}</th> : <td key={ci}>{inline(c, ci)}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }
    // paragraphe : agrège jusqu'à la ligne vide
    const bloc: string[] = [];
    while (i < lignes.length && lignes[i].trim() && !/^(#|\||>|- |\d+\. |---)/.test(lignes[i])) {
      bloc.push(lignes[i]); i++;
    }
    out.push(<p key={k++}>{inline(bloc.join(" "), k)}</p>);
  }
  return <div className="cgu-texte">{out}</div>;
}

// ---- texte intégral ----

export const CGU_MARKDOWN = `
# CONDITIONS GÉNÉRALES D'UTILISATION
## Espace adhérent, dépôt de pièces justificatives et signature électronique - Strat Eco Pro

**Version 1.6 - En vigueur au 30 août 2026**

## PRÉAMBULE

Les présentes Conditions Générales d'Utilisation (ci-après les « CGU ») régissent l'accès et l'utilisation du service permettant aux copropriétaires de **déposer les pièces justificatives** nécessaires au montage de leur dossier de rénovation énergétique, de **renseigner leurs informations personnelles et bancaires**, et de **signer électroniquement** les documents afférents, au sein du logiciel **Strat Eco Pro**, édité par **STRAT ECO SUB**, société par actions simplifiée au capital de 1 000 euros, immatriculée au Registre du commerce et des sociétés de Strasbourg sous le numéro SIREN 980 988 901 (SIRET 980 988 901 00024), dont le siège social est situé 27 rue du Vieux Marché aux Vins, 67000 Strasbourg, représentée par son Président (ci-après « Strat Eco » ou « l'Éditeur »).

Contact : contact@strateco.fr - 03 65 67 13 54

L'acceptation des présentes CGU est un préalable obligatoire à l'utilisation du service. En cochant la case « J'ai lu et j'accepte les Conditions Générales d'Utilisation », l'Utilisateur reconnaît en avoir pris connaissance et les accepter sans réserve.

## ARTICLE 1 - DÉFINITIONS

**Adhérent / Signataire** : toute personne physique invitée à signer électroniquement un document via le Service, qu'elle dispose ou non d'un compte utilisateur.

**Bulletin d'adhésion** : document contractuel par lequel un ou plusieurs copropriétaires manifestent leur souhait d'adhérer à un **éco-prêt à taux zéro** dans le cadre du programme de rénovation énergétique de leur copropriété.

**Copropriétaire principal** : personne physique ou morale à l'initiative de la démarche d'adhésion, qui renseigne le Bulletin d'adhésion et déclare les Cosignataires. Lorsque le Copropriétaire principal est une personne morale, il agit par l'intermédiaire de son représentant légal ou de toute personne physique dûment habilitée, qui procède aux opérations de dépôt et de signature.

**Cosignataire** : personne physique déclarée par le Copropriétaire principal comme devant également signer le Bulletin d'adhésion (indivision, couple, société civile, etc.).

**Lien de signature** : URL personnelle, unique, à usage limité et à durée de validité déterminée, permettant au Signataire d'accéder au Service sans création de compte.

**Code OTP** (One-Time Password) : code numérique à usage unique transmis par SMS au numéro de téléphone mobile du Signataire ou par courrier électronique à l'adresse qu'il a déclarée, permettant de vérifier qu'il en a le contrôle exclusif.

**Signature électronique avancée** : signature électronique répondant aux exigences de l'article 26 du Règlement (UE) n° 910/2014 dit « eIDAS ».

**Certificat de preuve** : document généré automatiquement par le Service, récapitulant l'ensemble des éléments techniques attestant du déroulement du processus de signature.

**Pièces justificatives** : ensemble des documents que l'Utilisateur est amené à téléverser dans le Service, notamment pièce d'identité, avis d'imposition sur les revenus, avis de taxe foncière, acte notarié ou attestation de propriété, et, **en cas d'adhésion**, relevé d'identité bancaire.

**Organismes tiers** : personnes morales destinataires des Pièces justificatives dans le cadre de l'instruction du dossier, notamment l'Agence nationale de l'habitat (Anah), les établissements bancaires instruisant une demande d'éco-prêt à taux zéro et les délégataires de certificats d'économies d'énergie.

**Utilisateur** : toute personne physique utilisant le Service, qu'elle intervienne en qualité de Copropriétaire principal, de Cosignataire ou de déposant de Pièces justificatives.

**Service** : l'ensemble des fonctionnalités du logiciel Strat Eco Pro décrites à l'article 2, objet des présentes CGU.

## ARTICLE 2 - OBJET

Les présentes CGU ont pour objet de définir les conditions dans lesquelles Strat Eco met à disposition des Utilisateurs un service permettant :

- le téléversement des **pièces justificatives** nécessaires au montage du dossier de rénovation énergétique (pièces d'identité, avis d'imposition, avis de taxe foncière, actes notariés ou titres de propriété) ainsi que, **en cas d'adhésion**, du relevé d'identité bancaire ;
- la **saisie d'informations personnelles** relatives au copropriétaire, à son foyer fiscal et à son lot ;
- la vérification du contrôle d'un numéro de téléphone mobile ou d'une adresse électronique par Code OTP ;
- la **signature électronique avancée** de Bulletins d'adhésion, attestations, mandats et documents connexes ;
- la **transmission de ces pièces aux Organismes tiers** habilités (Anah, établissements bancaires, délégataires CEE) dans le cadre de l'instruction des demandes d'aides ;
- la conservation et la restitution des éléments de preuve associés.

## ARTICLE 3 - ACCÈS AU SERVICE SANS CRÉATION DE COMPTE

### 3.1 Principe

L'accès au Service s'effectue exclusivement au moyen d'un Lien de signature personnel transmis par courrier électronique. Aucune création de compte, aucun mot de passe ne sont requis.

### 3.2 Caractéristiques du Lien de signature

Le Lien de signature est :

- **personnel et nominatif** : il ne doit en aucun cas être transmis à un tiers ;
- **unique** : un lien distinct est généré pour chaque Signataire et chaque document ;
- **à durée limitée** : sa validité est de **30 jours** à compter de son émission ;
- **invalidé automatiquement** après la signature ou à l'expiration du délai.

### 3.3 Responsabilité du Signataire

Le Signataire s'engage à ne pas communiquer son Lien de signature à un tiers et à signaler sans délai à Strat Eco toute utilisation frauduleuse dont il aurait connaissance, à l'adresse contact@strateco.fr.

Toute signature apposée au moyen du Lien de signature d'un Signataire, après validation du Code OTP qui lui a été transmis, est réputée émaner de lui.

## ARTICLE 4 - DÉROULEMENT DU PROCESSUS DE SIGNATURE

### 4.1 Rôle du Copropriétaire principal

Le Copropriétaire principal :

- renseigne les informations relatives au Bulletin d'adhésion ;
- déclare l'identité (nom, prénom), l'adresse électronique et le numéro de téléphone mobile de chaque Cosignataire ;
- téléverse sa propre pièce d'identité et procède à sa propre signature.

Le Copropriétaire principal **certifie sur l'honneur** que les coordonnées communiquées correspondent effectivement aux personnes déclarées et qu'il est habilité à les transmettre. Il garantit Strat Eco contre toute réclamation résultant d'une déclaration inexacte.

### 4.2 Rôle de chaque Cosignataire

Chaque Cosignataire, depuis son propre Lien de signature :

1. téléverse **personnellement** sa pièce d'identité en cours de validité (carte nationale d'identité, passeport ou titre de séjour) ;
2. prend connaissance de l'intégralité du document à signer ;
3. exprime son consentement de manière explicite ;
4. reçoit un Code OTP (par SMS ou par courrier électronique) et le saisit ;
5. valide sa signature.

### 4.3 Unicité des coordonnées

Une même adresse électronique ou un même numéro de téléphone mobile ne peut être associé à deux Signataires distincts d'un même document. Le Service rejette automatiquement toute tentative en ce sens.

### 4.4 Finalisation

Le document n'est réputé signé qu'une fois **l'ensemble** des Signataires ayant apposé leur signature. Le document est alors scellé cryptographiquement et transmis à chaque Signataire, accompagné du Certificat de preuve.

## ARTICLE 5 - VALEUR JURIDIQUE ET CONVENTION DE PREUVE

### 5.1 Niveau de signature

Le Service met en œuvre un procédé de **signature électronique avancée** au sens de l'article 26 du Règlement (UE) n° 910/2014, reposant sur :

- l'identification du Signataire par la fourniture d'une pièce d'identité officielle ;
- la vérification du contrôle exclusif d'un numéro de téléphone mobile ou d'une adresse électronique par Code OTP ;
- le lien univoque entre la signature et le Signataire ;
- le scellement cryptographique du document (empreinte SHA-256) permettant de détecter toute modification ultérieure ;
- l'horodatage et la journalisation de l'ensemble des opérations.

Le Service ne constitue pas une signature électronique qualifiée au sens de l'article 3.12 du Règlement eIDAS et ne bénéficie pas de la présomption de fiabilité prévue à l'article 1367 alinéa 2 du Code civil.

### 5.2 Convention de preuve

**Conformément à l'article 1368 du Code civil, les parties conviennent expressément que :**

a) Le procédé de signature électronique mis en œuvre par Strat Eco Pro, tel que décrit à l'article 5.1 et détaillé dans la Politique de signature communiquée sur demande à l'adresse contact@strateco.fr, constitue entre elles un procédé fiable d'identification garantissant le lien entre la signature et l'acte auquel elle s'attache.

b) Les documents signés par ce procédé, ainsi que les Certificats de preuve et journaux d'événements générés par le Service, sont admis entre les parties comme modes de preuve des opérations réalisées et de leur contenu.

c) Les données d'horodatage générées par les serveurs de Strat Eco font foi entre les parties quant à la date et à l'heure des opérations.

d) Le document signé électroniquement, ainsi que sa reproduction sur support durable, ont entre les parties la même force probante que l'écrit sur support papier revêtu d'une signature manuscrite.

e) La charge de la preuve contraire incombe à la partie qui conteste la validité de la signature.

Cette convention de preuve est conclue sans préjudice des dispositions d'ordre public applicables et des droits des consommateurs.

## ARTICLE 6 - OBLIGATIONS DU SIGNATAIRE

Le Signataire s'engage à :

- fournir des informations exactes, complètes et à jour ;
- téléverser une pièce d'identité **le concernant personnellement**, en cours de validité, lisible et non altérée ;
- disposer du contrôle exclusif du numéro de téléphone mobile et de l'adresse électronique communiqués ;
- ne pas usurper l'identité d'un tiers ;
- ne pas tenter de contourner, altérer ou compromettre les mécanismes de sécurité du Service ;
- **ne téléverser que des Pièces justificatives le concernant ou concernant son lot**, à l'exclusion de tout document relatif à un tiers non partie au dossier ;
- **ne pas altérer le contenu substantiel** des Pièces justificatives déposées ; seule l'occultation des mentions non nécessaires prévue à l'article 7.2 est admise ;
- veiller à la lisibilité et à la validité des documents déposés.

L'Utilisateur est informé que la production d'un avis d'imposition ou d'un justificatif falsifié en vue d'obtenir une aide publique est susceptible de constituer une escroquerie au sens de l'article 313-1 du Code pénal et d'entraîner le retrait des aides accordées.

Toute fourniture de document falsifié ou usurpation d'identité est susceptible d'engager la responsabilité pénale de son auteur, notamment au titre des articles 226-4-1 et 441-1 du Code pénal.

## ARTICLE 7 - PROTECTION DES DONNÉES À CARACTÈRE PERSONNEL

### 7.1 Responsable de traitement

**STRAT ECO**, dont le siège social est situé 27 rue du Vieux Marché aux Vins, 67000 Strasbourg, est responsable du traitement au sens du Règlement (UE) 2016/679 (« RGPD ») et de la loi n° 78-17 du 6 janvier 1978 modifiée.

Contact pour toute question relative aux données personnelles : **Marius Mazzante - marius@strateco.fr**

### 7.2 Données collectées

| Catégorie | Données |
|---|---|
| Identité | Nom, prénom(s), date de naissance, lieu de naissance, nationalité |
| Coordonnées | Adresse postale, adresse électronique, numéro de téléphone mobile |
| Pièce d'identité | Copie de la carte nationale d'identité, du passeport ou du titre de séjour |
| **Données fiscales** | Avis d'imposition sur les revenus : revenu fiscal de référence, nombre de parts, composition du foyer fiscal, numéro fiscal, adresse fiscale |
| **Données de propriété** | Avis de taxe foncière (références cadastrales, désignation du bien) ; acte notarié ou attestation de propriété ; tantièmes et quote-parts du lot |
| **Données bancaires** | Relevé d'identité bancaire : IBAN, BIC, nom du titulaire, domiciliation |
| Situation du logement | Adresse du lot, surface, type de logement, statut d'occupation (résidence principale, secondaire, locative) |
| Données de connexion | Adresse IP, horodatages, type de navigateur, identifiant de session |
| Données de signature | Empreinte du document, empreinte des pièces déposées, horodatage de signature, statut de validation OTP |
| Données contractuelles | Références de la copropriété, nature de la mission, montants d'honoraires |

**Minimisation** - Strat Eco ne collecte que les Pièces justificatives effectivement exigées par les organismes financeurs pour l'instruction du dossier. Lorsqu'une pièce contient des informations excédant ce besoin (notamment un acte notarié mentionnant le prix d'acquisition, le régime matrimonial ou une dévolution successorale), l'Utilisateur est expressément autorisé à occulter les mentions non nécessaires avant téléversement, à la seule condition que demeurent lisibles l'identification du propriétaire, la désignation du lot et les tantièmes.

**Avis d'imposition** - L'avis d'imposition est transmis **dans son intégralité**, sans occultation possible. Cette transmission intégrale est rendue nécessaire par les modalités d'instruction imposées par l'Anah et par les établissements bancaires, qui exigent la production de l'avis complet et authentifiable aux fins de vérification des ressources du foyer et de détermination du barème d'aide applicable. L'Utilisateur en est informé préalablement au téléversement. Ce document est **supprimé** des systèmes de Strat Eco dans les conditions prévues à l'article 7.4.1.

### 7.3 Finalités et bases légales

| Finalité | Base légale (art. 6 RGPD) |
|---|---|
| Vérification de l'identité du Signataire | Exécution du contrat / Intérêt légitime (prévention de la fraude) |
| Mise en œuvre de la signature électronique | Exécution du contrat (art. 6.1.b) |
| Constitution et conservation des éléments de preuve | Intérêt légitime (art. 6.1.f) - capacité à établir la preuve du consentement en cas de litige |
| **Évaluation de l'éligibilité aux aides et détermination du barème de ressources** | Exécution du contrat (art. 6.1.b) |
| **Vérification de la qualité de propriétaire du lot** | Exécution du contrat (art. 6.1.b) |
| **Constitution et transmission des dossiers de demande d'aides (MaPrimeRénov', éco-PTZ, CEE, Anah)** | Exécution du contrat (art. 6.1.b) |
| **Versement des aides et encaissement des honoraires** | Exécution du contrat (art. 6.1.b) |
| Gestion de la relation client et suivi de mission | Exécution du contrat |
| Respect des obligations comptables et fiscales | Obligation légale (art. 6.1.c) |

Aucune Pièce justificative n'est utilisée à des fins de prospection commerciale, de profilage ni de décision automatisée. Les données ne font l'objet d'aucune cession ni d'aucun partage à des fins publicitaires.

### 7.4 Durées de conservation

| Donnée | Durée | Point de départ |
|---|---|---|
| **Copie de la pièce d'identité** | Supprimée dès l'événement déclencheur ci-dessous | - |
| **Avis d'imposition** (document intégral) | Supprimé dès l'événement déclencheur ci-dessous | - |
| **Avis de taxe foncière** | Supprimé dès l'événement déclencheur ci-dessous | - |
| **Acte notarié / titre de propriété** | Supprimé dès l'événement déclencheur ci-dessous | - |
| **Relevé d'identité bancaire** | **Durée de la relation contractuelle**, puis suppression dès le dernier flux financier exécuté | - |
| **Données extraites** (RFR, nombre de parts, tantièmes, surface, statut d'occupation) | 10 ans | Fin de la relation contractuelle |
| **Empreintes cryptographiques et preuves de transmission** | 10 ans | Date de transmission |
| Document signé et Certificat de preuve | 10 ans | Fin de la relation contractuelle |
| Journaux d'événements (logs de signature et de consultation) | 10 ans | Date de l'événement |
| Coordonnées et données de gestion client | 3 ans | Fin de la relation contractuelle |
| Documents comptables associés | 10 ans | Clôture de l'exercice |

### 7.4.1 Événement déclencheur de la suppression des Pièces justificatives

Les Pièces justificatives listées ci-dessus (pièce d'identité, avis d'imposition, avis de taxe foncière, acte notarié ou titre de propriété) sont **supprimées automatiquement et définitivement** des systèmes de Strat Eco dès la réalisation cumulative des deux conditions suivantes :

1. **réception de la notification de décision de l'Agence nationale de l'habitat** relative à la demande d'aide ; **et**
2. **transmission effective du dossier à l'établissement bancaire** instruisant, le cas échéant, la demande d'éco-prêt à taux zéro.

Lorsqu'aucune demande d'éco-prêt à taux zéro n'est déposée, la seule réception de la notification de l'Anah déclenche la suppression.

Un délai technique maximal de **30 jours** court à compter de la réalisation de ces conditions, à l'issue duquel la suppression est effective.

### 7.4.2 Éléments conservés après suppression

Après suppression des Pièces justificatives, Strat Eco conserve uniquement :

- les **données extraites** strictement nécessaires au suivi de la mission et à la justification des montants d'aide obtenus ;
- l'**empreinte cryptographique irréversible (SHA-256)** de chaque pièce transmise ;
- la **preuve horodatée de transmission** à chaque Organisme tiers (accusé de réception, référence de dépôt, horodatage d'envoi).

Ces éléments permettent à Strat Eco de démontrer, en cas de contestation portant sur l'exécution de sa mission, quelle pièce a été produite par l'Utilisateur et à quelle date elle a été transmise à chaque Organisme tiers, **sans conserver le contenu du document lui-même**. Ils ne constituent pas une copie, même partielle, des Pièces justificatives supprimées.

### 7.4.3 Information de l'Utilisateur

L'Utilisateur est informé que les Pièces justificatives transmises à l'Agence nationale de l'habitat et à l'établissement bancaire sont **conservées par ces organismes** selon leurs propres politiques de conservation, sur lesquelles Strat Eco n'a pas de maîtrise. La suppression opérée par Strat Eco n'emporte donc aucune conséquence sur l'instruction ou le contrôle du dossier par ces organismes.

Dans l'hypothèse résiduelle où une pièce devrait être produite à nouveau après suppression, Strat Eco accompagnera l'Utilisateur dans cette démarche.

### 7.5 Destinataires

**7.5.1 Personnels de Strat Eco**

L'accès aux données est cloisonné par **niveaux d'habilitation** définis en fonction des attributions de chaque collaborateur. Les Pièces justificatives à caractère fiscal, bancaire et notarié ne sont accessibles qu'aux personnels dont les fonctions le justifient strictement. Toute consultation d'une Pièce justificative est journalisée (identité du consultant, date, heure, pièce consultée).

| Niveau | Fonction | Périmètre d'accès aux Pièces justificatives |
|---|---|---|
| **Niveau 1** - Service administratif | Traitement et vérification des documents | Accès complet en lecture aux Pièces justificatives du dossier |
| **Niveau 2** - Chef de projet | Transmission aux services instructeurs | **Aucun accès en lecture** au contenu des Pièces justificatives ; accès limité aux opérations de transmission des données et documents aux Organismes tiers |

Le détail de la matrice d'habilitation est formalisé dans la politique de sécurité interne de Strat Eco et peut être communiqué sur demande à l'autorité de contrôle.

**7.5.2 Destinataires externes**

Les données peuvent être communiquées :

- aux **Organismes tiers** mentionnés à l'article 1, dans la limite des pièces exigées par chacun pour l'instruction du dossier : **Anah** (avis d'imposition) ; **établissement bancaire** instruisant l'éco-prêt à taux zéro (avis d'imposition, pièce d'identité, justificatif de propriété, relevé d'identité bancaire, bulletin d'adhésion) ; **délégataire CEE** (avis d'imposition, transmis ponctuellement dans le cadre de contrôles aléatoires) ;
- aux **sous-traitants techniques** de Strat Eco : **Supabase** (hébergement de la base de données et du stockage de fichiers, dans l'Union européenne), **Vercel** (hébergement de l'application web) et **Resend** (envoi des courriers électroniques, y compris les codes à usage unique), chacun lié par un accord de sous-traitance conforme à l'article 28 du RGPD ;
- aux autorités administratives ou judiciaires sur réquisition.

Aucune transmission n'est effectuée au-delà de ce qui est nécessaire à l'instruction du dossier de l'Utilisateur concerné.

### 7.6 Transferts hors Union européenne

Les Pièces justificatives et l'ensemble des données du dossier sont **stockées au sein de l'Union européenne**, sur l'infrastructure de Supabase située à Stockholm (Suède).

Certains sous-traitants techniques de Strat Eco sont toutefois établis aux États-Unis, ce qui est susceptible d'entraîner un transfert de données à caractère personnel hors de l'Union européenne :

| Sous-traitant | Rôle | Localisation | Cadre du transfert |
|---|---|---|---|
| Supabase | Hébergement de la base de données et du stockage de fichiers | Union européenne (Stockholm) | Aucun transfert hors UE |
| Vercel | Hébergement de l'application web | États-Unis | Certification EU-U.S. Data Privacy Framework |
| Resend | Envoi des courriers électroniques | États-Unis | Certification EU-U.S. Data Privacy Framework, complétée par des clauses contractuelles types |

Ces transferts sont encadrés par la **décision d'adéquation de la Commission européenne du 10 juillet 2023** relative au cadre de protection des données UE-États-Unis (EU-U.S. Data Privacy Framework), auquel Vercel et Resend ont adhéré par auto-certification auprès du Département du Commerce des États-Unis. Le statut de ces certifications est consultable sur le registre public accessible à l'adresse www.dataprivacyframework.gov.

Une copie des garanties contractuelles mises en place avec chacun de ces sous-traitants peut être obtenue sur demande à l'adresse marius@strateco.fr.

Strat Eco s'engage à informer les Utilisateurs et à mettre en œuvre un mécanisme de transfert alternatif dans l'hypothèse où l'une de ces certifications viendrait à être retirée, ne serait pas renouvelée, ou si la décision d'adéquation venait à être invalidée.

### 7.7 Sécurité

Strat Eco met en œuvre les mesures techniques et organisationnelles appropriées, notamment :

- **chiffrement** des données en transit (TLS 1.2 minimum) et au repos, avec chiffrement renforcé des IBAN ;
- **cloisonnement des accès** par niveaux d'habilitation (article 7.5.1) ;
- **journalisation** des consultations et téléchargements de Pièces justificatives ;
- **masquage** des données bancaires dans l'interface ;
- **suppression automatisée** des Pièces justificatives à l'expiration des délais mentionnés à l'article 7.4 ;
- sauvegardes régulières et chiffrées ;
- sensibilisation et engagement de confidentialité des personnels habilités.

Une **analyse d'impact relative à la protection des données** (AIPD) est menée conformément à l'article 35 du RGPD, compte tenu de la nature des données traitées.

### 7.8 Droits des personnes

Conformément aux articles 15 à 22 du RGPD, le Signataire dispose des droits d'**accès**, de **rectification**, d'**effacement**, de **limitation** du traitement, de **portabilité**, ainsi que du droit de **s'opposer** au traitement pour motif légitime et de définir des **directives post-mortem**.

Ces droits s'exercent à l'adresse **marius@strateco.fr** ou par courrier à Strat Eco, 27 rue du Vieux Marché aux Vins, 67000 Strasbourg, accompagné de tout élément permettant de vérifier l'identité du demandeur.

**Limite importante** : le droit à l'effacement ne s'applique pas aux données nécessaires à la constatation, l'exercice ou la défense de droits en justice (art. 17.3.e du RGPD). Les documents signés, Certificats de preuve et journaux d'événements sont conservés pour la durée mentionnée à l'article 7.4, y compris en cas de demande d'effacement.

Le Signataire dispose du droit d'introduire une réclamation auprès de la **CNIL** - 3 place de Fontenoy, TSA 80715, 75334 Paris Cedex 07 - www.cnil.fr.

## ARTICLE 8 - DISPONIBILITÉ ET RESPONSABILITÉ

### 8.1 Disponibilité

Strat Eco s'efforce d'assurer la disponibilité du Service 24h/24, sans obligation de résultat. Des interruptions peuvent survenir pour maintenance, mise à jour ou en cas de force majeure. Strat Eco s'engage à informer les Signataires concernés en cas d'interruption prolongée affectant un processus de signature en cours.

### 8.2 Responsabilité de Strat Eco

Strat Eco est responsable du bon fonctionnement du Service et de la sécurité des données traitées. Sa responsabilité ne saurait être engagée en cas de :

- fourniture par un Signataire d'informations inexactes ou de documents falsifiés ;
- divulgation par un Signataire de son Lien de signature ou de son Code OTP ;
- défaillance du réseau de télécommunication empêchant la réception du Code OTP ;
- dommage résultant d'un cas de force majeure.

### 8.3 Non-réception du Code OTP

En cas de non-réception du Code OTP, le Signataire peut en solliciter le renvoi. Après 3 tentatives infructueuses, il est invité à contacter Strat Eco à l'adresse contact@strateco.fr afin qu'une solution alternative de signature lui soit proposée.

## ARTICLE 9 - DROIT DE RÉTRACTATION

### 9.1 Objet du droit de rétractation

Le Bulletin d'adhésion signé au moyen du Service manifeste la volonté du Copropriétaire d'adhérer à un **éco-prêt à taux zéro**. Il ne constitue pas en lui-même une offre de crédit et n'emporte aucun engagement de prêt.

L'engagement de crédit résulte exclusivement de l'**offre de prêt** émise par l'établissement bancaire, laquelle est soumise aux dispositions du Code de la consommation relatives au crédit à la consommation ou au crédit immobilier, selon la nature de l'opération.

### 9.2 Exercice auprès de l'établissement prêteur

Le droit de rétractation s'exerce **exclusivement auprès de l'établissement bancaire prêteur**, selon les modalités, les délais et au moyen du formulaire figurant dans l'offre de prêt qui est remise à l'Emprunteur.

Strat Eco n'est ni prêteur, ni intermédiaire en opérations de banque et services de paiement au sens de l'article L. 519-1 du Code monétaire et financier. Strat Eco ne peut en conséquence recevoir ni traiter une demande de rétractation portant sur le prêt. Toute demande en ce sens adressée à Strat Eco sera sans effet sur les délais légaux, qui ne courent qu'à l'égard de l'établissement prêteur.

### 9.3 Information de l'Utilisateur

Strat Eco informe l'Utilisateur qu'il lui appartient de prendre connaissance des délais de rétractation figurant dans l'offre de prêt et de les respecter. Sur simple demande adressée à contact@strateco.fr, Strat Eco pourra l'orienter vers l'interlocuteur compétent au sein de l'établissement prêteur.

### 9.4 Renonciation à l'adhésion

Indépendamment du droit de rétractation attaché au prêt, l'Utilisateur peut à tout moment, tant qu'aucune offre de prêt n'a été acceptée, informer Strat Eco de sa décision de ne pas donner suite à son adhésion, par simple message adressé à contact@strateco.fr. Les Pièces justificatives déposées sont alors supprimées dans les conditions prévues à l'article 7.4.

## ARTICLE 10 - PROPRIÉTÉ INTELLECTUELLE

Le logiciel Strat Eco Pro, son architecture, ses interfaces et ses contenus sont la propriété exclusive de Strat Eco. L'accès au Service ne confère aucun droit de propriété intellectuelle au Signataire.

## ARTICLE 11 - MODIFICATION DES CGU

Strat Eco se réserve le droit de modifier les présentes CGU. La version applicable est celle en vigueur à la date d'acceptation par le Signataire. Cette version est conservée et jointe au Certificat de preuve, garantissant que chaque Signataire puisse justifier des conditions qu'il a effectivement acceptées.

## ARTICLE 12 - RÉCLAMATIONS ET RÉSOLUTION AMIABLE

### 12.1 Réclamations

Toute réclamation relative à l'utilisation du Service peut être adressée à contact@strateco.fr ou par courrier à Strat Eco, 27 rue du Vieux Marché aux Vins, 67000 Strasbourg.

Strat Eco s'engage à accuser réception de toute réclamation dans un délai de **quinze (15) jours ouvrés** et à y apporter une réponse motivée dans un délai raisonnable.

### 12.2 Absence de relation contractuelle onéreuse avec l'Utilisateur

Le Service est mis à la disposition de l'Utilisateur à titre gratuit, dans le cadre de la mission d'assistance à maîtrise d'ouvrage confiée à Strat Eco par le syndicat des copropriétaires. Strat Eco ne facture aucune prestation directement à l'Utilisateur au titre de l'utilisation du Service.

### 12.3 Résolution amiable

Les parties s'efforceront de résoudre à l'amiable tout différend relatif à l'interprétation ou à l'exécution des présentes CGU avant toute action contentieuse.

### 12.4 Litiges relatifs au prêt

Les réclamations portant sur l'offre de prêt, ses conditions ou son exécution relèvent de la compétence exclusive de l'établissement bancaire prêteur. Celui-ci met à disposition de ses clients son propre dispositif de réclamation et, le cas échéant, son médiateur, dont les coordonnées figurent dans l'offre de prêt.

## ARTICLE 13 - DROIT APPLICABLE ET JURIDICTION

Les présentes CGU sont soumises au droit français.

En cas de litige, et à défaut de résolution amiable, compétence est attribuée aux tribunaux français compétents. Lorsque le Signataire agit en qualité de consommateur, il conserve le droit de saisir la juridiction du lieu de son domicile conformément aux dispositions du Code de procédure civile.

**Version 1.6**
`;

// Questions fréquentes du portail copropriétaire : les réponses aux questions
// que posent les copropriétaires sur les prêts collectifs (avance de
// subvention, éco-PTZ, prêt complémentaire), regroupées par thème, avec
// recherche plein texte et questions dépliables.
import { useMemo, useState } from "react";
import { Icon } from "@/components/Icon";

type QA = { q: string; a: string };
type Groupe = { titre: string; icon: string; items: QA[] };

const GROUPES: Groupe[] = [
  {
    titre: "Prêts collectifs : suis-je engagé pour les autres ?",
    icon: "users",
    items: [
      {
        q: "Que se passe-t-il si un copropriétaire ne rembourse pas son emprunt ?",
        a: "C'est l'organisme de caution du prêt qui prend le relais : il régularise la situation et mène les démarches nécessaires auprès du copropriétaire concerné. Ni le syndic ni les autres copropriétaires n'ont à s'en occuper.",
      },
      {
        q: "L'impayé d'un autre copropriétaire peut-il me pénaliser ?",
        a: "Non. Ces prêts collectifs sont dits « sans solidarité » : chacun ne répond que de sa propre quote-part. Si un voisin est défaillant, vous n'êtes en rien responsable - la caution gère la régularisation à votre place.",
      },
    ],
  },
  {
    titre: "Le prêt « Avance de subvention »",
    icon: "euro",
    items: [
      {
        q: "Le prêt « Avance de subvention » a été voté : suis-je obligé d'y souscrire ?",
        a: "Oui. Dès qu'il est voté en assemblée générale à la majorité requise, il s'applique automatiquement à l'ensemble de la copropriété. Il sert à avancer les subventions en attendant leur versement : il est remboursé de lui-même quand les aides sont perçues, à la fin des travaux.",
      },
    ],
  },
  {
    titre: "Adhérer à l'éco-PTZ et au prêt complémentaire",
    icon: "fileCheck",
    items: [
      {
        q: "L'éco-PTZ et le prêt complémentaire ont été votés : suis-je obligé d'y adhérer ?",
        a: "Non. Le vote en AG ouvre simplement la possibilité d'y souscrire : l'adhésion reste individuelle et volontaire. Vous êtes libre d'adhérer à l'un, à l'autre, aux deux - ou de régler votre quote-part sur fonds propres.",
      },
      {
        q: "Comment adhérer à ces prêts ?",
        a: "Directement depuis cet espace, dans l'onglet « Mon financement » : vous indiquez votre choix, puis vos bulletins d'adhésion arrivent pré-remplis, à signer en ligne. Vous pouvez aussi vous rapprocher de votre AMO ou de votre syndic si vous préférez un dossier papier.",
      },
      {
        q: "Puis-je adhérer uniquement à l'éco-PTZ, sans le prêt complémentaire ?",
        a: "Oui, les deux adhésions sont indépendantes : vous pouvez souscrire l'un sans l'autre. Il suffit de ne renvoyer que le bulletin du prêt qui vous intéresse.",
      },
      {
        q: "Quelle est la durée de ces prêts ?",
        a: "La durée de l'éco-PTZ est unique pour toute la copropriété : elle est votée en AG et rappelée dans votre plan de financement. Pour le prêt complémentaire, c'est vous qui choisissez la durée de remboursement (de 3 à 20 ans).",
      },
      {
        q: "Combien coûtent ces prêts ?",
        a: "Les conditions exactes figurent dans les contrats de prêt annexés à la convocation d'AG. Les chiffres présentés dans votre plan de financement sont des simulations établies d'après les informations de la banque : elles donnent un bon ordre de grandeur, mais seule la banque peut arrêter les montants définitifs.",
      },
    ],
  },
  {
    titre: "La vie du prêt : vente, succession, remboursement",
    icon: "calendar",
    items: [
      {
        q: "Que se passe-t-il si je vends mon appartement ?",
        a: "Le syndic signale au notaire l'existence d'un prêt collectif rattaché au lot vendu : il apparaît dans l'état daté. Le prêt est alors soldé au moment de la vente, généralement sur le prix de cession.",
      },
      {
        q: "Que se passe-t-il en cas de décès ?",
        a: "Le prêt est soldé dans le cadre de la succession, comme les autres engagements du défunt.",
      },
      {
        q: "Puis-je rembourser mon prêt par anticipation ?",
        a: "Oui, à condition de rembourser en une seule fois la totalité du capital restant dû - les remboursements anticipés partiels ne sont pas possibles.",
      },
    ],
  },
  {
    titre: "Éligibilité et situations particulières",
    icon: "clipboard",
    items: [
      {
        q: "La banque va-t-elle examiner ma situation financière (autres crédits, revenus…) ?",
        a: "Ces prêts sont sans condition de ressources et vous n'avez pas à déclarer vos autres emprunts. La banque vérifie seulement que vous êtes à jour de vos charges courantes et que vous n'êtes pas interdit bancaire.",
      },
      {
        q: "Je suis une personne âgée : la banque peut-elle me refuser ?",
        a: "Non, il n'existe aucune limite d'âge - c'est l'un des grands avantages de ces prêts. L'âge n'entre pas dans les critères de la banque.",
      },
      {
        q: "J'ai plusieurs logements dans l'immeuble : comment ça se passe ?",
        a: "Vous pouvez obtenir un éco-PTZ par logement, chacun pouvant atteindre 50 000 €. Il faut alors remplir un bulletin d'adhésion distinct pour chaque lot d'habitation.",
      },
      {
        q: "Puis-je financer aussi des travaux privatifs (mes fenêtres, par exemple) avec l'éco-PTZ ?",
        a: "Oui, c'est possible sous conditions : les travaux privatifs éligibles peuvent être intégrés à votre éco-PTZ. Parlez-en à votre AMO, qui vérifiera votre situation.",
      },
      {
        q: "Mon lot appartient à une SCI : puis-je obtenir l'éco-PTZ ?",
        a: "Oui, à trois conditions : le lot est un logement occupé en résidence principale, la SCI n'est pas soumise à l'impôt sur les sociétés, et au moins un des associés est une personne physique.",
      },
      {
        q: "Je compte louer mon logement en meublé touristique (Airbnb) : suis-je éligible ?",
        a: "Non. L'éco-PTZ est réservé aux logements occupés en résidence principale - ou destinés à le devenir dans les six mois qui suivent la déclaration de fin des travaux.",
      },
      {
        q: "Mon lot est un local professionnel ou commercial : quelles solutions ?",
        a: "Un lot destiné à une activité professionnelle ou commerciale n'est pas éligible à l'éco-PTZ. Si les associés n'exploitent pas eux-mêmes le local, un prêt complémentaire peut être envisagé ; sinon, la quote-part se finance sur fonds propres ou par un prêt personnel.",
      },
    ],
  },
];

/** Comparaison de recherche : minuscules, sans accents. */
const normaliser = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export function Faq() {
  const [recherche, setRecherche] = useState("");
  const [ouvertes, setOuvertes] = useState<Set<string>>(new Set());

  const q = normaliser(recherche.trim());
  const groupes = useMemo(
    () =>
      q
        ? GROUPES.map((g) => ({
            ...g,
            items: g.items.filter((it) => normaliser(it.q + " " + it.a).includes(q)),
          })).filter((g) => g.items.length > 0)
        : GROUPES,
    [q]
  );
  const nb = groupes.reduce((s, g) => s + g.items.length, 0);

  const toggle = (id: string) =>
    setOuvertes((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className="fade">
      <div style={{ display: "flex", alignItems: "flex-start", gap: 18, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <h1 className="sec-title">Questions fréquentes</h1>
          <p className="sec-sub">
            Les réponses aux questions que se posent les copropriétaires sur le financement des
            travaux : prêts collectifs, éco-PTZ, avance de subvention, cas particuliers.
          </p>
        </div>
        <div className="search" style={{ margin: 0 }}>
          <Icon name="search" size={16} />
          <input
            placeholder="Rechercher une question…"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
          />
          {recherche && (
            <button
              className="icon-btn"
              style={{ width: 22, height: 22, flex: "none" }}
              title="Effacer la recherche"
              onClick={() => setRecherche("")}
            >
              <Icon name="x" size={13} />
            </button>
          )}
        </div>
      </div>

      {q && (
        <p className="se-small" style={{ color: "var(--fg-muted)", margin: "2px 0 14px" }}>
          {nb === 0
            ? "Aucune question ne correspond à cette recherche."
            : `${nb} question${nb > 1 ? "s" : ""} trouvée${nb > 1 ? "s" : ""}`}
        </p>
      )}

      {groupes.map((g) => (
        <section key={g.titre} className="faq-group">
          <h2 className="faq-group-title">
            <Icon name={g.icon as never} size={17} />
            {g.titre}
          </h2>
          {g.items.map((it) => {
            const open = q ? true : ouvertes.has(it.q);
            return (
              <div key={it.q} className={"faq-item" + (open ? " open" : "")}>
                <button className="faq-q" onClick={() => toggle(it.q)} aria-expanded={open}>
                  <Icon
                    name={open ? "chevronDown" : "chevronRight"}
                    size={15}
                    style={{ color: "var(--accent)", flex: "none" }}
                  />
                  {it.q}
                </button>
                {open && <div className="faq-a">{it.a}</div>}
              </div>
            );
          })}
        </section>
      ))}

      <div className="cc-next" style={{ marginTop: 8 }}>
        <Icon name="help" size={15} className="ico" />
        <span>
          Vous ne trouvez pas votre réponse ? Contactez votre AMO Strat Eco ou votre syndic : ils
          connaissent votre dossier et pourront vous répondre précisément.
        </span>
      </div>
    </div>
  );
}

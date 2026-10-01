// Briques visuelles des honoraires AMO par jalon (0111), partagées par la page
// Facturation et le bloc « Honoraires AMO » de l'onglet Projet : couleurs des
// états, légende, jauge encaissé / en attente / reste à facturer, frise des 8
// jalons en pastilles.
import { fmtEuro } from "@/lib/format";
import {
  GROUPES_JALONS,
  LIBELLE_ETAT,
  cocheSansMontant,
  libelleJalon,
  pourcent,
  type DossierHonoraires,
  type EtatJalon,
  type JalonHonoraires,
  type SommesHonoraires,
} from "@/lib/facturation";

export const COULEUR_ETAT: Record<EtatJalon, string> = {
  encaisse: "var(--color-primary-600)",
  facture: "var(--color-warning-500)",
  a_facturer: "var(--color-neutral-300)",
};

/** AAAA-MM-JJ → JJ/MM/AAAA */
export const dateCourte = (s: string | null) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : "-");

export function LegendeFacturation() {
  return (
    <div className="fact-legende">
      <span><i className="fact-sw" style={{ background: COULEUR_ETAT.encaisse }}></i>Encaissé</span>
      <span><i className="fact-sw brouillon"></i>Brouillon à valider</span>
      <span><i className="fact-sw" style={{ background: COULEUR_ETAT.facture }}></i>Facturé, en attente de paiement</span>
      <span><i className="fact-sw" style={{ background: COULEUR_ETAT.a_facturer }}></i>Reste à facturer</span>
      <span><i className="fact-sw vide"></i>Pas de montant prévu</span>
    </div>
  );
}

/** Barre empilée encaissé / en attente / reste à facturer, largeur proportionnelle au contrat. */
export function JaugeHonoraires({ s, hauteur = 22 }: { s: SommesHonoraires; hauteur?: number }) {
  const parts: [EtatJalon, number][] = [
    ["encaisse", s.encaisse],
    ["facture", s.enAttente],
    ["a_facturer", s.resteAFacturer],
  ];
  return (
    <div
      className="fact-jauge"
      style={{ height: hauteur }}
      role="img"
      aria-label={`Encaissé ${pourcent(s.encaisse, s.contrat)} %, en attente ${pourcent(s.enAttente, s.contrat)} %, reste à facturer ${pourcent(s.resteAFacturer, s.contrat)} %`}
    >
      {s.contrat > 0 &&
        parts.map(([e, v]) =>
          v > 0 ? (
            <span key={e} style={{ width: `${(v / s.contrat) * 100}%`, background: COULEUR_ETAT[e] }} title={`${LIBELLE_ETAT[e]} : ${fmtEuro(v)}`}></span>
          ) : null
        )}
    </div>
  );
}

// Facturation directe (0115) : la pastille devient un bouton quand la frise
// reçoit onJalon (bulle grise = facturer, contour orange = brouillon à
// valider, orange = paiement pour le dirigeant, facture pour les autres).
const ACTION_ETAT: Record<EtatJalon, string> = {
  a_facturer: "cliquez pour facturer",
  facture: "cliquez pour la facture ou le paiement",
  encaisse: "cliquez pour la facture",
};

function Pastille({
  j,
  copro,
  brouillon,
  onClick,
}: {
  j: JalonHonoraires;
  copro: string;
  brouillon?: boolean;
  onClick?: (j: JalonHonoraires) => void;
}) {
  const sansMontant = j.montant == null || j.montant <= 0;
  const detail = sansMontant
    ? cocheSansMontant(j)
      ? "coché dans Notion, sans montant"
      : "pas de montant prévu"
    : `${fmtEuro(j.montant)} HT - ${brouillon ? "brouillon de facture à valider" : LIBELLE_ETAT[j.etat]}`;
  const cls = "fact-pas " + (sansMontant ? "vide" : j.etat) + (brouillon && !sansMontant ? " brouillon" : "");
  const titre = `${copro} - ${libelleJalon(j.code)} : ${detail}`;
  if (onClick && !sansMontant) {
    return (
      <button
        type="button"
        className={cls + " cliquable"}
        title={`${titre} (${brouillon ? "cliquez pour le brouillon" : ACTION_ETAT[j.etat]})`}
        aria-label={titre}
        onClick={(e) => {
          e.stopPropagation();
          onClick(j);
        }}
      ></button>
    );
  }
  return <span className={cls} title={titre}></span>;
}

/** Les 8 jalons d'un dossier en pastilles colorées, groupées Études / Travaux / CEE. */
export function FriseJalons({
  d,
  copro,
  brouillons,
  onJalon,
}: {
  d: DossierHonoraires;
  copro: string;
  /** Jalons qui ont un brouillon de facture en attente de validation. */
  brouillons?: Set<string>;
  onJalon?: (j: JalonHonoraires) => void;
}) {
  return (
    <span className="fact-frise">
      {GROUPES_JALONS.map((g) => (
        <span key={g.id} className="g">
          {g.codes.map((c) => {
            const j = d.jalons.find((x) => x.code === c)!;
            return <Pastille key={c} j={j} copro={copro} brouillon={brouillons?.has(c)} onClick={onJalon} />;
          })}
        </span>
      ))}
    </span>
  );
}

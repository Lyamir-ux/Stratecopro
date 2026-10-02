// Enquête sociale & technique côté portail : le questionnaire configuré par
// l'AMO (catalogue + on/off) est rendu dynamiquement - questions « vous »
// (copropriétaire) puis une section par lot d'habitation. Les conditions
// d'affichage s'appliquent en direct pendant la saisie. Les réponses vivent dans
// enquete_reponses.reponses (jsonb) ; foyer / occupation / RFR alimentent
// aussi les colonnes historiques pour le calcul du profil MaPrimeRénov'.
//
// Lots secondaires (garage, cave, commerce…) : aucune question n'est posée
// (feedback Amir 22/09/2026) - le parcours ne porte que sur les logements, et le
// rattachement d'un lot annexe à un lot d'habitation se fait sur « Mes
// quotes-parts ». L'avis d'imposition, seule pièce encore attendue, se dépose
// ici même, sous les plafonds de l'Anah (l'onglet « Mes documents » a disparu).
//
// Retours du 30/09/2026 : la saisie en cours est recopiée dans l'onglet du
// navigateur (sessionStorage) jusqu'à son enregistrement, et restaurée si la
// page se recharge ; la transmission se confirme par une fenêtre et le bouton
// passe à « Questionnaire transmis » ; les boutons d'enregistrement sont repris
// en bas de page, avec un bouton pour remonter en haut.
//
// Retours de Marius MAZZANTE (30/09/2026) : les pièces justificatives à déposer
// suivent les réponses (src/lib/piecesSituation.ts), et une question
// « facultative » (RFR N-2) ne bloque plus la transmission.
import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { Modal } from "@/components/Modal";
import { Badge } from "@/components/ui";
import { fmtDate, fmtEuro } from "@/lib/format";
import { PROFILS_MPR } from "@/lib/referentiels";
import { determineProfil } from "@/lib/finance";
import {
  SECTIONS,
  normalizeConfig,
  resolveQuestions,
  type ResolvedQuestion,
  type SectionId,
} from "@/lib/enqueteCatalogue";
import {
  useEnquetePortail,
  useMaReponse,
  useMesPieces,
  useSaveMaReponse,
  notifierEnqueteTransmise,
  type Membership,
  type PortalLot,
} from "@/api/portail";
import { useAuth } from "@/auth/AuthProvider";
import { PiecesJustificatives } from "./Documents";
import { piecesAttendues } from "@/lib/piecesSituation";
import type { Bareme, Profil } from "@/lib/finance";
import type { Json } from "@/lib/database.types";

type Val = string | number | string[];
type Answers = Record<string, Val | undefined>;
interface ReponsesJson {
  copro: Answers;
  lots: Record<string, Answers>;
  /** true quand toutes les questions posées avaient une réponse au moment de l'enregistrement */
  complet?: boolean;
  /** date de transmission (questionnaire complet) */
  transmisLe?: string;
}

/** Préfixe des copies de secours de l'enquête - effacées à la déconnexion. */
export const PREFIXE_SECOURS_ENQUETE = "se-enquete:";

interface CopieSecours {
  rep: ReponsesJson;
  /** moment de la dernière frappe, comparé à la date d'enregistrement en base */
  le: string;
}

function lireSecours(cle: string): CopieSecours | null {
  try {
    const brut = sessionStorage.getItem(cle);
    return brut ? (JSON.parse(brut) as CopieSecours) : null;
  } catch {
    return null;
  }
}

function ecrireSecours(cle: string, copie: CopieSecours | null) {
  try {
    if (copie) sessionStorage.setItem(cle, JSON.stringify(copie));
    else sessionStorage.removeItem(cle);
  } catch {
    // stockage indisponible (navigation privée, quota) : la saisie reste en mémoire
  }
}

const fmtDateHeure = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString("fr-FR")} à ${d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
};

/** Bouton flottant « Haut de page », affiché une fois la page bien descendue. */
function RemonterEnHaut() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 700);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  if (!visible) return null;
  return (
    <button
      type="button"
      className="eq-haut"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      title="Remonter en haut de la page"
    >
      <Icon name="chevronUp" size={18} />
      Haut de page
    </button>
  );
}

/** usage importé par l'AMO (lots.usage) → option du QCM « Usage du lot » */
const USAGE_LABEL: Record<string, string> = {
  commerces: "Commerce",
  bureaux: "Autre",
  habitation: "Habitation",
  garage: "Garage",
  caves: "Cave",
  autres: "Autre",
};

const SECTIONS_COPRO: SectionId[] = ["identite", "situation", "avis"];
const SECTIONS_LOT: SectionId[] = ["lot", "technique", "confort"];
const SECTION_LABEL = Object.fromEntries(SECTIONS.map((s) => [s.id, s.label])) as Record<SectionId, string>;

/** options « Aucun… » / « Non, … » exclusives dans les choix multiples */
const EXCLUSIVE = /^(aucun|non,)/i;

function toggleMulti(cur: string[], opt: string): string[] {
  if (cur.includes(opt)) return cur.filter((x) => x !== opt);
  if (EXCLUSIVE.test(opt)) return [opt];
  return [...cur.filter((x) => !EXCLUSIVE.test(x)), opt];
}

/** Durée indicative de saisie : ~20 s par question, arrondie aux 5 minutes, 5 minutes minimum. */
function dureeEstimee(nbQuestions: number): number {
  return Math.max(5, Math.ceil((nbQuestions / 3) / 5) * 5);
}

function answered(v: Val | undefined): boolean {
  if (v === undefined || v === "") return false;
  return !(Array.isArray(v) && v.length === 0);
}

/** La question est-elle posée, compte tenu des réponses déjà données ? */
function isVisible(q: ResolvedQuestion, get: (qid: string) => Val | undefined): boolean {
  if (!q.on) return false;
  return (q.cond ?? []).every((c) => {
    const v = get(c.qid);
    if (typeof v === "string" && v !== "") return c.vals.includes(v);
    // réponse numérique (ex. RFR = 0 → justification demandée)
    if (typeof v === "number") return c.vals.includes(String(v));
    if (Array.isArray(v) && v.length > 0) return v.some((x) => c.vals.includes(x));
    // question de référence pas encore répondue
    return c.defaut === true;
  });
}

function Champ({
  q,
  value,
  onChange,
  lotsPrincipaux,
}: {
  q: ResolvedQuestion;
  value: Val | undefined;
  onChange: (v: Val | undefined) => void;
  lotsPrincipaux?: { id: string; label: string }[];
}) {
  switch (q.type) {
    case "nombre":
    case "montant":
      return (
        <div className="eq-num">
          <input
            type="number"
            min={0}
            className="eq-inp"
            style={{ width: 130 }}
            value={typeof value === "number" ? value : ""}
            placeholder="-"
            onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
          />
          {q.type === "montant" && <span className="eq-unit">€ / an</span>}
        </div>
      );
    case "texte":
    case "tel":
    case "email":
    case "adresse":
      return (
        <input
          type={q.type === "tel" ? "tel" : q.type === "email" ? "email" : "text"}
          className="eq-inp"
          value={typeof value === "string" ? value : ""}
          placeholder={q.type === "adresse" ? "N°, rue, code postal, ville" : "Votre réponse…"}
          onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)}
        />
      );
    case "lotParent":
      return (
        <select
          className="eq-inp"
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value || undefined)}
        >
          <option value="">- Choisir un lot principal -</option>
          {(lotsPrincipaux ?? []).map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </select>
      );
    case "choix":
      return (
        <div className="eq-opts">
          {(q.options ?? []).map((o) => (
            <label key={o} className={"eq-opt" + (value === o ? " on" : "")}>
              <input
                type="radio"
                checked={value === o}
                onChange={() => onChange(o)}
              />
              {o}
            </label>
          ))}
        </div>
      );
    case "multi": {
      const cur = Array.isArray(value) ? value : [];
      return (
        <div className="eq-opts">
          {(q.options ?? []).map((o) => (
            <label key={o} className={"eq-opt" + (cur.includes(o) ? " on" : "")}>
              <input
                type="checkbox"
                checked={cur.includes(o)}
                onChange={() => {
                  const next = toggleMulti(cur, o);
                  onChange(next.length ? next : undefined);
                }}
              />
              {o}
            </label>
          ))}
        </div>
      );
    }
  }
}

function QuestionBloc({
  q,
  answers,
  onSet,
  lotsPrincipaux,
  erreur,
  anchor,
}: {
  q: ResolvedQuestion;
  answers: Answers;
  onSet: (qid: string, v: Val | undefined) => void;
  lotsPrincipaux?: { id: string; label: string }[];
  /** message d'erreur de validation (question obligatoire sans réponse, incohérence) */
  erreur?: string;
  /** id DOM pour le défilement vers la première erreur */
  anchor?: string;
}) {
  const value = answers[q.id];
  const needsPrecision =
    (q.precision ?? []).length > 0 &&
    ((typeof value === "string" && q.precision!.includes(value)) ||
      (Array.isArray(value) && value.some((v) => q.precision!.includes(v))));
  return (
    <div className={"eq-q" + (erreur ? " eq-q-erreur" : "")} id={anchor}>
      <label className="eq-label">
        {q.q}
        {q.facultatif ? (
          <span className="eq-facultatif">(facultatif)</span>
        ) : (
          <span className="eq-req" title="Réponse obligatoire">*</span>
        )}
        {q.aide && (
          <span className="qc-help" title={q.aide}>
            <Icon name="help" size={13} />
          </span>
        )}
      </label>
      <Champ q={q} value={value} onChange={(v) => onSet(q.id, v)} lotsPrincipaux={lotsPrincipaux} />
      {needsPrecision && (
        <input
          className="eq-inp"
          style={{ marginTop: 8 }}
          value={typeof answers[q.id + "__p"] === "string" ? (answers[q.id + "__p"] as string) : ""}
          placeholder="Précisez…"
          onChange={(e) => onSet(q.id + "__p", e.target.value === "" ? undefined : e.target.value)}
        />
      )}
      {erreur && (
        <p className="eq-erreur" role="alert">
          <Icon name="alert" size={13} />
          {erreur}
        </p>
      )}
    </div>
  );
}

export function Enquete({ membership, bareme }: { membership: Membership; bareme: Bareme | null }) {
  const { data: enquete, isLoading } = useEnquetePortail(membership.copro.id);
  const { data: reponse, isFetched } = useMaReponse(enquete?.id, membership.coproprietaireId);
  const save = useSaveMaReponse(enquete?.id ?? "", membership.coproprietaireId);
  // Aperçu AMO : la transmission n'envoie pas d'e-mail au copropriétaire
  const { profile } = useAuth();
  const apercuAmo = profile?.role === "amo";

  const questions = useMemo(
    () => (enquete ? resolveQuestions(normalizeConfig(enquete.questions)) : []),
    [enquete]
  );

  const [rep, setRep] = useState<ReponsesJson | null>(null);
  const [profilSauve, setProfilSauve] = useState<Profil | null>(null);
  const [saved, setSaved] = useState<"brouillon" | "transmis" | null>(null);
  // Validation à la transmission : erreurs par question (clé « copro:<qid> » ou
  // « lot:<lotId>:<qid> ») + attestation d'exactitude obligatoire.
  const [erreurs, setErreurs] = useState<Record<string, string>>({});
  const [atteste, setAtteste] = useState(false);
  const [erreurAttestation, setErreurAttestation] = useState(false);
  // Réponses modifiées depuis le dernier enregistrement (copie de secours active).
  const [modifie, setModifie] = useState(false);
  // Des réponses non enregistrées ont été retrouvées à l'ouverture.
  const [restaure, setRestaure] = useState(false);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const { data: pieces } = useMesPieces(membership.coproprietaireId);

  const cleSecours = enquete ? `${PREFIXE_SECOURS_ENQUETE}${enquete.id}:${membership.coproprietaireId}` : null;

  // Initialisation : réponses enregistrées par-dessus les défauts (nom, usage des lots),
  // ou la copie de secours si elle est plus récente que l'enregistrement en base.
  useEffect(() => {
    if (!enquete || !isFetched || rep || !cleSecours) return;
    const stored = (reponse?.reponses ?? null) as ReponsesJson | null;
    const lots: Record<string, Answers> = {};
    for (const l of membership.lots) {
      lots[l.id] = { "usage-lot": USAGE_LABEL[l.usage] ?? "Autre", ...(stored?.lots?.[l.id] ?? {}) };
    }
    const secours = lireSecours(cleSecours);
    if (secours && (!reponse || Date.parse(secours.le) > Date.parse(reponse.updated_at))) {
      setRep({ copro: secours.rep.copro ?? {}, lots: { ...lots, ...(secours.rep.lots ?? {}) } });
      setModifie(true);
      setRestaure(true);
    } else {
      if (secours) ecrireSecours(cleSecours, null);
      setRep({ copro: { nom: membership.nom, ...(stored?.copro ?? {}) }, lots });
    }
    setProfilSauve((reponse?.profil_mpr as Profil | null) ?? null);
  }, [enquete, isFetched, rep, reponse, membership, cleSecours]);

  // Copie de secours à chaque modification, jusqu'à l'enregistrement.
  useEffect(() => {
    if (!cleSecours || !rep || !modifie) return;
    ecrireSecours(cleSecours, { rep, le: new Date().toISOString() });
  }, [cleSecours, rep, modifie]);

  // Fermer l'onglet avec des réponses non enregistrées : le navigateur demande confirmation.
  useEffect(() => {
    if (!modifie) return;
    const avertir = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", avertir);
    return () => window.removeEventListener("beforeunload", avertir);
  }, [modifie]);

  const effacerErreur = (k: string) =>
    setErreurs((e) => (e[k] ? Object.fromEntries(Object.entries(e).filter(([x]) => x !== k)) : e));
  const setCopro = (qid: string, v: Val | undefined) => {
    setSaved(null);
    setModifie(true);
    effacerErreur("copro:" + qid);
    setRep((r) => (r ? { ...r, copro: { ...r.copro, [qid]: v } } : r));
  };
  const setLot = (lotId: string) => (qid: string, v: Val | undefined) => {
    setSaved(null);
    setModifie(true);
    effacerErreur(`lot:${lotId}:${qid}`);
    setRep((r) => (r ? { ...r, lots: { ...r.lots, [lotId]: { ...r.lots[lotId], [qid]: v } } } : r));
  };

  // Dernière transmission enregistrée en base ; « déjà transmis » tant que rien n'a bougé depuis.
  const repBase = (reponse?.reponses ?? null) as ReponsesJson | null;
  const transmisLe = repBase?.complet ? (repBase.transmisLe ?? reponse?.updated_at ?? null) : null;
  const dejaTransmis = !!transmisLe && !modifie;

  const coproQs = questions.filter((q) => !q.custom && SECTIONS_COPRO.includes(q.section));
  const customQs = questions.filter((q) => q.custom && q.on);
  const lotQs = questions.filter((q) => !q.custom && SECTIONS_LOT.includes(q.section));

  const getCopro = (qid: string) => rep?.copro[qid];
  const getLot = (lot: PortalLot) => (qid: string) => rep?.lots[lot.id]?.[qid] ?? rep?.copro[qid];

  // Seuls les logements sont enquêtés : sur un garage, une cave ou un commerce,
  // les questions d'occupation, de menuiseries ou de chauffage n'ont pas de sens
  // et alourdissaient le parcours (feedback Amir 22/09/2026). Les réponses déjà
  // enregistrées sur ces lots sont conservées telles quelles à l'enregistrement.
  const lotsEnquetes = membership.lots.filter((l) => l.usage === "habitation");
  const lotsSecondaires = membership.lots.length - lotsEnquetes.length;

  const visiblesCopro = rep ? coproQs.filter((q) => isVisible(q, getCopro)) : [];
  const visiblesParLot = rep
    ? lotsEnquetes.map((lot) => ({ lot, qs: lotQs.filter((q) => isVisible(q, getLot(lot))) }))
    : [];

  const allVisible = [
    ...visiblesCopro.map((q) => ({ q, a: rep?.copro })),
    ...customQs.map((q) => ({ q, a: rep?.copro })),
    ...visiblesParLot.flatMap(({ lot, qs }) => qs.map((q) => ({ q, a: rep?.lots[lot.id] }))),
  ];
  // les questions facultatives ne comptent ni dans la progression ni dans « complet »
  const obligatoires = allVisible.filter(({ q }) => !q.facultatif);
  const nbRepondu = obligatoires.filter(({ q, a }) => answered(a?.[q.id])).length;
  const complet = obligatoires.length > 0 && nbRepondu === obligatoires.length;

  // Profil d'aides : calculé en direct dès que ménage + RFR sont répondus,
  // sinon dernier profil enregistré (saisie AMO ou visite précédente).
  const nbFoyer = rep?.copro["nb-personnes-foyer"];
  const rfrFoyer = rep?.copro["rfr-foyer"];
  const profil: Profil | null =
    typeof nbFoyer === "number" && typeof rfrFoyer === "number" && bareme
      ? determineProfil(nbFoyer, rfrFoyer, bareme)
      : profilSauve;

  /** lots pouvant servir de lot parent (usage principal répondu) */
  const lotsPrincipaux = (exceptId: string) =>
    membership.lots
      .filter((l) => l.id !== exceptId)
      .filter((l) => {
        const u = rep?.lots[l.id]?.["usage-lot"];
        return u === "Habitation" || u === "Commerce";
      })
      .map((l) => ({ id: l.id, label: `Lot ${l.num}${l.batiment ? ` - bât. ${l.batiment}` : ""}` }));

  const anchorId = (k: string) => "eq-" + k.replace(/[^a-zA-Z0-9-]/g, "_");

  /**
   * Contrôle avant transmission : toutes les questions posées doivent avoir une
   * réponse (feedback Théa 03/09/2026 - la soumission n'est plus acceptée avec
   * des cases obligatoires vides) + cohérence ménage / personnes à charge.
   * Retourne les erreurs par question ; vide = questionnaire transmissible.
   */
  const controler = (): Record<string, string> => {
    if (!rep) return {};
    const errs: Record<string, string> = {};
    const lib = (q: ResolvedQuestion) => (q.tag || "cette question").toLowerCase();
    for (const q of visiblesCopro) {
      if (!q.facultatif && !answered(rep.copro[q.id])) errs["copro:" + q.id] = `Réponse obligatoire : ${lib(q)}.`;
    }
    for (const q of customQs) {
      if (!answered(rep.copro[q.id])) errs["copro:" + q.id] = "Réponse obligatoire (question de votre AMO).";
    }
    for (const { lot, qs } of visiblesParLot) {
      for (const q of qs) {
        if (!q.facultatif && !answered(rep.lots[lot.id]?.[q.id])) errs[`lot:${lot.id}:${q.id}`] = `Réponse obligatoire pour le lot ${lot.num} : ${lib(q)}.`;
      }
    }
    const nb = rep.copro["nb-personnes-foyer"];
    const charge = rep.copro["nb-personnes-charge"];
    if (typeof nb === "number" && nb < 1 && visiblesCopro.some((q) => q.id === "nb-personnes-foyer")) {
      errs["copro:nb-personnes-foyer"] = "Le ménage compte au moins une personne.";
    }
    if (typeof nb === "number" && typeof charge === "number" && nb > 0 && charge >= nb) {
      errs["copro:nb-personnes-charge"] =
        `Les personnes à charge (${charge}) sont comprises dans le ménage (${nb} personne${nb > 1 ? "s" : ""}) : ce nombre doit être inférieur.`;
    }
    return errs;
  };

  const doSave = (mode: "brouillon" | "transmis") => {
    if (!rep || !enquete) return;
    if (mode === "transmis") {
      const errs = controler();
      setErreurs(errs);
      setErreurAttestation(!atteste);
      const premiere = Object.keys(errs)[0];
      if (premiere) {
        document.getElementById(anchorId(premiere))?.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
      if (!atteste) return;
    } else {
      setErreurs({});
      setErreurAttestation(false);
    }
    // colonnes historiques : foyer / occupation / RFR (vue AMO + profil MPR)
    let statutOccupation: string | null = null;
    for (const l of membership.lots) {
      const occ = rep.lots[l.id]?.["type-occupation"];
      if (occ === "Propriétaire occupant") statutOccupation = "occupant";
      else if (occ === "Propriétaire bailleur (logement loué)" && statutOccupation == null) statutOccupation = "bailleur";
    }
    let nbPersonnes = typeof rep.copro["nb-personnes-foyer"] === "number" ? rep.copro["nb-personnes-foyer"] : null;
    if (nbPersonnes == null) {
      const nb = membership.lots
        .map((l) => rep.lots[l.id]?.["nb-habitants"])
        .find((v) => typeof v === "number");
      if (typeof nb === "number") nbPersonnes = nb;
    }
    const rfr = typeof rep.copro["rfr-foyer"] === "number" ? rep.copro["rfr-foyer"] : null;
    const rfrN2 = typeof rep.copro["rfr-n2"] === "number" ? rep.copro["rfr-n2"] : null;
    // « complet » = questionnaire transmis avec toutes ses réponses ; un
    // brouillon, même sans question restante, n'est pas transmis.
    const transmis = mode === "transmis" && complet;
    save.mutate(
      {
        reponses: {
          ...rep,
          complet: transmis,
          ...(transmis ? { transmisLe: new Date().toISOString(), attestation: true } : {}),
        } as unknown as Json,
        nbPersonnes,
        statutOccupation,
        rfr,
        rfrN2,
        bareme,
      },
      {
        onSuccess: (p) => {
          if (p) setProfilSauve(p);
          setSaved(mode);
          setModifie(false);
          setRestaure(false);
          if (cleSecours) ecrireSecours(cleSecours, null);
          if (transmis) {
            setConfirmation(new Date().toISOString());
            // E-mail « enquête prise en compte » (remarque d'Amir du 02/10/2026)
            if (!apercuAmo) {
              void notifierEnqueteTransmise({
                enqueteId: enquete.id,
                coproprietaireId: membership.coproprietaireId,
                piecesManquantes: piecesManquantes.map((p) => p.type),
              });
            }
          }
        },
      }
    );
  };

  const info = profil ? PROFILS_MPR[profil] : null;

  // Pièces à fournir selon les réponses en cours (elles apparaissent dès la réponse donnée).
  const attendues = piecesAttendues(rep);
  const piecesManquantes = attendues.filter(
    (a) => !(pieces ?? []).some((x) => x.type === a.type && x.statut !== "refuse")
  );

  /** rend une liste de questions groupées par section (sous-titres) */
  const renderGroupe = (
    qs: ResolvedQuestion[],
    answers: Answers,
    onSet: (qid: string, v: Val | undefined) => void,
    cle: (qid: string) => string,
    lotsP?: { id: string; label: string }[]
  ) => {
    let lastSection: SectionId | null = null;
    return qs.map((q) => {
      const head =
        q.section !== lastSection ? <div className="eq-sec">{SECTION_LABEL[q.section]}</div> : null;
      lastSection = q.section;
      return (
        <div key={q.id}>
          {head}
          <QuestionBloc
            q={q}
            answers={answers}
            onSet={onSet}
            lotsPrincipaux={lotsP}
            erreur={erreurs[cle(q.id)]}
            anchor={anchorId(cle(q.id))}
          />
        </div>
      );
    });
  };
  const nbErreurs = Object.keys(erreurs).length;
  const profilStatut = reponse?.profil_statut ?? null;
  const profilVerifieLe = reponse?.profil_verifie_le ?? null;

  /** Attestation, boutons et messages de transmission - repris en haut (colonne
   *  de droite) et en bas du questionnaire (feedback Théa 30/09/2026). */
  const blocActions = (
    <>
      {dejaTransmis && transmisLe ? (
        <div className="eq-transmis" role="status">
          <Icon name="checkCircle" size={18} />
          <div>
            <b>Questionnaire transmis</b> le {fmtDateHeure(transmisLe)}.
            <div className="se-small">
              Votre AMO a bien reçu vos réponses. Vous pouvez encore les corriger : il faudra alors les
              transmettre à nouveau.
            </div>
          </div>
        </div>
      ) : (
        <>
          <label className={"eq-atteste" + (erreurAttestation ? " ko" : "")}>
            <input
              type="checkbox"
              checked={atteste}
              onChange={(e) => {
                setAtteste(e.target.checked);
                if (e.target.checked) setErreurAttestation(false);
              }}
            />
            <span>
              J'atteste que ces informations sont exactes et complètes, et j'accepte qu'elles servent au
              calcul de mes aides. <b>*</b>
            </span>
          </label>
          {erreurAttestation && (
            <p className="eq-erreur" role="alert">
              <Icon name="alert" size={13} />
              Case obligatoire : cochez l'attestation pour transmettre votre questionnaire.
            </p>
          )}
        </>
      )}
      <button
        className={"se-btn se-btn-primary" + (dejaTransmis ? " eq-btn-transmis" : "")}
        style={{ width: "100%", marginTop: 12, justifyContent: "center" }}
        onClick={() => doSave("transmis")}
        disabled={save.isPending || dejaTransmis}
      >
        <Icon name={dejaTransmis ? "check" : "checkCircle"} size={17} />
        {save.isPending
          ? "Enregistrement…"
          : dejaTransmis
            ? "Questionnaire transmis"
            : transmisLe
              ? "Transmettre mes modifications"
              : "Transmettre mon questionnaire"}
      </button>
      {!dejaTransmis && (
        <button
          className="se-btn se-btn-ghost btn-sm"
          style={{ width: "100%", marginTop: 8, justifyContent: "center" }}
          onClick={() => doSave("brouillon")}
          disabled={save.isPending}
        >
          Enregistrer un brouillon et finir plus tard
        </button>
      )}
      {modifie && !save.isPending && (
        <p className="eq-non-enr">
          <Icon name="clock" size={13} />
          Modifications non enregistrées
        </p>
      )}
      {nbErreurs > 0 && (
        <div className="eq-erreurs" role="alert">
          <b>
            {nbErreurs} réponse{nbErreurs > 1 ? "s" : ""} manquante{nbErreurs > 1 ? "s" : ""} ou à corriger
          </b>{" "}
          - le questionnaire ne peut pas être transmis en l'état :
          <ul>
            {Object.entries(erreurs).slice(0, 6).map(([k, msg]) => (
              <li key={k}>
                <a
                  href={"#" + anchorId(k)}
                  onClick={(e) => {
                    e.preventDefault();
                    document.getElementById(anchorId(k))?.scrollIntoView({ behavior: "smooth", block: "center" });
                  }}
                >
                  {msg}
                </a>
              </li>
            ))}
            {nbErreurs > 6 && <li>… et {nbErreurs - 6} autre{nbErreurs - 6 > 1 ? "s" : ""}.</li>}
          </ul>
        </div>
      )}
      {saved === "brouillon" && !modifie && (
        <p className="eq-brouillon" role="status">
          <Icon name="check" size={14} />
          <span>
            Brouillon enregistré. L'enquête sera considérée comme faite quand vous aurez transmis le
            questionnaire complet.
          </span>
        </p>
      )}
      {save.isError && (
        <p className="se-small" style={{ color: "var(--color-error-700)", marginTop: 10, marginBottom: 0 }}>
          L'enregistrement a échoué. Réessayez ou contactez votre AMO.
        </p>
      )}
    </>
  );

  return (
    <div className="fade">
      <h1 className="sec-title">Enquête sociale & technique</h1>
      <p className="sec-sub">
        {enquete && rep && allVisible.length > 0 ? (
          <>
            Ces <b>{allVisible.length} questions</b>
            {lotsEnquetes.length > 1 ? ` (dont ${visiblesParLot.reduce((n, x) => n + x.qs.length, 0)} sur vos ${lotsEnquetes.length} logements)` : ""}{" "}
            permettent de vérifier votre éligibilité aux aides de l'Anah et de calculer votre aide individuelle
            MaPrimeRénov'. Comptez <b>{dureeEstimee(allVisible.length)} minutes</b>. Vos réponses
            sont confidentielles : seule l'équipe Strat Eco les consulte, pour préparer le projet (profil
            d'aides, état des logements, organisation des visites).
            {lotsSecondaires > 0 && (
              <>
                {" "}
                Aucune question n'est posée sur {lotsSecondaires > 1 ? "vos " + lotsSecondaires + " lots secondaires" : "votre lot secondaire"}{" "}
                (garage, cave, commerce…).
              </>
            )}
          </>
        ) : (
          <>
            Ce questionnaire permet de vérifier votre éligibilité aux aides de l'Anah et de calculer votre aide
            individuelle. Comptez 5 minutes. Vos réponses sont confidentielles.
          </>
        )}
      </p>

      {!isLoading && !enquete && (
        <>
          <div className="cc-next" style={{ marginBottom: 20 }}>
            <Icon name="alert" size={15} className="ico" style={{ color: "var(--color-warning-500)" }} />
            <span>L'enquête n'a pas encore été ouverte par votre AMO pour cette copropriété.</span>
          </div>
          {/* Le dépôt de l'avis reste ouvert même sans questionnaire : c'est la
              seule pièce attendue, et elle n'a plus d'autre page où vivre. */}
          <div style={{ maxWidth: 560 }}>
            <PiecesJustificatives membership={membership} attendues={piecesAttendues(null)} />
          </div>
        </>
      )}

      {enquete && rep && (
        <div className="split">
          <div style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
            {restaure && (
              <div className="cc-next" role="status">
                <Icon name="refresh" size={15} className="ico" />
                <span>
                  Nous avons remis en place les réponses que vous n'aviez pas encore enregistrées. Pensez à
                  enregistrer un brouillon ou à transmettre le questionnaire.
                </span>
              </div>
            )}
            <div className="card-xl">
              <div className="cx-head">
                <Icon name="user" size={20} style={{ color: "var(--accent)" }} />
                <h2>Vous</h2>
              </div>
              <div className="cx-body">
                {renderGroupe(visiblesCopro, rep.copro, setCopro, (qid) => "copro:" + qid)}
                {customQs.length > 0 && (
                  <>
                    <div className="eq-sec">Questions de votre AMO</div>
                    {customQs.map((q) => (
                      <QuestionBloc
                        key={q.id}
                        q={q}
                        answers={rep.copro}
                        onSet={setCopro}
                        erreur={erreurs["copro:" + q.id]}
                        anchor={anchorId("copro:" + q.id)}
                      />
                    ))}
                  </>
                )}
              </div>
            </div>

            {visiblesParLot.map(({ lot, qs }) => (
              <div className="card-xl" key={lot.id}>
                <div className="cx-head">
                  <Icon name="home" size={20} style={{ color: "var(--accent)" }} />
                  <h2>
                    Lot {lot.num}
                    {lot.batiment ? ` - bâtiment ${lot.batiment}` : ""}
                  </h2>
                </div>
                <div className="cx-body">
                  {renderGroupe(qs, rep.lots[lot.id] ?? {}, setLot(lot.id), (qid) => `lot:${lot.id}:${qid}`, lotsPrincipaux(lot.id))}
                </div>
              </div>
            ))}

            {/* Bas de page : pas besoin de remonter pour enregistrer (feedback Théa 30/09/2026). */}
            <div className="card-xl eq-fin">
              <div className="cx-head">
                <Icon name={dejaTransmis ? "checkCircle" : "send"} size={20} style={{ color: "var(--accent)" }} />
                <h2>{dejaTransmis ? "Questionnaire transmis" : "Vous avez terminé ?"}</h2>
                <span style={{ flex: 1 }}></span>
                <span className="se-small" style={{ color: "var(--fg-muted)" }}>
                  {nbRepondu} / {obligatoires.length} réponses
                </span>
              </div>
              <div className="cx-body">
                {blocActions}
                <button
                  type="button"
                  className="se-btn se-btn-ghost btn-sm"
                  style={{ width: "100%", marginTop: 8, justifyContent: "center" }}
                  onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                >
                  <Icon name="chevronUp" size={15} />
                  Remonter en haut de la page
                </button>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div className="card-xl eq-actions-cote">
              <div className="cx-body">
                <div className="kv">
                  <span className="k">Progression</span>
                  <span className="v">
                    {nbRepondu} / {obligatoires.length} réponses
                  </span>
                </div>
                <div className="prog" style={{ marginTop: 8 }}>
                  <i style={{ width: (obligatoires.length ? Math.round((nbRepondu / obligatoires.length) * 100) : 0) + "%" }}></i>
                </div>
                <div style={{ marginTop: 10 }}>
                  {complet ? (
                    <Badge kind="success" dot>Questionnaire complet</Badge>
                  ) : (
                    <Badge kind="warn">
                      {obligatoires.length - nbRepondu} question{obligatoires.length - nbRepondu > 1 ? "s" : ""} restante{obligatoires.length - nbRepondu > 1 ? "s" : ""}
                    </Badge>
                  )}
                </div>
                {blocActions}
              </div>
            </div>

            {info ? (
              <div className="card-xl fade">
                <div className="profil-result" style={{ background: info.color }}>
                  <div className="pr-meta">
                    <div className="t">{info.menage}</div>
                    <div className="s">Aides MaPrimeRénov' {info.taux}</div>
                  </div>
                </div>
                <div className="cx-body" style={{ paddingTop: 18 }}>
                  {typeof nbFoyer === "number" && (
                    <div className="kv">
                      <span className="k">Ménage</span>
                      <span className="v">{nbFoyer} personne{nbFoyer > 1 ? "s" : ""}</span>
                    </div>
                  )}
                  {typeof rfrFoyer === "number" && (
                    <div className="kv">
                      <span className="k">Revenu fiscal de référence</span>
                      <span className="v">{fmtEuro(rfrFoyer)} / an</span>
                    </div>
                  )}
                  <div className="kv">
                    <span className="k">Statut du profil</span>
                    <span className="v">
                      {profilStatut === "verifie" && profilVerifieLe ? (
                        <Badge kind="success" dot>Vérifié le {fmtDate(profilVerifieLe)}</Badge>
                      ) : (
                        <Badge kind="warn">Déclaratif</Badge>
                      )}
                    </span>
                  </div>
                  <p className="se-small" style={{ marginTop: 12, marginBottom: 0 }}>
                    Catégorie déterminée selon les plafonds Anah {bareme?.millesime ?? ""}
                    {bareme?.zone === "hors_idf" ? " (hors Île-de-France)" : bareme?.zone === "idf" ? " (Île-de-France)" : ""}.
                    {profilStatut === "verifie"
                      ? " Votre AMO l'a vérifiée sur votre avis d'imposition."
                      : " Elle repose sur vos déclarations : votre AMO la vérifiera sur l'avis d'imposition déposé ci-dessous."}{" "}
                    Votre plan de financement individuel utilise ce profil.
                  </p>
                </div>
              </div>
            ) : (
              bareme && (
                <div className="card-xl">
                  <div className="cx-head">
                    <Icon name="euro" size={20} style={{ color: "var(--accent)" }} />
                    <h2>Plafonds Anah {bareme.millesime}</h2>
                  </div>
                  <div className="cx-body">
                    <p className="se-small" style={{ marginTop: 0, marginBottom: 10 }}>
                      Revenu fiscal de référence maximal du ménage
                      {bareme.zone === "hors_idf" ? " - hors Île-de-France" : " - Île-de-France"} :
                    </p>
                    <div className="anah-scroll">
                      <table className="anah-table">
                        <thead>
                          <tr>
                            <th>Ménage</th>
                            <th>Très modeste</th>
                            <th>Modeste</th>
                            <th>Intermédiaire</th>
                          </tr>
                        </thead>
                        <tbody>
                          {([1, 2, 3, 4, 5] as const).map((n) => (
                            <tr key={n}>
                              <td>{n} pers.</td>
                              {bareme.mprSeuils.seuils[n].map((s, i) => (
                                <td key={i}>≤ {fmtEuro(s)}</td>
                              ))}
                            </tr>
                          ))}
                          <tr>
                            <td>+ pers. supp.</td>
                            {bareme.mprSeuils.parPers.map((s, i) => (
                              <td key={i}>+ {fmtEuro(s)}</td>
                            ))}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <p className="se-small" style={{ marginTop: 10, marginBottom: 0 }}>
                      Au-delà du plafond « intermédiaire », le ménage relève des revenus supérieurs. Répondez aux
                      questions <b>ménage</b> et <b>revenu fiscal de référence</b> : votre catégorie s'affichera ici.
                    </p>
                  </div>
                </div>
              )
            )}

            {/* Sous les plafonds de l'Anah : le dépôt de l'avis d'imposition, seule
                pièce encore attendue du copropriétaire (feedback Amir 22/09/2026). */}
            <div id="eq-avis">
              <PiecesJustificatives membership={membership} attendues={attendues} />
            </div>

            <div className="cc-next">
              <Icon name="checkCircle" size={15} className="ico" />
              <span>Vos données sont confidentielles et ne servent qu'à la préparation du projet et au calcul de vos aides.</span>
            </div>
          </div>
        </div>
      )}

      {confirmation && (
        <Modal title="Questionnaire transmis" onClose={() => setConfirmation(null)} width={480}>
          <div className="eq-confirm">
            <span className="eq-confirm-ico">
              <Icon name="check" size={30} />
            </span>
            <p className="se-body" style={{ margin: 0 }}>
              Merci ! Vos réponses ont bien été transmises à l'équipe Strat Eco le {fmtDateHeure(confirmation)}.
              {!apercuAmo && " Un e-mail de confirmation vous est envoyé."}
            </p>
            {piecesManquantes.length > 0 && (
              <p className="se-small" style={{ margin: 0, color: "var(--fg2)" }}>
                Dernière étape : si vous êtes éligible aux aides, déposez sur cette même page{" "}
                {piecesManquantes.length > 1
                  ? `les ${piecesManquantes.length} pièces encore manquantes (${piecesManquantes.map((p) => p.nom.toLowerCase()).join(", ")})`
                  : `votre ${piecesManquantes[0].nom.charAt(0).toLowerCase() + piecesManquantes[0].nom.slice(1)}`}
                , toutes les pages.
              </p>
            )}
            <div className="eq-confirm-actions">
              {piecesManquantes.length > 0 && (
                <button
                  className="se-btn se-btn-primary"
                  onClick={() => {
                    setConfirmation(null);
                    document.getElementById("eq-avis")?.scrollIntoView({ behavior: "smooth", block: "center" });
                  }}
                >
                  <Icon name="upload" size={16} />
                  {piecesManquantes.length > 1 ? "Déposer mes pièces" : "Déposer la pièce"}
                </button>
              )}
              <button className="se-btn se-btn-secondary" onClick={() => setConfirmation(null)}>
                Fermer
              </button>
            </div>
          </div>
        </Modal>
      )}

      {enquete && rep && <RemonterEnHaut />}
    </div>
  );
}

// Enquête sociale & technique côté portail : le questionnaire configuré par
// l'AMO (catalogue + on/off) est rendu dynamiquement — questions « vous »
// (copropriétaire) puis une section par lot. Les conditions d'affichage
// s'appliquent en direct pendant la saisie. Les réponses vivent dans
// enquete_reponses.reponses (jsonb) ; foyer / occupation / RFR alimentent
// aussi les colonnes historiques pour le calcul du profil MaPrimeRénov'.
import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui";
import { fmtEuro } from "@/lib/format";
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
  useSaveMaReponse,
  type Membership,
  type PortalLot,
} from "@/api/portail";
import type { Bareme, Profil } from "@/lib/finance";
import type { Json } from "@/lib/database.types";

type Val = string | number | string[];
type Answers = Record<string, Val | undefined>;
interface ReponsesJson {
  copro: Answers;
  lots: Record<string, Answers>;
  /** true quand toutes les questions posées avaient une réponse au moment de l'enregistrement */
  complet?: boolean;
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
            placeholder="—"
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
          <option value="">— Choisir un lot principal —</option>
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
}: {
  q: ResolvedQuestion;
  answers: Answers;
  onSet: (qid: string, v: Val | undefined) => void;
  lotsPrincipaux?: { id: string; label: string }[];
}) {
  const value = answers[q.id];
  const needsPrecision =
    (q.precision ?? []).length > 0 &&
    ((typeof value === "string" && q.precision!.includes(value)) ||
      (Array.isArray(value) && value.some((v) => q.precision!.includes(v))));
  return (
    <div className="eq-q">
      <label className="eq-label">
        {q.q}
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
    </div>
  );
}

export function Enquete({ membership, bareme }: { membership: Membership; bareme: Bareme | null }) {
  const { data: enquete, isLoading } = useEnquetePortail(membership.copro.id);
  const { data: reponse, isFetched } = useMaReponse(enquete?.id, membership.coproprietaireId);
  const save = useSaveMaReponse(enquete?.id ?? "", membership.coproprietaireId);

  const questions = useMemo(
    () => (enquete ? resolveQuestions(normalizeConfig(enquete.questions)) : []),
    [enquete]
  );

  const [rep, setRep] = useState<ReponsesJson | null>(null);
  const [profilSauve, setProfilSauve] = useState<Profil | null>(null);
  const [saved, setSaved] = useState(false);

  // Initialisation : réponses enregistrées par-dessus les défauts (nom, usage des lots).
  useEffect(() => {
    if (!enquete || !isFetched || rep) return;
    const stored = (reponse?.reponses ?? null) as ReponsesJson | null;
    const lots: Record<string, Answers> = {};
    for (const l of membership.lots) {
      lots[l.id] = { "usage-lot": USAGE_LABEL[l.usage] ?? "Autre", ...(stored?.lots?.[l.id] ?? {}) };
    }
    setRep({ copro: { nom: membership.nom, ...(stored?.copro ?? {}) }, lots });
    setProfilSauve((reponse?.profil_mpr as Profil | null) ?? null);
  }, [enquete, isFetched, rep, reponse, membership]);

  const setCopro = (qid: string, v: Val | undefined) => {
    setSaved(false);
    setRep((r) => (r ? { ...r, copro: { ...r.copro, [qid]: v } } : r));
  };
  const setLot = (lotId: string) => (qid: string, v: Val | undefined) => {
    setSaved(false);
    setRep((r) => (r ? { ...r, lots: { ...r.lots, [lotId]: { ...r.lots[lotId], [qid]: v } } } : r));
  };

  const coproQs = questions.filter((q) => !q.custom && SECTIONS_COPRO.includes(q.section));
  const customQs = questions.filter((q) => q.custom && q.on);
  const lotQs = questions.filter((q) => !q.custom && SECTIONS_LOT.includes(q.section));

  const getCopro = (qid: string) => rep?.copro[qid];
  const getLot = (lot: PortalLot) => (qid: string) => rep?.lots[lot.id]?.[qid] ?? rep?.copro[qid];

  const visiblesCopro = rep ? coproQs.filter((q) => isVisible(q, getCopro)) : [];
  const visiblesParLot = rep
    ? membership.lots.map((lot) => ({ lot, qs: lotQs.filter((q) => isVisible(q, getLot(lot))) }))
    : [];

  const allVisible = [
    ...visiblesCopro.map((q) => ({ q, a: rep?.copro })),
    ...customQs.map((q) => ({ q, a: rep?.copro })),
    ...visiblesParLot.flatMap(({ lot, qs }) => qs.map((q) => ({ q, a: rep?.lots[lot.id] }))),
  ];
  const nbRepondu = allVisible.filter(({ q, a }) => answered(a?.[q.id])).length;
  const complet = allVisible.length > 0 && nbRepondu === allVisible.length;

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
      .map((l) => ({ id: l.id, label: `Lot ${l.num}${l.batiment ? ` — bât. ${l.batiment}` : ""}` }));

  const doSave = () => {
    if (!rep || !enquete) return;
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
    save.mutate(
      {
        reponses: { ...rep, complet } as unknown as Json,
        nbPersonnes,
        statutOccupation,
        rfr,
        bareme,
      },
      {
        onSuccess: (p) => {
          if (p) setProfilSauve(p);
          setSaved(true);
        },
      }
    );
  };

  const info = profil ? PROFILS_MPR[profil] : null;

  /** rend une liste de questions groupées par section (sous-titres) */
  const renderGroupe = (
    qs: ResolvedQuestion[],
    answers: Answers,
    onSet: (qid: string, v: Val | undefined) => void,
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
          <QuestionBloc q={q} answers={answers} onSet={onSet} lotsPrincipaux={lotsP} />
        </div>
      );
    });
  };

  return (
    <div className="fade">
      <h1 className="sec-title">Enquête sociale & technique</h1>
      <p className="sec-sub">
        Vos réponses aident l'équipe AMO à préparer le projet : profil d'aides, état des logements,
        organisation des visites. Elles sont confidentielles.
      </p>

      {!isLoading && !enquete && (
        <div className="cc-next" style={{ marginBottom: 20 }}>
          <Icon name="alert" size={15} className="ico" style={{ color: "var(--color-warning-500)" }} />
          <span>L'enquête n'a pas encore été ouverte par votre AMO pour cette copropriété.</span>
        </div>
      )}

      {enquete && rep && (
        <div className="split">
          <div style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
            <div className="card-xl">
              <div className="cx-head">
                <Icon name="user" size={20} style={{ color: "var(--accent)" }} />
                <h2>Vous</h2>
              </div>
              <div className="cx-body">
                {renderGroupe(visiblesCopro, rep.copro, setCopro)}
                {customQs.length > 0 && (
                  <>
                    <div className="eq-sec">Questions de votre AMO</div>
                    {customQs.map((q) => (
                      <QuestionBloc key={q.id} q={q} answers={rep.copro} onSet={setCopro} />
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
                    {lot.batiment ? ` — bâtiment ${lot.batiment}` : ""}
                  </h2>
                </div>
                <div className="cx-body">
                  {renderGroupe(qs, rep.lots[lot.id] ?? {}, setLot(lot.id), lotsPrincipaux(lot.id))}
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div className="card-xl">
              <div className="cx-body">
                <div className="kv">
                  <span className="k">Progression</span>
                  <span className="v">
                    {nbRepondu} / {allVisible.length} réponses
                  </span>
                </div>
                <div className="prog" style={{ marginTop: 8 }}>
                  <i style={{ width: (allVisible.length ? Math.round((nbRepondu / allVisible.length) * 100) : 0) + "%" }}></i>
                </div>
                <div style={{ marginTop: 10 }}>
                  {complet ? (
                    <Badge kind="success" dot>Questionnaire complet</Badge>
                  ) : (
                    <Badge kind="warn">
                      {allVisible.length - nbRepondu} question{allVisible.length - nbRepondu > 1 ? "s" : ""} restante{allVisible.length - nbRepondu > 1 ? "s" : ""}
                    </Badge>
                  )}
                </div>
                <button
                  className="se-btn se-btn-primary"
                  style={{ width: "100%", marginTop: 16, justifyContent: "center" }}
                  onClick={doSave}
                  disabled={save.isPending}
                >
                  <Icon name="checkCircle" size={17} />
                  {save.isPending ? "Enregistrement…" : "Enregistrer mes réponses"}
                </button>
                {saved && (
                  <p className="se-small" style={{ color: "var(--color-success-700)", marginTop: 10, marginBottom: 0 }}>
                    {complet
                      ? "Merci ! Votre questionnaire est complet et enregistré."
                      : "Réponses enregistrées — l'enquête sera considérée comme faite quand toutes les questions auront une réponse."}
                  </p>
                )}
                {save.isError && (
                  <p className="se-small" style={{ color: "var(--color-error-700)", marginTop: 10, marginBottom: 0 }}>
                    L'enregistrement a échoué. Réessayez ou contactez votre AMO.
                  </p>
                )}
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
                  <p className="se-small" style={{ marginTop: 12, marginBottom: 0 }}>
                    Catégorie déterminée selon les plafonds Anah {bareme?.millesime ?? ""}
                    {bareme?.zone === "hors_idf" ? " (hors Île-de-France)" : bareme?.zone === "idf" ? " (Île-de-France)" : ""}.
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
                      {bareme.zone === "hors_idf" ? " — hors Île-de-France" : " — Île-de-France"} :
                    </p>
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
                    <p className="se-small" style={{ marginTop: 10, marginBottom: 0 }}>
                      Au-delà du plafond « intermédiaire », le ménage relève des revenus supérieurs. Répondez aux
                      questions <b>ménage</b> et <b>revenu fiscal de référence</b> : votre catégorie s'affichera ici.
                    </p>
                  </div>
                </div>
              )
            )}

            <div className="cc-next">
              <Icon name="checkCircle" size={15} className="ico" />
              <span>Vos données sont confidentielles et ne servent qu'à la préparation du projet et au calcul de vos aides.</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

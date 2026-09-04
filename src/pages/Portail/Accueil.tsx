// Accueil du portail : salutation, timeline de phases, tuiles financières,
// étiquette énergie visée du bâtiment, à-faire.
import { Icon } from "@/components/Icon";
import { Badge, DpeChip } from "@/components/ui";
import { fmtDate, fmtEuro } from "@/lib/format";
import { PHASES, PROFILS_MPR, type DpeClass } from "@/lib/referentiels";
import {
  computeIndiv,
  totalTantiemes,
  type ChoixFinancement,
  type Membership,
  type ProfilMeta,
  type Scenario,
} from "@/api/portail";
import { readParams } from "@/api/scenarios";
import type { Bareme, Profil } from "@/lib/finance";
import type { Tables } from "@/lib/database.types";
import type { SectionId } from "./index";

export function Accueil({
  membership,
  scenario,
  bareme,
  plan,
  profil,
  profilMeta,
  userName,
  piecesDone,
  piecesReq,
  choix,
  enqueteComplete,
  go,
}: {
  membership: Membership;
  scenario: Scenario | null;
  bareme: Bareme | null;
  plan: Tables<"plans_individuels"> | null;
  profil: Profil | null;
  profilMeta: ProfilMeta;
  userName: string;
  piecesDone: number;
  piecesReq: number;
  choix: ChoixFinancement | null;
  enqueteComplete: boolean;
  go: (s: SectionId) => void;
}) {
  const copro = membership.copro;
  const phaseIdx = PHASES.findIndex((p) => p.id === copro.phase);
  const dpeAvant = (copro.energy_before as DpeClass | null) ?? null;
  const dpeApres = (copro.energy_after as DpeClass | null) ?? null;

  const indiv =
    scenario && bareme
      ? computeIndiv(
          scenario,
          bareme,
          plan,
          totalTantiemes(membership.lots, readParams(scenario.params, bareme).cle),
          profil
        )
      : null;
  // Aides collectives (MPR Copro + fonds travaux + CEE, prorata des tantièmes)
  // et aide individuelle (profil de ressources) sont présentées séparément :
  // sans profil, l'aide individuelle est « à déterminer », jamais un montant
  // présumé (feedback Théa 03/09/2026 - contradiction avec l'enquête à 0/15).
  const aidesCollectives = indiv ? indiv.cee + indiv.subvColl : null;
  const planPublieLe = scenario?.updated_at ?? null;

  const todos: { id: SectionId; done: boolean; ico: string; title: string; sub: string }[] = [
    {
      id: "enquete",
      done: enqueteComplete,
      ico: "clipboard",
      title: "Compléter l'enquête sociale & technique",
      sub: enqueteComplete
        ? (profil ? PROFILS_MPR[profil].menage : "Questionnaire complet")
        : profil
          ? "En cours - transmettez le questionnaire complet"
          : "Indispensable pour déterminer votre aide individuelle (à déterminer tant qu'il n'est pas rempli)",
    },
    {
      id: "documents",
      done: piecesDone >= piecesReq,
      ico: "folder",
      title: "Téléverser vos pièces justificatives",
      sub: piecesDone + "/" + piecesReq + " pièces obligatoires fournies",
    },
    {
      id: "pret",
      done: !!choix,
      ico: "trendingUp",
      title: "Choisir votre financement",
      sub: choix ? "Choix transmis" : "Prêt collectif, individuel ou fonds propres",
    },
  ];

  return (
    <div className="fade">
      <div className="greet">
        <h1>Bonjour {userName.split(" ")[0]}</h1>
        <p>
          Voici le suivi de la rénovation énergétique de la copropriété <b>{copro.name}</b>. Le projet est en
          phase <b>{PHASES[phaseIdx]?.label ?? copro.phase}</b> : retrouvez ici votre plan de financement,
          l'enquête sociale et vos documents.
        </p>
        <div className="timeline">
          {PHASES.map((p, i) => (
            <div key={p.id} className={"tl-step " + (i < phaseIdx ? "done" : i === phaseIdx ? "cur" : "")}>
              <div className="bar"></div>
              <div className="tl-node">{i < phaseIdx ? <Icon name="check" size={16} /> : i + 1}</div>
              <div className="tl-lbl">{p.label}</div>
              <div className="tl-sub">{i < phaseIdx ? "Terminé" : i === phaseIdx ? "En cours" : "À venir"}</div>
            </div>
          ))}
        </div>
      </div>

      {indiv ? (
        <>
          <div className="tiles tiles-4" style={{ marginBottom: 26 }}>
            <div className="tile">
              <div className="t-lbl"><Icon name="euro" size={16} />Votre quote-part de travaux</div>
              <div className="t-val">{fmtEuro(indiv.quotePart)}</div>
              <div className="t-foot">
                Tantièmes {totalTantiemes(membership.lots, bareme && scenario ? readParams(scenario.params, bareme).cle : "MUN").toLocaleString("fr-FR")}
                {!indiv.exact && " · estimation"}
              </div>
            </div>
            <div className="tile">
              <div className="t-lbl"><Icon name="leaf" size={16} />Aides collectives affectées à vos lots</div>
              <div className="t-val accent">{fmtEuro(aidesCollectives)}</div>
              <div className="t-foot">MaPrimeRénov' Copropriété + fonds travaux + CEE, au prorata de vos tantièmes</div>
            </div>
            <div className="tile">
              <div className="t-lbl"><Icon name="user" size={16} />Votre aide individuelle</div>
              {indiv.mprIndetermine ? (
                <>
                  <div className="t-val indetermine">À déterminer</div>
                  <div className="t-foot">Complétez l'enquête sociale : elle dépend de vos ressources</div>
                </>
              ) : indiv.mprIndiv > 0 ? (
                <>
                  <div className="t-val accent">{fmtEuro(indiv.mprIndiv)}</div>
                  <div className="t-foot">MaPrimeRénov' individuelle · {profil ? PROFILS_MPR[profil].menage.toLowerCase() : ""}</div>
                </>
              ) : (
                <>
                  <div className="t-val indetermine">À confirmer</div>
                  <div className="t-foot">
                    Profil {profil ? PROFILS_MPR[profil].desc.toLowerCase() : ""} connu - montant fixé par votre AMO à l'instruction
                  </div>
                </>
              )}
            </div>
            <div className="tile">
              <div className="t-lbl"><Icon name="trendingUp" size={16} />À financer avant travaux</div>
              <div className="t-val">{fmtEuro(indiv.resteAvantTravaux)}</div>
              <div className="t-foot">
                Hors CEE (versés à la fin du chantier)
                {indiv.mprIndetermine ? " et hors aide individuelle" : ""}
              </div>
            </div>
          </div>
          <div className="portail-source">
            <span>
              <Icon name="fileCheck" size={13} style={{ verticalAlign: "-2px", marginRight: 4 }} />
              Plan de financement « {scenario?.name} »{planPublieLe ? ` publié le ${fmtDate(planPublieLe)}` : ""}
              {indiv.exact ? "" : " · estimation au prorata des tantièmes"}
            </span>
            <span>
              Profil de ressources :{" "}
              {profilMeta.statut === "verifie" ? (
                <Badge kind="success" dot>Vérifié par votre AMO le {fmtDate(profilMeta.date)}</Badge>
              ) : profilMeta.statut === "declaratif" ? (
                <Badge kind="warn">Déclaratif - enquête du {fmtDate(profilMeta.date)}</Badge>
              ) : (
                <Badge kind="neutral">Non renseigné</Badge>
              )}
            </span>
          </div>
        </>
      ) : (
        <div className="cc-next" style={{ marginBottom: 26 }}>
          <Icon name="alert" size={15} className="ico" style={{ color: "var(--color-warning-500)" }} />
          <span>
            Le plan de financement n'a pas encore été partagé par votre AMO. Vos quotes-parts apparaîtront ici
            dès qu'un scénario sera publié.
          </span>
        </div>
      )}

      {(dpeAvant || dpeApres) && (
        <div className="dpe-vise" style={{ marginBottom: 26 }}>
          <div className="dv-chips">
            <DpeChip cls={dpeAvant} size={22} />
            <Icon name="arrowRight" size={22} style={{ color: "var(--fg-muted)" }} />
            <DpeChip cls={dpeApres} size={22} />
          </div>
          <div>
            <div className="dv-title">Un changement d'étiquette énergie pour votre immeuble</div>
            <p className="dv-sub">
              Il s'agit de l'étiquette <b>visée pour l'ensemble du bâtiment</b> après travaux (DPE collectif de
              la copropriété) - et non de l'étiquette individuelle de votre logement, qui peut différer selon
              son étage, son exposition ou ses équipements.
            </p>
          </div>
        </div>
      )}

      <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 21, margin: "0 0 14px" }}>À faire</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {todos.map((t) => (
          <div key={t.id} className={"todo-card" + (t.done ? " done" : "")} onClick={() => go(t.id)}>
            <span className="tc-ico"><Icon name={(t.done ? "checkCircle" : t.ico) as never} size={22} /></span>
            <div style={{ flex: 1 }}>
              <div className="tc-title">{t.title}</div>
              <div className="tc-sub">{t.sub}</div>
            </div>
            {t.done ? <Badge kind="success">Fait</Badge> : <Badge kind="warn">À faire</Badge>}
            <Icon name="chevronRight" size={20} style={{ color: "var(--fg-muted)" }} />
          </div>
        ))}
      </div>
    </div>
  );
}

// Accueil du portail : salutation, timeline de phases avec le récapitulatif de
// chaque étape (réalisé / reste à réaliser, idée d'Amir du 02/10/2026), tuiles
// financières, étiquette énergie visée du bâtiment, à-faire, lien vers les
// documents du projet (onglet « Documents » depuis le 02/10/2026).
import { useState, type CSSProperties } from "react";
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui";
import { EchelleDpe } from "@/components/EchelleDpe";
import { fmtDate, fmtEuro } from "@/lib/format";
import { noteResteAFinancer, texteEtiquetteVisee } from "@/lib/specificitesCopro";
import { PHASES, PROFILS_MPR, type DpeClass } from "@/lib/referentiels";
import { recapPhases } from "@/lib/recapPhases";
import {
  computeIndiv,
  totalTantiemes,
  useFichiersPartages,
  usePlanDefinitifPartage,
  usePortailTaches,
  type ChoixFinancement,
  type Membership,
  type ProfilMeta,
  type Scenario,
} from "@/api/portail";
import { readParams } from "@/api/scenarios";
import type { Bareme, Profil } from "@/lib/finance";
import type { Tables } from "@/lib/database.types";
import { messageErreur } from "@/lib/erreurs";
import { ecoPtzPossible } from "@/lib/financement";
import type { SectionId } from "./index";
import { telechargerPlanIndividuelPdf } from "./planPdf";

export function Accueil({
  membership,
  scenario,
  bareme,
  plan,
  profil,
  profilMeta,
  userName,
  piecesManquantes,
  nbPiecesAttendues,
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
  /** pièces justificatives attendues selon l'enquête et pas encore fournies (libellés) */
  piecesManquantes: string[];
  nbPiecesAttendues: number;
  choix: ChoixFinancement | null;
  enqueteComplete: boolean;
  go: (s: SectionId) => void;
}) {
  const copro = membership.copro;
  const phaseIdx = PHASES.findIndex((p) => p.id === copro.phase);
  const dpeAvant = (copro.energy_before as DpeClass | null) ?? null;
  const dpeApres = (copro.energy_after as DpeClass | null) ?? null;
  // Consommations du PF définitif partagé (kWhep/m².an) : elles placent les
  // flèches avant / après au bon endroit de la graduation (même requête que
  // « Plan de financement global », donc mise en cache)
  const { data: pfPartage } = usePlanDefinitifPartage(scenario?.plan_definitif_id ?? null);
  const cepAvant = pfPartage?.data.infos.cepInitial ?? null;
  const cepApres = pfPartage?.data.infos.cepProjet ?? null;
  // Tâches du dossier : ce qui est en cours et ce qui reste, sous l'étape courante
  const { data: taches } = usePortailTaches(copro.id);
  const recap = recapPhases({ phase: copro.phase, energyBefore: dpeAvant, dateAg: copro.date_ag, taches });
  const { data: documents } = useFichiersPartages(copro.id);
  const nbDocuments = documents?.length ?? 0;

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
  // Aide collective publique (MPR Copro et aides locales, prorata des
  // tantièmes) : sans les CEE, versés en fin de chantier, ni le fonds travaux
  // (feedback d'Amir du 05/10/2026), et aide individuelle (profil de
  // ressources) sont présentées séparément : sans profil, l'aide individuelle
  // est « à déterminer », jamais un montant présumé (feedback Théa 03/09/2026
  // - contradiction avec l'enquête à 0/15).
  const aideCollectivePublique = indiv ? Math.max(0, indiv.subvColl - indiv.fondsPart) : null;
  const planPublieLe = scenario?.updated_at ?? null;
  // Rappel propre à certains dossiers (Armorial : hors vente des combles), sans calcul
  const noteReste = noteResteAFinancer(copro.id);

  // Plan de financement individuel en PDF, directement depuis l'accueil (idée
  // d'Amir du 05/10/2026) : même document que « Mes quotes-parts », sur
  // l'ensemble des lots du copropriétaire.
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfErreur, setPdfErreur] = useState<string | null>(null);
  const telechargerPlan = async () => {
    if (!indiv || !scenario || !bareme) return;
    setPdfBusy(true);
    setPdfErreur(null);
    try {
      const params = readParams(scenario.params, bareme);
      await telechargerPlanIndividuelPdf({
        membership,
        scenarioName: scenario.name,
        params,
        bareme,
        indiv,
        profil,
        cle: params.cle,
      });
    } catch (e) {
      setPdfErreur(messageErreur(e, "Le téléchargement du plan a échoué"));
    } finally {
      setPdfBusy(false);
    }
  };

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
      id: "enquete",
      done: piecesManquantes.length === 0,
      ico: "folder",
      title: nbPiecesAttendues > 1 ? "Déposer vos pièces justificatives" : "Déposer votre avis d'imposition",
      sub:
        piecesManquantes.length === 0
          ? nbPiecesAttendues > 1
            ? "Toutes vos pièces sont déposées"
            : nbPiecesAttendues === 1
              ? "Avis déposé - toutes les pages"
              : "Aucune pièce demandée selon vos réponses"
          : nbPiecesAttendues > 1
            ? `${piecesManquantes.length} pièce${piecesManquantes.length > 1 ? "s" : ""} à déposer dans l'enquête sociale : ${piecesManquantes.join(", ")}`
            : "Toutes les pages, dans l'enquête sociale : c'est lui qui atteste vos ressources",
    },
    {
      id: "pret",
      done: !!choix,
      ico: "trendingUp",
      title: "Choisir votre financement",
      sub: choix
        ? "Choix transmis"
        : ecoPtzPossible(membership.lots)
          ? "Prêt collectif, individuel ou fonds propres"
          : "Fonds propres : le seul mode de financement ouvert à vos lots",
    },
  ];

  return (
    <div className="fade">
      <div className="greet">
        {/* nom et prénom complets (bug d'Amir du 04/10/2026 : seul le premier mot restait) */}
        <h1>Bonjour {userName.trim()}</h1>
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
          {PHASES.map((p, i) => {
            const r = recap[p.id];
            if (!r) return null;
            const titre = r.mode === "realise" ? "réalisé" : r.mode === "encours" ? "en cours" : "reste à réaliser";
            return (
              <div key={"recap-" + p.id} className="tl-recap" style={{ "--col": i + 1 } as CSSProperties}>
                <div className="tl-recap-titre">
                  <span className="tl-recap-ordi">{titre[0].toUpperCase() + titre.slice(1)}</span>
                  <span className="tl-recap-mobile">{p.label} : {titre}</span>
                </div>
                <ul>
                  {r.items.map((item) => (
                    <li key={item}>
                      {r.mode === "realise" ? (
                        <Icon name="check" size={13} className="ico" />
                      ) : r.mode === "encours" ? (
                        <span className="puce puce-encours"></span>
                      ) : (
                        <span className="puce"></span>
                      )}
                      {item}
                    </li>
                  ))}
                </ul>
                {r.suite && (
                  <>
                    <div className="tl-recap-titre tl-recap-suite">Reste à réaliser</div>
                    <ul>
                      {r.suite.map((item) => (
                        <li key={item}>
                          <span className="puce"></span>
                          {item}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {indiv ? (
        <>
          {noteReste && (
            <div className="note-attention" role="note">
              <Icon name="alert" size={22} className="ico" />
              <span>{noteReste}</span>
            </div>
          )}
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
              <div className="t-lbl"><Icon name="leaf" size={16} />Aide collective publique</div>
              <div className="t-val accent">{fmtEuro(aideCollectivePublique)}</div>
              <div className="t-foot">MaPrimeRénov' Copropriété et aides locales, hors CEE, au prorata de vos tantièmes</div>
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
                Reste à financer, appels de fonds déduits
                {indiv.fondsPart > 0.5 ? ` (${fmtEuro(indiv.fondsPart)} de fonds travaux)` : ""}
                {indiv.mprIndetermine ? ", hors aide individuelle" : ""}
                {indiv.cee > 0.5 ? ` · CEE de ${fmtEuro(indiv.cee)} versés à la fin du chantier` : ""}
              </div>
            </div>
          </div>
          {indiv.cee > 0.5 && (
            <div className="c2e-box" style={{ marginBottom: 14 }}>
              <span className="c2e-ico"><Icon name="leaf" size={20} /></span>
              <div>
                <div className="c2e-titre">C2E (CEE) à percevoir en fin de chantier</div>
                <div className="c2e-val">{fmtEuro(indiv.cee)}</div>
                <div className="c2e-sub">
                  Prime des certificats d'économies d'énergie affectée à vos lots : elle vous est versée une fois
                  le chantier terminé, elle n'est donc pas déduite du montant à financer avant travaux.
                </div>
              </div>
            </div>
          )}
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
          <div className="portail-telecharger">
            <button className="se-btn se-btn-secondary" onClick={() => void telechargerPlan()} disabled={pdfBusy}>
              <Icon name="download" size={17} />
              {pdfBusy ? "Génération du PDF…" : "Télécharger mon plan de financement individuel"}
            </button>
            {pdfErreur && <p className="se-small" style={{ color: "var(--color-error-700)", margin: "8px 0 0" }}>{pdfErreur}</p>}
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
          <EchelleDpe avant={dpeAvant} apres={dpeApres} cepAvant={cepAvant} cepApres={cepApres} />
          <div>
            <div className="dv-title">Un changement d'étiquette énergie pour votre immeuble</div>
            <p className="dv-sub">{texteEtiquetteVisee(copro.id)}</p>
          </div>
        </div>
      )}

      <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 21, margin: "0 0 14px" }}>À faire</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {todos.map((t) => (
          <div key={t.title} className={"todo-card" + (t.done ? " done" : "")} onClick={() => go(t.id)}>
            <span className="tc-ico"><Icon name={(t.done ? "checkCircle" : t.ico) as never} size={22} /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="tc-title">{t.title}</div>
              <div className="tc-sub">{t.sub}</div>
            </div>
            {t.done ? <Badge kind="success">Fait</Badge> : <Badge kind="warn">À faire</Badge>}
            <Icon name="chevronRight" size={20} style={{ color: "var(--fg-muted)" }} />
          </div>
        ))}
      </div>

      <div className="todo-card" style={{ marginTop: 26 }} onClick={() => go("documents")}>
        <span className="tc-ico"><Icon name="fileText" size={22} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="tc-title">Documents du projet</div>
          <div className="tc-sub">
            {nbDocuments
              ? `${nbDocuments} document${nbDocuments > 1 ? "s" : ""} partagé${nbDocuments > 1 ? "s" : ""} par votre AMO`
              : "Aucun document partagé pour l'instant"}
          </div>
        </div>
        <Icon name="chevronRight" size={20} style={{ color: "var(--fg-muted)" }} />
      </div>
    </div>
  );
}

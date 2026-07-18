// Assistant d'ingénierie financière en 7 étapes — porté de ingenierie.jsx (IngenierieFinanciere).
// Multi-scénarios persistés (brouillon / partagé / importé verrouillé), synthèse live,
// étape 7 branchée sur les lots réels (plans individuels enregistrés en base).
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useCrumbs } from "@/components/Shell/useCrumbs";
import { Icon } from "@/components/Icon";
import { Cascade } from "@/components/Cascade";
import { fmtEuro } from "@/lib/format";
import { computeFinance, computePlansIndividuels, type FinanceParams } from "@/lib/finance";
import { useCopro } from "@/api/copros";
import { useDonnees } from "@/api/donnees";
import {
  makeDefaultParams,
  readParams,
  useBareme,
  useCreateScenario,
  useScenarios,
  useUpdateScenario,
  useValidateScenario,
  type Scenario,
} from "@/api/scenarios";
import { Step1, Step2, Step3, Step4, Step5, Step6 } from "./steps";
import { Step7, buildOwners } from "./Step7";
import { ScenarioMenu, StatutPill } from "./ScenarioMenu";

const IEF_STEPS = [
  { label: "Chiffrage des travaux", sub: "Coût de l'opération" },
  { label: "Clé de répartition", sub: "Tantièmes / bâtiment" },
  { label: "Aides collectives", sub: "MPR Copro, CEE, Fonds" },
  { label: "Aides individuelles", sub: "Profils MaPrimeRénov'" },
  { label: "Configuration des prêts", sub: "Éco-PTZ collectif" },
  { label: "Reste à charge", sub: "Cascade de synthèse" },
  { label: "Validation", sub: "Plans de financement" },
];

export default function Ingenierie() {
  const { id, scenarioId } = useParams();
  const navigate = useNavigate();
  const { data: c } = useCopro(id);
  const { data: donnees } = useDonnees(id);
  const { data: bareme } = useBareme();
  const { data: scenarios, isLoading: scLoading } = useScenarios(id);
  const createScenario = useCreateScenario(id ?? "");
  const updateScenario = useUpdateScenario(id ?? "");
  const validateScenario = useValidateScenario(id ?? "");

  const [step, setStep] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [draft, setDraft] = useState<FinanceParams | null>(null);
  const [dirty, setDirty] = useState(false);
  const [plansCount, setPlansCount] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const creating = useRef(false);

  useCrumbs([
    { label: "Vos copropriétés", to: "/" },
    { label: c?.name ?? "…", to: `/copros/${id}` },
    { label: "Ingénierie financière" },
  ]);

  // Aucun scénario → on crée le scénario de base
  useEffect(() => {
    if (!scLoading && scenarios && scenarios.length === 0 && bareme && !creating.current) {
      creating.current = true;
      void createScenario
        .mutateAsync({ name: "Scénario de base", params: makeDefaultParams(bareme), baremeMillesime: bareme.millesime })
        .then((sc) => navigate(`/copros/${id}/ingenierie/${sc.id}`, { replace: true }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scLoading, scenarios, bareme]);

  const active: Scenario | undefined = useMemo(
    () => scenarios?.find((s) => s.id === scenarioId) ?? scenarios?.[0],
    [scenarios, scenarioId]
  );
  const locked = !!active?.locked;

  // (Re)charge le brouillon quand on change de scénario
  useEffect(() => {
    if (active && bareme) {
      setDraft(readParams(active.params, bareme));
      setDirty(false);
      setPlansCount(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id, bareme?.millesime]);

  if (!c || !bareme || !active || !draft) {
    return <div style={{ padding: 30, color: "var(--fg-muted)" }}>Préparation de l'assistant…</div>;
  }

  const ctx = { lots: c.stats?.lots ?? 0, lotsHab: c.stats?.lots_hab ?? 0 };
  const d = computeFinance(draft, ctx, bareme);
  const validated = !!active.validated_at && !dirty;

  const set = (patch: Partial<FinanceParams>) => {
    if (locked) return;
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
    setDirty(true);
  };

  const save = async () => {
    if (locked || !dirty) return;
    await updateScenario.mutateAsync({ id: active.id, params: draft });
    setDirty(false);
  };

  const switchTo = (scId: string) => {
    setMenuOpen(false);
    navigate(`/copros/${id}/ingenierie/${scId}`);
  };

  const addScenario = async () => {
    setMenuOpen(false);
    const sc = await createScenario.mutateAsync({
      name: `Nouveau scénario ${(scenarios?.length ?? 0) + 1}`,
      params: makeDefaultParams(bareme),
      baremeMillesime: bareme.millesime,
    });
    switchTo(sc.id);
  };

  const duplicateScenario = async (sc: Scenario) => {
    setMenuOpen(false);
    const copy = await createScenario.mutateAsync({
      name: `${sc.name} (copie)`,
      params: readParams(sc.params, bareme),
      baremeMillesime: sc.bareme_millesime ?? bareme.millesime,
    });
    switchTo(copy.id);
  };

  const togglePartage = (sc: Scenario) => {
    void updateScenario.mutateAsync({ id: sc.id, statut: sc.statut === "partage" ? "brouillon" : "partage" });
  };

  const onImportFile = async (f: File) => {
    const baseName = f.name.replace(/\.(xlsx|xls|csv)$/i, "");
    const sc = await createScenario.mutateAsync({
      name: baseName || "Plan importé",
      params: draft,
      statut: "importe",
      locked: true,
      baremeMillesime: bareme.millesime,
    });
    switchTo(sc.id);
  };

  const doValidate = async () => {
    if (!donnees) return;
    await save();
    const { owners, totalCle } = buildOwners(donnees, draft.cle);
    const res = await validateScenario.mutateAsync({
      scenarioId: active.id,
      params: draft,
      ctx,
      owners,
      totalCle,
      bareme,
    });
    setPlansCount(res.plansCount);
    setDirty(false);
  };

  const exportCsv = () => {
    if (!donnees) return;
    const { owners, totalCle } = buildOwners(donnees, draft.cle);
    const head = ["Copropriétaire", "Lots", "Tantièmes", "Quote-part", "MPR indiv", "CEE", "Subv coll", "Éco-PTZ", "Reste", "Mensualité"];
    const { plans } = computePlansIndividuels(draft, d, owners, bareme, totalCle);
    const lines = plans.map((p) =>
      [p.nom, p.lotNums.join(" "), p.tantiemes, p.quotePart, p.mprIndiv, p.cee, p.subvColl, p.ecoPtz, p.resteACharge, p.mensualite]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(";")
    );
    const blob = new Blob(["﻿" + [head.join(";"), ...lines].join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `plans-${c.name.toLowerCase().replace(/\s+/g, "-")}-${active.name.toLowerCase().replace(/\s+/g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const synthRows = [
    { l: "Aides collectives", v: d.aidesColl, k: "primary" as const },
    { l: "Aides individuelles", v: d.aidesIndiv, k: "primary" as const },
    { l: "Éco-PTZ mobilisé", v: d.ecoPtzMontant, k: "blue" as const },
  ];

  return (
    <div className="ief">
      <div className="ief-bar">
        <button className="back" onClick={() => navigate(`/copros/${id}/financement`)}>
          <Icon name="chevronLeft" size={16} />
          Retour au dossier
        </button>
        <div className="sc-switch">
          <button className={"sc-trigger" + (menuOpen ? " open" : "")} onClick={() => setMenuOpen((o) => !o)}>
            <span className="sc-meta">
              <span className="ttl">Ingénierie financière</span>
              <span className="sub">
                <span className="sc-name">{active.name}</span>
                <StatutPill sc={active} />
              </span>
            </span>
            <Icon name="chevronDown" size={16} className="sc-caret" />
          </button>
          {menuOpen && (
            <ScenarioMenu
              scenarios={scenarios ?? []}
              activeId={active.id}
              onSwitch={switchTo}
              onAdd={() => void addScenario()}
              onDuplicate={(sc) => void duplicateScenario(sc)}
              onImport={() => {
                setMenuOpen(false);
                fileRef.current?.click();
              }}
              onTogglePartage={togglePartage}
              onClose={() => setMenuOpen(false)}
            />
          )}
        </div>
        <span className="spacer"></span>
        <span className="prov-note">
          <Icon name="alert" size={13} />
          Non définitif · avant AG
        </span>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          style={{ display: "none" }}
          onChange={(e) => {
            if (e.target.files?.[0]) void onImportFile(e.target.files[0]);
            e.target.value = "";
          }}
        />
        <button className="se-btn se-btn-secondary btn-sm" onClick={() => fileRef.current?.click()}>
          <Icon name="upload" size={15} />
          Importer
        </button>
        <button className="se-btn se-btn-secondary btn-sm" onClick={exportCsv}>
          <Icon name="download" size={15} />
          Exporter
        </button>
        <button
          className={"se-btn btn-sm " + (dirty ? "se-btn-primary" : "se-btn-secondary")}
          onClick={() => void save()}
          disabled={!dirty || locked}
          style={{ opacity: !dirty || locked ? 0.5 : 1 }}
        >
          {updateScenario.isPending ? "Enregistrement…" : dirty ? "Enregistrer" : "Enregistré"}
        </button>
      </div>

      <div className="ief-body">
        <div className="ief-rail">
          {IEF_STEPS.map((st, i) => (
            <div key={i} style={{ display: "contents" }}>
              {i > 0 && <div className={"connector" + (step >= i ? " done" : "")}></div>}
              <button className={"ief-step" + (step === i ? " on" : "") + (step > i ? " done" : "")} onClick={() => setStep(i)}>
                <span className="num">{step > i ? <Icon name="check" size={14} /> : i + 1}</span>
                <span>
                  <span className="stp-lbl">{st.label}</span>
                  <span className="stp-sub" style={{ display: "block" }}>
                    {st.sub}
                  </span>
                </span>
              </button>
            </div>
          ))}
        </div>

        <div className={"ief-main" + (locked ? " locked" : "")}>
          {locked && (
            <div className="import-banner">
              <span className="ib-ico">
                <Icon name="lock" size={18} />
              </span>
              <div className="ib-txt">
                <div className="ib-t">Chiffres importés — lecture seule</div>
                <div className="ib-d">
                  Plan validé par des instances tierces. Dupliquez ce scénario pour ajuster les paramètres.
                </div>
              </div>
              <span style={{ flex: 1 }}></span>
              <button className="se-btn se-btn-secondary btn-sm" onClick={() => void duplicateScenario(active)}>
                <Icon name="copy" size={14} />
                Dupliquer pour éditer
              </button>
            </div>
          )}
          <fieldset className="ief-fields" disabled={locked}>
            {step === 0 && <Step1 s={draft} set={set} d={d} c={c} bareme={bareme} />}
            {step === 1 && <Step2 s={draft} set={set} d={d} c={c} bareme={bareme} cles={donnees?.cles ?? []} />}
            {step === 2 && <Step3 s={draft} set={set} d={d} c={c} bareme={bareme} />}
            {step === 3 && <Step4 s={draft} set={set} d={d} c={c} bareme={bareme} />}
            {step === 4 && <Step5 s={draft} set={set} d={d} c={c} bareme={bareme} />}
            {step === 5 && <Step6 d={d} />}
            {step === 6 && (
              <Step7
                s={draft}
                d={d}
                c={c}
                bareme={bareme}
                donnees={donnees}
                validated={validated}
                validating={validateScenario.isPending}
                plansCount={plansCount}
                onValidate={() => void doValidate()}
              />
            )}
          </fieldset>
        </div>

        <div className="ief-synth">
          <div className="sy-h">
            <Icon name="barChart" size={17} style={{ color: "var(--accent)" }} />
            Synthèse
          </div>
          <Cascade
            total={{ l: "Coût total TTC", v: d.coutTotal }}
            rows={synthRows}
            reste={{ l: "Reste à charge", v: d.resteACharge }}
          />
          <div className="sy-tiles">
            <div className="sy-tile">
              <div className="l">Taux d'aides</div>
              <div className="v accent">{Math.round(d.tauxAides * 100)} %</div>
            </div>
            <div className="sy-tile">
              <div className="l">Reste / lot moyen</div>
              <div className="v">{fmtEuro(d.parLot)}</div>
            </div>
            <div className="sy-tile">
              <div className="l">Aides totales</div>
              <div className="v">{fmtEuro(d.aidesColl + d.aidesIndiv)}</div>
            </div>
            <div className="sy-tile">
              <div className="l">Mensualité / lot</div>
              <div className="v">{fmtEuro(draft.ecoPtz && ctx.lots ? d.mensualiteEcoPtz / ctx.lots : 0)}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="ief-foot">
        <button
          className="se-btn se-btn-secondary btn-sm"
          disabled={step === 0}
          style={{ opacity: step === 0 ? 0.4 : 1 }}
          onClick={() => setStep((v) => Math.max(0, v - 1))}
        >
          <Icon name="chevronLeft" size={16} />
          Précédent
        </button>
        <span className="step-count">
          Étape {step + 1} / {IEF_STEPS.length} · {IEF_STEPS[step].label}
        </span>
        <span className="spacer"></span>
        {step < 6 ? (
          <button className="se-btn se-btn-primary btn-sm" onClick={() => setStep((v) => Math.min(6, v + 1))}>
            Suivant
            <Icon name="arrowRight" size={16} />
          </button>
        ) : (
          <button
            className="se-btn se-btn-primary btn-sm"
            onClick={() => void doValidate()}
            disabled={validated || locked || validateScenario.isPending}
            style={{ opacity: validated || locked ? 0.5 : 1 }}
          >
            <Icon name="checkCircle" size={16} />
            {validateScenario.isPending ? "Enregistrement…" : validated ? "Plans validés" : "Valider & recalculer les quote-parts"}
          </button>
        )}
      </div>
    </div>
  );
}

// Onglet Plans de financement - porté de detail.jsx (FinancementTab), branché sur les scénarios réels.
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "@/components/Icon";
import { Badge, DpePair, Progress } from "@/components/ui";
import {
  BANQUES,
  downloadAdhesionDoc,
  useAdhesions,
  useFinancementConfigAmo,
  useSaveFinancementConfig,
} from "@/api/financement";
import { fmtEuro, fmtEuroFull } from "@/lib/format";
import { libellesBatiments, type DpeClass } from "@/lib/referentiels";
import {
  computeFinance,
  computePlanDefinitif,
  couvreToutLaCopro,
  etatNotificationAides,
  itemsARepartirPf,
  readPlanDefinitif,
  lotsDuPerimetre,
  repartirPfDepuisLots,
  repartirPfs,
  tableauDepuisRepartition,
  type FinanceResult,
  type PlanDefinitifData,
  type VarianteTableauCopros,
} from "@/lib/finance";
import { readParams, useBareme, useChoixFinancementScenario, usePlansIndividuels, useScenarios } from "@/api/scenarios";
import { EcoPtzIndividuelPanel } from "@/pages/EcoPtzIndividuel";
import {
  estPlanEstimatif,
  groupesEstimatifs,
  useDeleteGroupeEstimatif,
  useDeletePlanDefinitif,
  libellePerimetre,
  montantsPontAJour,
  pfARepartir,
  plansValides,
  plansValidesEnConflit,
  pontAJour,
  useDupliquerPlanDefinitif,
  usePartagerPfCopros,
  usePlansDefinitifs,
  usePontPf,
  useUpdatePlanDefinitif,
  useValiderPlanDefinitif,
  type PlanDefinitif,
} from "@/api/planDefinitif";
import { useDonnees } from "@/api/donnees";
import { useProfilsCopro } from "@/api/enquete";
import { Modal } from "@/components/Modal";
import { VerificationSignature } from "@/components/VerificationSignature";
import { fmtDate } from "@/lib/format";
import type { CoproWithStats } from "@/api/copros";
import { StatutPill } from "@/pages/Ingenierie/ScenarioMenu";
import { ImportPlanDefinitifDialog } from "@/pages/PlanDefinitif/ImportPlanDefinitifDialog";
import type { PlanDefinitifResult } from "@/lib/finance";
import {
  ouvrirDocumentSignature,
  useBulletinsCopro,
  useMarquerInstruction,
  useRelancerSignataire,
} from "@/api/signature";
import { messageErreur } from "@/lib/erreurs";
import { useImporterTamponSyndic, useTamponOrganisation } from "@/api/tamponSyndic";
import { ACCEPT_TAMPON, LIBELLE_FORMATS_TAMPON } from "@/lib/tamponSyndic";
import { useEspacesCoproprietaires } from "@/api/espaces";
import { aujourdhuiParis, adhesionDepassee, dossierAdhesionDepose, dureePretDuPf, limiteAdhesion } from "@/lib/financement";
import { EnvoyerAdhesionFenetre, type ModeEmailAdhesion } from "./AdhesionEmail";

export function FinancementTab({ c }: { c: CoproWithStats }) {
  const navigate = useNavigate();
  const { data: scenarios, isLoading } = useScenarios(c.id);
  const { data: bareme } = useBareme();

  const shared = (scenarios ?? [])
    .filter((s) => s.statut === "partage" || s.statut === "importe")
    .sort((a, b) => (b.updated_at > a.updated_at ? 1 : -1))[0];
  const active = shared ?? (scenarios ?? [])[0];
  const { data: plans } = usePlansIndividuels(active?.id);
  const { data: choix } = useChoixFinancementScenario(active?.id);
  const { data: finConfig } = useFinancementConfigAmo(c.id);
  const { data: adhesions } = useAdhesions(c.id);
  // e-mails de la campagne d'adhésion (retours d'Amir du 11/10/2026) : qui écrire, qui a déposé son dossier
  const { data: donneesCopro } = useDonnees(c.id);
  const { data: espaces } = useEspacesCoproprietaires(c.id);
  const { data: bulletinsCopro } = useBulletinsCopro(c.id);
  // tampon du syndic (une image par organisation, 0163) : imprimé dans le cadre « cachet du Syndic »
  // de chaque bulletin d'adhésion
  const tamponQuery = useTamponOrganisation(c.organisation_id);
  const { data: pfPlans } = usePlansDefinitifs(c.id);
  const [pfChoisi, setPfChoisi] = useState<string | null>(null);
  const saveConfig = useSaveFinancementConfig(c.id);
  const [banque, setBanque] = useState<string>("CEGEE");
  const [duree, setDuree] = useState(15);
  // Parcours d'adhésion entièrement digital (Amir, 11/10/2026 : plus de lien de souscription de la
  // banque) : la case « campagne ouverte » ouvre le dossier d'adhésion du portail (bulletin + mandat
  // SEPA signés électroniquement), avec une date limite obligatoire pour le déposer et un e-mail aux
  // copropriétaires ; une dernière relance peut proposer une deuxième date limite.
  const [ouverte, setOuverte] = useState(false);
  const [dateLimiteAdh, setDateLimiteAdh] = useState("");
  const [emailAdhesion, setEmailAdhesion] = useState<ModeEmailAdhesion | null>(null);
  // Date limite du choix de financement dans le portail (0117, feedback du 30/09/2026).
  const [dateLimite, setDateLimite] = useState("");

  useEffect(() => {
    if (!finConfig) return;
    setBanque(finConfig.banque);
    setDuree(finConfig.duree_annees);
    setOuverte(finConfig.adhesion_ouverte);
    setDateLimiteAdh(finConfig.date_limite_adhesion ?? "");
    setDateLimite(finConfig.date_limite_choix ?? "");
  }, [finConfig]);

  // Durée du prêt indiquée par le PF validé (bug d'Amir du 13/10/2026 : le PF disait 20 ans, le champ
  // restait à 15). Elle est reprise à la validation du plan ; sans configuration enregistrée, le champ
  // la propose d'emblée, et un écart avec la durée enregistrée est signalé sous le champ.
  const planDuree = plansValides(pfPlans).find((p) => p.id === pfChoisi) ?? plansValides(pfPlans)[0];
  const dureePf = planDuree ? dureePretDuPf(readPlanDefinitif(planDuree.data).params.dureeEcoPtzAns) : null;
  useEffect(() => {
    if (finConfig === null && dureePf != null) setDuree(dureePf);
  }, [finConfig, dureePf]);

  // la date limite d'adhésion est exigée dès que la campagne est ouverte
  const ouvertureSansDate = ouverte && !dateLimiteAdh;
  // le tampon du syndic aussi : un bulletin signé ne se refait pas, il ne doit pas partir avec un
  // cadre « cachet du Syndic » vide (une campagne déjà ouverte n'est pas bloquée, seulement signalée)
  const tamponConnu = !c.organisation_id || tamponQuery.isSuccess;
  const sansTampon = tamponConnu && !tamponQuery.data?.image;
  const ouvertureSansTampon = ouverte && !finConfig?.adhesion_ouverte && (sansTampon || !tamponConnu);
  const configDirty =
    !finConfig ||
    finConfig.banque !== banque ||
    finConfig.duree_annees !== duree ||
    finConfig.adhesion_ouverte !== ouverte ||
    (finConfig.date_limite_adhesion ?? "") !== dateLimiteAdh ||
    (finConfig.date_limite_choix ?? "") !== dateLimite;

  if (isLoading || !bareme) return <div style={{ padding: 30, color: "var(--fg-muted)" }}>Chargement…</div>;

  // mode de financement choisi par fiche (le plus récent d'abord) et fiches dont le dossier d'adhésion est déposé
  const choixParFiche = new Map<string, string>();
  for (const x of choix ?? []) if (!choixParFiche.has(x.coproprietaire_id)) choixParFiche.set(x.coproprietaire_id, x.type);
  const fichesDeposees = new Set<string>([
    ...(bulletinsCopro ?? []).filter((b) => dossierAdhesionDepose([b])).map((b) => b.coproprietaire_id),
    ...(adhesions ?? []).filter((a) => dossierAdhesionDepose([], a.statut === "signee")).map((a) => a.coproprietaire_id),
  ]);

  const openAssistant = () => navigate(`/copros/${c.id}/ingenierie${active ? `/${active.id}` : ""}`);

  // Le PF définitif validé fait foi : il remplit automatiquement les panneaux
  // de l'onglet (coût d'opération, aides, reste à charge, indicateurs). Un PF
  // par bâtiment (11/10/2026) : les panneaux suivent le plan choisi.
  const valides = plansValides(pfPlans);
  const planValide = valides.find((p) => p.id === pfChoisi) ?? valides[0];
  // Recalcul depuis les données du plan (moteur pur) plutôt que l'instantané
  // `resultat` : un instantané figé avec une ancienne version du moteur
  // afficherait des montants périmés.
  const pvData = planValide ? readPlanDefinitif(planValide.data) : null;
  const pv: PlanDefinitifResult | null = pvData ? computePlanDefinitif(pvData) : null;
  const openPfValide = () => planValide && navigate(`/copros/${c.id}/plan-definitif/${planValide.id}`);

  if (!active) {
    return (
      <div className="fade" style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <PlanEstimatifPanel coproId={c.id} coproNom={c.name} />
        <PlanDefinitifPanel coproId={c.id} coproNom={c.name} denomination={c.denomination_batiments} />
        <ChoixPlanBatimentPanel c={c} valides={valides} choisi={planValide?.id ?? null} onChoisir={setPfChoisi} />
        {planValide && pv && pvData ? (
          <div className="detail-grid">
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              <PanelCoutOperationPf plan={planValide} pv={pv} />
              <PanelIngenieriePf pv={pv} fondsTravaux={pvData.params.fondsTravaux} onOpen={openPfValide} />
            </div>
            <PlansIndividuelsPfPanel coproId={c.id} coproNom={c.name} plan={planValide} pv={pv} pvData={pvData} valides={valides} />
          </div>
        ) : (
          <div className="placeholder-screen">
            <div className="ps-ico">
              <Icon name="euro" size={28} />
            </div>
            <h2>Financement à venir</h2>
            <p>Le chiffrage et le plan de financement seront établis à l'issue du diagnostic, en phase Études.</p>
            <button className="se-btn se-btn-primary" style={{ marginTop: 22 }} onClick={openAssistant}>
              <Icon name="barChart" size={17} />
              Démarrer l'ingénierie financière
            </button>
          </div>
        )}
      </div>
    );
  }

  const params = readParams(active.params, bareme);
  const d: FinanceResult =
    (active.resultat as unknown as FinanceResult | null) ??
    computeFinance(params, { lots: c.stats?.lots ?? 0, lotsHab: c.stats?.lots_hab ?? 0 }, bareme);
  const gainPct = pv ? pv.performancePct : c.gain_pct;
  const seuilAtteint = (gainPct ?? 0) >= bareme.mprCopro.seuilMin;
  const seuilMajoreAtteint = (gainPct ?? 0) >= bareme.mprCopro.seuilMajore;
  // Étiquettes : celles du PF définitif validé (initiale → projet) en priorité.
  const lireEtiquette = (s: string | undefined): DpeClass | null => {
    const l = (s ?? "").trim().toUpperCase().slice(0, 1);
    return "ABCDEFG".includes(l) && l !== "" ? (l as DpeClass) : null;
  };
  const etiquetteAvant = lireEtiquette(pvData?.infos.etiquetteInitiale) ?? (c.energy_before as DpeClass | null);
  const etiquetteApres = lireEtiquette(pvData?.infos.etiquetteProjet) ?? (c.energy_after as DpeClass | null);

  return (
    <div className="detail-grid fade">
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <PlanEstimatifPanel coproId={c.id} coproNom={c.name} />
        <PlanDefinitifPanel coproId={c.id} coproNom={c.name} denomination={c.denomination_batiments} />
        <ChoixPlanBatimentPanel c={c} valides={valides} choisi={planValide?.id ?? null} onChoisir={setPfChoisi} />
        {planValide && pv ? (
          <PanelCoutOperationPf plan={planValide} pv={pv} />
        ) : (
          <div className="panel">
            <div className="p-head">
              <Icon name="euro" size={18} />
              <h3>Scénario · {active.name}</h3>
              <span style={{ flex: 1 }}></span>
              <StatutPill sc={active} />
            </div>
            <div className="p-body">
              <div className="kv">
                <span className="k">Travaux</span>
                <span className="v">{fmtEuro(params.travaux)}</span>
              </div>
              <div className="kv">
                <span className="k">Honoraires</span>
                <span className="v">{fmtEuro(params.honoraires)}</span>
              </div>
              <div className="kv">
                <span className="k">Aléas</span>
                <span className="v">{fmtEuro(params.aleas)}</span>
              </div>
              <div className="kv" style={{ borderTop: "1px solid var(--border)", marginTop: 4, paddingTop: 12 }}>
                <span className="k" style={{ fontWeight: 700, color: "var(--fg1)" }}>
                  Coût total TTC
                </span>
                <span className="v" style={{ fontFamily: "var(--font-display)", fontSize: 18 }}>
                  {fmtEuroFull(d.coutTotal)}
                </span>
              </div>
            </div>
          </div>
        )}
        {planValide && pv && pvData ? (
          <PanelIngenieriePf pv={pv} fondsTravaux={pvData.params.fondsTravaux} onOpen={openPfValide} />
        ) : (
          <div className="panel">
            <div className="p-head">
              <Icon name="barChart" size={18} />
              <h3>Ingénierie financière</h3>
              <span style={{ flex: 1 }}></span>
              <button className="se-btn se-btn-ghost btn-sm" onClick={openAssistant}>
                Ouvrir l'assistant 7 étapes
                <Icon name="arrowRight" size={15} />
              </button>
            </div>
            <div className="p-body">
              {[
                { l: "Aides collectives (MPR Copro, CEE, Fonds)", v: d.aidesColl, blue: false },
                { l: "Aides individuelles (MPR profils)", v: d.aidesIndiv, blue: true },
                { l: "Éco-PTZ collectif mobilisé", v: d.ecoPtzMontant, blue: true },
                { l: "Reste à charge copropriété", v: d.resteACharge, blue: false },
              ].map((row) => (
                <div key={row.l} style={{ marginBottom: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 6 }}>
                    <span>{row.l}</span>
                    <span style={{ fontWeight: 700 }}>{fmtEuro(row.v)}</span>
                  </div>
                  <Progress value={d.coutTotal ? (row.v / d.coutTotal) * 100 : 0} blue={row.blue} />
                </div>
              ))}
              {!active.validated_at && (
                <p className="se-small" style={{ color: "var(--fg-muted)" }}>
                  Scénario non validé - les montants sont calculés à la volée. Validez l'étape 7 pour figer les plans.
                </p>
              )}
            </div>
          </div>
        )}
        <div className="panel">
          <div className="p-head">
            <Icon name="users" size={18} />
            <h3>Prêt collectif - adhésions</h3>
            <span style={{ flex: 1 }}></span>
            <Badge kind={ouverte ? "success" : "neutral"}>{ouverte ? "Campagne ouverte sur le portail" : "Fermée"}</Badge>
          </div>
          <div className="p-body">
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <label style={{ fontSize: 12.5, color: "var(--fg2)" }}>Banque partenaire</label>
                <select className="edit-inp" value={banque} onChange={(e) => setBanque(e.target.value)}>
                  {BANQUES.map((b) => (
                    <option key={b} value={b} disabled={b !== "CEGEE"}>
                      {b}{b !== "CEGEE" ? " (bientôt)" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <label style={{ fontSize: 12.5, color: "var(--fg2)" }}>Durée votée en AG (ans)</label>
                <input
                  className="edit-inp"
                  type="number"
                  min={3}
                  max={20}
                  style={{ width: 90 }}
                  value={duree}
                  onChange={(e) => setDuree(Number(e.target.value))}
                />
                {dureePf != null && dureePf !== duree && (
                  <button
                    type="button"
                    className="se-btn se-btn-ghost btn-sm"
                    title="Le plan de financement définitif validé indique une autre durée : la reprendre (puis Enregistrer)"
                    onClick={() => setDuree(dureePf)}
                  >
                    Le PF indique {dureePf} ans : reprendre
                  </button>
                )}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <label
                  style={{ fontSize: 12.5, color: "var(--fg2)" }}
                  title="Dernier jour où les copropriétaires peuvent choisir ou modifier leur financement depuis leur portail. Vide : sans limite. Après cette date, vous et le syndic pouvez encore saisir un choix pour eux."
                >
                  Choix modifiable jusqu'au
                </label>
                <input
                  className="edit-inp"
                  type="date"
                  value={dateLimite}
                  onChange={(e) => setDateLimite(e.target.value)}
                />
              </div>
              <label
                style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13.5, cursor: "pointer", paddingBottom: 8 }}
                title="Ouvre le dossier d'adhésion du portail : bulletin pré-rempli et mandat SEPA, signés électroniquement. Une date limite est exigée, et les copropriétaires reçoivent un e-mail."
              >
                <input type="checkbox" checked={ouverte} onChange={(e) => setOuverte(e.target.checked)} />
                Adhésions ouvertes sur le portail
              </label>
              {ouverte && (
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  <label
                    style={{ fontSize: 12.5, color: "var(--fg2)" }}
                    title="Dernier jour (inclus) pour déposer un dossier d'adhésion au prêt collectif : bulletin et mandat SEPA signés. L'éco-PTZ individuel et les fonds propres n'ont pas de date limite propre. Passé ce jour, seuls les dossiers déjà déposés restent ouverts, pour ajouter des pièces pendant l'instruction."
                  >
                    Date limite d'adhésion au prêt collectif *
                  </label>
                  <input
                    className="edit-inp"
                    type="date"
                    value={dateLimiteAdh}
                    disabled={!!finConfig?.date_limite_adhesion_2}
                    title={finConfig?.date_limite_adhesion_2 ? "Une dernière relance a fixé une deuxième date limite : la première n'est plus modifiable." : undefined}
                    onChange={(e) => setDateLimiteAdh(e.target.value)}
                  />
                </div>
              )}
              <button
                className="se-btn se-btn-secondary btn-sm"
                style={{ marginBottom: 4 }}
                disabled={!configDirty || ouvertureSansDate || ouvertureSansTampon || saveConfig.isPending || duree < 3 || duree > 20}
                onClick={() => {
                  // ouverture de la campagne : l'e-mail aux copropriétaires est proposé une fois la config enregistrée
                  const ouvre = ouverte && !finConfig?.adhesion_ouverte;
                  saveConfig.mutate(
                    {
                      banque,
                      dureeAnnees: duree,
                      adhesionOuverte: ouverte,
                      dateLimiteChoix: dateLimite || null,
                      dateLimiteAdhesion: dateLimiteAdh || null,
                    },
                    { onSuccess: () => ouvre && setEmailAdhesion("ouverture") }
                  );
                }}
              >
                {saveConfig.isPending ? "Enregistrement…" : "Enregistrer"}
              </button>
            </div>

            {ouvertureSansDate && (
              <p className="se-small" style={{ color: "var(--color-error-700)", margin: "10px 0 0" }}>
                Indiquez la date limite d'adhésion au prêt collectif pour ouvrir la campagne.
              </p>
            )}
            <TamponSyndicBloc
              organisationId={c.organisation_id}
              nomSyndic={c.organisation?.nom ?? c.syndic_name}
              exige={ouvertureSansTampon}
              campagneOuverte={!!finConfig?.adhesion_ouverte}
            />
            <p className="se-small" style={{ color: "var(--fg-muted)", margin: "12px 0 0" }}>
              {ouverte
                ? "Le copropriétaire remplit son dossier d'adhésion dans le portail : bulletin pré-rempli et mandat SEPA, signés électroniquement avec un code reçu par e-mail. L'éco-PTZ individuel et les fonds propres n'ont pas de date limite propre ; après la date limite d'adhésion, un copropriétaire qui a déposé son dossier peut encore y ajouter des pièces pendant l'instruction."
                : "Sans campagne ouverte, le portail enregistre le choix du copropriétaire et lui annonce que le dossier d'adhésion ouvrira bientôt."}
            </p>

            {finConfig?.adhesion_ouverte && (
              <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
                {(() => {
                  const limite = limiteAdhesion(finConfig);
                  const depassee = adhesionDepassee(limite, aujourdhuiParis());
                  return (
                    <>
                      <div className="kv">
                        <span className="k">Date limite d'adhésion</span>
                        <span className="v">
                          {limite ? fmtDate(limite) : "-"}
                          {finConfig.date_limite_adhesion_2 ? " (deuxième date)" : ""}
                          {depassee && (
                            <>
                              {" "}
                              <Badge kind="warn">Dépassée</Badge>
                            </>
                          )}
                        </span>
                      </div>
                      <div className="kv">
                        <span className="k">E-mail d'ouverture</span>
                        <span className="v">
                          {finConfig.adhesion_email_le
                            ? `Envoyé le ${fmtDate(finConfig.adhesion_email_le)}${finConfig.adhesion_email_nb != null ? ` à ${finConfig.adhesion_email_nb} copropriétaire${finConfig.adhesion_email_nb > 1 ? "s" : ""}` : ""}`
                            : "Pas encore envoyé"}
                        </span>
                      </div>
                      <div className="kv">
                        <span className="k">Dernière relance</span>
                        <span className="v">
                          {finConfig.relance_adhesion_le
                            ? `Envoyée le ${fmtDate(finConfig.relance_adhesion_le)}${finConfig.relance_adhesion_nb != null ? ` à ${finConfig.relance_adhesion_nb} copropriétaire${finConfig.relance_adhesion_nb > 1 ? "s" : ""}` : ""}`
                            : "Pas encore faite (une seule relance est possible, avec une deuxième date limite)"}
                        </span>
                      </div>
                    </>
                  );
                })()}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button className="se-btn se-btn-ghost btn-sm" onClick={() => setEmailAdhesion("ouverture")}>
                    <Icon name="mail" size={14} />
                    {finConfig.adhesion_email_le ? "Renvoyer l'e-mail d'ouverture" : "Envoyer l'e-mail d'ouverture"}
                  </button>
                  {!finConfig.date_limite_adhesion_2 && finConfig.date_limite_adhesion && (
                    <button className="se-btn se-btn-secondary btn-sm" onClick={() => setEmailAdhesion("relance")}>
                      <Icon name="send" size={14} />
                      Dernière relance
                    </button>
                  )}
                </div>
              </div>
            )}

            <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 2 }}>
              {(adhesions ?? []).length === 0 ? (
                <p className="se-small" style={{ color: "var(--fg-muted)", margin: 0 }}>
                  Aucun dossier d'adhésion pour l'instant - les copropriétaires y accèdent depuis leur portail après avoir
                  choisi le prêt collectif, une fois la campagne ouverte.
                </p>
              ) : (
                (adhesions ?? []).map((a, i, arr) => {
                  const bulletins = (a.bulletins as { lotNum: string; path: string }[] | null) ?? [];
                  return (
                    <div
                      key={a.id}
                      className="task-row"
                      style={{ padding: "11px 4px", borderBottom: i < arr.length - 1 ? "1px solid var(--border)" : "none" }}
                    >
                      <Icon name={a.statut === "signee" ? "checkCircle" : "clock"} size={16}
                        style={{ color: a.statut === "signee" ? "var(--color-success-500)" : "var(--fg-muted)" }} />
                      <div style={{ minWidth: 0 }}>
                        <div className="t-title" style={{ fontSize: 13 }}>
                          {a.coproprietaire?.nom ?? "-"}
                        </div>
                        <div className="t-copro">
                          {a.statut === "signee"
                            ? bulletins.length
                              ? `Signé · ${bulletins.length} bulletin${bulletins.length > 1 ? "s" : ""}`
                              : "Signé électroniquement (détail ci-dessous)"
                            : "En préparation ou en signature"}
                          {a.rib_concordance === "concordant" && " · RIB concordant"}
                          {a.rib_concordance === "discordant" && " · ⚠ IBAN ≠ RIB"}
                          {a.rib_concordance === "non_verifie" && " · RIB à vérifier"}
                        </div>
                      </div>
                      <span className="spacer"></span>
                      {a.statut === "signee" && (
                        <>
                          {bulletins.map((b) => (
                            <button
                              key={b.path}
                              className="icon-btn"
                              title={`Bulletin lot n°${b.lotNum}`}
                              onClick={() => void downloadAdhesionDoc(b.path, `bulletin-${a.coproprietaire?.nom ?? "adherent"}-lot-${b.lotNum}.pdf`)}
                            >
                              <Icon name="fileText" size={16} />
                            </button>
                          ))}
                          {a.sepa_path && (
                            <button
                              className="icon-btn"
                              title="Mandat SEPA pré-rempli"
                              onClick={() => void downloadAdhesionDoc(a.sepa_path!, `sepa-${a.coproprietaire?.nom ?? "adherent"}.pdf`)}
                            >
                              <Icon name="download" size={16} />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
        {emailAdhesion && finConfig && (
          <EnvoyerAdhesionFenetre
            key={emailAdhesion}
            mode={emailAdhesion}
            copro={c.name}
            coproId={c.id}
            config={finConfig}
            fiches={donneesCopro?.coproprietaires ?? []}
            espaces={espaces}
            choixParFiche={choixParFiche}
            deposees={fichesDeposees}
            onClose={() => setEmailAdhesion(null)}
          />
        )}
        <EcoPtzIndividuelPanel coproId={c.id} />
        <SignaturesElectroniquesPanel coproId={c.id} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div className="panel">
          <div className="p-head">
            <Icon name="trendingUp" size={18} />
            <h3>Indicateurs{valides.length > 1 && planValide ? ` · ${planValide.nom}` : ""}</h3>
          </div>
          <div className="p-body">
            <div className="kv">
              <span className="k">Gain énergétique</span>
              <span className="v" style={{ color: "var(--color-primary-700)" }}>
                {pv ? `+${pv.performancePct.toFixed(1).replace(".", ",")} %` : c.gain_pct != null ? `+${c.gain_pct} %` : "-"}
              </span>
            </div>
            <div className="kv">
              <span className="k">Seuil {bareme.mprCopro.seuilMin} %</span>
              <span className="v">
                <Badge kind={seuilAtteint ? "success" : "warn"}>{seuilAtteint ? "Atteint" : "Non atteint"}</Badge>
              </span>
            </div>
            <div className="kv">
              <span className="k">Seuil {bareme.mprCopro.seuilMajore} %</span>
              <span className="v">
                <Badge kind={seuilMajoreAtteint ? "success" : "warn"}>
                  {seuilMajoreAtteint ? "Atteint" : "Non atteint"}
                </Badge>
              </span>
            </div>
            <div className="kv">
              <span className="k">Taux d'aides</span>
              <span className="v">{Math.round((pv ? pv.tauxCouverture : d.tauxAides) * 100)} %</span>
            </div>
            <div className="kv">
              <span className="k">Étiquette visée</span>
              <span className="v">
                <DpePair before={etiquetteAvant} after={etiquetteApres} />
              </span>
            </div>
          </div>
        </div>
        {planValide && pv && pvData ? (
          <PlansIndividuelsPfPanel coproId={c.id} coproNom={c.name} plan={planValide} pv={pv} pvData={pvData} valides={valides} />
        ) : (
        <div className="panel">
          <div className="p-head">
            <Icon name="fileText" size={18} />
            <h3>Plans individuels</h3>
            <span style={{ flex: 1 }}></span>
            <span style={{ fontSize: 13, color: "var(--fg-muted)" }}>{plans?.length ?? 0}</span>
          </div>
          <div className="p-body" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {(plans ?? []).length === 0 ? (
              <p className="se-body" style={{ margin: 0, color: "var(--fg-muted)" }}>
                Aucun plan généré - validez le plan de financement définitif : les plans individuels seront
                répartis suivant les clés de tantièmes de la copropriété.
              </p>
            ) : (
              <>
                {(plans ?? []).slice(0, 5).map((p, i, arr) => (
                  <div
                    key={p.id}
                    className="task-row"
                    role="button"
                    tabIndex={0}
                    title="Ouvrir le portail de ce copropriétaire (aperçu AMO)"
                    onClick={() => navigate(`/portail?cp=${p.coproprietaire_id}`)}
                    onKeyDown={(e) => e.key === "Enter" && navigate(`/portail?cp=${p.coproprietaire_id}`)}
                    style={{
                      padding: "11px 4px",
                      borderBottom: i < arr.length - 1 ? "1px solid var(--border)" : "none",
                      cursor: "pointer",
                    }}
                  >
                    <Icon name="user" size={16} style={{ color: "var(--fg-muted)" }} />
                    <div>
                      <div className="t-title" style={{ fontSize: 13 }}>
                        {(p as { coproprietaires: { nom: string } | null }).coproprietaires?.nom ?? "-"}
                      </div>
                      <div className="t-copro">
                        Quote-part {fmtEuro(p.quote_part)} · reste {fmtEuro(p.reste)}
                      </div>
                    </div>
                    <span className="spacer"></span>
                    <Icon name="arrowRight" size={16} style={{ color: "var(--accent)" }} />
                  </div>
                ))}
                <button className="se-btn se-btn-ghost btn-sm" style={{ marginTop: 8, alignSelf: "flex-start" }} onClick={openAssistant}>
                  Voir les {plans?.length} plans
                  <Icon name="arrowRight" size={15} />
                </button>
              </>
            )}
          </div>
        </div>
        )}
        <div className="panel">
          <div className="p-head">
            <Icon name="users" size={18} />
            <h3>Choix de financement (portail)</h3>
            <span style={{ flex: 1 }}></span>
            <span style={{ fontSize: 13, color: "var(--fg-muted)" }}>{choix?.length ?? 0}</span>
          </div>
          <div className="p-body" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {(choix ?? []).length === 0 ? (
              <p className="se-body" style={{ margin: 0, color: "var(--fg-muted)" }}>
                Aucun choix transmis - les copropriétaires choisissent leur financement depuis leur portail.
              </p>
            ) : (
              (choix ?? []).map((ch, i, arr) => (
                <div
                  key={ch.id}
                  className="task-row"
                  style={{ padding: "11px 4px", borderBottom: i < arr.length - 1 ? "1px solid var(--border)" : "none" }}
                >
                  <Icon
                    name={ch.type === "collectif" ? "users" : ch.type === "individuel" ? "user" : "euro"}
                    size={16}
                    style={{ color: "var(--fg-muted)" }}
                  />
                  <div>
                    <div className="t-title" style={{ fontSize: 13 }}>
                      {(ch as { coproprietaires: { nom: string } | null }).coproprietaires?.nom ?? "-"}
                    </div>
                    <div className="t-copro">
                      {ch.type === "collectif"
                        ? `Prêt collectif · ${ch.duree_annees ?? "-"} ans`
                        : ch.type === "individuel"
                          ? `Prêt individuel · ${ch.lot_ids.length} lot${ch.lot_ids.length > 1 ? "s" : ""}`
                          : "Fonds propres"}
                      {" · " + fmtDate(ch.transmitted_at)}
                      {ch.saisi_par === "syndic" ? " · saisi par le syndic" : ch.saisi_par === "amo" ? " · saisi par Strat Eco" : ""}
                    </div>
                  </div>
                  <span className="spacer"></span>
                  <Badge kind={ch.type === "fonds" ? "neutral" : "primary"} dot>
                    {ch.type === "collectif" ? "Collectif" : ch.type === "individuel" ? "Individuel" : "Fonds propres"}
                  </Badge>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Plans de financement définitifs (nomenclature chef de projet) : import du
 * classeur Excel, liste des plans, ouverture de l'éditeur avec recalcul.
 */
function PlanDefinitifPanel({
  coproId,
  coproNom,
  denomination,
}: {
  coproId: string;
  coproNom: string;
  denomination: string | null;
}) {
  const navigate = useNavigate();
  // Les scénarios d'un PF estimatif ont leur propre panneau (comparatif)
  const { data: tous } = usePlansDefinitifs(coproId);
  const plans = (tous ?? []).filter((p) => !estPlanEstimatif(p));
  const { data: donnees } = useDonnees(coproId);
  const batiments = donnees?.batiments ?? [];
  const del = useDeletePlanDefinitif(coproId);
  const valider = useValiderPlanDefinitif(coproId);
  const dupliquer = useDupliquerPlanDefinitif(coproId);
  const [importOpen, setImportOpen] = useState(false);
  // Un seul plan validé par périmètre : valider repasse en brouillon les plans
  // validés du même bâtiment (ou de toute la copropriété) - confirmé avant dans
  // une copropriété à plusieurs bâtiments (ailleurs, une nouvelle version
  // remplace l'ancienne sans question, comme avant).
  const validerPlan = (p: PlanDefinitif) => {
    const conflits = plansValidesEnConflit(tous, p.id, p.batiment_ids);
    if (
      batiments.length > 1 &&
      conflits.length > 0 &&
      !window.confirm(
        `Valider « ${p.nom} » repassera en brouillon : « ${conflits.map((x) => x.nom).join(" », « ")} ».\n\n` +
          "Pour garder un plan validé par bâtiment, ouvrez chaque plan et choisissez les bâtiments qu'il couvre (périmètre). " +
          "Continuer ?"
      )
    )
      return;
    valider.mutate({ id: p.id, valider: true, coproNom });
  };

  return (
    <div className="panel">
      <div className="p-head">
        <Icon name="fileCheck" size={18} />
        <h3>Plan de financement définitif</h3>
        <span style={{ flex: 1 }}></span>
        <button className="se-btn se-btn-secondary btn-sm" onClick={() => setImportOpen(true)}>
          <Icon name="upload" size={15} />
          Importer un classeur
        </button>
      </div>
      <div className="p-body" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {(plans ?? []).length === 0 ? (
          <p className="se-body" style={{ margin: 0, color: "var(--fg-muted)" }}>
            Aucun plan définitif - importez le classeur Excel du chef de projet (onglets « PF définitif Eco PTZ
            collectif / individuel » + lots avec colonne « Retenu ») : le logiciel reconnaît la nomenclature et
            recalcule le plan à chaque modification. Un PF estimatif à plusieurs scénarios (une colonne par
            scénario) s'importe par le même bouton.
            {batiments.length > 1 &&
              " Plusieurs bâtiments : un plan peut couvrir toute la copropriété ou seulement certains bâtiments (périmètre choisi dans le plan), avec un plan validé par bâtiment."}
          </p>
        ) : (
          (plans ?? []).map((p, i, arr) => {
            const res: PlanDefinitifResult | null = p.data ? computePlanDefinitif(readPlanDefinitif(p.data)) : null;
            return (
              <div
                key={p.id}
                className="task-row"
                style={{ padding: "11px 4px", borderBottom: i < arr.length - 1 ? "1px solid var(--border)" : "none", cursor: "pointer" }}
                onClick={() => navigate(`/copros/${coproId}/plan-definitif/${p.id}`)}
              >
                <Icon name="fileText" size={16} style={{ color: "var(--color-secondary-500)" }} />
                <div style={{ minWidth: 0 }}>
                  <div className="t-title" style={{ fontSize: 13 }}>
                    {p.nom}
                  </div>
                  <div className="t-copro">
                    {batiments.length > 1 && (
                      <b style={{ fontWeight: 600 }}>{libellePerimetre(p.batiment_ids, batiments, denomination)} · </b>
                    )}
                    {res
                      ? `Opération ${fmtEuro(res.totalOperationTtc)} · aides ${fmtEuro(res.totalAides)} · reste à charge ${fmtEuro(res.resteACharge)}`
                      : "À compléter"}
                    {" · maj " + fmtDate(p.updated_at)}
                    {p.statut === "valide" &&
                      (p.valide_fichier_id
                        ? ` · v${p.version} archivée dans Fichiers${p.valide_le ? ` le ${fmtDate(p.valide_le)}` : ""}`
                        : " · non archivé dans Fichiers (ouvrir le plan pour l'archiver)")}
                  </div>
                </div>
                <span className="spacer"></span>
                <Badge kind={p.statut === "valide" ? "success" : p.statut === "partage" ? "blue" : "neutral"}>
                  {p.statut === "valide" ? "Validé" : p.statut === "partage" ? "Partagé" : "Brouillon"}
                </Badge>
                {p.statut === "valide" ? (
                  <button
                    className="se-btn se-btn-ghost btn-sm"
                    title="Repasser ce plan en brouillon - les panneaux du financement ne seront plus remplis à partir de ce plan"
                    disabled={valider.isPending}
                    onClick={(e) => {
                      e.stopPropagation();
                      valider.mutate({ id: p.id, valider: false });
                    }}
                  >
                    Repasser en brouillon
                  </button>
                ) : (
                  <button
                    className="se-btn se-btn-secondary btn-sm"
                    title="Valider ce plan : les panneaux du financement (coût d'opération, aides, reste à charge, indicateurs) se remplissent automatiquement"
                    disabled={valider.isPending}
                    onClick={(e) => {
                      e.stopPropagation();
                      validerPlan(p);
                    }}
                  >
                    <Icon name="checkCircle" size={14} />
                    Valider
                  </button>
                )}
                {batiments.length > 1 && (
                  <button
                    className="icon-btn"
                    title="Dupliquer ce plan en brouillon - point de départ du plan d'un autre bâtiment"
                    disabled={dupliquer.isPending}
                    onClick={(e) => {
                      e.stopPropagation();
                      dupliquer.mutate(p, { onSuccess: (row) => navigate(`/copros/${coproId}/plan-definitif/${row.id}`) });
                    }}
                  >
                    <Icon name="copy" size={15} />
                  </button>
                )}
                <button
                  className="icon-btn"
                  title="Supprimer ce plan"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (window.confirm(`Supprimer « ${p.nom} » ?`)) del.mutate(p.id);
                  }}
                >
                  <Icon name="trash" size={15} />
                </button>
              </div>
            );
          })
        )}
      </div>
      {importOpen && <ImportPlanDefinitifDialog coproId={coproId} coproNom={coproNom} onClose={() => setImportOpen(false)} />}
    </div>
  );
}

/**
 * Plans par bâtiment (demande d'Amir, 11/10/2026) : choix du PF validé que
 * suivent les panneaux de l'onglet, totaux de tous les PF validés et bâtiments
 * dont les lots ne relèvent encore d'aucun PF validé. Masqué tant qu'un seul
 * PF couvre toute la copropriété.
 */
function ChoixPlanBatimentPanel({
  c,
  valides,
  choisi,
  onChoisir,
}: {
  c: CoproWithStats;
  valides: PlanDefinitif[];
  choisi: string | null;
  onChoisir: (id: string) => void;
}) {
  const { data: donnees } = useDonnees(c.id);
  if (valides.length === 0 || (valides.length === 1 && couvreToutLaCopro(valides[0].batiment_ids))) return null;
  const batiments = donnees?.batiments ?? [];
  const lots = donnees?.lots ?? [];
  const resultats = valides.map((p) => pfARepartir(p).resultat);
  const somme = (f: (r: PlanDefinitifResult) => number) => resultats.reduce((s, r) => s + f(r), 0);
  const totalOperation = somme((r) => r.totalOperationTtc);
  const toutCouvert = valides.some((p) => couvreToutLaCopro(p.batiment_ids));
  const couverts = new Set(valides.flatMap((p) => p.batiment_ids ?? []));
  const avecLots = new Set(lots.map((l) => l.batiment_id).filter((id): id is string => !!id));
  const nonCouverts = toutCouvert ? [] : batiments.filter((b) => avecLots.has(b.id) && !couverts.has(b.id));
  const lotsSansBatiment = toutCouvert ? 0 : lots.filter((l) => !l.batiment_id).length;
  const lb = libellesBatiments(c.denomination_batiments);

  return (
    <div className="panel">
      <div className="p-head">
        <Icon name="building" size={18} />
        <h3>Plans par {lb.singulier.toLowerCase()}</h3>
        <span style={{ flex: 1 }}></span>
        <Badge kind="success" dot>
          {valides.length} PF validé{valides.length > 1 ? "s" : ""}
        </Badge>
      </div>
      <div className="p-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {valides.length > 1 && (
          <div className="seg" style={{ alignSelf: "flex-start", flexWrap: "wrap" }}>
            {valides.map((p) => (
              <button
                key={p.id}
                className={p.id === choisi ? "on" : ""}
                title={p.nom}
                onClick={() => onChoisir(p.id)}
              >
                {libellePerimetre(p.batiment_ids, batiments, c.denomination_batiments)}
              </button>
            ))}
          </div>
        )}
        <p className="se-small" style={{ margin: 0, color: "var(--fg-muted)" }}>
          Les panneaux ci-dessous suivent le plan choisi ; chaque plan est réparti entre les seuls lots de son
          périmètre. Ensemble des PF validés : opération {fmtEuro(totalOperation)} · aides{" "}
          {fmtEuro(somme((r) => r.totalAides))} · reste à charge {fmtEuro(somme((r) => r.resteACharge))}. Le
          syndic, les appels de fonds et le portail additionnent les plans (un plan cumulé par copropriétaire).
        </p>
        {(nonCouverts.length > 0 || lotsSansBatiment > 0) && (
          <p className="se-small" style={{ margin: 0, color: "var(--color-warning-700)" }}>
            <Icon name="alert" size={12} />{" "}
            {nonCouverts.length > 0 &&
              `Sans PF validé : ${nonCouverts.map((b) => `${lb.court} ${b.code}`).join(", ")} - leurs copropriétaires n'ont pas de quote-part. `}
            {lotsSansBatiment > 0 &&
              `${lotsSansBatiment} lot${lotsSansBatiment > 1 ? "s" : ""} sans bâtiment n'entre${lotsSansBatiment > 1 ? "nt" : ""} dans aucun plan par bâtiment (onglet Données).`}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * PF estimatif à plusieurs scénarios (classeur « PF estimatif » du chef de
 * projet, une colonne par scénario) : scénarios importés ensemble, ouverts
 * un par un dans l'éditeur ou comparés côte à côte. Affiché dès qu'un PF
 * estimatif existe ; l'import passe par « Importer un classeur », qui
 * reconnaît la nomenclature.
 */
function PlanEstimatifPanel({ coproId, coproNom }: { coproId: string; coproNom: string }) {
  const navigate = useNavigate();
  const { data: plans } = usePlansDefinitifs(coproId);
  const del = useDeleteGroupeEstimatif(coproId);
  const [importOpen, setImportOpen] = useState(false);
  const groupes = groupesEstimatifs(plans);
  if (groupes.length === 0) return null;

  return (
    <div className="panel">
      <div className="p-head">
        <Icon name="columns" size={18} />
        <h3>Plan de financement estimatif</h3>
        <span style={{ flex: 1 }}></span>
        <button className="se-btn se-btn-secondary btn-sm" onClick={() => setImportOpen(true)}>
          <Icon name="upload" size={15} />
          Importer un classeur
        </button>
      </div>
      <div className="p-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {groupes.map(({ groupe, scenarios }) => (
          <div key={groupe}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
              <span className="se-small" style={{ color: "var(--fg-muted)" }}>
                {scenarios.length} scénario{scenarios.length > 1 ? "s" : ""} · importé le {fmtDate(scenarios[0].created_at)}
                {scenarios[0].source_fichier ? ` de « ${scenarios[0].source_fichier} »` : ""}
              </span>
              <span className="spacer" style={{ flex: 1 }}></span>
              <button
                className="se-btn se-btn-primary btn-sm"
                onClick={() => navigate(`/copros/${coproId}/plan-estimatif/${groupe}`)}
              >
                <Icon name="columns" size={14} />
                Comparer les scénarios
              </button>
              <button
                className="icon-btn"
                title="Supprimer ce PF estimatif (tous ses scénarios)"
                disabled={del.isPending}
                onClick={() => {
                  if (window.confirm(`Supprimer ce PF estimatif et ses ${scenarios.length} scénarios ?`)) del.mutate(groupe);
                }}
              >
                <Icon name="trash" size={15} />
              </button>
            </div>
            {scenarios.map((p, i, arr) => {
              const res = computePlanDefinitif(readPlanDefinitif(p.data));
              return (
                <div
                  key={p.id}
                  className="task-row"
                  style={{ padding: "11px 4px", borderBottom: i < arr.length - 1 ? "1px solid var(--border)" : "none", cursor: "pointer" }}
                  onClick={() => navigate(`/copros/${coproId}/plan-definitif/${p.id}`)}
                >
                  <Icon name="fileText" size={16} style={{ color: "var(--color-secondary-500)" }} />
                  <div style={{ minWidth: 0 }}>
                    <div className="t-title" style={{ fontSize: 13 }}>
                      {p.nom}
                    </div>
                    <div className="t-copro">
                      {`Opération ${fmtEuro(res.totalOperationTtc)} · aides ${fmtEuro(res.totalAides)} (${Math.round(res.tauxCouverture * 100)} %) · reste à charge ${fmtEuro(res.resteACharge)}`}
                    </div>
                  </div>
                  <span className="spacer"></span>
                  <Badge kind="neutral">Estimatif</Badge>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      {importOpen && <ImportPlanDefinitifDialog coproId={coproId} coproNom={coproNom} onClose={() => setImportOpen(false)} />}
    </div>
  );
}

/** Coûts de l'opération issus du PF définitif validé (remplace le panneau scénario). */
function PanelCoutOperationPf({ plan, pv }: { plan: PlanDefinitif; pv: PlanDefinitifResult }) {
  return (
    <div className="panel">
      <div className="p-head">
        <Icon name="fileCheck" size={18} />
        <h3>Coût de l'opération · {plan.nom}</h3>
        <span style={{ flex: 1 }}></span>
        <Badge kind="success" dot>
          PF validé
        </Badge>
      </div>
      <div className="p-body">
        <div className="kv">
          <span className="k">Travaux TTC (imprévus inclus)</span>
          <span className="v">{fmtEuro(pv.totalTravauxTtcImprevus)}</span>
        </div>
        <div className="kv">
          <span className="k">MOE et frais annexes TTC</span>
          <span className="v">{fmtEuro(pv.totalMoeTtc)}</span>
        </div>
        <div className="kv" style={{ borderTop: "1px solid var(--border)", marginTop: 4, paddingTop: 12 }}>
          <span className="k" style={{ fontWeight: 700, color: "var(--fg1)" }}>
            Coût total opération TTC
          </span>
          <span className="v" style={{ fontFamily: "var(--font-display)", fontSize: 18 }}>
            {fmtEuroFull(pv.totalOperationTtc)}
          </span>
        </div>
      </div>
    </div>
  );
}

/** Ingénierie financière remplie automatiquement depuis le PF définitif validé. */
function PanelIngenieriePf({
  pv,
  fondsTravaux,
  onOpen,
}: {
  pv: PlanDefinitifResult;
  fondsTravaux: number;
  onOpen: () => void;
}) {
  const total = pv.totalOperationTtc;
  const notif = etatNotificationAides(pv);
  return (
    <div className="panel">
      <div className="p-head">
        <Icon name="barChart" size={18} />
        <h3>Ingénierie financière</h3>
        {notif.attendues > 0 && (
          <Badge kind={notif.toutes ? "success" : "warn"} dot>
            {notif.toutes
              ? "Aides notifiées"
              : notif.notifiees
                ? `Aides notifiées : ${notif.notifiees}/${notif.attendues}`
                : "Aides estimées"}
          </Badge>
        )}
        <span style={{ flex: 1 }}></span>
        <button className="se-btn se-btn-ghost btn-sm" onClick={onOpen}>
          Ouvrir le PF définitif
          <Icon name="arrowRight" size={15} />
        </button>
      </div>
      <div className="p-body">
        {[
          { l: "Aides mobilisables (MPR, CEE, Climaxion…)", v: pv.totalAides, blue: false },
          { l: "Fonds travaux mobilisé", v: fondsTravaux, blue: true },
          { l: "Reste à charge définitif collectif", v: pv.resteACharge, blue: false },
          { l: "Reste à financer (prime CEE en fin de travaux)", v: pv.collectif.resteAFinancer, blue: true },
        ].map((row) => (
          <div key={row.l} style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 6 }}>
              <span>{row.l}</span>
              <span style={{ fontWeight: 700 }}>{fmtEuro(row.v)}</span>
            </div>
            <Progress value={total ? (row.v / total) * 100 : 0} blue={row.blue} />
          </div>
        ))}
        <p className="se-small" style={{ color: "var(--fg-muted)", margin: 0 }}>
          Champs remplis automatiquement à partir du plan de financement définitif validé
          {notif.attendues > 0 && !notif.toutes ? " (aides non notifiées : estimations du plan)" : ""}. Barres à échelle
          unique : part du coût total de l'opération TTC ({fmtEuro(total)}).
        </p>
      </div>
    </div>
  );
}

/**
 * Plans individuels générés depuis le PF définitif validé. Une seule clé de
 * répartition dans la copropriété → tout est réparti automatiquement avec
 * elle ; plusieurs clés → l'AMO choisit, ligne par ligne, la clé à appliquer
 * (choix porté par les lignes du PF définitif, modifiable ici ou dans l'éditeur du plan).
 * Plan d'un bâtiment (11/10/2026) : réparti entre les seuls lots de son
 * périmètre ; le partage au portail publie tous les PF validés ensemble.
 */
function PlansIndividuelsPfPanel({
  coproId,
  coproNom,
  plan,
  pv,
  pvData,
  valides,
}: {
  coproId: string;
  coproNom: string;
  plan: PlanDefinitif;
  pv: PlanDefinitifResult;
  pvData: PlanDefinitifData;
  /** Tous les PF validés de la copropriété (un par bâtiment, ou le seul). */
  valides: PlanDefinitif[];
}) {
  const navigate = useNavigate();
  const { data: donnees } = useDonnees(coproId);
  const { data: bareme } = useBareme();
  const { data: profils } = useProfilsCopro(coproId);
  const idsValides = valides.map((p) => p.id);
  const { data: pont } = usePontPf(coproId, idsValides);
  const update = useUpdatePlanDefinitif(coproId);
  const partagerMut = usePartagerPfCopros(coproId);
  const [configOpen, setConfigOpen] = useState(false);
  const [tableauEnCours, setTableauEnCours] = useState<VarianteTableauCopros | null>(null);
  const [erreurTableau, setErreurTableau] = useState<string | null>(null);

  const cles = donnees?.cles ?? [];
  const tousLesLots = donnees?.lots ?? [];
  // Même répartition que la vue Copropriétaires et les exports (une seule
  // fonction) : tantièmes par copropriétaire, clé unique ou clé par ligne,
  // sur les lots du périmètre du plan.
  const lotsPf = lotsDuPerimetre(tousLesLots, plan.batiment_ids);
  const repartition = repartirPfDepuisLots(pvData, pv, lotsPf, cles);
  const { plans, manquants, items, cleUnique, totauxCles } = repartition;
  const plusieurs = valides.length > 1;
  const pfs = valides.map(pfARepartir);
  const tous = repartirPfs(pfs, tousLesLots, cles);

  // Tableau PDF de tous les copropriétaires (feedback Amir 05/10/2026) : une
  // ligne par copropriétaire, prêt collectif ou éco-PTZ individuel.
  const extraireTableau = async (variante: VarianteTableauCopros) => {
    setTableauEnCours(variante);
    setErreurTableau(null);
    try {
      const [{ genererTableauCoproprietairesPdf, nomFichierTableauCoproprietaires }, { telechargerPdfBytes }] =
        await Promise.all([import("@/lib/pdf/tableauCoproprietaires"), import("@/lib/pdf/planIndividuel")]);
      const bytes = await genererTableauCoproprietairesPdf({
        coproNom,
        planNom: plan.nom,
        tableau: tableauDepuisRepartition(variante, pvData, repartition),
      });
      // un tableau par bâtiment quand chaque bâtiment a son PF : le nom du plan les distingue
      telechargerPdfBytes(bytes, nomFichierTableauCoproprietaires(plusieurs ? `${coproNom} - ${plan.nom}` : coproNom, variante));
    } catch (e) {
      setErreurTableau(messageErreur(e, "Export du tableau impossible"));
    } finally {
      setTableauEnCours(null);
    }
  };
  // Copropriétaires dont le profil de ressources n'est pas renseigné : leur
  // aide individuelle s'affichera « à déterminer » au portail (feedback Théa).
  const sansProfil = plans.filter((p) => !profils?.has(p.coproprietaireId));
  const sansProfilTous = tous.plans.filter((p) => !profils?.has(p.coproprietaireId));

  // Le choix est porté par les lignes du PF définitif (ids « lot:<numero>:<index> »
  // / « moe:<index> ») - il reste ainsi visible et modifiable dans l'éditeur du plan.
  const saveCles = (config: Record<string, string>) => {
    const data = structuredClone(pvData);
    for (const [id, cle] of Object.entries(config)) {
      const mLot = /^lot:(\d+):(\d+)$/.exec(id);
      if (mLot) {
        const ligne = data.lots.find((l) => l.numero === Number(mLot[1]))?.lignes[Number(mLot[2])];
        if (ligne) ligne.cleRepartition = cle;
        continue;
      }
      const mMoe = /^moe:(\d+)$/.exec(id);
      if (mMoe && data.moe[Number(mMoe[1])]) data.moe[Number(mMoe[1])].cleRepartition = cle;
    }
    update.mutate({ id: plan.id, data }, { onSuccess: () => setConfigOpen(false) });
  };

  // Partage au portail copropriétaire : tous les PF validés ensemble, un plan
  // cumulé par copropriétaire (plans par bâtiment, choix d'Amir du 11/10/2026).
  const partage = pont?.statut === "partage";
  // Mêmes PF, et mêmes montants : une aide notifiée (ou un devis) modifiée
  // après le partage laisse au portail des restes à charge périmés
  const memesPf = pontAJour(pont, idsValides);
  const memesMontants = montantsPontAJour(pont, pfs);
  const aJour = memesPf && memesMontants;
  const partageable = tous.plans.length > 0 && tous.complet && !!tous.cleRef && !!bareme;
  const pfsIncomplets = tous.parPf.filter((x) => x.repartition.manquants.length > 0 || x.repartition.plans.length === 0);
  const togglePartage = (partager: boolean) => {
    if (!bareme || !donnees) return;
    // Verrou souple : publier sans profil de ressources fait apparaître des
    // aides individuelles « à déterminer » - l'AMO confirme en connaissance de cause.
    if (partager && sansProfilTous.length > 0) {
      const noms = sansProfilTous.slice(0, 8).map((p) => p.nom).join(", ") + (sansProfilTous.length > 8 ? "…" : "");
      const ok = window.confirm(
        `${sansProfilTous.length} copropriétaire${sansProfilTous.length > 1 ? "s" : ""} sur ${tous.plans.length} n'${sansProfilTous.length > 1 ? "ont" : "a"} pas de profil de ressources (enquête sociale non renseignée) : ${noms}.\n\n` +
          "Leur portail affichera la quote-part et les aides collectives, mais une aide individuelle « à déterminer ». " +
          "Publier quand même ? (Les profils peuvent être saisis ensuite dans l'onglet Copropriétaires : le portail se met à jour.)"
      );
      if (!ok) return;
    }
    partagerMut.mutate({ pfs, lots: tousLesLots, cles, bareme, partager });
  };
  const openPortail = (coproprietaireId: string) => navigate(`/portail?cp=${coproprietaireId}`);

  return (
    <div className="panel">
      <div className="p-head">
        <Icon name="fileText" size={18} />
        <h3>Plans individuels{plusieurs ? ` · ${libellePerimetre(plan.batiment_ids, donnees?.batiments ?? [], null)}` : ""}</h3>
        {partage &&
          (aJour ? (
            <Badge kind="success" dot>
              Partagé au portail
            </Badge>
          ) : (
            <Badge kind="warn" dot>
              Partage à mettre à jour
            </Badge>
          ))}
        <span style={{ flex: 1 }}></span>
        {cles.length > 1 && (
          <button className="se-btn se-btn-ghost btn-sm" onClick={() => setConfigOpen(true)}>
            Clés de répartition
          </button>
        )}
        {partage && (
          <button
            className="se-btn se-btn-ghost btn-sm"
            disabled={partagerMut.isPending}
            onClick={() => togglePartage(false)}
          >
            Ne plus partager
          </button>
        )}
        {partageable && (!partage || !aJour) && (
          <button
            className="se-btn se-btn-primary btn-sm"
            disabled={partagerMut.isPending}
            onClick={() => togglePartage(true)}
            title={
              plusieurs
                ? "Publier sur le portail le plan cumulé de chaque copropriétaire (tous les PF validés)"
                : "Publier les quotes-parts sur le portail des copropriétaires"
            }
          >
            <Icon name="eye" size={14} />
            {partagerMut.isPending ? "Partage…" : partage ? "Mettre à jour le partage" : "Partager aux copropriétaires"}
          </button>
        )}
        <span style={{ fontSize: 13, color: "var(--fg-muted)" }}>{plans.length}</span>
      </div>
      {(partagerMut.isError || (plusieurs && pfsIncomplets.length > 0) || (partage && !aJour)) && (
        <div className="p-body" style={{ paddingBottom: 0 }}>
          {partagerMut.isError && (
            <p className="se-small" style={{ margin: "0 0 6px", color: "var(--color-error-700)" }}>
              {messageErreur(partagerMut.error, "Partage impossible")}
            </p>
          )}
          {plusieurs && pfsIncomplets.length > 0 && (
            <p className="se-small" style={{ margin: "0 0 6px", color: "var(--color-warning-700)" }}>
              <Icon name="alert" size={12} /> Le partage au portail publie tous les PF validés ensemble : il attend
              la répartition complète de « {pfsIncomplets.map((x) => x.pf.nom).join(" », « ")} ».
            </p>
          )}
          {partage && !memesPf && (
            <p className="se-small" style={{ margin: "0 0 6px", color: "var(--color-warning-700)" }}>
              <Icon name="alert" size={12} /> Le portail publie d'autres PF que ceux validés aujourd'hui : mettez à
              jour le partage pour que chaque copropriétaire voie son plan cumulé à jour.
            </p>
          )}
          {partage && memesPf && !memesMontants && (
            <p className="se-small" style={{ margin: "0 0 6px", color: "var(--color-warning-700)" }}>
              <Icon name="alert" size={12} /> Les montants du PF ont changé depuis le partage (aides notifiées,
              devis, fonds travaux) : mettez à jour le partage pour que le portail affiche les nouveaux restes à charge.
            </p>
          )}
        </div>
      )}
      <div className="p-body" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {!donnees ? (
          <p className="se-body" style={{ margin: 0, color: "var(--fg-muted)" }}>Chargement…</p>
        ) : !couvreToutLaCopro(plan.batiment_ids) && lotsPf.length === 0 ? (
          <p className="se-body" style={{ margin: 0, color: "var(--fg-muted)" }}>
            Aucun lot n'est rattaché aux bâtiments de ce plan : vérifiez son périmètre (éditeur du plan) ou le
            bâtiment des lots (onglet Données de la copro).
          </p>
        ) : cles.length === 0 ? (
          <p className="se-body" style={{ margin: 0, color: "var(--fg-muted)" }}>
            Importez le tableau des lots (onglet Données de la copro) : les clés de tantièmes du fichier
            serviront à répartir le plan définitif entre les copropriétaires.
          </p>
        ) : manquants.length > 0 ? (
          cleUnique ? (
            <p className="se-body" style={{ margin: 0, color: "var(--fg-muted)" }}>
              La clé « {cles[0].label || cles[0].code} » n'a aucun tantième - vérifiez l'import des lots
              (onglet Données de la copro).
            </p>
          ) : (
          <>
            <p className="se-body" style={{ margin: 0, color: "var(--fg-muted)" }}>
              La copropriété a {cles.length} clés de répartition : choisissez, ligne par ligne, la clé à
              appliquer ({manquants.length} ligne{manquants.length > 1 ? "s" : ""} restant à affecter -
              également modifiable dans l'éditeur du PF définitif).
            </p>
            <button
              className="se-btn se-btn-primary btn-sm"
              style={{ marginTop: 10, alignSelf: "flex-start" }}
              onClick={() => setConfigOpen(true)}
            >
              Choisir les clés de répartition
            </button>
          </>
          )
        ) : (
          <>
            {cleUnique && (
              <p className="se-small" style={{ margin: "0 0 6px", color: "var(--fg-muted)" }}>
                Répartition automatique - clé unique « {cles[0].label || cles[0].code} »
                {" "}(total {totauxCles[cleUnique] ?? 0}
                {couvreToutLaCopro(plan.batiment_ids) ? "" : ` sur les ${lotsPf.length} lots du périmètre`}).
              </p>
            )}
            {sansProfil.length > 0 && (
              <p className="se-small" style={{ margin: "0 0 6px", color: "var(--color-warning-700)" }}>
                <Icon name="alert" size={12} /> {sansProfil.length} copropriétaire{sansProfil.length > 1 ? "s" : ""} sans profil de
                ressources : aide individuelle « à déterminer » au portail (onglet Copropriétaires pour saisir).
              </p>
            )}
            {plans.map((p, i, arr) => (
              <div
                key={p.coproprietaireId}
                className="task-row"
                role="button"
                tabIndex={0}
                title={`Ouvrir le portail de ${p.nom} (aperçu AMO)`}
                onClick={() => openPortail(p.coproprietaireId)}
                onKeyDown={(e) => e.key === "Enter" && openPortail(p.coproprietaireId)}
                style={{
                  padding: "11px 4px",
                  borderBottom: i < arr.length - 1 ? "1px solid var(--border)" : "none",
                  cursor: "pointer",
                }}
              >
                <Icon name="user" size={16} style={{ color: "var(--fg-muted)" }} />
                <div>
                  <div className="t-title" style={{ fontSize: 13 }}>{p.nom}</div>
                  <div className="t-copro">
                    Quote-part {fmtEuro(p.quotePartAvant)} · aides et fonds {fmtEuro(p.aidesEtFonds)} · reste{" "}
                    {fmtEuro(p.reste)}
                  </div>
                </div>
                <span className="spacer"></span>
                <Icon name="arrowRight" size={16} style={{ color: "var(--accent)" }} />
              </div>
            ))}
            <div
              style={{ borderTop: "1px solid var(--border)", marginTop: 8, paddingTop: 14, display: "flex", flexDirection: "column", gap: 8 }}
            >
              <div className="se-small" style={{ color: "var(--fg-muted)" }}>
                Tous les copropriétaires dans un seul tableau PDF, classés par nom.
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  className="se-btn se-btn-secondary btn-sm"
                  disabled={tableauEnCours !== null}
                  onClick={() => extraireTableau("collectif")}
                  title="Nom, tantièmes, quote-part avant aides, reste à financer, mensualité, coût du prêt avance de subvention, prime C2E et prix de revient (éco-PTZ collectif)"
                >
                  <Icon name="download" size={14} />
                  {tableauEnCours === "collectif" ? "Génération…" : "Tableau PDF - prêt collectif"}
                </button>
                <button
                  className="se-btn se-btn-secondary btn-sm"
                  disabled={tableauEnCours !== null}
                  onClick={() => extraireTableau("individuel")}
                  title="Nom, tantièmes, quote-part avant aides, appels de fonds, mensualité, aides remboursées en fin de chantier, prime C2E et prix de revient (éco-PTZ individuel)"
                >
                  <Icon name="download" size={14} />
                  {tableauEnCours === "individuel" ? "Génération…" : "Tableau PDF - éco-PTZ individuel"}
                </button>
              </div>
              {erreurTableau && (
                <p className="se-small" style={{ color: "var(--color-error-700)", margin: 0 }}>{erreurTableau}</p>
              )}
            </div>
          </>
        )}
      </div>
      {configOpen && (
        <RepartitionClesDialog
          items={items}
          cles={cles}
          totauxCles={totauxCles}
          initial={Object.fromEntries(items.flatMap((it) => (it.cle ? [[it.id, it.cle]] : [])))}
          pending={update.isPending}
          onSave={saveCles}
          onClose={() => setConfigOpen(false)}
        />
      )}
    </div>
  );
}

/** Choix de la clé de répartition, lot par lot et item par item. */
function RepartitionClesDialog({
  items,
  cles,
  totauxCles,
  initial,
  pending,
  onSave,
  onClose,
}: {
  items: ReturnType<typeof itemsARepartirPf>;
  cles: { code: string; label: string | null; is_default: boolean }[];
  totauxCles: Record<string, number>;
  initial: Record<string, string>;
  pending: boolean;
  onSave: (config: Record<string, string>) => void;
  onClose: () => void;
}) {
  const [config, setConfig] = useState<Record<string, string>>(() => ({ ...initial }));
  const defaut = cles.find((k) => k.is_default)?.code ?? cles[0]?.code ?? "";
  const [cleGlobale, setCleGlobale] = useState(defaut);
  const manquants = items.filter((it) => !config[it.id]).length;
  const libelleCle = (k: { code: string; label: string | null }) =>
    `${k.code}${k.label && k.label !== k.code ? ` - ${k.label}` : ""} (total ${totauxCles[k.code] ?? 0})`;

  return (
    <Modal title="Clés de répartition des plans individuels" onClose={onClose} width={760} closeOnBackdrop={false}>
      <p className="se-small" style={{ color: "var(--fg-muted)", marginTop: 0 }}>
        Chaque ligne de devis (remise et imprévus inclus) et chaque ligne de MOE ou frais annexe est répartie
        entre les copropriétaires suivant la clé choisie pour la ligne. Le choix est enregistré sur le PF
        définitif et reste modifiable dans son éditeur.
      </p>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13 }}>Appliquer à toutes les lignes :</span>
        <select className="edit-inp" value={cleGlobale} onChange={(e) => setCleGlobale(e.target.value)}>
          {cles.map((k) => (
            <option key={k.code} value={k.code}>
              {libelleCle(k)}
            </option>
          ))}
        </select>
        <button
          className="se-btn se-btn-secondary btn-sm"
          onClick={() => setConfig(Object.fromEntries(items.map((it) => [it.id, cleGlobale])))}
        >
          Appliquer
        </button>
      </div>
      <div className="tablewrap">
        <table className="dossiers" style={{ fontSize: 12.5 }}>
          <thead>
            <tr>
              <th>Ligne</th>
              <th style={{ textAlign: "right", width: 130 }}>Montant TTC</th>
              <th style={{ width: 240 }}>Clé de répartition</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id} style={{ cursor: "default" }}>
                <td>{it.libelle}</td>
                <td className="mono" style={{ textAlign: "right", whiteSpace: "nowrap" }}>{fmtEuroFull(it.montantTtc)}</td>
                <td>
                  <select
                    className="edit-inp"
                    style={{ width: "100%" }}
                    value={config[it.id] ?? ""}
                    onChange={(e) => setConfig((c2) => ({ ...c2, [it.id]: e.target.value }))}
                  >
                    <option value="" disabled>
                      - choisir -
                    </option>
                    {cles.map((k) => (
                      <option key={k.code} value={k.code}>
                        {libelleCle(k)}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 18 }}>
        <button className="se-btn se-btn-ghost btn-sm" onClick={onClose}>
          Annuler
        </button>
        <button
          className="se-btn se-btn-primary btn-sm"
          disabled={manquants > 0 || pending}
          title={manquants > 0 ? `${manquants} ligne(s) sans clé` : undefined}
          onClick={() => onSave(config)}
        >
          {pending ? "Enregistrement…" : "Enregistrer la répartition"}
        </button>
      </div>
    </Modal>
  );
}

/**
 * Tampon du syndic du bulletin d'adhésion (demande d'Amir du 14/10/2026) : le gabarit CEGEE a un
 * cadre « À retourner à : (cachet du Syndic) ». Le tampon est unique par organisation : importé ici
 * une fois, il est repris sur tous les bulletins des dossiers de l'enseigne. Il est imprimé à la
 * génération du bulletin au portail ; un bulletin déjà généré garde donc le tampon d'alors.
 */
function TamponSyndicBloc({
  organisationId,
  nomSyndic,
  exige,
  campagneOuverte,
}: {
  organisationId: string | null;
  nomSyndic: string | null;
  /** L'ouverture de la campagne est demandée sans tampon : l'enregistrement est bloqué. */
  exige: boolean;
  campagneOuverte: boolean;
}) {
  const { data, isLoading, error } = useTamponOrganisation(organisationId);
  const importer = useImporterTamponSyndic(organisationId);
  const champ = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const nom = data?.nom ?? nomSyndic ?? "ce syndic";
  const image = data?.image ?? null;

  const choisir = (f: File | undefined) => {
    if (!f) return;
    setMessage(null);
    importer.mutate(f, { onError: (e) => setMessage(messageErreur(e, "Import du tampon impossible")) });
  };

  const bouton = (libelle: string, primaire: boolean) => (
    <>
      <button
        type="button"
        className={`se-btn ${primaire ? "se-btn-secondary" : "se-btn-ghost"} btn-sm`}
        disabled={importer.isPending}
        onClick={() => champ.current?.click()}
      >
        <Icon name="upload" size={14} />
        {importer.isPending ? "Import en cours…" : libelle}
      </button>
      <input
        ref={champ}
        type="file"
        accept={ACCEPT_TAMPON}
        style={{ display: "none" }}
        onChange={(e) => {
          choisir(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </>
  );

  return (
    <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
      <div style={{ fontSize: 12.5, color: "var(--fg2)", marginBottom: 6 }}>Tampon du syndic sur le bulletin d'adhésion</div>
      {!organisationId ? (
        <p className="se-small" style={{ color: "var(--color-error-700)", margin: 0 }}>
          Ce dossier n'est rattaché à aucune organisation : choisissez-la dans l'onglet Données, le tampon se range par
          organisation.
        </p>
      ) : isLoading ? (
        <p className="se-small" style={{ color: "var(--fg-muted)", margin: 0 }}>Chargement…</p>
      ) : error ? (
        <p className="se-small" style={{ color: "var(--color-error-700)", margin: 0 }}>
          {messageErreur(error, "Lecture du tampon impossible")}
        </p>
      ) : image ? (
        <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
          <img
            src={image}
            alt={`Tampon de ${nom}`}
            style={{ maxHeight: 64, maxWidth: 220, border: "1px solid var(--border)", borderRadius: 6, background: "#fff", padding: 4 }}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}>
            <span className="se-small" style={{ color: "var(--fg-muted)" }}>
              Tampon de {nom}, repris sur tous les bulletins des dossiers de l'organisation. Un bulletin déjà généré
              garde l'ancien tampon.
            </span>
            {bouton("Remplacer le tampon", false)}
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start" }}>
          <span className="se-small" style={{ color: exige || campagneOuverte ? "var(--color-error-700)" : "var(--fg-muted)" }}>
            {exige
              ? `Importez le tampon de ${nom} pour ouvrir la campagne : un bulletin signé ne se refait pas, son cadre « cachet du Syndic » ne peut pas être complété après coup.`
              : campagneOuverte
                ? `Aucun tampon pour ${nom} : les bulletins générés d'ici l'import auront leur cadre « cachet du Syndic » vide.`
                : `Aucun tampon pour ${nom} : le cadre « cachet du Syndic » des bulletins resterait vide. Importez-le avant d'ouvrir la campagne.`}
          </span>
          {bouton("Importer le tampon du syndic", true)}
        </div>
      )}
      {message && (
        <p className="se-small" style={{ color: "var(--color-error-700)", margin: "8px 0 0" }}>
          {message}
        </p>
      )}
      <p className="se-small" style={{ color: "var(--fg-muted)", margin: "8px 0 0" }}>
        Image du tampon en {LIBELLE_FORMATS_TAMPON} (scan ou photo recadrée sur le tampon, fond transparent de préférence).
      </p>
    </div>
  );
}

/** Suivi des signatures électroniques avancées des bulletins d'adhésion
 *  (spec signature + CGU v1.6). Les dates Anah / banque saisies ici sont les
 *  déclencheurs de la purge automatique des pièces justificatives (art. 7.4.1).
 *  Le contenu des pièces (identité, RIB) n'est lisible que par les profils de
 *  niveau 1 - chaque consultation est journalisée. Même régime pour le mandat
 *  SEPA (0148), qui porte l'IBAN complet. */
function SignaturesElectroniquesPanel({ coproId }: { coproId: string }) {
  const { data: bulletins } = useBulletinsCopro(coproId);
  const relancer = useRelancerSignataire();
  const marquer = useMarquerInstruction(coproId);
  const [erreur, setErreur] = useState<string | null>(null);

  const actifs = (bulletins ?? []).filter((b) => b.statut !== "annule" && b.statut !== "brouillon");
  if (actifs.length === 0) return null;

  const STATUTS: Record<string, { label: string; kind: "success" | "warn" | "neutral" }> = {
    en_signature: { label: "En signature", kind: "neutral" },
    complet: { label: "Signé et scellé", kind: "success" },
    expire: { label: "Liens expirés", kind: "warn" },
  };

  const versDate = (v: string | null) => (v ? v.slice(0, 10) : "");
  const versIso = (v: string) => (v ? new Date(v + "T12:00:00").toISOString() : null);

  const agir = (p: Promise<unknown>) => {
    setErreur(null);
    p.catch((e) => setErreur(messageErreur(e, "Action impossible")));
  };

  return (
    <div className="panel">
      <div className="p-head">
        <Icon name="fileCheck" size={18} />
        <h3>Signatures électroniques - bulletins et mandats SEPA</h3>
        <span style={{ flex: 1 }}></span>
        <span style={{ fontSize: 13, color: "var(--fg-muted)" }}>{actifs.length}</span>
      </div>
      <div className="p-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {erreur && <p className="se-small" style={{ color: "var(--color-error-700)", margin: 0 }}>{erreur}</p>}
        {actifs.map((b) => {
          const principal = b.signataires.find((s) => s.role === "principal");
          const signes = b.signataires.filter((s) => s.statut === "signe").length;
          return (
            <div key={b.id} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <b style={{ fontSize: 13.5 }}>{principal ? `${principal.prenom} ${principal.nom}` : "-"} · {b.lot_reference}</b>
                <Badge kind={STATUTS[b.statut]?.kind ?? "neutral"}>{STATUTS[b.statut]?.label ?? b.statut}</Badge>
                <span style={{ fontSize: 12.5, color: "var(--fg-muted)" }}>
                  {signes}/{b.signataires.length} signature{b.signataires.length > 1 ? "s" : ""}
                  {b.iban_dernier4 ? ` · IBAN ····${b.iban_dernier4}` : ""}
                  {b.mandat_signe_le ? ` · mandat SEPA signé le ${fmtDate(b.mandat_signe_le)}` : ""}
                  {b.purge_effectuee_le ? ` · pièces purgées le ${fmtDate(b.purge_effectuee_le)}` : ""}
                </span>
                <span style={{ flex: 1 }}></span>
                {b.statut === "complet" && (
                  <>
                    <button
                      className="icon-btn"
                      title="Bulletin signé (PDF scellé)"
                      onClick={() => agir(ouvrirDocumentSignature({ action: "amo_document_url", bulletin_id: b.id, quoi: "signe" }))}
                    >
                      <Icon name="fileText" size={15} />
                    </button>
                    <button
                      className="icon-btn"
                      title="Certificat de preuve"
                      onClick={() => agir(ouvrirDocumentSignature({ action: "amo_document_url", bulletin_id: b.id, quoi: "certificat" }))}
                    >
                      <Icon name="fileCheck" size={15} />
                    </button>
                  </>
                )}
                {b.mandat_path && (
                  <button
                    className="icon-btn"
                    title={`Mandat SEPA ${b.mandat_signe_path ? "signé" : "pré-rempli, pas encore signé"} (IBAN complet : niveau 1 uniquement - consultation journalisée)`}
                    onClick={() => agir(ouvrirDocumentSignature({ action: "amo_piece_url", bulletin_id: b.id, quoi: "mandat" }))}
                  >
                    <Icon name="fileCheck" size={15} style={{ color: b.mandat_signe_path ? "var(--color-success-500)" : undefined }} />
                  </button>
                )}
                {!b.purge_effectuee_le && b.rib_path && (
                  <button
                    className="icon-btn"
                    title="RIB (niveau 1 uniquement - consultation journalisée)"
                    onClick={() => agir(ouvrirDocumentSignature({ action: "amo_piece_url", bulletin_id: b.id, quoi: "rib" }))}
                  >
                    <Icon name="euro" size={15} />
                  </button>
                )}
              </div>
              {/* validation du RIB par le niveau 1 (0155) */}
              {!b.purge_effectuee_le && b.rib_path && (
                <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginTop: 8, fontSize: 12.5 }}>
                  <Icon name="euro" size={13} style={{ marginTop: 3 }} />
                  <span style={{ marginTop: 2 }}>RIB{b.rib_remplace_le ? ` (remplacé le ${fmtDate(b.rib_remplace_le)})` : ""}</span>
                  <VerificationSignature
                    key={"rib" + b.id + (b.rib_statut ?? "") + (b.rib_qualification ?? "")}
                    coproId={coproId}
                    quoi="rib"
                    bulletinId={b.id}
                    statut={b.rib_statut}
                    qualification={b.rib_qualification}
                    motif={b.rib_motif_refus}
                    commentaire={b.rib_commentaire}
                    verifieeLe={b.rib_verifiee_le}
                    emailStatut={b.rib_refus_email_statut}
                  />
                </div>
              )}
              {b.rib_nouveau_path && (
                <p className="se-small" style={{ margin: "6px 0 0", color: "var(--color-warning-700, #8a5a00)" }}>
                  Changement de compte demandé (IBAN ····{b.iban_nouveau_dernier4 ?? ""}) : nouveau mandat SEPA en attente de
                  signature par le copropriétaire ; le mandat signé actuel reste en vigueur.
                </p>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>
                {b.signataires
                  .slice()
                  .sort((x, y) => x.ordre - y.ordre)
                  .map((s) => (
                    <div key={s.id} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
                      <Icon
                        name={s.statut === "signe" ? "checkCircle" : "clock"}
                        size={13}
                        style={{ color: s.statut === "signe" ? "var(--color-success-500)" : "var(--fg-muted)" }}
                      />
                      <span>
                        {s.prenom} {s.nom} ({s.role === "principal" ? "principal" : "cosignataire"})
                        {s.signe_le ? ` - signé le ${fmtDate(s.signe_le)}` : s.statut === "identite_deposee" ? " - identité déposée" : s.statut === "expire" ? " - lien expiré" : " - en attente"}
                      </span>
                      <span style={{ flex: 1 }}></span>
                      {!b.purge_effectuee_le && s.piece_identite_path && (
                        <button
                          className="icon-btn"
                          title="Pièce d'identité (niveau 1 uniquement - consultation journalisée)"
                          onClick={() => agir(ouvrirDocumentSignature({ action: "amo_piece_url", signataire_id: s.id, quoi: "piece" }))}
                        >
                          <Icon name="eye" size={13} />
                        </button>
                      )}
                      {b.statut === "en_signature" && s.role === "cosignataire" && s.statut !== "signe" && (
                        <button
                          className="se-btn se-btn-ghost btn-sm"
                          disabled={relancer.isPending}
                          onClick={() => agir(relancer.mutateAsync(s.id))}
                        >
                          <Icon name="send" size={12} />Relancer
                        </button>
                      )}
                    </div>
                    {/* validation de la pièce d'identité par le niveau 1 (0155) */}
                    {!b.purge_effectuee_le && s.piece_identite_path && (
                      <div style={{ paddingLeft: 21, display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12 }}>
                        <span style={{ color: "var(--fg-muted)", marginTop: 2 }}>
                          Pièce d'identité{s.piece_remplacee_le ? ` (remplacée le ${fmtDate(s.piece_remplacee_le)})` : ""}
                        </span>
                        <VerificationSignature
                          key={"piece" + s.id + (s.piece_statut ?? "") + (s.piece_qualification ?? "")}
                          coproId={coproId}
                          quoi="piece"
                          signataireId={s.id}
                          statut={s.piece_statut}
                          qualification={s.piece_qualification}
                          motif={s.piece_motif_refus}
                          commentaire={s.piece_commentaire}
                          verifieeLe={s.piece_verifiee_le}
                          emailStatut={s.piece_refus_email_statut}
                        />
                      </div>
                    )}
                    </div>
                  ))}
              </div>
              {b.statut === "complet" && !b.purge_effectuee_le && (
                <div style={{ display: "flex", gap: 14, alignItems: "flex-end", marginTop: 10, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <label style={{ fontSize: 12, color: "var(--fg2)" }}>Notification Anah reçue le</label>
                    <input
                      className="edit-inp"
                      type="date"
                      value={versDate(b.notification_anah_le)}
                      onChange={(e) =>
                        agir(marquer.mutateAsync({ bulletinId: b.id, notificationAnahLe: versIso(e.target.value) }))
                      }
                    />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <label style={{ fontSize: 12, color: "var(--fg2)" }}>Dossier transmis à la banque le</label>
                    <input
                      className="edit-inp"
                      type="date"
                      value={versDate(b.transmission_banque_le)}
                      onChange={(e) =>
                        agir(marquer.mutateAsync({ bulletinId: b.id, transmissionBanqueLe: versIso(e.target.value) }))
                      }
                    />
                  </div>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, cursor: "pointer", paddingBottom: 6 }}>
                    <input
                      type="checkbox"
                      checked={b.eco_ptz_demande}
                      onChange={(e) => agir(marquer.mutateAsync({ bulletinId: b.id, ecoPtzDemande: e.target.checked }))}
                    />
                    Éco-PTZ demandé
                  </label>
                </div>
              )}
              {b.statut === "complet" && !b.purge_effectuee_le && b.notification_anah_le && (b.transmission_banque_le || !b.eco_ptz_demande) && (
                <p className="se-small" style={{ color: "var(--fg-muted)", margin: "6px 0 0" }}>
                  Conditions de purge réunies : les pièces justificatives (identité, avis d'imposition, taxe
                  foncière) seront supprimées automatiquement 30 jours après la dernière date saisie.
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

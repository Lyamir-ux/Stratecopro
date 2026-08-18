// Onglet Financement (syndic) — mode de financement du reste à charge choisi
// par chaque copropriétaire depuis son portail : fonds propres, éco-PTZ
// collectif ou éco-PTZ individuel. Vue de coordination pour le gestionnaire.
import { Fragment, useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { Badge, type BadgeKind } from "@/components/ui";
import { fmtDate, fmtEuroFull } from "@/lib/format";
import { useDonnees } from "@/api/donnees";
import { useChoixFinancementScenario } from "@/api/scenarios";
import { useScenariosPartages, useFinancementConfig } from "@/api/portail";
import { usePlansDefinitifs, type PlanDefinitif } from "@/api/planDefinitif";
import {
  computePlanDefinitif,
  readPlanDefinitif,
  regrouperAnnexes,
  type PlanDefinitifResult,
} from "@/lib/finance";
import type { Enums } from "@/lib/database.types";
import type { SyndicCopro } from "@/api/syndic";

type TypeFinancement = Enums<"type_financement">;

const TYPE_META: Record<TypeFinancement, { label: string; kind: BadgeKind; icon: "euro" | "users" | "user" }> = {
  fonds: { label: "Fonds propres", kind: "neutral", icon: "euro" },
  collectif: { label: "Éco-PTZ collectif", kind: "primary", icon: "users" },
  individuel: { label: "Éco-PTZ individuel", kind: "blue", icon: "user" },
};

interface DetailPoste {
  libelle: string;
  montant: number;
}

interface Poste {
  id: string;
  libelle: string;
  montant: number;
  /** Sous-lignes affichées quand le poste est déroulé (absent : poste simple). */
  detail?: DetailPoste[];
  strong?: boolean;
}

/** Libellés des aides publiques regroupées par dispositif (groupe du PF). */
const GROUPE_AIDE_LABEL: Record<string, string> = {
  ANAH: "Aide MaPrimeRénov'",
  EMS: "Aide de l'EMS",
  Climaxion: "Aide Climaxion",
};
const ORDRE_GROUPES_AIDES = ["ANAH", "EMS", "Climaxion"];

/**
 * Panneau « Plan de financement définitif » : six postes votés, chacun
 * déroulable — travaux regroupés par entreprise, frais annexes par mission,
 * aides de l'État par dispositif (MaPrimeRénov', EMS, Climaxion).
 */
function PfDefinitifPanel({ plan, pv, fondsTravaux }: { plan: PlanDefinitif; pv: PlanDefinitifResult; fondsTravaux: number }) {
  const [ouverts, setOuverts] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setOuverts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const postes = useMemo((): Poste[] => {
    // Travaux regroupés par entreprise (les lots sans entreprise gardent leur titre)
    const parEntreprise = new Map<string, number>();
    for (const l of pv.lots) parEntreprise.set(l.entreprise ?? l.titre, (parEntreprise.get(l.entreprise ?? l.titre) ?? 0) + l.totalTtc);
    const imprevus = pv.totalTravauxTtcImprevus - pv.totalTravauxTtc;
    const detailTravaux: DetailPoste[] = [
      ...[...parEntreprise.entries()].map(([libelle, montant]) => ({ libelle, montant })),
      ...(imprevus > 0.005 ? [{ libelle: "Imprévus et aléas", montant: imprevus }] : []),
    ];

    // Aides publiques regroupées par dispositif
    const parGroupe = new Map<string, number>();
    for (const a of pv.aides) {
      if (!a.publique || a.montant == null) continue;
      parGroupe.set(a.groupe, (parGroupe.get(a.groupe) ?? 0) + a.montant);
    }
    const groupes = [...parGroupe.keys()].sort((a, b) => {
      const ia = ORDRE_GROUPES_AIDES.indexOf(a);
      const ib = ORDRE_GROUPES_AIDES.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
    const detailAides: DetailPoste[] = groupes.map((g) => ({
      libelle: GROUPE_AIDE_LABEL[g] ?? `Aide ${g}`,
      montant: parGroupe.get(g)!,
    }));

    return [
      { id: "travaux", libelle: "Coût des travaux", montant: pv.totalTravauxTtcImprevus, detail: detailTravaux },
      {
        id: "annexes",
        libelle: "Coût des frais annexes",
        montant: pv.totalMoeTtc,
        detail: regrouperAnnexes(pv.moe).map((l) => ({
          libelle: l.entreprise ? `${l.libelle} — ${l.entreprise}` : l.libelle,
          montant: l.montantTtc,
        })),
      },
      { id: "etat", libelle: "Aide de l'État", montant: pv.totalAidesPubliques, detail: detailAides },
      { id: "cee", libelle: "CEE", montant: pv.primeCee },
      { id: "fonds", libelle: "Fonds travaux mobilisé", montant: fondsTravaux },
      { id: "reste", libelle: "Reste à charge collectif", montant: pv.resteACharge, strong: true },
    ];
  }, [pv, fondsTravaux]);

  return (
    <div className="panel">
      <div className="p-head">
        <Icon name="fileCheck" size={18} />
        <h3>Plan de financement définitif</h3>
        <span style={{ flex: 1 }}></span>
        <Badge kind="success" dot>
          Validé
        </Badge>
      </div>
      <div className="p-body">
        {postes.map((p) => {
          const aDetail = (p.detail?.length ?? 0) > 0;
          const open = aDetail && ouverts.has(p.id);
          return (
            <Fragment key={p.id}>
              <div
                className="kv"
                style={aDetail ? { cursor: "pointer" } : undefined}
                onClick={aDetail ? () => toggle(p.id) : undefined}
                title={aDetail ? (open ? "Replier le détail" : "Dérouler le détail") : undefined}
              >
                <span className="k" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  {aDetail ? (
                    <Icon name={open ? "chevronDown" : "chevronRight"} size={13} />
                  ) : (
                    <span style={{ width: 13, flex: "none" }}></span>
                  )}
                  {p.libelle}
                </span>
                <span className="v" style={p.strong ? { fontWeight: 700 } : undefined}>
                  {fmtEuroFull(p.montant)}
                </span>
              </div>
              {open &&
                p.detail!.map((d, i) => (
                  <div className="kv" key={i} style={{ paddingLeft: 34 }}>
                    <span className="k" style={{ color: "var(--fg-muted)", fontSize: 12.5 }}>
                      {d.libelle}
                    </span>
                    <span className="v" style={{ color: "var(--fg2)", fontSize: 12.5 }}>
                      {fmtEuroFull(d.montant)}
                    </span>
                  </div>
                ))}
            </Fragment>
          );
        })}
        <div className="kv">
          <span className="k" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 13, flex: "none" }}></span>
            Validé le
          </span>
          <span className="v">{fmtDate(plan.updated_at)}</span>
        </div>
        <p className="se-small" style={{ marginTop: 12, marginBottom: 0, color: "var(--fg-muted)" }}>
          Cliquez sur un poste pour dérouler son détail : travaux par entreprise, frais annexes par mission,
          aides de l'État par dispositif. Les quotes-parts individuelles (aides déduites) sont communiquées à
          chaque copropriétaire.
        </p>
      </div>
    </div>
  );
}

export function FinancementTabSyndic({ c }: { c: SyndicCopro }) {
  const { data: scenarios } = useScenariosPartages(c.id);
  const scenario = scenarios?.[0] ?? null;
  const { data: choix, isLoading: choixLoading } = useChoixFinancementScenario(scenario?.id);
  const { data: donnees, isLoading } = useDonnees(c.id);
  const { data: finConfig } = useFinancementConfig(c.id);
  // Le PF définitif validé est automatiquement partagé avec le syndic (RLS).
  const { data: pfPlans } = usePlansDefinitifs(c.id);
  const planValide = (pfPlans ?? [])
    .filter((p) => p.statut === "valide")
    .sort((a, b) => (b.updated_at > a.updated_at ? 1 : -1))[0];
  // Recalcul depuis les données du plan (moteur pur) plutôt que l'instantané
  // `resultat` : mêmes montants, mais les champs récents (entreprise des lignes
  // MOE) sont disponibles sans réenregistrement du plan.
  const pf = useMemo(
    () =>
      planValide
        ? { data: readPlanDefinitif(planValide.data), pv: computePlanDefinitif(readPlanDefinitif(planValide.data)) }
        : null,
    [planValide]
  );

  const coproprietaires = donnees?.coproprietaires ?? [];
  const lots = donnees?.lots ?? [];

  const lotsByCp = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of lots) {
      if (l.coproprietaire_id) m.set(l.coproprietaire_id, (m.get(l.coproprietaire_id) ?? 0) + 1);
    }
    return m;
  }, [lots]);

  const choixByCp = useMemo(
    () => new Map((choix ?? []).map((ch) => [ch.coproprietaire_id, ch])),
    [choix]
  );

  const counts = {
    fonds: (choix ?? []).filter((ch) => ch.type === "fonds").length,
    collectif: (choix ?? []).filter((ch) => ch.type === "collectif").length,
    individuel: (choix ?? []).filter((ch) => ch.type === "individuel").length,
  };
  const enAttente = Math.max(0, coproprietaires.length - (choix ?? []).length);

  if (isLoading || (scenario && choixLoading)) {
    return <div style={{ padding: 30, color: "var(--fg-muted)" }}>Chargement…</div>;
  }

  if (!scenario && !planValide) {
    return (
      <div className="placeholder-screen fade" style={{ minHeight: 320 }}>
        <div className="ps-ico">
          <Icon name="trendingUp" size={30} />
        </div>
        <h2>Aucun plan de financement partagé</h2>
        <p>
          Les copropriétaires choisiront leur mode de financement dès que l'équipe Strat Eco aura validé le
          plan de financement du projet.
        </p>
      </div>
    );
  }

  return (
    <div className="fade">
      <div className="moe-fin-tiles" style={{ marginTop: 0, marginBottom: 22 }}>
        <div className="moe-tile">
          <div className="l">Fonds propres</div>
          <div className="v">{counts.fonds}</div>
        </div>
        <div className="moe-tile">
          <div className="l">Éco-PTZ collectif</div>
          <div className="v accent">{counts.collectif}</div>
        </div>
        <div className="moe-tile">
          <div className="l">Éco-PTZ individuel</div>
          <div className="v">{counts.individuel}</div>
        </div>
        <div className="moe-tile">
          <div className="l">En attente de choix</div>
          <div className="v">{enAttente}</div>
        </div>
      </div>

      <div className="detail-grid">
        <div className="panel">
          <div className="p-head">
            <Icon name="trendingUp" size={18} />
            <h3>Mode de financement par copropriétaire</h3>
            <span style={{ flex: 1 }}></span>
            <span style={{ fontSize: 13, color: "var(--fg-muted)" }}>
              {(choix ?? []).length}/{coproprietaires.length} transmis
            </span>
          </div>
          <div className="p-body">
            {coproprietaires.length === 0 ? (
              <p className="se-body" style={{ margin: 0, color: "var(--fg-muted)" }}>
                Les copropriétaires seront visibles dès leur recensement par l'équipe Strat Eco.
              </p>
            ) : (
              <div className="tablewrap" style={{ maxHeight: 500, overflowY: "auto" }}>
                <table className="dossiers" style={{ fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th>Copropriétaire</th>
                      <th>Lots</th>
                      <th>Mode de financement</th>
                      <th>Durée</th>
                      <th>Transmis le</th>
                    </tr>
                  </thead>
                  <tbody>
                    {coproprietaires.map((cp) => {
                      const ch = choixByCp.get(cp.id) ?? null;
                      const meta = ch ? TYPE_META[ch.type] : null;
                      return (
                        <tr key={cp.id} style={{ cursor: "default" }}>
                          <td style={{ fontWeight: 600 }}>{cp.nom}</td>
                          <td>{lotsByCp.get(cp.id) ?? 0}</td>
                          <td>
                            {meta ? (
                              <Badge kind={meta.kind} dot>
                                {meta.label}
                              </Badge>
                            ) : (
                              <Badge kind="warn">En attente</Badge>
                            )}
                          </td>
                          <td>
                            {ch?.type === "collectif"
                              ? (finConfig?.duree_annees ?? ch.duree_annees ?? "—") + " ans"
                              : ch?.type === "individuel" && ch.duree_annees
                                ? ch.duree_annees + " ans"
                                : "—"}
                          </td>
                          <td>{ch ? fmtDate(ch.transmitted_at) : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <p className="se-small" style={{ marginTop: 12, marginBottom: 0, color: "var(--fg-muted)" }}>
              Chaque copropriétaire transmet son choix depuis son portail. Les montants individuels (quotes-parts,
              aides, restes à charge) sont gérés par l'équipe Strat Eco.
            </p>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {planValide && pf ? (
            <PfDefinitifPanel plan={planValide} pv={pf.pv} fondsTravaux={pf.data.params.fondsTravaux} />
          ) : scenario ? (
            <div className="panel">
              <div className="p-head">
                <Icon name="fileText" size={18} />
                <h3>Plan de financement</h3>
              </div>
              <div className="p-body">
                <div className="kv">
                  <span className="k">Scénario partagé</span>
                  <span className="v">{scenario.name}</span>
                </div>
                <div className="kv">
                  <span className="k">Partagé le</span>
                  <span className="v">{fmtDate(scenario.updated_at)}</span>
                </div>
                <p className="se-small" style={{ marginTop: 12, marginBottom: 0, color: "var(--fg-muted)" }}>
                  Le détail du plan de financement (aides collectives et individuelles) est présenté par l'équipe
                  Strat Eco en assemblée générale.
                </p>
              </div>
            </div>
          ) : null}

          <div className="panel">
            <div className="p-head">
              <Icon name="users" size={18} />
              <h3>Prêt collectif</h3>
            </div>
            <div className="p-body">
              {finConfig ? (
                <>
                  <div className="kv">
                    <span className="k">Banque</span>
                    <span className="v">{finConfig.banque}</span>
                  </div>
                  <div className="kv">
                    <span className="k">Durée votée en AG</span>
                    <span className="v">{finConfig.duree_annees} ans</span>
                  </div>
                  <div className="kv">
                    <span className="k">Adhésions</span>
                    <span className="v">
                      <Badge kind={finConfig.adhesion_ouverte ? "success" : "neutral"} dot={finConfig.adhesion_ouverte}>
                        {finConfig.adhesion_ouverte ? "Ouvertes" : "Pas encore ouvertes"}
                      </Badge>
                    </span>
                  </div>
                </>
              ) : (
                <p className="se-body" style={{ margin: 0, color: "var(--fg-muted)" }}>
                  Le prêt collectif n'est pas encore paramétré (banque et durée seront fixées après le vote en
                  assemblée générale).
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

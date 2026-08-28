// Onglet Suivi financier (syndic) - reprend ligne à ligne le plan de
// financement définitif validé (lots de travaux avec leur entreprise, MOE et
// frais annexes) avec le montant voté. Le syndic, qui règle les situations
// des entreprises, saisit le montant payé à chaque situation (1 à 10) :
// total payé et montant restant se calculent seuls.
import { Fragment, useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { fmtDate, fmtEuroFull } from "@/lib/format";
import { telechargerCsv } from "@/lib/csv";
import { usePlansDefinitifs } from "@/api/planDefinitif";
import {
  NB_SITUATIONS,
  useSaveSuiviFinancier,
  useSuiviFinancier,
  type PaiementsSuivi,
} from "@/api/suiviFinancier";
import { computePlanDefinitif, readPlanDefinitif, regrouperAnnexes } from "@/lib/finance";
import type { SyndicCopro } from "@/api/syndic";

interface LigneSuivi {
  /** « lot:<numero> » / « moe:<index> » / « mission:<id> » - clé des paiements. */
  key: string;
  libelle: string;
  entreprise: string | null;
  /** Montant voté TTC de la ligne (PF définitif validé). */
  vote: number;
}

const sommeLigne = (p: PaiementsSuivi, key: string) =>
  (p[key] ?? []).reduce((s: number, v) => s + (v ?? 0), 0);

export function SuiviFinancierTabSyndic({ c }: { c: SyndicCopro }) {
  // Le PF définitif validé est partagé avec le syndic (RLS) - même source que
  // l'onglet Financement.
  const { data: pfPlans, isLoading } = usePlansDefinitifs(c.id);
  const planValide = (pfPlans ?? [])
    .filter((p) => p.statut === "valide")
    .sort((a, b) => (b.updated_at > a.updated_at ? 1 : -1))[0];
  // Recalcul depuis les données (moteur pur) plutôt que l'instantané `resultat` :
  // les champs récents (entreprise des lignes MOE) sont ainsi disponibles même
  // si le plan n'a pas été réenregistré depuis leur ajout.
  const pv = useMemo(
    () => (planValide ? computePlanDefinitif(readPlanDefinitif(planValide.data)) : null),
    [planValide]
  );

  const { data: serveur, isLoading: suiviLoading } = useSuiviFinancier(c.id);
  const save = useSaveSuiviFinancier(c.id);
  // null = aucune retouche locale : on affiche ce qui est enregistré
  const [brouillon, setBrouillon] = useState<PaiementsSuivi | null>(null);
  const paiements = brouillon ?? serveur ?? {};
  const dirty = brouillon != null && JSON.stringify(brouillon) !== JSON.stringify(serveur ?? {});

  const groupes = useMemo(() => {
    if (!pv) return [];
    const travaux: LigneSuivi[] = pv.lots.map((l) => ({
      key: `lot:${l.numero}`,
      libelle: `Lot ${String(l.numero).padStart(2, "0")} - ${l.titre}`,
      entreprise: l.entreprise ?? null,
      vote: l.totalTtc,
    }));
    // Une ligne par mission (montants additionnés), puis les frais restants
    // ligne à ligne dans l'ordre du plan (module partagé avec l'onglet Financement).
    const annexes: LigneSuivi[] = regrouperAnnexes(pv.moe).map((l) => ({
      key: l.key,
      libelle: l.libelle,
      entreprise: l.entreprise,
      vote: l.montantTtc,
    }));
    return [
      { titre: "Travaux - marchés des entreprises", lignes: travaux },
      { titre: "Maîtrise d'œuvre & frais annexes", lignes: annexes },
    ].filter((g) => g.lignes.length > 0);
  }, [pv]);

  if (isLoading || suiviLoading) {
    return <div style={{ padding: 30, color: "var(--fg-muted)" }}>Chargement…</div>;
  }

  if (!planValide || !pv) {
    return (
      <div className="placeholder-screen fade" style={{ minHeight: 320 }}>
        <div className="ps-ico">
          <Icon name="euro" size={30} />
        </div>
        <h2>Aucun plan de financement validé</h2>
        <p>
          Le suivi financier reprendra ligne à ligne les montants votés (lots de travaux, maîtrise d'œuvre,
          frais annexes) dès que l'équipe Strat Eco aura validé le plan de financement définitif.
        </p>
      </div>
    );
  }

  const lignes = groupes.flatMap((g) => g.lignes);
  const totalVote = lignes.reduce((s, l) => s + l.vote, 0);
  const totalPaye = lignes.reduce((s, l) => s + sommeLigne(paiements, l.key), 0);
  const totalSituation = (i: number) => lignes.reduce((s, l) => s + (paiements[l.key]?.[i] ?? 0), 0);

  const setCellule = (key: string, i: number, brut: string) => {
    const v = brut.trim() === "" ? null : Number(brut);
    setBrouillon((prev) => {
      const base = prev ?? serveur ?? {};
      const ligne = [...(base[key] ?? Array<number | null>(NB_SITUATIONS).fill(null))];
      ligne[i] = v != null && Number.isFinite(v) ? v : null;
      return { ...base, [key]: ligne };
    });
  };

  return (
    <div className="fade">
      <div className="moe-fin-tiles" style={{ marginTop: 0, marginBottom: 22 }}>
        <div className="moe-tile">
          <div className="l">Montant voté TTC</div>
          <div className="v">{fmtEuroFull(totalVote)}</div>
        </div>
        <div className="moe-tile">
          <div className="l">Total payé</div>
          <div className="v accent">{fmtEuroFull(totalPaye)}</div>
        </div>
        <div className="moe-tile">
          <div className="l">Montant restant</div>
          <div className="v">{fmtEuroFull(totalVote - totalPaye)}</div>
        </div>
        <div className="moe-tile">
          <div className="l">Avancement des paiements</div>
          <div className="v">{totalVote > 0 ? Math.round((totalPaye / totalVote) * 100) : 0} %</div>
        </div>
      </div>

      <div className="panel">
        <div className="p-head">
          <Icon name="euro" size={18} />
          <h3>Suivi financier - {planValide.nom}</h3>
          <span style={{ flex: 1 }}></span>
          {save.isError && (
            <span style={{ fontSize: 12.5, color: "var(--color-error-700)" }}>
              Échec de l'enregistrement : {String((save.error as Error)?.message ?? save.error)}
            </span>
          )}
          {dirty && !save.isPending && (
            <span style={{ fontSize: 12.5, color: "var(--fg-muted)" }}>Modifications non enregistrées</span>
          )}
          <button
            className="se-btn se-btn-secondary btn-sm"
            title="Exporter le suivi des paiements (CSV pour Excel)"
            onClick={() =>
              telechargerCsv(
                `suivi-financier-${c.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.csv`,
                [
                  "Ligne du plan de financement",
                  "Entreprise",
                  "Voté TTC",
                  ...Array.from({ length: NB_SITUATIONS }, (_, i) => `Situation ${i + 1}`),
                  "Total payé",
                  "Restant",
                ],
                [
                  ...groupes.flatMap((g) => [
                    [g.titre],
                    ...g.lignes.map((l) => {
                      const paye = sommeLigne(paiements, l.key);
                      return [
                        l.libelle,
                        l.entreprise ?? "",
                        l.vote,
                        ...Array.from({ length: NB_SITUATIONS }, (_, i) => paiements[l.key]?.[i] ?? ""),
                        paye,
                        l.vote - paye,
                      ];
                    }),
                  ]),
                  [
                    "Total",
                    "",
                    totalVote,
                    ...Array.from({ length: NB_SITUATIONS }, (_, i) => totalSituation(i)),
                    totalPaye,
                    totalVote - totalPaye,
                  ],
                ]
              )
            }
          >
            <Icon name="download" size={13} />
            Exporter
          </button>
          <button
            className="se-btn se-btn-primary btn-sm"
            disabled={!dirty || save.isPending}
            onClick={() => void save.mutateAsync(brouillon!).then(() => setBrouillon(null))}
          >
            <Icon name="check" size={14} />
            {save.isPending ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
        <div className="p-body" style={{ paddingTop: 0 }}>
          <div className="sf-wrap">
            <table className="dossiers sf-table">
              <thead>
                <tr>
                  <th>Ligne du plan de financement</th>
                  <th>Entreprise</th>
                  <th className="num">Voté TTC</th>
                  {Array.from({ length: NB_SITUATIONS }, (_, i) => (
                    <th key={i} className="num">
                      Sit. {i + 1}
                    </th>
                  ))}
                  <th className="num">Total payé</th>
                  <th className="num">Restant</th>
                </tr>
              </thead>
              <tbody>
                {groupes.map((g) => (
                  <Fragment key={g.titre}>
                    <tr className="sf-section">
                      <td colSpan={NB_SITUATIONS + 5}>{g.titre}</td>
                    </tr>
                    {g.lignes.map((l) => {
                      const paye = sommeLigne(paiements, l.key);
                      const restant = l.vote - paye;
                      return (
                        <tr key={l.key}>
                          <td style={{ fontWeight: 600, whiteSpace: "normal", minWidth: 200 }}>{l.libelle}</td>
                          <td style={{ color: l.entreprise ? "var(--fg1)" : "var(--fg-muted)" }}>
                            {l.entreprise ?? "-"}
                          </td>
                          <td className="num" style={{ fontWeight: 600 }}>
                            {fmtEuroFull(l.vote)}
                          </td>
                          {Array.from({ length: NB_SITUATIONS }, (_, i) => (
                            <td key={i} className="num">
                              <input
                                className="sf-inp"
                                type="number"
                                min={0}
                                step={0.01}
                                placeholder="-"
                                value={paiements[l.key]?.[i] ?? ""}
                                onChange={(e) => setCellule(l.key, i, e.target.value)}
                              />
                            </td>
                          ))}
                          <td className="num" style={{ fontWeight: 600 }}>
                            {paye !== 0 ? fmtEuroFull(paye) : "-"}
                          </td>
                          <td
                            className="num"
                            style={{
                              fontWeight: 600,
                              color:
                                restant < -0.005
                                  ? "var(--color-error-700)"
                                  : restant < 0.005
                                    ? "var(--color-success-700)"
                                    : "var(--fg1)",
                            }}
                          >
                            {fmtEuroFull(restant)}
                          </td>
                        </tr>
                      );
                    })}
                  </Fragment>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Total</td>
                  <td></td>
                  <td className="num">{fmtEuroFull(totalVote)}</td>
                  {Array.from({ length: NB_SITUATIONS }, (_, i) => (
                    <td key={i} className="num">
                      {totalSituation(i) !== 0 ? fmtEuroFull(totalSituation(i)) : "-"}
                    </td>
                  ))}
                  <td className="num">{fmtEuroFull(totalPaye)}</td>
                  <td className="num">{fmtEuroFull(totalVote - totalPaye)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="se-small" style={{ color: "var(--fg-muted)", marginTop: 12, marginBottom: 0 }}>
            <Icon name="help" size={13} /> Les montants votés TTC reprennent le plan de financement définitif
            validé le {fmtDate(planValide.updated_at)}. Saisissez le montant réglé à chaque situation de
            travaux (1 à 10) - total payé et restant se calculent automatiquement, puis « Enregistrer ».
          </p>
        </div>
      </div>
    </div>
  );
}

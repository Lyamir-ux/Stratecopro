// Étape 7 — Validation & plans de financement individuels (table réelle par copropriétaire).
import { useMemo } from "react";
import { Icon } from "@/components/Icon";
import { fmtEuro } from "@/lib/format";
import {
  computePlansIndividuels,
  type Bareme,
  type FinanceParams,
  type FinanceResult,
  type OwnerInput,
} from "@/lib/finance";
import type { CoproWithStats } from "@/api/copros";
import type { DonneesCopro } from "@/api/donnees";

/** Regroupe les lots réels par copropriétaire sur la clé choisie. */
export function buildOwners(donnees: DonneesCopro, cle: string): { owners: OwnerInput[]; totalCle: number; nonAttribues: number } {
  const byOwner = new Map<string, OwnerInput>();
  let nonAttribues = 0;
  for (const lot of donnees.lots) {
    const tan = lot.tantiemes[cle] ?? 0;
    if (!lot.coproprietaire_id) {
      if (tan > 0) nonAttribues += tan;
      continue;
    }
    let o = byOwner.get(lot.coproprietaire_id);
    if (!o) {
      o = {
        id: lot.coproprietaire_id,
        nom: lot.coproprietaire?.nom ?? "—",
        profil: null, // rattaché à l'enquête sociale en M7
        lots: [],
      };
      byOwner.set(lot.coproprietaire_id, o);
    }
    o.lots.push({ id: lot.id, num: lot.num, usage: lot.usage, tantiemes: tan });
  }
  const totalCle = donnees.lots.reduce((a, l) => a + (l.tantiemes[cle] ?? 0), 0);
  return { owners: Array.from(byOwner.values()), totalCle: totalCle || 1000, nonAttribues };
}

interface Props {
  s: FinanceParams;
  d: FinanceResult;
  c: CoproWithStats;
  bareme: Bareme;
  donnees: DonneesCopro | undefined;
  validated: boolean;
  validating: boolean;
  plansCount: number | null;
  onValidate: () => void;
}

export function Step7({ s, d, c, bareme, donnees, validated, validating, plansCount, onValidate }: Props) {
  const built = useMemo(() => (donnees ? buildOwners(donnees, s.cle) : null), [donnees, s.cle]);
  const plans = useMemo(
    () => (built && built.owners.length ? computePlansIndividuels(s, d, built.owners, bareme, built.totalCle) : null),
    [built, s, d, bareme]
  );

  if (!donnees || !built) return <div style={{ padding: 20, color: "var(--fg-muted)" }}>Chargement…</div>;

  if (built.owners.length === 0) {
    return (
      <div className="fade">
        <h2 className="step-h">Validation &amp; plans de financement</h2>
        <p className="step-d">
          Aucun copropriétaire avec des lots sur la clé « {s.cle} ». Importez d'abord les lots et tantièmes dans
          l'onglet <b>Données de la copro</b>.
        </p>
      </div>
    );
  }

  const rows = plans!.plans;
  const t = plans!.totals;

  return (
    <div className="fade">
      <h2 className="step-h">Validation &amp; plans de financement</h2>
      <p className="step-d">
        Vérifiez la répartition des quote-parts par copropriétaire. La validation enregistre les plans individuels.
      </p>

      {built.nonAttribues > 0 && (
        <div className="import-note" style={{ marginBottom: 16 }}>
          <Icon name="alert" size={16} />
          <span>
            {built.nonAttribues.toLocaleString("fr-FR")} ‰ portés par des lots sans copropriétaire — non répartis dans
            les plans.
          </span>
        </div>
      )}

      {validated && (
        <div
          className="casc-reste"
          style={{
            background: "var(--color-success-50)",
            border: "1px solid var(--color-success-500)",
            marginBottom: 20,
            maxWidth: 720,
          }}
        >
          <span className="l" style={{ color: "var(--color-success-700)", display: "flex", alignItems: "center", gap: 8 }}>
            <Icon name="checkCircle" size={18} />
            Quote-parts recalculées · {plansCount ?? rows.length} plans enregistrés
          </span>
        </div>
      )}

      <div className="plans-wrap" style={{ maxHeight: 420 }}>
        <table className="plans">
          <thead>
            <tr>
              <th>Copropriétaire</th>
              <th>Lots</th>
              <th>Tantièmes</th>
              <th>Quote-part</th>
              <th>MPR indiv.</th>
              <th>CEE</th>
              <th>Subv. coll.</th>
              <th>Éco-PTZ</th>
              <th>Reste à charge</th>
              <th>Mensualité</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.ownerId}>
                <td>{r.nom}</td>
                <td className="mono">{r.lotNums.map((n) => `n°${n}`).join(", ")}</td>
                <td className="mono">
                  {r.tantiemes.toLocaleString("fr-FR")}/{built.totalCle.toLocaleString("fr-FR")}
                </td>
                <td>{fmtEuro(r.quotePart)}</td>
                <td>{fmtEuro(r.mprIndiv)}</td>
                <td>{fmtEuro(r.cee)}</td>
                <td>{fmtEuro(r.subvColl)}</td>
                <td>{fmtEuro(r.ecoPtz)}</td>
                <td style={{ fontWeight: 700, color: "var(--color-primary-700)" }}>{fmtEuro(r.resteACharge)}</td>
                <td>{fmtEuro(r.mensualite)}</td>
              </tr>
            ))}
            <tr className="tot">
              <td>Total ({rows.length} copropriétaires)</td>
              <td></td>
              <td className="mono">
                {t.tantiemes.toLocaleString("fr-FR")}/{built.totalCle.toLocaleString("fr-FR")}
              </td>
              <td>{fmtEuro(t.quotePart)}</td>
              <td>{fmtEuro(t.mprIndiv)}</td>
              <td>{fmtEuro(t.cee)}</td>
              <td>{fmtEuro(t.subvColl)}</td>
              <td>{fmtEuro(t.ecoPtz)}</td>
              <td>{fmtEuro(t.resteACharge)}</td>
              <td>{fmtEuro(t.mensualite)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="se-small" style={{ marginTop: 12 }}>
        {c.stats?.lots ?? 0} lots · clé {s.cle} · les profils MPR individuels seront rattachés automatiquement dès
        l'enquête sociale saisie.
      </p>
      <button
        className="se-btn se-btn-primary"
        style={{ marginTop: 10 }}
        onClick={onValidate}
        disabled={validating || validated}
      >
        <Icon name="checkCircle" size={16} />
        {validating ? "Enregistrement…" : validated ? "Plans validés" : "Valider & recalculer les quote-parts"}
      </button>
    </div>
  );
}

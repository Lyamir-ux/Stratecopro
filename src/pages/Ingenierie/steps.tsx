// Étapes 1 à 6 de l'assistant - portées de design-reference/project/ingenierie.jsx.
import { Icon } from "@/components/Icon";
import { Cascade } from "@/components/Cascade";
import { fmtEuro } from "@/lib/format";
import type { Bareme, FinanceParams, FinanceResult, Profil } from "@/lib/finance";
import type { Tables } from "@/lib/database.types";
import type { CoproWithStats } from "@/api/copros";

export type SetParams = (patch: Partial<FinanceParams>) => void;

interface StepProps {
  s: FinanceParams;
  set: SetParams;
  d: FinanceResult;
  c: CoproWithStats;
  bareme: Bareme;
}

const PROFIL_COLORS: Record<Profil, string> = {
  Bleu: "#2E6FA8",
  Jaune: "#f2a30d",
  Violet: "#7A5AE0",
  Rose: "#DC6FA8",
};

function NumField({
  label,
  sub,
  value,
  onChange,
  step,
  suffix,
  full,
}: {
  label: string;
  sub?: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  suffix?: string;
  full?: boolean;
}) {
  return (
    <div className={"param" + (full ? " full" : "")}>
      <label>
        {label} {sub && <span className="sub">· {sub}</span>}
      </label>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input type="number" value={value} step={step || 100} onChange={(e) => onChange(Number(e.target.value) || 0)} />
        {suffix && <span style={{ color: "var(--fg-muted)", fontWeight: 600, fontSize: 14 }}>{suffix}</span>}
      </div>
    </div>
  );
}

export function Step1({ s, set, d }: StepProps) {
  return (
    <div className="fade">
      <h2 className="step-h">Chiffrage des travaux</h2>
      <p className="step-d">
        Renseignez le coût de l'opération : travaux, honoraires (AMO, MOE, contrôles) et provision pour aléas.
      </p>
      <div className="param-grid">
        <NumField label="Travaux HT" value={s.travaux} onChange={(v) => set({ travaux: v })} suffix="€" />
        <NumField label="Honoraires" sub="AMO + MOE" value={s.honoraires} onChange={(v) => set({ honoraires: v })} suffix="€" />
        <NumField label="Aléas" sub="provision" value={s.aleas} onChange={(v) => set({ aleas: v })} suffix="€" />
        <div className="param">
          <label>Coût total de l'opération</label>
          <div className="big-num" style={{ color: "var(--color-primary-700)" }}>{fmtEuro(d.coutTotal)}</div>
        </div>
      </div>
    </div>
  );
}

export function Step2({ s, set, c, cles }: StepProps & { cles: Tables<"cles_repartition">[] }) {
  const descs: Record<string, string> = {
    MUN: "Répartition au prorata des tantièmes de chaque lot (clé générale MUN).",
    ESC: "Pour les travaux spécifiques à une cage d'escalier (ascenseur, hall).",
  };
  // Sans import de lots, le dossier n'a pas encore de clé : carte générique en attendant.
  const list = cles.length
    ? cles
    : [{ id: "mun", code: "MUN", label: "Tantièmes généraux", is_default: true, copro_id: c.id }];
  return (
    <div className="fade">
      <h2 className="step-h">Clé de répartition</h2>
      <p className="step-d">
        Choisissez comment répartir le coût entre les copropriétaires. Cette clé sert au calcul des quote-parts
        individuelles.
      </p>
      <div className="opt-cards">
        {list.map((k) => (
          <div key={k.code} className={"opt-card" + (s.cle === k.code ? " sel" : "")} onClick={() => set({ cle: k.code })}>
            <div className="oc-t">{k.label || `Clé ${k.code}`}</div>
            <div className="oc-d">{descs[k.code] ?? `Répartition selon la clé « ${k.code} » du règlement de copropriété.`}</div>
          </div>
        ))}
      </div>
      {cles.length === 0 && (
        <p className="se-small" style={{ marginTop: 10, color: "var(--fg-muted)" }}>
          Les clés réelles du règlement seront reprises des en-têtes du fichier importé dans l'onglet Données.
        </p>
      )}
      <div className="cc-next" style={{ marginTop: 22, maxWidth: 680 }}>
        <Icon name="layers" size={15} className="ico" />
        <span>
          {c.stats?.batiments ?? 0} bâtiment{(c.stats?.batiments ?? 0) > 1 ? "s" : ""} · {c.stats?.lots ?? 0} lots · clé
          appliquée : <b>{list.find((k) => k.code === s.cle)?.label || s.cle}</b>
        </span>
      </div>
    </div>
  );
}

export function Step3({ s, set, d, c, bareme }: StepProps) {
  const tauxApplique = s.mprCoproPct + (s.bonusPassoire ? bareme.mprCopro.bonusPassoire : 0);
  return (
    <div className="fade">
      <h2 className="step-h">Aides collectives</h2>
      <p className="step-d">
        Subventions mobilisées à l'échelle de la copropriété : MaPrimeRénov' Copropriétés, CEE et fonds disponibles.
      </p>
      <div className="param-grid">
        <div className="param">
          <label>
            Taux MaPrimeRénov' Copro <span className="sub">· gain {c.gain_pct ?? "?"} %</span>
          </label>
          <select value={s.mprCoproPct} onChange={(e) => set({ mprCoproPct: Number(e.target.value) })}>
            <option value={bareme.mprCopro.tauxStandard}>
              {bareme.mprCopro.tauxStandard} % - gain de {bareme.mprCopro.seuilMin} à {bareme.mprCopro.seuilMajore} %
            </option>
            <option value={bareme.mprCopro.tauxMajore}>
              {bareme.mprCopro.tauxMajore} % - gain ≥ {bareme.mprCopro.seuilMajore} %
            </option>
          </select>
        </div>
        <div className="param">
          <label>Bonus sortie de passoire (F/G)</label>
          <select value={s.bonusPassoire ? "1" : "0"} onChange={(e) => set({ bonusPassoire: e.target.value === "1" })}>
            <option value="1">Oui · +{bareme.mprCopro.bonusPassoire} %</option>
            <option value="0">Non</option>
          </select>
        </div>
        <NumField label="CEE" sub="Certificats d'Économie d'Énergie" value={s.cee} onChange={(v) => set({ cee: v })} suffix="€" />
        <NumField label="Fonds (Alur, provisions)" value={s.fonds} onChange={(v) => set({ fonds: v })} suffix="€" />
        <div className="param full">
          <div className="casc-reste" style={{ background: "var(--accent-soft)" }}>
            <span className="l">Total des aides collectives</span>
            <span className="v">{fmtEuro(d.aidesColl)}</span>
          </div>
          <span className="sub" style={{ marginTop: 6 }}>
            Dont MaPrimeRénov' Copro : {fmtEuro(d.mprCopro)} (taux appliqué {tauxApplique} %)
          </span>
        </div>
      </div>
    </div>
  );
}

export function Step4({ s, set, d, profilsEnquete }: StepProps & { profilsEnquete?: Map<string, Profil> }) {
  const setProf = (p: Profil, v: number) => set({ profils: { ...s.profils, [p]: v } });
  const setPrime = (p: Profil, v: number) => set({ primeIndiv: { ...s.primeIndiv, [p]: v } });
  const reprendreEnquete = () => {
    if (!profilsEnquete) return;
    const counts: Record<Profil, number> = { Bleu: 0, Jaune: 0, Violet: 0, Rose: 0 };
    for (const p of profilsEnquete.values()) counts[p] += 1;
    set({ profils: counts });
  };
  return (
    <div className="fade">
      <h2 className="step-h">Aides individuelles</h2>
      <p className="step-d">
        Primes MaPrimeRénov' individuelles selon le profil de revenus des copropriétaires (issu de l'enquête sociale).
      </p>
      {profilsEnquete && profilsEnquete.size > 0 && (
        <button className="se-btn se-btn-secondary btn-sm" style={{ marginBottom: 16 }} onClick={reprendreEnquete}>
          <Icon name="users" size={15} />
          Reprendre les profils de l'enquête ({profilsEnquete.size} réponses)
        </button>
      )}
      <div style={{ maxWidth: 640 }}>
        <div
          className="prof-row"
          style={{
            borderBottom: "2px solid var(--border-strong)",
            fontSize: 12,
            color: "var(--fg-muted)",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          <span>Profil</span>
          <span>Prime par logement</span>
          <span style={{ textAlign: "right" }}>Nb. lots</span>
        </div>
        {(Object.keys(PROFIL_COLORS) as Profil[]).map((p) => (
          <div className="prof-row" key={p}>
            <span className="prof-name">
              <span className="sw" style={{ background: PROFIL_COLORS[p] }}></span>
              {p}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="number" value={s.primeIndiv[p]} step={250} onChange={(e) => setPrime(p, Number(e.target.value) || 0)} />
              <span style={{ color: "var(--fg-muted)", fontSize: 13 }}>€</span>
            </div>
            <input type="number" value={s.profils[p]} onChange={(e) => setProf(p, Number(e.target.value) || 0)} />
          </div>
        ))}
        <div className="casc-reste" style={{ background: "var(--accent-soft)", marginTop: 18 }}>
          <span className="l">Total des aides individuelles</span>
          <span className="v">{fmtEuro(d.aidesIndiv)}</span>
        </div>
      </div>
    </div>
  );
}

export function Step5({ s, set, d, c, bareme }: StepProps) {
  const lots = c.stats?.lots || 1;
  return (
    <div className="fade">
      <h2 className="step-h">Configuration des prêts</h2>
      <p className="step-d">
        Mobilisez l'éco-PTZ collectif pour financer le reste à charge. Plafond{" "}
        {fmtEuro(bareme.ecoPtz.plafondParLogement)} / logement, durée jusqu'à {bareme.ecoPtz.dureeMax} ans, taux 0 %.
      </p>
      <div style={{ maxWidth: 640, display: "flex", flexDirection: "column", gap: 22 }}>
        <div className="param">
          <label>Éco-PTZ collectif</label>
          <div className="opt-cards" style={{ gridTemplateColumns: "1fr 1fr", maxWidth: 420 }}>
            <div className={"opt-card" + (s.ecoPtz ? " sel" : "")} onClick={() => set({ ecoPtz: true })}>
              <div className="oc-t">Activé</div>
              <div className="oc-d">Souscrit par la copropriété</div>
            </div>
            <div className={"opt-card" + (!s.ecoPtz ? " sel" : "")} onClick={() => set({ ecoPtz: false })}>
              <div className="oc-t">Désactivé</div>
              <div className="oc-d">Sans prêt collectif</div>
            </div>
          </div>
        </div>
        {s.ecoPtz && (
          <>
            <div className="slider-row">
              <div className="sr-top">
                <label style={{ fontWeight: 600, fontSize: 13.5 }}>Part du reste à charge financée</label>
                <span className="sr-val">{s.ecoPtzPct} %</span>
              </div>
              <input
                className="range"
                type="range"
                min="0"
                max="100"
                step="5"
                value={s.ecoPtzPct}
                onChange={(e) => set({ ecoPtzPct: Number(e.target.value) })}
              />
            </div>
            <div className="slider-row">
              <div className="sr-top">
                <label style={{ fontWeight: 600, fontSize: 13.5 }}>Durée de remboursement</label>
                <span className="sr-val">{s.ecoPtzDuree} ans</span>
              </div>
              <input
                className="range"
                type="range"
                min={bareme.ecoPtz.dureeMin}
                max={bareme.ecoPtz.dureeMax}
                value={s.ecoPtzDuree}
                onChange={(e) => set({ ecoPtzDuree: Number(e.target.value) })}
              />
            </div>
            <div className="param">
              <label>
                Avance de subvention <span className="sub">prise en charge de la subvention individuelle</span>
              </label>
              <select value={s.avancePct} onChange={(e) => set({ avancePct: Number(e.target.value) })}>
                <option value={0}>0 %</option>
                <option value={70}>70 %</option>
                <option value={100}>100 %</option>
              </select>
            </div>
            <div className="sy-tiles" style={{ gridTemplateColumns: "1fr 1fr", maxWidth: 420 }}>
              <div className="sy-tile">
                <div className="l">Montant éco-PTZ</div>
                <div className="v">{fmtEuro(d.ecoPtzMontant)}</div>
              </div>
              <div className="sy-tile">
                <div className="l">Mensualité moyenne / lot</div>
                <div className="v accent">{fmtEuro(d.mensualiteEcoPtz / lots)}</div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function Step6({ d }: { d: FinanceResult }) {
  const rows = [
    { l: "Aides collectives (MPR Copro, CEE, Fonds)", v: d.aidesColl, k: "primary" as const },
    { l: "Aides individuelles (MPR profils)", v: d.aidesIndiv, k: "primary" as const },
    { l: "Éco-PTZ collectif mobilisé", v: d.ecoPtzMontant, k: "blue" as const },
  ];
  return (
    <div className="fade">
      <h2 className="step-h">Reste à charge</h2>
      <p className="step-d">
        Synthèse en cascade : du coût total de l'opération au reste à charge après mobilisation des aides et des prêts.
      </p>
      <div style={{ maxWidth: 720 }}>
        <Cascade
          total={{ l: "Coût total de l'opération (TTC)", v: d.coutTotal }}
          rows={rows}
          reste={{ l: "Reste à charge final", v: d.resteACharge }}
        />
      </div>
    </div>
  );
}

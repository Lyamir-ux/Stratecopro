// Mon financement : choix du mode de financement du reste à charge
// (prêt collectif éco-PTZ, prêt individuel, fonds propres) — persisté en base.
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { fmtEuro } from "@/lib/format";
import {
  computeIndiv,
  lotTantiemes,
  totalTantiemes,
  useSaveChoix,
  type ChoixFinancement,
  type Membership,
  type Scenario,
  type TypeFinancement,
} from "@/api/portail";
import { readParams } from "@/api/scenarios";
import type { Bareme, Profil } from "@/lib/finance";
import type { Tables } from "@/lib/database.types";

const A_FOURNIR = [
  "Avis d'imposition (N-1)",
  "Pièce d'identité en cours de validité",
  "RIB correspondant au mandat SEPA",
  "Justificatif de propriété du ou des lots",
];

export function Financement({
  membership,
  scenario,
  bareme,
  plan,
  profil,
  choix,
}: {
  membership: Membership;
  scenarios: Scenario[];
  scenario: Scenario | null;
  bareme: Bareme | null;
  plan: Tables<"plans_individuels"> | null;
  profil: Profil | null;
  choix: ChoixFinancement | null;
  go: (s: string) => void;
}) {
  const lots = membership.lots;
  const [editing, setEditing] = useState(false);
  const [type, setType] = useState<TypeFinancement>(choix?.type ?? "collectif");
  const [years, setYears] = useState(choix?.duree_annees ?? 15);
  const [selLots, setSelLots] = useState<string[]>(
    choix?.lot_ids?.length ? choix.lot_ids : lots.map((l) => l.id)
  );
  const save = useSaveChoix(scenario?.id ?? "", membership.coproprietaireId);

  if (!scenario || !bareme) {
    return (
      <div className="fade">
        <h1 className="sec-title">Mon financement</h1>
        <div className="cc-next">
          <Icon name="alert" size={15} className="ico" style={{ color: "var(--color-warning-500)" }} />
          <span>Le choix de financement sera ouvert quand votre AMO aura partagé le plan de financement.</span>
        </div>
      </div>
    );
  }

  const cle = readParams(scenario.params, bareme).cle;
  const montant = computeIndiv(scenario, bareme, plan, totalTantiemes(lots, cle), profil).reste;
  const dureeMin = bareme.ecoPtz.dureeMin;
  const dureeMax = bareme.ecoPtz.dureeMax;
  const mensualite = montant / (Math.max(1, years) * 12);
  const toggleLot = (id: string) =>
    setSelLots((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const transmit = (t: TypeFinancement) => {
    save.mutate(
      {
        type: t,
        dureeAnnees: t === "collectif" ? years : null,
        lotIds: t === "individuel" ? selLots : [],
      },
      { onSuccess: () => setEditing(false) }
    );
  };

  // ---------- Choix déjà transmis ----------
  if (choix && !editing) {
    const lotsChoisis = lots.filter((l) => choix.lot_ids.includes(l.id));
    return (
      <div className="fade">
        <h1 className="sec-title">Mon financement</h1>
        <div className="card-xl fade" style={{ maxWidth: 660 }}>
          <div className="cx-body" style={{ textAlign: "center", padding: 40 }}>
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: "50%",
                background: "var(--color-success-500)",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 18px",
              }}
            >
              <Icon name="check" size={32} />
            </div>
            <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 24, margin: "0 0 8px" }}>
              Votre choix est transmis
            </h2>
            <p className="se-body" style={{ maxWidth: 460, margin: "0 auto 20px" }}>
              {choix.type === "fonds" ? (
                <>Vous financez votre reste à charge de <b>{fmtEuro(montant)}</b> sur <b>fonds propres</b>. Aucune démarche de prêt n'est nécessaire.</>
              ) : choix.type === "individuel" ? (
                <>
                  Votre demande de <b>prêt individuel</b> pour {lotsChoisis.length > 1 ? "les lots " : "le lot "}
                  {lotsChoisis.map((l) => "n°" + l.num).join(", ")} est transmise à votre AMO, qui reviendra vers
                  vous pour le montage du dossier bancaire.
                </>
              ) : (
                <>
                  Vous avez choisi le <b>prêt collectif</b> pour <b>{fmtEuro(montant)}</b> sur{" "}
                  <b>{choix.duree_annees} ans</b> ({fmtEuro(montant / (Math.max(1, choix.duree_annees ?? 15) * 12))}
                  /mois). Pensez à déposer vos pièces justificatives dans « Mes documents ».
                </>
              )}
            </p>
            <button className="se-btn se-btn-secondary" onClick={() => setEditing(true)}>
              Modifier mon choix
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---------- Sélection ----------
  return (
    <div className="fade">
      <h1 className="sec-title">Mon financement</h1>
      <p className="sec-sub">
        Choisissez comment financer votre reste à charge de <b>{fmtEuro(montant)}</b> : prêt collectif, prêt
        individuel ou fonds propres.
      </p>

      <div className="loan-opts loan-opts-3">
        <div className={"loan-opt" + (type === "collectif" ? " sel" : "")} onClick={() => setType("collectif")}>
          <div className="lo-ico"><Icon name="users" size={22} /></div>
          <h3>Prêt collectif</h3>
          <p>Éco-PTZ souscrit par la copropriété. Vous adhérez pour votre seule quote-part — pas de banque à contacter.</p>
          <div className="loan-terms"><span className="term">Recommandé</span><span className="term">Sans démarche bancaire</span></div>
        </div>
        <div className={"loan-opt" + (type === "individuel" ? " sel" : "")} onClick={() => setType("individuel")}>
          <div className="lo-ico"><Icon name="user" size={22} /></div>
          <h3>Prêt individuel</h3>
          <p>Vous contractez l'éco-PTZ directement auprès de votre banque partenaire, lot par lot.</p>
          <div className="loan-terms"><span className="term">Votre banque</span><span className="term">Lot par lot</span></div>
        </div>
        <div className={"loan-opt" + (type === "fonds" ? " sel" : "")} onClick={() => setType("fonds")}>
          <div className="lo-ico"><Icon name="euro" size={22} /></div>
          <h3>Fonds propres</h3>
          <p>Vous réglez votre reste à charge sans recourir à un prêt, selon l'échéancier d'appels de fonds.</p>
          <div className="loan-terms"><span className="term">Sans crédit</span></div>
        </div>
      </div>

      {type === "collectif" && (
        <div className="split" style={{ marginTop: 22 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div className="card-xl">
              <div className="cx-head"><Icon name="calendar" size={19} /><h2 style={{ fontSize: 18 }}>Durée de remboursement</h2></div>
              <div className="cx-body">
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                  <span className="se-small">{dureeMin} ans</span>
                  <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 18, color: "var(--color-primary-700)" }}>
                    {years} ans
                  </span>
                  <span className="se-small">{dureeMax} ans</span>
                </div>
                <input
                  className="range"
                  type="range"
                  min={dureeMin}
                  max={dureeMax}
                  value={years}
                  onChange={(e) => setYears(Number(e.target.value))}
                />
                <div className="kv" style={{ marginTop: 14 }}><span className="k">Montant financé</span><span className="v">{fmtEuro(montant)}</span></div>
                <div className="kv"><span className="k">Taux d'intérêt</span><span className="v">0 % (éco-PTZ)</span></div>
                <div className="casc-reste" style={{ marginTop: 12 }}><span className="l">Mensualité estimée</span><span className="v">{fmtEuro(mensualite)}</span></div>
              </div>
            </div>
            <button className="se-btn se-btn-primary" onClick={() => transmit("collectif")} disabled={save.isPending}>
              <Icon name="checkCircle" size={18} />
              {save.isPending ? "Transmission…" : "Adhérer au prêt collectif"}
            </button>
          </div>

          <div className="card-xl">
            <div className="cx-head"><Icon name="clipboard" size={19} /><h2 style={{ fontSize: 18 }}>Documents à fournir</h2></div>
            <div className="cx-body" style={{ paddingTop: 6, paddingBottom: 6 }}>
              {A_FOURNIR.map((l) => (
                <div key={l} className="afournir-row">
                  <Icon name="check" size={15} style={{ color: "var(--color-primary-700)" }} />{l}
                </div>
              ))}
              <p className="se-small" style={{ color: "var(--fg-muted)", marginTop: 10 }}>
                Déposez ces pièces dans <b>« Mes documents »</b> — le bulletin d'adhésion vous sera transmis par
                votre AMO.
              </p>
            </div>
          </div>
        </div>
      )}

      {type === "individuel" && (
        <div className="split" style={{ marginTop: 22 }}>
          <div className="card-xl">
            <div className="cx-head"><Icon name="building" size={19} style={{ color: "var(--accent)" }} /><h2 style={{ fontSize: 18 }}>Lots à financer</h2></div>
            <div className="cx-body" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {lots.map((l) => (
                <label key={l.id} className={"lot-check" + (selLots.includes(l.id) ? " on" : "")}>
                  <input type="checkbox" checked={selLots.includes(l.id)} onChange={() => toggleLot(l.id)} />
                  <span className="lc-main">
                    <b>Lot n°{l.num}</b>{l.batiment ? " · Bât. " + l.batiment : ""}
                  </span>
                  <span className="lc-tant">{lotTantiemes(l, cle)}/1000</span>
                </label>
              ))}
              <p className="se-small" style={{ color: "var(--fg-muted)" }}>
                Vous contractez un éco-PTZ par lot auprès de votre banque partenaire.
              </p>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div className="proc-note">
              <Icon name="alert" size={18} />
              <div>
                <b>Votre AMO vous accompagne.</b>
                <span>
                  Après transmission, l'équipe Strat Eco prépare avec vous le dossier de prêt individuel à
                  déposer auprès de la banque partenaire.
                </span>
              </div>
            </div>
            <button
              className="se-btn se-btn-primary"
              disabled={selLots.length === 0 || save.isPending}
              style={{ opacity: selLots.length ? 1 : 0.5 }}
              onClick={() => selLots.length && transmit("individuel")}
            >
              <Icon name="send" size={17} />
              {save.isPending ? "Transmission…" : "Transmettre ma demande"}
            </button>
          </div>
        </div>
      )}

      {type === "fonds" && (
        <div className="split" style={{ marginTop: 22 }}>
          <div className="card-xl" style={{ maxWidth: 560 }}>
            <div className="cx-head"><Icon name="euro" size={19} style={{ color: "var(--accent)" }} /><h2 style={{ fontSize: 18 }}>Financement sur fonds propres</h2></div>
            <div className="cx-body">
              <div className="kv"><span className="k">Reste à charge à régler</span><span className="v">{fmtEuro(montant)}</span></div>
              <div className="kv"><span className="k">Modalité</span><span className="v">Appels de fonds du syndic</span></div>
              <p className="se-body" style={{ marginTop: 12 }}>
                Vous réglez votre quote-part de reste à charge selon l'échéancier d'appels de fonds voté en
                assemblée générale, sans souscrire de prêt.
              </p>
              <button className="se-btn se-btn-primary" style={{ marginTop: 8 }} onClick={() => transmit("fonds")} disabled={save.isPending}>
                <Icon name="checkCircle" size={17} />
                {save.isPending ? "Transmission…" : "Confirmer le financement sur fonds propres"}
              </button>
            </div>
          </div>
        </div>
      )}

      {save.isError && (
        <p className="se-small" style={{ color: "var(--color-error-700)", marginTop: 14 }}>
          La transmission a échoué. Réessayez ou contactez votre AMO.
        </p>
      )}
    </div>
  );
}

// Enquête sociale côté portail : le copropriétaire saisit son foyer et son RFR,
// le profil MaPrimeRénov' est calculé par le moteur (barème actif) et enregistré.
import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { fmtEuro } from "@/lib/format";
import { PROFILS_MPR } from "@/lib/referentiels";
import { useEnquetePortail, useMaReponse, useSaveMaReponse, type Membership } from "@/api/portail";
import type { Bareme, Profil } from "@/lib/finance";

export function Enquete({ membership, bareme }: { membership: Membership; bareme: Bareme | null }) {
  const { data: enquete, isLoading } = useEnquetePortail(membership.copro.id);
  const { data: reponse } = useMaReponse(enquete?.id, membership.coproprietaireId);
  const save = useSaveMaReponse(enquete?.id ?? "", membership.coproprietaireId);

  const [persons, setPersons] = useState(3);
  const [rfr, setRfr] = useState(34000);
  const [statut, setStatut] = useState("occupant");
  const [result, setResult] = useState<Profil | null>(null);

  // préremplissage depuis la réponse existante
  useEffect(() => {
    if (!reponse) return;
    if (reponse.nb_personnes != null) setPersons(reponse.nb_personnes);
    if (reponse.rfr != null) setRfr(Number(reponse.rfr));
    if (reponse.statut_occupation) setStatut(reponse.statut_occupation);
    setResult((reponse.profil_mpr as Profil | null) ?? null);
  }, [reponse]);

  const compute = () => {
    if (!bareme || !enquete) return;
    save.mutate(
      { nbPersonnes: persons, statutOccupation: statut, rfr, bareme },
      { onSuccess: (p) => setResult(p) }
    );
  };

  const info = result ? PROFILS_MPR[result] : null;

  return (
    <div className="fade">
      <h1 className="sec-title">Enquête sociale</h1>
      <p className="sec-sub">
        Quelques informations confidentielles pour déterminer votre profil MaPrimeRénov' et vos aides
        individuelles.
      </p>

      {!isLoading && !enquete && (
        <div className="cc-next" style={{ marginBottom: 20 }}>
          <Icon name="alert" size={15} className="ico" style={{ color: "var(--color-warning-500)" }} />
          <span>L'enquête sociale n'a pas encore été ouverte par votre AMO pour cette copropriété.</span>
        </div>
      )}

      <div className="split">
        <div className="card-xl">
          <div className="cx-head">
            <Icon name="clipboard" size={20} style={{ color: "var(--accent)" }} />
            <h2>Votre foyer</h2>
          </div>
          <div className="cx-body">
            <div className="form-grid">
              <div className="fld">
                <label>Nombre de personnes au foyer</label>
                <select value={persons} onChange={(e) => setPersons(Number(e.target.value))}>
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                    <option key={n} value={n}>{n} personne{n > 1 ? "s" : ""}</option>
                  ))}
                </select>
              </div>
              <div className="fld">
                <label>Statut d'occupation</label>
                <select value={statut} onChange={(e) => setStatut(e.target.value)}>
                  <option value="occupant">Propriétaire occupant</option>
                  <option value="bailleur">Propriétaire bailleur</option>
                </select>
              </div>
              <div className="fld" style={{ gridColumn: "1 / -1" }}>
                <label>
                  Revenu fiscal de référence <span className="hint">(avis d'imposition, ligne 25)</span>
                </label>
                <input type="number" value={rfr} onChange={(e) => setRfr(Number(e.target.value))} step="1000" min="0" />
              </div>
            </div>
            <button
              className="se-btn se-btn-primary"
              style={{ marginTop: 20 }}
              onClick={compute}
              disabled={!enquete || !bareme || save.isPending}
            >
              <Icon name="checkCircle" size={17} />
              {save.isPending ? "Calcul…" : "Déterminer mon profil"}
            </button>
            {save.isError && (
              <p className="se-small" style={{ color: "var(--color-error-700)", marginTop: 10 }}>
                L'enregistrement a échoué. Réessayez ou contactez votre AMO.
              </p>
            )}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {info ? (
            <div className="card-xl fade">
              <div className="profil-result" style={{ background: info.color }}>
                <div className="pr-badge">{info.label}</div>
                <div className="pr-meta">
                  <div className="t">Profil {info.label}</div>
                  <div className="s">{info.desc}</div>
                </div>
              </div>
              <div className="cx-body" style={{ paddingTop: 18 }}>
                <div className="kv"><span className="k">Taux d'aide MaPrimeRénov'</span><span className="v">{info.taux}</span></div>
                <div className="kv"><span className="k">Foyer</span><span className="v">{persons} pers. · {fmtEuro(rfr)} / an</span></div>
                <p className="se-small" style={{ marginTop: 12 }}>
                  Votre plan de financement individuel a été mis à jour avec ce profil.
                </p>
              </div>
            </div>
          ) : (
            <div className="card-xl">
              <div className="cx-body" style={{ textAlign: "center", color: "var(--fg3)" }}>
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: "var(--radius-lg)",
                    background: "var(--accent-soft)",
                    color: "var(--color-primary-700)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    margin: "8px auto 14px",
                  }}
                >
                  <Icon name="leaf" size={26} />
                </div>
                <p className="se-body" style={{ margin: 0 }}>
                  Renseignez votre foyer pour découvrir votre profil et le niveau d'aides auquel vous êtes
                  éligible.
                </p>
              </div>
            </div>
          )}
          <div className="cc-next">
            <Icon name="checkCircle" size={15} className="ico" />
            <span>Vos données sont confidentielles et ne servent qu'au calcul de vos aides.</span>
          </div>
        </div>
      </div>
    </div>
  );
}

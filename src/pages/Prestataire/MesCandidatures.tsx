// Historique des candidatures du prestataire connecté, avec le statut donné
// par l'AMO (reçue / retenue / non retenue).
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui";
import { fmtEuro, fmtDate } from "@/lib/format";
import { CONSULT_TYPES } from "@/api/consultations";
import { useMesCandidatures, type CandidaturePresta } from "@/api/espacePrestataire";
import type { Tables } from "@/lib/database.types";

function StatutBadge({ statut }: { statut: CandidaturePresta["statut"] }) {
  if (statut === "retenue") return <Badge kind="success" dot>Retenue</Badge>;
  if (statut === "non_retenue") return <Badge kind="neutral">Non retenue</Badge>;
  return <Badge kind="blue" dot>Reçue — en cours d'analyse</Badge>;
}

export function MesCandidatures({ presta }: { presta: Tables<"prestataires"> }) {
  const { data: candidatures } = useMesCandidatures(presta.id);
  const list = candidatures ?? [];

  return (
    <div className="page" style={{ padding: 0 }}>
      <div className="page-head">
        <div>
          <h1 className="page-title">Mes candidatures</h1>
          <p className="page-sub">Suivez le sort de vos offres déposées</p>
        </div>
      </div>

      {list.length === 0 && (
        <div className="placeholder-screen" style={{ minHeight: 320 }}>
          <div className="ps-ico"><Icon name="send" size={30} /></div>
          <h2>Aucune candidature</h2>
          <p>Vos offres déposées sur les consultations apparaîtront ici avec leur statut.</p>
        </div>
      )}

      {list.length > 0 && (
        <div className="panel">
          <div className="p-body" style={{ padding: 0 }}>
            {list.map((cand) => {
              const cs = cand.consultation;
              const type = CONSULT_TYPES.find((t) => t.id === cs?.type);
              const nom = cs?.copro?.name ?? cs?.copro_externe_nom ?? "—";
              return (
                <div key={cand.id} className="task-row" style={{ alignItems: "center", flexWrap: "wrap" }}>
                  <span className="cs-type" style={{ flex: "none" }}>
                    <Icon name={type?.icon ?? "briefcase"} size={13} />
                    {type?.label ?? cs?.type}
                  </span>
                  <span style={{ minWidth: 0, flex: "0 1 300px" }}>
                    <span style={{ display: "block", fontWeight: 600, fontSize: 14 }}>{nom}</span>
                    <span style={{ display: "block", fontSize: 12.5, color: "var(--fg-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {cs?.mission}
                    </span>
                  </span>
                  <span className="spacer" style={{ flex: 1 }}></span>
                  {cand.montant != null && (
                    <span style={{ fontWeight: 700, fontSize: 13.5 }}>{fmtEuro(cand.montant)} HT</span>
                  )}
                  <span style={{ fontSize: 12.5, color: "var(--fg-muted)" }}>
                    déposée le {fmtDate(cand.received_at)}
                  </span>
                  {cs?.statut === "cloturee" && <Badge kind="neutral">Consultation clôturée</Badge>}
                  <StatutBadge statut={cand.statut} />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

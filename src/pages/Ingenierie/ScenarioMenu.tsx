// Menu des scénarios — porté de ingenierie.jsx (ScenarioMenu / StatutPill).
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui";
import { fmtEuro } from "@/lib/format";
import type { Scenario } from "@/api/scenarios";

export function StatutPill({ sc }: { sc: Scenario }) {
  if (sc.locked || sc.statut === "importe")
    return (
      <Badge kind="primary">
        <Icon name="lock" size={11} />
        Importé
      </Badge>
    );
  if (sc.statut === "partage")
    return (
      <Badge kind="success" dot>
        Partagé
      </Badge>
    );
  return <Badge kind="neutral">Brouillon</Badge>;
}

interface Props {
  scenarios: Scenario[];
  activeId: string;
  onSwitch: (id: string) => void;
  onAdd: () => void;
  onDuplicate: (sc: Scenario) => void;
  onImport: () => void;
  onTogglePartage: (sc: Scenario) => void;
  onClose: () => void;
}

export function ScenarioMenu({ scenarios, activeId, onSwitch, onAdd, onDuplicate, onImport, onTogglePartage, onClose }: Props) {
  return (
    <>
      <div className="sc-backdrop" onClick={onClose}></div>
      <div className="sc-menu" onClick={(e) => e.stopPropagation()}>
        <div className="sc-menu-head">
          <span>Scénarios de financement</span>
          <span className="sc-count">{scenarios.length}</span>
        </div>
        <div className="sc-menu-list">
          {scenarios.map((sc) => {
            const res = sc.resultat as { coutTotal?: number; resteACharge?: number } | null;
            return (
              <div key={sc.id} className={"sc-item" + (sc.id === activeId ? " on" : "")}>
                <button className="sc-item-main" onClick={() => onSwitch(sc.id)}>
                  <span className="sc-radio">{sc.id === activeId && <Icon name="check" size={13} />}</span>
                  <span className="sc-item-txt">
                    <span className="sc-item-name">{sc.name}</span>
                    <span className="sc-item-sub">
                      {res?.coutTotal != null ? (
                        <>
                          {fmtEuro(res.coutTotal)} · reste {fmtEuro(res.resteACharge ?? 0)}
                        </>
                      ) : (
                        <>Non validé</>
                      )}
                    </span>
                  </span>
                  <StatutPill sc={sc} />
                </button>
                <div className="sc-item-actions">
                  {!sc.locked && (
                    <button
                      title={sc.statut === "partage" ? "Ne plus partager" : "Partager"}
                      onClick={() => onTogglePartage(sc)}
                    >
                      <Icon name="share" size={14} />
                    </button>
                  )}
                  <button title="Dupliquer" onClick={() => onDuplicate(sc)}>
                    <Icon name="copy" size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <div className="sc-prov">
          <Icon name="alert" size={13} />
          Choix non définitif — l'arbitrage est validé en assemblée générale de travaux.
        </div>
        <div className="sc-menu-foot">
          <button className="se-btn se-btn-secondary btn-sm" onClick={onAdd}>
            <Icon name="plus" size={15} />
            Nouveau scénario
          </button>
          <button className="se-btn se-btn-secondary btn-sm" onClick={onImport}>
            <Icon name="upload" size={15} />
            Importer un fichier Excel
          </button>
        </div>
      </div>
    </>
  );
}

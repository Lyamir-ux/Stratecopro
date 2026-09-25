// Onglet Données de la copro (syndic) - bâtiments, copropriétaires et lots.
// L'import et l'édition des tantièmes restent côté AMO ; depuis le 22/09/2026
// (feedback Amir) le gestionnaire met à jour le propriétaire d'un lot en
// cliquant sa ligne : vente, succession ou autre mutation.
// Feedbacks syndic du 24/09/2026 : la liste des lots se filtre par bâtiment
// (tous par défaut, sélecteur en tête de liste ou clic sur un bâtiment du
// panneau de droite) et se cherche par copropriétaire ou numéro de lot.
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui";
import { libellesBatiments, USAGE_LOT_LABEL } from "@/lib/referentiels";
import { useDonnees, useMutationsLots, type LotFull } from "@/api/donnees";
import type { SyndicCopro } from "@/api/syndic";
import { normaliserRecherche } from "@/lib/format";
import { ChangementProprietaire, JournalMutations } from "./ChangementProprietaire";

export function DonneesTabSyndic({ c }: { c: SyndicCopro }) {
  const { data: donnees, isLoading } = useDonnees(c.id);
  const { data: mutations } = useMutationsLots(c.id);
  const [lotEdite, setLotEdite] = useState<LotFull | null>(null);
  // bâtiment affiché (null : tous, la vue par défaut) et recherche en cours
  const [bat, setBat] = useState<string | null>(null);
  const [recherche, setRecherche] = useState("");
  const lb = libellesBatiments(c.denomination_batiments);
  if (isLoading || !donnees) return <div style={{ padding: 30, color: "var(--fg-muted)" }}>Chargement…</div>;

  const { batiments, coproprietaires, lots, cles } = donnees;
  // bâtiments portant au moins un lot, dans l'ordre du panneau de droite
  const codesBat = batiments.map((b) => b.code).filter((code) => lots.some((l) => l.batiment?.code === code));
  const batActif = bat && codesBat.includes(bat) ? bat : null;
  const q = normaliserRecherche(recherche.trim());
  const lotsBat = batActif ? lots.filter((l) => l.batiment?.code === batActif) : lots;
  const lotsVisibles = q
    ? lotsBat.filter((l) => normaliserRecherche(l.coproprietaire?.nom ?? "").includes(q) || normaliserRecherche(String(l.num)).includes(q))
    : lotsBat;
  const filtre = batActif !== null || q !== "";
  const lotsByCp = new Map<string, number>();
  for (const l of lots) {
    if (l.coproprietaire_id) lotsByCp.set(l.coproprietaire_id, (lotsByCp.get(l.coproprietaire_id) ?? 0) + 1);
  }
  const cleDefaut = cles.find((k) => k.is_default)?.code ?? cles[0]?.code;
  const totalCle = cleDefaut ? lots.reduce((s, l) => s + (l.tantiemes[cleDefaut] ?? 0), 0) : 0;
  // Le code de la clé n'est précisé que s'il y a plusieurs clés et qu'il ne s'agit
  // pas de la clé générale technique « MUN » (feedback du 03/09/2026)
  const suffixeCle = cleDefaut && cles.length > 1 && cleDefaut !== "MUN" ? ` ${cleDefaut}` : "";

  return (
    <div className="detail-grid fade">
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div className="panel">
          <div className="p-head">
            <Icon name="table" size={18} />
            <h3>Lots</h3>
            <span style={{ flex: 1 }}></span>
            <span style={{ fontSize: 13, color: "var(--fg-muted)" }}>
              {filtre ? `${lotsVisibles.length} sur ${lots.length} lots` : `${lots.length} lots`}
              {cleDefaut ? ` · ${totalCle.toLocaleString("fr-FR")} tantièmes${suffixeCle}` : ""}
            </span>
          </div>
          <div className="p-body">
            {lots.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 14 }}>
                {codesBat.length > 1 &&
                  (codesBat.length <= 6 ? (
                    <div className="seg" role="group" aria-label={`Filtrer les lots par ${lb.singulier.toLowerCase()}`}>
                      <button className={batActif === null ? "on" : ""} onClick={() => setBat(null)}>
                        Tous · {lots.length}
                      </button>
                      {codesBat.map((code) => (
                        <button key={code} className={batActif === code ? "on" : ""} onClick={() => setBat(code)} title={`Lots ${lb.court} ${code}`}>
                          {code} · {lots.filter((l) => l.batiment?.code === code).length}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <select className="edit-inp" value={batActif ?? ""} onChange={(e) => setBat(e.target.value || null)} style={{ maxWidth: 200 }}>
                      <option value="">{lb.pluriel} : tous</option>
                      {codesBat.map((code) => (
                        <option key={code} value={code}>
                          {lb.singulier} {code}
                        </option>
                      ))}
                    </select>
                  ))}
                <div className="search" style={{ margin: 0, width: 280, maxWidth: "100%" }}>
                  <Icon name="search" size={16} />
                  <input
                    placeholder="Rechercher un copropriétaire, un lot…"
                    value={recherche}
                    onChange={(e) => setRecherche(e.target.value)}
                    aria-label="Rechercher un copropriétaire ou un numéro de lot"
                  />
                  {recherche && (
                    <button className="icon-btn" style={{ width: 22, height: 22, flex: "none" }} title="Effacer la recherche" onClick={() => setRecherche("")}>
                      <Icon name="x" size={13} />
                    </button>
                  )}
                </div>
              </div>
            )}
            {lots.length === 0 ? (
              <p className="se-body" style={{ margin: 0, color: "var(--fg-muted)" }}>
                Les lots seront visibles dès leur import par l'équipe Strat Eco.
              </p>
            ) : lotsVisibles.length === 0 ? (
              <p className="se-body" style={{ margin: 0, color: "var(--fg-muted)" }}>
                Aucun lot ne correspond{q ? ` à « ${recherche.trim()} »` : ""}
                {batActif ? ` (${lb.court} ${batActif})` : ""}.
              </p>
            ) : (
              <div className="tablewrap" style={{ maxHeight: 460, overflowY: "auto" }}>
                <table className="dossiers" style={{ fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th>Lot</th>
                      <th>{lb.singulier}</th>
                      <th>Usage</th>
                      <th>Copropriétaire</th>
                      <th style={{ textAlign: "right" }}>Tantièmes{suffixeCle}</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lotsVisibles.map((l) => (
                      <tr
                        key={l.id}
                        onClick={() => setLotEdite(l)}
                        title={`Changer le propriétaire du lot n°${l.num} (vente, succession…)`}
                      >
                        <td style={{ fontWeight: 600 }}>{l.num}</td>
                        <td>{l.batiment?.code ?? "-"}</td>
                        <td>{USAGE_LOT_LABEL[l.usage] ?? l.usage}</td>
                        <td>{l.coproprietaire?.nom ?? "-"}</td>
                        <td style={{ textAlign: "right" }}>
                          {cleDefaut != null && l.tantiemes[cleDefaut] != null
                            ? l.tantiemes[cleDefaut].toLocaleString("fr-FR")
                            : "-"}
                        </td>
                        <td style={{ textAlign: "right", whiteSpace: "nowrap", color: "var(--fg-muted)" }}>
                          <Icon name="edit" size={14} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {lots.length > 0 && (
              <p className="se-small" style={{ color: "var(--fg-muted)", marginTop: 10, marginBottom: 0 }}>
                Vente ou succession : cliquez la ligne du lot pour enregistrer son nouveau propriétaire.
                Les tantièmes et les lots rattachés suivent.
              </p>
            )}
          </div>
        </div>
        <JournalMutations mutations={mutations ?? []} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div className="panel">
          <div className="p-head">
            <Icon name="users" size={18} />
            <h3>Copropriétaires</h3>
            <span style={{ flex: 1 }}></span>
            <span style={{ fontSize: 13, color: "var(--fg-muted)" }}>{coproprietaires.length}</span>
          </div>
          <div className="p-body" style={{ maxHeight: 340, overflowY: "auto" }}>
            {coproprietaires.map((cp, i) => (
              <div
                key={cp.id}
                className="task-row"
                style={{ padding: "10px 4px", borderBottom: i < coproprietaires.length - 1 ? "1px solid var(--border)" : "none" }}
              >
                <Icon name="user" size={16} style={{ color: "var(--fg-muted)" }} />
                <div>
                  <div className="t-title" style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
                    {cp.nom}
                    {cp.sortant_le && <Badge kind="neutral">Sortant</Badge>}
                  </div>
                  <div className="t-copro">
                    {[
                      cp.type === "bailleur" ? "Bailleur" : cp.type === "occupant" ? "Occupant" : null,
                      (lotsByCp.get(cp.id) ?? 0) + " lot" + ((lotsByCp.get(cp.id) ?? 0) > 1 ? "s" : ""),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                </div>
              </div>
            ))}
            {coproprietaires.length === 0 && (
              <p className="se-body" style={{ margin: 0, color: "var(--fg-muted)" }}>
                Aucun copropriétaire recensé pour l'instant.
              </p>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="p-head">
            <Icon name="building" size={18} />
            <h3>{lb.pluriel}</h3>
            <span style={{ flex: 1 }}></span>
            <span style={{ fontSize: 13, color: "var(--fg-muted)" }}>{batiments.length}</span>
          </div>
          <div className="p-body" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {/* un clic sur un bâtiment filtre la liste des lots ; un second clic rend tous les lots */}
            {batiments.map((b) =>
              codesBat.includes(b.code) && codesBat.length > 1 ? (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setBat(batActif === b.code ? null : b.code)}
                  title={batActif === b.code ? "Revoir tous les lots" : `N'afficher que les lots ${lb.court} ${b.code}`}
                  style={{ border: "none", background: "none", padding: 0, cursor: "pointer" }}
                >
                  <Badge kind={batActif === b.code ? "primary" : "neutral"}>
                    {b.code}
                    {b.label ? " · " + b.label : ""}
                  </Badge>
                </button>
              ) : (
                <Badge key={b.id} kind="neutral">
                  {b.code}
                  {b.label ? " · " + b.label : ""}
                </Badge>
              )
            )}
            {batiments.length === 0 && (
              <p className="se-body" style={{ margin: 0, color: "var(--fg-muted)" }}>
                Aucun bâtiment renseigné.
              </p>
            )}
          </div>
        </div>
      </div>
      {lotEdite && (
        <ChangementProprietaire
          coproId={c.id}
          lot={lotEdite}
          donnees={donnees}
          onClose={() => setLotEdite(null)}
        />
      )}
    </div>
  );
}

// Onglet Données de la copro (fiche MOE, 14/10/2026) - lecture seule : résumé de
// la composition (logements, lots par usage, copropriétaires, tantièmes),
// identité du dossier, bâtiments et liste des lots. Aucune donnée personnelle :
// les lots sont listés sans leur propriétaire (RPC composition_copro_moe, 0165).
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { Badge, DpePair } from "@/components/ui";
import { fmtDate, normaliserRecherche } from "@/lib/format";
import { libellesBatiments, USAGES_LOTS, USAGE_LOT_LABEL, type DpeClass } from "@/lib/referentiels";
import { useCompositionMoe } from "@/api/projetMoe";
import { messageErreur } from "@/lib/erreurs";
import type { Tables } from "@/lib/database.types";

export function DonneesTabMoe({ c, presta }: { c: Tables<"coproprietes">; presta: Tables<"prestataires"> }) {
  const { data: compo, isLoading, error } = useCompositionMoe(c.id, presta.id);
  const [recherche, setRecherche] = useState("");
  const [bat, setBat] = useState<string | null>(null);
  const lb = libellesBatiments(c.denomination_batiments);

  if (isLoading) return <div style={{ padding: 30, color: "var(--fg-muted)" }}>Chargement…</div>;
  if (error || !compo)
    return (
      <p className="se-body" style={{ color: "var(--color-error-700)" }}>
        {messageErreur(error, "Impossible de charger les données de la copropriété.")}
      </p>
    );

  const usages = USAGES_LOTS.filter((u) => (compo.par_usage[u.id] ?? 0) > 0);
  const q = normaliserRecherche(recherche.trim());
  const lotsVisibles = compo.lots.filter(
    (l) => (!bat || l.batiment === bat) && (!q || normaliserRecherche(`${l.num} ${USAGE_LOT_LABEL[l.usage] ?? l.usage}`).includes(q))
  );
  const codesBat = compo.batiments.filter((b) => b.nb_lots > 0).map((b) => b.code);
  const lieu = [c.adresse?.trim(), [c.code_postal, c.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");

  return (
    <div className="fade" style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <div className="moe-fin-tiles" style={{ marginTop: 0 }}>
        <div className="moe-tile">
          <div className="l">Logements</div>
          <div className="v accent">{compo.nb_logements}</div>
        </div>
        <div className="moe-tile">
          <div className="l">Lots</div>
          <div className="v">{compo.nb_lots}</div>
        </div>
        <div className="moe-tile">
          <div className="l">Copropriétaires</div>
          <div className="v">{compo.nb_coproprietaires}</div>
        </div>
        <div className="moe-tile">
          <div className="l">{lb.pluriel}</div>
          <div className="v">{compo.batiments.length}</div>
        </div>
      </div>

      <div className="detail-grid">
        <div className="panel">
          <div className="p-head">
            <Icon name="building" size={18} />
            <h3>Composition de la copropriété</h3>
          </div>
          <div className="p-body">
            {usages.length === 0 ? (
              <p className="se-body" style={{ margin: 0, color: "var(--fg-muted)" }}>
                Les lots n'ont pas encore été importés par l'équipe Strat Eco
                {c.nb_logements ? ` - ${c.nb_logements} logements déclarés.` : "."}
              </p>
            ) : (
              usages.map((u) => (
                <div className="kv" key={u.id}>
                  <span className="k">{u.label}</span>
                  <span className="v">{compo.par_usage[u.id]}</span>
                </div>
              ))
            )}
            {compo.cle && (
              <div className="kv">
                <span className="k">
                  Tantièmes {compo.cle.label || compo.cle.code}
                  {compo.cle.nb_cles > 1 ? ` (clé générale, ${compo.cle.nb_cles} clés au total)` : ""}
                </span>
                <span className="v">{compo.cle.total.toLocaleString("fr-FR")}</span>
              </div>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="p-head">
            <Icon name="fileText" size={18} />
            <h3>Le dossier</h3>
          </div>
          <div className="p-body">
            <div className="kv">
              <span className="k">Adresse</span>
              <span className="v" style={{ textAlign: "right" }}>{lieu || "-"}</span>
            </div>
            <div className="kv">
              <span className="k">Syndic</span>
              <span className="v" style={{ textAlign: "right" }}>{c.syndic_name || "-"}</span>
            </div>
            {c.gestionnaire_nom && (
              <div className="kv">
                <span className="k">Gestionnaire</span>
                <span className="v" style={{ textAlign: "right" }}>
                  {c.gestionnaire_nom}
                  {c.gestionnaire_email ? (
                    <>
                      <br />
                      <a href={`mailto:${c.gestionnaire_email}`} style={{ fontWeight: 400, fontSize: 13 }}>
                        {c.gestionnaire_email}
                      </a>
                    </>
                  ) : null}
                </span>
              </div>
            )}
            <div className="kv">
              <span className="k">Chargé de projet Strat Eco</span>
              <span className="v">{c.chef_projet || "-"}</span>
            </div>
            <div className="kv">
              <span className="k">Étiquette énergétique</span>
              <span className="v">
                <DpePair before={c.energy_before as DpeClass | null} after={c.energy_after as DpeClass | null} />
              </span>
            </div>
            {c.gain_pct != null && (
              <div className="kv">
                <span className="k">Gain énergétique visé</span>
                <span className="v">{Math.round(Number(c.gain_pct))} %</span>
              </div>
            )}
            {c.date_ag && (
              <div className="kv">
                <span className="k">Assemblée générale</span>
                <span className="v">{fmtDate(c.date_ag)}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {compo.batiments.length > 0 && (
        <div className="panel">
          <div className="p-head">
            <Icon name="building" size={18} />
            <h3>{lb.pluriel}</h3>
            <span style={{ flex: 1 }}></span>
            <span style={{ fontSize: 13, color: "var(--fg-muted)" }}>{compo.batiments.length}</span>
          </div>
          <div className="p-body moe-batiments">
            {compo.batiments.map((b) => (
              <div key={b.id} className="moe-batiment">
                <div style={{ fontWeight: 700 }}>
                  {lb.singulier} {b.code}
                  {b.label ? ` · ${b.label}` : ""}
                </div>
                {b.adresse && <div className="se-small" style={{ color: "var(--fg3)" }}>{b.adresse}</div>}
                <div className="se-small" style={{ color: "var(--fg-muted)", marginTop: 2 }}>
                  {b.nb_logements} logement{b.nb_logements > 1 ? "s" : ""} · {b.nb_lots} lot{b.nb_lots > 1 ? "s" : ""}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {compo.lots.length > 0 && (
        <div className="panel">
          <div className="p-head">
            <Icon name="table" size={18} />
            <h3>Lots</h3>
            <span style={{ flex: 1 }}></span>
            <span style={{ fontSize: 13, color: "var(--fg-muted)" }}>
              {lotsVisibles.length === compo.lots.length ? `${compo.lots.length} lots` : `${lotsVisibles.length} sur ${compo.lots.length} lots`}
            </span>
          </div>
          <div className="p-body">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 14 }}>
              {codesBat.length > 1 && (
                <select className="edit-inp" value={bat ?? ""} onChange={(e) => setBat(e.target.value || null)} style={{ maxWidth: 200 }}>
                  <option value="">{lb.pluriel} : tous</option>
                  {codesBat.map((code) => (
                    <option key={code} value={code}>
                      {lb.singulier} {code}
                    </option>
                  ))}
                </select>
              )}
              <div className="search" style={{ margin: 0, flex: "1 1 220px", width: "auto", minWidth: 0 }}>
                <Icon name="search" size={16} />
                <input
                  placeholder="Rechercher un lot, un usage…"
                  value={recherche}
                  onChange={(e) => setRecherche(e.target.value)}
                  aria-label="Rechercher un numéro de lot ou un usage"
                />
              </div>
            </div>
            <div className="tablewrap" style={{ maxHeight: 420, overflowY: "auto" }}>
              <table className="dossiers" style={{ fontSize: 13 }}>
                <thead>
                  <tr>
                    <th>Lot</th>
                    {codesBat.length > 1 && <th>{lb.singulier}</th>}
                    <th>Usage</th>
                    <th style={{ textAlign: "right" }}>Tantièmes{compo.cle && compo.cle.nb_cles > 1 ? ` ${compo.cle.code}` : ""}</th>
                  </tr>
                </thead>
                <tbody>
                  {lotsVisibles.map((l, i) => (
                    <tr key={`${l.batiment}-${l.num}-${i}`} style={{ cursor: "default" }}>
                      <td style={{ fontWeight: 600 }}>
                        {l.num}
                        {l.rattache && (
                          <span style={{ marginLeft: 6 }}>
                            <Badge kind="neutral">annexe</Badge>
                          </span>
                        )}
                      </td>
                      {codesBat.length > 1 && <td>{l.batiment ?? "-"}</td>}
                      <td>{USAGE_LOT_LABEL[l.usage] ?? l.usage}</td>
                      <td style={{ textAlign: "right" }}>{l.tantiemes != null ? Number(l.tantiemes).toLocaleString("fr-FR") : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="se-small" style={{ color: "var(--fg-muted)", marginTop: 10, marginBottom: 0 }}>
              Données tenues par l'équipe Strat Eco et le syndic, en lecture seule. Les copropriétaires ne sont pas
              nommés dans votre espace.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

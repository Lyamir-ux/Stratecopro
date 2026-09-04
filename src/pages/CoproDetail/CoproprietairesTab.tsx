// Onglet Copropriétaires (AMO) - vue individuelle par copropriétaire, demandée
// par Théa le 03/09/2026 : « le métier se pilote par copropriétaire ». Une
// ligne par copropriétaire (profil · prime · financement · bulletin · SEPA ·
// RIB · CNI · avis d'imposition · statut), filtrable par bâtiment, une fiche
// individuelle qui réunit profil de ressources, plan individuel, adhésion
// éco-PTZ et pièces, et les trois exports concordants (liste des primes,
// rapport d'enquête sociale, fiche état) générés depuis la même base.
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui";
import { Modal } from "@/components/Modal";
import { fmtDate, fmtEuro, fmtEuroFull } from "@/lib/format";
import { PROFILS_MPR, libellesBatiments } from "@/lib/referentiels";
import type { Profil } from "@/lib/finance";
import { useEnquete, useSaveReponse, useVerifierProfil } from "@/api/enquete";
import { downloadAdhesionDoc } from "@/api/financement";
import { PIECES, urlSigneePiece } from "@/api/portail";
import {
  useDossiersCoproprietaires,
  type DossierCoproprietaire,
  type DossiersCopro,
  type EtatItem,
} from "@/api/dossiersCopros";
import {
  exporterFicheEtat,
  exporterListePrimes,
  exporterRapportEnquete,
  libelleFinancement,
  libelleStatutDossier,
  profilAnah,
  type ContexteExport,
} from "@/lib/exportsCopros";
import type { CoproWithStats } from "@/api/copros";

type FiltreStatut = "tous" | "a_relancer" | "complet";

const PROFIL_COLOR: Record<string, string> = { Bleu: "#2E6FA8", Jaune: "#f2a30d", Violet: "#7A5AE0", Rose: "#DC6FA8" };

/** Pastille d'état d'une pièce ou d'une étape. */
function Etat({ e, title }: { e: EtatItem; title?: string }) {
  if (e === "na") return <span style={{ color: "var(--fg-muted)" }} title={title ?? "Sans objet"}>-</span>;
  const color = e === "ok" ? "var(--color-success-500)" : e === "en_cours" ? "var(--color-warning-500)" : "var(--color-error-500)";
  const name = e === "ok" ? "checkCircle" : e === "en_cours" ? "clock" : "x";
  const lib = e === "ok" ? "Fourni" : e === "en_cours" ? "En cours" : "Manquant";
  return (
    <span title={title ? `${title} : ${lib.toLowerCase()}` : lib} style={{ display: "inline-flex", alignItems: "center", color }}>
      <Icon name={name} size={16} />
    </span>
  );
}

function ProfilCell({ d }: { d: DossierCoproprietaire }) {
  const p = d.enquete.profil;
  if (!p) return <span style={{ color: "var(--color-error-700)", fontWeight: 600, fontSize: 12.5 }}>À déterminer</span>;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
      <span style={{ width: 9, height: 9, borderRadius: "50%", background: PROFIL_COLOR[p], flex: "none" }}></span>
      <span style={{ fontSize: 12.5, fontWeight: 600 }}>{PROFILS_MPR[p]?.desc ?? p}</span>
      <Badge kind={d.enquete.profilStatut === "verifie" ? "success" : "warn"}>
        {d.enquete.profilStatut === "verifie" ? "Vérifié" : "Déclaratif"}
      </Badge>
    </span>
  );
}

function PrimeCell({ d }: { d: DossierCoproprietaire }) {
  const p = d.plan;
  if (!p) return <span style={{ color: "var(--fg-muted)" }}>-</span>;
  if (p.mprSource === "indetermine") return <span style={{ color: "var(--color-error-700)", fontSize: 12.5, fontWeight: 600 }}>À déterminer</span>;
  return (
    <span className="mono" title={p.mprSource === "plan" ? "Montant du plan individuel" : "Barème selon le profil - à confirmer à l'instruction"}>
      {fmtEuro(p.mprIndiv)}
      {p.mprSource === "bareme" && <span style={{ color: "var(--fg-muted)", fontSize: 11 }}> *</span>}
    </span>
  );
}

function StatutBadge({ d }: { d: DossierCoproprietaire }) {
  const s = d.etat.statut;
  return (
    <Badge kind={s === "complet" ? "success" : s === "incomplet" ? "warn" : "neutral"} dot>
      {s === "complet" ? "Complet" : s === "incomplet" ? `${d.etat.manquants.length} manquant${d.etat.manquants.length > 1 ? "s" : ""}` : "Non commencé"}
    </Badge>
  );
}

export function CoproprietairesTab({ c }: { c: CoproWithStats }) {
  const navigate = useNavigate();
  const data = useDossiersCoproprietaires(c);
  const { data: enquete } = useEnquete(c.id);
  const lb = libellesBatiments(c.denomination_batiments);
  const [bat, setBat] = useState<string>("");
  const [statut, setStatut] = useState<FiltreStatut>("tous");
  const [q, setQ] = useState("");
  const [ouvert, setOuvert] = useState<string | null>(null);

  const filtres = useMemo(() => {
    const s = q.trim().toLowerCase();
    return data.dossiers.filter((d) => {
      if (bat && !d.batiments.includes(bat)) return false;
      if (statut === "complet" && d.etat.statut !== "complet") return false;
      if (statut === "a_relancer" && d.etat.statut === "complet") return false;
      if (s && !d.nom.toLowerCase().includes(s) && !d.lots.some((l) => l.num.toLowerCase().includes(s))) return false;
      return true;
    });
  }, [data.dossiers, bat, statut, q]);

  const compte = (f: (d: DossierCoproprietaire) => boolean) => data.dossiers.filter(f).length;
  const ctx: ContexteExport = {
    coproNom: c.name,
    denominationBatiments: c.denomination_batiments,
    batiments: data.batiments,
    cleRef: data.cleRef,
    scenarioNom: data.scenario?.name ?? null,
    publieLe: data.scenario?.statut === "partage" ? data.scenario.updated_at : null,
  };
  const dossierOuvert = data.dossiers.find((d) => d.id === ouvert) ?? null;
  const openPortail = (id: string) => navigate(`/portail?cp=${id}`);

  if (data.chargement && data.dossiers.length === 0) {
    return <div style={{ padding: 30, color: "var(--fg-muted)" }}>Chargement…</div>;
  }

  return (
    <div className="fade" style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div className="panel">
        <div className="p-head">
          <Icon name="users" size={18} />
          <h3>Copropriétaires · {data.dossiers.length}</h3>
          <span style={{ flex: 1 }}></span>
          <button
            className="se-btn se-btn-secondary btn-sm"
            title="Liste des primes : aides collectives affectées et primes individuelles par copropriétaire, ventilées par bâtiment"
            disabled={data.dossiers.length === 0}
            onClick={() => exporterListePrimes(data, ctx)}
          >
            <Icon name="download" size={14} />
            Liste des primes
          </button>
          <button
            className="se-btn se-btn-secondary btn-sm"
            title="Rapport d'enquête sociale : synthèse, profils Anah, occupation et détail des réponses par copropriétaire et par lot"
            disabled={data.dossiers.length === 0}
            onClick={() => exporterRapportEnquete(data, ctx)}
          >
            <Icon name="download" size={14} />
            Rapport d'enquête sociale
          </button>
          <button
            className="se-btn se-btn-secondary btn-sm"
            title="Fiche état : profil, prime, financement, bulletin, SEPA et pièces de chaque copropriétaire"
            disabled={data.dossiers.length === 0}
            onClick={() => exporterFicheEtat(data, ctx)}
          >
            <Icon name="download" size={14} />
            Fiche état
          </button>
        </div>
        <div className="p-body">
          {data.dossiers.length === 0 ? (
            <p className="se-body" style={{ margin: 0, color: "var(--fg-muted)" }}>
              Importez d'abord les copropriétaires et leurs lots (onglet Données de la copro).
            </p>
          ) : (
            <>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 14 }}>
                <div className="seg">
                  <button className={statut === "tous" ? "on" : ""} onClick={() => setStatut("tous")}>
                    Tous · {data.dossiers.length}
                  </button>
                  <button className={statut === "a_relancer" ? "on" : ""} onClick={() => setStatut("a_relancer")}>
                    À relancer · {compte((d) => d.etat.statut !== "complet")}
                  </button>
                  <button className={statut === "complet" ? "on" : ""} onClick={() => setStatut("complet")}>
                    Complets · {compte((d) => d.etat.statut === "complet")}
                  </button>
                </div>
                {data.batiments.length > 1 && (
                  <select className="edit-inp" value={bat} onChange={(e) => setBat(e.target.value)} style={{ maxWidth: 200 }}>
                    <option value="">{lb.pluriel} : tous</option>
                    {data.batiments.map((b) => (
                      <option key={b} value={b}>
                        {lb.singulier} {b}
                      </option>
                    ))}
                  </select>
                )}
                <input
                  className="edit-inp"
                  placeholder="Rechercher un nom, un lot…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  style={{ maxWidth: 220 }}
                />
                <span style={{ flex: 1 }}></span>
                <span className="se-small" style={{ color: "var(--fg-muted)" }}>
                  {compte((d) => !d.enquete.profil)} profil{compte((d) => !d.enquete.profil) > 1 ? "s" : ""} à déterminer ·{" "}
                  {compte((d) => d.etat.avis !== "ok")} avis d'imposition manquant{compte((d) => d.etat.avis !== "ok") > 1 ? "s" : ""}
                  {data.scenario?.statut === "partage"
                    ? ` · ${compte((d) => d.etat.financement === "manquant")} choix de financement en attente`
                    : " · plan non partagé au portail"}
                </span>
              </div>

              <div className="tablewrap" style={{ overflowX: "auto" }}>
                <table className="dossiers" style={{ fontSize: 13, minWidth: 1080 }}>
                  <thead>
                    <tr>
                      <th>Copropriétaire</th>
                      <th>{lb.court}</th>
                      <th>Profil</th>
                      <th style={{ textAlign: "right" }}>Prime</th>
                      <th>Financement</th>
                      <th style={{ textAlign: "center" }}>Bulletin</th>
                      <th style={{ textAlign: "center" }}>SEPA</th>
                      <th style={{ textAlign: "center" }}>RIB</th>
                      <th style={{ textAlign: "center" }}>CNI</th>
                      <th style={{ textAlign: "center" }}>Avis d'imp.</th>
                      <th>Statut</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtres.map((d) => (
                      <tr key={d.id} onClick={() => setOuvert(d.id)} title="Ouvrir la fiche individuelle">
                        <td>
                          <div style={{ fontWeight: 600 }}>{d.nom}</div>
                          <div style={{ fontSize: 11.5, color: "var(--fg-muted)" }}>
                            {d.lots.length ? `Lot${d.lots.length > 1 ? "s" : ""} ${d.lots.map((l) => l.num).join(", ")}` : "Aucun lot"}
                          </div>
                        </td>
                        <td style={{ whiteSpace: "nowrap" }}>{d.batiments.join(", ") || "-"}</td>
                        <td>
                          <ProfilCell d={d} />
                        </td>
                        <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                          <PrimeCell d={d} />
                        </td>
                        <td style={{ fontSize: 12.5, whiteSpace: "nowrap" }}>
                          {d.etat.financement === "na" ? (
                            <span style={{ color: "var(--fg-muted)" }}>-</span>
                          ) : d.financement ? (
                            libelleFinancement(d) + (d.financement.duree_annees ? ` · ${d.financement.duree_annees} ans` : "")
                          ) : (
                            <span style={{ color: "var(--color-error-700)", fontWeight: 600 }}>À choisir</span>
                          )}
                        </td>
                        <td style={{ textAlign: "center" }}><Etat e={d.etat.bulletin} title="Bulletin d'adhésion" /></td>
                        <td style={{ textAlign: "center" }}><Etat e={d.etat.sepa} title="Mandat SEPA" /></td>
                        <td style={{ textAlign: "center" }}><Etat e={d.etat.rib} title="RIB" /></td>
                        <td style={{ textAlign: "center" }}><Etat e={d.etat.cni} title="Pièce d'identité" /></td>
                        <td style={{ textAlign: "center" }}><Etat e={d.etat.avis} title="Avis d'imposition" /></td>
                        <td>
                          <StatutBadge d={d} />
                        </td>
                        <td style={{ whiteSpace: "nowrap" }}>
                          <button
                            className="icon-btn"
                            title={`Ouvrir le portail de ${d.nom} (aperçu AMO)`}
                            onClick={(e) => {
                              e.stopPropagation();
                              openPortail(d.id);
                            }}
                          >
                            <Icon name="eye" size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {filtres.length === 0 && (
                      <tr style={{ cursor: "default" }}>
                        <td colSpan={12} style={{ color: "var(--fg-muted)", textAlign: "center" }}>
                          Aucun copropriétaire ne correspond aux filtres.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <p className="se-small" style={{ color: "var(--fg-muted)", marginTop: 12, marginBottom: 0 }}>
                Prime : montant du plan individuel, ou barème selon le profil déclaré (*, à confirmer à l'instruction) ;
                « à déterminer » tant que le profil de ressources n'est pas renseigné. Bulletin et SEPA ne concernent
                que le prêt collectif. Les trois exports (liste des primes, rapport d'enquête, fiche état) sont
                générés depuis cette même base : mêmes montants au centime, un onglet par {lb.singulier.toLowerCase()}.
              </p>
            </>
          )}
        </div>
      </div>

      {dossierOuvert && enquete && (
        <FicheCoproprietaire
          d={dossierOuvert}
          data={data}
          coproId={c.id}
          enqueteId={enquete.id}
          lb={lb}
          onClose={() => setOuvert(null)}
          onPortail={() => openPortail(dossierOuvert.id)}
        />
      )}
    </div>
  );
}

// ============================================================
// Fiche individuelle
// ============================================================

function Bloc({ titre, icon, children, right }: { titre: string; icon: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: "12px 14px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <Icon name={icon as never} size={16} style={{ color: "var(--accent)" }} />
        <h4 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: 15 }}>{titre}</h4>
        <span style={{ flex: 1 }}></span>
        {right}
      </div>
      {children}
    </div>
  );
}

function FicheCoproprietaire({
  d,
  data,
  coproId,
  enqueteId,
  lb,
  onClose,
  onPortail,
}: {
  d: DossierCoproprietaire;
  data: DossiersCopro;
  coproId: string;
  enqueteId: string;
  lb: ReturnType<typeof libellesBatiments>;
  onClose: () => void;
  onPortail: () => void;
}) {
  const save = useSaveReponse(enqueteId, coproId);
  const verifier = useVerifierProfil(enqueteId, coproId);
  const [edit, setEdit] = useState(false);
  const [nb, setNb] = useState(d.enquete.nbPersonnes?.toString() ?? "");
  const [occ, setOcc] = useState(d.enquete.reponse?.statut_occupation ?? "");
  const [rfr, setRfr] = useState(d.enquete.rfr?.toString() ?? "");
  const [rfrN2, setRfrN2] = useState(d.enquete.rfrN2?.toString() ?? "");
  const [verifie, setVerifie] = useState(d.enquete.profilStatut === "verifie");
  const [erreur, setErreur] = useState<string | null>(null);

  const enregistrer = () => {
    if (!data.bareme) return;
    setErreur(null);
    save.mutate(
      {
        coproprietaireId: d.id,
        nbPersonnes: nb === "" ? null : Number(nb),
        statutOccupation: occ || null,
        rfr: rfr === "" ? null : Number(rfr),
        rfrN2: rfrN2 === "" ? null : Number(rfrN2),
        bareme: data.bareme,
        verifie,
      },
      { onSuccess: () => setEdit(false), onError: (e) => setErreur(e instanceof Error ? e.message : "Enregistrement impossible") }
    );
  };

  const ouvrirPiece = async (path: string) => {
    try {
      window.open(await urlSigneePiece(path), "_blank", "noopener");
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Ouverture impossible");
    }
  };

  const p = d.plan;
  const bulletins = ((d.adhesion?.bulletins as { lotNum: string; path: string }[] | null) ?? []);
  const kv = (k: string, v: React.ReactNode) => (
    <div className="kv" style={{ padding: "6px 0", fontSize: 13 }}>
      <span className="k">{k}</span>
      <span className="v" style={{ textAlign: "right" }}>{v}</span>
    </div>
  );

  return (
    <Modal title={d.nom} onClose={onClose} width={980}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginTop: -8, marginBottom: 14 }}>
        <span className="se-small" style={{ color: "var(--fg3)" }}>
          {d.lots.length
            ? d.lots.map((l) => `Lot ${l.num}${l.batiment ? ` (${lb.court} ${l.batiment.code})` : ""}`).join(" · ")
            : "Aucun lot rattaché"}
          {d.email ? ` · ${d.email}` : ""}
          {d.telephone ? ` · ${d.telephone}` : ""}
        </span>
        <span style={{ flex: 1 }}></span>
        <StatutBadge d={d} />
        <button className="se-btn se-btn-secondary btn-sm" onClick={onPortail} title="Voir le portail tel que ce copropriétaire le voit (les actions y écrivent réellement)">
          <Icon name="eye" size={14} />
          Ouvrir le portail (aperçu AMO)
        </button>
      </div>
      {d.etat.manquants.length > 0 && (
        <div className="cc-next" style={{ marginTop: 0, marginBottom: 14 }}>
          <Icon name="alert" size={15} className="ico" style={{ color: "var(--color-warning-500)" }} />
          <span>
            <b>Il manque :</b> {d.etat.manquants.join(", ")}.
          </span>
        </div>
      )}
      {erreur && <p className="se-small" style={{ color: "var(--color-error-700)", marginTop: 0 }}>{erreur}</p>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 14 }}>
        {/* ---------- Profil de ressources ---------- */}
        <Bloc
          titre="Profil de ressources"
          icon="user"
          right={
            !edit ? (
              <button className="se-btn se-btn-ghost btn-sm" onClick={() => setEdit(true)}>
                <Icon name="edit" size={13} />
                Saisir
              </button>
            ) : null
          }
        >
          {!edit ? (
            <>
              {kv(
                "Profil Anah",
                d.enquete.profil ? (
                  <ProfilCell d={d} />
                ) : (
                  <span style={{ color: "var(--color-error-700)" }}>À déterminer</span>
                )
              )}
              {d.enquete.profil &&
                kv(
                  "Statut",
                  d.enquete.profilStatut === "verifie"
                    ? `Vérifié le ${fmtDate(d.enquete.profilVerifieLe)}`
                    : `Déclaratif - enquête du ${fmtDate(d.enquete.date)}`
                )}
              {kv("Personnes du ménage", d.enquete.nbPersonnes ?? "-")}
              {kv("RFR avis N-1", d.enquete.rfr != null ? fmtEuro(d.enquete.rfr) : "-")}
              {kv("RFR N-2", d.enquete.rfrN2 != null ? fmtEuro(d.enquete.rfrN2) : "-")}
              {kv("Occupation", d.enquete.occupation ?? "-")}
              {kv(
                "Questionnaire portail",
                d.enquete.complet
                  ? `Transmis complet${d.enquete.reponses?.transmisLe ? ` le ${fmtDate(d.enquete.reponses.transmisLe)}` : ""}`
                  : d.enquete.repondu
                    ? "Brouillon / partiel"
                    : "Non commencé"
              )}
              {d.enquete.profil && (
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, marginTop: 8, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={d.enquete.profilStatut === "verifie"}
                    disabled={verifier.isPending}
                    onChange={(e) => verifier.mutate({ coproprietaireId: d.id, verifie: e.target.checked })}
                  />
                  Profil vérifié sur l'avis d'imposition
                  {d.etat.avis !== "ok" && <span style={{ color: "var(--fg-muted)" }}>(avis non déposé)</span>}
                </label>
              )}
            </>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13 }}>
              <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                Personnes du ménage
                <input className="edit-inp sm" type="number" min="1" value={nb} onChange={(e) => setNb(e.target.value)} style={{ width: 80 }} />
              </label>
              <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                Occupation
                <select className="edit-inp" value={occ} onChange={(e) => setOcc(e.target.value)}>
                  <option value="">-</option>
                  <option value="occupant">Occupant</option>
                  <option value="bailleur">Bailleur</option>
                </select>
              </label>
              <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                RFR de l'avis d'imposition N-1 (€)
                <input className="edit-inp sm" type="number" min="0" value={rfr} onChange={(e) => setRfr(e.target.value)} style={{ width: 110 }} />
              </label>
              <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                RFR N-2 (€)
                <input className="edit-inp sm" type="number" min="0" value={rfrN2} onChange={(e) => setRfrN2(e.target.value)} style={{ width: 110 }} />
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <input type="checkbox" checked={verifie} onChange={(e) => setVerifie(e.target.checked)} />
                Vérifié sur l'avis d'imposition (sinon déclaratif)
              </label>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button className="se-btn se-btn-ghost btn-sm" onClick={() => setEdit(false)}>
                  Annuler
                </button>
                <button className="se-btn se-btn-primary btn-sm" onClick={enregistrer} disabled={save.isPending || !data.bareme}>
                  <Icon name="check" size={13} />
                  {save.isPending ? "…" : "Enregistrer"}
                </button>
              </div>
            </div>
          )}
        </Bloc>

        {/* ---------- Plan individuel ---------- */}
        <Bloc titre="Plan individuel" icon="euro">
          {!p ? (
            <p className="se-small" style={{ margin: 0, color: "var(--fg-muted)" }}>
              Aucun plan : validez le PF définitif (ou partagez un scénario) pour répartir l'opération.
            </p>
          ) : (
            <>
              {kv("Quote-part opération TTC", fmtEuroFull(p.quotePart))}
              {kv("Aides collectives affectées", "− " + fmtEuroFull(p.aidesColl))}
              {kv(
                "Prime MaPrimeRénov' individuelle",
                p.mprSource === "indetermine" ? (
                  <span style={{ color: "var(--color-error-700)" }}>à déterminer</span>
                ) : (
                  `− ${fmtEuroFull(p.mprIndiv)}${p.mprSource === "bareme" ? " (barème)" : ""}`
                )
              )}
              {kv("À financer avant travaux (hors CEE)", <b>{fmtEuroFull(p.resteAvantTravaux)}</b>)}
              {kv("Prime CEE (fin de chantier)", "− " + fmtEuroFull(p.primeCee))}
              {kv("Reste à charge final", <b>{fmtEuroFull(p.reste)}</b>)}
              <p className="se-small" style={{ margin: "8px 0 0", color: "var(--fg-muted)" }}>
                Source : {p.source === "pf" ? "PF définitif validé" : "scénario partagé"}
                {data.scenario ? ` « ${data.scenario.name} »` : ""}
                {p.partage ? ` · publié au portail le ${fmtDate(p.publieLe)}` : " · non publié au portail"}
                {data.cleRef ? ` · ${(d.tantiemes[data.cleRef] ?? 0).toLocaleString("fr-FR")} tantièmes (${data.cleRef})` : ""}
              </p>
            </>
          )}
        </Bloc>

        {/* ---------- Adhésion éco-PTZ ---------- */}
        <Bloc titre="Financement et adhésion éco-PTZ" icon="trendingUp">
          {kv(
            "Choix de financement",
            d.financement
              ? `${libelleFinancement(d)}${d.financement.duree_annees ? ` · ${d.financement.duree_annees} ans` : ""} · ${fmtDate(d.financement.transmitted_at)}`
              : d.etat.financement === "na"
                ? "plan non partagé"
                : <span style={{ color: "var(--color-error-700)" }}>à choisir</span>
          )}
          {kv(
            "Bulletin d'adhésion",
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Etat e={d.etat.bulletin} />
              {d.adhesion?.statut === "signee" ? `signé le ${fmtDate(d.adhesion.signed_at)}` : d.adhesion ? "brouillon" : ""}
              {bulletins.map((b) => (
                <button
                  key={b.path}
                  className="icon-btn"
                  title={`Bulletin lot n°${b.lotNum}`}
                  onClick={() => void downloadAdhesionDoc(b.path, `bulletin-${d.nom}-lot-${b.lotNum}.pdf`)}
                >
                  <Icon name="fileText" size={14} />
                </button>
              ))}
            </span>
          )}
          {d.bulletinsElec.length > 0 &&
            kv(
              "Signature électronique",
              d.bulletinsElec
                .map((b) => `${b.lot_reference} : ${b.statut === "complet" ? "signé et scellé" : b.statut === "en_signature" ? "en signature" : b.statut}`)
                .join(" · ")
            )}
          {kv(
            "Mandat SEPA",
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Etat e={d.etat.sepa} />
              {d.adhesion?.sepa_path && (
                <button className="icon-btn" title="Mandat SEPA pré-rempli" onClick={() => void downloadAdhesionDoc(d.adhesion!.sepa_path!, `sepa-${d.nom}.pdf`)}>
                  <Icon name="download" size={14} />
                </button>
              )}
            </span>
          )}
          {d.adhesion &&
            kv(
              "Concordance IBAN / RIB",
              d.adhesion.rib_concordance === "concordant"
                ? "concordant"
                : d.adhesion.rib_concordance === "discordant"
                  ? <span style={{ color: "var(--color-error-700)" }}>IBAN ≠ RIB</span>
                  : "à vérifier"
            )}
        </Bloc>

        {/* ---------- Pièces ---------- */}
        <Bloc titre="Pièces justificatives" icon="folder">
          {PIECES.map((pc) => {
            const piece = d.pieces[pc.type];
            return (
              <div key={pc.type} className="kv" style={{ padding: "6px 0", fontSize: 13 }}>
                <span className="k">
                  {pc.name}
                  {pc.required && <span style={{ color: "var(--color-error-500)" }}> *</span>}
                </span>
                <span className="v" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  {piece ? (
                    <>
                      <Etat e="ok" />
                      <span style={{ fontWeight: 400, color: "var(--fg3)", fontSize: 12 }}>{fmtDate(piece.uploaded_at)}</span>
                      <button className="icon-btn" title={`Ouvrir ${piece.name}`} onClick={() => void ouvrirPiece(piece.storage_path)}>
                        <Icon name="eye" size={14} />
                      </button>
                    </>
                  ) : (
                    <Etat e={pc.required ? "manquant" : "na"} title={pc.name} />
                  )}
                </span>
              </div>
            );
          })}
          {d.bulletinsElec.some((b) => b.rib_path && !b.purge_effectuee_le) && (
            <p className="se-small" style={{ margin: "8px 0 0", color: "var(--fg-muted)" }}>
              RIB et pièce d'identité déposés lors de la signature électronique : consultables depuis le panneau
              « Signatures électroniques » de l'onglet Plans de financement (niveau 1, journalisé).
            </p>
          )}
        </Bloc>
      </div>
      <p className="se-small" style={{ color: "var(--fg-muted)", marginTop: 14, marginBottom: 0 }}>
        Profil {profilAnah(d.enquete.profil).toLowerCase()} · dossier {libelleStatutDossier(d.etat.statut).toLowerCase()}. Le RFR est une donnée
        sensible : il n'est visible que par l'équipe AMO et le copropriétaire concerné.
      </p>
    </Modal>
  );
}

export type { Profil };

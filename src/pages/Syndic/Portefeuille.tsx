// Portefeuille du syndic - deux vues commutables :
// 1. « Bulles » : un système par gestionnaire, une bulle grise au centre (ses
//    initiales, total de logements et montant d'opération), autour de laquelle
//    gravitent ses copropriétés (couleur = phase du dossier).
// 2. « Tableau » : pilotage direction - colonnes triables, comparatif par
//    gestionnaire (charge, phases, tâches en retard) et export CSV.
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "@/components/Icon";
import { Badge, DpePair } from "@/components/ui";
import { PHASES, type DpeClass, type PhaseId } from "@/lib/referentiels";
import { fmtEuroCourt } from "@/lib/format";
import { telechargerCsv } from "@/lib/csv";
import { nbLogements } from "@/api/copros";
import { enRetard, useSyndicTaches } from "@/api/syndicTaches";
import { useHonorairesSyndic, type SyndicCopro } from "@/api/syndic";

/** Comparaison de recherche : minuscules, sans accents. */
const normaliser = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

const COULEUR_PHASE: Record<PhaseId, string> = {
  diagnostic: "var(--color-warning-500)",
  etudes: "var(--color-secondary-500)",
  travaux: "var(--color-primary-500)",
};

const SANS_GESTIONNAIRE = "__sans__";
const R_GESTIONNAIRE = 58;

/** Clé de regroupement d'un gestionnaire (e-mail, à défaut le nom). */
export function cleGestionnaire(c: SyndicCopro): string {
  return c.gestionnaire_email?.toLowerCase() || c.gestionnaire_nom || SANS_GESTIONNAIRE;
}

/** « Claude LOBSTEIN » → « CL ». Un seul mot → ses deux premières lettres. */
function initiales(nom: string): string {
  const mots = nom.trim().split(/[\s-]+/).filter(Boolean);
  if (mots.length === 0) return "?";
  if (mots.length === 1) return mots[0].slice(0, 2).toUpperCase();
  return (mots[0][0] + mots[mots.length - 1][0]).toUpperCase();
}

interface Satellite {
  id: string;
  name: string;
  phase: PhaseId;
  fragile: boolean;
  logements: number;
  r: number;
  x: number;
  y: number;
}

interface Systeme {
  key: string;
  nom: string;
  initiales: string;
  copros: number;
  logements: number;
  montant: number;
  orbite: number;
  taille: number;
  satellites: Satellite[];
}

function construireSystemes(copros: SyndicCopro[]): Systeme[] {
  const groupes = new Map<string, { nom: string; copros: SyndicCopro[] }>();
  for (const c of copros) {
    const cle = cleGestionnaire(c);
    const g = groupes.get(cle) ?? { nom: c.gestionnaire_nom || "Non attribué", copros: [] };
    g.copros.push(c);
    groupes.set(cle, g);
  }

  return [...groupes.entries()]
    .map(([key, g]) => {
      const n = g.copros.length;
      // Plus le gestionnaire a de dossiers, plus les satellites sont petits :
      // sans cela l'orbite devient si large qu'un système ne tient plus à l'écran.
      const rMax = n <= 6 ? 52 : n <= 10 ? 44 : n <= 16 ? 38 : 32;
      const tailles = g.copros.map((c) => {
        const logements = nbLogements(c);
        // Plancher à 36 : en dessous, un nom d'un seul tenant (« STOSSWIHR »,
        // « LAMARTINE ») ne rentre pas et se fait tronquer.
        return { c, logements, r: Math.min(rMax, 36 + Math.min(16, logements / 10)) };
      });
      // Le plafond rMax borne la taille des satellites ; l'orbite se calcule sur
      // le plus gros satellite réellement présent, sinon un gestionnaire à un
      // seul petit dossier occuperait plus de place qu'un gestionnaire à huit.
      const rEff = Math.max(...tailles.map((t) => t.r));
      // Rayon d'orbite : assez grand pour dégager la bulle centrale ET pour que
      // les satellites ne se chevauchent pas une fois répartis sur le cercle.
      const orbite = Math.max(
        R_GESTIONNAIRE + rEff + 18,
        (n * (2 * rEff + 12)) / (2 * Math.PI)
      );
      const taille = 2 * (orbite + rEff) + 10;
      const centre = taille / 2;

      return {
        key,
        nom: g.nom,
        initiales: g.nom === "Non attribué" ? "-" : initiales(g.nom),
        copros: n,
        logements: tailles.reduce((s, t) => s + t.logements, 0),
        montant: g.copros.reduce((s, c) => s + (c.stats?.montant_ttc ?? 0), 0),
        orbite,
        taille,
        satellites: tailles
          .sort((a, b) => a.c.name.localeCompare(b.c.name))
          .map(({ c, logements, r }, i) => {
            const angle = (2 * Math.PI * i) / n - Math.PI / 2;
            return {
              id: c.id,
              name: c.name,
              phase: c.phase,
              fragile: c.fragile,
              logements,
              r,
              x: centre + orbite * Math.cos(angle) - r,
              y: centre + orbite * Math.sin(angle) - r,
            };
          }),
      };
    })
    .sort((a, b) => (a.key === SANS_GESTIONNAIRE ? 1 : b.key === SANS_GESTIONNAIRE ? -1 : b.logements - a.logements));
}

// ========== Vue kanban (une colonne par étape du projet) ==========

// « Futur projet » anticipe la prospection : aucune phase du référentiel ne s'y
// range encore (feedback du 28/08), la colonne existe pour préparer la suite.
const COLONNES_KANBAN: { id: PhaseId | "futur"; label: string; dot: string }[] = [
  { id: "futur", label: "Futur projet", dot: "var(--color-neutral-300)" },
  { id: "diagnostic", label: "Diagnostic", dot: COULEUR_PHASE.diagnostic },
  { id: "etudes", label: "Études", dot: COULEUR_PHASE.etudes },
  { id: "travaux", label: "Travaux", dot: COULEUR_PHASE.travaux },
];

function VueKanban({
  copros,
  retards,
}: {
  copros: SyndicCopro[];
  retards: Map<string, number>;
}) {
  const navigate = useNavigate();
  return (
    <div className="kanban">
      {COLONNES_KANBAN.map((col) => {
        const list = copros
          .filter((c) => c.phase === col.id)
          .sort((a, b) => a.name.localeCompare(b.name, "fr"));
        return (
          <section className="kcol" key={col.id}>
            <div className="kcol-head">
              <span className="kdot" style={{ background: col.dot }}></span>
              <span className="ktitle">{col.label}</span>
              <span className="kcount">{list.length}</span>
            </div>
            <div className="kcol-body">
              {list.map((c) => {
                const retard = retards.get(c.id) ?? 0;
                return (
                  <article
                    key={c.id}
                    className="panel"
                    style={{ padding: "12px 14px", marginBottom: 10, cursor: "pointer" }}
                    title={`Ouvrir le dossier ${c.name}`}
                    onClick={() => navigate(`/syndic/copros/${c.id}`)}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span style={{ fontWeight: 700, fontSize: 14, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {c.name}
                      </span>
                      <span style={{ flex: 1 }}></span>
                      {c.fragile && <Badge kind="warn">Fragile</Badge>}
                    </div>
                    <div style={{ fontSize: 12.5, color: "var(--fg-muted)", marginBottom: 6 }}>
                      {[c.city, `${nbLogements(c)} logements`, c.gestionnaire_nom].filter(Boolean).join(" · ")}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <DpePair before={c.energy_before as DpeClass | null} after={c.energy_after as DpeClass | null} />
                      <span style={{ flex: 1 }}></span>
                      {retard > 0 && (
                        <Badge kind="warn" dot>
                          {retard} en retard
                        </Badge>
                      )}
                      {c.stats?.montant_ttc != null && (
                        <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--color-primary-700)" }}>
                          {fmtEuroCourt(c.stats.montant_ttc)}
                        </span>
                      )}
                    </div>
                  </article>
                );
              })}
              {list.length === 0 && (
                <div style={{ padding: 18, textAlign: "center", color: "var(--fg-muted)", fontSize: 13 }}>
                  {col.id === "futur"
                    ? "Les projets en prospection apparaîtront ici."
                    : "Aucun dossier"}
                </div>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

// ========== Vue tableau (pilotage direction) ==========

type ColTri = "name" | "gestionnaire" | "phase" | "logements" | "montant" | "honoraires" | "progress" | "retard";

const PHASE_RANK: Record<PhaseId, number> = { diagnostic: 0, etudes: 1, travaux: 2 };

function VueTableau({
  copros,
  retards,
  honoraires,
  onGestionnaire,
}: {
  copros: SyndicCopro[];
  retards: Map<string, number>;
  honoraires: Map<string, number>;
  onGestionnaire?: (key: string, nom: string) => void;
}) {
  const navigate = useNavigate();
  const [tri, setTri] = useState<{ col: ColTri; desc: boolean }>({ col: "name", desc: false });

  const cliquerTri = (col: ColTri) =>
    setTri((prev) => ({ col, desc: prev.col === col ? !prev.desc : col !== "name" && col !== "gestionnaire" }));

  const lignes = useMemo(() => {
    const valeur = (c: SyndicCopro): string | number => {
      switch (tri.col) {
        case "name": return c.name;
        case "gestionnaire": return c.gestionnaire_nom ?? "";
        case "phase": return PHASE_RANK[c.phase];
        case "logements": return nbLogements(c);
        case "montant": return c.stats?.montant_ttc ?? 0;
        case "honoraires": return honoraires.get(c.id) ?? 0;
        case "progress": return c.progress ?? 0;
        case "retard": return retards.get(c.id) ?? 0;
      }
    };
    return [...copros].sort((a, b) => {
      const va = valeur(a);
      const vb = valeur(b);
      const cmp = typeof va === "string" ? va.localeCompare(String(vb), "fr") : Number(va) - Number(vb);
      return tri.desc ? -cmp : cmp;
    });
  }, [copros, tri, retards, honoraires]);

  // Comparatif par gestionnaire (charge et état du portefeuille de chacun)
  const parGestionnaire = useMemo(() => {
    const groupes = new Map<string, { nom: string; copros: SyndicCopro[] }>();
    for (const c of copros) {
      const cle = cleGestionnaire(c);
      const g = groupes.get(cle) ?? { nom: c.gestionnaire_nom || "Non attribué", copros: [] };
      g.copros.push(c);
      groupes.set(cle, g);
    }
    return [...groupes.entries()]
      .map(([key, g]) => ({
        key,
        nom: g.nom,
        copros: g.copros.length,
        logements: g.copros.reduce((s, c) => s + nbLogements(c), 0),
        montant: g.copros.reduce((s, c) => s + (c.stats?.montant_ttc ?? 0), 0),
        honoraires: g.copros.reduce((s, c) => s + (honoraires.get(c.id) ?? 0), 0),
        phases: PHASES.map((ph) => g.copros.filter((c) => c.phase === ph.id).length),
        retard: g.copros.reduce((s, c) => s + (retards.get(c.id) ?? 0), 0),
      }))
      .sort((a, b) => b.logements - a.logements);
  }, [copros, retards, honoraires]);

  const Th = ({ col, label, num }: { col: ColTri; label: string; num?: boolean }) => (
    <th
      className={num ? "num" : undefined}
      style={{ cursor: "pointer", whiteSpace: "nowrap", userSelect: "none" }}
      title="Trier sur cette colonne"
      onClick={() => cliquerTri(col)}
    >
      {label}
      {tri.col === col && (
        <Icon name={tri.desc ? "chevronDown" : "chevronUp"} size={12} style={{ marginLeft: 4, verticalAlign: -1 }} />
      )}
    </th>
  );

  return (
    <>
      {parGestionnaire.length > 1 && (
        <div className="panel" style={{ marginBottom: 20 }}>
          <div className="p-head">
            <Icon name="users" size={18} />
            <h3>Comparatif par gestionnaire</h3>
          </div>
          <div className="p-body" style={{ paddingTop: 0 }}>
            <div className="tablewrap">
              <table className="dossiers" style={{ fontSize: 13 }}>
                <thead>
                  <tr>
                    <th>Gestionnaire</th>
                    <th className="num">Copros</th>
                    <th className="num">Logements</th>
                    <th className="num">Montant TTC</th>
                    <th className="num">Honoraires syndic</th>
                    {PHASES.map((ph) => (
                      <th key={ph.id} className="num">{ph.label}</th>
                    ))}
                    <th className="num">Tâches en retard</th>
                  </tr>
                </thead>
                <tbody>
                  {parGestionnaire.map((g) => (
                    <tr
                      key={g.key}
                      style={{ cursor: onGestionnaire ? "pointer" : "default" }}
                      title={onGestionnaire ? `Ouvrir le portefeuille de ${g.nom}` : undefined}
                      onClick={onGestionnaire ? () => onGestionnaire(g.key, g.nom) : undefined}
                    >
                      <td style={{ fontWeight: 600 }}>{g.nom}</td>
                      <td className="num">{g.copros}</td>
                      <td className="num">{g.logements}</td>
                      <td className="num">{g.montant ? fmtEuroCourt(g.montant) : "-"}</td>
                      <td className="num">{g.honoraires ? fmtEuroCourt(g.honoraires) : "-"}</td>
                      {g.phases.map((n, i) => (
                        <td key={i} className="num">{n || "-"}</td>
                      ))}
                      <td className="num">
                        {g.retard > 0 ? (
                          <span style={{ color: "var(--color-error-700)", fontWeight: 700 }}>{g.retard}</span>
                        ) : (
                          "-"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <div className="panel">
        <div className="p-head">
          <Icon name="table" size={18} />
          <h3>Copropriétés du portefeuille</h3>
          <span style={{ flex: 1 }}></span>
          <span style={{ fontSize: 13, color: "var(--fg-muted)" }}>cliquez un en-tête pour trier</span>
        </div>
        <div className="p-body" style={{ paddingTop: 0 }}>
          <div className="tablewrap">
            <table className="dossiers" style={{ fontSize: 13 }}>
              <thead>
                <tr>
                  <Th col="name" label="Copropriété" />
                  <Th col="gestionnaire" label="Gestionnaire" />
                  <Th col="phase" label="Phase" />
                  <th>DPE</th>
                  <Th col="logements" label="Logements" num />
                  <Th col="montant" label="Montant TTC" num />
                  <Th col="honoraires" label="Honoraires syndic" num />
                  <Th col="progress" label="Avancement" num />
                  <Th col="retard" label="Tâches en retard" num />
                </tr>
              </thead>
              <tbody>
                {lignes.map((c) => {
                  const retard = retards.get(c.id) ?? 0;
                  return (
                    <tr key={c.id} onClick={() => navigate(`/syndic/copros/${c.id}`)} style={{ cursor: "pointer" }}>
                      <td style={{ fontWeight: 600 }}>
                        {c.name}
                        {c.fragile && (
                          <Badge kind="warn" >Fragile</Badge>
                        )}
                        {c.city && (
                          <span style={{ display: "block", fontSize: 11.5, color: "var(--fg-muted)", fontWeight: 400 }}>
                            {c.city}
                          </span>
                        )}
                      </td>
                      <td>{c.gestionnaire_nom || "-"}</td>
                      <td>
                        <span className="leg-g" style={{ whiteSpace: "nowrap" }}>
                          <span className="dot" style={{ background: COULEUR_PHASE[c.phase] }}></span>
                          {PHASES.find((p) => p.id === c.phase)?.label}
                        </span>
                      </td>
                      <td>
                        <DpePair before={c.energy_before as DpeClass | null} after={c.energy_after as DpeClass | null} />
                      </td>
                      <td className="num">{nbLogements(c) || "-"}</td>
                      <td className="num">{c.stats?.montant_ttc ? fmtEuroCourt(c.stats.montant_ttc) : "-"}</td>
                      <td className="num">{honoraires.get(c.id) ? fmtEuroCourt(honoraires.get(c.id)!) : "-"}</td>
                      <td className="num">{c.progress ?? 0} %</td>
                      <td className="num">
                        {retard > 0 ? (
                          <span style={{ color: "var(--color-error-700)", fontWeight: 700 }}>{retard}</span>
                        ) : (
                          "-"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="se-small" style={{ color: "var(--fg-muted)", marginTop: 12, marginBottom: 0 }}>
            Le montant est celui du plan de financement validé (à défaut, du scénario partagé) ; les honoraires
            du syndic sont la ligne correspondante des frais annexes du PF validé. Les tâches en retard sont
            vos tâches de syndic dont l'échéance est dépassée (page « Vos tâches »).
          </p>
        </div>
      </div>
    </>
  );
}

// ========== Page ==========

export function Portefeuille({
  copros,
  onGestionnaire,
}: {
  copros: SyndicCopro[];
  /** Aperçu AMO : clic sur un gestionnaire = entrer dans son portefeuille. */
  onGestionnaire?: (key: string, nom: string) => void;
}) {
  const navigate = useNavigate();
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [recherche, setRecherche] = useState("");
  // la vue choisie survit à l'ouverture d'un dossier (retour cohérent)
  const [vue, setVueBrut] = useState<"bulles" | "kanban" | "tableau">(() => {
    try {
      const v = sessionStorage.getItem("syndic-vue-portefeuille");
      return v === "kanban" || v === "tableau" ? v : "bulles";
    } catch {
      return "bulles";
    }
  });
  const setVue = (v: "bulles" | "kanban" | "tableau") => {
    setVueBrut(v);
    try {
      sessionStorage.setItem("syndic-vue-portefeuille", v);
    } catch {
      /* stockage indisponible */
    }
  };
  const systemes = useMemo(() => construireSystemes(copros), [copros]);

  // tâches en retard par copro (sème le gabarit au passage - idempotent)
  const { data: taches } = useSyndicTaches(copros.map((c) => c.id));
  const retards = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of taches ?? []) if (enRetard(t)) m.set(t.copro_id, (m.get(t.copro_id) ?? 0) + 1);
    return m;
  }, [taches]);

  // honoraires du syndic (ligne « syndic » des frais annexes du PF validé)
  const { data: honorairesData } = useHonorairesSyndic(copros.map((c) => c.id));
  const honoraires = honorairesData ?? new Map<string, number>();
  const totalHonoraires = copros.reduce((s, c) => s + (honoraires.get(c.id) ?? 0), 0);

  // Recherche par gestionnaire (ou par nom de copropriété : le système du
  // gestionnaire concerné reste affiché en entier).
  const q = normaliser(recherche.trim());
  const visibles = q
    ? systemes.filter(
        (s) => normaliser(s.nom).includes(q) || s.satellites.some((sat) => normaliser(sat.name).includes(q))
      )
    : systemes;
  const coprosFiltres = q
    ? copros.filter(
        (c) => normaliser(c.name).includes(q) || normaliser(c.gestionnaire_nom ?? "").includes(q)
      )
    : copros;

  const phaseCounts = PHASES.map((ph) => ({ ph, n: copros.filter((c) => c.phase === ph.id).length }));
  const totalLogements = copros.reduce((s, c) => s + nbLogements(c), 0);

  const exporter = () =>
    telechargerCsv(
      "portefeuille-syndic.csv",
      ["Copropriété", "Ville", "Gestionnaire", "Phase", "DPE avant", "DPE après", "Gain %", "Logements", "Lots", "Copropriétaires", "Montant TTC", "Honoraires syndic TTC", "Avancement %", "Fragile", "Tâches en retard"],
      [...copros]
        .sort((a, b) => a.name.localeCompare(b.name, "fr"))
        .map((c) => [
          c.name,
          c.city ?? "",
          c.gestionnaire_nom ?? "",
          PHASES.find((p) => p.id === c.phase)?.label ?? c.phase,
          c.energy_before ?? "",
          c.energy_after ?? "",
          c.gain_pct ?? "",
          nbLogements(c),
          c.stats?.lots ?? 0,
          c.stats?.coproprietaires ?? 0,
          c.stats?.montant_ttc ?? "",
          honoraires.get(c.id) != null ? Math.round(honoraires.get(c.id)! * 100) / 100 : "",
          c.progress ?? 0,
          c.fragile ? "Oui" : "",
          retards.get(c.id) ?? 0,
        ])
    );

  return (
    <div className="page syndic-dash fade" style={{ padding: 0 }}>
      <div className="page-head">
        <div>
          <h1 className="page-title">Votre portefeuille</h1>
          <p className="page-sub">
            {copros.length} copropriété{copros.length > 1 ? "s" : ""} · {totalLogements} logements ·{" "}
            {systemes.length} gestionnaire{systemes.length > 1 ? "s" : ""}
            {totalHonoraires > 0 && <> · {fmtEuroCourt(totalHonoraires)} d'honoraires syndic</>}
          </p>
        </div>
        <span className="spacer"></span>
        <div className="opt-mini">
          <button className={vue === "bulles" ? "on" : ""} onClick={() => setVue("bulles")} title="Vue par gestionnaire">
            <Icon name="grid" size={14} /> Bulles
          </button>
          <button className={vue === "kanban" ? "on" : ""} onClick={() => setVue("kanban")} title="Une colonne par étape : futur projet, diagnostic, études, travaux">
            <Icon name="columns" size={14} /> Kanban
          </button>
          <button className={vue === "tableau" ? "on" : ""} onClick={() => setVue("tableau")} title="Vue de pilotage : tri, comparatif, export">
            <Icon name="table" size={14} /> Tableau
          </button>
        </div>
        <button className="se-btn se-btn-secondary btn-sm" onClick={exporter} title="Exporter le portefeuille (CSV pour Excel)">
          <Icon name="download" size={14} />
          Exporter
        </button>
        <div className="search" style={{ margin: 0 }}>
          <Icon name="search" size={16} />
          <input
            placeholder="Rechercher un gestionnaire…"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
          />
          {recherche && (
            <button
              className="icon-btn"
              style={{ width: 22, height: 22, flex: "none" }}
              title="Effacer la recherche"
              onClick={() => setRecherche("")}
            >
              <Icon name="x" size={13} />
            </button>
          )}
        </div>
      </div>

      {q && vue === "bulles" && (
        <p className="se-small" style={{ color: "var(--fg-muted)", marginTop: -6, marginBottom: 10 }}>
          {visibles.length === 0
            ? "Aucun gestionnaire ni copropriété ne correspond à cette recherche."
            : `${visibles.length} gestionnaire${visibles.length > 1 ? "s" : ""} sur ${systemes.length}`}
        </p>
      )}

      {vue === "tableau" ? (
        <VueTableau copros={coprosFiltres} retards={retards} honoraires={honoraires} onGestionnaire={onGestionnaire} />
      ) : vue === "kanban" ? (
        <VueKanban copros={coprosFiltres} retards={retards} />
      ) : (
        <>
      <div className="orbites">
        {visibles.map((s, i) => (
          <div className="orbite-cell" key={s.key}>
            <div
              className="orbite-sys"
              style={{ width: s.taille, height: s.taille, ["--orbite-duree" as string]: `${68 + (i % 3) * 14}s` }}
            >
              <div className="orbite-ring">
                {s.satellites.map((sat) => {
                  const ph = PHASES.find((x) => x.id === sat.phase);
                  const couleur = COULEUR_PHASE[sat.phase];
                  return (
                    <div
                      key={sat.id}
                      className={"bubble orbite-sat clickable" + (hoverId === sat.id ? " hover" : "")}
                      style={{
                        left: sat.x,
                        top: sat.y,
                        width: sat.r * 2,
                        height: sat.r * 2,
                        background: couleur,
                        borderColor: couleur,
                        color: "#fff",
                      }}
                      title={`${sat.name} · ${sat.logements} logements${ph ? " · " + ph.label : ""}`}
                      onMouseEnter={() => setHoverId(sat.id)}
                      onMouseLeave={() => setHoverId(null)}
                      onClick={() => navigate(`/syndic/copros/${sat.id}`)}
                    >
                      <span className="b-name">{sat.name}</span>
                      <span className="b-sub">{sat.logements} lgts</span>
                      {sat.fragile && <span className="b-flag" title="Copropriété fragile">!</span>}
                    </div>
                  );
                })}
              </div>

              <div
                className={"bubble orbite-gest" + (onGestionnaire ? " clickable" : "")}
                style={{ width: R_GESTIONNAIRE * 2, height: R_GESTIONNAIRE * 2, cursor: onGestionnaire ? "pointer" : undefined }}
                title={
                  onGestionnaire
                    ? `Ouvrir le portefeuille de ${s.nom}`
                    : `${s.nom} - ${s.copros} copropriété${s.copros > 1 ? "s" : ""}`
                }
                onClick={onGestionnaire ? () => onGestionnaire(s.key, s.nom) : undefined}
              >
                <span className="b-init">{s.initiales}</span>
                <span className="b-sub">{s.logements} logements</span>
                <span className="b-sub b-montant">{fmtEuroCourt(s.montant)}</span>
              </div>
            </div>
            <div className="orbite-nom">{s.nom}</div>
          </div>
        ))}
      </div>

      <div className="syndic-legend">
        <div className="leg-phases">
          {phaseCounts.map(({ ph, n }) => (
            <span key={ph.id} className="leg-g">
              <span className="dot" style={{ background: COULEUR_PHASE[ph.id] }}></span>
              {ph.label}
              <span className="leg-n">{n}</span>
            </span>
          ))}
          <span className="leg-g">
            <span className="dot" style={{ background: "var(--color-neutral-300)" }}></span>
            Gestionnaire
          </span>
        </div>
      </div>
      <p className="se-small" style={{ color: "var(--fg-muted)", marginTop: 12 }}>
        Chaque bulle grise est un gestionnaire, entouré des copropriétés dont il a la charge - la couleur d'un satellite
        donne sa phase. Cliquez une copropriété pour ouvrir le dossier. Le montant est celui du scénario partagé, tant
        qu'il y en a un. La vue Tableau permet de trier, comparer les gestionnaires et exporter.
      </p>
        </>
      )}
    </div>
  );
}

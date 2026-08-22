// Portefeuille du syndic - un « système » par gestionnaire : une bulle grise au
// centre (ses initiales, le total de logements et le montant d'opération dont il
// a la charge), autour de laquelle gravitent ses copropriétés. La couleur d'un
// satellite donne la phase du dossier.
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "@/components/Icon";
import { PHASES, type PhaseId } from "@/lib/referentiels";
import { fmtEuroCourt } from "@/lib/format";
import { nbLogements } from "@/api/copros";
import type { SyndicCopro } from "@/api/syndic";

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
    const cle = c.gestionnaire_email?.toLowerCase() || c.gestionnaire_nom || SANS_GESTIONNAIRE;
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

export function Portefeuille({ copros }: { copros: SyndicCopro[] }) {
  const navigate = useNavigate();
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [recherche, setRecherche] = useState("");
  const systemes = useMemo(() => construireSystemes(copros), [copros]);

  // Recherche par gestionnaire (ou par nom de copropriété : le système du
  // gestionnaire concerné reste affiché en entier).
  const q = normaliser(recherche.trim());
  const visibles = q
    ? systemes.filter(
        (s) => normaliser(s.nom).includes(q) || s.satellites.some((sat) => normaliser(sat.name).includes(q))
      )
    : systemes;

  const phaseCounts = PHASES.map((ph) => ({ ph, n: copros.filter((c) => c.phase === ph.id).length }));
  const totalLogements = copros.reduce((s, c) => s + nbLogements(c), 0);

  return (
    <div className="page syndic-dash fade" style={{ padding: 0 }}>
      <div className="page-head">
        <div>
          <h1 className="page-title">Votre portefeuille</h1>
          <p className="page-sub">
            {copros.length} copropriété{copros.length > 1 ? "s" : ""} · {totalLogements} logements ·{" "}
            {systemes.length} gestionnaire{systemes.length > 1 ? "s" : ""}
          </p>
        </div>
        <span className="spacer"></span>
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

      {q && (
        <p className="se-small" style={{ color: "var(--fg-muted)", marginTop: -6, marginBottom: 10 }}>
          {visibles.length === 0
            ? "Aucun gestionnaire ni copropriété ne correspond à cette recherche."
            : `${visibles.length} gestionnaire${visibles.length > 1 ? "s" : ""} sur ${systemes.length}`}
        </p>
      )}

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
                className="bubble orbite-gest"
                style={{ width: R_GESTIONNAIRE * 2, height: R_GESTIONNAIRE * 2 }}
                title={`${s.nom} - ${s.copros} copropriété${s.copros > 1 ? "s" : ""}`}
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
        qu'il y en a un.
      </p>
    </div>
  );
}

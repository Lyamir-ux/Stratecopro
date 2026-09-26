// Honoraires de suivi de travaux du tableau de bord PPT (direction) - feedback
// Amir 26/09/2026 : les barres « proportionnelles à l'année la plus chargée »,
// sans axe ni total, ne disaient rien. Quatre lectures, une par vue :
//   - Mosaïque : cascade cumulée (A) - chaque année s'ajoute, la dernière
//     colonne donne le total - et répartition sécurisé / probable / en jeu (B),
//     le potentiel pondéré par le taux de passage en AG (curseur) ;
//   - Kanban : pipeline par statut des postes (D), avec l'action qui débloque
//     chaque tranche ;
//   - Tableau : carte de chaleur copropriété × année (C).
// SVG natif, en unités de viewBox (le graphique suit la largeur du panneau).
// Mêmes postes et mêmes montants partout (honorairesPostesVivants), repris par
// le PDF du portefeuille pour A et B.
import { useMemo, useState, type ReactNode } from "react";
import { Icon, type IconName } from "@/components/Icon";
import { telechargerCsv } from "@/lib/csv";
import { fmtEuroCourt } from "@/lib/format";
import { echelleAxe, fmtKEur } from "@/lib/ppt/formats";
import type { ParametresOrg } from "@/lib/ppt/formules";
import {
  MIN_POSTES_TAUX_CONSTATE,
  repartitionProbable,
  type EtapeHonoraires,
  type HonorairesAnnee,
  type HonorairesCopro,
  type PipelineHonoraires,
} from "@/lib/ppt/indicateurs";
import { fmtEur } from "./commun";

// ---------- formats ----------

const kEur = fmtKEur;
const pct = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 100) : 0);
const plur = (n: number, s: string, p = s + "s") => `${n} ${n > 1 ? p : s}`;

// ---------- couleurs (gamme bleue de la branche PPT) ----------

const C = {
  vote: "var(--color-primary-700)",
  potentiel: "var(--color-primary-300)",
  totalPotentiel: "var(--color-primary-500)",
  probable: "var(--color-primary-400)",
  enJeu: "var(--color-neutral-300)",
  representer: "var(--color-primary-200)",
  grille: "var(--color-neutral-200)",
  axe: "var(--color-neutral-400)",
  encre: "var(--fg1)",
  muet: "var(--fg-muted)",
};

// ---------- briques communes ----------

function Tuile({ label, valeur, pied, pastille }: { label: string; valeur: string; pied?: string; pastille?: string }) {
  return (
    <div className="hono-tuile">
      <div className="ht-label">
        {pastille && <span className="ht-past" style={{ background: pastille }}></span>}
        {label}
      </div>
      <div className="ht-val">{valeur}</div>
      {pied && <div className="ht-pied">{pied}</div>}
    </div>
  );
}

function Legende({ items }: { items: { label: string; couleur: string; trait?: boolean }[] }) {
  return (
    <div className="hono-legende">
      {items.map((i) => (
        <span key={i.label}>
          <i style={i.trait ? { height: 0, borderTop: `1.5px solid ${i.couleur}`, width: 14, borderRadius: 0 } : { background: i.couleur }}></i>
          {i.label}
        </span>
      ))}
    </div>
  );
}

function Panneau({ icone, titre, droite, children }: { icone: IconName; titre: string; droite?: ReactNode; children: ReactNode }) {
  return (
    <div className="panel" style={{ marginTop: 20 }}>
      <div className="p-head">
        <Icon name={icone} size={18} />
        <h3>{titre}</h3>
        <span style={{ flex: 1 }}></span>
        {droite}
      </div>
      <div className="p-body">{children}</div>
    </div>
  );
}

const Vide = () => (
  <p className="se-small" style={{ color: "var(--fg-muted)", margin: 0 }}>
    Aucun poste chiffré sur le périmètre affiché : les honoraires apparaissent une fois un PPPT analysé et validé par Strat Eco pro.
  </p>
);

const libelleAnnee = (lignes: { annee: number }[], i: number) => (i === lignes.length - 1 ? `${lignes[i].annee}+` : String(lignes[i].annee));

// ---------- graphique en colonnes (cascade et empilé) ----------

interface Segment {
  bas: number;
  haut: number;
  couleur: string;
}
interface Colonne {
  label: string;
  segments: Segment[];
  etiquette?: string;
  gras?: boolean;
  infobulle: ReactNode;
}

const VB = { w: 1000, h: 290, g: 64, d: 10, hHaut: 24, bas: 28 };

/** Colonnes de segments flottants [bas, haut] sur un axe en euros ; `connecteurs` relie le haut de chaque colonne à la suivante (cascade). */
function GraphiqueColonnes({ colonnes, connecteurs = false, aria }: { colonnes: Colonne[]; connecteurs?: boolean; aria: string }) {
  const [survol, setSurvol] = useState<number | null>(null);
  const max = Math.max(0, ...colonnes.flatMap((c) => c.segments.map((s) => s.haut)));
  const { haut, pas } = echelleAxe(max);
  const plotH = VB.h - VB.hHaut - VB.bas;
  const plotW = VB.w - VB.g - VB.d;
  const slot = plotW / Math.max(1, colonnes.length);
  const bw = Math.min(46, slot * 0.62);
  const y = (v: number) => VB.hHaut + plotH - (v / haut) * plotH;
  const cx = (i: number) => VB.g + slot * i + slot / 2;
  const graduations: number[] = [];
  for (let v = 0; v <= haut + 1e-6; v += pas) graduations.push(v);

  return (
    <div className="hono-graph" onMouseLeave={() => setSurvol(null)}>
      <svg viewBox={`0 0 ${VB.w} ${VB.h}`} role="img" aria-label={aria} style={{ width: "100%", height: "auto", display: "block" }}>
        {graduations.map((v) => (
          <g key={v}>
            <line x1={VB.g} x2={VB.w - VB.d} y1={y(v)} y2={y(v)} style={{ stroke: v === 0 ? C.axe : C.grille, strokeWidth: 1 }} />
            <text x={VB.g - 8} y={y(v) + 4} textAnchor="end" style={{ fill: C.muet, fontSize: 12 }}>
              {v === 0 ? "0" : kEur(v)}
            </text>
          </g>
        ))}
        {survol != null && <rect x={VB.g + slot * survol + 2} y={VB.hHaut - 20} width={slot - 4} height={plotH + 20} rx={6} style={{ fill: "var(--bg-soft)" }} />}
        {colonnes.map((c, i) => {
          const x = cx(i) - bw / 2;
          const pleins = c.segments.filter((s) => s.haut - s.bas > 0);
          const sommet = Math.max(0, ...pleins.map((s) => s.haut));
          return (
            <g key={i}>
              {pleins.map((s, k) => {
                // 2 unités de fond entre deux segments empilés, jamais de trait autour
                const y1 = y(s.haut);
                const y2 = y(s.bas) - (k > 0 ? 2 : 0);
                return <rect key={k} x={x} y={Math.min(y1, y2 - 1.5)} width={bw} height={Math.max(1.5, y2 - y1)} rx={3} style={{ fill: s.couleur }} />;
              })}
              {connecteurs && i < colonnes.length - 1 && sommet > 0 && (
                <line x1={x + bw} x2={cx(i + 1) - bw / 2} y1={y(sommet)} y2={y(sommet)} style={{ stroke: C.axe, strokeWidth: 1 }} />
              )}
              {c.etiquette && sommet > 0 && (
                <text x={cx(i)} y={y(sommet) - 7} textAnchor="middle" style={{ fill: C.encre, fontSize: 12, fontWeight: c.gras ? 700 : 400 }}>
                  {c.etiquette}
                </text>
              )}
              <text x={cx(i)} y={VB.h - 9} textAnchor="middle" style={{ fill: c.gras ? C.encre : C.muet, fontSize: 12.5, fontWeight: c.gras ? 700 : 400 }}>
                {c.label}
              </text>
              <rect x={VB.g + slot * i} y={0} width={slot} height={VB.h} style={{ fill: "transparent", cursor: "default" }} onMouseEnter={() => setSurvol(i)} />
            </g>
          );
        })}
      </svg>
      {survol != null && (
        <div className="hono-bulle" style={{ left: `${(cx(survol) / VB.w) * 100}%`, transform: survol > colonnes.length / 2 ? "translateX(calc(-100% - 14px))" : "translateX(14px)" }}>
          {colonnes[survol].infobulle}
        </div>
      )}
    </div>
  );
}

// ---------- A : cascade cumulée (mosaïque) ----------

export function PanneauCumulHonoraires({ lignes, params, annee }: { lignes: HonorairesAnnee[]; params: ParametresOrg; annee: number }) {
  const total = lignes.reduce((s, l) => s + l.acquis + l.potentiel, 0);
  const acquis = lignes.reduce((s, l) => s + l.acquis, 0);
  const nbPostes = lignes.reduce((s, l) => s + l.nbPostes, 0);
  const pic = lignes.reduce<HonorairesAnnee | null>((m, l) => (l.acquis + l.potentiel > (m ? m.acquis + m.potentiel : 0) ? l : m), null);
  const fin = lignes[lignes.length - 1]?.annee ?? annee;

  const colonnes = useMemo<Colonne[]>(() => {
    let cum = 0;
    const cols: Colonne[] = lignes.map((l, i) => {
      const bas = cum;
      cum += l.acquis + l.potentiel;
      const lib = libelleAnnee(lignes, i);
      return {
        label: lib,
        segments: [
          { bas, haut: bas + l.acquis, couleur: C.vote },
          { bas: bas + l.acquis, haut: cum, couleur: C.potentiel },
        ],
        etiquette: l.acquis + l.potentiel > 0 ? "+" + kEur(l.acquis + l.potentiel) : undefined,
        infobulle: (
          <>
            <b>{i === lignes.length - 1 ? `${l.annee} et au-delà` : l.annee}</b>
            <span>Votés : {fmtEur(l.acquis)}</span>
            <span>À faire voter : {fmtEur(l.potentiel)}</span>
            <span className="mu">{plur(l.nbPostes, "poste")} · {fmtEur(l.montantTtc)} de travaux TTC</span>
            <span className="mu">Cumul fin {l.annee} : {fmtEur(cum)}</span>
          </>
        ),
      };
    });
    const ac = lignes.reduce((s, l) => s + l.acquis, 0);
    cols.push({
      label: "Total",
      gras: true,
      segments: [
        { bas: 0, haut: ac, couleur: C.vote },
        { bas: ac, haut: cum, couleur: C.totalPotentiel },
      ],
      etiquette: kEur(cum),
      infobulle: (
        <>
          <b>Total {lignes[0]?.annee}-{lignes[lignes.length - 1]?.annee}+</b>
          <span>Votés : {fmtEur(ac)}</span>
          <span>À faire voter : {fmtEur(cum - ac)}</span>
          <span className="mu">{plur(lignes.reduce((s, l) => s + l.nbPostes, 0), "poste")}</span>
        </>
      ),
    });
    return cols;
  }, [lignes]);

  return (
    <Panneau
      icone="trendingUp"
      titre={`Honoraires de suivi de travaux cumulés, ${annee}-${fin}`}
      droite={
        <>
          <span style={{ fontSize: 13, color: "var(--fg-muted)" }}>
            {params.taux_honoraires_pct.toLocaleString("fr-FR")} % du montant {params.base_honoraires.toUpperCase()}
          </span>
          <button
            className="se-btn se-btn-ghost btn-sm"
            onClick={() =>
              telechargerCsv(
                `honoraires-ppt-${annee}.csv`,
                ["Année", "Postes", "Montant TTC", "Honoraires votés", "Honoraires à faire voter", "Total de l'année", "Cumul"],
                lignes.map((l, i) => [libelleAnnee(lignes, i), l.nbPostes, l.montantTtc, l.acquis, l.potentiel, Math.round((l.acquis + l.potentiel) * 100) / 100, Math.round(lignes.slice(0, i + 1).reduce((s, x) => s + x.acquis + x.potentiel, 0) * 100) / 100])
              )
            }
          >
            <Icon name="download" size={13} />
            CSV
          </button>
        </>
      }
    >
      {total <= 0 ? (
        <Vide />
      ) : (
        <>
          <div className="hono-tuiles">
            <Tuile label={`Total ${annee}-${fin}`} valeur={fmtEuroCourt(total)} pied={`${plur(nbPostes, "poste")} du plan`} />
            <Tuile label="Déjà votés en AG" valeur={acquis ? fmtEuroCourt(acquis) : "-"} pied={`${pct(acquis, total)} % du total`} pastille={C.vote} />
            <Tuile label="À faire voter" valeur={fmtEuroCourt(total - acquis)} pied={`${pct(total - acquis, total)} % du total`} pastille={C.potentiel} />
            {pic && <Tuile label="Année la plus chargée" valeur={String(pic.annee)} pied={`${fmtEuroCourt(pic.acquis + pic.potentiel)} · ${plur(pic.nbPostes, "poste")}`} />}
          </div>
          <Legende
            items={[
              { label: "Votés (acquis)", couleur: C.vote },
              { label: "À faire voter (potentiel)", couleur: C.potentiel },
              { label: "Cumul", couleur: C.axe, trait: true },
            ]}
          />
          <GraphiqueColonnes colonnes={colonnes} connecteurs aria={`Cascade des honoraires de suivi : chaque année s'ajoute au cumul, total ${fmtEur(total)} dont ${fmtEur(acquis)} votés.`} />
          <p className="se-small hono-note">
            Chaque colonne part du cumul des années précédentes : sa hauteur est ce que l'année ajoute, son sommet le cumul atteint. La dernière colonne donne le total. Postes votés au montant voté ; postes programmés, présentés ou à représenter actualisés à {params.inflation_pct.toLocaleString("fr-FR")} % par an depuis {annee}. Un poste rejeté compte à l'année de sa nouvelle présentation ; {fin}+ cumule les années suivantes.
          </p>
        </>
      )}
    </Panneau>
  );
}

// ---------- B : sécurisé / probable / en jeu (mosaïque) ----------

export interface TauxPassageInfo {
  /** taux retenu (curseur) */
  taux: number;
  /** taux constaté sur le périmètre, null sans poste présenté */
  constate: number | null;
  presentes: number;
  /** le taux retenu est l'hypothèse par défaut (historique insuffisant) et le curseur n'a pas bougé */
  hypothese: boolean;
  /** le curseur a été déplacé */
  modifie: boolean;
}

export function PanneauProbable({ lignes, passage, onTaux, annee }: { lignes: HonorairesAnnee[]; passage: TauxPassageInfo; onTaux: (t: number | null) => void; annee: number }) {
  const r = useMemo(() => repartitionProbable(lignes, passage.taux), [lignes, passage.taux]);
  const plafond = r.securise + r.probable + r.enJeu;
  const prevision = r.securise + r.probable;
  const potentiel = r.probable + r.enJeu;
  const fin = lignes[lignes.length - 1]?.annee ?? annee;

  const colonnes = useMemo<Colonne[]>(
    () =>
      r.annees.map((a, i) => ({
        label: libelleAnnee(lignes, i),
        segments: [
          { bas: 0, haut: a.securise, couleur: C.vote },
          { bas: a.securise, haut: a.securise + a.probable, couleur: C.probable },
          { bas: a.securise + a.probable, haut: a.securise + a.probable + a.enJeu, couleur: C.enJeu },
        ],
        infobulle: (
          <>
            <b>{i === lignes.length - 1 ? `${a.annee} et au-delà` : a.annee}</b>
            <span>Sécurisé : {fmtEur(a.securise)}</span>
            <span>Probable : {fmtEur(a.probable)}</span>
            <span>En jeu : {fmtEur(a.enJeu)}</span>
            <span className="mu">Prévision de l'année : {fmtEur(a.securise + a.probable)}</span>
          </>
        ),
      })),
    [r, lignes]
  );

  const noteTaux = passage.hypothese
    ? `hypothèse par défaut : ${passage.presentes ? `seulement ${plur(passage.presentes, "poste présenté", "postes présentés")} en AG` : "aucun poste présenté en AG"}, historique insuffisant (${MIN_POSTES_TAUX_CONSTATE} minimum)`
    : passage.modifie
      ? passage.constate != null
        ? `taux constaté : ${passage.constate} % sur ${plur(passage.presentes, "poste présenté", "postes présentés")}`
        : "aucun poste présenté en AG"
      : `taux constaté sur ${plur(passage.presentes, "poste présenté", "postes présentés")} en AG (votés / présentés)`;

  return (
    <Panneau icone="gauge" titre="Ce que le PPT devrait rapporter">
      {plafond <= 0 ? (
        <Vide />
      ) : (
        <>
          <div className="hono-curseur">
            <label htmlFor="taux-passage">Taux de passage en AG</label>
            <input id="taux-passage" type="range" min={0} max={100} step={5} value={passage.taux} onChange={(e) => onTaux(Number(e.target.value))} />
            <b>{passage.taux} %</b>
            <span className="mu">{noteTaux}</span>
            {passage.modifie && (
              <button className="se-btn se-btn-ghost btn-sm" onClick={() => onTaux(null)}>
                <Icon name="refresh" size={13} />
                {passage.constate != null && passage.presentes >= MIN_POSTES_TAUX_CONSTATE ? "Revenir au taux constaté" : "Revenir à l'hypothèse"}
              </button>
            )}
          </div>
          <div className="hono-tuiles trois">
            <Tuile label="Sécurisé (voté)" valeur={r.securise ? fmtEuroCourt(r.securise) : "-"} pied="postes adoptés en AG" pastille={C.vote} />
            <Tuile label="Prévision réaliste" valeur={fmtEuroCourt(prevision)} pied={`voté + ${passage.taux} % du potentiel`} pastille={C.probable} />
            <Tuile label="Plafond si tout est voté" valeur={fmtEuroCourt(plafond)} pied={`dont ${fmtEuroCourt(r.enJeu)} en jeu`} pastille={C.enJeu} />
          </div>
          <Legende
            items={[
              { label: "Sécurisé : voté", couleur: C.vote },
              { label: `Probable : potentiel × ${passage.taux} %`, couleur: C.probable },
              { label: "En jeu : reste du potentiel", couleur: C.enJeu },
            ]}
          />
          <GraphiqueColonnes colonnes={colonnes} aria={`Honoraires par année : sécurisé, probable au taux de passage de ${passage.taux} %, en jeu. Prévision ${fmtEur(prevision)} sur ${fmtEur(plafond)}.`} />
          <p className="hono-phrase">
            Avec {passage.taux} % des postes votés, le PPT rapporterait environ <b>{fmtEur(prevision)}</b> d'honoraires de suivi d'ici {fin}, soit {fmtEur(prevision / Math.max(1, lignes.length))} par an en moyenne.
            {potentiel > 0 && <> Chaque point de taux de passage gagné en AG vaut {fmtEur(potentiel / 100)}.</>}
          </p>
        </>
      )}
    </Panneau>
  );
}

// ---------- D : pipeline par statut (kanban) ----------

const ETAPE: Record<EtapeHonoraires, { label: string; couleur: string; icone: IconName }> = {
  vote: { label: "Votés en AG", couleur: C.vote, icone: "checkCircle" },
  presente: { label: "Passés en AG sans décision", couleur: C.probable, icone: "clock" },
  a_representer: { label: "À représenter", couleur: C.representer, icone: "alert" },
  programme: { label: "Programmés, jamais présentés", couleur: C.enJeu, icone: "calendar" },
};

export function PanneauPipelineHonoraires({ pipeline, annee }: { pipeline: PipelineHonoraires; annee: number }) {
  const { total, etapes, programmeProche } = pipeline;
  const action = (e: EtapeHonoraires): string => {
    switch (e) {
      case "vote":
        return "Acquis : postes adoptés, au montant voté";
      case "presente":
        return "Inscrits à une AG sans vote : décision à obtenir à la prochaine";
      case "a_representer":
        return "Rejetés ou reportés : à remettre à l'ordre du jour";
      case "programme":
        return programmeProche.nbPostes
          ? `Dont ${fmtEur(programmeProche.honoraires)} (${plur(programmeProche.nbPostes, "poste")}) à inscrire aux AG de ${annee}-${annee + 1}`
          : `Aucun attendu d'ici ${annee + 1}`;
    }
  };
  const visibles = etapes.filter((e) => e.honoraires > 0);
  return (
    <Panneau icone="layers" titre="Où en sont les honoraires de suivi">
      {total <= 0 ? (
        <Vide />
      ) : (
        <>
          <div className="hono-pipe-tete">
            <span className="mu">Honoraires projetés {annee}-{annee + 10}+</span>
            <b>{fmtEur(total)}</b>
            <span className="mu">{plur(pipeline.nbPostes, "poste")}</span>
          </div>
          <div className="hono-pipe-barre" role="img" aria-label={visibles.map((e) => `${ETAPE[e.etape].label} : ${fmtEur(e.honoraires)}`).join(", ")}>
            {visibles.map((e) => (
              <i key={e.etape} title={`${ETAPE[e.etape].label} : ${fmtEur(e.honoraires)}`} style={{ flexGrow: e.honoraires, background: ETAPE[e.etape].couleur }}></i>
            ))}
          </div>
          <div>
            {etapes.map((e) => (
              <div key={e.etape} className={"hono-pipe-ligne" + (e.nbPostes ? "" : " vide")}>
                <span className="past" style={{ background: ETAPE[e.etape].couleur }}></span>
                <div style={{ minWidth: 0 }}>
                  <div className="lib">
                    <Icon name={ETAPE[e.etape].icone} size={15} />
                    {ETAPE[e.etape].label}
                  </div>
                  <div className="act">{e.nbPostes ? action(e.etape) : "Aucun poste"}</div>
                </div>
                <span className="mt">{e.honoraires ? fmtEur(e.honoraires) : "-"}</span>
                <span className="nb">{e.nbPostes ? plur(e.nbPostes, "poste") : "-"}</span>
                <span className="pc">{e.honoraires ? `${pct(e.honoraires, total)} %` : ""}</span>
              </div>
            ))}
          </div>
          <p className="se-small hono-note">
            Mêmes postes et mêmes montants que la cascade de la vue Mosaïque : postes votés au montant voté, les autres actualisés à l'année où ils passeront en AG. Les postes réalisés et abandonnés n'y figurent pas.
          </p>
        </>
      )}
    </Panneau>
  );
}

// ---------- C : carte de chaleur copropriété × année (tableau) ----------

const LIGNES_VISIBLES = 15;

export function PanneauCarteHonoraires({
  lignes,
  annees,
  annee,
  acces,
  onOuvrir,
}: {
  lignes: HonorairesCopro[];
  annees: number[];
  annee: number;
  acces: (id: string) => boolean;
  onOuvrir: (id: string) => void;
}) {
  const [tout, setTout] = useState(false);
  const n = annees.length;
  const totAnnee = annees.map((_, i) => lignes.reduce((s, l) => s + l.parAnnee[i], 0));
  const total = totAnnee.reduce((s, v) => s + v, 0);
  const affichees = tout ? lignes : lignes.slice(0, LIGNES_VISIBLES);
  const reste = lignes.slice(affichees.length);
  const autres = reste.length ? annees.map((_, i) => reste.reduce((s, l) => s + l.parAnnee[i], 0)) : null;
  const max = Math.max(1, ...affichees.flatMap((l) => l.parAnnee), ...(autres ?? []));
  const libAnnee = (i: number) => (i === n - 1 ? `${annees[i]}+` : String(annees[i]));

  // combien de copropriétés portent la moitié des honoraires
  let cum = 0, k = 0;
  for (const l of lignes) {
    if (cum >= total / 2) break;
    cum += l.total;
    k++;
  }
  const iPic = totAnnee.indexOf(Math.max(...totAnnee));

  const cellule = (i: number, v: number, titre: string, vote = false) => {
    if (!v) return <td key={i} className="vide">·</td>;
    const a = 0.1 + 0.85 * Math.sqrt(v / max);
    return (
      <td key={i} title={titre} className={vote ? "vote" : undefined} style={{ background: `rgba(30, 79, 124, ${a.toFixed(2)})`, color: a > 0.55 ? "#fff" : "var(--color-primary-800)" }}>
        {(v / 1000).toLocaleString("fr-FR", { maximumFractionDigits: v < 1e5 ? 1 : 0 })}
      </td>
    );
  };

  return (
    <Panneau
      icone="grid"
      titre="Honoraires de suivi par copropriété et par année"
      droite={
        lignes.length > 0 && (
          <button
            className="se-btn se-btn-ghost btn-sm"
            onClick={() =>
              telechargerCsv(
                `honoraires-ppt-par-copropriete-${annee}.csv`,
                ["Copropriété", "Gestionnaire", ...annees.map((_, i) => libAnnee(i)), "Total"],
                lignes.map((l) => [l.copro.nom, l.copro.gestionnaire_nom ?? "", ...l.parAnnee, l.total])
              )
            }
          >
            <Icon name="download" size={13} />
            CSV
          </button>
        )
      }
    >
      {total <= 0 ? (
        <Vide />
      ) : (
        <>
          <p className="hono-phrase" style={{ marginTop: 0 }}>
            {lignes.length > 1 ? (
              <>
                {k === 1 ? "1 copropriété" : `${k} copropriétés`} sur {lignes.length} {k > 1 ? "portent" : "porte"} la moitié des honoraires projetés ({fmtEur(cum)} sur {fmtEur(total)}).{" "}
              </>
            ) : null}
            {iPic >= 0 && <>L'année la plus chargée est {libAnnee(iPic)} : {pct(totAnnee[iPic], total)} % du total.</>}
          </p>
          <div className="tablewrap">
            <table className="hono-carte">
              <colgroup>
                <col style={{ width: 200 }} />
                {annees.map((a) => (
                  <col key={a} />
                ))}
                <col style={{ width: 84 }} />
              </colgroup>
              <thead>
                <tr>
                  <th className="nom">Copropriété</th>
                  {annees.map((_, i) => (
                    <th key={i} className={annees[i] === annee ? "cur" : undefined}>
                      {libAnnee(i)}
                    </th>
                  ))}
                  <th className="tot">Total</th>
                </tr>
              </thead>
              <tbody>
                {affichees.map((l) => {
                  const ouvrable = acces(l.copro.id);
                  return (
                    <tr key={l.copro.id} className={ouvrable ? "ouvrable" : undefined} onClick={ouvrable ? () => onOuvrir(l.copro.id) : undefined}>
                      <td className="nom" title={l.copro.gestionnaire_nom ? `${l.copro.nom} · ${l.copro.gestionnaire_nom}` : l.copro.nom}>
                        {l.copro.nom}
                      </td>
                      {l.parAnnee.map((v, i) => cellule(i, v, `${l.copro.nom} · ${libAnnee(i)} : ${fmtEur(v)} · ${plur(l.nbPostes[i], "poste")}${l.vote[i] ? " (dont voté)" : ""}`, l.vote[i]))}
                      <td className="tot" title={`${pct(l.total, total)} % du total`}>
                        {kEur(l.total)}
                      </td>
                    </tr>
                  );
                })}
                {autres && (
                  <tr className="autres">
                    <td className="nom">Autres ({plur(reste.length, "copropriété")})</td>
                    {autres.map((v, i) => cellule(i, v, `Autres copropriétés · ${libAnnee(i)} : ${fmtEur(v)}`))}
                    <td className="tot">{kEur(reste.reduce((s, l) => s + l.total, 0))}</td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr>
                  <td className="nom">Total par année</td>
                  {totAnnee.map((v, i) => (
                    <td key={i}>{v ? kEur(v) : "-"}</td>
                  ))}
                  <td className="tot">{kEur(total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="hono-carte-leg">
            <span>Montants en k€ · cliquez une ligne pour ouvrir la copropriété</span>
            <span style={{ flex: 1 }}></span>
            {lignes.length > LIGNES_VISIBLES && (
              <button className="se-btn se-btn-ghost btn-sm" onClick={() => setTout(!tout)}>
                {tout ? `Ne garder que les ${LIGNES_VISIBLES} premières` : `Afficher les ${lignes.length} copropriétés`}
              </button>
            )}
            <span>moins</span>
            <span className="echelle">
              {[0.15, 0.35, 0.55, 0.75, 0.95].map((a) => (
                <i key={a} style={{ background: `rgba(30, 79, 124, ${a})` }}></i>
              ))}
            </span>
            <span>plus</span>
            <span className="vote-leg">
              <i></i>contient un poste voté
            </span>
          </div>
        </>
      )}
    </Panneau>
  );
}

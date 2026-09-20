// Tableau de bord de la branche « Suivi des PPT » - aligné sur le portefeuille
// de la rénovation globale (feedback Amir 20/09/2026) : même en-tête (titre et
// enseigne, sous-titre chiffré, bascule de vues, export CSV, recherche) et
// trois vues commutables. La vue « Bulles » ne tient pas avec des dizaines de
// copropriétés par gestionnaire : elle est remplacée par une mosaïque - une
// carte par gestionnaire (jauge des états, honoraires) contenant une tuile
// compacte par copropriété, colorée par état de suivi. Kanban : une colonne
// par état. Tableau : comparatif par gestionnaire (direction) et copropriétés
// triables. Sous les vues : honoraires projetés (direction, sauf en mosaïque où
// chaque carte de gestionnaire les porte déjà), ce qu'il faut préparer pour les
// AG (gestionnaire), alertes.
// Direction et aperçu AMO voient toute l'enseigne ; un gestionnaire ne voit
// que ses dossiers - aucun chiffre d'un collègue, aucun classement.
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "@/components/Icon";
import { Badge, DpeChip } from "@/components/ui";
import type { PptCoproAvecStats } from "@/api/ppt";
import { PHASES, type DpeClass } from "@/lib/referentiels";
import { telechargerCsv } from "@/lib/csv";
import { fmtEuroCourt } from "@/lib/format";
import {
  ETATS_PPT,
  ETAT_PPT_LABEL,
  aPreparer,
  alertes,
  cleGestionnaire,
  fichesCopros,
  groupesGestionnaires,
  honorairesParAnnee,
  statsParGestionnaire,
  type Alerte,
  type CoproEtatInput,
  type EtatPpt,
  type FicheCopro,
} from "@/lib/ppt/indicateurs";
import { articleSuggere } from "@/lib/ppt/referentiels";
import { agLite, anneeCourante, coproLite, fmtDateCourte, fmtEur, posteLite, rapportLite, type PrioriteCode } from "./commun";
import type { PortefeuillePpt } from "./index";

type Vue = "mosaique" | "kanban" | "tableau";
const CLE_VUE = "syndic-vue-ppt";

/** Comparaison de recherche : minuscules, sans accents. */
const normaliser = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Copropriété PPT → entrée des indicateurs, avec les champs du portefeuille importé (0077) et la phase du dossier rapproché. */
function coproEtat(c: PptCoproAvecStats): CoproEtatInput {
  return { ...coproLite(c), commune: c.commune, plus_de_15_ans: c.plus_de_15_ans, pppt_presente: c.pppt_presente, reno_phase: c.stats?.reno_phase ?? null };
}

/** Libellé d'état, précisé par la phase du dossier de rénovation quand il y en a une. */
function libelleEtat(f: FicheCopro): string {
  if (f.etat === "reno") {
    const ph = PHASES.find((p) => p.id === f.copro.reno_phase)?.label;
    return ph ? `En rénovation · ${ph}` : ETAT_PPT_LABEL.reno;
  }
  return ETAT_PPT_LABEL[f.etat];
}

const NIVEAU_COULEUR: Record<Alerte["niveau"], string> = {
  haute: "var(--color-error-700)",
  moyenne: "var(--color-warning-700)",
  basse: "var(--fg-muted)",
};

// ========== Panneaux sous les vues ==========

function ListeAlertes({ liste, titre }: { liste: Alerte[]; titre: string }) {
  const navigate = useNavigate();
  if (!liste.length) return null;
  return (
    <div className="panel" style={{ marginTop: 20 }}>
      <div className="p-head">
        <Icon name="bell" size={18} />
        <h3>{titre}</h3>
        <span style={{ flex: 1 }}></span>
        <Badge kind="warn">{liste.length}</Badge>
      </div>
      <div className="p-body" style={{ paddingTop: 4 }}>
        {liste.slice(0, 12).map((a, i) => (
          <div key={i} className="task-row" style={{ padding: "8px 4px", borderBottom: "1px solid var(--border)", cursor: "pointer" }} onClick={() => navigate(`/syndic/ppt/copros/${a.ppt_copro_id}`)}>
            <span style={{ width: 8, height: 8, borderRadius: 999, background: NIVEAU_COULEUR[a.niveau], flex: "none" }}></span>
            <div style={{ fontSize: 13.5 }}>
              <b>{a.copro}</b> · {a.libelle}
            </div>
            <span className="spacer"></span>
            <Icon name="chevronRight" size={15} style={{ color: "var(--fg-muted)" }} />
          </div>
        ))}
        {liste.length > 12 && (
          <p className="se-small" style={{ color: "var(--fg-muted)", margin: "8px 0 0" }}>
            et {liste.length - 12} autre{liste.length - 12 > 1 ? "s" : ""}…
          </p>
        )}
      </div>
    </div>
  );
}

/** Barres horizontales des honoraires de suivi par année (votés / potentiel) - direction. */
function BarresHonoraires({ pf }: { pf: PortefeuillePpt }) {
  const annee = anneeCourante();
  const lignes = useMemo(() => honorairesParAnnee(pf.postes.map(posteLite), pf.params, annee), [pf.postes, pf.params, annee]);
  const max = Math.max(1, ...lignes.map((l) => l.potentiel + l.acquis));
  const total = lignes.reduce((s, l) => s + l.potentiel + l.acquis, 0);
  return (
    <div className="panel" style={{ marginTop: 20 }}>
      <div className="p-head">
        <Icon name="trendingUp" size={18} />
        <h3>Honoraires de suivi de travaux projetés par année</h3>
        <span style={{ flex: 1 }}></span>
        <span style={{ fontSize: 13, color: "var(--fg-muted)" }}>
          {pf.params.taux_honoraires_pct.toLocaleString("fr-FR")} % du montant {pf.params.base_honoraires.toUpperCase()} · {fmtEur(total)} sur {lignes.length} ans
        </span>
        <button
          className="se-btn se-btn-ghost btn-sm"
          onClick={() =>
            telechargerCsv(
              `honoraires-ppt-${annee}.csv`,
              ["Année", "Postes", "Montant TTC", "Honoraires potentiels", "Honoraires acquis (votés)"],
              lignes.map((l) => [l.annee, l.nbPostes, l.montantTtc, l.potentiel, l.acquis])
            )
          }
        >
          <Icon name="download" size={13} />
          CSV
        </button>
      </div>
      <div className="p-body" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {lignes.map((l) => (
          <div key={l.annee} style={{ display: "grid", gridTemplateColumns: "54px 1fr 130px", alignItems: "center", gap: 10, fontSize: 13 }}>
            <span style={{ fontWeight: 600 }}>{l.annee}</span>
            <div style={{ display: "flex", height: 16, borderRadius: 4, overflow: "hidden", background: "var(--bg-soft)" }}>
              <div style={{ width: `${(l.acquis / max) * 100}%`, background: "var(--color-primary-700)" }} title={`Votés : ${fmtEur(l.acquis)}`}></div>
              <div style={{ width: `${(l.potentiel / max) * 100}%`, background: "var(--color-primary-500)", opacity: 0.55 }} title={`Potentiel : ${fmtEur(l.potentiel)}`}></div>
            </div>
            <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
              {l.potentiel + l.acquis ? fmtEur(l.potentiel + l.acquis) : "-"}
              {l.nbPostes ? <span style={{ color: "var(--fg-muted)" }}> · {l.nbPostes} poste{l.nbPostes > 1 ? "s" : ""}</span> : null}
            </span>
          </div>
        ))}
        <p className="se-small" style={{ color: "var(--fg-muted)", margin: "8px 0 0" }}>
          Barre foncée : postes votés (au montant voté). Barre claire : postes programmés, présentés ou à représenter, actualisés à {pf.params.inflation_pct.toLocaleString("fr-FR")} % par an depuis {annee}. Un poste rejeté compte à l'année de sa nouvelle présentation.
        </p>
      </div>
    </div>
  );
}

/** « Ce que je dois préparer » pour les prochaines AG - gestionnaire. */
function PanneauAPreparer({ pf, copros }: { pf: PortefeuillePpt; copros: PptCoproAvecStats[] }) {
  const navigate = useNavigate();
  const annee = anneeCourante();
  const preparation = useMemo(
    () => aPreparer(copros.map(coproLite), pf.postes.filter((p) => copros.some((c) => c.id === p.ppt_copro_id)).map(posteLite), pf.ags.map(agLite)),
    [copros, pf.postes, pf.ags]
  );
  return (
    <div className="panel" style={{ marginTop: 20 }}>
      <div className="p-head">
        <Icon name="clipboard" size={18} />
        <h3>À préparer pour les prochaines AG</h3>
        <span style={{ flex: 1 }}></span>
        <button className="se-btn se-btn-ghost btn-sm" onClick={() => navigate("/syndic/ppt/echeancier")}>
          Échéancier 10 ans <Icon name="arrowRight" size={13} />
        </button>
      </div>
      <div className="p-body" style={{ paddingTop: 4 }}>
        {preparation.length === 0 ? (
          <p className="se-small" style={{ color: "var(--fg-muted)", margin: 0 }}>Rien à présenter d'ici {annee + 1} - ou aucun PPT validé pour l'instant.</p>
        ) : (
          preparation.map((l) => (
            <div key={l.copro.id} style={{ padding: "10px 4px", borderBottom: "1px solid var(--border)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <b style={{ cursor: "pointer" }} onClick={() => navigate(`/syndic/ppt/copros/${l.copro.id}`)}>{l.copro.nom}</b>
                {l.prochaineAg ? <Badge kind="blue">AG le {fmtDateCourte(l.prochaineAg)}</Badge> : <Badge kind="warn" dot>aucune AG programmée</Badge>}
                <span className="spacer"></span>
                <button className="se-btn se-btn-ghost btn-sm" onClick={() => navigate(`/syndic/ppt/copros/${l.copro.id}/ag`)}>
                  <Icon name="plus" size={13} />
                  Saisir une AG
                </button>
              </div>
              <ul style={{ margin: "6px 0 0 18px", padding: 0, fontSize: 13.5, lineHeight: 1.6 }}>
                {l.postes.map((p) => (
                  <li key={p.id}>
                    {p.libelle} · {p.annee_prevue ?? "année à fixer"} · {p.cout_ht_base ? fmtEur(p.cout_ht_base) + " HT" : "non chiffré"} · art. {articleSuggere(p.priorite as PrioriteCode)} suggéré
                  </li>
                ))}
                {l.aRepresenter.map((p) => (
                  <li key={p.id} style={{ color: "var(--color-warning-700)" }}>
                    À représenter : {p.libelle} ({p.statut === "rejete" ? "rejeté" : "reporté"}, nouvelle présentation {p.annee_prochaine_presentation ?? "à fixer"})
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ========== Vue mosaïque (une carte par gestionnaire, une tuile par copropriété) ==========

function TuileCopro({ f, onOuvrir }: { f: FicheCopro; onOuvrir?: () => void }) {
  const c = f.copro;
  const sub = [c.nb_logements ? `${c.nb_logements} lgts` : null, c.etiquette_energie ? `DPE ${c.etiquette_energie}` : null, c.commune || null].filter(Boolean).join(" · ");
  return (
    <button
      type="button"
      className={"ppt-carte" + (onOuvrir ? "" : " verrou")}
      data-etat={f.etat}
      title={`${c.nom} · ${libelleEtat(f)}${f.prochaineAnnee != null ? ` · à voter en ${f.prochaineAnnee} : ${fmtEuroCourt(f.montantProchaineAnnee)}` : ""}${f.montantTtc ? ` · travaux à venir : ${fmtEuroCourt(f.montantTtc)}` : ""}${f.nbAlertes ? ` · ${f.nbAlertes} alerte${f.nbAlertes > 1 ? "s" : ""}` : ""}${onOuvrir ? "" : " · accès réservé à la direction et au gestionnaire en charge"}`}
      onClick={onOuvrir}
    >
      <span className="pc-nom">{c.nom}</span>
      {sub && <span className="pc-sub">{sub}</span>}
      <span className="pc-foot">
        <span className="dot"></span>
        <span className="pc-etat">{libelleEtat(f)}</span>
        {f.prochaineAnnee != null ? <span className="pc-annee">{f.prochaineAnnee}</span> : f.montantTtc ? <span className="pc-annee">{fmtEuroCourt(f.montantTtc)}</span> : null}
      </span>
      {f.nbAlertes > 0 && <span className={"pc-alerte" + (f.alerteHaute ? " haute" : "")}></span>}
    </button>
  );
}

function VueMosaique({ fiches, acces, direction }: { fiches: FicheCopro[]; acces: (id: string) => boolean; direction: boolean }) {
  const navigate = useNavigate();
  const groupes = useMemo(() => groupesGestionnaires(fiches), [fiches]);
  if (groupes.length === 0) {
    return (
      <div className="panel" style={{ padding: 28, textAlign: "center", color: "var(--fg-muted)", fontSize: 13.5 }}>
        Aucune copropriété ne correspond. Déposez un fichier ou importez votre portefeuille depuis « Copropriétés ».
      </div>
    );
  }
  return (
    <div>
      {groupes.map((g) => {
        const n = g.fiches.length;
        return (
          <section className="ppt-gest" key={g.key}>
            <header className="ppt-gest-head">
              <span className="ppt-gest-avatar" title={g.nom}>{g.initiales}</span>
              <div style={{ minWidth: 0 }}>
                <div className="nm">{g.nom}</div>
                <div className="sub">
                  {n} copropriété{n > 1 ? "s" : ""}
                  {g.logements ? ` · ${g.logements} logements` : ""}
                  {g.montantTtc ? ` · ${fmtEuroCourt(g.montantTtc)} de travaux à venir` : ""}
                </div>
              </div>
              <span className="spacer"></span>
              {direction && g.honoraires > 0 && (
                <div className="ppt-gest-hono" title="Honoraires de suivi de travaux : votés et potentiels">
                  <b>{fmtEuroCourt(g.honoraires)}</b>
                  <span>honoraires de suivi</span>
                </div>
              )}
            </header>
            <div className="ppt-jauge" title={ETATS_PPT.filter((e) => g.parEtat[e]).map((e) => `${g.parEtat[e]} ${ETAT_PPT_LABEL[e].toLowerCase()}`).join(" · ")}>
              {ETATS_PPT.filter((e) => g.parEtat[e]).map((e) => (
                <i key={e} data-etat={e} style={{ width: `${(g.parEtat[e] / n) * 100}%` }}></i>
              ))}
            </div>
            <div className="ppt-mosaique">
              {g.fiches.map((f) => (
                <TuileCopro key={f.copro.id} f={f} onOuvrir={acces(f.copro.id) ? () => navigate(`/syndic/ppt/copros/${f.copro.id}`) : undefined} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

// ========== Vue kanban (une colonne par état de suivi) ==========

function VueKanban({ fiches, acces, multiGest }: { fiches: FicheCopro[]; acces: (id: string) => boolean; multiGest: boolean }) {
  const navigate = useNavigate();
  const colonnes = ETATS_PPT.filter((e) => e !== "inconnu" || fiches.some((f) => f.etat === "inconnu"));
  return (
    <div className="kanban fluide ppt">
      {colonnes.map((etat) => {
        const list = fiches.filter((f) => f.etat === etat).sort((a, b) => a.copro.nom.localeCompare(b.copro.nom, "fr"));
        return (
          <section className="kcol" key={etat} data-etat={etat}>
            <div className="kcol-head">
              <span className="kdot" style={{ background: "var(--etat)" }}></span>
              <span className="ktitle">{ETAT_PPT_LABEL[etat]}</span>
              <span className="kcount">{list.length}</span>
            </div>
            <div className="kcol-body">
              {list.map((f) => {
                const c = f.copro;
                const ouvrable = acces(c.id);
                return (
                  <article
                    key={c.id}
                    className="panel"
                    style={{ padding: "12px 14px", marginBottom: 10, cursor: ouvrable ? "pointer" : "default", opacity: ouvrable ? 1 : 0.55 }}
                    title={ouvrable ? `Ouvrir ${c.nom}` : `${c.nom} - accès réservé à la direction et au gestionnaire en charge`}
                    onClick={ouvrable ? () => navigate(`/syndic/ppt/copros/${c.id}`) : undefined}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span style={{ fontWeight: 700, fontSize: 14, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.nom}</span>
                      <span style={{ flex: 1 }}></span>
                      {f.nbAlertes > 0 && (
                        <Badge kind="warn" dot>
                          {f.nbAlertes}
                        </Badge>
                      )}
                    </div>
                    <div style={{ fontSize: 12.5, color: "var(--fg-muted)", marginBottom: 6 }}>
                      {[c.commune, c.nb_logements ? `${c.nb_logements} logements` : null, multiGest ? c.gestionnaire_nom : null].filter(Boolean).join(" · ") || "-"}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 12.5 }}>
                      {c.etiquette_energie ? <DpeChip cls={c.etiquette_energie as DpeClass} size={22} /> : null}
                      {etat === "reno" && c.reno_phase ? <Badge kind="primary">{PHASES.find((p) => p.id === c.reno_phase)?.label ?? c.reno_phase}</Badge> : null}
                      <span style={{ flex: 1 }}></span>
                      {/* Prochain jalon : année + montant des seuls postes à voter cette année-là ; le
                          total du plan reste dans l'info-bulle et la vue Tableau (feedback Amir 20/09). */}
                      {f.prochaineAnnee != null ? (
                        <span
                          style={{ display: "inline-flex", alignItems: "baseline", gap: 6 }}
                          title={`À voter en ${f.prochaineAnnee} : ${fmtEuroCourt(f.montantProchaineAnnee)} · total des travaux à venir : ${fmtEuroCourt(f.montantTtc)}`}
                        >
                          <span style={{ color: "var(--fg2)", fontWeight: 600 }}>{f.prochaineAnnee}</span>
                          {f.montantProchaineAnnee > 0 && <span style={{ fontWeight: 700, color: "var(--color-primary-700)" }}>{fmtEuroCourt(f.montantProchaineAnnee)}</span>}
                        </span>
                      ) : (
                        f.montantTtc > 0 && (
                          <span style={{ fontWeight: 700, color: "var(--color-primary-700)" }} title="Total des travaux à venir">
                            {fmtEuroCourt(f.montantTtc)}
                          </span>
                        )
                      )}
                    </div>
                  </article>
                );
              })}
              {list.length === 0 && <div style={{ padding: 18, textAlign: "center", color: "var(--fg-muted)", fontSize: 13 }}>Aucun dossier</div>}
            </div>
          </section>
        );
      })}
    </div>
  );
}

// ========== Vue tableau (pilotage : comparatif par gestionnaire, copropriétés triables) ==========

type ColTri = "nom" | "gestionnaire" | "etat" | "logements" | "montant" | "honoraires" | "jalon" | "alertes";

function VueTableau({ pf, fiches, acces, multiGest }: { pf: PortefeuillePpt; fiches: FicheCopro[]; acces: (id: string) => boolean; multiGest: boolean }) {
  const navigate = useNavigate();
  const annee = anneeCourante();
  const [tri, setTri] = useState<{ col: ColTri; desc: boolean }>({ col: "nom", desc: false });
  const cliquerTri = (col: ColTri) => setTri((prev) => ({ col, desc: prev.col === col ? !prev.desc : col !== "nom" && col !== "gestionnaire" }));

  const lignes = useMemo(() => {
    const valeur = (f: FicheCopro): string | number => {
      switch (tri.col) {
        case "nom": return f.copro.nom;
        case "gestionnaire": return f.copro.gestionnaire_nom ?? "";
        case "etat": return ETATS_PPT.indexOf(f.etat);
        case "logements": return f.copro.nb_logements ?? 0;
        case "montant": return f.montantTtc;
        case "honoraires": return f.honorairesPotentiels + f.honorairesAcquis;
        case "jalon": return f.prochaineAnnee ?? 9999;
        case "alertes": return f.nbAlertes;
      }
    };
    return [...fiches].sort((a, b) => {
      const va = valeur(a);
      const vb = valeur(b);
      const cmp = typeof va === "string" ? va.localeCompare(String(vb), "fr") : Number(va) - Number(vb);
      return tri.desc ? -cmp : cmp;
    });
  }, [fiches, tri]);

  // comparatif par gestionnaire - direction seulement (un gestionnaire ne voit aucun chiffre d'un collègue)
  const stats = useMemo(
    () => (pf.direction ? statsParGestionnaire(pf.copros.map(coproLite), pf.postes.map(posteLite), pf.params, annee) : []),
    [pf.direction, pf.copros, pf.postes, pf.params, annee]
  );
  const nomsEquipes = new Set(pf.copros.map((c) => (c.gestionnaire_nom ?? "").trim().toLowerCase()).filter(Boolean));
  const nonEquipes = pf.direction ? pf.membres.filter((m) => m.org_role !== "directeur" && !nomsEquipes.has(m.nom.trim().toLowerCase())) : [];

  const Th = ({ col, label, num }: { col: ColTri; label: string; num?: boolean }) => (
    <th className={num ? "num" : undefined} style={{ cursor: "pointer", whiteSpace: "nowrap", userSelect: "none" }} title="Trier sur cette colonne" onClick={() => cliquerTri(col)}>
      {label}
      {tri.col === col && <Icon name={tri.desc ? "chevronDown" : "chevronUp"} size={12} style={{ marginLeft: 4, verticalAlign: -1 }} />}
    </th>
  );

  return (
    <>
      {pf.direction && (stats.length > 1 || nonEquipes.length > 0) && (
        <div className="panel" style={{ marginBottom: 20 }}>
          <div className="p-head">
            <Icon name="users" size={18} />
            <h3>Comparatif par gestionnaire</h3>
            <span style={{ flex: 1 }}></span>
            <button
              className="se-btn se-btn-ghost btn-sm"
              onClick={() =>
                telechargerCsv(
                  `ppt-par-gestionnaire-${annee}.csv`,
                  ["Gestionnaire", "Copros", "Logements", "Postes", "Présentés en AG", "Votés", "Taux de passage (%)", "Montant HT", "Honoraires potentiels", "Honoraires acquis", "PPT jamais présentés"],
                  [
                    ...stats.map((g) => [g.nom, g.copros, g.logements, g.postes, g.presentes, g.votes, g.tauxPassage ?? "", g.montantHt, g.honorairesPotentiels, g.honorairesAcquis, g.jamaisPresentes]),
                    ...nonEquipes.map((m) => [m.nom, 0, 0, 0, 0, 0, "", 0, 0, 0, 0]),
                  ]
                )
              }
            >
              <Icon name="download" size={13} />
              CSV
            </button>
          </div>
          <div className="p-body" style={{ paddingTop: 0 }}>
            <div className="tablewrap">
              <table className="dossiers" style={{ fontSize: 13 }}>
                <thead>
                  <tr>
                    <th>Gestionnaire</th>
                    <th className="num">Copros</th>
                    <th className="num">Logements</th>
                    <th className="num">Postes</th>
                    <th className="num">Présentés</th>
                    <th className="num">Votés</th>
                    <th className="num">Taux</th>
                    <th className="num">Honoraires</th>
                    <th className="num">Jamais présentés</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.map((g) => (
                    <tr key={g.key} onClick={() => navigate(`/syndic/ppt/copros?gest=${encodeURIComponent(g.key)}`)} title={`Copropriétés de ${g.nom}`}>
                      <td style={{ fontWeight: 600 }}>{g.nom}</td>
                      <td className="num">{g.copros}</td>
                      <td className="num">{g.logements || "-"}</td>
                      <td className="num">{g.postes || "-"}</td>
                      <td className="num">{g.presentes || "-"}</td>
                      <td className="num">{g.votes || "-"}</td>
                      <td className="num">{g.tauxPassage == null ? "-" : `${g.tauxPassage} %`}</td>
                      <td className="num" title={`potentiel ${fmtEur(g.honorairesPotentiels)} · acquis ${fmtEur(g.honorairesAcquis)}`}>
                        {g.honorairesPotentiels + g.honorairesAcquis ? fmtEuroCourt(g.honorairesPotentiels + g.honorairesAcquis) : "-"}
                      </td>
                      <td className="num">{g.jamaisPresentes ? <span style={{ color: "var(--color-error-700)", fontWeight: 700 }}>{g.jamaisPresentes}</span> : "-"}</td>
                    </tr>
                  ))}
                  {nonEquipes.map((m) => (
                    <tr key={m.user_id} style={{ cursor: "default", opacity: 0.6 }}>
                      <td style={{ fontWeight: 600 }}>
                        {m.nom} <Badge kind="neutral">non équipé - aucune copropriété</Badge>
                      </td>
                      <td className="num">0</td>
                      <td className="num" colSpan={7}>-</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="se-small" style={{ color: "var(--fg-muted)", marginTop: 12, marginBottom: 0 }}>
              Taux de passage = postes votés / postes présentés en AG. « Jamais présentés » compte les copropriétés dont le PPT validé n'a encore fait l'objet d'aucune résolution.
            </p>
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
                  <Th col="nom" label="Copropriété" />
                  {multiGest && <Th col="gestionnaire" label="Gestionnaire" />}
                  <Th col="etat" label="État" />
                  <th>DPE</th>
                  <Th col="logements" label="Logements" num />
                  <Th col="montant" label="Travaux TTC" num />
                  <Th col="honoraires" label="Honoraires" num />
                  <Th col="jalon" label="Prochain jalon" num />
                  <Th col="alertes" label="Alertes" num />
                </tr>
              </thead>
              <tbody>
                {lignes.map((f) => {
                  const c = f.copro;
                  const ouvrable = acces(c.id);
                  return (
                    <tr key={c.id} onClick={ouvrable ? () => navigate(`/syndic/ppt/copros/${c.id}`) : undefined} style={{ cursor: ouvrable ? "pointer" : "default", opacity: ouvrable ? 1 : 0.55 }}>
                      <td style={{ fontWeight: 600 }}>
                        {c.nom}
                        {c.commune && <span style={{ display: "block", fontSize: 11.5, color: "var(--fg-muted)", fontWeight: 400 }}>{c.commune}</span>}
                      </td>
                      {multiGest && <td>{c.gestionnaire_nom || <span style={{ color: "var(--fg-muted)" }}>Non attribué</span>}</td>}
                      <td>
                        <span className="leg-g" data-etat={f.etat} style={{ whiteSpace: "nowrap" }}>
                          <span className="dot" style={{ background: "var(--etat)" }}></span>
                          {libelleEtat(f)}
                        </span>
                      </td>
                      <td>{c.etiquette_energie ? <DpeChip cls={c.etiquette_energie as DpeClass} /> : "-"}</td>
                      <td className="num">{c.nb_logements ?? "-"}</td>
                      <td className="num">{f.montantTtc ? fmtEuroCourt(f.montantTtc) : "-"}</td>
                      <td className="num" title={`potentiel ${fmtEur(f.honorairesPotentiels)} · acquis ${fmtEur(f.honorairesAcquis)}`}>
                        {f.honorairesPotentiels + f.honorairesAcquis ? fmtEuroCourt(f.honorairesPotentiels + f.honorairesAcquis) : "-"}
                      </td>
                      <td className="num">
                        {f.prochaineAnnee ?? "-"}
                        {f.prochaineAnnee != null && f.montantProchaineAnnee > 0 && (
                          <span style={{ display: "block", fontSize: 11.5, color: "var(--fg-muted)", fontWeight: 400, whiteSpace: "nowrap" }} title="Montant des postes à voter à ce jalon">
                            à voter : {fmtEuroCourt(f.montantProchaineAnnee)}
                          </span>
                        )}
                      </td>
                      <td className="num">{f.nbAlertes ? <span style={{ color: f.alerteHaute ? "var(--color-error-700)" : "var(--color-warning-700)", fontWeight: 700 }}>{f.nbAlertes}</span> : "-"}</td>
                    </tr>
                  );
                })}
                {lignes.length === 0 && (
                  <tr>
                    <td colSpan={multiGest ? 9 : 8} style={{ color: "var(--fg-muted)" }}>Aucune copropriété ne correspond.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="se-small" style={{ color: "var(--fg-muted)", marginTop: 12, marginBottom: 0 }}>
            Travaux TTC : postes du plan encore à venir, actualisés à l'année où ils passeront en AG (montant voté s'il existe). Honoraires : suivi de travaux au taux de l'enseigne, votés et potentiels. Prochain jalon : première année où un poste doit être présenté.
          </p>
        </div>
      </div>
    </>
  );
}

// ========== Page ==========

export function PortefeuillePptVue({ pf }: { pf: PortefeuillePpt }) {
  const annee = anneeCourante();
  const [recherche, setRecherche] = useState("");
  const [etatFiltre, setEtatFiltre] = useState<EtatPpt | null>(null);
  // la vue choisie survit à l'ouverture d'un dossier (retour cohérent)
  const [vue, setVueBrut] = useState<Vue>(() => {
    try {
      const v = sessionStorage.getItem(CLE_VUE);
      return v === "kanban" || v === "tableau" ? v : "mosaique";
    } catch {
      return "mosaique";
    }
  });
  const setVue = (v: Vue) => {
    setVueBrut(v);
    try {
      sessionStorage.setItem(CLE_VUE, v);
    } catch {
      /* stockage indisponible */
    }
  };

  // périmètre : toute l'enseigne pour la direction et l'aperçu AMO, ses seuls dossiers pour un gestionnaire
  const copros = pf.direction ? pf.copros : pf.accessibles;
  const entrees = useMemo(() => copros.map(coproEtat), [copros]);
  const postes = useMemo(() => pf.postes.filter((p) => copros.some((c) => c.id === p.ppt_copro_id)).map(posteLite), [pf.postes, copros]);
  const rapports = useMemo(() => pf.rapports.map(rapportLite), [pf.rapports]);
  const ags = useMemo(() => pf.ags.map(agLite), [pf.ags]);
  const listeAlertes = useMemo(() => alertes(entrees, postes, ags, rapports), [entrees, postes, ags, rapports]);
  const fiches = useMemo(() => fichesCopros(entrees, postes, rapports, listeAlertes, pf.params, annee), [entrees, postes, rapports, listeAlertes, pf.params, annee]);
  const acces = (id: string) => copros.find((c) => c.id === id)?.acces ?? false;

  const q = normaliser(recherche.trim());
  const filtrees = fiches.filter(
    (f) =>
      (!etatFiltre || f.etat === etatFiltre) &&
      (!q || normaliser(f.copro.nom).includes(q) || normaliser(f.copro.commune ?? "").includes(q) || normaliser(f.copro.gestionnaire_nom ?? "").includes(q))
  );

  const parEtat = ETATS_PPT.map((e) => ({ etat: e, n: fiches.filter((f) => f.etat === e).length }));
  const gestionnaires = new Set(fiches.map((f) => cleGestionnaire(f.copro))).size;
  const multiGest = gestionnaires > 1;
  const logements = fiches.reduce((s, f) => s + (f.copro.nb_logements ?? 0), 0);
  const honoraires = fiches.reduce((s, f) => s + f.honorairesPotentiels + f.honorairesAcquis, 0);
  const honorairesAcquis = fiches.reduce((s, f) => s + f.honorairesAcquis, 0);
  const remarquesOuvertes = copros.reduce((s, c) => s + (c.stats?.remarques_ouvertes ?? 0), 0);

  const exporter = () =>
    telechargerCsv(
      `portefeuille-ppt-${annee}.csv`,
      ["Copropriété", "Commune", "Gestionnaire", "État", "DPE", "Logements", "Postes", "Travaux TTC à venir", "Honoraires potentiels", "Honoraires acquis", "Prochain jalon", "À voter au prochain jalon", "Alertes"],
      [...filtrees]
        .sort((a, b) => a.copro.nom.localeCompare(b.copro.nom, "fr"))
        .map((f) => [
          f.copro.nom,
          f.copro.commune ?? "",
          f.copro.gestionnaire_nom ?? "",
          libelleEtat(f),
          f.copro.etiquette_energie ?? "",
          f.copro.nb_logements ?? "",
          f.nbPostes,
          f.montantTtc,
          f.honorairesPotentiels,
          f.honorairesAcquis,
          f.prochaineAnnee ?? "",
          f.prochaineAnnee != null ? f.montantProchaineAnnee : "",
          f.nbAlertes,
        ])
    );

  return (
    <div className="page syndic-dash fade" style={{ padding: 0 }}>
      <div className="page-head">
        <div>
          <h1 className="page-title">
            {pf.direction ? "Suivi des PPT" : "Mes PPT"}
            {pf.nomEnseigne && <span className="page-title-org"> - {pf.nomEnseigne}</span>}
          </h1>
          <p className="page-sub">
            {fiches.length} copropriété{fiches.length > 1 ? "s" : ""} · {logements} logements
            {pf.direction && <> · {gestionnaires} gestionnaire{gestionnaires > 1 ? "s" : ""}</>}
            {honoraires > 0 && (
              <>
                {" "}· {fmtEuroCourt(honoraires)} d'honoraires de suivi{honorairesAcquis > 0 ? ` (dont ${fmtEuroCourt(honorairesAcquis)} votés)` : ""}
              </>
            )}
          </p>
        </div>
        <span className="spacer"></span>
        <div className="opt-mini">
          <button className={vue === "mosaique" ? "on" : ""} onClick={() => setVue("mosaique")} title="Une carte par gestionnaire, une tuile par copropriété">
            <Icon name="grid" size={14} /> Mosaïque
          </button>
          <button className={vue === "kanban" ? "on" : ""} onClick={() => setVue("kanban")} title="Une colonne par état : à qualifier, en analyse, à présenter, présenté, voté, en rénovation">
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
          <input placeholder={pf.direction ? "Rechercher un gestionnaire, une copropriété…" : "Rechercher une copropriété…"} value={recherche} onChange={(e) => setRecherche(e.target.value)} />
          {recherche && (
            <button className="icon-btn" style={{ width: 22, height: 22, flex: "none" }} title="Effacer la recherche" onClick={() => setRecherche("")}>
              <Icon name="x" size={13} />
            </button>
          )}
        </div>
      </div>

      {/* légende des états - cliquable pour filtrer */}
      <div className="ppt-legende" role="group" aria-label="Filtrer par état de suivi">
        {parEtat.map(({ etat, n }) => (
          <button
            key={etat}
            type="button"
            data-etat={etat}
            className={(etatFiltre === etat ? "on" : "") + (n === 0 ? " vide" : "")}
            title={etatFiltre === etat ? "Retirer le filtre" : `Ne montrer que : ${ETAT_PPT_LABEL[etat].toLowerCase()}`}
            onClick={() => setEtatFiltre(etatFiltre === etat ? null : etat)}
          >
            <span className="dot"></span>
            {ETAT_PPT_LABEL[etat]}
            <span className="n">{n}</span>
          </button>
        ))}
        {(etatFiltre || q) && (
          <span className="se-small" style={{ alignSelf: "center", color: "var(--fg-muted)" }}>
            {filtrees.length} sur {fiches.length}
          </span>
        )}
      </div>

      {vue === "tableau" ? (
        <VueTableau pf={pf} fiches={filtrees} acces={acces} multiGest={multiGest} />
      ) : vue === "kanban" ? (
        <VueKanban fiches={filtrees} acces={acces} multiGest={multiGest} />
      ) : (
        <VueMosaique fiches={filtrees} acces={acces} direction={pf.direction} />
      )}

      {/* Honoraires projetés : pas en mosaïque, où chaque carte de gestionnaire porte déjà
          son total d'honoraires de suivi (feedback Amir 20/09 : le tableau était repris
          à l'identique dans les trois vues). */}
      {pf.direction ? vue !== "mosaique" && <BarresHonoraires pf={pf} /> : <PanneauAPreparer pf={pf} copros={copros} />}

      {!pf.direction && remarquesOuvertes > 0 && (
        <div className="panel" style={{ marginTop: 20, display: "flex", alignItems: "center", gap: 12, padding: "12px 18px" }}>
          <Icon name="alert" size={18} style={{ color: "var(--color-warning-700)" }} />
          <span style={{ fontSize: 13.5 }}>
            <b>{remarquesOuvertes} remarque{remarquesOuvertes > 1 ? "s" : ""}</b> de Strat Eco sur vos rapports restent à traiter (incohérences du PPPT d'origine, pièces manquantes) - onglet Remarques de chaque copropriété.
          </span>
        </div>
      )}

      <ListeAlertes liste={listeAlertes} titre={pf.direction ? "Alertes" : "Points de vigilance"} />
    </div>
  );
}

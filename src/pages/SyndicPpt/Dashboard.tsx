// Tableaux de bord de la branche PPT.
//   • Dirigeant (direction de l'enseigne, aperçu AMO) : stock de PPT, honoraires
//     de suivi projetés par année, comparatif par gestionnaire (avec les
//     gestionnaires non équipés : un déploiement partiel se voit), alertes.
//   • Gestionnaire : ce qu'il doit préparer pour ses prochaines AG, son
//     échéancier, ses remarques - aucun chiffre d'un collègue, aucun classement.
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui";
import { telechargerCsv } from "@/lib/csv";
import { fmtEuroCourt } from "@/lib/format";
import {
  aPreparer,
  alertes,
  cleGestionnaire,
  echeancier,
  honorairesParAnnee,
  statsParGestionnaire,
  totauxPortefeuille,
  type Alerte,
} from "@/lib/ppt/indicateurs";
import { articleSuggere } from "@/lib/ppt/referentiels";
import { agLite, anneeCourante, coproLite, fmtDateCourte, fmtEur, posteLite, rapportLite, Tuile, type PrioriteCode } from "./commun";
import type { PortefeuillePpt } from "./index";

const NIVEAU_COULEUR: Record<Alerte["niveau"], string> = {
  haute: "var(--color-error-700)",
  moyenne: "var(--color-warning-700)",
  basse: "var(--fg-muted)",
};

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

/** Barres horizontales des honoraires par année (potentiel / acquis). */
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

export function DashboardDirigeant({ pf }: { pf: PortefeuillePpt }) {
  const navigate = useNavigate();
  const annee = anneeCourante();
  const copros = pf.copros.map(coproLite);
  const postes = pf.postes.map(posteLite);
  const rapports = pf.rapports.map(rapportLite);
  const totaux = useMemo(() => totauxPortefeuille(copros, postes, rapports, pf.params, annee), [copros, postes, rapports, pf.params, annee]);
  const stats = useMemo(() => statsParGestionnaire(copros, postes, pf.params, annee), [copros, postes, pf.params, annee]);
  const liste = useMemo(() => alertes(copros, postes, pf.ags.map(agLite), rapports), [copros, postes, pf.ags, rapports]);

  // gestionnaires de l'enseigne sans aucune copro PPT : le déploiement partiel se voit
  const clesEquipees = new Set(copros.map(cleGestionnaire));
  const nomsEquipes = new Set(copros.map((c) => (c.gestionnaire_nom ?? "").trim().toLowerCase()).filter(Boolean));
  const gestionnaires = pf.membres.filter((m) => m.org_role !== "directeur");
  const nonEquipes = gestionnaires.filter((m) => !nomsEquipes.has(m.nom.trim().toLowerCase()));
  const actifs = gestionnaires.length - nonEquipes.length;

  return (
    <div className="page fade" style={{ padding: 0 }}>
      <h1 className="sec-title">Suivi des PPT{pf.nomEnseigne ? ` - ${pf.nomEnseigne}` : ""}</h1>
      <p className="sec-sub">Vue direction : stock de plans pluriannuels, potentiel d'honoraires de suivi de travaux, activité par gestionnaire.</p>

      <div className="tiles tiles-4">
        <Tuile label="PPT suivis" valeur={String(totaux.copros)} pied={`${totaux.validees} validé${totaux.validees > 1 ? "s" : ""} · ${totaux.enAttente} en attente d'analyse · ${totaux.logements} logements`} />
        <Tuile
          label="Gestionnaires actifs"
          valeur={gestionnaires.length ? `${actifs} / ${gestionnaires.length}` : String(clesEquipees.size)}
          pied={nonEquipes.length ? `${nonEquipes.length} sans aucun PPT déposé` : "toute l'équipe a déposé au moins un PPT"}
        />
        <Tuile label="Travaux programmés" valeur={fmtEuroCourt(totaux.montantTtc)} pied={`${totaux.postes} postes TTC actualisés sur 10 ans`} />
        <Tuile label="Honoraires de suivi" valeur={fmtEuroCourt(totaux.honorairesPotentiels + totaux.honorairesAcquis)} pied={`dont ${fmtEur(totaux.honorairesAcquis)} déjà votés · taux ${pf.params.taux_honoraires_pct.toLocaleString("fr-FR")} %`} accent />
      </div>

      <BarresHonoraires pf={pf} />

      <div className="panel" style={{ marginTop: 20 }}>
        <div className="p-head">
          <Icon name="users" size={18} />
          <h3>Par gestionnaire</h3>
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
                  <tr key={g.key} onClick={() => navigate(`/syndic/ppt/copros?gest=${encodeURIComponent(g.key)}`)}>
                    <td style={{ fontWeight: 600 }}>{g.nom}</td>
                    <td className="num">{g.copros}</td>
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
                      {m.nom} <Badge kind="neutral">non équipé - aucun PPT déposé</Badge>
                    </td>
                    <td className="num">0</td>
                    <td className="num" colSpan={6}>-</td>
                  </tr>
                ))}
                {stats.length === 0 && nonEquipes.length === 0 && (
                  <tr>
                    <td colSpan={8} style={{ color: "var(--fg-muted)" }}>Aucune copropriété PPT pour l'instant - déposez un premier fichier depuis « Copropriétés ».</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="se-small" style={{ color: "var(--fg-muted)", marginTop: 12, marginBottom: 0 }}>
            Taux de passage = postes votés / postes présentés en AG. « Jamais présentés » compte les copropriétés dont le PPT validé n'a encore fait l'objet d'aucune résolution.
          </p>
        </div>
      </div>

      <ListeAlertes liste={liste} titre="Alertes" />
    </div>
  );
}

export function DashboardGestionnaire({ pf }: { pf: PortefeuillePpt }) {
  const navigate = useNavigate();
  const annee = anneeCourante();
  const copros = pf.accessibles.map(coproLite);
  const postes = pf.postes.filter((p) => pf.accessibles.some((c) => c.id === p.ppt_copro_id)).map(posteLite);
  const ags = pf.ags.map(agLite);
  const rapports = pf.rapports.map(rapportLite);
  const preparation = useMemo(() => aPreparer(copros, postes, ags), [copros, postes, ags]);
  const ech = useMemo(() => echeancier(copros, postes, pf.params, annee, 4), [copros, postes, pf.params, annee]);
  const liste = useMemo(() => alertes(copros, postes, ags, rapports), [copros, postes, ags, rapports]);
  const annees = [annee, annee + 1, annee + 2, annee + 3, annee + 4];
  const remarquesOuvertes = pf.accessibles.reduce((s, c) => s + (c.stats?.remarques_ouvertes ?? 0), 0);

  return (
    <div className="page fade" style={{ padding: 0 }}>
      <h1 className="sec-title">Mes PPT</h1>
      <p className="sec-sub">
        {copros.length} copropriété{copros.length > 1 ? "s" : ""} avec un plan pluriannuel suivi{pf.nomEnseigne ? ` · ${pf.nomEnseigne}` : ""}. Ce que vous devez préparer, votre échéancier, les remarques sur vos rapports.
      </p>

      <div className="panel">
        <div className="p-head">
          <Icon name="clipboard" size={18} />
          <h3>À préparer pour les prochaines AG</h3>
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

      <div className="panel" style={{ marginTop: 20 }}>
        <div className="p-head">
          <Icon name="calendar" size={18} />
          <h3>Échéancier de mes copropriétés</h3>
          <span style={{ flex: 1 }}></span>
          <button className="se-btn se-btn-ghost btn-sm" onClick={() => navigate("/syndic/ppt/echeancier")}>
            10 ans <Icon name="arrowRight" size={13} />
          </button>
        </div>
        <div className="p-body" style={{ paddingTop: 0 }}>
          <div className="tablewrap">
            <table className="dossiers" style={{ fontSize: 13 }}>
              <thead>
                <tr>
                  <th>Copropriété</th>
                  {annees.map((a) => (
                    <th key={a} className="num">{a}</th>
                  ))}
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {ech.map((l) => (
                  <tr key={l.copro.id} onClick={() => navigate(`/syndic/ppt/copros/${l.copro.id}`)}>
                    <td style={{ fontWeight: 600 }}>
                      {l.copro.nom}
                      <span style={{ display: "block", fontSize: 11.5, color: "var(--fg-muted)", fontWeight: 400 }}>
                        {l.copro.nb_logements ? `${l.copro.nb_logements} logts` : ""}{l.copro.etiquette_energie ? ` · DPE ${l.copro.etiquette_energie}` : ""}
                      </span>
                    </td>
                    {annees.map((a) => (
                      <td key={a} className="num">{l.parAnnee.get(a) ? fmtEuroCourt(l.parAnnee.get(a)) : "-"}</td>
                    ))}
                    <td className="num" style={{ fontWeight: 600 }}>{l.total ? fmtEuroCourt(l.total) : "-"}</td>
                  </tr>
                ))}
                {ech.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ color: "var(--fg-muted)" }}>Aucune copropriété rattachée à votre compte dans cette branche.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {remarquesOuvertes > 0 && (
        <div className="panel" style={{ marginTop: 20, display: "flex", alignItems: "center", gap: 12, padding: "12px 18px" }}>
          <Icon name="alert" size={18} style={{ color: "var(--color-warning-700)" }} />
          <span style={{ fontSize: 13.5 }}>
            <b>{remarquesOuvertes} remarque{remarquesOuvertes > 1 ? "s" : ""}</b> de Strat Eco sur vos rapports restent à traiter (incohérences du PPPT d'origine, pièces manquantes) - onglet Remarques de chaque copropriété.
          </span>
        </div>
      )}

      <ListeAlertes liste={liste} titre="Points de vigilance" />
    </div>
  );
}

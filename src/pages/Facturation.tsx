// « Facturation » (espace AMO) - demande d'Amir 28/09/2026.
//
// Suivi des honoraires AMO par jalon, repris du classeur Notion « AMO COPRO »
// pour les copropriétés présentes dans le logiciel (0111). Visuels retenus sur
// maquette : synthèse du portefeuille, frise des jalons dossier par dossier et
// paiements à relancer pour tous les AMO ; répartition par chef de projet pour
// le dirigeant seul. Le bloc « Honoraires » de l'onglet Projet reprend la même
// lecture pour un dossier. Lecture seule : la facturation directe depuis le
// logiciel viendra ensuite.
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "@/components/Icon";
import { Badge, type BadgeKind } from "@/components/ui";
import { useAuth } from "@/auth/AuthProvider";
import { useCopros, type CoproWithStats } from "@/api/copros";
import { useHonoraires } from "@/api/honoraires";
import { telechargerCsv } from "@/lib/csv";
import { fmtEuro, normaliserRecherche } from "@/lib/format";
import { fmtKEur } from "@/lib/ppt/formats";
import { PHASES, type PhaseId } from "@/lib/referentiels";
import { COULEUR_ETAT, FriseJalons, JaugeHonoraires, LegendeFacturation, dateCourte } from "@/components/HonorairesVisuels";
import {
  GROUPES_JALONS,
  JALONS_HONORAIRES,
  LIBELLE_ETAT,
  TRANCHES_ANCIENNETE,
  enSommeil,
  graduations,
  jalonsEnAttente,
  joursDepuis,
  libelleAnciennete,
  libelleJalon,
  pasAxeEuros,
  pourcent,
  sommesDossier,
  sommesPortefeuille,
  trancheAnciennete,
  type DossierHonoraires,
  type SommesHonoraires,
  type TrancheAnciennete,
} from "@/lib/facturation";

// ---------- repères ----------

const COULEUR_TRANCHE: Record<TrancheAnciennete["id"], string> = {
  moins30: "#F8C868",
  de30a90: "var(--color-warning-500)",
  de90a180: "var(--color-warning-700)",
  plus180: "var(--color-error-700)",
};

const BADGE_PHASE: Record<PhaseId, BadgeKind> = { diagnostic: "neutral", etudes: "blue", travaux: "primary" };
const libellePhase = (p: PhaseId) => PHASES.find((x) => x.id === p)?.label ?? p;

const axe = (v: number) => (v === 0 ? "0" : fmtKEur(v));
const plur = (n: number, s: string, p = s + "s") => `${n} ${n > 1 ? p : s}`;

// ---------- page ----------

interface Ligne {
  copro: CoproWithStats;
  d: DossierHonoraires;
  s: SommesHonoraires;
  jours: number | null;
  sommeil: boolean;
  chef: string;
}

const NON_ATTRIBUE = "Non attribué";

export default function Facturation() {
  const { profile } = useAuth();
  const { data: copros, isLoading: l1 } = useCopros();
  const { data: honoraires, isLoading: l2, error } = useHonoraires();

  const lignes = useMemo<Ligne[]>(() => {
    if (!copros || !honoraires) return [];
    const auj = new Date();
    const out: Ligne[] = [];
    for (const copro of copros) {
      const d = honoraires.get(copro.id);
      if (!d) continue;
      out.push({
        copro,
        d,
        s: sommesDossier(d),
        jours: joursDepuis(d.derniereFacture),
        sommeil: enSommeil(d, auj),
        chef: copro.chef_projet?.trim() || NON_ATTRIBUE,
      });
    }
    return out;
  }, [copros, honoraires]);

  const source = lignes.find((l) => l.d.source)?.d.source;

  return (
    <div className="page fade">
      <div className="page-head">
        <div>
          <h1 className="page-title">Facturation</h1>
          <p className="page-sub">
            Honoraires AMO par jalon, montants HT
            {lignes.length > 0 && ` - ${plur(lignes.length, "dossier")}`}
            {source && ` - ${source}`}
          </p>
        </div>
        <span style={{ flex: 1 }}></span>
        <LegendeFacturation />
      </div>

      {l1 || l2 ? (
        <p className="se-body" style={{ color: "var(--fg-muted)" }}>Chargement…</p>
      ) : error ? (
        <p className="se-body" style={{ color: "var(--color-error-700)" }}>Les honoraires n'ont pas pu être chargés. Rechargez la page.</p>
      ) : lignes.length === 0 ? (
        <div className="placeholder-screen" style={{ minHeight: 300 }}>
          <div className="ps-ico"><Icon name="euro" size={30} /></div>
          <h2>Aucun honoraire importé</h2>
          <p>Les montants et l'état des jalons arrivent avec l'import du suivi de facturation Notion.</p>
        </div>
      ) : (
        <div className="fact-page">
          <Synthese lignes={lignes} />
          <Frise lignes={lignes} />
          <Relances lignes={lignes} />
          {profile?.dirigeant && <ParChefProjet lignes={lignes} />}
        </div>
      )}
    </div>
  );
}

// ---------- A. Synthèse du portefeuille ----------

function Synthese({ lignes }: { lignes: Ligne[] }) {
  const t = sommesPortefeuille(lignes.map((l) => l.d));
  const nAttente = lignes.filter((l) => l.s.enAttente > 0).length;
  const { ticks } = graduations(t.contrat, pasAxeEuros(t.contrat));
  const tuiles: { label: string; valeur: number; pied: string; couleur?: string }[] = [
    { label: "Honoraires des contrats", valeur: t.contrat, pied: `${plur(lignes.length, "dossier")}, 8 jalons chacun` },
    { label: "Encaissé", valeur: t.encaisse, pied: `${pourcent(t.encaisse, t.contrat)} % du contrat`, couleur: COULEUR_ETAT.encaisse },
    { label: "En attente de paiement", valeur: t.enAttente, pied: `${plur(nAttente, "dossier")} à relancer`, couleur: COULEUR_ETAT.facture },
    { label: "Reste à facturer", valeur: t.resteAFacturer, pied: `${pourcent(t.resteAFacturer, t.contrat)} % du contrat`, couleur: COULEUR_ETAT.a_facturer },
  ];
  return (
    <section className="panel">
      <div className="p-body">
        <div className="fact-tuiles">
          {tuiles.map((x) => (
            <div key={x.label} className="fact-tuile">
              <div className="ft-label">
                {x.couleur && <i className="fact-sw" style={{ background: x.couleur }}></i>}
                {x.label}
              </div>
              <div className="ft-val">{fmtEuro(x.valeur)}</div>
              <div className="ft-pied">{x.pied}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 20 }}>
          <JaugeHonoraires s={t} />
          <div className="fact-axe">
            {ticks
              .filter((v) => v < t.contrat)
              .map((v) => (
                <span key={v} className={v === 0 ? "premier" : ""} style={{ left: `${(v / t.contrat) * 100}%` }}>
                  {axe(v)}
                </span>
              ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------- C. Frise des jalons ----------

type Filtre = "tous" | "attente" | "sommeil";
type Tri = "reste" | "attente" | "date" | "nom";

function Frise({ lignes }: { lignes: Ligne[] }) {
  const navigate = useNavigate();
  const [filtre, setFiltre] = useState<Filtre>("tous");
  const [chef, setChef] = useState("");
  const [tri, setTri] = useState<Tri>("reste");
  const [q, setQ] = useState("");

  const chefs = useMemo(() => [...new Set(lignes.map((l) => l.chef))].sort((a, b) => a.localeCompare(b, "fr")), [lignes]);
  const nAttente = lignes.filter((l) => l.s.enAttente > 0).length;
  const nSommeil = lignes.filter((l) => l.sommeil).length;

  const visibles = useMemo(() => {
    const nq = normaliserRecherche(q.trim());
    const out = lignes.filter(
      (l) =>
        (filtre === "tous" || (filtre === "attente" && l.s.enAttente > 0) || (filtre === "sommeil" && l.sommeil)) &&
        (!chef || l.chef === chef) &&
        (!nq || normaliserRecherche(`${l.copro.name} ${l.copro.syndic_name ?? ""}`).includes(nq))
    );
    const cmp: Record<Tri, (a: Ligne, b: Ligne) => number> = {
      reste: (a, b) => b.s.resteAFacturer - a.s.resteAFacturer,
      attente: (a, b) => b.s.enAttente - a.s.enAttente || b.s.resteAFacturer - a.s.resteAFacturer,
      date: (a, b) => (a.d.derniereFacture ?? "9999").localeCompare(b.d.derniereFacture ?? "9999"),
      nom: (a, b) => a.copro.name.localeCompare(b.copro.name, "fr"),
    };
    return out.sort(cmp[tri]);
  }, [lignes, filtre, chef, tri, q]);

  const total = sommesPortefeuille(visibles.map((l) => l.d));

  const exporter = () => {
    const num = (v: number | null) => (v == null ? "" : v.toFixed(2).replace(".", ","));
    telechargerCsv(
      `facturation-jalons-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        "Copropriété", "Syndic", "Chef de projet", "Phase",
        ...JALONS_HONORAIRES.flatMap((j) => [`${j.label} montant HT`, `${j.label} état`]),
        "Contrat HT", "Encaissé", "En attente", "Reste à facturer", "Dernière facture",
      ],
      visibles.map((l) => [
        l.copro.name, l.copro.syndic_name ?? "", l.chef, libellePhase(l.copro.phase),
        ...l.d.jalons.flatMap((j) => [num(j.montant), j.montant ? LIBELLE_ETAT[j.etat] : ""]),
        num(l.s.contrat), num(l.s.encaisse), num(l.s.enAttente), num(l.s.resteAFacturer), dateCourte(l.d.derniereFacture),
      ])
    );
  };

  return (
    <section className="panel">
      <div className="p-head">
        <h3>Frise des jalons</h3>
        <span style={{ fontSize: 12.5, color: "var(--fg-muted)" }}>Survolez une case pour le montant et l'état du jalon</span>
        <span style={{ flex: 1 }}></span>
        <button className="se-btn se-btn-secondary btn-sm" onClick={exporter} disabled={visibles.length === 0}>
          <Icon name="download" size={14} /> Exporter
        </button>
      </div>
      <div className="p-body">
        <div className="toolbar fact-toolbar">
          <label className="search" style={{ marginLeft: 0 }}>
            <Icon name="search" size={15} />
            <input id="fact-recherche" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Copropriété ou syndic" aria-label="Rechercher une copropriété ou un syndic" />
          </label>
          <div className="seg" role="group" aria-label="Filtre">
            <button className={filtre === "tous" ? "on" : ""} onClick={() => setFiltre("tous")}>Tous · {lignes.length}</button>
            <button className={filtre === "attente" ? "on" : ""} onClick={() => setFiltre("attente")} title="Facture émise, paiement pas encore reçu">
              En attente de paiement · {nAttente}
            </button>
            <button className={filtre === "sommeil" ? "on" : ""} onClick={() => setFiltre("sommeil")} title="Du reste à facturer et aucune facture depuis plus d'un an">
              Sans facture depuis un an · {nSommeil}
            </button>
          </div>
          <select id="fact-chef" className="chip-filter" value={chef} onChange={(e) => setChef(e.target.value)} style={{ cursor: "pointer" }}>
            <option value="">Chef de projet : tous</option>
            {chefs.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <select id="fact-tri" className="chip-filter" value={tri} onChange={(e) => setTri(e.target.value as Tri)} style={{ cursor: "pointer" }}>
            <option value="reste">Tri : reste à facturer</option>
            <option value="attente">Tri : en attente</option>
            <option value="date">Tri : plus ancienne facture</option>
            <option value="nom">Tri : nom</option>
          </select>
        </div>

        <div className="tablewrap fact-tablewrap">
          <table className="dossiers fact-table">
            <thead>
              <tr>
                <th>Copropriété</th>
                <th>Phase</th>
                <th>
                  <span className="fact-frise-tete">
                    {GROUPES_JALONS.map((g) => (
                      <span key={g.id} style={{ width: g.codes.length * 22 + (g.codes.length - 1) * 3 }}>{g.court}</span>
                    ))}
                  </span>
                </th>
                <th className="r">Contrat HT</th>
                <th className="r">Encaissé</th>
                <th className="r">En attente</th>
                <th className="r">Reste à facturer</th>
                <th>Dernière facture</th>
              </tr>
            </thead>
            <tbody>
              {visibles.length === 0 ? (
                <tr style={{ cursor: "default" }}>
                  <td colSpan={8} style={{ padding: 28, textAlign: "center", color: "var(--fg-muted)" }}>Aucun dossier ne correspond à ces filtres.</td>
                </tr>
              ) : (
                visibles.map((l) => (
                  <tr key={l.copro.id} onClick={() => navigate(`/copros/${l.copro.id}/projet`)}>
                    <td>
                      <div className="fact-nom">{l.copro.name}</div>
                      <div className="fact-meta">{l.copro.syndic_name?.trim() || "-"} · {l.chef}</div>
                    </td>
                    <td><Badge kind={BADGE_PHASE[l.copro.phase]}>{libellePhase(l.copro.phase)}</Badge></td>
                    <td><FriseJalons d={l.d} copro={l.copro.name} /></td>
                    <td className="r">{fmtEuro(l.s.contrat)}</td>
                    <td className="r">
                      {fmtEuro(l.s.encaisse)}
                      <span className="fact-pc">{pourcent(l.s.encaisse, l.s.contrat)} %</span>
                    </td>
                    <td className="r">
                      {l.s.enAttente > 0 ? <span className="fact-attente">{fmtEuro(l.s.enAttente)}</span> : <span className="fact-nul">-</span>}
                    </td>
                    <td className="r fact-fort">{l.s.resteAFacturer > 0 ? fmtEuro(l.s.resteAFacturer) : <span className="fact-solde">Soldé</span>}</td>
                    <td>
                      <span className={l.sommeil ? "fact-ancien" : ""}>{dateCourte(l.d.derniereFacture)}</span>
                      <div className="fact-meta">{libelleAnciennete(l.jours)}</div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3}>Total des {plur(visibles.length, "dossier affiché", "dossiers affichés")}</td>
                <td className="r">{fmtEuro(total.contrat)}</td>
                <td className="r">{fmtEuro(total.encaisse)}</td>
                <td className="r">{fmtEuro(total.enAttente)}</td>
                <td className="r">{fmtEuro(total.resteAFacturer)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </section>
  );
}

// ---------- D. Paiements à relancer ----------

function Relances({ lignes }: { lignes: Ligne[] }) {
  const navigate = useNavigate();
  const enAttente = lignes.filter((l) => l.s.enAttente > 0);
  const tranches = TRANCHES_ANCIENNETE.map((t) => {
    const items = enAttente.filter((l) => trancheAnciennete(l.jours).id === t.id);
    return { t, items, v: items.reduce((x, l) => x + l.s.enAttente, 0) };
  });
  const max = Math.max(0, ...tranches.map((x) => x.v));
  const rang = (l: Ligne) => TRANCHES_ANCIENNETE.findIndex((t) => t.id === trancheAnciennete(l.jours).id);
  const liste = [...enAttente].sort((a, b) => rang(b) - rang(a) || b.s.enAttente - a.s.enAttente);
  const total = enAttente.reduce((x, l) => x + l.s.enAttente, 0);

  return (
    <section className="panel">
      <div className="p-head">
        <h3>Paiements à relancer</h3>
        {enAttente.length > 0 && <Badge kind="warn">{plur(enAttente.length, "dossier")}</Badge>}
      </div>
      <div className="p-body">
        {enAttente.length === 0 ? (
          <p className="se-small" style={{ margin: 0 }}>Aucune facture en attente de paiement.</p>
        ) : (
          <div className="fact-relances">
            <div>
              <div className="fact-sous-titre">Ancienneté des impayés</div>
              <div className="fact-ages">
                {tranches.map(({ t, items, v }) => (
                  <div key={t.id} className="fact-age">
                    <div className="fa-haut">
                      <span>
                        {t.label} <span style={{ color: "var(--fg-muted)" }}>· {plur(items.length, "dossier")}</span>
                      </span>
                      <b>{fmtEuro(v)}</b>
                    </div>
                    <div className="fa-barre">
                      <i style={{ width: `${max > 0 ? (v / max) * 100 : 0}%`, background: COULEUR_TRANCHE[t.id] }}></i>
                    </div>
                  </div>
                ))}
              </div>
              <div className="fact-age-total">
                <span>Total en attente</span>
                <b>{fmtEuro(total)}</b>
              </div>
            </div>
            <div>
              <div className="fact-sous-titre">Dossiers concernés</div>
              <div className="fact-rl-liste">
                {liste.map((l) => (
                  <button key={l.copro.id} className="fact-rl" onClick={() => navigate(`/copros/${l.copro.id}/projet`)}>
                    <i className="sev" style={{ background: COULEUR_TRANCHE[trancheAnciennete(l.jours).id] }}></i>
                    <span className="rl-main">
                      <span className="fact-nom">{l.copro.name}</span>
                      <span className="fact-meta">{l.copro.syndic_name?.trim() || "-"} · {l.chef}</span>
                      <span className="fact-chips">
                        {jalonsEnAttente(l.d).map((j) => (
                          <span key={j.code} className="fact-chip">
                            <b>{libelleJalon(j.code)}</b> · {fmtEuro(j.montant)}
                          </span>
                        ))}
                      </span>
                    </span>
                    <span className="rl-montant">
                      {fmtEuro(l.s.enAttente)}
                      <small>dernière facture le {dateCourte(l.d.derniereFacture)} · {libelleAnciennete(l.jours)}</small>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
        <p className="fact-note">
          L'ancienneté part de la dernière facture du dossier : l'extraction Notion ne date pas chaque jalon.
        </p>
      </div>
    </section>
  );
}

// ---------- F. Par chef de projet (dirigeant) ----------

function ParChefProjet({ lignes }: { lignes: Ligne[] }) {
  const rows = useMemo(() => {
    const m = new Map<string, { chef: string; n: number; s: SommesHonoraires }>();
    for (const l of lignes) {
      const o = m.get(l.chef) ?? { chef: l.chef, n: 0, s: { contrat: 0, encaisse: 0, enAttente: 0, resteAFacturer: 0 } };
      o.n++;
      o.s.contrat += l.s.contrat;
      o.s.encaisse += l.s.encaisse;
      o.s.enAttente += l.s.enAttente;
      o.s.resteAFacturer += l.s.resteAFacturer;
      m.set(l.chef, o);
    }
    return [...m.values()].sort((a, b) => Number(a.chef === NON_ATTRIBUE) - Number(b.chef === NON_ATTRIBUE) || b.s.contrat - a.s.contrat);
  }, [lignes]);
  const plusGros = Math.max(0, ...rows.map((r) => r.s.contrat));
  const { max, ticks } = graduations(plusGros, pasAxeEuros(plusGros));

  return (
    <section className="panel">
      <div className="p-head">
        <h3>Par chef de projet</h3>
        <span className="fact-reserve"><Icon name="lock" size={12} /> Visible du dirigeant seul</span>
      </div>
      <div className="p-body">
        <div className="fact-cpj">
          {rows.map((r) => (
            <div key={r.chef} className="fact-cpj-ligne">
              <div className="cpj-qui">
                {r.chef}
                <small>{plur(r.n, "dossier")} · {fmtKEur(r.s.contrat)}</small>
              </div>
              <div className="cpj-piste">
                {ticks.map((v) => (
                  <i key={v} className="grille" style={{ left: `${(v / max) * 100}%` }}></i>
                ))}
                <div style={{ width: `${(r.s.contrat / max) * 100}%`, position: "relative" }}>
                  <JaugeHonoraires s={r.s} hauteur={18} />
                </div>
              </div>
              <div className="cpj-tot">
                encaissé <b>{pourcent(r.s.encaisse, r.s.contrat)} %</b>
                <br />
                <b>{fmtKEur(r.s.resteAFacturer)}</b> à facturer
              </div>
            </div>
          ))}
          <div className="fact-cpj-ligne axe">
            <div></div>
            <div className="fact-axe" style={{ marginTop: 0 }}>
              {ticks.map((v, i) => (
                <span key={v} className={v === 0 ? "premier" : i === ticks.length - 1 ? "dernier" : ""} style={{ left: `${(v / max) * 100}%` }}>
                  {axe(v)}
                </span>
              ))}
            </div>
            <div></div>
          </div>
        </div>
      </div>
    </section>
  );
}

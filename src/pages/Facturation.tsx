// « Facturation » (espace AMO) - demande d'Amir 28/09/2026.
//
// Suivi des honoraires AMO par jalon, repris du classeur Notion « AMO COPRO »
// pour les copropriétés présentes dans le logiciel (0111). Visuels retenus sur
// maquette : synthèse du portefeuille, frise des jalons dossier par dossier,
// paiements à relancer et chiffre d'affaires par chef de projet, pour tous les
// AMO (idée d'Amir 29/09/2026 : d'abord réservé au dirigeant ; la P1a en est
// retirée, hachurée en tête de barre). Le bloc « Honoraires » de l'onglet Projet reprend la même
// lecture pour un dossier.
// Facturation directe (0115, demande d'Amir du 28/09/2026) : les bulles de la
// frise sont cliquables (grise = brouillon de facture, orange = paiement pour
// le dirigeant) et le « Journal de facturation » liste les factures, avoirs
// et brouillons, avec l'historique des actions et le passage en production.
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "@/components/Icon";
import { Modal } from "@/components/Modal";
import { Badge, type BadgeKind } from "@/components/ui";
import { useAuth } from "@/auth/AuthProvider";
import { useCopros, type CoproWithStats } from "@/api/copros";
import { useHonoraires } from "@/api/honoraires";
import { useFactures, useJournalFacturation, useParametresFacturation, usePasserEnProduction, type BilanProduction } from "@/api/factures";
import { useTeamProfiles } from "@/api/profiles";
import { FacturationJalon, FenetrePieceSeule } from "@/components/FactureFenetres";
import { messageErreur } from "@/lib/erreurs";
import {
  LIBELLE_ETAT_PIECE,
  dateFr,
  etatPiece,
  euros,
  libelleType,
  type EtatPiece,
  type PieceFacture,
} from "@/lib/factureDoc";
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
  caChefProjet,
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
  type JalonHonoraires,
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
          <Journal lignes={lignes} />
          <Relances lignes={lignes} />
          <ParChefProjet lignes={lignes} />
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
  const { data: pieces } = useFactures();
  const [filtre, setFiltre] = useState<Filtre>("tous");
  const [chef, setChef] = useState("");
  const [tri, setTri] = useState<Tri>("reste");
  const [q, setQ] = useState("");
  const [actif, setActif] = useState<{ copro: CoproWithStats; jalon: JalonHonoraires } | null>(null);

  // jalons qui ont un brouillon de facture à valider (contour orange)
  const brouillons = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const p of pieces ?? []) {
      if (p.type !== "facture" || p.statut !== "brouillon") continue;
      const s = m.get(p.copro_id) ?? new Set<string>();
      s.add(p.jalon);
      m.set(p.copro_id, s);
    }
    return m;
  }, [pieces]);

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
        <span style={{ fontSize: 12.5, color: "var(--fg-muted)" }}>
          Cliquez sur une bulle grise pour préparer la facture du jalon, sur une bulle orange pour la facture ou le paiement
        </span>
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
                    <td>
                      <FriseJalons
                        d={l.d}
                        copro={l.copro.name}
                        brouillons={brouillons.get(l.copro.id)}
                        onJalon={(jalon) => setActif({ copro: l.copro, jalon })}
                      />
                    </td>
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
      {actif && (
        <FacturationJalon copro={{ id: actif.copro.id, name: actif.copro.name }} jalon={actif.jalon} onClose={() => setActif(null)} />
      )}
    </section>
  );
}

// ---------- Journal de facturation (0115) ----------

type FiltreJournal = "tous" | "brouillons" | "factures" | "avoirs" | "a_terminer";

const BADGE_PIECE: Record<EtatPiece, BadgeKind> = {
  brouillon: "blue",
  a_envoyer: "warn",
  envoi_erreur: "warn",
  envoyee: "neutral",
  payee: "success",
  annulee: "neutral",
};

const LIBELLE_ACTION: Record<string, string> = {
  brouillon: "Brouillon",
  brouillon_supprime: "Brouillon supprimé",
  validation: "Validation",
  envoi: "E-mail",
  paiement: "Paiement",
  paiement_annule: "Paiement annulé",
  production: "Passage en production",
};

function Journal({ lignes }: { lignes: Ligne[] }) {
  const { profile } = useAuth();
  const { data: pieces, isLoading } = useFactures();
  const { data: parametres } = useParametresFacturation();
  const { data: evenements } = useJournalFacturation();
  const { data: equipe } = useTeamProfiles();
  const [vue, setVue] = useState<"pieces" | "historique">("pieces");
  const [filtre, setFiltre] = useState<FiltreJournal>("tous");
  const [ouverte, setOuverte] = useState<PieceFacture | null>(null);
  const [production, setProduction] = useState(false);

  const parCopro = useMemo(() => new Map(lignes.map((l) => [l.copro.id, l])), [lignes]);
  const nomCopro = (id: string) => parCopro.get(id)?.copro.name ?? "Dossier";
  const nom = (uid: string | null) => (uid && equipe?.find((p) => p.user_id === uid)?.full_name) || "-";
  const tout = pieces ?? [];
  const etat = (p: PieceFacture) => etatPiece(p, tout);

  const compte = {
    brouillons: tout.filter((p) => p.statut === "brouillon").length,
    factures: tout.filter((p) => p.statut === "emise" && p.type === "facture").length,
    avoirs: tout.filter((p) => p.statut === "emise" && p.type === "avoir").length,
    a_terminer: tout.filter((p) => ["a_envoyer", "envoi_erreur"].includes(etat(p))).length,
  };
  const visibles = tout.filter(
    (p) =>
      filtre === "tous" ||
      (filtre === "brouillons" && p.statut === "brouillon") ||
      (filtre === "factures" && p.statut === "emise" && p.type === "facture") ||
      (filtre === "avoirs" && p.statut === "emise" && p.type === "avoir") ||
      (filtre === "a_terminer" && ["a_envoyer", "envoi_erreur"].includes(etat(p)))
  );

  const exporter = () => {
    const num = (v: number) => v.toFixed(2).replace(".", ",");
    telechargerCsv(
      `journal-facturation-${new Date().toISOString().slice(0, 10)}.csv`,
      ["N°", "Pièce", "Date d'émission", "Échéance", "Copropriété", "Jalon", "Client", "N° client", "Total HT", "TVA", "Total TTC", "État", "Payée le", "Test"],
      visibles
        .filter((p) => p.statut === "emise")
        .map((p) => [
          p.numero ?? "", libelleType(p.type), dateFr(p.date_emission), dateFr(p.date_echeance), nomCopro(p.copro_id), libelleJalon(p.jalon),
          p.client_nom, p.client_numero ?? "", num(p.total_ht), num(p.total_tva), num(p.total_ttc), LIBELLE_ETAT_PIECE[etat(p)],
          dateFr(p.payee_le), p.test ? "oui" : "",
        ])
    );
  };

  const jalonDe = (p: PieceFacture): JalonHonoraires | null => parCopro.get(p.copro_id)?.d.jalons.find((j) => j.code === p.jalon) ?? null;

  return (
    <section className="panel">
      <div className="p-head">
        <h3>Journal de facturation</h3>
        {compte.brouillons > 0 && <Badge kind="blue">{plur(compte.brouillons, "brouillon")} à valider</Badge>}
        <span style={{ flex: 1 }}></span>
        <div className="seg" role="group" aria-label="Vue du journal">
          <button className={vue === "pieces" ? "on" : ""} onClick={() => setVue("pieces")}>Pièces</button>
          <button className={vue === "historique" ? "on" : ""} onClick={() => setVue("historique")}>Historique</button>
        </div>
        {vue === "pieces" && (
          <button className="se-btn se-btn-secondary btn-sm" onClick={exporter} disabled={compte.factures + compte.avoirs === 0}>
            <Icon name="download" size={14} /> Exporter
          </button>
        )}
      </div>
      <div className="p-body">
        {parametres?.mode === "test" && (
          <div className="fact-bandeau-test">
            <Icon name="alert" size={16} />
            <div>
              <b>Facturation en mode test.</b> Les pièces sont numérotées TEST-FAC-… / TEST-AVR-… et portent « document de test,
              sans valeur » ; les e-mails partent aux vrais destinataires avec [TEST] dans l'objet. Le passage en production efface
              tous les essais (pièces, PDF, historique) et remet les jalons dans leur état d'avant ; la numérotation démarre alors à{" "}
              <b>FAC{String(parametres.prochain_facture).padStart(8, "0")}</b> et <b>AVR{String(parametres.prochain_avoir).padStart(8, "0")}</b>.
            </div>
            {profile?.dirigeant && (
              <button className="se-btn se-btn-secondary btn-sm" onClick={() => setProduction(true)}>
                Passer en production
              </button>
            )}
          </div>
        )}

        {vue === "pieces" ? (
          <>
            <div className="toolbar fact-toolbar">
              <div className="seg" role="group" aria-label="Filtre des pièces">
                <button className={filtre === "tous" ? "on" : ""} onClick={() => setFiltre("tous")}>Toutes · {tout.length}</button>
                <button className={filtre === "brouillons" ? "on" : ""} onClick={() => setFiltre("brouillons")}>Brouillons · {compte.brouillons}</button>
                <button className={filtre === "factures" ? "on" : ""} onClick={() => setFiltre("factures")}>Factures · {compte.factures}</button>
                <button className={filtre === "avoirs" ? "on" : ""} onClick={() => setFiltre("avoirs")}>Avoirs · {compte.avoirs}</button>
                <button className={filtre === "a_terminer" ? "on" : ""} onClick={() => setFiltre("a_terminer")} title="Émises dont le PDF ou l'e-mail n'est pas parti">
                  Envoi à terminer · {compte.a_terminer}
                </button>
              </div>
            </div>
            <div className="tablewrap fact-tablewrap">
              <table className="dossiers fact-table" style={{ minWidth: 820 }}>
                <thead>
                  <tr>
                    <th>N°</th>
                    <th>Date</th>
                    <th>Copropriété</th>
                    <th>Jalon</th>
                    <th>Client</th>
                    <th className="r">Total TTC</th>
                    <th>État</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr style={{ cursor: "default" }}><td colSpan={7} style={{ padding: 24, color: "var(--fg-muted)" }}>Chargement…</td></tr>
                  ) : visibles.length === 0 ? (
                    <tr style={{ cursor: "default" }}>
                      <td colSpan={7} style={{ padding: 28, textAlign: "center", color: "var(--fg-muted)" }}>
                        {tout.length === 0
                          ? "Aucune pièce pour l'instant : cliquez sur une bulle grise de la frise ou sur « Facturer » dans l'onglet Projet d'un dossier."
                          : "Aucune pièce ne correspond à ce filtre."}
                      </td>
                    </tr>
                  ) : (
                    visibles.map((p) => {
                      const e = etat(p);
                      return (
                        <tr key={p.id} onClick={() => setOuverte(p)}>
                          <td>
                            <span className="fact-nom" style={{ fontFamily: "var(--font-mono)", fontSize: 12.5 }}>
                              {p.numero ?? "Brouillon"}
                            </span>
                            <span className="fact-meta">{libelleType(p.type)}{p.test ? " · test" : ""}</span>
                          </td>
                          <td>
                            {p.statut === "emise" ? dateFr(p.date_emission) : dateFr(p.cree_le.slice(0, 10))}
                            <span className="fact-meta">{p.statut === "emise" ? `par ${nom(p.valide_par)}` : `préparé par ${nom(p.cree_par)}`}</span>
                          </td>
                          <td><span className="fact-nom">{nomCopro(p.copro_id)}</span></td>
                          <td style={{ fontFamily: "var(--font-mono)", fontSize: 12.5 }}>{libelleJalon(p.jalon)}</td>
                          <td>
                            <span className="fact-nom">{p.client_nom}</span>
                            <span className="fact-meta">{p.destinataire_email ?? "sans e-mail"}</span>
                          </td>
                          <td className="r fact-fort">{euros(p.total_ttc)}</td>
                          <td>
                            <Badge kind={BADGE_PIECE[e]}>{LIBELLE_ETAT_PIECE[e]}</Badge>
                            {p.payee_le && <span className="fact-meta">le {dateFr(p.payee_le)}</span>}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="fact-historique">
            {(evenements ?? []).length === 0 ? (
              <p className="se-small" style={{ margin: 0 }}>Aucune action de facturation pour l'instant.</p>
            ) : (
              (evenements ?? []).map((ev) => (
                <div key={ev.id} className="fh-ligne">
                  <span className="fh-date">{new Date(ev.le).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</span>
                  <span className={"fh-action " + ev.action}>{LIBELLE_ACTION[ev.action] ?? ev.action}</span>
                  <span className="fh-texte">
                    <b>{nomCopro(ev.copro_id)}</b>
                    {ev.jalon ? ` · ${libelleJalon(ev.jalon)}` : ""} - {ev.detail}
                    {ev.test && <span className="fz-test">Test</span>}
                  </span>
                  <span className="fh-qui">{nom(ev.par)}</span>
                </div>
              ))
            )}
          </div>
        )}
      </div>
      {ouverte && (
        <FenetrePieceSeule
          piece={ouverte}
          copro={{ id: ouverte.copro_id, name: nomCopro(ouverte.copro_id) }}
          jalon={jalonDe(ouverte)}
          onClose={() => setOuverte(null)}
        />
      )}
      {production && (
        <FenetreProduction
          nbPieces={tout.filter((p) => p.test).length}
          nbEvenements={(evenements ?? []).filter((e) => e.test).length}
          onClose={() => setProduction(false)}
        />
      )}
    </section>
  );
}

function FenetreProduction({ nbPieces, nbEvenements, onClose }: { nbPieces: number; nbEvenements: number; onClose: () => void }) {
  const passer = usePasserEnProduction();
  const [compris, setCompris] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [bilan, setBilan] = useState<BilanProduction | null>(null);

  const confirmer = async () => {
    setErreur(null);
    try {
      setBilan(await passer.mutateAsync());
    } catch (e) {
      setErreur(messageErreur(e, "Le passage en production a échoué : rien n'a été effacé."));
    }
  };

  return (
    <Modal title="Passer la facturation en production" onClose={onClose} width={540} closeOnBackdrop={false}>
      {bilan ? (
        <>
          <p className="se-small" style={{ margin: 0 }}>
            La facturation est en production. Effacés : {plur(bilan.factures, "facture")} et {plur(bilan.avoirs, "avoir")} de test,
            avec leurs PDF et leur historique ; {plur(bilan.jalons, "jalon remis", "jalons remis")} dans leur état d'avant les essais.
            La prochaine facture portera le numéro FAC00000766 (ou le suivant) et le prochain avoir AVR00000073.
          </p>
          {bilan.fichiersRestants > 0 && (
            <p className="fact-alerte">
              <Icon name="alert" size={14} /> {plur(bilan.fichiersRestants, "PDF de test n'a", "PDF de test n'ont")} pas pu être retirés du stockage
              (ils ne sont plus rattachés à aucun dossier).
            </p>
          )}
          <div className="fact-modal-actions">
            <button type="button" className="se-btn se-btn-primary btn-sm" onClick={onClose}>Fermer</button>
          </div>
        </>
      ) : (
        <>
          <p className="se-small" style={{ margin: 0 }}>
            Tout ce qui a été fait en mode test est effacé : {plur(nbPieces, "pièce")} (factures, avoirs, brouillons), leurs PDF dans
            les fichiers des copropriétés, {plur(nbEvenements, "ligne")} d'historique et les numéros clients attribués pendant les
            essais. Les jalons touchés reviennent à leur état d'avant (à facturer, facturé ou encaissé). Les adresses de syndic
            saisies sont gardées. Les e-mails déjà partis ne peuvent pas être rappelés.
          </p>
          <label className="fz-case">
            <input type="checkbox" checked={compris} onChange={(e) => setCompris(e.target.checked)} />
            J'ai compris : les essais sont effacés définitivement et la vraie numérotation démarre.
          </label>
          {erreur && <p className="fact-erreur">{erreur}</p>}
          <div className="fact-modal-actions">
            <button type="button" className="se-btn se-btn-ghost btn-sm" onClick={onClose}>Annuler</button>
            <button type="button" className="se-btn se-btn-primary btn-sm" onClick={() => void confirmer()} disabled={!compris || passer.isPending}>
              {passer.isPending ? "Passage en production…" : "Passer en production"}
            </button>
          </div>
        </>
      )}
    </Modal>
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

// ---------- F. Chiffre d'affaires par chef de projet ----------
// Idée d'Amir 29/09/2026 : visible de tous les AMO (réservé au dirigeant
// jusque-là). La P1a, quand elle a un montant, sort du chiffre d'affaires du
// chef de projet : elle reste en tête de barre, hachurée, et n'entre ni dans
// le pourcentage encaissé ni dans le reste à facturer.

function ParChefProjet({ lignes }: { lignes: Ligne[] }) {
  const rows = useMemo(() => {
    const m = new Map<string, { chef: string; n: number; horsCa: number; ca: SommesHonoraires }>();
    for (const l of lignes) {
      const o = m.get(l.chef) ?? { chef: l.chef, n: 0, horsCa: 0, ca: { contrat: 0, encaisse: 0, enAttente: 0, resteAFacturer: 0 } };
      const x = caChefProjet(l.d);
      o.n++;
      o.horsCa += x.horsCa;
      o.ca.contrat += x.ca.contrat;
      o.ca.encaisse += x.ca.encaisse;
      o.ca.enAttente += x.ca.enAttente;
      o.ca.resteAFacturer += x.ca.resteAFacturer;
      m.set(l.chef, o);
    }
    return [...m.values()].sort((a, b) => Number(a.chef === NON_ATTRIBUE) - Number(b.chef === NON_ATTRIBUE) || b.ca.contrat - a.ca.contrat);
  }, [lignes]);
  // la barre porte le contrat entier : P1a hachurée puis chiffre d'affaires
  const plusGros = Math.max(0, ...rows.map((r) => r.horsCa + r.ca.contrat));
  const { max, ticks } = graduations(plusGros, pasAxeEuros(plusGros));
  const totalHorsCa = rows.reduce((x, r) => x + r.horsCa, 0);

  return (
    <section className="panel">
      <div className="p-head">
        <h3>Chiffre d'affaires par chef de projet</h3>
        <span style={{ fontSize: 12.5, color: "var(--fg-muted)" }}>Montants HT, hors P1a</span>
        <span style={{ flex: 1 }}></span>
        <div className="fact-legende">
          <span><i className="fact-sw hors-ca"></i>P1a, hors chiffre d'affaires</span>
        </div>
      </div>
      <div className="p-body">
        <div className="fact-cpj">
          {rows.map((r) => {
            const total = r.horsCa + r.ca.contrat;
            return (
              <div key={r.chef} className="fact-cpj-ligne">
                <div className="cpj-qui">
                  {r.chef}
                  <small>{plur(r.n, "dossier")} · {fmtKEur(r.ca.contrat)}</small>
                </div>
                <div className="cpj-piste">
                  {ticks.map((v) => (
                    <i key={v} className="grille" style={{ left: `${(v / max) * 100}%` }}></i>
                  ))}
                  {total > 0 && (
                    <div className="cpj-barre" style={{ width: `${(total / max) * 100}%` }}>
                      {r.horsCa > 0 && (
                        <span
                          className="cpj-hors-ca"
                          style={{ width: `${(r.horsCa / total) * 100}%` }}
                          title={`P1a : ${fmtEuro(r.horsCa)} HT, hors chiffre d'affaires`}
                        ></span>
                      )}
                      {r.ca.contrat > 0 && (
                        <div style={{ width: `${(r.ca.contrat / total) * 100}%` }}>
                          <JaugeHonoraires s={r.ca} hauteur={18} />
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div className="cpj-tot">
                  encaissé <b>{pourcent(r.ca.encaisse, r.ca.contrat)} %</b>
                  <br />
                  <b>{fmtKEur(r.ca.resteAFacturer)}</b> à facturer
                </div>
              </div>
            );
          })}
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
        {totalHorsCa > 0 && (
          <p className="fact-note">
            En hachuré, la P1a des dossiers ({fmtKEur(totalHorsCa)} HT au total) : retirée du chiffre d'affaires, du
            pourcentage encaissé et du reste à facturer.
          </p>
        )}
      </div>
    </section>
  );
}

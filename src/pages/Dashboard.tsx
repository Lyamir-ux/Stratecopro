// Tableau de bord AMO - porté de design-reference/project/dashboard.jsx
// Vue liste seule (triable et exportable), KPI, filtres phase & secteur fonctionnels.
// Le Kanban par phase a été retiré (feedback Amir 28/09, sans intérêt pour l'AMO).
import { useMemo, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useCrumbs } from "@/components/Shell/useCrumbs";
import { Icon } from "@/components/Icon";
import { Modal } from "@/components/Modal";
import { Badge, DpePair, PhaseBadge, Progress } from "@/components/ui";
import { PHASES, type DpeClass, type PhaseId } from "@/lib/referentiels";
import { fmtEuro, fmtEuroFull } from "@/lib/format";
import { lireMontant } from "@/lib/importCopros";
import {
  CODES_PHASE,
  LIBELLE_FORMULE,
  PARTS_P1,
  PARTS_P2,
  lireJalonsPhase,
  repartitionP1,
  repartitionP2,
  type CodeJalonContrat,
  type FormuleHonoraires,
  type PhaseContrat,
} from "@/lib/facturation";
import { telechargerCsv } from "@/lib/csv";
import { emailsDuGestionnaire, gestionnairesConnus } from "@/lib/gestionnaires";
import { useUi } from "@/stores/ui";
import {
  avancementAmo,
  nbLogements,
  erreurCreation,
  notifierPassation,
  useCopros,
  useCoprosCorbeille,
  useCreateCopro,
  useRestaurerCopro,
  useSupprimerDefinitivement,
  type ChoixMaitreOeuvre,
  type CoproWithStats,
} from "@/api/copros";
import { usePrestataires } from "@/api/prestataires";
import { ImportCoprosDialog } from "./ImportCoprosDialog";
import { useTeamProfiles } from "@/api/profiles";
import { useOrganisations, type ChoixOrganisation } from "@/api/organisations";
import {
  nomOrganisationDisponible,
  nomSyndicBenevole,
  normaliserNomOrganisation,
  trouverOrganisationParNom,
} from "@/lib/organisations";
import { fmtDate } from "@/lib/format";
import { uploadFichierDirect } from "@/api/fichiers";

type ColTri = "name" | "phase" | "logements" | "montant" | "progress" | "moe";

/** Valeur du filtre « Sans maître d'œuvre » (hors des noms possibles). */
const SANS_MOE = "__sans__";
/** Filtre « Non attribués » du chef de projet (remarque d'Amir du 04/10/2026). */
const SANS_CHEF = "__non_attribue__";

const PHASE_RANK: Record<PhaseId, number> = { diagnostic: 0, etudes: 1, travaux: 2 };

export interface Tri {
  col: ColTri;
  desc: boolean;
}

/** Tri de la vue liste - l'ordre affiché est aussi celui de l'export. */
export function trierCopros(copros: CoproWithStats[], tri: Tri): CoproWithStats[] {
  const valeur = (c: CoproWithStats): string | number => {
    switch (tri.col) {
      case "name":
        return c.name;
      case "phase":
        return PHASE_RANK[c.phase];
      case "logements":
        return nbLogements(c);
      case "montant":
        return c.stats?.montant_ttc ?? 0;
      case "progress":
        return avancementAmo(c);
      case "moe":
        return c.maitre_oeuvre?.trim() ?? "";
    }
  };
  return [...copros].sort((a, b) => {
    const va = valeur(a);
    const vb = valeur(b);
    // Maître d'œuvre non renseigné : en fin de liste dans les deux sens de tri
    if (tri.col === "moe" && (!va || !vb)) return va ? -1 : vb ? 1 : 0;
    const cmp = typeof va === "string" ? va.localeCompare(String(vb), "fr") : Number(va) - Number(vb);
    return tri.desc ? -cmp : cmp;
  });
}

/** Vue liste : colonnes triables, exportable en CSV depuis l'en-tête de page
 *  (feedback Amir 22/09 - remplace la vue galerie, sans usage). Le nombre de
 *  copropriétaires n'est plus affiché (feedback Amir 23/09, inutile à l'écran) :
 *  il reste dans l'export et dans les KPI. Maître d'œuvre du dossier depuis le
 *  26/09 (texte libre de l'onglet Données). */
function ListeView({ copros, tri, setTri }: { copros: CoproWithStats[]; tri: Tri; setTri: (t: Tri) => void }) {
  const navigate = useNavigate();
  const cliquerTri = (col: ColTri) => setTri({ col, desc: tri.col === col ? !tri.desc : col !== "name" });
  const Th = ({ col, label }: { col: ColTri; label: string }) => (
    <th
      style={{ cursor: "pointer", userSelect: "none" }}
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
    <div className="tablewrap fade">
      <table className="dossiers">
        <thead>
          <tr>
            <Th col="name" label="Copropriété" />
            <Th col="phase" label="Phase" />
            <th>DPE</th>
            <Th col="logements" label="Logements" />
            <Th col="montant" label="Montant TTC" />
            <Th col="progress" label="Avancement" />
            <Th col="moe" label="Maître d'œuvre" />
            <th>Équipe</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {copros.map((c) => (
            <tr key={c.id} onClick={() => navigate(`/copros/${c.id}`)}>
              <td>
                <div className="td-name">
                  <span className="td-thumb">
                    <Icon name="building" size={18} />
                  </span>
                  <div>
                    <div className="nm">{c.name}</div>
                    <div className="sub">{c.city ?? ""}</div>
                  </div>
                </div>
              </td>
              <td>
                <PhaseBadge phase={c.phase} />
              </td>
              <td>
                <DpePair before={c.energy_before as DpeClass | null} after={c.energy_after as DpeClass | null} />
              </td>
              <td style={{ fontWeight: 600 }}>{nbLogements(c)}</td>
              <td style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}>{fmtEuro(c.stats?.montant_ttc)}</td>
              <td>
                <div className="td-prog">
                  <span className="pct">{avancementAmo(c)}%</span>
                  <div style={{ flex: 1 }}>
                    <Progress value={avancementAmo(c)} blue={c.phase === "etudes"} />
                  </div>
                </div>
              </td>
              <td style={{ fontSize: 13 }}>
                {c.maitre_oeuvre?.trim() || <span style={{ color: "var(--fg-muted)" }}>-</span>}
              </td>
              <td>
                {/* Chef de projet (vert) et syndic (bleu) - deux couleurs distinctes sur tous les projets */}
                <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
                  {c.chef_projet ? (
                    <span title="Chef de projet">
                      <Badge kind="primary">{c.chef_projet}</Badge>
                    </span>
                  ) : null}
                  {c.syndic_name ? (
                    <span title={c.gestionnaire_nom ? "Syndic - gestionnaire en charge" : "Syndic"}>
                      <Badge kind="blue">
                        {c.gestionnaire_nom ? `${c.syndic_name} - ${c.gestionnaire_nom}` : c.syndic_name}
                      </Badge>
                    </span>
                  ) : null}
                  {!c.chef_projet && !c.syndic_name && (
                    <span style={{ color: "var(--fg-muted)", fontSize: 13 }}>-</span>
                  )}
                </div>
              </td>
              <td>
                <Icon name="chevronRight" size={18} style={{ color: "var(--fg-muted)" }} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function KpiStrip({ copros }: { copros: CoproWithStats[] }) {
  const logements = copros.reduce((s, c) => s + nbLogements(c), 0);
  const coproTotal = copros.reduce((s, c) => s + (c.stats?.coproprietaires ?? 0), 0);
  const montant = copros.reduce((s, c) => s + (c.stats?.montant_ttc ?? 0), 0);
  const gains = copros.filter((c) => c.gain_pct != null);
  const gainMoy = gains.length ? Math.round(gains.reduce((s, c) => s + (c.gain_pct ?? 0), 0) / gains.length) : null;
  const kpis = [
    { ico: "building" as const, label: "Dossiers actifs", val: String(copros.length), foot: <>sur les 3 phases</>, blue: false },
    { ico: "users" as const, label: "Copropriétaires accompagnés", val: String(coproTotal), foot: <>{logements} logements au total</>, blue: true },
    {
      ico: "euro" as const,
      label: "Montant de travaux",
      val: (montant / 1e6).toLocaleString("fr-FR", { maximumFractionDigits: 2 }) + " M€",
      foot: <>TTC engagés</>,
      blue: false,
    },
    {
      ico: "trendingUp" as const,
      label: "Gain énergétique moyen",
      val: gainMoy != null ? gainMoy + " %" : "-",
      foot:
        gainMoy != null && gainMoy >= 35 ? (
          <span>
            <span className="up">↑</span> au-dessus du seuil 35 %
          </span>
        ) : (
          <>gain non évalué</>
        ),
      blue: false,
    },
  ];
  return (
    <div className="kpis">
      {kpis.map((k, i) => (
        <div className="kpi fade" key={i}>
          <div className="k-top">
            <span className={"k-ico" + (k.blue ? " blue" : "")}>
              <Icon name={k.ico} size={19} />
            </span>
            <span className="k-label">{k.label}</span>
          </div>
          <div className="k-val">{k.val}</div>
          <div className="k-foot">{k.foot}</div>
        </div>
      ))}
    </div>
  );
}

const DPE_CLASSES: DpeClass[] = ["A", "B", "C", "D", "E", "F", "G"];

/** Choix du menu Organisation qui créent une enseigne (hors des identifiants possibles). */
const ORG_BENEVOLE = "__benevole__";
const ORG_NOUVELLE = "__nouvelle__";
/** Choix « Nouveau maître d'œuvre » du menu (hors des raisons sociales possibles). */
const MOE_NOUVEAU = "__nouveau__";

/** « P1a 4 500 € · P1b 2 250 € · P1c 2 250 € » sous le montant saisi, ou la règle de répartition. */
function apercuRepartition(saisie: string, phase: "p1" | "p2"): string {
  const parts: Record<string, number> = phase === "p1" ? PARTS_P1 : PARTS_P2;
  const m = lireMontant(saisie);
  if (m == null || Number.isNaN(m) || m <= 0) {
    return Object.entries(parts).map(([code, p]) => `${Math.round(p * 100)} % ${code}`).join(", ");
  }
  const rep: Record<string, number> = phase === "p1" ? repartitionP1(m) : repartitionP2(m);
  return Object.entries(rep).map(([code, v]) => `${code} ${fmtEuroFull(v)}`).join(" · ");
}

/** Ancienne formule : les trois jalons d'une phase saisis à la main, avec leur total. */
function SaisieJalonsPhase({
  phase,
  valeurs,
  onChange,
}: {
  phase: PhaseContrat;
  valeurs: Partial<Record<CodeJalonContrat, string>>;
  onChange: (code: CodeJalonContrat, valeur: string) => void;
}) {
  const { total, illisibles } = lireJalonsPhase(phase, valeurs, lireMontant);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 13, fontWeight: 500, color: "var(--fg2)" }}>
        {phase === "p1" ? "Honoraires P1 - études (€ HT)" : "Honoraires P2 - travaux (€ HT)"}
      </span>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 6 }}>
        {CODES_PHASE[phase].map((code) => (
          <label key={code} style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 12, color: "var(--fg-muted)" }}>
            {code}
            <input
              className="login-input"
              inputMode="decimal"
              placeholder="-"
              aria-label={`${code} (€ HT)`}
              value={valeurs[code] ?? ""}
              onChange={(e) => onChange(code, e.target.value)}
            />
          </label>
        ))}
      </div>
      <span style={{ fontSize: 12, color: illisibles.length ? "var(--color-error-700)" : "var(--fg-muted)" }}>
        {illisibles.length
          ? `Montant illisible : ${illisibles.join(", ")}`
          : total > 0
            ? `Total ${fmtEuroFull(total)} HT`
            : "Un jalon laissé vide n'a pas de montant"}
      </span>
    </div>
  );
}

function NewCoproDialog({ onClose }: { onClose: () => void }) {
  const create = useCreateCopro();
  const { data: team } = useTeamProfiles();
  const { data: organisations } = useOrganisations();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: "",
    nb_batiments: 1,
    batiment_adresses: [] as string[],
    city: "",
    code_postal: "",
    adresse: "",
    syndic_name: "",
    gestionnaire_nom: "",
    gestionnaire_email: "",
    nb_logements: "" as string,
    chef_projet: "",
    phase: "diagnostic" as PhaseId,
    energy_before: "" as string,
    fragile: false,
    date_ag: "",
    honoraires_p1: "",
    honoraires_p2: "",
  });
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));
  // Gestionnaire déjà saisi sur un dossier (idée d'Amir du 04/10/2026) : son
  // adresse enregistrée est reprise d'office, tant que l'e-mail n'a pas été
  // tapé à la main ; plusieurs adresses = les autres proposées en un clic.
  const { data: dossiers } = useCopros();
  const gestionnaires = useMemo(() => gestionnairesConnus(dossiers ?? []), [dossiers]);
  const [emailRepris, setEmailRepris] = useState<string | null>(null);
  const reprendreEmail = (email: string) => {
    set({ gestionnaire_email: email });
    setEmailRepris(email || null);
  };
  // Honoraires (demande d'Amir du 03/10/2026) : nouvelle formule = P1 et P2
  // réparties 50/25/25 et 50/30/20 ; ancienne formule = jalons saisis à la main.
  const [formule, setFormule] = useState<FormuleHonoraires>("nouvelle");
  const [jalonsSaisis, setJalonsSaisis] = useState<Partial<Record<CodeJalonContrat, string>>>({});
  // Maître d'œuvre (idée d'Amir du 01/10/2026) : une fiche « Maître d'œuvre » de
  // la Base prestataires, ou un nouveau nom dont la fiche est créée avec le dossier.
  const { data: prestataires } = usePrestataires();
  const [moeChoix, setMoeChoix] = useState("");
  const [moeNouveau, setMoeNouveau] = useState("");
  const [erreurSaisie, setErreurSaisie] = useState<string | null>(null);
  const fichesMoe = (prestataires ?? [])
    .filter((p) => p.types.includes("moe"))
    .map((p) => p.raison_sociale)
    .sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }));
  const moeDejaFiche =
    moeChoix === MOE_NOUVEAU && moeNouveau.trim()
      ? ((prestataires ?? []).find(
          (p) => normaliserNomOrganisation(p.raison_sociale) === normaliserNomOrganisation(moeNouveau)
        )?.raison_sociale ?? null)
      : null;
  // Organisation (feedback d'Amir du 01/10/2026) : "" = selon le nom du syndic,
  // ORG_BENEVOLE, ORG_NOUVELLE ou l'identifiant d'une enseigne existante.
  const [orgChoix, setOrgChoix] = useState("");
  const [orgNouvelle, setOrgNouvelle] = useState("");
  const orgs = organisations ?? [];
  const enseigneChoisie = orgs.find((o) => o.id === orgChoix) ?? null;
  const nomBenevole = nomOrganisationDisponible(nomSyndicBenevole(form.name), orgs);
  const nouvelleExistante = orgChoix === ORG_NOUVELLE ? trouverOrganisationParNom(orgs, orgNouvelle) : null;
  const syndicReconnu = orgChoix === "" ? trouverOrganisationParNom(orgs, form.syndic_name) : null;
  // Nom repris pour le syndic s'il est laissé vide
  const nomOrganisation =
    orgChoix === ORG_BENEVOLE
      ? nomBenevole
      : orgChoix === ORG_NOUVELLE
        ? (nouvelleExistante?.nom ?? orgNouvelle.trim())
        : (enseigneChoisie?.nom ?? "");
  // Le nom du syndic suit l'enseigne choisie s'il était vide ou égal à la précédente.
  const choisirOrganisation = (valeur: string) => {
    const nouvelle = orgs.find((o) => o.id === valeur) ?? null;
    const nomActuel = normaliserNomOrganisation(form.syndic_name);
    if (nouvelle && (!nomActuel || nomActuel === normaliserNomOrganisation(enseigneChoisie?.nom ?? ""))) {
      set({ syndic_name: nouvelle.nom });
    }
    setOrgChoix(valeur);
  };
  const syndicSaisi = form.syndic_name.trim() || nomOrganisation;
  const emailsEnregistres = emailsDuGestionnaire(gestionnaires, form.gestionnaire_nom, syndicSaisi);
  const choisirGestionnaire = (nom: string) => {
    const remplacable = !form.gestionnaire_email.trim() || form.gestionnaire_email === emailRepris;
    set({ gestionnaire_nom: nom });
    if (remplacable) reprendreEmail(emailsDuGestionnaire(gestionnaires, nom, syndicSaisi)[0]?.email ?? "");
  };
  // Documents de passation joints à la création - déposés dans le dossier « Passation »
  const [passation, setPassation] = useState<File[]>([]);
  const passationRef = useRef<HTMLInputElement>(null);
  const nbBats = Math.max(1, form.nb_batiments || 1);
  const setBatAdresse = (i: number, v: string) =>
    setForm((f) => {
      const adresses = [...f.batiment_adresses];
      adresses[i] = v;
      return { ...f, batiment_adresses: adresses };
    });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErreurSaisie(null);
    let p1: number | null = null;
    let p2: number | null = null;
    let jalonsHt: Partial<Record<CodeJalonContrat, number>> | null = null;
    if (formule === "nouvelle") {
      p1 = lireMontant(form.honoraires_p1);
      p2 = lireMontant(form.honoraires_p2);
      if ((p1 != null && Number.isNaN(p1)) || (p2 != null && Number.isNaN(p2))) {
        setErreurSaisie("Honoraires : saisissez un montant en euros HT, par exemple 9 000 ou 12 345,67.");
        return;
      }
    } else {
      const phases = (["p1", "p2"] as const).map((ph) => lireJalonsPhase(ph, jalonsSaisis, lireMontant));
      const illisibles = phases.flatMap((x) => x.illisibles);
      if (illisibles.length > 0) {
        setErreurSaisie(`Honoraires : montant illisible pour ${illisibles.join(", ")} - saisissez des euros HT, par exemple 4 500 ou 2 812,50.`);
        return;
      }
      jalonsHt = { ...phases[0].montants, ...phases[1].montants };
    }
    const maitreOeuvre: ChoixMaitreOeuvre | null =
      moeChoix === MOE_NOUVEAU
        ? { mode: "nouveau", nom: moeNouveau.trim() }
        : moeChoix
          ? { mode: "existant", nom: moeChoix }
          : null;
    const organisation: ChoixOrganisation | null =
      orgChoix === ORG_BENEVOLE
        ? { mode: "benevole" }
        : orgChoix === ORG_NOUVELLE
          ? { mode: "nouvelle", nom: orgNouvelle.trim() }
          : orgChoix
            ? { mode: "existante", id: orgChoix }
            : null;
    const copro = await create.mutateAsync({
      ...form,
      syndic_name: form.syndic_name.trim(),
      organisation,
      nb_batiments: nbBats,
      nb_logements: form.nb_logements ? Number(form.nb_logements) : null,
      energy_before: form.energy_before || null,
      maitre_oeuvre: maitreOeuvre,
      date_ag: form.date_ag || null,
      honoraires_p1_ht: p1,
      honoraires_p2_ht: p2,
      honoraires_jalons_ht: jalonsHt,
    });
    // Le chef de projet désigné à la création est alerté par e-mail
    // (edge notifier-passation) - sans bloquer la création du dossier.
    if (form.chef_projet.trim()) {
      void notifierPassation(copro.id, null, form.chef_projet.trim());
    }
    // Dépôt des documents de passation dans les fichiers du dossier créé.
    // Le dossier existe déjà : en cas d'échec d'un dépôt on continue quand même,
    // les pièces se redéposent depuis l'onglet Fichiers.
    const rates: string[] = [];
    for (const f of passation) {
      try {
        await uploadFichierDirect(copro.id, f, "Passation");
      } catch {
        rates.push(f.name);
      }
    }
    if (rates.length > 0) {
      window.alert(`Dossier créé, mais document(s) de passation non déposé(s) : ${rates.join(", ")}. Redéposez-les depuis l'onglet Fichiers (dossier Passation).`);
    }
    if (copro.avertissements.length > 0) {
      window.alert(
        `Dossier créé, mais : ${copro.avertissements.join(" ; ")}. Les honoraires se saisissent aussi depuis le bloc « Honoraires AMO » de l'onglet Projet, les fiches depuis la Base prestataires.`
      );
    }
    onClose();
    navigate(`/copros/${copro.id}`);
  };

  const field = (label: string, input: React.ReactNode) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={{ fontSize: 13, fontWeight: 500, color: "var(--fg2)" }}>{label}</label>
      {input}
    </div>
  );

  return (
    <Modal title="Nouvelle copropriété" onClose={onClose}>
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
          {field(
            "Nom de la copropriété *",
            <input className="login-input" required value={form.name} onChange={(e) => set({ name: e.target.value })} />
          )}
          {field(
            "Nombre de bâtiments *",
            <input
              className="login-input"
              type="number"
              min={1}
              required
              value={form.nb_batiments}
              onChange={(e) => set({ nb_batiments: Math.max(1, Number(e.target.value) || 1) })}
            />
          )}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {field("Ville", <input className="login-input" value={form.city} onChange={(e) => set({ city: e.target.value })} />)}
          {field(
            "Code postal",
            <input
              className="login-input"
              inputMode="numeric"
              autoComplete="postal-code"
              value={form.code_postal}
              onChange={(e) => set({ code_postal: e.target.value })}
            />
          )}
        </div>
        {field(
          nbBats > 1 ? "Adresse de la copropriété" : "Adresse",
          <input className="login-input" value={form.adresse} onChange={(e) => set({ adresse: e.target.value })} />
        )}
        {nbBats > 1 && (
          <div
            style={{
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              padding: "12px 14px",
              display: "flex",
              flexDirection: "column",
              gap: 10,
              maxHeight: 220,
              overflowY: "auto",
            }}
          >
            <span className="se-eyebrow" style={{ color: "var(--fg-muted)" }}>
              Adresse de chaque bâtiment
            </span>
            {Array.from({ length: nbBats }, (_, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 600, width: 56, flex: "none" }}>
                  Bât. {String(i + 1).padStart(2, "0")}
                </span>
                <input
                  className="login-input"
                  placeholder="Adresse du bâtiment"
                  value={form.batiment_adresses[i] ?? ""}
                  onChange={(e) => setBatAdresse(i, e.target.value)}
                />
              </div>
            ))}
          </div>
        )}
        {field(
          "Organisation",
          <>
            {/* Enseigne lue par l'espace syndic : existante, nouvelle, ou propre au syndic bénévole */}
            <select className="login-input" value={orgChoix} onChange={(e) => choisirOrganisation(e.target.value)}>
              <option value="">Aucune organisation</option>
              <option value={ORG_BENEVOLE}>Syndic bénévole (nouvelle organisation)</option>
              <option value={ORG_NOUVELLE}>Nouveau (saisir le nom)</option>
              {orgs.length > 0 && (
                <optgroup label="Organisations existantes">
                  {orgs.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.nom}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            {orgChoix === ORG_NOUVELLE && (
              <input
                className="login-input"
                required
                autoFocus
                placeholder="Nom de la nouvelle organisation"
                value={orgNouvelle}
                onChange={(e) => setOrgNouvelle(e.target.value)}
              />
            )}
            <OrganisationCreationApercu
              choix={orgChoix}
              nomCopro={form.name.trim()}
              nomBenevole={nomBenevole}
              nouvelle={orgNouvelle.trim()}
              nouvelleExistante={nouvelleExistante?.nom ?? null}
              syndicSaisi={form.syndic_name.trim()}
              syndicReconnu={syndicReconnu?.nom ?? null}
            />
          </>
        )}
        {field(
          "Syndic (société en charge de la gestion)",
          <>
            {/* Suggestions = enseignes de Paramètres → Organisations : un nom reconnu rattache le dossier */}
            <input
              className="login-input"
              list="syndics-suggestions-creation"
              placeholder={nomOrganisation || undefined}
              value={form.syndic_name}
              onChange={(e) => set({ syndic_name: e.target.value })}
            />
            <datalist id="syndics-suggestions-creation">
              {(organisations ?? []).map((o) => (
                <option key={o.id} value={o.nom} />
              ))}
            </datalist>
          </>
        )}
        <div
          style={{
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            padding: "12px 14px",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <span className="se-eyebrow" style={{ color: "var(--fg-muted)" }}>
            Gestionnaire de la copropriété
          </span>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {field(
              "Nom du gestionnaire",
              <>
                {/* Suggestions = gestionnaires déjà saisis sur un dossier, avec leur syndic */}
                <input
                  className="login-input"
                  list="gestionnaires-suggestions-creation"
                  value={form.gestionnaire_nom}
                  onChange={(e) => choisirGestionnaire(e.target.value)}
                />
                <datalist id="gestionnaires-suggestions-creation">
                  {gestionnaires.map((g) => (
                    <option key={g.nom} value={g.nom}>
                      {g.emails[0].syndic ?? ""}
                    </option>
                  ))}
                </datalist>
              </>
            )}
            {field(
              "Adresse mail",
              <input
                className="login-input"
                type="email"
                value={form.gestionnaire_email}
                onChange={(e) => {
                  set({ gestionnaire_email: e.target.value });
                  setEmailRepris(null);
                }}
              />
            )}
          </div>
          {emailsEnregistres.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--fg3)" }}>
              {emailsEnregistres.map((e) => {
                const detail = `${e.dossiers} dossier${e.dossiers > 1 ? "s" : ""}${e.syndic ? `, ${e.syndic}` : ""}`;
                return e.email === form.gestionnaire_email.trim().toLowerCase() ? (
                  <span key={e.email} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                    <Icon name="check" size={13} style={{ color: "var(--color-primary-700)" }} />
                    Adresse enregistrée ({detail})
                  </span>
                ) : (
                  <button
                    key={e.email}
                    type="button"
                    className="se-btn se-btn-secondary btn-sm"
                    title={`Adresse enregistrée pour ce gestionnaire (${detail})`}
                    onClick={() => reprendreEmail(e.email)}
                  >
                    <Icon name="mail" size={13} />
                    Utiliser {e.email}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {field(
            "Nombre de logements",
            <input
              className="login-input"
              type="number"
              min={0}
              placeholder="Avant l'import des lots"
              value={form.nb_logements}
              onChange={(e) => set({ nb_logements: e.target.value })}
            />
          )}
          {field(
            "Chef de projet",
            <>
              {/* Suggestions = comptes collaborateurs : un nom reconnu reçoit l'e-mail de passation */}
              <input
                className="login-input"
                list="chefs-projet-suggestions-creation"
                value={form.chef_projet}
                onChange={(e) => set({ chef_projet: e.target.value })}
              />
              <datalist id="chefs-projet-suggestions-creation">
                {(team ?? []).map((p) => (
                  <option key={p.user_id} value={p.full_name} />
                ))}
              </datalist>
            </>
          )}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {field(
            "Phase de départ",
            <select
              className="login-input"
              value={form.phase}
              onChange={(e) => set({ phase: e.target.value as PhaseId })}
            >
              {PHASES.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          )}
          {field(
            "Étiquette énergétique actuelle",
            <select
              className="login-input"
              value={form.energy_before}
              onChange={(e) => set({ energy_before: e.target.value })}
            >
              <option value="">Non connue</option>
              {DPE_CLASSES.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          )}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12, alignItems: "start" }}>
          {field(
            "Maître d'œuvre",
            <>
              {/* Fiches « Maître d'œuvre » de la Base prestataires, ou un nouveau nom */}
              <select className="login-input" value={moeChoix} onChange={(e) => setMoeChoix(e.target.value)}>
                <option value="">Non désigné</option>
                <option value={MOE_NOUVEAU}>Nouveau maître d'œuvre (saisir le nom)</option>
                {fichesMoe.length > 0 && (
                  <optgroup label="Base prestataires">
                    {fichesMoe.map((nom) => (
                      <option key={nom} value={nom}>
                        {nom}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
              {moeChoix === MOE_NOUVEAU && (
                <>
                  <input
                    className="login-input"
                    required
                    autoFocus
                    placeholder="Raison sociale du maître d'œuvre"
                    value={moeNouveau}
                    onChange={(e) => setMoeNouveau(e.target.value)}
                  />
                  {moeNouveau.trim() && (
                    <span style={{ fontSize: 12.5, color: "var(--fg-muted)" }}>
                      {moeDejaFiche
                        ? `La fiche « ${moeDejaFiche} » existe déjà dans la Base prestataires : elle est reprise.`
                        : `Une fiche « ${moeNouveau.trim()} » (métier Maître d'œuvre, sans e-mail) sera créée dans la Base prestataires.`}
                    </span>
                  )}
                </>
              )}
            </>
          )}
          {field(
            "Date d'AG",
            <input className="login-input" type="date" value={form.date_ag} onChange={(e) => set({ date_ag: e.target.value })} />
          )}
        </div>
        <div
          style={{
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            padding: "12px 14px",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <span className="se-eyebrow" style={{ color: "var(--fg-muted)" }}>
            Honoraires AMO du contrat
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div className="seg" role="group" aria-label="Formule des honoraires">
              {(["nouvelle", "ancienne"] as const).map((f) => (
                <button key={f} type="button" className={formule === f ? "on" : ""} aria-pressed={formule === f} onClick={() => setFormule(f)}>
                  {LIBELLE_FORMULE[f].titre}
                </button>
              ))}
            </div>
            <span style={{ fontSize: 12.5, color: "var(--fg-muted)" }}>{LIBELLE_FORMULE[formule].detail}</span>
          </div>
          {formule === "ancienne" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {(["p1", "p2"] as const).map((ph) => (
                <SaisieJalonsPhase
                  key={ph}
                  phase={ph}
                  valeurs={jalonsSaisis}
                  onChange={(code, v) => setJalonsSaisis((x) => ({ ...x, [code]: v }))}
                />
              ))}
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {field(
                "Honoraires P1 - études (€ HT)",
                <>
                  <input
                    className="login-input"
                    inputMode="decimal"
                    placeholder="Par exemple 9 000"
                    value={form.honoraires_p1}
                    onChange={(e) => set({ honoraires_p1: e.target.value })}
                  />
                  <span style={{ fontSize: 12, color: "var(--fg-muted)" }}>{apercuRepartition(form.honoraires_p1, "p1")}</span>
                </>
              )}
              {field(
                "Honoraires P2 - travaux (€ HT)",
                <>
                  <input
                    className="login-input"
                    inputMode="decimal"
                    placeholder="Par exemple 15 000"
                    value={form.honoraires_p2}
                    onChange={(e) => set({ honoraires_p2: e.target.value })}
                  />
                  <span style={{ fontSize: 12, color: "var(--fg-muted)" }}>{apercuRepartition(form.honoraires_p2, "p2")}</span>
                </>
              )}
            </div>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 13, fontWeight: 500, color: "var(--fg2)" }}>
            Documents de passation{" "}
            <span style={{ color: "var(--fg-muted)", fontWeight: 400 }}>
              · optionnel - déposés dans les fichiers du dossier (Passation)
            </span>
          </label>
          <input
            ref={passationRef}
            type="file"
            multiple
            style={{ display: "none" }}
            onChange={(e) => {
              const nouveaux = Array.from(e.target.files ?? []);
              if (nouveaux.length) setPassation((prev) => [...prev, ...nouveaux]);
              e.target.value = "";
            }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {passation.map((f, i) => (
              <span
                key={i}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "5px 10px",
                  borderRadius: "var(--radius-md)",
                  background: "var(--bg-soft)",
                  border: "1px solid var(--border)",
                  fontSize: 12.5,
                }}
              >
                <Icon name="fileText" size={13} />
                {f.name}
                <button
                  type="button"
                  className="icon-btn"
                  title="Retirer"
                  onClick={() => setPassation((prev) => prev.filter((_, j) => j !== i))}
                  style={{ width: 18, height: 18 }}
                >
                  <Icon name="x" size={12} />
                </button>
              </span>
            ))}
            <button
              type="button"
              className="se-btn se-btn-secondary btn-sm"
              onClick={() => passationRef.current?.click()}
            >
              <Icon name="upload" size={14} />
              Joindre les documents de passation
            </button>
          </div>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: "var(--fg2)" }}>
          <input type="checkbox" checked={form.fragile} onChange={(e) => set({ fragile: e.target.checked })} />
          Copropriété fragile (taux d'impayés &gt; 8 %)
        </label>
        {(erreurSaisie || create.isError) && (
          <p style={{ color: "var(--color-error-700)", fontSize: 13.5, margin: 0 }}>
            {erreurSaisie ?? erreurCreation(create.error)}
          </p>
        )}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 6 }}>
          <button type="button" className="se-btn se-btn-secondary" onClick={onClose}>
            Annuler
          </button>
          <button type="submit" className="se-btn se-btn-primary" disabled={create.isPending}>
            <Icon name="plus" size={16} />
            {create.isPending ? "Création…" : "Créer le dossier"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Ce que fera la création côté organisation, sous le menu. */
function OrganisationCreationApercu({
  choix,
  nomCopro,
  nomBenevole,
  nouvelle,
  nouvelleExistante,
  syndicSaisi,
  syndicReconnu,
}: {
  choix: string;
  nomCopro: string;
  nomBenevole: string;
  nouvelle: string;
  nouvelleExistante: string | null;
  syndicSaisi: string;
  syndicReconnu: string | null;
}) {
  let message: string | null = null;
  if (choix === ORG_BENEVOLE) {
    message = `Une organisation « ${nomCopro ? nomBenevole : "Syndic Bénévole <nom de la copropriété>"} » sera créée pour ce dossier. Indiquez le copropriétaire bénévole comme gestionnaire ci-dessous.`;
  } else if (choix === ORG_NOUVELLE) {
    if (nouvelleExistante) message = `L'organisation « ${nouvelleExistante} » existe déjà : le dossier y sera rattaché.`;
    else if (nouvelle) message = `L'organisation « ${nouvelle} » sera créée avec le dossier.`;
  } else if (choix === "") {
    if (syndicReconnu) message = `Nom du syndic reconnu : le dossier sera rattaché à l'organisation ${syndicReconnu}.`;
    else if (syndicSaisi) message = `Aucune organisation ne s'appelle « ${syndicSaisi} » : le dossier sera créé sans organisation.`;
  }
  if (!message) return null;
  return <span style={{ fontSize: 12.5, color: "var(--fg-muted)" }}>{message}</span>;
}

/** Corbeille des projets : restaurer un dossier ou le supprimer définitivement. */
function CorbeilleDialog({ onClose }: { onClose: () => void }) {
  const { data: corbeille, isLoading } = useCoprosCorbeille();
  const restaurer = useRestaurerCopro();
  const supprimer = useSupprimerDefinitivement();
  const items = corbeille ?? [];

  return (
    <Modal title="Corbeille" onClose={onClose} width={640}>
      {isLoading ? (
        <p style={{ color: "var(--fg-muted)" }}>Chargement…</p>
      ) : items.length === 0 ? (
        <p style={{ color: "var(--fg-muted)", margin: 0 }}>
          La corbeille est vide. Les dossiers mis à la corbeille depuis leur fiche apparaissent ici - vous
          pouvez les restaurer ou les supprimer définitivement.
        </p>
      ) : (
        <>
          {items.map((c) => (
            <div
              key={c.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "11px 0",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <Icon name="building" size={17} style={{ color: "var(--fg-muted)", flex: "none" }} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{c.name}</div>
                <div style={{ fontSize: 12.5, color: "var(--fg-muted)" }}>
                  {[c.city, `à la corbeille depuis le ${fmtDate(c.deleted_at)}`].filter(Boolean).join(" · ")}
                </div>
              </div>
              <button
                className="se-btn se-btn-secondary btn-sm"
                disabled={restaurer.isPending}
                onClick={() => void restaurer.mutateAsync(c.id)}
              >
                <Icon name="chevronLeft" size={13} />
                Restaurer
              </button>
              <button
                className="se-btn se-btn-ghost btn-sm"
                style={{ color: "var(--color-error-700)" }}
                disabled={supprimer.isPending}
                onClick={() => {
                  if (
                    window.confirm(
                      `Supprimer définitivement « ${c.name} » ?\n\nToutes les données du dossier (lots, enquêtes, plans de financement, fichiers…) seront effacées. Cette action est irréversible.`
                    )
                  ) {
                    void supprimer.mutateAsync(c.id);
                  }
                }}
              >
                <Icon name="trash" size={13} />
                Supprimer définitivement
              </button>
            </div>
          ))}
          <p className="se-small" style={{ color: "var(--fg-muted)", marginTop: 12, marginBottom: 0 }}>
            Un dossier à la corbeille n'est plus visible des syndics, copropriétaires et prestataires. La
            restauration le remet en ligne à l'identique.
          </p>
        </>
      )}
    </Modal>
  );
}

/** Export de la liste telle qu'elle est affichée : mêmes dossiers (filtres
 *  appliqués), même ordre de tri, toutes les colonnes utiles au reporting. */
function exportCsv(copros: CoproWithStats[]) {
  telechargerCsv(
    "coproprietes-strateco.csv",
    [
      "Copropriété",
      "Adresse",
      "Code postal",
      "Ville",
      "Phase",
      "DPE avant",
      "DPE après",
      "Gain %",
      "Logements",
      "Lots",
      "Copropriétaires",
      "Bâtiments",
      "Montant TTC",
      "Avancement %",
      "Chef de projet",
      "Syndic",
      "Gestionnaire",
      "Maître d'œuvre",
      "Date d'AG",
      "Fragile",
      "Prochaine étape",
    ],
    copros.map((c) => [
      c.name,
      c.adresse ?? "",
      c.code_postal ?? "",
      c.city ?? "",
      PHASES.find((p) => p.id === c.phase)?.label ?? c.phase,
      c.energy_before ?? "",
      c.energy_after ?? "",
      c.gain_pct ?? "",
      nbLogements(c),
      c.stats?.lots ?? 0,
      c.stats?.coproprietaires ?? 0,
      c.stats?.batiments ?? 0,
      c.stats?.montant_ttc ?? "",
      avancementAmo(c),
      c.chef_projet ?? "",
      c.syndic_name ?? "",
      c.gestionnaire_nom ?? "",
      c.maitre_oeuvre ?? "",
      // JJ/MM/AAAA : relu tel quel par « Importer un CSV »
      c.date_ag ? c.date_ag.split("-").reverse().join("/") : "",
      c.fragile ? "Oui" : "",
      c.stats?.next_task ?? "",
    ])
  );
}

export default function Dashboard() {
  useCrumbs([{ label: "Vos copropriétés" }]);
  const { data: copros, isLoading, error } = useCopros();
  const { chefProjetFilter, setChefProjetFilter } = useUi();
  const [phaseFilter, setPhaseFilter] = useState<PhaseId | "">("");
  const [cityFilter, setCityFilter] = useState<string>("");
  const [gestionnaireFilter, setGestionnaireFilter] = useState<string>("");
  const [moeFilter, setMoeFilter] = useState<string>("");
  const [tri, setTri] = useState<Tri>({ col: "name", desc: false });
  const [showNew, setShowNew] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showCorbeille, setShowCorbeille] = useState(false);
  const { data: corbeille } = useCoprosCorbeille();

  const cities = useMemo(
    () => Array.from(new Set((copros ?? []).map((c) => c.city).filter((v): v is string => !!v))).sort(),
    [copros]
  );
  const chefsProjets = useMemo(
    () =>
      Array.from(new Set((copros ?? []).map((c) => c.chef_projet).filter((v): v is string => !!v?.trim()))).sort((a, b) =>
        a.localeCompare(b, "fr")
      ),
    [copros]
  );
  // Gestionnaires de copropriété présents dans la base, par ordre alphabétique
  // (feedback Amir 20/09) - le filtre se combine à celui du chef de projet.
  const gestionnaires = useMemo(
    () =>
      Array.from(
        new Set((copros ?? []).map((c) => c.gestionnaire_nom?.trim()).filter((v): v is string => !!v))
      ).sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" })),
    [copros]
  );
  // Maîtres d'œuvre saisis sur les dossiers (feedback Amir 27/09) - « Sans
  // maître d'œuvre » isole les dossiers encore à renseigner.
  const maitresOeuvre = useMemo(
    () =>
      Array.from(
        new Set((copros ?? []).map((c) => c.maitre_oeuvre?.trim()).filter((v): v is string => !!v))
      ).sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" })),
    [copros]
  );
  const filtered = (copros ?? []).filter(
    (c) =>
      (!phaseFilter || c.phase === phaseFilter) &&
      (!cityFilter || c.city === cityFilter) &&
      (!chefProjetFilter || (chefProjetFilter === SANS_CHEF ? !c.chef_projet?.trim() : c.chef_projet === chefProjetFilter)) &&
      (!gestionnaireFilter || c.gestionnaire_nom?.trim() === gestionnaireFilter) &&
      (!moeFilter || (c.maitre_oeuvre?.trim() || SANS_MOE) === moeFilter)
  );
  // Ce que montre la liste est aussi ce que produit l'export : mêmes filtres,
  // même tri.
  const lignes = useMemo(
    () => trierCopros(filtered, tri),
    // `filtered` est reconstruit à chaque rendu : on dépend de ce qui le détermine.
    [copros, phaseFilter, cityFilter, chefProjetFilter, gestionnaireFilter, moeFilter, tri] // eslint-disable-line react-hooks/exhaustive-deps
  );

  if (error)
    return (
      <div className="placeholder-screen">
        <h2>Erreur de chargement</h2>
        <p>{String(error)}</p>
      </div>
    );

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Vos copropriétés</h1>
          <p className="page-sub">Suivi des projets de rénovation énergétique · Grand Est</p>
        </div>
        <span className="spacer"></span>
        <button
          className="se-btn se-btn-ghost btn-sm"
          title="Dossiers mis à la corbeille - restaurer ou supprimer définitivement"
          onClick={() => setShowCorbeille(true)}
        >
          <Icon name="trash" size={15} />
          Corbeille{(corbeille?.length ?? 0) > 0 ? ` (${corbeille!.length})` : ""}
        </button>
        <button
          className="se-btn se-btn-secondary btn-sm"
          title="Exporter en CSV la liste affichée (filtres et tri appliqués) - s'ouvre dans Excel"
          disabled={lignes.length === 0}
          onClick={() => exportCsv(lignes)}
        >
          <Icon name="download" size={16} />
          Exporter la liste
        </button>
        <button
          className="se-btn se-btn-secondary btn-sm"
          title="Créer plusieurs dossiers depuis un fichier CSV (modèle téléchargeable, aperçu avant création)"
          onClick={() => setShowImport(true)}
        >
          <Icon name="upload" size={16} />
          Importer un CSV
        </button>
        <button className="se-btn se-btn-primary btn-sm" onClick={() => setShowNew(true)}>
          <Icon name="plus" size={16} />
          Nouvelle copropriété
        </button>
      </div>

      <KpiStrip copros={filtered} />

      <div className="toolbar">
        <select
          className="chip-filter"
          value={phaseFilter}
          onChange={(e) => setPhaseFilter(e.target.value as PhaseId | "")}
          style={{ cursor: "pointer" }}
        >
          <option value="">Phase : toutes</option>
          {PHASES.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        <select
          className="chip-filter"
          value={cityFilter}
          onChange={(e) => setCityFilter(e.target.value)}
          style={{ cursor: "pointer" }}
        >
          <option value="">Secteur : tous</option>
          {cities.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
        {/* Filtre persistant : le choix reste le défaut du chef de projet à sa prochaine visite */}
        <select
          className="chip-filter"
          value={chefProjetFilter}
          onChange={(e) => setChefProjetFilter(e.target.value)}
          style={{ cursor: "pointer" }}
          title="Le filtre choisi reste appliqué par défaut à votre prochaine visite"
        >
          <option value="">Chef de projet : tous</option>
          {chefProjetFilter && chefProjetFilter !== SANS_CHEF && !chefsProjets.includes(chefProjetFilter) && (
            <option value={chefProjetFilter}>{chefProjetFilter}</option>
          )}
          {chefsProjets.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
          <option value={SANS_CHEF}>Non attribués</option>
        </select>
        <select
          className="chip-filter"
          value={gestionnaireFilter}
          onChange={(e) => setGestionnaireFilter(e.target.value)}
          style={{ cursor: "pointer" }}
          title="Gestionnaire de copropriété (côté syndic) en charge du dossier"
        >
          <option value="">Gestionnaire : tous</option>
          {gestionnaires.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
        <select
          className="chip-filter"
          value={moeFilter}
          onChange={(e) => setMoeFilter(e.target.value)}
          style={{ cursor: "pointer" }}
          title="Maître d'œuvre du dossier (saisi dans l'onglet Données)"
        >
          <option value="">Maître d'œuvre : tous</option>
          {maitresOeuvre.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
          <option value={SANS_MOE}>Sans maître d'œuvre</option>
        </select>
        <span style={{ flex: 1 }}></span>
        <span style={{ fontSize: 13, color: "var(--fg-muted)" }}>
          {isLoading ? "Chargement…" : `${filtered.length} dossier${filtered.length > 1 ? "s" : ""}`}
        </span>
      </div>

      <ListeView copros={lignes} tri={tri} setTri={setTri} />

      {!isLoading && filtered.length === 0 && (
        <div style={{ padding: 40, textAlign: "center", color: "var(--fg-muted)" }}>
          Aucun dossier pour l'instant - créez votre première copropriété.
        </div>
      )}

      {showNew && <NewCoproDialog onClose={() => setShowNew(false)} />}
      {showImport && <ImportCoprosDialog onClose={() => setShowImport(false)} />}
      {showCorbeille && <CorbeilleDialog onClose={() => setShowCorbeille(false)} />}
    </div>
  );
}

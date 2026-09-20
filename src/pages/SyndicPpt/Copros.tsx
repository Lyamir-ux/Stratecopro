// Liste des copropriétés de la branche PPT : statut du rapport, postes,
// prochain jalon, remarques ouvertes. En tête, la zone « Déposer un fichier » :
// le syndic glisse un PPPT, un PPT, un DPE collectif ou tout autre document,
// une petite fenêtre lui demande le nom de la copropriété, le type et la date
// (facultative), Entrée dépose (feedback Amir 20/09/2026, la page /depot a été
// supprimée). Une copropriété inconnue est créée avec son seul nom ; sa fiche
// (adresse, lots…) est complétée par Strat Eco à partir du rapport analysé.
// Un gestionnaire voit toute l'enseigne mais n'ouvre que ses dossiers (0072).
// Import du portefeuille (0077) : bouton « Importer mon portefeuille » ou tableau
// Excel / CSV glissé sur la zone de dépôt et reconnu par ses en-têtes ; chaque
// ligne est rapprochée de la base AMO → statut « En rénovation » dans la liste.
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Icon } from "@/components/Icon";
import { Modal } from "@/components/Modal";
import { Badge, DpeChip } from "@/components/ui";
import { useAuth } from "@/auth/AuthProvider";
import { TYPES_AVEC_HONORAIRES, useCreerPptCopro, useDeposerPptRapport, type PptCopro, type PptRapport, type ResultatImportPortefeuille, type TypeRapport } from "@/api/ppt";
import { EVENEMENT_DEPOT, prendreTampon } from "@/lib/ppt/depotTampon";
import type { DpeClass } from "@/lib/referentiels";
import { telechargerCsv } from "@/lib/csv";
import { fmtEuroCourt } from "@/lib/format";
import { cleGestionnaire } from "@/lib/ppt/indicateurs";
import { STATUT_RAPPORT_LABEL, TYPE_RAPPORT_LABEL } from "@/lib/ppt/referentiels";
import { TYPES_ANALYSES, TYPES_DEPOT, trouverCopro, typeDevine } from "@/lib/ppt/depot";
import { estPortefeuille, lireClasseur, statutParc, type StatutParc } from "@/lib/ppt/importPortefeuille";
import { STATUT_PARC_LABEL, StatutParcBadge, StatutRapportBadge, TITRE_VERROU, fmtDateCourte } from "./commun";
import { CorrigerDocument, type DocumentACorriger } from "./CorrigerDocument";
import { ImportPortefeuilleDialog } from "./ImportPortefeuille";
import type { PortefeuillePpt } from "./index";

/** Un tableau (Excel / CSV) dont les en-têtes ressemblent au portefeuille est routé vers l'import, pas vers le dépôt de document. */
async function estFichierPortefeuille(f: File): Promise<boolean> {
  if (!/\.(xlsx|xls|csv)$/i.test(f.name)) return false;
  try {
    const lu = lireClasseur(await f.arrayBuffer());
    return !!lu && estPortefeuille(lu.entetes);
  } catch {
    return false;
  }
}

/** Zone de télédéversement : glisser-déposer ou clic, plusieurs fichiers acceptés. */
function ZoneDepot({ onFichiers, disabled }: { onFichiers: (f: File[]) => void; disabled?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const [survol, setSurvol] = useState(false);
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Déposer un fichier"
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") ref.current?.click();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setSurvol(true);
      }}
      onDragLeave={() => setSurvol(false)}
      onDrop={(e) => {
        e.preventDefault();
        setSurvol(false);
        if (disabled) return;
        const fs = Array.from(e.dataTransfer.files ?? []);
        if (fs.length) onFichiers(fs);
      }}
      onClick={() => !disabled && ref.current?.click()}
      style={{
        border: `2px dashed ${survol ? "var(--accent)" : "var(--border-strong)"}`,
        borderRadius: "var(--radius-md)",
        padding: "14px 18px",
        cursor: disabled ? "default" : "pointer",
        background: survol ? "var(--accent-soft)" : "var(--bg)",
        display: "flex",
        alignItems: "center",
        gap: 12,
        marginBottom: 22,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <input
        ref={ref}
        type="file"
        multiple
        accept="application/pdf,.pdf,.xlsx,.xls,.csv,.docx,.doc"
        style={{ display: "none" }}
        onChange={(e) => {
          const fs = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (fs.length) onFichiers(fs);
        }}
      />
      <span style={{ width: 38, height: 38, borderRadius: 10, display: "inline-flex", alignItems: "center", justifyContent: "center", background: "var(--accent-soft)", color: "var(--color-primary-700)", flex: "none" }}>
        <Icon name="upload" size={20} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 14.5 }}>Déposer un fichier</div>
        <div className="se-small" style={{ color: "var(--fg-muted)" }}>
          Glissez ici un PPPT, un PPT, un DPE collectif, un PV d'AG ou tout autre document (PDF, Excel, Word), ou cliquez pour le choisir. Vous indiquerez ensuite la copropriété et le type. Un tableau de votre portefeuille (Excel / CSV) est reconnu et importé.
        </div>
      </div>
    </div>
  );
}

/** Petite fenêtre de dépôt : copropriété, type, date facultative ; Entrée valide. */
function FenetreDepot({
  fichier,
  reste,
  pf,
  onFait,
  onAnnuler,
}: {
  fichier: File;
  /** Fichiers encore en attente derrière celui-ci. */
  reste: number;
  pf: PortefeuillePpt;
  onFait: (copro: Pick<PptCopro, "id" | "nom">, type: TypeRapport, creee: boolean, rapport: PptRapport) => void;
  onAnnuler: () => void;
}) {
  const { profile, session } = useAuth();
  const creer = useCreerPptCopro();
  const deposer = useDeposerPptRapport();
  const [nom, setNom] = useState("");
  const [type, setType] = useState<TypeRapport>(() => typeDevine(fichier.name));
  const [date, setDate] = useState("");
  // taux d'honoraires de suivi de travaux : demandé pour un PPPT ou un PPT adopté,
  // prérempli avec le taux de l'enseigne, transmis à Strat Eco dans la notification (0076)
  const [taux, setTaux] = useState(() => (pf.params.taux_honoraires_pct != null ? String(pf.params.taux_honoraires_pct) : ""));
  const [erreur, setErreur] = useState<string | null>(null);
  const busy = creer.isPending || deposer.isPending;
  const existante = trouverCopro(pf.copros, nom);
  const enseigneId = pf.orgId;
  const avecHonoraires = TYPES_AVEC_HONORAIRES.includes(type);
  const tauxNum = taux.trim() === "" ? null : Number(taux.replace(",", "."));
  const tauxValide = !avecHonoraires || (tauxNum != null && Number.isFinite(tauxNum) && tauxNum >= 0 && tauxNum <= 100);
  const valide = nom.trim().length > 1 && !busy && tauxValide;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valide) return;
    setErreur(null);
    try {
      let copro: Pick<PptCopro, "id" | "organisation_id" | "nom"> | undefined = existante;
      let creee = false;
      if (!copro) {
        if (!enseigneId) throw new Error("Choisissez une enseigne dans le rail de gauche avant de créer une copropriété.");
        copro = await creer.mutateAsync({
          organisation_id: enseigneId,
          nom: nom.trim(),
          // Hors aperçu AMO, le déposant est le gestionnaire en charge : le dossier lui est rattaché.
          gestionnaire_nom: pf.apercuAmo ? null : (profile?.full_name ?? null),
          gestionnaire_email: pf.apercuAmo ? null : (session?.user.email ?? null),
        });
        creee = true;
      }
      const rapport = await deposer.mutateAsync({ copro, file: fichier, type, date_document: date || null, taux_honoraires_pct: avecHonoraires ? tauxNum : null });
      onFait(copro, type, creee, rapport);
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "Le dépôt a échoué. Réessayez.");
    }
  };

  const champ = { display: "flex", flexDirection: "column" as const, gap: 6, fontSize: 13, fontWeight: 500 };
  return (
    <Modal title="Déposer un fichier" onClose={onAnnuler} width={480} closeOnBackdrop={!busy}>
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="doc-row" style={{ padding: "0 0 12px" }}>
          <span className="d-ico"><Icon name="fileText" size={18} /></span>
          <div style={{ minWidth: 0 }}>
            <div className="d-name" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fichier.name}</div>
            <div className="d-sub">
              {(fichier.size / 1024 / 1024).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Mo{reste > 0 ? ` · ${reste} autre${reste > 1 ? "s" : ""} fichier${reste > 1 ? "s" : ""} en attente` : ""}
            </div>
          </div>
        </div>
        <label style={champ}>
          Nom de la copropriété *
          <input className="edit-inp" style={{ maxWidth: "none" }} list="ppt-copros-connues" value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Résidence Les Tilleuls" autoFocus required />
          <datalist id="ppt-copros-connues">
            {pf.copros.map((c) => (
              <option key={c.id} value={c.nom}>{c.commune ?? ""}</option>
            ))}
          </datalist>
          <span className="se-small" style={{ color: "var(--fg-muted)", fontWeight: 400 }}>
            {existante
              ? `Copropriété déjà suivie${existante.commune ? ` · ${existante.commune}` : ""}${existante.gestionnaire_nom ? ` · ${existante.gestionnaire_nom}` : ""}.`
              : nom.trim().length > 1
                ? "Nouvelle copropriété : sa fiche (adresse, lots, DPE) sera complétée par Strat Eco à partir du rapport."
                : "Tapez le nom : les copropriétés déjà suivies sont proposées."}
          </span>
        </label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label style={champ}>
            Type de document *
            <select className="edit-inp" style={{ maxWidth: "none" }} value={type} onChange={(e) => setType(e.target.value as TypeRapport)}>
              {TYPES_DEPOT.map((t) => (
                <option key={t} value={t}>{TYPE_RAPPORT_LABEL[t]}</option>
              ))}
            </select>
          </label>
          <label style={champ}>
            Date du document
            <input className="edit-inp" style={{ maxWidth: "none" }} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
        </div>
        {avecHonoraires && (
          <label style={champ}>
            Taux d'honoraires de suivi de travaux (%) *
            <input className="edit-inp" style={{ maxWidth: 160 }} inputMode="decimal" value={taux} onChange={(e) => setTaux(e.target.value)} placeholder="ex. 3" required />
            <span className="se-small" style={{ color: "var(--fg-muted)", fontWeight: 400 }}>
              Le taux que votre cabinet applique au suivi de ces travaux. Il est transmis à Strat Eco avec le document pour être appliqué au tableau PPT de sortie.
            </span>
          </label>
        )}
        {erreur && (
          <p style={{ margin: 0, padding: "8px 12px", borderRadius: "var(--radius-md)", background: "var(--color-error-50)", color: "var(--color-error-700)", fontSize: 13 }}>{erreur}</p>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, alignItems: "center" }}>
          <span className="se-small" style={{ color: "var(--fg-muted)", flex: 1 }}>Entrée pour déposer</span>
          <button type="button" className="se-btn se-btn-ghost btn-sm" onClick={onAnnuler} disabled={busy}>Annuler</button>
          <button type="submit" className="se-btn se-btn-primary btn-sm" disabled={!valide}>
            <Icon name="upload" size={14} />
            {busy ? "Dépôt en cours…" : "Déposer"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function CoprosPpt({ pf }: { pf: PortefeuillePpt }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const gestParam = params.get("gest");
  const [recherche, setRecherche] = useState("");
  const [gest, setGest] = useState<string>(gestParam ?? "tous");
  // file de fichiers déposés : la fenêtre traite le premier, puis le suivant
  const [fichiers, setFichiers] = useState<File[]>([]);
  const [confirmation, setConfirmation] = useState<{ copro: Pick<PptCopro, "id" | "nom">; type: TypeRapport; creee: boolean; acces: boolean; rapport: PptRapport } | null>(null);
  // correction d'un dépôt qui vient d'être rangé sous la mauvaise copropriété (0081)
  const [aCorriger, setACorriger] = useState<DocumentACorriger | null>(null);
  // import du portefeuille (0077) : fenêtre ouverte par le bouton ou par un tableau reconnu, bilan affiché ensuite
  const [importOuvert, setImportOuvert] = useState(false);
  const [fichierImport, setFichierImport] = useState<File | null>(null);
  const [bilanImport, setBilanImport] = useState<ResultatImportPortefeuille | null>(null);
  const [parc, setParc] = useState<"tous" | StatutParc>("tous");

  /** Fichiers reçus (zone ou bouton de l'en-tête) : un portefeuille part vers l'import, le reste vers le dépôt de document. */
  const recevoir = async (fs: File[]) => {
    setConfirmation(null);
    setBilanImport(null);
    const documents: File[] = [];
    for (const f of fs) {
      if (await estFichierPortefeuille(f)) {
        setFichierImport(f);
        setImportOuvert(true);
      } else {
        documents.push(f);
      }
    }
    if (documents.length) setFichiers((q) => [...q, ...documents]);
  };

  // fichiers choisis depuis le bouton de l'en-tête (toutes pages de la branche) : à l'arrivée et si déjà sur la page
  useEffect(() => {
    const prendre = () => {
      const t = prendreTampon();
      if (t.length) void recevoir(t);
    };
    prendre();
    window.addEventListener(EVENEMENT_DEPOT, prendre);
    return () => window.removeEventListener(EVENEMENT_DEPOT, prendre);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const gestionnaires = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of pf.copros) m.set(cleGestionnaire(c), c.gestionnaire_nom?.trim() || "Non attribué");
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], "fr"));
  }, [pf.copros]);

  const q = recherche.trim().toLowerCase();
  const lignes = pf.copros
    .filter((c) => gest === "tous" || cleGestionnaire(c) === gest)
    .filter((c) => parc === "tous" || statutParc(c) === parc)
    .filter((c) => !q || c.nom.toLowerCase().includes(q) || (c.commune ?? "").toLowerCase().includes(q) || (c.gestionnaire_nom ?? "").toLowerCase().includes(q));
  const enReno = pf.copros.filter((c) => statutParc(c) === "en_reno").length;
  const aPresenter = pf.copros.filter((c) => statutParc(c) === "pppt_a_presenter").length;

  return (
    <div className="page fade" style={{ padding: 0 }}>
      <h1 className="sec-title">Copropriétés</h1>
      <p className="sec-sub" style={{ marginBottom: 16 }}>
        {pf.copros.length} copropriété{pf.copros.length > 1 ? "s" : ""} suivie{pf.copros.length > 1 ? "s" : ""}
        {enReno ? ` · ${enReno} en rénovation avec Strat Eco` : ""}
        {aPresenter ? ` · ${aPresenter} PPPT à présenter` : ""}
        {pf.nomEnseigne ? ` · ${pf.nomEnseigne}` : ""}.
      </p>

      <ZoneDepot onFichiers={(fs) => void recevoir(fs)} disabled={fichiers.length > 0 || importOuvert} />

      {importOuvert && (
        <ImportPortefeuilleDialog
          pf={pf}
          fichierInitial={fichierImport}
          onClose={(resultat) => {
            setImportOuvert(false);
            setFichierImport(null);
            if (resultat) setBilanImport(resultat);
          }}
        />
      )}

      {bilanImport && !importOuvert && (
        <div className="panel" style={{ padding: "12px 16px", marginBottom: 18, display: "flex", alignItems: "center", gap: 12, borderColor: "var(--accent)" }}>
          <Icon name="checkCircle" size={22} style={{ color: "var(--color-primary-700)", flex: "none" }} />
          <div style={{ flex: 1, fontSize: 13.5 }}>
            <strong>Portefeuille importé</strong> : {bilanImport.creees} copropriété{bilanImport.creees > 1 ? "s" : ""} créée{bilanImport.creees > 1 ? "s" : ""}, {bilanImport.mises_a_jour} fiche{bilanImport.mises_a_jour > 1 ? "s" : ""} complétée{bilanImport.mises_a_jour > 1 ? "s" : ""}
            {bilanImport.en_reno ? `, ${bilanImport.en_reno} en rénovation avec Strat Eco` : ""}.
          </div>
          {bilanImport.en_reno > 0 && (
            <button className="se-btn se-btn-secondary btn-sm" onClick={() => setParc("en_reno")}>
              Voir <Icon name="arrowRight" size={14} />
            </button>
          )}
          <button className="icon-btn" title="Fermer" onClick={() => setBilanImport(null)}>
            <Icon name="x" size={15} />
          </button>
        </div>
      )}

      {confirmation && fichiers.length === 0 && (
        <div className="panel" style={{ padding: "12px 16px", marginBottom: 18, display: "flex", alignItems: "center", gap: 12, borderColor: "var(--accent)" }}>
          <Icon name="checkCircle" size={22} style={{ color: "var(--color-primary-700)", flex: "none" }} />
          <div style={{ flex: 1, fontSize: 13.5 }}>
            <strong>{TYPE_RAPPORT_LABEL[confirmation.type]} déposé</strong> pour {confirmation.copro.nom}
            {confirmation.creee ? " (nouvelle copropriété)" : ""}.{" "}
            {TYPES_ANALYSES.includes(confirmation.type) ? "Strat Eco est prévenu et vous alertera par e-mail une fois l'analyse validée." : "Le document est rangé dans l'onglet Documents de la copropriété."}
          </div>
          <button className="se-btn se-btn-ghost btn-sm" title="Mauvaise copropriété, mauvais type ou nom de fichier à revoir" onClick={() => setACorriger(confirmation.rapport)}>
            <Icon name="edit" size={14} /> Corriger
          </button>
          {confirmation.acces && (
            <button className="se-btn se-btn-secondary btn-sm" onClick={() => navigate(`/syndic/ppt/copros/${confirmation.copro.id}`)}>
              Ouvrir <Icon name="arrowRight" size={14} />
            </button>
          )}
          <button className="icon-btn" title="Fermer" onClick={() => setConfirmation(null)}>
            <Icon name="x" size={15} />
          </button>
        </div>
      )}

      {aCorriger && (
        <CorrigerDocument
          rapport={aCorriger}
          onClose={(corrige) => {
            setACorriger(null);
            if (corrige) setConfirmation(null);
          }}
        />
      )}

      {fichiers[0] && (
        <FenetreDepot
          key={`${fichiers[0].name}-${fichiers[0].size}-${fichiers.length}`}
          fichier={fichiers[0]}
          reste={fichiers.length - 1}
          pf={pf}
          onFait={(copro, type, creee, rapport) => {
            // accès : copro connue et ouvrable, ou créée par le déposant lui-même
            const connue = pf.copros.find((c) => c.id === copro.id);
            setConfirmation({ copro, type, creee, acces: creee || !!connue?.acces, rapport });
            setFichiers((q) => q.slice(1));
          }}
          onAnnuler={() => setFichiers((q) => q.slice(1))}
        />
      )}

      <div className="panel">
        <div className="p-head">
          <Icon name="building" size={18} />
          <h3>{lignes.length} dossier{lignes.length > 1 ? "s" : ""}</h3>
          <span style={{ flex: 1 }}></span>
          <input className="edit-inp" style={{ maxWidth: 220 }} placeholder="Rechercher…" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
          <select className="edit-inp" style={{ maxWidth: 190 }} value={parc} onChange={(e) => setParc(e.target.value as "tous" | StatutParc)} title="Filtrer par statut du portefeuille">
            <option value="tous">Tous les statuts</option>
            <option value="en_reno">{STATUT_PARC_LABEL.en_reno} avec Strat Eco</option>
            <option value="pppt_a_presenter">{STATUT_PARC_LABEL.pppt_a_presenter} (+ 15 ans)</option>
            <option value="pppt_presente">{STATUT_PARC_LABEL.pppt_presente}</option>
          </select>
          {gestionnaires.length > 1 && (
            <select className="edit-inp" style={{ maxWidth: 200 }} value={gest} onChange={(e) => setGest(e.target.value)}>
              <option value="tous">Tous les gestionnaires</option>
              {gestionnaires.map(([k, nom]) => (
                <option key={k} value={k}>{nom}</option>
              ))}
            </select>
          )}
          <button
            className="se-btn se-btn-ghost btn-sm"
            onClick={() =>
              telechargerCsv(
                "copros-ppt.csv",
                ["Copropriété", "Commune", "Gestionnaire", "Suivi", "Plus de 15 ans", "PPPT présenté", "Logements", "Lots", "DPE", "Statut du rapport", "Validé le", "Postes", "Montant HT (base)", "Prochaine année", "Dernière AG", "Remarques ouvertes"],
                lignes.map((c) => [
                  c.nom, c.commune ?? "", c.gestionnaire_nom ?? "",
                  statutParc(c) === "en_reno" ? "En rénovation" : STATUT_PARC_LABEL[statutParc(c)].replace("-", ""),
                  c.plus_de_15_ans == null ? "" : c.plus_de_15_ans ? "oui" : "non",
                  c.pppt_presente == null ? "" : c.pppt_presente ? "oui" : "non",
                  c.nb_logements ?? "", c.nb_lots ?? "", c.etiquette_energie ?? "",
                  STATUT_RAPPORT_LABEL[c.stats?.statut_rapport ?? ""] ?? "", c.stats?.valide_le ? fmtDateCourte(c.stats.valide_le) : "",
                  c.stats?.postes ?? 0, c.stats?.montant_ht_base ?? 0, c.stats?.prochaine_annee ?? "", c.stats?.derniere_ag ? fmtDateCourte(c.stats.derniere_ag) : "", c.stats?.remarques_ouvertes ?? 0,
                ])
              )
            }
          >
            <Icon name="download" size={13} />
            CSV
          </button>
          <button
            className="se-btn se-btn-secondary btn-sm"
            onClick={() => { setBilanImport(null); setFichierImport(null); setImportOuvert(true); }}
            disabled={importOuvert || fichiers.length > 0}
            title="Déposer le tableau de vos copropriétés (nom, adresse, commune, logements, plus de 15 ans ?, PPPT présenté ?)"
          >
            <Icon name="upload" size={13} />
            {pf.direction ? "Importer un portefeuille" : "Importer mon portefeuille"}
          </button>
        </div>
        <div className="p-body" style={{ paddingTop: 0 }}>
          <div className="tablewrap">
            <table className="dossiers" style={{ fontSize: 13 }}>
              <thead>
                <tr>
                  <th>Copropriété</th>
                  {pf.direction && <th>Gestionnaire</th>}
                  <th>Suivi</th>
                  <th>DPE</th>
                  <th className="num">Logements</th>
                  <th>Rapport</th>
                  <th className="num">Postes</th>
                  <th className="num">Montant HT</th>
                  <th className="num">Prochain jalon</th>
                  <th>Dernière AG</th>
                  <th className="num">Remarques</th>
                </tr>
              </thead>
              <tbody>
                {lignes.map((c) => (
                  <tr key={c.id} onClick={c.acces ? () => navigate(`/syndic/ppt/copros/${c.id}`) : undefined} style={{ cursor: c.acces ? "pointer" : "default", opacity: c.acces ? 1 : 0.55 }} title={c.acces ? undefined : TITRE_VERROU(c)}>
                    <td style={{ fontWeight: 600 }}>
                      {c.nom}
                      {(c.commune || c.adresse) && <span style={{ display: "block", fontSize: 11.5, color: "var(--fg-muted)", fontWeight: 400 }}>{[c.adresse, c.commune].filter(Boolean).join(", ")}</span>}
                    </td>
                    {pf.direction && <td>{c.gestionnaire_nom || <span style={{ color: "var(--fg-muted)" }}>Non attribué</span>}</td>}
                    <td><StatutParcBadge c={c} /></td>
                    <td>{c.etiquette_energie ? <DpeChip cls={c.etiquette_energie as DpeClass} /> : "-"}</td>
                    <td className="num">{c.nb_logements ?? "-"}</td>
                    <td>{c.stats?.statut_rapport ? <StatutRapportBadge statut={c.stats.statut_rapport} /> : <Badge kind="neutral">Aucun</Badge>}</td>
                    <td className="num">{c.stats?.postes || "-"}{c.stats?.postes_non_chiffres ? <span title="postes non chiffrés" style={{ color: "var(--color-warning-700)" }}> ({c.stats.postes_non_chiffres} ?)</span> : null}</td>
                    <td className="num">{c.stats?.montant_ht_base ? fmtEuroCourt(c.stats.montant_ht_base) : "-"}</td>
                    <td className="num">{c.stats?.prochaine_annee ?? "-"}</td>
                    <td>{c.stats?.derniere_ag ? fmtDateCourte(c.stats.derniere_ag) : <span style={{ color: "var(--fg-muted)" }}>jamais</span>}</td>
                    <td className="num">{c.stats?.remarques_ouvertes ? <span style={{ color: "var(--color-warning-700)", fontWeight: 700 }}>{c.stats.remarques_ouvertes}</span> : "-"}</td>
                  </tr>
                ))}
                {lignes.length === 0 && (
                  <tr>
                    <td colSpan={11} style={{ color: "var(--fg-muted)" }}>
                      {pf.copros.length === 0 ? "Aucune copropriété pour l'instant : importez votre portefeuille (bouton ci-dessus) ou déposez un premier fichier." : "Aucun dossier ne correspond à la recherche."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="se-small" style={{ color: "var(--fg-muted)", marginTop: 12, marginBottom: 0 }}>
            Le rapport passe par quatre états : déposé, à relire (analysé), validé (les postes et remarques deviennent visibles) ou rejeté. Le montant est la somme des coûts HT en année de base du plan validé.
            « En rénovation » signale une copropriété dont Strat Eco suit le dossier de rénovation globale (rapprochement fait à l'import du portefeuille) ; « PPPT à présenter » une copropriété de plus de 15 ans sans PPPT présenté.
          </p>
        </div>
      </div>
    </div>
  );
}

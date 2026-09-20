// Import du portefeuille du gestionnaire (0077) : fichier Excel ou CSV à six
// colonnes (nom, adresse, commune, logements, plus de 15 ans ?, PPPT présenté ?)
// → correspondance des colonnes (devinée, corrigeable) → aperçu avec les fiches
// déjà suivies et les cellules non comprises → import par la RPC
// ppt_importer_portefeuille, qui rapproche chaque ligne de la base AMO pour
// afficher « En rénovation » dans le listing.
import { useEffect, useMemo, useRef, useState } from "react";
import { utils, writeFile } from "xlsx";
import { Icon } from "@/components/Icon";
import { Modal } from "@/components/Modal";
import { Badge } from "@/components/ui";
import { useImporterPortefeuille, type ResultatImportPortefeuille } from "@/api/ppt";
import {
  COLONNES_IMPORT,
  LABEL_CHAMP,
  classerLignes,
  devinerColonnes,
  lireClasseur,
  lireLignes,
  modeleImport,
  type ChampImport,
  type ClasseurLu,
} from "@/lib/ppt/importPortefeuille";
import type { PortefeuillePpt } from "./index";

const CHAMPS_CHOIX: ChampImport[] = [...COLONNES_IMPORT.map((c) => c.id), "ignorer"];

/** Modèle Excel proposé au téléchargement (en-têtes du brief + deux lignes d'exemple). */
export function telechargerModelePortefeuille() {
  const ws = utils.aoa_to_sheet(modeleImport());
  ws["!cols"] = [{ wch: 34 }, { wch: 30 }, { wch: 26 }, { wch: 20 }, { wch: 38 }, { wch: 26 }];
  const wb = utils.book_new();
  utils.book_append_sheet(wb, ws, "Portefeuille");
  writeFile(wb, "modele-portefeuille-ppt.xlsx");
}

const ouiNon = (b: boolean | null) => (b === true ? "oui" : b === false ? "non" : "");

export function ImportPortefeuilleDialog({
  pf,
  fichierInitial,
  onClose,
}: {
  pf: PortefeuillePpt;
  /** Fichier déjà choisi (glissé sur la zone de dépôt et reconnu comme un portefeuille). */
  fichierInitial?: File | null;
  onClose: (resultat?: ResultatImportPortefeuille) => void;
}) {
  const importer = useImporterPortefeuille();
  const inputRef = useRef<HTMLInputElement>(null);
  const [nomFichier, setNomFichier] = useState<string | null>(null);
  const [classeur, setClasseur] = useState<ClasseurLu | null>(null);
  const [correspondance, setCorrespondance] = useState<ChampImport[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [resultat, setResultat] = useState<ResultatImportPortefeuille | null>(null);
  const [voirErreurs, setVoirErreurs] = useState(false);

  const lireFichier = async (f: File) => {
    setErreur(null);
    try {
      const lu = lireClasseur(await f.arrayBuffer());
      if (!lu) {
        setErreur("Aucune ligne d'en-tête trouvée dans ce fichier. Vérifiez qu'il contient un tableau avec une ligne de titres de colonnes.");
        return;
      }
      setNomFichier(f.name);
      setClasseur(lu);
      setCorrespondance(devinerColonnes(lu.entetes));
    } catch {
      setErreur("Le fichier n'a pas pu être lu. Formats acceptés : Excel (.xlsx, .xls) ou CSV.");
    }
  };

  useEffect(() => {
    if (fichierInitial) void lireFichier(fichierInitial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fichierInitial]);

  const lecture = useMemo(() => (classeur ? lireLignes(classeur.grille, correspondance) : null), [classeur, correspondance]);
  const connues = useMemo(() => pf.copros.filter((c) => !pf.orgId || c.organisation_id === pf.orgId), [pf.copros, pf.orgId]);
  const classement = useMemo(() => (lecture ? classerLignes(lecture.lignes, connues) : null), [lecture, connues]);
  const idsExistantes = useMemo(() => new Set((classement?.existantes ?? []).map((e) => e.ligne.ligne)), [classement]);

  const nomReconnu = correspondance.includes("nom");
  const peutImporter = !!lecture && lecture.lignes.length > 0 && nomReconnu && !!pf.orgId && !importer.isPending;

  const lancer = async () => {
    if (!lecture || !pf.orgId) return;
    setErreur(null);
    try {
      const r = await importer.mutateAsync({ organisation_id: pf.orgId, lignes: lecture.lignes });
      setResultat(r);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "L'import a échoué. Réessayez.");
    }
  };

  const changerChamp = (i: number, champ: ChampImport) => {
    setCorrespondance((prev) => prev.map((c, k) => (k === i ? champ : c === champ && champ !== "ignorer" ? "ignorer" : c)));
  };

  const largeur = 860;

  // ---------- Étape 3 : résultat ----------
  if (resultat) {
    return (
      <Modal title="Portefeuille importé" onClose={() => onClose(resultat)} width={520}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          <Icon name="checkCircle" size={28} style={{ color: "var(--color-primary-700)", flex: "none" }} />
          <div style={{ fontSize: 14, lineHeight: 1.5 }}>
            <p style={{ margin: "0 0 8px" }}>
              <strong>{resultat.creees}</strong> copropriété{resultat.creees > 1 ? "s" : ""} créée{resultat.creees > 1 ? "s" : ""},{" "}
              <strong>{resultat.mises_a_jour}</strong> fiche{resultat.mises_a_jour > 1 ? "s" : ""} déjà suivie{resultat.mises_a_jour > 1 ? "s" : ""} complétée{resultat.mises_a_jour > 1 ? "s" : ""}
              {resultat.ignorees ? `, ${resultat.ignorees} ligne${resultat.ignorees > 1 ? "s" : ""} sans nom écartée${resultat.ignorees > 1 ? "s" : ""}` : ""}.
            </p>
            <p style={{ margin: 0 }}>
              {resultat.en_reno > 0 ? (
                <>
                  <strong>{resultat.en_reno}</strong> copropriété{resultat.en_reno > 1 ? "s" : ""} de ce portefeuille {resultat.en_reno > 1 ? "sont" : "est"} en rénovation avec Strat Eco :{" "}
                  {resultat.en_reno > 1 ? "elles apparaissent" : "elle apparaît"} avec le statut « En rénovation » dans votre liste.
                </>
              ) : (
                "Aucune de ces copropriétés n'a de dossier de rénovation en cours chez Strat Eco."
              )}
            </p>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18 }}>
          <button className="se-btn se-btn-primary btn-sm" onClick={() => onClose(resultat)}>
            Voir la liste <Icon name="arrowRight" size={14} />
          </button>
        </div>
      </Modal>
    );
  }

  // ---------- Étape 1 : choix du fichier ----------
  if (!classeur) {
    return (
      <Modal title="Importer mon portefeuille" onClose={() => onClose()} width={620}>
        <p style={{ margin: "0 0 14px", fontSize: 13.5, color: "var(--fg-muted)", lineHeight: 1.5 }}>
          Déposez le tableau de vos copropriétés (Excel ou CSV) avec six colonnes : nom de la copropriété, adresse, commune, nombre de logements,
          « copropriété de plus de 15 ans ? » et « PPPT présenté ? » (oui / non). Les copropriétés déjà suivies sont complétées, les autres sont créées
          et vous en devenez le gestionnaire. Chaque ligne est rapprochée des dossiers de rénovation suivis par Strat Eco.
        </p>
        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            if (f) void lireFichier(f);
          }}
          style={{ border: "2px dashed var(--border-strong)", borderRadius: "var(--radius-md)", padding: "26px 18px", textAlign: "center", cursor: "pointer", background: "var(--bg)" }}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void lireFichier(f);
            }}
          />
          <Icon name="upload" size={26} style={{ color: "var(--color-primary-700)" }} />
          <div style={{ fontWeight: 700, marginTop: 8 }}>Glissez votre tableau ici ou cliquez pour le choisir</div>
          <div className="se-small" style={{ color: "var(--fg-muted)", marginTop: 4 }}>Excel (.xlsx, .xls) ou CSV · 2 000 lignes maximum</div>
        </div>
        {erreur && (
          <p style={{ margin: "12px 0 0", padding: "8px 12px", borderRadius: "var(--radius-md)", background: "var(--color-error-50)", color: "var(--color-error-700)", fontSize: 13 }}>{erreur}</p>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16 }}>
          <button className="se-btn se-btn-ghost btn-sm" onClick={telechargerModelePortefeuille}>
            <Icon name="download" size={14} />
            Télécharger le modèle Excel
          </button>
          <button className="se-btn se-btn-ghost btn-sm" onClick={() => onClose()}>Annuler</button>
        </div>
      </Modal>
    );
  }

  // ---------- Étape 2 : correspondance des colonnes et aperçu ----------
  const lignes = lecture?.lignes ?? [];
  const apercu = lignes.slice(0, 40);
  return (
    <Modal title="Importer mon portefeuille" onClose={() => onClose()} width={largeur} closeOnBackdrop={!importer.isPending}>
      <div className="doc-row" style={{ padding: "0 0 12px" }}>
        <span className="d-ico"><Icon name="table" size={18} /></span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="d-name" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nomFichier}</div>
          <div className="d-sub">Feuille « {classeur.feuille} » · {classeur.grille.length} ligne{classeur.grille.length > 1 ? "s" : ""} sous l'en-tête</div>
        </div>
        <button className="se-btn se-btn-ghost btn-sm" onClick={() => { setClasseur(null); setNomFichier(null); }} disabled={importer.isPending}>
          Autre fichier
        </button>
      </div>

      <h4 style={{ margin: "6px 0 8px", fontSize: 13.5 }}>Colonnes du fichier</h4>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 8 }}>
        {classeur.entetes.map((h, i) => (
          <label key={i} style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5 }}>
            <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={h || `Colonne ${i + 1}`}>{h || <em style={{ color: "var(--fg-muted)" }}>Colonne {i + 1}</em>}</span>
            <select className="edit-inp" style={{ maxWidth: "none", fontSize: 12.5 }} value={correspondance[i] ?? "ignorer"} onChange={(e) => changerChamp(i, e.target.value as ChampImport)}>
              {CHAMPS_CHOIX.map((c) => (
                <option key={c} value={c}>{LABEL_CHAMP[c]}</option>
              ))}
            </select>
          </label>
        ))}
      </div>
      {!nomReconnu && (
        <p style={{ margin: "10px 0 0", padding: "8px 12px", borderRadius: "var(--radius-md)", background: "var(--color-warning-50)", color: "var(--color-warning-700)", fontSize: 13 }}>
          Indiquez quelle colonne contient le nom de la copropriété.
        </p>
      )}

      {lecture && (
        <>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", margin: "16px 0 8px" }}>
            <Badge kind="primary">{lignes.length} copropriété{lignes.length > 1 ? "s" : ""}</Badge>
            {classement && classement.nouvelles.length > 0 && <Badge kind="blue">{classement.nouvelles.length} nouvelle{classement.nouvelles.length > 1 ? "s" : ""}</Badge>}
            {classement && classement.existantes.length > 0 && <Badge kind="neutral">{classement.existantes.length} déjà suivie{classement.existantes.length > 1 ? "s" : ""} (fiche complétée)</Badge>}
            {lecture.doublons.length > 0 && <Badge kind="warn">{lecture.doublons.length} doublon{lecture.doublons.length > 1 ? "s" : ""} ignoré{lecture.doublons.length > 1 ? "s" : ""}</Badge>}
            {lecture.erreurs.length > 0 && (
              <button className="se-btn se-btn-ghost btn-sm" style={{ color: "var(--color-warning-700)" }} onClick={() => setVoirErreurs((v) => !v)}>
                <Icon name="alert" size={13} />
                {lecture.erreurs.length} cellule{lecture.erreurs.length > 1 ? "s" : ""} non comprise{lecture.erreurs.length > 1 ? "s" : ""}
                <Icon name={voirErreurs ? "chevronUp" : "chevronDown"} size={13} />
              </button>
            )}
          </div>
          {voirErreurs && lecture.erreurs.length > 0 && (
            <ul className="se-small" style={{ margin: "0 0 10px", paddingLeft: 18, color: "var(--fg-muted)", maxHeight: 120, overflow: "auto" }}>
              {lecture.erreurs.slice(0, 30).map((e, i) => (
                <li key={i}>Ligne {e.ligne} : {e.message}</li>
              ))}
              {lecture.erreurs.length > 30 && <li>… et {lecture.erreurs.length - 30} autres</li>}
            </ul>
          )}

          <div className="tablewrap" style={{ maxHeight: 320, overflow: "auto", border: "1px solid var(--border)", borderRadius: "var(--radius-md)" }}>
            <table className="dossiers" style={{ fontSize: 12.5 }}>
              <thead>
                <tr>
                  <th>Copropriété</th>
                  <th>Adresse</th>
                  <th>Commune</th>
                  <th className="num">Logements</th>
                  <th>+ 15 ans</th>
                  <th>PPPT présenté</th>
                </tr>
              </thead>
              <tbody>
                {apercu.map((l) => (
                  <tr key={l.ligne}>
                    <td style={{ fontWeight: 600 }}>
                      {l.nom}
                      {idsExistantes.has(l.ligne) && <span style={{ display: "block", fontSize: 11, color: "var(--fg-muted)", fontWeight: 400 }}>déjà suivie : fiche complétée</span>}
                    </td>
                    <td>{l.adresse ?? "-"}</td>
                    <td>{[l.code_postal, l.commune].filter(Boolean).join(" ") || "-"}</td>
                    <td className="num">{l.nb_logements ?? "-"}</td>
                    <td>{ouiNon(l.plus_de_15_ans) || "-"}</td>
                    <td>{ouiNon(l.pppt_presente) || "-"}</td>
                  </tr>
                ))}
                {lignes.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ color: "var(--fg-muted)" }}>Aucune ligne exploitable : vérifiez la colonne du nom.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {lignes.length > apercu.length && (
            <p className="se-small" style={{ color: "var(--fg-muted)", margin: "6px 0 0" }}>Aperçu des {apercu.length} premières lignes sur {lignes.length}.</p>
          )}
        </>
      )}

      {erreur && (
        <p style={{ margin: "12px 0 0", padding: "8px 12px", borderRadius: "var(--radius-md)", background: "var(--color-error-50)", color: "var(--color-error-700)", fontSize: 13 }}>{erreur}</p>
      )}
      {!pf.orgId && (
        <p style={{ margin: "12px 0 0", padding: "8px 12px", borderRadius: "var(--radius-md)", background: "var(--color-warning-50)", color: "var(--color-warning-700)", fontSize: 13 }}>
          Choisissez une enseigne dans le rail de gauche avant d'importer un portefeuille.
        </p>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, alignItems: "center", marginTop: 16 }}>
        <span className="se-small" style={{ color: "var(--fg-muted)", flex: 1 }}>
          Les fiches déjà suivies gardent leur gestionnaire et leurs données ; seuls les champs vides et les deux réponses oui / non sont mis à jour.
        </span>
        <button className="se-btn se-btn-ghost btn-sm" onClick={() => onClose()} disabled={importer.isPending}>Annuler</button>
        <button className="se-btn se-btn-primary btn-sm" onClick={lancer} disabled={!peutImporter}>
          <Icon name="upload" size={14} />
          {importer.isPending ? "Import en cours…" : `Importer ${lignes.length} copropriété${lignes.length > 1 ? "s" : ""}`}
        </button>
      </div>
    </Modal>
  );
}

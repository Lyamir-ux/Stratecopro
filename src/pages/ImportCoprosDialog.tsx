// Import CSV de copropriétés depuis le tableau de bord - idée d'Amir du
// 01/10/2026 (« un bouton d'importation CSV »). Modèle à télécharger, aperçu
// ligne à ligne avant toute écriture (erreurs, noms déjà pris, fiches de
// maître d'œuvre et organisations qui seront créées), puis création une à une
// par creerCopro, exactement comme la fenêtre « Nouvelle copropriété ».
import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Icon } from "@/components/Icon";
import { Modal } from "@/components/Modal";
import {
  creerCopro,
  erreurCreation,
  invaliderCreationCopros,
  notifierPassation,
  slugCopro,
  useCopros,
  useCoprosCorbeille,
} from "@/api/copros";
import { usePrestataires } from "@/api/prestataires";
import { useOrganisations } from "@/api/organisations";
import { telechargerCsv } from "@/lib/csv";
import { fmtEuro } from "@/lib/format";
import { COLONNES_IMPORT, analyserImport, decoderCsv, lireCsv, type AnalyseImport, type LigneImport } from "@/lib/importCopros";
import { PHASES } from "@/lib/referentiels";

interface Resultat {
  ligne: number;
  nom: string;
  id: string | null;
  erreur: string | null;
  avertissements: string[];
}

/** En-têtes seuls : une ligne d'exemple risquerait d'être importée par mégarde. */
function telechargerModele() {
  telechargerCsv(
    "modele-import-coproprietes.csv",
    COLONNES_IMPORT.map((c) => c.entete),
    []
  );
}

export function ImportCoprosDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { data: copros } = useCopros();
  const { data: corbeille } = useCoprosCorbeille();
  const { data: prestataires } = usePrestataires();
  const { data: organisations } = useOrganisations();
  const fichierRef = useRef<HTMLInputElement>(null);
  const [fichier, setFichier] = useState<{ nom: string; cellules: string[][] } | null>(null);
  const [erreurFichier, setErreurFichier] = useState<string | null>(null);
  const [prevenir, setPrevenir] = useState(false);
  const [enCours, setEnCours] = useState<{ fait: number; total: number } | null>(null);
  const [resultats, setResultats] = useState<Resultat[] | null>(null);

  const pret = !!copros && !!corbeille && !!prestataires && !!organisations;
  const analyse: AnalyseImport | null = useMemo(() => {
    if (!fichier || !pret) return null;
    return analyserImport(fichier.cellules, {
      // corbeille comprise : le nom (slug) d'un dossier est unique en base
      slugsPris: new Set([...copros, ...corbeille].map((c) => c.slug ?? slugCopro(c.name))),
      slug: slugCopro,
      prestataires: prestataires.map((p) => p.raison_sociale),
      organisations,
    });
  }, [fichier, pret, copros, corbeille, prestataires, organisations]);

  const aCreer = analyse?.lignes.filter((l) => l.input) ?? [];
  const enErreur = analyse?.lignes.filter((l) => !l.input) ?? [];
  const sansNom = analyse && !analyse.colonnes.includes("name");

  const lire = async (f: File) => {
    setErreurFichier(null);
    setResultats(null);
    try {
      const cellules = lireCsv(decoderCsv(await f.arrayBuffer()));
      if (cellules.length < 2) {
        setErreurFichier("Le fichier ne contient aucune ligne sous l'en-tête.");
        setFichier(null);
        return;
      }
      setFichier({ nom: f.name, cellules });
    } catch {
      setErreurFichier("Le fichier n'a pas pu être lu. Enregistrez-le au format CSV (séparateur point-virgule) depuis Excel.");
      setFichier(null);
    }
  };

  const creer = async () => {
    const lignes = aCreer;
    const out: Resultat[] = [];
    setEnCours({ fait: 0, total: lignes.length });
    for (const l of lignes) {
      try {
        const copro = await creerCopro(l.input!);
        out.push({ ligne: l.ligne, nom: l.nom, id: copro.id, erreur: null, avertissements: copro.avertissements });
        // Alerte de passation seulement si demandée : Resend envoie de vrais e-mails
        if (prevenir && l.input!.chef_projet.trim()) void notifierPassation(copro.id, null, l.input!.chef_projet.trim());
      } catch (e) {
        out.push({ ligne: l.ligne, nom: l.nom, id: null, erreur: erreurCreation(e), avertissements: [] });
      }
      setEnCours({ fait: out.length, total: lignes.length });
    }
    invaliderCreationCopros(qc);
    void qc.invalidateQueries({ queryKey: ["copros-corbeille"] });
    setEnCours(null);
    setResultats(out);
  };

  const fermer = () => {
    if (enCours) return; // pas d'interruption au milieu des créations
    onClose();
  };

  // ---------- bilan ----------
  if (resultats) {
    const crees = resultats.filter((r) => r.id);
    const rates = resultats.filter((r) => !r.id);
    return (
      <Modal title="Import terminé" onClose={onClose} width={720}>
        <p className="se-small" style={{ marginTop: 0 }}>
          <b>{crees.length}</b> dossier{crees.length > 1 ? "s" : ""} créé{crees.length > 1 ? "s" : ""}
          {rates.length > 0 && <>, <b style={{ color: "var(--color-error-700)" }}>{rates.length} en échec</b></>}
          {enErreur.length > 0 && <> ; {enErreur.length} ligne{enErreur.length > 1 ? "s" : ""} écartée{enErreur.length > 1 ? "s" : ""} à l'aperçu</>}.
        </p>
        <div className="imp-copros-table">
          <table className="fact-apercu">
            <thead>
              <tr>
                <th>Ligne</th>
                <th>Copropriété</th>
                <th>Résultat</th>
              </tr>
            </thead>
            <tbody>
              {resultats.map((r) => (
                <tr key={r.ligne}>
                  <td className="c">{r.ligne}</td>
                  <td className="fort">
                    {r.id ? (
                      <Link to={`/copros/${r.id}`} onClick={onClose}>
                        {r.nom}
                      </Link>
                    ) : (
                      r.nom
                    )}
                  </td>
                  <td>
                    {r.erreur ? (
                      <span className="imp-copros-ko">{r.erreur}</span>
                    ) : r.avertissements.length > 0 ? (
                      <span className="imp-copros-attention">Créé, mais {r.avertissements.join(" ; ")}</span>
                    ) : (
                      <span className="imp-copros-ok">Créé</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="fact-modal-actions">
          <button className="se-btn se-btn-primary btn-sm" onClick={onClose}>
            Fermer
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Importer des copropriétés" onClose={fermer} width={analyse ? 920 : 640} closeOnBackdrop={false}>
      <input
        ref={fichierRef}
        type="file"
        accept=".csv,text/csv"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void lire(f);
          e.target.value = "";
        }}
      />
      {!fichier ? (
        <>
          <p className="se-small" style={{ marginTop: 0 }}>
            Un dossier est créé par ligne, comme avec « Nouvelle copropriété » : bâtiments, plan de tâches, maître d'œuvre,
            date d'AG et honoraires. Seule la colonne <b>Copropriété</b> est obligatoire ; les colonnes de « Exporter la liste »
            sont reconnues, les autres sont ignorées. Rien n'est créé avant l'aperçu.
          </p>
          <div className="imp-copros-colonnes">
            {COLONNES_IMPORT.map((c) => (
              <div key={c.cle}>
                <b>{c.entete}</b>
                {c.aide && <span> - {c.aide}</span>}
              </div>
            ))}
          </div>
          {erreurFichier && <p className="fact-erreur">{erreurFichier}</p>}
          <div className="fact-modal-actions">
            <button type="button" className="se-btn se-btn-ghost btn-sm" onClick={telechargerModele}>
              <Icon name="download" size={14} /> Télécharger le modèle
            </button>
            <span style={{ flex: 1 }}></span>
            <button type="button" className="se-btn se-btn-primary btn-sm" onClick={() => fichierRef.current?.click()}>
              <Icon name="upload" size={14} /> Choisir un fichier CSV
            </button>
          </div>
        </>
      ) : !analyse ? (
        <p className="se-small">Chargement des dossiers, organisations et prestataires existants…</p>
      ) : (
        <>
          <p className="se-small" style={{ marginTop: 0 }}>
            <b>{fichier.nom}</b> : {analyse.lignes.length} ligne{analyse.lignes.length > 1 ? "s" : ""},{" "}
            <b>{aCreer.length}</b> à créer
            {enErreur.length > 0 && (
              <>
                , <b style={{ color: "var(--color-error-700)" }}>{enErreur.length} en erreur</b> (non créée{enErreur.length > 1 ? "s" : ""})
              </>
            )}
            .
            {analyse.ignorees.length > 0 && <> Colonnes ignorées : {analyse.ignorees.join(", ")}.</>}
          </p>
          {sansNom && (
            <p className="fact-erreur">
              Aucune colonne « Copropriété » (ou « Nom ») : le nom du dossier est obligatoire. Partez du modèle.
            </p>
          )}
          <div className="imp-copros-table">
            <table className="fact-apercu">
              <thead>
                <tr>
                  <th>Ligne</th>
                  <th>Copropriété</th>
                  <th>Ville</th>
                  <th>Phase</th>
                  <th>Syndic</th>
                  <th>Maître d'œuvre</th>
                  <th>Date d'AG</th>
                  <th className="r">P1 HT</th>
                  <th className="r">P2 HT</th>
                  <th>Contrôle</th>
                </tr>
              </thead>
              <tbody>
                {analyse.lignes.map((l) => (
                  <LigneApercu key={l.ligne} l={l} />
                ))}
              </tbody>
            </table>
          </div>
          <label className="imp-copros-option">
            <input type="checkbox" checked={prevenir} onChange={(e) => setPrevenir(e.target.checked)} disabled={!!enCours} />
            Prévenir chaque chef de projet par e-mail (une alerte de passation par dossier, comme à la création)
          </label>
          <div className="fact-modal-actions">
            <button
              type="button"
              className="se-btn se-btn-ghost btn-sm"
              disabled={!!enCours}
              onClick={() => fichierRef.current?.click()}
            >
              Changer de fichier
            </button>
            <span style={{ flex: 1 }}></span>
            <button type="button" className="se-btn se-btn-ghost btn-sm" disabled={!!enCours} onClick={onClose}>
              Annuler
            </button>
            <button
              type="button"
              className="se-btn se-btn-primary btn-sm"
              disabled={aCreer.length === 0 || !!enCours}
              onClick={() => void creer()}
            >
              <Icon name="plus" size={14} />
              {enCours
                ? `Création ${enCours.fait} / ${enCours.total}…`
                : `Créer ${aCreer.length} dossier${aCreer.length > 1 ? "s" : ""}`}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

function LigneApercu({ l }: { l: LigneImport }) {
  const i = l.input;
  const notes = [
    l.moeNouveau && `fiche « ${l.moeNouveau} » créée (Base prestataires)`,
    l.organisationNouvelle && `organisation « ${l.organisationNouvelle} » créée`,
  ].filter(Boolean);
  return (
    <tr className={i ? undefined : "imp-copros-ligne-ko"}>
      <td className="c">{l.ligne}</td>
      <td className="fort">{l.nom || "-"}</td>
      <td>{i?.city || "-"}</td>
      <td>{i ? (PHASES.find((p) => p.id === i.phase)?.label ?? i.phase) : "-"}</td>
      <td>{i?.syndic_name || "-"}</td>
      <td>{i?.maitre_oeuvre?.nom || "-"}</td>
      <td>{i?.date_ag ? i.date_ag.split("-").reverse().join("/") : "-"}</td>
      <td className="r">{i?.honoraires_p1_ht ? fmtEuro(i.honoraires_p1_ht) : "-"}</td>
      <td className="r">{i?.honoraires_p2_ht ? fmtEuro(i.honoraires_p2_ht) : "-"}</td>
      <td>
        {i ? (
          <span className="imp-copros-ok">
            À créer
            {notes.length > 0 && <span className="imp-copros-note"> - {notes.join(", ")}</span>}
          </span>
        ) : (
          <span className="imp-copros-ko">{l.erreurs.join(" ; ")}</span>
        )}
      </td>
    </tr>
  );
}

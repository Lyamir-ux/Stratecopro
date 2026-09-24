// Correction d'un document déposé (0081) : copropriété de rattachement, type et
// nom du fichier. Un dépôt se fait en tapant le nom de la copropriété : une
// faute de frappe ou un fichier mal identifié le range sous la mauvaise
// copropriété - et peut en créer une. Le déposant et l'équipe Strat Eco se
// corrigent ici ; le fichier est déplacé dans le bucket avec le document.
import { useMemo, useState, type FormEvent } from "react";
import { Modal } from "@/components/Modal";
import { Icon } from "@/components/Icon";
import { useAuth } from "@/auth/AuthProvider";
import {
  useCorbeillePptCopro,
  useCorrigerPptRapport,
  useCreerPptCopro,
  usePptCopros,
  usePptRapports,
  type PptCopro,
  type PptRapport,
  type TypeRapport,
} from "@/api/ppt";
import { TYPES_DEPOT, nomPourCopro, trouverCopro } from "@/lib/ppt/depot";
import { fmtDateCourte } from "./commun";
import { TYPE_RAPPORT_LABEL } from "@/lib/ppt/referentiels";
import { messageErreur } from "@/lib/erreurs";

export type DocumentACorriger = Pick<PptRapport, "id" | "ppt_copro_id" | "storage_path" | "name" | "type" | "statut" | "date_document" | "depose_le">;

const champ = { display: "flex", flexDirection: "column" as const, gap: 6, fontSize: 13, fontWeight: 500 };

export function CorrigerDocument({ rapport, onClose }: { rapport: DocumentACorriger; onClose: (corrige: boolean) => void }) {
  const { profile } = useAuth();
  const amo = profile?.role === "amo";
  const { data: copros } = usePptCopros();
  const corriger = useCorrigerPptRapport();
  const creer = useCreerPptCopro();
  const corbeille = useCorbeillePptCopro();

  const origine = copros?.find((c) => c.id === rapport.ppt_copro_id) ?? null;
  // le document reste dans son enseigne : c'est elle qui donne accès au fichier
  const candidates = useMemo(
    () => (copros ?? []).filter((c) => !origine || c.organisation_id === origine.organisation_id).sort((a, b) => a.nom.localeCompare(b.nom, "fr")),
    [copros, origine],
  );
  const { data: docsOrigine } = usePptRapports(rapport.ppt_copro_id ? [rapport.ppt_copro_id] : []);

  const [nomCopro, setNomCopro] = useState(origine?.nom ?? "");
  const [type, setType] = useState<TypeRapport>(rapport.type);
  const [nomFichier, setNomFichier] = useState(rapport.name);
  const [viderOrigine, setViderOrigine] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const cible = trouverCopro(candidates, nomCopro);
  const change = !!cible ? cible.id !== rapport.ppt_copro_id : nomCopro.trim() !== (origine?.nom ?? "");
  const busy = corriger.isPending || creer.isPending || corbeille.isPending;
  const valide = nomCopro.trim().length > 1 && nomFichier.trim().length > 0 && !busy && rapport.statut !== "valide";
  // l'ancienne copropriété devient vide : proposé à l'équipe Strat Eco seulement
  const origineVidee =
    amo &&
    change &&
    !!origine &&
    (docsOrigine ?? []).filter((d) => d.id !== rapport.id).length === 0 &&
    (origine.stats?.postes ?? 0) === 0 &&
    (origine.stats?.nb_ag ?? 0) === 0;

  /** Le fichier porte presque toujours le nom de la copropriété : on propose le nom corrigé. */
  const changerCopro = (v: string) => {
    setNomCopro(v);
    const c = trouverCopro(candidates, v);
    const nom = c?.nom ?? v.trim();
    if (nom.length > 1 && nom !== (origine?.nom ?? "")) {
      setNomFichier(nomPourCopro(rapport.name, nom, type, (rapport.date_document ?? rapport.depose_le)?.slice(0, 4) ?? null));
    } else {
      setNomFichier(rapport.name);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valide) return;
    setErreur(null);
    try {
      let copro: Pick<PptCopro, "id" | "organisation_id"> | undefined = cible;
      if (!copro) {
        if (!origine) throw new Error("Copropriété d'origine introuvable : choisissez une copropriété existante.");
        copro = await creer.mutateAsync({ organisation_id: origine.organisation_id, nom: nomCopro.trim() });
      }
      await corriger.mutateAsync({ rapport, copro, name: nomFichier, type });
      if (origineVidee && viderOrigine && origine) await corbeille.mutateAsync({ id: origine.id });
      onClose(true);
    } catch (err) {
      setErreur(messageErreur(err, "La correction a échoué."));
    }
  };

  return (
    <Modal title="Corriger le document" onClose={() => onClose(false)} width={500} closeOnBackdrop={!busy}>
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="doc-row" style={{ padding: "0 0 12px" }}>
          <span className="d-ico"><Icon name="fileText" size={18} /></span>
          <div style={{ minWidth: 0 }}>
            <div className="d-name" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{rapport.name}</div>
            <div className="d-sub">{TYPE_RAPPORT_LABEL[rapport.type] ?? rapport.type}{origine ? ` · rattaché à ${origine.nom}` : ""}</div>
          </div>
        </div>

        {rapport.statut === "valide" ? (
          <p style={{ margin: 0, padding: "8px 12px", borderRadius: "var(--radius-md)", background: "var(--color-warning-50)", color: "var(--color-warning-700)", fontSize: 13 }}>
            Ce rapport est validé : son plan, ses remarques et son échéancier appartiennent à la copropriété. Pour le ranger ailleurs, Strat Eco le supprime (avec son plan) puis il se dépose à nouveau sur la bonne copropriété.
          </p>
        ) : (
          <>
            <label style={champ}>
              Copropriété *
              <input className="edit-inp" style={{ maxWidth: "none" }} list="ppt-copros-correction" value={nomCopro} onChange={(e) => changerCopro(e.target.value)} autoFocus required />
              <datalist id="ppt-copros-correction">
                {candidates.map((c) => <option key={c.id} value={c.nom}>{c.commune ?? ""}</option>)}
              </datalist>
              <span className="se-small" style={{ color: "var(--fg-muted)", fontWeight: 400 }}>
                {cible
                  ? cible.id === rapport.ppt_copro_id
                    ? "Rattachement inchangé."
                    : `Le document et son fichier passent sur ${cible.nom}${cible.commune ? ` · ${cible.commune}` : ""}.`
                  : nomCopro.trim().length > 1
                    ? "Copropriété inconnue : elle sera créée dans la même enseigne."
                    : "Tapez le nom : les copropriétés de l'enseigne sont proposées."}
              </span>
            </label>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <label style={champ}>
                Type de document *
                <select className="edit-inp" style={{ maxWidth: "none" }} value={type} onChange={(e) => setType(e.target.value as TypeRapport)}>
                  {TYPES_DEPOT.map((t) => <option key={t} value={t}>{TYPE_RAPPORT_LABEL[t]}</option>)}
                </select>
              </label>
              <label style={champ}>
                Nom du fichier *
                <input className="edit-inp" style={{ maxWidth: "none" }} value={nomFichier} onChange={(e) => setNomFichier(e.target.value)} required />
              </label>
            </div>
            <span className="se-small" style={{ color: "var(--fg-muted)", marginTop: -6 }}>
              Le fichier est renommé et déplacé dans le dossier de la copropriété : c'est lui qui donne l'accès au document côté syndic.
            </span>

            {origineVidee && (
              <label className="se-small" style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--fg-muted)" }}>
                <input type="checkbox" checked={viderOrigine} onChange={(e) => setViderOrigine(e.target.checked)} />
                Mettre aussi « {origine?.nom} » à la corbeille : elle ne contient plus ni document, ni poste, ni AG.
              </label>
            )}
          </>
        )}

        {erreur && <p style={{ margin: 0, padding: "8px 12px", borderRadius: "var(--radius-md)", background: "var(--color-error-50)", color: "var(--color-error-700)", fontSize: 13 }}>{erreur}</p>}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" className="se-btn se-btn-ghost btn-sm" onClick={() => onClose(false)} disabled={busy}>Annuler</button>
          <button type="submit" className="se-btn se-btn-primary btn-sm" disabled={!valide}>
            <Icon name="check" size={14} />
            {busy ? "Correction…" : "Corriger"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/**
 * Renommer une copropriété laisse son ancien nom dans les fichiers déjà déposés
 * (« PPT_LaPorteDuSoleil_2026.xlsx »). Après l'enregistrement de la fiche, on
 * propose la reprise, avant / après sous les yeux - jamais en silence.
 */
export function RenommerFichiers({
  copro,
  renommages,
  onClose,
}: {
  copro: Pick<PptCopro, "id" | "organisation_id">;
  renommages: { rapport: DocumentACorriger; nouveau: string }[];
  onClose: () => void;
}) {
  const corriger = useCorrigerPptRapport();
  const [faits, setFaits] = useState(0);
  const [erreur, setErreur] = useState<string | null>(null);

  const lancer = async () => {
    setErreur(null);
    try {
      for (const r of renommages.slice(faits)) {
        await corriger.mutateAsync({ rapport: r.rapport, copro, name: r.nouveau, type: r.rapport.type });
        setFaits((n) => n + 1);
      }
      onClose();
    } catch (err) {
      setErreur(messageErreur(err, "Le renommage a échoué."));
    }
  };

  return (
    <Modal title="Renommer les fichiers ?" onClose={onClose} width={560} closeOnBackdrop={!corriger.isPending}>
      <p className="se-body" style={{ marginTop: 0 }}>
        {renommages.length} fichier{renommages.length > 1 ? "s" : ""} porte{renommages.length > 1 ? "nt" : ""} l'ancien nom de la copropriété. Les reprendre ?
      </p>
      <div style={{ maxHeight: "40vh", overflowY: "auto" }}>
        {renommages.map(({ rapport, nouveau }) => (
          <div key={rapport.id} className="doc-row" style={{ padding: "8px 0" }}>
            <span className="d-ico"><Icon name="fileText" size={16} /></span>
            <div style={{ minWidth: 0, fontSize: 13 }}>
              <div style={{ color: "var(--fg-muted)", textDecoration: "line-through" }}>{rapport.name}</div>
              <div style={{ fontWeight: 600 }}>{nouveau}</div>
            </div>
            <span className="spacer"></span>
            <span className="se-small" style={{ color: "var(--fg-muted)" }}>{fmtDateCourte(rapport.depose_le)}</span>
          </div>
        ))}
      </div>
      {erreur && <p style={{ margin: "12px 0 0", padding: "8px 12px", borderRadius: "var(--radius-md)", background: "var(--color-error-50)", color: "var(--color-error-700)", fontSize: 13 }}>{erreur}</p>}
      <p className="se-small" style={{ color: "var(--fg-muted)" }}>
        Un rapport déjà validé garde son nom : son plan est rattaché à la copropriété.
      </p>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button type="button" className="se-btn se-btn-ghost btn-sm" onClick={onClose} disabled={corriger.isPending}>Laisser tels quels</button>
        <button type="button" className="se-btn se-btn-primary btn-sm" onClick={() => void lancer()} disabled={corriger.isPending}>
          <Icon name="check" size={14} />
          {corriger.isPending ? `Renommage… (${faits}/${renommages.length})` : "Renommer"}
        </button>
      </div>
    </Modal>
  );
}

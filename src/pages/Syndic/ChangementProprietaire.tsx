// Vente ou décès : le syndic met à jour le propriétaire d'un lot
// (feedback Amir 22/09/2026 12:53). Fenêtre ouverte en cliquant la ligne du lot
// dans l'onglet Données, côté syndic comme côté AMO.
//
// L'acquéreur est une nouvelle fiche copropriétaire (ou une fiche existante de
// la copropriété, quand un copropriétaire rachète un lot voisin) : l'historique
// du vendeur - enquête sociale, plan individuel, choix de financement - reste
// le sien. Les lots annexes rattachés suivent le lot d'habitation.
import { useState, type FormEvent } from "react";
import { Icon } from "@/components/Icon";
import { Modal } from "@/components/Modal";
import { Badge } from "@/components/ui";
import { USAGE_LOT_LABEL } from "@/lib/referentiels";
import {
  MOTIFS_MUTATION,
  useChangerProprietaire,
  type DonneesCopro,
  type LotFull,
  type MotifMutation,
} from "@/api/donnees";

const champ = (label: string, input: React.ReactNode) => (
  <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, fontWeight: 600, color: "var(--fg2)" }}>
    {label}
    {input}
  </label>
);

export function ChangementProprietaire({
  coproId,
  lot,
  donnees,
  onClose,
}: {
  coproId: string;
  lot: LotFull;
  donnees: DonneesCopro;
  onClose: () => void;
}) {
  const changer = useChangerProprietaire(coproId);
  const [mode, setMode] = useState<"nouveau" | "existant">("nouveau");
  const [nom, setNom] = useState("");
  const [email, setEmail] = useState("");
  const [telephone, setTelephone] = useState("");
  const [type, setType] = useState<"" | "occupant" | "bailleur">("");
  const [existant, setExistant] = useState("");
  const [motif, setMotif] = useState<MotifMutation>("vente");
  const [commentaire, setCommentaire] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);

  // annexes emportées par le lot vendu (cave, garage rattachés)
  const annexes = donnees.lots.filter((l) => l.rattache_a === lot.id);
  const autres = donnees.coproprietaires
    .filter((cp) => cp.id !== lot.coproprietaire_id)
    .sort((a, b) => a.nom.localeCompare(b.nom, "fr"));

  const valide =
    !changer.isPending && (mode === "existant" ? existant !== "" : nom.trim().length > 1);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valide) return;
    setErreur(null);
    try {
      await changer.mutateAsync({
        lotId: lot.id,
        coproprietaireId: mode === "existant" ? existant : null,
        nom: mode === "nouveau" ? nom.trim() : null,
        email: mode === "nouveau" ? email.trim() || null : null,
        telephone: mode === "nouveau" ? telephone.trim() || null : null,
        type: mode === "nouveau" && type !== "" ? type : null,
        motif,
        commentaire: commentaire.trim() || null,
        numeroLot: lot.num,
        ancienNom: lot.coproprietaire?.nom ?? null,
        nouveauNom:
          mode === "existant" ? (autres.find((cp) => cp.id === existant)?.nom ?? null) : nom.trim(),
      });
      onClose();
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "Le changement de propriétaire a échoué.");
    }
  };

  return (
    <Modal
      title={`Lot n°${lot.num} - changer de propriétaire`}
      onClose={onClose}
      width={560}
      closeOnBackdrop={!changer.isPending}
    >
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div
          style={{
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            padding: "10px 12px",
            fontSize: 13,
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          <div>
            <b>Propriétaire actuel :</b> {lot.coproprietaire?.nom ?? "non renseigné"}
          </div>
          <div style={{ color: "var(--fg-muted)" }}>
            {[USAGE_LOT_LABEL[lot.usage] ?? lot.usage, lot.batiment?.code ? `bâtiment ${lot.batiment.code}` : null]
              .filter(Boolean)
              .join(" · ")}
          </div>
          {annexes.length > 0 && (
            <div style={{ color: "var(--fg-muted)" }}>
              Les lots rattachés suivent ce lot : {annexes.map((a) => `n°${a.num}`).join(", ")}
            </div>
          )}
        </div>

        <div className="opt-mini">
          <button type="button" className={mode === "nouveau" ? "on" : ""} onClick={() => setMode("nouveau")}>
            Nouveau copropriétaire
          </button>
          <button
            type="button"
            className={mode === "existant" ? "on" : ""}
            onClick={() => setMode("existant")}
            disabled={autres.length === 0}
            title={autres.length === 0 ? "Aucun autre copropriétaire enregistré" : "Un copropriétaire de la copropriété rachète ce lot"}
          >
            Copropriétaire déjà présent
          </button>
        </div>

        {mode === "nouveau" ? (
          <>
            {champ(
              "Nom du nouveau copropriétaire *",
              <input
                className="edit-inp"
                style={{ maxWidth: "none" }}
                required
                autoFocus
                value={nom}
                onChange={(e) => setNom(e.target.value)}
                placeholder="M. et Mme MARTIN"
              />
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {champ(
                "E-mail",
                <input
                  className="edit-inp"
                  style={{ maxWidth: "none" }}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="facultatif"
                />
              )}
              {champ(
                "Téléphone",
                <input
                  className="edit-inp"
                  style={{ maxWidth: "none" }}
                  value={telephone}
                  onChange={(e) => setTelephone(e.target.value)}
                  placeholder="facultatif"
                />
              )}
            </div>
            {champ(
              "Occupant ou bailleur",
              <select
                className="edit-inp"
                style={{ maxWidth: "none" }}
                value={type}
                onChange={(e) => setType(e.target.value as "" | "occupant" | "bailleur")}
              >
                <option value="">À préciser</option>
                <option value="occupant">Occupant</option>
                <option value="bailleur">Bailleur</option>
              </select>
            )}
          </>
        ) : (
          champ(
            "Copropriétaire de la copropriété *",
            <select
              className="edit-inp"
              style={{ maxWidth: "none" }}
              value={existant}
              onChange={(e) => setExistant(e.target.value)}
              required
            >
              <option value="">Choisir…</option>
              {autres.map((cp) => (
                <option key={cp.id} value={cp.id}>
                  {cp.nom}
                  {cp.sortant_le ? " (sortant)" : ""}
                </option>
              ))}
            </select>
          )
        )}

        {champ(
          "Motif",
          <select
            className="edit-inp"
            style={{ maxWidth: "none" }}
            value={motif}
            onChange={(e) => setMotif(e.target.value as MotifMutation)}
          >
            {MOTIFS_MUTATION.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
        )}
        {champ(
          "Précision (facultatif)",
          <input
            className="edit-inp"
            style={{ maxWidth: "none" }}
            value={commentaire}
            onChange={(e) => setCommentaire(e.target.value)}
            placeholder="Acte du 12/09/2026, indivision…"
          />
        )}

        <p className="se-small" style={{ margin: 0, color: "var(--fg-muted)" }}>
          L'ancien propriétaire garde son historique (enquête, plan de financement, bulletins signés). S'il
          ne possède plus aucun lot ici, sa fiche devient sortante et son accès au portail est fermé. L'équipe
          Strat Eco est informée du changement : l'aide individuelle du nouveau propriétaire sera réinstruite.
        </p>

        {erreur && (
          <p
            style={{
              margin: 0,
              padding: "8px 12px",
              borderRadius: "var(--radius-md)",
              background: "var(--color-error-50)",
              color: "var(--color-error-700)",
              fontSize: 13,
            }}
          >
            {erreur}
          </p>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" className="se-btn se-btn-ghost btn-sm" onClick={onClose} disabled={changer.isPending}>
            Annuler
          </button>
          <button type="submit" className="se-btn se-btn-primary btn-sm" disabled={!valide}>
            <Icon name="check" size={14} />
            {changer.isPending ? "Enregistrement…" : "Enregistrer le changement"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Journal des changements de propriétaire de la copropriété. */
export function JournalMutations({ mutations }: { mutations: { id: string; lot: { num: string } | null; ancien: { nom: string } | null; nouveau: { nom: string } | null; motif: string; commentaire: string | null; annexe: boolean; fait_le: string }[] }) {
  if (mutations.length === 0) return null;
  return (
    <div className="panel">
      <div className="p-head">
        <Icon name="refresh" size={18} />
        <h3>Changements de propriétaire</h3>
        <span style={{ flex: 1 }}></span>
        <span style={{ fontSize: 13, color: "var(--fg-muted)" }}>{mutations.length}</span>
      </div>
      <div className="p-body" style={{ maxHeight: 320, overflowY: "auto" }}>
        {mutations.map((m, i) => (
          <div
            key={m.id}
            style={{
              padding: "10px 2px",
              borderBottom: i < mutations.length - 1 ? "1px solid var(--border)" : "none",
              fontSize: 13,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <b>Lot n°{m.lot?.num ?? "?"}</b>
              <span style={{ color: "var(--fg-muted)" }}>
                {m.ancien?.nom ?? "sans propriétaire"} → {m.nouveau?.nom ?? "-"}
              </span>
              {m.annexe && <Badge kind="neutral">lot rattaché</Badge>}
            </div>
            <div className="se-small" style={{ color: "var(--fg-muted)" }}>
              {MOTIFS_MUTATION.find((x) => x.id === m.motif)?.label ?? m.motif} ·{" "}
              {new Date(m.fait_le).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
              {m.commentaire ? ` · ${m.commentaire}` : ""}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

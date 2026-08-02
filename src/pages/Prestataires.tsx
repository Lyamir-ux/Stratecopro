// Base prestataires — entreprises référencées pour les consultations de
// prestations intellectuelles (MOE, diagnostiqueur, CT, SPS…). C'est dans
// cette base que la publication d'une consultation va chercher les adresses
// e-mail à alerter. Le rattachement d'un compte de connexion (user_id) se
// fait pour l'instant en SQL, comme pour les copropriétaires.
import { useMemo, useState } from "react";
import { useCrumbs } from "@/components/Shell/useCrumbs";
import { Icon } from "@/components/Icon";
import { Avatar, Badge } from "@/components/ui";
import { Modal } from "@/components/Modal";
import { CONSULT_TYPES } from "@/api/consultations";
import {
  useAddPrestataire,
  useDeletePrestataire,
  usePrestataires,
  useUpdatePrestataire,
  type Prestataire,
} from "@/api/prestataires";
import type { Tables } from "@/lib/database.types";

type TypeConsult = Tables<"consultations">["type"];

const EMPTY = {
  raison_sociale: "",
  contact_nom: "",
  email: "",
  telephone: "",
  ville: "",
  siret: "",
  types: [] as TypeConsult[],
};

function TypeChips({ types }: { types: TypeConsult[] }) {
  return (
    <span style={{ display: "inline-flex", gap: 5, flexWrap: "wrap" }}>
      {types.map((t) => {
        const def = CONSULT_TYPES.find((x) => x.id === t);
        return (
          <span key={t} className="cs-type" style={{ fontSize: 11.5 }}>
            <Icon name={def?.icon ?? "briefcase"} size={12} />
            {def?.label ?? t}
          </span>
        );
      })}
    </span>
  );
}

function PrestaForm({
  initial,
  busy,
  onSubmit,
  onClose,
  title,
}: {
  initial: typeof EMPTY;
  busy: boolean;
  onSubmit: (draft: typeof EMPTY) => void;
  onClose: () => void;
  title: string;
}) {
  const [draft, setDraft] = useState(initial);
  const set = <K extends keyof typeof EMPTY>(k: K, v: (typeof EMPTY)[K]) => setDraft((p) => ({ ...p, [k]: v }));
  const toggleType = (t: TypeConsult) =>
    set("types", draft.types.includes(t) ? draft.types.filter((x) => x !== t) : [...draft.types, t]);
  const valid = draft.raison_sociale.trim() && /\S+@\S+\.\S+/.test(draft.email) && draft.types.length > 0;

  return (
    <Modal title={title} onClose={onClose} width={620}>
      <div className="cs-form-grid">
        <div className="cs-field">
          <label>Raison sociale *</label>
          <input className="edit-inp" style={{ maxWidth: "none" }} value={draft.raison_sociale}
            onChange={(e) => set("raison_sociale", e.target.value)} placeholder="Atelier Vernet Architectes" />
        </div>
        <div className="cs-field">
          <label>Contact</label>
          <input className="edit-inp" style={{ maxWidth: "none" }} value={draft.contact_nom}
            onChange={(e) => set("contact_nom", e.target.value)} placeholder="Prénom Nom" />
        </div>
        <div className="cs-field">
          <label>E-mail * <span style={{ color: "var(--fg-muted)", fontWeight: 400 }}>· destinataire des alertes</span></label>
          <input className="edit-inp" style={{ maxWidth: "none" }} type="email" value={draft.email}
            onChange={(e) => set("email", e.target.value)} placeholder="contact@entreprise.fr" />
        </div>
        <div className="cs-field">
          <label>Téléphone</label>
          <input className="edit-inp" style={{ maxWidth: "none" }} value={draft.telephone}
            onChange={(e) => set("telephone", e.target.value)} placeholder="03 88 …" />
        </div>
        <div className="cs-field">
          <label>Ville</label>
          <input className="edit-inp" style={{ maxWidth: "none" }} value={draft.ville}
            onChange={(e) => set("ville", e.target.value)} placeholder="Strasbourg" />
        </div>
        <div className="cs-field">
          <label>SIRET</label>
          <input className="edit-inp" style={{ maxWidth: "none" }} value={draft.siret}
            onChange={(e) => set("siret", e.target.value)} placeholder="123 456 789 00012" />
        </div>
        <div className="cs-field cs-field-full">
          <label>Prestations couvertes * <span style={{ color: "var(--fg-muted)", fontWeight: 400 }}>· détermine les consultations reçues</span></label>
          <div className="cs-type-pick">
            {CONSULT_TYPES.map((t) => (
              <button key={t.id} type="button"
                className={"cs-type-opt" + (draft.types.includes(t.id) ? " on" : "")}
                onClick={() => toggleType(t.id)}>
                <Icon name={t.icon} size={15} />
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <button className="se-btn se-btn-primary" style={{ marginTop: 18 }} disabled={!valid || busy}
        onClick={() => onSubmit(draft)}>
        <Icon name="check" size={16} />
        Enregistrer
      </button>
    </Modal>
  );
}

export default function Prestataires() {
  useCrumbs([{ label: "Base prestataires" }]);
  const { data: prestas } = usePrestataires();
  const add = useAddPrestataire();
  const update = useUpdatePrestataire();
  const del = useDeletePrestataire();

  const [filter, setFilter] = useState<TypeConsult | "">("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Prestataire | null>(null);

  const list = useMemo(
    () => (prestas ?? []).filter((p) => !filter || p.types.includes(filter)),
    [prestas, filter]
  );

  const save = async (draft: typeof EMPTY, id?: string) => {
    const payload = {
      raison_sociale: draft.raison_sociale.trim(),
      contact_nom: draft.contact_nom.trim() || null,
      email: draft.email.trim().toLowerCase(),
      telephone: draft.telephone.trim() || null,
      ville: draft.ville.trim() || null,
      siret: draft.siret.trim() || null,
      types: draft.types,
    };
    if (id) await update.mutateAsync({ id, patch: payload });
    else await add.mutateAsync(payload);
    setCreating(false);
    setEditing(null);
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Base prestataires</h1>
          <p className="page-sub">
            Entreprises référencées pour vos consultations — chaque publication alerte par e-mail les
            prestataires actifs du métier concerné.
          </p>
        </div>
        <span className="spacer"></span>
        <select className="edit-sel" value={filter} onChange={(e) => setFilter(e.target.value as TypeConsult | "")}>
          <option value="">Tous les métiers</option>
          {CONSULT_TYPES.map((t) => (
            <option key={t.id} value={t.id}>{t.label}</option>
          ))}
        </select>
        <button className="se-btn se-btn-primary" onClick={() => setCreating(true)}>
          <Icon name="plus" size={17} />
          Référencer une entreprise
        </button>
      </div>

      {list.length === 0 && (
        <div className="placeholder-screen" style={{ minHeight: 300 }}>
          <div className="ps-ico"><Icon name="briefcase" size={30} /></div>
          <h2>Aucune entreprise référencée</h2>
          <p>Ajoutez vos prestataires (MOE, diagnostiqueurs, contrôleurs, SPS…) pour qu'ils soient alertés à chaque consultation.</p>
        </div>
      )}

      {list.length > 0 && (
        <div className="panel">
          <div className="p-body" style={{ padding: 0 }}>
            {list.map((p) => (
              <div key={p.id} className="task-row" style={{ alignItems: "center", opacity: p.actif ? 1 : 0.55 }}>
                <Avatar
                  who={p.raison_sociale.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                  name={p.raison_sociale}
                />
                <span style={{ minWidth: 0, flex: "0 1 260px" }}>
                  <span style={{ display: "block", fontWeight: 600, fontSize: 14 }}>{p.raison_sociale}</span>
                  <span style={{ display: "block", fontSize: 12.5, color: "var(--fg-muted)" }}>
                    {[p.contact_nom, p.ville].filter(Boolean).join(" · ") || "—"}
                  </span>
                </span>
                <TypeChips types={p.types} />
                <span className="spacer" style={{ flex: 1 }}></span>
                <span style={{ fontSize: 12.5, color: "var(--fg3)" }}>{p.email}</span>
                {p.user_id ? (
                  <Badge kind="success" dot>Compte actif</Badge>
                ) : (
                  <Badge kind="neutral">Sans compte</Badge>
                )}
                <button
                  className="se-btn se-btn-ghost btn-sm"
                  title={p.actif ? "Suspendre (ne recevra plus d'alertes)" : "Réactiver"}
                  onClick={() => void update.mutateAsync({ id: p.id, patch: { actif: !p.actif } })}
                >
                  {p.actif ? "Suspendre" : "Réactiver"}
                </button>
                <button className="icon-btn" title="Modifier" onClick={() => setEditing(p)}>
                  <Icon name="edit" size={16} />
                </button>
                <button
                  className="icon-btn"
                  title="Supprimer"
                  onClick={() => {
                    if (window.confirm(`Supprimer ${p.raison_sociale} de la base ?`)) void del.mutateAsync(p.id);
                  }}
                >
                  <Icon name="trash" size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {creating && (
        <PrestaForm
          title="Référencer une entreprise"
          initial={EMPTY}
          busy={add.isPending}
          onClose={() => setCreating(false)}
          onSubmit={(d) => void save(d)}
        />
      )}
      {editing && (
        <PrestaForm
          title={"Modifier — " + editing.raison_sociale}
          initial={{
            raison_sociale: editing.raison_sociale,
            contact_nom: editing.contact_nom ?? "",
            email: editing.email,
            telephone: editing.telephone ?? "",
            ville: editing.ville ?? "",
            siret: editing.siret ?? "",
            types: editing.types,
          }}
          busy={update.isPending}
          onClose={() => setEditing(null)}
          onSubmit={(d) => void save(d, editing.id)}
        />
      )}
    </div>
  );
}

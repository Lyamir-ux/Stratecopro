// Mon entreprise — le prestataire gère lui-même sa fiche : logo, e-mails de
// contact principal et secondaire, téléphone, adresse, documents de
// certification (RGE, qualifications, assurances…) et contacts de l'entreprise
// avec leur rôle. Les métiers couverts et le référencement restent pilotés
// par l'équipe Strat Eco (verrouillé côté base).
import { useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { CONSULT_TYPES } from "@/api/consultations";
import {
  ouvrirDocPresta,
  useAddContactPresta,
  useContactsPresta,
  useDeleteContactPresta,
  useDeleteDocPresta,
  useDocsPresta,
  useLogoPresta,
  useMajMonPrestataire,
  useUploadDocPresta,
  useUploadLogoPresta,
} from "@/api/espacePrestataire";
import type { Tables } from "@/lib/database.types";

const fmtTaille = (n: number | null) =>
  n == null ? "" : n > 1048576 ? `${(n / 1048576).toFixed(1)} Mo` : `${Math.max(1, Math.round(n / 1024))} Ko`;

function FichePanel({ presta }: { presta: Tables<"prestataires"> }) {
  const maj = useMajMonPrestataire();
  const uploadLogo = useUploadLogoPresta(presta);
  const { data: logoUrl } = useLogoPresta(presta.logo_path);
  const logoRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState({
    contact_nom: presta.contact_nom ?? "",
    email: presta.email,
    email_secondaire: presta.email_secondaire ?? "",
    telephone: presta.telephone ?? "",
    adresse: presta.adresse ?? "",
    ville: presta.ville ?? "",
  });
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof typeof draft>(k: K, v: string) => {
    setDraft((p) => ({ ...p, [k]: v }));
    setDirty(true);
  };

  const champ = (label: string, key: keyof typeof draft, placeholder = "", type = "text") => (
    <div className="cs-field">
      <label>{label}</label>
      <input
        className="edit-inp"
        style={{ maxWidth: "none" }}
        type={type}
        value={draft[key]}
        placeholder={placeholder}
        onChange={(e) => set(key, e.target.value)}
      />
    </div>
  );

  return (
    <div className="panel">
      <div className="p-head">
        <Icon name="briefcase" size={18} />
        <h3>Fiche de l'entreprise</h3>
        <span style={{ flex: 1 }}></span>
        <span style={{ fontSize: 13, color: "var(--fg-muted)" }}>
          {presta.types.map((t) => CONSULT_TYPES.find((x) => x.id === t)?.label ?? t).join(" · ")}
        </span>
      </div>
      <div className="p-body">
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 18, flexWrap: "wrap" }}>
          <span
            style={{
              width: 72,
              height: 72,
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border)",
              background: "var(--bg-soft)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              flex: "none",
            }}
          >
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
            ) : (
              <Icon name="image" size={26} style={{ color: "var(--fg-muted)" }} />
            )}
          </span>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 19 }}>
              {presta.raison_sociale}
            </div>
            {presta.siret && (
              <div style={{ fontSize: 12.5, color: "var(--fg-muted)" }}>SIRET {presta.siret}</div>
            )}
          </div>
          <input
            ref={logoRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void uploadLogo.mutateAsync(f).catch((err) => setError(String(err.message ?? err)));
              e.target.value = "";
            }}
          />
          <button className="se-btn se-btn-secondary btn-sm" onClick={() => logoRef.current?.click()}>
            <Icon name="upload" size={14} />
            {uploadLogo.isPending ? "Envoi…" : presta.logo_path ? "Changer le logo" : "Ajouter un logo"}
          </button>
        </div>

        <div className="cs-form-grid">
          {champ("Contact principal (nom)", "contact_nom", "Prénom Nom")}
          {champ("Téléphone", "telephone", "03 88 …", "tel")}
          {champ("E-mail de contact principal", "email", "contact@entreprise.fr", "email")}
          {champ("E-mail de contact secondaire", "email_secondaire", "secretariat@entreprise.fr", "email")}
          {champ("Adresse", "adresse", "12 rue …")}
          {champ("Ville", "ville", "Strasbourg")}
        </div>

        <p className="se-small" style={{ color: "var(--fg-muted)", marginTop: 12 }}>
          <Icon name="lock" size={12} /> Les métiers couverts, la raison sociale et le référencement sont
          gérés par l'équipe Strat Eco — contactez-la pour les faire évoluer.
        </p>

        {error && (
          <p style={{ marginTop: 10, padding: "10px 14px", borderRadius: "var(--radius-md)", background: "var(--color-error-50)", color: "var(--color-error-700)", fontSize: 13.5 }}>
            {error}
          </p>
        )}

        <button
          className="se-btn se-btn-primary btn-sm"
          style={{ marginTop: 10 }}
          disabled={!dirty || !draft.email.trim() || maj.isPending}
          onClick={() => {
            setError(null);
            void maj
              .mutateAsync({
                id: presta.id,
                patch: {
                  contact_nom: draft.contact_nom.trim() || null,
                  email: draft.email.trim(),
                  email_secondaire: draft.email_secondaire.trim() || null,
                  telephone: draft.telephone.trim() || null,
                  adresse: draft.adresse.trim() || null,
                  ville: draft.ville.trim() || null,
                },
              })
              .then(() => setDirty(false))
              .catch((e) => setError("Enregistrement impossible : " + String((e as Error).message ?? e)));
          }}
        >
          <Icon name="check" size={14} />
          {maj.isPending ? "Enregistrement…" : dirty ? "Enregistrer la fiche" : "Enregistré"}
        </button>
      </div>
    </div>
  );
}

function CertificationsPanel({ presta }: { presta: Tables<"prestataires"> }) {
  const { data: docs } = useDocsPresta(presta.id);
  const upload = useUploadDocPresta(presta);
  const supprimer = useDeleteDocPresta(presta.id);
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="panel">
      <div className="p-head">
        <Icon name="fileCheck" size={18} />
        <h3>Certifications & documents</h3>
        <span style={{ flex: 1 }}></span>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload.mutateAsync(f);
            e.target.value = "";
          }}
        />
        <button className="se-btn se-btn-secondary btn-sm" onClick={() => fileRef.current?.click()}>
          <Icon name="upload" size={14} />
          {upload.isPending ? "Envoi…" : "Déposer un document"}
        </button>
      </div>
      <div className="p-body">
        <p className="se-small" style={{ color: "var(--fg-muted)", marginTop: 0 }}>
          Qualifications RGE, certificats, attestations d'assurance… visibles de l'équipe Strat Eco.
        </p>
        {(docs ?? []).length === 0 && (
          <p className="se-small" style={{ color: "var(--fg-muted)" }}>Aucun document déposé pour l'instant.</p>
        )}
        {(docs ?? []).map((d) => (
          <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: "1px solid var(--border)", fontSize: 13.5 }}>
            <Icon name="fileText" size={15} style={{ color: "var(--fg-muted)", flex: "none" }} />
            <button
              style={{ border: "none", background: "none", padding: 0, cursor: "pointer", font: "inherit", fontWeight: 600, textAlign: "left" }}
              title={"Ouvrir " + d.name}
              onClick={() => void ouvrirDocPresta(d.path)}
            >
              {d.name}
            </button>
            <span style={{ fontSize: 12, color: "var(--fg-muted)" }}>{fmtTaille(d.size)}</span>
            <span className="spacer" style={{ flex: 1 }}></span>
            <span style={{ fontSize: 12, color: "var(--fg-muted)" }}>déposé le {fmtDate(d.uploaded_at)}</span>
            <button
              className="icon-btn"
              style={{ width: 28, height: 28 }}
              title="Supprimer ce document"
              onClick={() => {
                if (window.confirm(`Supprimer « ${d.name} » ?`)) void supprimer.mutateAsync(d);
              }}
            >
              <Icon name="trash" size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function ContactsPanel({ presta }: { presta: Tables<"prestataires"> }) {
  const { data: contacts } = useContactsPresta(presta.id);
  const ajouter = useAddContactPresta(presta.id);
  const supprimer = useDeleteContactPresta(presta.id);
  const [draft, setDraft] = useState({ nom: "", role: "", email: "", telephone: "" });

  return (
    <div className="panel">
      <div className="p-head">
        <Icon name="users" size={18} />
        <h3>Contacts de l'entreprise</h3>
        <span style={{ flex: 1 }}></span>
        <span style={{ fontSize: 13, color: "var(--fg-muted)" }}>{contacts?.length ?? 0}</span>
      </div>
      <div className="p-body">
        {(contacts ?? []).map((ct) => (
          <div key={ct.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: "1px solid var(--border)", fontSize: 13.5, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 600 }}>{ct.nom}</span>
            {ct.role && <Badge kind="neutral">{ct.role}</Badge>}
            {ct.email && <span style={{ color: "var(--fg2)", fontSize: 12.5 }}>{ct.email}</span>}
            {ct.telephone && <span style={{ color: "var(--fg2)", fontSize: 12.5 }}>{ct.telephone}</span>}
            <span className="spacer" style={{ flex: 1 }}></span>
            <button
              className="icon-btn"
              style={{ width: 28, height: 28 }}
              title="Retirer ce contact"
              onClick={() => {
                if (window.confirm(`Retirer ${ct.nom} des contacts ?`)) void supprimer.mutateAsync(ct.id);
              }}
            >
              <Icon name="trash" size={14} />
            </button>
          </div>
        ))}
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <input className="edit-inp" style={{ flex: "1 1 140px" }} placeholder="Nom *" value={draft.nom}
            onChange={(e) => setDraft((p) => ({ ...p, nom: e.target.value }))} />
          <input className="edit-inp" style={{ flex: "1 1 140px" }} placeholder="Rôle (gérant, chargé d'affaires…)" value={draft.role}
            onChange={(e) => setDraft((p) => ({ ...p, role: e.target.value }))} />
          <input className="edit-inp" style={{ flex: "1 1 170px" }} placeholder="E-mail" type="email" value={draft.email}
            onChange={(e) => setDraft((p) => ({ ...p, email: e.target.value }))} />
          <input className="edit-inp" style={{ flex: "1 1 120px" }} placeholder="Téléphone" type="tel" value={draft.telephone}
            onChange={(e) => setDraft((p) => ({ ...p, telephone: e.target.value }))} />
          <button
            className="se-btn se-btn-secondary btn-sm"
            disabled={!draft.nom.trim() || ajouter.isPending}
            onClick={() => {
              void ajouter.mutateAsync(draft).then(() => setDraft({ nom: "", role: "", email: "", telephone: "" }));
            }}
          >
            <Icon name="plus" size={14} />
            Ajouter
          </button>
        </div>
      </div>
    </div>
  );
}

export function MonEntreprise({ presta }: { presta: Tables<"prestataires"> }) {
  return (
    <div className="page" style={{ padding: 0 }}>
      <div className="page-head">
        <div>
          <h1 className="page-title">Mon entreprise</h1>
          <p className="page-sub">
            Logo, coordonnées, certifications et contacts — ces informations sont visibles de l'équipe Strat Eco
          </p>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 760 }}>
        {/* key : la fiche se réinitialise quand l'entreprise change (aperçu AMO) */}
        <FichePanel key={presta.id + (presta.updated_at ?? "")} presta={presta} />
        <CertificationsPanel presta={presta} />
        <ContactsPanel presta={presta} />
      </div>
    </div>
  );
}

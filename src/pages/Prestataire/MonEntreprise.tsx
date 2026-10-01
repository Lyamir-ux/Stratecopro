// Mon entreprise - le prestataire gère lui-même sa fiche : logo, e-mail de
// contact principal et autant d'e-mails en copie des alertes que voulu (0106),
// téléphone, adresse, documents de
// certification (RGE, qualifications, assurances…) et contacts de l'entreprise
// avec leur rôle. Depuis le 01/10/2026 (0122, idées d'Amir) il choisit aussi
// les consultations qu'il reçoit : prestations couvertes, départements, et
// « Ne pas consulter ». La raison sociale et le référencement restent pilotés
// par l'équipe Strat Eco (verrouillé côté base).
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui";
import { EmailsSecondaires } from "@/components/EmailsSecondaires";
import { DepartementsPicker, choixVersDepartements, departementsVersChoix } from "@/components/DepartementsPicker";
import { fmtDate } from "@/lib/format";
import { messageErreur } from "@/lib/erreurs";
import { resumeDepartements } from "@/lib/departements";
import { CONSULT_TYPES } from "@/api/consultations";
import { emailValide, normaliserEmails } from "@/api/prestataires";
import {
  ouvrirDocPresta,
  useAddContactPresta,
  useContactsPresta,
  useDeleteContactPresta,
  useDeleteDocPresta,
  useDocsPresta,
  useLogoPresta,
  useMajDocPresta,
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
    email: presta.email ?? "",
    telephone: presta.telephone ?? "",
    adresse: presta.adresse ?? "",
    code_postal: presta.code_postal ?? "",
    ville: presta.ville ?? "",
    site_web: presta.site_web ?? "",
    siret: presta.siret ?? "",
  });
  const [emailsSecondaires, setEmailsSecondaires] = useState<string[]>(presta.emails_secondaires);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // fiche rechargée (enregistrement d'un autre bloc, logo) : on reprend ses
  // valeurs, sauf saisie en cours - un remontage effacerait cette saisie
  useEffect(() => {
    if (dirty) return;
    setDraft({
      contact_nom: presta.contact_nom ?? "",
      email: presta.email ?? "",
      telephone: presta.telephone ?? "",
      adresse: presta.adresse ?? "",
      code_postal: presta.code_postal ?? "",
      ville: presta.ville ?? "",
      site_web: presta.site_web ?? "",
      siret: presta.siret ?? "",
    });
    setEmailsSecondaires(presta.emails_secondaires);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presta.updated_at]);
  const set = <K extends keyof typeof draft>(k: K, v: string) => {
    setDraft((p) => ({ ...p, [k]: v }));
    setDirty(true);
  };

  const emailsOk = [draft.email, ...emailsSecondaires].every((e) => !e.trim() || emailValide(e));

  const champ = (label: string, key: keyof typeof draft, placeholder = "", type = "text", plein = false) => (
    <div className={"cs-field" + (plein ? " cs-field-full" : "")}>
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
          {champ("E-mail de contact principal", "email", "contact@entreprise.fr", "email", true)}
          <div className="cs-field cs-field-full">
            <label>
              Autres e-mails <span style={{ color: "var(--fg-muted)", fontWeight: 400 }}>· reçoivent les mêmes alertes, en copie</span>
            </label>
            <EmailsSecondaires
              valeurs={emailsSecondaires}
              onChange={(v) => {
                setEmailsSecondaires(v);
                setDirty(true);
              }}
            />
          </div>
          {champ("Adresse", "adresse", "12 rue …")}
          {champ("Code postal", "code_postal", "67000")}
          {champ("Ville", "ville", "Strasbourg")}
          {champ("Site internet", "site_web", "https://www.entreprise.fr", "url")}
          {champ("SIRET ou SIREN", "siret", "123 456 789 00012")}
        </div>

        <p className="se-small" style={{ color: "var(--fg-muted)", marginTop: 12 }}>
          <Icon name="lock" size={12} /> La raison sociale et le référencement sont gérés par l'équipe
          Strat Eco - contactez-la pour les faire évoluer.
        </p>

        {error && (
          <p style={{ marginTop: 10, padding: "10px 14px", borderRadius: "var(--radius-md)", background: "var(--color-error-50)", color: "var(--color-error-700)", fontSize: 13.5 }}>
            {error}
          </p>
        )}

        <button
          className="se-btn se-btn-primary btn-sm"
          style={{ marginTop: 10 }}
          disabled={!dirty || !draft.email.trim() || !emailsOk || maj.isPending}
          onClick={() => {
            setError(null);
            void maj
              .mutateAsync({
                id: presta.id,
                patch: {
                  contact_nom: draft.contact_nom.trim() || null,
                  ...normaliserEmails(draft.email, emailsSecondaires),
                  telephone: draft.telephone.trim() || null,
                  adresse: draft.adresse.trim() || null,
                  code_postal: draft.code_postal.trim() || null,
                  ville: draft.ville.trim() || null,
                  site_web: draft.site_web.trim() || null,
                  siret: draft.siret.trim() || null,
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

/** Ce qui décide des consultations reçues (0122) : prestations couvertes et
 *  départements (bouton Enregistrer), « Ne pas consulter » (enregistré tout de
 *  suite, après confirmation). Les alertes e-mail et la liste « Consultations
 *  en cours » suivent ces choix. */
function ConsultationsRecuesPanel({ presta }: { presta: Tables<"prestataires"> }) {
  const maj = useMajMonPrestataire();
  const [types, setTypes] = useState(presta.types);
  const [departements, setDepartements] = useState<string[] | null>(departementsVersChoix(presta.departements));
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (dirty) return;
    setTypes(presta.types);
    setDepartements(departementsVersChoix(presta.departements));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presta.updated_at]);

  const toggleType = (t: (typeof types)[number]) => {
    setTypes((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t]));
    setDirty(true);
  };
  const departementsBase = choixVersDepartements(departements);
  const valide = types.length > 0 && departementsBase !== null;

  const enregistrer = (patch: Parameters<typeof maj.mutateAsync>[0]["patch"]) => {
    setError(null);
    return maj.mutateAsync({ id: presta.id, patch }).catch((e: unknown) => {
      setError(messageErreur(e, "Enregistrement impossible. Réessayez."));
      throw e;
    });
  };

  return (
    <div className="panel">
      <div className="p-head">
        <Icon name="megaphone" size={18} />
        <h3>Consultations reçues</h3>
        <span style={{ flex: 1 }}></span>
        {presta.ne_pas_consulter ? (
          <Badge kind="warn">Ne pas consulter</Badge>
        ) : (
          <span style={{ fontSize: 13, color: "var(--fg-muted)" }}>{resumeDepartements(presta.departements)}</span>
        )}
      </div>
      <div className="p-body">
        {presta.ne_pas_consulter && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
              marginBottom: 16,
              padding: "12px 14px",
              borderRadius: "var(--radius-md)",
              background: "var(--color-warning-50)",
              color: "var(--color-warning-700)",
              fontSize: 13.5,
            }}
          >
            <Icon name="bell" size={16} style={{ flex: "none" }} />
            <span style={{ flex: "1 1 260px" }}>
              Votre entreprise ne souhaite pas être consultée
              {presta.ne_pas_consulter_le ? ` (depuis le ${fmtDate(presta.ne_pas_consulter_le)})` : ""} : elle ne
              reçoit plus d'alerte et les nouvelles consultations ne s'affichent plus dans votre espace.
            </span>
            <button
              className="se-btn se-btn-primary btn-sm"
              disabled={maj.isPending}
              onClick={() => void enregistrer({ ne_pas_consulter: false }).catch(() => {})}
            >
              <Icon name="check" size={14} />
              Être de nouveau consulté
            </button>
          </div>
        )}

        <div className="cs-field cs-field-full">
          <label>
            Prestations couvertes{" "}
            <span style={{ color: "var(--fg-muted)", fontWeight: 400 }}>· vous recevez les consultations de ces prestations</span>
          </label>
          <div className="cs-type-pick">
            {CONSULT_TYPES.map((t) => (
              <button
                key={t.id}
                type="button"
                className={"cs-type-opt" + (types.includes(t.id) ? " on" : "")}
                onClick={() => toggleType(t.id)}
              >
                <Icon name={t.icon} size={15} />
                {t.label}
              </button>
            ))}
          </div>
          {types.length === 0 && (
            <span className="se-small" style={{ color: "var(--color-warning-700)" }}>
              Cochez au moins une prestation - pour ne plus rien recevoir, utilisez « Ne pas consulter ».
            </span>
          )}
        </div>

        <div className="cs-field cs-field-full" style={{ marginTop: 16 }}>
          <label>
            Départements où l'entreprise peut être consultée{" "}
            <span style={{ color: "var(--fg-muted)", fontWeight: 400 }}>· selon l'adresse de la copropriété</span>
          </label>
          <DepartementsPicker
            valeur={departements}
            onChange={(v) => {
              setDepartements(v);
              setDirty(true);
            }}
          />
        </div>

        {error && (
          <p style={{ marginTop: 10, padding: "10px 14px", borderRadius: "var(--radius-md)", background: "var(--color-error-50)", color: "var(--color-error-700)", fontSize: 13.5 }}>
            {error}
          </p>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
          <button
            className="se-btn se-btn-primary btn-sm"
            disabled={!dirty || !valide || maj.isPending}
            onClick={() => {
              if (departementsBase === null) return;
              void enregistrer({ types, departements: departementsBase })
                .then(() => setDirty(false))
                .catch(() => {});
            }}
          >
            <Icon name="check" size={14} />
            {maj.isPending ? "Enregistrement…" : dirty ? "Enregistrer" : "Enregistré"}
          </button>
          <span style={{ flex: 1 }}></span>
          {!presta.ne_pas_consulter && (
            <button
              className="se-btn se-btn-ghost btn-sm"
              disabled={maj.isPending}
              title="Ne plus recevoir aucune consultation (réversible à tout moment)"
              onClick={() => {
                if (
                  window.confirm(
                    "Ne plus être consulté ?\n\nVotre entreprise ne recevra plus aucune alerte de consultation et les nouvelles consultations ne s'afficheront plus dans votre espace. Vos candidatures et projets en cours ne changent pas. Vous pourrez revenir sur ce choix à tout moment."
                  )
                )
                  void enregistrer({ ne_pas_consulter: true }).catch(() => {});
              }}
            >
              <Icon name="x" size={14} />
              Ne pas consulter
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Alerte de validité d'un document : expiré, ou expirant sous 60 jours. */
function ValiditeBadge({ expireLe }: { expireLe: string | null }) {
  if (!expireLe) return null;
  const jours = Math.ceil((new Date(expireLe + "T00:00:00").getTime() - Date.now()) / 86400000);
  if (jours < 0) return <Badge kind="warn"><Icon name="alert" size={11} />Expiré</Badge>;
  if (jours <= 60) return <Badge kind="warn">Expire dans {jours} j</Badge>;
  return null;
}

function CertificationsPanel({ presta }: { presta: Tables<"prestataires"> }) {
  const { data: docs } = useDocsPresta(presta.id);
  const upload = useUploadDocPresta(presta);
  const majDoc = useMajDocPresta(presta.id);
  const supprimer = useDeleteDocPresta(presta.id);
  const fileRef = useRef<HTMLInputElement>(null);
  // fin de validité saisie avant le dépôt (optionnelle)
  const [expireDraft, setExpireDraft] = useState("");

  return (
    <div className="panel">
      <div className="p-head" style={{ flexWrap: "wrap", gap: 8 }}>
        <Icon name="fileCheck" size={18} />
        <h3>Certifications & documents</h3>
        <span style={{ flex: 1 }}></span>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--fg-muted)" }}>
          Fin de validité
          <input
            className="edit-inp"
            type="date"
            value={expireDraft}
            onChange={(e) => setExpireDraft(e.target.value)}
            style={{ maxWidth: 150 }}
            title="Date de fin de validité du document à déposer (agrément RGE, assurance…)"
          />
        </label>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) {
              void upload.mutateAsync({ file: f, expireLe: expireDraft || null }).then(() => setExpireDraft(""));
            }
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
          Renseignez la date de fin de validité : un rappel automatique vous est envoyé par e-mail
          avant l'échéance pour déposer le document renouvelé.
        </p>
        {(docs ?? []).length === 0 && (
          <p className="se-small" style={{ color: "var(--fg-muted)" }}>Aucun document déposé pour l'instant.</p>
        )}
        {(docs ?? []).map((d) => (
          <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: "1px solid var(--border)", fontSize: 13.5, flexWrap: "wrap" }}>
            <Icon name="fileText" size={15} style={{ color: "var(--fg-muted)", flex: "none" }} />
            <button
              style={{ border: "none", background: "none", padding: 0, cursor: "pointer", font: "inherit", fontWeight: 600, textAlign: "left" }}
              title={"Ouvrir " + d.name}
              onClick={() => void ouvrirDocPresta(d.path)}
            >
              {d.name}
            </button>
            <span style={{ fontSize: 12, color: "var(--fg-muted)" }}>{fmtTaille(d.size)}</span>
            <ValiditeBadge expireLe={d.expire_le} />
            <span className="spacer" style={{ flex: 1 }}></span>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--fg-muted)" }}>
              valide jusqu'au
              <input
                className="edit-inp"
                type="date"
                value={d.expire_le ?? ""}
                onChange={(e) => void majDoc.mutateAsync({ id: d.id, expireLe: e.target.value || null })}
                style={{ maxWidth: 150 }}
                title="Date de fin de validité - sa mise à jour réarme le rappel automatique"
              />
            </label>
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
            Logo, coordonnées, consultations reçues, certifications et contacts - ces informations sont visibles
            de l'équipe Strat Eco
          </p>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 760 }}>
        {/* key : les blocs se réinitialisent quand l'entreprise change (aperçu AMO) */}
        <FichePanel key={presta.id} presta={presta} />
        <ConsultationsRecuesPanel key={"c" + presta.id} presta={presta} />
        <CertificationsPanel presta={presta} />
        <ContactsPanel presta={presta} />
      </div>
    </div>
  );
}

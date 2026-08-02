// Consultations ouvertes pour les métiers du prestataire connecté — porté de
// design-reference/project/consultations.jsx (ConsultationsMOE), généralisé à
// tous les intervenants. Dépôt d'offre : montant + note + pièce jointe (PDF).
import { useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { Badge, PhaseBadge } from "@/components/ui";
import { Modal } from "@/components/Modal";
import { fmtEuro, fmtDate } from "@/lib/format";
import { CONSULT_TYPES } from "@/api/consultations";
import {
  useConsultationsPresta,
  usePostuler,
  type ConsultationPresta,
} from "@/api/espacePrestataire";
import type { Tables } from "@/lib/database.types";

function joursRestants(iso: string | null): number | null {
  if (!iso) return null;
  return Math.round((new Date(iso).getTime() - Date.now()) / 86400000);
}

function TypeTag({ type }: { type: ConsultationPresta["type"] }) {
  const t = CONSULT_TYPES.find((x) => x.id === type) ?? CONSULT_TYPES[4];
  return (
    <span className="cs-type">
      <Icon name={t.icon} size={13} />
      {t.label}
    </span>
  );
}

function cible(cs: ConsultationPresta): { nom: string; lieu: string } {
  if (cs.copro) {
    return {
      nom: cs.copro.name,
      lieu: cs.copro.adresse || [cs.copro.city, cs.copro.quartier].filter(Boolean).join(" · "),
    };
  }
  return {
    nom: cs.copro_externe_nom ?? "—",
    lieu: [cs.copro_externe_adresse, cs.copro_externe_ville].filter(Boolean).join(", "),
  };
}

function PostulerModal({
  cs,
  presta,
  onClose,
}: {
  cs: ConsultationPresta;
  presta: Tables<"prestataires">;
  onClose: () => void;
}) {
  const postuler = usePostuler();
  const [montant, setMontant] = useState("");
  const [message, setMessage] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const c = cible(cs);

  const submit = async () => {
    setError(null);
    try {
      await postuler.mutateAsync({
        consultation: cs,
        prestataire: presta,
        montant: montant ? Number(montant) : null,
        message,
        file,
      });
      onClose();
    } catch (e) {
      setError("Le dépôt a échoué : " + String((e as Error).message ?? e));
    }
  };

  return (
    <Modal title={"Postuler — " + c.nom} onClose={onClose} width={560}>
      <p className="se-body" style={{ marginTop: 0 }}>{cs.mission}</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 6 }}>
        <div className="cs-field">
          <label>Montant de l'offre <span style={{ color: "var(--fg-muted)", fontWeight: 400 }}>· optionnel, € HT</span></label>
          <input className="edit-inp" style={{ maxWidth: "none" }} type="number" value={montant}
            placeholder="0" onChange={(e) => setMontant(e.target.value)} />
        </div>
        <div className="cs-field">
          <label>Note d'intention</label>
          <textarea className="cs-textarea" rows={3} value={message}
            placeholder="Références, disponibilité, approche proposée…"
            onChange={(e) => setMessage(e.target.value)}></textarea>
        </div>
        <div className="cs-field">
          <label>Offre détaillée (PDF) <span style={{ color: "var(--fg-muted)", fontWeight: 400 }}>· optionnel</span></label>
          <input ref={fileRef} type="file" accept=".pdf,.doc,.docx" style={{ display: "none" }}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <button className="se-btn se-btn-secondary btn-sm" onClick={() => fileRef.current?.click()}>
            <Icon name="upload" size={15} />
            {file ? file.name : "Joindre un fichier"}
          </button>
        </div>
      </div>
      {error && (
        <p style={{ marginTop: 12, marginBottom: 0, padding: "10px 14px", borderRadius: "var(--radius-md)", background: "var(--color-error-50)", color: "var(--color-error-700)", fontSize: 13.5 }}>
          {error}
        </p>
      )}
      <button className="se-btn se-btn-primary" style={{ marginTop: 18, width: "100%" }}
        disabled={postuler.isPending} onClick={() => void submit()}>
        <Icon name="send" size={16} />
        {postuler.isPending ? "Envoi…" : "Envoyer ma candidature"}
      </button>
    </Modal>
  );
}

export function ConsultationsPresta({ presta }: { presta: Tables<"prestataires"> }) {
  const { data: consultations } = useConsultationsPresta(presta);
  const [postulerA, setPostulerA] = useState<ConsultationPresta | null>(null);

  const open = (consultations ?? []).filter((c) => c.statut === "en_ligne");
  const applied = open.filter((c) => c.maCandidature).length;

  return (
    <div className="page" style={{ padding: 0 }}>
      <div className="page-head">
        <div>
          <h1 className="page-title">Consultations en cours</h1>
          <p className="page-sub">
            Appels à candidature publiés par les AMO pour vos métiers — postulez aux opérations qui vous intéressent
          </p>
        </div>
        <span className="spacer"></span>
        <div className="mt-tally">
          <span><b>{open.length}</b> ouverte{open.length > 1 ? "s" : ""}</span>
          <span className="dot"></span>
          <span><b>{applied}</b> candidature{applied > 1 ? "s" : ""}</span>
        </div>
      </div>

      {open.length === 0 && (
        <div className="placeholder-screen" style={{ minHeight: 320 }}>
          <div className="ps-ico"><Icon name="megaphone" size={30} /></div>
          <h2>Aucune consultation ouverte</h2>
          <p>Les appels à candidature correspondant à vos métiers apparaîtront ici — vous serez alerté par e-mail.</p>
        </div>
      )}

      <div className="cs-grid">
        {open.map((cs) => {
          const c = cible(cs);
          const jr = joursRestants(cs.date_limite);
          return (
            <div className="cs-card mp" key={cs.id}>
              <div className="cs-card-head">
                <TypeTag type={cs.type} />
                <span className="spacer" style={{ flex: 1 }}></span>
                {jr != null && (
                  <Badge kind={jr <= 5 ? "warn" : "success"} dot>
                    {jr > 0 ? "J−" + jr : "Dernier jour"}
                  </Badge>
                )}
              </div>
              <div className="cs-copro">{c.nom}</div>
              {c.lieu && (
                <div className="cs-loc-line">
                  <Icon name="mapPin" size={14} />
                  {c.lieu}
                </div>
              )}
              <div className="cs-mp-badges">
                {cs.copro && <PhaseBadge phase={cs.copro.phase} />}
                {cs.copro?.fragile && <Badge kind="warn">Fragile</Badge>}
                {!cs.copro && (
                  <span className="cs-mp-lots">
                    Études non démarrées{cs.copro_externe_lots ? ` · ${cs.copro_externe_lots} lots` : ""}
                  </span>
                )}
              </div>
              <p className="cs-mission">{cs.mission}</p>
              <div className="cs-meta">
                {cs.date_limite && (
                  <span>
                    <Icon name="calendar" size={14} />
                    Avant le {fmtDate(cs.date_limite)}
                  </span>
                )}
                {(cs.budget ?? 0) > 0 && (
                  <span>
                    <Icon name="euro" size={14} />
                    {fmtEuro(cs.budget)} estimé
                  </span>
                )}
              </div>
              <div className="cs-foot">
                <span className="spacer" style={{ flex: 1 }}></span>
                {cs.maCandidature ? (
                  <span className="cs-applied">
                    <Icon name="check" size={15} />
                    Candidature envoyée
                  </span>
                ) : (
                  <button className="se-btn se-btn-primary btn-sm" onClick={() => setPostulerA(cs)}>
                    <Icon name="send" size={15} />
                    Postuler
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {postulerA && <PostulerModal cs={postulerA} presta={presta} onClose={() => setPostulerA(null)} />}
    </div>
  );
}

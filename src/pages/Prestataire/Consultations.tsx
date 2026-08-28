// Consultations ouvertes pour les métiers du prestataire connecté - porté de
// design-reference/project/consultations.jsx (ConsultationsMOE), généralisé à
// tous les intervenants. Dépôt d'offre : montant + note + pièce jointe (PDF).
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Icon } from "@/components/Icon";
import { Badge, PhaseBadge } from "@/components/ui";
import { Modal } from "@/components/Modal";
import { RenommageDialog } from "@/components/RenommageDialog";
import { fmtEuro, fmtDate } from "@/lib/format";
import { CONSULT_TYPES, optionLabel, ouvrirDocConsultation, sousTypeLabel } from "@/api/consultations";
import {
  marquerConsultationRecuperee,
  useConsultationsPresta,
  usePoserQuestion,
  usePostuler,
  useRetirerCandidature,
  type ConsultationPresta,
  type TarifsMoe,
  type TarifsSimples,
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
      lieu: cs.copro.adresse || [cs.copro.code_postal, cs.copro.city].filter(Boolean).join(" "),
    };
  }
  return {
    nom: cs.copro_externe_nom ?? "-",
    lieu: [cs.copro_externe_adresse, cs.copro_externe_ville].filter(Boolean).join(", "),
  };
}

/** Adresse géocodable de la consultation (adresse + ville, sans le quartier). */
function adresseMaps(cs: ConsultationPresta): string | null {
  const parts = cs.copro
    ? [cs.copro.adresse, cs.copro.city]
    : [cs.copro_externe_adresse, cs.copro_externe_ville];
  const q = parts.filter(Boolean).join(", ");
  return q || null;
}

const mapsLien = (q: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
const mapsEmbed = (q: string) => `https://maps.google.com/maps?q=${encodeURIComponent(q)}&z=16&output=embed`;

/** Plan de situation SANS quitter l'app - le lien externe reste proposé,
 *  mais l'utilisateur ne perd plus la page de la consultation. */
function CarteModal({ cs, onClose }: { cs: ConsultationPresta; onClose: () => void }) {
  const c = cible(cs);
  const adresse = adresseMaps(cs);
  if (!adresse) return null;
  return (
    <Modal title={"Localisation - " + c.nom} onClose={onClose} width={640}>
      <p className="se-small" style={{ margin: "0 0 10px", color: "var(--fg2)" }}>
        <Icon name="mapPin" size={13} /> {c.lieu}
      </p>
      <iframe
        title={"Plan - " + c.nom}
        src={mapsEmbed(adresse)}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        style={{ width: "100%", height: 380, border: "1px solid var(--border)", borderRadius: "var(--radius-md)" }}
      ></iframe>
      <a
        href={mapsLien(adresse)}
        target="_blank"
        rel="noreferrer"
        style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 10, color: "var(--accent)", fontWeight: 600, fontSize: 13.5 }}
      >
        <Icon name="share" size={13} />
        Ouvrir dans Google Maps (nouvel onglet)
      </a>
    </Modal>
  );
}

/** Grille tarifaire d'une réponse MOE : phases de la mission + options cochées. */
const TARIF_BASE: { key: "diag_avp" | "pro_dce" | "chantier"; label: string }[] = [
  { key: "diag_avp", label: "DIAG / AVP" },
  { key: "pro_dce", label: "PRO / DCE" },
  { key: "chantier", label: "Suivi de chantier" },
];

/** Q&A d'une consultation : le candidat pose sa question avant de postuler,
 *  les réponses de l'AMO sont visibles de tous les candidats. */
function QuestionsModal({
  cs,
  presta,
  onClose,
}: {
  cs: ConsultationPresta;
  presta: Tables<"prestataires">;
  onClose: () => void;
}) {
  const poser = usePoserQuestion();
  const [question, setQuestion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const c = cible(cs);

  const envoyer = async () => {
    setError(null);
    try {
      await poser.mutateAsync({ consultationId: cs.id, prestataireId: presta.id, question });
      setQuestion("");
    } catch (e) {
      setError("L'envoi a échoué : " + String((e as Error).message ?? e));
    }
  };

  return (
    <Modal title={"Questions - " + c.nom} onClose={onClose} width={560}>
      <p className="se-small" style={{ marginTop: 0, color: "var(--fg-muted)" }}>
        Posez votre question à l'équipe AMO avant de candidater. Les réponses sont partagées avec
        tous les candidats de la consultation.
      </p>
      {cs.questions.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
          {cs.questions.map((q) => (
            <div
              key={q.id}
              style={{
                padding: "10px 14px",
                borderRadius: "var(--radius-md)",
                background: "var(--bg-soft)",
                border: "1px solid var(--border)",
              }}
            >
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontWeight: 700, fontSize: 13 }}>
                  {q.prestataire_id === presta.id ? "Votre question" : "Question d'un candidat"}
                </span>
                <span style={{ color: "var(--fg-muted)", fontSize: 12 }}>{fmtDate(q.asked_at)}</span>
              </div>
              <p style={{ margin: "4px 0 0", fontSize: 13.5 }}>{q.question}</p>
              {q.reponse ? (
                <p
                  style={{
                    margin: "8px 0 0",
                    paddingLeft: 10,
                    borderLeft: "3px solid var(--accent)",
                    fontSize: 13.5,
                    color: "var(--fg2)",
                  }}
                >
                  <strong>Réponse de l'AMO</strong>
                  {q.answered_at ? ` · ${fmtDate(q.answered_at)}` : ""} - {q.reponse}
                </p>
              ) : (
                <p style={{ margin: "8px 0 0", fontSize: 12.5, color: "var(--fg-muted)", fontStyle: "italic" }}>
                  En attente de réponse de l'AMO.
                </p>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="cs-field">
        <label>Votre question</label>
        <textarea
          className="cs-textarea"
          rows={3}
          value={question}
          placeholder="Précision sur le périmètre, les documents, le calendrier…"
          onChange={(e) => setQuestion(e.target.value)}
        ></textarea>
      </div>
      {error && (
        <p style={{ marginTop: 12, marginBottom: 0, padding: "10px 14px", borderRadius: "var(--radius-md)", background: "var(--color-error-50)", color: "var(--color-error-700)", fontSize: 13.5 }}>
          {error}
        </p>
      )}
      <button
        className="se-btn se-btn-primary"
        style={{ marginTop: 14, width: "100%" }}
        disabled={!question.trim() || poser.isPending}
        onClick={() => void envoyer()}
      >
        <Icon name="send" size={16} />
        {poser.isPending ? "Envoi…" : "Envoyer la question"}
      </button>
    </Modal>
  );
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
  const moe = cs.type === "moe";
  const [montant, setMontant] = useState("");
  const [tarifs, setTarifs] = useState<Record<string, string>>({});
  // PRO/DCE et suivi de chantier : forfait (€ HT) ou % du montant des travaux
  const [modes, setModes] = useState<Record<"pro_dce" | "chantier", "forfait" | "pourcentage">>({
    pro_dce: "forfait",
    chantier: "forfait",
  });
  const [message, setMessage] = useState("");
  const [file, setFile] = useState<File | null>(null);
  // Fichier en attente de renommage assisté avant d'être joint à l'offre
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const c = cible(cs);

  const setTarif = (k: string, v: string) => setTarifs((p) => ({ ...p, [k]: v }));
  const num = (v: string | undefined): number | null => (v && v.trim() !== "" ? Number(v) : null);

  // réponse à deux montants selon la mission ; amiante/plomb : pas de montant
  // (offre complexe, déposée en pièce jointe)
  const duo: { key: keyof TarifsSimples; label: string }[] | null =
    cs.type === "diag" && cs.sous_type === "etancheite"
      ? [
          { key: "etancheite_avant", label: "Test d'étanchéité à l'air avant travaux" },
          { key: "etancheite_apres", label: "Test d'étanchéité à l'air après travaux" },
        ]
      : cs.type === "ct" || cs.type === "sps"
        ? [
            { key: "conception", label: "Phase conception" },
            { key: "realisation", label: "Phase réalisation" },
          ]
        : null;
  const sansMontant = cs.type === "diag" && cs.sous_type === "amiante_plomb";
  const duoTotal = (duo ?? []).reduce((s, d) => s + (num(tarifs[d.key]) ?? 0), 0);
  // total en euros : les lignes en % du montant des travaux ne peuvent pas
  // s'additionner aux forfaits - elles se cumulent entre elles (même assiette)
  // et s'affichent à part
  const enPourcent = (k: string): boolean =>
    (k === "pro_dce" || k === "chantier") && modes[k as "pro_dce" | "chantier"] === "pourcentage";
  const lignesEuros = [...TARIF_BASE.map((t) => t.key as string).filter((k) => !enPourcent(k)), ...cs.options];
  const total = lignesEuros.reduce((s, k) => s + (num(tarifs[k]) ?? 0), 0);
  const totalPct = (["pro_dce", "chantier"] as const).reduce(
    (s, k) => s + (enPourcent(k) ? (num(tarifs[k]) ?? 0) : 0),
    0
  );

  const submit = async () => {
    setError(null);
    try {
      const tarifsMoe: TarifsMoe | null = moe
        ? {
            diag_avp: num(tarifs.diag_avp),
            pro_dce: num(tarifs.pro_dce),
            pro_dce_mode: modes.pro_dce,
            chantier: num(tarifs.chantier),
            chantier_mode: modes.chantier,
            options: cs.options.reduce<Record<string, number>>((acc, o) => {
              const v = num(tarifs[o]);
              if (v != null) acc[o] = v;
              return acc;
            }, {}),
          }
        : null;
      const tarifsSimples: TarifsSimples | null = duo
        ? (Object.fromEntries(duo.map((d) => [d.key, num(tarifs[d.key])])) as TarifsSimples)
        : null;
      await postuler.mutateAsync({
        consultation: cs,
        prestataire: presta,
        montant: moe
          ? total > 0
            ? total
            : null
          : duo
            ? duoTotal > 0
              ? duoTotal
              : null
            : sansMontant
              ? null
              : montant
                ? Number(montant)
                : null,
        message,
        file,
        tarifs: tarifsMoe,
        tarifsSimples,
      });
      onClose();
    } catch (e) {
      setError("Le dépôt a échoué : " + String((e as Error).message ?? e));
    }
  };

  const logements = cs.nb_logements ?? cs.copro_externe_lots;
  const adresse = adresseMaps(cs);

  return (
    <Modal title={"Postuler - " + c.nom} onClose={onClose} width={560}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", marginBottom: 8, fontSize: 13.5, color: "var(--fg2)" }}>
        {c.lieu && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Icon name="mapPin" size={14} />
            {c.lieu}
          </span>
        )}
        {logements != null && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Icon name="building" size={14} />
            {logements} logement{logements > 1 ? "s" : ""}
          </span>
        )}
        {cs.nb_batiments != null && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Icon name="layers" size={14} />
            {cs.nb_batiments} bâtiment{cs.nb_batiments > 1 ? "s" : ""}
          </span>
        )}
        {adresse && (
          <a
            href={mapsLien(adresse)}
            target="_blank"
            rel="noreferrer"
            style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "var(--accent)", fontWeight: 600 }}
          >
            <Icon name="share" size={13} />
            Google Maps
          </a>
        )}
      </div>
      {adresse && (
        <iframe
          title={"Localisation - " + c.nom}
          src={mapsEmbed(adresse)}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          style={{
            width: "100%",
            height: 170,
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            marginBottom: 12,
          }}
        ></iframe>
      )}
      <p className="se-body" style={{ marginTop: 0 }}>{cs.mission}</p>
      {cs.docs.length > 0 && (
        <div className="cs-field" style={{ marginBottom: 12 }}>
          <label>Pièces du dossier de consultation</label>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            {cs.docs.map((d) => (
              <button
                key={d.id}
                className="se-btn se-btn-secondary btn-sm"
                title={"Télécharger " + d.name}
                onClick={() => {
                  void marquerConsultationRecuperee(cs.id, presta.id);
                  void ouvrirDocConsultation(d.path);
                }}
              >
                <Icon name="download" size={13} />
                {d.name.length > 34 ? d.name.slice(0, 32) + "…" : d.name}
              </button>
            ))}
          </div>
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 6 }}>
        {moe ? (
          <div className="cs-field">
            <label>
              Votre offre par phase de mission <span style={{ color: "var(--fg-muted)", fontWeight: 400 }}>· € HT</span>
            </label>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {TARIF_BASE.map((t) => {
                const avecMode = t.key === "pro_dce" || t.key === "chantier";
                const enPct = avecMode && enPourcent(t.key);
                return (
                  <div key={t.key} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ flex: 1, fontSize: 13.5 }}>{t.label}</span>
                    {avecMode && (
                      <span style={{ display: "inline-flex", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
                        {(
                          [
                            { id: "forfait", label: "€", title: "Montant forfaitaire (€ HT)" },
                            { id: "pourcentage", label: "%", title: "Pourcentage du montant des travaux" },
                          ] as const
                        ).map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            title={m.title}
                            onClick={() => setModes((p) => ({ ...p, [t.key]: m.id }))}
                            style={{
                              border: "none",
                              cursor: "pointer",
                              padding: "4px 10px",
                              fontSize: 12.5,
                              fontWeight: 700,
                              background: modes[t.key as "pro_dce" | "chantier"] === m.id ? "var(--accent)" : "var(--bg)",
                              color: modes[t.key as "pro_dce" | "chantier"] === m.id ? "#fff" : "var(--fg2)",
                            }}
                          >
                            {m.label}
                          </button>
                        ))}
                      </span>
                    )}
                    <input
                      className="edit-inp"
                      type="number"
                      step={enPct ? "0.1" : "1"}
                      value={tarifs[t.key] ?? ""}
                      placeholder="0"
                      style={{ maxWidth: 140, textAlign: "right" }}
                      onChange={(e) => setTarif(t.key, e.target.value)}
                    />
                    <span style={{ color: "var(--fg-muted)", fontSize: 12.5, width: 34 }} title={enPct ? "Pourcentage du montant des travaux" : undefined}>
                      {enPct ? "% trav." : "€ HT"}
                    </span>
                  </div>
                );
              })}
              {cs.options.map((o) => (
                <div key={o} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ flex: 1, fontSize: 13.5 }}>
                    {optionLabel(o)}{" "}
                    <Badge kind="blue">Option</Badge>
                  </span>
                  <input className="edit-inp" type="number" value={tarifs[o] ?? ""} placeholder="0"
                    style={{ maxWidth: 140, textAlign: "right" }} onChange={(e) => setTarif(o, e.target.value)} />
                  <span style={{ color: "var(--fg-muted)", fontSize: 12.5, width: 34 }}>€ HT</span>
                </div>
              ))}
              <div style={{ display: "flex", alignItems: "center", gap: 10, borderTop: "1px solid var(--border)", paddingTop: 8 }}>
                <span style={{ flex: 1, fontWeight: 700, fontSize: 13.5 }}>Total de l'offre</span>
                <span style={{ fontWeight: 800, fontFamily: "var(--font-display)", fontSize: 15, textAlign: "right" }}>
                  {fmtEuro(total)} HT
                  {totalPct > 0 && (
                    <span style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--fg2)" }}>
                      + {totalPct.toLocaleString("fr-FR")} % du montant des travaux
                    </span>
                  )}
                </span>
              </div>
            </div>
          </div>
        ) : duo ? (
          <div className="cs-field">
            <label>
              Votre offre <span style={{ color: "var(--fg-muted)", fontWeight: 400 }}>· € HT</span>
            </label>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {duo.map((d) => (
                <div key={d.key} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ flex: 1, fontSize: 13.5 }}>{d.label}</span>
                  <input className="edit-inp" type="number" value={tarifs[d.key] ?? ""} placeholder="0"
                    style={{ maxWidth: 140, textAlign: "right" }} onChange={(e) => setTarif(d.key, e.target.value)} />
                  <span style={{ color: "var(--fg-muted)", fontSize: 12.5, width: 34 }}>€ HT</span>
                </div>
              ))}
              <div style={{ display: "flex", alignItems: "center", gap: 10, borderTop: "1px solid var(--border)", paddingTop: 8 }}>
                <span style={{ flex: 1, fontWeight: 700, fontSize: 13.5 }}>Total de l'offre</span>
                <span style={{ fontWeight: 800, fontFamily: "var(--font-display)", fontSize: 15 }}>
                  {fmtEuro(duoTotal)}
                </span>
                <span style={{ color: "var(--fg-muted)", fontSize: 12.5, width: 34 }}>HT</span>
              </div>
            </div>
          </div>
        ) : sansMontant ? (
          <p
            style={{
              margin: 0,
              padding: "10px 14px",
              borderRadius: "var(--radius-md)",
              background: "var(--bg-soft)",
              border: "1px solid var(--border)",
              fontSize: 13,
              color: "var(--fg2)",
            }}
          >
            Pas de montant à saisir pour cette mission : joignez votre <strong>offre détaillée</strong> ci-dessous
            (le chiffrage d'un repérage amiante / plomb dépend du programme et des sondages).
          </p>
        ) : (
          <div className="cs-field">
            <label>Montant de l'offre <span style={{ color: "var(--fg-muted)", fontWeight: 400 }}>· optionnel, € HT</span></label>
            <input className="edit-inp" style={{ maxWidth: "none" }} type="number" value={montant}
              placeholder="0" onChange={(e) => setMontant(e.target.value)} />
          </div>
        )}
        <div className="cs-field">
          <label>Note d'intention</label>
          <textarea className="cs-textarea" rows={3} value={message}
            placeholder="Références, disponibilité, approche proposée…"
            onChange={(e) => setMessage(e.target.value)}></textarea>
        </div>
        <div className="cs-field">
          <label>Offre détaillée (PDF) <span style={{ color: "var(--fg-muted)", fontWeight: 400 }}>· optionnel</span></label>
          <input ref={fileRef} type="file" accept=".pdf,.doc,.docx" style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) setPendingFile(f); // renommage assisté avant d'être joint
              e.target.value = "";
            }} />
          <button className="se-btn se-btn-secondary btn-sm" onClick={() => fileRef.current?.click()}>
            <Icon name="upload" size={15} />
            {file ? file.name : "Joindre un fichier"}
          </button>
        </div>
      </div>
      {pendingFile && (
        <RenommageDialog
          files={[pendingFile]}
          prefixe={c.nom}
          typeInitial="devis"
          onConfirm={(f) => setFile(f)}
          onClose={() => setPendingFile(null)}
        />
      )}
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
  const retirer = useRetirerCandidature();
  const [postulerA, setPostulerA] = useState<ConsultationPresta | null>(null);
  const [questionsDe, setQuestionsDe] = useState<ConsultationPresta | null>(null);
  const [carteDe, setCarteDe] = useState<ConsultationPresta | null>(null);
  // Lien profond des e-mails d'alerte : ?c=<id> cible la consultation en
  // question - carte mise en évidence et amenée à l'écran.
  const [searchParams] = useSearchParams();
  const cibleId = searchParams.get("c");

  const open = (consultations ?? []).filter((c) => c.statut === "en_ligne");
  const applied = open.filter((c) => c.maCandidature).length;

  useEffect(() => {
    if (!cibleId || !consultations) return;
    document.getElementById("cs-" + cibleId)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [cibleId, consultations]);

  return (
    <div className="page" style={{ padding: 0 }}>
      <div className="page-head">
        <div>
          <h1 className="page-title">Consultations en cours</h1>
          <p className="page-sub">
            Appels à candidature publiés par les AMO pour vos métiers - postulez aux opérations qui vous intéressent
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
          <p>Les appels à candidature correspondant à vos métiers apparaîtront ici - vous serez alerté par e-mail.</p>
        </div>
      )}

      <div className="cs-grid">
        {open.map((cs) => {
          const c = cible(cs);
          const jr = joursRestants(cs.date_limite);
          return (
            <div
              className="cs-card mp"
              key={cs.id}
              id={"cs-" + cs.id}
              style={cs.id === cibleId ? { outline: "2px solid var(--accent)", outlineOffset: 2 } : undefined}
            >
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
                  {adresseMaps(cs) ? (
                    <button
                      type="button"
                      title="Voir le plan de situation"
                      onClick={() => setCarteDe(cs)}
                      style={{
                        border: "none",
                        background: "none",
                        padding: 0,
                        cursor: "pointer",
                        font: "inherit",
                        color: "inherit",
                        textAlign: "left",
                        textDecoration: "underline",
                        textDecorationColor: "var(--border-strong)",
                        textUnderlineOffset: 3,
                      }}
                    >
                      {c.lieu}
                    </button>
                  ) : (
                    c.lieu
                  )}
                </div>
              )}
              <div className="cs-mp-badges">
                {cs.sous_type && <Badge kind="primary">{sousTypeLabel(cs.sous_type)}</Badge>}
                {cs.copro && <PhaseBadge phase={cs.copro.phase} />}
                {cs.copro?.fragile && <Badge kind="warn">Fragile</Badge>}
                {cs.copro && cs.nb_logements != null && (
                  <span className="cs-mp-lots">{cs.nb_logements} logements</span>
                )}
                {cs.nb_batiments != null && (
                  <span className="cs-mp-lots">{cs.nb_batiments} bâtiment{cs.nb_batiments > 1 ? "s" : ""}</span>
                )}
                {!cs.copro && (
                  <span className="cs-mp-lots">
                    Études non démarrées
                    {(cs.nb_logements ?? cs.copro_externe_lots) ? ` · ${cs.nb_logements ?? cs.copro_externe_lots} logements` : ""}
                  </span>
                )}
              </div>
              <p className="cs-mission">{cs.mission}</p>
              {(cs.options.length > 0 || cs.docs.length > 0) && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                  {cs.options.map((o) => (
                    <Badge key={o} kind="blue">Option : {optionLabel(o)}</Badge>
                  ))}
                  {cs.docs.map((d) => (
                    <button
                      key={d.id}
                      className="se-btn se-btn-ghost btn-sm"
                      title={"Télécharger " + d.name}
                      onClick={() => {
                        void marquerConsultationRecuperee(cs.id, presta.id);
                        void ouvrirDocConsultation(d.path);
                      }}
                    >
                      <Icon name="download" size={13} />
                      {d.name.length > 28 ? d.name.slice(0, 26) + "…" : d.name}
                    </button>
                  ))}
                </div>
              )}
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
                <button
                  className="se-btn se-btn-ghost btn-sm"
                  title="Poser une question à l'équipe AMO avant de candidater"
                  onClick={() => setQuestionsDe(cs)}
                >
                  <Icon name="message" size={15} />
                  {cs.questions.length > 0 ? `Questions (${cs.questions.length})` : "Poser une question"}
                </button>
                <span className="spacer" style={{ flex: 1 }}></span>
                {cs.maCandidature ? (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    <span className="cs-applied">
                      <Icon name="check" size={15} />
                      Candidature envoyée
                    </span>
                    {cs.maCandidature.statut === "recue" && (
                      <button
                        className="se-btn se-btn-ghost btn-sm"
                        title="Retirer votre candidature de cette consultation"
                        disabled={retirer.isPending}
                        onClick={() => {
                          const motif = window.prompt(
                            "Pourquoi retirez-vous votre candidature ?\n\nVotre offre partira à la corbeille - vous pourrez repostuler tant que la consultation est en ligne."
                          );
                          if (motif?.trim()) {
                            void retirer.mutateAsync({ cand: cs.maCandidature!, motif });
                          }
                        }}
                      >
                        <Icon name="trash" size={13} />
                        Retirer ma candidature
                      </button>
                    )}
                  </span>
                ) : (
                  <button
                    className="se-btn se-btn-primary btn-sm"
                    onClick={() => {
                      void marquerConsultationRecuperee(cs.id, presta.id);
                      setPostulerA(cs);
                    }}
                  >
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
      {questionsDe && (
        <QuestionsModal
          cs={(consultations ?? []).find((k) => k.id === questionsDe.id) ?? questionsDe}
          presta={presta}
          onClose={() => setQuestionsDe(null)}
        />
      )}
      {carteDe && <CarteModal cs={carteDe} onClose={() => setCarteDe(null)} />}
    </div>
  );
}

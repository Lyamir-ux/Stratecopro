// Onglet Communications - centralise les échanges du dossier :
// 1. Messagerie du projet par bloc (prestataires / syndic / copropriétaires),
//    avec envoi « à tous les prestataires » ou privé à une entreprise ; l'envoi
//    aux prestataires déclenche une alerte e-mail sans le contenu du message.
// 2. Questions/réponses des candidats sur les consultations de la copro.
// 3. Notes internes de l'équipe AMO (historique existant).
import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { Avatar, Badge } from "@/components/ui";
import { useAddNote, useNotes } from "@/api/notes";
import { useAuth } from "@/auth/AuthProvider";
import { useConsultations } from "@/api/consultations";
import {
  CANAUX,
  useEnvoyerMessage,
  useLectures,
  useMarquerLu,
  useMessagesCopro,
  type CanalMessage,
} from "@/api/messages";
import { QuestionsPanel } from "@/pages/Consultations";
import type { CoproWithStats } from "@/api/copros";

function relativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3.6e6);
  if (h < 1) return "À l'instant";
  if (h < 24) return `Il y a ${h} h`;
  const j = Math.floor(h / 24);
  if (j === 1) return "Hier";
  if (j < 7) return `Il y a ${j} j`;
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
}

const ROLE_LABELS: Record<string, string> = {
  amo: "Strat Eco",
  presta: "Prestataire",
  syndic: "Syndic",
  copro: "Copropriétaire",
};

/** Messagerie du projet : blocs prestataires / syndic / copropriétaires. */
function MessageriePanel({ c }: { c: CoproWithStats }) {
  const { session } = useAuth();
  const { data: messages } = useMessagesCopro(c.id);
  const { data: consultations } = useConsultations();
  const envoyer = useEnvoyerMessage(c.id);
  const { data: lectures } = useLectures();
  const marquerLu = useMarquerLu();
  const [canal, setCanal] = useState<CanalMessage>("prestataires");
  const [dest, setDest] = useState<string>("tous"); // "tous" ou prestataire_id
  const [body, setBody] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  // ouvrir l'onglet = marquer le fil comme lu (éteint la pastille Communications)
  const dernierRecu =
    (messages ?? []).filter((m) => m.user_id !== session?.user.id).slice(-1)[0]?.created_at ?? null;
  useEffect(() => {
    if (!dernierRecu) return;
    const repere = (lectures ?? []).find((l) => l.copro_id === c.id)?.last_read_at;
    if (!repere || dernierRecu > repere) void marquerLu.mutateAsync(c.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c.id, dernierRecu]);

  // entreprises retenues sur une consultation de la copro (destinataires possibles)
  const retenues = useMemo(() => {
    const map = new Map<string, string>();
    for (const cs of consultations ?? []) {
      if (cs.copro_id !== c.id) continue;
      for (const cand of cs.candidatures) {
        if (cand.statut === "retenue" && cand.prestataire_id) map.set(cand.prestataire_id, cand.org_name);
      }
    }
    return [...map.entries()].map(([id, nom]) => ({ id, nom }));
  }, [consultations, c.id]);

  const fil = (messages ?? []).filter((m) => m.canal === canal);

  const submit = async () => {
    const text = body.trim();
    if (!text) return;
    const prestataireId = canal === "prestataires" && dest !== "tous" ? dest : null;
    const res = await envoyer.mutateAsync({ canal, prestataireId, body: text });
    setBody("");
    if (canal !== "coproprietaires") {
      const cible = canal === "prestataires" ? "entreprise" : "compte syndic";
      if (res.notifyError) setNotice("Message envoyé, mais l'alerte e-mail a échoué : " + res.notifyError);
      else if (res.notification) {
        const n = res.notification;
        setNotice(
          n.total === 0
            ? canal === "prestataires"
              ? "Message envoyé. Aucune entreprise retenue sur ce projet - personne n'a été alerté par e-mail."
              : "Message envoyé. Aucun compte syndic rattaché à ce dossier - personne n'a été alerté par e-mail."
            : n.mode === "simulation"
              ? `Message envoyé - alerte e-mail simulée pour ${n.total} ${cible}${n.total > 1 ? "s" : ""} (configurez RESEND_API_KEY pour l'envoi réel).`
              : `Message envoyé - ${n.envoyes} alerte${n.envoyes > 1 ? "s" : ""} e-mail envoyée${n.envoyes > 1 ? "s" : ""}${n.erreurs ? `, ${n.erreurs} en erreur` : ""}.`
        );
      }
    }
  };

  return (
    <div className="panel">
      <div className="p-head">
        <Icon name="send" size={18} />
        <h3>Messagerie du projet</h3>
        <span style={{ flex: 1 }}></span>
        <div className="opt-mini">
          {CANAUX.map((k) => (
            <button key={k.id} className={canal === k.id ? "on" : ""} onClick={() => setCanal(k.id)}>
              {k.label}
            </button>
          ))}
        </div>
      </div>
      <div className="p-body">
        {canal === "prestataires" ? (
          <p className="se-small" style={{ color: "var(--fg-muted)", marginTop: 0 }}>
            Fil avec les entreprises retenues sur le projet. « À tous » est visible de toutes ;
            un message adressé à une entreprise reste privé. L'envoi déclenche une alerte e-mail
            sans le contenu du message - il se lit dans l'espace prestataire.
          </p>
        ) : (
          <p className="se-small" style={{ color: "var(--fg-muted)", marginTop: 0 }}>
            {canal === "syndic"
              ? "Fil avec le syndic de la copropriété - il le lit et vous répond depuis son espace (page Messages). L'envoi déclenche une alerte e-mail sans le contenu du message vers les gestionnaires du dossier et les directeurs de l'enseigne."
              : "Fil avec les copropriétaires - l'affichage dans le portail copropriétaire arrive prochainement, le fil est déjà conservé."}
          </p>
        )}

        {notice && (
          <p
            style={{
              padding: "8px 12px",
              borderRadius: "var(--radius-md)",
              background: "var(--bg-soft)",
              border: "1px solid var(--border)",
              fontSize: 12.5,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Icon name="send" size={13} style={{ flex: "none", color: "var(--color-primary-700)" }} />
            <span style={{ flex: 1 }}>{notice}</span>
            <button className="icon-btn" style={{ width: 22, height: 22 }} onClick={() => setNotice(null)}>
              <Icon name="x" size={12} />
            </button>
          </p>
        )}

        {fil.length === 0 && (
          <p className="se-small" style={{ color: "var(--fg-muted)" }}>
            Aucun message dans ce fil pour l'instant.
          </p>
        )}
        {fil.map((m) => (
          <div className="note" key={m.id}>
            <Avatar
              who={(m.auteur_nom || "?").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
              name={m.auteur_nom}
            />
            <div style={{ flex: 1 }}>
              <div className="nbody">{m.body}</div>
              <div className="nmeta" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                {m.auteur_nom || "-"} · {ROLE_LABELS[m.auteur_role] ?? m.auteur_role} · {relativeDate(m.created_at)}
                {m.canal === "prestataires" &&
                  (m.prestataire_id ? (
                    <Badge kind="blue">Privé - {m.prestataire?.raison_sociale ?? "entreprise"}</Badge>
                  ) : (
                    <Badge kind="neutral">À tous</Badge>
                  ))}
              </div>
            </div>
          </div>
        ))}

        <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
          {canal === "prestataires" && (
            <select
              className="edit-sel"
              value={dest}
              onChange={(e) => setDest(e.target.value)}
              style={{ maxWidth: 240 }}
              title="Destinataire du message"
            >
              <option value="tous">À tous les prestataires du projet</option>
              {retenues.map((p) => (
                <option key={p.id} value={p.id}>
                  Privé - {p.nom}
                </option>
              ))}
            </select>
          )}
          <input
            className="search"
            style={{ flex: 1, minWidth: 220, margin: 0 }}
            placeholder="Écrire un message…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void submit();
            }}
          />
          <button
            className="se-btn se-btn-primary btn-sm"
            onClick={() => void submit()}
            disabled={!body.trim() || envoyer.isPending}
          >
            <Icon name="send" size={15} />
            {envoyer.isPending ? "Envoi…" : "Envoyer"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Questions/réponses des candidats sur les consultations de la copro. */
function QuestionsPrestaPanel({ c }: { c: CoproWithStats }) {
  const { data: consultations } = useConsultations();
  const liste = (consultations ?? []).filter((cs) => cs.copro_id === c.id && cs.questions.length > 0);
  const enAttente = liste.reduce((n, cs) => n + cs.questions.filter((q) => !q.reponse).length, 0);

  if (liste.length === 0) return null;

  return (
    <div className="panel">
      <div className="p-head">
        <Icon name="message" size={18} />
        <h3>Questions des prestataires (consultations)</h3>
        {enAttente > 0 && <Badge kind="warn">{enAttente} sans réponse</Badge>}
        <span style={{ flex: 1 }}></span>
      </div>
      <div className="p-body">
        <p className="se-small" style={{ color: "var(--fg-muted)", marginTop: 0 }}>
          Vos réponses sont visibles de tous les candidats de la consultation (égalité d'information).
        </p>
        {liste.map((cs) => (
          <div key={cs.id} style={{ marginBottom: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>{cs.mission}</div>
            <QuestionsPanel cs={cs} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function CommunicationsTab({ c }: { c: CoproWithStats }) {
  const { data: notes } = useNotes(c.id);
  const addNote = useAddNote(c.id);
  const { profile } = useAuth();
  const [body, setBody] = useState("");

  const submit = async () => {
    const text = body.trim();
    if (!text) return;
    await addNote.mutateAsync(text);
    setBody("");
  };

  return (
    <div className="fade" style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 860 }}>
      <MessageriePanel c={c} />
      <QuestionsPrestaPanel c={c} />

      <div className="panel">
        <div className="p-head">
          <Icon name="message" size={18} />
          <h3>Notes internes (équipe AMO)</h3>
          <span style={{ flex: 1 }}></span>
          <span style={{ fontSize: 13, color: "var(--fg-muted)" }}>{notes?.length ?? 0}</span>
        </div>
        <div className="p-body">
          <div style={{ display: "flex", gap: 12, marginBottom: 18 }}>
            <Avatar who={profile?.initials ?? "–"} name={profile?.full_name} />
            <input
              className="search"
              style={{ width: "100%", margin: 0 }}
              placeholder="Écrire une note de projet…"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submit();
              }}
            />
            <button
              className="se-btn se-btn-primary btn-sm"
              onClick={() => void submit()}
              disabled={!body.trim() || addNote.isPending}
            >
              <Icon name="send" size={15} />
            </button>
          </div>
          {(notes ?? []).length === 0 && (
            <p className="se-small" style={{ color: "var(--fg-muted)" }}>
              Aucune note pour l'instant - consignez ici les points d'avancement du dossier.
            </p>
          )}
          {(notes ?? []).map((n) => (
            <div className="note" key={n.id}>
              <Avatar who={n.author?.initials ?? "–"} name={n.author?.full_name} />
              <div>
                <div className="nbody">{n.body}</div>
                <div className="nmeta">
                  {n.author?.full_name ?? "-"} · {relativeDate(n.created_at)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Onglet Communications — notes de projet réelles (porté de detail.jsx CommunicationsTab).
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { Avatar } from "@/components/ui";
import { useAddNote, useNotes } from "@/api/notes";
import { useAuth } from "@/auth/AuthProvider";
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
    <div className="panel fade" style={{ maxWidth: 760 }}>
      <div className="p-head">
        <Icon name="message" size={18} />
        <h3>Notes du projet</h3>
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
          <button className="se-btn se-btn-primary btn-sm" onClick={() => void submit()} disabled={!body.trim() || addNote.isPending}>
            <Icon name="send" size={15} />
          </button>
        </div>
        {(notes ?? []).length === 0 && (
          <p className="se-small" style={{ color: "var(--fg-muted)" }}>
            Aucune note pour l'instant — consignez ici les points d'avancement du dossier.
          </p>
        )}
        {(notes ?? []).map((n) => (
          <div className="note" key={n.id}>
            <Avatar who={n.author?.initials ?? "–"} name={n.author?.full_name} />
            <div>
              <div className="nbody">{n.body}</div>
              <div className="nmeta">
                {n.author?.full_name ?? "—"} · {relativeDate(n.created_at)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

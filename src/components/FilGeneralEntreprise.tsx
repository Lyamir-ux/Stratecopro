// Fil général « Équipe Strat Eco » d'une entreprise, côté équipe (0124) :
// ouvert depuis la Base prestataires. L'entreprise y écrit depuis son espace
// (Messages) sans alerter personne - la pastille du menu et de la liste le
// signale ; la réponse de l'équipe part avec une alerte e-mail sans le
// contenu (notifier-message), comme sur une opération.
import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { Avatar } from "@/components/ui";
import { Modal } from "@/components/Modal";
import { fmtDate } from "@/lib/format";
import { messageErreur } from "@/lib/erreurs";
import {
  useEcrireFilGeneral,
  useFilGeneral,
  useLecturesFilGeneral,
  useMarquerFilGeneralLu,
} from "@/api/messages";
import type { Tables } from "@/lib/database.types";

const initiales = (nom: string) =>
  (nom || "?")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

export function FilGeneralEntreprise({ presta, onClose }: { presta: Tables<"prestataires">; onClose: () => void }) {
  const { data: fil } = useFilGeneral(presta.id);
  const { data: lectures } = useLecturesFilGeneral();
  const marquerLu = useMarquerFilGeneralLu();
  const ecrire = useEcrireFilGeneral();
  const [body, setBody] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  // ouvrir le fil = marquer les messages de l'entreprise comme lus
  const dernierRecu = (fil ?? []).filter((m) => m.auteur_role === "presta").slice(-1)[0]?.created_at ?? null;
  useEffect(() => {
    if (!dernierRecu) return;
    const repere = (lectures ?? []).find((l) => l.prestataire_id === presta.id)?.last_read_at;
    if (!repere || dernierRecu > repere) void marquerLu.mutateAsync(presta.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presta.id, dernierRecu]);

  const envoyer = async () => {
    const text = body.trim();
    if (!text) return;
    setErreur(null);
    setNotice(null);
    try {
      const res = await ecrire.mutateAsync({ presta, role: "amo", body: text });
      setBody("");
      const n = res.notification;
      setNotice(
        res.notifyError
          ? "Message envoyé, mais l'alerte e-mail a échoué : " + res.notifyError
          : !n || n.total === 0
            ? "Message envoyé. L'entreprise n'a pas d'e-mail : elle le lira à sa prochaine connexion."
            : n.mode === "simulation"
              ? "Message envoyé - alerte e-mail simulée (clé d'envoi absente du serveur)."
              : "Message envoyé - l'entreprise est alertée par e-mail, sans le contenu."
      );
    } catch (e) {
      setErreur("L'envoi a échoué : " + messageErreur(e, "erreur inconnue"));
    }
  };

  return (
    <Modal title={"Équipe Strat Eco - " + presta.raison_sociale} onClose={onClose} width={620}>
      <p className="se-small" style={{ margin: "0 0 12px", color: "var(--fg-muted)" }}>
        Fil général entre l'entreprise et l'équipe, hors opération. Les échanges sur une opération se lisent dans
        l'onglet Communications du dossier.
      </p>
      {!presta.user_id && (
        <p
          className="se-small"
          style={{ margin: "0 0 12px", padding: "10px 14px", borderRadius: "var(--radius-md)", background: "var(--color-warning-50)", color: "var(--color-warning-700)" }}
        >
          L'entreprise n'a pas encore accès à son espace : créez l'accès depuis sa fiche pour qu'elle puisse lire ce fil.
        </p>
      )}
      <div style={{ maxHeight: 380, overflowY: "auto" }}>
        {(fil ?? []).length === 0 && (
          <p className="se-small" style={{ color: "var(--fg-muted)" }}>Aucun message pour l'instant.</p>
        )}
        {(fil ?? []).map((m) => {
          const deLEntreprise = m.auteur_role === "presta";
          return (
            <div className="note" key={m.id}>
              <Avatar who={initiales(m.auteur_nom)} name={m.auteur_nom} />
              <div style={{ flex: 1 }}>
                <div className="nbody">{m.body}</div>
                <div className="nmeta">
                  {deLEntreprise
                    ? `${m.auteur_nom || presta.raison_sociale} · ${presta.raison_sociale}`
                    : `${m.auteur_nom || "Strat Eco"} · Strat Eco`}{" "}
                  · {fmtDate(m.created_at)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <input
          className="search"
          style={{ flex: 1, margin: 0 }}
          placeholder={"Répondre à " + presta.raison_sociale + "…"}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void envoyer();
          }}
        />
        <button className="se-btn se-btn-primary btn-sm" disabled={!body.trim() || ecrire.isPending} onClick={() => void envoyer()}>
          <Icon name="send" size={15} />
          {ecrire.isPending ? "Envoi…" : "Envoyer"}
        </button>
      </div>
      {notice && <p className="se-small" style={{ marginTop: 8, color: "var(--fg2)" }}>{notice}</p>}
      {erreur && <p className="se-small" style={{ marginTop: 8, color: "var(--color-error-700)" }}>{erreur}</p>}
    </Modal>
  );
}

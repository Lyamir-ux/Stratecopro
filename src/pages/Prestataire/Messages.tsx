// Messagerie interne du prestataire — un fil par opération où l'entreprise a
// été retenue. Les messages de l'AMO « à tous » sont partagés avec les autres
// entreprises du projet ; les réponses de l'entreprise restent privées avec
// l'AMO. L'ouverture d'un fil marque ses messages comme lus (pastille du menu).
import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { Avatar, Badge } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { useAuth } from "@/auth/AuthProvider";
import { useMesCandidatures } from "@/api/espacePrestataire";
import {
  compteNonLus,
  useLectures,
  useMarquerLu,
  useMessagesPresta,
  useRepondreMessagePresta,
} from "@/api/messages";
import type { Tables } from "@/lib/database.types";

export function Messages({ presta }: { presta: Tables<"prestataires"> }) {
  const { session, profile } = useAuth();
  const { data: candidatures } = useMesCandidatures(presta.id);
  // aperçu AMO : ne pas écraser le repère de lecture de l'AMO (il sert à la
  // pastille de l'onglet Communications du dossier)
  const isApercu = profile?.role === "amo";

  // opérations où l'entreprise est retenue (copros de la plateforme uniquement)
  const projets = useMemo(() => {
    const map = new Map<string, string>();
    for (const cand of candidatures ?? []) {
      const copro = cand.consultation?.copro;
      if (cand.statut === "retenue" && copro) map.set(copro.id, copro.name);
    }
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [candidatures]);

  const { data: messages } = useMessagesPresta(presta.id, projets.map((p) => p.id));
  const { data: lectures } = useLectures();
  const marquerLu = useMarquerLu();
  const repondre = useRepondreMessagePresta(presta);
  const [coproId, setCoproId] = useState<string | null>(null);
  const [body, setBody] = useState("");

  const actif = coproId ?? projets[0]?.id ?? null;

  // ouvrir un fil = marquer ses messages comme lus
  const fil = (messages ?? []).filter((m) => m.copro_id === actif);
  const dernierRecu = fil.filter((m) => m.user_id !== session?.user.id).slice(-1)[0]?.created_at ?? null;
  useEffect(() => {
    if (!actif || !dernierRecu || isApercu) return;
    const repere = (lectures ?? []).find((l) => l.copro_id === actif)?.last_read_at;
    if (!repere || dernierRecu > repere) void marquerLu.mutateAsync(actif);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actif, dernierRecu, isApercu]);

  const submit = async () => {
    const text = body.trim();
    if (!text || !actif) return;
    await repondre.mutateAsync({ coproId: actif, body: text });
    setBody("");
  };

  return (
    <div className="page" style={{ padding: 0 }}>
      <div className="page-head">
        <div>
          <h1 className="page-title">Messages</h1>
          <p className="page-sub">
            Échanges avec l'équipe Strat Eco sur vos opérations — vous êtes alerté par e-mail quand un
            message vous attend ici
          </p>
        </div>
      </div>

      {projets.length === 0 && (
        <div className="placeholder-screen" style={{ minHeight: 320 }}>
          <div className="ps-ico"><Icon name="message" size={30} /></div>
          <h2>Aucun fil de discussion</h2>
          <p>La messagerie s'ouvre pour chaque opération où votre candidature est retenue.</p>
        </div>
      )}

      {projets.length > 0 && (
        <div className="panel">
          <div className="p-head" style={{ flexWrap: "wrap", gap: 8 }}>
            <Icon name="message" size={18} />
            <h3>Fils par opération</h3>
            <span style={{ flex: 1 }}></span>
            <div className="opt-mini" style={{ flexWrap: "wrap" }}>
              {projets.map((p) => {
                const nonLus = compteNonLus(
                  (messages ?? []).filter((m) => m.copro_id === p.id),
                  lectures,
                  session?.user.id
                );
                return (
                  <button key={p.id} className={actif === p.id ? "on" : ""} onClick={() => setCoproId(p.id)}>
                    {p.name}
                    {nonLus > 0 && actif !== p.id && (
                      <Badge kind="warn" >{nonLus}</Badge>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="p-body">
            {fil.length === 0 && (
              <p className="se-small" style={{ color: "var(--fg-muted)" }}>
                Aucun message pour cette opération pour l'instant.
              </p>
            )}
            {fil.map((m) => {
              const deMoi = m.auteur_role === "presta";
              return (
                <div className="note" key={m.id}>
                  <Avatar
                    who={(m.auteur_nom || "?").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                    name={m.auteur_nom}
                  />
                  <div style={{ flex: 1 }}>
                    <div className="nbody">{m.body}</div>
                    <div className="nmeta" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      {deMoi ? m.auteur_nom || presta.raison_sociale : `${m.auteur_nom || "Strat Eco"} · Strat Eco`} ·{" "}
                      {fmtDate(m.created_at)}
                      {!deMoi && m.prestataire_id == null && <Badge kind="neutral">À tous les prestataires</Badge>}
                      {m.prestataire_id != null && <Badge kind="blue">Privé</Badge>}
                    </div>
                  </div>
                </div>
              );
            })}
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <input
                className="search"
                style={{ flex: 1, margin: 0 }}
                placeholder="Répondre à l'équipe Strat Eco…"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void submit();
                }}
              />
              <button
                className="se-btn se-btn-primary btn-sm"
                onClick={() => void submit()}
                disabled={!body.trim() || repondre.isPending}
              >
                <Icon name="send" size={15} />
                {repondre.isPending ? "Envoi…" : "Envoyer"}
              </button>
            </div>
            <p className="se-small" style={{ color: "var(--fg-muted)", marginTop: 8 }}>
              Votre réponse est visible de l'équipe Strat Eco uniquement (pas des autres entreprises du projet).
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

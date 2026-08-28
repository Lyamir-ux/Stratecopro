// Messagerie de l'espace syndic - un fil par copropriété du portefeuille
// (canal « syndic » de messages_projet, partagé avec l'onglet Communications
// côté AMO). L'ouverture d'un fil marque ses messages comme lus (pastille du
// menu) ; l'envoi alerte l'équipe AMO par e-mail sans le contenu du message.
// Lien profond : /syndic/messages?copro=<id> (e-mails d'alerte).
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Icon } from "@/components/Icon";
import { Avatar, Badge } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { useAuth } from "@/auth/AuthProvider";
import {
  compteNonLus,
  useEnvoyerMessageSyndic,
  useLectures,
  useMarquerLu,
  useMessagesSyndic,
} from "@/api/messages";
import type { SyndicCopro } from "@/api/syndic";

export function MessagesSyndic({ copros }: { copros: SyndicCopro[] }) {
  const { session, profile } = useAuth();
  const [params] = useSearchParams();
  // aperçu AMO : ne pas écraser le repère de lecture de l'AMO (il sert à la
  // pastille de l'onglet Communications du dossier)
  const isApercu = profile?.role === "amo";

  const tries = useMemo(() => [...copros].sort((a, b) => a.name.localeCompare(b.name, "fr")), [copros]);
  const { data: messages } = useMessagesSyndic(tries.map((c) => c.id));
  const { data: lectures } = useLectures();
  const marquerLu = useMarquerLu();
  const envoyer = useEnvoyerMessageSyndic();
  const [coproId, setCoproId] = useState<string | null>(params.get("copro"));
  const [body, setBody] = useState("");

  const actif = (coproId && tries.some((c) => c.id === coproId) ? coproId : null) ?? tries[0]?.id ?? null;

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
    await envoyer.mutateAsync({ coproId: actif, body: text });
    setBody("");
  };

  return (
    <div className="page fade" style={{ padding: 0 }}>
      <div className="page-head">
        <div>
          <h1 className="page-title">Messages</h1>
          <p className="page-sub">
            Échanges avec l'équipe Strat Eco, copropriété par copropriété - l'équipe est alertée par
            e-mail quand vous écrivez ici
          </p>
        </div>
      </div>

      {tries.length === 0 && (
        <div className="placeholder-screen" style={{ minHeight: 320 }}>
          <div className="ps-ico"><Icon name="message" size={30} /></div>
          <h2>Aucun fil de discussion</h2>
          <p>La messagerie s'ouvre pour chaque copropriété de votre portefeuille.</p>
        </div>
      )}

      {tries.length > 0 && (
        <div className="panel">
          <div className="p-head" style={{ flexWrap: "wrap", gap: 8 }}>
            <Icon name="message" size={18} />
            <h3>Fils par copropriété</h3>
            <span style={{ flex: 1 }}></span>
            <div className="opt-mini" style={{ flexWrap: "wrap" }}>
              {tries.map((c) => {
                const nonLus = compteNonLus(
                  (messages ?? []).filter((m) => m.copro_id === c.id),
                  lectures,
                  session?.user.id
                );
                return (
                  <button key={c.id} className={actif === c.id ? "on" : ""} onClick={() => setCoproId(c.id)}>
                    {c.name}
                    {nonLus > 0 && actif !== c.id && <Badge kind="warn">{nonLus}</Badge>}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="p-body">
            {fil.length === 0 && (
              <p className="se-small" style={{ color: "var(--fg-muted)" }}>
                Aucun message pour cette copropriété pour l'instant.
              </p>
            )}
            {fil.map((m) => {
              const deSyndic = m.auteur_role === "syndic";
              return (
                <div className="note" key={m.id}>
                  <Avatar
                    who={(m.auteur_nom || "?").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                    name={m.auteur_nom}
                  />
                  <div style={{ flex: 1 }}>
                    <div className="nbody">{m.body}</div>
                    <div className="nmeta" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      {deSyndic
                        ? `${m.auteur_nom || "Syndic"} · Syndic`
                        : `${m.auteur_nom || "Strat Eco"} · Strat Eco`}{" "}
                      · {fmtDate(m.created_at)}
                    </div>
                  </div>
                </div>
              );
            })}
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <input
                className="search"
                style={{ flex: 1, margin: 0 }}
                placeholder="Écrire à l'équipe Strat Eco…"
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
            <p className="se-small" style={{ color: "var(--fg-muted)", marginTop: 8 }}>
              Votre message est visible de l'équipe Strat Eco uniquement (pas des copropriétaires ni des
              entreprises). L'équipe du dossier est alertée par e-mail.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

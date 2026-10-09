// Onglet « Nous contacter » du portail copropriétaire (feedback Amir 22/09/2026) :
// « Envoyez-nous un message ». Un seul fil, privé, entre le copropriétaire et
// l'équipe Strat Eco de son dossier - ni les autres copropriétaires, ni le
// syndic, ni les entreprises ne le lisent (RLS 0088). Les annonces que l'AMO
// adresse à tous les copropriétaires depuis l'onglet Communications ont leur
// propre encadré, au-dessus du fil privé : mêlées au fil, elles faisaient douter
// de sa confidentialité (feedback Cyrielle KLEIN 30/09/2026). À l'envoi, une
// fenêtre confirme la prise en compte : la ligne sous le message passait
// inaperçue (feedback Pierre MAXTAFF 09/10/2026).
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { Modal } from "@/components/Modal";
import { Avatar } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { useAuth } from "@/auth/AuthProvider";
import {
  useEnvoyerMessagePortail,
  useLectures,
  useMarquerLu,
  useMessagesPortail,
} from "@/api/messages";
import type { Membership } from "@/api/portail";

const initiales = (nom: string) =>
  (nom || "?")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

export function Messages({ membership }: { membership: Membership }) {
  const { session, profile } = useAuth();
  // Aperçu AMO : lecture seule (la RLS refuse l'envoi) et on ne touche pas au
  // repère de lecture, qui sert à la pastille de l'onglet Communications.
  const isApercu = profile?.role === "amo";
  const { data: messages, isLoading } = useMessagesPortail(membership.copro.id, membership.coproprietaireId);
  const { data: lectures } = useLectures();
  const marquerLu = useMarquerLu();
  const envoyer = useEnvoyerMessagePortail();
  const [body, setBody] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoye, setEnvoye] = useState(false);
  const [confirmation, setConfirmation] = useState(false);
  const zone = useRef<HTMLTextAreaElement>(null);

  const tous = messages ?? [];
  const fil = tous.filter((m) => m.coproprietaire_id != null);
  const annonces = tous.filter((m) => m.coproprietaire_id == null).reverse(); // la plus récente d'abord
  const dernierRecu = tous.filter((m) => m.user_id !== session?.user.id).slice(-1)[0]?.created_at ?? null;
  useEffect(() => {
    if (!dernierRecu || isApercu) return;
    const repere = (lectures ?? []).find((l) => l.copro_id === membership.copro.id)?.last_read_at;
    if (!repere || dernierRecu > repere) void marquerLu.mutateAsync(membership.copro.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [membership.copro.id, dernierRecu, isApercu]);

  const submit = async () => {
    const text = body.trim();
    if (!text || envoyer.isPending) return;
    setErreur(null);
    try {
      await envoyer.mutateAsync({
        coproId: membership.copro.id,
        coproprietaireId: membership.coproprietaireId,
        auteurNom: membership.nom,
        body: text,
      });
      setBody("");
      setEnvoye(true);
      setConfirmation(true);
    } catch (err) {
      setErreur(
        isApercu
          ? "Aperçu AMO : l'envoi depuis le portail est réservé au copropriétaire. Répondez-lui depuis l'onglet Communications du dossier."
          : err instanceof Error
            ? err.message
            : "L'envoi a échoué. Réessayez dans un instant."
      );
    }
  };

  return (
    <div className="fade" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <div className="se-eyebrow">Nous contacter</div>
        <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 28, margin: "8px 0 6px", letterSpacing: "-0.02em" }}>
          Envoyez-nous un message
        </h1>
        <p className="se-body" style={{ margin: 0, maxWidth: 680 }}>
          Une question sur votre quote-part, vos aides, votre prêt ou le calendrier des travaux ? Écrivez
          directement à l'équipe Strat Eco qui suit votre copropriété. Votre message reste privé : les autres
          copropriétaires, le syndic et les entreprises n'y ont pas accès.
        </p>
      </div>

      {annonces.length > 0 && (
        <div className="card-xl">
          <div className="cx-head">
            <Icon name="megaphone" size={20} style={{ color: "var(--color-secondary-500)" }} />
            <h2 style={{ fontSize: 18 }}>Annonces à tous les copropriétaires</h2>
          </div>
          <div className="cx-body" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <p className="se-small" style={{ margin: 0, color: "var(--fg-muted)" }}>
              Informations que l'équipe Strat Eco adresse à l'ensemble des copropriétaires de{" "}
              {membership.copro.name}. Elles ne font pas partie de votre fil privé.
            </p>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {annonces.map((m) => (
                <div className="note" key={m.id}>
                  <Avatar who="SE" name={m.auteur_nom} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="nbody" style={{ whiteSpace: "pre-wrap" }}>{m.body}</div>
                    <div className="nmeta">
                      {m.auteur_nom || "Strat Eco"} · Strat Eco · {fmtDate(m.created_at)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="card-xl">
        <div className="cx-head">
          <Icon name="lock" size={20} style={{ color: "var(--accent)" }} />
          <h2 style={{ fontSize: 18 }}>Votre fil privé avec Strat Eco</h2>
          <span style={{ flex: 1 }}></span>
          <span className="se-small" style={{ color: "var(--fg-muted)" }}>{membership.copro.name}</span>
        </div>
        <div className="cx-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <p className="se-small" style={{ margin: 0, color: "var(--fg-muted)" }}>
            Seuls vous et l'équipe Strat Eco lisez ce fil.
          </p>
          {isLoading ? (
            <p className="se-small" style={{ color: "var(--fg-muted)", margin: 0 }}>Chargement…</p>
          ) : fil.length === 0 ? (
            <p className="se-body" style={{ margin: 0, color: "var(--fg-muted)" }}>
              Aucun message pour l'instant. Posez votre question ci-dessous : l'équipe vous répond ici même et
              vous prévient par e-mail.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {fil.map((m) => {
                const deMoi = m.auteur_role === "copro";
                return (
                  <div className="note" key={m.id}>
                    <Avatar who={deMoi ? initiales(m.auteur_nom || membership.nom) : "SE"} name={m.auteur_nom} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="nbody" style={{ whiteSpace: "pre-wrap" }}>{m.body}</div>
                      <div className="nmeta">
                        {deMoi
                          ? `${m.auteur_nom || membership.nom} · Vous`
                          : `${m.auteur_nom || "Strat Eco"} · Strat Eco`}
                        {" · "}
                        {fmtDate(m.created_at)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {envoye && !erreur && (
            <div className="eq-transmis" style={{ marginTop: 0 }}>
              <Icon name="checkCircle" size={18} />
              <span>
                <b>Votre message a bien été envoyé.</b> Votre AMO vous répondra dans les meilleurs délais ; sa
                réponse arrivera dans ce fil.
              </span>
            </div>
          )}
          {erreur && (
            <p
              style={{
                margin: 0,
                padding: "10px 12px",
                borderRadius: "var(--radius-md)",
                background: "var(--color-error-50)",
                color: "var(--color-error-700)",
                fontSize: 13,
              }}
            >
              {erreur}
            </p>
          )}

          <label className="se-small" style={{ fontWeight: 700, color: "var(--fg2)" }}>
            Votre message
            <textarea
              ref={zone}
              className="edit-inp"
              style={{ maxWidth: "none", width: "100%", minHeight: 110, marginTop: 6, fontFamily: "inherit", resize: "vertical" }}
              placeholder="Bonjour, j'aimerais savoir…"
              value={body}
              onChange={(e) => {
                setBody(e.target.value);
                setEnvoye(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void submit();
              }}
            />
          </label>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <button
              className="se-btn se-btn-primary"
              onClick={() => void submit()}
              disabled={!body.trim() || envoyer.isPending}
            >
              <Icon name="send" size={16} />
              {envoyer.isPending ? "Envoi…" : "Envoyer le message"}
            </button>
            <span className="se-small" style={{ color: "var(--fg-muted)" }}>
              L'équipe Strat Eco est prévenue par e-mail et vous répond ici. Pour une urgence de chantier,
              passez par votre syndic.
            </span>
          </div>
        </div>
      </div>

      {confirmation && (
        <Modal
          title="Message envoyé"
          width={440}
          onClose={() => {
            setConfirmation(false);
            zone.current?.focus();
          }}
        >
          <div role="status" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, textAlign: "center" }}>
            <Icon name="checkCircle" size={44} style={{ color: "var(--color-success-500)" }} />
            <p className="se-body" style={{ margin: 0 }}>
              <b>Votre message a bien été envoyé.</b>
              <br />
              Votre AMO vous répondra dans les meilleurs délais.
            </p>
            <button
              className="se-btn se-btn-primary"
              autoFocus
              onClick={() => {
                setConfirmation(false);
                zone.current?.focus();
              }}
            >
              Fermer
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

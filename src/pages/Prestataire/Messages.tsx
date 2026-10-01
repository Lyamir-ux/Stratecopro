// Messagerie interne du prestataire. Depuis le 01/10/2026 (bug de Pierre
// Zently « on ne peut pas lancer une discussion », choix d'Amir, 0124) :
//   • fil « Équipe Strat Eco », toujours ouvert, pour ce qui ne porte pas sur
//     une opération ;
//   • un fil par opération où l'entreprise a une candidature en cours ou un
//     projet (retenue, maître d'œuvre saisi) ; une opération close où un
//     échange existe reste lisible.
// Les messages de l'AMO « à tous » sont partagés avec les autres entreprises
// retenues du projet ; les messages de l'entreprise restent privés avec
// l'équipe, qui n'est pas alertée par e-mail (pastilles seulement).
// L'ouverture d'un fil marque ses messages comme lus (pastille du menu) ; le
// lien des e-mails (?fil=general ou ?fil=<copro_id>) ouvre le bon fil.
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Icon } from "@/components/Icon";
import { Avatar, Badge } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { messageErreur } from "@/lib/erreurs";
import { useAuth } from "@/auth/AuthProvider";
import {
  compteNonLus,
  nonLusFilGeneral,
  useEcrireFilGeneral,
  useFilGeneral,
  useFilsPresta,
  useLectures,
  useLecturesFilGeneral,
  useMarquerFilGeneralLu,
  useMarquerLu,
  useRepondreMessagePresta,
} from "@/api/messages";
import type { Tables } from "@/lib/database.types";

const GENERAL = "general";

const initiales = (nom: string) =>
  (nom || "?")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

const ETIQUETTE = { projet: "projet", candidature: "candidature", historique: "close" } as const;

export function Messages({ presta }: { presta: Tables<"prestataires"> }) {
  const { session, profile } = useAuth();
  // aperçu AMO : ne pas écraser le repère de lecture de l'AMO (il sert à la
  // pastille de l'onglet Communications du dossier), ni écrire au nom de l'entreprise
  const isApercu = profile?.role === "amo";

  const { operations, messages } = useFilsPresta(presta);
  const { data: filGeneral } = useFilGeneral(presta.id);
  const { data: lectures } = useLectures();
  const { data: lecturesGeneral } = useLecturesFilGeneral();
  const marquerLu = useMarquerLu();
  const marquerGeneralLu = useMarquerFilGeneralLu();
  const repondre = useRepondreMessagePresta(presta);
  const ecrireGeneral = useEcrireFilGeneral();
  const [params] = useSearchParams();
  const [choix, setChoix] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);

  const nonLusOperation = (coproId: string) =>
    compteNonLus(
      (messages ?? []).filter((m) => m.copro_id === coproId),
      lectures,
      session?.user.id
    );
  const nonLusGeneral = nonLusFilGeneral(filGeneral, lecturesGeneral, "presta").get(presta.id) ?? 0;

  // fil ouvert : celui choisi, sinon celui du lien, sinon le premier avec du
  // nouveau, sinon la première opération déjà commencée, sinon le fil général
  const demande = params.get("fil");
  const connu = (id: string | null) => !!id && (id === GENERAL || operations.some((o) => o.coproId === id));
  const actif =
    (connu(choix) && choix) ||
    (connu(demande) && demande) ||
    (nonLusGeneral > 0 ? GENERAL : null) ||
    operations.find((o) => nonLusOperation(o.coproId) > 0)?.coproId ||
    operations.find((o) => (messages ?? []).some((m) => m.copro_id === o.coproId))?.coproId ||
    GENERAL;
  const operation = operations.find((o) => o.coproId === actif) ?? null;

  const fil =
    actif === GENERAL
      ? (filGeneral ?? []).map((m) => ({ ...m, prestataire_id: m.prestataire_id as string | null, deMoi: m.auteur_role === "presta", aTous: false }))
      : (messages ?? [])
          .filter((m) => m.copro_id === actif)
          .map((m) => ({ ...m, deMoi: m.auteur_role === "presta", aTous: m.prestataire_id == null }));

  // ouvrir un fil = marquer ses messages comme lus
  const dernierRecu = fil.filter((m) => !m.deMoi).slice(-1)[0]?.created_at ?? null;
  useEffect(() => {
    if (!dernierRecu || isApercu) return;
    if (actif === GENERAL) {
      const repere = (lecturesGeneral ?? []).find((l) => l.prestataire_id === presta.id)?.last_read_at;
      if (!repere || dernierRecu > repere) void marquerGeneralLu.mutateAsync(presta.id);
    } else {
      const repere = (lectures ?? []).find((l) => l.copro_id === actif)?.last_read_at;
      if (!repere || dernierRecu > repere) void marquerLu.mutateAsync(actif);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actif, dernierRecu, isApercu]);

  const ouvert = actif === GENERAL || !!operation?.ouvert;
  const peutEcrire = ouvert && !isApercu;
  const enCours = repondre.isPending || ecrireGeneral.isPending;

  const submit = async () => {
    const text = body.trim();
    if (!text || !peutEcrire) return;
    setErreur(null);
    try {
      if (actif === GENERAL) await ecrireGeneral.mutateAsync({ presta, role: "presta", body: text });
      else await repondre.mutateAsync({ coproId: actif, body: text });
      setBody("");
    } catch (e) {
      setErreur("L'envoi a échoué : " + messageErreur(e, "erreur inconnue"));
    }
  };

  const choisir = (id: string) => {
    setChoix(id);
    setErreur(null);
  };

  return (
    <div className="page" style={{ padding: 0 }}>
      <div className="page-head">
        <div>
          <h1 className="page-title">Messages</h1>
          <p className="page-sub">
            Échanges avec l'équipe Strat Eco : un fil général, et un fil par opération où vous avez une
            candidature en cours ou un projet - vous êtes alerté par e-mail quand un message vous attend ici
          </p>
        </div>
      </div>

      <div className="panel">
        <div className="p-head" style={{ flexWrap: "wrap", gap: 8 }}>
          <Icon name="message" size={18} />
          <h3>Fils de discussion</h3>
          <span style={{ flex: 1 }}></span>
          <div className="opt-mini" style={{ flexWrap: "wrap" }}>
            <button className={actif === GENERAL ? "on" : ""} onClick={() => choisir(GENERAL)}>
              Équipe Strat Eco
              {nonLusGeneral > 0 && actif !== GENERAL && <Badge kind="warn">{nonLusGeneral}</Badge>}
            </button>
            {operations.map((o) => {
              const nonLus = nonLusOperation(o.coproId);
              return (
                <button key={o.coproId} className={actif === o.coproId ? "on" : ""} onClick={() => choisir(o.coproId)}>
                  {o.nom}
                  <span style={{ fontSize: 11, opacity: 0.7, fontWeight: 500 }}>· {ETIQUETTE[o.motif]}</span>
                  {nonLus > 0 && actif !== o.coproId && <Badge kind="warn">{nonLus}</Badge>}
                </button>
              );
            })}
          </div>
        </div>
        <div className="p-body">
          {fil.length === 0 && (
            <p className="se-small" style={{ color: "var(--fg-muted)" }}>
              {actif === GENERAL
                ? "Aucun message pour l'instant : écrivez à l'équipe Strat Eco ci-dessous pour lancer la discussion."
                : `Aucun message pour ${operation?.nom ?? "cette opération"} : écrivez ci-dessous pour lancer la discussion.`}
            </p>
          )}
          {fil.map((m) => (
            <div className="note" key={m.id}>
              <Avatar who={initiales(m.auteur_nom)} name={m.auteur_nom} />
              <div style={{ flex: 1 }}>
                <div className="nbody">{m.body}</div>
                <div className="nmeta" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  {m.deMoi ? m.auteur_nom || presta.raison_sociale : `${m.auteur_nom || "Strat Eco"} · Strat Eco`} ·{" "}
                  {fmtDate(m.created_at)}
                  {!m.deMoi && m.aTous && <Badge kind="neutral">À tous les prestataires</Badge>}
                  {actif !== GENERAL && !m.aTous && <Badge kind="blue">Privé</Badge>}
                </div>
              </div>
            </div>
          ))}

          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <input
              className="search"
              style={{ flex: 1, margin: 0 }}
              placeholder={
                actif === GENERAL
                  ? "Écrire à l'équipe Strat Eco…"
                  : `Écrire à l'équipe Strat Eco sur ${operation?.nom ?? "cette opération"}…`
              }
              value={body}
              disabled={!peutEcrire}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submit();
              }}
            />
            <button
              className="se-btn se-btn-primary btn-sm"
              onClick={() => void submit()}
              disabled={!body.trim() || !peutEcrire || enCours}
            >
              <Icon name="send" size={15} />
              {enCours ? "Envoi…" : "Envoyer"}
            </button>
          </div>
          {erreur && (
            <p className="se-small" style={{ color: "var(--color-error-700)", marginTop: 8 }}>{erreur}</p>
          )}
          <p className="se-small" style={{ color: "var(--fg-muted)", marginTop: 8 }}>
            {isApercu
              ? "Aperçu AMO : l'équipe répond depuis la Base prestataires (fil Équipe Strat Eco) ou l'onglet Communications du dossier (opérations)."
              : !ouvert
                ? "Cette candidature est close : pour toute question, écrivez dans le fil « Équipe Strat Eco »."
                : actif === GENERAL
                  ? "Fil privé entre votre entreprise et l'équipe Strat Eco, pour les questions qui ne portent pas sur une opération."
                  : operation?.motif === "candidature"
                    ? "Visible de l'équipe Strat Eco uniquement. Une question sur le contenu de la consultation se pose plutôt avec « Poser une question » : la réponse est partagée avec tous les candidats."
                    : "Votre message est visible de l'équipe Strat Eco uniquement (pas des autres entreprises du projet)."}
          </p>
        </div>
      </div>
    </div>
  );
}

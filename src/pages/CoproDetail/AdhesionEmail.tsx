// E-mails de la campagne d'adhésion au prêt collectif (retours d'Amir du 11/10/2026) :
//  - « ouverture » : quand la cheffe de projet ouvre les adhésions sur le portail, les
//    copropriétaires reçoivent un e-mail leur annonçant qu'ils peuvent choisir leur mode de
//    financement ;
//  - « relance » : une dernière fois, avec une deuxième date limite, aux copropriétaires qui
//    n'ont pas déposé leur dossier (hors ceux qui ont choisi l'éco-PTZ individuel ou les fonds
//    propres, que la date limite ne concerne pas).
// L'objet et le message sont proposés puis modifiables ; la formule d'appel, le bouton « Choisir
// mon financement », la phrase de contact et la signature sont ajoutés par l'edge function
// creer-espace-coproprietaire (mode financement). Les e-mails partent réellement : confirmation
// avant l'envoi, progression, puis compte rendu des fiches à reprendre.
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { Modal } from "@/components/Modal";
import { messageErreur } from "@/lib/erreurs";
import { fmtDate } from "@/lib/format";
import { resumeResultats, useCreerEspaces, type EtatEspace, type ResultatEspace } from "@/api/espaces";
import { useTracerEnvoiAdhesion, type FinancementConfig } from "@/api/financement";
import { classerDestinataires, MAX_MESSAGE, MAX_SUJET, type FicheDestinataire } from "@/lib/emailEnquete";
import {
  fichesARelancer,
  messageOuvertureParDefaut,
  messageRelanceParDefaut,
  sujetOuvertureParDefaut,
  sujetRelanceParDefaut,
} from "@/lib/emailAdhesion";
import { aujourdhuiParis, limiteAdhesion } from "@/lib/financement";

export type ModeEmailAdhesion = "ouverture" | "relance";

/** Lendemain d'une date AAAA-MM-JJ (la deuxième date limite est postérieure à la première). */
function lendemain(iso: string): string {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function libelleResultat(r: ResultatEspace): string {
  if (r.envoi === "echec") return "L'e-mail n'est pas parti, à renvoyer";
  switch (r.statut) {
    case "sans_email":
      return "Pas d'adresse e-mail valide";
    case "email_pris":
      return "Adresse déjà prise";
    case "sortant":
      return "Fiche sortante";
    case "erreur":
      return "Erreur";
    default:
      return r.detail ? "Pas d'e-mail" : "E-mail non envoyé";
  }
}

export function EnvoyerAdhesionFenetre({
  mode,
  copro,
  coproId,
  config,
  fiches,
  espaces,
  choixParFiche,
  deposees,
  onClose,
}: {
  mode: ModeEmailAdhesion;
  copro: string;
  coproId: string;
  config: FinancementConfig;
  fiches: FicheDestinataire[];
  espaces: Map<string, { etat: EtatEspace }> | undefined;
  /** Mode de financement choisi par fiche (collectif, individuel, fonds). */
  choixParFiche: Map<string, string>;
  /** Fiches dont le dossier d'adhésion est déjà déposé. */
  deposees: Set<string>;
  onClose: () => void;
}) {
  const creer = useCreerEspaces(coproId);
  const tracer = useTracerEnvoiAdhesion(coproId);
  const relance = mode === "relance";
  const limiteActuelle = limiteAdhesion(config);
  const premiereLimite = config.date_limite_adhesion;
  const dejaRelance = !!config.date_limite_adhesion_2;

  // deuxième date limite (relance) : postérieure à la première et pas dans le passé
  const aujourdhui = aujourdhuiParis();
  const minLimite = [premiereLimite ? lendemain(premiereLimite) : aujourdhui, aujourdhui].sort().at(-1)!;
  const [nouvelleLimite, setNouvelleLimite] = useState("");
  const limiteOk = !relance || (!!nouvelleLimite && nouvelleLimite >= minLimite);

  const limiteDuMessage = relance ? nouvelleLimite || null : limiteActuelle;
  const sujetDefaut = relance ? sujetRelanceParDefaut(copro) : sujetOuvertureParDefaut(copro);
  const messageDefaut = relance
    ? messageRelanceParDefaut(copro, limiteDuMessage)
    : messageOuvertureParDefaut(copro, limiteDuMessage, config.date_limite_choix);
  const [sujetSaisi, setSujetSaisi] = useState<string | null>(null);
  const [messageSaisi, setMessageSaisi] = useState<string | null>(null);
  const sujet = sujetSaisi ?? sujetDefaut;
  const message = messageSaisi ?? messageDefaut;
  const vide = sujet.trim() === "" || message.trim() === "";

  const retenues = relance ? fichesARelancer(fiches, choixParFiche, deposees) : fiches;
  const classement = classerDestinataires(retenues, espaces, "tous", () => false);
  const { envoyables, avecEspace, sansEspace, sansEmail, emailPris } = classement;
  const n = envoyables.length;
  const ecartes = fiches.filter((f) => !f.sortant_le).length - retenues.filter((f) => !f.sortant_le).length;

  const [progres, setProgres] = useState(0);
  const [resultats, setResultats] = useState<ResultatEspace[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const nomDe = (r: ResultatEspace) => r.nom || envoyables.find((d) => d.id === r.id)?.nom || "Fiche";
  const titre = relance ? "Dernière relance : adhésion au prêt collectif" : "E-mail d'ouverture des adhésions";

  const lancer = () => {
    setErreur(null);
    creer.mutate(
      {
        cibles: envoyables,
        financement: { sujet: sujet.replace(/\s+/g, " ").trim(), message: message.trim(), date_limite: null },
        onProgres: setProgres,
      },
      {
        onSuccess: (res) => {
          setResultats(res);
          const r = resumeResultats(res);
          if (r.envoyes + r.simules > 0) {
            tracer.mutate(
              relance
                ? { type: "relance", nb: r.envoyes, deuxiemeLimite: nouvelleLimite }
                : { type: "ouverture", nb: r.envoyes }
            );
          }
        },
        onError: (e) => setErreur(messageErreur(e, "L'envoi a échoué.")),
      }
    );
  };

  // ---------- Compte rendu ----------
  if (resultats) {
    const r = resumeResultats(resultats);
    const aReprendre = resultats.filter((x) => x.envoi !== "envoye");
    return (
      <Modal title={titre} onClose={onClose} width={620}>
        <p className="se-body" style={{ marginTop: 0 }}>
          {r.envoyes > 0 ? (
            <>
              <Icon name="checkCircle" size={16} style={{ color: "var(--color-success-500)", verticalAlign: "-3px" }} />{" "}
              {r.envoyes} e-mail{r.envoyes > 1 ? "s" : ""} envoyé{r.envoyes > 1 ? "s" : ""}.
            </>
          ) : (
            "Aucun e-mail n'est parti."
          )}
          {r.simules > 0 && ` ${r.simules} en simulation (clé d'envoi absente du serveur).`}
          {relance && r.envoyes + r.simules > 0 && (
            <> La nouvelle date limite d'adhésion est le <b>{fmtDate(nouvelleLimite)}</b>.</>
          )}
        </p>
        {aReprendre.length > 0 && (
          <div className="tablewrap" style={{ maxHeight: 320, overflowY: "auto", marginBottom: 14 }}>
            <table className="dossiers" style={{ fontSize: 13 }}>
              <thead>
                <tr>
                  <th>Copropriétaire</th>
                  <th>Résultat</th>
                </tr>
              </thead>
              <tbody>
                {aReprendre.map((x) => (
                  <tr key={x.id} style={{ cursor: "default" }}>
                    <td style={{ fontWeight: 600 }}>{nomDe(x)}</td>
                    <td>
                      {libelleResultat(x)}
                      {x.detail && <span style={{ color: "var(--fg-muted)" }}> - {x.detail}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button className="se-btn se-btn-primary btn-sm" onClick={onClose}>
            Fermer
          </button>
        </div>
      </Modal>
    );
  }

  // ---------- Envoi en cours ----------
  if (creer.isPending) {
    const pct = n ? Math.round((progres / n) * 100) : 0;
    return (
      <Modal title={titre} onClose={() => {}} width={520} closeOnBackdrop={false}>
        <p className="se-body" style={{ marginTop: 0 }}>
          Envoi des e-mails… {progres}/{n}
        </p>
        <div className="prog">
          <i style={{ width: pct + "%" }}></i>
        </div>
        <p className="se-small" style={{ color: "var(--fg-muted)", marginBottom: 0 }}>
          Les e-mails sont espacés de quelques instants : gardez cette fenêtre ouverte.
        </p>
      </Modal>
    );
  }

  // ---------- Relecture et confirmation ----------
  return (
    <Modal title={titre} onClose={onClose} width={720}>
      <p className="se-small" style={{ marginTop: 0, color: "var(--fg-muted)" }}>
        {relance ? (
          <>
            Dernière relance possible : elle propose une <b>deuxième date limite</b> aux copropriétaires qui n'ont pas
            déposé leur dossier d'adhésion au prêt collectif. Ceux qui ont choisi l'éco-PTZ individuel ou les fonds
            propres ne sont pas relancés.
          </>
        ) : (
          <>
            Les adhésions sont ouvertes : les copropriétaires reçoivent un e-mail qui leur annonce qu'ils peuvent choisir
            leur mode de financement. Relisez-le et modifiez l'objet ou le message si nécessaire.
          </>
        )}{" "}
        La formule d'appel, le bouton « Choisir mon financement », la phrase de contact et la signature sont ajoutés pour
        chaque copropriétaire.
      </p>

      {relance && (
        <div className="mail-champ">
          <label htmlFor="relance-limite">Deuxième date limite d'adhésion au prêt collectif</label>
          <input
            id="relance-limite"
            type="date"
            className="edit-inp"
            style={{ maxWidth: 200 }}
            min={minLimite}
            value={nouvelleLimite}
            onChange={(e) => setNouvelleLimite(e.target.value)}
          />
          <span className="hint">
            Date limite actuelle : {limiteActuelle ? fmtDate(limiteActuelle) : "aucune"}. La nouvelle date est postérieure
            {premiereLimite ? ` au ${fmtDate(premiereLimite)}` : ""}. Passée cette date, plus aucun dossier ne peut être
            ouvert ; les dossiers déjà déposés peuvent encore recevoir des pièces pendant l'instruction.
          </span>
        </div>
      )}

      <div className="mail-champ">
        <label htmlFor="adh-sujet">Objet</label>
        <input id="adh-sujet" value={sujet} maxLength={MAX_SUJET} onChange={(e) => setSujetSaisi(e.target.value)} />
      </div>
      <div className="mail-champ">
        <label htmlFor="adh-message">Message</label>
        <textarea
          id="adh-message"
          rows={relance ? 9 : 11}
          value={message}
          maxLength={MAX_MESSAGE}
          onChange={(e) => setMessageSaisi(e.target.value)}
        />
        <span className="hint">
          Laissez une ligne vide entre deux paragraphes. {message.length} / {MAX_MESSAGE} caractères.
          {(sujetSaisi !== null || messageSaisi !== null) && (
            <>
              {" "}
              <button
                type="button"
                className="lien-btn"
                onClick={() => {
                  setSujetSaisi(null);
                  setMessageSaisi(null);
                }}
              >
                Rétablir le texte proposé
              </button>
            </>
          )}
        </span>
      </div>

      <p className="se-body" style={{ marginBottom: 6 }}>
        <b>
          {n} copropriétaire{n > 1 ? "s" : ""}
        </b>{" "}
        {n > 1 ? "vont" : "va"} recevoir cet e-mail :
      </p>
      <ul className="se-small" style={{ marginTop: 0, paddingLeft: 18, color: "var(--fg2)" }}>
        {avecEspace > 0 && <li>{avecEspace} avec un espace déjà activé : lien vers « Mon financement ».</li>}
        {sansEspace > 0 && (
          <li>
            {sansEspace} sans espace activé : leur espace est ouvert et l'e-mail porte le lien pour choisir leur mot de
            passe.
          </li>
        )}
      </ul>
      <div
        style={{
          maxHeight: 150,
          overflowY: "auto",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-md)",
          padding: "8px 12px",
          fontSize: 13,
          marginBottom: 12,
        }}
      >
        {envoyables.map((d) => (
          <div key={d.id} style={{ padding: "3px 0" }}>
            <b>{d.nom}</b> <span style={{ color: "var(--fg-muted)" }}>· {d.email}</span>
          </div>
        ))}
        {n === 0 && <span style={{ color: "var(--fg-muted)" }}>Personne à qui écrire.</span>}
      </div>
      {(sansEmail + emailPris > 0 || (relance && ecartes > 0)) && (
        <p className="se-small" style={{ color: "var(--fg-muted)" }}>
          Laissés de côté :{" "}
          {[
            relance && ecartes > 0 && `${ecartes} dont le dossier est déjà déposé ou qui n'ont pas choisi le prêt collectif`,
            sansEmail > 0 && `${sansEmail} sans adresse e-mail`,
            emailPris > 0 && `${emailPris} dont l'adresse appartient déjà à un compte Strat Eco, syndic ou prestataire`,
          ]
            .filter(Boolean)
            .join(" · ")}
          .
        </p>
      )}
      <div className="cc-next" style={{ marginTop: 12, marginBottom: 16 }}>
        <Icon name="alert" size={15} className="ico" style={{ color: "var(--color-warning-500)" }} />
        <span>
          Les e-mails partent réellement, aux adresses des fiches.
          {relance && " La relance ne peut être faite qu'une fois : elle fixe la deuxième date limite."}
        </span>
      </div>
      {vide && (
        <p className="se-small" style={{ color: "var(--color-error-700)" }}>
          L'objet et le message ne peuvent pas être vides.
        </p>
      )}
      {relance && nouvelleLimite !== "" && nouvelleLimite < minLimite && (
        <p className="se-small" style={{ color: "var(--color-error-700)" }}>
          La deuxième date limite doit être postérieure à la première et ne peut pas être dans le passé.
        </p>
      )}
      {erreur && <p className="se-small" style={{ color: "var(--color-error-700)" }}>{erreur}</p>}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button className="se-btn se-btn-ghost btn-sm" onClick={onClose}>
          {relance ? "Annuler" : "Ne pas envoyer maintenant"}
        </button>
        <button
          className="se-btn se-btn-primary btn-sm"
          onClick={lancer}
          disabled={n === 0 || vide || !limiteOk || (relance && dejaRelance)}
        >
          <Icon name="send" size={14} />
          {n > 1 ? `Envoyer ${n} e-mails` : "Envoyer l'e-mail"}
        </button>
      </div>
    </Modal>
  );
}

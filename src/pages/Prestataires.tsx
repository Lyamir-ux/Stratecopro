// Base prestataires - entreprises référencées pour les consultations de
// prestations intellectuelles (MOE, diagnostiqueur, CT, SPS…). C'est dans
// cette base que la publication d'une consultation va chercher les adresses
// e-mail à alerter.
// E-mail facultatif depuis le 27/09/2026 (0105) : les maîtres d'œuvre du
// portefeuille ont été référencés sur leur seul nom - sans adresse, la fiche
// n'est alertée de rien et ne peut pas recevoir de compte.
// Plusieurs e-mails par entreprise depuis le 27/09/2026 (0106) : la principale
// et autant d'adresses en copie des alertes que voulu.
// Bug d'Amir du 01/10/2026 (fiche « Pierre Baumann » créée mais introuvable) :
// recherche sur le nom, le contact, la ville et les e-mails, et ouverture
// directe d'une fiche par /prestataires?fiche=<id> (lien du bandeau du dossier).
// Départements et « Ne pas consulter » depuis le 01/10/2026 (0122) : réglés
// par l'entreprise dans Mon entreprise, ou par l'équipe dans cette fiche.
// « Créer l'accès » depuis le 01/10/2026 (0123, question d'Amir sur la fiche
// « Best Ryan ») : aucune entreprise n'avait de compte, le rattachement se
// faisait en SQL. Le compte se crée seulement sur un clic dans la fiche, à
// l'e-mail principal ; l'entreprise reçoit un lien pour choisir son mot de passe.
// Un accès par personne depuis le 12/10/2026 (0162, demande d'Amir « côté maître
// d'œuvre ») : chaque adresse de la fiche est une personne, avec son propre
// accès au même espace d'entreprise ; « Créer l'accès » devant chaque adresse,
// retirer une adresse de la fiche retire l'accès de la personne.
// Filtre par zone de chalandise (idée d'Amir du 01/10/2026) : un département,
// et les entreprises qui y interviennent (celles qui couvrent toute la France
// comprises). Fil « Équipe Strat Eco » de chaque entreprise (0124) : bouton
// Messages, pastille des messages non lus.
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useCrumbs } from "@/components/Shell/useCrumbs";
import { Icon } from "@/components/Icon";
import { Avatar, Badge } from "@/components/ui";
import { Modal } from "@/components/Modal";
import { EmailsSecondaires } from "@/components/EmailsSecondaires";
import { DepartementsPicker, choixVersDepartements, departementsVersChoix } from "@/components/DepartementsPicker";
import { DEPARTEMENTS, GRAND_EST, couvreDepartement, nomDepartement, resumeDepartements } from "@/lib/departements";
import { FilGeneralEntreprise } from "@/components/FilGeneralEntreprise";
import { PanneauVerificationRge } from "@/components/VerificationRge";
import { chiffres, formaterSiret, siretValide } from "@/lib/rge";
import { nonLusFilGeneral, useFilsGeneraux, useLecturesFilGeneral } from "@/api/messages";
import { METIERS_PRESTATAIRES } from "@/api/consultations";
import {
  emailValide,
  motifAdressePrise,
  normaliserEmails,
  useAccesPrestataires,
  useAddPrestataire,
  useCreerAccesPrestataire,
  useDeletePrestataire,
  usePrestataires,
  useRetirerAccesPrestataire,
  useUpdatePrestataire,
  type AccesAdresse,
  type Prestataire,
  type ResultatAccesPrestataire,
} from "@/api/prestataires";
import { accesPerdus, adressesFiche, resumeAcces } from "@/lib/prestataires";
import type { Tables } from "@/lib/database.types";
import { fmtDate, normaliserRecherche } from "@/lib/format";

type TypeConsult = Tables<"consultations">["type"];

const EMPTY = {
  raison_sociale: "",
  contact_nom: "",
  email: "",
  emails_secondaires: [] as string[],
  telephone: "",
  ville: "",
  siret: "",
  types: [] as TypeConsult[],
  // départements où l'entreprise est consultée (0122) : null = toute la France
  departements: null as string[] | null,
  ne_pas_consulter: false,
};

function TypeChips({ types }: { types: TypeConsult[] }) {
  return (
    <span style={{ display: "inline-flex", gap: 5, flexWrap: "wrap" }}>
      {types.map((t) => {
        const def = METIERS_PRESTATAIRES.find((x) => x.id === t);
        return (
          <span key={t} className="cs-type" style={{ fontSize: 11.5 }}>
            <Icon name={def?.icon ?? "briefcase"} size={12} />
            {def?.label ?? t}
          </span>
        );
      })}
    </span>
  );
}

const LIBELLE_ETAT: Record<string, string> = {
  actif: "Compte actif",
  invite: "Invitée",
  a_creer: "Sans accès",
  email_pris: "Adresse prise",
};

/** Accès de l'entreprise dans la liste : une personne par adresse de la fiche. */
function BadgeAcces({ adresses }: { adresses: AccesAdresse[] | undefined }) {
  if (!adresses) return null;
  const r = resumeAcces(adresses);
  const detail = adresses.map((a) => `${a.email} : ${LIBELLE_ETAT[a.etat] ?? a.etat}`).join("\n");
  if (r.actifs > 0) {
    return (
      <span title={detail}>
        <Badge kind="success" dot>
          {r.total === 1 ? "Compte actif" : `${r.actifs}/${r.total} accès actifs`}
        </Badge>
      </span>
    );
  }
  if (r.invites > 0) {
    return (
      <span title={detail}>
        <Badge kind="warn">{r.invites > 1 ? `${r.invites} invitées` : "Invitée"}</Badge>
      </span>
    );
  }
  if (r.pris > 0 && r.aCreer === 0) {
    return (
      <span className="badge b-error" title={detail}>
        Adresse prise
      </span>
    );
  }
  return (
    <span title={detail || undefined}>
      <Badge kind="neutral">Sans compte</Badge>
    </span>
  );
}

/** Compte rendu d'une création d'accès, en une phrase. */
function phraseResultat(r: ResultatAccesPrestataire): string {
  const a = r.email ? ` à ${r.email}` : "";
  const simulation = r.envoi === "simule" ? " (simulation : clé d'envoi absente du serveur)" : "";
  if (r.envoi === "echec") {
    return `${r.email ?? "Accès"} : le compte est prêt mais l'e-mail n'est pas parti, utilisez « Renvoyer l'e-mail ».`;
  }
  switch (r.statut) {
    case "invite":
      return `Accès créé : e-mail d'activation envoyé${a}${simulation}.`;
    case "relie":
      return `Compte existant de ${r.email ?? "cette adresse"} relié à l'entreprise : e-mail envoyé${simulation}.`;
    case "renvoye":
      return `E-mail d'activation renvoyé${a}${simulation}.`;
    case "deja_actif":
      return `${r.email ?? "Accès"} : accès déjà activé, rien à envoyer.`;
    case "sans_email":
      return r.detail ?? "Pas d'adresse e-mail valide sur la fiche.";
    default:
      return `${r.email ? r.email + " : " : ""}${r.detail ?? "la création de l'accès a échoué."}`;
  }
}

/** État d'une adresse de la fiche, en une pastille. */
function EtatAdresse({ a }: { a: AccesAdresse }) {
  if (a.horsFiche) {
    return (
      <span title="Compte relié par une adresse qui n'est plus sur la fiche">
        <Badge kind="warn">Hors fiche</Badge>
      </span>
    );
  }
  switch (a.etat) {
    case "actif":
      return (
        <span title={a.derniereConnexion ? `Dernière connexion le ${fmtDate(a.derniereConnexion)}` : undefined}>
          <Badge kind="success" dot>Compte actif</Badge>
        </span>
      );
    case "invite":
      return (
        <span title={`E-mail d'activation envoyé${a.inviteLe ? ` le ${fmtDate(a.inviteLe)}` : ""}, lien pas encore utilisé`}>
          <Badge kind="warn">Invitée</Badge>
        </span>
      );
    case "email_pris":
      return (
        <span className="badge b-error" title={motifAdressePrise(a)}>
          Adresse prise
        </span>
      );
    default:
      return (
        <span title="Accès créé d'office avec la prochaine consultation envoyée, ou tout de suite par « Créer l'accès »">
          <Badge kind="neutral">Sans accès</Badge>
        </span>
      );
  }
}

/**
 * Accès des personnes de l'entreprise à son espace : une ligne par adresse de
 * la fiche, avec « Créer l'accès » (ou « Renvoyer l'e-mail » tant que le lien
 * n'a pas servi). Les e-mails partent réellement, d'où la confirmation.
 */
function AccesEspace({
  fiche,
  adresses,
  emailSaisi,
  secondairesSaisis,
}: {
  fiche: Prestataire;
  adresses: AccesAdresse[] | undefined;
  /** Adresses en cours de saisie : les accès partent des adresses enregistrées. */
  emailSaisi: string;
  secondairesSaisis: string[];
}) {
  const creer = useCreerAccesPrestataire();
  const retirer = useRetirerAccesPrestataire();
  const [confirmer, setConfirmer] = useState<{ email?: string; tous?: boolean; destinataires: string[] } | null>(null);
  const [resultats, setResultats] = useState<ResultatAccesPrestataire[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);

  const enregistrees = adressesFiche(fiche.email, fiche.emails_secondaires);
  // ordre de la fiche (principale puis autres), comptes hors fiche en dernier
  const rang = (a: AccesAdresse) => (a.horsFiche ? Infinity : enregistrees.indexOf(a.email));
  const liste = [...(adresses ?? [])].sort((x, y) => rang(x) - rang(y));
  const saisies = adressesFiche(emailSaisi, secondairesSaisis);
  const modifiees = saisies.length !== enregistrees.length || saisies.some((e, i) => e !== enregistrees[i]);
  const perdus = new Set(
    accesPerdus(
      liste.filter((a) => a.userId && !a.horsFiche).map((a) => a.email),
      emailSaisi,
      secondairesSaisis
    )
  );
  const aCreer = liste.filter((a) => !a.horsFiche && a.etat === "a_creer");

  const demander = (c: { email?: string; tous?: boolean; destinataires: string[] }) => {
    setResultats([]);
    setErreur(null);
    setConfirmer(c);
  };

  const lancer = () => {
    if (!confirmer) return;
    setErreur(null);
    creer.mutate(
      { prestataireId: fiche.id, email: confirmer.email, tous: confirmer.tous },
      {
        onSuccess: (r) => {
          setResultats(r);
          setConfirmer(null);
        },
        onError: (e) => setErreur(e instanceof Error ? e.message : "La création de l'accès a échoué."),
      }
    );
  };

  return (
    <div className="cs-field cs-field-full" style={{ borderTop: "1px solid var(--border)", paddingTop: 14 }}>
      <label>Accès à l'espace prestataire</label>
      <p className="se-small" style={{ margin: "2px 0 8px", color: "var(--fg2)" }}>
        Chaque adresse est une personne : elle reçoit son propre accès, et toutes retrouvent le même espace de
        l'entreprise (consultations, offres, projets, messages). Une adresse sans accès reçoit le sien d'office avec
        la prochaine consultation qui lui est envoyée ; « Créer l'accès » l'ouvre tout de suite.
      </p>

      {liste.length === 0 && (
        <p className="se-small" style={{ margin: 0, color: "var(--fg-muted)" }}>
          Renseignez au moins une adresse et enregistrez la fiche pour pouvoir créer les accès.
        </p>
      )}

      {liste.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", border: "1px solid var(--border)", borderRadius: "var(--radius-md)" }}>
          {liste.map((a, i) => {
            const peutEnvoyer = fiche.actif && !a.horsFiche && (a.etat === "a_creer" || a.etat === "invite");
            const retiree = perdus.has(a.email);
            const sousTitre = retiree
              ? "Adresse retirée : l'accès de la personne sera retiré à l'enregistrement"
              : a.etat === "email_pris" && !a.horsFiche
                ? motifAdressePrise(a)
                : a.nom !== fiche.raison_sociale
                  ? a.nom
                  : null;
            return (
              <div
                key={a.email + (a.horsFiche ? "-hors" : "")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  flexWrap: "wrap",
                  padding: "8px 10px",
                  borderTop: i > 0 ? "1px solid var(--border)" : undefined,
                }}
              >
                <span style={{ flex: "1 1 220px", minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 13.5, fontWeight: 600, overflowWrap: "anywhere" }}>
                    {a.email}
                    {a.principale && (
                      <span style={{ marginLeft: 6, fontSize: 11.5, fontWeight: 400, color: "var(--fg-muted)" }}>principale</span>
                    )}
                  </span>
                  {sousTitre && (
                    <span style={{ display: "block", fontSize: 12, color: retiree ? "var(--color-error-700)" : "var(--fg-muted)" }}>
                      {sousTitre}
                    </span>
                  )}
                </span>
                <EtatAdresse a={a} />
                {peutEnvoyer && !confirmer && (
                  <button
                    type="button"
                    className="se-btn se-btn-ghost btn-sm"
                    disabled={creer.isPending || modifiees}
                    title={modifiees ? "Enregistrez d'abord les adresses modifiées" : undefined}
                    onClick={() => demander({ email: a.email, destinataires: [a.email] })}
                  >
                    <Icon name="send" size={14} />
                    {a.etat === "invite" ? "Renvoyer l'e-mail" : "Créer l'accès"}
                  </button>
                )}
                {a.horsFiche && a.userId && (
                  <button
                    type="button"
                    className="se-btn se-btn-ghost btn-sm"
                    disabled={retirer.isPending}
                    onClick={() => {
                      if (window.confirm(`Retirer l'accès de ${a.email} à l'espace de ${fiche.raison_sociale} ?`)) {
                        retirer.mutate(a.userId!, {
                          onError: (e) => setErreur(e instanceof Error ? e.message : "Le retrait a échoué."),
                        });
                      }
                    }}
                  >
                    <Icon name="x" size={14} />
                    Retirer l'accès
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!fiche.actif && liste.some((a) => a.etat !== "actif") && (
        <p className="se-small" style={{ margin: "6px 0 0", color: "var(--fg-muted)" }}>
          Fiche suspendue : réactivez-la pour créer les accès.
        </p>
      )}
      {fiche.actif && modifiees && (
        <p className="se-small" style={{ margin: "6px 0 0", color: "var(--fg-muted)" }}>
          Enregistrez d'abord les adresses ajoutées ou modifiées : les accès partent des adresses enregistrées.
        </p>
      )}

      {fiche.actif && aCreer.length > 1 && !confirmer && (
        <div style={{ marginTop: 10 }}>
          <button
            type="button"
            className="se-btn se-btn-ghost btn-sm"
            disabled={creer.isPending || modifiees}
            onClick={() => demander({ tous: true, destinataires: aCreer.map((a) => a.email) })}
          >
            <Icon name="send" size={14} />
            Créer les {aCreer.length} accès manquants
          </button>
        </div>
      )}

      {resultats.length > 0 && (
        <div style={{ margin: "8px 0 0" }}>
          {resultats.map((r, i) => (
            <p
              key={i}
              className="se-small"
              style={{ margin: "2px 0 0", color: r.envoi === "envoye" ? "var(--color-success-700)" : "var(--fg2)" }}
            >
              {r.envoi === "envoye" && <Icon name="checkCircle" size={14} style={{ verticalAlign: "-2px", marginRight: 4 }} />}
              {phraseResultat(r)}
            </p>
          ))}
        </div>
      )}
      {erreur && <p className="se-small" style={{ margin: "8px 0 0", color: "var(--color-error-700)" }}>{erreur}</p>}

      {confirmer && (
        <div style={{ marginTop: 10 }}>
          <div className="cc-next" style={{ marginTop: 0, marginBottom: 10 }}>
            <Icon name="alert" size={15} className="ico" style={{ color: "var(--color-warning-500)" }} />
            <span>
              {confirmer.destinataires.length > 1 ? (
                <>
                  {confirmer.destinataires.length} accès vont être créés et un e-mail va partir réellement à chaque
                  adresse : <b>{confirmer.destinataires.join(", ")}</b>.
                </>
              ) : liste.find((a) => a.email === confirmer.email)?.etat === "invite" ? (
                <>Un nouvel e-mail d'activation va partir réellement à <b>{confirmer.email}</b>.</>
              ) : (
                <>Le compte va être créé et un e-mail va partir réellement à <b>{confirmer.email}</b>.</>
              )}
            </span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="se-btn se-btn-ghost btn-sm" onClick={() => setConfirmer(null)} disabled={creer.isPending}>
              Annuler
            </button>
            <button type="button" className="se-btn se-btn-primary btn-sm" onClick={lancer} disabled={creer.isPending}>
              <Icon name="send" size={14} />
              {creer.isPending ? "Envoi…" : confirmer.destinataires.length > 1 ? "Envoyer les e-mails" : "Envoyer l'e-mail"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function PrestaForm({
  initial,
  busy,
  onSubmit,
  onClose,
  title,
  fiche,
  acces,
}: {
  initial: typeof EMPTY;
  busy: boolean;
  onSubmit: (draft: typeof EMPTY) => void;
  onClose: () => void;
  title: string;
  /** Fiche enregistrée (modification) : bloc d'accès à l'espace prestataire. */
  fiche?: Prestataire;
  acces?: AccesAdresse[];
}) {
  const [draft, setDraft] = useState(initial);
  const [voirRge, setVoirRge] = useState(false);
  const set = <K extends keyof typeof EMPTY>(k: K, v: (typeof EMPTY)[K]) => setDraft((p) => ({ ...p, [k]: v }));
  const toggleType = (t: TypeConsult) =>
    set("types", draft.types.includes(t) ? draft.types.filter((x) => x !== t) : [...draft.types, t]);
  const emailOk = [draft.email, ...draft.emails_secondaires].every((e) => !e.trim() || emailValide(e));
  const valid =
    draft.raison_sociale.trim() && emailOk && draft.types.length > 0 && choixVersDepartements(draft.departements) !== null;

  return (
    <Modal title={title} onClose={onClose} width={620}>
      <div className="cs-form-grid">
        <div className="cs-field">
          <label>Raison sociale *</label>
          <input className="edit-inp" style={{ maxWidth: "none" }} value={draft.raison_sociale}
            onChange={(e) => set("raison_sociale", e.target.value)} placeholder="Atelier Vernet Architectes" />
        </div>
        <div className="cs-field">
          <label>Contact</label>
          <input className="edit-inp" style={{ maxWidth: "none" }} value={draft.contact_nom}
            onChange={(e) => set("contact_nom", e.target.value)} placeholder="Prénom Nom" />
        </div>
        <div className="cs-field cs-field-full">
          <label>E-mail principal <span style={{ color: "var(--fg-muted)", fontWeight: 400 }}>· alertes et accès, sans e-mail aucune alerte</span></label>
          <input className="edit-inp" style={{ maxWidth: "none" }} type="email" value={draft.email}
            onChange={(e) => set("email", e.target.value)} placeholder="contact@entreprise.fr" />
        </div>
        <div className="cs-field cs-field-full">
          <label>Autres e-mails <span style={{ color: "var(--fg-muted)", fontWeight: 400 }}>· une adresse par personne : mêmes alertes, et chacune son accès</span></label>
          <EmailsSecondaires valeurs={draft.emails_secondaires} onChange={(v) => set("emails_secondaires", v)} />
        </div>
        <div className="cs-field">
          <label>Téléphone</label>
          <input className="edit-inp" style={{ maxWidth: "none" }} value={draft.telephone}
            onChange={(e) => set("telephone", e.target.value)} placeholder="03 88 …" />
        </div>
        <div className="cs-field">
          <label>Ville</label>
          <input className="edit-inp" style={{ maxWidth: "none" }} value={draft.ville}
            onChange={(e) => set("ville", e.target.value)} placeholder="Strasbourg" />
        </div>
        <div className="cs-field">
          <label>SIRET</label>
          <input className="edit-inp" style={{ maxWidth: "none" }} value={draft.siret}
            onChange={(e) => set("siret", e.target.value)} placeholder="123 456 789 00012" />
        </div>
        <div className="cs-field cs-field-full">
          {voirRge ? (
            <div className="panel" style={{ padding: "10px 12px" }}>
              <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
                <b style={{ fontSize: 14 }}>Qualification RGE</b>
                <span style={{ flex: 1 }}></span>
                <button type="button" className="se-btn se-btn-ghost btn-sm" onClick={() => setVoirRge(false)}>
                  Masquer
                </button>
              </div>
              <PanneauVerificationRge
                key={chiffres(draft.siret)}
                siretInitial={draft.siret}
                nomInitial={draft.raison_sociale}
                reprendreSiret={(s) => set("siret", formaterSiret(s))}
              />
            </div>
          ) : (
            <button
              type="button"
              className="se-btn se-btn-ghost btn-sm"
              style={{ alignSelf: "flex-start" }}
              disabled={!siretValide(draft.siret) && draft.raison_sociale.trim().length < 2}
              title="Liste officielle des entreprises RGE (ADEME) : domaines de travaux, validité, certificat"
              onClick={() => setVoirRge(true)}
            >
              <Icon name="search" size={14} />
              Vérifier la qualification RGE
            </button>
          )}
        </div>
        <div className="cs-field cs-field-full">
          <label>Prestations couvertes * <span style={{ color: "var(--fg-muted)", fontWeight: 400 }}>· détermine les consultations reçues</span></label>
          <div className="cs-type-pick">
            {METIERS_PRESTATAIRES.map((t) => (
              <button key={t.id} type="button"
                className={"cs-type-opt" + (draft.types.includes(t.id) ? " on" : "")}
                onClick={() => toggleType(t.id)}>
                <Icon name={t.icon} size={15} />
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div className="cs-field cs-field-full">
          <label>Départements <span style={{ color: "var(--fg-muted)", fontWeight: 400 }}>· selon l'adresse de la copropriété consultée</span></label>
          <DepartementsPicker valeur={draft.departements} onChange={(v) => set("departements", v)} />
        </div>
        <div className="cs-field cs-field-full">
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontWeight: 400 }}>
            <input type="checkbox" checked={draft.ne_pas_consulter} onChange={(e) => set("ne_pas_consulter", e.target.checked)} />
            <span>
              <b>Ne pas consulter</b> · l'entreprise ne souhaite pas être consultée (aucune alerte, consultations masquées dans son espace)
            </span>
          </label>
        </div>
        {fiche ? (
          <AccesEspace
            fiche={fiche}
            adresses={acces}
            emailSaisi={draft.email}
            secondairesSaisis={draft.emails_secondaires}
          />
        ) : (
          <p className="se-small cs-field-full" style={{ margin: 0, color: "var(--fg-muted)" }}>
            L'accès de chaque adresse à l'espace prestataire se crée d'office avec la première consultation envoyée à
            l'entreprise, ou plus tôt depuis la fiche enregistrée (« Créer l'accès »).
          </p>
        )}
      </div>
      <button className="se-btn se-btn-primary" style={{ marginTop: 18 }} disabled={!valid || busy}
        onClick={() => onSubmit(draft)}>
        <Icon name="check" size={16} />
        Enregistrer
      </button>
    </Modal>
  );
}

export default function Prestataires() {
  useCrumbs([{ label: "Base prestataires" }]);
  const { data: prestas } = usePrestataires();
  const { data: acces } = useAccesPrestataires();
  const add = useAddPrestataire();
  const update = useUpdatePrestataire();
  const del = useDeletePrestataire();

  const [filter, setFilter] = useState<TypeConsult | "">("");
  // zone de chalandise : code de département, "" = toutes les zones
  const [zone, setZone] = useState("");
  const [recherche, setRecherche] = useState("");
  const [filDe, setFilDe] = useState<Prestataire | null>(null);
  const { data: filsGeneraux } = useFilsGeneraux();
  const { data: lecturesFils } = useLecturesFilGeneral();
  const nonLus = nonLusFilGeneral(filsGeneraux, lecturesFils, "amo");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Prestataire | null>(null);
  const [params, setParams] = useSearchParams();
  const ficheDemandee = params.get("fiche");

  // /prestataires?fiche=<id> : la fiche s'ouvre directement, une seule fois
  useEffect(() => {
    if (!ficheDemandee || !prestas) return;
    const p = prestas.find((x) => x.id === ficheDemandee);
    if (p) setEditing(p);
    setParams((prev) => {
      const suite = new URLSearchParams(prev);
      suite.delete("fiche");
      return suite;
    }, { replace: true });
  }, [ficheDemandee, prestas, setParams]);

  const list = useMemo(() => {
    const q = normaliserRecherche(recherche.trim());
    return (prestas ?? []).filter(
      (p) =>
        (!filter || p.types.includes(filter)) &&
        (!zone || couvreDepartement(p.departements, zone)) &&
        (!q ||
          normaliserRecherche(
            [p.raison_sociale, p.contact_nom, p.ville, p.email, ...p.emails_secondaires].filter(Boolean).join(" ")
          ).includes(q))
    );
  }, [prestas, filter, zone, recherche]);

  const save = async (draft: typeof EMPTY, id?: string) => {
    const emails = normaliserEmails(draft.email, draft.emails_secondaires);
    if (id) {
      // retirer une adresse de la fiche retire l'accès de la personne (0162)
      const perdus = accesPerdus(
        (acces?.get(id) ?? []).filter((a) => a.userId && !a.horsFiche).map((a) => a.email),
        emails.email,
        emails.emails_secondaires
      );
      if (
        perdus.length > 0 &&
        !window.confirm(
          `${perdus.length > 1 ? "Ces personnes perdront leur" : "Cette personne perdra son"} accès à l'espace de l'entreprise : ${perdus.join(", ")}. Enregistrer quand même ?`
        )
      ) {
        return;
      }
    }
    const payload = {
      raison_sociale: draft.raison_sociale.trim(),
      contact_nom: draft.contact_nom.trim() || null,
      ...emails,
      telephone: draft.telephone.trim() || null,
      ville: draft.ville.trim() || null,
      siret: draft.siret.trim() || null,
      types: draft.types,
      departements: choixVersDepartements(draft.departements) ?? [],
      ne_pas_consulter: draft.ne_pas_consulter,
    };
    if (id) await update.mutateAsync({ id, patch: payload });
    else await add.mutateAsync(payload);
    setCreating(false);
    setEditing(null);
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Base prestataires</h1>
          <p className="page-sub">
            Entreprises référencées pour vos consultations - chaque publication alerte par e-mail les
            prestataires actifs du métier concerné.
          </p>
        </div>
        <span className="spacer"></span>
        <input
          className="edit-inp"
          type="search"
          placeholder="Rechercher (nom, contact, ville, e-mail)"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          style={{ maxWidth: 260 }}
        />
        <select className="edit-sel" value={filter} onChange={(e) => setFilter(e.target.value as TypeConsult | "")}>
          <option value="">Tous les métiers</option>
          {METIERS_PRESTATAIRES.map((t) => (
            <option key={t.id} value={t.id}>{t.label}</option>
          ))}
        </select>
        <select
          className="edit-sel"
          value={zone}
          onChange={(e) => setZone(e.target.value)}
          title="Zone de chalandise : entreprises qui interviennent dans ce département, celles qui couvrent toute la France comprises"
        >
          <option value="">Toutes les zones</option>
          <optgroup label="Grand Est">
            {GRAND_EST.map((code) => (
              <option key={code} value={code}>{code} - {nomDepartement(code)}</option>
            ))}
          </optgroup>
          <optgroup label="Autres départements">
            {DEPARTEMENTS.filter((d) => !GRAND_EST.includes(d.code)).map((d) => (
              <option key={d.code} value={d.code}>{d.code} - {d.nom}</option>
            ))}
          </optgroup>
        </select>
        <button className="se-btn se-btn-primary" onClick={() => setCreating(true)}>
          <Icon name="plus" size={17} />
          Référencer une entreprise
        </button>
      </div>

      {(recherche.trim() || filter || zone) && list.length > 0 && (
        <p className="se-small" style={{ color: "var(--fg-muted)", margin: "0 0 10px" }}>
          {list.length} entreprise{list.length > 1 ? "s" : ""} sur {prestas?.length ?? 0}
          {zone ? ` intervenant en ${zone} - ${nomDepartement(zone)}` : ""}
        </p>
      )}

      {list.length === 0 && (recherche.trim() || filter || zone) && (prestas?.length ?? 0) > 0 && (
        <p className="se-small" style={{ color: "var(--fg-muted)" }}>Aucune entreprise ne correspond à cette recherche.</p>
      )}

      {(prestas?.length ?? 0) === 0 && (
        <div className="placeholder-screen" style={{ minHeight: 300 }}>
          <div className="ps-ico"><Icon name="briefcase" size={30} /></div>
          <h2>Aucune entreprise référencée</h2>
          <p>Ajoutez vos prestataires (MOE, diagnostiqueurs, contrôleurs, SPS…) pour qu'ils soient alertés à chaque consultation.</p>
        </div>
      )}

      {list.length > 0 && (
        <div className="panel">
          <div className="p-body" style={{ padding: 0 }}>
            {list.map((p) => (
              <div key={p.id} className="task-row" style={{ alignItems: "center", opacity: p.actif ? 1 : 0.55 }}>
                <Avatar
                  who={p.raison_sociale.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                  name={p.raison_sociale}
                />
                <span style={{ minWidth: 0, flex: "0 1 260px" }}>
                  <span style={{ display: "block", fontWeight: 600, fontSize: 14 }}>{p.raison_sociale}</span>
                  <span style={{ display: "block", fontSize: 12.5, color: "var(--fg-muted)" }}>
                    {[p.contact_nom, p.ville].filter(Boolean).join(" · ") || "-"}
                  </span>
                  {(p.departements.length > 0 || zone) && (
                    <span
                      style={{ display: "block", fontSize: 12, color: "var(--fg3)" }}
                      title="Départements où l'entreprise peut être consultée"
                    >
                      <Icon name="mapPin" size={11} /> {resumeDepartements(p.departements)}
                    </span>
                  )}
                </span>
                <TypeChips types={p.types} />
                {p.ne_pas_consulter && (
                  <span
                    style={{ flex: "none", whiteSpace: "nowrap" }}
                    title="L'entreprise ne souhaite pas être consultée : aucune alerte de consultation"
                  >
                    <Badge kind="warn">Ne pas consulter</Badge>
                  </span>
                )}
                <span className="spacer" style={{ flex: 1 }}></span>
                {p.email ? (
                  <span
                    style={{ fontSize: 12.5, color: "var(--fg3)", whiteSpace: "nowrap" }}
                    title={[p.email, ...p.emails_secondaires].join(", ")}
                  >
                    {p.email}
                    {p.emails_secondaires.length > 0 && (
                      <b style={{ marginLeft: 6, color: "var(--fg2)" }}>+{p.emails_secondaires.length}</b>
                    )}
                  </span>
                ) : (
                  <span
                    style={{ flex: "none", whiteSpace: "nowrap" }}
                    title="Sans e-mail, l'entreprise ne reçoit aucune alerte et ne peut pas recevoir de compte"
                  >
                    <Badge kind="warn">E-mail à renseigner</Badge>
                  </span>
                )}
                <span style={{ flex: "none", whiteSpace: "nowrap" }}>
                  <BadgeAcces adresses={acces?.get(p.id)} />
                </span>
                <button
                  className="se-btn se-btn-ghost btn-sm"
                  title="Fil « Équipe Strat Eco » avec l'entreprise (hors opération)"
                  onClick={() => setFilDe(p)}
                >
                  <Icon name="message" size={14} />
                  Messages
                  {(nonLus.get(p.id) ?? 0) > 0 && <Badge kind="warn">{nonLus.get(p.id)}</Badge>}
                </button>
                <button
                  className="se-btn se-btn-ghost btn-sm"
                  title={p.actif ? "Suspendre (ne recevra plus d'alertes)" : "Réactiver"}
                  onClick={() => void update.mutateAsync({ id: p.id, patch: { actif: !p.actif } })}
                >
                  {p.actif ? "Suspendre" : "Réactiver"}
                </button>
                <button className="icon-btn" title="Modifier" onClick={() => setEditing(p)}>
                  <Icon name="edit" size={16} />
                </button>
                <button
                  className="icon-btn"
                  title="Supprimer"
                  onClick={() => {
                    if (window.confirm(`Supprimer ${p.raison_sociale} de la base ?`)) void del.mutateAsync(p.id);
                  }}
                >
                  <Icon name="trash" size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {creating && (
        <PrestaForm
          title="Référencer une entreprise"
          initial={EMPTY}
          busy={add.isPending}
          onClose={() => setCreating(false)}
          onSubmit={(d) => void save(d)}
        />
      )}
      {editing && (
        <PrestaForm
          title={"Modifier - " + editing.raison_sociale}
          initial={{
            raison_sociale: editing.raison_sociale,
            contact_nom: editing.contact_nom ?? "",
            email: editing.email ?? "",
            emails_secondaires: editing.emails_secondaires,
            telephone: editing.telephone ?? "",
            ville: editing.ville ?? "",
            siret: editing.siret ?? "",
            types: editing.types,
            departements: departementsVersChoix(editing.departements),
            ne_pas_consulter: editing.ne_pas_consulter,
          }}
          busy={update.isPending}
          onClose={() => setEditing(null)}
          onSubmit={(d) => void save(d, editing.id)}
          fiche={prestas?.find((x) => x.id === editing.id) ?? editing}
          acces={acces?.get(editing.id)}
        />
      )}
      {filDe && (
        <FilGeneralEntreprise
          presta={prestas?.find((x) => x.id === filDe.id) ?? filDe}
          sansAcces={!!acces && !(acces.get(filDe.id) ?? []).some((a) => a.userId)}
          onClose={() => setFilDe(null)}
        />
      )}
    </div>
  );
}

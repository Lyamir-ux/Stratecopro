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
// Filtre par zone de chalandise (idée d'Amir du 01/10/2026) : un département,
// et les entreprises qui y interviennent (celles qui couvrent toute la France
// comprises). Fil « Équipe Strat Eco » de chaque entreprise (0124) : bouton
// Messages, pastille des messages non lus.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { useCrumbs } from "@/components/Shell/useCrumbs";
import { Icon } from "@/components/Icon";
import { Avatar, Badge } from "@/components/ui";
import { Modal } from "@/components/Modal";
import { EmailsSecondaires } from "@/components/EmailsSecondaires";
import { DepartementsPicker, choixVersDepartements, departementsVersChoix } from "@/components/DepartementsPicker";
import { DEPARTEMENTS, GRAND_EST, couvreDepartement, nomDepartement, resumeDepartements } from "@/lib/departements";
import { FilGeneralEntreprise } from "@/components/FilGeneralEntreprise";
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
  useUpdatePrestataire,
  type AccesPrestataire,
  type Prestataire,
  type ResultatAccesPrestataire,
} from "@/api/prestataires";
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

/** État de l'accès dans la liste (repli sur user_id tant que l'état charge). */
function BadgeAcces({ acces, lie }: { acces: AccesPrestataire | undefined; lie: boolean }) {
  const etat = acces?.etat ?? (lie ? "actif" : "a_creer");
  if (etat === "actif") return <Badge kind="success" dot>Compte actif</Badge>;
  if (etat === "invite") {
    return (
      <span title={`E-mail d'activation envoyé${acces?.inviteLe ? ` le ${fmtDate(acces.inviteLe)}` : ""}, lien pas encore utilisé`}>
        <Badge kind="warn">Invitée</Badge>
      </span>
    );
  }
  if (etat === "email_pris" && acces) {
    return (
      <span className="badge b-error" title={motifAdressePrise(acces) + " : autre adresse principale à saisir dans la fiche"}>
        Adresse prise
      </span>
    );
  }
  return <Badge kind="neutral">Sans compte</Badge>;
}

/** Compte rendu d'une création d'accès, en une phrase. */
function phraseResultat(r: ResultatAccesPrestataire): string {
  const a = r.email ? ` à ${r.email}` : "";
  const simulation = r.envoi === "simule" ? " (simulation : clé d'envoi absente du serveur)" : "";
  if (r.envoi === "echec") {
    return "Le compte est prêt mais l'e-mail n'est pas parti : utilisez « Renvoyer l'e-mail ».";
  }
  switch (r.statut) {
    case "invite":
      return `Accès créé : e-mail d'activation envoyé${a}${simulation}.`;
    case "relie":
      return `Fiche reliée au compte existant de cette adresse : e-mail envoyé${a}${simulation}.`;
    case "renvoye":
      return `E-mail d'activation renvoyé${a}${simulation}.`;
    case "deja_actif":
      return "Accès déjà activé, rien à envoyer.";
    case "sans_email":
      return "Pas d'adresse e-mail principale valide sur la fiche.";
    default:
      return r.detail ?? "La création de l'accès a échoué.";
  }
}

/**
 * Accès de l'entreprise à son espace prestataire : état du compte et bouton
 * « Créer l'accès » (ou « Renvoyer l'e-mail » tant que le lien n'a pas servi).
 * L'e-mail part réellement, d'où la confirmation.
 */
function AccesEspace({
  fiche,
  acces,
  emailSaisi,
}: {
  fiche: Prestataire;
  acces: AccesPrestataire | undefined;
  /** E-mail principal en cours de saisie : l'accès part de l'adresse enregistrée. */
  emailSaisi: string;
}) {
  const creer = useCreerAccesPrestataire();
  const [confirmer, setConfirmer] = useState(false);
  const [resultat, setResultat] = useState<ResultatAccesPrestataire | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const emailEnregistre = (fiche.email ?? "").trim().toLowerCase();
  const etat = acces?.etat ?? (fiche.user_id ? "invite" : emailEnregistre ? "a_creer" : "sans_email");
  const emailModifie = emailSaisi.trim().toLowerCase() !== emailEnregistre;
  const destinataire = acces?.emailCompte ?? emailEnregistre;
  const peutEnvoyer = fiche.actif && (etat === "invite" || (etat === "a_creer" && !emailModifie));

  const lancer = () => {
    setErreur(null);
    creer.mutate(fiche.id, {
      onSuccess: (r) => {
        setResultat(r);
        setConfirmer(false);
      },
      onError: (e) => setErreur(e instanceof Error ? e.message : "La création de l'accès a échoué."),
    });
  };

  let constat: ReactNode;
  switch (etat) {
    case "actif":
      constat = (
        <>
          <Badge kind="success" dot>Compte actif</Badge> L'entreprise s'est déjà connectée. Identifiant :{" "}
          <b>{acces?.emailCompte}</b>.
        </>
      );
      break;
    case "invite":
      constat = (
        <>
          <Badge kind="warn">Invitée</Badge> E-mail d'activation envoyé
          {acces?.inviteLe ? ` le ${fmtDate(acces.inviteLe)}` : ""} à <b>{destinataire}</b>, lien pas encore utilisé.
        </>
      );
      break;
    case "email_pris":
      constat = (
        <>
          <span className="badge b-error">Adresse prise</span> {acces ? motifAdressePrise(acces) : ""} : saisissez une
          autre adresse principale.
        </>
      );
      break;
    case "sans_email":
      constat = <>Renseignez l'e-mail principal et enregistrez la fiche pour pouvoir créer l'accès.</>;
      break;
    default:
      constat = (
        <>
          <Badge kind="neutral">Sans compte</Badge> L'entreprise recevra à <b>{emailEnregistre}</b> un lien pour choisir
          son mot de passe.
        </>
      );
  }

  return (
    <div className="cs-field cs-field-full" style={{ borderTop: "1px solid var(--border)", paddingTop: 14 }}>
      <label>Accès à l'espace prestataire</label>
      <p className="se-small" style={{ margin: "2px 0 0", color: "var(--fg2)", lineHeight: 1.7 }}>{constat}</p>
      {etat === "actif" && acces?.emailCompte && acces.emailCompte !== emailEnregistre && (
        <p className="se-small" style={{ margin: "4px 0 0", color: "var(--fg-muted)" }}>
          L'identifiant de connexion ne suit pas l'e-mail principal de la fiche.
        </p>
      )}
      {!fiche.actif && etat !== "actif" && (
        <p className="se-small" style={{ margin: "6px 0 0", color: "var(--fg-muted)" }}>
          Fiche suspendue : réactivez-la pour créer l'accès.
        </p>
      )}
      {fiche.actif && emailModifie && (etat === "a_creer" || etat === "sans_email" || etat === "email_pris") && (
        <p className="se-small" style={{ margin: "6px 0 0", color: "var(--fg-muted)" }}>
          Enregistrez d'abord la nouvelle adresse : l'accès part de l'e-mail principal enregistré.
        </p>
      )}

      {resultat && (
        <p
          className="se-small"
          style={{ margin: "8px 0 0", color: resultat.envoi === "envoye" ? "var(--color-success-700)" : "var(--fg2)" }}
        >
          {resultat.envoi === "envoye" && (
            <Icon name="checkCircle" size={14} style={{ verticalAlign: "-2px", marginRight: 4 }} />
          )}
          {phraseResultat(resultat)}
        </p>
      )}
      {erreur && <p className="se-small" style={{ margin: "8px 0 0", color: "var(--color-error-700)" }}>{erreur}</p>}

      {(etat === "a_creer" || etat === "invite") && !confirmer && (
        <div style={{ marginTop: 10 }}>
          <button
            type="button"
            className="se-btn se-btn-ghost btn-sm"
            disabled={!peutEnvoyer || creer.isPending}
            onClick={() => {
              setResultat(null);
              setConfirmer(true);
            }}
          >
            <Icon name="send" size={14} />
            {etat === "invite" ? "Renvoyer l'e-mail" : "Créer l'accès"}
          </button>
        </div>
      )}
      {confirmer && (
        <div style={{ marginTop: 10 }}>
          <div className="cc-next" style={{ marginTop: 0, marginBottom: 10 }}>
            <Icon name="alert" size={15} className="ico" style={{ color: "var(--color-warning-500)" }} />
            <span>
              {etat === "invite" ? (
                <>Un nouvel e-mail d'activation va partir réellement à <b>{destinataire}</b>.</>
              ) : (
                <>Le compte va être créé et un e-mail va partir réellement à <b>{emailEnregistre}</b>.</>
              )}
            </span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              className="se-btn se-btn-ghost btn-sm"
              onClick={() => setConfirmer(false)}
              disabled={creer.isPending}
            >
              Annuler
            </button>
            <button type="button" className="se-btn se-btn-primary btn-sm" onClick={lancer} disabled={creer.isPending}>
              <Icon name="send" size={14} />
              {creer.isPending ? "Envoi…" : "Envoyer l'e-mail"}
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
  acces?: AccesPrestataire;
}) {
  const [draft, setDraft] = useState(initial);
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
          <label>E-mail principal <span style={{ color: "var(--fg-muted)", fontWeight: 400 }}>· compte et alertes, sans e-mail aucune alerte</span></label>
          <input className="edit-inp" style={{ maxWidth: "none" }} type="email" value={draft.email}
            onChange={(e) => set("email", e.target.value)} placeholder="contact@entreprise.fr" />
        </div>
        <div className="cs-field cs-field-full">
          <label>Autres e-mails <span style={{ color: "var(--fg-muted)", fontWeight: 400 }}>· reçoivent les mêmes alertes, en copie</span></label>
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
          <AccesEspace fiche={fiche} acces={acces} emailSaisi={draft.email} />
        ) : (
          <p className="se-small cs-field-full" style={{ margin: 0, color: "var(--fg-muted)" }}>
            L'accès à l'espace prestataire se crée ensuite depuis la fiche enregistrée (« Créer l'accès »).
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
    const payload = {
      raison_sociale: draft.raison_sociale.trim(),
      contact_nom: draft.contact_nom.trim() || null,
      ...normaliserEmails(draft.email, draft.emails_secondaires),
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
                  <BadgeAcces acces={acces?.get(p.id)} lie={!!p.user_id} />
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
      {filDe && <FilGeneralEntreprise presta={prestas?.find((x) => x.id === filDe.id) ?? filDe} onClose={() => setFilDe(null)} />}
    </div>
  );
}

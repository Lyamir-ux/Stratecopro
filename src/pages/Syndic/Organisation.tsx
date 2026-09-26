// « Mon organisation » (espace syndic, direction de l'enseigne) - feedback de
// Pierrot LEFOU du 24/09/2026 : gérer son organisation, créer des
// gestionnaires et des administratifs, leur rattacher des copropriétés.
// Arbitrage d'Amir (25/09) : la direction crée les comptes de sa seule
// enseigne (gestionnaire, administratif, comptable), jamais un autre directeur ;
// le dirigeant de Strat Eco est prévenu par e-mail. Onglet présent dans les
// deux branches (rénovations globales et suivi des PPT). Écritures contrôlées
// en base (migration 0102) : un gestionnaire ou un administratif n'ouvre que
// les dossiers qui lui sont rattachés, la direction les ouvre tous.
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "@/components/Icon";
import { Modal } from "@/components/Modal";
import { Avatar, Badge } from "@/components/ui";
import { useAuth } from "@/auth/AuthProvider";
import { useCoprosSyndic, useMonOrganisation, type SyndicCopro } from "@/api/syndic";
import { useOrganisationPpt, usePptCopros, type PptCoproAvecStats } from "@/api/ppt";
import {
  ROLES_EQUIPE,
  ROLE_EQUIPE_LABEL,
  useAccesDossierEquipe,
  useChangerRoleEquipe,
  useCreerMembreEquipe,
  useDesignerGestionnaireDossier,
  useEquipeEnseigne,
  useGestionnairePptEquipe,
  useRattachementsEnseigne,
  type MembreEquipe,
  type RattachementEquipe,
} from "@/api/equipeSyndic";
import type { CollaborateurCree } from "@/api/profiles";
import type { OrgRole } from "@/api/organisations";
import { fmtDate, normaliserRecherche } from "@/lib/format";
import { messageErreur } from "@/lib/erreurs";
import { useCoprosAAttribuer } from "./AAttribuer";

const initialesDe = (nom: string) => {
  const mots = nom.trim().split(/\s+/).filter(Boolean);
  if (mots.length === 0) return "?";
  return ((mots[0][0] ?? "") + (mots.length > 1 ? mots[mots.length - 1][0] : (mots[0][1] ?? ""))).toUpperCase();
};

const courriel = (e: string | null | undefined) => (e ?? "").trim().toLowerCase();

function Erreur({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p style={{ margin: "12px 0 0", padding: "10px 14px", borderRadius: "var(--radius-md)", background: "var(--color-error-50)", color: "var(--color-error-700)", fontSize: 13.5 }}>
      {message}
    </p>
  );
}

// ========== Ajouter un membre ==========

function AjouterMembre({ orgId, orgNom, onClose, onRattacher }: { orgId: string; orgNom: string; onClose: () => void; onRattacher: (userId: string) => void }) {
  const creer = useCreerMembreEquipe();
  const [nom, setNom] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<OrgRole>("gestionnaire");
  const [fonction, setFonction] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [cree, setCree] = useState<CollaborateurCree | null>(null);
  const [copie, setCopie] = useState(false);
  const valide = nom.trim().length > 1 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const creerCompte = async () => {
    setErreur(null);
    try {
      setCree(
        await creer.mutateAsync({
          organisation_id: orgId,
          full_name: nom.trim(),
          email: email.trim().toLowerCase(),
          org_role: role,
          job_title: fonction.trim() || undefined,
        })
      );
    } catch (e) {
      setErreur(messageErreur(e, "La création du compte a échoué. Réessayez."));
    }
  };

  if (cree) {
    return (
      <Modal title="Compte créé" onClose={onClose} closeOnBackdrop={false}>
        <p className="se-body" style={{ marginTop: 0 }}>
          Le compte de <strong>{nom.trim()}</strong> ({ROLE_EQUIPE_LABEL[role].toLowerCase()}) est rattaché à {orgNom}. Transmettez-lui ses
          identifiants : le mot de passe provisoire ne sera <strong>plus jamais affiché</strong> après la fermeture de cette fenêtre.
        </p>
        <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 8, background: "var(--bg-soft)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
            <Icon name="mail" size={15} />
            <span style={{ color: "var(--fg-muted)" }}>E-mail :</span>
            <strong>{cree.email}</strong>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
            <Icon name="lock" size={15} />
            <span style={{ color: "var(--fg-muted)" }}>Mot de passe provisoire :</span>
            <strong style={{ fontFamily: "var(--font-mono, monospace)", letterSpacing: 0.5 }}>{cree.mot_de_passe}</strong>
            <button className="icon-btn" title="Copier le mot de passe" onClick={() => void navigator.clipboard.writeText(cree.mot_de_passe).then(() => setCopie(true))}>
              <Icon name={copie ? "check" : "copy"} size={15} />
            </button>
          </div>
        </div>
        <div className="import-note" style={{ marginTop: 14 }}>
          <Icon name="lock" size={16} />
          <span>
            À sa première connexion, votre collaborateur définit son mot de passe personnel en cliquant sur <b>« Mot de passe oublié »</b> : l'accès
            reste bloqué tant que le mot de passe provisoire n'a pas été remplacé.
          </span>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
          <button className="se-btn se-btn-primary" onClick={() => onRattacher(cree.user_id)}>
            <Icon name="building" size={16} />
            Rattacher ses copropriétés
          </button>
          <button className="se-btn se-btn-ghost" onClick={onClose}>
            J'ai transmis les identifiants
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Ajouter un membre" onClose={onClose}>
      <div className="cs-form-grid">
        <div className="cs-field">
          <label>Nom complet *</label>
          <input className="edit-inp" style={{ maxWidth: "none" }} value={nom} autoFocus onChange={(e) => setNom(e.target.value)} placeholder="Prénom Nom" />
        </div>
        <div className="cs-field">
          <label>Fonction</label>
          <input className="edit-inp" style={{ maxWidth: "none" }} value={fonction} onChange={(e) => setFonction(e.target.value)} placeholder="Gestionnaire de copropriété" />
        </div>
        <div className="cs-field cs-field-full">
          <label>
            Adresse e-mail * <span style={{ color: "var(--fg-muted)", fontWeight: 400 }}>· identifiant de connexion</span>
          </label>
          <input className="edit-inp" style={{ maxWidth: "none" }} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="prenom.nom@votre-cabinet.fr" />
        </div>
        <div className="cs-field cs-field-full">
          <label>Rôle dans l'enseigne *</label>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {ROLES_EQUIPE.map((r) => (
              <label key={r.id} style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 13.5, cursor: "pointer" }}>
                <input type="radio" name="role-membre" checked={role === r.id} onChange={() => setRole(r.id)} />
                <span>
                  <b>{r.label}</b> <span style={{ color: "var(--fg-muted)" }}>- {r.aide}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
      </div>
      <div className="import-note" style={{ marginTop: 14 }}>
        <Icon name="users" size={16} />
        <span>
          Le compte est créé immédiatement avec un <b>mot de passe provisoire</b> (affiché une seule fois à l'étape suivante), puis vous lui rattachez
          ses copropriétés. Strat Eco est informé de chaque compte créé. Un autre directeur se demande à Strat Eco.
        </span>
      </div>
      <Erreur message={erreur} />
      <button className="se-btn se-btn-primary" style={{ marginTop: 16 }} disabled={!valide || creer.isPending} onClick={() => void creerCompte()}>
        <Icon name="check" size={16} />
        {creer.isPending ? "Création…" : "Créer le compte"}
      </button>
    </Modal>
  );
}

// ========== Copropriétés d'un membre ==========

function CoprosMembre({
  membre,
  coprosReno,
  coprosPpt,
  rattachements,
  modulePpt,
  onClose,
}: {
  membre: MembreEquipe;
  coprosReno: SyndicCopro[];
  coprosPpt: PptCoproAvecStats[];
  rattachements: RattachementEquipe[];
  modulePpt: boolean;
  onClose: () => void;
}) {
  const acces = useAccesDossierEquipe();
  const designer = useDesignerGestionnaireDossier();
  const gestionnairePpt = useGestionnairePptEquipe();
  const [recherche, setRecherche] = useState("");
  const [enCours, setEnCours] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const email = courriel(membre.email);
  const estGestionnaire = membre.org_role === "gestionnaire";

  const q = normaliserRecherche(recherche.trim());
  const filtre = <T extends { commune?: string | null; city?: string | null }>(nom: string, c: T) =>
    !q || normaliserRecherche(nom).includes(q) || normaliserRecherche(c.city ?? c.commune ?? "").includes(q);
  const reno = coprosReno.filter((c) => filtre(c.name, c));
  const ppt = coprosPpt.filter((c) => filtre(c.nom, c));
  const aAcces = new Set(rattachements.filter((r) => r.branche === "reno" && r.user_id === membre.user_id).map((r) => r.copro_id));
  const nbReno = coprosReno.filter((c) => aAcces.has(c.id)).length;
  const nbPpt = coprosPpt.filter((c) => courriel(c.gestionnaire_email) === email).length;

  const executer = async (cle: string, action: () => Promise<unknown>) => {
    setErreur(null);
    setEnCours(cle);
    try {
      await action();
    } catch (e) {
      setErreur(messageErreur(e, "La modification n'a pas pu être enregistrée. Réessayez."));
    } finally {
      setEnCours(null);
    }
  };

  const basculerReno = (c: SyndicCopro, ouvrir: boolean) => {
    const gestActuel = courriel(c.gestionnaire_email);
    if (!ouvrir && gestActuel === email && !window.confirm(`${membre.full_name} est le gestionnaire désigné de « ${c.name} ». Retirer son accès laisse le dossier sans gestionnaire. Continuer ?`)) return;
    void executer(`reno:${c.id}`, () => acces.mutateAsync({ coproId: c.id, userId: membre.user_id, acces: ouvrir }));
  };

  const designerGestionnaire = (c: SyndicCopro) => {
    const ancien = c.gestionnaire_nom?.trim();
    if (ancien && !window.confirm(`Désigner ${membre.full_name} gestionnaire de « ${c.name} » à la place de ${ancien} ? ${ancien} perdra l'accès au dossier (vous pourrez le lui rouvrir ensuite).`)) return;
    void executer(`gest:${c.id}`, () => designer.mutateAsync({ coproId: c.id, userId: membre.user_id }));
  };

  const basculerPpt = (c: PptCoproAvecStats, affecter: boolean) => {
    const ancien = c.gestionnaire_nom?.trim();
    if (affecter && ancien && courriel(c.gestionnaire_email) !== email && !window.confirm(`Une copropriété PPT n'a qu'un gestionnaire : ${membre.full_name} remplacera ${ancien} sur « ${c.nom} ». Continuer ?`)) return;
    void executer(`ppt:${c.id}`, () => gestionnairePpt.mutateAsync({ pptCoproId: c.id, membre: affecter ? { full_name: membre.full_name, email: membre.email } : null }));
  };

  const ligne = { display: "flex", alignItems: "center", gap: 10, padding: "9px 4px", borderBottom: "1px solid var(--border)", fontSize: 13.5 } as const;

  return (
    <Modal title={`Copropriétés de ${membre.full_name}`} onClose={onClose} width={720}>
      <p className="se-body" style={{ marginTop: 0 }}>
        {ROLE_EQUIPE_LABEL[membre.org_role]} : n'ouvre que les copropriétés cochées ci-dessous. Chaque modification est enregistrée aussitôt.
      </p>
      <div className="search" style={{ margin: "0 0 12px", width: "100%" }}>
        <Icon name="search" size={16} />
        <input placeholder="Rechercher une copropriété, une ville…" value={recherche} onChange={(e) => setRecherche(e.target.value)} autoFocus />
      </div>
      <Erreur message={erreur} />

      <div style={{ maxHeight: "52vh", overflowY: "auto", marginTop: 8 }}>
        {coprosReno.length > 0 && (
          <>
            <div className="se-eyebrow" style={{ margin: "8px 0 4px", display: "flex", gap: 8 }}>
              Rénovations globales <span style={{ color: "var(--fg-muted)" }}>· {nbReno} sur {coprosReno.length}</span>
            </div>
            {reno.map((c) => {
              const ouvert = aAcces.has(c.id);
              const gestActuel = courriel(c.gestionnaire_email);
              const lui = gestActuel !== "" && gestActuel === email;
              return (
                <div key={c.id} style={ligne}>
                  <input
                    type="checkbox"
                    checked={ouvert}
                    disabled={enCours !== null}
                    onChange={(e) => basculerReno(c, e.target.checked)}
                    aria-label={`Accès de ${membre.full_name} au dossier ${c.name}`}
                  />
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <b>{c.name}</b>
                    <span style={{ color: "var(--fg-muted)" }}>{c.city ? ` · ${c.city}` : ""}</span>
                    <span style={{ display: "block", fontSize: 12, color: "var(--fg-muted)" }}>
                      {lui ? "Gestionnaire désigné du dossier" : c.gestionnaire_nom ? `Gestionnaire : ${c.gestionnaire_nom}` : "Aucun gestionnaire désigné"}
                    </span>
                  </span>
                  {lui ? (
                    <Badge kind="primary">Gestionnaire</Badge>
                  ) : (
                    estGestionnaire && (
                      <button className="se-btn se-btn-ghost btn-sm" disabled={enCours !== null} onClick={() => designerGestionnaire(c)} title="Il devient le gestionnaire du dossier (portefeuille, alertes)">
                        {enCours === `gest:${c.id}` ? "…" : "Désigner gestionnaire"}
                      </button>
                    )
                  )}
                  {enCours === `reno:${c.id}` && <span className="se-small" style={{ color: "var(--fg-muted)" }}>…</span>}
                </div>
              );
            })}
            {reno.length === 0 && <p className="se-small" style={{ color: "var(--fg-muted)" }}>Aucune copropriété ne correspond.</p>}
          </>
        )}

        {modulePpt && coprosPpt.length > 0 && (
          <>
            <div className="se-eyebrow" style={{ margin: "18px 0 4px", display: "flex", gap: 8 }}>
              Suivi des PPT <span style={{ color: "var(--fg-muted)" }}>· {nbPpt} sur {coprosPpt.length} · un gestionnaire par copropriété</span>
            </div>
            {ppt.map((c) => {
              const lui = courriel(c.gestionnaire_email) === email && email !== "";
              return (
                <div key={c.id} style={ligne}>
                  <input
                    type="checkbox"
                    checked={lui}
                    disabled={enCours !== null}
                    onChange={(e) => basculerPpt(c, e.target.checked)}
                    aria-label={`${membre.full_name} gestionnaire PPT de ${c.nom}`}
                  />
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <b>{c.nom}</b>
                    <span style={{ color: "var(--fg-muted)" }}>{c.commune ? ` · ${c.commune}` : ""}</span>
                    <span style={{ display: "block", fontSize: 12, color: "var(--fg-muted)" }}>
                      {lui ? "Suivi par ce membre" : c.gestionnaire_nom ? `Gestionnaire : ${c.gestionnaire_nom}` : "Non attribuée"}
                    </span>
                  </span>
                  {enCours === `ppt:${c.id}` && <span className="se-small" style={{ color: "var(--fg-muted)" }}>…</span>}
                </div>
              );
            })}
            {ppt.length === 0 && <p className="se-small" style={{ color: "var(--fg-muted)" }}>Aucune copropriété ne correspond.</p>}
          </>
        )}

        {coprosReno.length === 0 && (!modulePpt || coprosPpt.length === 0) && (
          <p className="se-body" style={{ color: "var(--fg-muted)" }}>Votre enseigne n'a encore aucune copropriété suivie par Strat Eco.</p>
        )}
      </div>
      <button className="se-btn se-btn-primary" style={{ marginTop: 16 }} onClick={onClose}>
        <Icon name="check" size={16} />
        Terminé
      </button>
    </Modal>
  );
}

// ========== Page ==========

export function OrganisationSyndic() {
  const { profile, session } = useAuth();
  const { data: org, isLoading } = useMonOrganisation();
  const { data: orgPpt } = useOrganisationPpt();
  const direction = profile?.role === "syndic" && org?.role === "directeur";
  const orgId = direction ? org!.id : null;
  const { data: equipe, isLoading: chargeEquipe } = useEquipeEnseigne(orgId);
  const { data: rattachements } = useRattachementsEnseigne(orgId);
  const { data: tousReno } = useCoprosSyndic();
  const { data: tousPpt } = usePptCopros();
  const changerRole = useChangerRoleEquipe();
  const { liste: aAttribuer } = useCoprosAAttribuer();
  const navigate = useNavigate();
  const [ajout, setAjout] = useState(false);
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const modulePpt = !!orgPpt?.module_ppt;

  const coprosReno = useMemo(() => (tousReno ?? []).filter((c) => orgId && c.organisation_id === orgId), [tousReno, orgId]);
  const coprosPpt = useMemo(() => (tousPpt ?? []).filter((c) => orgId && c.organisation_id === orgId), [tousPpt, orgId]);

  if (isLoading) return <div style={{ padding: 30, color: "var(--fg-muted)" }}>Chargement…</div>;
  if (!direction || !org) {
    return (
      <div className="panel" style={{ padding: "22px 24px", maxWidth: 640 }}>
        <h3 style={{ marginTop: 0 }}>Réservé à la direction de l'enseigne</h3>
        <p className="se-body" style={{ marginBottom: 0 }}>
          {profile?.role === "amo"
            ? "En aperçu AMO, les membres et rattachements des enseignes se gèrent depuis Paramètres - Organisations."
            : "La gestion de l'équipe (comptes, rôles, copropriétés rattachées) est ouverte à la direction de votre enseigne."}
        </p>
      </div>
    );
  }

  const membreOuvert = (equipe ?? []).find((m) => m.user_id === ouvert) ?? null;
  const r = rattachements ?? [];
  const nbReno = (uid: string) => coprosReno.filter((c) => r.some((x) => x.branche === "reno" && x.user_id === uid && x.copro_id === c.id)).length;
  const nbGest = (uid: string) => coprosReno.filter((c) => r.some((x) => x.branche === "reno" && x.user_id === uid && x.copro_id === c.id && x.gestionnaire)).length;
  const nbPpt = (m: MembreEquipe) => coprosPpt.filter((c) => courriel(c.gestionnaire_email) === courriel(m.email) && courriel(m.email) !== "").length;

  const modifierRole = async (m: MembreEquipe, role: OrgRole) => {
    setErreur(null);
    try {
      await changerRole.mutateAsync({ orgId: org.id, userId: m.user_id, role });
    } catch (e) {
      setErreur(messageErreur(e, "Le rôle n'a pas pu être modifié. Réessayez."));
    }
  };

  return (
    <div className="page fade" style={{ padding: 0 }}>
      <div className="page-head">
        <div>
          <h1 className="page-title">
            Mon organisation<span className="page-title-org"> - {org.nom}</span>
          </h1>
          <p className="page-sub">
            {(equipe ?? []).length} membre{(equipe ?? []).length > 1 ? "s" : ""} · {coprosReno.length} copropriété{coprosReno.length > 1 ? "s" : ""} en rénovation globale
            {modulePpt && <> · {coprosPpt.length} au suivi des PPT</>}
            {aAttribuer.length > 0 && (
              <>
                {" · "}
                <button
                  type="button"
                  onClick={() => navigate("/syndic/taches")}
                  title="Attribuer ces copropriétés depuis Vos tâches"
                  style={{ border: "none", background: "none", padding: 0, font: "inherit", color: "var(--color-warning-700)", cursor: "pointer", textDecoration: "underline" }}
                >
                  {aAttribuer.length} copropriété{aAttribuer.length > 1 ? "s" : ""} à attribuer
                </button>
              </>
            )}
          </p>
        </div>
        <span className="spacer"></span>
        <button className="se-btn se-btn-primary btn-sm" onClick={() => setAjout(true)}>
          <Icon name="plus" size={15} />
          Ajouter un membre
        </button>
      </div>

      <div className="panel">
        <div className="p-head">
          <Icon name="users" size={18} />
          <h3>Équipe</h3>
        </div>
        <div className="p-body">
          <Erreur message={erreur} />
          {chargeEquipe ? (
            <p className="se-small" style={{ color: "var(--fg-muted)" }}>Chargement…</p>
          ) : (
            <div className="tablewrap">
              <table className="dossiers" style={{ fontSize: 13.5 }}>
                <thead>
                  <tr>
                    <th>Membre</th>
                    <th>Rôle</th>
                    <th>Rénovations globales</th>
                    {modulePpt && <th>Suivi des PPT</th>}
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {(equipe ?? []).map((m) => {
                    const moi = m.user_id === session?.user.id;
                    const dir = m.org_role === "directeur";
                    return (
                      <tr key={m.user_id} style={{ cursor: "default" }}>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <Avatar who={initialesDe(m.full_name)} name={m.full_name} />
                            <span style={{ minWidth: 0 }}>
                              <b>{m.full_name}</b>
                              {moi && <span style={{ color: "var(--fg-muted)" }}> · vous</span>}
                              <span style={{ display: "block", fontSize: 12, color: "var(--fg-muted)" }}>
                                {[m.email, m.job_title].filter(Boolean).join(" · ")}
                              </span>
                              <span style={{ display: "flex", gap: 6, marginTop: 3, flexWrap: "wrap" }}>
                                {!m.active && <Badge kind="neutral">Compte désactivé</Badge>}
                                {m.mot_de_passe_provisoire ? (
                                  <Badge kind="warn">Mot de passe à définir</Badge>
                                ) : m.derniere_connexion ? (
                                  <span style={{ fontSize: 11.5, color: "var(--fg-muted)" }}>Dernière connexion le {fmtDate(m.derniere_connexion)}</span>
                                ) : null}
                              </span>
                            </span>
                          </div>
                        </td>
                        <td>
                          {dir || moi ? (
                            <Badge kind={dir ? "blue" : "neutral"}>{ROLE_EQUIPE_LABEL[m.org_role]}</Badge>
                          ) : (
                            <select
                              className="edit-inp"
                              style={{ width: 150, maxWidth: "none" }}
                              value={m.org_role}
                              disabled={changerRole.isPending}
                              onChange={(e) => void modifierRole(m, e.target.value as OrgRole)}
                              aria-label={`Rôle de ${m.full_name}`}
                            >
                              {ROLES_EQUIPE.map((ro) => (
                                <option key={ro.id} value={ro.id}>
                                  {ro.label}
                                </option>
                              ))}
                            </select>
                          )}
                        </td>
                        <td>
                          {dir ? (
                            <span style={{ color: "var(--fg-muted)" }}>Tous les dossiers</span>
                          ) : (
                            <>
                              {nbReno(m.user_id)} dossier{nbReno(m.user_id) > 1 ? "s" : ""}
                              {nbGest(m.user_id) > 0 && (
                                <span style={{ display: "block", fontSize: 12, color: "var(--fg-muted)" }}>gestionnaire désigné de {nbGest(m.user_id)}</span>
                              )}
                            </>
                          )}
                        </td>
                        {modulePpt && (
                          <td>
                            {dir ? (
                              <span style={{ color: "var(--fg-muted)" }}>Toutes</span>
                            ) : (
                              <>
                                {nbPpt(m)} copropriété{nbPpt(m) > 1 ? "s" : ""}
                              </>
                            )}
                          </td>
                        )}
                        <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                          {!dir && (
                            <button className="se-btn se-btn-secondary btn-sm" onClick={() => setOuvert(m.user_id)} title="Choisir les copropriétés que ce membre peut ouvrir">
                              <Icon name="building" size={14} />
                              Copropriétés
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="import-note" style={{ marginTop: 16 }}>
            <Icon name="lock" size={16} />
            <span>
              La <b>direction</b> ouvre tous les dossiers de l'enseigne. Un <b>gestionnaire</b>, un <b>administratif</b> ou un <b>comptable</b> n'ouvre que les
              copropriétés qui lui sont rattachées (bouton « Copropriétés ») ; les autres restent visibles dans le portefeuille, grisées. Le gestionnaire
              désigné d'un dossier reçoit ses alertes et figure dans le portefeuille ; en suivi des PPT, chaque copropriété a un seul gestionnaire.
            </span>
          </div>
        </div>
      </div>

      {ajout && (
        <AjouterMembre
          orgId={org.id}
          orgNom={org.nom}
          onClose={() => setAjout(false)}
          onRattacher={(userId) => {
            setAjout(false);
            setOuvert(userId);
          }}
        />
      )}
      {membreOuvert && (
        <CoprosMembre
          membre={membreOuvert}
          coprosReno={coprosReno}
          coprosPpt={coprosPpt}
          rattachements={r}
          modulePpt={modulePpt}
          onClose={() => setOuvert(null)}
        />
      )}
    </div>
  );
}

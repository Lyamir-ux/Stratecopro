// Administration des enseignes de gestion (Paramètres → Organisations).
// L'AMO compose l'organisation : qui la dirige, qui y est gestionnaire, et
// quels dossiers en font partie. Le directeur voit alors tout le portefeuille
// de son enseigne dans l'espace syndic, sans rattachement copro par copro.
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { Avatar, Badge } from "@/components/ui";
import { useAuth } from "@/auth/AuthProvider";
import type { CollaborateurCree } from "@/api/profiles";
import {
  useAjouterMembre,
  useCoprosRattachables,
  useCreerMembre,
  useCreerOrganisation,
  useMajRoleMembre,
  useMembresOrganisation,
  useOrganisations,
  useProfilsSyndicLibres,
  useRattacherCopro,
  useRenommerOrganisation,
  useRetirerMembre,
  useSupprimerOrganisation,
  type Organisation,
  type OrgRole,
} from "@/api/organisations";
import type { Tables } from "@/lib/database.types";

const ROLE_LABEL: Record<OrgRole, string> = {
  directeur: "Direction - tout le portefeuille",
  gestionnaire: "Gestionnaire - ses dossiers",
  administratif: "Administratif - ses dossiers",
  comptable: "Comptable - ses dossiers",
};

/** Sous-titre affiché sous le nom du membre : son rôle dans l'enseigne prime
 *  sur l'intitulé de poste du profil (feedback du 28/08 : un directeur ne doit
 *  pas rester étiqueté « gestionnaire de copropriété »). */
const ROLE_COURT: Record<OrgRole, string> = {
  directeur: "Direction",
  gestionnaire: "Gestionnaire",
  administratif: "Administratif",
  comptable: "Comptable",
};

const EYEBROW: React.CSSProperties = { color: "var(--fg-muted)", margin: "14px 0 8px" };

const INPUT_FULL: React.CSSProperties = { maxWidth: "none" };

/** Choix du rôle dans l'enseigne (commun à l'ajout et à la modification). */
function SelectRole({ value, onChange, style }: { value: OrgRole; onChange: (r: OrgRole) => void; style?: React.CSSProperties }) {
  return (
    <select className="edit-inp sm" style={{ maxWidth: 210, ...style }} value={value} onChange={(e) => onChange(e.target.value as OrgRole)}>
      {(Object.keys(ROLE_LABEL) as OrgRole[]).map((r) => (
        <option key={r} value={r}>
          {ROLE_LABEL[r]}
        </option>
      ))}
    </select>
  );
}

/**
 * Identifiants du compte qui vient d'être créé : affichés une seule fois (le
 * mot de passe provisoire n'est jamais reproposé), avec copie en un clic.
 */
function IdentifiantsCrees({ cree, nom, onClose }: { cree: CollaborateurCree; nom: string; onClose: () => void }) {
  const [copie, setCopie] = useState(false);
  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        padding: "12px 14px",
        marginTop: 10,
        background: "var(--bg-soft)",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ fontSize: 13.5 }}>
        Le compte de <strong>{nom}</strong> est créé et rattaché à l'enseigne. Transmettez-lui ses identifiants :
        le mot de passe provisoire ne sera <strong>plus jamais affiché</strong> après fermeture.
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, flexWrap: "wrap" }}>
        <Icon name="mail" size={15} />
        <span style={{ color: "var(--fg-muted)" }}>E-mail :</span>
        <strong>{cree.email}</strong>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, flexWrap: "wrap" }}>
        <Icon name="lock" size={15} />
        <span style={{ color: "var(--fg-muted)" }}>Mot de passe provisoire :</span>
        <strong style={{ fontFamily: "var(--font-mono, monospace)", letterSpacing: 0.5 }}>{cree.mot_de_passe}</strong>
        <button
          className="icon-btn"
          title="Copier le mot de passe"
          onClick={() => void navigator.clipboard.writeText(cree.mot_de_passe).then(() => setCopie(true))}
        >
          <Icon name={copie ? "check" : "copy"} size={15} />
        </button>
      </div>
      <div className="se-small" style={{ color: "var(--fg-muted)" }}>
        À sa première connexion, il devra définir son mot de passe personnel via « Mot de passe oublié » : l'accès reste
        bloqué tant que le mot de passe provisoire n'a pas été remplacé.
      </div>
      <button className="se-btn se-btn-primary btn-sm" style={{ alignSelf: "flex-start" }} onClick={onClose}>
        <Icon name="check" size={14} />
        J'ai transmis les identifiants
      </button>
    </div>
  );
}

/**
 * Ajout d'un membre : nom + e-mail + rôle → compte syndic créé et rattaché à
 * l'enseigne en une fois (réservé au dirigeant, comme toute création de compte).
 */
function NouveauMembre({ org }: { org: Organisation }) {
  const creer = useCreerMembre();
  const [nom, setNom] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<OrgRole>("gestionnaire");
  const [erreur, setErreur] = useState<string | null>(null);
  const [cree, setCree] = useState<{ res: CollaborateurCree; nom: string } | null>(null);

  const valid = nom.trim().length > 1 && /\S+@\S+\.\S+/.test(email);

  const submit = async () => {
    if (!valid || creer.isPending) return;
    setErreur(null);
    const nomPropre = nom.trim();
    try {
      const res = await creer.mutateAsync({
        organisation_id: org.id,
        full_name: nomPropre,
        email: email.trim().toLowerCase(),
        org_role: role,
      });
      setCree({ res, nom: nomPropre });
      setNom("");
      setEmail("");
      setRole("gestionnaire");
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "La création du compte a échoué. Réessayez.");
    }
  };

  if (cree) return <IdentifiantsCrees cree={cree.res} nom={cree.nom} onClose={() => setCree(null)} />;

  return (
    <>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
        <input
          className="edit-inp sm"
          style={{ ...INPUT_FULL, flex: 1, minWidth: 150 }}
          placeholder="Prénom Nom"
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void submit()}
        />
        <input
          className="edit-inp sm"
          style={{ ...INPUT_FULL, flex: 1.3, minWidth: 200 }}
          type="email"
          placeholder="Adresse e-mail (identifiant de connexion)"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void submit()}
        />
        <SelectRole value={role} onChange={setRole} />
        <button className="se-btn se-btn-primary btn-sm" disabled={!valid || creer.isPending} onClick={() => void submit()}>
          <Icon name="plus" size={14} />
          {creer.isPending ? "Création…" : "Ajouter un membre"}
        </button>
      </div>
      {erreur ? (
        <p
          style={{
            margin: "8px 0 0",
            padding: "8px 12px",
            borderRadius: "var(--radius-md)",
            background: "var(--color-error-50)",
            color: "var(--color-error-700)",
            fontSize: 13,
          }}
        >
          {erreur}
        </p>
      ) : (
        <p className="se-small" style={{ color: "var(--fg-muted)", margin: "6px 0 0" }}>
          Le compte est créé immédiatement avec un mot de passe provisoire, affiché une seule fois à l'étape suivante.
        </p>
      )}
    </>
  );
}

/** Rattachement d'un compte syndic déjà existant et encore sans enseigne. */
function RattacherCompteExistant({ org, libres }: { org: Organisation; libres: Tables<"profiles">[] }) {
  const ajouter = useAjouterMembre();
  const [nouveau, setNouveau] = useState("");
  const [role, setRole] = useState<OrgRole>("gestionnaire");
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
      <select className="edit-inp sm" style={{ flex: 1, minWidth: 160 }} value={nouveau} onChange={(e) => setNouveau(e.target.value)}>
        <option value="">Ou rattacher un compte existant…</option>
        {libres.map((p) => (
          <option key={p.user_id} value={p.user_id}>
            {p.full_name}
          </option>
        ))}
      </select>
      <SelectRole value={role} onChange={setRole} />
      <button
        className="se-btn se-btn-secondary btn-sm"
        disabled={!nouveau || ajouter.isPending}
        onClick={() =>
          void ajouter.mutateAsync({ organisation_id: org.id, user_id: nouveau, org_role: role }).then(() => setNouveau(""))
        }
      >
        <Icon name="plus" size={14} />
        Rattacher
      </button>
    </div>
  );
}

function Membres({ org }: { org: Organisation }) {
  const { profile: me } = useAuth();
  const { data: membres } = useMembresOrganisation(org.id);
  const { data: libres } = useProfilsSyndicLibres();
  const majRole = useMajRoleMembre();
  const retirer = useRetirerMembre();

  return (
    <>
      <div className="se-eyebrow" style={EYEBROW}>
        Membres
      </div>
      {(membres ?? []).length === 0 ? (
        <p className="se-small" style={{ color: "var(--fg-muted)", margin: 0 }}>
          Aucun membre - personne ne voit encore ce portefeuille.
        </p>
      ) : (
        (membres ?? []).map((m) => (
          <div key={m.user_id} className="task-row" style={{ padding: "8px 4px", borderBottom: "1px solid var(--border)" }}>
            <Avatar who={m.initials} name={m.full_name} sm />
            <div>
              <div className="t-title" style={{ fontSize: 14 }}>
                {m.full_name}
              </div>
              <div style={{ fontSize: 12, color: "var(--fg-muted)" }}>
                {m.org_role === "gestionnaire" ? m.job_title || ROLE_COURT[m.org_role] : ROLE_COURT[m.org_role]}
              </div>
            </div>
            <span className="spacer"></span>
            <SelectRole
              value={m.org_role}
              onChange={(r) => void majRole.mutateAsync({ organisation_id: org.id, user_id: m.user_id, org_role: r })}
            />
            <button
              className="icon-btn"
              title="Retirer de l'organisation"
              onClick={() => {
                if (window.confirm(`Retirer ${m.full_name} de ${org.nom} ?`))
                  void retirer.mutateAsync({ organisation_id: org.id, user_id: m.user_id });
              }}
            >
              <Icon name="trash" size={15} />
            </button>
          </div>
        ))
      )}

      {me?.dirigeant ? (
        <NouveauMembre org={org} />
      ) : (
        <p className="se-small" style={{ color: "var(--fg-muted)", marginTop: 10 }}>
          La création d'un compte membre (nom + e-mail) est réservée au dirigeant.
        </p>
      )}
      {(libres ?? []).length > 0 && <RattacherCompteExistant org={org} libres={libres ?? []} />}
    </>
  );
}

function Dossiers({ org }: { org: Organisation }) {
  const { data: copros } = useCoprosRattachables();
  const rattacher = useRattacherCopro();
  const [aRattacher, setARattacher] = useState("");

  const rattachees = (copros ?? []).filter((c) => c.organisation_id === org.id);
  const libres = (copros ?? []).filter((c) => !c.organisation_id);

  return (
    <>
      <div className="se-eyebrow" style={EYEBROW}>
        Copropriétés rattachées ({rattachees.length})
      </div>
      {rattachees.length === 0 ? (
        <p className="se-small" style={{ color: "var(--fg-muted)", margin: 0 }}>
          Aucun dossier rattaché pour l'instant.
        </p>
      ) : (
        <div style={{ maxHeight: 260, overflowY: "auto" }}>
          {rattachees.map((c) => (
            <div key={c.id} className="task-row" style={{ padding: "7px 4px", borderBottom: "1px solid var(--border)" }}>
              <Icon name="building" size={15} />
              <div className="t-title" style={{ fontSize: 13.5 }}>
                {c.name}
                {c.city && <span style={{ color: "var(--fg-muted)", fontWeight: 400 }}> · {c.city}</span>}
              </div>
              <span className="spacer"></span>
              <button
                className="icon-btn"
                title="Détacher de l'organisation"
                onClick={() => void rattacher.mutateAsync({ coproId: c.id, organisationId: null })}
              >
                <Icon name="x" size={15} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10 }}>
        <select className="edit-inp sm" style={{ flex: 1 }} value={aRattacher} onChange={(e) => setARattacher(e.target.value)}>
          <option value="">Rattacher une copropriété…</option>
          {libres.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.city ? ` · ${c.city}` : ""}
            </option>
          ))}
        </select>
        <button
          className="se-btn se-btn-secondary btn-sm"
          disabled={!aRattacher || rattacher.isPending}
          onClick={() =>
            void rattacher.mutateAsync({ coproId: aRattacher, organisationId: org.id }).then(() => setARattacher(""))
          }
        >
          <Icon name="plus" size={14} />
          Rattacher
        </button>
      </div>
      {libres.length === 0 && (
        <p className="se-small" style={{ color: "var(--fg-muted)", marginTop: 8 }}>
          Tous les dossiers sont déjà rattachés à une enseigne. Détachez-en un ailleurs pour le déplacer ici.
        </p>
      )}
    </>
  );
}

export function OrganisationsPanel() {
  const { data: organisations } = useOrganisations();
  const creer = useCreerOrganisation();
  const renommer = useRenommerOrganisation();
  const supprimer = useSupprimerOrganisation();
  const [open, setOpen] = useState<string | null>(null);
  const [creation, setCreation] = useState(false);
  const [nom, setNom] = useState("");
  const [renommage, setRenommage] = useState<string | null>(null);
  const [nomEdite, setNomEdite] = useState("");

  const valider = () => {
    if (!nom.trim()) return;
    void creer.mutateAsync(nom).then((o) => {
      setNom("");
      setCreation(false);
      setOpen(o.id);
    });
  };

  /** Feedback d'Amir du 08/09/2026 : un clic sur le nom suffit pour le modifier en direct. */
  const commencerRenommage = (o: Organisation) => {
    setRenommage(o.id);
    setNomEdite(o.nom);
  };
  const validerRenommage = (o: Organisation) => {
    const propre = nomEdite.trim();
    if (propre && propre !== o.nom) void renommer.mutateAsync({ id: o.id, nom: propre });
    setRenommage(null);
  };

  return (
    <div className="panel">
      <div className="p-head">
        <Icon name="briefcase" size={18} />
        <h3>Organisations</h3>
        <span style={{ flex: 1 }}></span>
        <button className="se-btn se-btn-secondary btn-sm" onClick={() => setCreation((v) => !v)}>
          <Icon name={creation ? "x" : "plus"} size={14} />
          {creation ? "Annuler" : "Nouvelle organisation"}
        </button>
      </div>
      <div className="p-body">
        <p className="se-small" style={{ color: "var(--fg-muted)", marginTop: 0 }}>
          Enseignes de gestion (cabinets de syndic). La direction accède à tous les dossiers de son enseigne ;
          gestionnaires, administratifs et comptables aux seuls dossiers dont ils ont la charge (rattachement
          copro par copro). Renommer une enseigne met à jour le nom du syndic affiché sur ses dossiers.
        </p>

        {creation && (
          <div style={{ display: "flex", gap: 8, margin: "12px 0" }}>
            <input
              className="edit-inp"
              autoFocus
              placeholder="Nom de l'enseigne (ex. IMMIUM Laemmel)"
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && valider()}
            />
            <button className="se-btn se-btn-primary btn-sm" disabled={!nom.trim() || creer.isPending} onClick={valider}>
              <Icon name="check" size={15} />
              Créer
            </button>
          </div>
        )}

        {(organisations ?? []).length === 0 && !creation && (
          <p className="se-small" style={{ color: "var(--fg-muted)" }}>
            Aucune organisation - créez-en une pour donner à une direction de cabinet la vue sur tout son portefeuille.
          </p>
        )}

        {(organisations ?? []).map((o) => (
          <div key={o.id} style={{ marginBottom: 10 }}>
            <div
              className="task-row"
              style={{ padding: "10px 4px", borderBottom: "1px solid var(--border)", cursor: "pointer" }}
              onClick={() => setOpen(open === o.id ? null : o.id)}
            >
              <Icon name={open === o.id ? "chevronDown" : "chevronRight"} size={15} />
              {renommage === o.id ? (
                <input
                  className="edit-inp"
                  autoFocus
                  value={nomEdite}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => setNomEdite(e.target.value)}
                  onBlur={() => validerRenommage(o)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") validerRenommage(o);
                    if (e.key === "Escape") setRenommage(null);
                  }}
                />
              ) : (
                <div>
                  <div
                    className="t-title"
                    style={{ fontSize: 14, cursor: "text" }}
                    title="Cliquer pour renommer"
                    onClick={(e) => {
                      e.stopPropagation();
                      commencerRenommage(o);
                    }}
                  >
                    {o.nom}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--fg-muted)" }}>
                    {o.copros} dossier{o.copros > 1 ? "s" : ""} · {o.membres} membre{o.membres > 1 ? "s" : ""}
                  </div>
                </div>
              )}
              <span className="spacer"></span>
              {o.membres === 0 && <Badge kind="warn">Sans accès</Badge>}
              <button
                className="icon-btn"
                title="Renommer"
                onClick={(e) => {
                  e.stopPropagation();
                  if (renommage === o.id) setRenommage(null);
                  else commencerRenommage(o);
                }}
              >
                <Icon name="edit" size={15} />
              </button>
              <button
                className="icon-btn"
                title="Supprimer l'organisation"
                onClick={(e) => {
                  e.stopPropagation();
                  if (
                    window.confirm(
                      `Supprimer « ${o.nom} » ?\n\nLes ${o.copros} dossier(s) rattaché(s) sont conservés mais détachés, ` +
                        `et ses ${o.membres} membre(s) perdent l'accès au portefeuille.`
                    )
                  )
                    void supprimer.mutateAsync(o.id);
                }}
              >
                <Icon name="trash" size={15} />
              </button>
            </div>
            {open === o.id && (
              <div style={{ padding: "0 4px 8px" }}>
                <Membres org={o} />
                <Dossiers org={o} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

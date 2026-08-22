// Administration des enseignes de gestion (Paramètres → Organisations).
// L'AMO compose l'organisation : qui la dirige, qui y est gestionnaire, et
// quels dossiers en font partie. Le directeur voit alors tout le portefeuille
// de son enseigne dans l'espace syndic, sans rattachement copro par copro.
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { Avatar, Badge } from "@/components/ui";
import {
  useAjouterMembre,
  useCoprosRattachables,
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

const ROLE_LABEL: Record<OrgRole, string> = {
  directeur: "Direction - tout le portefeuille",
  gestionnaire: "Gestionnaire - ses dossiers",
};

const EYEBROW: React.CSSProperties = { color: "var(--fg-muted)", margin: "14px 0 8px" };

function Membres({ org }: { org: Organisation }) {
  const { data: membres } = useMembresOrganisation(org.id);
  const { data: libres } = useProfilsSyndicLibres();
  const ajouter = useAjouterMembre();
  const majRole = useMajRoleMembre();
  const retirer = useRetirerMembre();
  const [nouveau, setNouveau] = useState("");
  const [role, setRole] = useState<OrgRole>("gestionnaire");

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
              {m.job_title && <div style={{ fontSize: 12, color: "var(--fg-muted)" }}>{m.job_title}</div>}
            </div>
            <span className="spacer"></span>
            <select
              className="edit-inp sm"
              style={{ maxWidth: 210 }}
              value={m.org_role}
              onChange={(e) =>
                void majRole.mutateAsync({ organisation_id: org.id, user_id: m.user_id, org_role: e.target.value as OrgRole })
              }
            >
              {(Object.keys(ROLE_LABEL) as OrgRole[]).map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
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

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
        <select className="edit-inp sm" style={{ flex: 1, minWidth: 160 }} value={nouveau} onChange={(e) => setNouveau(e.target.value)}>
          <option value="">Ajouter un membre…</option>
          {(libres ?? []).map((p) => (
            <option key={p.user_id} value={p.user_id}>
              {p.full_name}
            </option>
          ))}
        </select>
        <select className="edit-inp sm" style={{ maxWidth: 210 }} value={role} onChange={(e) => setRole(e.target.value as OrgRole)}>
          {(Object.keys(ROLE_LABEL) as OrgRole[]).map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </select>
        <button
          className="se-btn se-btn-secondary btn-sm"
          disabled={!nouveau || ajouter.isPending}
          onClick={() =>
            void ajouter
              .mutateAsync({ organisation_id: org.id, user_id: nouveau, org_role: role })
              .then(() => setNouveau(""))
          }
        >
          <Icon name="plus" size={14} />
          Ajouter
        </button>
      </div>
      {(libres ?? []).length === 0 && (
        <p className="se-small" style={{ color: "var(--fg-muted)", marginTop: 8 }}>
          Aucun compte syndic disponible - un compte n'appartient qu'à une seule enseigne, et la création d'un compte
          passe encore par le tableau de bord Supabase.
        </p>
      )}
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
          Enseignes de gestion (cabinets de syndic). La direction accède à tous les dossiers de son enseigne, les
          gestionnaires aux seuls dossiers dont ils ont la charge - en lecture seule dans les deux cas.
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
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && nomEdite.trim())
                      void renommer.mutateAsync({ id: o.id, nom: nomEdite }).then(() => setRenommage(null));
                    if (e.key === "Escape") setRenommage(null);
                  }}
                />
              ) : (
                <div>
                  <div className="t-title" style={{ fontSize: 14 }}>
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
                  setRenommage(renommage === o.id ? null : o.id);
                  setNomEdite(o.nom);
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

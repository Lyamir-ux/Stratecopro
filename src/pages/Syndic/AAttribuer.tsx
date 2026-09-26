// « Copropriétés à attribuer » (espace syndic, direction de l'enseigne) -
// feedback de Pierrot LEFOU du 25/09/2026 : les nouvelles copropriétés
// arrivées sur le compte de la direction (demande d'AMO faite par le
// directeur) ou sans gestionnaire sont listées en tête de « Vos tâches », avec
// une pastille sur l'onglet et un bandeau sur le portefeuille. L'attribution
// passe par la RPC org_designer_gestionnaire (0102) : le gestionnaire choisi
// ouvre le dossier, reçoit ses alertes et le retrouve dans son portefeuille.
// Un dossier arrivé sur le compte de la direction peut aussi être gardé par
// elle (org_garder_dossier, 0103) : il sort de la liste.
// Règle pure : src/lib/attribution.ts.
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "@/components/Icon";
import { Badge, PhaseBadge } from "@/components/ui";
import { useAuth } from "@/auth/AuthProvider";
import { useCoprosSyndic, useMonOrganisation } from "@/api/syndic";
import { useDesignerGestionnaireDossier, useEquipeEnseigne, useGarderDossierDirection } from "@/api/equipeSyndic";
import { coprosAAttribuer, gestionnairesAttribuables, libelleMotif } from "@/lib/attribution";
import { fmtDate } from "@/lib/format";
import { messageErreur } from "@/lib/erreurs";

/**
 * Dossiers de rénovation globale que la direction doit attribuer. Vide hors
 * direction (gestionnaire, aperçu AMO) ; `actif` false : rien n'est chargé.
 */
export function useCoprosAAttribuer(actif = true) {
  const { profile } = useAuth();
  const { data: org } = useMonOrganisation();
  const orgId = actif && profile?.role === "syndic" && org?.role === "directeur" ? org.id : null;
  const { data: equipe } = useEquipeEnseigne(orgId);
  const { data: copros } = useCoprosSyndic(!!orgId);
  return useMemo(
    () => ({
      liste: orgId && equipe && copros ? coprosAAttribuer(copros, orgId, equipe) : [],
      gestionnaires: gestionnairesAttribuables(equipe ?? []),
    }),
    [orgId, equipe, copros]
  );
}

/** Tableau d'attribution en tête de « Vos tâches » (rien s'il n'y a rien à attribuer). */
export function CoprosAAttribuer() {
  const { liste, gestionnaires } = useCoprosAAttribuer();
  return <TableauAAttribuer liste={liste} gestionnaires={gestionnaires} />;
}

type DonneesAAttribuer = ReturnType<typeof useCoprosAAttribuer>;

function TableauAAttribuer({ liste, gestionnaires }: DonneesAAttribuer) {
  const navigate = useNavigate();
  const designer = useDesignerGestionnaireDossier();
  const garder = useGarderDossierDirection();
  const [choix, setChoix] = useState<Record<string, string>>({});
  const [enCours, setEnCours] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [fait, setFait] = useState<string | null>(null);

  if (liste.length === 0 && !fait) return null;

  const attribuer = async (a: (typeof liste)[number]) => {
    const g = gestionnaires.find((m) => m.user_id === choix[a.copro.id]);
    if (!g) return;
    // un administratif désigné par erreur perd l'accès en cédant la place
    if (a.motif === "autre_role" && a.membre && !window.confirm(`${a.membre.full_name} perdra l'accès à « ${a.copro.name} » (vous pourrez le lui rouvrir depuis Mon organisation). Continuer ?`)) return;
    setErreur(null);
    setFait(null);
    setEnCours(a.copro.id);
    try {
      await designer.mutateAsync({ coproId: a.copro.id, userId: g.user_id });
      setFait(`« ${a.copro.name} » est attribuée à ${g.full_name}.`);
    } catch (e) {
      setErreur(messageErreur(e, "L'attribution n'a pas pu être enregistrée. Réessayez."));
    } finally {
      setEnCours(null);
    }
  };

  // la direction suit elle-même le dossier : il sort de la liste
  const garderDossier = async (a: (typeof liste)[number]) => {
    setErreur(null);
    setFait(null);
    setEnCours(a.copro.id);
    try {
      await garder.mutateAsync(a.copro.id);
      setFait(`« ${a.copro.name} » reste suivie par la direction. Vous pourrez l'attribuer plus tard depuis Mon organisation.`);
    } catch (e) {
      setErreur(messageErreur(e, "Le choix n'a pas pu être enregistré. Réessayez."));
    } finally {
      setEnCours(null);
    }
  };

  return (
    <div className="panel" style={{ marginBottom: 24 }}>
      <div className="p-head">
        <Icon name="users" size={18} />
        <h3>Copropriétés à attribuer</h3>
        {liste.length > 0 && <Badge kind="warn">{liste.length}</Badge>}
      </div>
      <div className="p-body">
        <p className="se-body" style={{ marginTop: 0, color: "var(--fg2)" }}>
          Nouvelles copropriétés arrivées sur le compte de la direction ou sans gestionnaire : choisissez qui les suit. Le gestionnaire
          désigné ouvre le dossier, reçoit ses alertes et le retrouve dans son portefeuille. Un dossier que la direction suit elle-même se
          garde d'un clic.
        </p>
        {fait && (
          <p style={{ margin: "0 0 12px", padding: "10px 14px", borderRadius: "var(--radius-md)", background: "var(--color-success-50)", color: "var(--color-success-700)", fontSize: 13.5 }}>
            <Icon name="check" size={14} /> {fait}
          </p>
        )}
        {erreur && (
          <p style={{ margin: "0 0 12px", padding: "10px 14px", borderRadius: "var(--radius-md)", background: "var(--color-error-50)", color: "var(--color-error-700)", fontSize: 13.5 }}>
            {erreur}
          </p>
        )}
        {liste.length > 0 && gestionnaires.length === 0 && (
          <div className="import-note" style={{ marginBottom: 12 }}>
            <Icon name="users" size={16} />
            <span>
              Votre enseigne n'a encore aucun compte gestionnaire actif : créez-le depuis{" "}
              <button className="se-btn se-btn-ghost btn-sm" style={{ padding: "0 4px" }} onClick={() => navigate("/syndic/organisation")}>
                Mon organisation
              </button>
              .
            </span>
          </div>
        )}
        {liste.length > 0 && (
          <div className="tablewrap">
            <table className="dossiers" style={{ fontSize: 13.5 }}>
              <thead>
                <tr>
                  <th>Copropriété</th>
                  <th>Arrivée le</th>
                  <th>Situation</th>
                  <th>Attribuer à</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {liste.map((a) => (
                  <tr key={a.copro.id} style={{ cursor: "default" }}>
                    <td>
                      <button
                        type="button"
                        onClick={() => navigate(`/syndic/copros/${a.copro.id}`)}
                        style={{ border: "none", background: "none", padding: 0, cursor: "pointer", textAlign: "left", font: "inherit", color: "inherit" }}
                        title="Ouvrir le dossier"
                      >
                        <b>{a.copro.name}</b>
                      </button>
                      <span style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3, fontSize: 12, color: "var(--fg-muted)" }}>
                        <PhaseBadge phase={a.copro.phase} />
                        {a.copro.city}
                      </span>
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>{fmtDate(a.copro.created_at)}</td>
                    <td style={{ whiteSpace: "normal", color: a.motif === "direction" ? "var(--fg1)" : "var(--fg2)" }}>{libelleMotif(a)}</td>
                    <td>
                      <select
                        className="edit-inp"
                        style={{ width: 190, maxWidth: "none" }}
                        value={choix[a.copro.id] ?? ""}
                        disabled={gestionnaires.length === 0 || enCours !== null}
                        onChange={(e) => setChoix((c) => ({ ...c, [a.copro.id]: e.target.value }))}
                        aria-label={`Gestionnaire de ${a.copro.name}`}
                      >
                        <option value="">Choisir…</option>
                        {gestionnaires.map((g) => (
                          <option key={g.user_id} value={g.user_id}>
                            {g.full_name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {/* bouton en couleur une fois le gestionnaire choisi */}
                      <button
                        className={"se-btn btn-sm " + (choix[a.copro.id] ? "se-btn-primary" : "se-btn-secondary")}
                        disabled={!choix[a.copro.id] || enCours !== null}
                        title={choix[a.copro.id] ? undefined : "Choisissez d'abord le gestionnaire"}
                        onClick={() => void attribuer(a)}
                      >
                        <Icon name="check" size={14} />
                        {enCours === a.copro.id ? "Enregistrement…" : "Attribuer"}
                      </button>
                      {a.motif === "direction" && (
                        <button
                          className="se-btn se-btn-ghost btn-sm"
                          style={{ marginLeft: 6 }}
                          disabled={enCours !== null}
                          title="La direction suit elle-même ce dossier : il sort de cette liste"
                          onClick={() => void garderDossier(a)}
                        >
                          La garder
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

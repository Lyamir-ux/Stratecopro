// Collaborateurs - équipe Strat Eco (profils réels).
// Le dirigeant crée les comptes directement depuis cette page (edge function
// creer-collaborateur) : saisie de l'e-mail, mot de passe provisoire généré
// et affiché une seule fois. Le collaborateur devra définir son mot de passe
// personnel à sa première connexion via « Mot de passe oublié ».
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCrumbs } from "@/components/Shell/useCrumbs";
import { Icon } from "@/components/Icon";
import { Avatar, Badge } from "@/components/ui";
import { Modal } from "@/components/Modal";
import { supabase } from "@/lib/supabase";
import { useTeamProfiles, useCreerCollaborateur, type CollaborateurCree } from "@/api/profiles";
import { useAuth } from "@/auth/AuthProvider";

function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      userId,
      ...patch
    }: {
      userId: string;
      job_title?: string | null;
      active?: boolean;
      niveau_pieces?: number;
    }) => {
      const { error } = await supabase.from("profiles").update(patch).eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["team-profiles"] }),
  });
}

/** Formulaire de création puis affichage unique du mot de passe provisoire. */
function NouveauCollaborateur({ onClose }: { onClose: () => void }) {
  const creer = useCreerCollaborateur();
  const [nom, setNom] = useState("");
  const [email, setEmail] = useState("");
  const [fonction, setFonction] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [cree, setCree] = useState<CollaborateurCree | null>(null);
  const [copie, setCopie] = useState(false);

  const valid = nom.trim().length > 1 && /\S+@\S+\.\S+/.test(email);

  const submit = async () => {
    setErreur(null);
    try {
      const res = await creer.mutateAsync({
        full_name: nom.trim(),
        email: email.trim().toLowerCase(),
        job_title: fonction.trim() || undefined,
      });
      setCree(res);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "La création du collaborateur a échoué. Réessayez.");
    }
  };

  if (cree) {
    return (
      <Modal title="Collaborateur créé" onClose={onClose} closeOnBackdrop={false}>
        <p className="se-body" style={{ marginTop: 0 }}>
          Le compte de <strong>{nom.trim()}</strong> est créé : il apparaît dans la liste de l'équipe.
          Transmettez-lui ses identifiants ci-dessous - le mot de passe provisoire ne sera <strong>plus
          jamais affiché</strong> après la fermeture de cette fenêtre.
        </p>
        <div
          style={{
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            padding: "14px 16px",
            display: "flex",
            flexDirection: "column",
            gap: 8,
            background: "var(--bg-soft)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
            <Icon name="mail" size={15} />
            <span style={{ color: "var(--fg-muted)" }}>E-mail :</span>
            <strong>{cree.email}</strong>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
            <Icon name="lock" size={15} />
            <span style={{ color: "var(--fg-muted)" }}>Mot de passe provisoire :</span>
            <strong style={{ fontFamily: "var(--font-mono, monospace)", letterSpacing: 0.5 }}>
              {cree.mot_de_passe}
            </strong>
            <button
              className="icon-btn"
              title="Copier le mot de passe"
              onClick={() => {
                void navigator.clipboard.writeText(cree.mot_de_passe).then(() => setCopie(true));
              }}
            >
              <Icon name={copie ? "check" : "copy"} size={15} />
            </button>
          </div>
        </div>
        <div className="import-note" style={{ marginTop: 14 }}>
          <Icon name="lock" size={16} />
          <span>
            À sa première connexion, le collaborateur devra définir son mot de passe personnel en cliquant
            sur <b>« Mot de passe oublié »</b> : l'accès au progiciel reste bloqué tant que le mot de passe
            provisoire n'a pas été remplacé.
          </span>
        </div>
        <button className="se-btn se-btn-primary" style={{ marginTop: 16 }} onClick={onClose}>
          <Icon name="check" size={16} />
          J'ai transmis les identifiants
        </button>
      </Modal>
    );
  }

  return (
    <Modal title="Nouveau collaborateur" onClose={onClose}>
      <div className="cs-form-grid">
        <div className="cs-field">
          <label>Nom complet *</label>
          <input
            className="edit-inp"
            style={{ maxWidth: "none" }}
            value={nom}
            autoFocus
            onChange={(e) => setNom(e.target.value)}
            placeholder="Prénom Nom"
          />
        </div>
        <div className="cs-field">
          <label>Fonction</label>
          <input
            className="edit-inp"
            style={{ maxWidth: "none" }}
            value={fonction}
            onChange={(e) => setFonction(e.target.value)}
            placeholder="Chef de projet"
          />
        </div>
        <div className="cs-field cs-field-full">
          <label>
            Adresse e-mail * <span style={{ color: "var(--fg-muted)", fontWeight: 400 }}>· identifiant de connexion</span>
          </label>
          <input
            className="edit-inp"
            style={{ maxWidth: "none" }}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="prenom.nom@strateco.fr"
          />
        </div>
      </div>
      <div className="import-note" style={{ marginTop: 14 }}>
        <Icon name="users" size={16} />
        <span>
          Le compte est créé immédiatement avec un <b>mot de passe provisoire</b> généré automatiquement
          (affiché une seule fois à l'étape suivante). Le collaborateur arrive au <b>niveau 2</b> d'accès
          aux pièces, le plus restrictif.
        </span>
      </div>
      {erreur && (
        <p
          style={{
            marginTop: 12,
            marginBottom: 0,
            padding: "10px 14px",
            borderRadius: "var(--radius-md)",
            background: "var(--color-error-50)",
            color: "var(--color-error-700)",
            fontSize: 13.5,
          }}
        >
          {erreur}
        </p>
      )}
      <button
        className="se-btn se-btn-primary"
        style={{ marginTop: 16 }}
        disabled={!valid || creer.isPending}
        onClick={() => void submit()}
      >
        <Icon name="check" size={16} />
        {creer.isPending ? "Création…" : "Créer le compte"}
      </button>
    </Modal>
  );
}

export default function Collaborateurs() {
  useCrumbs([{ label: "Collaborateurs" }]);
  const { data: team } = useTeamProfiles();
  const { profile: me } = useAuth();
  const update = useUpdateProfile();
  const [editing, setEditing] = useState<string | null>(null);
  const [jobDraft, setJobDraft] = useState("");
  const [creating, setCreating] = useState(false);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Collaborateurs</h1>
          <p className="page-sub">L'équipe Strat Eco ayant accès au progiciel</p>
        </div>
        {me?.dirigeant && (
          <>
            <span className="spacer"></span>
            <button className="se-btn se-btn-primary" onClick={() => setCreating(true)}>
              <Icon name="plus" size={17} />
              Nouveau collaborateur
            </button>
          </>
        )}
      </div>

      {creating && <NouveauCollaborateur onClose={() => setCreating(false)} />}

      <div className="panel" style={{ maxWidth: 760 }}>
        <div className="p-head">
          <Icon name="users" size={18} />
          <h3>Équipe AMO</h3>
          <span style={{ flex: 1 }}></span>
          <span style={{ fontSize: 13, color: "var(--fg-muted)" }}>{team?.length ?? 0} membres</span>
        </div>
        <div className="p-body">
          {(team ?? []).map((p) => (
            <div key={p.user_id} className="task-row" style={{ padding: "12px 4px", borderBottom: "1px solid var(--border)" }}>
              <Avatar who={p.initials} name={p.full_name} />
              <div style={{ minWidth: 0 }}>
                <div className="t-title" style={{ fontSize: 14 }}>
                  {p.full_name}
                  {p.user_id === me?.user_id && (
                    <span style={{ color: "var(--fg-muted)", fontWeight: 400 }}> · vous</span>
                  )}
                </div>
                {editing === p.user_id ? (
                  <input
                    className="edit-inp"
                    value={jobDraft}
                    autoFocus
                    onChange={(e) => setJobDraft(e.target.value)}
                    onBlur={() => {
                      void update.mutateAsync({ userId: p.user_id, job_title: jobDraft || null });
                      setEditing(null);
                    }}
                    onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                  />
                ) : (
                  <div className="t-copro">{p.job_title ?? "Fonction à renseigner"}</div>
                )}
              </div>
              <span className="spacer"></span>
              {/* Habilitation pièces justificatives (CGU art. 7.5.1) : le
                  niveau 1 lit le contenu des pièces (chaque consultation est
                  journalisée), le niveau 2 n'y a aucun accès en lecture.
                  Modifiable par le seul dirigeant - verrouillé aussi en base
                  (trigger), le sélecteur grisé n'est qu'un rappel. */}
              <select
                className="edit-inp"
                style={{ width: 210 }}
                value={p.niveau_pieces}
                disabled={!me?.dirigeant}
                title={
                  me?.dirigeant
                    ? "Accès aux pièces justificatives (identité, avis d'imposition, RIB) - CGU art. 7.5.1"
                    : "Seul le dirigeant peut modifier le niveau d'accès aux pièces"
                }
                onChange={(e) =>
                  void update.mutateAsync({ userId: p.user_id, niveau_pieces: Number(e.target.value) })
                }
              >
                <option value={1}>Niveau 1 - lecture des pièces</option>
                <option value={2}>Niveau 2 - sans lecture</option>
              </select>
              <Badge kind={p.active ? "success" : "neutral"} dot={p.active}>
                {p.active ? "Actif" : "Inactif"}
              </Badge>
              <button
                className="icon-btn"
                title="Modifier la fonction"
                onClick={() => {
                  setEditing(p.user_id);
                  setJobDraft(p.job_title ?? "");
                }}
              >
                <Icon name="edit" size={15} />
              </button>
            </div>
          ))}
          <div className="import-note" style={{ marginTop: 16 }}>
            <Icon name="lock" size={16} />
            <span>
              <b>Accès aux pièces justificatives</b> (identité, avis d'imposition, RIB des signatures
              électroniques) : le <b>niveau 1</b> (service administratif) peut lire le contenu des pièces
              - chaque consultation est journalisée ; le <b>niveau 2</b> (chef de projet) n'y a aucun
              accès en lecture et ne voit que les métadonnées. Par défaut, tout nouveau collaborateur est
              au niveau 2, le plus restrictif. Seul le <b>dirigeant</b> peut modifier ces niveaux.
            </span>
          </div>
          <div className="import-note" style={{ marginTop: 10 }}>
            <Icon name="users" size={16} />
            <span>
              {me?.dirigeant ? (
                <>
                  <b>Nouveau collaborateur</b> : le compte est créé directement depuis cette page avec un
                  mot de passe provisoire à lui transmettre. À sa première connexion, il devra définir son
                  mot de passe personnel via <b>« Mot de passe oublié »</b>.
                </>
              ) : (
                <>Les comptes collaborateurs sont créés par le dirigeant depuis cette page.</>
              )}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

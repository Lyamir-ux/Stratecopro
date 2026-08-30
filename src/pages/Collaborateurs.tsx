// Collaborateurs - équipe Strat Eco (profils réels).
// V1 : la création de compte se fait par l'administrateur (Supabase) ;
// l'invitation par e-mail arrive avec une fonction serveur en phase 2.
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCrumbs } from "@/components/Shell/useCrumbs";
import { Icon } from "@/components/Icon";
import { Avatar, Badge } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { useTeamProfiles } from "@/api/profiles";
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

export default function Collaborateurs() {
  useCrumbs([{ label: "Collaborateurs" }]);
  const { data: team } = useTeamProfiles();
  const { profile: me } = useAuth();
  const update = useUpdateProfile();
  const [editing, setEditing] = useState<string | null>(null);
  const [jobDraft, setJobDraft] = useState("");

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Collaborateurs</h1>
          <p className="page-sub">L'équipe Strat Eco ayant accès au progiciel</p>
        </div>
      </div>

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
              Pour ajouter un collaborateur : créez son compte dans Supabase (Authentication → Users → Invite), puis sa
              fiche apparaîtra ici. L'invitation en un clic arrive dans une prochaine version.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

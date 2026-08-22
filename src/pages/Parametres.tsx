// Paramètres : apparence (accent, menu latéral), barèmes des aides par millésime,
// registre RGPD et compilation des retours de la version test.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCrumbs } from "@/components/Shell/useCrumbs";
import { Icon } from "@/components/Icon";
import { Badge, type BadgeKind } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { OrganisationsPanel } from "@/components/OrganisationsPanel";
import { useEditerFeedback, useFeedbacks, useMajFeedback, useSupprimerFeedback, type Feedback } from "@/api/feedback";
import type { Json, Tables } from "@/lib/database.types";
import type { Bareme } from "@/lib/finance";
import { ACCENTS, useUi } from "@/stores/ui";

function useBaremes() {
  return useQuery({
    queryKey: ["baremes-all"],
    queryFn: async (): Promise<Tables<"baremes">[]> => {
      const { data, error } = await supabase.from("baremes").select("*").order("millesime", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

function useSaveBareme() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, params, actif }: { id: string; params?: Bareme; actif?: boolean }) => {
      const { error } = await supabase
        .from("baremes")
        .update({ ...(params ? { params: params as unknown as Json } : {}), ...(actif != null ? { actif } : {}) })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["baremes-all"] });
      void qc.invalidateQueries({ queryKey: ["bareme-actif"] });
    },
  });
}

function useDuplicateBareme() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (src: Tables<"baremes">) => {
      const params = src.params as unknown as Bareme;
      const millesime = src.millesime + 1;
      const { error } = await supabase.from("baremes").insert({
        millesime,
        zone: src.zone,
        actif: false,
        params: { ...params, millesime } as unknown as Json,
      });
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["baremes-all"] }),
  });
}

function BaremeEditor({ row }: { row: Tables<"baremes"> }) {
  const save = useSaveBareme();
  const [p, setP] = useState<Bareme>(row.params as unknown as Bareme);
  const [dirty, setDirty] = useState(false);

  const num = (label: string, value: number, onChange: (v: number) => void, suffix?: string) => (
    <div className="kv" key={label}>
      <span className="k">{label}</span>
      <span className="v" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <input
          className="edit-inp sm"
          type="number"
          value={value}
          onChange={(e) => {
            onChange(Number(e.target.value) || 0);
            setDirty(true);
          }}
          style={{ width: 90, textAlign: "right" }}
        />
        {suffix && <span style={{ color: "var(--fg-muted)", fontSize: 12.5 }}>{suffix}</span>}
      </span>
    </div>
  );

  return (
    <div className="p-body">
      <div className="se-eyebrow" style={{ color: "var(--fg-muted)", marginBottom: 8 }}>
        MaPrimeRénov' Copropriétés
      </div>
      {num("Taux standard (gain 35-50 %)", p.mprCopro.tauxStandard, (v) => setP({ ...p, mprCopro: { ...p.mprCopro, tauxStandard: v } }), "%")}
      {num("Taux majoré (gain ≥ 50 %)", p.mprCopro.tauxMajore, (v) => setP({ ...p, mprCopro: { ...p.mprCopro, tauxMajore: v } }), "%")}
      {num("Bonus sortie de passoire", p.mprCopro.bonusPassoire, (v) => setP({ ...p, mprCopro: { ...p.mprCopro, bonusPassoire: v } }), "pts")}
      {num("Seuil d'éligibilité (gain)", p.mprCopro.seuilMin, (v) => setP({ ...p, mprCopro: { ...p.mprCopro, seuilMin: v } }), "%")}

      <div className="se-eyebrow" style={{ color: "var(--fg-muted)", margin: "16px 0 8px" }}>
        Primes individuelles (€ / logement)
      </div>
      {(["Bleu", "Jaune", "Violet", "Rose"] as const).map((prof) =>
        num(`Profil ${prof}`, p.primesIndiv[prof], (v) => setP({ ...p, primesIndiv: { ...p.primesIndiv, [prof]: v } }), "€")
      )}

      <div className="se-eyebrow" style={{ color: "var(--fg-muted)", margin: "16px 0 8px" }}>
        Éco-PTZ collectif
      </div>
      {num("Plafond par logement", p.ecoPtz.plafondParLogement, (v) => setP({ ...p, ecoPtz: { ...p.ecoPtz, plafondParLogement: v } }), "€")}
      {num("Durée maximale", p.ecoPtz.dureeMax, (v) => setP({ ...p, ecoPtz: { ...p.ecoPtz, dureeMax: v } }), "ans")}

      <p className="se-small" style={{ color: "var(--fg-muted)", marginTop: 12 }}>
        Les seuils de revenu fiscal (profils MPR) se modifient lors du passage au millésime suivant — dupliquez le
        barème pour préparer l'année à venir.
      </p>

      <button
        className="se-btn se-btn-primary btn-sm"
        style={{ marginTop: 10 }}
        disabled={!dirty || save.isPending}
        onClick={() => {
          void save.mutateAsync({ id: row.id, params: p }).then(() => setDirty(false));
        }}
      >
        <Icon name="check" size={15} />
        {save.isPending ? "Enregistrement…" : dirty ? "Enregistrer le barème" : "Enregistré"}
      </button>
      <p className="se-small" style={{ color: "var(--color-warning-700)", marginTop: 10 }}>
        <Icon name="alert" size={13} /> Les scénarios déjà validés conservent leur snapshot — une modification de
        barème ne s'applique qu'aux prochains calculs.
      </p>
    </div>
  );
}

const FB_TYPE_BADGE: Record<string, { kind: BadgeKind; label: string }> = {
  bug: { kind: "warn", label: "Bug" },
  idee: { kind: "blue", label: "Idée" },
  remarque: { kind: "neutral", label: "Remarque" },
};
const FB_ROLE_LABEL: Record<string, string> = {
  amo: "Équipe AMO",
  syndic: "Syndic",
  copro: "Copropriétaire",
  presta: "Prestataire",
  moe: "MOE",
};

function FeedbackRow({ fb }: { fb: Feedback }) {
  const maj = useMajFeedback();
  const editer = useEditerFeedback();
  const supprimer = useSupprimerFeedback();
  const [edition, setEdition] = useState(false);
  const [brouillon, setBrouillon] = useState(fb.message);
  const t = FB_TYPE_BADGE[fb.type] ?? FB_TYPE_BADGE.remarque;
  const traite = fb.statut === "traite";
  return (
    <div style={{ padding: "12px 4px", borderBottom: "1px solid var(--border)", opacity: traite && !edition ? 0.55 : 1 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <Badge kind={t.kind}>{t.label}</Badge>
        <span style={{ fontSize: 13.5, fontWeight: 600 }}>{fb.auteur_nom || "Anonyme"}</span>
        <span style={{ fontSize: 12.5, color: "var(--fg-muted)" }}>
          {FB_ROLE_LABEL[fb.auteur_role] ?? fb.auteur_role} ·{" "}
          {new Date(fb.created_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
        </span>
        <span style={{ flex: 1 }}></span>
        <button
          className="icon-btn"
          style={{ width: 30, height: 30 }}
          title="Ouvrir et modifier ce retour"
          onClick={() => {
            setBrouillon(fb.message);
            setEdition((v) => !v);
          }}
        >
          <Icon name="edit" size={15} />
        </button>
        <button
          className="icon-btn"
          style={{ width: 30, height: 30 }}
          title={traite ? "Repasser en « nouveau »" : "Marquer comme traité — l'auteur reçoit un mail de compte rendu"}
          onClick={() => void maj.mutateAsync({ id: fb.id, statut: traite ? "nouveau" : "traite" })}
        >
          <Icon name={traite ? "clock" : "check"} size={15} />
        </button>
        <button
          className="icon-btn"
          style={{ width: 30, height: 30 }}
          title="Supprimer ce retour"
          onClick={() => {
            if (window.confirm("Supprimer définitivement ce retour ?")) void supprimer.mutateAsync(fb.id);
          }}
        >
          <Icon name="trash" size={15} />
        </button>
      </div>
      {edition ? (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
          <textarea
            className="cs-textarea"
            rows={4}
            value={brouillon}
            onChange={(e) => setBrouillon(e.target.value)}
          ></textarea>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button className="se-btn se-btn-ghost btn-sm" onClick={() => setEdition(false)}>
              Annuler
            </button>
            <button
              className="se-btn se-btn-primary btn-sm"
              disabled={!brouillon.trim() || brouillon === fb.message || editer.isPending}
              onClick={() => {
                void editer.mutateAsync({ id: fb.id, message: brouillon }).then(() => setEdition(false));
              }}
            >
              <Icon name="check" size={14} />
              {editer.isPending ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        </div>
      ) : (
        <p style={{ margin: "7px 0 0", fontSize: 13.5, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{fb.message}</p>
      )}
      <p style={{ margin: "5px 0 0", fontSize: 12, color: "var(--fg-muted)" }}>
        Page : {fb.page || "—"}
        {traite && fb.traite_email_statut && (
          <span style={{ marginLeft: 10 }}>
            <Icon name="mail" size={12} /> {FB_MAIL_LABEL[fb.traite_email_statut] ?? fb.traite_email_statut}
            {fb.traite_email_statut === "envoye" && fb.traite_email_le
              ? ` le ${new Date(fb.traite_email_le).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}`
              : ""}
          </span>
        )}
      </p>
    </div>
  );
}

/** Résultat de la notification automatique envoyée à l'auteur au traitement. */
const FB_MAIL_LABEL: Record<string, string> = {
  envoye: "Auteur notifié par mail",
  simule: "Mail simulé (envoi non configuré)",
  erreur: "Échec du mail à l'auteur",
  sans_email: "Auteur sans adresse mail",
};

/** Feedbacks restant à traiter → Markdown prêt à coller dans Claude. */
function feedbacksToMarkdown(list: Feedback[]): string {
  const blocs = list.map((fb) => {
    const type = FB_TYPE_BADGE[fb.type]?.label ?? fb.type;
    const date = new Date(fb.created_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
    return [
      `## ${type} — ${fb.auteur_nom || "Anonyme"} (${FB_ROLE_LABEL[fb.auteur_role] ?? fb.auteur_role}) · ${date}`,
      "",
      fb.message.trim(),
      "",
      `Page : \`${fb.page || "—"}\``,
    ].join("\n");
  });
  return [
    `# Feedbacks à traiter — export du ${new Date().toLocaleDateString("fr-FR")} (${list.length})`,
    "",
    blocs.join("\n\n---\n\n"),
    "",
  ].join("\n");
}

function FeedbackPanel() {
  const { data: feedbacks } = useFeedbacks();
  // « à traiter » = retours nouveaux ; « archives » = retours déjà traités,
  // filtrables par auteur (menu des clients)
  const [vue, setVue] = useState<"a_traiter" | "archives">("a_traiter");
  const [auteur, setAuteur] = useState<string>("tous");
  const [copie, setCopie] = useState(false);
  const nouveaux = (feedbacks ?? []).filter((f) => f.statut !== "traite");
  const traites = (feedbacks ?? []).filter((f) => f.statut === "traite");
  const auteurs = [...new Set(traites.map((f) => f.auteur_nom || "Anonyme"))].sort((a, b) =>
    a.localeCompare(b, "fr")
  );
  const visibles =
    vue === "a_traiter"
      ? nouveaux
      : auteur === "tous"
        ? traites
        : traites.filter((f) => (f.auteur_nom || "Anonyme") === auteur);

  const exporterMd = async () => {
    const md = feedbacksToMarkdown(nouveaux);
    try {
      await navigator.clipboard.writeText(md);
      setCopie(true);
      window.setTimeout(() => setCopie(false), 2500);
    } catch {
      // Presse-papiers indisponible (permissions) → téléchargement du .md à la place
      const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "feedbacks-a-traiter.md";
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  return (
    <div className="panel">
      <div className="p-head">
        <Icon name="megaphone" size={18} />
        <h3>Retours de test</h3>
        <span style={{ flex: 1 }}></span>
        {nouveaux.length > 0 && <Badge kind="primary" dot>{nouveaux.length} à traiter</Badge>}
        {vue === "a_traiter" && nouveaux.length > 0 && (
          <button
            className="se-btn se-btn-secondary btn-sm"
            title="Copier les feedbacks à traiter au format Markdown, prêts à coller dans Claude"
            onClick={() => void exporterMd()}
          >
            <Icon name={copie ? "check" : "copy"} size={14} />
            {copie ? "Copié !" : "Exporter en MD"}
          </button>
        )}
        <div className="opt-mini">
          <button className={vue === "a_traiter" ? "on" : ""} onClick={() => setVue("a_traiter")}>
            À traiter
          </button>
          <button className={vue === "archives" ? "on" : ""} onClick={() => setVue("archives")}>
            Archives · {traites.length}
          </button>
        </div>
      </div>
      <div className="p-body">
        {vue === "archives" && traites.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <Icon name="users" size={15} style={{ color: "var(--fg-muted)" }} />
            <select className="edit-sel" value={auteur} onChange={(e) => setAuteur(e.target.value)} style={{ maxWidth: 260 }}>
              <option value="tous">Tous les auteurs ({traites.length})</option>
              {auteurs.map((a) => (
                <option key={a} value={a}>
                  {a} ({traites.filter((f) => (f.auteur_nom || "Anonyme") === a).length})
                </option>
              ))}
            </select>
          </div>
        )}
        {visibles.length === 0 ? (
          <p className="se-small" style={{ color: "var(--fg-muted)" }}>
            {vue === "archives"
              ? "Aucun retour traité pour l'instant — les retours marqués comme traités s'archivent ici."
              : "Aucun retour pour l'instant — les remarques envoyées via le bouton « Feedback » (en bas à droite de chaque page, tous espaces confondus) s'afficheront ici."}
          </p>
        ) : (
          visibles.map((fb) => <FeedbackRow key={fb.id} fb={fb} />)
        )}
      </div>
    </div>
  );
}

export default function Parametres() {
  useCrumbs([{ label: "Paramètres" }]);
  const { data: baremes } = useBaremes();
  const save = useSaveBareme();
  const duplicate = useDuplicateBareme();
  const { accent, setAccent, sidebarTheme, setSidebarTheme } = useUi();
  const [openBareme, setOpenBareme] = useState<string | null>(null);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Paramètres</h1>
          <p className="page-sub">Apparence, organisations, barèmes des aides et conformité</p>
        </div>
      </div>

      <div className="detail-grid">
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <FeedbackPanel />

          <OrganisationsPanel />

          <div className="panel">
            <div className="p-head">
              <Icon name="euro" size={18} />
              <h3>Barèmes des aides</h3>
              <span style={{ flex: 1 }}></span>
              <span style={{ fontSize: 13, color: "var(--fg-muted)" }}>versionnés par millésime</span>
            </div>
            <div className="p-body">
              {(baremes ?? []).map((b) => (
                <div key={b.id} style={{ marginBottom: 10 }}>
                  <div
                    className="task-row"
                    style={{ padding: "10px 4px", borderBottom: "1px solid var(--border)", cursor: "pointer" }}
                    onClick={() => setOpenBareme(openBareme === b.id ? null : b.id)}
                  >
                    <Icon name={openBareme === b.id ? "chevronDown" : "chevronRight"} size={15} />
                    <div>
                      <div className="t-title" style={{ fontSize: 14 }}>
                        Millésime {b.millesime} · {b.zone === "hors_idf" ? "hors Île-de-France" : "Île-de-France"}
                      </div>
                    </div>
                    <span className="spacer"></span>
                    {b.actif ? (
                      <Badge kind="success" dot>
                        Actif
                      </Badge>
                    ) : (
                      <button
                        className="se-btn se-btn-ghost btn-sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          void save.mutateAsync({ id: b.id, actif: true });
                        }}
                      >
                        Activer
                      </button>
                    )}
                    <button
                      className="icon-btn"
                      title={`Dupliquer vers ${b.millesime + 1}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        void duplicate.mutateAsync(b);
                      }}
                    >
                      <Icon name="copy" size={15} />
                    </button>
                  </div>
                  {openBareme === b.id && <BaremeEditor row={b} />}
                </div>
              ))}
            </div>
          </div>

          <div className="panel">
            <div className="p-head">
              <Icon name="lock" size={18} />
              <h3>Données personnelles (RGPD)</h3>
            </div>
            <div className="p-body">
              <div className="kv">
                <span className="k">Hébergement</span>
                <span className="v">Supabase · Union européenne (Stockholm)</span>
              </div>
              <div className="kv">
                <span className="k">Données sensibles</span>
                <span className="v">Revenus fiscaux (enquête sociale)</span>
              </div>
              <div className="kv">
                <span className="k">Finalité</span>
                <span className="v" style={{ textAlign: "right" }}>
                  Calcul des aides MaPrimeRénov' individuelles
                </span>
              </div>
              <div className="kv">
                <span className="k">Accès</span>
                <span className="v">Équipe AMO Strat Eco uniquement</span>
              </div>
              <div className="kv">
                <span className="k">Conservation</span>
                <span className="v">Durée du dossier + obligations légales</span>
              </div>
              <p className="se-small" style={{ color: "var(--fg-muted)", marginTop: 10 }}>
                Pour effacer les données d'un copropriétaire (droit à l'effacement), supprimez sa fiche dans l'onglet
                Données de la copro — ses réponses d'enquête sont supprimées en cascade.
              </p>
            </div>
          </div>
        </div>

        <div className="panel" style={{ alignSelf: "flex-start" }}>
          <div className="p-head">
            <Icon name="settings" size={18} />
            <h3>Apparence</h3>
          </div>
          <div className="p-body">
            <div className="se-eyebrow" style={{ color: "var(--fg-muted)", marginBottom: 10 }}>
              Couleur d'accent
            </div>
            <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
              {ACCENTS.map((a) => (
                <button
                  key={a}
                  onClick={() => setAccent(a)}
                  title={a}
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: "50%",
                    background: a,
                    border: accent === a ? "3px solid var(--fg1)" : "3px solid transparent",
                    cursor: "pointer",
                  }}
                ></button>
              ))}
            </div>
            <div className="se-eyebrow" style={{ color: "var(--fg-muted)", marginBottom: 10 }}>
              Menu latéral
            </div>
            <div className="opt-mini">
              <button className={sidebarTheme === "clair" ? "on" : ""} onClick={() => setSidebarTheme("clair")}>
                Clair
              </button>
              <button className={sidebarTheme === "sombre" ? "on" : ""} onClick={() => setSidebarTheme("sombre")}>
                Sombre
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

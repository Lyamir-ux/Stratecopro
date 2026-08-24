// Base de connaissances - documents de référence de l'équipe AMO classés par
// secteur d'activité du projet (feedback Wafaa du 24/08/2026). Accessible
// depuis la barre latérale, sous « Collaborateurs ».
import { useMemo, useRef, useState } from "react";
import { useCrumbs } from "@/components/Shell/useCrumbs";
import { Icon } from "@/components/Icon";
import { fmtDate } from "@/lib/format";
import {
  SECTEURS,
  downloadDocumentReference,
  useDeleteDocumentReference,
  useDocumentsReference,
  useUploadDocumentReference,
} from "@/api/baseConnaissances";

function fmtSize(bytes: number | null): string {
  if (bytes == null) return "";
  if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + " Ko";
  return (bytes / (1024 * 1024)).toLocaleString("fr-FR", { maximumFractionDigits: 1 }) + " Mo";
}

/** Comparaison de recherche : minuscules, sans accents. */
const normaliser = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export default function BaseConnaissances() {
  useCrumbs([{ label: "Base de connaissances" }]);
  const { data: docs, isLoading } = useDocumentsReference();
  const upload = useUploadDocumentReference();
  const del = useDeleteDocumentReference();
  const fileRef = useRef<HTMLInputElement>(null);

  const [secteurFilter, setSecteurFilter] = useState<string>("");
  const [recherche, setRecherche] = useState("");
  const [uploadSecteur, setUploadSecteur] = useState<string>(SECTEURS[0]);

  const q = normaliser(recherche.trim());
  const filtered = useMemo(
    () =>
      (docs ?? []).filter(
        (d) =>
          (!secteurFilter || d.secteur === secteurFilter) &&
          (!q || normaliser(d.name + " " + (d.description ?? "")).includes(q))
      ),
    [docs, secteurFilter, q]
  );

  // Groupes affichés dans l'ordre du référentiel, secteurs inconnus à la fin
  const groupes = useMemo(() => {
    const secteurs = [...SECTEURS.filter((s) => filtered.some((d) => d.secteur === s))];
    for (const d of filtered) if (!secteurs.includes(d.secteur as (typeof SECTEURS)[number])) secteurs.push(d.secteur as never);
    return secteurs.map((s) => ({ secteur: s, docs: filtered.filter((d) => d.secteur === s) }));
  }, [filtered]);

  const compteParSecteur = (s: string) => (docs ?? []).filter((d) => d.secteur === s).length;

  const deposer = async (files: FileList | null) => {
    for (const f of Array.from(files ?? [])) {
      await upload.mutateAsync({ file: f, secteur: uploadSecteur });
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Base de connaissances</h1>
          <p className="page-sub">
            Les documents de référence de l'équipe, classés par secteur d'activité du projet
          </p>
        </div>
        <span className="spacer"></span>
        <select
          className="edit-inp"
          value={uploadSecteur}
          onChange={(e) => setUploadSecteur(e.target.value)}
          style={{ maxWidth: 190 }}
          title="Secteur du document à déposer"
        >
          {SECTEURS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button
          className="se-btn se-btn-primary btn-sm"
          onClick={() => fileRef.current?.click()}
          disabled={upload.isPending}
        >
          <Icon name="upload" size={15} />
          {upload.isPending ? "Dépôt en cours…" : "Déposer un document"}
        </button>
        <input
          ref={fileRef}
          type="file"
          multiple
          style={{ display: "none" }}
          onChange={(e) => {
            void deposer(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      <div className="toolbar">
        <div className="seg">
          <button className={secteurFilter === "" ? "on" : ""} onClick={() => setSecteurFilter("")}>
            Tous ({docs?.length ?? 0})
          </button>
          {SECTEURS.map((s) => (
            <button key={s} className={secteurFilter === s ? "on" : ""} onClick={() => setSecteurFilter(s)}>
              {s} ({compteParSecteur(s)})
            </button>
          ))}
        </div>
        <span style={{ flex: 1 }}></span>
        <div className="search" style={{ margin: 0 }}>
          <Icon name="search" size={15} />
          <input
            placeholder="Rechercher un document…"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
          />
        </div>
      </div>

      {upload.isError && (
        <p className="se-small" style={{ color: "var(--color-error-700)", marginTop: 0 }}>
          Échec du dépôt : {String((upload.error as Error)?.message ?? upload.error)}
        </p>
      )}

      {isLoading ? (
        <p style={{ color: "var(--fg-muted)" }}>Chargement…</p>
      ) : groupes.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--fg-muted)" }}>
          {q || secteurFilter
            ? "Aucun document ne correspond à cette recherche."
            : "Aucun document pour l'instant - déposez les premiers documents de référence de l'équipe."}
        </div>
      ) : (
        groupes.map((g) => (
          <div key={g.secteur} className="panel" style={{ marginBottom: 22 }}>
            <div className="p-head">
              <Icon name="book" size={18} />
              <h3>{g.secteur}</h3>
              <span style={{ flex: 1 }}></span>
              <span style={{ fontSize: 13, color: "var(--fg-muted)" }}>
                {g.docs.length} document{g.docs.length > 1 ? "s" : ""}
              </span>
            </div>
            <div className="p-body">
              {g.docs.map((d) => (
                <div
                  key={d.id}
                  className="task-row"
                  style={{ padding: "10px 4px", borderBottom: "1px solid var(--border)" }}
                >
                  <Icon name="fileText" size={16} style={{ color: "var(--color-secondary-500)", flex: "none" }} />
                  <div style={{ minWidth: 0 }}>
                    <div className="t-title" style={{ fontSize: 13.5 }}>
                      {d.name}
                    </div>
                    <div className="t-copro">
                      {[fmtSize(d.size), fmtDate(d.created_at), d.description].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  <span className="spacer"></span>
                  <button
                    className="icon-btn"
                    title="Télécharger"
                    onClick={() => void downloadDocumentReference(d)}
                  >
                    <Icon name="download" size={16} />
                  </button>
                  <button
                    className="icon-btn"
                    title="Supprimer"
                    disabled={del.isPending}
                    onClick={() => {
                      if (window.confirm(`Supprimer « ${d.name} » de la base de connaissances ?`)) {
                        void del.mutateAsync(d);
                      }
                    }}
                  >
                    <Icon name="trash" size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      <p className="se-small" style={{ color: "var(--fg-muted)" }}>
        <Icon name="book" size={13} /> Espace interne à l'équipe AMO : guides, modèles, textes réglementaires et
        documents types - choisissez le secteur en haut de page avant le dépôt. Les syndics, copropriétaires et
        prestataires n'y ont pas accès.
      </p>
    </div>
  );
}

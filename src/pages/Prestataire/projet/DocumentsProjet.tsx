// Documents de projet de la maîtrise d'œuvre (devis, DPGF, plannings, PV…),
// partagés avec l'équipe Strat Eco (onglet Prestataires du dossier).
// Retours d'Amir du 14/10/2026 (/prestataire/projets) :
//  - dépôt par glissé-déposé (zone du panneau) en plus du bouton ;
//  - un œil pour voir le document sans le télécharger ;
//  - même fenêtre de nommage que l'AMO et le syndic (type de document de la
//    nomenclature, objet, émetteur, date) ; un devis ou une DPGF de travaux
//    enchaîne, comme chez l'AMO, sur la vérification RGE de l'entreprise puis
//    sur le questionnaire éco-PTZ (audit, devis et CCTP / DPGF aussi).
// Le type choisi est gardé (projet_docs.type_document, 0165) : l'onglet
// « Documents à produire » repère les pièces attendues déposées par la MOE.
import { useRef, useState } from "react";
import { ApercuDocument } from "@/components/ApercuDocument";
import { Icon } from "@/components/Icon";
import { RenommageDialog } from "@/components/RenommageDialog";
import { BoutonRge, VerificationRgeDialog } from "@/components/VerificationRge";
import { derniereParFichier, siretDuFichier, useVerificationsRgeMoe } from "@/api/rge";
import {
  telechargerDocPresta,
  urlSigneeDocPresta,
  useDeleteProjetDoc,
  useProjetDocs,
  useUploadProjetDoc,
} from "@/api/espacePrestataire";
import { fmtDate } from "@/lib/format";
import { lotDepuisNomFichier } from "@/lib/rge";
import { typeLabel } from "@/lib/nommage";
import type { Tables } from "@/lib/database.types";

const fmtTaille = (n: number | null) =>
  n == null ? "" : n > 1048576 ? `${(n / 1048576).toFixed(1)} Mo` : `${Math.max(1, Math.round(n / 1024))} Ko`;

export function DocumentsProjet({
  presta,
  copro,
}: {
  presta: Tables<"prestataires">;
  copro: { id: string; name: string; code_postal: string | null };
}) {
  const { data: tousDocs } = useProjetDocs(presta.id);
  const { data: verifsRge } = useVerificationsRgeMoe(presta.id);
  const derniereRge = derniereParFichier(verifsRge, "projet_doc_id");
  const docs = (tousDocs ?? []).filter((d) => d.copro_id === copro.id);
  const upload = useUploadProjetDoc(presta);
  const supprimer = useDeleteProjetDoc();
  const fileRef = useRef<HTMLInputElement>(null);
  const [depot, setDepot] = useState<File[] | null>(null);
  const [survol, setSurvol] = useState(false);
  const [apercu, setApercu] = useState<Tables<"projet_docs"> | null>(null);
  const [rgeDe, setRgeDe] = useState<Tables<"projet_docs"> | null>(null);

  const deposer = (liste: FileList | File[]) => {
    const files = Array.from(liste);
    if (files.length) setDepot(files);
  };

  return (
    <div className="panel">
      <div className="p-head" style={{ flexWrap: "wrap" }}>
        <Icon name="folder" size={18} />
        <h3>Vos documents du projet</h3>
        <span style={{ fontSize: 13, color: "var(--fg-muted)" }}>{docs.length}</span>
        <span style={{ flex: 1 }}></span>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx"
          style={{ display: "none" }}
          onChange={(e) => {
            if (e.target.files?.length) deposer(e.target.files);
            e.target.value = "";
          }}
        />
        <button className="se-btn se-btn-secondary btn-sm" onClick={() => fileRef.current?.click()} disabled={depot != null}>
          <Icon name="upload" size={14} />
          {depot ? "Dépôt en cours…" : "Déposer un document"}
        </button>
      </div>
      <div
        className="p-body"
        onDragOver={(e) => {
          e.preventDefault();
          setSurvol(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setSurvol(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setSurvol(false);
          if (e.dataTransfer.files.length) deposer(e.dataTransfer.files);
        }}
        style={survol ? { outline: "2px dashed var(--accent)", outlineOffset: -6, borderRadius: "var(--radius-md)" } : undefined}
      >
        {docs.length === 0 ? (
          <button type="button" className="moe-depot-vide" onClick={() => fileRef.current?.click()}>
            <Icon name="upload" size={22} />
            <span>
              <b>Glissez-déposez vos documents ici</b> ou cliquez pour les choisir
            </span>
            <span className="se-small" style={{ color: "var(--fg-muted)" }}>
              Devis, DPGF, CCTP, plannings, PV de chantier… partagés avec l'équipe Strat Eco
            </span>
          </button>
        ) : (
          docs.map((d) => (
            <div key={d.id} className="doc-row fichier-ligne moe-doc-ligne">
              <Icon name="fileText" size={18} style={{ color: "var(--fg-muted)", flex: "none" }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="d-name" style={{ overflowWrap: "anywhere" }}>{d.name}</div>
                <div className="d-sub">
                  {[d.type_document && d.type_document !== "autre" ? typeLabel(d.type_document) : null, fmtTaille(d.size), `déposé le ${fmtDate(d.uploaded_at)}`]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              </div>
              <span className="moe-doc-actions">
                {(derniereRge.has(d.id) || /\.pdf$/i.test(d.name)) && (
                  <BoutonRge verification={derniereRge.get(d.id)} onClick={() => setRgeDe(d)} />
                )}
                <button className="icon-btn" style={{ width: 30, height: 30 }} title="Voir le document" onClick={() => setApercu(d)}>
                  <Icon name="eye" size={15} />
                </button>
                <button className="icon-btn" style={{ width: 30, height: 30 }} title="Télécharger" onClick={() => void telechargerDocPresta(d)}>
                  <Icon name="download" size={15} />
                </button>
                <button
                  className="icon-btn"
                  style={{ width: 30, height: 30 }}
                  title="Supprimer ce document"
                  onClick={() => {
                    if (window.confirm(`Supprimer « ${d.name} » ?`)) void supprimer.mutateAsync(d);
                  }}
                >
                  <Icon name="trash" size={14} />
                </button>
              </span>
            </div>
          ))
        )}
        {docs.length > 0 && (
          <p className="se-small" style={{ color: "var(--fg-muted)", margin: "12px 0 0" }}>
            <Icon name="upload" size={13} /> Glissez-déposez d'autres fichiers sur ce panneau pour les ajouter ;
            l'œil affiche un document sans le télécharger. Les pièces des dossiers de financement (éco-PTZ, ANAH,
            CEE…) se déposent dans « Documents à produire ».
          </p>
        )}
        {upload.isError && (
          <p className="se-small" style={{ marginTop: 8, marginBottom: 0, color: "var(--color-error-700)" }}>
            Échec de l'envoi : {String((upload.error as Error)?.message ?? upload.error)}
          </p>
        )}
      </div>

      {depot && (
        <RenommageDialog
          files={depot}
          prefixe={copro.name}
          emetteurInitial={presta.raison_sociale}
          onConfirm={(file, meta) => upload.mutateAsync({ coproId: copro.id, file, type: meta.type })}
          ecoPtz={{ coproId: copro.id }}
          rge={{ coproId: copro.id, codePostal: copro.code_postal, presta }}
          onClose={() => setDepot(null)}
        />
      )}

      {apercu && (
        <ApercuDocument
          name={apercu.name}
          path={apercu.path}
          urlSignee={urlSigneeDocPresta}
          onClose={() => setApercu(null)}
          onTelecharger={() => void telechargerDocPresta(apercu)}
        />
      )}

      {rgeDe && (
        <VerificationRgeDialog
          nomFichier={rgeDe.name}
          siretInitial={derniereRge.get(rgeDe.id)?.siret ?? null}
          lireSiret={() => siretDuFichier(rgeDe.path, "presta-docs")}
          nomInitial={derniereRge.get(rgeDe.id)?.entreprise ?? null}
          objet={derniereRge.get(rgeDe.id)?.objet ?? lotDepuisNomFichier(rgeDe.name)}
          objetModifiable
          codePostalCopro={copro.code_postal}
          dossier={{ coproId: copro.id, prefixe: copro.name, projetDocId: rgeDe.id, presta }}
          onClose={() => setRgeDe(null)}
        />
      )}
    </div>
  );
}

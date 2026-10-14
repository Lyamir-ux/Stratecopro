// Onglet « Documents à produire » de la fiche MOE (14/10/2026) : les dossiers
// de financement et d'assurance du syndic (éco-PTZ collectif, ANAH, CEE, EMS &
// Climaxion, dommages-ouvrage), pièce par pièce. En couleur, les pièces qui
// reviennent à la maîtrise d'œuvre (fournisseur « moe » ou « amo_moe » du
// catalogue) : la MOE les dépose ici (clic ou glissé-déposé sur la ligne, même
// fenêtre de nommage que l'AMO et le syndic). Le dépôt complète aussi les
// pièces du même type des autres dossiers. Les autres pièces sont affichées
// pour suivi (fournie / à fournir), sans leurs fichiers ; les pièces
// confidentielles restent « gérées par Strat Eco ». Données : RPC montage_moe,
// montage_deposer_moe et montage_retirer_moe (0165).
import { useMemo, useRef, useState, type DragEvent } from "react";
import { ApercuDocument } from "@/components/ApercuDocument";
import { Icon } from "@/components/Icon";
import { RenommageDialog } from "@/components/RenommageDialog";
import { Badge, Progress } from "@/components/ui";
import { useAuth } from "@/auth/AuthProvider";
import { estVisualisable } from "@/api/fichiers";
import {
  MONTAGES,
  PARCOURS,
  docsOfEtape,
  downloadMontageFile,
  type DocDef,
  type EtapeDef,
  type MontageFile,
  type MontageId,
} from "@/api/montage";
import {
  useDeposerMontageMoe,
  useMontageMoe,
  useRetirerMontageMoe,
  type MontageMoe,
  type PieceMontageMoe,
} from "@/api/projetMoe";
import { fmtDate } from "@/lib/format";
import { messageErreur } from "@/lib/erreurs";
import type { Tables } from "@/lib/database.types";

const EXTENSIONS_OK = [".pdf", ".jpg", ".jpeg", ".png", ".doc", ".docx", ".xls", ".xlsx"];
const extensionOk = (name: string) => EXTENSIONS_OK.some((e) => name.toLowerCase().endsWith(e));

const fmtTaille = (n: number | null) =>
  n == null ? "" : n > 1048576 ? `${(n / 1048576).toFixed(1)} Mo` : `${Math.max(1, Math.round(n / 1024))} Ko`;

/** Pièce que la maîtrise d'œuvre a à déposer (seule ou avec Strat Eco). */
export const pieceMoe = (d: DocDef) => d.fournisseur === "moe" || d.fournisseur === "amo_moe";

const FOURNISSEUR_MOE: Record<DocDef["fournisseur"], string> = {
  syndic: "Fournie par le syndic",
  amo: "Fournie par Strat Eco",
  moe: "À déposer par vous",
  amo_moe: "À déposer par vous ou Strat Eco",
};

const LIBELLE_FORMULAIRE: Record<string, string> = {
  brouillon: "En cours de saisie par le syndic",
  transmis: "Transmis à Strat Eco",
  valide: "Validé par Strat Eco",
};

/** Avancement d'une étape vu de la MOE : pièces fournies (par quiconque) ou non
 *  concernées, formulaires transmis ; les pièces confidentielles sont hors compte. */
function avancement(etape: EtapeDef, pieces: Map<string, PieceMontageMoe>, forms: MontageMoe["formulaires"]) {
  const defs = docsOfEtape(etape).filter((d) => !d.confidentiel);
  let done = defs.filter((d) => {
    const p = pieces.get(d.key);
    return p && (p.nb_fichiers > 0 || p.statut === "non_applicable");
  }).length;
  let total = defs.length;
  for (const f of etape.formulaires ?? []) {
    total += 1;
    const st = forms.find((x) => x.type === f.type)?.statut;
    if (st === "transmis" || st === "valide") done += 1;
  }
  const aDeposer = defs.filter((d) => pieceMoe(d) && !((pieces.get(d.key)?.nb_fichiers ?? 0) > 0 || pieces.get(d.key)?.statut === "non_applicable")).length;
  return { done, total, aDeposer };
}

export function DocumentsAProduireMoe({ c, presta }: { c: Tables<"coproprietes">; presta: Tables<"prestataires"> }) {
  const { data, isLoading, error } = useMontageMoe(c.id, presta.id);
  const [montage, setMontage] = useState<MontageId | null>(null);

  if (isLoading) return <div style={{ padding: 30, color: "var(--fg-muted)" }}>Chargement…</div>;
  if (error || !data)
    return (
      <p className="se-body" style={{ color: "var(--color-error-700)" }}>
        {messageErreur(error, "Impossible de charger les documents à produire.")}
      </p>
    );

  if (montage && PARCOURS[montage])
    return <ParcoursMoe c={c} presta={presta} montage={montage} data={data} onBack={() => setMontage(null)} />;

  return (
    <div className="fade">
      <p className="se-body" style={{ marginTop: 0, color: "var(--fg2)", maxWidth: 760 }}>
        Pour chaque dispositif de financement du projet, la banque et les financeurs attendent un dossier
        documentaire. <span className="moe-a-deposer-txt">Les pièces en orange</span> reviennent à la maîtrise
        d'œuvre : déposez-les ici, l'équipe Strat Eco et le syndic les retrouvent dans le dossier.
      </p>
      <div className="montage-grid">
        {MONTAGES.map((m) => {
          const parcours = PARCOURS[m.id];
          const pieces = new Map(data.docs.filter((d) => d.montage === m.id).map((d) => [d.doc_key, d]));
          const aDeposer = parcours
            ? parcours.etapes.reduce((s, e) => s + avancement(e, pieces, data.formulaires).aDeposer, 0)
            : 0;
          return (
            <button
              key={m.id}
              className={"montage-card" + (m.dispo ? "" : " off")}
              disabled={!m.dispo}
              onClick={() => m.dispo && setMontage(m.id)}
            >
              <span className="mc-ico">
                <Icon name={m.icon} size={22} />
              </span>
              <span className="mc-body">
                <span className="mc-name">{m.label}</span>
                <span className="mc-sub">{m.sub}</span>
              </span>
              {aDeposer > 0 && (
                <span className="moe-pastille" title={`${aDeposer} pièce${aDeposer > 1 ? "s" : ""} à déposer par vous`}>
                  {aDeposer} à déposer
                </span>
              )}
              <Icon name="chevronRight" size={18} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ParcoursMoe({
  c,
  presta,
  montage,
  data,
  onBack,
}: {
  c: Tables<"coproprietes">;
  presta: Tables<"prestataires">;
  montage: MontageId;
  data: MontageMoe;
  onBack: () => void;
}) {
  const parcours = PARCOURS[montage]!;
  const { profile } = useAuth();
  // aperçu AMO : on montre l'espace tel quel, mais seul un compte de l'entreprise dépose
  const apercu = profile?.role === "amo";
  const deposer = useDeposerMontageMoe(c.id);
  const retirer = useRetirerMontageMoe(c.id);
  const inputRef = useRef<HTMLInputElement>(null);
  const [cible, setCible] = useState<string | null>(null);
  const [depot, setDepot] = useState<{ docKey: string; file: File } | null>(null);
  const [apercuFichier, setApercuFichier] = useState<MontageFile | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [ouverte, setOuverte] = useState<string>(() => {
    // première étape où la MOE a une pièce à déposer, sinon la première
    const pieces = new Map(data.docs.filter((d) => d.montage === montage).map((d) => [d.doc_key, d]));
    return parcours.etapes.find((e) => avancement(e, pieces, data.formulaires).aDeposer > 0)?.id ?? parcours.etapes[0].id;
  });

  const pieces = useMemo(
    () => new Map(data.docs.filter((d) => d.montage === montage).map((d) => [d.doc_key, d])),
    [data.docs, montage]
  );
  const totaux = parcours.etapes.reduce(
    (acc, e) => {
      const p = avancement(e, pieces, data.formulaires);
      return { done: acc.done + p.done, total: acc.total + p.total, aDeposer: acc.aDeposer + p.aDeposer };
    },
    { done: 0, total: 0, aDeposer: 0 }
  );

  const choisir = (docKey: string) => {
    setCible(docKey);
    inputRef.current?.click();
  };
  const recevoir = (docKey: string, file: File | undefined) => {
    if (!file) return;
    if (!extensionOk(file.name)) {
      setErreur(`« ${file.name} » n'est pas accepté - formats attendus : PDF, image, Word ou Excel.`);
      return;
    }
    setErreur(null);
    setDepot({ docKey, file });
  };

  return (
    <div className="fade">
      <input
        ref={inputRef}
        type="file"
        accept={EXTENSIONS_OK.join(",")}
        style={{ display: "none" }}
        onChange={(e) => {
          if (cible) recevoir(cible, e.target.files?.[0]);
          setCible(null);
          e.target.value = "";
        }}
      />

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6, flexWrap: "wrap" }}>
        <button className="se-btn se-btn-ghost btn-sm" onClick={onBack}>
          <Icon name="chevronLeft" size={15} />
          Montages
        </button>
        <span style={{ flex: 1 }}></span>
        {totaux.aDeposer > 0 && <span className="moe-pastille">{totaux.aDeposer} à déposer par vous</span>}
        <span className="se-small" style={{ color: "var(--fg-muted)" }}>
          {totaux.done}/{totaux.total} éléments prêts
        </span>
        <div style={{ width: 130 }}>
          <Progress value={totaux.total ? (totaux.done / totaux.total) * 100 : 0} />
        </div>
      </div>

      <h2 style={{ fontFamily: "var(--font-display)", fontSize: 21, margin: "10px 0 4px" }}>{parcours.titre}</h2>
      {/* les textes d'introduction du catalogue s'adressent au syndic : la MOE a le sien */}
      <p className="se-small" style={{ margin: "0 0 18px", color: "var(--fg-muted)", maxWidth: 760 }}>
        Les pièces <span className="moe-a-deposer-txt">en orange</span> sont à déposer par vous (clic sur « Déposer »
        ou glissé-déposé sur la ligne) ; votre dépôt complète aussi la même pièce dans les autres dossiers. Les
        autres pièces sont fournies par le syndic ou l'équipe Strat Eco et affichées pour suivi.
      </p>

      {parcours.etapes.map((etape) => {
        const p = avancement(etape, pieces, data.formulaires);
        const complete = p.done >= p.total && p.total > 0;
        const open = ouverte === etape.id;
        return (
          <div className="panel" style={{ marginBottom: 16 }} key={etape.id}>
            <button className="mstep-head" onClick={() => setOuverte(open ? "" : etape.id)}>
              <span className={"mstep-num" + (complete ? " done" : "")}>
                {complete ? <Icon name="check" size={16} /> : etape.num}
              </span>
              <span className="mstep-label">{etape.label}</span>
              <span style={{ flex: 1 }}></span>
              {p.aDeposer > 0 && <span className="moe-pastille">{p.aDeposer} à déposer</span>}
              <Badge kind={complete ? "success" : "neutral"}>
                {p.done}/{p.total}
              </Badge>
              <Icon name={open ? "chevronDown" : "chevronRight"} size={17} />
            </button>
            {open && (
              <div className="p-body" style={{ borderTop: "1px solid var(--border)" }}>
                {(etape.formulaires ?? []).map((f) => {
                  const saved = data.formulaires.find((x) => x.type === f.type);
                  const transmis = saved?.statut === "transmis" || saved?.statut === "valide";
                  return (
                    <div key={f.type} className={"dropzone lecture" + (transmis ? " filled" : "")} style={{ marginBottom: 12 }}>
                      <span className="dz-ico">
                        <Icon name={transmis ? "check" : "edit"} size={18} />
                      </span>
                      <div>
                        <div className="dz-name">{f.name}</div>
                        <div className="dz-hint">
                          {saved
                            ? `${LIBELLE_FORMULAIRE[saved.statut] ?? saved.statut} - mis à jour le ${fmtDate(saved.updated_at)}`
                            : "Formulaire complété par le syndic avec l'équipe Strat Eco"}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {etape.groupes.map((g, gi) => (
                  <div key={gi} style={{ marginTop: g.titre ? 18 : 0 }}>
                    {g.titre && <div className="se-eyebrow" style={{ marginBottom: 4 }}>{g.titre}</div>}
                    {g.note && (
                      <p className="se-small" style={{ margin: "0 0 10px", color: "var(--fg-muted)" }}>
                        {g.note}
                      </p>
                    )}
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {g.docs.map((d) => (
                        <LignePiece
                          key={d.key + gi}
                          def={d}
                          piece={pieces.get(d.key)}
                          apercu={apercu}
                          envoi={deposer.isPending && depot?.docKey === d.key}
                          onChoisir={() => choisir(d.key)}
                          onDeposer={(file) => recevoir(d.key, file)}
                          onApercu={setApercuFichier}
                          onRetirer={(f) => {
                            if (window.confirm(`Retirer « ${f.name} » de ce dossier ?`))
                              retirer.mutate(f.path, { onError: (e) => setErreur(messageErreur(e, "Le retrait a échoué.")) });
                          }}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {erreur && <p className="se-small" style={{ color: "var(--color-error-700)" }}>{erreur}</p>}

      {apercuFichier && (
        <ApercuDocument
          name={apercuFichier.name}
          path={apercuFichier.path}
          onClose={() => setApercuFichier(null)}
          onTelecharger={() => void downloadMontageFile(apercuFichier)}
        />
      )}

      {depot && (
        <RenommageDialog
          files={[depot.file]}
          prefixe={c.name}
          typeInitial={parcours.etapes.flatMap(docsOfEtape).find((d) => d.key === depot.docKey)?.type}
          emetteurInitial={presta.raison_sociale}
          onConfirm={(file, meta) =>
            deposer.mutateAsync({ montage, docKey: depot.docKey, file, nameOriginal: meta.nameOriginal, type: meta.type })
          }
          ecoPtz={{ coproId: c.id }}
          onClose={() => setDepot(null)}
        />
      )}
    </div>
  );
}

function LignePiece({
  def,
  piece,
  apercu,
  envoi,
  onChoisir,
  onDeposer,
  onApercu,
  onRetirer,
}: {
  def: DocDef;
  piece: PieceMontageMoe | undefined;
  apercu: boolean;
  envoi: boolean;
  onChoisir: () => void;
  onDeposer: (file: File) => void;
  onApercu: (f: MontageFile) => void;
  onRetirer: (f: MontageFile) => void;
}) {
  const [survol, setSurvol] = useState(false);
  if (def.confidentiel) {
    return (
      <div className="mdoc na" title="Pièce réservée à l'équipe Strat Eco">
        <div className="mdoc-main">
          <span className="dz-ico">
            <Icon name="lock" size={18} />
          </span>
          <div style={{ minWidth: 0 }}>
            <div className="dz-name">{def.name}</div>
            <div className="mdoc-meta">
              <Badge kind="neutral">Gérée par Strat Eco</Badge>
            </div>
          </div>
        </div>
      </div>
    );
  }
  const aMoi = pieceMoe(def);
  const na = piece?.statut === "non_applicable";
  const fournie = (piece?.nb_fichiers ?? 0) > 0;
  const miens = piece?.fichiers ?? [];
  const autres = (piece?.nb_fichiers ?? 0) - miens.length;
  const deposable = aMoi && !na && !apercu && !envoi;

  const dragOver = (e: DragEvent) => {
    if (!deposable) return;
    e.preventDefault();
    setSurvol(true);
  };
  const drop = (e: DragEvent) => {
    if (!deposable) return;
    e.preventDefault();
    setSurvol(false);
    const f = e.dataTransfer.files?.[0];
    if (f) onDeposer(f);
  };

  return (
    <div
      className={
        "mdoc" + (fournie ? " filled" : "") + (na ? " na" : "") + (aMoi && !fournie && !na ? " moe-a-deposer" : "") + (survol ? " dragover" : "")
      }
      title={deposable ? "Glissez-déposez votre fichier sur cette ligne, ou cliquez sur « Déposer »" : undefined}
      onDragOver={dragOver}
      onDragLeave={() => setSurvol(false)}
      onDrop={drop}
    >
      <div className="mdoc-main moe-mdoc-main">
        <span className="dz-ico">
          <Icon name={fournie ? "check" : na ? "x" : "fileText"} size={18} />
        </span>
        <div style={{ minWidth: 0 }}>
          <div className="dz-name">{def.name}</div>
          {def.hint && <div className="dz-hint">{def.hint}</div>}
          <div className="mdoc-meta">
            {aMoi ? (
              <span className="moe-pastille">{FOURNISSEUR_MOE[def.fournisseur]}</span>
            ) : (
              <Badge kind="neutral">{FOURNISSEUR_MOE[def.fournisseur]}</Badge>
            )}
            {na ? (
              <Badge kind="neutral">Non concernée</Badge>
            ) : fournie ? (
              <Badge kind="success">
                <Icon name="check" size={11} />
                Fournie
              </Badge>
            ) : (
              <Badge kind="warn">À fournir</Badge>
            )}
            {def.modele && (
              <a className="mdoc-link" href={`/modeles/${def.modele}`} download>
                <Icon name="download" size={13} />
                Modèle
              </a>
            )}
          </div>
        </div>
        <span className="spacer"></span>
        {aMoi && !na && (
          <button
            className="se-btn se-btn-secondary btn-sm"
            disabled={!deposable}
            onClick={onChoisir}
            title={apercu ? "Aperçu AMO : le dépôt est réservé aux comptes de l'entreprise" : undefined}
          >
            <Icon name="upload" size={14} />
            {envoi ? "Envoi…" : fournie ? "Ajouter" : "Déposer"}
          </button>
        )}
      </div>

      {(miens.length > 0 || autres > 0) && (
        <div className="mdoc-files">
          {miens.map((f) => (
            <div key={f.path} className="mdoc-file">
              <Icon name="fileCheck" size={14} />
              <span className="fname">{f.name}</span>
              <Badge kind="warn">Vous</Badge>
              <span className="fmeta">{[fmtTaille(f.size), fmtDate(f.uploaded_at)].filter(Boolean).join(" · ")}</span>
              <button
                className="icon-btn"
                title={estVisualisable(f.name) ? "Aperçu sans téléchargement" : "Ce format ne s'affiche pas dans le navigateur"}
                onClick={() => onApercu(f)}
              >
                <Icon name="eye" size={15} />
              </button>
              <button className="icon-btn" title="Télécharger" onClick={() => void downloadMontageFile(f)}>
                <Icon name="download" size={15} />
              </button>
              {!apercu && (
                <button className="icon-btn" title="Retirer" onClick={() => onRetirer(f)}>
                  <Icon name="trash" size={15} />
                </button>
              )}
            </div>
          ))}
          {autres > 0 && (
            <div className="mdoc-file" style={{ color: "var(--fg-muted)" }}>
              <Icon name="fileText" size={14} />
              {autres} fichier{autres > 1 ? "s" : ""} déposé{autres > 1 ? "s" : ""} par l'équipe Strat Eco ou le syndic
            </div>
          )}
        </div>
      )}
    </div>
  );
}

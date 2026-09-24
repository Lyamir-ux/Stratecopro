// « Faire une demande d'AMO » - espace syndic (feedbacks Amir 22/09/2026 12:58).
//
// Le gestionnaire signale une copropriété sur laquelle il souhaite
// l'intervention de Strat Eco. Cinq informations, pas une de plus : nom,
// adresse, nombre de lots, mode de chauffage, présence d'une VMC. Deux entrées
// mènent ici : le bouton du bandeau (à côté de la bascule « Suivi des PPT ») et
// le bouton de la colonne « Futur projet » du portefeuille.
import { useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { useMonOrganisation } from "@/api/syndic";
import {
  CHAUFFAGES,
  EXTENSIONS_PIECES,
  TAILLE_MAX_PIECE,
  piecesDemande,
  telechargerPieceDemande,
  useDemandesAmo,
  useDeposerDemandeAmo,
} from "@/api/demandesAmo";
import { messageErreur } from "@/lib/erreurs";

function fmtTaille(bytes: number | null): string {
  if (bytes == null) return "";
  if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + " Ko";
  return (bytes / (1024 * 1024)).toLocaleString("fr-FR", { maximumFractionDigits: 1 }) + " Mo";
}

const champ = (label: string, input: React.ReactNode, aide?: string) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
    <label style={{ fontSize: 13, fontWeight: 600, color: "var(--fg2)" }}>{label}</label>
    {input}
    {aide && <span className="se-small" style={{ color: "var(--fg-muted)" }}>{aide}</span>}
  </div>
);

export function DemandeAmo({ syndicNom }: { syndicNom?: string }) {
  const navigate = useNavigate();
  const { data: monOrg } = useMonOrganisation();
  const { data: demandes } = useDemandesAmo();
  const deposer = useDeposerDemandeAmo();

  const [nom, setNom] = useState("");
  const [adresse, setAdresse] = useState("");
  const [nbLots, setNbLots] = useState("");
  const [chauffage, setChauffage] = useState("");
  const [vmc, setVmc] = useState<"" | "oui" | "non">("");
  const [fichiers, setFichiers] = useState<File[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoyee, setEnvoyee] = useState<string | null>(null);
  const [avertissement, setAvertissement] = useState<string | null>(null);
  const inputFichiers = useRef<HTMLInputElement>(null);

  const ajouterFichiers = (liste: FileList | null) => {
    const choisis = Array.from(liste ?? []);
    if (choisis.length === 0) return;
    const trop = choisis.filter((f) => f.size > TAILLE_MAX_PIECE).map((f) => f.name);
    setAvertissement(trop.length ? `Trop volumineux (20 Mo maximum) : ${trop.join(", ")}` : null);
    setFichiers((prev) => {
      const gardes = choisis.filter(
        (f) => f.size <= TAILLE_MAX_PIECE && !prev.some((p) => p.name === f.name && p.size === f.size)
      );
      return [...prev, ...gardes];
    });
  };

  const lots = nbLots.trim() === "" ? null : Number(nbLots.replace(/\s/g, ""));
  const valide =
    !deposer.isPending &&
    nom.trim().length > 1 &&
    adresse.trim().length > 3 &&
    (lots === null || (Number.isInteger(lots) && lots > 0));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valide) return;
    setErreur(null);
    try {
      const creee = await deposer.mutateAsync({
        demande: {
          copro_nom: nom,
          adresse,
          nb_lots: lots,
          chauffage: chauffage || null,
          vmc: vmc === "" ? null : vmc === "oui",
          fichiers,
        },
        organisationId: monOrg?.id ?? null,
        syndicName: monOrg?.nom ?? syndicNom ?? null,
      });
      const ratees = (creee as { _piecesRatees?: string[] })._piecesRatees;
      setAvertissement(
        ratees?.length
          ? `Demande envoyée, mais document(s) non déposé(s) : ${ratees.join(", ")}. Transmettez-les à l'équipe par un autre moyen.`
          : null
      );
      setEnvoyee(nom.trim());
      setNom("");
      setAdresse("");
      setNbLots("");
      setChauffage("");
      setVmc("");
      setFichiers([]);
    } catch (err) {
      setErreur(messageErreur(err, "L'envoi de la demande a échoué."));
    }
  };

  const mesDemandes = demandes ?? [];

  return (
    <div className="page fade" style={{ padding: 0 }}>
      <div className="page-head">
        <div>
          <h1 className="page-title">Faire une demande d'AMO</h1>
          <p className="page-sub">
            Signalez une copropriété sur laquelle vous souhaitez l'accompagnement de Strat Eco - l'équipe
            vous rappelle pour la suite
          </p>
        </div>
        <span style={{ flex: 1 }}></span>
        <button className="se-btn se-btn-ghost btn-sm" onClick={() => navigate("/syndic")}>
          <Icon name="chevronLeft" size={15} />
          Retour au portefeuille
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 520px) minmax(0, 1fr)", gap: 22, alignItems: "start" }}>
        <div className="panel">
          <div className="p-head">
            <Icon name="building" size={18} />
            <h3>La copropriété</h3>
          </div>
          <form className="p-body" onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {champ(
              "Nom de la copropriété *",
              <input
                className="login-input"
                required
                autoFocus
                value={nom}
                onChange={(e) => {
                  setNom(e.target.value);
                  setEnvoyee(null);
                }}
                placeholder="Résidence des Tilleuls"
              />
            )}
            {champ(
              "Adresse *",
              <input
                className="login-input"
                required
                value={adresse}
                onChange={(e) => setAdresse(e.target.value)}
                placeholder="12 rue des Tilleuls, 67000 Strasbourg"
              />
            )}
            {champ(
              "Nombre de lots",
              <input
                className="login-input"
                type="number"
                min={1}
                value={nbLots}
                onChange={(e) => setNbLots(e.target.value)}
                placeholder="48"
              />
            )}
            {champ(
              "Mode de chauffage",
              <select className="login-input" value={chauffage} onChange={(e) => setChauffage(e.target.value)}>
                <option value="">À préciser</option>
                {CHAUFFAGES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            )}
            {champ(
              "Présence d'une VMC",
              <div className="opt-mini">
                {([
                  { id: "oui", label: "Oui" },
                  { id: "non", label: "Non" },
                  { id: "", label: "Je ne sais pas" },
                ] as const).map((o) => (
                  <button
                    key={o.label}
                    type="button"
                    className={vmc === o.id ? "on" : ""}
                    onClick={() => setVmc(o.id)}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            )}

            {/* Pièces jointes (feedback Amir 22/09 14:26) : ce que le gestionnaire
                a déjà sous la main, pour qualifier la demande sans relance. */}
            {champ(
              "Documents (facultatif)",
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div>
                  <button
                    type="button"
                    className="se-btn se-btn-secondary btn-sm"
                    onClick={() => inputFichiers.current?.click()}
                  >
                    <Icon name="upload" size={14} />
                    Ajouter un document
                  </button>
                  <input
                    ref={inputFichiers}
                    type="file"
                    multiple
                    accept={EXTENSIONS_PIECES}
                    style={{ display: "none" }}
                    onChange={(e) => {
                      ajouterFichiers(e.target.files);
                      e.target.value = "";
                    }}
                  />
                </div>
                {fichiers.length > 0 && (
                  <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                    {fichiers.map((f) => (
                      <li
                        key={f.name + f.size}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          border: "1px solid var(--border)",
                          borderRadius: "var(--radius-md)",
                          padding: "7px 10px",
                          fontSize: 13,
                        }}
                      >
                        <Icon name="fileText" size={15} style={{ color: "var(--fg-muted)", flex: "none" }} />
                        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {f.name}
                        </span>
                        <span className="se-small" style={{ color: "var(--fg-muted)" }}>{fmtTaille(f.size)}</span>
                        <button
                          type="button"
                          className="icon-btn"
                          style={{ width: 24, height: 24 }}
                          title="Retirer ce document"
                          onClick={() => setFichiers((prev) => prev.filter((p) => p !== f))}
                        >
                          <Icon name="x" size={13} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <span className="se-small" style={{ color: "var(--fg-muted)" }}>
                  DPE collectif, audit énergétique, PPT, carnet d'entretien, PV d'AG… PDF, Word, Excel ou
                  photo, 20 Mo par document.
                </span>
              </div>
            )}

            {avertissement && (
              <p
                style={{
                  margin: 0,
                  padding: "10px 12px",
                  borderRadius: "var(--radius-md)",
                  background: "var(--bg-soft)",
                  border: "1px solid var(--border)",
                  fontSize: 13,
                }}
              >
                {avertissement}
              </p>
            )}
            {erreur && (
              <p
                style={{
                  margin: 0,
                  padding: "10px 12px",
                  borderRadius: "var(--radius-md)",
                  background: "var(--color-error-50)",
                  color: "var(--color-error-700)",
                  fontSize: 13,
                }}
              >
                {erreur}
              </p>
            )}
            {envoyee && !erreur && (
              <p
                style={{
                  margin: 0,
                  padding: "10px 12px",
                  borderRadius: "var(--radius-md)",
                  background: "var(--bg-soft)",
                  border: "1px solid var(--border)",
                  fontSize: 13,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <Icon name="check" size={14} style={{ flex: "none", color: "var(--color-primary-700)" }} />
                Demande envoyée pour {envoyee}. L'équipe Strat Eco la reçoit et revient vers vous.
              </p>
            )}

            <div>
              <button className="se-btn se-btn-primary" type="submit" disabled={!valide}>
                <Icon name="send" size={16} />
                {deposer.isPending ? "Envoi…" : "Envoyer la demande"}
              </button>
            </div>
          </form>
        </div>

        <div className="panel">
          <div className="p-head">
            <Icon name="clipboard" size={18} />
            <h3>Vos demandes</h3>
            <span style={{ flex: 1 }}></span>
            <span style={{ fontSize: 13, color: "var(--fg-muted)" }}>{mesDemandes.length}</span>
          </div>
          <div className="p-body">
            {mesDemandes.length === 0 ? (
              <p className="se-body" style={{ margin: 0, color: "var(--fg-muted)" }}>
                Aucune demande pour l'instant. Celles que vous envoyez restent listées ici, avec leur suivi
                par l'équipe Strat Eco.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {mesDemandes.map((d) => (
                  <div
                    key={d.id}
                    style={{
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-md)",
                      padding: "12px 14px",
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontWeight: 700, fontSize: 14 }}>{d.copro_nom}</span>
                      <span style={{ flex: 1 }}></span>
                      {d.statut === "nouvelle" ? (
                        <Badge kind="warn">À traiter</Badge>
                      ) : d.statut === "traitee" ? (
                        <Badge kind="success">Prise en charge</Badge>
                      ) : (
                        <Badge kind="neutral">Classée</Badge>
                      )}
                    </div>
                    <div className="se-small" style={{ color: "var(--fg-muted)" }}>
                      {[
                        d.adresse,
                        d.nb_lots ? `${d.nb_lots} lots` : null,
                        d.chauffage,
                        d.vmc == null ? null : d.vmc ? "avec VMC" : "sans VMC",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                    <div className="se-small" style={{ color: "var(--fg-muted)" }}>
                      Envoyée le {fmtDate(d.created_at)}
                    </div>
                    {piecesDemande(d).length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 2 }}>
                        {piecesDemande(d).map((p) => (
                          <button
                            key={p.path}
                            type="button"
                            className="se-btn se-btn-ghost btn-sm"
                            title={`Télécharger ${p.name}`}
                            onClick={() => void telechargerPieceDemande(p)}
                          >
                            <Icon name="fileText" size={13} />
                            {p.name}
                          </button>
                        ))}
                      </div>
                    )}
                    {d.commentaire_amo && (
                      <div className="se-small" style={{ marginTop: 4 }}>
                        <b>Réponse de Strat Eco :</b> {d.commentaire_amo}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

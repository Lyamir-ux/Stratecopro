// Choix des entreprises à alerter d'une consultation (idée d'Amir du
// 01/10/2026, page /consultations) : les entreprises référencées du métier
// demandé, à cocher. Seules les entreprises cochées sont alertées et voient la
// consultation dans leur espace (consultation restreinte, 0125).
// Ne peuvent pas être cochées : fiche suspendue, sans e-mail, « Ne pas
// consulter » (même règle que notifier-consultation). Une entreprise hors de
// ses départements peut l'être : le choix de l'équipe passe outre.
import { useMemo, useState } from "react";
import { Modal } from "@/components/Modal";
import { Badge } from "@/components/ui";
import { libelleMetier as libelleMetierBase } from "@/api/consultations";
import { usePrestataires } from "@/api/prestataires";
import { couvreDepartement, resumeDepartements } from "@/lib/departements";
import { filtrerEntreprises, motifNonAlertable } from "@/lib/prestataires";
import type { Tables } from "@/lib/database.types";

const libelleMetier = (t: string) => libelleMetierBase(t);
const metiers = (types: readonly string[]) => types.map(libelleMetier).join(" · ");
const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? "s" : ""}`;

export function ChoixPrestatairesDialog({
  type,
  departement,
  verrouilles = [],
  titre = "Choisir les prestataires à alerter",
  libelleValider,
  enCours,
  erreur,
  onValider,
  onClose,
}: {
  type: Tables<"consultations">["type"];
  /** Département de la copropriété, pour signaler les entreprises qui n'y interviennent pas. */
  departement: string | null;
  /** Entreprises déjà choisies (ajout à une consultation restreinte) : cochées, non modifiables. */
  verrouilles?: readonly string[];
  titre?: string;
  libelleValider: (n: number) => string;
  enCours: boolean;
  erreur?: string | null;
  onValider: (ids: string[]) => void;
  onClose: () => void;
}) {
  const { data: prestataires, isLoading, error } = usePrestataires();
  const [coches, setCoches] = useState<Set<string>>(() => new Set());
  const [recherche, setRecherche] = useState("");
  const verrou = useMemo(() => new Set(verrouilles), [verrouilles]);

  // entreprises du métier : celles qui peuvent être alertées d'abord, chacune par ordre alphabétique
  const duMetier = useMemo(() => {
    const liste = (prestataires ?? []).filter((p) => p.types.includes(type));
    return [...liste.filter((p) => !motifNonAlertable(p)), ...liste.filter((p) => motifNonAlertable(p))];
  }, [prestataires, type]);
  const visibles = filtrerEntreprises(duMetier, recherche, (p) => metiers(p.types));
  const cochables = visibles.filter((p) => !motifNonAlertable(p) && !verrou.has(p.id));
  const toutCoche = cochables.length > 0 && cochables.every((p) => coches.has(p.id));

  const basculer = (id: string) =>
    setCoches((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  // « Tout cocher » ne porte que sur les entreprises affichées (recherche en cours)
  const basculerTout = () =>
    setCoches((prev) => {
      const n = new Set(prev);
      for (const p of cochables) {
        if (toutCoche) n.delete(p.id);
        else n.add(p.id);
      }
      return n;
    });

  return (
    <Modal title={titre} onClose={enCours ? () => {} : onClose} width={680} closeOnBackdrop={coches.size === 0 && !enCours}>
      <p className="se-small" style={{ margin: "-6px 0 14px", color: "var(--fg2)" }}>
        Entreprises référencées « {libelleMetier(type)} » dans la Base prestataires. Seules les entreprises cochées
        reçoivent l'e-mail et voient la consultation dans leur espace prestataire.
      </p>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        <input
          className="edit-inp"
          type="search"
          placeholder="Rechercher (nom, contact, ville)"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          style={{ maxWidth: "none", flex: "1 1 220px" }}
        />
        <button className="se-btn se-btn-ghost btn-sm" disabled={cochables.length === 0 || enCours} onClick={basculerTout}>
          {toutCoche ? "Tout décocher" : "Tout cocher"}
        </button>
      </div>

      <div
        style={{
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-md)",
          // hauteur stable pendant la recherche
          minHeight: "min(30vh, 220px)",
          maxHeight: "min(52vh, 460px)",
          overflowY: "auto",
        }}
      >
        {isLoading && <div className="cs-cand-empty">Chargement des entreprises…</div>}
        {error && (
          <div className="cs-cand-empty" style={{ color: "var(--color-error-700)" }}>
            Impossible de charger la Base prestataires : {(error as Error).message}
          </div>
        )}
        {!isLoading && !error && duMetier.length === 0 && (
          <div className="cs-cand-empty">
            Aucune entreprise référencée « {libelleMetier(type)} » : ajoutez-en depuis la Base prestataires.
          </div>
        )}
        {duMetier.length > 0 && visibles.length === 0 && (
          <div className="cs-cand-empty">Aucune entreprise ne correspond à « {recherche.trim()} ».</div>
        )}
        {visibles.map((p) => {
          const motif = motifNonAlertable(p);
          const deja = verrou.has(p.id);
          const horsZone = !couvreDepartement(p.departements, departement);
          const coche = deja || coches.has(p.id);
          return (
            <label
              key={p.id}
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: "6px 12px",
                padding: "9px 12px",
                borderBottom: "1px solid var(--border)",
                cursor: motif || deja || enCours ? "default" : "pointer",
                opacity: motif ? 0.55 : 1,
                background: coche && !deja ? "var(--bg-soft)" : undefined,
              }}
            >
              <input
                type="checkbox"
                checked={coche}
                disabled={!!motif || deja || enCours}
                onChange={() => basculer(p.id)}
                style={{ accentColor: "var(--accent)", width: 16, height: 16, flex: "none" }}
              />
              {/* sur téléphone, les pastilles passent sous le nom */}
              <span style={{ flex: "1 1 200px", minWidth: 0 }}>
                <span style={{ display: "block", fontWeight: 600, fontSize: 13.5 }}>{p.raison_sociale}</span>
                <span style={{ display: "block", fontSize: 12.5, color: "var(--fg-muted)", overflowWrap: "anywhere" }}>
                  {[p.contact_nom, p.ville, p.email].filter(Boolean).join(" · ") || "Coordonnées à compléter"}
                </span>
              </span>
              <span style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end", marginLeft: "auto" }}>
                {deja && <Badge kind="success">Déjà choisie</Badge>}
                {motif && <Badge kind="neutral">{motif}</Badge>}
                {!motif && horsZone && (
                  <span title="L'entreprise n'a pas coché ce département dans Mon entreprise : votre choix passe outre">
                    <Badge kind="warn">Hors de ses départements ({resumeDepartements(p.departements)})</Badge>
                  </span>
                )}
              </span>
            </label>
          );
        })}
      </div>

      {erreur && (
        <p
          style={{
            margin: "14px 0 0",
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
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 16 }}>
        <span className="se-small" style={{ color: "var(--fg2)" }}>
          {coches.size === 0 ? "Aucune entreprise cochée" : `${pluriel(coches.size, "entreprise")} cochée${coches.size > 1 ? "s" : ""}`}
        </span>
        <span style={{ flex: 1 }}></span>
        <button className="se-btn se-btn-ghost" onClick={onClose} disabled={enCours}>
          Annuler
        </button>
        <button
          className="se-btn se-btn-primary"
          disabled={coches.size === 0 || enCours}
          onClick={() => onValider([...coches])}
        >
          {enCours ? "Envoi…" : coches.size === 0 ? "Cochez au moins une entreprise" : libelleValider(coches.size)}
        </button>
      </div>
    </Modal>
  );
}

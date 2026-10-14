// Mes projets - réservé aux MOE : dossiers où l'entreprise est le maître
// d'œuvre saisi par l'équipe Strat Eco (coproprietes.maitre_oeuvre), ou retenue
// sur une consultation MOE avec engagement confirmé.
// Idée d'Amir du 14/10/2026 : une MOE a souvent des dizaines de projets - tuiles
// compactes en grille (une colonne sur téléphone), recherche par nom de
// copropriété ou par rue, filtre de phase. Un clic ouvre la fiche du projet
// (ProjetMoe : onglets Projet, Données, Financement, Documents à produire,
// Fichiers, Suivi financier), où se déposent les documents de projet.
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "@/components/Icon";
import { Badge, PhaseBadge } from "@/components/ui";
import { messageErreur } from "@/lib/erreurs";
import { PHASES, type PhaseId } from "@/lib/referentiels";
import { filtrerProjetsMoe } from "@/lib/projetsMoe";
import { projetsEnCours, useMesProjetsMoe, useProjetDocs, type ProjetMoe } from "@/api/espacePrestataire";
import type { Tables } from "@/lib/database.types";

/** Frise d'avancement miniature : un segment par phase, plein jusqu'à la phase en cours. */
function MiniFrise({ phase }: { phase: string | null }) {
  const idx = PHASES.findIndex((p) => p.id === phase);
  return (
    <span className="mpt-frise" aria-label={idx >= 0 ? `Phase ${PHASES[idx].label}` : "Phase inconnue"}>
      {PHASES.map((p, i) => (
        <span key={p.id} className={i < idx ? "fait" : i === idx ? "encours" : ""} title={p.label}></span>
      ))}
    </span>
  );
}

function TuileProjet({ p, nbDocs, onOuvrir }: { p: ProjetMoe; nbDocs: number; onOuvrir: () => void }) {
  const lieu = [p.copro.adresse, [p.copro.code_postal, p.copro.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return (
    <button className="mpt-tuile" onClick={onOuvrir} title={`Ouvrir le projet ${p.copro.name}`}>
      <span className="mpt-haut">
        <span className="mpt-nom">{p.copro.name}</span>
        <Icon name="chevronRight" size={16} style={{ color: "var(--accent)", flex: "none" }} />
      </span>
      <span className="mpt-adr">
        <Icon name="mapPin" size={13} style={{ flex: "none" }} />
        <span>{lieu || "Adresse à compléter"}</span>
      </span>
      <span className="mpt-bas">
        {p.copro.phase && <PhaseBadge phase={p.copro.phase as PhaseId} />}
        <MiniFrise phase={p.copro.phase} />
        {p.copro.fragile && <Badge kind="warn">Fragile</Badge>}
        <span style={{ flex: 1 }}></span>
        {p.batiments.length > 1 && (
          <span className="mpt-info" title={`${p.batiments.length} bâtiments`}>
            <Icon name="building" size={12} />
            {p.batiments.length}
          </span>
        )}
        {nbDocs > 0 && (
          <span className="mpt-info" title={`${nbDocs} document${nbDocs > 1 ? "s" : ""} déposé${nbDocs > 1 ? "s" : ""}`}>
            <Icon name="fileText" size={12} />
            {nbDocs}
          </span>
        )}
      </span>
    </button>
  );
}

export function MesProjets({ presta }: { presta: Tables<"prestataires"> }) {
  const navigate = useNavigate();
  const { data: projets, error: erreurProjets, isLoading } = useMesProjetsMoe(true, presta.id);
  const { data: projetDocs } = useProjetDocs(presta.id);
  const [recherche, setRecherche] = useState("");
  const [phase, setPhase] = useState<PhaseId | null>(null);
  // une candidature retenue n'entre dans « Mes projets » qu'une fois
  // l'engagement confirmé (bouton « Je m'engage » de Mes candidatures) ; un
  // dossier où l'entreprise est le maître d'œuvre saisi y figure d'office
  const list = projetsEnCours(projets ?? []);
  const enAttente = (projets ?? []).filter((p) => p.candidature && !p.candidature.engagement_at).length;
  const visibles = filtrerProjetsMoe(list, recherche, phase);
  const docsParCopro = new Map<string, number>();
  for (const d of projetDocs ?? []) docsParCopro.set(d.copro_id, (docsParCopro.get(d.copro_id) ?? 0) + 1);
  const q = recherche.trim();

  return (
    <div className="page" style={{ padding: 0 }}>
      <div className="page-head">
        <div>
          <h1 className="page-title">Mes projets</h1>
          <p className="page-sub">
            Opérations dont vous êtes le maître d'œuvre - ouvrez un projet pour suivre son avancement, consulter
            ses données et son financement, et partager vos documents avec l'équipe Strat Eco
          </p>
        </div>
      </div>

      {enAttente > 0 && (
        <div
          className="panel"
          style={{ padding: "12px 16px", marginBottom: 16, display: "flex", alignItems: "center", gap: 10, borderLeft: "3px solid var(--color-primary-500)" }}
        >
          <Icon name="checkCircle" size={16} style={{ color: "var(--color-primary-700)", flex: "none" }} />
          <span style={{ fontSize: 13.5 }}>
            {enAttente} candidature{enAttente > 1 ? "s" : ""} retenue{enAttente > 1 ? "s" : ""} en attente de
            votre confirmation d'engagement - rendez-vous dans « Mes candidatures » pour valider le projet.
          </span>
        </div>
      )}

      {erreurProjets && (
        <div
          className="panel"
          style={{ padding: "12px 16px", marginBottom: 16, display: "flex", alignItems: "center", gap: 10, borderLeft: "3px solid var(--color-error-500)" }}
        >
          <Icon name="alert" size={16} style={{ color: "var(--color-error-500)", flex: "none" }} />
          <span style={{ fontSize: 13.5 }}>
            {messageErreur(erreurProjets, "Impossible de charger vos projets.")} Rechargez la page ; si
            l'erreur persiste, prévenez l'équipe Strat Eco.
          </span>
        </div>
      )}

      {isLoading && <p className="se-body" style={{ color: "var(--fg-muted)" }}>Chargement…</p>}

      {!isLoading && list.length === 0 && !erreurProjets && (
        <div className="placeholder-screen" style={{ minHeight: 320 }}>
          <div className="ps-ico"><Icon name="building" size={30} /></div>
          <h2>Aucun projet en cours</h2>
          <p>
            Les opérations dont vous êtes la maîtrise d'œuvre désignée apparaissent ici, ainsi que celles où
            votre candidature MOE est retenue et votre engagement confirmé.
          </p>
        </div>
      )}

      {list.length > 0 && (
        <>
          <div className="mpt-outils">
            <div className="search" style={{ margin: 0 }}>
              <Icon name="search" size={16} />
              <input
                placeholder="Rechercher une copropriété, une rue, une ville…"
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
                aria-label="Rechercher un projet par nom de copropriété ou par rue"
                // Entrée : ouvre le projet quand la recherche n'en laisse qu'un
                onKeyDown={(e) => {
                  if (e.key === "Enter" && visibles.length === 1) navigate(`/prestataire/projets/${visibles[0].copro.id}`);
                }}
              />
              {recherche && (
                <button className="icon-btn" style={{ width: 22, height: 22, flex: "none" }} title="Effacer la recherche" onClick={() => setRecherche("")}>
                  <Icon name="x" size={13} />
                </button>
              )}
            </div>
            <div className="seg" role="group" aria-label="Filtrer par phase">
              <button className={phase === null ? "on" : ""} onClick={() => setPhase(null)}>
                Tous
              </button>
              {PHASES.map((ph) => {
                const n = list.filter((p) => p.copro.phase === ph.id).length;
                return (
                  <button key={ph.id} className={phase === ph.id ? "on" : ""} onClick={() => setPhase(phase === ph.id ? null : ph.id)} disabled={n === 0}>
                    {ph.label} <span style={{ opacity: 0.7 }}>{n}</span>
                  </button>
                );
              })}
            </div>
            <span className="mpt-compte">
              {q || phase ? `${visibles.length} projet${visibles.length > 1 ? "s" : ""} sur ${list.length}` : `${list.length} projet${list.length > 1 ? "s" : ""}`}
            </span>
          </div>

          {visibles.length === 0 ? (
            <p className="se-body" style={{ color: "var(--fg-muted)" }}>
              Aucun projet ne correspond{q ? ` à « ${q} »` : ""}
              {phase ? ` en phase ${PHASES.find((ph) => ph.id === phase)?.label.toLowerCase()}` : ""}.
            </p>
          ) : (
            <div className="mpt-grille">
              {visibles.map((p) => (
                <TuileProjet
                  key={p.candidature?.id ?? p.copro.id}
                  p={p}
                  nbDocs={docsParCopro.get(p.copro.id) ?? 0}
                  onOuvrir={() => {
                    navigate(`/prestataire/projets/${p.copro.id}`);
                    document.querySelector(".portal-main")?.scrollTo?.(0, 0);
                  }}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

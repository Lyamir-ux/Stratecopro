// « Demandes des syndics » (espace AMO) - feedbacks Amir 22/09/2026 12:58.
//
// Les demandes déposées depuis l'espace syndic arrivent ici : cinq informations
// sur la copropriété, le gestionnaire qui la signale et son enseigne. L'équipe
// ouvre le dossier d'un clic (la fiche est pré-remplie avec ce que le syndic a
// saisi), marque la demande prise en charge ou la classe sans suite.
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { useCreateCopro } from "@/api/copros";
import { useDemandesAmo, useStatutDemandeAmo, type DemandeAmo } from "@/api/demandesAmo";

const STATUTS: { id: DemandeAmo["statut"]; label: string }[] = [
  { id: "nouvelle", label: "À traiter" },
  { id: "traitee", label: "Prises en charge" },
  { id: "classee", label: "Classées" },
];

function BadgeStatut({ statut }: { statut: DemandeAmo["statut"] }) {
  if (statut === "nouvelle") return <Badge kind="warn">À traiter</Badge>;
  if (statut === "traitee") return <Badge kind="success">Prise en charge</Badge>;
  return <Badge kind="neutral">Classée</Badge>;
}

/** Ville déduite de l'adresse saisie par le syndic (« 12 rue X, 67000 Ville »). */
function decouperAdresse(adresse: string): { adresse: string; code_postal: string; city: string } {
  const m = adresse.match(/(\d{5})\s+([^,]+)\s*$/);
  if (!m) return { adresse: adresse.trim(), code_postal: "", city: "" };
  return {
    adresse: adresse.slice(0, m.index).replace(/[,\s]+$/, "").trim(),
    code_postal: m[1],
    city: m[2].trim(),
  };
}

function Carte({ d }: { d: DemandeAmo }) {
  const navigate = useNavigate();
  const statut = useStatutDemandeAmo();
  const creer = useCreateCopro();
  const [commentaire, setCommentaire] = useState(d.commentaire_amo ?? "");
  const [erreur, setErreur] = useState<string | null>(null);

  const ouvrirDossier = async () => {
    setErreur(null);
    try {
      const parts = decouperAdresse(d.adresse);
      const copro = await creer.mutateAsync({
        name: d.copro_nom,
        city: parts.city,
        code_postal: parts.code_postal,
        adresse: parts.adresse,
        syndic_name: d.syndic_name ?? "",
        gestionnaire_nom: d.demandeur_nom,
        gestionnaire_email: d.demandeur_email ?? "",
        nb_logements: d.nb_lots,
        nb_batiments: 1,
        batiment_adresses: [],
        chef_projet: "",
        phase: "diagnostic",
        energy_before: null,
        fragile: false,
      });
      await statut.mutateAsync({
        id: d.id,
        statut: "traitee",
        commentaire: commentaire.trim() || null,
        coproId: copro.id,
      });
      navigate(`/copros/${copro.id}`);
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "La création du dossier a échoué.");
    }
  };

  const majStatut = async (s: DemandeAmo["statut"]) => {
    setErreur(null);
    try {
      await statut.mutateAsync({ id: d.id, statut: s, commentaire: commentaire.trim() || null });
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "La mise à jour a échoué.");
    }
  };

  const infos = [
    d.nb_lots ? `${d.nb_lots} lots` : null,
    d.chauffage,
    d.vmc == null ? "VMC non précisée" : d.vmc ? "avec VMC" : "sans VMC",
  ].filter(Boolean);

  return (
    <div className="panel">
      <div className="p-head" style={{ flexWrap: "wrap", gap: 8 }}>
        <Icon name="building" size={18} />
        <h3>{d.copro_nom}</h3>
        <BadgeStatut statut={d.statut} />
        <span style={{ flex: 1 }}></span>
        <span style={{ fontSize: 12.5, color: "var(--fg-muted)" }}>Reçue le {fmtDate(d.created_at)}</span>
      </div>
      <div className="p-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <Icon name="mapPin" size={15} style={{ color: "var(--fg-muted)" }} />
          <span style={{ fontSize: 13.5 }}>{d.adresse || "Adresse non précisée"}</span>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {infos.map((i) => (
            <Badge key={i as string} kind="neutral">{i}</Badge>
          ))}
        </div>
        <p className="se-small" style={{ margin: 0, color: "var(--fg-muted)" }}>
          Demandée par <b>{d.demandeur_nom || "un gestionnaire"}</b>
          {d.syndic_name ? ` · ${d.syndic_name}` : ""}
          {d.demandeur_email ? ` · ${d.demandeur_email}` : ""}
        </p>

        <label className="se-small" style={{ fontWeight: 700, color: "var(--fg2)" }}>
          Suite donnée (visible du gestionnaire)
          <textarea
            className="edit-inp"
            style={{ maxWidth: "none", width: "100%", minHeight: 62, marginTop: 6, fontFamily: "inherit", resize: "vertical" }}
            placeholder="Rendez-vous fixé, devis envoyé, hors périmètre…"
            value={commentaire}
            onChange={(e) => setCommentaire(e.target.value)}
          />
        </label>

        {erreur && (
          <p
            style={{
              margin: 0,
              padding: "8px 12px",
              borderRadius: "var(--radius-md)",
              background: "var(--color-error-50)",
              color: "var(--color-error-700)",
              fontSize: 13,
            }}
          >
            {erreur}
          </p>
        )}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {d.copro_id ? (
            <button className="se-btn se-btn-primary btn-sm" onClick={() => navigate(`/copros/${d.copro_id}`)}>
              <Icon name="arrowRight" size={15} />
              Ouvrir le dossier
            </button>
          ) : (
            <button
              className="se-btn se-btn-primary btn-sm"
              onClick={() => void ouvrirDossier()}
              disabled={creer.isPending || statut.isPending}
            >
              <Icon name="plus" size={15} />
              {creer.isPending ? "Création…" : "Créer le dossier"}
            </button>
          )}
          {d.statut !== "traitee" && (
            <button
              className="se-btn se-btn-secondary btn-sm"
              onClick={() => void majStatut("traitee")}
              disabled={statut.isPending}
            >
              <Icon name="check" size={15} />
              Prise en charge
            </button>
          )}
          {d.statut !== "classee" && (
            <button
              className="se-btn se-btn-ghost btn-sm"
              onClick={() => void majStatut("classee")}
              disabled={statut.isPending}
            >
              <Icon name="x" size={15} />
              Classer sans suite
            </button>
          )}
          {d.statut !== "nouvelle" && (
            <button
              className="se-btn se-btn-ghost btn-sm"
              onClick={() => void majStatut("nouvelle")}
              disabled={statut.isPending}
            >
              <Icon name="refresh" size={15} />
              Remettre à traiter
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function DemandesAmo() {
  const { data: demandes, isLoading } = useDemandesAmo();
  const [filtre, setFiltre] = useState<DemandeAmo["statut"]>("nouvelle");
  const liste = (demandes ?? []).filter((d) => d.statut === filtre);

  return (
    <div className="page fade">
      <div className="page-head">
        <div>
          <h1 className="page-title">Demandes des syndics</h1>
          <p className="page-sub">
            Copropriétés signalées par les gestionnaires depuis leur espace - nom, adresse, lots, chauffage
            et VMC
          </p>
        </div>
        <span style={{ flex: 1 }}></span>
        <div className="opt-mini">
          {STATUTS.map((s) => {
            const n = (demandes ?? []).filter((d) => d.statut === s.id).length;
            return (
              <button key={s.id} className={filtre === s.id ? "on" : ""} onClick={() => setFiltre(s.id)}>
                {s.label}
                {n > 0 && <Badge kind={s.id === "nouvelle" ? "warn" : "neutral"}>{n}</Badge>}
              </button>
            );
          })}
        </div>
      </div>

      {isLoading ? (
        <p className="se-body" style={{ color: "var(--fg-muted)" }}>Chargement…</p>
      ) : liste.length === 0 ? (
        <div className="placeholder-screen" style={{ minHeight: 300 }}>
          <div className="ps-ico"><Icon name="megaphone" size={30} /></div>
          <h2>Aucune demande {filtre === "nouvelle" ? "à traiter" : filtre === "traitee" ? "prise en charge" : "classée"}</h2>
          <p>
            Les gestionnaires déposent leurs demandes depuis l'espace syndic, bouton « Demande d'AMO » ou
            colonne « Futur projet » du portefeuille.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 860 }}>
          {liste.map((d) => (
            <Carte key={d.id} d={d} />
          ))}
        </div>
      )}
    </div>
  );
}

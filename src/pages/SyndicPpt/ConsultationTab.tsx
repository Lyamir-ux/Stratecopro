// Onglet « Consultation » de la fiche d'une copropriété PPT (0109, idée
// d'Amir 27/09/2026) : le syndic suit sa consultation PPPT + DPE collectif.
//   • en cours : date limite, bureaux d'études consultés, offres reçues - les
//     offres elles-mêmes restent invisibles (choix d'Amir : avec l'analyse) ;
//   • clôturée sans analyse : Strat Eco prépare l'analyse ;
//   • analyse publiée : avis de Strat Eco, comparatif, pièces des offres et
//     PDF à présenter en assemblée générale.
// Sans consultation : bouton pour en demander une (même fenêtre que la
// colonne « Sans PPPT » du tableau de bord).
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui";
import { useAuth } from "@/auth/AuthProvider";
import { useConsultationPpt, useSuiviConsultationsPpt } from "@/api/consultationPpt";
import { useOrganisationPpt, type PptCoproAvecStats } from "@/api/ppt";
import { comparerOffres, etapeConsultation, joursRestants, syntheseOffres } from "@/lib/ppt/analyseOffres";
import { fmtEuro } from "@/lib/format";
import { BoutonPdfAnalyse, TableauOffres } from "./AnalyseOffres";
import { ConsultationPppt } from "./ConsultationPppt";
import { fmtDateCourte } from "./commun";

export function ConsultationTab({ c }: { c: PptCoproAvecStats }) {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const apercuAmo = profile?.role === "amo";
  const { data: orgPpt } = useOrganisationPpt();
  const { data: suivis, isLoading } = useSuiviConsultationsPpt(c.id);
  const courant = suivis?.[0] ?? null;
  const etape = courant ? etapeConsultation(courant) : null;
  const { data: detail } = useConsultationPpt(etape === "analyse" ? courant!.consultation_id : null);
  const [demander, setDemander] = useState(false);

  const offres = useMemo(
    () => (detail ? comparerOffres(detail.offres, detail.consultation.analyse_candidature_id) : []),
    [detail]
  );
  const s = syntheseOffres(offres);

  if (isLoading) return <div className="panel" style={{ padding: 24, color: "var(--fg-muted)", fontSize: 13.5 }}>Chargement…</div>;

  const fenetre = demander && (
    <ConsultationPppt
      copro={c}
      demande={null}
      apercuAmo={apercuAmo}
      onOuvrirFiche={() => setDemander(false)}
      onVoirConsultation={() => setDemander(false)}
      onClose={() => setDemander(false)}
    />
  );

  if (!courant) {
    return (
      <div className="panel" style={{ padding: 28, textAlign: "center" }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>Aucune consultation pour cette copropriété</div>
        <p className="se-small" style={{ color: "var(--fg-muted)", maxWidth: 560, margin: "0 auto 14px", lineHeight: 1.55 }}>
          Demandez une consultation pour la réalisation du PPPT et du DPE collectif : elle part directement à des bureaux d'études référencés locaux. Vous retrouverez ici leurs offres et l'analyse de Strat Eco à présenter en assemblée générale.
        </p>
        <button className="se-btn se-btn-primary btn-sm" onClick={() => setDemander(true)}>
          <Icon name="send" size={14} />
          Demander une consultation PPPT + DPE collectif
        </button>
        {fenetre}
      </div>
    );
  }

  const jr = joursRestants(courant.date_limite);

  if (etape !== "analyse") {
    return (
      <>
        <div className="tiles tiles-4" style={{ marginBottom: 18 }}>
          <div className="tile">
            <div className="t-lbl">Consultation lancée</div>
            <div className="t-val">{fmtDateCourte(courant.published_at)}</div>
            <div className="t-foot">PPPT + DPE collectif</div>
          </div>
          <div className="tile">
            <div className="t-lbl">Réponses avant le</div>
            <div className="t-val">{courant.date_limite ? fmtDateCourte(courant.date_limite) : "-"}</div>
            <div className="t-foot">{etape === "cloturee" ? "réception des offres terminée" : jr == null ? "" : jr > 0 ? `encore ${jr} jour${jr > 1 ? "s" : ""}` : jr === 0 ? "dernier jour" : "date limite passée"}</div>
          </div>
          <div className="tile">
            <div className="t-lbl">Bureaux d'études consultés</div>
            <div className="t-val">{courant.bureaux_consultes}</div>
            <div className="t-foot">référencés auprès de Strat Eco</div>
          </div>
          <div className="tile">
            <div className="t-lbl">Offres reçues</div>
            <div className="t-val accent">{courant.offres_recues}</div>
            <div className="t-foot">visibles avec l'analyse</div>
          </div>
        </div>
        <div className="panel" style={{ padding: "16px 20px", display: "flex", gap: 12, alignItems: "flex-start" }}>
          <Icon name="clock" size={18} style={{ color: "var(--color-primary-700)", flex: "none", marginTop: 2 }} />
          <div style={{ fontSize: 13.5, lineHeight: 1.55 }}>
            {etape === "en_cours" ? (
              <>
                <b>Consultation en cours.</b> Les bureaux d'études déposent leurs offres sur la plateforme. Dès la fin de la consultation, Strat Eco compare les offres et publie ici son analyse, avec les offres et leurs pièces : vous serez prévenu par e-mail.
              </>
            ) : (
              <>
                <b>Réception des offres terminée.</b> Strat Eco prépare l'analyse des offres ; elle apparaîtra ici avec les offres et un PDF à présenter en assemblée générale. Vous serez prévenu par e-mail.
              </>
            )}
          </div>
        </div>
      </>
    );
  }

  const cs = detail?.consultation;
  return (
    <>
      <div className="tiles tiles-4" style={{ marginBottom: 18 }}>
        <div className="tile">
          <div className="t-lbl">Offres reçues</div>
          <div className="t-val">{s.nb}</div>
          <div className="t-foot">{courant.bureaux_consultes} bureau{courant.bureaux_consultes > 1 ? "x" : ""} d'études consulté{courant.bureaux_consultes > 1 ? "s" : ""}</div>
        </div>
        <div className="tile">
          <div className="t-lbl">Moins-disant</div>
          <div className="t-val">{s.minHt != null ? fmtEuro(s.minHt) : "-"}</div>
          <div className="t-foot">HT</div>
        </div>
        <div className="tile">
          <div className="t-lbl">Moyenne des offres</div>
          <div className="t-val">{s.moyenneHt != null ? fmtEuro(s.moyenneHt) : "-"}</div>
          <div className="t-foot">HT{s.delaiMinSemaines != null ? ` · délai le plus court : ${s.delaiMinSemaines} sem.` : ", offres chiffrées"}</div>
        </div>
        <div className="tile">
          <div className="t-lbl">Offre recommandée</div>
          <div className="t-val accent">{s.recommandee?.montantHt != null ? fmtEuro(s.recommandee.montantHt) : s.recommandee ? "non chiffrée" : "-"}</div>
          <div className="t-foot">
            {s.recommandee ? [s.recommandee.bureau, s.recommandee.delaiMaxSemaines != null ? `${s.recommandee.delaiMaxSemaines} sem.` : null].filter(Boolean).join(" · ") : "voir l'avis de Strat Eco"}
          </div>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 18 }}>
        <div className="p-head">
          <Icon name="clipboard" size={18} />
          <h3>Avis de Strat Eco</h3>
          <Badge kind="success">Publié le {fmtDateCourte(courant.analyse_publiee_le)}</Badge>
          <span style={{ flex: 1 }}></span>
          {cs && (
            <BoutonPdfAnalyse
              input={{
                copro: { nom: c.nom, adresse: c.adresse, code_postal: c.code_postal, commune: c.commune, nb_logements: c.nb_logements, nb_lots: c.nb_lots },
                nomEnseigne: orgPpt?.nom ?? null,
                mission: cs.mission,
                publieeLe: cs.published_at,
                dateLimite: cs.date_limite,
                bureauxConsultes: courant.bureaux_consultes,
                offres,
                avis: cs.analyse_avis ?? "",
              }}
            />
          )}
        </div>
        <div className="p-body" style={{ fontSize: 14, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{cs?.analyse_avis ?? "Chargement…"}</div>
      </div>

      <div className="panel">
        <div className="p-head">
          <Icon name="table" size={18} />
          <h3>Comparatif des offres</h3>
          <span style={{ flex: 1 }}></span>
          <button className="se-btn se-btn-ghost btn-sm" onClick={() => navigate(`/syndic/ppt/copros/${c.id}/ag`)} title="Saisir l'assemblée générale où les offres sont présentées">
            <Icon name="calendar" size={13} />
            Préparer l'AG
          </button>
        </div>
        <div className="p-body" style={{ paddingTop: 0 }}>
          <TableauOffres offres={offres} />
        </div>
      </div>
    </>
  );
}

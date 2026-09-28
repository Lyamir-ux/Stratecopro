// Bloc « Honoraires AMO » de l'onglet Projet (demande d'Amir 28/09/2026) :
// les 8 jalons de facturation du dossier, groupés par phase, avec leur montant
// HT et leur état, et le prochain jalon à facturer. Même lecture que la page
// Facturation (0111). Rien ne s'affiche tant que le dossier n'a pas
// d'honoraires importés.
import { Link } from "react-router-dom";
import { Icon } from "@/components/Icon";
import { useHonoraires } from "@/api/honoraires";
import { fmtEuro } from "@/lib/format";
import {
  GROUPES_JALONS,
  LIBELLE_ETAT_COURT,
  cocheSansMontant,
  joursDepuis,
  libelleAnciennete,
  libelleJalon,
  prochainJalon,
  sommesDossier,
} from "@/lib/facturation";
import { COULEUR_ETAT, JaugeHonoraires, dateCourte } from "@/components/HonorairesVisuels";
import type { CoproWithStats } from "@/api/copros";

export function HonorairesBloc({ c }: { c: CoproWithStats }) {
  const { data: honoraires } = useHonoraires();
  const d = honoraires?.get(c.id);
  if (!d) return null;
  const s = sommesDossier(d);
  if (s.contrat === 0) return null;
  const suivant = prochainJalon(d);

  return (
    <section className="panel fact-bloc fade">
      <div className="p-head">
        <Icon name="euro" size={16} />
        <h3>Honoraires AMO</h3>
        <span style={{ fontSize: 12.5, color: "var(--fg-muted)" }}>
          Dernière facture le {dateCourte(d.derniereFacture)} ({libelleAnciennete(joursDepuis(d.derniereFacture))})
        </span>
        <span style={{ flex: 1 }}></span>
        <Link to="/facturation" className="fact-lien">Voir la facturation</Link>
      </div>
      <div className="p-body">
        <div className="fact-bloc-sommes">
          <div><b>{fmtEuro(s.contrat)}</b>Contrat HT</div>
          <div><b style={{ color: "var(--color-primary-700)" }}>{fmtEuro(s.encaisse)}</b>Encaissé</div>
          <div><b style={{ color: "var(--color-warning-700)" }}>{fmtEuro(s.enAttente)}</b>En attente de paiement</div>
          <div><b>{fmtEuro(s.resteAFacturer)}</b>Reste à facturer</div>
        </div>
        <div style={{ marginTop: 14 }}>
          <JaugeHonoraires s={s} hauteur={10} />
        </div>
        <div className="fact-etapes">
          {GROUPES_JALONS.map((g) => (
            <div key={g.id}>
              <div className="fe-groupe">{g.label}</div>
              <div className="fe-ligne">
                {g.codes.map((code) => {
                  const j = d.jalons.find((x) => x.code === code)!;
                  const sansMontant = j.montant == null || j.montant <= 0;
                  return (
                    <div
                      key={code}
                      className={"fact-etape " + (sansMontant ? "vide" : j.etat) + (suivant?.code === code ? " suivant" : "")}
                      title={sansMontant && cocheSansMontant(j) ? "Coché dans Notion, sans montant au contrat" : undefined}
                    >
                      <div className="fe-code">{libelleJalon(code)}</div>
                      <div className="fe-montant">{sansMontant ? "-" : fmtEuro(j.montant)}</div>
                      <div className="fe-etat">
                        <i style={sansMontant ? undefined : { background: COULEUR_ETAT[j.etat] }}></i>
                        {sansMontant ? "Sans montant" : LIBELLE_ETAT_COURT[j.etat]}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        {suivant && (
          <p className="fact-note" style={{ marginTop: 14 }}>
            Prochain jalon à facturer : <b>{libelleJalon(suivant.code)}</b> - {fmtEuro(suivant.montant)} HT (cadre pointillé).
          </p>
        )}
      </div>
    </section>
  );
}

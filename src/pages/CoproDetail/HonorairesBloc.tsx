// Bloc « Honoraires AMO » de l'onglet Projet (demande d'Amir 28/09/2026) :
// les 8 jalons de facturation du dossier, groupés par phase, avec leur montant
// HT et leur état, et le prochain jalon à facturer. Même lecture que la page
// Facturation (0111).
// Idée d'Amir 28/09/2026 (15:50, 0112) : deux boutons de saisie.
//   - « Revaloriser la P2 » : honoraires HT de la phase travaux, répartis
//     50 % P2a, 30 % P2b, 20 % P2c ;
//   - « Honoraires CEE » : volume en kWh cumac, FCEE 1 = FCEE 2 =
//     kWh cumac / 1 000 000 × 250 € HT.
// Le calcul qui fait foi est côté serveur ; la fenêtre en montre l'aperçu.
// Retour d'Amir 28/09/2026 (16:04, 0113) : « Annuler » rétablit les montants
// d'avant la dernière revalorisation de la P2 ou la dernière saisie CEE.
// Demande d'Amir 28/09/2026 (0114) : une fois la P2 revalorisée, un bouton
// sous « Revaloriser la P2 » télécharge le nouveau devis (contrat AMO du skill
// devis-amo, P1 + P2) en PDF.
// Facturation directe (0115, demande d'Amir du 28/09/2026) : chaque jalon
// avec un montant se clique - « Facturer » demande une confirmation puis
// ouvre le brouillon, un jalon facturé ouvre sa facture (ou le paiement pour
// le dirigeant).
// Idée d'Amir du 01/10/2026 (0121) : les honoraires de la phase études se
// saisissent à la création du dossier ; « Saisir la P1 » les corrige ensuite
// (50 % P1a, 25 % P1b, 25 % P1c), tracés et annulables comme la P2.
import { useState, type FormEvent } from "react";
import { FacturationJalon } from "@/components/FactureFenetres";
import { useFactures } from "@/api/factures";
import { piecesDuJalon } from "@/lib/factureDoc";
import { Link } from "react-router-dom";
import { Icon } from "@/components/Icon";
import { Modal } from "@/components/Modal";
import {
  chargerChefProjetDevis,
  useAnnulerSaisie,
  useHonoraires,
  useRevaloriserP2,
  useSaisiesHonoraires,
  useSaisirCee,
  useSaisirP1,
  type SaisieHonoraires,
} from "@/api/honoraires";
import { useTeamProfiles } from "@/api/profiles";
import { messageErreur } from "@/lib/erreurs";
import { fmtEuro, fmtEuroFull } from "@/lib/format";
import {
  EUROS_HT_PAR_GWH_CUMAC,
  GROUPES_JALONS,
  LIBELLE_ETAT,
  LIBELLE_ETAT_COURT,
  PARTS_P1,
  PARTS_P2,
  cocheSansMontant,
  honorairesCee,
  jalonsOrdonnes,
  joursDepuis,
  libelleAnciennete,
  libelleJalon,
  prochainJalon,
  repartitionP1,
  repartitionP2,
  sommesDossier,
  type CodeJalon,
  type DossierHonoraires,
  type JalonHonoraires,
} from "@/lib/facturation";
import { COULEUR_ETAT, JaugeHonoraires, dateCourte } from "@/components/HonorairesVisuels";
import { nbLogements, type CoproWithStats } from "@/api/copros";

/** « 12 345,67 » → 12345.67 ; null si la saisie n'est pas un nombre. */
function lireNombre(saisie: string): number | null {
  const s = saisie.replace(/[\s  ]/g, "").replace(",", ".");
  if (!s || !/^\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
}

const ecrireNombre = (v: number | null, decimales: number) =>
  v == null ? "" : v.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: decimales });

const jalon = (d: DossierHonoraires, code: CodeJalon) => d.jalons.find((j) => j.code === code)!;

export function HonorairesBloc({ c }: { c: CoproWithStats }) {
  const { data: honoraires, isLoading } = useHonoraires();
  const { data: saisies } = useSaisiesHonoraires(c.id);
  const { data: equipe } = useTeamProfiles();
  const { data: pieces } = useFactures();
  const [fenetre, setFenetre] = useState<"p1" | "p2" | "cee" | "annuler-p1" | "annuler-p2" | "annuler-cee" | null>(null);
  const [jalonActif, setJalonActif] = useState<JalonHonoraires | null>(null);
  if (isLoading) return null;

  const d: DossierHonoraires = honoraires?.get(c.id) ?? { coproId: c.id, jalons: jalonsOrdonnes([]), derniereFacture: null, source: null };
  const s = sommesDossier(d);
  const vide = s.contrat === 0;
  const suivant = prochainJalon(d);
  const nom = (uid: string | null) => (uid && equipe?.find((p) => p.user_id === uid)?.full_name) || "l'équipe";
  const sa = d.saisies;
  // dernière saisie active de chaque type : c'est elle que « Annuler » défait
  const derniereP1 = saisies?.find((x) => x.type === "p1") ?? null;
  const derniereP2 = saisies?.find((x) => x.type === "p2") ?? null;
  const derniereCee = saisies?.find((x) => x.type === "cee") ?? null;

  return (
    <section className="panel fact-bloc fade">
      <div className="p-head">
        <Icon name="euro" size={16} />
        <h3>Honoraires AMO</h3>
        {d.derniereFacture && (
          <span style={{ fontSize: 12.5, color: "var(--fg-muted)" }}>
            Dernière facture le {dateCourte(d.derniereFacture)} ({libelleAnciennete(joursDepuis(d.derniereFacture))})
          </span>
        )}
        <span style={{ flex: 1 }}></span>
        <button className="se-btn se-btn-secondary btn-sm" onClick={() => setFenetre("p1")}>
          <Icon name="edit" size={14} /> Saisir la P1
        </button>
        <div className="fact-revalo">
          <button className="se-btn se-btn-secondary btn-sm" onClick={() => setFenetre("p2")}>
            <Icon name="edit" size={14} /> Revaloriser la P2
          </button>
          {sa?.p2SaisiLe && sa.p2MontantHt != null && (
            <BoutonDevisRevalorise
              c={c}
              d={d}
              p2Ht={sa.p2MontantHt}
              revaloriseLe={sa.p2SaisiLe}
              nbRevalorisations={saisies?.filter((x) => x.type === "p2").length ?? 0}
            />
          )}
        </div>
        <button className="se-btn se-btn-secondary btn-sm" onClick={() => setFenetre("cee")}>
          <Icon name="zap" size={14} /> Honoraires CEE
        </button>
        <Link to="/facturation" className="fact-lien">Voir la facturation</Link>
      </div>
      <div className="p-body">
        {vide ? (
          <p className="se-small" style={{ margin: 0 }}>
            Aucun honoraire n'est encore saisi pour ce dossier. « Saisir la P1 », « Revaloriser la P2 » et « Honoraires CEE »
            calculent les jalons de la phase études, de la phase travaux et de la prime CEE.
          </p>
        ) : (
          <>
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
                      const j = jalon(d, code);
                      const sansMontant = j.montant == null || j.montant <= 0;
                      const cls = "fact-etape " + (sansMontant ? "vide" : j.etat) + (suivant?.code === code ? " suivant" : "");
                      const contenu = (
                        <>
                          <div className="fe-code">{libelleJalon(code)}</div>
                          <div className="fe-montant">{sansMontant ? "-" : fmtEuro(j.montant)}</div>
                          <div className="fe-etat">
                            <i style={sansMontant ? undefined : { background: COULEUR_ETAT[j.etat] }}></i>
                            {sansMontant ? "Sans montant" : LIBELLE_ETAT_COURT[j.etat]}
                          </div>
                        </>
                      );
                      if (sansMontant) {
                        return (
                          <div key={code} className={cls} title={cocheSansMontant(j) ? "Coché dans Notion, sans montant au contrat" : undefined}>
                            {contenu}
                          </div>
                        );
                      }
                      const { brouillon, facture } = piecesDuJalon(pieces ?? [], c.id, code);
                      const action =
                        j.etat === "a_facturer"
                          ? brouillon ? "Brouillon à valider" : "Facturer"
                          : facture?.numero ?? "Facturé hors logiciel";
                      return (
                        <button
                          key={code}
                          type="button"
                          className={cls + (brouillon && j.etat === "a_facturer" ? " brouillon" : "")}
                          onClick={() => setJalonActif(j)}
                          title={
                            j.etat === "a_facturer"
                              ? brouillon ? "Ouvrir le brouillon de facture" : "Préparer la facture de ce jalon"
                              : "Voir la facture de ce jalon"
                          }
                        >
                          {contenu}
                          <div className={"fe-action" + (j.etat === "a_facturer" && !brouillon ? " facturer" : "")}>
                            {j.etat === "a_facturer" && !brouillon && <Icon name="fileText" size={12} />} {action}
                          </div>
                        </button>
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
          </>
        )}
        {sa && (sa.p1SaisiLe || sa.p2SaisiLe || sa.ceeSaisiLe) && (
          <div className="fact-saisies">
            {sa.p1SaisiLe && (
              <div className="fs-ligne">
                <span>
                  P1 saisie le {dateCourte(sa.p1SaisiLe.slice(0, 10))} par {nom(sa.p1SaisiPar)} sur {fmtEuroFull(sa.p1MontantHt)} HT.
                </span>
                {derniereP1 && (
                  <button className="se-btn se-btn-ghost btn-sm" onClick={() => setFenetre("annuler-p1")} title="Annuler la dernière saisie de la P1">
                    <Icon name="undo" size={14} /> Annuler
                  </button>
                )}
              </div>
            )}
            {sa.p2SaisiLe && (
              <div className="fs-ligne">
                <span>
                  P2 revalorisée le {dateCourte(sa.p2SaisiLe.slice(0, 10))} par {nom(sa.p2SaisiPar)} sur {fmtEuroFull(sa.p2MontantHt)} HT.
                </span>
                {derniereP2 && (
                  <button className="se-btn se-btn-ghost btn-sm" onClick={() => setFenetre("annuler-p2")} title="Annuler la dernière revalorisation de la P2">
                    <Icon name="undo" size={14} /> Annuler
                  </button>
                )}
              </div>
            )}
            {sa.ceeSaisiLe && (
              <div className="fs-ligne">
                <span>
                  CEE : {ecrireNombre(sa.ceeKwhc, 0)} kWh cumac saisis le {dateCourte(sa.ceeSaisiLe.slice(0, 10))} par {nom(sa.ceeSaisiPar)}.
                </span>
                {derniereCee && (
                  <button className="se-btn se-btn-ghost btn-sm" onClick={() => setFenetre("annuler-cee")} title="Annuler la dernière saisie des honoraires CEE">
                    <Icon name="undo" size={14} /> Annuler
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      {jalonActif && (
        <FacturationJalon
          copro={{ id: c.id, name: c.name }}
          jalon={d.jalons.find((x) => x.code === jalonActif.code) ?? jalonActif}
          onClose={() => setJalonActif(null)}
        />
      )}
      {fenetre === "p1" && <FenetrePhase phase="p1" d={d} onClose={() => setFenetre(null)} />}
      {fenetre === "p2" && <FenetrePhase phase="p2" d={d} onClose={() => setFenetre(null)} />}
      {fenetre === "cee" && <FenetreCee d={d} onClose={() => setFenetre(null)} />}
      {fenetre === "annuler-p1" && derniereP1 && (
        <FenetreAnnulation d={d} s={derniereP1} auteur={nom(derniereP1.saisiPar)} onClose={() => setFenetre(null)} />
      )}
      {fenetre === "annuler-p2" && derniereP2 && (
        <FenetreAnnulation d={d} s={derniereP2} auteur={nom(derniereP2.saisiPar)} onClose={() => setFenetre(null)} />
      )}
      {fenetre === "annuler-cee" && derniereCee && (
        <FenetreAnnulation d={d} s={derniereCee} auteur={nom(derniereCee.saisiPar)} onClose={() => setFenetre(null)} />
      )}
    </section>
  );
}

/** Devis revalorisé : les 10 questions du skill devis-amo remplies depuis le dossier, PDF généré côté client. */
function BoutonDevisRevalorise({
  c,
  d,
  p2Ht,
  revaloriseLe,
  nbRevalorisations,
}: {
  c: CoproWithStats;
  d: DossierHonoraires;
  p2Ht: number;
  revaloriseLe: string;
  nbRevalorisations: number;
}) {
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const generer = async () => {
    setBusy(true);
    setErreur(null);
    try {
      const [{ entreeDevisRevalorise, genererDevisAmoPdf, nomFichierDevis }, { telechargerPdfBytes }, chef] = await Promise.all([
        import("@/lib/pdf/devisAmo"),
        import("@/lib/pdf/planIndividuel"),
        chargerChefProjetDevis(c.id),
      ]);
      // P1a, P1b, P1c : montants et état (déjà facturés = encadré sur le devis)
      const jalonsP1 = (["P1a", "P1b", "P1c"] as const).map((code) => jalon(d, code));
      const input = entreeDevisRevalorise({ copro: c, nbLots: nbLogements(c), jalonsP1, p2Ht, revaloriseLe, nbRevalorisations, chef });
      telechargerPdfBytes(await genererDevisAmoPdf(input), nomFichierDevis(c.name, input.refContrat));
    } catch (e) {
      setErreur(messageErreur(e, "La génération du devis a échoué."));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button
        className="se-btn se-btn-ghost btn-sm"
        onClick={() => void generer()}
        disabled={busy}
        title="Contrat AMO revalorisé (phases études et travaux), au format PDF"
      >
        <Icon name="download" size={14} /> {busy ? "PDF en cours…" : "Devis revalorisé (PDF)"}
      </button>
      {erreur && <span className="fact-erreur">{erreur}</span>}
    </>
  );
}

/** Aperçu jalon par jalon : montant actuel → nouveau montant, avec l'état du jalon. */
function Apercu({ lignes }: { lignes: { j: JalonHonoraires; part: string; nouveau: number | null }[] }) {
  return (
    <table className="fact-apercu">
      <thead>
        <tr>
          <th>Jalon</th>
          <th>Part</th>
          <th className="r">Actuel</th>
          <th className="r">Nouveau</th>
          <th>État</th>
        </tr>
      </thead>
      <tbody>
        {lignes.map(({ j, part, nouveau }) => (
          <tr key={j.code}>
            <td className="c">{libelleJalon(j.code)}</td>
            <td>{part}</td>
            <td className="r">{j.montant ? fmtEuroFull(j.montant) : "-"}</td>
            <td className="r fort">{nouveau == null ? "-" : fmtEuroFull(nouveau)}</td>
            <td>{j.montant ? LIBELLE_ETAT[j.etat] : "Sans montant"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Jalons déjà facturés ou encaissés dont le montant changerait. */
function alerteDejaFactures(lignes: { j: JalonHonoraires; nouveau: number | null }[]) {
  const touches = lignes.filter(({ j, nouveau }) => j.etat !== "a_facturer" && nouveau != null && (j.montant ?? 0) !== nouveau);
  if (touches.length === 0) return null;
  return (
    <p className="fact-alerte">
      <Icon name="alert" size={14} />
      {touches.map(({ j }) => libelleJalon(j.code)).join(", ")} {touches.length > 1 ? "sont déjà facturés" : "est déjà facturé"} :
      le montant change aussi, sans toucher à son état.
    </p>
  );
}

/** Saisie d'une phase du contrat : la P1 (études) ou la revalorisation de la P2 (travaux). */
const PHASES_SAISIE = {
  p1: {
    codes: ["P1a", "P1b", "P1c"],
    parts: PARTS_P1,
    repartir: repartitionP1,
    titre: "Honoraires de la phase études",
    libelle: "Honoraires de la phase études (€ HT)",
    hint: "Répartis 50 % en P1a, 25 % en P1b et 25 % en P1c.",
    exemple: "Par exemple 9 000",
    echec: "La saisie de la P1 n'a pas pu être enregistrée.",
  },
  p2: {
    codes: ["P2a", "P2b", "P2c"],
    parts: PARTS_P2,
    repartir: repartitionP2,
    titre: "Revaloriser la phase travaux",
    libelle: "Honoraires de la phase travaux (€ HT)",
    hint: "Répartis 50 % en P2a, 30 % en P2b et 20 % en P2c.",
    exemple: "Par exemple 15 000",
    echec: "La revalorisation n'a pas pu être enregistrée.",
  },
} as const;

function FenetrePhase({ phase, d, onClose }: { phase: "p1" | "p2"; d: DossierHonoraires; onClose: () => void }) {
  const saisirP1 = useSaisirP1();
  const revaloriser = useRevaloriserP2();
  const enregistrer = phase === "p1" ? saisirP1 : revaloriser;
  const cfg = PHASES_SAISIE[phase];
  const codes = cfg.codes as readonly CodeJalon[];
  const actuel = codes.reduce((x, code) => x + (jalon(d, code).montant ?? 0), 0);
  const base = phase === "p1" ? d.saisies?.p1MontantHt : d.saisies?.p2MontantHt;
  const [saisie, setSaisie] = useState(() => ecrireNombre(base ?? (actuel > 0 ? actuel : null), 2));
  const [erreur, setErreur] = useState<string | null>(null);
  const montant = lireNombre(saisie);
  const rep: Record<string, number> | null = montant != null && montant > 0 ? cfg.repartir(montant) : null;
  const lignes = codes.map((code) => ({
    j: jalon(d, code),
    part: `${Math.round((cfg.parts as Record<string, number>)[code] * 100)} %`,
    nouveau: rep ? rep[code] : null,
  }));

  const valider = async (e: FormEvent) => {
    e.preventDefault();
    if (!rep || montant == null) return;
    setErreur(null);
    try {
      await enregistrer.mutateAsync({ coproId: d.coproId, montantHt: montant });
      onClose();
    } catch (err) {
      setErreur(messageErreur(err, cfg.echec));
    }
  };

  return (
    <Modal title={cfg.titre} onClose={onClose} width={560} closeOnBackdrop={false}>
      <form onSubmit={valider}>
        <div className="fld">
          <label htmlFor={`fact-${phase}-montant`}>{cfg.libelle}</label>
          <input
            id={`fact-${phase}-montant`}
            inputMode="decimal"
            autoFocus
            value={saisie}
            onChange={(e) => setSaisie(e.target.value)}
            placeholder={cfg.exemple}
          />
          <span className="hint">{cfg.hint}</span>
        </div>
        {saisie.trim() && montant == null && <p className="fact-erreur">Saisissez un montant en euros, par exemple 15 000 ou 12 345,67.</p>}
        <Apercu lignes={lignes} />
        {alerteDejaFactures(lignes)}
        {erreur && <p className="fact-erreur">{erreur}</p>}
        <div className="fact-modal-actions">
          <button type="button" className="se-btn se-btn-ghost btn-sm" onClick={onClose}>Annuler</button>
          <button type="submit" className="se-btn se-btn-primary btn-sm" disabled={!rep || enregistrer.isPending}>
            {enregistrer.isPending ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function FenetreCee({ d, onClose }: { d: DossierHonoraires; onClose: () => void }) {
  const saisir = useSaisirCee();
  const [saisie, setSaisie] = useState(() => ecrireNombre(d.saisies?.ceeKwhc ?? null, 0));
  const [erreur, setErreur] = useState<string | null>(null);
  const kwhc = lireNombre(saisie);
  const m = kwhc != null && kwhc > 0 ? honorairesCee(kwhc) : null;
  const lignes = (["FCEE1", "FCEE2"] as const).map((code) => ({
    j: jalon(d, code),
    part: `${EUROS_HT_PAR_GWH_CUMAC} € / GWhc`,
    nouveau: m,
  }));

  const valider = async (e: FormEvent) => {
    e.preventDefault();
    if (m == null || kwhc == null) return;
    setErreur(null);
    try {
      await saisir.mutateAsync({ coproId: d.coproId, kwhc });
      onClose();
    } catch (err) {
      setErreur(messageErreur(err, "Les honoraires CEE n'ont pas pu être enregistrés."));
    }
  };

  return (
    <Modal title="Honoraires sur la prime CEE" onClose={onClose} width={560} closeOnBackdrop={false}>
      <form onSubmit={valider}>
        <div className="fld">
          <label htmlFor="fact-cee-kwhc">Volume de CEE (kWh cumac)</label>
          <input
            id="fact-cee-kwhc"
            inputMode="numeric"
            autoFocus
            value={saisie}
            onChange={(e) => setSaisie(e.target.value)}
            placeholder="Par exemple 20 061 000"
          />
          <span className="hint">
            FCEE 1 et FCEE 2 : kWh cumac ÷ 1 000 000 × {EUROS_HT_PAR_GWH_CUMAC} € HT chacun
            {kwhc != null && kwhc > 0 && ` - soit ${ecrireNombre(kwhc / 1_000_000, 3)} GWh cumac`}.
          </span>
        </div>
        {saisie.trim() && kwhc == null && <p className="fact-erreur">Saisissez un nombre de kWh cumac, par exemple 20 061 000.</p>}
        <Apercu lignes={lignes} />
        {m != null && <p className="fact-note" style={{ marginTop: 8 }}>Total des honoraires CEE : <b>{fmtEuroFull(m * 2)} HT</b>.</p>}
        {alerteDejaFactures(lignes)}
        {erreur && <p className="fact-erreur">{erreur}</p>}
        <div className="fact-modal-actions">
          <button type="button" className="se-btn se-btn-ghost btn-sm" onClick={onClose}>Annuler</button>
          <button type="submit" className="se-btn se-btn-primary btn-sm" disabled={m == null || saisir.isPending}>
            {saisir.isPending ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Confirmation avant d'annuler la dernière saisie : montants actuels → montants rétablis. */
function FenetreAnnulation({ d, s, auteur, onClose }: { d: DossierHonoraires; s: SaisieHonoraires; auteur: string; onClose: () => void }) {
  const annuler = useAnnulerSaisie();
  const [erreur, setErreur] = useState<string | null>(null);
  const p2 = s.type === "p2";
  const p1 = s.type === "p1";
  const codes = Object.keys(s.avant).sort() as CodeJalon[];
  const retabli = (code: string) => {
    const a = s.avant[code];
    if (!a || !a.existe) return "Retiré";
    return a.montant ? fmtEuroFull(a.montant) : "Sans montant";
  };

  const confirmer = async () => {
    setErreur(null);
    try {
      await annuler.mutateAsync({ coproId: d.coproId, type: s.type });
      onClose();
    } catch (err) {
      setErreur(messageErreur(err, "L'annulation n'a pas pu être enregistrée."));
    }
  };

  return (
    <Modal
      title={p1 ? "Annuler la dernière saisie de la P1" : p2 ? "Annuler la dernière revalorisation de la P2" : "Annuler la dernière saisie CEE"}
      onClose={onClose}
      width={560}
      closeOnBackdrop={false}
    >
      <p className="se-small" style={{ margin: 0 }}>
        {p1
          ? `Saisie du ${dateCourte(s.saisiLe.slice(0, 10))} par ${auteur} : ${fmtEuroFull(s.valeur)} HT pour la phase études.`
          : p2
            ? `Revalorisation du ${dateCourte(s.saisiLe.slice(0, 10))} par ${auteur} : ${fmtEuroFull(s.valeur)} HT pour la phase travaux.`
            : `Saisie du ${dateCourte(s.saisiLe.slice(0, 10))} par ${auteur} : ${ecrireNombre(s.valeur, 0)} kWh cumac.`}{" "}
        Les montants d'avant cette saisie sont rétablis ; l'état des jalons ne change pas.
      </p>
      <table className="fact-apercu">
        <thead>
          <tr>
            <th>Jalon</th>
            <th className="r">Actuel</th>
            <th className="r">Rétabli</th>
            <th>État</th>
          </tr>
        </thead>
        <tbody>
          {codes.map((code) => {
            const j = jalon(d, code);
            return (
              <tr key={code}>
                <td className="c">{libelleJalon(code)}</td>
                <td className="r">{j.montant ? fmtEuroFull(j.montant) : "-"}</td>
                <td className="r fort">{retabli(code)}</td>
                <td>{j.montant ? LIBELLE_ETAT[j.etat] : "Sans montant"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {erreur && <p className="fact-erreur">{erreur}</p>}
      <div className="fact-modal-actions">
        <button type="button" className="se-btn se-btn-ghost btn-sm" onClick={onClose}>Garder les montants</button>
        <button type="button" className="se-btn se-btn-primary btn-sm" onClick={confirmer} disabled={annuler.isPending}>
          <Icon name="undo" size={14} /> {annuler.isPending ? "Annulation…" : p1 ? "Annuler la saisie de la P1" : p2 ? "Annuler la revalorisation" : "Annuler la saisie CEE"}
        </button>
      </div>
    </Modal>
  );
}

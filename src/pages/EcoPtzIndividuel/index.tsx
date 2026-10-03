// Dossier éco-PTZ individuel d'une copropriété (02/10/2026, demande d'Amir) :
// quand un copropriétaire choisit l'éco-PTZ individuel au portail, Strat Eco
// prépare son CERFA Annexe 3.1 et son attestation des montants éligibles
// (travaux retenus du PF définitif validé + TVA, au prorata des tantièmes du
// logement et de ses annexes rattachées, sans arrondi), vérifie les données
// saisies au dépôt de l'audit et des devis, puis envoie en signature dans
// Strat Eco Pro : entreprises, auditeur et syndic signent le CERFA, le syndic
// signe l'attestation, chacun en une fois avec son lien personnel.
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { Icon } from "@/components/Icon";
import { Modal } from "@/components/Modal";
import { Badge } from "@/components/ui";
import { useCrumbs } from "@/components/Shell/useCrumbs";
import { QuestionnaireEcoPtzDialog } from "@/components/EcoPtzQuestionnaire";
import { useCopro } from "@/api/copros";
import { useDonnees } from "@/api/donnees";
import { usePlansDefinitifs } from "@/api/planDefinitif";
import { useChoixFinancementScenario, useScenarios } from "@/api/scenarios";
import {
  emailValide,
  envoyerEcoPtzEnSignature,
  manquantsAudit,
  manquantsPoste,
  ouvrirDocumentSignature,
  useActionEnvoiEcoPtz,
  useDossierEcoPtz,
  useEnvoisEcoPtz,
  useSaisirAuditEcoPtz,
  useSaisirPostesEcoPtz,
  type DossierEcoPtz,
  type EnvoiSignature,
  type ResultatEnvoiEcoPtz,
} from "@/api/ecoPtzIndividuel";
import { readPlanDefinitif } from "@/lib/finance/planDefinitif";
import {
  cleReference,
  fmtMontantCerfa,
  logementsEcoPtz,
  postesEligiblesEcoPtz,
  type LogementEcoPtz,
  type PosteEcoPtz,
} from "@/lib/finance/ecoPtzIndividuel";
import {
  attestationInputLogement,
  cerfaInputLogement,
  entreprisePoste,
  libelleLogement,
  manquantsDossier,
  signatairesEcoPtz,
  syndicParDefaut,
  type CoproEcoPtz,
  type SignataireEcoPtz,
} from "@/lib/ecoPtzDocuments";
import { genCerfaEcoPtz } from "@/lib/pdf/cerfaEcoPtz";
import { genAttestationEcoPtz } from "@/lib/pdf/attestationEcoPtz";
import { messageErreur } from "@/lib/erreurs";
import { fmtDate } from "@/lib/format";

const euro = (n: number) => `${fmtMontantCerfa(n)} €`;
const ROLE_LIBELLE: Record<string, string> = { entreprise: "Entreprise", auditeur: "Auditeur", syndic: "Syndic" };

/** Données calculées du dossier (partagées par la page et le panneau de l'onglet Financement). */
export function useEcoPtzIndividuel(coproId: string | undefined) {
  const { data: c } = useCopro(coproId);
  const { data: donnees } = useDonnees(coproId);
  const { data: pfPlans, isLoading: chargePf } = usePlansDefinitifs(coproId);
  const { data: scenarios } = useScenarios(coproId);
  const partage = (scenarios ?? [])
    .filter((s) => s.statut === "partage" || s.statut === "importe")
    .sort((a, b) => (b.updated_at > a.updated_at ? 1 : -1))[0];
  const actif = partage ?? (scenarios ?? [])[0];
  const { data: choix } = useChoixFinancementScenario(actif?.id);
  const { data: dossier } = useDossierEcoPtz(coproId);
  const { data: envois } = useEnvoisEcoPtz(coproId);

  const planValide = (pfPlans ?? [])
    .filter((p) => p.statut === "valide")
    .sort((a, b) => (b.updated_at > a.updated_at ? 1 : -1))[0];

  const calc = useMemo(() => {
    if (!planValide || !donnees) return null;
    const data = readPlanDefinitif(planValide.data);
    const postes = postesEligiblesEcoPtz(data, donnees.cles);
    const demandes = (choix ?? [])
      .filter((x) => x.type === "individuel")
      .map((x) => ({
        coproprietaireId: x.coproprietaire_id,
        nom: (x as { coproprietaires?: { nom: string } | null }).coproprietaires?.nom ?? "-",
        lotIds: x.lot_ids ?? [],
      }));
    const logements = logementsEcoPtz({
      postes,
      lots: donnees.lots.map((l) => ({
        id: l.id,
        num: l.num,
        usage: l.usage,
        coproprietaire_id: l.coproprietaire_id,
        rattache_a: l.rattache_a,
        tantiemes: l.tantiemes,
        batiment: l.batiment,
      })),
      demandes,
    });
    return { postes, logements, cleRef: cleReference(donnees.cles) };
  }, [planValide, donnees, choix]);

  return { c, planValide, chargePf, scenarioPartage: partage, dossier, envois: envois ?? [], calc };
}

/** État d'un logement dans les envois (le plus récent non annulé). */
function etatLogement(envois: EnvoiSignature[], lotId: string) {
  for (const e of envois) {
    if (e.statut === "annule") continue;
    const docs = e.signature_documents.filter((d) => d.lot_id === lotId && d.statut !== "annule");
    if (!docs.length) continue;
    const signes = docs.filter((d) => d.statut === "signe").length;
    return { envoi: e, docs, signe: signes === docs.length, signes };
  }
  return null;
}

function coproEcoPtz(c: NonNullable<ReturnType<typeof useCopro>["data"]>): CoproEcoPtz {
  return {
    name: c.name,
    adresse: c.adresse,
    code_postal: c.code_postal,
    city: c.city,
    syndic_name: c.syndic_name,
    gestionnaire_nom: c.gestionnaire_nom,
    gestionnaire_email: c.gestionnaire_email,
  };
}

async function apercu(gen: () => Promise<Uint8Array>) {
  const w = window.open("", "_blank");
  try {
    const bytes = await gen();
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
    if (w) w.location.href = url;
    else window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 120_000);
  } catch (e) {
    w?.close();
    window.alert(messageErreur(e, "Aperçu impossible."));
  }
}

export default function EcoPtzIndividuelPage() {
  const { id: coproId } = useParams();
  const navigate = useNavigate();
  const { c, planValide, chargePf, dossier, envois, calc } = useEcoPtzIndividuel(coproId);
  const [questionnaire, setQuestionnaire] = useState<"audit" | "travaux" | null>(null);
  const [syndic, setSyndic] = useState<SignataireEcoPtz | null>(null);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [confirmer, setConfirmer] = useState(false);

  useCrumbs([
    { label: "Vos copropriétés", to: "/" },
    { label: c?.name ?? "…", to: `/copros/${coproId}/financement` },
    { label: "Éco-PTZ individuel" },
  ]);

  if (!c || chargePf) return <div style={{ padding: 30, color: "var(--fg-muted)" }}>Chargement…</div>;
  const copro = coproEcoPtz(c);
  const sig = syndic ?? syndicParDefaut(copro);
  const postes = calc?.postes ?? [];
  const logements = calc?.logements ?? [];
  const manquants = manquantsDossier(dossier, postes, sig);
  const libres = logements.filter((l) => !etatLogement(envois, l.lotId));
  const choisis = libres.filter((l) => selection.has(l.lotId));

  return (
    <div className="page" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <button className="se-btn se-btn-ghost btn-sm" onClick={() => navigate(`/copros/${coproId}/financement`)}>
          <Icon name="chevronLeft" size={16} />
          Financement
        </button>
        <h1 style={{ margin: 0, fontSize: 20, fontFamily: "var(--font-display)" }}>Éco-PTZ individuel - CERFA et attestations</h1>
        <span style={{ flex: 1 }}></span>
        {planValide ? (
          <button className="se-btn se-btn-ghost btn-sm" onClick={() => navigate(`/copros/${coproId}/plan-definitif/${planValide.id}`)}>
            <Icon name="fileText" size={15} />
            {planValide.nom}
          </button>
        ) : null}
      </div>

      {!planValide && (
        <div className="cc-next">
          <Icon name="alert" size={15} className="ico" />
          <span>
            Aucun PF définitif validé : les montants éligibles se calculent sur les lignes « Retenu » du PF validé (montant
            retenu + TVA, hors imprévus, honoraires et frais annexes).
          </span>
        </div>
      )}

      <div className="detail-grid">
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <AuditPanel coproId={c.id} dossier={dossier} onModifier={() => setQuestionnaire("audit")} />
          <EntreprisesPanel coproId={c.id} dossier={dossier} postes={postes} onModifier={() => setQuestionnaire("travaux")} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <SyndicPanel signataire={sig} onChange={setSyndic} />
          <div className="panel">
            <div className="p-head">
              <Icon name="book" size={18} />
              <h3>Règles de calcul</h3>
            </div>
            <div className="p-body se-small" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span>Postes : lots du PF validé ayant des lignes « Retenu » ; montant = HT retenu après remise + TVA de ces lignes.</span>
              <span>Exclus : imprévus, maîtrise d'œuvre, honoraires, frais annexes et audit.</span>
              <span>Quote-part : montant × tantièmes du logement et de ses annexes rattachées / total de la clé de la ligne.</span>
              <span>Aucun arrondi avant l'affichage ; le total du CERFA est la somme des postes affichés.</span>
              <span>
                Signataires : chaque entreprise sous son poste, l'auditeur sous l'audit, le syndic pour le coût revenant au
                logement et sur l'attestation. Un lien par signataire, valable 30 jours.
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="p-head">
          <Icon name="users" size={18} />
          <h3>Logements demandés au portail ({logements.length})</h3>
          <span style={{ flex: 1 }}></span>
          <button
            className="se-btn se-btn-primary btn-sm"
            disabled={!choisis.length || manquants.length > 0}
            title={manquants.length ? "Complétez et validez d'abord les données du dossier" : undefined}
            onClick={() => setConfirmer(true)}
          >
            <Icon name="send" size={14} />
            Envoyer en signature{choisis.length ? ` (${choisis.length})` : ""}
          </button>
        </div>
        <div className="p-body">
          {manquants.length > 0 && (
            <div className="cc-next" style={{ marginBottom: 12 }}>
              <Icon name="alert" size={15} className="ico" />
              <span>
                Avant l'envoi : {manquants.join(" ; ")}.
              </span>
            </div>
          )}
          {!logements.length ? (
            <p className="se-small" style={{ color: "var(--fg-muted)", margin: 0 }}>
              Aucun copropriétaire n'a encore choisi l'éco-PTZ individuel sur le portail.
            </p>
          ) : (
            <div className="tablewrap" style={{ overflowX: "auto" }}>
              <table className="dossiers" style={{ fontSize: 13, minWidth: 860 }}>
                <thead>
                  <tr>
                    <th style={{ width: 28 }}>
                      <input
                        type="checkbox"
                        checked={libres.length > 0 && choisis.length === libres.length}
                        onChange={(e) => setSelection(new Set(e.target.checked ? libres.map((l) => l.lotId) : []))}
                        title="Tout sélectionner"
                      />
                    </th>
                    <th>Copropriétaire</th>
                    <th>Logement</th>
                    <th style={{ textAlign: "right" }}>Tantièmes</th>
                    <th style={{ textAlign: "right" }}>Montant éligible</th>
                    <th>État</th>
                    <th style={{ textAlign: "right" }}>Documents</th>
                  </tr>
                </thead>
                <tbody>
                  {logements.map((l) => (
                    <LigneLogement
                      key={l.lotId}
                      l={l}
                      cleRef={calc?.cleRef ?? null}
                      etat={etatLogement(envois, l.lotId)}
                      coche={selection.has(l.lotId)}
                      onCoche={(v) =>
                        setSelection((s) => {
                          const n = new Set(s);
                          if (v) n.add(l.lotId);
                          else n.delete(l.lotId);
                          return n;
                        })
                      }
                      apercuCerfa={() =>
                        apercu(async () => {
                          const { parPoste } = signatairesEcoPtz(dossier, postes, sig);
                          return (await genCerfaEcoPtz(cerfaInputLogement(copro, dossier, l, postes, parPoste))).bytes;
                        })
                      }
                      apercuAttestation={() =>
                        apercu(async () => (await genAttestationEcoPtz({ ...attestationInputLogement(copro, dossier, l, postes), editeLe: new Date().toISOString() })).bytes)
                      }
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <EnvoisPanel coproId={c.id} envois={envois} />

      {questionnaire && (
        <QuestionnaireEcoPtzDialog
          coproId={c.id}
          mode={questionnaire}
          peutValider
          toutCocher
          onClose={() => setQuestionnaire(null)}
        />
      )}
      {confirmer && dossier && (
        <ConfirmerEnvoi
          coproId={c.id}
          copro={copro}
          dossier={dossier}
          postes={postes}
          logements={choisis}
          syndic={sig}
          onClose={(envoye) => {
            setConfirmer(false);
            if (envoye) setSelection(new Set());
          }}
        />
      )}
    </div>
  );
}

// ---------- Audit ----------

function AuditPanel({ coproId, dossier, onModifier }: { coproId: string; dossier: DossierEcoPtz | undefined; onModifier: () => void }) {
  const saisir = useSaisirAuditEcoPtz(coproId);
  const a = dossier?.audit ?? {};
  const manque = manquantsAudit(a);
  const statut = dossier?.audit_statut ?? "a_completer";
  const ligne = (k: string, v: string | undefined) => (
    <div className="kv">
      <span className="k">{k}</span>
      <span className="v">{v?.trim() || "-"}</span>
    </div>
  );
  return (
    <div className="panel">
      <div className="p-head">
        <Icon name="fileCheck" size={18} />
        <h3>Audit réglementaire</h3>
        <span style={{ flex: 1 }}></span>
        <Badge kind={statut === "valide" ? "success" : statut === "a_verifier" ? "warn" : "neutral"}>
          {statut === "valide" ? "Validé" : statut === "a_verifier" ? "À vérifier" : "À compléter"}
        </Badge>
      </div>
      <div className="p-body">
        {ligne("Référence", a.reference)}
        {ligne("Date de réalisation", a.date)}
        {ligne("Scénario retenu", a.scenario)}
        {ligne(
          "Performance",
          a.classe_avant || a.conso_avant
            ? `${a.classe_avant ?? "?"} (${a.conso_avant ?? "?"} kWh/m²/an) -> ${a.classe_apres ?? "?"} (${a.conso_apres ?? "?"}) - gain ${a.gain_pct ?? "?"} %`
            : ""
        )}
        {ligne("Coût de l'audit", a.cout_ttc ? `${a.cout_ttc} € TTC` : "")}
        {ligne("Auditeur", [a.raison_sociale, a.siret].filter(Boolean).join(" - SIRET "))}
        {ligne("Signataire", [a.contact_nom, a.contact_email].filter(Boolean).join(" - "))}
        {a.saisi_le && (
          <p className="se-small" style={{ color: "var(--fg-muted)", margin: "8px 0 0" }}>
            Saisi par {a.saisi_par_role === "syndic" ? "le syndic" : a.saisi_par_role === "moe" ? "le maître d'œuvre" : "Strat Eco"} le{" "}
            {fmtDate(a.saisi_le)}
            {a.fichier ? ` (dépôt de « ${a.fichier} »)` : ""}
            {dossier?.audit_valide_le ? ` - validé le ${fmtDate(dossier.audit_valide_le)}` : ""}
          </p>
        )}
        {manque.length > 0 && (
          <p className="se-small" style={{ color: "var(--color-warning-700)", margin: "8px 0 0" }}>
            À compléter : {manque.join(", ")}.
          </p>
        )}
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <button className="se-btn se-btn-secondary btn-sm" onClick={onModifier}>
            <Icon name="edit" size={14} />
            {statut === "a_completer" ? "Compléter" : "Modifier"}
          </button>
          {statut === "a_verifier" && (
            <button
              className="se-btn se-btn-primary btn-sm"
              disabled={manque.length > 0 || saisir.isPending}
              title={manque.length ? "Complétez d'abord tous les champs" : "Les données sont reprises telles quelles sur les CERFA"}
              onClick={() => saisir.mutate({ audit: a, valider: true })}
            >
              <Icon name="check" size={14} />
              Valider
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- Entreprises ----------

function EntreprisesPanel({
  coproId,
  dossier,
  postes,
  onModifier,
}: {
  coproId: string;
  dossier: DossierEcoPtz | undefined;
  postes: PosteEcoPtz[];
  onModifier: () => void;
}) {
  const saisir = useSaisirPostesEcoPtz(coproId);
  const aValider = postes
    .map((p) => ({ p, e: dossier?.postes[String(p.lotNumero)] }))
    .filter(({ e }) => e && e.statut !== "valide" && manquantsPoste(e).length === 0);
  return (
    <div className="panel">
      <div className="p-head">
        <Icon name="hammer" size={18} />
        <h3>Entreprises des lots retenus</h3>
      </div>
      <div className="p-body">
        {!postes.length ? (
          <p className="se-small" style={{ color: "var(--fg-muted)", margin: 0 }}>Aucun lot retenu dans le PF validé.</p>
        ) : (
          <div className="tablewrap" style={{ overflowX: "auto" }}>
            <table className="dossiers" style={{ fontSize: 12.5, minWidth: 560 }}>
              <thead>
                <tr>
                  <th>Lot</th>
                  <th style={{ textAlign: "right" }}>Éligible TTC</th>
                  <th>Entreprise</th>
                  <th>Signataire</th>
                  <th>État</th>
                </tr>
              </thead>
              <tbody>
                {postes.map((p) => {
                  const e = entreprisePoste(dossier, p);
                  const saisi = dossier?.postes[String(p.lotNumero)];
                  const m = manquantsPoste(e);
                  return (
                    <tr key={p.lotNumero}>
                      <td>
                        <b>Lot {p.lotNumero}</b> - {e.designation?.trim() || p.titre}
                        {p.lignesSansCle > 0 && (
                          <div className="se-small" style={{ color: "var(--color-warning-700)" }}>
                            {p.lignesSansCle} ligne{p.lignesSansCle > 1 ? "s" : ""} sans clé : clé de référence appliquée
                          </div>
                        )}
                      </td>
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{euro(p.montantTtc)}</td>
                      <td>
                        {e.raison_sociale || "-"}
                        {e.siret && <div className="se-small" style={{ color: "var(--fg-muted)" }}>SIRET {e.siret}</div>}
                      </td>
                      <td>
                        {e.contact_nom || "-"}
                        {e.contact_email && <div className="se-small" style={{ color: "var(--fg-muted)" }}>{e.contact_email}</div>}
                      </td>
                      <td>
                        {m.length ? (
                          <Badge kind="warn">Manque : {m.join(", ")}</Badge>
                        ) : saisi?.statut === "valide" ? (
                          <Badge kind="success">Validé</Badge>
                        ) : (
                          <Badge kind="warn">À vérifier</Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <button className="se-btn se-btn-secondary btn-sm" onClick={onModifier} disabled={!postes.length}>
            <Icon name="edit" size={14} />
            Compléter les entreprises
          </button>
          {aValider.length > 0 && (
            <button
              className="se-btn se-btn-primary btn-sm"
              disabled={saisir.isPending}
              onClick={() => saisir.mutate({ postes: aValider.map(({ e }) => e!), valider: true })}
            >
              <Icon name="check" size={14} />
              Valider {aValider.length} entreprise{aValider.length > 1 ? "s" : ""}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- Syndic ----------

function SyndicPanel({ signataire, onChange }: { signataire: SignataireEcoPtz; onChange: (s: SignataireEcoPtz) => void }) {
  const set = (k: "societe" | "nom" | "email") => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...signataire, [k]: e.target.value });
  return (
    <div className="panel">
      <div className="p-head">
        <Icon name="building" size={18} />
        <h3>Syndic signataire</h3>
      </div>
      <div className="p-body" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <p className="se-small" style={{ margin: 0, color: "var(--fg-muted)" }}>
          Le syndic atteste le coût revenant à chaque logement sur le CERFA et signe les attestations. Repris du gestionnaire
          du dossier, modifiable pour cet envoi.
        </p>
        <div className="cs-field">
          <label>Syndic (enseigne)</label>
          <input className="edit-inp" style={{ maxWidth: "none", width: "100%" }} value={signataire.societe} onChange={set("societe")} />
        </div>
        <div className="cs-field">
          <label>Nom du signataire</label>
          <input className="edit-inp" style={{ maxWidth: "none", width: "100%" }} value={signataire.nom} onChange={set("nom")} />
        </div>
        <div className="cs-field">
          <label>E-mail du signataire</label>
          <input
            className="edit-inp"
            style={{ maxWidth: "none", width: "100%", borderColor: signataire.email && !emailValide(signataire.email) ? "var(--color-error-500)" : undefined }}
            type="email"
            value={signataire.email}
            onChange={set("email")}
          />
        </div>
      </div>
    </div>
  );
}

// ---------- Logements ----------

function LigneLogement({
  l,
  cleRef,
  etat,
  coche,
  onCoche,
  apercuCerfa,
  apercuAttestation,
}: {
  l: LogementEcoPtz;
  cleRef: string | null;
  etat: ReturnType<typeof etatLogement>;
  coche: boolean;
  onCoche: (v: boolean) => void;
  apercuCerfa: () => void;
  apercuAttestation: () => void;
}) {
  const t = cleRef ? l.tantiemes[cleRef] ?? 0 : 0;
  const doc = (type: string) => etat?.docs.find((d) => d.type === type);
  const ouvrir = (id: string, signe: boolean) =>
    void ouvrirDocumentSignature(id, signe ? "signe" : "original").catch((e) => window.alert(messageErreur(e, "Ouverture impossible.")));
  return (
    <tr>
      <td>
        <input type="checkbox" disabled={!!etat} checked={coche && !etat} onChange={(e) => onCoche(e.target.checked)} />
      </td>
      <td>
        <b>{l.nom}</b>
        {l.personneMorale === "sci" && (
          <div className="se-small" style={{ color: "var(--color-warning-700)" }}>SCI : éligibilité conditionnelle (IR, associés personnes physiques)</div>
        )}
        {l.personneMorale === "societe" && (
          <div className="se-small" style={{ color: "var(--color-error-700)" }}>Personne morale : non éligible en principe, à vérifier</div>
        )}
      </td>
      <td>{libelleLogement(l)}</td>
      <td style={{ textAlign: "right" }}>{t.toLocaleString("fr-FR")}</td>
      <td style={{ textAlign: "right", whiteSpace: "nowrap", fontWeight: 700 }}>{euro(l.total)}</td>
      <td>
        {!etat ? (
          <Badge kind="neutral">À envoyer</Badge>
        ) : etat.signe ? (
          <Badge kind="success">Signé</Badge>
        ) : (
          <Badge kind="blue">
            En signature ({etat.signes}/{etat.docs.length})
          </Badge>
        )}
      </td>
      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
        {etat ? (
          <>
            {doc("cerfa_ecoptz") && (
              <button className="se-btn se-btn-ghost btn-sm" onClick={() => ouvrir(doc("cerfa_ecoptz")!.id, doc("cerfa_ecoptz")!.statut === "signe")}>
                CERFA
              </button>
            )}
            {doc("attestation_ecoptz") && (
              <button
                className="se-btn se-btn-ghost btn-sm"
                onClick={() => ouvrir(doc("attestation_ecoptz")!.id, doc("attestation_ecoptz")!.statut === "signe")}
              >
                Attestation
              </button>
            )}
          </>
        ) : (
          <>
            <button className="se-btn se-btn-ghost btn-sm" onClick={apercuCerfa} title="Aperçu du CERFA avec les données actuelles">
              Aperçu CERFA
            </button>
            <button className="se-btn se-btn-ghost btn-sm" onClick={apercuAttestation} title="Aperçu de l'attestation avec les données actuelles">
              Aperçu attestation
            </button>
          </>
        )}
      </td>
    </tr>
  );
}

// ---------- Envoi ----------

function ConfirmerEnvoi({
  coproId,
  copro,
  dossier,
  postes,
  logements,
  syndic,
  onClose,
}: {
  coproId: string;
  copro: CoproEcoPtz;
  dossier: DossierEcoPtz;
  postes: PosteEcoPtz[];
  logements: LogementEcoPtz[];
  syndic: SignataireEcoPtz;
  onClose: (envoye: boolean) => void;
}) {
  const { signataires } = signatairesEcoPtz(dossier, postes, syndic);
  const [progres, setProgres] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [resultat, setResultat] = useState<ResultatEnvoiEcoPtz | null>(null);
  const qc = useQueryClient();

  const envoyer = async () => {
    setErreur(null);
    try {
      const r = await envoyerEcoPtzEnSignature({ coproId, copro, dossier, postes, logements, syndic, onProgres: setProgres });
      setResultat(r);
      void qc.invalidateQueries({ queryKey: ["ecoptz-envois", coproId] });
    } catch (e) {
      setErreur(messageErreur(e, "L'envoi a échoué."));
    } finally {
      setProgres(null);
    }
  };

  if (resultat)
    return (
      <Modal title="Envoi effectué" onClose={() => onClose(true)} width={640}>
        <p className="se-body" style={{ marginTop: 0 }}>
          {logements.length * 2} documents déposés ; chaque signataire a reçu son lien personnel :
        </p>
        {resultat.participants.map((p) => {
          const s = signataires[resultat.participants.indexOf(p)];
          return (
            <div key={p.participant_id} className="kv">
              <span className="k">
                {ROLE_LIBELLE[p.role] ?? p.role} - {s?.societe || s?.nom}
              </span>
              <span className="v">
                {p.email} - {p.statut === "envoye" ? "e-mail envoyé" : p.statut === "simule" ? "simulation" : "échec de l'e-mail"}
                {p.lien && (
                  <>
                    {" "}
                    <a href={p.lien} target="_blank" rel="noreferrer">
                      lien de test
                    </a>
                  </>
                )}
              </span>
            </div>
          );
        })}
        <div style={{ marginTop: 16 }}>
          <button className="se-btn se-btn-primary" onClick={() => onClose(true)}>
            Fermer
          </button>
        </div>
      </Modal>
    );

  return (
    <Modal title="Envoyer en signature" onClose={() => !progres && onClose(false)} width={680} closeOnBackdrop={false}>
      <p className="se-body" style={{ marginTop: 0 }}>
        {logements.length} logement{logements.length > 1 ? "s" : ""} : un CERFA Annexe 3.1 et une attestation chacun, soit{" "}
        {logements.length * 2} documents. Chaque signataire reçoit un lien personnel et signe en une fois tous les documents
        où il figure, avec un code reçu par e-mail.
      </p>
      <div className="tablewrap" style={{ overflowX: "auto" }}>
        <table className="dossiers" style={{ fontSize: 13 }}>
          <thead>
            <tr>
              <th>Rôle</th>
              <th>Société</th>
              <th>Signataire</th>
              <th>E-mail</th>
            </tr>
          </thead>
          <tbody>
            {signataires.map((s) => (
              <tr key={s.cle}>
                <td>{ROLE_LIBELLE[s.role]}</td>
                <td>{s.societe || "-"}</td>
                <td>{s.nom || "-"}</td>
                <td style={{ color: emailValide(s.email) ? undefined : "var(--color-error-700)" }}>{s.email || "manquant"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="se-small" style={{ color: "var(--fg-muted)" }}>
        Logements : {logements.map((l) => `${l.nom} (lot ${l.lotNum}, ${euro(l.total)})`).join(" ; ")}.
      </p>
      {progres && (
        <p className="se-small" style={{ color: "var(--fg-muted)" }}>
          <Icon name="clock" size={13} /> {progres}…
        </p>
      )}
      {erreur && (
        <p className="se-small" style={{ color: "var(--color-error-700)" }}>
          {erreur}
        </p>
      )}
      <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
        <button
          className="se-btn se-btn-primary"
          disabled={!!progres || signataires.some((s) => !emailValide(s.email))}
          onClick={() => void envoyer()}
        >
          <Icon name="send" size={15} />
          {progres ? "Envoi en cours…" : "Confirmer l'envoi"}
        </button>
        <button className="se-btn se-btn-ghost" disabled={!!progres} onClick={() => onClose(false)}>
          Annuler
        </button>
      </div>
    </Modal>
  );
}

// ---------- Suivi des envois ----------

function EnvoisPanel({ coproId, envois }: { coproId: string; envois: EnvoiSignature[] }) {
  const action = useActionEnvoiEcoPtz(coproId);
  const [info, setInfo] = useState<string | null>(null);
  if (!envois.length) return null;
  const relancer = async (participantId: string, email?: string) => {
    setInfo(null);
    try {
      const r = await action.mutateAsync({ action: "amo_relancer", participant_id: participantId, ...(email ? { email } : {}) });
      setInfo(r.lien_test ? `Lien renvoyé (simulation) : ${String(r.lien_test)}` : "Lien renvoyé par e-mail.");
    } catch (e) {
      setInfo(messageErreur(e, "Relance impossible."));
    }
  };
  return (
    <div className="panel">
      <div className="p-head">
        <Icon name="send" size={18} />
        <h3>Envois en signature</h3>
      </div>
      <div className="p-body" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {info && (
          <p className="se-small" style={{ margin: 0, wordBreak: "break-all" }}>
            {info}
          </p>
        )}
        {envois.map((e) => {
          const docs = e.signature_documents.filter((d) => d.statut !== "annule");
          const signes = docs.filter((d) => d.statut === "signe").length;
          return (
            <div key={e.id} style={{ borderTop: "1px solid var(--border)", paddingTop: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <b>Envoi du {fmtDate(e.envoye_le ?? e.created_at)}</b>
                <span className="se-small" style={{ color: "var(--fg-muted)" }}>
                  {e.cree_par_nom ? `par ${e.cree_par_nom} - ` : ""}
                  {signes}/{docs.length} documents signés
                </span>
                <Badge kind={e.statut === "complet" ? "success" : e.statut === "annule" ? "neutral" : "blue"}>
                  {e.statut === "complet" ? "Terminé" : e.statut === "annule" ? "Annulé" : "En cours"}
                </Badge>
                <span style={{ flex: 1 }}></span>
                {e.statut === "en_cours" && (
                  <button
                    className="se-btn se-btn-ghost btn-sm"
                    disabled={action.isPending}
                    onClick={() => {
                      if (window.confirm("Annuler cet envoi ? Les liens ne fonctionneront plus ; les documents déjà signés sont conservés."))
                        void action.mutateAsync({ action: "amo_annuler", envoi_id: e.id });
                    }}
                  >
                    Annuler l'envoi
                  </button>
                )}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>
                {[...e.signature_participants]
                  .sort((a, b) => a.ordre - b.ordre)
                  .map((p) => (
                    <div key={p.id} className="se-small" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <span style={{ minWidth: 80, color: "var(--fg-muted)" }}>{ROLE_LIBELLE[p.role]}</span>
                      <b>{p.societe || p.nom}</b>
                      <span>{p.nom && p.societe ? p.nom : ""}</span>
                      <span style={{ color: "var(--fg-muted)" }}>{p.email}</span>
                      {p.statut === "signe" ? (
                        <Badge kind="success">Signé le {fmtDate(p.signe_le)}</Badge>
                      ) : p.statut === "annule" ? (
                        <Badge kind="neutral">Annulé</Badge>
                      ) : (
                        <>
                          <Badge kind="warn">En attente</Badge>
                          {e.statut === "en_cours" && (
                            <>
                              <button className="lien-btn" disabled={action.isPending} onClick={() => void relancer(p.id)}>
                                Relancer
                              </button>
                              <button
                                className="lien-btn"
                                disabled={action.isPending}
                                onClick={() => {
                                  const email = window.prompt(`Nouvelle adresse e-mail pour ${p.societe || p.nom} :`, p.email);
                                  if (email && email.trim() !== p.email) void relancer(p.id, email.trim());
                                }}
                              >
                                Changer l'e-mail
                              </button>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Panneau de l'onglet Financement : état du dossier et accès à la page. */
export function EcoPtzIndividuelPanel({ coproId }: { coproId: string }) {
  const navigate = useNavigate();
  const { calc, envois, dossier } = useEcoPtzIndividuel(coproId);
  const logements = calc?.logements ?? [];
  const signes = logements.filter((l) => etatLogement(envois, l.lotId)?.signe).length;
  const enCours = logements.filter((l) => {
    const e = etatLogement(envois, l.lotId);
    return e && !e.signe;
  }).length;
  return (
    <div className="panel">
      <div className="p-head">
        <Icon name="fileText" size={18} />
        <h3>Éco-PTZ individuel - CERFA et attestations</h3>
      </div>
      <div className="p-body">
        <div className="kv">
          <span className="k">Logements demandés</span>
          <span className="v">{logements.length}</span>
        </div>
        <div className="kv">
          <span className="k">En signature / signés</span>
          <span className="v">
            {enCours} / {signes}
          </span>
        </div>
        <div className="kv">
          <span className="k">Audit</span>
          <span className="v">
            {dossier?.audit_statut === "valide" ? "validé" : dossier?.audit_statut === "a_verifier" ? "à vérifier" : "à compléter"}
          </span>
        </div>
        <button className="se-btn se-btn-secondary btn-sm" style={{ marginTop: 10 }} onClick={() => navigate(`/copros/${coproId}/ecoptz-individuel`)}>
          <Icon name="chevronRight" size={14} />
          Ouvrir le dossier éco-PTZ individuel
        </button>
      </div>
    </div>
  );
}

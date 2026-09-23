// Fiche « État de la copropriété » (ANAH - MaPrimeRénov' Copro), en ligne.
// Modèle ANAH reçu le 23/09/2026, arbitrages d'Amir : ce que la base connaît
// est pré-rempli et verrouillé (lots, tantièmes, occupation issue du rapport
// d'enquête sociale) ; le syndic complète ses rubriques et transmet ; l'AMO
// renseigne NPNRU, étiquettes par bâtiment et images, valide puis envoie en
// signature au président du conseil syndical et au syndic (ordre libre). Une
// modification après signature ne redemande pas de signature ; le PDF signé
// est régénéré et déposé dans la pièce « Fiche État » du dossier ANAH.
import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { useAuth } from "@/auth/AuthProvider";
import { useDonnees } from "@/api/donnees";
import { useEnquete, useReponses } from "@/api/enquete";
import { useFormulairesMontage } from "@/api/montage";
import type { SyndicCopro } from "@/api/syndic";
import {
  deposerImageFiche,
  pdfFicheEtat,
  telechargerPdf,
  urlImageFiche,
  useActionSignatureFiche,
  useDeposerFicheEtatSignee,
  useEnregistrerFicheEtat,
  useFicheEtat,
  useSignaturesFicheEtat,
  type ImageFiche,
  type SignatureFiche,
} from "@/api/ficheEtat";
import {
  CHAMPS_FICHE,
  ETIQUETTES,
  SECTIONS_FICHE,
  calculerOccupation,
  champsManquants,
  lignesEtiquettes,
  lotsNonPrincipaux,
  resoudre,
  signatureOccupation,
  valeursBase,
  valeursBrutes,
  valeursParDefaut,
  type ChampFiche,
  type DonneesFiche,
  type DonneesFormulaireFiche,
  type EtiquetteBatiment,
} from "@/lib/ficheEtat";
import { nomFichierFicheEtat } from "@/lib/pdf/ficheEtat";
import { libellesBatiments } from "@/lib/referentiels";

const ROLES: { role: "president_cs" | "syndic"; label: string }[] = [
  { role: "president_cs", label: "Président(e) du conseil syndical" },
  { role: "syndic", label: "Syndic" },
];

function fmtDateHeure(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "";
}

function ChampSaisie({
  ch,
  valeur,
  modifiable,
  manquant,
  onChange,
}: {
  ch: ChampFiche;
  valeur: string;
  modifiable: boolean;
  manquant: boolean;
  onChange: (v: string) => void;
}) {
  const requis = ch.obligatoire || !!ch.obligatoireSi;
  const style = {
    ...(modifiable ? {} : { background: "var(--bg-soft)", color: "var(--fg3)" }),
    ...(manquant ? { borderColor: "var(--color-error-500, #d92d20)" } : {}),
  };
  const unite = ch.type === "montant" ? "€" : ch.type === "pct" ? "%" : null;
  return (
    <div className="fld" style={ch.large || ch.label.length > 90 ? { gridColumn: "1 / -1" } : undefined}>
      <label>
        {ch.label}
        {requis && <span style={{ color: "var(--color-error-700)" }}> *</span>}
        {ch.qui === "base" && <span className="hint"> - depuis le dossier</span>}
        {ch.qui === "amo" && <span className="hint"> - renseigné par Strat Eco</span>}
        {ch.hint && modifiable && <span className="hint"> - {ch.hint}</span>}
      </label>
      {ch.type === "ouinon" || ch.type === "select" ? (
        <select value={valeur} disabled={!modifiable} onChange={(e) => onChange(e.target.value)} style={style}>
          <option value="">-</option>
          {(ch.type === "ouinon" ? ["OUI", "NON"] : ch.options ?? []).map((o) => (
            <option key={o} value={o}>
              {ch.type === "ouinon" ? (o === "OUI" ? "Oui" : "Non") : o}
            </option>
          ))}
        </select>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input
            type={ch.type === "date" ? "date" : ch.type === "email" ? "email" : ch.type === "tel" ? "tel" : "text"}
            inputMode={ch.type === "number" || ch.type === "montant" || ch.type === "pct" ? "decimal" : undefined}
            value={valeur}
            readOnly={!modifiable}
            onChange={(e) => onChange(e.target.value)}
            style={{ ...style, flex: 1 }}
          />
          {unite && <span style={{ color: "var(--fg-muted)", fontSize: 13 }}>{unite}</span>}
        </div>
      )}
    </div>
  );
}

function ImageEncadre({
  titre,
  path,
  modifiable,
  busy,
  onChoisir,
}: {
  titre: string;
  path: string | null | undefined;
  modifiable: boolean;
  busy: boolean;
  onChoisir: (f: File) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const { data: url } = useQuery({
    queryKey: ["fiche-etat-image", path],
    enabled: !!path,
    staleTime: 5 * 60 * 1000,
    queryFn: () => urlImageFiche(path!),
  });
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontWeight: 600, fontSize: 13.5 }}>{titre}</div>
      <div
        style={{
          height: 150,
          background: "var(--bg-soft)",
          borderRadius: 6,
          display: "grid",
          placeItems: "center",
          overflow: "hidden",
          color: "var(--fg-muted)",
          fontSize: 13,
        }}
      >
        {url ? <img src={url} alt={titre} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} /> : "Aucune image"}
      </div>
      {modifiable && (
        <>
          <input
            ref={input}
            type="file"
            accept="image/png,image/jpeg"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onChoisir(f);
              e.target.value = "";
            }}
          />
          <button className="se-btn se-btn-secondary btn-sm" disabled={busy} onClick={() => input.current?.click()}>
            <Icon name="upload" size={14} />
            {busy ? "Dépôt…" : path ? "Remplacer l'image" : "Déposer l'image"}
          </button>
        </>
      )}
    </div>
  );
}

export function FicheEtatForm({ c, onBack }: { c: SyndicCopro; onBack: () => void }) {
  const { profile } = useAuth();
  const isAmo = profile?.role === "amo";
  const { data: donnees } = useDonnees(c.id);
  const { data: forms } = useFormulairesMontage(c.id);
  const { data: fiche, isLoading } = useFicheEtat(c.id);
  const { data: sigs } = useSignaturesFicheEtat(c.id);
  // occupation en direct, AMO seulement (le syndic ne lit pas les réponses détaillées)
  const { data: enquete } = useEnquete(isAmo ? c.id : undefined);
  const { data: reponses } = useReponses(isAmo ? enquete?.id : undefined);
  const enregistrer = useEnregistrerFicheEtat(c.id);
  const action = useActionSignatureFiche(c.id);
  const deposer = useDeposerFicheEtatSignee(c.id, c.name);

  const [saisies, setSaisies] = useState<Record<string, string> | null>(null);
  const [etiquettes, setEtiquettes] = useState<Record<string, EtiquetteBatiment> | null>(null);
  const [tentative, setTentative] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null);
  const [imageBusy, setImageBusy] = useState<ImageFiche | null>(null);
  const [lienTest, setLienTest] = useState<string | null>(null);
  const [attestation, setAttestation] = useState(false);
  const [otp, setOtp] = useState<{ canal: string; codeTest?: string } | null>(null);
  const [code, setCode] = useState("");
  const [pdfBusy, setPdfBusy] = useState(false);

  const saved: DonneesFormulaireFiche = fiche?.data ?? {};
  const donneesFiche = donnees as DonneesFiche | undefined;
  const defauts = useMemo(() => valeursParDefaut(c, (forms ?? []).map((f) => ({ type: f.type, data: f.data }))), [c, forms]);
  const s = saisies ?? saved.saisies ?? {};
  const e = etiquettes ?? saved.etiquettes ?? {};
  const base = useMemo(
    () => (donneesFiche ? valeursBase(c, donneesFiche, saved.occupation, e) : {}),
    [c, donneesFiche, saved.occupation, e]
  );
  const brutes = useMemo(() => valeursBrutes(base, s, defauts), [base, s, defauts]);
  const manquants = champsManquants(brutes, isAmo ? undefined : "syndic");
  const manquantsSet = new Set(manquants.map((m) => m.key));
  const dirty = saisies != null || etiquettes != null;
  const statut = fiche?.statut ?? null;
  const lb = libellesBatiments(c.denomination_batiments);

  // rapport d'enquête dépassé (AMO) : mêmes chiffres recalculés en direct
  const occupationDepassee = useMemo(() => {
    if (!isAmo || !donneesFiche || !reponses || !saved.occupation) return false;
    const live = calculerOccupation(c, donneesFiche, reponses);
    return signatureOccupation(live, lotsNonPrincipaux(donneesFiche, reponses)) !== saved.occupation.signature;
  }, [isAmo, c, donneesFiche, reponses, saved.occupation]);

  const sigPar = (role: string): SignatureFiche | undefined => sigs?.find((x) => x.role === role);
  const deuxSignees = ROLES.every((r) => !!sigPar(r.role)?.signe_le);
  const sigSyndic = sigPar("syndic");

  if (isLoading || !donnees) return <div style={{ padding: 30, color: "var(--fg-muted)" }}>Chargement…</div>;

  const modifiable = (ch: ChampFiche) => ch.qui !== "base" && (isAmo || ch.qui === "syndic");
  const setChamp = (k: string, v: string) => setSaisies({ ...s, [k]: v });

  const payload = (): Partial<DonneesFormulaireFiche> => {
    const merged = { ...defauts, ...s };
    const propres: Record<string, string> = {};
    for (const ch of CHAMPS_FICHE) {
      if (ch.qui === "base") continue;
      // le taux d'impayés reste calculé tant qu'il n'est pas saisi
      propres[ch.key] = ch.key === "taux_impayes_8" ? s.taux_impayes_8 ?? "" : merged[ch.key] ?? "";
    }
    return { saisies: propres, etiquettes: e, resolu: resoudre(brutes) };
  };

  const sauver = async (nouveauStatut?: "transmis") => {
    setMessage(null);
    await enregistrer.mutateAsync({ patch: payload(), statut: nouveauStatut });
    setSaisies(null);
    setEtiquettes(null);
  };

  const executer = async (fn: () => Promise<void>) => {
    setMessage(null);
    try {
      await fn();
    } catch (err) {
      setMessage({ ok: false, texte: err instanceof Error ? err.message : "L'opération a échoué. Réessayez." });
    }
  };

  const transmettre = () =>
    executer(async () => {
      setTentative(true);
      if (manquants.length) {
        setMessage({ ok: false, texte: `Champs obligatoires à compléter : ${manquants.map((m) => m.label).join(" ; ")}.` });
        return;
      }
      // une fiche déjà validée le reste : seules les valeurs changent
      await sauver(statut === "valide" ? undefined : "transmis");
      setMessage({ ok: true, texte: statut === "valide" ? "Modifications enregistrées." : "Fiche transmise à Strat Eco." });
    });

  const envoyerEnSignature = () =>
    executer(async () => {
      setTentative(true);
      if (manquants.length) {
        setMessage({ ok: false, texte: `Avant validation, complétez : ${manquants.map((m) => m.label).join(" ; ")}.` });
        return;
      }
      await sauver();
      const pcs = sigPar("president_cs");
      const relance = statut === "valide" && pcs && !pcs.signe_le && pcs.email === (brutes.pcs_email ?? "").trim();
      const r = await action.mutateAsync({ action: relance ? "amo_relancer" : "amo_envoyer" });
      setLienTest(typeof r.lien_test === "string" ? r.lien_test : null);
      const envoiPresident = relance ? r.statut : r.president;
      if (envoiPresident === "erreur") {
        setMessage({ ok: false, texte: "Fiche validée, mais l'e-mail au président du conseil syndical n'a pas pu partir : vérifiez son courriel puis renvoyez le lien." });
        return;
      }
      setMessage({
        ok: true,
        texte: relance
          ? "Nouveau lien de signature envoyé au président du conseil syndical."
          : r.syndic === "erreur"
            ? "Fiche validée : lien envoyé au président du conseil syndical ; l'e-mail au syndic n'a pas pu partir."
            : "Fiche validée : lien de signature envoyé au président du conseil syndical, syndic prévenu par e-mail.",
      });
    });

  const choisirImage = (quoi: ImageFiche, f: File) =>
    executer(async () => {
      setImageBusy(quoi);
      try {
        const path = await deposerImageFiche(c.id, quoi, f);
        await enregistrer.mutateAsync({ patch: { images: { ...(saved.images ?? {}), [quoi]: path } } });
      } finally {
        setImageBusy(null);
      }
    });

  const apercu = () =>
    executer(async () => {
      setPdfBusy(true);
      try {
        const { bytes, signee } = await pdfFicheEtat(c.id, { ...saved, resolu: resoudre(brutes) }, sigs);
        telechargerPdf(bytes, nomFichierFicheEtat(c.name, signee));
      } finally {
        setPdfBusy(false);
      }
    });

  const deposerSignee = () =>
    executer(async () => {
      await deposer.mutateAsync({ data: { ...saved, resolu: resoudre(brutes) }, signatures: sigs });
      setMessage({ ok: true, texte: "PDF signé déposé dans la pièce « Fiche État » du dossier ANAH." });
    });

  const lignesEtiq = lignesEtiquettes(c, donnees as DonneesFiche, e);
  const setEtiq = (code: string, patch: EtiquetteBatiment) => {
    const ligne = lignesEtiq.find((l) => l.code === code);
    setEtiquettes({ ...e, [code]: { etiquette: ligne?.etiquette ?? null, gain35: ligne?.gain35 ?? false, ...e[code], ...patch } });
  };

  const occ = saved.occupation;

  return (
    <div className="fade">
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <button className="se-btn se-btn-ghost btn-sm" onClick={onBack}>
          <Icon name="chevronLeft" size={15} />
          Dossier ANAH
        </button>
        <span style={{ flex: 1 }}></span>
        {statut === "valide" ? (
          <Badge kind="success" dot>
            Validée par Strat Eco{saved.validee_le ? ` le ${fmtDate(saved.validee_le)}` : ""}
          </Badge>
        ) : statut === "transmis" ? (
          <Badge kind="blue" dot>
            Transmise à Strat Eco le {fmtDate(fiche!.updated_at)}
          </Badge>
        ) : fiche ? (
          <Badge kind="neutral">Brouillon enregistré le {fmtDate(fiche.updated_at)}</Badge>
        ) : null}
        <button className="se-btn se-btn-secondary btn-sm" disabled={pdfBusy} onClick={() => void apercu()}>
          <Icon name="download" size={14} />
          {pdfBusy ? "Génération…" : "Aperçu PDF"}
        </button>
      </div>

      <div className="panel">
        <div className="p-head">
          <Icon name="fileCheck" size={18} />
          <h3>Fiche « État de la copropriété » (ANAH)</h3>
        </div>
        <div className="p-body">
          <p className="se-small" style={{ marginTop: 0, color: "var(--fg-muted)" }}>
            Indicateurs de la copropriété qui permettent à l'Anah d'apprécier son éligibilité à MaPrimeRénov' Copropriété.
            Les rubriques calculées depuis le dossier (lots, tantièmes, occupation) sont verrouillées ;
            {isAmo ? " Strat Eco complète NPNRU, étiquettes et images, valide puis envoie la fiche en signature." : " complétez les vôtres puis transmettez la fiche à Strat Eco, qui la valide et l'envoie en signature au président du conseil syndical et à vous-même."}{" "}
            Les champs marqués <span style={{ color: "var(--color-error-700)" }}>*</span> sont obligatoires.
          </p>

          <div className="se-eyebrow" style={{ margin: "18px 0 10px" }}>En-tête de la fiche</div>
          <div className="form-grid">
            <ImageEncadre
              titre="Vue aérienne de la copropriété"
              path={saved.images?.aerienne}
              modifiable={isAmo}
              busy={imageBusy === "aerienne"}
              onChoisir={(f) => void choisirImage("aerienne", f)}
            />
            <ImageEncadre
              titre="Plan de situation"
              path={saved.images?.situation}
              modifiable={isAmo}
              busy={imageBusy === "situation"}
              onChoisir={(f) => void choisirImage("situation", f)}
            />
          </div>

          {SECTIONS_FICHE.map((sec) => (
            <div key={sec.id} style={{ marginTop: 26 }}>
              <div className="se-eyebrow" style={{ marginBottom: 10 }}>{sec.titre}</div>
              {sec.id === "occupation" && (
                <div className="se-small" style={{ margin: "0 0 12px", color: "var(--fg-muted)" }}>
                  {occ ? (
                    <>
                      Issu du rapport d'enquête sociale du {fmtDateHeure(occ.genereLe)}
                      {occ.genereParNom ? ` (${occ.genereParNom})` : ""} - occupation connue par l'enquête pour {occ.sources.enquete},
                      déduite de l'adresse postale pour {occ.sources.adresse}, inconnue pour {occ.sources.inconnu} propriétaire
                      {occ.sources.inconnu > 1 ? "s" : ""}.
                      {occ.inconnus.length > 0 && <> Occupation inconnue : {occ.inconnus.join(", ")}.</>}
                      {occ.mixtes.length > 0 && <> Occupants et bailleurs à la fois : {occ.mixtes.join(", ")}.</>}
                      {occupationDepassee && (
                        <span style={{ display: "block", marginTop: 6, color: "var(--color-warning-700, #b54708)", fontWeight: 600 }}>
                          L'enquête a évolué depuis ce rapport : régénérez le rapport d'enquête sociale pour mettre la fiche à jour.{" "}
                          <a href={`/copros/${c.id}/enquete`}>Onglet Enquête</a>
                        </span>
                      )}
                    </>
                  ) : isAmo ? (
                    <>
                      En attente du rapport d'enquête sociale : générez-le depuis l'onglet{" "}
                      <a href={`/copros/${c.id}/enquete`}>Enquête</a> du dossier, ses chiffres alimentent cette rubrique.
                    </>
                  ) : (
                    "En attente du rapport d'enquête sociale : Strat Eco reporte ici les chiffres de l'enquête menée auprès des copropriétaires."
                  )}
                </div>
              )}
              {sec.groupes.map((g, gi) => (
                <div key={gi} style={{ marginTop: gi ? 16 : 0 }}>
                  {g.titre && <div style={{ fontWeight: 700, fontSize: 14, margin: "0 0 8px" }}>{g.titre}</div>}
                  {g.note && (
                    <p className="se-small" style={{ margin: "0 0 10px", color: "var(--fg-muted)" }}>
                      {g.note}
                    </p>
                  )}
                  <div className="form-grid">
                    {g.champs.map((ch) => (
                      <ChampSaisie
                        key={ch.key}
                        ch={ch}
                        valeur={brutes[ch.key] ?? ""}
                        modifiable={modifiable(ch)}
                        manquant={tentative && manquantsSet.has(ch.key)}
                        onChange={(v) => setChamp(ch.key, v)}
                      />
                    ))}
                  </div>
                </div>
              ))}

              {sec.id === "bati" && (
                <div style={{ marginTop: 18 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, margin: "0 0 8px" }}>
                    Étiquette énergétique avant travaux, par {lb.singulier.toLowerCase()}
                    {!isAmo && <span className="hint" style={{ fontWeight: 400, color: "var(--fg-muted)" }}> - renseigné par Strat Eco depuis l'audit</span>}
                  </div>
                  <div className="tablewrap">
                    <table className="dossiers" style={{ fontSize: 13 }}>
                      <thead>
                        <tr>
                          <th>{lb.singulier}</th>
                          <th>Logements</th>
                          <th>Étiquette avant travaux</th>
                          <th>Gain énergétique &gt; 35 % après travaux</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lignesEtiq.map((l) => (
                          <tr key={l.code} style={{ cursor: "default" }}>
                            <td style={{ fontWeight: 600 }}>{l.code === "-" ? (l.compteBatiment ? "Copropriété" : lb.sans) : `${lb.court} ${l.code}`}</td>
                            <td>{l.logements}</td>
                            <td>
                              <select
                                className="edit-inp"
                                value={l.etiquette ?? ""}
                                disabled={!isAmo}
                                onChange={(ev) => setEtiq(l.code, { etiquette: ev.target.value || null })}
                              >
                                <option value="">-</option>
                                {ETIQUETTES.map((x) => (
                                  <option key={x} value={x}>
                                    {x}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td>
                              <input type="checkbox" checked={l.gain35} disabled={!isAmo} onChange={(ev) => setEtiq(l.code, { gain35: ev.target.checked })} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="se-small" style={{ color: "var(--fg-muted)", marginBottom: 0 }}>
                    Report sur la fiche :{" "}
                    {ETIQUETTES.filter((x) => brutes[`etiq_log_${x}`])
                      .map((x) => `${x} - ${brutes[`etiq_bat_${x}`] || 0} bât. / ${brutes[`etiq_log_${x}`]} logements`)
                      .join(" ; ") || "aucune étiquette"}
                    {" "}- gain &gt; 35 % : {brutes.nb_bat_gain35 || 0} bât. / {brutes.nb_log_gain35 || 0} logements.
                  </p>
                </div>
              )}
            </div>
          ))}

          {message && (
            <p className="se-small" style={{ color: message.ok ? "var(--color-success-700, #067647)" : "var(--color-error-700)", marginTop: 18 }}>
              {message.texte}
            </p>
          )}
          {lienTest && (
            <p className="se-small" style={{ color: "var(--color-warning-500)" }}>
              Mode test (aucun e-mail réel) - lien du président : <a href={lienTest}>{lienTest}</a>
            </p>
          )}

          <div style={{ display: "flex", gap: 10, marginTop: 22, alignItems: "center", flexWrap: "wrap" }}>
            <button className="se-btn se-btn-secondary btn-sm" disabled={enregistrer.isPending || !dirty} onClick={() => void executer(() => sauver())}>
              Enregistrer
            </button>
            {isAmo ? (
              <button className="se-btn se-btn-primary btn-sm" disabled={enregistrer.isPending || action.isPending} onClick={() => void envoyerEnSignature()}>
                <Icon name="send" size={15} />
                {statut === "valide" ? "Renvoyer le lien au président" : "Valider et envoyer en signature"}
              </button>
            ) : (
              <button className="se-btn se-btn-primary btn-sm" disabled={enregistrer.isPending} onClick={() => void transmettre()}>
                <Icon name="send" size={15} />
                {statut === "valide" ? "Enregistrer les modifications" : statut === "transmis" ? "Mettre à jour et retransmettre" : "Transmettre à Strat Eco"}
              </button>
            )}
            {(enregistrer.isPending || action.isPending) && <span className="se-small" style={{ color: "var(--fg-muted)" }}>Enregistrement…</span>}
          </div>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 24 }}>
        <div className="p-head">
          <Icon name="edit" size={18} />
          <h3>Signatures électroniques</h3>
          <span style={{ flex: 1 }}></span>
          {deuxSignees ? <Badge kind="success">Fiche signée</Badge> : <Badge kind="warn">{statut === "valide" ? "En signature" : "Après validation de Strat Eco"}</Badge>}
        </div>
        <div className="p-body">
          <p className="se-small" style={{ marginTop: 0, color: "var(--fg-muted)" }}>
            Le président du conseil syndical signe depuis le lien reçu par e-mail, le syndic depuis cet écran, dans l'ordre
            qui leur convient : case « Je certifie exacts les renseignements de cette fiche », puis code à usage unique reçu par
            e-mail. Une modification ultérieure de la fiche ne demande pas de nouvelle signature.
          </p>
          {ROLES.map(({ role, label }) => {
            const sg = sigPar(role);
            return (
              <div className="kv" key={role}>
                <span className="k">{label}</span>
                <span className="v" style={{ fontWeight: 500, textAlign: "right" }}>
                  {sg?.signe_le ? (
                    <>
                      <Badge kind="success" dot>
                        Signé le {fmtDateHeure(sg.signe_le)}
                      </Badge>{" "}
                      {sg.nom}
                    </>
                  ) : sg ? (
                    <>
                      En attente - {sg.nom || "-"}
                      {role === "president_cs" && sg.lien_envoye_le ? ` (lien envoyé le ${fmtDateHeure(sg.lien_envoye_le)})` : ""}
                    </>
                  ) : (
                    <span style={{ color: "var(--fg-muted)" }}>Pas encore envoyé</span>
                  )}
                </span>
              </div>
            );
          })}

          {!isAmo && statut === "valide" && sigSyndic && !sigSyndic.signe_le && (
            <div style={{ marginTop: 16, borderTop: "1px solid var(--border)", paddingTop: 16 }}>
              {!otp ? (
                <>
                  <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14, cursor: "pointer", marginBottom: 12 }}>
                    <input type="checkbox" checked={attestation} onChange={(ev) => setAttestation(ev.target.checked)} style={{ marginTop: 3 }} />
                    <span>
                      <b>Je certifie exacts les renseignements de cette fiche.</b> (au nom de {c.syndic_name ?? "mon cabinet"})
                    </span>
                  </label>
                  <button
                    className="se-btn se-btn-primary btn-sm"
                    disabled={!attestation || action.isPending}
                    onClick={() =>
                      void executer(async () => {
                        const r = await action.mutateAsync({ action: "syndic_otp_demander", attestation: true });
                        setOtp({ canal: r.canal as string, codeTest: r.code_test as string | undefined });
                      })
                    }
                  >
                    <Icon name="lock" size={15} />
                    {action.isPending ? "Envoi du code…" : "Recevoir mon code de signature"}
                  </button>
                </>
              ) : (
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <span className="se-small">
                    {otp.canal === "email" ? "Code envoyé à l'adresse de votre compte (valable 10 minutes)." : "Mode test : aucun envoi réel."}
                    {otp.codeTest && (
                      <>
                        {" "}
                        Code de test : <b>{otp.codeTest}</b>
                      </>
                    )}
                  </span>
                  <input
                    className="edit-inp"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    placeholder="6 chiffres"
                    value={code}
                    onChange={(ev) => setCode(ev.target.value.replace(/\D/g, "").slice(0, 6))}
                    style={{ width: 120, letterSpacing: 4 }}
                  />
                  <button
                    className="se-btn se-btn-primary btn-sm"
                    disabled={code.length !== 6 || action.isPending}
                    onClick={() =>
                      void executer(async () => {
                        await action.mutateAsync({ action: "syndic_otp_valider", code });
                        setOtp(null);
                        setCode("");
                        setMessage({ ok: true, texte: "Votre signature est enregistrée." });
                      })
                    }
                  >
                    <Icon name="checkCircle" size={15} />
                    Signer la fiche
                  </button>
                </div>
              )}
            </div>
          )}

          {deuxSignees && (
            <div style={{ marginTop: 16, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <button className="se-btn se-btn-primary btn-sm" disabled={deposer.isPending || dirty} onClick={() => void deposerSignee()}>
                <Icon name="fileCheck" size={15} />
                {deposer.isPending ? "Dépôt…" : "Générer le PDF signé et le déposer au dossier ANAH"}
              </button>
              {dirty && <span className="se-small" style={{ color: "var(--fg-muted)" }}>Enregistrez d'abord vos modifications.</span>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

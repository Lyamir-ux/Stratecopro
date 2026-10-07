// Vérification RGE d'une entreprise (07/10/2026, demande d'Amir) : au dépôt
// d'un devis ou d'une DPGF de travaux, depuis la ligne d'un devis déjà déposé,
// ou depuis la fiche d'une entreprise de la Base prestataires.
// Lit la liste officielle des entreprises RGE de l'ADEME : qualifications en
// cours, domaines de travaux, organisme, dates de validité, lien du
// certificat ; compare les domaines à l'objet du document (lot ou prestation)
// et à sa date. Dans un dossier, chaque lecture est tracée (0146) et le
// certificat PDF s'archive dans « Marchés de travaux » en un clic.
// Maître d'œuvre (0147) : depuis « Mes projets », la trace se rattache à son
// document de projet et le certificat rejoint ses documents de projet.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Icon } from "@/components/Icon";
import { Modal } from "@/components/Modal";
import { Badge } from "@/components/ui";
import {
  rechercherEntreprisesRge,
  useArchiverCertificatRge,
  useArchiverCertificatRgeProjet,
  useEnregistrerVerificationRge,
  useLectureRge,
  type VerificationRge,
} from "@/api/rge";
import { messageErreur } from "@/lib/erreurs";
import type { Tables } from "@/lib/database.types";
import {
  analyserLignesRge,
  aujourdhui,
  chiffres,
  couvertureDomaines,
  dateFr,
  domainesAttendus,
  enCours,
  formaterSiret,
  memeDomaine,
  normaliserTexte,
  situationADate,
  siretValide,
  type CertificatRge,
  type EtablissementRge,
  type EtatValidite,
} from "@/lib/rge";

export interface ContexteDossierRge {
  coproId: string;
  /** Préfixe du nom des fichiers (nom court de la copropriété). */
  prefixe: string | null;
  /** Document vérifié (devis, DPGF) : la trace lui est rattachée - fichier du dossier… */
  fichierId?: string | null;
  /** … ou document de projet déposé par le maître d'œuvre. */
  projetDocId?: string | null;
  /** Maître d'œuvre connecté : le certificat s'archive dans ses documents de
   *  projet (partagés avec Strat Eco) au lieu des fichiers du dossier. */
  presta?: Tables<"prestataires">;
}

interface PanneauProps {
  siretInitial?: string | null;
  /** Émetteur du document : recherche par nom quand le SIRET est inconnu. */
  nomInitial?: string | null;
  /** Lot ou prestation du document : domaines RGE attendus. */
  objet?: string | null;
  /** Le lot se saisit dans la fenêtre (dépôt du MOE, sans champ « Objet »). */
  objetModifiable?: boolean;
  /** Date du document (AAAA-MM-JJ). */
  dateDocument?: string | null;
  /** Code postal de la copropriété : établissements du département d'abord. */
  codePostalCopro?: string | null;
  /** Dans un dossier : trace de la vérification et archivage du certificat. */
  dossier?: ContexteDossierRge;
  /** SIRET en cours de lecture dans le PDF déposé. */
  lectureSiret?: boolean;
  /** Le SIRET pré-rempli a été lu dans le PDF. */
  siretLuDansPdf?: boolean;
  /** Fiche prestataire : reprendre le SIRET de l'établissement trouvé. */
  reprendreSiret?: (siret: string) => void;
}

const BADGE_ETAT: Record<EtatValidite, "success" | "warn" | "neutral" | "blue"> = {
  valide: "success",
  bientot: "warn",
  expiree: "neutral",
  future: "blue",
};

function texteEtat(etat: EtatValidite, debut: string | null, fin: string | null): string {
  if (etat === "expiree") return fin ? `Échu le ${dateFr(fin)}` : "Échu";
  if (etat === "future") return debut ? `À partir du ${dateFr(debut)}` : "À venir";
  if (etat === "bientot") return `Expire le ${dateFr(fin)}`;
  return fin ? `Valable jusqu'au ${dateFr(fin)}` : "En cours";
}

function Encadre({ ton, children }: { ton: "ok" | "alerte" | "erreur" | "neutre"; children: ReactNode }) {
  const couleurs = {
    ok: ["var(--color-success-50)", "var(--color-success-700)"],
    alerte: ["var(--color-warning-50)", "var(--color-warning-700)"],
    erreur: ["var(--color-error-50)", "var(--color-error-700)"],
    neutre: ["var(--bg-soft)", "var(--fg2)"],
  }[ton];
  return (
    <div
      style={{
        background: couleurs[0],
        color: couleurs[1],
        borderRadius: "var(--radius-md)",
        padding: "10px 12px",
        fontSize: 13.5,
        lineHeight: 1.45,
        marginTop: 10,
      }}
    >
      {children}
    </div>
  );
}

export function PanneauVerificationRge({
  siretInitial,
  nomInitial,
  objet: objetInitial,
  objetModifiable,
  dateDocument,
  codePostalCopro,
  dossier,
  lectureSiret,
  siretLuDansPdf,
  reprendreSiret,
}: PanneauProps) {
  const initial = siretValide(siretInitial) ? chiffres(siretInitial) : null;
  const [saisie, setSaisie] = useState(initial ? formaterSiret(initial) : (nomInitial ?? "").trim());
  const [siret, setSiret] = useState<string | null>(initial);
  const [candidats, setCandidats] = useState<EtablissementRge[] | null>(null);
  const [recherche, setRecherche] = useState(false);
  const [erreurRecherche, setErreurRecherche] = useState<string | null>(null);
  const [archives, setArchives] = useState<Record<string, string>>({});
  const [erreursArchive, setErreursArchive] = useState<Record<string, string>>({});
  const [archivage, setArchivage] = useState<string | null>(null);
  const [objet, setObjet] = useState(objetInitial ?? "");

  // SIRET lu dans le PDF après l'ouverture (lecture asynchrone) : vérification lancée d'office
  useEffect(() => {
    if (!siret && siretValide(siretInitial)) {
      const s = chiffres(siretInitial);
      setSaisie(formaterSiret(s));
      setSiret(s);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siretInitial]);

  const lecture = useLectureRge(siret, codePostalCopro);
  const date = aujourdhui();
  const resultat = useMemo(() => (lecture.data ? analyserLignesRge(lecture.data.lignes, date) : null), [lecture.data, date]);
  const attendus = useMemo(() => domainesAttendus(objet), [objet]);
  const couverture = useMemo(() => couvertureDomaines(resultat, attendus), [resultat, attendus]);
  const situation = useMemo(() => situationADate(resultat, dateDocument), [resultat, dateDocument]);

  // Lot saisi dans la fenêtre : pris en compte une fois la frappe terminée
  const [objetStable, setObjetStable] = useState(objet);
  useEffect(() => {
    const t = setTimeout(() => setObjetStable(objet), objetModifiable ? 1200 : 0);
    return () => clearTimeout(t);
  }, [objet, objetModifiable]);

  // Trace de chaque établissement vérifié sur un document du dossier (une fois
  // par établissement et par lot saisi, pendant l'ouverture de la fenêtre)
  const enregistrer = useEnregistrerVerificationRge(dossier?.coproId ?? "");
  const traces = useRef(new Set<string>());
  useEffect(() => {
    if (!dossier || !lecture.data) return;
    const cle = `${lecture.data.siret}|${normaliserTexte(objetStable)}`;
    if (traces.current.has(cle)) return;
    traces.current.add(cle);
    enregistrer.mutate({
      fichierId: dossier.fichierId ?? null,
      projetDocId: dossier.projetDocId ?? null,
      resultat,
      siret: lecture.data.siret,
      objet: objetStable.trim() || null,
      dateDocument: dateDocument ?? null,
      domainesManquants: couvertureDomaines(resultat, domainesAttendus(objetStable))
        .filter((c) => !c.couvert)
        .map((c) => c.domaine),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lecture.data, resultat, objetStable]);

  const lancer = async () => {
    setErreurRecherche(null);
    const t = saisie.trim();
    if (siretValide(t)) {
      setCandidats(null);
      setSiret(chiffres(t));
      return;
    }
    if (chiffres(t).length >= 9 && /^[\d\s.]+$/.test(t)) {
      setErreurRecherche("Un SIRET compte 14 chiffres.");
      return;
    }
    setRecherche(true);
    try {
      setCandidats(await rechercherEntreprisesRge(t, codePostalCopro));
    } catch (e) {
      setErreurRecherche(messageErreur(e, "Recherche impossible."));
    } finally {
      setRecherche(false);
    }
  };

  // Pas de SIRET dans le document : recherche par le nom de l'émetteur, une fois la lecture finie
  const rechercheAuto = useRef(false);
  useEffect(() => {
    if (lectureSiret || rechercheAuto.current || siret || siretValide(siretInitial) || (nomInitial ?? "").trim().length < 2) return;
    rechercheAuto.current = true;
    void lancer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lectureSiret, siretInitial]);

  const choisir = (e: EtablissementRge) => {
    setCandidats(null);
    setSaisie(formaterSiret(e.siret));
    setSiret(e.siret);
  };

  const archiverDossier = useArchiverCertificatRge(dossier?.coproId ?? "", dossier?.prefixe ?? null);
  const archiverProjet = useArchiverCertificatRgeProjet(dossier?.presta, dossier?.coproId ?? "", dossier?.prefixe ?? null);
  const archiver = dossier?.presta ? archiverProjet : archiverDossier;
  const libelleArchive = dossier?.presta ? "Archiver dans les documents du projet" : "Archiver dans le dossier";
  const libelleArchiveFait = dossier?.presta ? "Archivé dans les documents du projet" : "Archivé dans « Marchés de travaux »";
  const archiverCertificat = async (c: CertificatRge) => {
    if (!dossier || !c.url || !resultat) return;
    setArchivage(c.url);
    setErreursArchive((x) => ({ ...x, [c.url!]: "" }));
    try {
      const nom = await archiver.mutateAsync({ siret: resultat.siret, entreprise: resultat.entreprise, certificat: c });
      setArchives((x) => ({ ...x, [c.url!]: nom }));
    } catch (e) {
      setErreursArchive((x) => ({ ...x, [c.url!]: messageErreur(e, "Archivage impossible : ouvrez le lien.") }));
    } finally {
      setArchivage(null);
    }
  };

  const listeEtablissements = (liste: EtablissementRge[]) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6 }}>
      {liste.map((e) => (
        <button
          key={e.siret}
          type="button"
          className="se-btn se-btn-ghost btn-sm"
          style={{ justifyContent: "flex-start", textAlign: "left", height: "auto", padding: "6px 8px" }}
          onClick={() => choisir(e)}
        >
          <Icon name="building" size={14} />
          <span>
            <b>{e.nom || "Sans nom"}</b>
            <span style={{ color: "var(--fg-muted)" }}>
              {" "}
              · {[e.codePostal, e.commune].filter(Boolean).join(" ")} · SIRET {formaterSiret(e.siret)}
            </span>
          </span>
        </button>
      ))}
    </div>
  );

  return (
    <div>
      <div className="cs-field">
        <label>
          SIRET ou nom de l'entreprise
          {siretLuDansPdf && siret && (
            <span style={{ color: "var(--color-warning-700)", fontWeight: 500 }} title="Lu dans le PDF déposé : à vérifier">
              {" "}
              · lu dans le PDF
            </span>
          )}
          {lectureSiret && <span style={{ color: "var(--fg-muted)", fontWeight: 400 }}> · lecture du PDF…</span>}
        </label>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            className="edit-inp"
            style={{ maxWidth: "none", flex: 1 }}
            value={saisie}
            placeholder="804 192 631 00013 ou raison sociale"
            onChange={(e) => setSaisie(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void lancer();
            }}
          />
          <button type="button" className="se-btn se-btn-secondary" disabled={recherche || !saisie.trim()} onClick={() => void lancer()}>
            <Icon name="search" size={15} />
            {recherche ? "Recherche…" : "Vérifier"}
          </button>
        </div>
      </div>

      {objetModifiable && (
        <div className="cs-field" style={{ marginTop: 10 }}>
          <label>
            Lot ou travaux du devis{" "}
            <span style={{ color: "var(--fg-muted)", fontWeight: 400 }}>· pour comparer aux domaines RGE de l'entreprise</span>
          </label>
          <input
            className="edit-inp"
            style={{ maxWidth: "none", width: "100%" }}
            value={objet}
            placeholder="Isolation ITE, menuiseries, VMC…"
            onChange={(e) => setObjet(e.target.value)}
          />
        </div>
      )}

      {erreurRecherche && <Encadre ton="erreur">{erreurRecherche}</Encadre>}

      {candidats && (
        <Encadre ton="neutre">
          {candidats.length === 0 ? (
            <>Aucune entreprise RGE de ce nom. Essayez une autre orthographe, ou le SIRET indiqué sur le devis.</>
          ) : (
            <>
              {candidats.length > 12
                ? "Nombreux établissements RGE de ce nom (département de la copropriété en tête) : choisissez celui du devis, ou précisez le nom."
                : `${candidats.length} établissement${candidats.length > 1 ? "s" : ""} RGE trouvé${candidats.length > 1 ? "s" : ""} : choisissez celui du devis.`}
              {listeEtablissements(candidats.slice(0, 12))}
            </>
          )}
        </Encadre>
      )}

      {!candidats && siret && lecture.isLoading && (
        <p className="se-small" style={{ color: "var(--fg-muted)", marginTop: 10 }}>
          Interrogation de la liste RGE de l'ADEME…
        </p>
      )}
      {!candidats && lecture.error && <Encadre ton="erreur">{messageErreur(lecture.error, "La liste RGE ne répond pas.")}</Encadre>}

      {!candidats && lecture.data && !resultat && (
        <Encadre ton="erreur">
          <b>
            <Icon name="alert" size={14} /> SIRET {formaterSiret(lecture.data.siret)} absent de la liste des entreprises RGE.
          </b>
          {lecture.data.autresEtablissements.length > 0 ? (
            <>
              <br />
              La même entreprise a d'autres établissements RGE : vérifiez celui qui réalise les travaux.
              {listeEtablissements(lecture.data.autresEtablissements.slice(0, 8))}
            </>
          ) : (
            <>
              <br />
              Aucun établissement RGE pour cette entreprise : vérifiez le SIRET du devis ou demandez l'attestation à l'entreprise.
            </>
          )}
        </Encadre>
      )}

      {!candidats && resultat && (
        <>
          <Encadre ton={resultat.rge ? "ok" : "erreur"}>
            <b>
              <Icon name={resultat.rge ? "checkCircle" : "alert"} size={14} />{" "}
              {resultat.rge ? "Entreprise RGE" : "Plus aucune qualification RGE en cours"} - {resultat.entreprise}
            </b>
            <br />
            <span style={{ color: "var(--fg2)" }}>
              SIRET {formaterSiret(resultat.siret)}
              {resultat.adresse ? ` · ${resultat.adresse}` : ""}
            </span>
            {reprendreSiret && resultat.siret !== chiffres(siretInitial) && (
              <>
                {" "}
                <button type="button" className="se-btn se-btn-ghost btn-sm" onClick={() => reprendreSiret(resultat.siret)}>
                  <Icon name="check" size={13} />
                  Reprendre ce SIRET dans la fiche
                </button>
              </>
            )}
            {!resultat.rge && lecture.data && lecture.data.autresEtablissements.length > 0 && (
              <>
                <br />
                Autres établissements RGE de la même entreprise :
                {listeEtablissements(lecture.data.autresEtablissements.slice(0, 8))}
              </>
            )}
          </Encadre>

          {objet.trim() && (
            <Encadre ton={couverture.length === 0 ? "neutre" : couverture.every((c) => c.couvert) ? "ok" : "alerte"}>
              Objet du document : <b>« {objet.trim()} »</b>
              {couverture.length === 0 ? (
                <>
                  <br />
                  Domaine de travaux non reconnu dans l'objet : comparez avec les qualifications ci-dessous.
                </>
              ) : (
                couverture.map((c) => (
                  <div key={c.domaine} style={{ marginTop: 3 }}>
                    <Icon name={c.couvert ? "check" : "alert"} size={13} /> {c.domaine} :{" "}
                    <b>{c.couvert ? "couvert" : "aucune qualification RGE en cours"}</b>
                  </div>
                ))
              )}
            </Encadre>
          )}

          {situation === "anterieur" && (
            <Encadre ton="alerte">
              Le document du {dateFr(dateDocument)} précède la qualification en cours : demandez à l'entreprise l'attestation RGE
              valable à cette date.
            </Encadre>
          )}
          {situation === "posterieur" && (
            <Encadre ton="alerte">Le document du {dateFr(dateDocument)} est postérieur à la fin des qualifications RGE connues.</Encadre>
          )}
          {situation === "couvert" && resultat.rge && (
            <p className="se-small" style={{ margin: "8px 0 0", color: "var(--fg-muted)" }}>
              <Icon name="check" size={12} /> Qualification déjà en cours à la date du document ({dateFr(dateDocument)}).
            </p>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
            {resultat.certificats.map((c) => {
              const cle = c.url ?? c.libelle;
              return (
                <div key={cle} className="panel" style={{ padding: "10px 12px", opacity: enCours(c.etat) ? 1 : 0.7 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <b style={{ fontSize: 14 }}>{c.organisme}</b>
                    {c.libelle !== c.organisme && <span style={{ color: "var(--fg-muted)", fontSize: 12.5 }}>{c.libelle}</span>}
                    <Badge kind={BADGE_ETAT[c.etat]}>{texteEtat(c.etat, c.debut, c.fin)}</Badge>
                    <span style={{ flex: 1 }}></span>
                    {c.url && (
                      <a className="se-btn se-btn-ghost btn-sm" href={c.url} target="_blank" rel="noopener noreferrer">
                        <Icon name="externalLink" size={13} />
                        Voir le certificat
                      </a>
                    )}
                    {dossier && c.url && c.pdf && enCours(c.etat) && (
                      archives[c.url] ? (
                        <span className="se-small" style={{ color: "var(--color-success-700)" }} title={archives[c.url]}>
                          <Icon name="check" size={13} /> {libelleArchiveFait}
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="se-btn se-btn-secondary btn-sm"
                          disabled={archivage != null}
                          onClick={() => void archiverCertificat(c)}
                        >
                          <Icon name="download" size={13} />
                          {archivage === c.url ? "Archivage…" : libelleArchive}
                        </button>
                      )
                    )}
                  </div>
                  {c.url && erreursArchive[c.url] && (
                    <p className="se-small" style={{ margin: "6px 0 0", color: "var(--color-error-700)" }}>
                      {erreursArchive[c.url]}
                    </p>
                  )}
                  <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 13, lineHeight: 1.5 }}>
                    {c.qualifications.map((q) => {
                      const attendu = q.domaines.some((d) => attendus.some((a) => memeDomaine(a, d)));
                      return (
                        <li
                          key={`${q.code}|${q.debut}|${q.fin}`}
                          style={{ color: enCours(q.etat) ? undefined : "var(--fg-muted)", fontWeight: attendu && enCours(q.etat) ? 600 : undefined }}
                        >
                          {q.domaines.join(" ; ") || "Domaine non renseigné"}
                          <span style={{ color: "var(--fg-muted)", fontWeight: 400 }}>
                            {" "}
                            - {q.nom}
                            {!enCours(q.etat) ? ` (${texteEtat(q.etat, q.debut, q.fin).toLowerCase()})` : ""}
                          </span>
                          {attendu && enCours(q.etat) && (
                            <span style={{ color: "var(--color-success-700)" }}>
                              {" "}
                              <Icon name="check" size={12} />
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        </>
      )}

      <p className="se-small" style={{ margin: "12px 0 0", color: "var(--fg-muted)" }}>
        Source : liste des entreprises RGE de l'ADEME (data.gouv.fr), mise à jour chaque jour - lue le {dateFr(date)}.
        {dossier && " Chaque vérification est gardée dans le dossier."}
      </p>
    </div>
  );
}

/** Fenêtre de vérification (dépôt d'un devis, ligne d'un devis déjà déposé).
 *  `lireSiret` : lecture du SIRET dans le document, lancée à l'ouverture. */
export function VerificationRgeDialog({
  onClose,
  nomFichier,
  libelleFermer = "Fermer",
  lireSiret,
  ...props
}: PanneauProps & {
  onClose: () => void;
  nomFichier?: string;
  libelleFermer?: string;
  lireSiret?: () => Promise<string | null>;
}) {
  const [lu, setLu] = useState<string | null>(null);
  const [lecture, setLecture] = useState(!!lireSiret && !siretValide(props.siretInitial));
  useEffect(() => {
    if (!lecture || !lireSiret) return;
    let actif = true;
    void lireSiret()
      .catch(() => null)
      .then((s) => {
        if (!actif) return;
        setLu(s);
        setLecture(false);
      });
    return () => {
      actif = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const siretInitial = siretValide(props.siretInitial) ? props.siretInitial : lu;
  return (
    <Modal title="Vérification RGE de l'entreprise" onClose={onClose} width={760} closeOnBackdrop={false}>
      {nomFichier && (
        <p className="se-small" style={{ margin: "0 0 12px", color: "var(--fg-muted)" }}>
          <Icon name="fileText" size={13} /> Document : <b>{nomFichier}</b>
        </p>
      )}
      <div style={{ maxHeight: "64vh", overflowY: "auto", paddingRight: 2 }}>
        <PanneauVerificationRge
          {...props}
          siretInitial={siretInitial}
          lectureSiret={lecture}
          siretLuDansPdf={!siretValide(props.siretInitial) && !!lu}
        />
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
        <span style={{ flex: 1 }}></span>
        <button className="se-btn se-btn-primary" onClick={onClose}>
          {libelleFermer}
        </button>
      </div>
    </Modal>
  );
}

/** Ligne d'état RGE sous un SIRET (questionnaire éco-PTZ) : RGE ou non, domaine du lot couvert ou non. */
export function StatutRgeCompact({ siret, objet }: { siret: string | null | undefined; objet?: string | null }) {
  const lecture = useLectureRge(siretValide(siret) ? chiffres(siret) : null);
  const resultat = useMemo(() => (lecture.data ? analyserLignesRge(lecture.data.lignes) : null), [lecture.data]);
  const couverture = useMemo(() => couvertureDomaines(resultat, domainesAttendus(objet)), [resultat, objet]);
  if (!siretValide(siret)) return null;
  const style = { margin: "6px 0 0", fontSize: 12.5 } as const;
  if (lecture.isLoading) return <p style={{ ...style, color: "var(--fg-muted)" }}>Vérification RGE…</p>;
  if (lecture.error) return <p style={{ ...style, color: "var(--fg-muted)" }}>Liste RGE indisponible pour l'instant.</p>;
  if (!resultat)
    return (
      <p style={{ ...style, color: "var(--color-error-700)" }}>
        <Icon name="alert" size={12} /> SIRET absent de la liste des entreprises RGE (ADEME).
      </p>
    );
  if (!resultat.rge)
    return (
      <p style={{ ...style, color: "var(--color-error-700)" }}>
        <Icon name="alert" size={12} /> {resultat.entreprise} : plus aucune qualification RGE en cours.
      </p>
    );
  const manquants = couverture.filter((c) => !c.couvert);
  const couverts = couverture.filter((c) => c.couvert).map((c) => c.domaine);
  return (
    <p style={{ ...style, color: manquants.length ? "var(--color-warning-700)" : "var(--color-success-700)" }}>
      <Icon name={manquants.length ? "alert" : "checkCircle"} size={12} /> {resultat.entreprise} : RGE
      {couverts.length > 0 ? ` - ${couverts.join(", ")}` : ""}
      {manquants.length > 0 ? ` - pas de qualification en cours pour « ${manquants.map((m) => m.domaine).join(" », « ")} »` : ""}
    </p>
  );
}

/** Bulle de la pastille RGE d'un document : dernière vérification. */
export function resumeVerificationRge(v: VerificationRge): string {
  const quand = dateFr(v.verifie_le.slice(0, 10));
  const qui = `${v.entreprise ?? "Entreprise"} (SIRET ${formaterSiret(v.siret)})`;
  if (!v.rge) return `${qui} : aucune qualification RGE en cours - vérifié le ${quand}`;
  const manque = v.domaines_manquants.length ? ` - non couvert : ${v.domaines_manquants.join(", ")}` : "";
  return `${qui} : RGE ${v.domaines_valides.join(", ")}${manque} - vérifié le ${quand}`;
}

/** Pastille RGE d'un devis (RGE, RGE partiel, Non RGE), ou bouton « Vérifier RGE » s'il n'a pas été vérifié. */
export function BoutonRge({ verification: v, onClick }: { verification: VerificationRge | undefined; onClick: () => void }) {
  return (
    <button
      type="button"
      className="se-btn se-btn-ghost btn-sm"
      style={{ flex: "none", whiteSpace: "nowrap" }}
      title={v ? resumeVerificationRge(v) : "Vérifier que l'entreprise est RGE, pour quels domaines, et archiver son certificat"}
      onClick={onClick}
    >
      {!v ? (
        <>
          <Icon name="search" size={13} />
          Vérifier RGE
        </>
      ) : !v.rge ? (
        <Badge kind="warn">Non RGE</Badge>
      ) : v.domaines_manquants.length ? (
        <Badge kind="warn">RGE partiel</Badge>
      ) : (
        <Badge kind="success">RGE</Badge>
      )}
    </button>
  );
}

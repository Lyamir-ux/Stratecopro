// Fenêtres de la facturation directe (0115) - demande d'Amir du 28/09/2026,
// partagées par le bloc « Honoraires AMO » de l'onglet Projet et la frise
// du menu Facturation.
//
// Un clic sur un jalon ouvre la bonne fenêtre :
//   - à facturer : confirmation (contre le mauvais clic) puis brouillon ;
//   - brouillon : aperçu PDF à vérifier, adresse du syndic, numéro de
//     référence ou d'ordre de service et texte libre sous les articles
//     (0135), « Valider et envoyer » (numéro, PDF classé dans les fichiers,
//     e-mail au gestionnaire ou à Hellio, chef de projet et dirigeant en
//     copie) ;
//   - facturé : pour le dirigeant, « Paiement reçu » (la bulle passe au vert),
//     pour les autres, la facture ;
//   - émise : PDF, avoir, reprise d'un envoi interrompu.
import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { Modal } from "@/components/Modal";
import { Badge, type BadgeKind } from "@/components/ui";
import { useAuth } from "@/auth/AuthProvider";
import {
  urlPdfPiece,
  useAnnulerPaiement,
  useCreerAvoir,
  useCreerBrouillon,
  useFactures,
  useJournalFacturation,
  useMarquerPaye,
  useModifierBrouillon,
  useParametresFacturation,
  useSupprimerBrouillon,
  useTerminerEnvoi,
  useValiderEtEnvoyer,
  type ResultatEmission,
} from "@/api/factures";
import { messageErreur } from "@/lib/erreurs";
import { libelleJalon, type JalonHonoraires } from "@/lib/facturation";
import {
  LIBELLE_ETAT_PIECE,
  LIBELLE_REFERENCE_CLIENT,
  LONGUEUR_REFERENCE_CLIENT,
  LONGUEUR_TEXTE_LIBRE,
  avoirDe,
  dateFr,
  etatPiece,
  euros,
  libelleType,
  piecesDuJalon,
  type EtatPiece,
  type PieceFacture,
  type TypeReferenceClient,
} from "@/lib/factureDoc";

export interface CoproFacturation {
  id: string;
  name: string;
}

const BADGE_ETAT: Record<EtatPiece, BadgeKind> = {
  brouillon: "blue",
  a_envoyer: "warn",
  envoi_erreur: "warn",
  envoyee: "neutral",
  payee: "success",
  annulee: "neutral",
};

/** Date du jour (fuseau de l'appareil) au format AAAA-MM-JJ. */
function aujourdhui(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const ttc = (ht: number) => Math.round(ht * 120) / 100;

// ---------- point d'entrée : clic sur un jalon ----------

type Vue = { type: "confirmer" } | { type: "piece"; id: string } | { type: "paiement" } | { type: "info" };

/** Ouvre la fenêtre qui correspond à l'état du jalon et au rôle de la personne. */
export function FacturationJalon({ copro, jalon, onClose }: { copro: CoproFacturation; jalon: JalonHonoraires; onClose: () => void }) {
  const { profile } = useAuth();
  const { data: pieces, isLoading } = useFactures();
  const creer = useCreerBrouillon();
  const [vue, setVue] = useState<Vue | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const dirigeant = !!profile?.dirigeant;

  const { brouillon, facture } = useMemo(() => piecesDuJalon(pieces ?? [], copro.id, jalon.code), [pieces, copro.id, jalon.code]);

  // première vue, une fois les pièces chargées
  useEffect(() => {
    if (vue || isLoading || !pieces) return;
    if (jalon.etat === "a_facturer") {
      if (!brouillon) {
        setVue({ type: "confirmer" });
        return;
      }
      // rouvrir le brouillon le remet d'aplomb si le montant du jalon a changé
      creer
        .mutateAsync({ coproId: copro.id, jalon: jalon.code })
        .then((id) => setVue({ type: "piece", id }))
        .catch((e) => setErreur(messageErreur(e, "Le brouillon n'a pas pu être ouvert.")));
      setVue({ type: "info" });
      return;
    }
    if (jalon.etat === "facture" && dirigeant) setVue({ type: "paiement" });
    else if (facture) setVue({ type: "piece", id: facture.id });
    else setVue({ type: "info" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, pieces]);

  if (!vue) return null;
  if (vue.type === "confirmer")
    return (
      <ConfirmerFacturation
        copro={copro}
        jalon={jalon}
        onClose={onClose}
        onCree={(id) => setVue({ type: "piece", id })}
      />
    );
  if (vue.type === "piece")
    return <FenetrePiece pieceId={vue.id} copro={copro} onClose={onClose} onOuvrir={(id) => setVue({ type: "piece", id })} onPaiement={() => setVue({ type: "paiement" })} jalon={jalon} />;
  if (vue.type === "paiement")
    return (
      <FenetrePaiement
        copro={copro}
        jalon={jalon}
        facture={facture}
        onClose={onClose}
        onVoir={facture ? () => setVue({ type: "piece", id: facture.id }) : undefined}
      />
    );
  return <FenetreInfo copro={copro} jalon={jalon} erreur={erreur} chargement={creer.isPending} onClose={onClose} />;
}

// ---------- confirmation avant brouillon ----------

function ConfirmerFacturation({
  copro,
  jalon,
  onClose,
  onCree,
}: {
  copro: CoproFacturation;
  jalon: JalonHonoraires;
  onClose: () => void;
  onCree: (id: string) => void;
}) {
  const creer = useCreerBrouillon();
  const [erreur, setErreur] = useState<string | null>(null);
  const cee = jalon.code.startsWith("FCEE");
  const montant = jalon.montant ?? 0;

  const confirmer = async () => {
    setErreur(null);
    try {
      onCree(await creer.mutateAsync({ coproId: copro.id, jalon: jalon.code }));
    } catch (e) {
      setErreur(messageErreur(e, "Le brouillon n'a pas pu être créé."));
    }
  };

  return (
    <Modal title={`Facturer le jalon ${libelleJalon(jalon.code)}`} onClose={onClose} width={500} closeOnBackdrop={false}>
      <p className="se-small" style={{ margin: 0 }}>
        Un brouillon de facture va être préparé pour <b>{copro.name}</b>. Rien n'est envoyé à cette étape : vous vérifiez
        d'abord l'aperçu, puis vous validez.
      </p>
      <table className="fact-apercu">
        <tbody>
          <tr>
            <td>Jalon</td>
            <td className="r fort">{libelleJalon(jalon.code)}</td>
          </tr>
          <tr>
            <td>Montant</td>
            <td className="r fort">{euros(montant)} HT - {euros(ttc(montant))} TTC</td>
          </tr>
          <tr>
            <td>Client</td>
            <td className="r">{cee ? "Hellio (honoraires CEE)" : `SDC ${copro.name.toUpperCase()} p/a le syndic`}</td>
          </tr>
        </tbody>
      </table>
      {erreur && <p className="fact-erreur">{erreur}</p>}
      <div className="fact-modal-actions">
        <button type="button" className="se-btn se-btn-ghost btn-sm" onClick={onClose}>Annuler</button>
        <button type="button" className="se-btn se-btn-primary btn-sm" onClick={() => void confirmer()} disabled={creer.isPending}>
          <Icon name="fileText" size={14} /> {creer.isPending ? "Préparation…" : "Préparer le brouillon"}
        </button>
      </div>
    </Modal>
  );
}

// ---------- aperçu et actions d'une pièce ----------

/** Aperçu PDF : pour une pièce émise, le PDF classé fait foi ; sinon il est généré à la volée. */
function useApercu(piece: PieceFacture | null, origine: PieceFacture | null) {
  const [url, setUrl] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const cle = piece
    ? [piece.id, piece.statut, piece.client_adresse, piece.reference_client, piece.reference_client_type, piece.texte_libre, piece.pdf_path, piece.total_ht].join("|")
    : "";
  useEffect(() => {
    if (!piece) return;
    let annule = false;
    let blob: string | null = null;
    setErreur(null);
    (async () => {
      try {
        const stocke = piece.statut === "emise" ? await urlPdfPiece(piece) : null;
        if (stocke) {
          if (!annule) setUrl(stocke);
          return;
        }
        const { genererFacturePdf } = await import("@/lib/pdf/facture");
        const bytes = await genererFacturePdf(piece, { origine: origine ? { numero: origine.numero, date_emission: origine.date_emission } : null });
        blob = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
        if (!annule) setUrl(blob);
      } catch (e) {
        if (!annule) setErreur(messageErreur(e, "L'aperçu n'a pas pu être généré."));
      }
    })();
    return () => {
      annule = true;
      if (blob) setTimeout(() => URL.revokeObjectURL(blob!), 30_000);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cle]);
  return { url, erreur };
}

function FenetrePiece({
  pieceId,
  copro,
  jalon,
  onClose,
  onOuvrir,
  onPaiement,
}: {
  pieceId: string;
  copro: CoproFacturation;
  jalon: JalonHonoraires | null;
  onClose: () => void;
  onOuvrir: (id: string) => void;
  onPaiement?: () => void;
}) {
  const { profile } = useAuth();
  const { data: pieces } = useFactures();
  const { data: parametres } = useParametresFacturation();
  const piece = pieces?.find((p) => p.id === pieceId) ?? null;
  const origine = piece?.facture_origine_id ? (pieces?.find((p) => p.id === piece.facture_origine_id) ?? null) : null;
  const { url, erreur: erreurApercu } = useApercu(piece, origine);

  if (!pieces) return null;
  if (!piece)
    return (
      <Modal title="Pièce introuvable" onClose={onClose} width={460}>
        <p className="se-small" style={{ margin: 0 }}>Ce brouillon a été validé ou supprimé entre-temps.</p>
      </Modal>
    );

  const etat = etatPiece(piece, pieces);
  const titre = piece.statut === "brouillon"
    ? `Brouillon ${piece.type === "avoir" ? "d'avoir" : "de facture"} - ${libelleJalon(piece.jalon)}`
    : `${libelleType(piece.type)} ${piece.numero}`;

  return (
    <Modal title={titre} onClose={onClose} width={1080} closeOnBackdrop={false}>
      <div className="fz-grille">
        <div className="fz-apercu">
          {url ? (
            <iframe title="Aperçu de la pièce" src={url}></iframe>
          ) : (
            <div className="fz-apercu-vide">{erreurApercu ?? "Préparation de l'aperçu…"}</div>
          )}
        </div>
        <div className="fz-cote">
          <div className="fz-etat">
            <Badge kind={BADGE_ETAT[etat]}>{LIBELLE_ETAT_PIECE[etat]}</Badge>
            {piece.test && <span className="fz-test">Test</span>}
          </div>
          <dl className="fz-infos">
            <dt>Copropriété</dt>
            <dd>{copro.name}</dd>
            <dt>Jalon</dt>
            <dd>{libelleJalon(piece.jalon)}{piece.nature === "cee" ? " - honoraires CEE" : ""}</dd>
            <dt>Montant</dt>
            <dd>{euros(piece.total_ht)} HT - <b>{euros(piece.total_ttc)} TTC</b></dd>
            {piece.statut === "emise" && piece.reference_client && (
              <>
                <dt>{LIBELLE_REFERENCE_CLIENT[piece.reference_client_type]}</dt>
                <dd>{piece.reference_client}</dd>
              </>
            )}
            <dt>Envoyée à</dt>
            <dd>
              {piece.destinataire_email ?? <span className="fz-manque">aucun e-mail</span>}
              {piece.destinataire_nom ? ` (${piece.destinataire_nom})` : ""}
              <small>Copie : chef de projet du dossier et direction</small>
            </dd>
            {piece.statut === "emise" && (
              <>
                <dt>Émise le</dt>
                <dd>{dateFr(piece.date_emission)}{piece.date_echeance ? `, échéance le ${dateFr(piece.date_echeance)}` : ""}</dd>
              </>
            )}
            {piece.envoi_le && (
              <>
                <dt>E-mail</dt>
                <dd>
                  {piece.envoi_statut === "envoye" ? "Envoyé" : piece.envoi_statut === "simule" ? "Envoi simulé" : "Non parti"} le{" "}
                  {new Date(piece.envoi_le).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
                  {piece.envoi_detail && <small>{piece.envoi_detail}</small>}
                </dd>
              </>
            )}
            {piece.payee_le && (
              <>
                <dt>Payée le</dt>
                <dd>{dateFr(piece.payee_le)}</dd>
              </>
            )}
            {origine && (
              <>
                <dt>Annule</dt>
                <dd>{origine.numero}</dd>
              </>
            )}
          </dl>
          {piece.statut === "brouillon" ? (
            <ActionsBrouillon piece={piece} copro={copro} prochain={parametres ?? null} onClose={onClose} />
          ) : (
            <ActionsEmise
              piece={piece}
              pieces={pieces}
              copro={copro}
              url={url}
              dirigeant={!!profile?.dirigeant}
              jalon={jalon}
              onOuvrir={onOuvrir}
              onPaiement={onPaiement}
            />
          )}
        </div>
      </div>
    </Modal>
  );
}

function ActionsBrouillon({
  piece,
  copro,
  prochain,
  onClose,
}: {
  piece: PieceFacture;
  copro: CoproFacturation;
  prochain: { mode: string; prochain_facture: number; prochain_avoir: number } | null;
  onClose: () => void;
}) {
  const modifier = useModifierBrouillon();
  const supprimer = useSupprimerBrouillon();
  const valider = useValiderEtEnvoyer();
  const [adresse, setAdresse] = useState(piece.client_adresse ?? "");
  const [refClient, setRefClient] = useState(piece.reference_client ?? "");
  const [refType, setRefType] = useState<TypeReferenceClient>(piece.reference_client_type ?? "reference");
  const [texte, setTexte] = useState(piece.texte_libre ?? "");
  const [confirmation, setConfirmation] = useState<"valider" | "supprimer" | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [resultat, setResultat] = useState<ResultatEmission | null>(null);
  const amo = piece.nature === "amo";
  const adresseModifiee = adresse.trim() !== (piece.client_adresse ?? "").trim();
  const saisieModifiee =
    adresseModifiee ||
    refClient.trim() !== (piece.reference_client ?? "").trim() ||
    refType !== piece.reference_client_type ||
    texte.trim() !== (piece.texte_libre ?? "").trim();
  const saisie = { id: piece.id, adresse, referenceClient: refClient, referenceClientType: refType, texteLibre: texte };
  const adresseManquante = amo && !adresse.trim();
  const sansEmail = !piece.destinataire_email;
  const numero = !prochain
    ? "le numéro suivant"
    : prochain.mode === "test"
      ? "un numéro de test"
      : piece.type === "avoir"
        ? `AVR${String(prochain.prochain_avoir).padStart(8, "0")}`
        : `FAC${String(prochain.prochain_facture).padStart(8, "0")}`;

  if (resultat) return <ResultatValidation r={resultat} copro={copro} onClose={onClose} />;

  const enregistrer = async () => {
    setErreur(null);
    try {
      await modifier.mutateAsync(saisie);
    } catch (e) {
      setErreur(messageErreur(e, "Les modifications n'ont pas pu être enregistrées."));
    }
  };

  const confirmerValidation = async () => {
    setErreur(null);
    try {
      if (saisieModifiee) await modifier.mutateAsync(saisie);
      setResultat(await valider.mutateAsync({ id: piece.id, nomCopro: copro.name }));
    } catch (e) {
      setConfirmation(null);
      setErreur(messageErreur(e, "La validation a échoué : rien n'a été émis."));
    }
  };

  const confirmerSuppression = async () => {
    setErreur(null);
    try {
      await supprimer.mutateAsync(piece.id);
      onClose();
    } catch (e) {
      setErreur(messageErreur(e, "Le brouillon n'a pas pu être supprimé."));
    }
  };

  return (
    <div className="fz-actions">
      {amo && piece.type === "facture" && (
        <div className="fld" style={{ marginBottom: 0 }}>
          <label htmlFor="fz-adresse">Adresse du syndic (P/A {piece.client_pa ?? "syndic"})</label>
          <textarea
            id="fz-adresse"
            rows={3}
            value={adresse}
            onChange={(e) => setAdresse(e.target.value)}
            placeholder={"14 quai Mullenheim\n67083 Strasbourg"}
          />
          <span className="hint">Une ligne par ligne d'adresse, sans le pays. Gardée pour les prochaines factures de l'enseigne.</span>
        </div>
      )}
      <div className="fld" style={{ marginBottom: 0 }}>
        <label htmlFor="fz-ref">Y a-t-il un numéro de référence ?</label>
        <div className="fz-ref">
          <select aria-label="Type de numéro" value={refType} onChange={(e) => setRefType(e.target.value as TypeReferenceClient)}>
            {(Object.keys(LIBELLE_REFERENCE_CLIENT) as TypeReferenceClient[]).map((t) => (
              <option key={t} value={t}>{LIBELLE_REFERENCE_CLIENT[t]}</option>
            ))}
          </select>
          <input
            id="fz-ref"
            type="text"
            value={refClient}
            maxLength={LONGUEUR_REFERENCE_CLIENT}
            onChange={(e) => setRefClient(e.target.value)}
            placeholder="Facultatif"
          />
        </div>
        <span className="hint">
          Laissez vide s'il n'y en a pas. Imprimé sous la référence {piece.type === "avoir" ? "de l'avoir" : "de la facture"}.
        </span>
      </div>
      <div className="fld" style={{ marginBottom: 0 }}>
        <label htmlFor="fz-texte">Texte libre sous les articles</label>
        <textarea
          id="fz-texte"
          rows={3}
          value={texte}
          maxLength={LONGUEUR_TEXTE_LIBRE}
          onChange={(e) => setTexte(e.target.value)}
          placeholder="Facultatif"
        />
        <span className="hint">
          Imprimé sous les articles de vente. {texte.length} / {LONGUEUR_TEXTE_LIBRE} caractères.
        </span>
      </div>
      {saisieModifiee && (
        <button type="button" className="se-btn se-btn-secondary btn-sm" onClick={() => void enregistrer()} disabled={modifier.isPending}>
          <Icon name="refresh" size={14} /> {modifier.isPending ? "Enregistrement…" : "Mettre à jour l'aperçu"}
        </button>
      )}
      {sansEmail && (
        <p className="fact-alerte">
          <Icon name="alert" size={14} /> Aucun e-mail de destinataire : renseignez l'e-mail du gestionnaire dans la fiche du dossier.
        </p>
      )}
      {erreur && <p className="fact-erreur">{erreur}</p>}

      {confirmation === "valider" ? (
        <div className="fz-confirmation">
          <p>
            La {piece.type === "avoir" ? "pièce" : "facture"} reçoit <b>{numero}</b>, datée d'aujourd'hui, puis part par e-mail à{" "}
            <b>{piece.destinataire_email}</b>. Une pièce validée ne peut plus être modifiée ni supprimée
            {piece.type === "facture" ? " : seul un avoir peut l'annuler." : "."}
          </p>
          <div className="fz-boutons">
            <button type="button" className="se-btn se-btn-ghost btn-sm" onClick={() => setConfirmation(null)} disabled={valider.isPending}>Revenir</button>
            <button type="button" className="se-btn se-btn-primary btn-sm" onClick={() => void confirmerValidation()} disabled={valider.isPending}>
              <Icon name="send" size={14} /> {valider.isPending ? "Validation et envoi…" : "Confirmer l'envoi"}
            </button>
          </div>
        </div>
      ) : confirmation === "supprimer" ? (
        <div className="fz-confirmation">
          <p>Supprimer ce brouillon ? Le jalon reste à facturer.</p>
          <div className="fz-boutons">
            <button type="button" className="se-btn se-btn-ghost btn-sm" onClick={() => setConfirmation(null)}>Garder</button>
            <button type="button" className="se-btn se-btn-secondary btn-sm" onClick={() => void confirmerSuppression()} disabled={supprimer.isPending}>
              <Icon name="trash" size={14} /> Supprimer
            </button>
          </div>
        </div>
      ) : (
        <div className="fz-boutons">
          <button type="button" className="se-btn se-btn-ghost btn-sm" onClick={() => setConfirmation("supprimer")}>
            <Icon name="trash" size={14} /> Supprimer le brouillon
          </button>
          <button
            type="button"
            className="se-btn se-btn-primary btn-sm"
            onClick={() => setConfirmation("valider")}
            disabled={adresseManquante || sansEmail}
            title={adresseManquante ? "Complétez l'adresse du syndic" : undefined}
          >
            <Icon name="check" size={14} /> Valider et envoyer
          </button>
        </div>
      )}
    </div>
  );
}

function ResultatValidation({ r, copro, onClose }: { r: ResultatEmission; copro: CoproFacturation; onClose: () => void }) {
  const terminer = useTerminerEnvoi();
  const [dernier, setDernier] = useState(r);
  const etapes: { label: string; ok: boolean }[] = [
    { label: `Numéro ${dernier.piece.numero} attribué`, ok: true },
    { label: "PDF classé dans les fichiers (dossier Facturation)", ok: !!dernier.piece.pdf_path },
    {
      label: dernier.envoi === "simule" ? "E-mail simulé (clé d'envoi absente)" : `E-mail envoyé à ${dernier.piece.destinataire_email}`,
      ok: dernier.envoi === "envoye" || dernier.envoi === "simule",
    },
  ];
  return (
    <div className="fz-actions">
      <ul className="fz-etapes">
        {etapes.map((e) => (
          <li key={e.label} className={e.ok ? "ok" : "ko"}>
            <Icon name={e.ok ? "check" : "alert"} size={14} /> {e.label}
          </li>
        ))}
      </ul>
      {dernier.echec && (
        <p className="fact-erreur">
          {dernier.echec.message} La pièce est émise : « Terminer l'envoi » reprend là où l'envoi s'est arrêté.
        </p>
      )}
      <div className="fz-boutons">
        {dernier.echec && (
          <button
            type="button"
            className="se-btn se-btn-secondary btn-sm"
            disabled={terminer.isPending}
            onClick={() => void terminer.mutateAsync({ piece: dernier.piece, nomCopro: copro.name }).then(setDernier)}
          >
            <Icon name="refresh" size={14} /> {terminer.isPending ? "Reprise…" : "Terminer l'envoi"}
          </button>
        )}
        <button type="button" className="se-btn se-btn-primary btn-sm" onClick={onClose}>Fermer</button>
      </div>
    </div>
  );
}

function ActionsEmise({
  piece,
  pieces,
  copro,
  url,
  dirigeant,
  jalon,
  onOuvrir,
  onPaiement,
}: {
  piece: PieceFacture;
  pieces: PieceFacture[];
  copro: CoproFacturation;
  url: string | null;
  dirigeant: boolean;
  jalon: JalonHonoraires | null;
  onOuvrir: (id: string) => void;
  onPaiement?: () => void;
}) {
  const creerAvoir = useCreerAvoir();
  const terminer = useTerminerEnvoi();
  const annulerPaiement = useAnnulerPaiement();
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const etat = etatPiece(piece, pieces);
  const avoir = piece.type === "facture" ? avoirDe(piece, pieces) : null;
  const avoirBrouillon = pieces.find((p) => p.type === "avoir" && p.statut === "brouillon" && p.facture_origine_id === piece.id) ?? null;

  const faireAvoir = async () => {
    setErreur(null);
    try {
      onOuvrir(await creerAvoir.mutateAsync(piece.id));
    } catch (e) {
      setErreur(messageErreur(e, "L'avoir n'a pas pu être préparé."));
    }
  };

  const reprendre = async () => {
    setErreur(null);
    setMessage(null);
    try {
      const r = await terminer.mutateAsync({ piece, nomCopro: copro.name });
      if (r.echec) setErreur(r.echec.message);
      else setMessage(r.envoi === "simule" ? "Envoi simulé." : `E-mail envoyé à ${r.piece.destinataire_email}.`);
    } catch (e) {
      setErreur(messageErreur(e, "L'envoi n'a pas pu être repris."));
    }
  };

  return (
    <div className="fz-actions">
      {erreur && <p className="fact-erreur">{erreur}</p>}
      {message && <p className="fact-note" style={{ marginTop: 0 }}>{message}</p>}
      <div className="fz-boutons colonne">
        {url && (
          <a className="se-btn se-btn-secondary btn-sm" href={url} target="_blank" rel="noreferrer">
            <Icon name="download" size={14} /> Ouvrir le PDF
          </a>
        )}
        {(etat === "a_envoyer" || etat === "envoi_erreur") && (
          <button type="button" className="se-btn se-btn-primary btn-sm" onClick={() => void reprendre()} disabled={terminer.isPending}>
            <Icon name="send" size={14} /> {terminer.isPending ? "Envoi…" : "Terminer l'envoi"}
          </button>
        )}
        {dirigeant && onPaiement && piece.type === "facture" && !avoir && !piece.payee_le && jalon?.etat === "facture" && (
          <button type="button" className="se-btn se-btn-primary btn-sm" onClick={onPaiement}>
            <Icon name="checkCircle" size={14} /> Paiement reçu
          </button>
        )}
        {piece.type === "facture" && !avoir && (
          <button
            type="button"
            className="se-btn se-btn-ghost btn-sm"
            onClick={() => (avoirBrouillon ? onOuvrir(avoirBrouillon.id) : void faireAvoir())}
            disabled={creerAvoir.isPending}
          >
            <Icon name="undo" size={14} /> {avoirBrouillon ? "Reprendre le brouillon d'avoir" : "Faire un avoir"}
          </button>
        )}
        {avoir && (
          <button type="button" className="se-btn se-btn-ghost btn-sm" onClick={() => onOuvrir(avoir.id)}>
            <Icon name="fileText" size={14} /> Voir l'avoir {avoir.numero}
          </button>
        )}
        {dirigeant && piece.type === "facture" && piece.payee_le && !avoir && (
          <button
            type="button"
            className="se-btn se-btn-ghost btn-sm"
            disabled={annulerPaiement.isPending}
            onClick={() =>
              void annulerPaiement
                .mutateAsync({ coproId: piece.copro_id, jalon: piece.jalon })
                .catch((e) => setErreur(messageErreur(e, "Le paiement n'a pas pu être annulé.")))
            }
            title="Remet la facture en attente de paiement (bulle orange)"
          >
            <Icon name="undo" size={14} /> Annuler le paiement
          </button>
        )}
      </div>
      {piece.type === "facture" && !avoir && (
        <p className="fact-note">Un avoir annule toute la facture et remet le jalon à facturer.</p>
      )}
    </div>
  );
}

// ---------- paiement (dirigeant) ----------

function FenetrePaiement({
  copro,
  jalon,
  facture,
  onClose,
  onVoir,
}: {
  copro: CoproFacturation;
  jalon: JalonHonoraires;
  facture: PieceFacture | null;
  onClose: () => void;
  onVoir?: () => void;
}) {
  const payer = useMarquerPaye();
  const [date, setDate] = useState(aujourdhui());
  const [erreur, setErreur] = useState<string | null>(null);
  const montant = jalon.montant ?? 0;

  const confirmer = async () => {
    setErreur(null);
    try {
      await payer.mutateAsync({ coproId: copro.id, jalon: jalon.code, date });
      onClose();
    } catch (e) {
      setErreur(messageErreur(e, "Le paiement n'a pas pu être enregistré."));
    }
  };

  return (
    <Modal title={`Paiement reçu - ${libelleJalon(jalon.code)}`} onClose={onClose} width={500} closeOnBackdrop={false}>
      <p className="se-small" style={{ margin: 0 }}>
        {copro.name} :{" "}
        {facture ? (
          <>facture <b>{facture.numero}</b> du {dateFr(facture.date_emission)}, <b>{euros(facture.total_ttc)} TTC</b>.</>
        ) : (
          <>jalon facturé hors logiciel, {euros(montant)} HT.</>
        )}{" "}
        Le jalon passera « Encaissé » (bulle verte).
      </p>
      <div className="fld" style={{ marginTop: 16 }}>
        <label htmlFor="fz-date-paiement">Date du paiement</label>
        <input id="fz-date-paiement" type="date" value={date} max={aujourdhui()} onChange={(e) => setDate(e.target.value)} />
      </div>
      {erreur && <p className="fact-erreur">{erreur}</p>}
      <div className="fact-modal-actions">
        {onVoir && (
          <button type="button" className="se-btn se-btn-ghost btn-sm" onClick={onVoir} style={{ marginRight: "auto" }}>
            <Icon name="eye" size={14} /> Voir la facture
          </button>
        )}
        <button type="button" className="se-btn se-btn-ghost btn-sm" onClick={onClose}>Annuler</button>
        <button type="button" className="se-btn se-btn-primary btn-sm" onClick={() => void confirmer()} disabled={!date || payer.isPending}>
          <Icon name="checkCircle" size={14} /> {payer.isPending ? "Enregistrement…" : "Confirmer le paiement"}
        </button>
      </div>
    </Modal>
  );
}

// ---------- jalon sans pièce dans le logiciel ----------

function FenetreInfo({
  copro,
  jalon,
  erreur,
  chargement,
  onClose,
}: {
  copro: CoproFacturation;
  jalon: JalonHonoraires;
  erreur: string | null;
  chargement: boolean;
  onClose: () => void;
}) {
  const { profile } = useAuth();
  const { data: journal } = useJournalFacturation();
  const annuler = useAnnulerPaiement();
  const [err, setErr] = useState<string | null>(null);
  const dernier = journal?.find((e) => e.copro_id === copro.id && e.jalon === jalon.code && ["paiement", "paiement_annule", "validation"].includes(e.action));
  const peutAnnuler = !!profile?.dirigeant && jalon.etat === "encaisse" && dernier?.action === "paiement";

  if (chargement) return <Modal title={`Jalon ${libelleJalon(jalon.code)}`} onClose={onClose} width={460}><p className="se-small" style={{ margin: 0 }}>Ouverture du brouillon…</p></Modal>;

  return (
    <Modal title={`Jalon ${libelleJalon(jalon.code)}`} onClose={onClose} width={480}>
      {erreur ? (
        <p className="fact-erreur" style={{ marginTop: 0 }}>{erreur}</p>
      ) : (
        <p className="se-small" style={{ margin: 0 }}>
          {jalon.etat === "encaisse" ? "Jalon encaissé" : "Jalon facturé, en attente de paiement"} ({euros(jalon.montant ?? 0)} HT).
          La facture a été émise avant la facturation dans le logiciel : elle n'y figure pas.
        </p>
      )}
      {err && <p className="fact-erreur">{err}</p>}
      <div className="fact-modal-actions">
        {peutAnnuler && (
          <button
            type="button"
            className="se-btn se-btn-ghost btn-sm"
            disabled={annuler.isPending}
            onClick={() =>
              void annuler
                .mutateAsync({ coproId: copro.id, jalon: jalon.code })
                .then(onClose)
                .catch((e) => setErr(messageErreur(e, "Le paiement n'a pas pu être annulé.")))
            }
          >
            <Icon name="undo" size={14} /> Annuler le paiement saisi
          </button>
        )}
        <button type="button" className="se-btn se-btn-primary btn-sm" onClick={onClose}>Fermer</button>
      </div>
    </Modal>
  );
}

/** Ouvre directement une pièce (journal de facturation). */
export function FenetrePieceSeule({ piece, copro, jalon, onClose }: { piece: PieceFacture; copro: CoproFacturation; jalon: JalonHonoraires | null; onClose: () => void }) {
  const [id, setId] = useState(piece.id);
  const [paiement, setPaiement] = useState(false);
  if (paiement && jalon) return <FenetrePaiement copro={copro} jalon={jalon} facture={piece} onClose={onClose} onVoir={() => setPaiement(false)} />;
  return <FenetrePiece pieceId={id} copro={copro} jalon={jalon} onClose={onClose} onOuvrir={setId} onPaiement={() => setPaiement(true)} />;
}

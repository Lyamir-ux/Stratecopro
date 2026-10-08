// Mon financement : fonds propres, prêt collectif (banque + durée fixées par
// l'AMO - CEGEE/Domofinance, durée votée en AG) ou éco-PTZ individuel.
//
// Éco-PTZ individuel (Amir, 02/10/2026) : la durée n'est plus demandée (elle se
// fixe avec la banque) ; le copropriétaire choisit ses logements (lots
// d'habitation, annexes rattachées comprises) et Strat Eco prépare le CERFA
// Annexe 3.1 et l'attestation des montants éligibles, signés électroniquement
// par les entreprises, l'auditeur et le syndic, puis remis dans « Documents ».
//
// Adhésion au prêt collectif (Amir, 22/09 puis 08/10/2026) : « Adhérer au prêt
// collectif » enregistre le choix, puis
//  - si l'AMO a saisi le lien de souscription de la banque : ouvre ce lien, la
//    banque mène tout le dossier de prêt (le lien l'emporte) ;
//  - sinon, une fois la campagne ouverte par l'AMO (adhesion_ouverte) : dossier
//    d'adhésion du portail - bulletin pré-rempli et mandat SEPA signés
//    électroniquement (Adhesion.tsx) ;
//  - sinon : le choix est enregistré, l'ouverture est annoncée.
// Un dossier déjà engagé dans le portail reste affiché dans tous les cas.
//
// Choix transmis (feedback PIERRE PIERRE 30/09/2026) : récapitulatif de ce qui a
// été choisi, et modification possible jusqu'à la date limite fixée par l'AMO
// (copro_financement_config.date_limite_choix, 0117 - refusée côté serveur au-delà).
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { fmtDate, fmtEuro } from "@/lib/format";
import {
  computeIndiv,
  lotTantiemes,
  totalTantiemes,
  useFinancementConfig,
  useSaveChoix,
  type ChoixFinancement,
  type Membership,
  type Scenario,
  type TypeFinancement,
} from "@/api/portail";
import { readParams } from "@/api/scenarios";
import { ecoPtzPossible, MOTIF_SANS_ECO_PTZ } from "@/lib/financement";
import { useAuth } from "@/auth/AuthProvider";
import { MentionsPrudence } from "./Mentions";
import { DocumentsEcoPtz } from "./Documents";
import { Adhesion } from "./Adhesion";
import type { Bareme, Profil } from "@/lib/finance";
import type { Tables } from "@/lib/database.types";
import type { SectionId } from "./index";

const BANQUE_LABEL: Record<string, string> = {
  CEGEE: "Caisse d'Epargne Grand Est Europe (CEGEE)",
  DOMOFINANCE: "Domofinance",
};

const LIBELLE_CHOIX: Record<TypeFinancement, string> = {
  collectif: "Prêt collectif",
  individuel: "Éco-PTZ individuel",
  fonds: "Fonds propres",
};

/** Date du jour à Paris, au format AAAA-MM-JJ (comparable à une colonne date). */
function aujourdhuiParis(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
}

/** Ouvre le parcours de la banque dans un nouvel onglet - appelé dans le clic
 *  lui-même (pas après la mutation) pour ne pas être bloqué comme une pop-up. */
function ouvrirBanque(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}

export function Financement({
  membership,
  scenario,
  bareme,
  plan,
  profil,
  choix,
  go,
}: {
  membership: Membership;
  scenarios: Scenario[];
  scenario: Scenario | null;
  bareme: Bareme | null;
  plan: Tables<"plans_individuels"> | null;
  profil: Profil | null;
  choix: ChoixFinancement | null;
  go?: (s: SectionId) => void;
}) {
  const { session } = useAuth();
  const lots = membership.lots;
  const { data: config } = useFinancementConfig(membership.copro.id);
  const [editing, setEditing] = useState(false);
  // Garages, caves et autres lots sans lot d'habitation : l'éco-PTZ (collectif
  // comme individuel) leur est fermé, les fonds propres sont le seul choix
  // (bug d'Amir du 05/10/2026).
  const ecoPtz = ecoPtzPossible(lots);
  const [type, setType] = useState<TypeFinancement>(ecoPtz ? (choix?.type ?? "collectif") : "fonds");
  // éco-PTZ individuel : un prêt par logement (lot d'habitation et ses annexes rattachées)
  const logements = lots.filter((l) => l.usage === "habitation");
  const [selLots, setSelLots] = useState<string[]>(() => {
    const deja = (choix?.lot_ids ?? []).filter((id) => logements.some((l) => l.id === id));
    return deja.length ? deja : logements.map((l) => l.id);
  });
  const save = useSaveChoix(scenario?.id ?? "", membership.coproprietaireId);

  if (!scenario || !bareme) {
    return (
      <div className="fade">
        <h1 className="sec-title">Mon financement</h1>
        <div className="cc-next">
          <Icon name="alert" size={15} className="ico" style={{ color: "var(--color-warning-500)" }} />
          <span>Le choix de financement sera ouvert quand votre AMO aura partagé le plan de financement.</span>
        </div>
      </div>
    );
  }

  const params = readParams(scenario.params, bareme);
  const cle = params.cle;
  // On finance le reste avant travaux : les CEE, versés à la fin du chantier,
  // n'en font pas partie (ils arrivent après).
  const indiv = computeIndiv(scenario, bareme, plan, totalTantiemes(lots, cle), profil);
  const montant = indiv.resteAvantTravaux;
  const dureeCollectif = config?.duree_annees ?? 15;
  const lienBanque = config?.lien_adhesion ?? null;
  // Parcours du portail : campagne ouverte par l'AMO et pas de lien banque
  const adhesionPortail = !lienBanque && !!config?.adhesion_ouverte;
  const banqueNom = config ? BANQUE_LABEL[config.banque] : "la banque partenaire";
  const mensualiteCollectif = montant / (dureeCollectif * 12);
  // Date limite fixée par l'AMO : le jour même est encore ouvert.
  const dateLimite = config?.date_limite_choix ?? null;
  const modifiable = !dateLimite || aujourdhuiParis() <= dateLimite;
  const toggleLot = (id: string) =>
    setSelLots((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const transmit = (t: TypeFinancement) => {
    if (!ecoPtz && t !== "fonds") return;
    // Adhésion au prêt collectif : on enregistre le choix (le suivi AMO en vit)
    // et on envoie aussitôt vers la banque, qui instruit le dossier de prêt.
    if (t === "collectif" && lienBanque) ouvrirBanque(lienBanque);
    save.mutate(
      {
        type: t,
        dureeAnnees: t === "collectif" ? dureeCollectif : null,
        lotIds: t === "individuel" ? selLots : [],
      },
      { onSuccess: () => setEditing(false) }
    );
  };

  // ---------- Choix déjà transmis ----------
  if (choix && !editing) {
    const lotsChoisis = lots.filter((l) => choix.lot_ids.includes(l.id));
    return (
      <div className="fade">
        <h1 className="sec-title">Mon financement</h1>
        <div className="card-xl fade" style={{ maxWidth: choix.type === "collectif" ? undefined : 660 }}>
          <div className="cx-body choix-transmis">
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: "50%",
                background: "var(--color-success-500)",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 18px",
              }}
            >
              <Icon name="check" size={32} />
            </div>
            <div className="se-eyebrow" style={{ justifyContent: "center" }}>Votre choix est transmis</div>
            <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 24, margin: "6px 0 8px" }}>
              {choix.type === "collectif"
                ? `Prêt collectif ${config?.banque ?? "CEGEE"}`
                : LIBELLE_CHOIX[choix.type]}
            </h2>
            {choix.saisi_par !== "copro" && (
              <p className="se-small" style={{ color: "var(--fg-muted)", margin: "0 0 10px" }}>
                Ce choix a été enregistré pour vous par {choix.saisi_par === "syndic" ? "votre syndic" : "votre AMO"}.
              </p>
            )}
            <div className="choix-recap">
              <div className="kv">
                <span className="k">Mode de financement</span>
                <span className="v">{LIBELLE_CHOIX[choix.type]}</span>
              </div>
              {choix.type === "collectif" && (
                <div className="kv">
                  <span className="k">Durée</span>
                  <span className="v">{choix.duree_annees ?? dureeCollectif} ans</span>
                </div>
              )}
              {choix.type === "individuel" && (
                <div className="kv">
                  <span className="k">{lotsChoisis.length > 1 ? "Lots" : "Lot"}</span>
                  <span className="v">{lotsChoisis.map((l) => "n°" + l.num).join(", ") || "-"}</span>
                </div>
              )}
              <div className="kv">
                <span className="k">Reste à financer avant travaux</span>
                <span className="v">{fmtEuro(montant)}</span>
              </div>
              <div className="kv">
                <span className="k">Transmis le</span>
                <span className="v">{fmtDate(choix.transmitted_at)}</span>
              </div>
            </div>
            <p className="se-body" style={{ maxWidth: 520, margin: "0 auto 20px" }}>
              {choix.type === "fonds" ? (
                <>Vous financez votre reste à charge de <b>{fmtEuro(montant)}</b> sur <b>fonds propres</b>, selon l'échéancier d'appels de fonds du syndic.</>
              ) : choix.type === "individuel" ? (
                <>
                  Votre demande d'<b>éco-PTZ individuel</b> pour {lotsChoisis.length > 1 ? "les lots " : "le lot "}
                  {lotsChoisis.map((l) => "n°" + l.num).join(", ")} est transmise à votre AMO. Strat Eco prépare le
                  formulaire CERFA de l'éco-PTZ et l'attestation des montants éligibles de votre logement, signés par
                  les entreprises, l'auditeur et votre syndic : vous les retrouverez dans l'onglet Documents, à
                  remettre à votre banque.
                </>
              ) : (
                <>
                  Vous avez choisi le <b>prêt collectif {config?.banque ?? "CEGEE"}</b> sur{" "}
                  <b>{choix.duree_annees ?? dureeCollectif} ans</b>, pour tout ou partie de votre quote-part : jusqu'à{" "}
                  <b>{fmtEuro(montant)}</b> ({fmtEuro(montant / (Math.max(1, choix.duree_annees ?? dureeCollectif) * 12))}/mois
                  pour la totalité, 0 %).
                </>
              )}
            </p>
            {!ecoPtz && choix.type !== "fonds" && (
              <div className="cc-next" style={{ textAlign: "left", maxWidth: 520, margin: "0 auto 16px" }}>
                <Icon name="alert" size={15} className="ico" style={{ color: "var(--color-warning-500)" }} />
                <span>
                  {MOTIF_SANS_ECO_PTZ} Ce choix ne peut donc pas être maintenu
                  {modifiable ? " : cliquez sur « Modifier mon choix » pour confirmer les fonds propres." : ". Écrivez à votre AMO."}
                </span>
              </div>
            )}
            {modifiable ? (
              <>
                <button className="se-btn se-btn-secondary" onClick={() => setEditing(true)}>
                  <Icon name="edit" size={16} />
                  Modifier mon choix
                </button>
                <p className="se-small" style={{ color: "var(--fg-muted)", margin: "10px 0 0" }}>
                  {dateLimite ? (
                    <>
                      Vous pouvez modifier votre choix jusqu'au <b>{fmtDate(dateLimite)}</b> inclus.
                    </>
                  ) : (
                    "Vous pouvez encore modifier votre choix."
                  )}
                </p>
              </>
            ) : (
              <div className="cc-next" style={{ textAlign: "left", maxWidth: 520, margin: "0 auto" }}>
                <Icon name="lock" size={15} className="ico" />
                <span>
                  La date limite pour modifier votre choix était le <b>{dateLimite ? fmtDate(dateLimite) : ""}</b>.
                  Pour tout changement, écrivez à votre AMO.
                  {go && (
                    <>
                      {" "}
                      <button type="button" className="lien-btn" onClick={() => go("messages")}>
                        Nous contacter
                      </button>
                    </>
                  )}
                </span>
              </div>
            )}
          </div>
        </div>

        {choix.type === "collectif" &&
          (adhesionPortail ? (
            <Adhesion
              membership={membership}
              scenario={scenario}
              bareme={bareme}
              config={config ?? null}
              email={session?.user.email ?? ""}
              go={go}
            />
          ) : lienBanque ? (
            <div className="card-xl" style={{ marginTop: 18 }}>
              <div className="cx-head">
                <Icon name="building" size={19} style={{ color: "var(--accent)" }} />
                <h2 style={{ fontSize: 18 }}>Votre souscription auprès de {banqueNom}</h2>
              </div>
              <div className="cx-body">
                <p className="se-body" style={{ marginTop: 0 }}>
                  Votre dossier de prêt se remplit directement chez {banqueNom} : c'est elle qui vous demande
                  votre identité, votre RIB et les pièces du prêt, et qui vous fait signer. C'est aussi là que
                  vous indiquez le montant emprunté : la totalité de votre quote-part ou une partie. Vous pouvez revenir
                  sur ce lien autant de fois que nécessaire pour reprendre ou terminer votre souscription.
                </p>
                <button className="se-btn se-btn-primary" onClick={() => ouvrirBanque(lienBanque)}>
                  <Icon name="externalLink" size={17} />
                  Reprendre ma souscription en ligne
                </button>
                <p className="se-small" style={{ color: "var(--fg-muted)", marginTop: 12, marginBottom: 0 }}>
                  Une question sur le dossier ou les pièces demandées ? Votre AMO vous accompagne.
                </p>
              </div>
            </div>
          ) : (
            <div className="cc-next" style={{ marginTop: 18 }}>
              <Icon name="alert" size={15} className="ico" />
              <span>
                Votre choix est bien enregistré. Le dossier d'adhésion (bulletin et mandat SEPA, à signer en ligne)
                ouvrira dès que votre AMO aura lancé la campagne d'adhésion : vous serez averti.
              </span>
            </div>
          ))}

        {/* Dossier déjà engagé dans le portail alors que la campagne est fermée
            ou passée chez la banque : il reste consultable. */}
        {choix.type === "collectif" && !adhesionPortail && (
          <Adhesion
            membership={membership}
            scenario={scenario}
            bareme={bareme}
            config={config ?? null}
            email={session?.user.email ?? ""}
            go={go}
            suiviSeul
          />
        )}

        {choix.type === "individuel" && (
          <div style={{ marginTop: 18 }}>
            <DocumentsEcoPtz membership={membership} />
          </div>
        )}

        <MentionsPrudence />
      </div>
    );
  }

  // ---------- Date limite passée, aucun choix transmis ----------
  if (!modifiable && !choix) {
    return (
      <div className="fade">
        <h1 className="sec-title">Mon financement</h1>
        <div className="cc-next">
          <Icon name="lock" size={15} className="ico" />
          <span>
            La date limite pour choisir votre financement était le <b>{dateLimite ? fmtDate(dateLimite) : ""}</b>.
            Écrivez à votre AMO pour lui indiquer votre choix.
            {go && (
              <>
                {" "}
                <button type="button" className="lien-btn" onClick={() => go("messages")}>
                  Nous contacter
                </button>
              </>
            )}
          </span>
        </div>
        <MentionsPrudence />
      </div>
    );
  }

  // ---------- Sélection ----------
  return (
    <div className="fade">
      <h1 className="sec-title">Mon financement</h1>
      {choix && editing && (
        <div className="choix-modif">
          <Icon name="edit" size={16} />
          <span style={{ flex: 1, minWidth: 0 }}>
            Vous modifiez votre choix actuel : <b>{LIBELLE_CHOIX[choix.type]}</b>. Il reste enregistré tant que
            vous n'en avez pas confirmé un autre
            {dateLimite ? <> (modifiable jusqu'au {fmtDate(dateLimite)} inclus)</> : null}.
          </span>
          <button className="se-btn se-btn-ghost btn-sm" onClick={() => setEditing(false)}>
            Annuler
          </button>
        </div>
      )}
      {!choix && dateLimite && (
        <div className="cc-next" style={{ marginBottom: 18 }}>
          <Icon name="calendar" size={15} className="ico" />
          <span>
            Choix à transmettre au plus tard le <b>{fmtDate(dateLimite)}</b>. Vous pourrez le modifier jusqu'à
            cette date.
          </span>
        </div>
      )}
      <p className="sec-sub">
        {ecoPtz ? (
          <>
            Choisissez comment financer votre reste à charge de <b>{fmtEuro(montant)}</b> : prêt collectif, éco-PTZ
            individuel ou fonds propres.
          </>
        ) : (
          <>
            Votre reste à charge est de <b>{fmtEuro(montant)}</b>.
          </>
        )}
      </p>
      {!ecoPtz && (
        <div className="cc-next" style={{ marginBottom: 18 }}>
          <Icon name="alert" size={15} className="ico" style={{ color: "var(--color-warning-500)" }} />
          <span>{MOTIF_SANS_ECO_PTZ}</span>
        </div>
      )}
      {indiv.cee > 0 && (
        <div className="cc-next" style={{ marginBottom: 18 }}>
          <Icon name="leaf" size={15} className="ico" style={{ color: "var(--color-primary-600)" }} />
          <span>
            Vos <b>CEE estimés ({fmtEuro(indiv.cee)})</b> sont versés <b>à la fin du chantier</b>, après
            réception des travaux : ils ne réduisent pas le montant à financer avant travaux, mais viendront en
            déduction une fois perçus.
          </span>
        </div>
      )}

      {ecoPtz && (
      <div className="loan-opts loan-opts-3">
        <div className={"loan-opt" + (type === "collectif" ? " sel" : "")} onClick={() => setType("collectif")}>
          <div className="lo-ico"><Icon name="users" size={22} /></div>
          <h3>Prêt collectif</h3>
          <p>
            Éco-PTZ souscrit par la copropriété auprès de {banqueNom}. Vous adhérez pour votre seule
            quote-part,{" "}
            {lienBanque
              ? "directement en ligne sur le site de la banque."
              : "directement depuis cet espace : bulletin et mandat SEPA pré-remplis, signés en ligne."}
          </p>
          <p style={{ marginTop: 6 }}>
            Vous pouvez emprunter <b>la totalité de votre quote-part ou une partie seulement</b>.
          </p>
          <div className="loan-terms">
            {choix?.type === "collectif" && <span className="term term-actuel">Votre choix actuel</span>}
            <span className="term">Recommandé</span>
            <span className="term">Durée votée en AG</span>
          </div>
        </div>
        <div className={"loan-opt" + (type === "individuel" ? " sel" : "")} onClick={() => setType("individuel")}>
          <div className="lo-ico"><Icon name="user" size={22} /></div>
          <h3>Éco-PTZ individuel</h3>
          <p>
            Vous contractez l'éco-PTZ directement auprès de votre banque, logement par logement. Strat Eco vous remet le
            formulaire CERFA et l'attestation des montants éligibles signés.
          </p>
          <div className="loan-terms">
            {choix?.type === "individuel" && <span className="term term-actuel">Votre choix actuel</span>}
            <span className="term">Votre banque</span>
            <span className="term">CERFA préparé</span>
          </div>
        </div>
        <div className={"loan-opt" + (type === "fonds" ? " sel" : "")} onClick={() => setType("fonds")}>
          <div className="lo-ico"><Icon name="euro" size={22} /></div>
          <h3>Fonds propres</h3>
          <p>Vous réglez votre reste à charge sans recourir à un prêt, selon l'échéancier d'appels de fonds.</p>
          <div className="loan-terms">
            {choix?.type === "fonds" && <span className="term term-actuel">Votre choix actuel</span>}
            <span className="term">Sans crédit</span>
          </div>
        </div>
      </div>
      )}

      {type === "collectif" && (
        <div className="split" style={{ marginTop: 22 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div className="card-xl">
              <div className="cx-head"><Icon name="users" size={19} /><h2 style={{ fontSize: 18 }}>Conditions du prêt collectif</h2></div>
              <div className="cx-body">
                <div className="kv"><span className="k">Banque</span><span className="v">{config ? BANQUE_LABEL[config.banque] : "À confirmer par votre AMO"}</span></div>
                <div className="kv"><span className="k">Souscription</span><span className="v">{lienBanque ? "En ligne, sur le site de la banque" : adhesionPortail ? "En ligne, depuis cet espace" : "Ouverture à venir"}</span></div>
                <div className="kv"><span className="k">Durée (votée en AG)</span><span className="v">{dureeCollectif} ans</span></div>
                <div className="kv"><span className="k">Montant finançable</span><span className="v">jusqu'à {fmtEuro(montant)}</span></div>
                <div className="kv"><span className="k">Taux d'intérêt</span><span className="v">0 % (éco-PTZ)</span></div>
                <div className="casc-reste" style={{ marginTop: 12 }}>
                  <span className="l">Mensualité estimée</span>
                  <span className="v">{fmtEuro(mensualiteCollectif)}</span>
                </div>
                {/* Feedback Amir 26/09 : l'adhésion n'engage pas forcément toute la
                    quote-part - le montant emprunté se fixe sur le site de la banque. */}
                <p className="se-small" style={{ color: "var(--fg-muted)", marginTop: 10 }}>
                  Vous pouvez emprunter la totalité de votre quote-part ou une partie seulement : le montant
                  se précise {lienBanque ? "lors de votre demande sur le site de la banque" : "sur votre bulletin d'adhésion"}.
                  La mensualité ci-dessus correspond à la totalité ; elle est hors frais de garantie, ajoutés par
                  la banque selon la tarification en vigueur.
                </p>
              </div>
            </div>
            <button className="se-btn se-btn-primary" onClick={() => transmit("collectif")} disabled={save.isPending}>
              <Icon name={lienBanque ? "externalLink" : "checkCircle"} size={18} />
              {save.isPending ? "Transmission…" : "Adhérer au prêt collectif"}
            </button>
          </div>

          <div className="card-xl">
            <div className="cx-head"><Icon name="clipboard" size={19} /><h2 style={{ fontSize: 18 }}>Après votre adhésion</h2></div>
            {lienBanque ? (
              <div className="cx-body">
                <div className="afournir-row"><Icon name="check" size={15} style={{ color: "var(--color-primary-700)" }} />Le site de {banqueNom} s'ouvre dans un nouvel onglet</div>
                <div className="afournir-row"><Icon name="check" size={15} style={{ color: "var(--color-primary-700)" }} />Vous y complétez votre demande de prêt et signez en ligne</div>
                <div className="afournir-row"><Icon name="check" size={15} style={{ color: "var(--color-primary-700)" }} />C'est la banque qui vous demande vos pièces (identité, RIB…)</div>
                <div className="afournir-row"><Icon name="check" size={15} style={{ color: "var(--color-primary-700)" }} />Votre AMO est prévenu de votre choix et reste à vos côtés</div>
                <p className="se-small" style={{ color: "var(--fg-muted)", marginTop: 12, marginBottom: 0 }}>
                  Votre choix est enregistré au moment du clic : vous pourrez revenir sur le lien de la banque
                  depuis cette page si vous ne terminez pas tout de suite.
                </p>
              </div>
            ) : (
              <div className="cx-body">
                <div className="afournir-row"><Icon name="check" size={15} style={{ color: "var(--color-primary-700)" }} />Vous complétez votre bulletin d'adhésion en ligne (identité, coordonnées, montant)</div>
                <div className="afournir-row"><Icon name="check" size={15} style={{ color: "var(--color-primary-700)" }} />Vous déposez votre pièce d'identité et votre RIB</div>
                <div className="afournir-row"><Icon name="check" size={15} style={{ color: "var(--color-primary-700)" }} />Le bulletin et le mandat SEPA, pré-remplis, se signent en ligne avec un code reçu par e-mail</div>
                <div className="afournir-row"><Icon name="check" size={15} style={{ color: "var(--color-primary-700)" }} />Rien à imprimer : vous recevez les documents signés par e-mail</div>
                <p className="se-small" style={{ color: "var(--fg-muted)", marginTop: 12, marginBottom: 0 }}>
                  {adhesionPortail
                    ? "Si votre lot a plusieurs propriétaires, chacun signe le bulletin depuis son propre lien."
                    : "Le dossier d'adhésion n'est pas encore ouvert : votre choix est enregistré et vous serez averti dès qu'il le sera."}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {type === "individuel" && (
        <div className="split" style={{ marginTop: 22 }}>
          <div className="card-xl">
            <div className="cx-head"><Icon name="building" size={19} style={{ color: "var(--accent)" }} /><h2 style={{ fontSize: 18 }}>Logements à financer</h2></div>
            <div className="cx-body" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {logements.length === 0 && (
                <p className="se-small" style={{ color: "var(--fg-muted)", margin: 0 }}>
                  L'éco-PTZ individuel finance un logement : aucun lot d'habitation n'est à votre nom dans cette
                  copropriété. Écrivez à votre AMO si c'est une erreur.
                </p>
              )}
              {logements.map((l) => {
                const annexes = lots.filter((a) => a.rattacheA === l.id);
                const t = lotTantiemes(l, cle) + annexes.reduce((n, a) => n + lotTantiemes(a, cle), 0);
                return (
                  <label key={l.id} className={"lot-check" + (selLots.includes(l.id) ? " on" : "")}>
                    <input type="checkbox" checked={selLots.includes(l.id)} onChange={() => toggleLot(l.id)} />
                    <span className="lc-main">
                      <b>Lot n°{l.num}</b>{l.batiment ? " · Bât. " + l.batiment : ""}
                      {annexes.length > 0 && (
                        <span className="se-small" style={{ color: "var(--fg-muted)" }}>
                          {" "}
                          avec {annexes.map((a) => "n°" + a.num).join(", ")}
                        </span>
                      )}
                    </span>
                    <span className="lc-tant">
                      {t.toLocaleString("fr-FR")}/{(params.totalCle || 1000).toLocaleString("fr-FR")}
                    </span>
                  </label>
                );
              })}
              {lots.some((a) => a.usage !== "habitation" && !a.rattacheA) && (
                <p className="se-small" style={{ color: "var(--fg-muted)", margin: 0 }}>
                  Une cave ou un parking n'entre dans le montant que s'il est rattaché à votre logement (onglet « Mes
                  quotes-parts »).
                </p>
              )}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div className="card-xl">
              <div className="cx-head"><Icon name="clipboard" size={19} /><h2 style={{ fontSize: 18 }}>Après votre demande</h2></div>
              <div className="cx-body">
                <div className="afournir-row"><Icon name="check" size={15} style={{ color: "var(--color-primary-700)" }} />Strat Eco calcule le montant des travaux éligibles de votre logement</div>
                <div className="afournir-row"><Icon name="check" size={15} style={{ color: "var(--color-primary-700)" }} />Les entreprises, l'auditeur et votre syndic signent le formulaire CERFA et l'attestation</div>
                <div className="afournir-row"><Icon name="check" size={15} style={{ color: "var(--color-primary-700)" }} />Vous les retrouvez dans l'onglet Documents, à remettre à votre banque</div>
                <div className="afournir-row"><Icon name="check" size={15} style={{ color: "var(--color-primary-700)" }} />La durée et le montant du prêt se fixent avec votre banque</div>
              </div>
            </div>
            <button
              className="se-btn se-btn-primary"
              disabled={selLots.length === 0 || save.isPending}
              style={{ opacity: selLots.length ? 1 : 0.5 }}
              onClick={() => selLots.length && transmit("individuel")}
            >
              <Icon name="send" size={17} />
              {save.isPending ? "Transmission…" : "Transmettre ma demande"}
            </button>
          </div>
        </div>
      )}

      {type === "fonds" && (
        <div className="split" style={{ marginTop: 22 }}>
          <div className="card-xl" style={{ maxWidth: 560 }}>
            <div className="cx-head"><Icon name="euro" size={19} style={{ color: "var(--accent)" }} /><h2 style={{ fontSize: 18 }}>Financement sur fonds propres</h2></div>
            <div className="cx-body">
              <div className="kv"><span className="k">Reste à charge à régler</span><span className="v">{fmtEuro(montant)}</span></div>
              <div className="kv"><span className="k">Modalité</span><span className="v">Appels de fonds du syndic</span></div>
              <p className="se-body" style={{ marginTop: 12 }}>
                Vous réglez votre quote-part de reste à charge selon l'échéancier d'appels de fonds voté en
                assemblée générale, sans souscrire de prêt.
              </p>
              <button className="se-btn se-btn-primary" style={{ marginTop: 8 }} onClick={() => transmit("fonds")} disabled={save.isPending}>
                <Icon name="checkCircle" size={17} />
                {save.isPending ? "Transmission…" : "Confirmer le financement sur fonds propres"}
              </button>
            </div>
          </div>
        </div>
      )}

      {save.isError && (
        <p className="se-small" style={{ color: "var(--color-error-700)", marginTop: 14 }}>
          La transmission a échoué. Réessayez ou contactez votre AMO.
        </p>
      )}

      <MentionsPrudence />
    </div>
  );
}

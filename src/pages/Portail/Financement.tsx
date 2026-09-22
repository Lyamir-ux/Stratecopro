// Mon financement : fonds propres, prêt collectif (banque + durée fixées par
// l'AMO - CEGEE/Domofinance, durée votée en AG) ou éco-PTZ individuel (durée
// au choix du copropriétaire).
//
// Adhésion au prêt collectif (feedback Amir 22/09/2026) : « Adhérer au prêt
// collectif » enregistre le choix puis envoie le copropriétaire sur le parcours
// de souscription en ligne de la banque, qui mène tout le dossier de prêt
// (identité, RIB, pièces, signature). C'est la règle : le dossier d'adhésion
// interne (bulletins pré-remplis + mandat SEPA signés dans le portail) a été
// retiré. Tant que l'AMO n'a pas saisi le lien, le choix est enregistré et la
// page annonce que la souscription n'est pas encore ouverte.
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { fmtEuro } from "@/lib/format";
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
import { MentionsPrudence } from "./Mentions";
import type { Bareme, Profil } from "@/lib/finance";
import type { Tables } from "@/lib/database.types";

const BANQUE_LABEL: Record<string, string> = {
  CEGEE: "Caisse d'Epargne Grand Est Europe (CEGEE)",
  DOMOFINANCE: "Domofinance",
};

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
}: {
  membership: Membership;
  scenarios: Scenario[];
  scenario: Scenario | null;
  bareme: Bareme | null;
  plan: Tables<"plans_individuels"> | null;
  profil: Profil | null;
  choix: ChoixFinancement | null;
}) {
  const lots = membership.lots;
  const { data: config } = useFinancementConfig(membership.copro.id);
  const [editing, setEditing] = useState(false);
  const [type, setType] = useState<TypeFinancement>(choix?.type ?? "collectif");
  const [yearsIndiv, setYearsIndiv] = useState(choix?.type === "individuel" ? (choix.duree_annees ?? 15) : 15);
  const [selLots, setSelLots] = useState<string[]>(
    choix?.lot_ids?.length ? choix.lot_ids : lots.map((l) => l.id)
  );
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
  const banqueNom = config ? BANQUE_LABEL[config.banque] : "la banque partenaire";
  const mensualiteCollectif = montant / (dureeCollectif * 12);
  const mensualiteIndiv = montant / (Math.max(1, yearsIndiv) * 12);
  const toggleLot = (id: string) =>
    setSelLots((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const transmit = (t: TypeFinancement) => {
    // Adhésion au prêt collectif : on enregistre le choix (le suivi AMO en vit)
    // et on envoie aussitôt vers la banque, qui instruit le dossier de prêt.
    if (t === "collectif" && lienBanque) ouvrirBanque(lienBanque);
    save.mutate(
      {
        type: t,
        dureeAnnees: t === "collectif" ? dureeCollectif : t === "individuel" ? yearsIndiv : null,
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
          <div className="cx-body" style={{ textAlign: "center", padding: "34px 40px 30px" }}>
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
            <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 24, margin: "0 0 8px" }}>
              Votre choix est transmis
            </h2>
            {choix.saisi_par !== "copro" && (
              <p className="se-small" style={{ color: "var(--fg-muted)", margin: "0 0 10px" }}>
                Ce choix a été enregistré pour vous par {choix.saisi_par === "syndic" ? "votre syndic" : "votre AMO"} -
                vous pouvez le modifier à tout moment ci-dessous.
              </p>
            )}
            <p className="se-body" style={{ maxWidth: 520, margin: "0 auto 20px" }}>
              {choix.type === "fonds" ? (
                <>Vous financez votre reste à charge de <b>{fmtEuro(montant)}</b> sur <b>fonds propres</b>, selon l'échéancier d'appels de fonds du syndic.</>
              ) : choix.type === "individuel" ? (
                <>
                  Votre demande d'<b>éco-PTZ individuel</b> sur <b>{choix.duree_annees ?? yearsIndiv} ans</b> pour{" "}
                  {lotsChoisis.length > 1 ? "les lots " : "le lot "}
                  {lotsChoisis.map((l) => "n°" + l.num).join(", ")} est transmise à votre AMO, qui vous accompagnera
                  pour le dossier bancaire.
                </>
              ) : (
                <>
                  Vous avez choisi le <b>prêt collectif {config?.banque ?? "CEGEE"}</b> pour <b>{fmtEuro(montant)}</b>{" "}
                  sur <b>{choix.duree_annees ?? dureeCollectif} ans</b> ({fmtEuro(montant / (Math.max(1, choix.duree_annees ?? dureeCollectif) * 12))}/mois, 0 %).
                </>
              )}
            </p>
            <button className="se-btn se-btn-secondary" onClick={() => setEditing(true)}>
              Modifier mon choix
            </button>
          </div>
        </div>

        {choix.type === "collectif" &&
          (lienBanque ? (
            <div className="card-xl" style={{ marginTop: 18 }}>
              <div className="cx-head">
                <Icon name="building" size={19} style={{ color: "var(--accent)" }} />
                <h2 style={{ fontSize: 18 }}>Votre souscription auprès de {banqueNom}</h2>
              </div>
              <div className="cx-body">
                <p className="se-body" style={{ marginTop: 0 }}>
                  Votre dossier de prêt se remplit directement chez {banqueNom} : c'est elle qui vous demande
                  votre identité, votre RIB et les pièces du prêt, et qui vous fait signer. Vous pouvez revenir
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
                Le lien de souscription de {banqueNom} n'est pas encore ouvert. Votre choix est bien enregistré :
                votre AMO vous préviendra dès que vous pourrez souscrire.
              </span>
            </div>
          ))}

        <MentionsPrudence />
      </div>
    );
  }

  // ---------- Sélection ----------
  return (
    <div className="fade">
      <h1 className="sec-title">Mon financement</h1>
      <p className="sec-sub">
        Choisissez comment financer votre reste à charge de <b>{fmtEuro(montant)}</b> : prêt collectif, éco-PTZ
        individuel ou fonds propres.
      </p>
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

      <div className="loan-opts loan-opts-3">
        <div className={"loan-opt" + (type === "collectif" ? " sel" : "")} onClick={() => setType("collectif")}>
          <div className="lo-ico"><Icon name="users" size={22} /></div>
          <h3>Prêt collectif</h3>
          <p>
            Éco-PTZ souscrit par la copropriété auprès de {banqueNom}. Vous adhérez pour votre seule
            quote-part, directement en ligne sur le site de la banque.
          </p>
          <div className="loan-terms"><span className="term">Recommandé</span><span className="term">Durée votée en AG</span></div>
        </div>
        <div className={"loan-opt" + (type === "individuel" ? " sel" : "")} onClick={() => setType("individuel")}>
          <div className="lo-ico"><Icon name="user" size={22} /></div>
          <h3>Éco-PTZ individuel</h3>
          <p>Vous contractez l'éco-PTZ directement auprès de votre banque, lot par lot, et choisissez votre durée.</p>
          <div className="loan-terms"><span className="term">Votre banque</span><span className="term">Durée au choix</span></div>
        </div>
        <div className={"loan-opt" + (type === "fonds" ? " sel" : "")} onClick={() => setType("fonds")}>
          <div className="lo-ico"><Icon name="euro" size={22} /></div>
          <h3>Fonds propres</h3>
          <p>Vous réglez votre reste à charge sans recourir à un prêt, selon l'échéancier d'appels de fonds.</p>
          <div className="loan-terms"><span className="term">Sans crédit</span></div>
        </div>
      </div>

      {type === "collectif" && (
        <div className="split" style={{ marginTop: 22 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div className="card-xl">
              <div className="cx-head"><Icon name="users" size={19} /><h2 style={{ fontSize: 18 }}>Conditions du prêt collectif</h2></div>
              <div className="cx-body">
                <div className="kv"><span className="k">Banque</span><span className="v">{config ? BANQUE_LABEL[config.banque] : "À confirmer par votre AMO"}</span></div>
                <div className="kv"><span className="k">Souscription</span><span className="v">{lienBanque ? "En ligne, sur le site de la banque" : "Ouverture à venir"}</span></div>
                <div className="kv"><span className="k">Durée (votée en AG)</span><span className="v">{dureeCollectif} ans</span></div>
                <div className="kv"><span className="k">Montant financé</span><span className="v">{fmtEuro(montant)}</span></div>
                <div className="kv"><span className="k">Taux d'intérêt</span><span className="v">0 % (éco-PTZ)</span></div>
                <div className="casc-reste" style={{ marginTop: 12 }}>
                  <span className="l">Mensualité estimée</span>
                  <span className="v">{fmtEuro(mensualiteCollectif)}</span>
                </div>
                <p className="se-small" style={{ color: "var(--fg-muted)", marginTop: 10 }}>
                  Hors frais de garantie, ajoutés par la banque selon la tarification en vigueur.
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
                <div className="afournir-row"><Icon name="check" size={15} style={{ color: "var(--color-primary-700)" }} />Votre choix est transmis à votre AMO</div>
                <div className="afournir-row"><Icon name="check" size={15} style={{ color: "var(--color-primary-700)" }} />Le lien de souscription de {banqueNom} vous sera ouvert sur cette page</div>
                <div className="afournir-row"><Icon name="check" size={15} style={{ color: "var(--color-primary-700)" }} />C'est la banque qui vous demande vos pièces (identité, RIB…)</div>
                <p className="se-small" style={{ color: "var(--fg-muted)", marginTop: 12, marginBottom: 0 }}>
                  Le parcours de souscription n'est pas encore ouvert : vous serez averti dès qu'il le sera.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {type === "individuel" && (
        <div className="split" style={{ marginTop: 22 }}>
          <div className="card-xl">
            <div className="cx-head"><Icon name="building" size={19} style={{ color: "var(--accent)" }} /><h2 style={{ fontSize: 18 }}>Lots à financer</h2></div>
            <div className="cx-body" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {lots.map((l) => (
                <label key={l.id} className={"lot-check" + (selLots.includes(l.id) ? " on" : "")}>
                  <input type="checkbox" checked={selLots.includes(l.id)} onChange={() => toggleLot(l.id)} />
                  <span className="lc-main">
                    <b>Lot n°{l.num}</b>{l.batiment ? " · Bât. " + l.batiment : ""}
                  </span>
                  <span className="lc-tant">
                    {lotTantiemes(l, cle).toLocaleString("fr-FR")}/{(params.totalCle || 1000).toLocaleString("fr-FR")}
                  </span>
                </label>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div className="card-xl">
              <div className="cx-head"><Icon name="calendar" size={19} /><h2 style={{ fontSize: 18 }}>Durée de remboursement</h2></div>
              <div className="cx-body">
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                  <span className="se-small">{bareme.ecoPtz.dureeMin} ans</span>
                  <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 18, color: "var(--color-primary-700)" }}>
                    {yearsIndiv} ans
                  </span>
                  <span className="se-small">{bareme.ecoPtz.dureeMax} ans</span>
                </div>
                <input
                  className="range"
                  type="range"
                  min={bareme.ecoPtz.dureeMin}
                  max={bareme.ecoPtz.dureeMax}
                  value={yearsIndiv}
                  onChange={(e) => setYearsIndiv(Number(e.target.value))}
                />
                <div className="casc-reste" style={{ marginTop: 14 }}>
                  <span className="l">Mensualité estimée</span>
                  <span className="v">{fmtEuro(mensualiteIndiv)}</span>
                </div>
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

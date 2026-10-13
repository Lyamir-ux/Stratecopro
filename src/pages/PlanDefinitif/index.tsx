// Éditeur du plan de financement définitif (nomenclature chef de projet).
// Toute modification (ligne de lot, « retenu », MOE, aide, paramètre) recalcule
// immédiatement les deux variantes de financement - mêmes formules que le classeur.
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useNavigate, useParams } from "react-router-dom";
import * as XLSX from "xlsx";
import { useCrumbs } from "@/components/Shell/useCrumbs";
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui";
import { ChampNombre } from "@/components/ChampNombre";
import { useCopro } from "@/api/copros";
import { useDonnees, type DonneesCopro } from "@/api/donnees";
import {
  estPlanEstimatif,
  libellePerimetre,
  pfARepartir,
  plansValides,
  plansValidesEnConflit,
  pontAJour,
  type PlanDefinitif,
  scenariosDuGroupe,
  scenariosEstimatifs,
  useArchiverPlanDefinitif,
  usePartagerPfCopros,
  usePlanDefinitif,
  usePlansDefinitifs,
  usePontPf,
  useUpdatePlanDefinitif,
  useValiderPlanDefinitif,
} from "@/api/planDefinitif";
import { useBareme } from "@/api/scenarios";
import { aujourdhuiParis } from "@/lib/financement";
import { fmtEuro, fmtEuroFull } from "@/lib/format";
import { libellesBatiments } from "@/lib/referentiels";
import { messageErreur } from "@/lib/erreurs";
import {
  aideNotifiee,
  computePlanDefinitif,
  couvreToutLaCopro,
  etatNotificationAides,
  exportPlanDefinitif,
  exportPlanEstimatif,
  itemsARepartirPf,
  lotsDuPerimetre,
  makeAidesDefaut,
  PHASES_MOE,
  readPlanDefinitif,
  type AideDef,
  type LigneLot,
  type LigneMoe,
  type ModeAide,
  type PlanDefinitifData,
} from "@/lib/finance";
import type { Json } from "@/lib/database.types";

const TVA_CHOICES = [0, 5.5, 10, 20];

// ---------- petits helpers d'édition ----------

// Champ texte à clavier décimal : la virgule et le point sont acceptés (bug d'Amir du 13/10/2026,
// un champ type="number" refuse le point en navigateur français).
function NumInput({
  value,
  onChange,
  width,
}: {
  value: number;
  onChange: (n: number) => void;
  /** Largeur en px ; par défaut, remplit la colonne. */
  width?: number;
}) {
  return (
    <ChampNombre
      value={Number.isFinite(value) ? value : 0}
      onChange={(n) => onChange(n ?? 0)}
      width={width}
    />
  );
}

function TvaSelect({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const choices = TVA_CHOICES.includes(value) ? TVA_CHOICES : [...TVA_CHOICES, value];
  return (
    <select className="edit-inp" value={value} onChange={(e) => onChange(Number(e.target.value))}>
      {choices.map((t) => (
        <option key={t} value={t}>
          {String(t).replace(".", ",")} %
        </option>
      ))}
    </select>
  );
}

const thR: CSSProperties = { textAlign: "right" };
const tdR: CSSProperties = { textAlign: "right", whiteSpace: "nowrap" };

/** Clés de répartition de la copro telles que servies par useDonnees. */
type CleCopro = { code: string; label: string | null; is_default: boolean };

/** Sélecteur de la clé de répartition d'une ligne (copropriétés à plusieurs clés). */
function CleSelect({
  cles,
  value,
  onChange,
  vide = "- choisir -",
}: {
  cles: CleCopro[];
  value: string | undefined;
  onChange: (code: string | undefined) => void;
  /** Libellé de l'option sans clé. */
  vide?: string;
}) {
  return (
    <select
      className="edit-inp"
      style={{ width: "100%" }}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || undefined)}
    >
      <option value="">{vide}</option>
      {cles.map((k) => (
        <option key={k.code} value={k.code}>
          {k.code}
          {k.label && k.label !== k.code ? ` - ${k.label}` : ""}
        </option>
      ))}
    </select>
  );
}

/**
 * Résultat de la notification d'une aide (demande d'Amir du 12/10/2026) : vide
 * = pas encore notifiée (l'estimation de la formule est retenue), 0 = aide
 * refusée. Le montant saisi remplace l'estimation dans tous les calculs.
 */
function NotificationAide({
  aide,
  onChange,
}: {
  aide: AideDef;
  onChange: (patch: Pick<AideDef, "montantNotifie" | "dateNotification">) => void;
}) {
  const notifiee = aideNotifiee(aide);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <ChampNombre
        placeholder="Non notifiée"
        title="Montant notifié par le financeur (vide : pas encore notifiée, 0 : aide refusée)"
        value={notifiee ? aide.montantNotifie : undefined}
        onChange={(n) =>
          onChange(
            n === undefined
              ? { montantNotifie: undefined, dateNotification: aide.dateNotification }
              : { montantNotifie: n, dateNotification: aide.dateNotification ?? aujourdhuiParis() }
          )
        }
      />
      {notifiee && (
        <input
          className="edit-inp"
          type="date"
          title="Date de la notification"
          style={{ width: "100%" }}
          value={aide.dateNotification ?? ""}
          onChange={(e) => onChange({ montantNotifie: aide.montantNotifie, dateNotification: e.target.value || undefined })}
        />
      )}
    </div>
  );
}

// ---------- périmètre (plans par bâtiment) ----------

/**
 * Bâtiments couverts par le plan (demande d'Amir, 11/10/2026) : dans une
 * copropriété à plusieurs bâtiments, chaque bâtiment peut avoir son propre
 * programme de travaux, donc son propre PF, réparti entre ses seuls lots.
 * Enregistré tout de suite, indépendamment des autres modifications du plan.
 */
function PerimetrePanel({
  plan,
  tousPlans,
  donnees,
  denomination,
  nbLogementsPlan,
  onReprendreLogements,
}: {
  plan: PlanDefinitif;
  tousPlans: PlanDefinitif[] | undefined;
  donnees: DonneesCopro;
  denomination: string | null | undefined;
  nbLogementsPlan: number;
  onReprendreLogements: (n: number) => void;
}) {
  const update = useUpdatePlanDefinitif(plan.copro_id);
  const lb = libellesBatiments(denomination);
  const perimetre = plan.batiment_ids ?? [];
  const tout = couvreToutLaCopro(perimetre);
  // Bâtiments déjà couverts par un autre PF validé
  const pris = new Map<string, string>();
  for (const p of plansValides(tousPlans))
    if (p.id !== plan.id) for (const id of p.batiment_ids ?? []) pris.set(id, p.nom);
  const autreToutLaCopro = plansValides(tousPlans).find((p) => p.id !== plan.id && couvreToutLaCopro(p.batiment_ids));
  const lotsPerimetre = lotsDuPerimetre(donnees.lots, plan.batiment_ids);
  const logements = lotsPerimetre.filter((l) => l.usage === "habitation").length;
  const enregistrer = (ids: string[] | null) => update.mutate({ id: plan.id, batimentIds: ids });
  const basculer = (id: string, coche: boolean) => {
    const suivant = coche ? [...perimetre, id] : perimetre.filter((x) => x !== id);
    enregistrer(suivant.length ? suivant : null);
  };

  return (
    <div className="panel">
      <div className="p-head">
        <Icon name="building" size={18} />
        <h3>Périmètre du plan</h3>
        <span style={{ flex: 1 }}></span>
        <span className="se-small" style={{ color: "var(--fg-muted)" }}>
          {libellePerimetre(plan.batiment_ids, donnees.batiments, denomination)} · {lotsPerimetre.length} lot
          {lotsPerimetre.length > 1 ? "s" : ""} dont {logements} logement{logements > 1 ? "s" : ""}
        </span>
      </div>
      <div className="p-body" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <p className="se-small" style={{ margin: 0, color: "var(--fg-muted)" }}>
          Le plan est réparti entre les seuls lots de son périmètre. Quand les programmes de travaux diffèrent
          d'un {lb.singulier.toLowerCase()} à l'autre, créez un plan par {lb.singulier.toLowerCase()} (bouton
          « Dupliquer » de la liste des plans) : chacun peut être validé, et le portail additionne les plans qui
          concernent les lots d'un copropriétaire.
        </p>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13.5, cursor: "pointer" }}>
            <input type="radio" checked={tout} disabled={update.isPending} onChange={() => enregistrer(null)} />
            Toute la copropriété
          </label>
          {donnees.batiments.map((b) => {
            const nb = donnees.lots.filter((l) => l.batiment_id === b.id).length;
            const autre = pris.get(b.id);
            return (
              <label
                key={b.id}
                style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13.5, cursor: "pointer" }}
                title={autre ? `Déjà couvert par le PF validé « ${autre} »` : undefined}
              >
                <input
                  type="checkbox"
                  checked={!tout && perimetre.includes(b.id)}
                  disabled={update.isPending}
                  onChange={(e) => basculer(b.id, e.target.checked)}
                />
                {lb.court} {b.code}
                <span style={{ color: "var(--fg-muted)", fontSize: 12.5 }}>
                  ({nb} lot{nb > 1 ? "s" : ""}{autre ? " · autre PF validé" : ""})
                </span>
              </label>
            );
          })}
        </div>
        {autreToutLaCopro && plan.statut !== "valide" && (
          <p className="se-small" style={{ margin: 0, color: "var(--color-warning-700)" }}>
            <Icon name="alert" size={12} /> « {autreToutLaCopro.nom} » est validé pour toute la copropriété : valider ce
            plan le repassera en brouillon. Donnez-lui d'abord son propre périmètre pour garder les deux.
          </p>
        )}
        {nbLogementsPlan !== logements && logements > 0 && (
          <p className="se-small" style={{ margin: 0, color: "var(--color-warning-700)", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span>
              <Icon name="alert" size={12} /> Le plan compte {nbLogementsPlan} logement{nbLogementsPlan > 1 ? "s" : ""} principaux,
              le périmètre {logements} (plafonds MaPrimeRénov' et AMO, aides par logement).
            </span>
            <button className="se-btn se-btn-ghost btn-sm" onClick={() => onReprendreLogements(logements)}>
              Reprendre {logements}
            </button>
          </p>
        )}
        {update.isError && (
          <p className="se-small" style={{ margin: 0, color: "var(--color-error-700)" }}>
            {messageErreur(update.error, "Enregistrement du périmètre impossible")}
          </p>
        )}
      </div>
    </div>
  );
}

// ---------- page ----------

export default function PlanDefinitifPage() {
  const { id: coproId, planId } = useParams();
  const navigate = useNavigate();
  const { data: c } = useCopro(coproId);
  const { data: donnees } = useDonnees(coproId);
  const { data: plan, isLoading } = usePlanDefinitif(planId);
  const update = useUpdatePlanDefinitif(coproId ?? "");
  const valider = useValiderPlanDefinitif(coproId ?? "");
  const archiver = useArchiverPlanDefinitif(coproId ?? "");
  // Scénario d'un PF estimatif : ses scénarios frères servent à l'export (format estimatif)
  const { data: tousPlans } = usePlansDefinitifs(coproId);
  const estimatif = !!plan && estPlanEstimatif(plan);
  // PF validé déjà publié au portail : l'enregistrement met à jour les plans
  // individuels des copropriétaires (aides notifiées, 12/10/2026)
  const { data: bareme } = useBareme();
  const valides = plansValides(tousPlans);
  const idsValides = valides.map((p) => p.id);
  const { data: pont } = usePontPf(coproId ?? "", idsValides);
  const partager = usePartagerPfCopros(coproId ?? "");

  const [data, setData] = useState<PlanDefinitifData | null>(null);
  const [dirty, setDirty] = useState(false);
  // Lots repliés par défaut : on ne déroule que le lot qu'on veut consulter/éditer.
  const [lotsOuverts, setLotsOuverts] = useState<Record<number, boolean>>({});
  // Clé sélectionnée pour l'action « appliquer à toutes les lignes » (copros à plusieurs clés).
  const [cleGlobale, setCleGlobale] = useState("");

  useEffect(() => {
    if (plan && !dirty) setData(readPlanDefinitif(plan.data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan?.id, plan?.updated_at]);

  useCrumbs([
    { label: "Vos copropriétés", to: "/" },
    { label: c?.name ?? "…", to: `/copros/${coproId}/financement` },
    { label: estimatif ? "PF estimatif" : "PF définitif" },
  ]);

  const r = useMemo(() => (data ? computePlanDefinitif(data) : null), [data]);

  // Resynchronisation de l'instantané `resultat` figé en base quand le moteur
  // a changé (ex. base des indicateurs = total de l'opération depuis le 04/09/2026) :
  // les lecteurs SQL (statistiques) et le portail retrouvent les montants recalculés
  // sans réenregistrement manuel du plan.
  useEffect(() => {
    if (!plan || !r || dirty || update.isPending) return;
    const fige = plan.resultat as unknown as { resteACharge?: unknown; tauxCouverture?: unknown } | null;
    const aJour =
      !!fige &&
      typeof fige.resteACharge === "number" &&
      Math.abs(fige.resteACharge - r.resteACharge) <= 0.01 &&
      typeof fige.tauxCouverture === "number" &&
      Math.abs(fige.tauxCouverture - r.tauxCouverture) <= 1e-6;
    if (!aJour) update.mutate({ id: plan.id, data: readPlanDefinitif(plan.data) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan?.id, plan?.updated_at, r]);

  if (isLoading || !plan || !data || !r)
    return <div style={{ padding: 30, color: "var(--fg-muted)" }}>Chargement…</div>;

  // Copropriétés à plusieurs clés de répartition : la clé se choisit ligne par
  // ligne (lignes de devis + lignes MOE, toutes phases) et alimente les plans
  // individuels du financement.
  const cles: CleCopro[] = donnees?.cles ?? [];
  const multiCles = cles.length > 1;
  const itemsCles = multiCles ? itemsARepartirPf(data, r) : [];
  const lignesSansCle = itemsCles.filter((it) => !it.cle).length;

  const edit = (fn: (d: PlanDefinitifData) => PlanDefinitifData) => {
    setData((d) => (d ? fn(structuredClone(d)) : d));
    setDirty(true);
  };

  const save = () => {
    if (!data) return;
    const publie = plan.statut === "valide" && pontAJour(pont, idsValides);
    partager.reset();
    update.mutate(
      { id: plan.id, data },
      {
        onSuccess: () => {
          setDirty(false);
          // Le portail suit le plan validé : restes à charge des copropriétaires recalculés
          if (publie && donnees && bareme)
            partager.mutate({
              pfs: valides.map((p) => pfARepartir(p.id === plan.id ? { ...p, data: data as unknown as Json } : p)),
              lots: donnees.lots,
              cles: donnees.cles,
              bareme,
              partager: true,
            });
        },
      }
    );
  };

  const doExport = () => {
    const nom = data.infos.nomCopro || c?.name || "copro";
    if (estimatif) {
      // Tous les scénarios du PF estimatif, celui-ci avec les modifications en cours
      const freres = scenariosDuGroupe(tousPlans, plan.estimatif_groupe);
      const scenarios = scenariosEstimatifs(freres).map((s, i) => (freres[i].id === plan.id ? { ...s, data } : s));
      XLSX.writeFile(exportPlanEstimatif(scenarios), `Plan de financement estimatif - ${nom}.xlsx`);
      return;
    }
    const wb = exportPlanDefinitif(data);
    XLSX.writeFile(wb, `Plan de financement définitif - ${nom}.xlsx`);
  };

  const gardeFousKo = r.gardeFous.filter((g) => !g.ok);
  // Notification des aides : estimations tant que le financeur n'a pas notifié
  const notif = etatNotificationAides(r);

  return (
    <div className="page" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* ---- barre d'actions ---- */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        {estimatif ? (
          <button
            className="se-btn se-btn-ghost btn-sm"
            onClick={() => navigate(`/copros/${coproId}/plan-estimatif/${plan.estimatif_groupe}`)}
          >
            <Icon name="chevronLeft" size={16} />
            Comparatif des scénarios
          </button>
        ) : (
          <button className="se-btn se-btn-ghost btn-sm" onClick={() => navigate(`/copros/${coproId}/financement`)}>
            <Icon name="chevronLeft" size={16} />
            Financement
          </button>
        )}
        <h1 style={{ margin: 0, fontSize: 20, fontFamily: "var(--font-display)" }}>{plan.nom}</h1>
        {plan.source_fichier && (
          <span className="se-small" style={{ color: "var(--fg-muted)" }}>
            importé de « {plan.source_fichier} »{plan.source_fichier_id ? " (archivé dans Fichiers)" : ""}
          </span>
        )}
        {plan.statut === "valide" && (
          <span className="se-small" style={{ color: plan.valide_fichier_id ? "var(--fg-muted)" : "var(--color-warning-700)" }}>
            {plan.valide_fichier_id
              ? `v${plan.version} archivée${plan.valide_le ? ` le ${new Date(plan.valide_le).toLocaleDateString("fr-FR")}` : ""}`
              : "version validée non archivée"}
          </span>
        )}
        <span style={{ flex: 1 }}></span>
        {estimatif ? (
          <Badge kind="neutral">PF estimatif</Badge>
        ) : (
          <Badge kind={plan.statut === "valide" ? "success" : "neutral"}>
            {plan.statut === "valide" ? "Validé" : plan.statut === "partage" ? "Partagé" : "Brouillon"}
          </Badge>
        )}
        {!estimatif && notif.attendues > 0 && (
          <Badge kind={notif.toutes ? "success" : notif.notifiees ? "warn" : "neutral"}>
            {notif.toutes
              ? "Aides notifiées"
              : notif.notifiees
                ? `Aides notifiées : ${notif.notifiees}/${notif.attendues}`
                : "Aides estimées"}
          </Badge>
        )}
        <Badge kind={gardeFousKo.length ? "warn" : "success"}>
          {gardeFousKo.length ? `${gardeFousKo.length} garde-fou dépassé` : "Garde-fous OK"}
        </Badge>
        <button className="se-btn se-btn-secondary btn-sm" onClick={doExport}>
          <Icon name="download" size={15} />
          Exporter .xlsx
        </button>
        {!estimatif && (
          <button
            className="se-btn se-btn-ghost btn-sm"
            disabled={dirty || archiver.isPending}
            title="Dépose l'export .xlsx de l'état actuel dans l'onglet Fichiers (dossier Plans de financement), daté et versionné"
            onClick={() => archiver.mutate({ plan, coproNom: c?.name ?? data.infos.nomCopro })}
          >
            <Icon name="folder" size={15} />
            {archiver.isPending ? "Archivage…" : archiver.isSuccess ? "Archivé dans Fichiers" : "Archiver dans Fichiers"}
          </button>
        )}
        {estimatif ? null : plan.statut === "valide" ? (
          <button
            className="se-btn se-btn-ghost btn-sm"
            disabled={valider.isPending}
            title="Les panneaux du financement ne seront plus remplis à partir de ce plan"
            onClick={() => valider.mutate({ id: plan.id, valider: false })}
          >
            Repasser en brouillon
          </button>
        ) : (
          <button
            className="se-btn se-btn-secondary btn-sm"
            disabled={dirty || update.isPending || valider.isPending}
            title={
              dirty
                ? "Enregistrez d'abord vos modifications pour pouvoir valider"
                : "Valider ce plan : les panneaux du financement se remplissent automatiquement"
            }
            onClick={() => {
              // Un seul plan validé par périmètre (même bâtiment ou toute la copropriété),
              // confirmé dans une copropriété à plusieurs bâtiments
              const conflits = plansValidesEnConflit(tousPlans, plan.id, plan.batiment_ids);
              if (
                (donnees?.batiments.length ?? 0) > 1 &&
                conflits.length &&
                !window.confirm(
                  `Valider ce plan repassera en brouillon : « ${conflits.map((x) => x.nom).join(" », « ")} ». Continuer ?`
                )
              )
                return;
              valider.mutate({ id: plan.id, valider: true, coproNom: c?.name });
            }}
          >
            <Icon name="checkCircle" size={15} />
            Valider
          </button>
        )}
        <button
          className="se-btn se-btn-primary btn-sm"
          disabled={!dirty || update.isPending}
          onClick={save}
        >
          <Icon name="check" size={15} />
          {update.isPending ? "Enregistrement…" : dirty ? "Enregistrer" : "Enregistré"}
        </button>
      </div>

      {(partager.isPending || partager.isSuccess || partager.isError) && (
        <p
          className="se-small"
          style={{
            margin: "-10px 0 0",
            color: partager.isError ? "var(--color-error-700)" : "var(--fg-muted)",
          }}
        >
          <Icon name={partager.isError ? "alert" : "eye"} size={12} />{" "}
          {partager.isPending
            ? "Mise à jour du portail des copropriétaires…"
            : partager.isSuccess
              ? "Portail des copropriétaires mis à jour : chaque plan individuel suit le plan enregistré."
              : `${messageErreur(partager.error, "Mise à jour du portail impossible")} - mettez à jour le partage depuis l'onglet Financement.`}
        </p>
      )}

      {/* ---- périmètre : plans par bâtiment ---- */}
      {!estimatif && donnees && donnees.batiments.length > 1 && (
        <PerimetrePanel
          plan={plan}
          tousPlans={tousPlans}
          donnees={donnees}
          denomination={c?.denomination_batiments}
          nbLogementsPlan={data.infos.nbLogements}
          onReprendreLogements={(n) => edit((d) => ((d.infos.nbLogements = n), d))}
        />
      )}

      {/* ---- infos générales ---- */}
      <div className="panel">
        <div className="p-head">
          <Icon name="building" size={18} />
          <h3>Informations générales</h3>
          <span style={{ flex: 1 }}></span>
          <span className="se-small" style={{ color: "var(--fg-muted)" }}>
            Performance : <b style={{ color: "var(--color-primary-700)" }}>{r.performancePct.toFixed(1)} %</b>{" "}
            d'économie d'énergie
          </span>
        </div>
        <div className="p-body" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 12 }}>
          {(
            [
              ["Nom de la copropriété", "nomCopro", "text"],
              ["Adresse de l'immeuble", "adresse", "text"],
              ["Logements principaux", "nbLogements", "num"],
              ["Logements + équivalent", "nbLogementsEquiv", "num"],
              ["Surface habitable ou équiv. (m²)", "surfaceHabitable", "num"],
              ["Nombre d'étages", "nbEtages", "num"],
              ["Nombre d'entrées", "nbEntrees", "num"],
              ["Type de chauffage", "typeChauffage", "text"],
              ["Cep initial (kWhEP/m²/an)", "cepInitial", "num"],
              ["Cep projet (kWhEP/m²/an)", "cepProjet", "num"],
              ["Étiquette initiale", "etiquetteInitiale", "text"],
              ["Étiquette projet", "etiquetteProjet", "text"],
            ] as const
          ).map(([label, key, kind]) => (
            <label key={key} style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5, color: "var(--fg2)" }}>
              {label}
              {kind === "num" ? (
                <NumInput
                  value={data.infos[key] as number}
                  onChange={(n) => edit((d) => (((d.infos as unknown as Record<string, number>)[key] = n), d))}
                />
              ) : (
                <input
                  className="edit-inp"
                  value={data.infos[key] as string}
                  onChange={(e) => edit((d) => (((d.infos as unknown as Record<string, string>)[key] = e.target.value), d))}
                />
              )}
            </label>
          ))}
          <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13.5, marginTop: 16 }}>
            <input
              type="checkbox"
              checked={data.infos.dispositifClimaxion}
              onChange={(e) => edit((d) => ((d.infos.dispositifClimaxion = e.target.checked), d))}
            />
            Dispositif CLIMAXION
          </label>
        </div>
      </div>

      {/* ---- lots de travaux ---- */}
      <div className="panel">
        <div className="p-head">
          <Icon name="hammer" size={18} />
          <h3>Descriptif des travaux - lots</h3>
          <span style={{ flex: 1 }}></span>
          <button
            className="se-btn se-btn-ghost btn-sm"
            onClick={() => {
              const idx = data.lots.length;
              edit((d) => {
                const numero = Math.max(1, ...d.lots.map((l) => l.numero)) + 1;
                d.lots.push({ numero, titre: "Nouveau lot", entreprise: "", remisePct: 0, lignes: [] });
                return d;
              });
              setLotsOuverts((o) => ({ ...o, [idx]: true }));
            }}
          >
            <Icon name="plus" size={15} />
            Ajouter un lot
          </button>
        </div>
        <div className="p-body" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {data.lots.map((lot, li) => {
            const rl = r.lots.find((x) => x.numero === lot.numero && x.titre === lot.titre) ?? r.lots[li];
            const ouvert = !!lotsOuverts[li];
            const toggle = () => setLotsOuverts((o) => ({ ...o, [li]: !o[li] }));
            return (
              <div key={li} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "var(--bg2)", flexWrap: "wrap" }}>
                  <button className="icon-btn" title={ouvert ? "Replier le lot" : "Dérouler le lot"} onClick={toggle}>
                    <Icon name={ouvert ? "chevronDown" : "chevronRight"} size={16} />
                  </button>
                  <span style={{ fontWeight: 700, whiteSpace: "nowrap" }}>Lot</span>
                  <NumInput width={58} value={lot.numero} onChange={(n) => edit((d) => ((d.lots[li].numero = n), d))} />
                  <input
                    className="edit-inp"
                    style={{ minWidth: 200, flex: 1 }}
                    value={lot.titre}
                    onChange={(e) => edit((d) => ((d.lots[li].titre = e.target.value), d))}
                  />
                  <input
                    className="edit-inp"
                    style={{ width: 160 }}
                    placeholder="Entreprise"
                    value={lot.entreprise ?? ""}
                    onChange={(e) => edit((d) => ((d.lots[li].entreprise = e.target.value), d))}
                  />
                  <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12.5, color: "var(--fg2)" }}>
                    Remise
                    <NumInput width={64} value={lot.remisePct} onChange={(n) => edit((d) => ((d.lots[li].remisePct = n), d))} />
                    %
                  </label>
                  <button
                    className="icon-btn"
                    title="Supprimer le lot"
                    onClick={() => {
                      edit((d) => ((d.lots.splice(li, 1)), d));
                      setLotsOuverts((o) => {
                        const next: Record<number, boolean> = {};
                        for (const [k, v] of Object.entries(o)) {
                          const i = Number(k);
                          if (i < li) next[i] = v;
                          else if (i > li) next[i - 1] = v;
                        }
                        return next;
                      });
                    }}
                  >
                    <Icon name="trash" size={15} />
                  </button>
                </div>
                {!ouvert ? (
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 18, padding: "9px 14px", borderTop: "1px solid var(--border)", fontSize: 13, flexWrap: "wrap", cursor: "pointer" }}
                    onClick={toggle}
                    title="Dérouler le lot"
                  >
                    <span style={{ color: "var(--fg-muted)" }}>
                      {lot.lignes.length} ligne{lot.lignes.length > 1 ? "s" : ""} de devis
                    </span>
                    <span style={{ flex: 1 }}></span>
                    <span>
                      HT {lot.remisePct > 0 ? "après remise " : ""}
                      <b>{fmtEuroFull(rl?.totalHtApresRemise ?? 0)}</b>
                    </span>
                    <span>
                      Retenu MPR <b style={{ color: "var(--color-primary-700)" }}>{fmtEuroFull(rl?.totalHtRetenu ?? 0)}</b>
                    </span>
                    <span>
                      TTC <b>{fmtEuroFull(rl?.totalTtc ?? 0)}</b>
                    </span>
                  </div>
                ) : (
                <>
                <div className="tablewrap">
                  <table className="dossiers" style={{ fontSize: 12.5 }}>
                    <thead>
                      <tr>
                        <th style={{ width: 170 }}>Groupe</th>
                        <th>Désignation</th>
                        <th style={{ width: 70 }} title="Montant retenu dans l'assiette MaPrimeRénov'">
                          Retenu
                        </th>
                        <th style={{ ...thR, width: 130 }}>€ HT</th>
                        <th style={{ width: 110 }}>TVA</th>
                        {multiCles && (
                          <th style={{ width: 170 }} title="Clé de répartition appliquée à la ligne pour les plans individuels">
                            Clé de répartition
                          </th>
                        )}
                        <th style={{ width: 36 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {lot.lignes.map((l: LigneLot, i) => (
                        <tr key={i} style={{ cursor: "default" }}>
                          <td>
                            <input
                              className="edit-inp"
                              style={{ width: "100%" }}
                              placeholder="-"
                              value={l.groupe ?? ""}
                              onChange={(e) =>
                                edit((d) => ((d.lots[li].lignes[i].groupe = e.target.value || undefined), d))
                              }
                            />
                          </td>
                          <td>
                            <input
                              className="edit-inp"
                              style={{ width: "100%" }}
                              value={l.designation}
                              onChange={(e) => edit((d) => ((d.lots[li].lignes[i].designation = e.target.value), d))}
                            />
                          </td>
                          <td style={{ textAlign: "center" }}>
                            <input
                              type="checkbox"
                              checked={l.retenu}
                              onChange={(e) => edit((d) => ((d.lots[li].lignes[i].retenu = e.target.checked), d))}
                            />
                          </td>
                          <td style={tdR}>
                            <NumInput value={l.montantHt} onChange={(n) => edit((d) => ((d.lots[li].lignes[i].montantHt = n), d))} />
                          </td>
                          <td>
                            {l.tvaMontant != null ? (
                              // Montant de TVA saisi : ligne d'ajustement d'un PF estimatif (TTC du classeur)
                              <div style={{ display: "flex", alignItems: "center", gap: 4 }} title="Montant de TVA saisi (€) : cale le TTC sur celui du classeur">
                                <NumInput
                                  value={l.tvaMontant}
                                  onChange={(n) => edit((d) => ((d.lots[li].lignes[i].tvaMontant = n), d))}
                                />
                                <span className="se-small">€</span>
                              </div>
                            ) : (
                              <TvaSelect value={l.tvaPct} onChange={(n) => edit((d) => ((d.lots[li].lignes[i].tvaPct = n), d))} />
                            )}
                          </td>
                          {multiCles && (
                            <td>
                              <CleSelect
                                cles={cles}
                                value={l.cleRepartition ?? data.repartitionCles?.[`lot:${lot.numero}`]}
                                onChange={(code) => edit((d) => ((d.lots[li].lignes[i].cleRepartition = code), d))}
                              />
                            </td>
                          )}
                          <td>
                            <button className="icon-btn" title="Supprimer la ligne" onClick={() => edit((d) => (d.lots[li].lignes.splice(i, 1), d))}>
                              <Icon name="x" size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 18, padding: "9px 14px", borderTop: "1px solid var(--border)", fontSize: 13, flexWrap: "wrap" }}>
                  <button
                    className="se-btn se-btn-ghost btn-sm"
                    onClick={() =>
                      edit((d) => {
                        d.lots[li].lignes.push({ designation: "", retenu: false, montantHt: 0, tvaPct: 10 });
                        return d;
                      })
                    }
                  >
                    <Icon name="plus" size={14} />
                    Ligne
                  </button>
                  <span style={{ flex: 1 }}></span>
                  <span>
                    HT {lot.remisePct > 0 ? "après remise " : ""}
                    <b>{fmtEuroFull(rl?.totalHtApresRemise ?? 0)}</b>
                  </span>
                  <span>
                    Retenu MPR <b style={{ color: "var(--color-primary-700)" }}>{fmtEuroFull(rl?.totalHtRetenu ?? 0)}</b>
                  </span>
                  <span>
                    TTC <b>{fmtEuroFull(rl?.totalTtc ?? 0)}</b>
                  </span>
                </div>
                </>
                )}
              </div>
            );
          })}

          <div className="kv" style={{ borderTop: "1px solid var(--border)", paddingTop: 12, display: "flex", gap: 24, flexWrap: "wrap", fontSize: 13.5 }}>
            <span>
              Total travaux HT <b>{fmtEuroFull(r.totalTravauxHt)}</b>
            </span>
            <span>
              Retenu MPR {fmtEuro(r.travauxRetenusHt)} → assiette plafonnée{" "}
              <b style={{ color: "var(--color-primary-700)" }}>{fmtEuroFull(r.assietteMprTravaux)}</b>
              <span className="se-small" style={{ color: "var(--fg-muted)" }}>
                {" "}
                (plafond {fmtEuro(r.plafondAssiette)})
              </span>
            </span>
            <span>
              Total TTC <b>{fmtEuroFull(r.totalTravauxTtc)}</b>
            </span>
            <span>
              TTC + imprévus {String(data.params.imprevusPct).replace(".", ",")} %{" "}
              <b>{fmtEuroFull(r.totalTravauxTtcImprevus)}</b>
            </span>
          </div>
        </div>
      </div>

      {/* ---- MOE et frais annexes ---- */}
      <div className="panel">
        <div className="p-head">
          <Icon name="clipboard" size={18} />
          <h3>MOE et frais annexes</h3>
          <span style={{ flex: 1 }}></span>
          <span className="se-small" style={{ color: "var(--fg-muted)" }}>
            Total TTC <b>{fmtEuroFull(r.totalMoeTtc)}</b> · opération {fmtEuroFull(r.totalOperationTtc)}
          </span>
          <button
            className="se-btn se-btn-ghost btn-sm"
            onClick={() =>
              edit((d) => {
                d.moe.push({
                  designation: "",
                  phase: "travaux",
                  montant: { mode: "forfait", montantHt: 0 },
                  tvaPct: 20,
                  eligibleMprEtudes: false,
                  eligibleMprAmo: false,
                });
                return d;
              })
            }
          >
            <Icon name="plus" size={15} />
            Ligne
          </button>
        </div>
        <div className="p-body">
          <div className="tablewrap">
            <table className="dossiers" style={{ fontSize: 12.5 }}>
              <thead>
                <tr>
                  <th>Désignation</th>
                  <th style={{ width: 130 }} title="Entreprise / prestataire de la mission - reprise au suivi financier du syndic">
                    Entreprise
                  </th>
                  <th style={{ width: 120 }}>Phase</th>
                  <th style={{ width: 150 }}>Mode</th>
                  <th style={{ ...thR, width: 120 }}>HT / taux %</th>
                  <th style={{ width: 88 }}>TVA</th>
                  <th style={{ width: 66 }} title="Assiette Maprimerénov' partie études">
                    MPR ét.
                  </th>
                  <th style={{ width: 56 }} title="Assiette Maprimerénov' AMO (50 %)">
                    AMO
                  </th>
                  {multiCles && (
                    <th style={{ width: 170 }} title="Clé de répartition de la ligne pour les plans individuels">
                      Clé de répartition
                    </th>
                  )}
                  <th style={{ ...thR, width: 110 }}>TTC</th>
                  <th style={{ width: 36 }}></th>
                </tr>
              </thead>
              <tbody>
                {data.moe.map((l: LigneMoe, i) => (
                  <tr key={i} style={{ cursor: "default" }}>
                    <td>
                      <input
                        className="edit-inp"
                        style={{ width: "100%" }}
                        value={l.designation}
                        onChange={(e) => edit((d) => ((d.moe[i].designation = e.target.value), d))}
                      />
                    </td>
                    <td>
                      <input
                        className="edit-inp"
                        style={{ width: "100%" }}
                        placeholder="-"
                        value={l.entreprise ?? ""}
                        onChange={(e) => edit((d) => ((d.moe[i].entreprise = e.target.value || undefined), d))}
                      />
                    </td>
                    <td>
                      <select
                        className="edit-inp"
                        value={l.phase}
                        onChange={(e) => edit((d) => ((d.moe[i].phase = e.target.value as LigneMoe["phase"]), d))}
                      >
                        {PHASES_MOE.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select
                        className="edit-inp"
                        value={l.montant.mode}
                        onChange={(e) =>
                          edit((d) => {
                            const mode = e.target.value as LigneMoe["montant"]["mode"];
                            const ht = r.moe[i]?.montantHt ?? 0;
                            d.moe[i].montant =
                              mode === "forfait"
                                ? { mode, montantHt: ht }
                                : mode === "pctTravauxHt"
                                  ? { mode, taux: r.totalTravauxHt ? (ht / r.totalTravauxHt) * 100 : 0 }
                                  : { mode, taux: r.totalTravauxTtc ? (ht / r.totalTravauxTtc) * 100 : 0 };
                            return d;
                          })
                        }
                      >
                        <option value="forfait">Forfait HT</option>
                        <option value="pctTravauxHt">% travaux HT</option>
                        <option value="pctTravauxTtc">% travaux TTC</option>
                      </select>
                    </td>
                    <td style={tdR}>
                      <NumInput
                        value={l.montant.mode === "forfait" ? l.montant.montantHt : l.montant.taux}
                        onChange={(n) =>
                          edit((d) => {
                            const m = d.moe[i].montant;
                            if (m.mode === "forfait") m.montantHt = n;
                            else m.taux = n;
                            return d;
                          })
                        }
                      />
                    </td>
                    <td>
                      <TvaSelect value={l.tvaPct} onChange={(n) => edit((d) => ((d.moe[i].tvaPct = n), d))} />
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <input
                        type="checkbox"
                        checked={l.eligibleMprEtudes}
                        onChange={(e) => edit((d) => ((d.moe[i].eligibleMprEtudes = e.target.checked), d))}
                      />
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <input
                        type="checkbox"
                        checked={l.eligibleMprAmo}
                        onChange={(e) => edit((d) => ((d.moe[i].eligibleMprAmo = e.target.checked), d))}
                      />
                    </td>
                    {multiCles && (
                      <td>
                        <CleSelect
                          cles={cles}
                          value={l.cleRepartition ?? data.repartitionCles?.[`moe:${i}`]}
                          onChange={(code) => edit((d) => ((d.moe[i].cleRepartition = code), d))}
                        />
                      </td>
                    )}
                    <td className="mono" style={tdR}>
                      {fmtEuroFull(r.moe[i]?.montantTtc ?? 0)}
                    </td>
                    <td>
                      <button className="icon-btn" title="Supprimer" onClick={() => edit((d) => (d.moe.splice(i, 1), d))}>
                        <Icon name="x" size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="se-small" style={{ color: "var(--fg-muted)", margin: "10px 0 0" }}>
            « % travaux HT/TTC » : le montant suit automatiquement le total des travaux (MOE phase travaux,
            honoraires syndic, dommage-ouvrage). Total phase travaux TTC : <b>{fmtEuroFull(r.totalPhaseTravauxTtc)}</b>
          </p>
        </div>
      </div>

      {/* ---- répartition par clé (copros à plusieurs clés) ----
          Le choix se fait ligne par ligne dans les tableaux ci-dessus ; ce
          panneau récapitule les montants TTC par clé - ce sont
          ces clés qui servent aux plans individuels du financement. */}
      {multiCles && (
        <div className="panel">
          <div className="p-head">
            <Icon name="users" size={18} />
            <h3>Répartition par clé</h3>
            <span style={{ flex: 1 }}></span>
            {lignesSansCle > 0 ? (
              <Badge kind="warn">
                {lignesSansCle} ligne{lignesSansCle > 1 ? "s" : ""} sans clé
              </Badge>
            ) : (
              <Badge kind="success">Toutes les lignes affectées</Badge>
            )}
          </div>
          <div className="p-body">
            <p className="se-small" style={{ color: "var(--fg-muted)", margin: "0 0 10px" }}>
              La copropriété a {cles.length} clés de répartition : choisissez sur chaque ligne de devis et
              chaque ligne MOE la clé à appliquer. Ces choix servent au calcul des plans
              de financement individuels (onglet Financement de la copropriété).
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
              <span style={{ fontSize: 13 }}>Appliquer une clé à toutes les lignes :</span>
              <select className="edit-inp" value={cleGlobale} onChange={(e) => setCleGlobale(e.target.value)}>
                <option value="">- choisir -</option>
                {cles.map((k) => (
                  <option key={k.code} value={k.code}>
                    {k.code}
                    {k.label && k.label !== k.code ? ` - ${k.label}` : ""}
                  </option>
                ))}
              </select>
              <button
                className="se-btn se-btn-secondary btn-sm"
                disabled={!cleGlobale}
                onClick={() =>
                  edit((d) => {
                    for (const lot of d.lots) for (const l of lot.lignes) l.cleRepartition = cleGlobale;
                    for (const l of d.moe) l.cleRepartition = cleGlobale;
                    return d;
                  })
                }
              >
                Appliquer
              </button>
            </div>
            <div className="kv" style={{ display: "flex", gap: 24, flexWrap: "wrap", fontSize: 13.5 }}>
              {cles.map((k) => {
                const total = itemsCles.reduce((s, it) => s + (it.cle === k.code ? it.montantTtc : 0), 0);
                if (total === 0) return null;
                return (
                  <span key={k.code}>
                    Clé {k.code}
                    {k.label && k.label !== k.code ? ` - ${k.label}` : ""} <b>{fmtEuroFull(total)}</b>
                  </span>
                );
              })}
              {lignesSansCle > 0 && (
                <span style={{ color: "var(--color-error-700)" }}>
                  Non affecté{" "}
                  <b>{fmtEuroFull(itemsCles.reduce((s, it) => s + (it.cle ? 0 : it.montantTtc), 0))}</b>
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ---- aides ---- */}
      <div className="panel">
        <div className="p-head">
          <Icon name="euro" size={18} />
          <h3>Aides mobilisables</h3>
          <span style={{ flex: 1 }}></span>
          <span className="se-small" style={{ color: "var(--fg-muted)" }}>
            Total NET <b>{fmtEuroFull(r.totalAides)}</b> · publiques {fmtEuroFull(r.totalAidesPubliques)}
            {!estimatif && notif.attendues > 0 && ` · ${notif.notifiees}/${notif.attendues} notifiée${notif.notifiees > 1 ? "s" : ""}`}
          </span>
          <button
            className="se-btn se-btn-ghost btn-sm"
            onClick={() =>
              edit((d) => {
                d.aides.push({
                  id: `aide-${Date.now()}`,
                  groupe: "Autre",
                  libelle: "Nouvelle aide",
                  calcul: { mode: "manuel", montant: 0 },
                  publique: true,
                });
                return d;
              })
            }
          >
            <Icon name="plus" size={15} />
            Aide
          </button>
          <button
            className="se-btn se-btn-ghost btn-sm"
            title="Réinitialiser le catalogue standard (CEE, MPR, Climaxion, EMS)"
            onClick={() => {
              if (
                notif.notifiees > 0 &&
                !window.confirm("Le catalogue standard remplace toutes les aides du plan, montants notifiés compris. Continuer ?")
              )
                return;
              edit((d) => ((d.aides = makeAidesDefaut()), d));
            }}
          >
            Catalogue standard
          </button>
        </div>
        <div className="p-body">
          <div className="tablewrap">
            <table className="dossiers" style={{ fontSize: 12.5 }}>
              <thead>
                <tr>
                  <th style={{ width: 100 }}>Groupe</th>
                  <th style={{ width: 220 }}>Libellé</th>
                  <th>Formule</th>
                  <th style={{ width: 76 }} title="Compte dans le total des aides publiques (décoché : prime privée type CEE)">
                    Publique
                  </th>
                  <th style={{ ...thR, width: 120 }} title={estimatif ? undefined : "Montant donné par la formule"}>
                    {estimatif ? "Montant" : "Estimation"}
                  </th>
                  {!estimatif && (
                    <th
                      style={{ ...thR, width: 140 }}
                      title="Montant notifié par le financeur : il remplace l'estimation dans tous les calculs"
                    >
                      Notifié
                    </th>
                  )}
                  {multiCles && (
                    <th style={{ width: 190 }} title="Clé qui répartit l'aide entre copropriétaires (sans clé : au prorata de la quote-part)">
                      Clé de répartition
                    </th>
                  )}
                  <th style={{ width: 36 }}></th>
                </tr>
              </thead>
              <tbody>
                {data.aides.map((a: AideDef, i) => (
                  <tr key={a.id} style={{ cursor: "default" }}>
                    <td>
                      <input
                        className="edit-inp"
                        style={{ width: "100%" }}
                        value={a.groupe}
                        onChange={(e) => edit((d) => ((d.aides[i].groupe = e.target.value), d))}
                      />
                    </td>
                    <td>
                      <input
                        className="edit-inp"
                        style={{ width: "100%" }}
                        value={a.libelle}
                        onChange={(e) => edit((d) => ((d.aides[i].libelle = e.target.value), d))}
                      />
                    </td>
                    <td>
                      <AideFormule
                        calcul={a.calcul}
                        onChange={(calc) => edit((d) => ((d.aides[i].calcul = calc), d))}
                      />
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <input
                        type="checkbox"
                        checked={a.publique}
                        onChange={(e) => edit((d) => ((d.aides[i].publique = e.target.checked), d))}
                      />
                    </td>
                    <td className="mono" style={tdR}>
                      {estimatif ? (
                        r.aides[i]?.montant == null ? "-" : fmtEuroFull(r.aides[i].montant)
                      ) : r.aides[i]?.montantEstime == null ? (
                        "-"
                      ) : r.aides[i].notifiee ? (
                        <>
                          <span style={{ color: "var(--fg-muted)", textDecoration: "line-through" }}>
                            {fmtEuroFull(r.aides[i].montantEstime)}
                          </span>
                          <div className="se-small" style={{ color: ecartCouleur((r.aides[i].montant ?? 0) - r.aides[i].montantEstime!) }}>
                            {fmtEcart((r.aides[i].montant ?? 0) - r.aides[i].montantEstime!)}
                          </div>
                        </>
                      ) : (
                        fmtEuroFull(r.aides[i].montantEstime)
                      )}
                    </td>
                    {!estimatif && (
                      <td>
                        {a.calcul.mode === "info" ? (
                          <span className="se-small" style={{ color: "var(--fg-muted)" }}>
                            Aide individuelle
                          </span>
                        ) : (
                          <NotificationAide
                            aide={a}
                            onChange={(patch) => edit((d) => (Object.assign(d.aides[i], patch), d))}
                          />
                        )}
                      </td>
                    )}
                    {multiCles && (
                      <td>
                        <CleSelect
                          cles={cles}
                          value={a.cleRepartition}
                          vide="Au prorata de la quote-part"
                          onChange={(code) => edit((d) => ((d.aides[i].cleRepartition = code), d))}
                        />
                      </td>
                    )}
                    <td>
                      <button className="icon-btn" title="Supprimer" onClick={() => edit((d) => (d.aides.splice(i, 1), d))}>
                        <Icon name="x" size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!estimatif && (
            <p className="se-small" style={{ color: "var(--fg-muted)", margin: "10px 0 0" }}>
              À réception de la notification (décision de l'ANAH, de la Région, de l'EMS… ou contrat de la prime
              CEE), saisissez le montant notifié : il remplace l'estimation dans tous les calculs - restes à charge,
              plans individuels, portail des copropriétaires, appels de fonds du syndic. Laissez vide tant que l'aide
              n'est pas notifiée ; 0 pour une aide refusée.
              {notif.notifiees > 0 && (
                <>
                  {" "}
                  Écart avec les estimations :{" "}
                  <b style={{ color: ecartCouleur(notif.ecart) }}>{fmtEcart(notif.ecart)}</b>.
                </>
              )}
              {!notif.toutes && notif.attendues > 0 && (
                <> Tant que toutes les aides ne sont pas notifiées, le portail signale un reste à charge approximatif.</>
              )}
            </p>
          )}
        </div>
      </div>

      {/* ---- paramètres ---- */}
      <div className="panel">
        <div className="p-head">
          <Icon name="gauge" size={18} />
          <h3>Paramètres de financement</h3>
        </div>
        <div className="p-body" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(215px, 1fr))", gap: 12 }}>
          {(
            [
              ["Imprévus (% du TTC travaux)", "imprevusPct"],
              ["Plafond assiette MPR (€ HT/logt)", "plafondTravauxParLogement"],
              ["Garde-fou MPR travaux (€/logt)", "plafondMprParLogement"],
              ["Fonds travaux mobilisé (€)", "fondsTravaux"],
              ["Total tantièmes", "totalTantiemes"],
              ["Durée éco-PTZ (ans)", "dureeEcoPtzAns"],
              ["Coef. assurance non solidaire", "coefAssurance"],
              ["Coût prêt avance subventions (%)", "tauxPretAvancePct"],
              ["Aides avancées - variante individuelle (%)", "pctAvanceAides"],
            ] as const
          ).map(([label, key]) => (
            <label key={key} style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5, color: "var(--fg2)" }}>
              {label}
              <NumInput
                value={data.params[key]}
                onChange={(n) => edit((d) => (((d.params as unknown as Record<string, number>)[key] = n), d))}
              />
            </label>
          ))}
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5, color: "var(--fg2)" }}>
            Tantièmes d'exemple (séparés par des virgules)
            <input
              className="edit-inp"
              value={data.params.tantiemesExemples.join(", ")}
              onChange={(e) =>
                edit((d) => {
                  d.params.tantiemesExemples = e.target.value
                    .split(/[,;\s]+/)
                    .map((s) => Number(s))
                    .filter((n) => Number.isFinite(n) && n > 0);
                  return d;
                })
              }
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5, color: "var(--fg2)" }}>
            Commentaire fonds travaux
            <input
              className="edit-inp"
              value={data.params.commentaireFondsTravaux ?? ""}
              onChange={(e) => edit((d) => ((d.params.commentaireFondsTravaux = e.target.value || undefined), d))}
            />
          </label>
          {multiCles && (
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5, color: "var(--fg2)" }}>
              Clé du fonds travaux
              <CleSelect
                cles={cles}
                value={data.params.cleFondsTravaux}
                vide="Au prorata de la quote-part"
                onChange={(code) => edit((d) => ((d.params.cleFondsTravaux = code), d))}
              />
            </label>
          )}
        </div>
      </div>

      {/* ---- résultats : variantes de financement ----
          Empilées (collectif au-dessus, individuel en dessous) et affichées
          uniquement si le projet est concerné - les cases suivent les onglets
          du classeur importé et restent modifiables ici. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap", fontSize: 13.5 }}>
          <span style={{ fontWeight: 700, fontFamily: "var(--font-display)" }}>
            Variantes de financement présentées :
          </span>
          <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={data.variantes.collectif}
              onChange={(e) => edit((d) => ((d.variantes.collectif = e.target.checked), d))}
            />
            Éco-PTZ collectif + avance de subventions
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={data.variantes.collectifSansAvance}
              onChange={(e) => edit((d) => ((d.variantes.collectifSansAvance = e.target.checked), d))}
            />
            Éco-PTZ collectif sans avance de subventions
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={data.variantes.individuel}
              onChange={(e) => edit((d) => ((d.variantes.individuel = e.target.checked), d))}
            />
            Éco-PTZ individuel - appels de fonds
          </label>
          <span className="se-small" style={{ color: "var(--fg-muted)" }}>
            Seules les variantes cochées apparaissent ici et dans l'export Excel.
          </span>
        </div>
        {data.variantes.collectif && <VarianteCollectif r={r} data={data} />}
        {data.variantes.collectifSansAvance && <VarianteCollectifSansAvance r={r} data={data} />}
        {data.variantes.individuel && <VarianteIndividuel r={r} data={data} />}
        {!data.variantes.collectif && !data.variantes.collectifSansAvance && !data.variantes.individuel && (
          <p className="se-small" style={{ color: "var(--fg-muted)", margin: 0 }}>
            Aucune variante affichée - cochez au moins l'option de financement concernée par le projet.
          </p>
        )}
      </div>

      {/* ---- garde-fous ---- */}
      <div className="panel">
        <div className="p-head">
          <Icon name="alert" size={18} />
          <h3>Garde-fous</h3>
        </div>
        <div className="p-body" style={{ display: "flex", gap: 22, flexWrap: "wrap" }}>
          {r.gardeFous.map((g) => (
            <div key={g.libelle} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5 }}>
              <Icon
                name={g.ok ? "checkCircle" : "alert"}
                size={16}
                style={{ color: g.ok ? "var(--color-success-500)" : "var(--color-error-700)" }}
              />
              {g.libelle} : <b>{fmtEuroFull(g.valeur)}</b>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Écart notifié - estimé : « +7 000 € », « −1 250 € », « = estimation ». */
function fmtEcart(ecart: number): string {
  if (Math.abs(ecart) < 0.005) return "= estimation";
  return `${ecart > 0 ? "+" : "−"}${fmtEuroFull(Math.abs(ecart))}`;
}

function ecartCouleur(ecart: number): string {
  if (Math.abs(ecart) < 0.005) return "var(--fg-muted)";
  return ecart > 0 ? "var(--color-success-700)" : "var(--color-error-700)";
}

// ---------- formule d'aide (éditeur par mode) ----------

function AideFormule({ calcul, onChange }: { calcul: ModeAide; onChange: (m: ModeAide) => void }) {
  const set = (patch: Record<string, number | boolean>) => onChange({ ...calcul, ...patch } as unknown as ModeAide);
  const inline: CSSProperties = { display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", fontSize: 12.5 };
  const modeSelect = (
    <select
      className="edit-inp"
      value={calcul.mode}
      onChange={(e) => {
        const mode = e.target.value as ModeAide["mode"];
        const defs: Record<ModeAide["mode"], ModeAide> = {
          manuel: { mode: "manuel", montant: 0 },
          parM2Shab: { mode: "parM2Shab", tauxEurM2: 27, coef: 0.9 },
          pctAssietteTravaux: { mode: "pctAssietteTravaux", taux: 45, coef: 0.9 },
          pctEtudes: { mode: "pctEtudes", taux: 45, coef: 0.9 },
          pctAmo: { mode: "pctAmo", taux: 50 },
          forfaitPlusParLogement: { mode: "forfaitPlusParLogement", base: 10000, parLogement: 2500, surEquivalent: true },
          parLogement: { mode: "parLogement", montant: 1000, surEquivalent: true },
          info: { mode: "info" },
        };
        onChange(defs[mode]);
      }}
    >
      <option value="manuel">Montant manuel</option>
      <option value="parM2Shab">€ / m² habitable</option>
      <option value="pctAssietteTravaux">% assiette travaux MPR</option>
      <option value="pctEtudes">% études (prorata énergétique)</option>
      <option value="pctAmo">% AMO</option>
      <option value="forfaitPlusParLogement">Forfait + € / logement</option>
      <option value="parLogement">€ / logement</option>
      <option value="info">Ligne informative</option>
    </select>
  );
  return (
    <div style={inline}>
      {modeSelect}
      {calcul.mode === "manuel" && (
        <NumInput width={100} value={calcul.montant} onChange={(n) => set({ montant: n })} />
      )}
      {calcul.mode === "parM2Shab" && (
        <>
          <NumInput width={64} value={calcul.tauxEurM2} onChange={(n) => set({ tauxEurM2: n })} /> €/m² ×
          <NumInput width={60} value={calcul.coef} onChange={(n) => set({ coef: n })} />
        </>
      )}
      {(calcul.mode === "pctAssietteTravaux" || calcul.mode === "pctEtudes") && (
        <>
          <NumInput width={60} value={calcul.taux} onChange={(n) => set({ taux: n })} /> % ×
          <NumInput width={60} value={calcul.coef} onChange={(n) => set({ coef: n })} />
        </>
      )}
      {calcul.mode === "pctAmo" && (
        <>
          <NumInput width={60} value={calcul.taux} onChange={(n) => set({ taux: n })} /> %
        </>
      )}
      {calcul.mode === "forfaitPlusParLogement" && (
        <>
          <NumInput width={86} value={calcul.base} onChange={(n) => set({ base: n })} /> +
          <NumInput width={76} value={calcul.parLogement} onChange={(n) => set({ parLogement: n })} /> €/logt
          <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <input type="checkbox" checked={calcul.surEquivalent} onChange={(e) => set({ surEquivalent: e.target.checked })} />
            équiv.
          </label>
        </>
      )}
      {calcul.mode === "parLogement" && (
        <>
          <NumInput width={76} value={calcul.montant} onChange={(n) => set({ montant: n })} /> €/logt
          <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <input type="checkbox" checked={calcul.surEquivalent} onChange={(e) => set({ surEquivalent: e.target.checked })} />
            équiv.
          </label>
        </>
      )}
    </div>
  );
}

// ---------- variantes de financement ----------

function Kv({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="kv">
      <span className="k" style={strong ? { fontWeight: 700, color: "var(--fg1)" } : undefined}>{k}</span>
      <span className="v" style={strong ? { fontFamily: "var(--font-display)", fontSize: 16 } : undefined}>{v}</span>
    </div>
  );
}

function ExemplesTable({
  head,
  rows,
}: {
  head: string[];
  rows: (string | number)[][];
}) {
  return (
    <div className="tablewrap" style={{ marginTop: 10 }}>
      <table className="dossiers" style={{ fontSize: 12.5 }}>
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={h} style={i > 0 ? thR : undefined}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ cursor: "default" }}>
              {row.map((cell, j) => (
                <td key={j} className={j > 0 ? "mono" : undefined} style={j > 0 ? tdR : undefined}>
                  {typeof cell === "number" ? fmtEuroFull(cell) : cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function VarianteCollectif({ r, data }: { r: NonNullable<ReturnType<typeof computePlanDefinitif>>; data: PlanDefinitifData }) {
  return (
    <div className="panel">
      <div className="p-head">
        <Icon name="users" size={18} />
        <h3>Éco-PTZ collectif + avance de subventions</h3>
      </div>
      <div className="p-body">
        <Kv k="Taux de couverture par les aides" v={`${(r.tauxCouverture * 100).toFixed(1)} %`} />
        <Kv k="Fonds travaux mobilisé" v={fmtEuroFull(data.params.fondsTravaux)} />
        <Kv k="Reste à charge définitif collectif" v={fmtEuroFull(r.resteACharge)} />
        <Kv k="Reste à financer (prime CEE en fin de travaux)" v={fmtEuroFull(r.collectif.resteAFinancer)} strong />
        <Kv k={`Coût au tantième avant aides (/${data.params.totalTantiemes})`} v={fmtEuroFull(r.coutTantiemeAvant)} />
        <Kv k="Coût au tantième après aides publiques et fonds travaux déduits" v={fmtEuroFull(r.collectif.coutTantiemeApres)} />
        <ExemplesTable
          head={["Tantièmes", "Quote-part avant aides", "Reste à financer", `Mensualité ${data.params.dureeEcoPtzAns} ans`, "Coût prêt avance", "Prime CEE", "Prix de revient"]}
          rows={r.collectif.exemples.map((e) => [
            `${e.tantiemes}/${data.params.totalTantiemes}`,
            e.quotePartAvant,
            e.resteAFinancer,
            e.mensualiteEcoPtz,
            e.coutPretAvance,
            e.primeCee,
            e.prixRevient,
          ])}
        />
        <p className="se-small" style={{ color: "var(--fg-muted)", margin: "8px 0 0" }}>
          Prix de revient = reste à financer + coût du prêt avance de subventions ({String(data.params.tauxPretAvancePct).replace(".", ",")} %) − prime CEE.
        </p>
      </div>
    </div>
  );
}

function VarianteCollectifSansAvance({ r, data }: { r: NonNullable<ReturnType<typeof computePlanDefinitif>>; data: PlanDefinitifData }) {
  const v = r.collectifSansAvance;
  return (
    <div className="panel">
      <div className="p-head">
        <Icon name="users" size={18} />
        <h3>Éco-PTZ collectif sans avance de subventions</h3>
      </div>
      <div className="p-body">
        <Kv k="Taux de couverture par les aides" v={`${(r.tauxCouverture * 100).toFixed(1)} %`} />
        <Kv k="Fonds travaux mobilisé" v={fmtEuroFull(data.params.fondsTravaux)} />
        <Kv k="Reste à charge définitif collectif" v={fmtEuroFull(r.resteACharge)} />
        <Kv k="Reste à financer (prime CEE en fin de travaux)" v={fmtEuroFull(v.resteAFinancer)} strong />
        <Kv k={`Coût au tantième avant aides (/${data.params.totalTantiemes})`} v={fmtEuroFull(r.coutTantiemeAvant)} />
        <Kv k="Coût au tantième après aides publiques et fonds travaux déduits" v={fmtEuroFull(v.coutTantiemeApres)} />
        <ExemplesTable
          head={["Tantièmes", "Quote-part avant aides", "Reste à financer", `Mensualité ${data.params.dureeEcoPtzAns} ans`, "Prime CEE", "Prix de revient"]}
          rows={v.exemples.map((e) => [
            `${e.tantiemes}/${data.params.totalTantiemes}`,
            e.quotePartAvant,
            e.resteAFinancer,
            e.mensualiteEcoPtz,
            e.primeCee,
            e.prixRevient,
          ])}
        />
        <p className="se-small" style={{ color: "var(--fg-muted)", margin: "8px 0 0" }}>
          Sans prêt d'avance : les subventions publiques sont perçues directement par la copropriété -
          aucun coût d'avance n'est facturé. Prix de revient = reste à financer − prime CEE.
        </p>
      </div>
    </div>
  );
}

function VarianteIndividuel({ r, data }: { r: NonNullable<ReturnType<typeof computePlanDefinitif>>; data: PlanDefinitifData }) {
  const pct = data.params.pctAvanceAides;
  return (
    <div className="panel">
      <div className="p-head">
        <Icon name="user" size={18} />
        <h3>Éco-PTZ individuel - appels de fonds {pct} % / {100 - pct} %</h3>
      </div>
      <div className="p-body">
        <Kv k={`${pct} % des aides publiques (déduites des appels)`} v={fmtEuroFull(r.individuel.aidesAvancees)} />
        <Kv k={`${100 - pct} % remboursés en fin de chantier`} v={fmtEuroFull(r.individuel.aidesFinChantier)} />
        <Kv k="Reste à charge définitif collectif" v={fmtEuroFull(r.resteACharge)} />
        <Kv k={`Appels de fonds (${pct} % des aides déduits)`} v={fmtEuroFull(r.individuel.appelsFonds)} strong />
        <Kv k="Coût au tantième après toutes aides et fonds travaux déduits" v={fmtEuroFull(r.individuel.coutTantiemeApresAides)} />
        <Kv k={`Coût au tantième avec ${pct} % des aides déduites`} v={fmtEuroFull(r.individuel.coutTantiemeAvecAvance)} />
        <ExemplesTable
          head={["Tantièmes", "Quote-part avant aides", "Appels de fonds", "Remboursé fin de chantier", `Mensualité ${data.params.dureeEcoPtzAns} ans`, "Prix de revient"]}
          rows={r.individuel.exemples.map((e) => [
            `${e.tantiemes}/${data.params.totalTantiemes}`,
            e.quotePartAvant,
            e.appelsFonds,
            e.remboursementFinChantier,
            e.mensualiteEcoPtz,
            e.prixRevient,
          ])}
        />
        <p className="se-small" style={{ color: "var(--fg-muted)", margin: "8px 0 0" }}>
          Chaque copropriétaire finance sa quote-part (éco-PTZ individuel possible) ; {100 - pct} % des aides
          publiques lui sont remboursés à la fin du chantier.
        </p>
      </div>
    </div>
  );
}

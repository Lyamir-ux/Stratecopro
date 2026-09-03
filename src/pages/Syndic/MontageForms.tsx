// Formulaires du montage bancaire éco-PTZ collectif (CEGEE), côté syndic.
// Deux formulaires pré-remplis depuis la base projet :
//   - la fiche de renseignements avant AG (envoyée à la banque avant convocation) ;
//   - l'onglet 1 « Demande de prêt » du classeur CEGEE (Strat Eco produit
//     ensuite le fichier Excel à partir de ces réponses).
// Les valeurs saisies vivent dans montage_formulaires.data (jsonb).
import { useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import type { Json } from "@/lib/database.types";
import type { FinanceParams, FinanceResult } from "@/lib/finance";
import { useFinancementConfig, useScenariosPartages } from "@/api/portail";
import {
  useFormulairesMontage,
  useSaveFormulaireMontage,
  type FormulaireType,
} from "@/api/montage";
import type { SyndicCopro } from "@/api/syndic";

// Coordonnées de l'opérateur - constantes Strat Eco (section AMO des fiches CEGEE)
const AMO = {
  nom: "STRAT ECO",
  adresse: "27 rue du Vieux Marché aux Vins",
  ville_cp: "67000 Strasbourg",
  interlocuteur: "Amir CHELGHAM",
  tel: "06 60 36 34 34",
  email: "amir@strateco.fr",
};

type ChampType = "text" | "date" | "number" | "select" | "ouinon";

interface Champ {
  key: string;
  label: string;
  type?: ChampType;
  options?: string[];
  hint?: string;
  readonly?: boolean;
  span2?: boolean;
  /** Affiché seulement si la condition sur les valeurs courantes est vraie. */
  visibleSi?: (v: Record<string, string>) => boolean;
}

interface SectionDef {
  titre: string;
  note?: string;
  champs: Champ[];
}

const OUINON = ["", "OUI", "NON"];
const DUREES_ECOPTZ = ["", "5", "7", "10", "12", "15", "20"];

// ========== Définition : fiche de renseignements avant AG ==========

const FICHE_SECTIONS: SectionDef[] = [
  {
    titre: "Votre cabinet (syndic)",
    champs: [
      { key: "syndic_nom", label: "Nom du syndic" },
      { key: "syndic_siren", label: "SIREN du syndic" },
      { key: "syndic_adresse", label: "Adresse" },
      { key: "syndic_ville_cp", label: "Ville et code postal" },
      { key: "syndic_interlocuteur", label: "Nom de l'interlocuteur syndic" },
      { key: "syndic_tel", label: "Portable" },
      { key: "syndic_email", label: "Adresse e-mail", span2: true },
    ],
  },
  {
    titre: "La copropriété",
    champs: [
      { key: "copro_date_ag", label: "Date prévisionnelle de l'AG", type: "date" },
      { key: "copro_nom", label: "Nom de la copropriété" },
      { key: "copro_adresse", label: "Adresse de la copropriété" },
      { key: "copro_ville_cp", label: "Ville et code postal" },
      { key: "copro_nb_coproprietaires", label: "Nombre de copropriétaires", type: "number" },
      { key: "copro_nature_travaux", label: "Nature des travaux envisagés" },
    ],
  },
  {
    titre: "AMO / Opérateur",
    note: "Renseigné par Strat Eco.",
    champs: [
      { key: "amo_nom", label: "Nom de l'organisme", readonly: true },
      { key: "amo_interlocuteur", label: "Interlocuteur", readonly: true },
      { key: "amo_adresse", label: "Adresse", readonly: true },
      { key: "amo_ville_cp", label: "Ville et code postal", readonly: true },
      { key: "amo_tel", label: "Portable", readonly: true },
      { key: "amo_email", label: "Adresse e-mail", readonly: true },
    ],
  },
  {
    titre: "Financement",
    champs: [
      {
        key: "budget_ttc",
        label: "Budget estimatif des travaux (€ TTC)",
        type: "number",
        hint: "Tous frais confondus, honoraires syndic inclus",
        span2: true,
      },
    ],
  },
  {
    titre: "Prêts envisagés",
    champs: [
      { key: "pret_copro100", label: "COPRO 100", type: "ouinon" },
      { key: "pret_avance", label: "Avance de subventions", type: "ouinon" },
      {
        key: "pret_avance_montant",
        label: "Montant prévisionnel de l'avance (€)",
        type: "number",
        visibleSi: (v) => v.pret_avance === "OUI",
      },
      { key: "pret_ecoptz", label: "Éco-prêt à taux zéro", type: "ouinon" },
      {
        key: "pret_ecoptz_duree",
        label: "Durée souhaitée (ans)",
        type: "select",
        options: DUREES_ECOPTZ,
        hint: "5, 7, 10, 12, 15 ans - ou 20 ans pour une rénovation énergétique globale",
        visibleSi: (v) => v.pret_ecoptz === "OUI",
      },
      {
        key: "pret_compl",
        label: "COPRO 100 ou COPRO 1 en complément de l'éco-prêt",
        type: "ouinon",
      },
    ],
  },
];

// ========== Définition : demande de prêt CEGEE (onglet 1) ==========

const PRET_SECTIONS: SectionDef[] = [
  {
    titre: "Syndicat des copropriétaires",
    champs: [
      { key: "sdc_designation", label: "Désignation du syndicat des copropriétaires" },
      { key: "sdc_adresse", label: "Adresse de l'immeuble" },
      { key: "sdc_cp", label: "Code postal" },
      { key: "sdc_ville", label: "Ville" },
      { key: "sdc_siren", label: "SIREN", hint: "À vérifier sur www.sirene.fr" },
      {
        key: "sdc_immatriculation",
        label: "Numéro d'immatriculation ANAH",
        hint: "À vérifier sur www.registre-coproprietes.gouv.fr",
      },
    ],
  },
  {
    titre: "Immeuble",
    champs: [
      { key: "imm_date_construction", label: "Date de construction", type: "date" },
      { key: "imm_fiche_synthetique_maj", label: "Mise à jour de la fiche synthétique", type: "date" },
      { key: "imm_lots_principaux", label: "Nombre de lots principaux", type: "number", hint: "Caves, greniers et parkings exclus" },
      { key: "imm_logements", label: "Nombre de logements", type: "number" },
      { key: "imm_locaux_commerciaux", label: "Nombre de locaux commerciaux", type: "number" },
      { key: "imm_locaux_pro", label: "Nombre de locaux professionnels", type: "number" },
      { key: "imm_nb_coproprietaires", label: "Nombre de copropriétaires ou associés", type: "number" },
      { key: "imm_usage", label: "À usage" },
      { key: "imm_budget_annuel", label: "Budget annuel de la copropriété (€)", type: "number" },
    ],
  },
  {
    titre: "Nature et montants des dépenses votées",
    champs: [
      { key: "trav_nature", label: "Nature des travaux", span2: true },
      {
        key: "trav_cout_total",
        label: "Coût total de l'opération (€)",
        type: "number",
        hint: "Y compris honoraires, frais et accessoires pour leur montant régulièrement voté",
      },
      { key: "conso_avant", label: "Consommation AVANT travaux (kWhep/m²/an)", type: "number", hint: "Complété par Strat Eco si vide" },
      { key: "conso_apres", label: "Consommation APRÈS travaux (kWhep/m²/an)", type: "number", hint: "Complété par Strat Eco si vide" },
      { key: "amo_nom", label: "Nom de l'AMO", readonly: true },
      { key: "amo_contact", label: "Contact AMO", readonly: true },
    ],
  },
  {
    titre: "Syndic ou représentant légal",
    champs: [
      { key: "syndic_nom", label: "Nom du syndic" },
      { key: "syndic_interlocuteur", label: "Interlocuteur" },
      { key: "syndic_adresse", label: "Adresse" },
      { key: "syndic_tel", label: "Téléphone" },
      { key: "syndic_cp", label: "Code postal" },
      { key: "syndic_ville", label: "Ville" },
      { key: "syndic_email", label: "Courriel" },
      { key: "syndic_gerant", label: "Nom et prénom du gérant / représentant légal" },
      { key: "syndic_date_designation", label: "Date de désignation ou de renouvellement", type: "date" },
      { key: "syndic_date_echeance", label: "Date d'échéance du mandat en cours", type: "date" },
    ],
  },
  {
    titre: "Personne habilitée à signer le contrat de prêt",
    note: "Pour une personne autre que le représentant légal du syndic, joindre une délégation de pouvoirs et une pièce d'identité (étape 2 - ouverture du compte travaux).",
    champs: [
      { key: "signataire_nom_fonction", label: "Nom, prénom et fonction", span2: true },
      { key: "signataire_mobile", label: "Téléphone mobile", hint: "Obligatoire en cas de signature électronique du contrat" },
      { key: "signataire_email", label: "Courriel", hint: "Obligatoire en cas de signature électronique du contrat" },
    ],
  },
  {
    titre: "Professionnel",
    champs: [
      { key: "pro_siren", label: "SIREN (ou SIRET si établissement secondaire)" },
      { key: "pro_date_creation", label: "Date de création du syndic", type: "date" },
      { key: "pro_carte_numero", label: "N° de carte professionnelle" },
      { key: "pro_carte_expiration", label: "Date d'expiration de la carte professionnelle", type: "date" },
      { key: "pro_garantie_organisme", label: "Garantie financière - organisme émetteur" },
      { key: "pro_garantie_numero", label: "Numéro de la garantie" },
      { key: "pro_garantie_montant", label: "Montant de la garantie financière (€)", type: "number" },
      { key: "pro_rc", label: "Assurance RC professionnelle - n° et compagnie" },
    ],
  },
  {
    titre: "Plan de financement",
    note: "Pré-rempli depuis le plan de financement du projet - vérifié et finalisé par Strat Eco.",
    champs: [
      { key: "pf_cout_total", label: "Coût total de l'opération (A) (€)", type: "number" },
      { key: "pf_subventions_total", label: "Montant total des subventions (B) (€)", type: "number", hint: "Collectives et individuelles" },
      { key: "pf_subv_collectives", label: "Subventions collectives (€)", type: "number" },
      { key: "pf_subv_individuelles", label: "Subventions individuelles (€)", type: "number" },
      { key: "pf_prefinancement", label: "Préfinancement des subventions demandé à la Caisse d'Épargne", type: "ouinon" },
      { key: "pf_ecoptz_montant", label: "Montant demandé en éco-PTZ (€)", type: "number" },
      { key: "pf_copro100_montant", label: "Montant demandé en COPRO 100 / COPRO 1 (€)", type: "number" },
    ],
  },
];

// ========== Pré-remplissage depuis la base projet ==========

// Champs communs aux deux formulaires : ce que le syndic a saisi dans l'un
// complète automatiquement l'autre (feedback du 03/09/2026). Clé du formulaire
// courant → clé du formulaire source (identique quand le nom est le même).
const CHAMPS_PARTAGES: Record<FormulaireType, Record<string, string>> = {
  fiche_avant_ag: {
    syndic_nom: "syndic_nom",
    syndic_siren: "pro_siren",
    syndic_adresse: "syndic_adresse",
    syndic_interlocuteur: "syndic_interlocuteur",
    syndic_tel: "syndic_tel",
    syndic_email: "syndic_email",
    copro_nom: "sdc_designation",
    copro_adresse: "sdc_adresse",
    copro_nb_coproprietaires: "imm_nb_coproprietaires",
    copro_nature_travaux: "trav_nature",
    budget_ttc: "trav_cout_total",
  },
  demande_pret: {
    syndic_nom: "syndic_nom",
    pro_siren: "syndic_siren",
    syndic_adresse: "syndic_adresse",
    syndic_interlocuteur: "syndic_interlocuteur",
    syndic_tel: "syndic_tel",
    syndic_email: "syndic_email",
    sdc_designation: "copro_nom",
    sdc_adresse: "copro_adresse",
    imm_nb_coproprietaires: "copro_nb_coproprietaires",
    trav_nature: "copro_nature_travaux",
    trav_cout_total: "budget_ttc",
    pf_cout_total: "budget_ttc",
  },
};

/** Valeurs reprises de l'autre formulaire déjà saisi par le syndic. */
function reprisesAutreFormulaire(
  type: FormulaireType,
  autre: Record<string, string> | null
): Record<string, string> {
  if (!autre) return {};
  const out: Record<string, string> = {};
  for (const [cible, source] of Object.entries(CHAMPS_PARTAGES[type])) {
    const v = autre[source];
    if (v != null && String(v).trim() !== "") out[cible] = String(v);
  }
  return out;
}

function usePrefill(c: SyndicCopro, type: FormulaireType): Record<string, string> {
  const { data: scenarios } = useScenariosPartages(c.id);
  const { data: finConfig } = useFinancementConfig(c.id);
  const { data: forms } = useFormulairesMontage(c.id);
  return useMemo((): Record<string, string> => {
    const scenario = scenarios?.[0] ?? null;
    const res = (scenario?.resultat ?? null) as FinanceResult | null;
    const params = (scenario?.params ?? null) as FinanceParams | null;
    const n = (x: number | null | undefined) =>
      x != null && Number.isFinite(x) ? String(Math.round(x)) : "";
    // Fiche copro : code postal + ville, gestionnaire chez le syndic
    const villeCp = [c.code_postal, c.city].filter(Boolean).join(" ");
    const autre = (forms?.find((f) => f.type !== type)?.data ?? null) as Record<string, string> | null;
    const reprises = reprisesAutreFormulaire(type, autre);
    if (type === "fiche_avant_ag") {
      return {
        syndic_nom: c.syndic_name ?? "",
        syndic_interlocuteur: c.gestionnaire_nom ?? "",
        syndic_email: c.gestionnaire_email ?? "",
        copro_nom: c.name,
        copro_adresse: c.adresse ?? "",
        copro_ville_cp: villeCp,
        copro_nb_coproprietaires: n(c.stats?.coproprietaires),
        copro_nature_travaux: "Rénovation énergétique globale",
        amo_nom: AMO.nom,
        amo_adresse: AMO.adresse,
        amo_ville_cp: AMO.ville_cp,
        amo_interlocuteur: AMO.interlocuteur,
        amo_tel: AMO.tel,
        amo_email: AMO.email,
        budget_ttc: n(res?.coutTotal),
        pret_avance: params ? ((params.avancePct ?? 0) > 0 ? "OUI" : "NON") : "",
        pret_avance_montant:
          params && res && (params.avancePct ?? 0) > 0
            ? n((res.aidesColl * params.avancePct) / 100)
            : "",
        pret_ecoptz: params ? (params.ecoPtz ? "OUI" : "NON") : "",
        pret_ecoptz_duree: params?.ecoPtz
          ? String(params.ecoPtzDuree ?? finConfig?.duree_annees ?? "")
          : "",
        pret_compl: params ? (params.pretComplActif ? "OUI" : "NON") : "",
        ...reprises,
      };
    }
    return {
      sdc_designation: c.name,
      sdc_adresse: c.adresse ?? "",
      sdc_cp: c.code_postal ?? "",
      sdc_ville: c.city ?? "",
      imm_lots_principaux: n(c.stats?.lots),
      imm_logements: n(c.nb_logements ?? c.stats?.lots_hab),
      imm_nb_coproprietaires: n(c.stats?.coproprietaires),
      imm_usage: "Habitation",
      trav_nature: "Rénovation énergétique globale",
      trav_cout_total: n(res?.coutTotal),
      amo_nom: AMO.nom,
      amo_contact: `${AMO.interlocuteur} - ${AMO.tel} - ${AMO.email}`,
      syndic_nom: c.syndic_name ?? "",
      syndic_interlocuteur: c.gestionnaire_nom ?? "",
      syndic_email: c.gestionnaire_email ?? "",
      pf_cout_total: n(res?.coutTotal),
      pf_subventions_total: res ? n(res.aidesColl + res.aidesIndiv) : "",
      pf_subv_collectives: n(res?.aidesColl),
      pf_subv_individuelles: n(res?.aidesIndiv),
      pf_prefinancement: params ? ((params.avancePct ?? 0) > 0 ? "OUI" : "NON") : "",
      pf_ecoptz_montant: n(res?.ecoPtzMontant),
      ...reprises,
    };
  }, [c, scenarios, finConfig, forms, type]);
}

// ========== Rendu générique ==========

const FORM_META: Record<FormulaireType, { titre: string; sous: string; sections: SectionDef[] }> = {
  fiche_avant_ag: {
    titre: "Fiche de renseignements avant AG",
    sous: "À compléter avant la convocation à l'assemblée générale - la banque prépare les résolutions d'emprunt et le projet de contrat à partir de ces informations.",
    sections: FICHE_SECTIONS,
  },
  demande_pret: {
    titre: "Demande de prêt CEGEE - onglet 1",
    sous: "Vos réponses permettent à Strat Eco de pré-remplir le classeur Excel « COPRO CEGEE Demande de prêt » que vous n'aurez plus qu'à tamponner et signer.",
    sections: PRET_SECTIONS,
  },
};

export function FormulaireMontage({
  c,
  type,
  onBack,
}: {
  c: SyndicCopro;
  type: FormulaireType;
  onBack: () => void;
}) {
  const meta = FORM_META[type];
  const prefill = usePrefill(c, type);
  const { data: forms, isLoading } = useFormulairesMontage(c.id);
  const save = useSaveFormulaireMontage(c.id, type);
  const saved = forms?.find((f) => f.type === type) ?? null;

  const initial = useMemo(
    () => ({ ...prefill, ...((saved?.data ?? {}) as Record<string, string>) }),
    [prefill, saved]
  );
  const [values, setValues] = useState<Record<string, string> | null>(null);
  const v = values ?? initial;
  const set = (key: string, val: string) => setValues({ ...v, [key]: val });

  if (isLoading) return <div style={{ padding: 30, color: "var(--fg-muted)" }}>Chargement…</div>;

  const transmis = saved?.statut === "transmis";
  const doSave = (statut?: "brouillon" | "transmis") =>
    save.mutate({ data: v as unknown as Json, statut });

  return (
    <div className="fade">
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <button className="se-btn se-btn-ghost btn-sm" onClick={onBack}>
          <Icon name="chevronLeft" size={15} />
          Montage Éco-PTZ
        </button>
        <span style={{ flex: 1 }}></span>
        {transmis ? (
          <Badge kind="success" dot>
            Transmise à Strat Eco le {fmtDate(saved!.updated_at)}
          </Badge>
        ) : saved ? (
          <Badge kind="blue">Brouillon enregistré le {fmtDate(saved.updated_at)}</Badge>
        ) : null}
      </div>

      <div className="panel">
        <div className="p-head">
          <Icon name="fileText" size={18} />
          <h3>{meta.titre}</h3>
        </div>
        <div className="p-body">
          <p className="se-small" style={{ marginTop: 0, color: "var(--fg-muted)" }}>
            {meta.sous} Les champs déjà connus du projet sont pré-remplis (fiche de la copropriété, plan de
            financement, et ce que vous avez déjà saisi dans l'autre formulaire) - vérifiez-les et complétez le
            reste.
          </p>

          {meta.sections.map((s) => (
            <div key={s.titre} style={{ marginTop: 22 }}>
              <div className="se-eyebrow" style={{ marginBottom: 10 }}>{s.titre}</div>
              {s.note && (
                <p className="se-small" style={{ marginTop: 0, marginBottom: 12, color: "var(--fg-muted)" }}>
                  {s.note}
                </p>
              )}
              <div className="form-grid">
                {s.champs
                  .filter((ch) => !ch.visibleSi || ch.visibleSi(v))
                  .map((ch) => (
                    <div key={ch.key} className="fld" style={ch.span2 ? { gridColumn: "1 / -1" } : undefined}>
                      <label>
                        {ch.label}
                        {ch.hint && <span className="hint"> - {ch.hint}</span>}
                      </label>
                      {ch.type === "ouinon" || ch.type === "select" ? (
                        <select
                          value={v[ch.key] ?? ""}
                          disabled={ch.readonly}
                          onChange={(e) => set(ch.key, e.target.value)}
                        >
                          {(ch.type === "ouinon" ? OUINON : ch.options ?? []).map((o) => (
                            <option key={o} value={o}>
                              {o === "" ? "-" : o}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type={ch.type === "date" ? "date" : ch.type === "number" ? "number" : "text"}
                          value={v[ch.key] ?? ""}
                          readOnly={ch.readonly}
                          style={ch.readonly ? { background: "var(--bg-soft)", color: "var(--fg3)" } : undefined}
                          onChange={(e) => set(ch.key, e.target.value)}
                        />
                      )}
                    </div>
                  ))}
              </div>
            </div>
          ))}

          {save.isError && (
            <p className="se-small" style={{ color: "var(--color-error-700)", marginTop: 16 }}>
              L'enregistrement a échoué. Vérifiez votre connexion et réessayez.
            </p>
          )}

          <div style={{ display: "flex", gap: 10, marginTop: 26, alignItems: "center" }}>
            <button
              className="se-btn se-btn-secondary btn-sm"
              disabled={save.isPending}
              onClick={() => doSave()}
            >
              Enregistrer le brouillon
            </button>
            <button
              className="se-btn se-btn-primary btn-sm"
              disabled={save.isPending}
              onClick={() => doSave("transmis")}
            >
              <Icon name="send" size={15} />
              {transmis ? "Mettre à jour et retransmettre" : "Transmettre à Strat Eco"}
            </button>
            {save.isPending && <span className="se-small" style={{ color: "var(--fg-muted)" }}>Enregistrement…</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

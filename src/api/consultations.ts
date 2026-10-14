// Consultations de prestations intellectuelles - côté AMO.
// La publication alerte par e-mail les prestataires référencés du métier
// concerné (edge function `notifier-consultation`). Les candidatures arrivent
// soit du portail prestataire (offre chiffrée + pièce jointe), soit en saisie
// manuelle AMO (candidature reçue hors plateforme).
// Consultation restreinte (0125, idée d'Amir du 01/10/2026) : publiée pour
// les seules entreprises choisies par l'équipe (prestataires_choisis), qui
// sont les seules alertées et les seules à la voir dans leur espace.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@/lib/database.types";
import type { IconName } from "@/components/Icon";

export const CONSULT_TYPES: { id: Tables<"consultations">["type"]; label: string; icon: IconName }[] = [
  { id: "moe", label: "Maîtrise d'œuvre", icon: "hammer" },
  { id: "be", label: "Bureau d'études", icon: "layers" },
  { id: "pppt_dpe", label: "PPPT + DPE collectif", icon: "calendar" },
  { id: "diag", label: "Diagnostiqueur", icon: "fileCheck" },
  { id: "ct", label: "Contrôleur technique", icon: "clipboard" },
  { id: "sps", label: "Coordonnateur SPS", icon: "users" },
  { id: "autre", label: "Autre intervenant", icon: "briefcase" },
];

/**
 * Métiers de la base prestataires : ceux des consultations, plus les entreprises
 * de travaux RGE (0131, éco-PTZ individuel du 02/10/2026), saisies au dépôt
 * d'un devis ou d'une DPGF. Une entreprise de travaux n'est jamais consultée.
 */
export const METIERS_PRESTATAIRES: { id: Tables<"prestataires">["types"][number]; label: string; icon: IconName }[] = [
  ...CONSULT_TYPES,
  { id: "travaux", label: "Entreprise de travaux", icon: "hammer" },
];

export const libelleMetier = (id: string): string => METIERS_PRESTATAIRES.find((m) => m.id === id)?.label ?? id;

/** Prestations optionnelles proposées à la publication (cases à cocher).
 *  Uniquement pour une recherche de maîtrise d'œuvre - sans objet pour les autres métiers. */
export const CONSULT_OPTIONS: { id: string; label: string }[] = [
  { id: "audit_reglementaire", label: "Audit réglementaire" },
  { id: "pppt", label: "PPPT" },
  { id: "dpe_collectif", label: "DPE collectif" },
  { id: "memoire_climaxion", label: "Mémoire Climaxion" },
];

export const optionLabel = (id: string): string => CONSULT_OPTIONS.find((o) => o.id === id)?.label ?? id;

/** Sous-types d'une consultation « Diagnostiqueur ». */
export const DIAG_SOUS_TYPES: { id: string; label: string }[] = [
  { id: "amiante_plomb", label: "Diagnostic amiante et plomb avant travaux" },
  { id: "etancheite", label: "Test d'étanchéité à l'air" },
];

export const sousTypeLabel = (id: string): string => DIAG_SOUS_TYPES.find((s) => s.id === id)?.label ?? id;

/**
 * Poste de travaux envisagé (0164, idée de Louis du 13/10/2026) : une ligne du
 * tableau complété à la publication, en plus du budget estimatif.
 */
// (un type et non une interface : il s'enregistre tel quel dans la colonne JSON)
export type PosteTravaux = {
  poste: string;
  /** Estimation en € HT ; null si le poste n'est pas chiffré. */
  montant: number | null;
  precisions: string;
};

/** Métiers qui reçoivent le tableau des postes de travaux : maîtrise d'œuvre, diagnostic amiante et plomb, contrôle technique, SPS. */
export const consultationAvecPostes = (type: string, sousType?: string | null): boolean =>
  type === "moe" || type === "ct" || type === "sps" || (type === "diag" && sousType === "amiante_plomb");

/** Postes courants proposés d'un clic dans le formulaire. */
export const POSTES_SUGGERES: string[] = [
  "Isolation thermique des façades (ITE)",
  "Isolation de la toiture / des combles",
  "Isolation des planchers bas",
  "Remplacement des menuiseries extérieures",
  "Chauffage et eau chaude sanitaire",
  "Ventilation (VMC)",
  "Étanchéité de toiture-terrasse",
  "Parties communes (halls, escaliers, éclairage)",
];

/** Poste vide, tel qu'affiché dans une ligne à compléter. */
export const posteVide = (): PosteTravaux => ({ poste: "", montant: null, precisions: "" });

/** Relit la colonne JSON `postes_travaux` : tolérante, ignore tout ce qui n'est pas un poste nommé. */
export function lirePostesTravaux(json: unknown): PosteTravaux[] {
  if (!Array.isArray(json)) return [];
  const postes: PosteTravaux[] = [];
  for (const l of json) {
    if (!l || typeof l !== "object") continue;
    const o = l as Record<string, unknown>;
    const poste = typeof o.poste === "string" ? o.poste.trim() : "";
    if (!poste) continue;
    const montant = typeof o.montant === "number" && Number.isFinite(o.montant) ? o.montant : null;
    postes.push({ poste, montant, precisions: typeof o.precisions === "string" ? o.precisions.trim() : "" });
  }
  return postes;
}

/** Lignes à enregistrer : les lignes sans poste sont écartées. */
export const postesAEnregistrer = (lignes: PosteTravaux[]): PosteTravaux[] => lirePostesTravaux(lignes);

/** Somme des postes chiffrés, ou null si aucun ne l'est. */
export function totalPostesTravaux(postes: PosteTravaux[]): number | null {
  const chiffres = postes.filter((p) => p.montant != null);
  return chiffres.length ? chiffres.reduce((s, p) => s + (p.montant ?? 0), 0) : null;
}

export type Consultation = Tables<"consultations"> & {
  candidatures: Tables<"candidatures">[];
  copro: { name: string; city: string | null; adresse: string | null; code_postal: string | null } | null;
  notifications: (Tables<"consultation_notifications"> & { prestataire: { raison_sociale: string } | null })[];
  docs: Tables<"consultation_docs">[];
  acces: (Tables<"consultation_acces"> & { prestataire: { raison_sociale: string } | null })[];
  questions: (Tables<"consultation_questions"> & { prestataire: { raison_sociale: string } | null })[];
};

/** Nom + lieu affichables, que la copro soit sur la plateforme ou externe. */
export function consultationCible(cs: Consultation): { nom: string; lieu: string; externe: boolean } {
  if (cs.copro) {
    return { nom: cs.copro.name, lieu: cs.copro.adresse || cs.copro.city || "", externe: false };
  }
  return {
    nom: cs.copro_externe_nom ?? "-",
    lieu: [cs.copro_externe_adresse, cs.copro_externe_ville].filter(Boolean).join(", "),
    externe: true,
  };
}

export function useConsultations() {
  return useQuery({
    queryKey: ["consultations"],
    queryFn: async (): Promise<Consultation[]> => {
      // lien explicite : depuis 0109, consultations.analyse_candidature_id relie
      // aussi les deux tables dans l'autre sens (sinon erreur 300 de l'API)
      const { data, error } = await supabase
        .from("consultations")
        .select(
          "*, candidatures!candidatures_consultation_id_fkey(*), coproprietes(name, city, adresse, code_postal), consultation_notifications(*, prestataires(raison_sociale)), consultation_docs(*), consultation_acces(*, prestataires(raison_sociale)), consultation_questions(*, prestataires(raison_sociale))"
        )
        .order("published_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((c) => {
        const {
          candidatures,
          coproprietes,
          consultation_notifications,
          consultation_docs,
          consultation_acces,
          consultation_questions,
          ...rest
        } = c as typeof c & {
          candidatures: Tables<"candidatures">[];
          coproprietes: { name: string; city: string | null; adresse: string | null; code_postal: string | null } | null;
          consultation_notifications: (Tables<"consultation_notifications"> & {
            prestataires: { raison_sociale: string } | null;
          })[];
          consultation_docs: Tables<"consultation_docs">[];
          consultation_acces: (Tables<"consultation_acces"> & {
            prestataires: { raison_sociale: string } | null;
          })[];
          consultation_questions: (Tables<"consultation_questions"> & {
            prestataires: { raison_sociale: string } | null;
          })[];
        };
        return {
          ...rest,
          candidatures: (candidatures ?? []).sort((a, b) => (a.received_at < b.received_at ? 1 : -1)),
          copro: coproprietes,
          notifications: (consultation_notifications ?? []).map(({ prestataires, ...n }) => ({
            ...n,
            prestataire: prestataires,
          })),
          docs: consultation_docs ?? [],
          acces: (consultation_acces ?? [])
            .map(({ prestataires, ...a }) => ({ ...a, prestataire: prestataires }))
            .sort((a, b) => (a.first_at < b.first_at ? 1 : -1)),
          questions: (consultation_questions ?? [])
            .map(({ prestataires, ...q }) => ({ ...q, prestataire: prestataires }))
            .sort((a, b) => (a.asked_at < b.asked_at ? -1 : 1)),
        };
      });
    },
  });
}

export interface PublishResult {
  /** Bilan de la notification des prestataires référencés. */
  notification: {
    /** E-mails : un par personne depuis notifier-consultation v18 (avant : un par entreprise). */
    total: number;
    envoyes: number;
    simules: number;
    erreurs: number;
    mode: string;
    /** Entreprises qui ont reçu au moins un e-mail (v18). */
    entreprises?: number;
    /** Accès à l'espace prestataire ouverts par cet envoi (v18, règle d'Amir du 12/10/2026). */
    acces_crees?: number;
    /** E-mails envoyés avec le lien pour choisir son mot de passe (v18). */
    invitations?: number;
    /** Adresses de la fiche qui ne peuvent pas avoir d'accès (adresse prise…) (v18). */
    acces_impossibles?: { entreprise: string; email: string; motif: string }[];
    /** Entreprises pas encore traitées faute de temps : à reprendre par « Relancer les alertes » (v18). */
    restants?: number;
    /** Entreprises du métier écartées (0122) : « Ne pas consulter », autre département. */
    hors_consultation?: number;
    hors_departement?: number;
    departement?: string | null;
    /** Consultation restreinte (0125) : nombre d'entreprises choisies ; null = ouverte au métier. */
    choisis?: number | null;
  } | null;
  notifyError: string | null;
  /** Documents dont le dépôt a échoué (la consultation reste publiée). */
  docErrors: string[];
}

/** « 2 hors de leurs départements (67) · 1 ne souhaite pas être consultée », ou "" si personne n'est écarté. */
export function texteEcartes(n: NonNullable<PublishResult["notification"]>): string {
  const parts: string[] = [];
  const d = n.hors_departement ?? 0;
  const c = n.hors_consultation ?? 0;
  if (d) parts.push(`${d} entreprise${d > 1 ? "s" : ""} hors de ${d > 1 ? "leurs" : "ses"} départements${n.departement ? ` (copropriété en ${n.departement})` : ""}`);
  if (c) parts.push(`${c} entreprise${c > 1 ? "s" : ""} ne souhaitant pas être consultée${c > 1 ? "s" : ""}`);
  return parts.join(" · ");
}

const pl = (n: number, mot: string) => `${n} ${mot}${n > 1 ? "s" : ""}`;

/** « 18 e-mails envoyés (4 entreprises), 1 en erreur », ou l'envoi simulé. */
export function texteEnvois(n: NonNullable<PublishResult["notification"]>): string {
  const entreprises = n.entreprises != null ? ` (${pl(n.entreprises, "entreprise")})` : "";
  if (n.mode === "simulation") {
    return `${pl(n.total, "e-mail")} préparé${n.total > 1 ? "s" : ""}${entreprises} - envoi simulé (configurez RESEND_API_KEY pour l'e-mail réel).`;
  }
  return `${pl(n.envoyes, "e-mail")} envoyé${n.envoyes > 1 ? "s" : ""}${entreprises}${n.erreurs ? `, ${n.erreurs} en erreur` : ""}.`;
}

/**
 * Accès ouverts par l'envoi (règle d'Amir du 12/10/2026 : une personne sans
 * compte le reçoit avec la consultation), adresses sans accès possible et
 * entreprises restantes - une phrase par point, ou [] si rien à dire.
 */
export function phrasesAcces(n: NonNullable<PublishResult["notification"]>): string[] {
  const out: string[] = [];
  const crees = n.acces_crees ?? 0;
  const liens = n.invitations ?? 0;
  if (crees || liens) {
    out.push(
      [
        crees ? `${pl(crees, "accès")} à l'espace prestataire ouvert${crees > 1 ? "s" : ""}` : "",
        liens ? `${pl(liens, "e-mail")} avec le lien pour choisir le mot de passe` : "",
      ]
        .filter(Boolean)
        .join(", ") + "."
    );
  }
  const impossibles = n.acces_impossibles ?? [];
  if (impossibles.length) {
    out.push(
      `Sans accès possible : ${impossibles.map((a) => `${a.email} (${a.entreprise}, ${a.motif})`).join(" ; ")}.`
    );
  }
  if (n.restants) {
    out.push(
      `${pl(n.restants, "entreprise")} pas encore traitée${n.restants > 1 ? "s" : ""} (temps d'envoi dépassé) : cliquez de nouveau sur « Relancer les alertes ».`
    );
  }
  return out;
}

/**
 * Adresses choisies par l'équipe pour certaines entreprises (0139, idée de Louis
 * du 05/10/2026) : prestataire_id -> adresses à qui la consultation est envoyée.
 * Une entreprise absente reçoit l'alerte à son adresse principale et en copie.
 */
export type DestinatairesChoisis = Record<string, string[]>;

/** Après une alerte : le journal de la consultation et les accès ouverts à l'envoi (notifier-consultation v18). */
function invaliderApresEnvoi(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ["consultations"] });
  void qc.invalidateQueries({ queryKey: ["prestataires", "acces"] });
}

/** Enregistre le choix avant l'alerte : notifier-consultation le lit au moment de l'envoi. */
async function enregistrerDestinataires(consultationId: string, destinataires: DestinatairesChoisis | undefined) {
  const lignes = Object.entries(destinataires ?? {})
    .filter(([, emails]) => emails.length > 0)
    .map(([prestataire_id, emails]) => ({ consultation_id: consultationId, prestataire_id, emails }));
  if (lignes.length === 0) return;
  const { error } = await supabase
    .from("consultation_destinataires")
    .upsert(lignes, { onConflict: "consultation_id,prestataire_id" });
  if (error) throw error;
}

export function usePublishConsultation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      files,
      destinataires,
      ...input
    }: {
      type: Tables<"consultations">["type"];
      mission: string;
      date_limite: string | null;
      budget: number | null;
      copro_id: string | null;
      copro_externe_nom: string | null;
      copro_externe_adresse: string | null;
      copro_externe_ville: string | null;
      copro_externe_lots: number | null;
      nb_logements: number | null;
      nb_batiments: number | null;
      sous_type: string | null;
      options: string[];
      /** Postes de travaux envisagés (0164) ; [] si le métier n'a pas de tableau ou s'il reste vide. */
      postes_travaux: PosteTravaux[];
      /** Entreprises choisies (0125) ; null = toutes les entreprises du métier. */
      prestataires_choisis: string[] | null;
      /** Adresses choisies par entreprise (0139) ; absent = principale + copies. */
      destinataires?: DestinatairesChoisis;
      files: File[];
    }): Promise<PublishResult> => {
      const { data, error } = await supabase.from("consultations").insert(input).select("id").single();
      if (error) throw error;

      // Pièces jointes : la consultation reste publiée même si un dépôt échoue
      const docErrors: string[] = [];
      for (const file of files) {
        const path = `${data.id}/${Date.now()}-${file.name.replace(/[^\w.\-]+/g, "_")}`;
        const { error: upErr } = await supabase.storage.from("consultation-docs").upload(path, file);
        if (upErr) {
          docErrors.push(file.name);
          continue;
        }
        const { error: rowErr } = await supabase
          .from("consultation_docs")
          .insert({ consultation_id: data.id, path, name: file.name, size: file.size });
        if (rowErr) docErrors.push(file.name);
      }

      // Adresses choisies : enregistrées AVANT l'alerte. Si l'écriture échoue, aucun e-mail
      // ne part - l'alerte irait sinon à des adresses que l'équipe a voulu écarter.
      try {
        await enregistrerDestinataires(data.id, destinataires);
      } catch (e) {
        return {
          notification: null,
          notifyError:
            "le choix des adresses n'a pas pu être enregistré (" +
            String((e as Error).message ?? e) +
            "), aucun e-mail n'est parti. « Relancer les alertes » les enverra à l'adresse principale de chaque entreprise.",
          docErrors,
        };
      }

      // Alerte e-mail des prestataires référencés du métier - la consultation
      // reste publiée même si la notification échoue (relance possible).
      const { data: notif, error: fnErr } = await supabase.functions.invoke("notifier-consultation", {
        body: { consultation_id: data.id },
      });
      return {
        notification: fnErr ? null : (notif as PublishResult["notification"]),
        notifyError: fnErr ? String(fnErr.message ?? fnErr) : null,
        docErrors,
      };
    },
    onSuccess: () => invaliderApresEnvoi(qc),
  });
}

/**
 * Relance les alertes e-mail d'une consultation en ligne : notifie les
 * prestataires référencés du métier qui n'ont pas encore été alertés
 * (nouveaux référencés, envoi en erreur) et, chez ceux déjà prévenus, les
 * adresses ajoutées depuis et les personnes sans accès à l'espace prestataire
 * (accès ouvert, lien joint : notifier-consultation v18). Une personne déjà
 * prévenue et pourvue d'un accès ne reçoit rien de plus.
 */
export function useRelancerAlertes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (consultationId: string): Promise<PublishResult["notification"]> => {
      const { data, error: fnErr } = await supabase.functions.invoke("notifier-consultation", {
        body: { consultation_id: consultationId },
      });
      if (fnErr) throw new Error(String(fnErr.message ?? fnErr));
      return data as PublishResult["notification"];
    },
    onSuccess: () => invaliderApresEnvoi(qc),
  });
}

/**
 * Consultation restreinte (0125) : ajoute des entreprises à celles déjà
 * choisies, puis les alerte (la fonction serveur n'alerte que les choisies pas
 * encore prévenues). Les entreprises déjà choisies le restent.
 */
export function useAjouterPrestatairesChoisis() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      consultationId,
      dejaChoisis,
      ajouts,
      destinataires,
    }: {
      consultationId: string;
      dejaChoisis: string[];
      ajouts: string[];
      /** Adresses choisies pour les entreprises ajoutées (0139) ; absent = principale + copies. */
      destinataires?: DestinatairesChoisis;
    }): Promise<PublishResult["notification"]> => {
      const choisis = [...new Set([...dejaChoisis, ...ajouts])];
      const { error } = await supabase
        .from("consultations")
        .update({ prestataires_choisis: choisis })
        .eq("id", consultationId);
      if (error) throw error;
      try {
        await enregistrerDestinataires(consultationId, destinataires);
      } catch (e) {
        throw new Error(
          "Entreprises ajoutées, mais le choix des adresses n'a pas pu être enregistré (" +
            String((e as Error).message ?? e) +
            ") : aucun e-mail n'est parti."
        );
      }
      const { data, error: fnErr } = await supabase.functions.invoke("notifier-consultation", {
        body: { consultation_id: consultationId },
      });
      if (fnErr) throw new Error("Entreprises ajoutées, mais l'alerte e-mail a échoué : " + String(fnErr.message ?? fnErr));
      return data as PublishResult["notification"];
    },
    onSettled: () => invaliderApresEnvoi(qc),
  });
}

export function useCloseConsultation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("consultations").update({ statut: "cloturee" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["consultations"] }),
  });
}

/** Remise en ligne d'une consultation clôturée - pour relancer la recherche
 *  après la rétractation d'un prestataire retenu (faillite, devis expiré…). */
export function useReopenConsultation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("consultations").update({ statut: "en_ligne" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["consultations"] }),
  });
}

/** Saisie manuelle d'une candidature reçue hors plateforme (mail, courrier…). */
export function useAddCandidature() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ consultationId, org }: { consultationId: string; org: string }) => {
      const { error } = await supabase.from("candidatures").insert({ consultation_id: consultationId, org_name: org });
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["consultations"] }),
  });
}

export interface DecisionResult {
  /** Sort de l'e-mail de décision : envoye / simule / erreur / aucun_email (candidature hors plateforme). */
  emailStatut: string | null;
  emailErreur: string | null;
}

/** Décision de l'AMO sur une candidature : retenir / refuser (e-mail automatique
 *  au prestataire via l'edge function `notifier-choix`), ou annuler la décision.
 *  Une MOE retenue accède à son projet dès qu'elle confirme son engagement. */
export function useDeciderCandidature() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      statut,
    }: {
      id: string;
      statut: Tables<"candidatures">["statut"];
    }): Promise<DecisionResult> => {
      const patch =
        statut === "recue"
          ? { statut, decision_at: null, decision_email_statut: null, engagement_at: null }
          : { statut };
      const { error } = await supabase.from("candidatures").update(patch).eq("id", id);
      if (error) throw error;
      if (statut === "recue") return { emailStatut: null, emailErreur: null };
      // alerte e-mail au prestataire - la décision reste posée même si l'envoi échoue
      const { data, error: fnErr } = await supabase.functions.invoke("notifier-choix", {
        body: { candidature_id: id },
      });
      if (fnErr) return { emailStatut: "erreur", emailErreur: String(fnErr.message ?? fnErr) };
      const res = data as { statut: string; erreur: string | null };
      return { emailStatut: res.statut, emailErreur: res.erreur ?? null };
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["consultations"] }),
  });
}

/** Questions de prestataires sans réponse sur les consultations en ligne -
 *  alimente l'alerte du menu « Consulter un intervenant » (côté AMO). */
export function useQuestionsEnAttenteCount(enabled = true) {
  return useQuery({
    queryKey: ["questions-en-attente"],
    enabled,
    refetchInterval: 120000,
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from("consultation_questions")
        .select("id, consultations!inner(statut)", { count: "exact", head: true })
        .is("reponse", null)
        .eq("consultations.statut", "en_ligne");
      if (error) throw error;
      return count ?? 0;
    },
  });
}

/** Réponse de l'AMO à la question d'un candidat - visible de tous les
 *  candidats de la consultation (égalité d'information). */
export function useRepondreQuestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reponse }: { id: string; reponse: string }) => {
      const { error } = await supabase
        .from("consultation_questions")
        .update({ reponse: reponse.trim(), answered_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["consultations"] });
      void qc.invalidateQueries({ queryKey: ["questions-en-attente"] });
    },
  });
}

/** Ouvre l'offre jointe d'une candidature (URL signée 60 s, bucket privé). */
export async function ouvrirOffre(fichierPath: string): Promise<void> {
  const { data, error } = await supabase.storage.from("offres-presta").createSignedUrl(fichierPath, 60);
  if (error) throw error;
  window.open(data.signedUrl, "_blank");
}

/** Ouvre une pièce jointe de consultation (URL signée 60 s, bucket privé). */
export async function ouvrirDocConsultation(path: string): Promise<void> {
  const { data, error } = await supabase.storage.from("consultation-docs").createSignedUrl(path, 60);
  if (error) throw error;
  window.open(data.signedUrl, "_blank");
}

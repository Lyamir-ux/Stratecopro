import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase, toutesLesLignes } from "@/lib/supabase";
import type { Cadrage } from "@/lib/photoCadrage";
import type { Tables, TablesInsert } from "@/lib/database.types";
import { buildTaskTemplate } from "@/lib/taskTemplate";
import type { PhaseId } from "@/lib/referentiels";
import { organisationIdPourSyndic, resoudreOrganisation, type ChoixOrganisation } from "@/api/organisations";
import { creerFicheMaitreOeuvre, resoudreMaitreOeuvreEnBase } from "@/api/prestataires";
import { messageErreur } from "@/lib/erreurs";

export type CoproRow = Tables<"coproprietes">;
export type CoproStats = Tables<"copro_stats">;

export interface CoproWithStats extends CoproRow {
  stats: CoproStats | null;
  team: { user_id: string; initials: string; full_name: string }[];
  /** Enseigne de gestion rattachée au dossier (null si le dossier est isolé). */
  organisation: { id: string; nom: string } | null;
}

export function useCopros() {
  return useQuery({
    queryKey: ["copros"],
    queryFn: async (): Promise<CoproWithStats[]> => {
      const [{ data: copros, error: e1 }, { data: stats, error: e2 }, { data: members, error: e3 }] =
        await Promise.all([
          supabase
            .from("coproprietes")
            .select("*, organisations(id, nom)")
            .is("deleted_at", null)
            .order("updated_at", { ascending: false }),
          supabase.from("copro_stats").select("*"),
          supabase.from("copro_members").select("copro_id, user_id, profiles(initials, full_name)"),
        ]);
      if (e1) throw e1;
      if (e2) throw e2;
      if (e3) throw e3;
      const statsById = new Map((stats ?? []).map((s) => [s.id, s]));
      return (copros ?? []).map(({ organisations, ...c }) => ({
        ...c,
        stats: statsById.get(c.id) ?? null,
        organisation: organisations ?? null,
        team: (members ?? [])
          .filter((m) => m.copro_id === c.id)
          .map((m) => ({
            user_id: m.user_id,
            initials: m.profiles?.initials ?? "?",
            full_name: m.profiles?.full_name ?? "",
          })),
      }));
    },
  });
}

/**
 * Nombre de logements d'un dossier : les lots à usage d'habitation dès que le
 * tableau des lots est importé, sinon le nombre déclaré au portefeuille. Les caves,
 * garages et parkings ne comptent pas - un dossier se raisonne en logements.
 * Le tableau importé fait foi même s'il compte moins de logements que le nombre
 * déclaré (Amir, 29/09/2026 - remplace la règle du 15/09 qui gardait le plus grand).
 */
export function nbLogements(c: {
  nb_logements: number | null;
  stats: { lots: number | null; lots_hab: number | null } | null;
}): number {
  return c.stats?.lots ? (c.stats.lots_hab ?? 0) : (c.nb_logements ?? 0);
}

/** Infobulle du nombre de logements (bandeau et synthèse du dossier). */
export const TITRE_LOGEMENTS =
  "Lots d'habitation du tableau des lots importé - à défaut, nombre de logements déclaré au portefeuille";

/**
 * Avancement côté AMO : part des tâches internes faites (plan de tâches du
 * dossier, onglet Projet). Remplace l'ancien champ manuel coproprietes.progress,
 * qui n'était jamais alimenté.
 */
export function avancementAmo(c: {
  stats: { taches_total: number | null; taches_faites: number | null } | null;
}): number {
  const total = c.stats?.taches_total ?? 0;
  if (!total) return 0;
  return Math.round(((c.stats?.taches_faites ?? 0) / total) * 100);
}

// Effectifs du gabarit des tâches syndic (0048) : 5 diagnostic + 6 études +
// 10 travaux. Sert de repli tant que le gabarit d'un dossier n'est pas semé
// (première ouverture) : mêmes valeurs que le semis, qui marque faites les
// tâches des phases déjà franchies.
const GABARIT_SYNDIC = { total: 21, diagnostic: 5, etudes: 6 };

/**
 * Avancement côté syndic : part de SES tâches d'accompagnement faites
 * (syndic_taches). Dossier jamais ouvert côté syndic (gabarit pas encore
 * semé) : équivalent du semis d'après la phase.
 */
export function avancementSyndic(c: {
  phase: string;
  stats: { staches_total: number | null; staches_faites: number | null } | null;
}): number {
  const total = c.stats?.staches_total ?? 0;
  if (total) return Math.round(((c.stats?.staches_faites ?? 0) / total) * 100);
  const faites =
    c.phase === "travaux"
      ? GABARIT_SYNDIC.diagnostic + GABARIT_SYNDIC.etudes
      : c.phase === "etudes"
        ? GABARIT_SYNDIC.diagnostic
        : 0;
  return Math.round((faites / GABARIT_SYNDIC.total) * 100);
}

export interface NewCoproInput {
  name: string;
  city: string;
  code_postal: string;
  adresse: string;
  /** Nombre de bâtiments déclaré - fait foi même si l'import des lots en référence d'autres. */
  nb_batiments: number;
  /** Adresse de chaque bâtiment (utilisé quand nb_batiments > 1). */
  batiment_adresses: string[];
  syndic_name: string;
  /** Organisation choisie dans la liste (prime sur le nom du syndic) ; null = selon le nom du syndic. */
  organisation: ChoixOrganisation | null;
  gestionnaire_nom: string;
  gestionnaire_email: string;
  /** Nombre de logements déclaré au portefeuille, avant l'import des lots. */
  nb_logements: number | null;
  /** Chef de projet AMO en clair - il n'a pas forcément de compte sur le progiciel. */
  chef_projet: string;
  phase: PhaseId;
  energy_before: string | null;
  fragile: boolean;
  // Idée d'Amir du 01/10/2026 (fenêtre « Nouvelle copropriété » et import CSV)
  /** Maître d'œuvre : une fiche de la Base prestataires, ou un nouveau nom. */
  maitre_oeuvre?: ChoixMaitreOeuvre | null;
  /** Date d'AG (AAAA-MM-JJ). */
  date_ag?: string | null;
  /** Honoraires HT de la phase études, répartis 50 / 25 / 25 (honoraires_saisir_p1). */
  honoraires_p1_ht?: number | null;
  /** Honoraires HT de la phase travaux, répartis 50 / 30 / 20 (honoraires_revaloriser_p2). */
  honoraires_p2_ht?: number | null;
}

/**
 * Maître d'œuvre choisi à la création : une fiche de la Base prestataires, ou un
 * nom nouveau, dont la fiche (sans e-mail, métier « Maître d'œuvre ») est créée
 * avec le dossier - le maître d'œuvre retrouve alors le dossier dans « Mes
 * projets » (0119, 0120) dès qu'un compte est rattaché à la fiche.
 */
export type ChoixMaitreOeuvre = { mode: "existant"; nom: string } | { mode: "nouveau"; nom: string };

/** Dossier créé, avec ce qui n'a pas pu suivre (honoraires, fiche du maître d'œuvre) : le dossier existe quand même. */
export type CoproCree = CoproRow & { avertissements: string[] };

/** Clé technique unique du dossier (corbeille comprise) tirée de son nom. */
export function slugCopro(nom: string): string {
  return nom
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/** Nom du maître d'œuvre à poser sur le dossier ; un « nouveau » nom déjà en base (casse et accents ignorés) reprend la fiche existante. */
async function nomMaitreOeuvre(choix: ChoixMaitreOeuvre): Promise<{ nom: string; ficheACreer: boolean }> {
  if (choix.mode === "existant") return { nom: choix.nom.trim().replace(/\s+/g, " "), ficheACreer: false };
  return resoudreMaitreOeuvreEnBase(choix.nom, { citationSuffit: false });
}

/**
 * Crée un dossier complet : fiche, bâtiments, plan de tâches, créateur, puis
 * fiche du maître d'œuvre et honoraires. Partagé par la fenêtre « Nouvelle
 * copropriété », l'import CSV et les demandes d'AMO.
 */
export async function creerCopro(input: NewCoproInput): Promise<CoproCree> {
  const moe = input.maitre_oeuvre?.nom.trim() ? await nomMaitreOeuvre(input.maitre_oeuvre) : null;
  // Organisation choisie dans la liste, créée au besoin (nouvelle enseigne,
  // syndic bénévole) ; sans choix, un syndic dont le nom est celui d'une
  // enseigne rattache d'emblée le dossier à cette enseigne.
  const organisation = input.organisation ? await resoudreOrganisation(input.organisation, input.name) : null;
  const insert: TablesInsert<"coproprietes"> = {
    name: input.name,
    slug: slugCopro(input.name),
    city: input.city || null,
    code_postal: input.code_postal || null,
    adresse: input.adresse || null,
    // nom du syndic laissé vide : celui de l'organisation choisie
    syndic_name: input.syndic_name || organisation?.nom || null,
    organisation_id: organisation ? organisation.id : await organisationIdPourSyndic(input.syndic_name),
    gestionnaire_nom: input.gestionnaire_nom || null,
    gestionnaire_email: input.gestionnaire_email || null,
    nb_logements: input.nb_logements,
    chef_projet: input.chef_projet || null,
    phase: input.phase,
    energy_before: input.energy_before,
    fragile: input.fragile,
    maitre_oeuvre: moe?.nom || null,
    date_ag: input.date_ag || null,
  };
  const { data: copro, error } = await supabase.from("coproprietes").insert(insert).select().single();
  if (error) {
    // Pas d'organisation orpheline si le dossier n'a pas pu être créé.
    if (organisation?.creee) await supabase.from("organisations").delete().eq("id", organisation.id);
    throw error;
  }

  // Bâtiments déclarés à la création - ceux qui ont une adresse font foi et ne
  // sont jamais supprimés par le ménage de l'import des lots ; un bâtiment sans
  // adresse resté vide disparaît dès que l'import range les lots ailleurs.
  const nbBats = Math.max(1, Math.floor(input.nb_batiments) || 1);
  const { error: eBats } = await supabase.from("batiments").insert(
    Array.from({ length: nbBats }, (_, i) => ({
      copro_id: copro.id,
      code: String(i + 1).padStart(2, "0"),
      adresse: nbBats > 1 ? input.batiment_adresses[i]?.trim() || null : null,
      position: i,
      declare_creation: true,
    }))
  );
  if (eBats) throw eBats;

  // Plan de tâches gabarit + rattachement du créateur.
  // (Pas de clé de répartition créée d'office : les clés sont reprises
  // des en-têtes du fichier lors de l'import des lots & tantièmes.)
  const { error: eTaches } = await supabase.from("taches").insert(
    buildTaskTemplate(input.phase).map((t) => ({ ...t, copro_id: copro.id }))
  );
  if (eTaches) throw eTaches;

  const { data: session } = await supabase.auth.getSession();
  const uid = session.session?.user.id;
  if (uid) {
    await supabase.from("copro_members").insert({ copro_id: copro.id, user_id: uid, member_role: "amo_referent" });
  }

  // Le dossier existe : la suite ne l'annule pas, un échec est signalé et
  // se rattrape depuis la Base prestataires ou le bloc Honoraires.
  const avertissements: string[] = [];
  if (moe?.ficheACreer) {
    try {
      await creerFicheMaitreOeuvre(moe.nom);
    } catch (eMoe) {
      avertissements.push(`fiche du maître d'œuvre « ${moe.nom} » non créée (${messageErreur(eMoe, "erreur inconnue")})`);
    }
  }
  const honoraires = [
    { rpc: "honoraires_saisir_p1", montant: input.honoraires_p1_ht, libelle: "P1" },
    { rpc: "honoraires_revaloriser_p2", montant: input.honoraires_p2_ht, libelle: "P2" },
  ] as const;
  for (const h of honoraires) {
    if (h.montant == null || !(h.montant > 0)) continue;
    const { error: eHon } = await supabase.rpc(h.rpc, { p_copro_id: copro.id, p_montant_ht: h.montant });
    if (eHon) avertissements.push(`honoraires ${h.libelle} non enregistrés (${eHon.message})`);
  }
  return { ...copro, avertissements };
}

/** Message d'échec de la création ; le nom du dossier (slug) est unique, corbeille comprise. */
export function erreurCreation(e: unknown): string {
  const message = messageErreur(e, "Impossible de créer le dossier. Réessayez.");
  return (e as { code?: string } | null)?.code === "23505" && message.includes("coproprietes_slug")
    ? "Un dossier porte déjà ce nom (corbeille comprise) : précisez-le, par exemple avec la ville ou l'adresse."
    : message;
}

/** Rafraîchit ce qu'une création de dossier change ailleurs (listes, enseignes, honoraires, prestataires). */
export function invaliderCreationCopros(qc: ReturnType<typeof useQueryClient>) {
  for (const queryKey of [["copros"], ["organisations"], ["copros-rattachables"], ["honoraires"], ["prestataires"]]) {
    void qc.invalidateQueries({ queryKey });
  }
}

export function useCreateCopro() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: creerCopro,
    onSuccess: () => invaliderCreationCopros(qc),
  });
}

/** Nombre de tâches actionnables (phase courante, non terminées) tous dossiers. */
export function useTasksCount() {
  return useQuery({
    queryKey: ["tasks-count"],
    queryFn: async () => {
      const [{ data: copros, error: e1 }, taches] = await Promise.all([
        supabase.from("coproprietes").select("id, phase").is("deleted_at", null),
        // par pages : plus de 2 000 tâches ouvertes tous dossiers (29/09), l'API en renvoie 1 000
        toutesLesLignes((debut, fin) =>
          supabase.from("taches").select("copro_id, phase, status").neq("status", "done").order("id").range(debut, fin)
        ),
      ]);
      if (e1) throw e1;
      const phaseById = new Map((copros ?? []).map((c) => [c.id, c.phase]));
      return taches.filter((t) => phaseById.get(t.copro_id) === t.phase).length;
    },
  });
}

/** Un dossier copropriété complet (fiche + stats + équipe). */
export function useCopro(id: string | undefined) {
  return useQuery({
    queryKey: ["copro", id],
    enabled: !!id,
    queryFn: async (): Promise<CoproWithStats> => {
      const [{ data: copro, error: e1 }, { data: stats, error: e2 }, { data: members, error: e3 }] =
        await Promise.all([
          supabase.from("coproprietes").select("*, organisations(id, nom)").eq("id", id!).single(),
          supabase.from("copro_stats").select("*").eq("id", id!).maybeSingle(),
          supabase.from("copro_members").select("copro_id, user_id, profiles(initials, full_name)").eq("copro_id", id!),
        ]);
      if (e1) throw e1;
      if (e2) throw e2;
      if (e3) throw e3;
      const { organisations, ...fiche } = copro;
      return {
        ...fiche,
        organisation: organisations ?? null,
        stats: stats ?? null,
        team: (members ?? []).map((m) => ({
          user_id: m.user_id,
          initials: m.profiles?.initials ?? "?",
          full_name: m.profiles?.full_name ?? "",
        })),
      };
    },
  });
}

export type PassationMailStatut = "envoye" | "simule" | "erreur" | "sans_email";

/**
 * Alerte par e-mail les chefs de projet lors d'une passation de dossier
 * (edge notifier-passation, trace dans la table passations). Le chef de
 * projet est saisi en clair : la correspondance avec un compte collaborateur
 * se fait par le nom - « sans_email » si aucun compte ne correspond.
 */
export async function notifierPassation(
  coproId: string,
  ancienChef: string | null,
  nouveauChef: string
): Promise<PassationMailStatut> {
  const { data, error } = await supabase.functions.invoke("notifier-passation", {
    body: { copro_id: coproId, ancien_chef: ancienChef, nouveau_chef: nouveauChef },
  });
  if (error) return "erreur";
  return (data as { statut?: PassationMailStatut } | null)?.statut ?? "erreur";
}

export function useUpdateCopro(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<TablesInsert<"coproprietes">>) => {
      const { error } = await supabase.from("coproprietes").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["copro", id] });
      void qc.invalidateQueries({ queryKey: ["copros"] });
      // Le rattachement à une enseigne peut avoir changé avec le nom du syndic.
      void qc.invalidateQueries({ queryKey: ["organisations"] });
      void qc.invalidateQueries({ queryKey: ["copros-rattachables"] });
    },
  });
}

/**
 * Téléverse la photo du dossier dans le bucket privé et met à jour photo_path,
 * avec le cadrage choisi dans la fenêtre « Cadrer la nouvelle photo »
 * (photo_cadrage, 0101 - la photo d'origine n'est jamais retouchée).
 */
export function useUploadPhoto(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ file, cadrage }: { file: File; cadrage: Cadrage }) => {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${id}/hero.${ext}`;
      const { error: eUp } = await supabase.storage.from("copro-photos").upload(path, file, { upsert: true });
      if (eUp) throw eUp;
      const { error: eDb } = await supabase
        .from("coproprietes")
        .update({ photo_path: path, photo_cadrage: { ...cadrage } })
        .eq("id", id);
      if (eDb) throw eDb;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["copro", id] });
      void qc.invalidateQueries({ queryKey: ["copros"] });
      void qc.invalidateQueries({ queryKey: ["photo-url"] });
    },
  });
}

/** Recadre la photo déjà en place (feedback Amir 24/09/2026) : seul le cadrage change. */
export function useCadrerPhoto(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (cadrage: Cadrage) => {
      const { error } = await supabase.from("coproprietes").update({ photo_cadrage: { ...cadrage } }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["copro", id] });
      void qc.invalidateQueries({ queryKey: ["copros"] });
    },
  });
}

// ========== Corbeille des projets ==========
// L'AMO ne supprime jamais un dossier d'un coup : mise à la corbeille
// (deleted_at) d'abord - le dossier disparaît de tous les espaces (RLS) -
// puis restauration ou suppression définitive depuis la corbeille.

/** Les dossiers à la corbeille (AMO uniquement), du plus récent au plus ancien. */
export function useCoprosCorbeille() {
  return useQuery({
    queryKey: ["copros-corbeille"],
    queryFn: async (): Promise<CoproRow[]> => {
      const { data, error } = await supabase
        .from("coproprietes")
        .select("*")
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

function useCorbeilleMutation(mutationFn: (id: string) => Promise<void>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["copros"] });
      void qc.invalidateQueries({ queryKey: ["copros-corbeille"] });
      void qc.invalidateQueries({ queryKey: ["tasks-count"] });
    },
  });
}

/** Met le dossier à la corbeille - restaurable tant qu'il n'est pas supprimé définitivement. */
export function useMettreCorbeille() {
  return useCorbeilleMutation(async (id) => {
    const { error } = await supabase
      .from("coproprietes")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
  });
}

/** Restaure un dossier de la corbeille : il réapparaît dans tous les espaces. */
export function useRestaurerCopro() {
  return useCorbeilleMutation(async (id) => {
    const { error } = await supabase.from("coproprietes").update({ deleted_at: null }).eq("id", id);
    if (error) throw error;
  });
}

/**
 * Suppression définitive : la fiche et toutes ses données liées partent en
 * cascade (lots, enquêtes, plans, fichiers en base…). Les objets du Storage
 * restent orphelins - ils ne sont plus référencés nulle part.
 */
export function useSupprimerDefinitivement() {
  return useCorbeilleMutation(async (id) => {
    const { error } = await supabase.from("coproprietes").delete().eq("id", id);
    if (error) throw error;
  });
}

/** URL signée d'une photo de copropriété (bucket privé). */
export function usePhotoUrl(path: string | null) {
  return useQuery({
    queryKey: ["photo-url", path],
    enabled: !!path,
    staleTime: 30 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from("copro-photos").createSignedUrl(path!, 3600);
      if (error) throw error;
      return data.signedUrl;
    },
  });
}

// Base d'entreprises référencées (prestations intellectuelles) - côté AMO.
// Chaque prestataire couvre un ou plusieurs métiers (types) ; à la publication
// d'une consultation, l'edge function `notifier-consultation` alerte par
// e-mail tous les prestataires actifs du métier concerné.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/auth/AuthProvider";
import type { Tables, TablesInsert, TablesUpdate } from "@/lib/database.types";
import { resoudreMaitreOeuvre } from "@/lib/maitreOeuvre";

export type Prestataire = Tables<"prestataires">;

/** Format d'adresse accepté dans les fiches (même contrôle que le formulaire). */
export const emailValide = (e: string): boolean => /^\S+@\S+\.\S+$/.test(e.trim());

/** Adresses d'une entreprise telles qu'enregistrées (0106) : la principale et
 *  les autres, une par personne, chacune avec son accès possible (0162).
 *  Adresses nettoyées (espaces, casse),
 *  vides et doublons retirés ; sans principale, la première adresse en copie
 *  prend sa place - la base refuse une copie sans principale. */
export function normaliserEmails(
  principal: string | null | undefined,
  secondaires: readonly string[]
): { email: string | null; emails_secondaires: string[] } {
  const toutes = [principal ?? "", ...secondaires].map((e) => e.trim().toLowerCase()).filter(Boolean);
  const uniques = [...new Set(toutes)];
  return { email: uniques[0] ?? null, emails_secondaires: uniques.slice(1) };
}

/** Déclenche le rappel e-mail des agréments en fin de validité (edge function
 *  `rappel-agrements`) - appelé une fois par jour au chargement de l'app AMO.
 *  Meilleur effort : un échec est silencieux, le rappel repartira demain. */
export async function declencherRappelAgrements(): Promise<void> {
  const cle = "rappel-agrements-dernier";
  const aujourdHui = new Date().toISOString().slice(0, 10);
  try {
    if (localStorage.getItem(cle) === aujourdHui) return;
    localStorage.setItem(cle, aujourdHui);
    await supabase.functions.invoke("rappel-agrements", { body: {} });
  } catch {
    /* rappel facultatif */
  }
}

/**
 * Maître d'œuvre saisi rapproché des fiches de la Base prestataires (règle de
 * lib/maitreOeuvre) : nom à poser sur le dossier et fiche à créer ou non.
 */
export async function resoudreMaitreOeuvreEnBase(saisie: string, options?: { citationSuffit?: boolean }) {
  const { data, error } = await supabase.from("prestataires").select("id, raison_sociale");
  if (error) throw error;
  return resoudreMaitreOeuvre(saisie, data ?? [], options);
}

/**
 * Fiche d'un nouveau maître d'œuvre (bug d'Amir du 01/10/2026) : métier
 * « Maître d'œuvre », sans e-mail - l'AMO complète e-mails et contacts dans la
 * Base prestataires. Le dossier lui est relié par son nom (0119, 0120).
 */
export async function creerFicheMaitreOeuvre(nom: string): Promise<void> {
  const { error } = await supabase.from("prestataires").insert({ raison_sociale: nom, types: ["moe"] });
  if (error) throw error;
}

export function usePrestataires() {
  return useQuery({
    queryKey: ["prestataires"],
    queryFn: async (): Promise<Prestataire[]> => {
      const { data, error } = await supabase
        .from("prestataires")
        .select("*")
        .order("raison_sociale");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export type ContactAvecEmail = Pick<Tables<"prestataire_contacts">, "prestataire_id" | "nom" | "role" | "email">;

/** Contacts de toutes les entreprises qui ont une adresse e-mail (AMO) - adresses
 *  proposées en plus de celles de la fiche pour l'envoi d'une consultation. */
export function useContactsAvecEmail() {
  return useQuery({
    queryKey: ["prestataires", "contacts-email"],
    queryFn: async (): Promise<ContactAvecEmail[]> => {
      const { data, error } = await supabase
        .from("prestataire_contacts")
        .select("prestataire_id, nom, role, email")
        .not("email", "is", null)
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useAddPrestataire() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: TablesInsert<"prestataires">) => {
      const { error } = await supabase.from("prestataires").insert(input);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["prestataires"] }),
  });
}

export function useUpdatePrestataire() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: TablesUpdate<"prestataires"> }) => {
      const { error } = await supabase.from("prestataires").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["prestataires"] }),
  });
}

// ---------- Accès à l'espace prestataire (0123, 01/10/2026) ----------
// Aucune entreprise n'avait de compte : l'AMO le crée depuis la fiche, l'edge
// function creer-espace-prestataire crée le compte, relie la fiche et envoie
// l'e-mail d'activation (même mécanique que les espaces copropriétaires).
// Depuis le 12/10/2026 (0162, demande d'Amir) : un accès par personne, c'est-à-
// dire par adresse de la fiche (principale ou autre), toutes reliées au même
// espace de l'entreprise ; retirer une adresse de la fiche retire l'accès.

export type EtatAccesPrestataire = "actif" | "invite" | "a_creer" | "sans_email" | "email_pris";

/** Accès d'une adresse de la fiche (équipe Strat Eco). */
export interface AccesAdresse {
  email: string;
  principale: boolean;
  /** Compte relié par une adresse qui n'est plus sur la fiche (modification en SQL). */
  horsFiche: boolean;
  etat: EtatAccesPrestataire;
  userId: string | null;
  /** Nom de la personne (profil du compte relié). */
  nom: string | null;
  inviteLe: string | null;
  derniereConnexion: string | null;
  /** Rôle du compte qui détient déjà l'adresse (état email_pris). */
  roleCompte: string | null;
  /** Entreprise déjà reliée au compte prestataire de cette adresse (état email_pris). */
  autreFiche: string | null;
}

/** Accès de chaque fiche de la Base prestataires, adresse par adresse (AMO seul). */
export function useAccesPrestataires() {
  return useQuery({
    queryKey: ["prestataires", "acces"],
    queryFn: async (): Promise<Map<string, AccesAdresse[]>> => {
      const { data, error } = await supabase.rpc("acces_prestataires", {});
      if (error) throw error;
      const parFiche = new Map<string, AccesAdresse[]>();
      for (const r of data ?? []) {
        const liste = parFiche.get(r.prestataire_id) ?? [];
        liste.push({
          email: r.email,
          principale: r.principale,
          horsFiche: r.hors_fiche,
          etat: r.etat as EtatAccesPrestataire,
          userId: r.user_id,
          nom: r.nom,
          inviteLe: r.invite_le,
          derniereConnexion: r.derniere_connexion,
          roleCompte: r.role_compte,
          autreFiche: r.autre_fiche,
        });
        parFiche.set(r.prestataire_id, liste);
      }
      return parFiche;
    },
  });
}

const ROLE_COMPTE: Record<string, string> = {
  amo: "un compte Strat Eco",
  syndic: "un compte syndic",
  copro: "un compte copropriétaire",
  moe: "un compte maître d'œuvre",
};

/** Pourquoi une adresse de la fiche ne peut pas recevoir d'accès (état email_pris). */
export function motifAdressePrise(acces: Pick<AccesAdresse, "roleCompte" | "autreFiche">): string {
  if (acces.autreFiche) return `Adresse déjà utilisée par le compte de ${acces.autreFiche}`;
  if (!acces.roleCompte) return "Adresse déjà utilisée par un compte incomplet";
  return `Adresse déjà utilisée par ${ROLE_COMPTE[acces.roleCompte] ?? "un autre compte"}`;
}

export interface ResultatAccesPrestataire {
  statut: "invite" | "relie" | "renvoye" | "deja_actif" | "sans_email" | "suspendu" | "email_pris" | "erreur";
  envoi: "envoye" | "simule" | "echec" | null;
  email?: string;
  detail?: string;
}

/** Ouvre l'accès d'une adresse de la fiche (ou renvoie le lien d'activation),
 *  ou de toutes celles qui n'en ont pas encore (`tous`) - les e-mails partent réellement. */
export function useCreerAccesPrestataire() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      prestataireId,
      email,
      tous,
    }: {
      prestataireId: string;
      email?: string;
      tous?: boolean;
    }): Promise<ResultatAccesPrestataire[]> => {
      const { data, error } = await supabase.functions.invoke("creer-espace-prestataire", {
        body: { prestataire_id: prestataireId, ...(email ? { email } : {}), ...(tous ? { tous: true } : {}) },
      });
      if (error) {
        // le corps d'erreur de l'edge function porte le message à afficher
        const ctx = (error as { context?: Response }).context;
        const parsed = ctx ? await ctx.json().catch(() => null) : null;
        throw new Error(parsed?.error ?? "La création de l'accès a échoué. Réessayez.");
      }
      const rep = data as { resultats?: ResultatAccesPrestataire[]; resultat: ResultatAccesPrestataire };
      return rep.resultats ?? [rep.resultat];
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["prestataires"] }),
  });
}

/** Retire l'accès d'une personne (compte relié par une adresse qui n'est plus
 *  sur la fiche) ; le compte reste, sans entreprise. */
export function useRetirerAccesPrestataire() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.from("prestataire_comptes").delete().eq("user_id", userId);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["prestataires"] }),
  });
}

/** Une adresse de l'entreprise et l'accès de la personne, vus par l'entreprise. */
export interface PersonneEntreprise {
  email: string;
  principale: boolean;
  userId: string | null;
  nom: string | null;
  /** S'est déjà connectée. */
  active: boolean;
  /** Le compte connecté. */
  moi: boolean;
}

/** Les personnes de l'entreprise (adresses de la fiche et leur accès) : pour
 *  l'entreprise elle-même ou l'équipe Strat Eco en aperçu. */
export function useEquipePrestataire(prestataireId: string) {
  return useQuery({
    queryKey: ["prestataires", "equipe", prestataireId],
    queryFn: async (): Promise<PersonneEntreprise[]> => {
      const { data, error } = await supabase.rpc("equipe_prestataire", { p_prestataire_id: prestataireId });
      if (error) throw error;
      return (data ?? []).map((r) => ({
        email: r.email,
        principale: r.principale,
        userId: r.user_id,
        nom: r.nom,
        active: r.active,
        moi: r.moi,
      }));
    },
  });
}

/** La personne connectée règle le nom qui signe ses messages. */
export function useModifierMonNom() {
  const qc = useQueryClient();
  const { rechargerProfil } = useAuth();
  return useMutation({
    mutationFn: async (nom: string) => {
      const { error } = await supabase.rpc("prestataire_mon_nom", { p_nom: nom });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["prestataires", "equipe"] });
      // les prochains messages sont signés du nouveau nom
      void rechargerProfil();
    },
  });
}

export function useDeletePrestataire() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("prestataires").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["prestataires"] }),
  });
}

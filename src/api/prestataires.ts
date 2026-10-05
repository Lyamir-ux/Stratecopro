// Base d'entreprises référencées (prestations intellectuelles) - côté AMO.
// Chaque prestataire couvre un ou plusieurs métiers (types) ; à la publication
// d'une consultation, l'edge function `notifier-consultation` alerte par
// e-mail tous les prestataires actifs du métier concerné.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tables, TablesInsert, TablesUpdate } from "@/lib/database.types";
import { resoudreMaitreOeuvre } from "@/lib/maitreOeuvre";

export type Prestataire = Tables<"prestataires">;

/** Format d'adresse accepté dans les fiches (même contrôle que le formulaire). */
export const emailValide = (e: string): boolean => /^\S+@\S+\.\S+$/.test(e.trim());

/** Adresses d'une entreprise telles qu'enregistrées (0106) : la principale
 *  (compte et alertes) et celles en copie. Adresses nettoyées (espaces, casse),
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

export type EtatAccesPrestataire = "actif" | "invite" | "a_creer" | "sans_email" | "email_pris";

export interface AccesPrestataire {
  etat: EtatAccesPrestataire;
  inviteLe: string | null;
  /** Identifiant de connexion du compte relié (ne suit pas l'e-mail de la fiche). */
  emailCompte: string | null;
  /** Rôle du compte qui détient déjà l'adresse (état email_pris). */
  roleCompte: string | null;
  /** Entreprise déjà reliée au compte prestataire de cette adresse (état email_pris). */
  autreFiche: string | null;
}

/** État de l'accès de chaque fiche de la Base prestataires (AMO seul). */
export function useAccesPrestataires() {
  return useQuery({
    queryKey: ["prestataires", "acces"],
    queryFn: async (): Promise<Map<string, AccesPrestataire>> => {
      const { data, error } = await supabase.rpc("espaces_prestataires");
      if (error) throw error;
      return new Map(
        (data ?? []).map((r) => [
          r.prestataire_id,
          {
            etat: r.etat as EtatAccesPrestataire,
            inviteLe: r.invite_le,
            emailCompte: r.email_compte,
            roleCompte: r.role_compte,
            autreFiche: r.autre_fiche,
          },
        ])
      );
    },
  });
}

const ROLE_COMPTE: Record<string, string> = {
  amo: "un compte Strat Eco",
  syndic: "un compte syndic",
  copro: "un compte copropriétaire",
  moe: "un compte maître d'œuvre",
};

/** Pourquoi l'adresse d'une fiche ne peut pas recevoir d'accès (état email_pris). */
export function motifAdressePrise(acces: Pick<AccesPrestataire, "roleCompte" | "autreFiche">): string {
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

/** Crée l'accès d'une fiche (ou renvoie le lien d'activation) - l'e-mail part réellement. */
export function useCreerAccesPrestataire() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (prestataireId: string): Promise<ResultatAccesPrestataire> => {
      const { data, error } = await supabase.functions.invoke("creer-espace-prestataire", {
        body: { prestataire_id: prestataireId },
      });
      if (error) {
        // le corps d'erreur de l'edge function porte le message à afficher
        const ctx = (error as { context?: Response }).context;
        const parsed = ctx ? await ctx.json().catch(() => null) : null;
        throw new Error(parsed?.error ?? "La création de l'accès a échoué. Réessayez.");
      }
      return (data as { resultat: ResultatAccesPrestataire }).resultat;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["prestataires"] }),
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

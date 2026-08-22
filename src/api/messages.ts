// Messagerie de projet (migration 0035) — un fil par copropriété et par canal
// (prestataires / syndic / copropriétaires), piloté depuis l'onglet
// Communications du dossier côté AMO. Canal prestataires : message « à tous »
// (prestataire_id null) ou privé avec une entreprise ; l'envoi AMO déclenche
// une alerte e-mail SANS le contenu (edge function `notifier-message`).
// Côté prestataire : fil de ses projets + pastille de non-lus (message_lectures).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/auth/AuthProvider";
import type { Tables } from "@/lib/database.types";

export type CanalMessage = Tables<"messages_projet">["canal"];

export const CANAUX: { id: CanalMessage; label: string }[] = [
  { id: "prestataires", label: "Prestataires" },
  { id: "syndic", label: "Syndic" },
  { id: "coproprietaires", label: "Copropriétaires" },
];

export type MessageProjet = Tables<"messages_projet"> & {
  prestataire: { raison_sociale: string } | null;
};

/** Fil complet d'une copro (AMO — tous canaux, messages privés compris). */
export function useMessagesCopro(coproId: string | undefined) {
  return useQuery({
    queryKey: ["messages", coproId],
    enabled: !!coproId,
    queryFn: async (): Promise<MessageProjet[]> => {
      const { data, error } = await supabase
        .from("messages_projet")
        .select("*, prestataires(raison_sociale)")
        .eq("copro_id", coproId!)
        .order("created_at");
      if (error) throw error;
      return (data ?? []).map((m) => {
        const { prestataires, ...rest } = m as typeof m & {
          prestataires: { raison_sociale: string } | null;
        };
        return { ...rest, prestataire: prestataires };
      });
    },
  });
}

export interface EnvoiMessageResult {
  /** Bilan de l'alerte e-mail (canal prestataires uniquement). */
  notification: { total: number; envoyes: number; simules: number; erreurs: number; mode: string } | null;
  notifyError: string | null;
}

/** Envoi AMO depuis l'onglet Communications ; l'alerte e-mail (sans contenu)
 *  part vers l'entreprise visée ou toutes les entreprises retenues du projet. */
export function useEnvoyerMessage(coproId: string) {
  const qc = useQueryClient();
  const { profile } = useAuth();
  return useMutation({
    mutationFn: async ({
      canal,
      prestataireId,
      body,
    }: {
      canal: CanalMessage;
      prestataireId: string | null;
      body: string;
    }): Promise<EnvoiMessageResult> => {
      const { data: session } = await supabase.auth.getSession();
      const { error } = await supabase.from("messages_projet").insert({
        copro_id: coproId,
        canal,
        prestataire_id: canal === "prestataires" ? prestataireId : null,
        user_id: session.session?.user.id ?? null,
        auteur_nom: profile?.full_name ?? "",
        auteur_role: "amo",
        body: body.trim(),
      });
      if (error) throw error;
      if (canal !== "prestataires") return { notification: null, notifyError: null };
      const { data, error: fnErr } = await supabase.functions.invoke("notifier-message", {
        body: { copro_id: coproId, prestataire_id: prestataireId },
      });
      return {
        notification: fnErr ? null : (data as EnvoiMessageResult["notification"]),
        notifyError: fnErr ? String(fnErr.message ?? fnErr) : null,
      };
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["messages", coproId] }),
  });
}

// ========== Côté prestataire ==========

export type MessagePresta = Tables<"messages_projet"> & {
  copro: { id: string; name: string } | null;
};

/** Messages visibles du prestataire (RLS : fils de ses projets — « à tous »
 *  + ses échanges privés). Le filtre client reproduit la RLS quand un AMO
 *  consulte l'espace en aperçu. */
export function useMessagesPresta(prestaId: string, coproIds: string[]) {
  return useQuery({
    // coproIds fait partie de la clé : la liste arrive après coup (candidatures)
    // et doit invalider le premier résultat calculé à vide
    queryKey: ["messages-presta", prestaId, coproIds.join(",")],
    queryFn: async (): Promise<MessagePresta[]> => {
      const { data, error } = await supabase
        .from("messages_projet")
        .select("*, coproprietes(id, name)")
        .eq("canal", "prestataires")
        .order("created_at");
      if (error) throw error;
      return (data ?? [])
        .map((m) => {
          const { coproprietes, ...rest } = m as typeof m & {
            coproprietes: { id: string; name: string } | null;
          };
          return { ...rest, copro: coproprietes };
        })
        .filter(
          (m) =>
            coproIds.includes(m.copro_id) &&
            (m.prestataire_id == null || m.prestataire_id === prestaId)
        );
    },
  });
}

/** Repères de lecture de l'utilisateur connecté (un par copro). */
export function useLectures() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["message-lectures", session?.user.id],
    enabled: !!session,
    queryFn: async (): Promise<Tables<"message_lectures">[]> => {
      const { data, error } = await supabase.from("message_lectures").select("*");
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Marque le fil d'une copro comme lu (à l'ouverture du fil). */
export function useMarquerLu() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (coproId: string) => {
      const { data: session } = await supabase.auth.getSession();
      const uid = session.session?.user.id;
      if (!uid) return;
      const { error } = await supabase
        .from("message_lectures")
        .upsert(
          { user_id: uid, copro_id: coproId, last_read_at: new Date().toISOString() },
          { onConflict: "user_id,copro_id" }
        );
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["message-lectures"] }),
  });
}

/** Réponse du prestataire dans le fil d'un de ses projets (toujours visible
 *  de l'AMO ; les autres entreprises ne la voient pas). */
export function useRepondreMessagePresta(presta: Tables<"prestataires">) {
  const qc = useQueryClient();
  const { profile } = useAuth();
  return useMutation({
    mutationFn: async ({ coproId, body }: { coproId: string; body: string }) => {
      const { data: session } = await supabase.auth.getSession();
      const { error } = await supabase.from("messages_projet").insert({
        copro_id: coproId,
        canal: "prestataires",
        prestataire_id: presta.id,
        user_id: session.session?.user.id ?? null,
        auteur_nom: profile?.full_name || presta.raison_sociale,
        auteur_role: "presta",
        body: body.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["messages-presta"] }),
  });
}

/** Nombre de messages non lus (pastille du menu prestataire et de l'onglet
 *  Communications AMO) : messages des autres, plus récents que le repère de
 *  lecture de leur copro. */
export function compteNonLus(
  messages: Pick<Tables<"messages_projet">, "user_id" | "copro_id" | "created_at">[] | undefined,
  lectures: Tables<"message_lectures">[] | undefined,
  monUserId: string | undefined
): number {
  if (!messages) return 0;
  const repere = new Map((lectures ?? []).map((l) => [l.copro_id, l.last_read_at]));
  return messages.filter((m) => {
    if (m.user_id === monUserId) return false;
    const lu = repere.get(m.copro_id);
    return !lu || m.created_at > lu;
  }).length;
}

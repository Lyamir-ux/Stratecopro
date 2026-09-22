// Messagerie de projet (migration 0035) - un fil par copropriété et par canal
// (prestataires / syndic / copropriétaires), piloté depuis l'onglet
// Communications du dossier côté AMO. Canal prestataires : message « à tous »
// (prestataire_id null) ou privé avec une entreprise ; l'envoi AMO déclenche
// une alerte e-mail SANS le contenu (edge function `notifier-message`).
// Côté prestataire : fil de ses projets + pastille de non-lus (message_lectures).
// Canal copropriétaires (0088) : coproprietaire_id null = annonce à tous les
// copropriétaires de la copro ; coproprietaire_id posé = fil privé entre CE
// copropriétaire et l'équipe AMO (onglet « Nous contacter » du portail).
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
  coproprietaire: { id: string; nom: string } | null;
};

/** Fil complet d'une copro (AMO - tous canaux, messages privés compris). */
export function useMessagesCopro(coproId: string | undefined) {
  return useQuery({
    queryKey: ["messages", coproId],
    enabled: !!coproId,
    queryFn: async (): Promise<MessageProjet[]> => {
      const { data, error } = await supabase
        .from("messages_projet")
        .select("*, prestataires(raison_sociale), coproprietaires(id, nom)")
        .eq("copro_id", coproId!)
        .order("created_at");
      if (error) throw error;
      return (data ?? []).map((m) => {
        const { prestataires, coproprietaires, ...rest } = m as typeof m & {
          prestataires: { raison_sociale: string } | null;
          coproprietaires: { id: string; nom: string } | null;
        };
        return { ...rest, prestataire: prestataires, coproprietaire: coproprietaires };
      });
    },
  });
}

export interface EnvoiMessageResult {
  /** Bilan de l'alerte e-mail (canaux prestataires et syndic). */
  notification: { total: number; envoyes: number; simules: number; erreurs: number; mode: string } | null;
  notifyError: string | null;
}

/** Envoi AMO depuis l'onglet Communications ; l'alerte e-mail (sans contenu)
 *  part vers l'entreprise visée ou toutes les entreprises retenues du projet
 *  (canal prestataires), vers les gestionnaires du dossier et les directeurs
 *  de l'enseigne (canal syndic, edge function `notifier-syndic`), ou vers le
 *  copropriétaire destinataire d'un fil privé (canal copropriétaires, edge
 *  function `notifier-copro`). Une annonce à tous les copropriétaires
 *  (coproprietaireId null) n'envoie pas d'e-mail : elle s'affiche dans le
 *  portail de chacun. */
export function useEnvoyerMessage(coproId: string) {
  const qc = useQueryClient();
  const { profile } = useAuth();
  return useMutation({
    mutationFn: async ({
      canal,
      prestataireId,
      coproprietaireId = null,
      body,
    }: {
      canal: CanalMessage;
      prestataireId: string | null;
      coproprietaireId?: string | null;
      body: string;
    }): Promise<EnvoiMessageResult> => {
      const { data: session } = await supabase.auth.getSession();
      const { error } = await supabase.from("messages_projet").insert({
        copro_id: coproId,
        canal,
        prestataire_id: canal === "prestataires" ? prestataireId : null,
        coproprietaire_id: canal === "coproprietaires" ? coproprietaireId : null,
        user_id: session.session?.user.id ?? null,
        auteur_nom: profile?.full_name ?? "",
        auteur_role: "amo",
        body: body.trim(),
      });
      if (error) throw error;
      if (canal === "coproprietaires" && !coproprietaireId) return { notification: null, notifyError: null };
      const { data, error: fnErr } =
        canal === "prestataires"
          ? await supabase.functions.invoke("notifier-message", {
              body: { copro_id: coproId, prestataire_id: prestataireId },
            })
          : canal === "coproprietaires"
            ? await supabase.functions.invoke("notifier-copro", {
                body: { copro_id: coproId, type: "message_amo_copro", coproprietaire_id: coproprietaireId },
              })
            : await supabase.functions.invoke("notifier-syndic", {
                body: { copro_id: coproId, type: "message_amo" },
              });
      return {
        notification: fnErr ? null : (data as EnvoiMessageResult["notification"]),
        notifyError: fnErr ? String(fnErr.message ?? fnErr) : null,
      };
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["messages", coproId] }),
  });
}

// ========== Côté portail copropriétaire ==========

export type MessagePortail = Tables<"messages_projet">;

/** Fil du portail d'un copropriétaire : les annonces de l'AMO à tous les
 *  copropriétaires de la copro (coproprietaire_id null) et son fil privé.
 *  La RLS (0088) ne laisse rien passer d'autre ; le filtre client reproduit
 *  ce périmètre quand un AMO consulte le portail en aperçu. */
export function useMessagesPortail(coproId: string | undefined, coproprietaireId: string | undefined) {
  return useQuery({
    queryKey: ["messages-portail", coproId, coproprietaireId],
    enabled: !!coproId && !!coproprietaireId,
    queryFn: async (): Promise<MessagePortail[]> => {
      const { data, error } = await supabase
        .from("messages_projet")
        .select("*")
        .eq("canal", "coproprietaires")
        .eq("copro_id", coproId!)
        .order("created_at");
      if (error) throw error;
      return (data ?? []).filter(
        (m) => m.coproprietaire_id == null || m.coproprietaire_id === coproprietaireId
      );
    },
  });
}

/** « Envoyez-nous un message » : le copropriétaire écrit à l'équipe AMO de son
 *  dossier. Le message reste privé (ni les autres copropriétaires, ni le
 *  syndic, ni les entreprises ne le voient) ; l'équipe est alertée par e-mail
 *  sans le contenu (`notifier-copro`). En aperçu AMO, l'envoi est refusé par
 *  la RLS - l'AMO répond depuis l'onglet Communications du dossier. */
export function useEnvoyerMessagePortail() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  return useMutation({
    mutationFn: async ({
      coproId,
      coproprietaireId,
      auteurNom,
      body,
    }: {
      coproId: string;
      coproprietaireId: string;
      auteurNom: string;
      body: string;
    }) => {
      const { data: session } = await supabase.auth.getSession();
      const { error } = await supabase.from("messages_projet").insert({
        copro_id: coproId,
        canal: "coproprietaires",
        prestataire_id: null,
        coproprietaire_id: coproprietaireId,
        user_id: session.session?.user.id ?? null,
        auteur_nom: profile?.full_name || auteurNom,
        auteur_role: "copro",
        body: body.trim(),
      });
      if (error) throw error;
      // alerte e-mail - meilleur effort, le message est déjà posté
      try {
        await supabase.functions.invoke("notifier-copro", {
          body: { copro_id: coproId, type: "message_copro", coproprietaire_id: coproprietaireId },
        });
      } catch {
        /* l'alerte e-mail est facultative */
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["messages-portail"] });
      void qc.invalidateQueries({ queryKey: ["messages"] });
    },
  });
}

// ========== Côté prestataire ==========

export type MessagePresta = Tables<"messages_projet"> & {
  copro: { id: string; name: string } | null;
};

/** Messages visibles du prestataire (RLS : fils de ses projets - « à tous »
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

// ========== Côté syndic ==========

export type MessageSyndic = Tables<"messages_projet">;

/** Fil syndic des copropriétés du portefeuille (RLS : canal syndic de son
 *  périmètre). Le filtre client reproduit la RLS quand un AMO consulte
 *  l'espace syndic en aperçu (il lit tous les canaux de toutes les copros). */
export function useMessagesSyndic(coproIds: string[]) {
  return useQuery({
    // coproIds fait partie de la clé : le portefeuille arrive après coup
    queryKey: ["messages-syndic", [...coproIds].sort().join(",")],
    enabled: coproIds.length > 0,
    queryFn: async (): Promise<MessageSyndic[]> => {
      const { data, error } = await supabase
        .from("messages_projet")
        .select("*")
        .eq("canal", "syndic")
        .in("copro_id", coproIds)
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Message du syndic vers l'équipe AMO d'un dossier ; l'équipe est alertée
 *  par e-mail (sans le contenu) via l'edge function `notifier-syndic`.
 *  En aperçu AMO, le message est signé « amo » et l'alerte part vers le
 *  syndic (mêmes destinataires que l'onglet Communications). */
export function useEnvoyerMessageSyndic() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  return useMutation({
    mutationFn: async ({ coproId, body }: { coproId: string; body: string }) => {
      const { data: session } = await supabase.auth.getSession();
      const estAmo = profile?.role === "amo";
      const { error } = await supabase.from("messages_projet").insert({
        copro_id: coproId,
        canal: "syndic",
        prestataire_id: null,
        user_id: session.session?.user.id ?? null,
        auteur_nom: profile?.full_name ?? "",
        auteur_role: estAmo ? "amo" : "syndic",
        body: body.trim(),
      });
      if (error) throw error;
      // alerte e-mail - meilleur effort, le message est déjà posté
      try {
        await supabase.functions.invoke("notifier-syndic", {
          body: { copro_id: coproId, type: estAmo ? "message_amo" : "message_syndic" },
        });
      } catch {
        /* l'alerte e-mail est facultative */
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["messages-syndic"] });
      void qc.invalidateQueries({ queryKey: ["messages"] });
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

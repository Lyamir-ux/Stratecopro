import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@/lib/database.types";

export type Note = Tables<"notes_projet"> & {
  author: { initials: string; full_name: string } | null;
};

export function useNotes(coproId: string | undefined) {
  return useQuery({
    queryKey: ["notes", coproId],
    enabled: !!coproId,
    queryFn: async (): Promise<Note[]> => {
      const { data, error } = await supabase
        .from("notes_projet")
        .select("*, profiles(initials, full_name)")
        .eq("copro_id", coproId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((n) => {
        const { profiles, ...rest } = n as typeof n & { profiles: { initials: string; full_name: string } | null };
        return { ...rest, author: profiles };
      });
    },
  });
}

export function useAddNote(coproId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: string) => {
      const { data: session } = await supabase.auth.getSession();
      const { error } = await supabase.from("notes_projet").insert({
        copro_id: coproId,
        body,
        author_user_id: session.session?.user.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["notes", coproId] }),
  });
}

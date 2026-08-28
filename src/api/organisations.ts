// Organisations (enseignes de gestion) - administration côté AMO.
// Un directeur voit tout le portefeuille de son enseigne, un gestionnaire ses
// seules copropriétés (rattachement copro_members, géré ailleurs). Les policies
// organisations_amo_all / org_membres_amo_all autorisent ces écritures.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Enums, Tables } from "@/lib/database.types";

export type OrgRole = Enums<"org_role">;

export interface Organisation extends Tables<"organisations"> {
  copros: number;
  membres: number;
}

export interface MembreOrganisation {
  user_id: string;
  org_role: OrgRole;
  full_name: string;
  initials: string;
  job_title: string | null;
}

export interface CoproRattachable {
  id: string;
  name: string;
  city: string | null;
  organisation_id: string | null;
}

const slugify = (nom: string) =>
  nom
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

/** Toutes les enseignes, avec leur nombre de dossiers et de membres. */
export function useOrganisations() {
  return useQuery({
    queryKey: ["organisations"],
    queryFn: async (): Promise<Organisation[]> => {
      const [{ data: orgs, error: e1 }, { data: membres, error: e2 }, { data: copros, error: e3 }] =
        await Promise.all([
          supabase.from("organisations").select("*").order("nom"),
          supabase.from("organisation_membres").select("organisation_id"),
          supabase.from("coproprietes").select("organisation_id"),
        ]);
      if (e1) throw e1;
      if (e2) throw e2;
      if (e3) throw e3;
      return (orgs ?? []).map((o) => ({
        ...o,
        membres: (membres ?? []).filter((m) => m.organisation_id === o.id).length,
        copros: (copros ?? []).filter((c) => c.organisation_id === o.id).length,
      }));
    },
  });
}

/** Les membres d'une enseigne, du directeur aux gestionnaires. */
export function useMembresOrganisation(orgId: string | undefined) {
  return useQuery({
    queryKey: ["organisation-membres", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<MembreOrganisation[]> => {
      const { data, error } = await supabase
        .from("organisation_membres")
        .select("user_id, org_role, profiles(full_name, initials, job_title)")
        .eq("organisation_id", orgId!);
      if (error) throw error;
      return (data ?? [])
        .map((m) => ({
          user_id: m.user_id,
          org_role: m.org_role,
          full_name: m.profiles?.full_name ?? "-",
          initials: m.profiles?.initials ?? "?",
          job_title: m.profiles?.job_title ?? null,
        }))
        .sort((a, b) => {
          // direction en tête, puis gestionnaires, puis administratifs et comptables
          const rang: Record<OrgRole, number> = { directeur: 0, gestionnaire: 1, administratif: 2, comptable: 3 };
          return rang[a.org_role] - rang[b.org_role] || a.full_name.localeCompare(b.full_name);
        });
    },
  });
}

/**
 * Comptes syndic encore rattachés à aucune enseigne - un compte n'appartient
 * qu'à une seule organisation (contrainte d'unicité en base).
 */
export function useProfilsSyndicLibres() {
  return useQuery({
    queryKey: ["profils-syndic-libres"],
    queryFn: async (): Promise<Tables<"profiles">[]> => {
      const [{ data: profils, error: e1 }, { data: membres, error: e2 }] = await Promise.all([
        supabase.from("profiles").select("*").eq("role", "syndic").eq("active", true).order("full_name"),
        supabase.from("organisation_membres").select("user_id"),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      const pris = new Set((membres ?? []).map((m) => m.user_id));
      return (profils ?? []).filter((p) => !pris.has(p.user_id));
    },
  });
}

/** Les dossiers, pour rattacher / détacher une copropriété d'une enseigne. */
export function useCoprosRattachables() {
  return useQuery({
    queryKey: ["copros-rattachables"],
    queryFn: async (): Promise<CoproRattachable[]> => {
      const { data, error } = await supabase
        .from("coproprietes")
        .select("id, name, city, organisation_id")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Invalide tout ce que touche une écriture sur les enseignes. */
function useRefreshOrganisations() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ["organisations"] });
    void qc.invalidateQueries({ queryKey: ["organisation-membres"] });
    void qc.invalidateQueries({ queryKey: ["profils-syndic-libres"] });
    void qc.invalidateQueries({ queryKey: ["copros-rattachables"] });
    void qc.invalidateQueries({ queryKey: ["copros"] });
    void qc.invalidateQueries({ queryKey: ["copro"] });
  };
}

export function useCreerOrganisation() {
  const refresh = useRefreshOrganisations();
  return useMutation({
    mutationFn: async (nom: string) => {
      const { data, error } = await supabase
        .from("organisations")
        .insert({ nom: nom.trim(), slug: slugify(nom) })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: refresh,
  });
}

export function useRenommerOrganisation() {
  const refresh = useRefreshOrganisations();
  return useMutation({
    mutationFn: async ({ id, nom }: { id: string; nom: string }) => {
      const { error } = await supabase
        .from("organisations")
        .update({ nom: nom.trim(), slug: slugify(nom) })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: refresh,
  });
}

/** Supprime l'enseigne : les membres partent en cascade, les dossiers sont détachés. */
export function useSupprimerOrganisation() {
  const refresh = useRefreshOrganisations();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("organisations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: refresh,
  });
}

export function useAjouterMembre() {
  const refresh = useRefreshOrganisations();
  return useMutation({
    mutationFn: async (m: { organisation_id: string; user_id: string; org_role: OrgRole }) => {
      const { error } = await supabase.from("organisation_membres").insert(m);
      if (error) throw error;
    },
    onSuccess: refresh,
  });
}

export function useMajRoleMembre() {
  const refresh = useRefreshOrganisations();
  return useMutation({
    mutationFn: async ({ organisation_id, user_id, org_role }: { organisation_id: string; user_id: string; org_role: OrgRole }) => {
      const { error } = await supabase
        .from("organisation_membres")
        .update({ org_role })
        .eq("organisation_id", organisation_id)
        .eq("user_id", user_id);
      if (error) throw error;
    },
    onSuccess: refresh,
  });
}

export function useRetirerMembre() {
  const refresh = useRefreshOrganisations();
  return useMutation({
    mutationFn: async ({ organisation_id, user_id }: { organisation_id: string; user_id: string }) => {
      const { error } = await supabase
        .from("organisation_membres")
        .delete()
        .eq("organisation_id", organisation_id)
        .eq("user_id", user_id);
      if (error) throw error;
    },
    onSuccess: refresh,
  });
}

/** Rattache (ou détache si organisation_id vaut null) une copropriété à une enseigne. */
export function useRattacherCopro() {
  const refresh = useRefreshOrganisations();
  return useMutation({
    mutationFn: async ({ coproId, organisationId }: { coproId: string; organisationId: string | null }) => {
      const { error } = await supabase
        .from("coproprietes")
        .update({ organisation_id: organisationId })
        .eq("id", coproId);
      if (error) throw error;
    },
    onSuccess: refresh,
  });
}

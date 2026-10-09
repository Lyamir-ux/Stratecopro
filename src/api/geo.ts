// Communes d'un code postal, pour proposer la ville dès que le code postal est saisi
// (idée de Cyrielle KLEIN, 09/10/2026). API publique de l'État (geo.api.gouv.fr, sans
// clé) : seul le code postal est transmis, aucune donnée personnelle.
import { useQuery } from "@tanstack/react-query";

export const estCodePostal = (cp: string) => /^\d{5}$/.test(cp.trim());

export async function communesDuCodePostal(cp: string, signal?: AbortSignal): Promise<string[]> {
  const r = await fetch(
    `https://geo.api.gouv.fr/communes?codePostal=${encodeURIComponent(cp.trim())}&fields=nom&format=json`,
    { signal },
  );
  if (!r.ok) throw new Error(`geo.api.gouv.fr : ${r.status}`);
  const liste = (await r.json()) as { nom?: unknown }[];
  return liste.map((c) => (typeof c.nom === "string" ? c.nom : "")).filter(Boolean);
}

/** Communes du code postal ; tableau vide si le code est incomplet, inconnu ou si l'API ne répond pas. */
export function useCommunesDuCodePostal(cp: string) {
  const code = cp.trim();
  return useQuery({
    queryKey: ["geo", "communes", code],
    enabled: estCodePostal(code),
    queryFn: ({ signal }) => communesDuCodePostal(code, signal),
    staleTime: Infinity,
    retry: 1,
  });
}

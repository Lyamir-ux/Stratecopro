// Données de la copro : bâtiments, copropriétaires, lots, clés & tantièmes.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase, toutesLesLignes } from "@/lib/supabase";
import type { Enums, Tables, TablesUpdate } from "@/lib/database.types";
import { batimentsVidesASupprimer, rapprocherBatiments, type ImportedRow } from "@/lib/importLots";
import { trierParNomFamille } from "@/lib/nomFamille";
import type { EtatCompteEmail } from "@/lib/emailCoproprietaire";

export interface LotFull extends Tables<"lots"> {
  batiment: { code: string } | null;
  coproprietaire: { nom: string; email: string | null; telephone: string | null } | null;
  tantiemes: Record<string, number>; // par code de clé (repris du fichier importé)
}

export interface DonneesCopro {
  batiments: Tables<"batiments">[];
  coproprietaires: Tables<"coproprietaires">[];
  lots: LotFull[];
  cles: Tables<"cles_repartition">[];
}

export function useDonnees(coproId: string | undefined) {
  return useQuery({
    queryKey: ["donnees", coproId],
    enabled: !!coproId,
    queryFn: async (): Promise<DonneesCopro> => {
      const [bats, coprops, lots, cles, tantiemes] = await Promise.all([
        supabase.from("batiments").select("*").eq("copro_id", coproId!).order("position"),
        supabase.from("coproprietaires").select("*").eq("copro_id", coproId!).order("nom"),
        supabase
          .from("lots")
          .select("*, batiments(code), coproprietaires(nom, email, telephone)")
          .eq("copro_id", coproId!)
          .order("num"),
        supabase.from("cles_repartition").select("*").eq("copro_id", coproId!).order("code"),
        supabase
          .from("lot_tantiemes")
          .select("lot_id, tantiemes, cles_repartition!inner(code, copro_id)")
          .eq("cles_repartition.copro_id", coproId!),
      ]);
      for (const r of [bats, coprops, lots, cles, tantiemes]) if (r.error) throw r.error;

      const tanByLot = new Map<string, Record<string, number>>();
      for (const t of tantiemes.data ?? []) {
        const rec = tanByLot.get(t.lot_id) ?? {};
        rec[t.cles_repartition.code] = Number(t.tantiemes);
        tanByLot.set(t.lot_id, rec);
      }
      return {
        batiments: bats.data ?? [],
        // par nom de famille, pas par prénom (feedback syndic 25/09/2026) : toutes les listes suivent
        coproprietaires: trierParNomFamille(coprops.data ?? [], (cp) => cp.nom),
        cles: cles.data ?? [],
        lots: (lots.data ?? []).map((l) => {
          const { batiments: b, coproprietaires: cp, ...rest } = l as typeof l & {
            batiments: { code: string } | null;
            coproprietaires: { nom: string; email: string | null; telephone: string | null } | null;
          };
          return { ...rest, batiment: b, coproprietaire: cp, tantiemes: tanByLot.get(l.id) ?? {} };
        }),
      };
    },
  });
}

/**
 * Ajuste le nombre de bâtiments du dossier (synthèse de l'onglet Données).
 * En hausse : bâtiments déclarés ajoutés en fin de liste (codes numériques suivants).
 * En baisse : suppression en partant de la fin, uniquement des bâtiments sans lot.
 */
export function useSetNbBatiments(coproId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (target: number) => {
      const { data: bats, error } = await supabase
        .from("batiments")
        .select("id, code, position, lots(count)")
        .eq("copro_id", coproId)
        .order("position");
      if (error) throw error;
      const list = bats ?? [];
      const nbLots = (b: (typeof list)[number]) =>
        (b.lots as unknown as { count: number }[])[0]?.count ?? 0;

      if (target > list.length) {
        const codes = new Set(list.map((b) => b.code));
        let pos = list.reduce((a, b) => Math.max(a, b.position), -1) + 1;
        let next = list.length + 1;
        const rows = [];
        for (let n = list.length; n < target; n++) {
          let code = String(next).padStart(2, "0");
          while (codes.has(code)) {
            next++;
            code = String(next).padStart(2, "0");
          }
          codes.add(code);
          rows.push({ copro_id: coproId, code, position: pos++, declare_creation: true });
          next++;
        }
        const { error: eIns } = await supabase.from("batiments").insert(rows);
        if (eIns) throw eIns;
      } else if (target < list.length) {
        const aSupprimer = list.length - target;
        const supprimables = [...list]
          .reverse()
          .filter((b) => nbLots(b) === 0)
          .slice(0, aSupprimer);
        if (supprimables.length < aSupprimer) {
          throw new Error(
            "Impossible de descendre à ce nombre : des bâtiments portent encore des lots - réaffectez-les d'abord (import)."
          );
        }
        const { error: eDel } = await supabase
          .from("batiments")
          .delete()
          .in("id", supprimables.map((b) => b.id));
        if (eDel) throw eDel;
      }
    },
    onSuccess: () => invalidateDonnees(qc, coproId),
  });
}

/** Corrige l'usage d'un lot à la main (ex. « autres » → « commerces ») -
 *  l'import ne reconnaît pas toujours la nature exacte des locaux. */
export function useSetUsageLot(coproId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ lotId, usage }: { lotId: string; usage: Enums<"usage_lot"> }) => {
      const { error } = await supabase.from("lots").update({ usage }).eq("id", lotId);
      if (error) throw error;
    },
    onSuccess: () => invalidateDonnees(qc, coproId),
  });
}

/**
 * Corrige le nom d'un copropriétaire (faute de frappe, lettre à changer) : même personne, même
 * fiche, tous ses lots suivent. Fonction SQL coproprietaire_renommer (0143), ouverte à l'équipe AMO
 * et au syndic du dossier : le nom est nettoyé côté base et le compte du portail, s'il en a un,
 * prend aussi le nouveau nom (sauf si l'équipe l'avait déjà personnalisé). Les écrans qui affichent
 * le nom (enquête, financement, messages, pièces) se rechargent.
 */
export function useRenommerCoproprietaire(coproId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, nom }: { id: string; nom: string }): Promise<string> => {
      const { data, error } = await supabase.rpc("coproprietaire_renommer", { p_id: id, p_nom: nom });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      invalidateDonnees(qc, coproId);
      for (const cle of ["enquete", "choix-financement", "scenarios", "messages", "pieces-a-verifier", "pieces-copro", "mutations-lots", "syndic", "portail"]) {
        void qc.invalidateQueries({ queryKey: [cle] });
      }
    },
  });
}

export interface EmailCoproprietaireModifie {
  /** Adresse enregistrée sur la fiche (null = effacée). */
  email: string | null;
  inchange: boolean;
  /** Sort du compte du portail : suit = identifiant de connexion changé aussi (invitation jamais utilisée),
   *  garde = espace déjà utilisé, identifiant conservé, aucun = fiche sans espace, relie = l'adresse
   *  appartenait à un compte orphelin (plus aucune fiche) auquel la fiche est maintenant reliée. */
  compte: EtatCompteEmail;
  /** Autres fiches reliées au même compte (leur adresse n'a pas changé). */
  autres_fiches: number;
  /** Titulaire du compte orphelin repris (état « relie » seulement). */
  compte_nom?: string | null;
}

/**
 * Change l'adresse e-mail d'un copropriétaire (clic sur l'adresse, onglet Données AMO). Edge function
 * modifier-email-coproprietaire : l'adresse de la fiche change et, si son espace n'a jamais servi,
 * l'identifiant de connexion aussi (sinon « Renvoyer l'invitation » repartirait à l'ancienne adresse).
 * Aucun e-mail n'est envoyé. Les écrans qui lisent l'adresse (espaces, enquête, messages) se rechargent.
 */
export function useModifierEmailCoproprietaire(coproId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, email }: { id: string; email: string | null }): Promise<EmailCoproprietaireModifie> => {
      const { data, error } = await supabase.functions.invoke("modifier-email-coproprietaire", {
        body: { coproprietaire_id: id, email },
      });
      if (error) {
        const ctx = (error as { context?: Response }).context;
        const parsed = ctx ? await ctx.json().catch(() => null) : null;
        throw new Error(parsed?.error ?? "L'adresse n'a pas pu être modifiée. Réessayez.");
      }
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
      return data as EmailCoproprietaireModifie;
    },
    onSuccess: () => {
      invalidateDonnees(qc, coproId);
      for (const cle of ["espaces", "enquete", "messages", "pieces-a-verifier", "pieces-copro", "syndic"]) {
        void qc.invalidateQueries({ queryKey: [cle] });
      }
    },
  });
}

function invalidateDonnees(qc: ReturnType<typeof useQueryClient>, coproId: string) {
  void qc.invalidateQueries({ queryKey: ["donnees", coproId] });
  void qc.invalidateQueries({ queryKey: ["copro", coproId] });
  void qc.invalidateQueries({ queryKey: ["copros"] });
}

// ========== Vente / succession : changement de propriétaire d'un lot ==========
// Feedback Amir 22/09/2026 : le syndic clique sur le lot vendu et saisit le
// nouveau copropriétaire (RPC syndic_changer_proprietaire, migration 0090).
// Le vendeur garde son historique ; s'il ne possède plus rien, sa ligne devient
// sortante et son accès au portail est coupé.

export type MotifMutation = "vente" | "succession" | "autre";

export const MOTIFS_MUTATION: { id: MotifMutation; label: string }[] = [
  { id: "vente", label: "Vente du lot" },
  { id: "succession", label: "Succession (décès)" },
  { id: "autre", label: "Autre (donation, partage…)" },
];

export interface ChangementProprietaire {
  lotId: string;
  /** Copropriétaire existant de la copro… */
  coproprietaireId?: string | null;
  /** …ou acquéreur à créer. */
  nom?: string | null;
  email?: string | null;
  telephone?: string | null;
  type?: "occupant" | "bailleur" | null;
  motif: MotifMutation;
  commentaire?: string | null;
  /** Repères pour l'alerte e-mail de l'équipe AMO (aucune donnée sensible). */
  numeroLot?: string | null;
  ancienNom?: string | null;
  nouveauNom?: string | null;
}

export function useChangerProprietaire(coproId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ChangementProprietaire): Promise<string> => {
      const { data, error } = await supabase.rpc("syndic_changer_proprietaire", {
        p_lot_id: input.lotId,
        p_coproprietaire_id: input.coproprietaireId ?? null,
        p_nom: input.nom ?? null,
        p_email: input.email ?? null,
        p_telephone: input.telephone ?? null,
        p_type: input.type ?? null,
        p_motif: input.motif,
        p_commentaire: input.commentaire ?? null,
      });
      if (error) throw error;
      // alerte e-mail de l'équipe AMO du dossier, sans les coordonnées du nouveau
      // propriétaire - meilleur effort, la mutation est déjà enregistrée
      try {
        await supabase.functions.invoke("notifier-syndic", {
          body: {
            copro_id: coproId,
            type: "mutation_lot",
            detail: {
              lot: input.numeroLot ?? null,
              ancien: input.ancienNom ?? null,
              nouveau: input.nom?.trim() || input.nouveauNom || null,
              motif: MOTIFS_MUTATION.find((m) => m.id === input.motif)?.label ?? input.motif,
            },
          },
        });
      } catch {
        /* l'alerte e-mail est facultative */
      }
      return data as string;
    },
    onSuccess: () => {
      invalidateDonnees(qc, coproId);
      void qc.invalidateQueries({ queryKey: ["mutations-lots", coproId] });
      void qc.invalidateQueries({ queryKey: ["syndic"] });
    },
  });
}

export type MutationLot = Tables<"lots_mutations"> & {
  lot: { num: string } | null;
  ancien: { nom: string } | null;
  nouveau: { nom: string } | null;
};

/** Journal des changements de propriétaire de la copro (AMO et syndic). */
export function useMutationsLots(coproId: string | undefined) {
  return useQuery({
    queryKey: ["mutations-lots", coproId],
    enabled: !!coproId,
    queryFn: async (): Promise<MutationLot[]> => {
      const { data, error } = await supabase
        .from("lots_mutations")
        .select(
          "*, lots(num), ancien:coproprietaires!ancien_coproprietaire_id(nom), nouveau:coproprietaires!nouveau_coproprietaire_id(nom)"
        )
        .eq("copro_id", coproId!)
        .order("fait_le", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((m) => {
        const { lots, ancien, nouveau, ...rest } = m as typeof m & {
          lots: { num: string } | null;
          ancien: { nom: string } | null;
          nouveau: { nom: string } | null;
        };
        return { ...rest, lot: lots, ancien, nouveau };
      });
    },
  });
}

/**
 * Import des lots depuis un fichier Excel/CSV validé :
 * crée bâtiments, copropriétaires et clés manquants, puis lots + tantièmes.
 * `replace` supprime d'abord les lots existants (bâtiments/copropriétaires conservés).
 */
export function useImportLots(coproId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ rows, replace }: { rows: ImportedRow[]; replace: boolean }) => {
      if (replace) {
        const { error } = await supabase.from("lots").delete().eq("copro_id", coproId);
        if (error) throw error;
      }

      // Bâtiments : rapprochés de ceux du dossier (« 1 » = « 01 »), les manquants créés
      const { data: existingBats, error: eB } = await supabase
        .from("batiments")
        .select("id, code, position, declare_creation")
        .eq("copro_id", coproId);
      if (eB) throw eB;
      // Lots déjà rangés que le fichier ne réimporte pas (aucun après « Remplacer »)
      const numsFichier = new Set(rows.map((r) => r.num));
      const lotsRestants = replace
        ? []
        : await toutesLesLignes((debut, fin) =>
            supabase.from("lots").select("id, num, batiment_id").eq("copro_id", coproId).order("id").range(debut, fin)
          );
      const rapprochement = rapprocherBatiments(
        rows.map((r) => r.batiment),
        (existingBats ?? []).map((b) => ({
          ...b,
          autresLots: lotsRestants.filter((l) => l.batiment_id === b.id && !numsFichier.has(l.num)).length,
        }))
      );
      const batParValeur = new Map(rapprochement.existants);
      const newBats = Array.from(new Set(rapprochement.aCreer.values()));
      if (newBats.length) {
        const position = (existingBats ?? []).reduce((a, b) => Math.max(a, b.position), -1) + 1;
        const { data, error } = await supabase
          .from("batiments")
          .insert(newBats.map((code, i) => ({ copro_id: coproId, code, position: position + i })))
          .select("id, code");
        if (error) throw error;
        const idParCode = new Map((data ?? []).map((b) => [b.code, b.id]));
        for (const [valeur, code] of rapprochement.aCreer) batParValeur.set(valeur, idParCode.get(code)!);
      }

      // Copropriétaires manquants (rapprochement par nom exact) + coordonnées du fichier
      const noms = Array.from(new Set(rows.map((r) => r.coproprietaire).filter((v): v is string => !!v)));
      const contactByNom = new Map<string, { email: string | null; telephone: string | null; adresse: string | null }>();
      for (const r of rows) {
        if (!r.coproprietaire) continue;
        const cur = contactByNom.get(r.coproprietaire) ?? { email: null, telephone: null, adresse: null };
        contactByNom.set(r.coproprietaire, {
          email: r.email ?? cur.email,
          telephone: r.telephone ?? cur.telephone,
          adresse: r.adresse ?? cur.adresse,
        });
      }
      const { data: existingCp, error: eC } = await supabase
        .from("coproprietaires")
        .select("id, nom")
        .eq("copro_id", coproId);
      if (eC) throw eC;
      const cpByNom = new Map((existingCp ?? []).map((c) => [c.nom, c.id]));
      const newCp = noms.filter((n) => !cpByNom.has(n));
      if (newCp.length) {
        const { data, error } = await supabase
          .from("coproprietaires")
          .insert(newCp.map((nom) => ({ copro_id: coproId, nom, ...contactByNom.get(nom) })))
          .select("id, nom");
        if (error) throw error;
        for (const c of data ?? []) cpByNom.set(c.nom, c.id);
      }
      // Copropriétaires déjà connus : mise à jour des coordonnées présentes dans le fichier
      const cpUpdates = (existingCp ?? []).flatMap((c) => {
        const contact = contactByNom.get(c.nom);
        if (!contact) return [];
        const patch: TablesUpdate<"coproprietaires"> = {};
        if (contact.email) patch.email = contact.email;
        if (contact.telephone) patch.telephone = contact.telephone;
        if (contact.adresse) patch.adresse = contact.adresse;
        return Object.keys(patch).length ? [{ id: c.id, patch }] : [];
      });
      if (cpUpdates.length) {
        const results = await Promise.all(
          cpUpdates.map((u) => supabase.from("coproprietaires").update(u.patch).eq("id", u.id))
        );
        for (const r of results) if (r.error) throw r.error;
      }

      // Clés utilisées par l'import - les codes viennent des en-têtes du fichier, rien n'est codé en dur
      const cleCodes = Array.from(new Set(rows.flatMap((r) => Object.keys(r.tantiemes))));
      const { data: existingCles, error: eK } = await supabase
        .from("cles_repartition")
        .select("id, code")
        .eq("copro_id", coproId);
      if (eK) throw eK;
      const cleByCode = new Map((existingCles ?? []).map((k) => [k.code, k.id]));
      const newCles = cleCodes.filter((c) => !cleByCode.has(c));
      if (newCles.length) {
        const { data, error } = await supabase
          .from("cles_repartition")
          .insert(newCles.map((code) => ({ copro_id: coproId, code, is_default: false })))
          .select("id, code");
        if (error) throw error;
        for (const k of data ?? []) cleByCode.set(k.code, k.id);
      }

      // Lots (upsert par numéro) puis tantièmes
      const { data: insertedLots, error: eL } = await supabase
        .from("lots")
        .upsert(
          rows.map((r) => ({
            copro_id: coproId,
            num: r.num,
            usage: r.usage,
            batiment_id: r.batiment ? batParValeur.get(r.batiment) ?? null : rapprochement.parDefaut,
            coproprietaire_id: r.coproprietaire ? cpByNom.get(r.coproprietaire) ?? null : null,
          })),
          { onConflict: "copro_id,num" }
        )
        .select("id, num");
      if (eL) throw eL;
      const lotByNum = new Map((insertedLots ?? []).map((l) => [l.num, l.id]));

      const tanRows = rows.flatMap((r) =>
        Object.entries(r.tantiemes)
          .filter(([, v]) => v != null)
          .map(([code, v]) => ({
            lot_id: lotByNum.get(r.num)!,
            cle_id: cleByCode.get(code)!,
            tantiemes: v,
          }))
      );
      if (tanRows.length) {
        const { error } = await supabase.from("lot_tantiemes").upsert(tanRows, { onConflict: "lot_id,cle_id" });
        if (error) throw error;
      }

      // Ménage : les clés restées sans aucun tantième (ex. « MUN » créée à la création
      // du dossier) sont supprimées, et une clé par défaut est garantie parmi celles du fichier.
      if (tanRows.length) {
        const { data: clesEtat, error: eEtat } = await supabase
          .from("cles_repartition")
          .select("id, code, is_default, lot_tantiemes(count)")
          .eq("copro_id", coproId);
        if (eEtat) throw eEtat;
        const compte = (k: NonNullable<typeof clesEtat>[number]) =>
          (k.lot_tantiemes as unknown as { count: number }[])[0]?.count ?? 0;
        const vides = (clesEtat ?? []).filter((k) => compte(k) === 0);
        if (vides.length) {
          const { error } = await supabase
            .from("cles_repartition")
            .delete()
            .in("id", vides.map((k) => k.id));
          if (error) throw error;
        }
        const restantes = (clesEtat ?? []).filter((k) => compte(k) > 0);
        if (restantes.length && !restantes.some((k) => k.is_default)) {
          const premiere = restantes.find((k) => k.code === cleCodes[0]) ?? restantes[0];
          const { error } = await supabase
            .from("cles_repartition")
            .update({ is_default: true })
            .eq("id", premiere.id);
          if (error) throw error;
        }
      }

      // Même ménage pour les bâtiments restés sans lot (ex. après un import
      // « Remplacer ») - sauf les bâtiments déclarés avec leur adresse, qui font foi.
      {
        const { data: batsEtat, error: eBats } = await supabase
          .from("batiments")
          .select("id, declare_creation, adresse, lots(count)")
          .eq("copro_id", coproId);
        if (eBats) throw eBats;
        const batsVides = batimentsVidesASupprimer(
          (batsEtat ?? []).map((b) => ({
            ...b,
            lots: (b.lots as unknown as { count: number }[])[0]?.count ?? 0,
          }))
        );
        if (batsVides.length) {
          const { error } = await supabase.from("batiments").delete().in("id", batsVides);
          if (error) throw error;
        }
      }
      return { lots: rows.length, batiments: newBats.length, coproprietaires: newCp.length };
    },
    onSuccess: () => invalidateDonnees(qc, coproId),
  });
}

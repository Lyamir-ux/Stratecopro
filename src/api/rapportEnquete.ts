// Génération du rapport d'enquête sociale (feedback Amir du 23/09/2026, onglet
// Enquête) : ses chiffres d'occupation sont écrits dans la fiche « État de la
// copropriété » (ANAH) - la fiche et le rapport concordent. Même action depuis
// l'onglet Copropriétaires.
// Depuis le 04/10/2026 (demande d'Amir) le rapport est un PDF de synthèse
// (lib/pdf/rapportEnquete) avec les observations du chef de projet ; le
// classeur Excel reste disponible comme détail des réponses.
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/auth/AuthProvider";
import type { CoproWithStats } from "@/api/copros";
import { useDonnees } from "@/api/donnees";
import { useDossiersCoproprietaires, type DossiersCopro } from "@/api/dossiersCopros";
import { telechargerPdf, useEcrireOccupationFiche } from "@/api/ficheEtat";
import { useEnquete, type Reponse } from "@/api/enquete";
import { exporterRapportEnquete, type ContexteExport } from "@/lib/exportsCopros";
import { calculerOccupation } from "@/lib/ficheEtat";
import { syntheseEnquete } from "@/lib/rapportEnquete";
import { genererRapportEnquetePdf, nomFichierRapportEnquete } from "@/lib/pdf/rapportEnquete";
import { supabase } from "@/lib/supabase";
import { messageErreur } from "@/lib/erreurs";

export const MAX_OBSERVATIONS_RAPPORT = 3000;

export function contexteExport(c: CoproWithStats, data: DossiersCopro): ContexteExport {
  return {
    coproNom: c.name,
    denominationBatiments: c.denomination_batiments,
    batiments: data.batiments,
    cleRef: data.cleRef,
    scenarioNom: data.scenario?.name ?? null,
    publieLe: data.scenario?.statut === "partage" ? data.scenario.updated_at : null,
  };
}

export function useGenererRapportEnquete(c: CoproWithStats, dossiers?: DossiersCopro) {
  const propres = useDossiersCoproprietaires(c);
  const data = dossiers ?? propres;
  const { data: donnees } = useDonnees(c.id);
  const { data: enquete } = useEnquete(c.id);
  const { profile } = useAuth();
  const ecrire = useEcrireOccupationFiche(c.id);
  const qc = useQueryClient();
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const reponses = () => data.dossiers.map((d) => d.enquete.reponse).filter((r): r is Reponse => !!r);

  /** Génère et télécharge le PDF ; vrai si tout s'est bien passé. */
  const generer = async (observations: string): Promise<boolean> => {
    if (!donnees) return false;
    setErreur(null);
    setEnCours(true);
    try {
      const { occupation } = await ecrire.mutateAsync({ copro: c, donnees, reponses: reponses(), auteur: profile?.full_name ?? null });
      const obs = observations.trim().slice(0, MAX_OBSERVATIONS_RAPPORT) || null;
      if (enquete && (enquete.rapport_observations ?? null) !== obs) {
        const { error } = await supabase.from("enquetes").update({ rapport_observations: obs }).eq("id", enquete.id);
        if (error) throw error;
        void qc.invalidateQueries({ queryKey: ["enquete", c.id] });
      }
      const arreteLe = new Date();
      const bytes = await genererRapportEnquetePdf({
        copro: {
          nom: c.name,
          adresse: c.adresse,
          codePostal: c.code_postal,
          ville: c.city,
          syndic: c.syndic_name,
          denominationBatiments: c.denomination_batiments,
        },
        envoyeeLe: enquete?.sent_at ?? enquete?.email_envoye_le ?? null,
        dateLimite: enquete?.date_limite ?? null,
        arreteLe,
        synthese: syntheseEnquete({ dossiers: data.dossiers, lots: donnees.lots, cles: donnees.cles, batiments: data.batiments, occupation }),
        observations: obs,
      });
      telechargerPdf(bytes, nomFichierRapportEnquete(c.name, arreteLe));
      return true;
    } catch (e) {
      setErreur(messageErreur(e, "La génération du rapport a échoué. Réessayez."));
      return false;
    } finally {
      setEnCours(false);
    }
  };

  /** Classeur Excel du détail des réponses (par copropriétaire, par lot), sans toucher à la fiche État. */
  const exporterDetail = () => {
    if (!donnees) return;
    setErreur(null);
    try {
      exporterRapportEnquete(data, contexteExport(c, data), calculerOccupation(c, donnees, reponses()));
    } catch (e) {
      setErreur(messageErreur(e, "L'export Excel a échoué. Réessayez."));
    }
  };

  return {
    generer,
    exporterDetail,
    pret: !data.chargement && !!donnees,
    enCours,
    erreur,
    observations: enquete?.rapport_observations ?? "",
  };
}

export type GenerationRapportEnquete = ReturnType<typeof useGenererRapportEnquete>;

// Génération du rapport d'enquête sociale (feedback Amir du 23/09/2026, onglet
// Enquête) : le classeur Excel est produit depuis la base individuelle par
// copropriétaire, et ses chiffres d'occupation sont écrits dans la fiche
// « État de la copropriété » (ANAH) - la fiche et le rapport concordent.
// Même action depuis l'onglet Copropriétaires (export « Rapport d'enquête »).
import { useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import type { CoproWithStats } from "@/api/copros";
import { useDonnees } from "@/api/donnees";
import { useDossiersCoproprietaires, type DossiersCopro } from "@/api/dossiersCopros";
import { useEcrireOccupationFiche } from "@/api/ficheEtat";
import { exporterRapportEnquete, type ContexteExport } from "@/lib/exportsCopros";
import type { Reponse } from "@/api/enquete";
import { messageErreur } from "@/lib/erreurs";

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
  const { profile } = useAuth();
  const ecrire = useEcrireOccupationFiche(c.id);
  const [erreur, setErreur] = useState<string | null>(null);

  const generer = async () => {
    if (!donnees) return;
    setErreur(null);
    try {
      const reponses = data.dossiers.map((d) => d.enquete.reponse).filter((r): r is Reponse => !!r);
      const { occupation } = await ecrire.mutateAsync({ copro: c, donnees, reponses, auteur: profile?.full_name ?? null });
      exporterRapportEnquete(data, contexteExport(c, data), occupation);
    } catch (e) {
      setErreur(messageErreur(e, "La génération du rapport a échoué. Réessayez."));
    }
  };

  return { generer, pret: !data.chargement && !!donnees, enCours: ecrire.isPending, erreur };
}

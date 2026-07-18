import { useParams } from "react-router-dom";
import { useCrumbs } from "@/components/Shell/useCrumbs";
import { PlaceholderScreen } from "@/components/PlaceholderScreen";

export default function CoproDetail() {
  const { id } = useParams();
  useCrumbs([{ label: "Vos copropriétés", to: "/" }, { label: id ?? "Dossier" }]);
  return <PlaceholderScreen icon="building" title="Dossier copropriété" text="Construit en M4 : onglets Projet, Données, Financement, Enquête, Fichiers, Communications." />;
}

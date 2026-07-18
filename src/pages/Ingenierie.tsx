import { useParams } from "react-router-dom";
import { useCrumbs } from "@/components/Shell/useCrumbs";
import { PlaceholderScreen } from "@/components/PlaceholderScreen";

export default function Ingenierie() {
  const { id } = useParams();
  useCrumbs([
    { label: "Vos copropriétés", to: "/" },
    { label: id ?? "Dossier", to: `/copros/${id}` },
    { label: "Ingénierie financière" },
  ]);
  return <PlaceholderScreen icon="euro" title="Ingénierie financière" text="Construit en M6 : assistant 7 étapes, scénarios, plans individuels." />;
}

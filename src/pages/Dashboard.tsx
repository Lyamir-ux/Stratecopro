import { useCrumbs } from "@/components/Shell/useCrumbs";
import { PlaceholderScreen } from "@/components/PlaceholderScreen";

export default function Dashboard() {
  useCrumbs([{ label: "Vos copropriétés" }]);
  return <PlaceholderScreen icon="gauge" title="Tableau de bord" text="Construit en M3 : KPI, vues Kanban / Galerie / Tableau, dossiers copropriétés." />;
}

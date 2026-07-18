import { useCrumbs } from "@/components/Shell/useCrumbs";
import { PlaceholderScreen } from "@/components/PlaceholderScreen";

export default function Consultations() {
  useCrumbs([{ label: "Consulter un intervenant" }]);
  return <PlaceholderScreen icon="megaphone" title="Consultations" text="Construit en M9 : publication d'appels à intervenants et suivi des candidatures." />;
}

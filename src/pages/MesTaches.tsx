import { useCrumbs } from "@/components/Shell/useCrumbs";
import { PlaceholderScreen } from "@/components/PlaceholderScreen";

export default function MesTaches() {
  useCrumbs([{ label: "Vos tâches" }]);
  return <PlaceholderScreen icon="clipboard" title="Vos tâches" text="Construit en M9 : agrégation des tâches en cours sur toutes les copropriétés." />;
}

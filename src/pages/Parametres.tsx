import { useCrumbs } from "@/components/Shell/useCrumbs";
import { PlaceholderScreen } from "@/components/PlaceholderScreen";

export default function Parametres() {
  useCrumbs([{ label: "Paramètres" }]);
  return <PlaceholderScreen icon="settings" title="Paramètres" text="Construit en M10 : barèmes des aides par millésime, apparence, registre RGPD." />;
}

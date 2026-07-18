import { useCrumbs } from "@/components/Shell/useCrumbs";
import { PlaceholderScreen } from "@/components/PlaceholderScreen";

export default function Collaborateurs() {
  useCrumbs([{ label: "Collaborateurs" }]);
  return <PlaceholderScreen icon="users" title="Collaborateurs" text="Construit en M10 : gestion de l'équipe et invitations." />;
}

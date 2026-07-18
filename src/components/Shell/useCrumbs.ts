import { useEffect } from "react";
import { useUi, type Crumb } from "@/stores/ui";

/** Déclare le fil d'ariane de la page (affiché dans la Topbar). */
export function useCrumbs(crumbs: Crumb[]) {
  const setCrumbs = useUi((s) => s.setCrumbs);
  useEffect(() => {
    setCrumbs(crumbs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(crumbs)]);
}

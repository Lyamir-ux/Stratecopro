import { Outlet } from "react-router-dom";
import { Sidebar, type RecentCopro } from "./Sidebar";
import { Topbar } from "./Topbar";
import { useUi } from "@/stores/ui";

// Recents/tâches branchés sur Supabase en M3 ; utilisateur réel en M2 (auth).
const PLACEHOLDER_USER = { initials: "CB", name: "Claire Becker", org: "Strat Eco · AMO" };
const PLACEHOLDER_RECENTS: RecentCopro[] = [];

export function Layout() {
  const collapsed = useUi((s) => s.collapsed);
  return (
    <div className={"app" + (collapsed ? " collapsed" : "")}>
      <Sidebar
        recents={PLACEHOLDER_RECENTS}
        tasksCount={null}
        user={PLACEHOLDER_USER}
        onLogout={() => {
          /* M2 : signOut Supabase */
        }}
      />
      <div className="main">
        <Topbar />
        <div className="content">
          <Outlet />
        </div>
      </div>
    </div>
  );
}

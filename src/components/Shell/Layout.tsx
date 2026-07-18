import { Outlet } from "react-router-dom";
import { Sidebar, type RecentCopro } from "./Sidebar";
import { Topbar } from "./Topbar";
import { useUi } from "@/stores/ui";
import { useAuth } from "@/auth/AuthProvider";

// Recents/compteur de tâches branchés sur Supabase en M3.
const PLACEHOLDER_RECENTS: RecentCopro[] = [];

export function Layout() {
  const collapsed = useUi((s) => s.collapsed);
  const { profile, signOut } = useAuth();

  const user = {
    initials: profile?.initials ?? "–",
    name: profile?.full_name ?? "Utilisateur",
    org: profile?.job_title ? `Strat Eco · ${profile.job_title}` : "Strat Eco · AMO",
  };

  return (
    <div className={"app" + (collapsed ? " collapsed" : "")}>
      <Sidebar recents={PLACEHOLDER_RECENTS} tasksCount={null} user={user} onLogout={() => void signOut()} />
      <div className="main">
        <Topbar />
        <div className="content">
          <Outlet />
        </div>
      </div>
    </div>
  );
}

import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { useUi } from "@/stores/ui";
import { useAuth } from "@/auth/AuthProvider";
import { useCopros, useTasksCount } from "@/api/copros";

export function Layout() {
  const collapsed = useUi((s) => s.collapsed);
  const { profile, signOut } = useAuth();
  const { data: copros } = useCopros();
  const { data: tasksCount } = useTasksCount();

  const user = {
    initials: profile?.initials ?? "–",
    name: profile?.full_name ?? "Utilisateur",
    org: profile?.job_title ? `Strat Eco · ${profile.job_title}` : "Strat Eco · AMO",
  };
  const recents = (copros ?? []).slice(0, 4).map((c) => ({ id: c.id, name: c.name }));

  return (
    <div className={"app" + (collapsed ? " collapsed" : "")}>
      <Sidebar recents={recents} tasksCount={tasksCount ?? null} user={user} onLogout={() => void signOut()} />
      <div className="main">
        <Topbar />
        <div className="content">
          <Outlet />
        </div>
      </div>
    </div>
  );
}

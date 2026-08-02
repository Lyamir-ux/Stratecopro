import { createBrowserRouter } from "react-router-dom";
import { Layout } from "./components/Shell/Layout";
import { RequireAuth } from "./auth/RequireAuth";
import { RequireRole } from "./auth/RequireRole";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import CoproDetail from "./pages/CoproDetail";
import Ingenierie from "./pages/Ingenierie";
import MesTaches from "./pages/MesTaches";
import Consultations from "./pages/Consultations";
import Collaborateurs from "./pages/Collaborateurs";
import Parametres from "./pages/Parametres";
import Portail from "./pages/Portail";

export const router = createBrowserRouter([
  { path: "/login", element: <Login /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <RequireRole role="amo" />,
        children: [
          {
            element: <Layout />,
            children: [
              { path: "/", element: <Dashboard /> },
              { path: "/copros/:id/ingenierie/:scenarioId?", element: <Ingenierie /> },
              { path: "/copros/:id/:tab?", element: <CoproDetail /> },
              { path: "/taches", element: <MesTaches /> },
              { path: "/consultations", element: <Consultations /> },
              { path: "/collaborateurs", element: <Collaborateurs /> },
              { path: "/parametres", element: <Parametres /> },
            ],
          },
        ],
      },
      {
        element: <RequireRole role="copro" />,
        children: [{ path: "/portail/:section?", element: <Portail /> }],
      },
    ],
  },
]);

import { createBrowserRouter } from "react-router-dom";
import { Layout } from "./components/Shell/Layout";
import { RequireAuth } from "./auth/RequireAuth";
import { RequireRole } from "./auth/RequireRole";
import Login from "./pages/Login";
import MotDePasseOublie from "./pages/MotDePasseOublie";
import Reinitialisation from "./pages/Reinitialisation";
import Dashboard from "./pages/Dashboard";
import CoproDetail from "./pages/CoproDetail";
import Ingenierie from "./pages/Ingenierie";
import PlanDefinitifPage from "./pages/PlanDefinitif";
import MesTaches from "./pages/MesTaches";
import Consultations from "./pages/Consultations";
import Prestataires from "./pages/Prestataires";
import Collaborateurs from "./pages/Collaborateurs";
import Parametres from "./pages/Parametres";
import Portail from "./pages/Portail";
import Prestataire from "./pages/Prestataire";
import Syndic from "./pages/Syndic";
import CoproSyndic from "./pages/Syndic/CoproSyndic";

export const router = createBrowserRouter([
  { path: "/login", element: <Login /> },
  { path: "/mot-de-passe-oublie", element: <MotDePasseOublie /> },
  { path: "/reinitialisation", element: <Reinitialisation /> },
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
              { path: "/copros/:id/plan-definitif/:planId", element: <PlanDefinitifPage /> },
              { path: "/copros/:id/:tab?", element: <CoproDetail /> },
              { path: "/taches", element: <MesTaches /> },
              { path: "/consultations", element: <Consultations /> },
              { path: "/prestataires", element: <Prestataires /> },
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
      {
        element: <RequireRole role="presta" />,
        children: [{ path: "/prestataire/:section?", element: <Prestataire /> }],
      },
      {
        element: <RequireRole role="syndic" />,
        children: [
          { path: "/syndic/copros/:id/:tab?", element: <CoproSyndic /> },
          { path: "/syndic/:section?", element: <Syndic /> },
        ],
      },
    ],
  },
]);

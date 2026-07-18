import { createBrowserRouter } from "react-router-dom";
import { Layout } from "./components/Shell/Layout";
import Dashboard from "./pages/Dashboard";
import CoproDetail from "./pages/CoproDetail";
import Ingenierie from "./pages/Ingenierie";
import MesTaches from "./pages/MesTaches";
import Consultations from "./pages/Consultations";
import Collaborateurs from "./pages/Collaborateurs";
import Parametres from "./pages/Parametres";

// /login sera ajouté en M2 (auth Supabase) avec un garde de route sur le layout.
export const router = createBrowserRouter([
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
]);

import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import ProjectPage from "./pages/ProjectPage";
import Subcontractors from "./pages/Subcontractors";
import AsBuiltExport from "./pages/AsBuiltExport";
import Alerts from "./pages/Alerts";
import Layout from "./components/Layout";

function PrivateRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-8 text-center text-slate-500">Chargement...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route
        path="/"
        element={
          <PrivateRoute>
            <Layout>
              <Dashboard />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
        path="/projects/:id"
        element={
          <PrivateRoute>
            <Layout>
              <ProjectPage />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
        path="/projects/:id/as-built"
        element={
          <PrivateRoute>
            <AsBuiltExport />
          </PrivateRoute>
        }
      />
      <Route
        path="/alerts"
        element={
          <PrivateRoute>
            <Layout>
              <Alerts />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
        path="/subcontractors"
        element={
          <PrivateRoute>
            <Layout>
              <Subcontractors />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Layout({ children }) {
  const { user, organization, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link to="/" className="font-semibold text-brand-600 text-lg">
            Suivi de Projet
          </Link>
          <Link to="/subcontractors" className="text-sm text-slate-600 hover:text-brand-600">
            Sous-traitants
          </Link>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-slate-500">{organization?.name}</span>
          <span className="font-medium">{user?.name}</span>
          <button
            onClick={handleLogout}
            className="px-3 py-1.5 rounded-md border border-slate-300 hover:bg-slate-100 transition"
          >
            Deconnexion
          </button>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}

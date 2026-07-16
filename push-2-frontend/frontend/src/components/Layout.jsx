import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import client from "../api/client";

export default function Layout({ children }) {
  const { user, organization, logout } = useAuth();
  const navigate = useNavigate();
  const restoreInput = useRef(null);
  const [busy, setBusy] = useState(false);

  function handleLogout() {
    logout();
    navigate("/login");
  }

  // Sauvegarde complete de la base (donnees + fichiers) en un fichier JSON telecharge.
  async function handleBackup() {
    setBusy(true);
    try {
      const res = await client.get("/backup?files=1", { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sauvegarde-suivi-projet-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  }

  async function handleRestore(e) {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    if (!confirm(`Restaurer la sauvegarde "${file.name}" ? Les donnees deja presentes sont conservees, seules les manquantes sont recreees.`)) return;
    setBusy(true);
    try {
      const text = await file.text();
      const { data } = await client.post("/backup/restore", JSON.parse(text));
      alert("Restauration terminee : " + JSON.stringify(data.restored));
      window.location.reload();
    } catch (err) {
      alert("Echec de la restauration : " + (err.response?.data?.error || err.message));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link to="/" className="font-semibold text-brand-600 text-lg">
            Suivi de Projet
          </Link>
          <Link to="/alerts" className="text-sm text-slate-600 hover:text-brand-600">
            Alertes
          </Link>
          <Link to="/achats" className="text-sm text-slate-600 hover:text-brand-600">
            Achats
          </Link>
          <Link to="/subcontractors" className="text-sm text-slate-600 hover:text-brand-600">
            Sous-traitants
          </Link>
          <Link to="/history" className="text-sm text-slate-600 hover:text-brand-600">
            Historique
          </Link>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <button
            onClick={handleBackup}
            disabled={busy}
            title="Telecharge toute la base (donnees + fichiers) en un fichier JSON. A faire chaque semaine : le plan gratuit Render n'a pas de sauvegarde."
            className="px-3 py-1.5 rounded-md border border-slate-300 hover:bg-slate-100 transition disabled:opacity-50"
          >
            {busy ? "..." : "Sauvegarde"}
          </button>
          <button
            onClick={() => restoreInput.current?.click()}
            disabled={busy}
            title="Restaure une sauvegarde JSON (apres perte de la base)"
            className="text-slate-400 hover:text-slate-600 text-xs"
          >
            restaurer
          </button>
          <input ref={restoreInput} type="file" accept=".json" onChange={handleRestore} className="hidden" />
          <button
            onClick={() => {
              navigator.clipboard?.writeText(organization?.id || "");
              alert("Code d'organisation copie ! Transmets-le a un collegue : il le colle dans le champ \"ID de l'organisation\" a l'inscription pour rejoindre " + (organization?.name || ""));
            }}
            title="Copier le code d'organisation (pour inviter un collegue)"
            className="text-slate-500 hover:text-brand-600"
          >
            {organization?.name}
          </button>
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

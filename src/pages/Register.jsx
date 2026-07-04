import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import client from "../api/client";
import { useAuth } from "../context/AuthContext";

export default function Register() {
  const [mode, setMode] = useState("create"); // create | join
  const [form, setForm] = useState({
    organizationName: "",
    organizationId: "",
    name: "",
    email: "",
    password: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const endpoint = mode === "create" ? "/auth/register-organization" : "/auth/join-organization";
      const { data } = await client.post(endpoint, form);
      login(data.token, data.user, data.organization);
      navigate("/");
    } catch (err) {
      setError(err.response?.data?.error || "Erreur lors de l'inscription");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-md bg-white p-8 rounded-xl shadow-sm border border-slate-200">
        <h1 className="text-xl font-semibold mb-1">Creer votre espace</h1>
        <p className="text-sm text-slate-500 mb-6">Demarrez le suivi de projet pour votre equipe</p>

        <div className="flex mb-6 rounded-md border border-slate-200 overflow-hidden text-sm">
          <button
            type="button"
            onClick={() => setMode("create")}
            className={`flex-1 py-2 ${mode === "create" ? "bg-brand-600 text-white" : "bg-white text-slate-600"}`}
          >
            Nouvelle organisation
          </button>
          <button
            type="button"
            onClick={() => setMode("join")}
            className={`flex-1 py-2 ${mode === "join" ? "bg-brand-600 text-white" : "bg-white text-slate-600"}`}
          >
            Rejoindre une equipe
          </button>
        </div>

        {error && <div className="mb-4 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "create" ? (
            <div>
              <label className="block text-sm font-medium mb-1">Nom de l'organisation</label>
              <input
                required
                value={form.organizationName}
                onChange={(e) => update("organizationName", e.target.value)}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium mb-1">Identifiant de l'organisation</label>
              <input
                required
                value={form.organizationId}
                onChange={(e) => update("organizationId", e.target.value)}
                placeholder="Fourni par votre administrateur"
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium mb-1">Votre nom</label>
            <input
              required
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => update("email", e.target.value)}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Mot de passe (8 caracteres min.)</label>
            <input
              type="password"
              required
              minLength={8}
              value={form.password}
              onChange={(e) => update("password", e.target.value)}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand-600 text-white rounded-md py-2 text-sm font-medium hover:bg-brand-700 transition disabled:opacity-50"
          >
            {loading ? "Creation..." : "Creer mon compte"}
          </button>
        </form>

        <p className="text-sm text-slate-500 mt-6 text-center">
          Deja un compte ?{" "}
          <Link to="/login" className="text-brand-600 font-medium">
            Se connecter
          </Link>
        </p>
      </div>
    </div>
  );
}

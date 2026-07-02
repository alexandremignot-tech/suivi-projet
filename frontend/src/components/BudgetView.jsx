import { useState } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import client from "../api/client";

const COLORS = ["#3b5bfd", "#22c55e", "#f97316", "#ef4444", "#a855f7", "#06b6d4"];

export default function BudgetView({ project, onChange }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ label: "", amount: "", type: "expense", category: "", date: "" });

  const expenses = project.budgetItems.filter((b) => b.type === "expense");
  const income = project.budgetItems.filter((b) => b.type === "income");
  const totalSpent = expenses.reduce((s, b) => s + b.amount, 0);
  const totalIncome = income.reduce((s, b) => s + b.amount, 0);
  const remaining = project.budgetTotal - totalSpent;

  const byCategory = {};
  expenses.forEach((b) => {
    const key = b.category || "Autre";
    byCategory[key] = (byCategory[key] || 0) + b.amount;
  });
  const chartData = Object.entries(byCategory).map(([name, value]) => ({ name, value }));

  async function handleSubmit(e) {
    e.preventDefault();
    await client.post("/budget-items", { ...form, projectId: project.id });
    setForm({ label: "", amount: "", type: "expense", category: "", date: "" });
    setShowForm(false);
    onChange();
  }

  async function handleDelete(id) {
    if (!confirm("Supprimer cette ligne ?")) return;
    await client.delete(`/budget-items/${id}`);
    onChange();
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <Card label="Budget total" value={project.budgetTotal} />
          <Card label="Depense" value={totalSpent} highlight={totalSpent > project.budgetTotal ? "red" : "default"} />
          <Card label="Restant" value={remaining} highlight={remaining < 0 ? "red" : "green"} />
        </div>

        <div className="flex items-center justify-between">
          <h3 className="font-medium">Lignes budgetaires</h3>
          <button onClick={() => setShowForm((v) => !v)} className="text-sm text-brand-600 font-medium">
            {showForm ? "Annuler" : "+ Ajouter une ligne"}
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-lg p-4 grid grid-cols-2 gap-3">
            <input
              required
              placeholder="Libelle"
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              className="col-span-2 border border-slate-300 rounded-md px-3 py-2 text-sm"
            />
            <input
              required
              type="number"
              step="0.01"
              placeholder="Montant (EUR)"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              className="border border-slate-300 rounded-md px-3 py-2 text-sm"
            />
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
              className="border border-slate-300 rounded-md px-3 py-2 text-sm"
            >
              <option value="expense">Depense</option>
              <option value="income">Recette</option>
            </select>
            <input
              placeholder="Categorie (optionnel)"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="border border-slate-300 rounded-md px-3 py-2 text-sm"
            />
            <input
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              className="border border-slate-300 rounded-md px-3 py-2 text-sm"
            />
            <button type="submit" className="col-span-2 bg-brand-600 text-white text-sm py-2 rounded-md">
              Ajouter
            </button>
          </form>
        )}

        <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-100">
          {project.budgetItems.length === 0 && (
            <p className="text-sm text-slate-500 p-4">Aucune ligne budgetaire.</p>
          )}
          {project.budgetItems.map((b) => (
            <div key={b.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
              <div>
                <span className="font-medium">{b.label}</span>
                {b.category && <span className="text-slate-400 ml-2">({b.category})</span>}
              </div>
              <div className="flex items-center gap-4">
                <span className="text-slate-400">{new Date(b.date).toLocaleDateString("fr-FR")}</span>
                <span className={b.type === "expense" ? "text-red-600" : "text-green-600"}>
                  {b.type === "expense" ? "-" : "+"}
                  {b.amount.toLocaleString("fr-FR")} EUR
                </span>
                <button onClick={() => handleDelete(b.id)} className="text-slate-400 hover:text-red-500">
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <h3 className="font-medium mb-2">Depenses par categorie</h3>
        {chartData.length === 0 ? (
          <p className="text-sm text-slate-500">Pas encore de depenses.</p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={chartData} dataKey="value" nameKey="name" outerRadius={90} label>
                {chartData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v) => `${v.toLocaleString("fr-FR")} EUR`} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        )}
        {totalIncome > 0 && (
          <p className="text-sm text-slate-500 mt-3">Recettes totales : {totalIncome.toLocaleString("fr-FR")} EUR</p>
        )}
      </div>
    </div>
  );
}

function Card({ label, value, highlight = "default" }) {
  const colors = {
    default: "text-slate-900",
    red: "text-red-600",
    green: "text-green-600",
  };
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-3">
      <div className="text-xs text-slate-400">{label}</div>
      <div className={`font-semibold ${colors[highlight]}`}>{Number(value).toLocaleString("fr-FR")} EUR</div>
    </div>
  );
}

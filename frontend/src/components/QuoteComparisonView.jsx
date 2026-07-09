import { useEffect, useMemo, useRef, useState } from "react";
import client from "../api/client";

// Comparateur d'offres de prix : tableau ligne a ligne (postes x offres) + score pondere
// multi-criteres (le prix est calcule automatiquement depuis le tableau, les autres criteres sont
// notes manuellement de 0 a 10 par offre) + import assiste par IA d'un devis (PDF/image/texte/CSV)
// qui propose une nouvelle offre prete a relire avant tout enregistrement.

function uid() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function fmtEUR(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return n.toLocaleString("fr-FR", { maximumFractionDigits: 0 }) + " €";
}

function computeTotals(lineItems, offers) {
  const totals = {};
  for (const o of offers) {
    let total = 0;
    let hasAny = false;
    for (const li of lineItems) {
      const p = li.prices?.[o.id];
      if (p && p.included !== false && typeof p.amount === "number") {
        total += p.amount;
        hasAny = true;
      }
    }
    totals[o.id] = hasAny ? total : null;
  }
  return totals;
}

function computeRanking(criteria, offers, totals) {
  const totalWeight = criteria.reduce((s, c) => s + (Number(c.weight) || 0), 0) || 1;
  const priceValues = offers.map((o) => totals[o.id]).filter((v) => typeof v === "number");
  const minPrice = priceValues.length ? Math.min(...priceValues) : null;

  const ranked = offers.map((o) => {
    const contributions = {};
    for (const c of criteria) {
      let raw;
      if (c.key === "price") {
        raw = minPrice && typeof totals[o.id] === "number" && totals[o.id] > 0 ? (minPrice / totals[o.id]) * 100 : 0;
      } else {
        const score = Number(o.scores?.[c.key]);
        raw = Number.isFinite(score) ? score * 10 : 50; // 5/10 par defaut si non note
      }
      contributions[c.key] = ((Number(c.weight) || 0) * raw) / totalWeight;
    }
    const score = Object.values(contributions).reduce((s, v) => s + v, 0);
    return { offer: o, score, contributions };
  });
  ranked.sort((a, b) => b.score - a.score);
  return ranked;
}

const CRITERION_COLORS = ["#0f172a", "#334155", "#64748b", "#94a3b8", "#cbd5e1", "#e2e8f0", "#f1f5f9", "#a78bfa", "#f59e0b"];

export default function QuoteComparisonView({ project }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newLotId, setNewLotId] = useState("");
  const [saving, setSaving] = useState(false);

  // Etat editable local (initialise depuis la comparaison selectionnee, remis a zero au changement)
  const [title, setTitle] = useState("");
  const [lotId, setLotId] = useState("");
  const [criteria, setCriteria] = useState([]);
  const [offers, setOffers] = useState([]);
  const [lineItems, setLineItems] = useState([]);
  const [dirty, setDirty] = useState(false);

  const [tab, setTab] = useState("table"); // table | score | import

  // Import IA
  const fileInputRef = useRef(null);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState("");
  const [extractResult, setExtractResult] = useState(null);
  const [pendingFileName, setPendingFileName] = useState("");

  const lots = project.lots || [];

  async function load() {
    setLoading(true);
    const { data } = await client.get("/quote-comparisons", { params: { projectId: project.id } });
    setList(data);
    setLoading(false);
    if (!selectedId && data.length > 0) setSelectedId(data[0].id);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  const selected = list.find((c) => c.id === selectedId) || null;

  useEffect(() => {
    if (selected) {
      setTitle(selected.title);
      setLotId(selected.lotId || "");
      setCriteria(Array.isArray(selected.criteria) ? selected.criteria : []);
      setOffers(Array.isArray(selected.offers) ? selected.offers : []);
      setLineItems(Array.isArray(selected.lineItems) ? selected.lineItems : []);
      setDirty(false);
      setExtractResult(null);
      setExtractError("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  function markDirty(fn) {
    return (...args) => {
      fn(...args);
      setDirty(true);
    };
  }

  async function handleCreate(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const { data } = await client.post("/quote-comparisons", {
        projectId: project.id,
        lotId: newLotId || null,
        title: newTitle,
      });
      setNewTitle("");
      setNewLotId("");
      setShowCreate(false);
      await load();
      setSelectedId(data.id);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!confirm("Supprimer cette comparaison ?")) return;
    await client.delete(`/quote-comparisons/${id}`);
    if (selectedId === id) setSelectedId(null);
    await load();
  }

  async function handleSave() {
    if (!selected) return;
    setSaving(true);
    try {
      await client.put(`/quote-comparisons/${selected.id}`, { title, lotId: lotId || null, criteria, offers, lineItems });
      await load();
      setDirty(false);
    } finally {
      setSaving(false);
    }
  }

  // ---- Tableau ----
  const addLineItem = markDirty(() => setLineItems((li) => [...li, { id: uid(), label: "", budgetAmount: null, prices: {} }]));
  const removeLineItem = markDirty((id) => setLineItems((li) => li.filter((x) => x.id !== id)));
  const updateLineItem = markDirty((id, fields) => setLineItems((li) => li.map((x) => (x.id === id ? { ...x, ...fields } : x))));
  const updatePrice = markDirty((lineId, offerId, fields) =>
    setLineItems((li) =>
      li.map((x) => (x.id === lineId ? { ...x, prices: { ...x.prices, [offerId]: { ...(x.prices?.[offerId] || { included: true }), ...fields } } } : x))
    )
  );

  const addOffer = markDirty(() => setOffers((o) => [...o, { id: uid(), name: "Nouvelle offre", scores: {} }]));
  const removeOffer = markDirty((id) => {
    setOffers((o) => o.filter((x) => x.id !== id));
    setLineItems((li) =>
      li.map((x) => ({ ...x, prices: Object.fromEntries(Object.entries(x.prices || {}).filter(([k]) => k !== id)) }))
    );
  });
  const updateOffer = markDirty((id, fields) => setOffers((o) => o.map((x) => (x.id === id ? { ...x, ...fields } : x))));
  const updateOfferScore = markDirty((id, key, value) =>
    setOffers((o) => o.map((x) => (x.id === id ? { ...x, scores: { ...x.scores, [key]: value === "" ? undefined : Number(value) } } : x)))
  );

  const addCriterion = markDirty(() =>
    setCriteria((c) => [...c, { key: `custom_${uid()}`, label: "Nouveau critere", weight: 10, info: "" }])
  );
  const removeCriterion = markDirty((key) => setCriteria((c) => c.filter((x) => x.key !== key)));
  const updateCriterion = markDirty((key, fields) => setCriteria((c) => c.map((x) => (x.key === key ? { ...x, ...fields } : x))));

  const totals = useMemo(() => computeTotals(lineItems, offers), [lineItems, offers]);
  const minTotal = useMemo(() => {
    const vals = Object.values(totals).filter((v) => typeof v === "number");
    return vals.length ? Math.min(...vals) : null;
  }, [totals]);
  const ranking = useMemo(() => computeRanking(criteria, offers, totals), [criteria, offers, totals]);
  const maxScore = ranking[0]?.score || 1;
  const totalWeight = criteria.reduce((s, c) => s + (Number(c.weight) || 0), 0);

  // ---- Import IA ----
  function handlePickFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingFileName(file.name);
    runExtraction(file);
  }

  async function runExtraction(file) {
    if (!selected) return;
    setExtracting(true);
    setExtractError("");
    setExtractResult(null);
    try {
      const form = new FormData();
      form.append("file", file);
      // Ne pas fixer manuellement Content-Type ici : axios doit deriver la limite ("boundary")
      // du FormData lui-meme, sinon multer ne peut pas parser la requete cote serveur.
      const { data } = await client.post(`/quote-comparisons/${selected.id}/extract`, form);
      setExtractResult(data);
    } catch (err) {
      setExtractError(err?.response?.data?.error || "Erreur lors de l'extraction.");
    } finally {
      setExtracting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function acceptExtraction() {
    if (!extractResult) return;
    const offerId = uid();
    const newOffer = {
      id: offerId,
      name: extractResult.offerName || pendingFileName.replace(/\.[^.]+$/, "") || "Offre importee",
      subcontractorId: null,
      validityDays: extractResult.validityDays ?? null,
      deliveryWeeks: extractResult.deliveryWeeks ?? null,
      warrantyMonths: extractResult.warrantyMonths ?? null,
      scores: {},
      sourceFileName: extractResult.sourceFileName || pendingFileName || null,
    };

    setLineItems((prev) => {
      const next = prev.map((li) => ({ ...li, prices: { ...li.prices } }));
      for (const item of extractResult.lineItems) {
        const needle = item.label.trim().toLowerCase();
        let target = next.find((li) => li.label.trim().toLowerCase() === needle);
        if (!target) {
          target = { id: uid(), label: item.label, budgetAmount: null, prices: {} };
          next.push(target);
        }
        target.prices[offerId] = { amount: item.amount, note: item.note || "", included: item.amount !== null };
      }
      return next;
    });
    setOffers((prev) => [...prev, newOffer]);
    setDirty(true);
    setExtractResult(null);
    setPendingFileName("");
    setTab("table");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium">Comparateur d'offres de prix</h3>
          <p className="text-xs text-slate-500">
            Tableau ligne a ligne par poste, score pondere multi-criteres, et import assiste par IA d'un devis
            pour prereplir automatiquement une offre.
          </p>
        </div>
        <button onClick={() => setShowCreate((v) => !v)} className="text-sm text-brand-600 font-medium">
          {showCreate ? "Annuler" : "+ Nouvelle comparaison"}
        </button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="bg-white border border-slate-200 rounded-lg p-4 flex gap-3 items-start">
          <input
            required
            placeholder="Libelle (ex: BB2 - Energy Center)"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            className="flex-1 border border-slate-300 rounded-md px-3 py-2 text-sm"
          />
          <select
            value={newLotId}
            onChange={(e) => setNewLotId(e.target.value)}
            className="border border-slate-300 rounded-md px-3 py-2 text-sm"
          >
            <option value="">Lot concerne (optionnel)</option>
            {lots.map((l) => (
              <option key={l.id} value={l.id}>
                {l.code} - {l.name}
              </option>
            ))}
          </select>
          <button type="submit" disabled={saving} className="bg-brand-600 text-white text-sm px-4 py-2 rounded-md disabled:opacity-50">
            {saving ? "..." : "Creer"}
          </button>
        </form>
      )}

      {loading && <p className="text-sm text-slate-500">Chargement...</p>}
      {!loading && list.length === 0 && <p className="text-sm text-slate-500">Aucune comparaison pour ce projet.</p>}

      {!loading && list.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {list.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedId(c.id)}
              className={`text-xs px-3 py-1.5 rounded-full border ${
                selectedId === c.id ? "bg-brand-600 text-white border-brand-600" : "bg-white border-slate-300 text-slate-600"
              }`}
            >
              {c.title}
              {c.lot && <span className="opacity-70"> · {c.lot.code}</span>}
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <input
              value={title}
              onChange={markDirty((e) => setTitle(e.target.value))}
              className="font-medium text-sm border border-slate-300 rounded-md px-2 py-1 flex-1 min-w-[200px]"
            />
            <select value={lotId} onChange={markDirty((e) => setLotId(e.target.value))} className="text-xs border border-slate-300 rounded-md px-2 py-1">
              <option value="">Lot (optionnel)</option>
              {lots.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.code} - {l.name}
                </option>
              ))}
            </select>
            <button
              onClick={handleSave}
              disabled={saving || !dirty}
              className="text-xs bg-brand-600 text-white px-3 py-1.5 rounded-md disabled:opacity-40"
            >
              {saving ? "Enregistrement..." : dirty ? "Enregistrer les modifications" : "A jour"}
            </button>
            <button onClick={() => handleDelete(selected.id)} className="text-xs text-red-600 underline">
              Supprimer
            </button>
          </div>

          <div className="flex gap-1 border-b border-slate-200">
            {[
              ["table", "Tableau comparatif"],
              ["score", "Score pondere"],
              ["import", "Import IA"],
            ].map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`px-3 py-1.5 text-xs font-medium border-b-2 -mb-px ${
                  tab === key ? "border-brand-600 text-brand-600" : "border-transparent text-slate-500"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === "table" && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr>
                    <th className="text-left p-1.5 bg-slate-50 border border-slate-200">Poste</th>
                    <th className="text-right p-1.5 bg-slate-50 border border-slate-200">Budget</th>
                    {offers.map((o) => (
                      <th key={o.id} className="p-1.5 bg-slate-50 border border-slate-200 min-w-[160px]">
                        <div className="flex items-center gap-1">
                          <input
                            value={o.name}
                            onChange={(e) => updateOffer(o.id, { name: e.target.value })}
                            className="flex-1 border border-slate-300 rounded px-1 py-0.5 font-medium"
                          />
                          <button onClick={() => removeOffer(o.id)} className="text-red-600" title="Supprimer l'offre">
                            x
                          </button>
                        </div>
                        <div className="flex gap-1 mt-1">
                          <input
                            type="number"
                            title="Delai (semaines)"
                            placeholder="Delai (sem.)"
                            value={o.deliveryWeeks ?? ""}
                            onChange={(e) => updateOffer(o.id, { deliveryWeeks: e.target.value === "" ? null : Number(e.target.value) })}
                            className="w-full border border-slate-300 rounded px-1 py-0.5 font-normal"
                          />
                          <input
                            type="number"
                            title="Garantie (mois)"
                            placeholder="Garantie (mois)"
                            value={o.warrantyMonths ?? ""}
                            onChange={(e) => updateOffer(o.id, { warrantyMonths: e.target.value === "" ? null : Number(e.target.value) })}
                            className="w-full border border-slate-300 rounded px-1 py-0.5 font-normal"
                          />
                        </div>
                        {o.sourceFileName && <div className="text-[10px] text-slate-400 mt-1 truncate">Importe : {o.sourceFileName}</div>}
                      </th>
                    ))}
                    <th className="p-1.5 bg-slate-50 border border-slate-200">
                      <button onClick={addOffer} className="text-brand-600 font-medium">
                        + Offre
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((li) => (
                    <tr key={li.id}>
                      <td className="p-1.5 border border-slate-200">
                        <input
                          value={li.label}
                          onChange={(e) => updateLineItem(li.id, { label: e.target.value })}
                          placeholder="Intitule du poste"
                          className="w-full border border-slate-300 rounded px-1 py-0.5"
                        />
                      </td>
                      <td className="p-1.5 border border-slate-200 text-right">
                        <input
                          type="number"
                          value={li.budgetAmount ?? ""}
                          onChange={(e) => updateLineItem(li.id, { budgetAmount: e.target.value === "" ? null : Number(e.target.value) })}
                          className="w-24 border border-slate-300 rounded px-1 py-0.5 text-right"
                        />
                      </td>
                      {offers.map((o) => {
                        const p = li.prices?.[o.id] || { included: true };
                        const isMin =
                          typeof p.amount === "number" &&
                          p.included !== false &&
                          Math.min(
                            ...offers.map((oo) => {
                              const pp = li.prices?.[oo.id];
                              return pp && pp.included !== false && typeof pp.amount === "number" ? pp.amount : Infinity;
                            })
                          ) === p.amount;
                        return (
                          <td key={o.id} className={`p-1.5 border border-slate-200 ${isMin ? "bg-emerald-50" : ""}`}>
                            <div className="flex items-center gap-1">
                              <input
                                type="checkbox"
                                checked={p.included !== false}
                                onChange={(e) => updatePrice(li.id, o.id, { included: e.target.checked })}
                                title="Inclus dans le perimetre de cette offre"
                              />
                              <input
                                type="number"
                                value={p.amount ?? ""}
                                onChange={(e) => updatePrice(li.id, o.id, { amount: e.target.value === "" ? null : Number(e.target.value) })}
                                className={`w-full border border-slate-300 rounded px-1 py-0.5 text-right ${isMin ? "font-semibold text-emerald-700" : ""}`}
                                disabled={p.included === false}
                              />
                            </div>
                            <input
                              value={p.note || ""}
                              onChange={(e) => updatePrice(li.id, o.id, { note: e.target.value })}
                              placeholder="Note"
                              className="w-full border border-slate-200 rounded px-1 py-0.5 mt-1 text-[10px] text-slate-500"
                            />
                          </td>
                        );
                      })}
                      <td className="p-1.5 border border-slate-200 text-center">
                        <button onClick={() => removeLineItem(li.id)} className="text-red-600">
                          x
                        </button>
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td colSpan={2 + offers.length + 1} className="p-1.5 border border-slate-200">
                      <button onClick={addLineItem} className="text-brand-600 font-medium">
                        + Poste
                      </button>
                    </td>
                  </tr>
                  <tr className="font-semibold">
                    <td className="p-1.5 border-2 border-slate-300 bg-slate-50">Total (postes chiffres inclus)</td>
                    <td className="p-1.5 border-2 border-slate-300 bg-slate-50" />
                    {offers.map((o) => {
                      const t = totals[o.id];
                      const isBest = typeof t === "number" && t === minTotal;
                      return (
                        <td key={o.id} className={`p-1.5 border-2 border-slate-300 bg-slate-50 text-right ${isBest ? "text-emerald-700" : ""}`}>
                          {fmtEUR(t)}
                          {typeof t === "number" && typeof minTotal === "number" && t > minTotal && (
                            <div className="text-[10px] font-normal text-slate-400">+{fmtEUR(t - minTotal)}</div>
                          )}
                        </td>
                      );
                    })}
                    <td className="p-1.5 border-2 border-slate-300 bg-slate-50" />
                  </tr>
                </tbody>
              </table>
              {offers.length === 0 && <p className="text-xs text-slate-400 mt-2">Ajoute une offre pour commencer, ou importe un devis via l'onglet "Import IA".</p>}
            </div>
          )}

          {tab === "score" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-slate-600">
                    Criteres (poids total : {totalWeight}% — le prix est calcule automatiquement depuis le tableau, les autres criteres se notent de 0 a 10 par offre)
                  </p>
                  <button onClick={addCriterion} className="text-xs text-brand-600 font-medium">
                    + Critere
                  </button>
                </div>
                {criteria.map((c) => (
                  <div key={c.key} className="grid grid-cols-[1fr_70px_1fr_28px] gap-2 items-center">
                    <input
                      value={c.label}
                      onChange={(e) => updateCriterion(c.key, { label: e.target.value })}
                      className="border border-slate-300 rounded px-2 py-1 text-xs"
                    />
                    <input
                      type="number"
                      value={c.weight}
                      onChange={(e) => updateCriterion(c.key, { weight: Number(e.target.value) })}
                      className="border border-slate-300 rounded px-2 py-1 text-xs text-right"
                      title="Poids (%)"
                    />
                    <input
                      value={c.info || ""}
                      onChange={(e) => updateCriterion(c.key, { info: e.target.value })}
                      placeholder="Explication (optionnel)"
                      className="border border-slate-300 rounded px-2 py-1 text-xs text-slate-500"
                    />
                    {c.key !== "price" ? (
                      <button onClick={() => removeCriterion(c.key)} className="text-red-600 text-xs">
                        x
                      </button>
                    ) : (
                      <span />
                    )}
                  </div>
                ))}
              </div>

              {offers.length > 0 && criteria.filter((c) => c.key !== "price").length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-slate-600">Notes manuelles par offre (0 a 10)</p>
                  <table className="text-xs border-collapse">
                    <thead>
                      <tr>
                        <th className="text-left p-1.5 bg-slate-50 border border-slate-200">Offre</th>
                        {criteria
                          .filter((c) => c.key !== "price")
                          .map((c) => (
                            <th key={c.key} className="p-1.5 bg-slate-50 border border-slate-200" title={c.info}>
                              {c.label}
                            </th>
                          ))}
                      </tr>
                    </thead>
                    <tbody>
                      {offers.map((o) => (
                        <tr key={o.id}>
                          <td className="p-1.5 border border-slate-200 font-medium">{o.name}</td>
                          {criteria
                            .filter((c) => c.key !== "price")
                            .map((c) => (
                              <td key={c.key} className="p-1.5 border border-slate-200">
                                <input
                                  type="number"
                                  min="0"
                                  max="10"
                                  value={o.scores?.[c.key] ?? ""}
                                  onChange={(e) => updateOfferScore(o.id, c.key, e.target.value)}
                                  placeholder="5"
                                  className="w-14 border border-slate-300 rounded px-1 py-0.5 text-center"
                                />
                              </td>
                            ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="space-y-2">
                <p className="text-xs font-medium text-slate-600">Classement</p>
                {ranking.length === 0 && <p className="text-xs text-slate-400">Ajoute au moins une offre.</p>}
                {ranking.map((r, i) => (
                  <div key={r.offer.id} className="grid grid-cols-[24px_140px_1fr_50px] items-center gap-2">
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                        i === 0 ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-700"
                      }`}
                    >
                      {i + 1}
                    </div>
                    <div className="text-xs font-medium truncate">
                      {r.offer.name}
                      {i === 0 && <span className="ml-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 rounded-full px-1.5 py-0.5">Recommande</span>}
                    </div>
                    <div className="h-4 rounded-full overflow-hidden bg-slate-100 flex">
                      {criteria.map((c, idx) => (
                        <div
                          key={c.key}
                          title={c.label}
                          style={{
                            width: `${Math.max(0, (r.contributions[c.key] / maxScore) * 100)}%`,
                            background: CRITERION_COLORS[idx % CRITERION_COLORS.length],
                          }}
                        />
                      ))}
                    </div>
                    <div className="text-xs font-bold text-right">{r.score.toFixed(0)}</div>
                  </div>
                ))}
                <div className="flex flex-wrap gap-2 text-[10px] text-slate-500 pt-1">
                  {criteria.map((c, idx) => (
                    <span key={c.key} className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-sm inline-block" style={{ background: CRITERION_COLORS[idx % CRITERION_COLORS.length] }} />
                      {c.label}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === "import" && (
            <div className="space-y-3">
              <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center">
                <p className="text-sm text-slate-600 mb-1">Importe un devis fournisseur (PDF, photo/scan, texte ou CSV)</p>
                <p className="text-xs text-slate-400 mb-3">
                  L'IA lit le document et propose une nouvelle offre prete a relire — rien n'est enregistre avant que tu valides.
                </p>
                <input ref={fileInputRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.txt,.csv" onChange={handlePickFile} className="text-xs" />
                {extracting && <p className="text-xs text-brand-600 mt-2">Extraction en cours...</p>}
                {extractError && <p className="text-xs text-red-600 mt-2">{extractError}</p>}
              </div>

              {extractResult && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-2">
                  <p className="text-sm font-medium">
                    Resultat : {extractResult.lineItems.length} poste(s) detecte(s)
                    {extractResult.offerName ? ` — ${extractResult.offerName}` : ""}
                  </p>
                  <div className="flex gap-4 text-xs text-slate-500">
                    {extractResult.validityDays != null && <span>Validite : {extractResult.validityDays} j</span>}
                    {extractResult.deliveryWeeks != null && <span>Delai : {extractResult.deliveryWeeks} sem.</span>}
                    {extractResult.warrantyMonths != null && <span>Garantie : {extractResult.warrantyMonths} mois</span>}
                  </div>
                  <table className="w-full text-xs border-collapse mt-1">
                    <thead>
                      <tr>
                        <th className="text-left p-1.5 bg-white border border-slate-200">Poste</th>
                        <th className="text-right p-1.5 bg-white border border-slate-200">Montant</th>
                        <th className="text-left p-1.5 bg-white border border-slate-200">Note</th>
                      </tr>
                    </thead>
                    <tbody>
                      {extractResult.lineItems.map((li, i) => (
                        <tr key={i}>
                          <td className="p-1.5 border border-slate-200">{li.label}</td>
                          <td className="p-1.5 border border-slate-200 text-right">{li.amount != null ? fmtEUR(li.amount) : "non chiffre"}</td>
                          <td className="p-1.5 border border-slate-200 text-slate-500">{li.note || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {extractResult.warnings?.length > 0 && (
                    <div className="text-xs text-amber-700 bg-amber-50 rounded-md p-2">
                      {extractResult.warnings.map((w, i) => (
                        <p key={i}>⚠ {w}</p>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-3 pt-1">
                    <button onClick={acceptExtraction} className="text-xs bg-brand-600 text-white px-3 py-1.5 rounded-md font-medium">
                      Ajouter comme nouvelle offre au tableau
                    </button>
                    <button onClick={() => setExtractResult(null)} className="text-xs text-slate-500 underline">
                      Ignorer
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-400">
                    Les postes qui correspondent (meme intitule) a une ligne existante du tableau sont alignes automatiquement ;
                    les autres sont ajoutes comme nouvelles lignes. Pense a cliquer "Enregistrer les modifications" ensuite.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

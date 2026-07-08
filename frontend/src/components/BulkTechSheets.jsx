import { useState } from "react";
import client from "../api/client";

// Depot en vrac de fiches techniques : glisse 50 PDF d'un coup, l'app devine le lot de
// chacune (code BBx dans le nom, mots-cles metier, noms/fabricants des equipements du
// projet), tu corriges dans la table si besoin, puis tout est cree en un clic.
// Bonus : si une fiche correspond a un equipement sans fiche technique, elle lui est
// aussi rattachee (technicalSheetUrl).

const normalize = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// Mots-cles metier -> code de lot (adaptes aux reseaux de chaleur / geothermie KARNO)
const LOT_KEYWORDS = [
  ["BB1", /forage|sonde|trt|geotherm|liaison|collecteur|borehole/],
  ["BB2", /\bpac\b|pompe a chaleur|reflex|echangeur|vase|circulateur|purgeur|soupape|adoucisseur|chaufferie|hydraul|calorifug|expansion|tampon|ballon/],
  ["BB3", /calpex|logstor|tube|conduite|pre isole|preisole|reseau|soudur|manchon|piquage|derouleuse/],
  ["BB4", /terrass|tranchee|remblai|voirie/],
  ["BB5", /hiu|sous station|substation|booster|compteur|kamstrup|giacomini|pressostat|thermostat|psm/],
  ["BB6", /regul|gtc|automate|topologie|supervision|liste de point/],
  ["BB7", /elec|tgbt|cable|power flex|ores|deba|cabine|raccordement grd/],
  ["BB8", /toiture|porte|beton|architecte|batiment|rector|menuiserie|etancheite|energy center/],
];

export default function BulkTechSheets({ project, onChange }) {
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState(null);
  const lots = project.lots || [];

  function guessLot(fileName) {
    const raw = fileName;
    const norm = normalize(fileName);
    // 1. code BBx explicite dans le nom
    const bbMatch = raw.match(/BB(\d+)/i);
    if (bbMatch) {
      const lot = lots.find((l) => l.code.toUpperCase() === `BB${bbMatch[1]}`);
      if (lot) return { lotId: lot.id, via: `code ${lot.code}` };
    }
    // 2. correspondance avec un equipement du projet (nom ou fabricant)
    for (const eq of project.equipments || []) {
      const words = [eq.manufacturer, ...(eq.name || "").split(/\s+/)].filter((w) => w && w.length > 3).map(normalize);
      if (words.some((w) => w && norm.includes(w))) {
        if (eq.lotId) return { lotId: eq.lotId, via: `equipement « ${eq.name} »`, equipmentId: eq.id };
      }
    }
    // 3. mots-cles metier
    for (const [code, re] of LOT_KEYWORDS) {
      if (re.test(norm)) {
        const lot = lots.find((l) => l.code.toUpperCase() === code);
        if (lot) return { lotId: lot.id, via: "mots-cles" };
      }
    }
    return { lotId: "", via: null };
  }

  function handleDrop(e) {
    e.preventDefault();
    const files = [...(e.dataTransfer?.files || [])];
    if (!files.length) return;
    setReport(null);
    setRows((prev) => [
      ...prev,
      ...files.map((file) => {
        const guess = guessLot(file.name);
        return {
          file,
          fileName: file.name,
          name: file.name.replace(/\.[^.]+$/, ""),
          lotId: guess.lotId,
          via: guess.via,
          equipmentId: guess.equipmentId || null,
        };
      }),
    ]);
  }

  async function createAll() {
    setBusy(true);
    const rep = { created: 0, linkedEquip: 0, errors: 0 };
    try {
      for (const row of rows) {
        try {
          const formData = new FormData();
          formData.append("file", row.file);
          const { data: up } = await client.post("/uploads", formData, { headers: { "Content-Type": "multipart/form-data" } });
          await client.post("/documents", {
            projectId: project.id,
            lotId: row.lotId || null,
            name: row.name,
            category: "Plans / Fiche technique",
            fileUrl: up.fileUrl,
            fileName: up.fileName,
          });
          rep.created += 1;
          if (row.equipmentId) {
            const eq = (project.equipments || []).find((x) => x.id === row.equipmentId);
            if (eq && !eq.technicalSheetUrl) {
              await client.put(`/equipments/${row.equipmentId}`, { technicalSheetUrl: up.fileUrl }).catch(() => {});
              rep.linkedEquip += 1;
            }
          }
        } catch {
          rep.errors += 1;
        }
      }
      setRows([]);
      setReport(rep);
      onChange();
    } finally {
      setBusy(false);
    }
  }

  const unassigned = rows.filter((r) => !r.lotId).length;

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        className="border-2 border-dashed border-brand-300 bg-brand-50/40 rounded-lg px-4 py-6 text-center text-sm text-slate-600 hover:border-brand-400"
      >
        <span className="font-medium">Fiches techniques en vrac :</span> glisse ici tous tes PDF d'un coup
        (50 si tu veux) — je devine le lot de chacun (code BB, equipements du projet, mots-cles metier),
        tu corriges, et tout est cree en un clic.
      </div>

      {report && (
        <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">
          {report.created} fiche(s) creee(s)
          {report.linkedEquip > 0 ? `, ${report.linkedEquip} rattachee(s) a un equipement` : ""}
          {report.errors > 0 ? ` — ${report.errors} erreur(s)` : ""}.
        </p>
      )}

      {rows.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">
              {rows.length} fichier(s) — verifie le tri{unassigned > 0 ? ` (${unassigned} sans lot)` : ""} :
            </p>
            <div className="flex gap-2">
              <button onClick={() => setRows([])} className="text-sm px-3 py-1.5 rounded-md border border-slate-300">
                Annuler
              </button>
              <button onClick={createAll} disabled={busy} className="bg-brand-600 text-white text-sm px-4 py-1.5 rounded-md disabled:opacity-50">
                {busy ? `Creation... (${rows.length})` : `Creer ${rows.length} fiche(s)`}
              </button>
            </div>
          </div>
          <div className="overflow-x-auto max-h-80 overflow-y-auto">
            <table className="w-full text-xs min-w-[640px]">
              <thead>
                <tr className="text-left text-slate-400 sticky top-0 bg-amber-50">
                  <th className="px-2 py-1">Fichier</th>
                  <th className="px-2 py-1">Nom de la fiche</th>
                  <th className="px-2 py-1">Lot</th>
                  <th className="px-2 py-1">Deviné via</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className={`border-t border-amber-100 ${!r.lotId ? "bg-red-50" : ""}`}>
                    <td className="px-2 py-1 max-w-[180px] truncate text-slate-500" title={r.fileName}>{r.fileName}</td>
                    <td className="px-2 py-1">
                      <input
                        value={r.name}
                        onChange={(e) => setRows(rows.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)))}
                        className="border border-slate-300 rounded px-1 py-0.5 w-full min-w-[140px]"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <select
                        value={r.lotId}
                        onChange={(e) => setRows(rows.map((x, k) => (k === i ? { ...x, lotId: e.target.value, via: "manuel" } : x)))}
                        className={`border rounded px-1 py-0.5 ${r.lotId ? "border-slate-300" : "border-red-400"}`}
                      >
                        <option value="">Sans lot ?</option>
                        {lots.map((l) => (
                          <option key={l.id} value={l.id}>{l.code}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-1 text-slate-400">{r.via || "non reconnu"}</td>
                    <td className="px-1">
                      <button onClick={() => setRows(rows.filter((_, k) => k !== i))} className="text-slate-400 hover:text-red-500">✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

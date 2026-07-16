// Dossier as-built COMPLET du projet, en un seul PDF a remettre au client :
// page de garde, synthese des pieces manquantes, documents transverses, puis un chapitre
// par lot (checklist DIU, inventaire equipements + plan de maintenance, fiches logements,
// documents fusionnes). Reutilise le moteur du DIU (Writer) et buildDiuData par lot.
const { PDFDocument, StandardFonts } = require("pdf-lib");
const { Writer, safe, A4, MARGIN, DARK, GRAY, RED, GREEN } = require("./diuPdf");

const DAY_MS = 24 * 60 * 60 * 1000;

// dius : [{ diu (buildDiuData), lot }] dans l'ordre des lots
// transverseDocs : documents sans lot ; readFile : loader base+disque
async function buildAsbuiltPdf({ project, dius, transverseDocs, readFile }) {
  const doc = await PDFDocument.create();
  const fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  };
  const w = new Writer(doc, fonts);
  let merged = 0;
  let failures = 0;
  let attachments = 0;

  const mergeDoc = async (d, headerTitle) => {
    const isPdf = d.fileUrl && /\.pdf$/i.test(d.fileUrl);
    if (!isPdf) return;
    attachments += 1;
    try {
      const bytes = await readFile(d.fileUrl);
      if (!bytes) throw new Error("introuvable");
      const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const header = doc.addPage(A4);
      header.drawText(safe(headerTitle), { x: MARGIN, y: 520, size: 10, font: fonts.regular, color: GRAY });
      header.drawText(safe(d.name), { x: MARGIN, y: 500, size: 13, font: fonts.bold, color: DARK });
      const pages = await doc.copyPages(src, src.getPageIndices());
      for (const p of pages) doc.addPage(p);
      merged += 1;
    } catch {
      failures += 1;
    }
  };

  // ---- Page de garde ----
  const cover = w.newPage();
  cover.drawText("KARNO srl", { x: MARGIN, y: 770, size: 12, font: fonts.bold, color: GRAY });
  cover.drawText("Dossier As-Built", { x: MARGIN, y: 640, size: 30, font: fonts.bold, color: DARK });
  cover.drawText(safe("Dossier des ouvrages executes & d'intervention ulterieure"), { x: MARGIN, y: 608, size: 13, font: fonts.regular, color: GRAY });
  cover.drawText(safe(project.name), { x: MARGIN, y: 550, size: 18, font: fonts.bold, color: DARK });
  if (project.description) cover.drawText(safe(project.description).slice(0, 90), { x: MARGIN, y: 526, size: 10, font: fonts.regular, color: GRAY });
  const totalMissing = dius.reduce((s, { diu }) => s + diu.required.filter((r) => r.status !== "OK").length, 0);
  cover.drawText(safe(`Genere le ${new Date().toLocaleDateString("fr-FR")} — ${dius.length} lots`), { x: MARGIN, y: 100, size: 10, font: fonts.regular, color: GRAY });
  cover.drawText(
    totalMissing === 0 ? "Dossier complet : toutes les pieces attendues sont presentes." : `${totalMissing} piece(s) attendue(s) manquante(s) ou sans fichier — voir synthese page suivante.`,
    { x: MARGIN, y: 82, size: 10, font: fonts.bold, color: totalMissing === 0 ? GREEN : RED }
  );

  // ---- Synthese des manquants ----
  w.newPage();
  w.heading("Synthese de completude");
  for (const { diu } of dius) {
    const missing = diu.required.filter((r) => r.status !== "OK");
    if (diu.completeness === null && missing.length === 0) continue;
    w.text(`${diu.lot.code} - ${diu.lot.name} : ${diu.completeness === null ? "pas de checklist" : diu.completeness + " %"}`, {
      bold: true,
      color: missing.length === 0 ? GREEN : DARK,
    });
    for (const r of missing) {
      w.text(`- ${r.label} [${r.status === "MANQUANT" ? "manquant" : "fiche sans fichier"}]`, { indent: 12, size: 9, color: RED, gap: 3 });
    }
    w.space(4);
  }
  const orphanTransverse = transverseDocs.filter((d) => !d.fileUrl);
  if (orphanTransverse.length) {
    w.text("Documents generaux sans fichier :", { bold: true });
    for (const d of orphanTransverse) w.text(`- ${d.name}`, { indent: 12, size: 9, color: RED, gap: 3 });
  }

  // ---- Documents transverses ----
  if (transverseDocs.length) {
    w.heading("Documents generaux du projet");
    for (const d of transverseDocs) {
      const isPdf = d.fileUrl && /\.pdf$/i.test(d.fileUrl);
      w.text(`- ${d.name}${!d.fileUrl ? "  [fichier non joint]" : !isPdf ? "  [non PDF - fourni separement]" : ""}`, {
        indent: 6,
        size: 10,
        color: d.fileUrl ? DARK : RED,
        gap: 3,
      });
    }
    for (const d of transverseDocs) await mergeDoc(d, "Documents generaux du projet");
  }

  // ---- Chapitres par lot ----
  for (const { diu } of dius) {
    // page de chapitre
    const chap = doc.addPage(A4);
    chap.drawText(safe(`${diu.lot.code}`), { x: MARGIN, y: 560, size: 34, font: fonts.bold, color: DARK });
    chap.drawText(safe(diu.lot.name), { x: MARGIN, y: 524, size: 16, font: fonts.regular, color: DARK });
    if (diu.subcontractor) chap.drawText(safe(`Entreprise : ${diu.subcontractor.name}`), { x: MARGIN, y: 496, size: 11, font: fonts.regular, color: GRAY });
    if (diu.completeness !== null)
      chap.drawText(safe(`Completude : ${diu.completeness} %`), { x: MARGIN, y: 474, size: 11, font: fonts.bold, color: diu.completeness >= 100 ? GREEN : RED });

    w.page = null; // force une nouvelle page de contenu apres le chapitre
    w.newPage();

    if (diu.required.length) {
      w.heading(`${diu.lot.code} — Pieces attendues`);
      for (const r of diu.required) {
        const mark = r.status === "OK" ? "[OK]" : r.status === "SANS_FICHIER" ? "[SANS FICHIER]" : "[MANQUANT]";
        w.text(`${mark}  ${r.label}`, { color: r.status === "OK" ? GREEN : r.status === "MANQUANT" ? RED : GRAY, bold: r.status !== "OK" });
      }
    }

    if (diu.equipments.length) {
      w.heading(`${diu.lot.code} — Equipements et plan de maintenance`);
      for (const e of diu.equipments) {
        w.text(`${e.name}${e.quantity > 1 ? ` (x${e.quantity})` : ""}`, { bold: true });
        const meta = [e.manufacturer, e.category, e.location].filter(Boolean).join(" - ");
        if (meta) w.text(meta, { indent: 12, size: 9, color: GRAY });
        for (const s of e.specs || []) w.text(`${s.label}${s.label && s.value ? " : " : ""}${s.value}`, { indent: 12, size: 9 });
        if (e.maintenanceIntervalDays) {
          const next = e.lastMaintenanceDate
            ? new Date(new Date(e.lastMaintenanceDate).getTime() + e.maintenanceIntervalDays * DAY_MS)
            : null;
          w.text(
            `Entretien : tous les ${e.maintenanceIntervalDays} jours${e.lastMaintenanceDate ? ` — dernier le ${new Date(e.lastMaintenanceDate).toLocaleDateString("fr-FR")}` : " — jamais realise"}${next ? ` — prochain le ${next.toLocaleDateString("fr-FR")}` : ""}`,
            { indent: 12, size: 9, color: GRAY }
          );
        }
        w.space(4);
      }
    }

    if (diu.units.length) {
      w.heading(`${diu.lot.code} — Fiches d'identification par logement`);
      for (const u of diu.units) {
        const specsTxt = (u.specs || []).map((s) => `${s.label}${s.label && s.value ? ": " : ""}${s.value}`).join("  |  ");
        w.text(u.name, { bold: true });
        if (specsTxt) w.text(specsTxt, { indent: 12, size: 8, color: GRAY, gap: 3 });
        w.space(2);
      }
    }

    w.heading(`${diu.lot.code} — Documents`);
    for (const section of diu.sections) {
      if (!section.docs.length) continue;
      w.text(section.title, { bold: true });
      for (const d of section.docs) {
        const isPdf = d.fileUrl && /\.pdf$/i.test(d.fileUrl);
        w.text(`- ${d.name}${!d.fileUrl ? "  [fichier non joint]" : !isPdf ? "  [non PDF]" : ""}`, { indent: 12, size: 9, color: d.fileUrl ? DARK : RED, gap: 3 });
      }
    }
    for (const section of diu.sections) {
      for (const d of section.docs) await mergeDoc(d, `${diu.lot.code} — ${section.title}`);
    }
  }

  return { bytes: await doc.save(), merged, failures, attachments };
}

module.exports = { buildAsbuiltPdf };

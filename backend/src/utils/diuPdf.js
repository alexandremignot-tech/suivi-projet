// Assemble le DIU d'un lot en un seul PDF : page de garde, mentions legales,
// checklist de completude, inventaires (equipements / maisons), sommaire,
// puis fusion de tous les documents PDF joints, section par section.
const fs = require("fs");
const path = require("path");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

const A4 = [595.28, 841.89];
const MARGIN = 50;
const DARK = rgb(0.12, 0.16, 0.22);
const GRAY = rgb(0.45, 0.5, 0.55);
const RED = rgb(0.8, 0.15, 0.15);
const GREEN = rgb(0.1, 0.55, 0.3);

// Remplace les caracteres hors Latin-1 (non supportes par les polices standard PDF)
function safe(text) {
  return String(text ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/[^\x20-\xff\n]/g, "?");
}

function wrap(text, font, size, maxWidth) {
  const words = safe(text).split(/\s+/);
  const lines = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(test, size) > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

class Writer {
  constructor(doc, fonts) {
    this.doc = doc;
    this.fonts = fonts;
    this.page = null;
    this.y = 0;
  }
  newPage() {
    this.page = this.doc.addPage(A4);
    this.y = A4[1] - MARGIN;
    return this.page;
  }
  ensure(height) {
    if (!this.page || this.y - height < MARGIN) this.newPage();
  }
  text(str, { size = 10, bold = false, color = DARK, indent = 0, gap = 4 } = {}) {
    const font = bold ? this.fonts.bold : this.fonts.regular;
    const maxWidth = A4[0] - 2 * MARGIN - indent;
    for (const line of wrap(str, font, size, maxWidth)) {
      this.ensure(size + gap);
      this.page.drawText(line, { x: MARGIN + indent, y: this.y - size, size, font, color });
      this.y -= size + gap;
    }
  }
  space(h = 10) {
    this.y -= h;
  }
  heading(str) {
    this.ensure(40);
    this.space(14);
    this.text(str, { size: 14, bold: true });
    this.ensure(8);
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: A4[0] - MARGIN, y: this.y },
      thickness: 0.8,
      color: GRAY,
    });
    this.space(10);
  }
}

async function buildDiuPdf(diu, uploadDir) {
  const doc = await PDFDocument.create();
  const fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  };
  const w = new Writer(doc, fonts);

  // ---- Page de garde ----
  const cover = w.newPage();
  cover.drawText("KARNO srl", { x: MARGIN, y: 770, size: 12, font: fonts.bold, color: GRAY });
  cover.drawText(safe("Dossier d'Intervention Ulterieure"), { x: MARGIN, y: 640, size: 26, font: fonts.bold, color: DARK });
  cover.drawText(safe("(DIU / dossier as-built)"), { x: MARGIN, y: 612, size: 14, font: fonts.regular, color: GRAY });
  cover.drawText(safe(diu.project.name), { x: MARGIN, y: 550, size: 18, font: fonts.bold, color: DARK });
  cover.drawText(safe(`Lot ${diu.lot.code} - ${diu.lot.name}`), { x: MARGIN, y: 522, size: 16, font: fonts.regular, color: DARK });
  if (diu.subcontractor) {
    cover.drawText(safe(`Entreprise executante : ${diu.subcontractor.name}`), { x: MARGIN, y: 490, size: 11, font: fonts.regular, color: GRAY });
  }
  cover.drawText(safe(`Genere le ${new Date().toLocaleDateString("fr-FR")}`), { x: MARGIN, y: 100, size: 10, font: fonts.regular, color: GRAY });
  if (diu.completeness !== null) {
    cover.drawText(safe(`Completude des pieces attendues : ${diu.completeness} %`), {
      x: MARGIN,
      y: 82,
      size: 10,
      font: fonts.bold,
      color: diu.completeness >= 100 ? GREEN : RED,
    });
  }

  // ---- Mentions legales ----
  w.newPage();
  w.heading("Avertissements et base legale");
  for (const line of diu.legalNotice) w.text(line, { size: 10, gap: 5 });

  // ---- Identification et contacts ----
  w.heading("Identification et intervenants");
  w.text(`Projet : ${diu.project.name}`, { bold: true });
  if (diu.project.description) w.text(diu.project.description, { color: GRAY });
  w.space(6);
  w.text(`Lot : ${diu.lot.code} - ${diu.lot.name}`, { bold: true });
  if (diu.subcontractor) {
    const s = diu.subcontractor;
    w.text(`Entreprise : ${s.name}${s.specialty ? ` (${s.specialty})` : ""}`);
    if (s.contactName) w.text(`Contact : ${s.contactName}`, { indent: 12 });
    if (s.phone) w.text(`Telephone : ${s.phone}`, { indent: 12 });
    if (s.email) w.text(`Email : ${s.email}`, { indent: 12 });
  }
  w.text("Maitre d'oeuvre / exploitant reseau : KARNO srl");

  // ---- Checklist de completude ----
  if (diu.required.length) {
    w.heading("Pieces attendues pour ce lot (checklist DIU)");
    for (const r of diu.required) {
      const mark = r.status === "OK" ? "[OK]" : r.status === "SANS_FICHIER" ? "[SANS FICHIER]" : "[MANQUANT]";
      w.text(`${mark}  ${r.label}`, {
        color: r.status === "OK" ? GREEN : r.status === "MANQUANT" ? RED : GRAY,
        bold: r.status !== "OK",
      });
      for (const d of r.docs) w.text(`- ${d.name}`, { indent: 16, size: 9, color: GRAY });
    }
  }

  // ---- Inventaire des equipements ----
  if (diu.equipments.length) {
    w.heading("Inventaire des equipements installes");
    for (const e of diu.equipments) {
      w.text(`${e.name}${e.quantity > 1 ? ` (x${e.quantity})` : ""}`, { bold: true });
      const meta = [e.manufacturer, e.category, e.location].filter(Boolean).join(" - ");
      if (meta) w.text(meta, { indent: 12, size: 9, color: GRAY });
      for (const s of e.specs || []) w.text(`${s.label}${s.label && s.value ? " : " : ""}${s.value}`, { indent: 12, size: 9 });
      if (e.maintenanceIntervalDays) {
        w.text(`Entretien : tous les ${e.maintenanceIntervalDays} jours`, { indent: 12, size: 9, color: GRAY });
      }
      w.space(4);
    }
  }

  // ---- Fiches par unite (maisons BB5) ----
  if (diu.units.length) {
    w.heading("Fiches d'identification par logement");
    for (const u of diu.units) {
      const specsTxt = (u.specs || []).map((s) => `${s.label}${s.label && s.value ? ": " : ""}${s.value}`).join("  |  ");
      w.text(u.name, { bold: true });
      if (specsTxt) w.text(specsTxt, { indent: 12, size: 8, color: GRAY, gap: 3 });
      w.space(2);
    }
  }

  // ---- Sommaire des documents ----
  w.heading("Sommaire des documents annexes");
  const attachments = [];
  for (const section of diu.sections) {
    if (!section.docs.length) continue;
    w.text(section.title, { bold: true });
    for (const d of section.docs) {
      const isPdf = d.fileUrl && /\.pdf$/i.test(d.fileUrl);
      const note = !d.fileUrl ? "  [fichier non joint]" : !isPdf ? "  [non PDF - fourni separement]" : "";
      w.text(`- ${d.name}${note}`, { indent: 12, size: 9, color: note ? RED : DARK, gap: 3 });
      if (isPdf) attachments.push({ section: section.title, doc: d });
    }
    w.space(4);
  }

  // ---- Fusion des documents PDF joints ----
  let merged = 0;
  const failures = [];
  let currentSection = null;
  for (const { section, doc: d } of attachments) {
    try {
      const filePath = path.join(uploadDir, path.basename(d.fileUrl));
      const bytes = fs.readFileSync(filePath);
      const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
      if (section !== currentSection) {
        currentSection = section;
        const divider = doc.addPage(A4);
        divider.drawText(safe(section), { x: MARGIN, y: 500, size: 20, font: fonts.bold, color: DARK });
        divider.drawText(safe(`${diu.lot.code} - ${diu.lot.name}`), { x: MARGIN, y: 472, size: 11, font: fonts.regular, color: GRAY });
      }
      const header = doc.addPage(A4);
      header.drawText(safe(d.name), { x: MARGIN, y: 500, size: 13, font: fonts.bold, color: DARK });
      header.drawText(safe(d.fileName || ""), { x: MARGIN, y: 480, size: 9, font: fonts.regular, color: GRAY });
      const pages = await doc.copyPages(src, src.getPageIndices());
      for (const p of pages) doc.addPage(p);
      merged += 1;
    } catch (e) {
      failures.push({ name: d.name, error: e.message });
    }
  }

  if (failures.length) {
    w.newPage();
    w.heading("Documents non fusionnables");
    for (const f of failures) w.text(`- ${f.name} (${f.error})`, { size: 9, color: RED });
  }

  return { bytes: await doc.save(), merged, failures: failures.length, attachments: attachments.length };
}

module.exports = { buildDiuPdf };

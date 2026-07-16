// Rendu Word (.docx) du contrat ponctuel de sous-entreprise KARNO.
// Mise en page calquee sur le template V4 : page de garde, parties ENTRE/ET,
// sections numerotees, signatures. Le document reste entierement editable dans Word.
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
} = require("docx");
const { SECTIONS } = require("./contractClauses");

const FONT = "Calibri";

function run(text, opts = {}) {
  return new TextRun({ text, font: FONT, size: opts.size || 21, bold: opts.bold, color: opts.color, italics: opts.italics });
}

function para(text, opts = {}) {
  return new Paragraph({
    children: [run(text, opts)],
    spacing: { after: opts.after ?? 120 },
    alignment: opts.align,
    bullet: opts.bullet ? { level: 0 } : undefined,
  });
}

function renderBlock(b, sectionNumber) {
  if (b.type === "h2")
    return new Paragraph({ children: [run(b.text, { bold: true, size: 26 })], spacing: { before: 300, after: 160 } });
  if (b.type === "h3")
    return new Paragraph({ children: [run(b.text, { bold: true, size: 22 })], spacing: { before: 200, after: 100 } });
  if (b.type === "li") return para(b.text, { bullet: true, after: 60 });
  return para(b.text);
}

function noBorders() {
  const none = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  return { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: none };
}

function partyCell(lines) {
  return new TableCell({
    width: { size: 50, type: WidthType.PERCENTAGE },
    children: lines.map((l) => para(l.text, { bold: l.bold, size: l.size || 20, after: 40 })),
  });
}

async function buildContractDocx(c) {
  const children = [];

  // ---- Page de garde ----
  children.push(
    new Paragraph({ children: [run("Contrat ponctuel de Sous-Entreprise", { bold: true, size: 40 })], spacing: { before: 1200, after: 200 }, alignment: AlignmentType.CENTER }),
    new Paragraph({ children: [run(c.contratTitre || c.chantierRef, { size: 28 })], spacing: { after: 600 }, alignment: AlignmentType.CENTER }),
    new Paragraph({ children: [run(`Réf. ${c.chantierRef}`, { size: 22, color: "666666" })], alignment: AlignmentType.CENTER, spacing: { after: 1200 } }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: noBorders(),
      rows: [
        new TableRow({
          children: [
            partyCell([
              { text: "Personne de contact", bold: true },
              { text: c.contactPrincipal?.nom || "" },
              { text: c.contactPrincipal?.role || "" },
              { text: c.contactPrincipal?.email || "" },
              { text: c.contactPrincipal?.gsm || "" },
            ]),
            partyCell([
              { text: "Karno SRL", bold: true },
              { text: "N° d'entreprise : 0774.713.759" },
              { text: "Rue David van Bever, 39" },
              { text: "1150 Woluwe-Saint-Pierre" },
              { text: "info@karno.energy" },
            ]),
          ],
        }),
      ],
    }),
    new Paragraph({ children: [], pageBreakBefore: true })
  );

  // ---- Parties ----
  children.push(
    para("ENTRE", { bold: true, size: 24, after: 160 }),
    para(
      `La SRL KARNO, ayant son siège social à Rue David van Bever, 39, 1150 Woluwe-Saint-Pierre, inscrite à la B.C.E. sous le numéro 0774.713.759, représentée en tant qu'administrateur par Monsieur Grégory Meys.`
    ),
    para(`Ci-après dénommée « Karno », intervenant en qualité de développeur de réseau de chaleur.`, { italics: true }),
    para("ET", { bold: true, size: 24, after: 160 }),
    para(
      `${c.stForme ? `La ${c.stForme} ` : ""}${c.stNom}, dont le siège social se situe à ${c.stSiege || "..............."}, inscrite à la B.C.E. sous le numéro ${c.stBce || "..............."}${c.stSpecialite ? `, spécialisée en ${c.stSpecialite}` : ""}, représentée par ${c.stRep || "..............."}.`
    ),
    ...(c.stContact?.nom
      ? [para(`Personne de contact : ${c.stContact.nom}${c.stContact.role ? ` — ${c.stContact.role}` : ""}${c.stContact.email ? ` — ${c.stContact.email}` : ""}${c.stContact.gsm ? ` — ${c.stContact.gsm}` : ""}`)]
      : []),
    para(`Ci-après dénommé(e) le « Sous-traitant ».`, { italics: true }),
    para("", { after: 200 })
  );

  // ---- Sections ----
  let num = 0;
  for (const section of SECTIONS) {
    if (section.optional && !(c.sections || {})[section.id]) continue;
    num += 1;
    children.push(
      new Paragraph({
        children: [run(`${num}. ${section.title.toUpperCase()}`, { bold: true, size: 26 })],
        spacing: { before: 360, after: 160 },
      })
    );
    for (const block of section.render(c)) children.push(renderBlock(block, num));
  }

  // ---- Signatures ----
  children.push(
    new Paragraph({ children: [], spacing: { before: 600 } }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: noBorders(),
      rows: [
        new TableRow({
          children: [
            partyCell([
              { text: "Pour Karno,", bold: true },
              { text: "Grégory Meys — Administrateur" },
              { text: " " },
              { text: " " },
              { text: "(signature précédée de la mention « lu et approuvé »)", size: 16 },
            ]),
            partyCell([
              { text: "Pour le Sous-traitant,", bold: true },
              { text: `${c.stRep || ""}${c.stNom ? ` — ${c.stNom}` : ""}` },
              { text: " " },
              { text: " " },
              { text: "(signature précédée de la mention « lu et approuvé »)", size: 16 },
            ]),
          ],
        }),
      ],
    })
  );

  const doc = new Document({
    creator: "Karno - Suivi de projet",
    title: `Contrat de sous-traitance - ${c.chantierRef}`,
    styles: { default: { document: { run: { font: FONT, size: 21 } } } },
    sections: [
      {
        properties: {},
        headers: {},
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}

module.exports = { buildContractDocx };

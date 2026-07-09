// Conversion .docx -> .pdf fidele au document Word (mise en forme, polices embarquees, mise en
// page) via LibreOffice headless (binaire "soffice", installe dans l'image Docker du backend,
// voir Dockerfile). Les polices utilisees par les templates KARNO (ex: Raleway) sont deja
// embarquees dans les .docx eux-memes : aucune police supplementaire n'a besoin d'etre installee
// sur le serveur, LibreOffice les lit directement depuis le fichier.
//
// Chaque conversion utilise un dossier de travail et un profil LibreOffice temporaires et
// uniques (via -env:UserInstallation) pour que des conversions concurrentes ne se marchent pas
// dessus (LibreOffice verrouille son profil utilisateur pendant qu'il tourne).

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");

const SOFFICE_BIN = process.env.SOFFICE_BIN || "soffice";
const CONVERT_TIMEOUT_MS = 45000;

function run(bin, args, opts) {
  return new Promise((resolve, reject) => {
    execFile(bin, args, opts, (err, stdout, stderr) => {
      if (err) {
        err.stdout = stdout;
        err.stderr = stderr;
        return reject(err);
      }
      resolve({ stdout, stderr });
    });
  });
}

// Convertit un Buffer .docx en Buffer .pdf. Leve une erreur explicite si LibreOffice n'est pas
// installe (ex: environnement de dev local sans Docker) ou si la conversion echoue/expire.
async function convertDocxBufferToPdf(docxBuffer) {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "docx2pdf-"));
  const profileDir = path.join(workDir, "profile");
  const inputPath = path.join(workDir, "input.docx");
  const outputPath = path.join(workDir, "input.pdf");

  try {
    fs.writeFileSync(inputPath, docxBuffer);

    await run(
      SOFFICE_BIN,
      [
        "--headless",
        "--norestore",
        `-env:UserInstallation=file://${profileDir}`,
        "--convert-to",
        "pdf",
        "--outdir",
        workDir,
        inputPath,
      ],
      { timeout: CONVERT_TIMEOUT_MS }
    );

    if (!fs.existsSync(outputPath)) {
      throw new Error("La conversion LibreOffice n'a produit aucun fichier PDF.");
    }
    return fs.readFileSync(outputPath);
  } catch (err) {
    if (err.code === "ENOENT") {
      throw new Error(
        "LibreOffice (soffice) est introuvable sur ce serveur : la conversion PDF n'est disponible qu'en production (image Docker avec libreoffice-writer installe)."
      );
    }
    throw err;
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

module.exports = { convertDocxBufferToPdf };

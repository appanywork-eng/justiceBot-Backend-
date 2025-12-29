import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";

export async function generatePDF(petitionText, sector = "petition") {
  // Ensure backups folder exists
  const dir = path.resolve("backups");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const filePath = path.join(dir, `${sector}-petition-${Date.now()}.pdf`);

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: 50 });
      const stream = fs.createWriteStream(filePath);

      doc.pipe(stream);

      doc.fontSize(16).text(`JusticeBot Petition`, { align: "center" });
      doc.moveDown(0.5);
      doc.fontSize(10).text(`Sector: ${sector}`, { align: "center" });
      doc.moveDown(1);

      doc.fontSize(11).text(petitionText || "", {
        align: "left",
        lineGap: 4
      });

      doc.end();

      stream.on("finish", () => resolve(filePath));
      stream.on("error", reject);
    } catch (e) {
      reject(e);
    }
  });
}

const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

// Fills a template PDF's AcroForm text fields with `fields` (key -> string),
// flattens it, and returns the filled PDF bytes. If the template has no
// matching form fields, `fields` are silently ignored for that key.
async function fillTemplate(templateBytes, fields = {}) {
  const pdfDoc = await PDFDocument.load(templateBytes);
  const form = pdfDoc.getForm();

  for (const [key, value] of Object.entries(fields)) {
    try {
      const field = form.getTextField(key);
      field.setText(value == null ? "" : String(value));
    } catch {
      // No form field with this name on the template; skip it.
    }
  }

  form.flatten();
  return pdfDoc.save();
}

// Draws the captured signature image and signer name/date onto the last page
// of a filled PDF and returns the signed PDF bytes.
async function embedSignature(filledPdfBytes, { signatureDataUrl, signerName, signedAt }) {
  const pdfDoc = await PDFDocument.load(filledPdfBytes);
  const pages = pdfDoc.getPages();
  const page = pages[pages.length - 1];

  const isPng = signatureDataUrl.startsWith("data:image/png");
  const base64 = signatureDataUrl.split(",")[1];
  const imageBytes = Buffer.from(base64, "base64");
  const image = isPng ? await pdfDoc.embedPng(imageBytes) : await pdfDoc.embedJpg(imageBytes);

  const sigWidth = 160;
  const sigHeight = (image.height / image.width) * sigWidth;
  const marginX = 50;
  const marginY = 60;

  page.drawImage(image, {
    x: marginX,
    y: marginY,
    width: sigWidth,
    height: sigHeight,
  });

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  page.drawText(`Signed by: ${signerName}`, {
    x: marginX,
    y: marginY - 14,
    size: 9,
    font,
    color: rgb(0.13, 0.11, 0.1),
  });
  page.drawText(`Date: ${new Date(signedAt).toISOString()}`, {
    x: marginX,
    y: marginY - 26,
    size: 9,
    font,
    color: rgb(0.13, 0.11, 0.1),
  });

  return pdfDoc.save();
}

module.exports = { fillTemplate, embedSignature };

import mammoth from "mammoth";
import pdfParse from "pdf-parse";

export async function extractResumeText(file: File) {
  const buffer = Buffer.from(await file.arrayBuffer());
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  if (type.includes("pdf") || name.endsWith(".pdf")) {
    return (await pdfParse(buffer)).text;
  }
  if (type.includes("word") || name.endsWith(".docx")) {
    return (await mammoth.extractRawText({ buffer })).value;
  }
  return buffer.toString("utf8");
}

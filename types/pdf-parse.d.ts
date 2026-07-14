declare module "pdf-parse" {
  type PdfData = { text: string; [key: string]: unknown };
  function pdfParse(buffer: Buffer): Promise<PdfData>;
  export default pdfParse;
}

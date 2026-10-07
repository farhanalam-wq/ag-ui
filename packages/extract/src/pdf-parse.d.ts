declare module "pdf-parse" {
  interface PDFInfo {
    Title?: string;
    [key: string]: unknown;
  }
  interface PDFResult {
    text: string;
    info?: PDFInfo;
    numpages: number;
  }
  function pdfParse(data: Buffer | Uint8Array): Promise<PDFResult>;
  export default pdfParse;
}

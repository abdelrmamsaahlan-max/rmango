import "server-only";
import JSZip from "jszip";
import mammoth from "mammoth";

const MAX_PDF_PAGES = 25;
const MAX_DOCUMENT_TEXT_CHARS = 60_000;
const MAX_DOCX_UNCOMPRESSED_BYTES = 25 * 1024 * 1024;
const MAX_DOCX_ENTRIES = 256;

export type SupportedDocument = "pdf" | "docx";

export type ExtractedDocument = {
  kind: SupportedDocument;
  text: string;
  pages?: number;
  truncated: boolean;
};

function normalizeExtractedText(value: string) {
  return value
    .replace(/\u0000/g, "")
    .replace(/[\t ]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function capText(value: string) {
  const normalized = normalizeExtractedText(value);
  return {
    text: normalized.slice(0, MAX_DOCUMENT_TEXT_CHARS),
    truncated: normalized.length > MAX_DOCUMENT_TEXT_CHARS,
  };
}

export async function extractSupportedDocument(
  fileName: string,
  mimeType: string,
  input: Buffer,
): Promise<ExtractedDocument> {
  const extension = fileName.toLowerCase().split(".").pop();
  if (input.byteLength === 0) throw new Error("The document is empty.");
  if (input.byteLength > 5 * 1024 * 1024) throw new Error("PDF and DOCX attachments must be 5 MB or smaller.");

  if (extension === "pdf" || mimeType === "application/pdf") {
    if (input.subarray(0, 5).toString("ascii") !== "%PDF-") {
      throw new Error("This file does not have a valid PDF signature.");
    }

    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(input),
      useSystemFonts: true,
      stopAtErrors: false,
      verbosity: 0,
    });
    const document = await loadingTask.promise;
    try {
      if (document.numPages > MAX_PDF_PAGES) {
        throw new Error("PDF attachments are limited to 25 pages per file.");
      }

      const pageTexts: string[] = [];
      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
        const page = await document.getPage(pageNumber);
        const content = await page.getTextContent();
        const text = content.items
          .map(item => "str" in item && typeof item.str === "string" ? item.str : "")
          .filter(Boolean)
          .join(" ");
        pageTexts.push(`[Page ${pageNumber}]\n${text}`);
        page.cleanup();
      }

      const result = capText(pageTexts.join("\n\n"));
      if (!result.text) {
        throw new Error("No selectable text was found in this PDF. It may be scanned; attach screenshots of the relevant pages instead.");
      }
      return { kind: "pdf", text: result.text, pages: document.numPages, truncated: result.truncated };
    } finally {
      await document.destroy();
    }
  }

  if (extension === "docx" || mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    if (input[0] !== 0x50 || input[1] !== 0x4b) {
      throw new Error("This file does not have a valid DOCX archive signature.");
    }

    // Inspect the package directory before asking Mammoth to extract text.
    // This limits zip-bomb exposure and rejects oversized Office packages.
    const zip = await JSZip.loadAsync(input, { checkCRC32: false });
    const entries = Object.values(zip.files).filter(entry => !entry.dir);
    if (entries.length > MAX_DOCX_ENTRIES) {
      throw new Error("DOCX attachments contain too many archive entries.");
    }
    const totalUncompressed = entries.reduce((sum, entry) => {
      const size = (entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize || 0;
      return sum + size;
    }, 0);
    if (totalUncompressed > MAX_DOCX_UNCOMPRESSED_BYTES) {
      throw new Error("The DOCX expands beyond the safe 25 MB extraction limit.");
    }
    if (!zip.file("word/document.xml")) {
      throw new Error("The DOCX package is missing its main document content.");
    }

    const extracted = await mammoth.extractRawText({ buffer: input });
    const result = capText(extracted.value || "");
    if (!result.text) throw new Error("No readable text was found in this DOCX.");
    return { kind: "docx", text: result.text, truncated: result.truncated };
  }

  throw new Error("Unsupported document type. Attach a PDF, DOCX, image or supported text/code file.");
}

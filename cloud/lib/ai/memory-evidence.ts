import { createHash } from "node:crypto";

export type MemoryEvidenceInput = {
  relativePath: string;
  sizeBytes: number;
  indexedSha256: string | null;
  sourceText: string;
  evidenceSnippet: string;
};

export type MemoryEvidenceResult =
  | {
      ok: true;
      sourceRef: string;
      fileSha256: string;
      snippetSha256: string;
      verificationStatus: "excerpt_present";
      provenance: "source_excerpt";
      confidence: "source_excerpt_present";
    }
  | {
      ok: false;
      reason:
        | "unsupported_file"
        | "source_too_large"
        | "invalid_snippet"
        | "source_hash_missing"
        | "source_hash_mismatch"
        | "excerpt_not_found";
    };

const TEXT_EXTENSIONS = new Set([
  ".lua", ".luau", ".txt", ".md", ".json", ".csv", ".xml", ".yaml", ".yml",
  ".toml", ".js", ".jsx", ".ts", ".tsx", ".css", ".html", ".py",
]);

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Verifies only that an exact excerpt is present in a bounded source file whose
 * bytes match its indexed SHA-256. This does NOT verify the semantic truth of
 * the memory's interpretation of that excerpt.
 */
export function validateMemoryEvidence(input: MemoryEvidenceInput): MemoryEvidenceResult {
  const extension = input.relativePath.slice(input.relativePath.lastIndexOf(".")).toLowerCase();
  if (!TEXT_EXTENSIONS.has(extension)) return { ok: false, reason: "unsupported_file" };
  if (!Number.isSafeInteger(input.sizeBytes) || input.sizeBytes < 0 || input.sizeBytes > 512_000) {
    return { ok: false, reason: "source_too_large" };
  }
  const snippet = input.evidenceSnippet.trim();
  if (snippet.length < 20 || snippet.length > 1_000) {
    return { ok: false, reason: "invalid_snippet" };
  }
  if (!input.indexedSha256 || !/^[a-f0-9]{64}$/i.test(input.indexedSha256)) {
    return { ok: false, reason: "source_hash_missing" };
  }
  const bytes = Buffer.from(input.sourceText, "utf8");
  if (bytes.length > 512_000 || bytes.length !== input.sizeBytes) {
    return { ok: false, reason: "source_too_large" };
  }
  const fileHash = sha256(bytes);
  if (fileHash.toLowerCase() !== input.indexedSha256.toLowerCase()) {
    return { ok: false, reason: "source_hash_mismatch" };
  }
  if (!input.sourceText.includes(snippet)) return { ok: false, reason: "excerpt_not_found" };

  return {
    ok: true,
    sourceRef: input.relativePath.slice(0, 500),
    fileSha256: fileHash,
    snippetSha256: sha256(snippet),
    verificationStatus: "excerpt_present",
    provenance: "source_excerpt",
    confidence: "source_excerpt_present",
  };
}

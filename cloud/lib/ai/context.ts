import "server-only";

export type ContextMessage = {
  role: string;
  content: unknown;
};

export type ContextCompactionResult<T extends ContextMessage> = {
  messages: T[];
  removedMessageCount: number;
  estimatedInputTokens: number;
  maxInputTokens: number | null;
  fits: boolean;
};

/**
 * Count readable text only. Multimodal payloads (image bytes/URLs and other
 * binary parts) are intentionally excluded and must be accounted for by a
 * separate conservative reserve supplied by the caller.
 */
function readableMessageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  const chunks: string[] = [];
  for (const part of content) {
    if (!part || typeof part !== "object") continue;
    const value = part as Record<string, unknown>;
    if (value.type === "text" && typeof value.text === "string") {
      chunks.push(value.text);
    }
  }
  return chunks.join("\n");
}

/**
 * A deliberately conservative character-based estimate. It is not provider
 * tokenization and must always be labelled as an estimate in UI or telemetry.
 */
function estimateInputTokens(systemPrompt: string, messages: ContextMessage[], imageTokenReserve: number): number {
  const messageTextCharacters = messages.reduce(
    (sum, message) => sum + readableMessageText(message.content).length + 12,
    0,
  );
  const characters = systemPrompt.length + messageTextCharacters;
  return Math.max(1, Math.ceil((characters / 4) * 1.25)) + Math.max(0, imageTokenReserve);
}

/**
 * Removes the oldest complete user turn until the recent conversation fits.
 * The latest user turn is never discarded. If the system prompt/current turn
 * alone exceeds the usable window, returns fits=false rather than truncating it.
 */
export function compactMessagesToContextWindow<T extends ContextMessage>(input: {
  messages: T[];
  systemPrompt: string;
  contextWindowTokens: number;
  maxOutputTokens: number;
  imageTokenReserve?: number;
}): ContextCompactionResult<T> {
  const imageReserve = Math.max(0, Math.floor(input.imageTokenReserve || 0));
  const windowSize = Math.max(0, Math.floor(input.contextWindowTokens || 0));
  const outputReserve = Math.max(0, Math.floor(input.maxOutputTokens || 0));
  const safetyMargin = windowSize > 0 ? Math.max(512, Math.ceil(windowSize * 0.05)) : 0;
  const maxInputTokens = windowSize > 0
    ? Math.max(0, windowSize - outputReserve - safetyMargin)
    : null;

  let messages = input.messages.slice();
  let removedMessageCount = 0;
  let estimate = estimateInputTokens(input.systemPrompt, messages, imageReserve);

  if (maxInputTokens !== null) {
    while (estimate > maxInputTokens && messages.length > 1) {
      const nextUserTurn = messages.findIndex((message, index) => index > 0 && message.role === "user");
      if (nextUserTurn < 0) break;
      messages = messages.slice(nextUserTurn);
      removedMessageCount += nextUserTurn;
      estimate = estimateInputTokens(input.systemPrompt, messages, imageReserve);
    }
  }

  return {
    messages,
    removedMessageCount,
    estimatedInputTokens: estimate,
    maxInputTokens,
    fits: maxInputTokens === null || estimate <= maxInputTokens,
  };
}

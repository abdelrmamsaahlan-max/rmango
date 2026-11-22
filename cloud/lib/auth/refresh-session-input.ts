import { z } from "zod";

const refreshSessionInputSchema = z.object({
  refreshToken: z.string().min(20).max(4096),
});

export function parseRefreshSessionInput(value: unknown) {
  return refreshSessionInputSchema.safeParse(value);
}

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["@supabase/supabase-js", "pdfjs-dist", "mammoth"],
  outputFileTracingIncludes: {
    "/api/chat": ["./lib/ai/agent/*.md"],
  },
};

export default nextConfig;

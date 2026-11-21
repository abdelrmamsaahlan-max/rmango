import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["@supabase/supabase-js", "pdfjs-dist", "mammoth"],
};

export default nextConfig;

// Makes Workers AI and other Cloudflare bindings available during next dev.
initOpenNextCloudflareForDev();

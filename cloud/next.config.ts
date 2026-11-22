import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["@supabase/supabase-js", "pdfjs-dist", "mammoth"],
};

initOpenNextCloudflareForDev();

export default nextConfig;

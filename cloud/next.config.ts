import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["@supabase/supabase-js", "pdfjs-dist", "mammoth"],
};

export default nextConfig;

// The Cloudflare binding bridge is needed for the local next dev server only.
// Do not initialize Wrangler during CI/production builds: those builds do not
// need remote Cloudflare credentials just to compile the Worker bundle.
if (process.env.NODE_ENV === "development") {
  initOpenNextCloudflareForDev();
}

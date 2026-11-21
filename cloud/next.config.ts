import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["@supabase/supabase-js", "pdfjs-dist", "mammoth"],
};

export default nextConfig;

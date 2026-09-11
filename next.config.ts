import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: false,
  },
  // Next.js's output file tracing only bundles files it can see from the
  // import graph, so /api/admin/migrate's runtime fs.readdir of the
  // migrations folder (drizzle's migrator, not an import) would otherwise
  // go missing from the deployed serverless function. Remove this once that
  // route is removed (see its module comment).
  outputFileTracingIncludes: {
    "/api/admin/migrate": ["./src/db/migrations/**"],
  },
};

export default nextConfig;

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Bundles only the dependencies the server actually needs into .next/standalone —
  // the production Docker image copies that output rather than all of node_modules.
  output: "standalone",
  typescript: {
    // next build's own type-check otherwise sweeps in vitest.config.ts and *.test.ts
    // (tsconfig.json's broad include), which need vitest's types — a real devDependency
    // that correctly stays out of a production install. `npm run typecheck` still
    // covers those files via the unrestricted root tsconfig.json; this only narrows
    // what the production build itself needs to type-check.
    tsconfigPath: "./tsconfig.build.json",
  },
};

export default nextConfig;

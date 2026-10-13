/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Bundles only the dependencies the server actually needs into .next/standalone —
  // the production Docker image copies that output rather than all of node_modules.
  output: "standalone",
};

export default nextConfig;

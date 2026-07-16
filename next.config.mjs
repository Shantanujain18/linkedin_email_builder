/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["postgres", "drizzle-orm"],
  experimental: {
    serverActions: { bodySizeLimit: "15mb" }
  }
};

export default nextConfig;

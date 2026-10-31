import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // binarios nativos de Turso/libSQL no deben empaquetarse (Vercel)
  serverExternalPackages: ["@libsql/client", "libsql"],
};

export default nextConfig;

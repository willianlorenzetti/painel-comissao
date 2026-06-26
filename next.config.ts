import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  serverExternalPackages: ['node-firebird', 'mysql2'],
};

export default nextConfig;

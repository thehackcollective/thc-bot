/** @type {import('next').NextConfig} */
const nextConfig = {
  // better-sqlite3 is a native module — keep it external, don't bundle (Next 14.2 key).
  experimental: {
    serverComponentsExternalPackages: ["better-sqlite3"],
  },
  transpilePackages: ["three"],
};

export default nextConfig;

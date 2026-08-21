/** @type {import('next').NextConfig} */
const nextConfig = {
  // better-sqlite3 is a native module — keep it external, don't bundle (Next 14.2 key).
  experimental: {
    serverComponentsExternalPackages: ["better-sqlite3"],
    // The dashboard imports the bot's canonical domain code from ../src (single source
    // of truth for types, schema, and wacli parsing), which lives outside the Next root.
    externalDir: true,
  },
  webpack: (config) => {
    // The bot's modules use ESM-style ".js" specifiers that point at ".ts" files on disk.
    // TypeScript resolves those itself; webpack needs to be told, or ../src/queue/leads-repo.ts
    // fails on `./dedupe.js`.
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
    };
    return config;
  },
};

export default nextConfig;

const fs = require("node:fs");
const path = require("node:path");

// Load APP_VERSION from repo-level .env (one directory up) if Next hasn't picked it up.
if (!process.env.APP_VERSION) {
  const rootEnvPath = path.join(__dirname, "..", ".env");
  if (fs.existsSync(rootEnvPath)) {
    const rawEnv = fs.readFileSync(rootEnvPath, "utf8");
    const line = rawEnv
      .split(/\r?\n/)
      .find((entry) => entry.trim().startsWith("APP_VERSION="));
    if (line) {
      const value = line.split("=").slice(1).join("=").trim().replace(/^['"]|['"]$/g, "");
      if (value) {
        process.env.APP_VERSION = value;
      }
    }
  }
}

const apiHost = process.env.API_HOST ?? "http://localhost:8000";
const appVersion = (process.env.APP_VERSION ?? "").trim() || "unknown";

module.exports = {
  reactStrictMode: true,
  env: {
    APP_VERSION: appVersion,
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiHost}/api/:path*`,
      },
    ];
  },
};

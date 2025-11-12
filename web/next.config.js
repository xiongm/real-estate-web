const apiHost = process.env.API_HOST ?? "http://localhost:8000";

module.exports = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiHost}/api/:path*`,
      },
    ];
  },
};

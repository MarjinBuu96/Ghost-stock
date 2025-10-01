/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: "/blog/:path*",
        destination: "https://blog.ghost-stock.co.uk/:path*", // Ghost(Pro)
      },
    ];
  },
};

module.exports = nextConfig;

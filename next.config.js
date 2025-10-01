/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      { source: "/blog", destination: "https://blog.ghost-stock.co.uk" },
      { source: "/blog/:path*", destination: "https://blog.ghost-stock.co.uk/:path*" },
      // optional: proxy Ghost’s RSS
      { source: "/blog/rss", destination: "https://blog.ghost-stock.co.uk/rss" },
    ];
  },
};

module.exports = nextConfig;

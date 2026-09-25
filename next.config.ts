import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        // Old booking links on the mazurio domain now go to the sign-in flow
        // on app.aioak.io. Matches only that host, so nothing else changes.
        // Temporary (307) on purpose: browsers cache a permanent (308)
        // redirect, so switch to `permanent: true` only once the target is
        // stable.
        source: "/appointments/:path*",
        has: [{ type: "host", value: "book.mazurio.com" }],
        destination: "https://app.aioak.io",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;

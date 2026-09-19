import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: process.env.STANDALONE_BUILD ? "standalone" : undefined,
  allowedDevOrigins: [
    ".loca.lt",
    "rushtable-test.loca.lt",
    "afraid-bats-behave.loca.lt",
    "*.loca.lt",
    "loca.lt",
    "10.66.188.27",
    "10.18.66.27",
    "10.18.66.122",
    "10.66.188.27:3000",
    "10.66.188.242",
    "10.66.188.242:3000",
    "10.126.30.27",
    "10.126.30.141",
    "localhost",
    "127.0.0.1",
    "0.0.0.0",
  ],
  async redirects() {
    return [
      {
        source: "/admin/superadmin",
        destination: "/superadmin",
        permanent: true,
      },
      {
        source: "/admin",
        destination: "/",
        permanent: true,
      },
      {
        source: "/admin/:path*",
        destination: "/",
        permanent: true,
      },
      {
        source: "/login",
        destination: "/",
        permanent: true,
      },
      {
        source: "/login/:path*",
        destination: "/",
        permanent: true,
      },
    ];
  },
  async rewrites() {
    const backendUrl = (process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
    return [
      {
        source: "/api/:path*",
        destination: `${backendUrl}/api/:path*`,
      },
      {
        source: "/uploads/:path*",
        destination: `${backendUrl}/uploads/:path*`,
      },
    ];
  },
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;

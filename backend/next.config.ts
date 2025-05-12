import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  trailingSlash: false, // trailingSlashを無効にする

  async headers() {
    return [
      {
        source: "/api/:path*", // すべてのAPIエンドポイントでCORS設定を適用
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" }, // すべてのオリジンを許可
          {
            key: "Access-Control-Allow-Methods",
            value: "GET,POST,PUT,DELETE,OPTIONS",
          },
          {
            key: "Access-Control-Allow-Headers",
            value: "X-Requested-With, Content-Type, Authorization",
          },
          { key: "Access-Control-Allow-Credentials", value: "true" },
        ],
      },
    ];
  },
};

export default nextConfig;

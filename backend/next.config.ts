import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  trailingSlash: true, // trailingSlashの設定

  async headers() {
    return [
      {
        source: "/api/:path*", // すべてのAPIエンドポイントでCORS設定を適用
        headers: [
          { key: "Access-Control-Allow-Origin", value: "https://my-pokedex-frontend.vercel.app" }, // フロントエンドURLを許可
          { key: "Access-Control-Allow-Methods", value: "GET,POST,OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "X-Requested-With, Content-Type" },
        ],
      },
    ];
  },
};

export default nextConfig;

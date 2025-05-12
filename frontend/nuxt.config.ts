import { defineNuxtConfig } from "nuxt/config";

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  app: {
    head: {
      title: "ポケモン図鑑", // アプリケーションのデフォルトタイトル
      meta: [
        { charset: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1" },
        // 他に必要なmetaタグがあればここに追加
      ],
      link: [
        // ファビコンの設定例 (public/favicon.ico があれば自動で認識されることが多い)
        // { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
        { rel: "icon", type: "image/png", href: "/pokeball.png" }, // pokeball.png をファビコンとして指定
      ],
    },
  },
  compatibilityDate: "2024-04-03",
  devtools: { enabled: true },
  runtimeConfig: {
    public: {
      apiBase:
        process.env.API_BASE_URL || "https://my-pokedex-backend.vercel.app/api",
    },
  },
  // CORS問題を解決するために設定を追加
  nitro: {
    devProxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
});

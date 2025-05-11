import type { NextApiRequest, NextApiResponse } from "next";
// import fetch from "node-fetch"; // Node.js v18未満の場合。v18+ならネイティブ fetch を検討 (削除)
// import NodeCache from "node-cache";
import pLimit from "p-limit";

const pLimitInstance = pLimit(5); // 変数名を pLimit から変更（pLimit が型名と衝突するため）
// const cache = new NodeCache({ stdTTL: 3600 }); // キャッシュを1時間保持 ← この行をコメントアウト

interface PokemonListItem {
  name: string;
  url: string;
}

interface PokeApiResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: PokemonListItem[];
}

// 追加: ポケモン詳細APIのレスポンス型
interface ExternalPokemonData {
  id: number; // PokeAPIのidは数値型
  name: string; // ローマ字名
  sprites: {
    front_default: string | null;
    other?: {
      "official-artwork"?: {
        front_default: string | null;
      };
    };
  };
  types: { slot: number; type: { name: string; url: string } }[]; // 追加: タイプ情報
}

// 追加: ポケモン種族APIのレスポンス型
interface ExternalSpeciesData {
  names: { language: { name: string }; name: string }[];
  // 他にも必要なフィールドがあれば追加
}

// 追加: ポケモンタイプAPIのレスポンス型
interface ExternalTypeData {
  names: { language: { name: string }; name: string }[];
  // 他にも必要なフィールドがあれば追加
}

interface PokemonDetail {
  id: string | undefined;
  name: string;
  image: string;
  number: string;
  types?: string[]; // 追加: タイプ情報 (日本語名の配列)
}

interface ApiResponse {
  results: PokemonDetail[];
  currentPage: number;
  totalPages: number;
  totalItems: number;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse | { error: string }>
) {
  // CORSヘッダー設定 - すべてのリクエストに対して設定
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // OPTIONSメソッドのプリフライトリクエスト対応
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const offset = (page - 1) * limit;
  const searchTerm = req.query.searchTerm as string | undefined;
  // ... existing code ...
}

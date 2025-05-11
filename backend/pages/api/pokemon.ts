import type { NextApiRequest, NextApiResponse } from "next";
// import fetch from "node-fetch"; // Node.js v18未満の場合。v18+ならネイティブ fetch を検討 (削除)
import NodeCache from "node-cache";
import pLimit from "p-limit";

const pLimitInstance = pLimit(5); // 変数名を pLimit から変更（pLimit が型名と衝突するため）
const cache = new NodeCache({ stdTTL: 3600 }); // キャッシュを1時間保持

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
}

// 追加: ポケモン種族APIのレスポンス型
interface ExternalSpeciesData {
  names: { language: { name: string }; name: string }[];
  // 他にも必要なフィールドがあれば追加
}

interface PokemonDetail {
  id: string | undefined;
  name: string;
  image: string;
  number: string;
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
  // CORSヘッダー設定
  if (req.method === "OPTIONS") {
    res.setHeader(
      "Access-Control-Allow-Origin",
      "https://my-pokedex-frontend.vercel.app"
    );
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET,POST,PUT,DELETE,OPTIONS"
    );
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.status(200).end();
    return;
  }

  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const offset = (page - 1) * limit;

  const cacheKey = `pokemonData-page-${page}-limit-${limit}`;
  const cachedData = cache.get<ApiResponse>(cacheKey);

  if (cachedData) {
    res.status(200).json(cachedData);
    return;
  }

  try {
    // PokeAPIから指定された範囲のポケモンリストを取得
    const listResponse = await fetch(
      `https://pokeapi.co/api/v2/pokemon?limit=${limit}&offset=${offset}`
    );
    if (!listResponse.ok) {
      throw new Error(
        `PokeAPI list request failed with status ${listResponse.status}`
      );
    }
    const listData = (await listResponse.json()) as PokeApiResponse;
    const totalItems = listData.count;
    const totalPages = Math.ceil(totalItems / limit);

    const pokemonDetailsPromises = listData.results.map((pokemon) =>
      pLimitInstance(async (): Promise<PokemonDetail> => {
        const id = pokemon.url.split("/").filter(Boolean).pop();
        if (!id) {
          // IDが取得できないケースはエラーまたはデフォルト値を設定
          // ここではエラーを投げる代わりに、不完全なデータを返すことも検討可能
          throw new Error(`Could not extract ID from URL: ${pokemon.url}`);
        }

        const pokemonResponse = await fetch(
          `https://pokeapi.co/api/v2/pokemon/${id}`
        );
        if (!pokemonResponse.ok)
          throw new Error(`Failed to fetch pokemon ${id}`);
        const pokemonData =
          (await pokemonResponse.json()) as ExternalPokemonData;

        const speciesResponse = await fetch(
          `https://pokeapi.co/api/v2/pokemon-species/${id}`
        );
        if (!speciesResponse.ok)
          throw new Error(`Failed to fetch species ${id}`);
        const speciesData =
          (await speciesResponse.json()) as ExternalSpeciesData;

        const japaneseNameEntry = speciesData.names.find(
          (entry) =>
            entry.language.name === "ja-Hrkt" || entry.language.name === "ja"
        );
        const japaneseName = japaneseNameEntry?.name || pokemonData.name;

        return {
          id,
          name: japaneseName,
          image: pokemonData.sprites.front_default || "/pokeball.png", // 画像がない場合のフォールバック
          number: `No.${String(id).padStart(3, "0")}`,
        };
      })
    );

    const results = await Promise.all(pokemonDetailsPromises);

    const responseData: ApiResponse = {
      results,
      currentPage: page,
      totalPages,
      totalItems,
    };

    cache.set(cacheKey, responseData);
    res.status(200).json(responseData);
  } catch (error) {
    console.error("エラー内容:", error);
    const message = error instanceof Error ? error.message : "データ取得エラー";
    res.status(500).json({ error: message });
  }
}

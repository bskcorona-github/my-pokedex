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

  // const cacheKey = `pokemonData-page-${page}-limit-${limit}`;
  // const cachedData = cache.get<ApiResponse>(cacheKey);

  // if (cachedData) {
  //   res.status(200).json(cachedData);
  //   return;
  // }

  try {
    // PokeAPIから指定された範囲のポケモンリストを取得
    const listResponse = await fetch(
      `https://pokeapi.co/api/v2/pokemon?limit=${limit}&offset=${offset}`
    );
    if (!listResponse.ok) {
      // PokeAPI自体がエラーを返した場合 (例: 404 Not Found や 5xx Server Error)
      console.error(
        `PokeAPI list request failed: ${listResponse.status} ${listResponse.statusText} for url: ${listResponse.url}`
      );
      // この場合、エラーメッセージを具体的にして500を返すか、あるいは空のデータを返すか検討
      // ここでは、PokeAPIからのエラーは直接500エラーとして扱う
      throw new Error(
        `PokeAPI list request failed with status ${listResponse.status}`
      );
    }
    const listData = (await listResponse.json()) as PokeApiResponse;
    const totalItems = listData.count;
    const calculatedTotalPages = Math.ceil(totalItems / limit);

    // リクエストされたページが計算上の総ページ数を超えているか、
    // またはPokeAPIから返された結果が空の場合、有効なデータはないと判断
    if (page > calculatedTotalPages || listData.results.length === 0) {
      // cache.set(cacheKey, {
      //   // キャッシュにも空データを保存
      //   results: [],
      //   currentPage: page,
      //   totalPages: calculatedTotalPages,
      //   totalItems: totalItems,
      // });
      res.status(200).json({
        results: [],
        currentPage: page,
        totalPages: calculatedTotalPages,
        totalItems: totalItems,
      });
      return;
    }

    const pokemonDetailsPromises = listData.results.map((pokemon) =>
      pLimitInstance(async (): Promise<PokemonDetail | null> => {
        // null を返す可能性を明示
        const id = pokemon.url.split("/").filter(Boolean).pop();
        if (!id) {
          console.error(`Could not extract ID from URL: ${pokemon.url}`);
          return null; // IDがなければ処理中断
        }

        try {
          const pokemonResponse = await fetch(
            `https://pokeapi.co/api/v2/pokemon/${id}`
          );
          if (!pokemonResponse.ok) {
            console.error(
              `Failed to fetch pokemon ${id}: ${pokemonResponse.status} ${pokemonResponse.statusText}`
            );
            return null; // ポケモンデータの取得失敗
          }
          const pokemonData =
            (await pokemonResponse.json()) as ExternalPokemonData;

          const speciesResponse = await fetch(
            `https://pokeapi.co/api/v2/pokemon-species/${id}`
          );
          if (!speciesResponse.ok) {
            console.error(
              `Failed to fetch species ${id}: ${speciesResponse.status} ${speciesResponse.statusText}`
            );
            return null; // 種族データの取得失敗
          }
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
            image:
              pokemonData.sprites.other?.["official-artwork"]?.front_default ||
              pokemonData.sprites.front_default ||
              "/pokeball.png",
            number: `No.${String(id).padStart(3, "0")}`,
          };
        } catch (detailError) {
          console.error(
            `Error processing details for pokemon ID ${id}:`,
            detailError
          );
          return null; // その他の予期せぬエラー
        }
      })
    );

    // Promise.allSettled を使うと、成功/失敗に関わらず全プロミスの結果を得られる
    const settledResults = await Promise.allSettled(pokemonDetailsPromises);

    const successfulResults: PokemonDetail[] = [];
    settledResults.forEach((result) => {
      if (result.status === "fulfilled" && result.value !== null) {
        successfulResults.push(result.value);
      } else if (result.status === "rejected") {
        // Promise.allSettled を使っているので、pLimitInstance 内の throw はここに来ないはず
        // (pLimitInstance 内で catch して null を返しているため)
        // もし pLimitInstance 内で throw するロジックに戻した場合は、ここでエラーログを出す
        console.error(
          "A promise for pokemon detail was rejected:",
          result.reason
        );
      }
      // result.value が null の場合は、上で console.error 済みなのでここでは何もしない
    });

    const responseData: ApiResponse = {
      results: successfulResults,
      currentPage: page,
      totalPages: calculatedTotalPages, // 計算されたtotalPagesを使用
      totalItems,
    };

    // cache.set(cacheKey, responseData);
    res.status(200).json(responseData);
  } catch (error) {
    console.error("エラー内容:", error);
    const message = error instanceof Error ? error.message : "データ取得エラー";
    res.status(500).json({ error: message });
  }
}

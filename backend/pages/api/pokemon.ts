import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs"; // ★ 追加
import path from "path"; // ★ 追加
// import fetch from "node-fetch"; // Node.js v18未満の場合。v18+ならネイティブ fetch を検討 (削除)
// import NodeCache from "node-cache";
// import pLimit from "p-limit";

// const pLimitInstance = pLimit(5); // 変数名を pLimit から変更（pLimit が型名と衝突するため）
// const cache = new NodeCache({ stdTTL: 3600 }); // キャッシュを1時間保持 ← この行をコメントアウト

// ★ PokemonListItem は未使用なので削除
// interface PokemonListItem { ... }

// ★ ExternalPokemonData は fetchPokemonDetailsForList 内で使われるので維持
interface ExternalPokemonData {
  id: number;
  name: string;
  sprites: {
    front_default: string | null;
    other?: {
      "official-artwork"?: {
        front_default: string | null;
      };
    };
  };
  types: { slot: number; type: { name: string; url: string } }[];
}

// ★ ExternalSpeciesData, ExternalTypeData は未使用（fetchTypeJapaneseNameが復活すればTypeは使う）
// interface ExternalSpeciesData { ... }
interface ExternalTypeData {
  // ← fetchTypeJapaneseNameで使うので維持
  names: { language: { name: string }; name: string }[];
}

// ★ PokemonDetail を更新、新しい型を追加
interface PokemonDataEntry {
  // ★ 追加: pokemonData.json の型
  id: string;
  name_en: string;
  name_ja: string;
  number: string;
}

interface PokemonDetail {
  id: string; // idは必須に
  name: string; // 日本語名
  image: string;
  number: string;
  types?: string[];
}

interface ApiResponse {
  results: PokemonDetail[];
  currentPage: number;
  totalPages: number;
  totalItems: number;
}

// ★ 以下のインデックス関連を削除またはコメントアウト
// const japaneseNameIndex: { [key: string]: string } = {};
// const romajiNameIndex: { [key: string]: string } = {};
// const popularPokemonRomaji: { [key: string]: string[] } = { ... };
// let isJapaneseIndexBuilding = false;
// const buildJapaneseNameIndex = async () => { ... };
// setTimeout(buildJapaneseNameIndex, 1000);

// ★★★ Helper Functions (移植) ★★★
const typeCache = new Map<string, string>(); // グローバルスコープに移動

const getOfficialArtwork = (data: ExternalPokemonData): string => {
  return (
    data.sprites.other?.["official-artwork"]?.front_default ||
    data.sprites.front_default ||
    "/pokeball.png" // フォールバック画像
  );
};

const fetchTypeJapaneseName = async (typeUrl: string): Promise<string> => {
  if (typeCache.has(typeUrl)) {
    return typeCache.get(typeUrl)!;
  }
  try {
    const typeResponse = await fetch(typeUrl);
    if (!typeResponse.ok) {
      console.error(
        `Failed to fetch type details from ${typeUrl}: ${typeResponse.status}`
      );
      return typeUrl.split("/").pop() || "unknown"; // エラー時は英語名（のようなもの）でフォールバック
    }
    const typeData = (await typeResponse.json()) as ExternalTypeData;
    const jaNameEntry = typeData.names.find(
      (name) => name.language.name === "ja-Hrkt" || name.language.name === "ja"
    );
    const jaName = jaNameEntry?.name || typeUrl.split("/").pop() || "unknown";
    typeCache.set(typeUrl, jaName);
    return jaName;
  } catch (error) {
    console.error(`Error fetching type details from ${typeUrl}:`, error);
    return typeUrl.split("/").pop() || "unknown"; // エラー時は英語名でフォールバック
  }
};
// ★★★ Helper Functions END ★★★

// ★ JSONファイルからデータを読み込む
let allPokemonData: PokemonDataEntry[] = [];
try {
  const jsonPath = path.resolve("./pokemonData.json"); // Next.jsのルートからの相対パス
  const jsonData = fs.readFileSync(jsonPath, "utf-8");
  allPokemonData = JSON.parse(jsonData);
  console.log(
    `Successfully loaded ${allPokemonData.length} Pokemon from pokemonData.json`
  );
} catch (error) {
  console.error("Error loading pokemonData.json:", error);
  // エラーハンドリング: ここでは空の配列で続行するか、エラーを投げるかなど検討
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse | { error: string }>
) {
  // CORSヘッダー設定
  if (req.method === "OPTIONS") {
    res.setHeader(
      "Access-Control-Allow-Origin",
      "*" // すべてのオリジンを許可
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
  const searchTerm = req.query.searchTerm as string | undefined;

  console.log(
    `Request: page=${page}, limit=${limit}, offset=${offset}, searchTerm=${searchTerm}`
  );

  const hiraganaToKatakana = (str: string): string => {
    return str.replace(/[ぁ-ゔゞ゛゜]/g, function (match) {
      const charCode = match.charCodeAt(0) + 0x60;
      return String.fromCharCode(charCode);
    });
  };

  try {
    let filteredPokemon: PokemonDataEntry[] = []; // ★ フィルタ結果を保持する配列

    if (searchTerm) {
      console.log(`Search term provided: ${searchTerm}`);
      const originalQueryLower = searchTerm.toLowerCase();
      const katakanaQueryLower = hiraganaToKatakana(originalQueryLower);
      const queryNumber = searchTerm.startsWith("No.")
        ? searchTerm.substring(3)
        : searchTerm;
      const isNumberQuery = /^\d+$/.test(queryNumber);

      filteredPokemon = allPokemonData.filter((pokemon) => {
        // 日本語名チェック (部分一致)
        if (pokemon.name_ja.toLowerCase().includes(katakanaQueryLower)) {
          return true;
        }
        // ローマ字名チェック (部分一致)
        if (pokemon.name_en.toLowerCase().includes(originalQueryLower)) {
          return true;
        }
        // 図鑑番号チェック (完全一致、先行ゼロは無視)
        if (isNumberQuery && pokemon.number === queryNumber.padStart(3, "0")) {
          // ★ 注意: pokemonData.jsonのnumberが"003"形式であることを前提
          return true;
        }
        // 図鑑番号チェック ("No."付き、先行ゼロ無視)
        if (
          searchTerm.startsWith("No.") &&
          isNumberQuery &&
          pokemon.number === queryNumber.padStart(3, "00")
        ) {
          return true;
        }

        return false;
      });
      console.log(`Found ${filteredPokemon.length} matches in local data.`);
    } else {
      // 検索語がない場合は全件
      filteredPokemon = allPokemonData;
    }

    // --- ページネーション --- (ここから下でfilteredPokemonを使う)
    const totalItemsForResponse = filteredPokemon.length;
    const totalPagesForResponse = Math.max(
      1,
      Math.ceil(totalItemsForResponse / limit)
    ); // 0件でも1ページ
    const paginatedPokemon = filteredPokemon.slice(offset, offset + limit);

    // --- 詳細情報(画像・タイプ)の取得 --- (paginatedPokemon を渡す)
    const results = await fetchPokemonDetailsForList(paginatedPokemon);

    res.status(200).json({
      results,
      currentPage: page,
      totalPages: totalPagesForResponse,
      totalItems: totalItemsForResponse,
    });
  } catch (error) {
    console.error("API Error:", error);
    const message =
      error instanceof Error ? error.message : "Internal Server Error";
    res.status(500).json({ error: message });
  }
}

async function fetchPokemonDetailsForList(
  pokemonList: PokemonDataEntry[]
): Promise<PokemonDetail[]> {
  // typeCache はグローバルに移動したので削除
  // getOfficialArtwork と fetchTypeJapaneseName もグローバルに移動したので、ここでのダミー実装は削除

  const pokemonDetailsPromises = pokemonList.map(
    async (pokemonEntry): Promise<PokemonDetail | null> => {
      try {
        // メガ進化ポケモンやその他の特殊なフォームは name_en を使ってAPIリクエスト
        const apiIdentifier = pokemonEntry.name_en.includes("-")
          ? pokemonEntry.name_en
          : pokemonEntry.id;
        const detailUrl = `https://pokeapi.co/api/v2/pokemon/${apiIdentifier}`;
        const detailResponse = await fetch(detailUrl);

        if (!detailResponse.ok) {
          console.error(
            `Failed to fetch details for ${pokemonEntry.name_en} (ID: ${pokemonEntry.id}), Status: ${detailResponse.status}`
          );
          return {
            id: pokemonEntry.id,
            name: pokemonEntry.name_ja,
            number: pokemonEntry.number,
            image: "/pokeball.png",
            types: [],
          };
        }
        const detailData = (await detailResponse.json()) as ExternalPokemonData;
        const typePromises = detailData.types.map(
          (typeInfo) => fetchTypeJapaneseName(typeInfo.type.url) // グローバル関数を呼び出し
        );
        const japaneseTypes = await Promise.all(typePromises);

        return {
          id: String(detailData.id),
          name: pokemonEntry.name_ja,
          image: getOfficialArtwork(detailData), // グローバル関数を呼び出し
          number: pokemonEntry.number,
          types: japaneseTypes.filter((t) => t),
        };
      } catch (error) {
        console.error(
          `Error processing details for ${pokemonEntry.name_en} (ID: ${pokemonEntry.id}):`,
          error
        );
        return {
          id: pokemonEntry.id,
          name: pokemonEntry.name_ja,
          number: pokemonEntry.number,
          image: "/pokeball.png",
          types: [],
        };
      }
    }
  );
  const resolvedDetails = await Promise.all(pokemonDetailsPromises);
  return resolvedDetails.filter(
    (detail): detail is PokemonDetail => detail !== null
  );
}

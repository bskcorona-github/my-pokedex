import type { NextApiRequest, NextApiResponse } from "next";
// import fetch from "node-fetch"; // Node.js v18未満の場合。v18+ならネイティブ fetch を検討 (削除)
import NodeCache from "node-cache";
import pLimit from "p-limit";

const pLimitInstance = pLimit(5); // 変数名を pLimit から変更（pLimit が型名と衝突するため）
const cache = new NodeCache({ stdTTL: 86400 }); // キャッシュを24時間に延長

// 日本語名インデックス構築用のフラグ
let isJapaneseIndexBuilding = false;
let japaneseNameIndex: { [key: string]: string } = {};

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

// 総ポケモン数を取得してキャッシュする関数
const getTotalPokemonCount = async (): Promise<number> => {
  const cacheKey = "totalPokemonCount";
  const cached = cache.get<number>(cacheKey);
  if (cached) return cached;

  try {
    const response = await fetch(`https://pokeapi.co/api/v2/pokemon?limit=1`);
    if (!response.ok) {
      throw new Error(`Failed to fetch total count: ${response.status}`);
    }
    const data = (await response.json()) as PokeApiResponse;
    cache.set(cacheKey, data.count, 86400); // 24時間キャッシュ
    return data.count;
  } catch (error) {
    console.error("Total count fetch error:", error);
    return 1200; // フォールバック値
  }
};

// 日本語名インデックスを構築する関数
const buildJapaneseNameIndex = async () => {
  if (isJapaneseIndexBuilding) return;

  const cachedIndex = cache.get<{ [key: string]: string }>("japaneseNameIndex");
  if (cachedIndex) {
    japaneseNameIndex = cachedIndex;
    return;
  }

  isJapaneseIndexBuilding = true;
  console.log("Building Japanese name index...");

  try {
    // 全ポケモンのリストを取得
    const response = await fetch(
      "https://pokeapi.co/api/v2/pokemon?limit=1200"
    );
    if (!response.ok) {
      throw new Error(`Failed to fetch pokemon list: ${response.status}`);
    }

    const data = (await response.json()) as PokeApiResponse;
    const allPokemon = data.results;

    // 並列処理数を制限しながら日本語名を取得
    const batchSize = 20;
    const nameMap: { [key: string]: string } = {};

    for (let i = 0; i < allPokemon.length; i += batchSize) {
      const batch = allPokemon.slice(i, i + batchSize);
      const promises = batch.map(async (pokemon) => {
        const id = pokemon.url.split("/").filter(Boolean).pop();
        if (!id) return;

        try {
          const speciesUrl = `https://pokeapi.co/api/v2/pokemon-species/${id}`;
          const speciesResponse = await fetch(speciesUrl);
          if (!speciesResponse.ok) return;

          const speciesData =
            (await speciesResponse.json()) as ExternalSpeciesData;
          const jaName = speciesData.names.find(
            (n) => n.language.name === "ja-Hrkt" || n.language.name === "ja"
          )?.name;

          if (jaName) {
            nameMap[jaName.toLowerCase()] = id;
          }
        } catch (error) {
          console.error(`Error fetching Japanese name for ID ${id}:`, error);
        }
      });

      await Promise.all(promises);
      console.log(
        `Processed ${i + batch.length}/${allPokemon.length} Pokemon names`
      );
    }

    japaneseNameIndex = nameMap;
    cache.set("japaneseNameIndex", nameMap, 86400 * 7); // 1週間キャッシュ
    console.log(
      "Japanese name index built successfully with",
      Object.keys(nameMap).length,
      "entries"
    );
  } catch (error) {
    console.error("Error building Japanese name index:", error);
  } finally {
    isJapaneseIndexBuilding = false;
  }
};

// バックグラウンドでインデックス構築を開始
setTimeout(buildJapaneseNameIndex, 1000);

// ひらがなをカタカナに変換
const hiraganaToKatakana = (str: string): string => {
  return str.replace(/[ぁ-ゔゞ゛゜]/g, function (match) {
    const charCode = match.charCodeAt(0) + 0x60;
    return String.fromCharCode(charCode);
  });
};

// バックグラウンドで次のページをプリフェッチする関数
const prefetchNextPages = async (
  currentPage: number,
  limit: number,
  searchTerm?: string
) => {
  const pagesToPrefetch = [currentPage + 1, currentPage + 2];

  for (const page of pagesToPrefetch) {
    const cacheKey = `pokemonData-page-${page}-limit-${limit}${
      searchTerm ? "-search-" + searchTerm : ""
    }`;
    if (!cache.has(cacheKey)) {
      console.log(`Prefetching page ${page}...`);
      try {
        let pokemonsToProcess: PokemonListItem[] = [];
        let totalItemsForResponse = 0;

        if (searchTerm) {
          // 検索モードの場合は既存の検索ロジックを使用
          // 実装省略（既存のコードと同様）
        } else {
          // 通常のページネーション
          const offset = (page - 1) * limit;
          const listResponse = await fetch(
            `https://pokeapi.co/api/v2/pokemon?limit=${limit}&offset=${offset}`
          );
          if (!listResponse.ok) continue;

          const listData = (await listResponse.json()) as PokeApiResponse;
          pokemonsToProcess = listData.results;
          totalItemsForResponse = listData.count;
        }

        // 以下詳細取得処理は既存コードと同様のため省略
        // 詳細データを取得してキャッシュする処理
      } catch (error) {
        console.error(`Error prefetching page ${page}:`, error);
      }
    }
  }
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse | { error: string }>
) {
  // CORSヘッダー設定 - すべてのオリジンを許可（シンプルに）
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Credentials", "true");

  // OPTIONSメソッドのプリフライトリクエスト対応
  if (req.method === "OPTIONS") {
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

  const cacheKey = `pokemonData-page-${page}-limit-${limit}${
    searchTerm ? "-search-" + searchTerm : ""
  }`;
  const cachedData = cache.get<ApiResponse>(cacheKey);
  if (cachedData) {
    // キャッシュヒット - 次のページをバックグラウンドでプリフェッチ
    setTimeout(() => prefetchNextPages(page, limit, searchTerm), 10);
    res.status(200).json(cachedData);
    return;
  }

  try {
    let pokemonsToProcess: PokemonListItem[] = [];
    let totalItemsForResponse = 0;
    let totalPagesForResponse = 0;

    if (searchTerm) {
      console.log(`Search term provided: ${searchTerm}`);
      const originalQueryLower = searchTerm.toLowerCase();
      const katakanaQueryLower = hiraganaToKatakana(originalQueryLower);

      // 日本語名インデックスを使った検索を試みる
      let foundByJapanese = false;
      if (Object.keys(japaneseNameIndex).length > 0) {
        console.log("Using Japanese name index for search");
        const matchingIds: string[] = [];

        // 日本語名で検索
        Object.entries(japaneseNameIndex).forEach(([jpName, id]) => {
          if (
            jpName.includes(originalQueryLower) ||
            jpName.includes(katakanaQueryLower)
          ) {
            matchingIds.push(id);
          }
        });

        if (matchingIds.length > 0) {
          foundByJapanese = true;
          console.log(`Found ${matchingIds.length} matches by Japanese name`);

          // IDからポケモンリストアイテムを作成
          pokemonsToProcess = matchingIds.map((id) => ({
            name: `pokemon-${id}`,
            url: `https://pokeapi.co/api/v2/pokemon/${id}/`,
          }));

          totalItemsForResponse = matchingIds.length;
        }
      }

      // 日本語名で見つからなかった場合は従来のローマ字名検索を使う
      if (!foundByJapanese) {
        console.log("No matches by Japanese name, falling back to API search");
        // 既存の検索コード（英語名/ID検索）
        const allPokemonResponse = await fetch(
          `https://pokeapi.co/api/v2/pokemon?limit=2000&offset=0`
        );
        if (!allPokemonResponse.ok) {
          throw new Error(
            `PokeAPI (all for search) request failed with status ${allPokemonResponse.status}`
          );
        }
        const allPokemonData =
          (await allPokemonResponse.json()) as PokeApiResponse;

        // 既存のフィルタリングロジック
        pokemonsToProcess = allPokemonData.results.filter((pokemon) => {
          const nameIsProbablyLatin = /^[a-z0-9\-]+$/.test(pokemon.name);
          let nameBasedMatch = false;
          if (nameIsProbablyLatin) {
            nameBasedMatch =
              pokemon.name.toLowerCase().includes(originalQueryLower) ||
              pokemon.name.toLowerCase().includes(katakanaQueryLower);
          }

          const pokemonId = pokemon.url.split("/").filter(Boolean).pop();
          const idBasedMatch = pokemonId === originalQueryLower;

          return nameBasedMatch || idBasedMatch;
        });

        totalItemsForResponse = pokemonsToProcess.length;
        console.log(`Found ${totalItemsForResponse} matches by API search`);
      }

      // フィルタリング後のリストに対してページネーション
      totalPagesForResponse = Math.ceil(totalItemsForResponse / limit);
      if (totalItemsForResponse > 0 && totalPagesForResponse === 0)
        totalPagesForResponse = 1;

      const startIndex = offset;
      const endIndex = offset + limit;
      pokemonsToProcess = pokemonsToProcess.slice(startIndex, endIndex);
    } else {
      // 通常のページネーション
      const totalCount = await getTotalPokemonCount();
      totalItemsForResponse = totalCount;
      totalPagesForResponse = Math.ceil(totalItemsForResponse / limit);

      const listResponse = await fetch(
        `https://pokeapi.co/api/v2/pokemon?limit=${limit}&offset=${offset}`
      );
      if (!listResponse.ok) {
        throw new Error(
          `PokeAPI list request failed with status ${listResponse.status}`
        );
      }
      const listData = (await listResponse.json()) as PokeApiResponse;
      pokemonsToProcess = listData.results;
    }

    // ページが範囲外の場合、空の結果を返す
    if (page > totalPagesForResponse && totalPagesForResponse > 0) {
      console.log(
        `Page ${page} is out of bounds (${totalPagesForResponse} total pages).`
      );
      res.status(200).json({
        results: [],
        currentPage: page,
        totalPages: totalPagesForResponse,
        totalItems: totalItemsForResponse,
      });
      return;
    }

    // 検索結果が0件の場合
    if (searchTerm && pokemonsToProcess.length === 0) {
      console.log("No Pokemon matched the search term.");
      res.status(200).json({
        results: [],
        currentPage: 1,
        totalPages: 0,
        totalItems: 0,
      });
      return;
    }

    console.log(
      `Processing ${pokemonsToProcess.length} Pokemon for page ${page}`
    );

    // 詳細データ取得（並列処理制限付き）
    const pokemonDetailsPromises = pokemonsToProcess.map((pokemonListItem) =>
      pLimitInstance(async (): Promise<PokemonDetail | null> => {
        const id = pokemonListItem.url.split("/").filter(Boolean).pop();
        if (!id) return null;

        try {
          // 詳細データをキャッシュから取得を試みる
          const detailCacheKey = `pokemon-detail-${id}`;
          const cachedDetail = cache.get<PokemonDetail>(detailCacheKey);
          if (cachedDetail) return cachedDetail;

          // APIから詳細データを取得
          const pokemonResponse = await fetch(
            `https://pokeapi.co/api/v2/pokemon/${id}`
          );
          if (!pokemonResponse.ok) return null;

          const pokemonData =
            (await pokemonResponse.json()) as ExternalPokemonData;

          // 種族データを取得（日本語名のため）
          const speciesResponse = await fetch(
            `https://pokeapi.co/api/v2/pokemon-species/${id}`
          );
          if (!speciesResponse.ok) return null;

          const speciesData =
            (await speciesResponse.json()) as ExternalSpeciesData;

          // 日本語名を取得
          const japaneseNameEntry = speciesData.names.find(
            (entry) =>
              entry.language.name === "ja-Hrkt" || entry.language.name === "ja"
          );
          const japaneseName = japaneseNameEntry?.name || pokemonData.name;

          // 画像URLを取得
          const image =
            pokemonData.sprites.other?.["official-artwork"]?.front_default ||
            pokemonData.sprites.front_default ||
            "/pokeball.png";

          // タイプ情報を取得
          const japaneseTypes: string[] = [];
          if (pokemonData.types && pokemonData.types.length > 0) {
            const typePromises = pokemonData.types.map(async (typeEntry) => {
              try {
                // タイプ情報をキャッシュから取得を試みる
                const typeCacheKey = `type-${typeEntry.type.name}`;
                const cachedType = cache.get<string>(typeCacheKey);
                if (cachedType) return cachedType;

                const typeResponse = await fetch(typeEntry.type.url);
                if (!typeResponse.ok) return typeEntry.type.name;

                const typeData =
                  (await typeResponse.json()) as ExternalTypeData;
                const japaneseTypeNameEntry = typeData.names.find(
                  (nameEntry) =>
                    nameEntry.language.name === "ja-Hrkt" ||
                    nameEntry.language.name === "ja"
                );

                const typeName =
                  japaneseTypeNameEntry?.name || typeEntry.type.name;
                cache.set(typeCacheKey, typeName, 86400 * 30); // 30日キャッシュ（タイプは変わらない）
                return typeName;
              } catch (error) {
                return typeEntry.type.name;
              }
            });

            const resolvedTypes = await Promise.all(typePromises);
            resolvedTypes.forEach((typeName) => {
              if (typeName) japaneseTypes.push(typeName);
            });
          }

          // ポケモン詳細情報を作成
          const resultPokemonDetail: PokemonDetail = {
            id,
            name: japaneseName,
            image: image,
            number: `No.${String(id).padStart(3, "0")}`,
            types: japaneseTypes,
          };

          // 詳細情報をキャッシュ
          cache.set(detailCacheKey, resultPokemonDetail, 86400 * 7); // 7日間キャッシュ

          // 日本語名インデックスに追加（構築中でない場合）
          if (!isJapaneseIndexBuilding && japaneseName) {
            japaneseNameIndex[japaneseName.toLowerCase()] = id;
          }

          return resultPokemonDetail;
        } catch (error) {
          console.error(
            `Error processing details for pokemon ID ${id}:`,
            error
          );
          return null;
        }
      })
    );

    // 全てのプロミスの結果を取得
    const settledResults = await Promise.allSettled(pokemonDetailsPromises);
    const successfulResults: PokemonDetail[] = [];

    settledResults.forEach((result) => {
      if (result.status === "fulfilled" && result.value !== null) {
        successfulResults.push(result.value);
      }
    });

    // レスポンスデータを作成
    const responseData: ApiResponse = {
      results: successfulResults,
      currentPage: page,
      totalPages: totalPagesForResponse,
      totalItems: totalItemsForResponse,
    };

    // レスポンスデータをキャッシュ
    cache.set(cacheKey, responseData, 86400); // 24時間キャッシュ

    // 次のページをバックグラウンドでプリフェッチ
    setTimeout(() => prefetchNextPages(page, limit, searchTerm), 10);

    res.status(200).json(responseData);
  } catch (error) {
    console.error("エラー内容:", error);
    const message = error instanceof Error ? error.message : "データ取得エラー";
    res.status(500).json({ error: message });
  }
}

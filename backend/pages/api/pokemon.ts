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

// 日本語名インデックスを追加
const japaneseNameIndex: { [key: string]: string } = {};
let isJapaneseIndexBuilding = false;

// 日本語名インデックスを構築する関数
const buildJapaneseNameIndex = async () => {
  if (isJapaneseIndexBuilding) return;
  isJapaneseIndexBuilding = true;

  console.log("Building Japanese name index...");

  try {
    // 全ポケモンのリストを取得
    const response = await fetch(
      "https://pokeapi.co/api/v2/pokemon?limit=1500"
    );
    if (!response.ok) {
      throw new Error(`Failed to fetch pokemon list: ${response.status}`);
    }

    const data = (await response.json()) as PokeApiResponse;
    const allPokemon = data.results;

    // 並列処理数を制限しながら日本語名を取得
    const batchSize = 10;

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
            japaneseNameIndex[jaName.toLowerCase()] = id;
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

    console.log(
      "Japanese name index built successfully with",
      Object.keys(japaneseNameIndex).length,
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
  ); // DEBUG

  // const cacheKey = `pokemonData-page-${page}-limit-${limit}${searchTerm ? '-search-' + searchTerm : ''}`;
  // const cachedData = cache.get<ApiResponse>(cacheKey);
  // if (cachedData) {
  //   res.status(200).json(cachedData);
  //   return;
  // }

  const hiraganaToKatakana = (str: string): string => {
    return str.replace(/[ぁ-ゔゞ゛゜]/g, function (match) {
      const charCode = match.charCodeAt(0) + 0x60;
      return String.fromCharCode(charCode);
    });
  };

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

      // 実際の総数を1025匹に修正（実際に存在する数）
      // PokeAPIは1302匹と返しますが、実際には1025匹しか存在しない
      totalItemsForResponse = Math.min(1025, listData.count);
    }

    totalPagesForResponse = Math.ceil(totalItemsForResponse / limit);
    if (totalPagesForResponse === 0 && totalItemsForResponse > 0)
      totalPagesForResponse = 1;
    // 修正: totalItemsForResponseが0ならtotalPagesForResponseも0に
    if (totalItemsForResponse === 0) totalPagesForResponse = 0;

    console.log(
      `Total items for response: ${totalItemsForResponse}, Calculated total pages for response: ${totalPagesForResponse}`
    );

    // リクエストされたページが計算上の総ページ数を超えている場合 (検索なしの場合のみ有効だったが、検索時も考慮)
    // ただし、検索結果が0件の場合にこれをすると、何も表示されなくなる。
    // 検索モードで結果が0件の場合は、totalItems=0, totalPages=0 (または1) として空を返すのが適切
    if (
      !searchTerm &&
      page > totalPagesForResponse &&
      totalItemsForResponse > 0
    ) {
      console.log(
        `Requested page ${page} is greater than total pages ${totalPagesForResponse}. Returning empty results.`
      );
      res.status(200).json({
        results: [],
        currentPage: page,
        totalPages: totalPagesForResponse,
        totalItems: totalItemsForResponse,
      });
      return;
    }

    if (searchTerm && pokemonsToProcess.length === 0) {
      console.log(
        "Search term provided, but no Pokemon matched after filtering. Returning empty results."
      );
      res.status(200).json({
        results: [],
        currentPage: 1, // 検索結果がない場合は1ページ目として返す
        totalPages: 0, // 結果がないのでページもない
        totalItems: 0, // 結果がないのでアイテムもない
      });
      return;
    }

    console.log(
      `[Before Detail Fetch] pokemonsToProcess length: ${pokemonsToProcess.length}, totalItemsForResponse: ${totalItemsForResponse}, totalPagesForResponse: ${totalPagesForResponse}`
    ); // DEBUG

    console.log(
      `Checking page bounds: page=${page}, totalPagesForResponse=${totalPagesForResponse}`
    ); // DEBUG
    if (page > totalPagesForResponse && totalPagesForResponse > 0) {
      console.log(
        `Page ${page} is out of bounds (${totalPagesForResponse} total pages). Using max page.`
      );
      // 注意: ここで currentPage を totalPagesForResponse に設定しても、
      // API応答のcurrentPageは元のリクエストパラメータのページのままです
      // レスポンスではなくここでページネーションを修正します
      // 以下の行を新たに追加:
      const correctedOffset = (totalPagesForResponse - 1) * limit;

      if (!searchTerm) {
        // 検索がない場合は、正しいページの情報を再取得
        const listResponse = await fetch(
          `https://pokeapi.co/api/v2/pokemon?limit=${limit}&offset=${correctedOffset}`
        );
        if (listResponse.ok) {
          const listData = (await listResponse.json()) as PokeApiResponse;
          pokemonsToProcess = listData.results;
        }
      } else if (pokemonsToProcess.length === 0 && totalItemsForResponse > 0) {
        // 検索時のページ範囲修正（必要に応じて修正）
        const correctedOffset = (totalPagesForResponse - 1) * limit;
        // 元の全検索結果から正しい範囲を取得（ここではすでにスライス済みなので実装省略）
        console.log(`Corrected offset for search: ${correctedOffset}`);
      }
    }

    const pokemonDetailsPromises = pokemonsToProcess.map((pokemonListItem) =>
      pLimitInstance(async (): Promise<PokemonDetail | null> => {
        const id = pokemonListItem.url.split("/").filter(Boolean).pop();
        console.log(
          `[Detail Fetch Start] For ID: ${id} (from ${pokemonListItem.url})`
        ); // DEBUG
        if (!id) {
          console.error(
            `Could not extract ID from URL: ${pokemonListItem.url}`
          );
          return null; // IDがなければ処理中断
        }

        try {
          console.log(`Fetching pokemon data for ID: ${id}`);
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
          console.log(
            `Fetched pokemonData for ${id}:`,
            pokemonData.name,
            pokemonData.sprites?.front_default
          );

          console.log(`Fetching species data for ID: ${id}`);
          const speciesResponse = await fetch(
            `https://pokeapi.co/api/v2/pokemon-species/${id}`
          );
          if (!speciesResponse.ok) {
            console.error(
              `Failed to fetch species ${id}: ${speciesResponse.status} ${speciesResponse.statusText}`
            );
            // 種族データがなくてもポケモン名でフォールバックするので、null を返さずに続行も検討できるが、一旦現状維持
            return null; // 種族データの取得失敗
          }
          const speciesData =
            (await speciesResponse.json()) as ExternalSpeciesData;
          // console.log(`Fetched speciesData for ${id}:`, JSON.stringify(speciesData.names, null, 2)); // ★必要に応じて詳細ログ

          const japaneseNameEntry = speciesData.names.find(
            (entry) =>
              entry.language.name === "ja-Hrkt" || entry.language.name === "ja"
          );
          const japaneseName = japaneseNameEntry?.name || pokemonData.name;
          console.log(`Determined name for ${id}: ${japaneseName}`);

          const image =
            pokemonData.sprites.other?.["official-artwork"]?.front_default ||
            pokemonData.sprites.front_default ||
            "/pokeball.png";
          console.log(`Determined image for ${id}: ${image}`);

          // タイプ情報の取得と処理
          const japaneseTypes: string[] = [];
          if (pokemonData.types && pokemonData.types.length > 0) {
            // タイプデータのキャッシュ用オブジェクト
            const typeCache: { [key: string]: string } = {
              normal: "ノーマル",
              fire: "ほのお",
              water: "みず",
              electric: "でんき",
              grass: "くさ",
              ice: "こおり",
              fighting: "かくとう",
              poison: "どく",
              ground: "じめん",
              flying: "ひこう",
              psychic: "エスパー",
              bug: "むし",
              rock: "いわ",
              ghost: "ゴースト",
              dragon: "ドラゴン",
              dark: "あく",
              steel: "はがね",
              fairy: "フェアリー",
            };

            // タイプを順番に処理
            for (const typeEntry of pokemonData.types) {
              // 英語のタイプ名を取得
              const englishTypeName = typeEntry.type.name;

              // キャッシュから日本語名を取得するか、APIから取得
              if (typeCache[englishTypeName]) {
                japaneseTypes.push(typeCache[englishTypeName]);
              } else {
                try {
                  console.log(
                    `Fetching type data from URL: ${typeEntry.type.url}`
                  );
                  const typeResponse = await fetch(typeEntry.type.url);
                  if (!typeResponse.ok) {
                    console.error(
                      `Failed to fetch type details for ${englishTypeName}: ${typeResponse.status}`
                    );
                    japaneseTypes.push(englishTypeName); // エラー時は英語名で代用
                    continue;
                  }

                  const typeData =
                    (await typeResponse.json()) as ExternalTypeData;
                  const japaneseTypeNameEntry = typeData.names.find(
                    (nameEntry) =>
                      nameEntry.language.name === "ja-Hrkt" ||
                      nameEntry.language.name === "ja"
                  );

                  const japaneseTypeName =
                    japaneseTypeNameEntry?.name || englishTypeName;
                  japaneseTypes.push(japaneseTypeName);
                } catch (typeError) {
                  console.error(
                    `Error fetching type details for ${englishTypeName}:`,
                    typeError
                  );
                  japaneseTypes.push(englishTypeName); // エラー時は英語名で代用
                }
              }
            }
          }
          console.log(
            `Determined types for ${id}: ${japaneseTypes.join(", ")}`
          );

          const resultPokemonDetail: PokemonDetail = {
            id,
            name: japaneseName,
            image: image,
            number: `No.${String(id).padStart(3, "0")}`,
            types: japaneseTypes, // タイプ情報を追加
          };
          console.log(
            `Successfully processed pokemon ID ${id}:`,
            JSON.stringify(resultPokemonDetail)
          );
          return resultPokemonDetail;
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
    settledResults.forEach((result, idx) => {
      // DEBUG: idx追加
      if (result.status === "fulfilled" && result.value !== null) {
        successfulResults.push(result.value);
      } else if (result.status === "rejected") {
        console.error(
          `Promise for pokemon detail (index: ${idx}, url: ${pokemonsToProcess[idx]?.url}) was rejected:`,
          result.reason
        ); // DEBUG
      } else if (result.value === null) {
        console.warn(
          `Promise for pokemon detail (index: ${idx}, url: ${pokemonsToProcess[idx]?.url}) resolved to null.`
        ); // DEBUG
      }
    });
    console.log(
      `[After Detail Fetch] successfulResults length: ${successfulResults.length}`
    ); // DEBUG

    const responseData: ApiResponse = {
      results: successfulResults,
      currentPage: page,
      totalPages: totalPagesForResponse,
      totalItems: totalItemsForResponse,
    };

    // cache.set(cacheKey, responseData);
    console.log(
      `[Final Response Data] currentPage: ${page}, totalPages: ${totalPagesForResponse}, totalItems: ${totalItemsForResponse}, results count: ${successfulResults.length}`
    ); // DEBUG
    res.status(200).json(responseData);
  } catch (error) {
    console.error("エラー内容:", error);
    const message = error instanceof Error ? error.message : "データ取得エラー";
    res.status(500).json({ error: message });
  }
}

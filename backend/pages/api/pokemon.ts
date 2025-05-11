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
      console.log(
        `Search term provided: ${searchTerm}, fetching up to 2000 Pokemon for filtering.`
      );
      // 検索時は全件取得を試みる (PokeAPIの制限とパフォーマンスに注意)
      // PokeAPIの全件数はおおよそ1300程度なので、limit=1500や2000程度でほぼ全件取れる想定
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
      totalItemsForResponse = allPokemonData.results.length; // 実際に取得できた件数
      console.log(
        `Fetched ${totalItemsForResponse} Pokemon for search filtering.`
      );

      const originalQueryLower = searchTerm.toLowerCase();
      const katakanaQueryLower = hiraganaToKatakana(originalQueryLower);

      pokemonsToProcess = allPokemonData.results.filter((pokemon) => {
        // const pokemonNameLower = pokemon.name.toLowerCase(); // これは後続の nameBasedMatch で使われる
        // 下記の古い nameMatch と idMatch の定義は削除
        // const nameMatch =
        //   pokemonNameLower.includes(originalQueryLower) ||
        //   pokemonNameLower.includes(katakanaQueryLower);

        // let idMatch = false;
        // const searchId = originalQueryLower.match(/^\\d+$/)
        //   ? originalQueryLower
        //   : null;
        // if (searchId) {
        //   const pokemonIdFromUrl = pokemon.url.split("/").filter(Boolean).pop();
        //   if (pokemonIdFromUrl === searchId) {
        //     idMatch = true;
        //   }
        // }

        // 注意: PokeAPIのリストのnameはローマ字。日本語名での検索は、全件の詳細情報を取得しないと不可。
        // ここでは、ローマ字名と、ユーザーが入力した日本語（のカタカナ変換版）での部分一致、およびIDでの一致を試みる。
        // より高度な日本語名検索は、全件日本語名リストを別途持つか、詳細取得後のフィルタリングが必要。
        // 今回は、ひとまずローマ字名に対するoriginalQueryLower/katakanaQueryLowerでの検索と、ID検索に留める。
        // 実際のポケモン名は詳細取得時に日本語化されるため、この段階ではローマ字名でのフィルタリングが主。

        // searchTermに日本語が含まれる場合、pokemon.name（ローマ字）との直接比較は効果が薄い。
        // このフィルタリングは、ID検索か、searchTermがローマ字の場合に主に機能する。
        // 日本語名での検索は、後続の詳細取得後のフィルタリングで行う方が正確だが、パフォーマンスが非常に悪化する。
        // ここでは、ID または searchTerm がローマ字であると期待したフィルタリングに留める。

        // 簡易的なフィルタリング: ローマ字名、またはURLから取れるIDでフィルタ
        // (pokemon.name はローマ字名)
        const nameIsProbablyLatin = /^[a-z0-9\\-]+$/.test(pokemon.name);
        let nameBasedMatch = false;
        if (nameIsProbablyLatin) {
          nameBasedMatch =
            pokemon.name.toLowerCase().includes(originalQueryLower) ||
            pokemon.name.toLowerCase().includes(katakanaQueryLower);
        }

        const pokemonId = pokemon.url.split("/").filter(Boolean).pop();
        const idBasedMatch = pokemonId === originalQueryLower; // searchTermがIDの場合

        return nameBasedMatch || idBasedMatch;
      });
      console.log(
        `Filtered down to ${pokemonsToProcess.length} Pokemon before pagination and detail fetching.`
      );
      totalItemsForResponse = pokemonsToProcess.length; // フィルタ後の件数を総数とする

      // フィルタリング後のリストに対してページネーション
      const startIndex = offset;
      const endIndex = offset + limit;
      pokemonsToProcess = pokemonsToProcess.slice(startIndex, endIndex);
      console.log(
        `Sliced to ${pokemonsToProcess.length} Pokemon for page ${page}.`
      );
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
      totalItemsForResponse = listData.count; // 検索なしの場合はPokeAPIの総件数
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
      // Requested page is out of bounds
      console.log(
        `Page ${page} is out of bounds (${totalPagesForResponse} total pages). Returning empty for out of bounds.`
      ); // DEBUG
      res.status(200).json({
        results: [],
        currentPage: page,
        totalPages: totalPagesForResponse,
        totalItems: totalItemsForResponse,
      });
      return;
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
            const typePromises = pokemonData.types.map(async (typeEntry) => {
              try {
                console.log(
                  `Fetching type data from URL: ${typeEntry.type.url}`
                );
                const typeResponse = await fetch(typeEntry.type.url);
                if (!typeResponse.ok) {
                  console.error(
                    `Failed to fetch type details for ${typeEntry.type.name}: ${typeResponse.status}`
                  );
                  return null; // タイプ詳細の取得失敗
                }
                const typeData =
                  (await typeResponse.json()) as ExternalTypeData;
                const japaneseTypeNameEntry = typeData.names.find(
                  (nameEntry) =>
                    nameEntry.language.name === "ja-Hrkt" ||
                    nameEntry.language.name === "ja"
                );
                return japaneseTypeNameEntry?.name || typeEntry.type.name;
              } catch (typeError) {
                console.error(
                  `Error fetching type details for ${typeEntry.type.name}:`,
                  typeError
                );
                return typeEntry.type.name; // エラー時は英語名フォールバック
              }
            });
            const resolvedTypes = await Promise.all(typePromises);
            resolvedTypes.forEach((typeName) => {
              if (typeName) japaneseTypes.push(typeName);
            });
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

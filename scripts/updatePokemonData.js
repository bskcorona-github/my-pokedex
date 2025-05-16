// PokeAPIからポケモンデータを取得してpokemonData.jsonを更新するスクリプト
const fs = require("fs");
const path = require("path");
const https = require("https");

// PokeAPIからJSONデータを取得する関数
function fetchFromPokeApi(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on("error", (err) => {
        reject(err);
      });
  });
}

// メイン処理
async function main() {
  try {
    console.log("ポケモンデータの更新を開始します...");

    // 取得するポケモンの世代または数を指定
    const useAllGenerations = true; // すべての世代を取得する場合はtrue

    // 取得するポケモンの数
    let pokemonLimit;
    if (useAllGenerations) {
      pokemonLimit = 1500; // 全世代のポケモン（約1000匹以上）+ メガ進化など
      console.log("全世代のポケモンを取得します");
    } else {
      pokemonLimit = 151; // 第1世代のみ
      console.log("第1世代のポケモンのみを取得します");
    }

    // PokeAPIからポケモンリストを取得
    const pokemonListUrl = `https://pokeapi.co/api/v2/pokemon?limit=${pokemonLimit}`;
    const pokemonList = await fetchFromPokeApi(pokemonListUrl);

    // ポケモンの詳細情報を取得
    const pokemonData = [];

    // 進行状況表示用
    let completed = 0;
    const total = pokemonList.results.length;

    for (const pokemon of pokemonList.results) {
      // ポケモン詳細情報を取得
      const pokemonDetail = await fetchFromPokeApi(pokemon.url);

      // 種族情報から日本語名を取得
      const speciesData = await fetchFromPokeApi(pokemonDetail.species.url);
      const jaName =
        speciesData.names.find(
          (name) =>
            name.language.name === "ja-Hrkt" || name.language.name === "ja"
        )?.name || pokemon.name;

      // データを整形
      pokemonData.push({
        id: String(pokemonDetail.id),
        name_en: pokemon.name,
        name_ja: jaName,
        number: String(pokemonDetail.id).padStart(3, "0"),
      });

      // メガ進化があれば追加
      const megaForms = speciesData.varieties.filter((variety) =>
        variety.pokemon.name.includes("-mega")
      );

      for (const megaForm of megaForms) {
        const megaDetail = await fetchFromPokeApi(megaForm.pokemon.url);
        pokemonData.push({
          id: String(megaDetail.id),
          name_en: megaForm.pokemon.name,
          name_ja: `メガ${jaName}`,
          number: String(pokemonDetail.id).padStart(3, "0"),
        });
      }

      // 進行状況表示
      completed++;
      console.log(
        `処理中... ${completed}/${total} (${Math.floor(
          (completed / total) * 100
        )}%)`
      );

      // APIレート制限対策のために少し待機（短縮）
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    // JSONファイルとして保存
    const outputPath = path.resolve("./backend/pokemonData.json");
    fs.writeFileSync(outputPath, JSON.stringify(pokemonData, null, 2), "utf8");

    console.log(
      `完了！${pokemonData.length}匹のポケモンデータを ${outputPath} に保存しました。`
    );
  } catch (error) {
    console.error("エラーが発生しました:", error);
    process.exit(1);
  }
}

main();

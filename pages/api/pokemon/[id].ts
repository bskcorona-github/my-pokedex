import type { NextApiRequest, NextApiResponse } from "next";

// タイプの日本語マッピング
const typeMap: { [key: string]: string } = {
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

// 特性の日本語マッピング
const abilityMap: { [key: string]: string } = {
  overgrow: "しんりょく",
  chlorophyll: "ようりょくそ",
};

// 基本ステータスの日本語マッピング
const statMap: { [key: string]: string } = {
  hp: "HP",
  attack: "こうげき",
  defense: "ぼうぎょ",
  "special-attack": "とくこう",
  "special-defense": "とくぼう",
  speed: "すばやさ",
};

// 生息地の日本語マッピング
const habitatMap: { [key: string]: string } = {
  cave: "洞窟",
  forest: "森",
  grassland: "草原",
  mountain: "山",
  rare: "珍しい",
  "rough-terrain": "荒地",
  sea: "海",
  urban: "都会",
  "waters-edge": "水辺",
};

// 色の日本語マッピング
const colorMap: { [key: string]: string } = {
  black: "黒",
  blue: "青",
  brown: "茶",
  gray: "灰",
  green: "緑",
  pink: "ピンク",
  purple: "紫",
  red: "赤",
  white: "白",
  yellow: "黄",
};

// 形状の日本語マッピング
const shapeMap: { [key: string]: string } = {
  ball: "ボール型",
  squid: "イカ型",
  fish: "魚型",
  arms: "手足型",
  blob: "塊",
  upright: "直立型",
  quadruped: "四足型",
  wings: "翼型",
  tentacles: "触手型",
  heads: "頭型",
  humanoid: "人型",
  "bug-wings": "昆虫の羽型",
  armor: "鎧型",
};

// 型のインターフェースを定義
interface PokemonType {
  type: {
    name: string;
  };
}

interface PokemonAbility {
  ability: {
    name: string;
  };
}

interface PokemonStat {
  stat: {
    name: string;
  };
  base_stat: number;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // CORSヘッダー設定 - すべてのオリジンを許可
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

  const { id } = req.query;

  try {
    const response = await fetch(`https://pokeapi.co/api/v2/pokemon/${id}`);
    const data = await response.json();

    const speciesResponse = await fetch(data.species.url);
    const speciesData = await speciesResponse.json();

    // 日本語の名前を取得
    const japaneseName =
      speciesData.names.find(
        (entry: { language: { name: string }; name: string }) =>
          entry.language.name === "ja"
      )?.name || data.name;

    // 生息地、色、形状を日本語に変換
    const habitat = habitatMap[speciesData.habitat?.name] || "不明";
    const color = colorMap[speciesData.color?.name] || "不明";
    const shape = shapeMap[speciesData.shape?.name] || "不明";

    // 応答データの作成
    res.status(200).json({
      name: japaneseName,
      image: data.sprites.front_default,
      height: data.height,
      weight: data.weight,
      types: data.types.map(
        (typeInfo: PokemonType) =>
          typeMap[typeInfo.type.name] || typeInfo.type.name
      ),
      abilities: data.abilities.map(
        (abilityInfo: PokemonAbility) =>
          abilityMap[abilityInfo.ability.name] || abilityInfo.ability.name
      ),
      stats: data.stats.map((stat: PokemonStat) => ({
        name: statMap[stat.stat.name] || stat.stat.name,
        value: stat.base_stat,
      })),
      habitat,
      color,
      shape,
    });
  } catch (error) {
    console.error("エラー内容:", error);
    res.status(500).json({ error: "データ取得エラー" });
  }
}

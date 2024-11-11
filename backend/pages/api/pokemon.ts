// backend/pages/api/pokemon.ts
import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // CORS設定
  res.setHeader('Access-Control-Allow-Origin', 'https://my-pokedex-frontend.vercel.app'); // フロントエンドURLに限定
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // OPTIONSメソッドの場合のプリフライトリクエスト対応
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const response = await fetch('https://pokeapi.co/api/v2/pokemon?limit=151');
    const data = await response.json();

    const results = await Promise.all(
      data.results.map(async (pokemon: { name: string; url: string }) => {
        const id = pokemon.url.split('/').filter(Boolean).pop(); // URLからIDを抽出
        const pokemonResponse = await fetch(`https://pokeapi.co/api/v2/pokemon/${id}`);
        const pokemonData = await pokemonResponse.json();

        const speciesResponse = await fetch(`https://pokeapi.co/api/v2/pokemon-species/${id}`);
        const speciesData = await speciesResponse.json();

        const japaneseName = speciesData.names.find(
          (entry: { language: { name: string }; name: string }) => entry.language.name === 'ja'
        )?.name || pokemon.name;

        return {
          id,
          name: japaneseName,
          englishName: pokemon.name,
          image: pokemonData.sprites.front_default || '', // 画像URLが存在しない場合に対応
        };
      })
    );

    res.status(200).json({ results });
  } catch (error) {
    console.error('エラー内容:', error);
    res.status(500).json({ error: 'データ取得エラー' });
  }
}

import type { NextApiRequest, NextApiResponse } from 'next';
import fetch from 'node-fetch';
import NodeCache from 'node-cache';
import pLimit from 'p-limit';

const limit = pLimit(5);
const cache = new NodeCache({ stdTTL: 3600 }); // キャッシュを1時間保持

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Access-Control-Allow-Origin', 'https://my-pokedex-frontend.vercel.app');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const cachedData = cache.get('pokemonData');
  if (cachedData) {
    res.status(200).json({ results: cachedData });
    return;
  }

  try {
    const response = await fetch('https://pokeapi.co/api/v2/pokemon?limit=151');
    const data = (await response.json()) as { results: { name: string; url: string }[] };

    const results = await Promise.all(
      data.results.map((pokemon) =>
        limit(async () => {
          const id = pokemon.url.split('/').filter(Boolean).pop();

          // ポケモンの詳細データ取得（名前と画像）
          const pokemonResponse = await fetch(`https://pokeapi.co/api/v2/pokemon/${id}`);
          const pokemonData = (await pokemonResponse.json()) as {
            sprites: { front_default: string | null };
            name: string;
          };

          // ポケモン種データから日本語名を取得
          const speciesResponse = await fetch(`https://pokeapi.co/api/v2/pokemon-species/${id}`);
          const speciesData = (await speciesResponse.json()) as {
            names: { language: { name: string }; name: string }[];
          };

          const japaneseName =
            speciesData.names.find((entry) => entry.language.name === 'ja')?.name || pokemonData.name;

          return {
            id,
            name: japaneseName,  // 日本語名
            englishName: pokemonData.name,  // 英語名
            image: pokemonData.sprites.front_default || '',
            ballImage: '/pokeball.png',
            number: `No.${String(id).padStart(3, '0')}` // 3桁の番号
          };
        })
      )
    );

    cache.set('pokemonData', results); // キャッシュに保存
    res.status(200).json({ results });
  } catch (error) {
    console.error('エラー内容:', error);
    res.status(500).json({ error: 'データ取得エラー' });
  }
}

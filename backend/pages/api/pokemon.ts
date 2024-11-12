import type { NextApiRequest, NextApiResponse } from 'next';
import fetch from 'node-fetch';
import pLimit from 'p-limit';

const limit = pLimit(5); // 最大同時リクエスト数を5に設定

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Access-Control-Allow-Origin', 'https://my-pokedex-frontend.vercel.app');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const response = await fetch('https://pokeapi.co/api/v2/pokemon?limit=151');
    const data = await response.json();

    const results = await Promise.all(
      data.results.map((pokemon: { name: string; url: string }) =>
        limit(async () => {
          const id = pokemon.url.split('/').filter(Boolean).pop();
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
            image: pokemonData.sprites.front_default || '',
          };
        })
      )
    );

    res.status(200).json({ results });
  } catch (error) {
    console.error('エラー内容:', error);
    res.status(500).json({ error: 'データ取得エラー' });
  }
}

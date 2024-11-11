import express, { Request, Response } from 'express';
import cors from 'cors';
import fetch from 'node-fetch';

const app = express();
const PORT = process.env.PORT || 3001;

// CORS設定
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type']
}));

// ポケモン一覧エンドポイント
app.get('/api/pokemon', async (req: Request, res: Response) => {
  try {
    const response = await fetch('https://pokeapi.co/api/v2/pokemon?limit=151');
    const data = await response.json();

    const results = await Promise.all(
      data.results.map(async (pokemon: { name: string; url: string }) => {
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
          image: pokemonData.sprites.front_default || ''
        };
      })
    );

    res.json({ results });
  } catch (error) {
    console.error('エラー内容:', error);
    res.status(500).json({ error: 'データ取得エラー' });
  }
});

// ポケモン詳細エンドポイント
app.get('/api/pokemon/:id', async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const response = await fetch(`https://pokeapi.co/api/v2/pokemon/${id}`);
    const data = await response.json();

    const speciesResponse = await fetch(data.species.url);
    const speciesData = await speciesResponse.json();

    const japaneseName = speciesData.names.find(
      (entry: { language: { name: string }; name: string }) => entry.language.name === 'ja'
    )?.name || data.name;

    res.json({
      name: japaneseName,
      image: data.sprites.front_default,
      height: data.height,
      weight: data.weight,
    });
  } catch (error) {
    console.error('エラー内容:', error);
    res.status(500).json({ error: 'データ取得エラー' });
  }
});

// サーバーの起動（ローカル確認用）
app.listen(PORT, () => {
  console.log(`サーバーがポート${PORT}で起動しました`);
});

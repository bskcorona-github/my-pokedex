<template>
  <div>
    <h1>ポケモン図鑑</h1>
    <ul class="pokemon-list">
      <li v-for="pokemon in pokemons" :key="pokemon.id" class="pokemon-card">
        <div class="pokemon-header">
          <div class="pokemon-info">
            <img :src="pokemon.ballImage" class="pokeball-icon" alt="Pokeball Icon" />
            <router-link :to="`/pokemon/${pokemon.id}`" class="pokemon-link">
            <span class="pokemon-number">{{ pokemon.number }}</span>
        </router-link>
          </div>
          <router-link :to="`/pokemon/${pokemon.id}`" class="pokemon-link">
          <span class="pokemon-name">{{ pokemon.name }}</span>
        </router-link>
        </div>
        <router-link :to="`/pokemon/${pokemon.id}`" class="pokemon-link">
          <img :src="pokemon.image" alt="ポケモンの画像" class="pokemon-image" />
        </router-link>
      </li>
    </ul>
  </div>
</template>


<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useNuxtApp } from '#app'

interface Pokemon {
  id: string;
  name: string;
  url: string;
  image?: string;
  ballImage?: string; // モンスターボールの画像URL
  number?: string;     // ポケモンの番号
}

const pokemons = ref<Pokemon[]>([])
const { $axios } = useNuxtApp()

onMounted(async () => {
  const response = await $axios.get('/pokemon')
  const results = response.data.results

  pokemons.value = results.map((pokemon: any) => ({
    id: pokemon.id,
    name: pokemon.name,
    url: pokemon.url,
    image: pokemon.image,
    ballImage: '/pokeball.png',   // モンスターボール画像のURL
    number: pokemon.number          // ポケモンの番号
  }))
})
</script>
<style scoped>
body {
  background-color: #e0f7fa; 
  margin: 0;
  padding: 0;
  font-family: Arial, sans-serif;
}

.pokemon-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 20px;
  list-style-type: none;
  padding: 0;
}

.pokemon-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 150px;
  border-radius: 10px;
  overflow: hidden;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
  background-color: #f3f4f6;
  transition: transform 0.2s;
  text-align: center;
}

.pokemon-card:hover {
  transform: scale(1.05);
}

.pokemon-link {
  display: block;
  text-decoration: none;
  color: inherit;
}

.pokemon-header {
  background-color: #a4d0e7; /* ヘッダーの色を少し濃く変更 */
  width: 100%;
  padding: 10px 0;
  color: #333;
  font-weight: bold;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.pokemon-info {
  display: flex;
  align-items: center;
  margin-bottom: 5px;
  text-decoration: none; /* 下線を消す */
}

.pokeball-icon {
  width: 20px;
  height: 20px;
  margin-right: 5px;
  background-color: #a4d0e7; /* ヘッダー部分と同じ背景色 */
  border-radius: 50%; /* 円形の背景を適用 */
  padding: 2px; /* モンスターボールの画像周りに余白を追加 */
}

.pokemon-number {
  font-size: 12px;
  font-weight: bold;
  color: #fff; /* 白文字に変更 */
}

.pokemon-name {
  font-size: 16px;
  font-weight: bold;
  color: #00796b;
  text-decoration: none; /* 下線を消す */
}

.pokemon-image {
  width: 100px;
  height: 100px;
  padding: 10px;
}
</style>



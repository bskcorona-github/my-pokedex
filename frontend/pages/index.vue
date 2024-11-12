<template>
  <div>
    <h1>ポケモン図鑑</h1>
    <ul class="pokemon-list">
      <li v-for="pokemon in pokemons" :key="pokemon.id" class="pokemon-card">
        <!-- ポケモンカード全体をリンクで囲む -->
        <router-link :to="`/pokemon/${pokemon.id}`" class="pokemon-link">
          <div class="pokemon-header">
            <div class="pokemon-info">
              <img :src="pokemon.ballImage" class="pokeball-icon" alt="Pokeball Icon" />
              <span class="pokemon-number">{{ pokemon.number }}</span>
            </div>
            <span class="pokemon-name">{{ pokemon.name }}</span>
          </div>
          <div class="pokemon-image-wrapper">
            <img :src="pokemon.image" alt="ポケモンの画像" class="pokemon-image" />
          </div>
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

.pokemon-header {
  background-color: #d1e7f8;
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
  text-decoration: none; /* リンク下線を削除 */
  color: inherit;
}

.pokemon-info:hover {
  color: #00796b;
}

.pokeball-icon {
  width: 20px;
  height: 20px;
  margin-right: 5px;
}

.pokemon-number {
  font-size: 12px;
  font-weight: bold;
  color: #555;
}

.pokemon-name {
  font-size: 16px;
  font-weight: bold;
  color: #00796b;
  text-decoration: none; /* リンク下線を削除 */
}

.pokemon-image-wrapper {
  position: relative;
  width: 100px;
  height: 100px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-image: url('/pokeball-bg.png');
  background-size: 80%;
  background-position: center;
  background-repeat: no-repeat;
}

.pokemon-image {
  position: relative;
  width: 80px;
  height: 80px;
  z-index: 1;
}
</style>


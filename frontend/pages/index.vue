<template>
  <div>
    <h1>ポケモン図鑑</h1>
    <ul class="pokemon-list">
      <li v-for="pokemon in pokemons" :key="pokemon.id" class="pokemon-card">
        <router-link :to="`/pokemon/${pokemon.id}`">
          <!-- モンスターボールの画像とポケモンの番号を表示 -->
          <div class="pokemon-info">
            <img :src="pokemon.ballImage" class="pokeball-icon" alt="Pokeball Icon" />
            <span class="pokemon-number">{{ pokemon.number }}</span>
          </div>
          <img :src="pokemon.image" alt="ポケモンの画像" width="100" height="100" />
        </router-link>
        <router-link :to="`/pokemon/${pokemon.id}`">{{ pokemon.name }}</router-link>
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
    ballImage: pokemon.ballImage,   // モンスターボール画像のURL
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
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 10px;
  text-align: center;
  background-color: #f9f9f9;
  transition: transform 0.2s;
}

.pokemon-card:hover {
  transform: scale(1.05);
}

.pokemon-info {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  width: 100%;
  margin-bottom: 5px;
}

.pokeball-icon {
  width: 20px;
  height: 20px;
  margin-right: 5px;
}

.pokemon-number {
  font-size: 12px;
  font-weight: bold;
}
</style>

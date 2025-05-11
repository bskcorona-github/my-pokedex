<template>
  <div>
    <h1>ポケモン図鑑</h1>

    <div v-if="isLoading" class="loading-indicator">読み込み中...</div>

    <ul class="pokemon-list">
      <li v-for="pokemon in pokemons" :key="pokemon.id" class="pokemon-card">
        <div class="pokemon-header">
          <div class="pokemon-info">
            <img
              :src="pokemon.ballImage"
              class="pokeball-icon"
              alt="Pokeball Icon"
            />
            <router-link :to="`/pokemon/${pokemon.id}`" class="pokemon-link">
              <span class="pokemon-number">{{ pokemon.number }}</span>
            </router-link>
          </div>
          <router-link :to="`/pokemon/${pokemon.id}`" class="pokemon-link">
            <span class="pokemon-name">{{ pokemon.name }}</span>
          </router-link>
        </div>
        <router-link :to="`/pokemon/${pokemon.id}`" class="pokemon-link">
          <img
            :src="pokemon.image"
            alt="ポケモンの画像"
            class="pokemon-image"
            loading="lazy"
          />
        </router-link>
      </li>
    </ul>

    <div class="pagination-controls" v-if="totalPages > 0 && !isLoading">
      <button @click="goToFirstPage" :disabled="currentPage === 1">
        最初へ
      </button>
      <button @click="goToPreviousPage" :disabled="currentPage === 1">
        前へ
      </button>
      <span
        >ページ {{ currentPage }} / {{ totalPages }} (全
        {{ totalItems }} 匹)</span
      >
      <button @click="goToNextPage" :disabled="currentPage === totalPages">
        次へ
      </button>
      <button @click="goToLastPage" :disabled="currentPage === totalPages">
        最後へ
      </button>
    </div>
    <div
      v-if="!isLoading && pokemons.length === 0 && totalItems === 0"
      class="no-pokemon"
    >
      表示できるポケモンがいません。
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from "vue";
// import { useNuxtApp } from "#app"; // $axios を使わないのでコメントアウトまたは削除
import { useRuntimeConfig } from "#app"; // 必要に応じてこちらを有効化

interface Pokemon {
  id: string;
  name: string;
  // url: string; // urlはAPIレスポンスに依存しなくなったので削除または任意に
  image?: string;
  ballImage?: string;
  number?: string;
}

// APIレスポンスの型 (バックエンドに合わせたもの)
interface PokemonApiResponse {
  results: Pokemon[];
  currentPage: number;
  totalPages: number;
  totalItems: number;
}

const pokemons = ref<Pokemon[]>([]);
const currentPage = ref(1);
const totalPages = ref(0);
const totalItems = ref(0);
const itemsPerPage = ref(20); // 1ページあたりのアイテム数 (バックエンドのデフォルトと合わせる)
const isLoading = ref(false);

const config = useRuntimeConfig(); // この行を復活
const apiBaseUrl = config.public.apiBase; // この行を復活

const SESSION_STORAGE_KEY = "pokedexCurrentPage";

const fetchPokemons = async (page: number) => {
  if (isLoading.value) return;
  isLoading.value = true;
  try {
    const responseData = await $fetch<PokemonApiResponse>(
      `${apiBaseUrl}/pokemon`,
      {
        params: {
          page: page,
          limit: itemsPerPage.value,
        },
      }
    );
    pokemons.value = responseData.results.map((p) => ({
      ...p,
      ballImage: "/pokeball.png", // ballImage はフロントエンドで固定値を設定
    }));
    currentPage.value = responseData.currentPage;
    totalPages.value = responseData.totalPages;
    totalItems.value = responseData.totalItems;

    console.log("API Response Data:", responseData);
    console.log("Set totalPages to:", totalPages.value);
    console.log("Set totalItems to:", totalItems.value);
  } catch (error) {
    console.error("Error fetching pokemons:", error);
    totalPages.value = 0;
    totalItems.value = 0;
    // エラーハンドリング (例: ユーザーへの通知)
  } finally {
    isLoading.value = false;
  }
};

onMounted(() => {
  const savedPage = sessionStorage.getItem(SESSION_STORAGE_KEY);
  if (savedPage) {
    const pageNumber = parseInt(savedPage, 10);
    if (!isNaN(pageNumber) && pageNumber > 0) {
      currentPage.value = pageNumber;
    }
  }
  fetchPokemons(currentPage.value);
});

watch(currentPage, (newPage) => {
  if (newPage > 0) {
    sessionStorage.setItem(SESSION_STORAGE_KEY, String(newPage));
  }
  fetchPokemons(newPage);
});

watch(
  currentPage,
  (newPage, oldPage) => {
    if (newPage !== oldPage || pokemons.value.length === 0) {
      fetchPokemons(newPage);
    }
  },
  { immediate: false }
);

const goToFirstPage = () => {
  if (currentPage.value > 1) {
    currentPage.value = 1;
  }
};

const goToPreviousPage = () => {
  if (currentPage.value > 1) {
    currentPage.value--;
  }
};

const goToNextPage = () => {
  if (currentPage.value < totalPages.value) {
    currentPage.value++;
  }
};

const goToLastPage = () => {
  if (currentPage.value < totalPages.value) {
    currentPage.value = totalPages.value;
  }
};
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

.pagination-controls {
  display: flex;
  justify-content: center;
  align-items: center;
  margin-top: 20px;
  margin-bottom: 20px;
}

.pagination-controls button {
  background-color: #4caf50;
  color: white;
  border: none;
  padding: 10px 20px;
  text-align: center;
  text-decoration: none;
  display: inline-block;
  font-size: 16px;
  margin: 4px 8px;
  cursor: pointer;
  border-radius: 5px;
  transition: background-color 0.3s;
}

.pagination-controls button:disabled {
  background-color: #cccccc;
  cursor: not-allowed;
}

.pagination-controls button:hover:not(:disabled) {
  background-color: #45a049;
}

.pagination-controls span {
  margin: 0 15px;
  font-size: 16px;
}

.loading-indicator {
  text-align: center;
  padding: 20px;
  font-size: 18px;
}
.no-pokemon {
  text-align: center;
  padding: 20px;
  font-size: 18px;
  color: #777;
}
</style>

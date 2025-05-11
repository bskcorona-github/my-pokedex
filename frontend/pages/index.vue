<template>
  <div class="container">
    <header class="page-header">
      <h1>ポケモン図鑑</h1>
    </header>

    <div v-if="isLoading" class="loading-indicator">読み込み中...</div>

    <div v-if="!isLoading && pokemons.length > 0" class="pokemon-grid">
      <div v-for="pokemon in pokemons" :key="pokemon.id" class="pokemon-card">
        <router-link :to="`/pokemon/${pokemon.id}`" class="pokemon-link">
          <div class="pokemon-image-wrapper">
            <img
              :src="pokemon.image || '/pokeball.png'"
              :alt="pokemon.name"
              class="pokemon-image"
              loading="lazy"
            />
          </div>
          <div class="pokemon-info">
            <p class="pokemon-number">{{ pokemon.number }}</p>
            <h3 class="pokemon-name">{{ pokemon.name }}</h3>
            <!-- タイプ表示は将来的に実装 -->
            <!-- <div class="pokemon-types">
              <span v-for="type in pokemon.types" :key="type" class="type-tag">{{ type }}</span>
            </div> -->
          </div>
        </router-link>
      </div>
    </div>

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
      v-if="!isLoading && pokemons.length === 0 && totalItems > 0"
      class="no-pokemon"
    >
      このページにポケモンがいません。
    </div>
    <div v-if="!isLoading && totalItems === 0" class="no-pokemon">
      表示できるポケモンがいません。
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from "vue";
import { useRuntimeConfig } from "#app";

interface Pokemon {
  id: string;
  name: string;
  image?: string;
  number?: string;
  // types?: string[]; // 将来的に追加
}

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
const itemsPerPage = ref(20);
const isLoading = ref(false);

const config = useRuntimeConfig();
const apiBaseUrl = config.public.apiBase;

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
    // image が null や undefined の場合にフォールバック画像を設定する処理はテンプレート側に移動
    pokemons.value = responseData.results;
    currentPage.value = responseData.currentPage;
    totalPages.value = responseData.totalPages;
    totalItems.value = responseData.totalItems;
  } catch (error) {
    console.error("Error fetching pokemons:", error);
    pokemons.value = []; // エラー時は空にする
    totalPages.value = 0;
    totalItems.value = 0;
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

watch(currentPage, (newPage, oldPage) => {
  if (newPage > 0) {
    sessionStorage.setItem(SESSION_STORAGE_KEY, String(newPage));
  }
  // ページ番号が実際に変更された場合のみデータを再取得
  if (newPage !== oldPage) {
    fetchPokemons(newPage);
  }
});

// goTo 系関数は変更なし
const goToFirstPage = () => {
  if (currentPage.value > 1) currentPage.value = 1;
};
const goToPreviousPage = () => {
  if (currentPage.value > 1) currentPage.value--;
};
const goToNextPage = () => {
  if (currentPage.value < totalPages.value) currentPage.value++;
};
const goToLastPage = () => {
  if (currentPage.value < totalPages.value)
    currentPage.value = totalPages.value;
};
</script>

<style scoped>
.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
  font-family: "Helvetica Neue", Arial, sans-serif;
  background-color: #f9f9f9;
  min-height: 100vh;
}

.page-header {
  text-align: center;
  margin-bottom: 30px;
}

.page-header h1 {
  font-size: 2.8em;
  color: #333;
  font-weight: bold;
}

.loading-indicator,
.no-pokemon {
  text-align: center;
  padding: 40px;
  font-size: 1.2em;
  color: #777;
}

.pokemon-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 25px;
  margin-bottom: 30px;
}

.pokemon-card {
  background-color: #fff;
  border-radius: 12px;
  box-shadow: 0 6px 12px rgba(0, 0, 0, 0.08);
  overflow: hidden;
  transition: transform 0.3s ease, box-shadow 0.3s ease;
  cursor: pointer;
}

.pokemon-card:hover {
  transform: translateY(-5px);
  box-shadow: 0 12px 24px rgba(0, 0, 0, 0.12);
}

.pokemon-link {
  text-decoration: none;
  color: inherit;
  display: flex;
  flex-direction: column;
  height: 100%; /* カード全体をリンクにするために高さを100%に */
}

.pokemon-image-wrapper {
  background-color: #f3f4f6; /* 薄いグレーの背景 */
  padding: 20px;
  display: flex;
  justify-content: center;
  align-items: center;
  aspect-ratio: 1 / 1; /* 画像コンテナを正方形に */
}

.pokemon-image {
  max-width: 90%;
  max-height: 90%;
  object-fit: contain;
}

.pokemon-info {
  padding: 15px;
  text-align: center;
  flex-grow: 1; /* 画像以外の残りのスペースを埋める */
  display: flex;
  flex-direction: column;
  justify-content: center; /* 内容を中央揃え（垂直方向）*/
}

.pokemon-number {
  font-size: 0.85em;
  color: #888;
  margin-bottom: 4px;
}

.pokemon-name {
  font-size: 1.15em;
  font-weight: bold;
  color: #333;
  margin: 0; /* デフォルトマージンをリセット */
}

/* タイプ表示用のスタイル (将来用) */
/*
.pokemon-types {
  margin-top: 8px;
}
.type-tag {
  display: inline-block;
  padding: 3px 8px;
  margin: 2px;
  border-radius: 4px;
  font-size: 0.75em;
  color: white;
  text-transform: capitalize;
}
*/

.pagination-controls {
  display: flex;
  justify-content: center;
  align-items: center;
  margin-top: 30px;
  padding: 20px 0;
}

.pagination-controls button {
  background-color: #007aff; /* 主要なアクションボタンの色 */
  color: white;
  border: none;
  padding: 10px 20px;
  text-align: center;
  text-decoration: none;
  display: inline-block;
  font-size: 1em;
  margin: 0 8px;
  cursor: pointer;
  border-radius: 8px;
  transition: background-color 0.2s ease;
}

.pagination-controls button:disabled {
  background-color: #e0e0e0; /* 無効化されたボタンの色 */
  color: #a0a0a0;
  cursor: not-allowed;
}

.pagination-controls button:hover:not(:disabled) {
  background-color: #0056b3; /* ホバー時の色 */
}

.pagination-controls span {
  margin: 0 15px;
  font-size: 1em;
  color: #555;
}

/* レスポンシブ対応: 画面幅が狭い場合 (例: 600px以下) */
@media (max-width: 600px) {
  .pokemon-grid {
    grid-template-columns: repeat(
      auto-fill,
      minmax(150px, 1fr)
    ); /* モバイルではカード幅を少し小さく */
    gap: 15px;
  }
  .page-header h1 {
    font-size: 2em;
  }
  .pokemon-card {
    border-radius: 10px;
  }
  .pokemon-info {
    padding: 10px;
  }
  .pokemon-name {
    font-size: 1em;
  }
  .pagination-controls button {
    padding: 8px 12px;
    font-size: 0.9em;
    margin: 0 4px;
  }
  .pagination-controls span {
    font-size: 0.9em;
    margin: 0 8px;
  }
}

@media (max-width: 400px) {
  .pokemon-grid {
    /* さらに小さい画面では1列にすることも検討できますが、auto-fill でもある程度対応できます */
    /* grid-template-columns: 1fr; */
  }
}
</style>

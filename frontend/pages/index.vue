<template>
  <div class="container">
    <header class="page-header">
      <h1>ポケモン図鑑</h1>
    </header>

    <div class="search-container">
      <div class="search-input-area">
        <input
          type="text"
          v-model.trim="searchQueryInput"
          placeholder="名前またはID（例：ピカチュウ、25）"
          class="search-input"
          @keyup.enter="handleSearch"
        />
        <button @click="handleSearch" class="search-button">検索</button>
      </div>

      <!-- 最近の検索 -->
      <div v-if="recentSearches.length > 0" class="recent-searches">
        <span class="recent-label">最近の検索:</span>
        <div class="recent-tags">
          <span
            v-for="(query, index) in recentSearches"
            :key="index"
            class="recent-tag"
            @click="selectRecentSearch(query)"
          >
            {{ query }}
          </span>
        </div>
      </div>
    </div>

    <!-- エラーメッセージ -->
    <div v-if="errorMessage" class="error-message">
      {{ errorMessage }}
    </div>

    <!-- スケルトンローディング -->
    <div v-if="showSkeletons" class="pokemon-grid">
      <div
        v-for="(_, index) in loadingSkeletons"
        :key="`skeleton-${index}`"
        class="pokemon-card skeleton"
      >
        <div class="pokemon-image-wrapper skeleton-image"></div>
        <div class="pokemon-info">
          <div class="skeleton-line short"></div>
          <div class="skeleton-line medium"></div>
          <div class="skeleton-line long"></div>
        </div>
      </div>
    </div>

    <!-- ポケモンリスト -->
    <div v-else-if="pokemons.length > 0" class="pokemon-grid">
      <div
        v-for="pokemon in pokemons"
        :key="pokemon.id"
        class="pokemon-card"
        @mouseenter="preloadPokemonDetails(pokemon.id)"
      >
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
            <div
              v-if="getDisplayTypes(pokemon).length > 0"
              class="pokemon-types"
            >
              <span
                v-for="(typeText, index) in getDisplayTypes(pokemon)"
                :key="index"
                class="type-tag"
                :class="'type-' + typeText.toLowerCase()"
              >
                {{ typeText }}
              </span>
            </div>
          </div>
        </router-link>
      </div>
    </div>

    <!-- 検索結果がない場合 -->
    <div v-else-if="!isLoading && searchQueryInternal" class="no-pokemon">
      「{{ searchQueryInternal }}」に一致するポケモンは見つかりませんでした。
    </div>

    <!-- ポケモンがない場合 -->
    <div v-else-if="!isLoading && !isInitialLoad" class="no-pokemon">
      表示できるポケモンがいません。
    </div>

    <!-- ページネーション -->
    <div class="pagination-controls" v-if="totalPages > 0 && !isLoading">
      <button
        @click="goToFirstPage"
        :disabled="currentPage === 1"
        class="pagination-button"
      >
        <span class="pagination-icon">⟪</span>
      </button>
      <button
        @click="goToPreviousPage"
        :disabled="currentPage === 1"
        class="pagination-button"
      >
        <span class="pagination-icon">⟨</span>
      </button>
      <span class="pagination-info">
        {{ currentPage }} / {{ totalPages }}
        <span class="total-items">(全 {{ totalItems }} 匹)</span>
      </span>
      <button
        @click="goToNextPage"
        :disabled="currentPage === totalPages"
        class="pagination-button"
      >
        <span class="pagination-icon">⟩</span>
      </button>
      <button
        @click="goToLastPage"
        :disabled="currentPage === totalPages"
        class="pagination-button"
      >
        <span class="pagination-icon">⟫</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, computed, nextTick } from "vue";
import { useRuntimeConfig } from "#app";

interface Pokemon {
  id: string;
  name: string;
  image?: string;
  number?: string;
  types?: string[];
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
const isSearching = ref(false);
const searchQueryInput = ref("");
const searchQueryInternal = ref("");
const isInitialLoad = ref(true);

// スケルトンローディング用の配列
const loadingSkeletons = Array(20).fill(null);

// 新しい状態変数
const prefetchedPages = ref<{ [key: string]: PokemonApiResponse }>({});
const recentSearches = ref<string[]>([]);
const errorMessage = ref("");

const config = useRuntimeConfig();
const apiBaseUrl = config.public.apiBase;

const SESSION_STORAGE_KEY = "pokedexCurrentPage";
const LOCAL_STORAGE_RECENT_SEARCHES = "pokedexRecentSearches";

// ローカルストレージから最近の検索を読み込む
const loadRecentSearches = () => {
  try {
    const saved = localStorage.getItem(LOCAL_STORAGE_RECENT_SEARCHES);
    if (saved) {
      recentSearches.value = JSON.parse(saved).slice(0, 5);
    }
  } catch (error) {
    console.error("Failed to load recent searches", error);
  }
};

// 検索クエリを保存する
const saveSearchQuery = (query: string) => {
  if (!query) return;

  try {
    const updatedSearches = [
      query,
      ...recentSearches.value.filter((q) => q !== query),
    ].slice(0, 5);

    recentSearches.value = updatedSearches;
    localStorage.setItem(
      LOCAL_STORAGE_RECENT_SEARCHES,
      JSON.stringify(updatedSearches)
    );
  } catch (error) {
    console.error("Failed to save search query", error);
  }
};

// API通信中にスケルトンローディングを表示するためのフラグ
const showSkeletons = computed(() => {
  return isLoading.value && pokemons.value.length === 0;
});

// キャッシュキーを生成する関数
const getCacheKey = (page: number, searchTerm?: string) => {
  return `page-${page}${searchTerm ? `-search-${searchTerm}` : ""}`;
};

// 検索ボタンのクリックハンドラー
const handleSearch = () => {
  if (!searchQueryInput.value.trim()) return;

  searchQueryInternal.value = searchQueryInput.value.trim();
  saveSearchQuery(searchQueryInternal.value);
  currentPage.value = 1;
  fetchPokemons(1, searchQueryInternal.value);
};

// 検索履歴アイテムのクリックハンドラー
const selectRecentSearch = (query: string) => {
  searchQueryInput.value = query;
  handleSearch();
};

// ポケモンデータを取得する関数
const fetchPokemons = async (page: number, searchTerm?: string) => {
  if (isLoading.value) return;

  const cacheKey = getCacheKey(page, searchTerm);

  // プリフェッチしたデータがあればそれを使用
  if (prefetchedPages.value[cacheKey]) {
    const prefetchedData = prefetchedPages.value[cacheKey];
    pokemons.value = prefetchedData.results;
    currentPage.value = prefetchedData.currentPage;
    totalPages.value = prefetchedData.totalPages;
    totalItems.value = prefetchedData.totalItems;

    // 使用したキャッシュを削除
    delete prefetchedPages.value[cacheKey];

    // 次のページをプリフェッチ
    if (currentPage.value < totalPages.value) {
      prefetchPage(currentPage.value + 1, searchTerm);
    }
    return;
  }

  // プリフェッチしたデータがなければAPI通信
  errorMessage.value = "";
  isLoading.value = true;
  isSearching.value = !!searchTerm;

  try {
    const params: any = {
      page: page,
      limit: itemsPerPage.value,
    };
    if (searchTerm) {
      params.searchTerm = searchTerm;
    }

    // 直接バックエンドのAPIを呼び出す
    const responseData = await $fetch<PokemonApiResponse>(
      `${apiBaseUrl}/pokemon`,
      {
        params: params,
        // CORSの問題を解決するためのオプション
        mode: "cors",
        credentials: "omit",
      }
    );

    // データを設定
    pokemons.value = responseData.results;
    currentPage.value = responseData.currentPage;
    totalPages.value = responseData.totalPages;
    totalItems.value = responseData.totalItems;

    // 初回ロード完了
    isInitialLoad.value = false;

    // 次のページをプリフェッチ
    if (currentPage.value < totalPages.value) {
      prefetchPage(currentPage.value + 1, searchTerm);
    }
  } catch (error) {
    console.error("Error fetching pokemons:", error);
    errorMessage.value = "データの取得に失敗しました。再試行してください。";
    pokemons.value = [];
    totalPages.value = 0;
    totalItems.value = 0;
  } finally {
    isLoading.value = false;
  }
};

// バックグラウンドでページをプリフェッチする関数
const prefetchPage = async (page: number, searchTerm?: string) => {
  const cacheKey = getCacheKey(page, searchTerm);
  if (prefetchedPages.value[cacheKey]) return; // 既にプリフェッチ済み

  try {
    const params: any = {
      page: page,
      limit: itemsPerPage.value,
    };
    if (searchTerm) {
      params.searchTerm = searchTerm;
    }

    console.log(`Prefetching page ${page}...`);
    const responseData = await $fetch<PokemonApiResponse>(
      `${apiBaseUrl}/pokemon`,
      {
        params: params,
        // CORSの問題を解決するためのオプション
        mode: "cors",
        credentials: "omit",
      }
    );

    // プリフェッチしたデータを保存
    prefetchedPages.value[cacheKey] = responseData;
    console.log(`Page ${page} prefetched successfully`);
  } catch (error) {
    console.error(`Error prefetching page ${page}:`, error);
  }
};

// Debounce用のタイマー
let debounceTimer: NodeJS.Timeout | null = null;

// 検索クエリの変更を監視
watch(searchQueryInput, (newQuery) => {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  if (!newQuery.trim()) {
    // 検索クエリが空の場合、検索モードを解除して通常のページネーションに戻る
    if (searchQueryInternal.value) {
      searchQueryInternal.value = "";
      currentPage.value = 1;
      fetchPokemons(1);
    }
    return;
  }

  debounceTimer = setTimeout(() => {
    // 3文字以上の場合のみ自動検索を実行
    if (newQuery.trim().length >= 3) {
      searchQueryInternal.value = newQuery.trim();
      saveSearchQuery(searchQueryInternal.value);
      currentPage.value = 1;
      fetchPokemons(1, searchQueryInternal.value);
    }
  }, 500);
});

// ページ変更を監視
watch(currentPage, (newPage, oldPage) => {
  if (newPage === oldPage) return;

  if (newPage > 0) {
    sessionStorage.setItem(SESSION_STORAGE_KEY, String(newPage));
  }

  // 検索中かどうかに関わらず、新しいページを取得
  fetchPokemons(newPage, searchQueryInternal.value);

  // ページ変更時に画面上部にスクロール
  window.scrollTo({ top: 0, behavior: "smooth" });
});

// タイプの表示用変換関数
const getDisplayTypes = (pokemon: Pokemon): string[] => {
  if (pokemon.types && pokemon.types.length > 0) {
    return pokemon.types.filter(
      (typeText) => typeText && typeText.trim() !== ""
    );
  }
  return [];
};

// ページネーション関数
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

// ポケモン詳細ページに遷移する前にプリロード
const preloadPokemonDetails = (id: string) => {
  const img = new Image();
  img.src = `${apiBaseUrl}/pokemon/${id}`;
};

// コンポーネントマウント時の処理
onMounted(() => {
  // 最近の検索を読み込む
  loadRecentSearches();

  // 前回のページをセッションストレージから復元
  const savedPage = sessionStorage.getItem(SESSION_STORAGE_KEY);
  if (savedPage) {
    const pageNumber = parseInt(savedPage, 10);
    if (!isNaN(pageNumber) && pageNumber > 0) {
      currentPage.value = pageNumber;
    }
  }

  // 初期データ取得
  fetchPokemons(currentPage.value);
});
</script>

<style scoped>
.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
  font-family: "Rounded Mplus 1c", "Helvetica Neue", Arial, sans-serif;
  background-color: #f0f2f5;
  min-height: 100vh;
}

.page-header {
  text-align: center;
  margin-bottom: 30px;
}

.page-header h1 {
  font-size: 2.8em;
  color: #3a5da9;
  font-weight: 700;
  text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.1);
}

/* 検索関連のスタイル改善 */
.search-container {
  margin-bottom: 25px;
}

.search-input-area {
  display: flex;
  justify-content: center;
  margin-bottom: 10px;
}

.search-input {
  width: 100%;
  max-width: 500px;
  padding: 12px 20px;
  font-size: 1em;
  border: 1px solid #ddd;
  border-radius: 25px 0 0 25px;
  box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.06);
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.search-button {
  padding: 12px 20px;
  background-color: #3a5da9;
  color: white;
  border: none;
  border-radius: 0 25px 25px 0;
  cursor: pointer;
  font-weight: bold;
  transition: background-color 0.2s ease;
}

.search-button:hover {
  background-color: #2a4ba7;
}

.search-input:focus {
  outline: none;
  border-color: #3a5da9;
  box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.06),
    0 0 0 3px rgba(58, 93, 169, 0.2);
}

/* 最近の検索 */
.recent-searches {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  margin-top: 10px;
  padding: 0 10px;
}

.recent-label {
  font-size: 0.9em;
  color: #777;
  margin-right: 10px;
}

.recent-tags {
  display: flex;
  flex-wrap: wrap;
}

.recent-tag {
  display: inline-block;
  background-color: #e0e7f7;
  color: #3a5da9;
  padding: 3px 10px;
  margin: 3px;
  border-radius: 20px;
  font-size: 0.85em;
  cursor: pointer;
  transition: background-color 0.2s ease;
}

.recent-tag:hover {
  background-color: #c8d7f5;
}

/* エラーメッセージ */
.error-message {
  text-align: center;
  color: #e53935;
  padding: 15px;
  background-color: #ffebee;
  border-radius: 8px;
  margin-bottom: 20px;
}

/* スケルトンローディング */
.skeleton {
  animation: pulse 1.5s infinite;
  background: linear-gradient(90deg, #f0f0f0 0%, #e0e0e0 50%, #f0f0f0 100%);
  background-size: 200% 100%;
}

.skeleton-image {
  background-color: #e0e0e0;
  height: 180px;
}

.skeleton-line {
  height: 12px;
  margin: 8px 0;
  border-radius: 4px;
}

.skeleton-line.short {
  width: 40%;
}

.skeleton-line.medium {
  width: 60%;
}

.skeleton-line.long {
  width: 80%;
}

@keyframes pulse {
  0% {
    background-position: 100% 0;
  }
  100% {
    background-position: -100% 0;
  }
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
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.06);
  overflow: hidden;
  transition: transform 0.25s ease, box-shadow 0.25s ease;
  cursor: pointer;
}

.pokemon-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.08);
}

.pokemon-link {
  text-decoration: none;
  color: inherit;
  display: flex;
  flex-direction: column;
  height: 100%;
}

.pokemon-image-wrapper {
  background-color: #f3f4f6;
  padding: 20px;
  display: flex;
  justify-content: center;
  align-items: center;
  aspect-ratio: 1 / 1;
}

.pokemon-image {
  max-width: 90%;
  max-height: 90%;
  object-fit: contain;
}

.pokemon-info {
  padding: 15px;
  text-align: center;
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
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
  margin: 0;
}

.pokemon-types {
  margin-top: 10px;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 5px;
}

.type-tag {
  display: inline-block;
  padding: 5px 12px;
  margin: 2px;
  border-radius: 15px;
  font-size: 0.85em;
  color: white;
  text-transform: capitalize;
  font-weight: 600;
  line-height: 1.3;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.15);
  transition: transform 0.15s ease;
}

.type-tag:hover {
  transform: scale(1.05);
}

/* ページネーションスタイル改善 */
.pagination-controls {
  display: flex;
  justify-content: center;
  align-items: center;
  margin-top: 30px;
  padding: 20px 0;
}

.pagination-button {
  background-color: #3a5da9;
  color: white;
  border: none;
  width: 40px;
  height: 40px;
  text-align: center;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 5px;
  cursor: pointer;
  border-radius: 50%;
  transition: background-color 0.2s ease, transform 0.1s ease;
  font-weight: bold;
}

.pagination-button:disabled {
  background-color: #d1d8e6;
  color: #a0a0a0;
  cursor: not-allowed;
}

.pagination-button:hover:not(:disabled) {
  background-color: #2a4ba7;
  transform: translateY(-1px);
}

.pagination-icon {
  font-size: 1.4em;
  line-height: 1;
}

.pagination-info {
  margin: 0 15px;
  font-size: 1.1em;
  color: #555;
  font-weight: bold;
}

.total-items {
  font-size: 0.85em;
  color: #777;
  margin-left: 5px;
  font-weight: normal;
}

/* タイプカラー */
.type-normal {
  background-color: #a8a77a;
}
.type-fire {
  background-color: #ee8130;
}
.type-water {
  background-color: #6390f0;
}
.type-electric {
  background-color: #f7d02c;
}
.type-grass {
  background-color: #7ac74c;
}
.type-ice {
  background-color: #96d9d6;
}
.type-fighting {
  background-color: #c22e28;
}
.type-poison {
  background-color: #a33ea1;
}
.type-ground {
  background-color: #e2bf65;
}
.type-flying {
  background-color: #a98ff3;
}
.type-psychic {
  background-color: #f95587;
}
.type-bug {
  background-color: #a6b91a;
}
.type-rock {
  background-color: #b6a136;
}
.type-ghost {
  background-color: #735797;
}
.type-dragon {
  background-color: #6f35fc;
}
.type-dark {
  background-color: #705746;
}
.type-steel {
  background-color: #b7b7ce;
}
.type-fairy {
  background-color: #d685ad;
}
.type-unknown,
.type- {
  background-color: #68a090;
}

/* メディアクエリ */
@media (max-width: 768px) {
  .pokemon-grid {
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 15px;
  }

  .search-container {
    padding: 0 10px;
  }

  .search-input-area {
    flex-direction: column;
  }

  .search-input {
    width: 100%;
    max-width: none;
    border-radius: 25px;
    margin-bottom: 10px;
  }

  .search-button {
    border-radius: 25px;
    width: 50%;
    align-self: center;
  }

  .pagination-info .total-items {
    display: block;
    text-align: center;
  }
}

@media (max-width: 480px) {
  .pokemon-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
  }

  .page-header h1 {
    font-size: 2em;
  }

  .pagination-controls {
    flex-wrap: wrap;
  }

  .pagination-info {
    order: -1;
    width: 100%;
    text-align: center;
    margin-bottom: 10px;
  }
}
</style>

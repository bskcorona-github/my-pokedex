<template>
  <div class="container pokedex-background">
    <header class="page-header">
      <h1>ポケモン図鑑</h1>
    </header>

    <div class="search-container">
      <div class="search-input-area">
        <input
          type="text"
          v-model.trim="searchQueryInput"
          placeholder="なまえ や ずかんナンバー で さがしてね！"
          class="search-input"
          @keyup.enter="handleSearch"
        />
        <button @click="handleSearch" class="search-button game-button">
          検索
        </button>
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
    <div v-if="isLoading && !pokemons.length" class="loading-container">
      <div class="pokeball-loader"></div>
      <p class="loading-text">NOW LOADING...</p>
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
        class="pagination-button game-button"
      >
        <span class="pagination-icon">⟪</span>
      </button>
      <button
        @click="goToPreviousPage"
        :disabled="currentPage === 1"
        class="pagination-button game-button"
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
        class="pagination-button game-button"
      >
        <span class="pagination-icon">⟩</span>
      </button>
      <button
        @click="goToLastPage"
        :disabled="currentPage === totalPages"
        class="pagination-button game-button"
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
/* ポケモン風背景 */
.pokedex-background {
  background-image: url("/images/pokedex-background.png"); /* 仮の背景画像パス */
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
}

.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
  font-family: "Noto Sans JP", "Rounded Mplus 1c", "Helvetica Neue", Arial,
    sans-serif; /* Noto Sans JP を追加 */
  background-color: rgba(240, 242, 245, 0.85); /* 背景を少し透過 */
  min-height: 100vh;
  font-size: 1.1em; /* 全体フォントサイズ調整 */
}

.page-header h1 {
  font-size: 3.2em; /* タイトルフォントサイズ調整 */
  color: #e74c3c; /* ポケモンレッド */
  font-weight: 900; /* 太字 */
  text-shadow: 2px 2px 0 #fff, 4px 4px 0 rgba(0, 0, 0, 0.15); /* 立体的な影 */
  letter-spacing: 1px;
  margin-bottom: 40px; /* 十分なマージン */
}

/* 検索関連 */
.search-input-area {
  display: flex;
  justify-content: center;
  margin-bottom: 10px;
}

.search-input {
  width: 100%;
  max-width: 700px; /* 500px から 700px に変更 */
  padding: 12px 20px;
  font-size: 1em;
  border-radius: 25px 0 0 25px; /* ボタンと連結するため片側のみ丸める */
  border: 3px solid #e74c3c;
  box-shadow: 0 0 10px rgba(231, 76, 60, 0.5);
  transition: all 0.3s ease;
}

.search-input:focus {
  border-color: #c0392b;
  box-shadow: 0 0 15px rgba(192, 57, 43, 0.7);
  outline: none; /* フォーカス時のデフォルトアウトラインを消す */
}

.search-button {
  border-radius: 0 25px 25px 0; /* ボタンと連結するため片側のみ丸める */
  /* game-button スタイルが適用されているので、ここでは形状に関する調整のみ */
}

/* ゲーム風ボタン共通スタイル */
.game-button {
  background-color: #e74c3c; /* ポケモンレッド */
  color: white;
  border: 2px solid #c0392b; /* 少し濃い赤の枠線 */
  border-radius: 10px; /* 角丸 */
  padding: 10px 20px;
  font-weight: bold;
  text-transform: uppercase;
  box-shadow: 0 4px 0 #96281b; /* 立体感を出す影 */
  transition: all 0.15s ease;
  cursor: pointer;
  font-size: 1.1em; /* ボタン内フォントサイズ調整 */
}

.game-button:hover:not(:disabled) {
  background-color: #c0392b;
  transform: translateY(1px);
  box-shadow: 0 2px 0 #96281b;
}

.game-button:active:not(:disabled) {
  transform: translateY(2px);
  box-shadow: 0 1px 0 #96281b;
}

.game-button:disabled {
  background-color: #d1d8e6;
  color: #a0a0a0;
  box-shadow: 0 4px 0 #b0b9c9;
  cursor: not-allowed;
}

.pagination-button {
  width: 45px; /* サイズ調整 */
  height: 45px;
  margin: 0 8px; /* 間隔調整 */
}

/* ポケモンカード */
.pokemon-grid {
  display: grid;
  /* カードの最小幅を調整して1列に約4体表示されるようにする */
  /* 元: minmax(180px, 1fr) */
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); /* 調整後の値 */
  gap: 20px; /* ギャップも少し調整 */
  margin-bottom: 30px;
}

.pokemon-card {
  background-color: #fff;
  border-radius: 12px;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.06);
  overflow: hidden;
  transition: transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94),
    box-shadow 0.3s ease;
  cursor: pointer;
  /* カード全体の高さを少し調整することも検討 */
}

.pokemon-card:hover {
  transform: translateY(-5px) rotate(2deg); /* Y軸移動と少し回転 */
  box-shadow: 0 12px 24px rgba(0, 0, 0, 0.15);
}

.pokemon-card:hover .pokemon-image {
  transform: scale(1.1); /* 画像を少し拡大 */
}

.pokemon-image-wrapper {
  background-color: #f3f4f6;
  padding: 15px; /* パディングを少し調整 */
  display: flex;
  justify-content: center;
  align-items: center;
  aspect-ratio: 1 / 1; /* 正方形を維持 */
}

.pokemon-image {
  max-width: 85%; /* ラッパーに対しての画像の最大幅を調整 */
  max-height: 85%; /* ラッパーに対しての画像の最大高さを調整 */
  object-fit: contain;
  transition: transform 0.3s ease-out;
}

.pokemon-info {
  padding: 12px; /* パディングを少し調整 */
  text-align: center;
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.pokemon-number {
  font-size: 0.8em; /* フォントサイズ調整 */
  color: #888;
  margin-bottom: 3px;
}

.pokemon-name {
  font-size: 1.05em; /* フォントサイズ調整 */
  font-weight: bold;
  color: #333;
  margin: 0;
  line-height: 1.2;
}

/* メディアクエリの調整 */
@media (max-width: 992px) {
  /* 4体表示が厳しくなるブレークポイントの目安 */
  .pokemon-grid {
    grid-template-columns: repeat(
      auto-fill,
      minmax(140px, 1fr)
    ); /* 3体表示ベースに */
    gap: 15px;
  }
}

@media (max-width: 768px) {
  .pokemon-grid {
    /* 元: minmax(150px, 1fr) */
    grid-template-columns: repeat(
      auto-fill,
      minmax(130px, 1fr)
    ); /* 2-3体表示ベースに */
    gap: 15px;
  }
  /* ... 他の768px以下のスタイル ... */
}

@media (max-width: 480px) {
  .pokemon-grid {
    grid-template-columns: repeat(2, 1fr); /* 2体固定 */
    gap: 10px;
  }
  /* ... 他の480px以下のスタイル ... */
}

/* その他既存スタイル（必要に応じて微調整） */
/* ... (既存の .container, .page-header h1 (一部上書き), .search-container, .recent-searches など) ... */

/* タイプカラー（変更なし） */
/* ... */

/* ローディングアニメーション */
.loading-container {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 50px;
  min-height: 300px; /* または適切な高さ */
}

.pokeball-loader {
  width: 80px;
  height: 80px;
  background-image: url("/pokeball.png"); /* モンスターボールの画像 */
  background-size: contain;
  background-repeat: no-repeat;
  animation: spin 1s linear infinite, wobble 1.5s ease-in-out infinite alternate;
  margin-bottom: 20px;
}

.loading-text {
  font-size: 1.5em;
  color: #e74c3c; /* ポケモンレッド */
  font-weight: bold;
  text-transform: uppercase;
  letter-spacing: 2px;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

@keyframes wobble {
  0% {
    transform: rotate(-5deg) scale(1);
  }
  50% {
    transform: rotate(5deg) scale(1.05);
  }
  100% {
    transform: rotate(-5deg) scale(1);
  }
}
</style>

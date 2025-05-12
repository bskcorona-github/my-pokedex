<template>
  <div class="pokemon-detail-container">
    <!-- スケルトンローディング -->
    <div v-if="isLoading" class="skeleton-container">
      <div class="skeleton-header">
        <div class="skeleton-title"></div>
      </div>
      <div class="pokemon-layout">
        <div class="pokemon-image-container">
          <div class="skeleton-image"></div>
        </div>
        <div class="pokemon-info-container">
          <div class="skeleton-line short"></div>
          <div class="skeleton-line medium"></div>
          <div class="skeleton-line short"></div>
          <div class="skeleton-line medium"></div>
          <div class="skeleton-line long"></div>
        </div>
      </div>
      <div class="skeleton-stats">
        <div class="skeleton-line medium"></div>
        <div class="skeleton-line full"></div>
        <div class="skeleton-line full"></div>
        <div class="skeleton-line full"></div>
        <div class="skeleton-line full"></div>
        <div class="skeleton-line full"></div>
      </div>
    </div>

    <!-- エラー表示 -->
    <div v-else-if="error" class="error-message">
      <p>{{ error.message }}</p>
      <button @click="retryFetch" class="retry-button">再試行</button>
    </div>

    <!-- ポケモン詳細表示 -->
    <div v-else-if="pokemon" class="pokemon-detail-content">
      <header class="pokemon-header">
        <button @click="goHome" class="back-button small">
          <span class="back-icon">←</span>一覧へ戻る
        </button>
        <h1>
          {{ pokemon.name }}
          <span class="pokemon-number">{{ pokemon.number }}</span>
        </h1>
      </header>

      <div class="pokemon-layout">
        <div class="pokemon-image-container">
          <img :src="pokemon.image" :alt="pokemon.name" class="pokemon-image" />
        </div>
        <div class="pokemon-info-container">
          <div
            class="pokemon-types"
            v-if="pokemon.types && pokemon.types.length > 0"
          >
            <span>タイプ:</span>
            <div class="type-tags">
              <span
                v-for="type in pokemon.types"
                :key="type"
                class="type-tag"
                :class="'type-' + type.toLowerCase()"
                >{{ type }}</span
              >
            </div>
          </div>
          <p class="pokemon-detail-item">
            <span>高さ:</span> {{ formatHeight(pokemon.height) }}
          </p>
          <p class="pokemon-detail-item">
            <span>重さ:</span> {{ formatWeight(pokemon.weight) }}
          </p>
          <p class="pokemon-detail-item">
            <span>特性:</span>
            <span class="abilities-list">
              {{ pokemon.abilities ? pokemon.abilities.join("、") : "不明" }}
            </span>
          </p>
          <p class="pokemon-detail-item habitat">
            <span>生息地:</span> {{ pokemon.habitat || "不明" }}
          </p>
        </div>
      </div>

      <div class="stats-section">
        <h2>基本ステータス</h2>
        <ul class="stats-list">
          <li v-for="stat in pokemon.stats" :key="stat.name" class="stat-item">
            <span class="stat-name">{{ stat.name }}:</span>
            <div class="stat-bar-container">
              <div
                class="stat-bar"
                :class="getStatBarClass(stat.value)"
                :style="{ width: getStatBarWidth(stat.value) + '%' }"
              ></div>
            </div>
            <span class="stat-value">{{ stat.value }}</span>
          </li>
        </ul>
      </div>

      <div class="navigation-links">
        <router-link
          v-if="prevPokemonId"
          :to="`/pokemon/${prevPokemonId}`"
          class="nav-link prev-link"
          @mouseenter="preloadPokemon(prevPokemonId)"
        >
          <span class="nav-icon">←</span>
          前のポケモン
        </router-link>
        <button @click="goHome" class="back-button">一覧に戻る</button>
        <router-link
          v-if="nextPokemonId"
          :to="`/pokemon/${nextPokemonId}`"
          class="nav-link next-link"
          @mouseenter="preloadPokemon(nextPokemonId)"
        >
          次のポケモン
          <span class="nav-icon">→</span>
        </router-link>
      </div>
    </div>

    <!-- データがない場合 -->
    <div v-else class="no-data">
      <p>ポケモン情報が見つかりません。</p>
      <button @click="goHome" class="back-button">一覧に戻る</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useRuntimeConfig } from "#app";

interface PokemonStat {
  name: string;
  value: number;
}

interface PokemonDetail {
  id: string;
  name: string;
  number: string;
  image: string;
  types: string[];
  height: number;
  weight: number;
  abilities: string[];
  stats: PokemonStat[];
  genus?: string;
  flavorText?: string;
  habitat?: string;
  color?: string;
  shape?: string;
}

const route = useRoute();
const router = useRouter();
const config = useRuntimeConfig();
const apiBaseUrl = config.public.apiBase;

const pokemon = ref<PokemonDetail | null>(null);
const isLoading = ref(true);
const error = ref<Error | null>(null);
const cachedPokemon = ref<Record<string, PokemonDetail>>({});

// 前後のポケモンのID
const prevPokemonId = computed(() => {
  if (!pokemon.value || !pokemon.value.id) return null;
  const currentId = parseInt(pokemon.value.id);
  return currentId > 1 ? String(currentId - 1) : null;
});

const nextPokemonId = computed(() => {
  if (!pokemon.value || !pokemon.value.id) return null;
  // 本来はここで最大IDをチェックすべきだが、簡易的に実装
  return String(parseInt(pokemon.value.id) + 1);
});

// 数値のフォーマット関数
const formatHeight = (height: number) => {
  return height ? (height / 10).toFixed(1) + " m" : "不明";
};

const formatWeight = (weight: number) => {
  return weight ? (weight / 10).toFixed(1) + " kg" : "不明";
};

// ステータスバーのクラスを取得
const getStatBarClass = (value: number) => {
  if (value < 30) return "stat-low";
  if (value < 60) return "stat-medium";
  if (value < 90) return "stat-high";
  return "stat-very-high";
};

// ステータスバーの幅を計算（最大値255を100%とする）
const getStatBarWidth = (value: number) => {
  return Math.min(100, (value / 255) * 100);
};

// 一覧画面に戻る
const goHome = () => {
  router.push("/");
};

// データの再取得
const retryFetch = async () => {
  error.value = null;
  isLoading.value = true;
  await fetchPokemonData(route.params.id as string);
};

// ポケモンデータの取得
const fetchPokemonData = async (id: string) => {
  // キャッシュにデータがあれば使用
  if (cachedPokemon.value[id]) {
    pokemon.value = cachedPokemon.value[id];
    isLoading.value = false;
    return;
  }

  try {
    const responseData = await $fetch<PokemonDetail>(
      `${apiBaseUrl}/pokemon/${id}`,
      {
        // CORSの問題を解決するためのオプション
        mode: "cors",
        credentials: "omit",
      }
    );
    pokemon.value = responseData;

    // キャッシュに保存
    cachedPokemon.value[id] = responseData;

    // 前後のポケモンをプリロード
    if (parseInt(id) > 1) {
      preloadPokemon(String(parseInt(id) - 1));
    }
    preloadPokemon(String(parseInt(id) + 1));
  } catch (e: any) {
    console.error("データ取得エラー:", e);
    error.value =
      e instanceof Error
        ? e
        : new Error("ポケモンデータの取得に失敗しました。");
  } finally {
    isLoading.value = false;
  }
};

// ポケモンデータのプリロード
const preloadPokemon = async (id: string) => {
  // すでにキャッシュにある場合はスキップ
  if (cachedPokemon.value[id]) return;

  try {
    const responseData = await $fetch<PokemonDetail>(
      `${apiBaseUrl}/pokemon/${id}`,
      {
        // CORSの問題を解決するためのオプション
        mode: "cors",
        credentials: "omit",
      }
    );
    // キャッシュに保存
    cachedPokemon.value[id] = responseData;
    console.log(`Preloaded pokemon ${id}`);

    // 画像のプリロード
    const img = new Image();
    img.src = responseData.image;
  } catch (error) {
    console.error(`Failed to preload pokemon ${id}:`, error);
  }
};

// ルートパラメータの変更を監視
watch(
  () => route.params.id,
  async (newId) => {
    if (newId) {
      isLoading.value = true;
      error.value = null;
      await fetchPokemonData(newId as string);

      // ページタイトルを更新
      if (pokemon.value) {
        document.title = `${pokemon.value.name} | ポケモン図鑑`;
      }

      // ページトップにスクロール
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  },
  { immediate: false }
);

onMounted(async () => {
  const id = route.params.id as string;
  if (id) {
    await fetchPokemonData(id);
  } else {
    error.value = new Error("ポケモンIDが指定されていません。");
    isLoading.value = false;
  }
});
</script>

<style scoped>
.pokemon-detail-container {
  max-width: 800px;
  margin: 20px auto;
  padding: 20px;
  background-color: #fff;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  font-family: "Rounded Mplus 1c", "Helvetica Neue", Arial, sans-serif;
}

/* スケルトンローディング */
.skeleton-container {
  animation: pulse 1.5s infinite ease-in-out;
}

.skeleton-header {
  text-align: center;
  margin-bottom: 30px;
}

.skeleton-title {
  height: 36px;
  width: 60%;
  background-color: #e0e0e0;
  margin: 0 auto;
  border-radius: 6px;
}

.skeleton-image {
  width: 100%;
  height: 200px;
  background-color: #e0e0e0;
  border-radius: 8px;
}

.skeleton-line {
  height: 14px;
  background-color: #e0e0e0;
  margin: 12px 0;
  border-radius: 4px;
}

.skeleton-line.short {
  width: 30%;
}
.skeleton-line.medium {
  width: 60%;
}
.skeleton-line.long {
  width: 90%;
}
.skeleton-line.full {
  width: 100%;
}

.skeleton-stats {
  margin-top: 30px;
}

@keyframes pulse {
  0% {
    opacity: 0.6;
  }
  50% {
    opacity: 1;
  }
  100% {
    opacity: 0.6;
  }
}

/* エラーメッセージ */
.error-message {
  text-align: center;
  padding: 40px 20px;
  color: #e53935;
  background-color: #ffebee;
  border-radius: 8px;
  margin-bottom: 20px;
}

.retry-button {
  margin-top: 15px;
  padding: 8px 20px;
  background-color: #3a5da9;
  color: white;
  border: none;
  border-radius: 20px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.retry-button:hover {
  background-color: #2a4ba7;
}

/* ポケモン詳細コンテンツ */
.pokemon-header {
  position: relative;
  text-align: center;
  margin-bottom: 30px;
}

.pokemon-header h1 {
  font-size: 2.2em;
  color: #3a5da9;
  margin: 0;
}

.pokemon-number {
  display: block;
  font-size: 0.6em;
  color: #888;
  margin-top: 5px;
}

.pokemon-layout {
  display: flex;
  flex-wrap: wrap;
  gap: 30px;
  margin-bottom: 30px;
}

.pokemon-image-container {
  flex: 1;
  min-width: 250px;
  text-align: center;
}

.pokemon-image {
  max-width: 100%;
  height: auto;
  border-radius: 8px;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
}

.pokemon-info-container {
  flex: 1;
  min-width: 250px;
}

.pokemon-detail-item {
  margin: 15px 0;
  line-height: 1.5;
  font-size: 1.05em;
  color: #333;
}

.pokemon-detail-item span:first-child {
  font-weight: bold;
  color: #3a5da9;
  display: inline-block;
  width: 80px;
}

.pokemon-types {
  margin: 15px 0;
}

.pokemon-types span:first-child {
  font-weight: bold;
  color: #3a5da9;
  display: inline-block;
  width: 80px;
  vertical-align: top;
}

.type-tags {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 5px;
}

.type-tag {
  display: inline-block;
  padding: 5px 12px;
  border-radius: 15px;
  font-size: 0.9em;
  color: white;
  font-weight: 600;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.15);
}

.abilities-list {
  display: inline-block;
  width: calc(100% - 90px);
}

.habitat {
  margin-top: 20px;
}

/* ステータスセクション */
.stats-section {
  margin-top: 40px;
  padding-top: 20px;
  border-top: 1px solid #eee;
}

.stats-section h2 {
  color: #3a5da9;
  font-size: 1.6em;
  margin-bottom: 20px;
}

.stats-list {
  list-style-type: none;
  padding: 0;
}

.stat-item {
  display: flex;
  align-items: center;
  margin-bottom: 15px;
}

.stat-name {
  width: 100px;
  font-weight: bold;
  color: #555;
}

.stat-bar-container {
  flex-grow: 1;
  height: 15px;
  background-color: #f0f0f0;
  border-radius: 20px;
  overflow: hidden;
  margin: 0 15px;
}

.stat-bar {
  height: 100%;
  border-radius: 20px;
  transition: width 0.8s ease-out;
}

.stat-low {
  background-color: #fb8c00;
}
.stat-medium {
  background-color: #fdd835;
}
.stat-high {
  background-color: #7cb342;
}
.stat-very-high {
  background-color: #43a047;
}

.stat-value {
  width: 40px;
  text-align: right;
  font-weight: bold;
  color: #333;
}

/* ナビゲーションリンク */
.navigation-links {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 40px;
  padding-top: 20px;
  border-top: 1px solid #eee;
}

.nav-link {
  color: #3a5da9;
  text-decoration: none;
  font-weight: bold;
  padding: 8px 15px;
  border-radius: 20px;
  transition: background-color 0.2s;
}

.nav-link:hover {
  background-color: #e0e7f7;
}

.nav-icon {
  font-size: 1.2em;
  vertical-align: middle;
  margin: 0 5px;
}

.back-button {
  background-color: #3a5da9;
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 20px;
  cursor: pointer;
  font-weight: bold;
  transition: background-color 0.3s;
}

.back-button:hover {
  background-color: #2a4ba7;
}

.back-button.small {
  position: absolute;
  left: 0;
  top: 5px;
  font-size: 0.8em;
  padding: 5px 10px;
}

.back-icon {
  margin-right: 5px;
}

/* データなし表示 */
.no-data {
  text-align: center;
  padding: 40px 20px;
  color: #757575;
}

.no-data p {
  margin-bottom: 20px;
  font-size: 1.2em;
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

/* レスポンシブ対応 */
@media (max-width: 600px) {
  .pokemon-layout {
    flex-direction: column;
  }

  .pokemon-header h1 {
    font-size: 1.8em;
    margin-top: 30px;
  }

  .back-button.small {
    position: static;
    display: block;
    margin: 0 0 15px;
  }

  .navigation-links {
    flex-wrap: wrap;
  }

  .back-button {
    order: 3;
    margin-top: 15px;
    width: 100%;
  }

  .nav-link {
    margin-bottom: 10px;
  }

  .prev-link {
    order: 1;
  }

  .next-link {
    order: 2;
  }
}
</style>

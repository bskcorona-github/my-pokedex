<template>
  <div v-if="isLoading" class="loading-indicator">読み込み中...</div>
  <div v-else-if="error" class="error-message">
    データの読み込みに失敗しました: {{ error.message }}
  </div>
  <div v-else-if="pokemon" class="pokemon-detail-container">
    <h1>
      {{ pokemon.name }}
      <span v-if="pokemon.number">({{ pokemon.number }})</span>
    </h1>
    <div class="pokemon-layout">
      <div class="pokemon-image-container">
        <img :src="pokemon.image" :alt="pokemon.name" class="pokemon-image" />
      </div>
      <div class="pokemon-info-container">
        <p><span>分類:</span> {{ pokemon.genus || "不明" }}</p>
        <p>
          <span>タイプ:</span>
          <span
            v-for="type in pokemon.types"
            :key="type"
            class="type-tag"
            :class="'type-' + type.toLowerCase()"
            >{{ type }}</span
          >
        </p>
        <p>
          <span>高さ:</span>
          {{ pokemon.height ? pokemon.height / 10 + " m" : "不明" }}
        </p>
        <p>
          <span>重さ:</span>
          {{ pokemon.weight ? pokemon.weight / 10 + " kg" : "不明" }}
        </p>
        <p>
          <span>特性:</span>
          <span v-for="ability in pokemon.abilities" :key="ability">{{
            ability
          }}</span>
        </p>
        <p><span>説明:</span> {{ pokemon.flavorText || "説明なし" }}</p>
      </div>
    </div>

    <h2>基本ステータス</h2>
    <ul class="stats-list">
      <li v-for="stat in pokemon.stats" :key="stat.name" class="stat-item">
        <span class="stat-name">{{ stat.name }}:</span>
        <div class="stat-bar-container">
          <div class="stat-bar" :style="{ width: stat.value + '%' }"></div>
        </div>
        <span class="stat-value">{{ stat.value }}</span>
      </li>
    </ul>

    <div class="additional-info">
      <p><span>生息地:</span> {{ pokemon.habitat || "不明" }}</p>
      <p><span>色:</span> {{ pokemon.color || "不明" }}</p>
      <p><span>形状:</span> {{ pokemon.shape || "不明" }}</p>
    </div>

    <button @click="goHome" class="back-button">一覧に戻る</button>
  </div>
  <div v-else class="no-data">ポケモン情報が見つかりません。</div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useRuntimeConfig } from "#app";

interface PokemonStat {
  name: string;
  value: number;
}

interface PokemonDetail {
  id: string;
  name: string;
  number: string; // 例: "No.001"
  image: string;
  types: string[];
  height: number; // 10倍された値 (例: 7 -> 0.7m)
  weight: number; // 10倍された値 (例: 69 -> 6.9kg)
  abilities: string[];
  stats: PokemonStat[];
  genus?: string; // 例： たねポケモン
  flavorText?: string; // ポケモン図鑑の説明
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

const goHome = () => {
  router.push("/");
};

onMounted(async () => {
  const id = route.params.id as string;
  if (!id) {
    error.value = new Error("ポケモンIDが指定されていません。");
    isLoading.value = false;
    return;
  }

  try {
    // バックエンドAPIから詳細データを取得
    // バックエンドの /api/pokemon/[id].ts (仮) が返すデータ構造に合わせる
    // ここでは PokeAPI から直接取得するわけではないので、
    // バックエンドが加工して返す PokemonDetail 型のデータを期待
    const responseData = await $fetch<PokemonDetail>(
      `${apiBaseUrl}/pokemon/${id}`
    );
    pokemon.value = responseData;
  } catch (e: any) {
    console.error("データ取得エラー:", e);
    error.value =
      e instanceof Error
        ? e
        : new Error("ポケモンデータの取得に失敗しました。");
  } finally {
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
  border-radius: 8px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  font-family: Arial, sans-serif;
}

.loading-indicator,
.error-message,
.no-data {
  text-align: center;
  padding: 40px;
  font-size: 1.2em;
  color: #555;
}

h1 {
  text-align: center;
  color: #333;
  margin-bottom: 20px;
}

.pokemon-layout {
  display: flex;
  gap: 20px;
  margin-bottom: 20px;
}

.pokemon-image-container {
  flex: 1;
  text-align: center;
}

.pokemon-image {
  max-width: 100%;
  height: auto;
  border: 1px solid #eee;
  border-radius: 8px;
}

.pokemon-info-container {
  flex: 2;
}

.pokemon-info-container p,
.additional-info p {
  margin-bottom: 10px;
  line-height: 1.6;
  color: #555;
}
.pokemon-info-container p span,
.additional-info p span {
  font-weight: bold;
  color: #333;
  margin-right: 5px;
}

.type-tag {
  display: inline-block;
  padding: 3px 8px;
  margin-right: 5px;
  border-radius: 4px;
  color: white;
  font-size: 0.9em;
  text-transform: capitalize;
}
/* タイプごとの色設定 (例) */
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

h2 {
  margin-top: 30px;
  margin-bottom: 15px;
  color: #444;
  border-bottom: 2px solid #eee;
  padding-bottom: 5px;
}

.stats-list {
  list-style-type: none;
  padding: 0;
}

.stat-item {
  display: flex;
  align-items: center;
  margin-bottom: 8px;
}

.stat-name {
  width: 120px; /* 項目名を揃える */
  font-weight: bold;
  color: #555;
}

.stat-bar-container {
  flex-grow: 1;
  height: 20px;
  background-color: #e0e0e0;
  border-radius: 4px;
  margin: 0 10px;
  overflow: hidden; /* バーがコンテナを超えるのを防ぐ */
}

.stat-bar {
  height: 100%;
  background-color: #4caf50; /* 基本色 */
  border-radius: 4px;
  transition: width 0.5s ease-in-out;
}

/* ステータス値によってバーの色を変える例 (オプション) */
.stat-bar[style*="width: 10%"],
.stat-bar[style*="width: 20%"] {
  background-color: #f44336;
} /* 低い値 */
.stat-bar[style*="width: 30%"],
.stat-bar[style*="width: 40%"] {
  background-color: #ff9800;
} /* やや低い値 */
.stat-bar[style*="width: 50%"],
.stat-bar[style*="width: 60%"] {
  background-color: #ffeb3b;
  color: #333;
} /* 中間の値 */
.stat-bar[style*="width: 70%"],
.stat-bar[style*="width: 80%"] {
  background-color: #8bc34a;
} /* やや高い値 */
.stat-bar[style*="width: 90%"],
.stat-bar[style*="width: 100%"] {
  background-color: #4caf50;
} /* 高い値 */

.stat-value {
  width: 40px; /* 数値を揃える */
  text-align: right;
  font-weight: bold;
}

.additional-info {
  margin-top: 20px;
  padding-top: 20px;
  border-top: 1px solid #eee;
}

.back-button {
  display: block;
  width: fit-content;
  margin: 30px auto 0;
  padding: 12px 25px;
  background-color: #007bff;
  color: white;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  font-size: 1em;
  transition: background-color 0.3s;
}

.back-button:hover {
  background-color: #0056b3;
}
</style>

<template>
  <div class="container">
    <header class="page-header">
      <h1>ポケモン図鑑</h1>
    </header>

    <div class="search-filter-container">
      <input
        type="text"
        v-model.trim="searchQuery"
        placeholder="名前 または 図鑑番号で検索 (例: フシギダネ, 001)"
        class="search-input"
      />
    </div>
    <p class="search-annotation">
      ※ 現在表示されているページのポケモンから検索します。
    </p>

    <div v-if="isLoading" class="loading-indicator">読み込み中...</div>

    <div v-if="!isLoading && filteredPokemons.length > 0" class="pokemon-grid">
      <div
        v-for="pokemon in filteredPokemons"
        :key="pokemon.id"
        class="pokemon-card"
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
            <!-- タイプ表示は将来的に実装 -->
            <div
              v-if="getDisplayTypes(pokemon).length > 0"
              class="pokemon-types"
            >
              <span
                v-for="(typeText, index) in getDisplayTypes(pokemon)"
                :key="index"
                class="type-tag"
                :class="'type-' + typeText.toLowerCase()"
                >{{ typeText }}</span
              >
            </div>
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
    <div
      v-if="
        !isLoading &&
        filteredPokemons.length === 0 &&
        pokemons.length > 0 &&
        searchQuery
      "
      class="no-pokemon"
    >
      「{{ searchQuery }}」に一致するポケモンは見つかりませんでした。
    </div>
    <div v-if="!isLoading && totalItems === 0" class="no-pokemon">
      表示できるポケモンがいません。
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, computed } from "vue";
import { useRuntimeConfig } from "#app";

interface Pokemon {
  id: string;
  name: string;
  image?: string;
  number?: string;
  types?: string[]; // 将来的に追加
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
const searchQuery = ref("");

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

const hiraganaToKatakana = (str: string): string => {
  return str.replace(/[ぁ-ゔゞ゛゜]/g, function (match) {
    const charCode = match.charCodeAt(0) + 0x60;
    return String.fromCharCode(charCode);
  });
};

// フィルタリングされたポケモンリスト
const filteredPokemons = computed(() => {
  if (!searchQuery.value) {
    return pokemons.value; // 検索クエリがなければ元のリストを返す
  }
  const originalQuery = searchQuery.value.toLowerCase();
  const katakanaQuery = hiraganaToKatakana(originalQuery);

  return pokemons.value.filter((pokemon) => {
    const pokemonNameLower = pokemon.name.toLowerCase();

    // 名前検索: 元のクエリ(小文字)とカタカナ変換後のクエリ(小文字)の両方でポケモン名(小文字)と比較
    const nameMatch =
      pokemonNameLower.includes(originalQuery) ||
      pokemonNameLower.includes(katakanaQuery);

    // 図鑑番号検索: "No.xxx" から "xxx" を抽出し、検索クエリも数値化して比較
    let numberMatch = false;
    if (pokemon.number) {
      const pokemonNumberSanitized = pokemon.number.replace(/^No\.?0*/, ""); // "001" や "1" にする
      const queryAsNumber = originalQuery
        .replace(/^No\.?0*/, "")
        .replace(/[^0-9]/g, ""); // クエリから数字のみ抽出
      if (queryAsNumber) {
        // 数字クエリがある場合のみ番号検索
        numberMatch = pokemonNumberSanitized.includes(queryAsNumber);
      }
    }
    return nameMatch || numberMatch;
  });
});

const getDisplayTypes = (pokemon: Pokemon): string[] => {
  if (pokemon.types && pokemon.types.length > 0) {
    return pokemon.types.filter(
      (typeText) => typeText && typeText.trim() !== ""
    );
  }
  return [];
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

.search-filter-container {
  margin-bottom: 8px;
  display: flex;
  justify-content: center;
}

.search-annotation {
  text-align: center;
  font-size: 0.85em;
  color: #777;
  margin-bottom: 20px;
}

.search-input {
  width: 100%;
  max-width: 500px;
  padding: 12px 20px;
  font-size: 1em;
  border: 1px solid #ddd;
  border-radius: 25px;
  box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.06);
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.search-input:focus {
  outline: none;
  border-color: #fdd835;
  box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.06),
    0 0 0 3px rgba(253, 216, 53, 0.3);
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

.pagination-controls {
  display: flex;
  justify-content: center;
  align-items: center;
  margin-top: 30px;
  padding: 20px 0;
}

.pagination-controls button {
  background-color: #fdd835;
  color: #333;
  border: none;
  padding: 12px 24px;
  text-align: center;
  text-decoration: none;
  display: inline-block;
  font-size: 1.05em;
  margin: 0 10px;
  cursor: pointer;
  border-radius: 20px;
  transition: background-color 0.2s ease, transform 0.1s ease;
  font-weight: bold;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
}

.pagination-controls button:disabled {
  background-color: #e0e0e0;
  color: #a0a0a0;
  cursor: not-allowed;
  box-shadow: none;
}

.pagination-controls button:hover:not(:disabled) {
  background-color: #fbc02d;
  transform: translateY(-1px);
}

.pagination-controls span {
  margin: 0 15px;
  font-size: 1em;
  color: #555;
}

@media (max-width: 600px) {
  .pokemon-grid {
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
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
    grid-template-columns: 1fr;
    gap: 20px;
  }
  .pokemon-card {
  }
  .page-header h1 {
    font-size: 1.8em;
  }
  .pagination-controls button {
    padding: 10px 15px;
    font-size: 0.85em;
    margin: 0 3px;
  }
  .pagination-controls span {
    font-size: 0.85em;
    margin: 0 6px;
  }
}
</style>

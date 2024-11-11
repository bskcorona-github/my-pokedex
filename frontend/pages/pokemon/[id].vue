<template>
  <div v-if="pokemon">
    <h1>{{ pokemon.name }}</h1>
    <img :src="pokemon.image" alt="ポケモンの画像" />
    <p>高さ: {{ pokemon.height }}</p>
    <p>重さ: {{ pokemon.weight }}</p>
    <p>タイプ: <span v-for="type in pokemon.types" :key="type">{{ type }}</span></p>
    <p>特性: <span v-for="ability in pokemon.abilities" :key="ability">{{ ability }}</span></p>
    <h2>基本ステータス</h2>
    <ul>
      <li v-for="stat in pokemon.stats" :key="stat.name">
        {{ stat.name }}: {{ stat.value }}
      </li>
    </ul>
    <p>生息地: {{ pokemon.habitat }}</p>
    <p>色: {{ pokemon.color }}</p>
    <p>形状: {{ pokemon.shape }}</p>

    <!-- ホームに戻るボタン -->
    <button @click="goHome" class="back-button">ホームに戻る</button>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter, useNuxtApp } from '#app'

const route = useRoute()
const router = useRouter()
const { $axios } = useNuxtApp()
const pokemon = ref<any>(null)

// ホームに戻る関数
const goHome = () => {
  router.push('/')
}

onMounted(async () => {
  const id = route.params.id
  try {
    const response = await $axios.get(`/pokemon/${id}`)
    pokemon.value = response.data
  } catch (error) {
    console.error('データ取得エラー:', error)
  }
})
</script>

<style scoped>
.back-button {
  margin-top: 20px;
  padding: 10px 20px;
  background-color: #4CAF50;
  color: white;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  font-size: 16px;
  transition: background-color 0.3s;
}

.back-button:hover {
  background-color: #45a049;
}
</style>

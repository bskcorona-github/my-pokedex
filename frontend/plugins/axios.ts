import axios from 'axios'

export default defineNuxtPlugin(() => {
  const instance = axios.create({
    baseURL: 'https://my-pokedex-backend.vercel.app/api',// Next.jsのAPIエンドポイント
  })
  return {
    provide: {
      axios: instance
    }
  }
})

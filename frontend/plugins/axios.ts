import axios from 'axios'

export default defineNuxtPlugin(() => {
  const instance = axios.create({
    baseURL: 'https://my-pokedex-28uz.vercel.app/api',// Next.jsのAPIエンドポイント
  })
  return {
    provide: {
      axios: instance
    }
  }
})

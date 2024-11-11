import axios from 'axios'

export default defineNuxtPlugin(() => {
  const instance = axios.create({
    baseURL: 'http://localhost:3001/api', // Next.jsのAPIエンドポイント
  })
  return {
    provide: {
      axios: instance
    }
  }
})

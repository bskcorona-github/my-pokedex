import axios from 'axios'

export default defineNuxtPlugin(() => {
  const instance = axios.create({
    baseURL: 'https://your-backend-project.vercel.app/api',// Next.jsのAPIエンドポイント
  })
  return {
    provide: {
      axios: instance
    }
  }
})

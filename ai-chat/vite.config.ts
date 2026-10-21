import { fileURLToPath, URL } from 'node:url'

import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// 开发 / 预览服务器把 /agent/* 代理到 HelloAgents 后端，避免浏览器跨域限制。
const helloAgentsServer = process.env.HELLOAGENTS_SERVER ?? 'http://127.0.0.1:8000'
const proxy = {
  '/agent': {
    target: helloAgentsServer,
    changeOrigin: true,
  },
}

// 相对路径 base：静态托管与 Tauri 加载（tauri://localhost）都能工作。
export default defineConfig({
  base: './',
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@config': fileURLToPath(new URL('./src/app/config', import.meta.url)),
    },
  },
  // 同时放行 VITE_ 与 TAURI_ 前缀的环境变量。
  envPrefix: ['VITE_', 'TAURI_'],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy,
    watch: {
      // 避免 Tauri 的 target/ 目录触发大量无关热更新。
      ignored: ['**/src-tauri/**'],
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
    proxy,
  },
  clearScreen: false,
  build: {
    target: 'es2022',
    // 调试构建（tauri dev）开启源码映射。
    sourcemap: Boolean(process.env.TAURI_ENV_DEBUG),
    chunkSizeWarningLimit: 900,
  },
})


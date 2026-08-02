import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import fs from 'node:fs'
import path from 'node:path'

// 让大体积背景图在浏览器长期缓存（immutable），避免反复占用服务器带宽。
// 通过自定义中间件直接响应，确保 Cache-Control 不被 Vite 默认头覆盖。
function longCacheMapPlugin(): Plugin {
  const TARGET = '/photos/europe-map-bg.jpg'
  const CONTENT_TYPES: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
  }
  const makeHandler = (root: string) => (req: any, res: any, next: () => void) => {
    const urlPath = decodeURIComponent((req.url || '').split('?')[0])
    if (urlPath !== TARGET) return next()
    const filePath = path.join(root, 'public', TARGET)
    fs.readFile(filePath, (err, buf) => {
      if (err) return next()
      const ext = path.extname(filePath).toLowerCase()
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
      res.setHeader('Content-Type', CONTENT_TYPES[ext] || 'application/octet-stream')
      res.setHeader('Content-Length', String(buf.length))
      res.end(buf)
    })
  }
  return {
    name: 'long-cache-map',
    configureServer(server) {
      server.middlewares.use(makeHandler(server.config.root))
    },
    configurePreviewServer(server) {
      server.middlewares.use(makeHandler(server.config.root))
    },
  }
}

export default defineConfig({
  plugins: [react(), longCacheMapPlugin()],
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
    },
  },
  server: {
    // 本地开发：把 /ws 反代到本机后端，前端代码无需感知环境
    proxy: {
      '/ws': {
        target: 'ws://127.0.0.1:8080',
        ws: true,
        changeOrigin: true,
      },
    },
  },
  build: {
    // 关闭自动清空输出目录：本地环境的安全删除钩子会拦截 Vite 的 emptyOutDir
    // （rmSync→trash），导致构建失败。改为首次构建前手动 `rm -rf dist`，
    // 之后构建原地覆盖（哈希资源名自带内容指纹，旧文件不会被引用）。
    emptyOutDir: false,
  },
})

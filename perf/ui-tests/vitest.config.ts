import { defineConfig } from 'vitest/config'
import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const frontend = path.resolve(import.meta.dirname, '../../frontend')
const frontendRequire = createRequire(path.join(frontend, 'package.json'))
const react = await import(pathToFileURL(frontendRequire.resolve('@vitejs/plugin-react')).href)

export default defineConfig({
  plugins: [react.default()],
  resolve: { alias: {
    '@': path.join(frontend, 'src'),
    react: path.join(frontend, 'node_modules/react'),
    'react-dom': path.join(frontend, 'node_modules/react-dom'),
    '@tanstack/react-query': path.join(frontend, 'node_modules/@tanstack/react-query'),
    '@tanstack/react-router': path.join(frontend, 'node_modules/@tanstack/react-router'),
    'lucide-react': path.join(frontend, 'node_modules/lucide-react'),
  } },
  test: { environment: 'jsdom', maxWorkers: 1, fileParallelism: false, testTimeout: 15000,
    include: ['performance-ui.test.tsx'] },
})

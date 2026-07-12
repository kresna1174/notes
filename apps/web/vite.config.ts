import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'
import { resolve } from 'path'

import { tanstackRouter } from '@tanstack/router-plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { apiPlugin } from './vite-plugin-api'

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  envDir: resolve(__dirname, '../..'),
  plugins: [
    devtools(),
    apiPlugin(),
    tailwindcss(),
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    viteReact(),
  ],
})

export default config

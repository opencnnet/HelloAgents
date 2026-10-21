// 品牌图标只有一份源文件（prototypes/app-icon.svg）。
// tauri icon 由它生成各平台图标，这里同步 Web 端的 favicon，避免两处漂移。
import { copyFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const source = resolve(here, '../prototypes/app-icon.svg')
const target = resolve(here, '../public/favicon.svg')

copyFileSync(source, target)
console.log(`favicon 已同步：${target}`)

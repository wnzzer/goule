import { chmodSync, rmSync } from 'node:fs'
import { build } from 'esbuild'

rmSync('dist', { recursive: true, force: true })

await build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.js',
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  packages: 'external',
  sourcemap: true,
  legalComments: 'none',
  logLevel: 'info',
})

chmodSync('dist/index.js', 0o755)

import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, parse } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)

function findPackageRoot(): string {
  let current = dirname(fileURLToPath(import.meta.url))
  const root = parse(current).root
  while (current !== root) {
    if (existsSync(join(current, 'package.json'))) return current
    current = dirname(current)
  }
  return process.cwd()
}

export const PACKAGE_ROOT = findPackageRoot()

export function packagePath(...parts: string[]): string {
  return join(PACKAGE_ROOT, ...parts)
}

export function dependencyPath(specifier: string): string {
  return require.resolve(specifier)
}

import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

/** 向上最多走这么多层找 .git，避免符号链接环或异常路径导致长循环 */
const MAX_DEPTH = 40

/**
 * 从任意目录向上找仓库根。
 * `.git` 可能是目录（普通克隆）也可能是文件（worktree / submodule），
 * 只判断存在性，不区分类型。
 */
export function findRepoRoot(startDir: string): string | null {
  let dir = resolve(startDir)
  for (let i = 0; i < MAX_DEPTH; i++) {
    if (existsSync(join(dir, '.git'))) return dir
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
  return null
}

/** 从一组 session cwd 推出去重后的仓库根列表。顺序不保证。 */
export function discoverRepos(cwds: Array<string | null>): string[] {
  const out = new Set<string>()
  for (const cwd of cwds) {
    if (!cwd) continue
    const root = findRepoRoot(cwd)
    if (root) out.add(root)
  }
  return [...out]
}

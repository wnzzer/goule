import { opendir } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'

export interface FindFilesOptions {
  extension?: string
  exactDepth?: number
}

/**
 * 使用 Node 标准库递归查找文件。目录不可读时安全跳过，符号链接不跟随，
 * 避免扫描 session 目录时陷入循环。
 */
export async function findFiles(root: string, options: FindFilesOptions = {}): Promise<string[]> {
  const found: string[] = []

  const walk = async (dir: string): Promise<void> => {
    let handle
    try { handle = await opendir(dir) } catch { return }

    for await (const entry of handle) {
      if (entry.isSymbolicLink()) continue
      const path = join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(path)
        continue
      }
      if (!entry.isFile()) continue
      if (options.extension && !entry.name.endsWith(options.extension)) continue
      if (options.exactDepth !== undefined) {
        const depth = relative(root, path).split(sep).filter(Boolean).length
        if (depth !== options.exactDepth) continue
      }
      found.push(path)
    }
  }

  await walk(root)
  return found.sort()
}

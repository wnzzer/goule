import { parseInstant } from '../types/instant'
import type { RawCommit } from './types'

/** git log 的记录/字段分隔符。用不可见控制字符，避免与提交标题冲突。 */
export const RECORD_SEP = '\x1e'
export const FIELD_SEP = '\x1f'

/** 与 parseLogOutput 一一对应，改一处必须改另一处 */
export const PRETTY_FORMAT =
  `${RECORD_SEP}%H${FIELD_SEP}%aI${FIELD_SEP}%cI${FIELD_SEP}%ae${FIELD_SEP}%D${FIELD_SEP}%s`

/**
 * 解析 `git log --numstat --pretty=<PRETTY_FORMAT>` 的输出。
 *
 * numstat 对二进制文件输出 `-\t-\t<path>`：计入文件数，但不计增删行，
 * 否则一张图片会被当成 0 行改动之外的噪声。
 */
export function parseLogOutput(out: string): RawCommit[] {
  const commits: RawCommit[] = []

  for (const chunk of out.split(RECORD_SEP)) {
    if (!chunk.trim()) continue
    const nl = chunk.indexOf('\n')
    const header = nl === -1 ? chunk : chunk.slice(0, nl)
    const body = nl === -1 ? '' : chunk.slice(nl + 1)

    const [hash, iso, committedIso, authorEmail, refs, ...rest] = header.split(FIELD_SEP)
    if (!hash || !iso) continue
    // subject 里可能含分隔符以外的任意字符；rest 重新拼回，避免截断
    const subject = rest.join(FIELD_SEP)
    const at = parseInstant(iso)
    if (at === null) continue
    const committedAt = parseInstant(committedIso ?? '') ?? at

    let insertions = 0
    let deletions = 0
    let files = 0
    for (const line of body.split('\n')) {
      if (!line.trim()) continue
      const [add, del] = line.split('\t')
      if (add === undefined || del === undefined) continue
      files++
      if (add === '-' || del === '-') continue
      insertions += Number(add) || 0
      deletions += Number(del) || 0
    }

    commits.push({
      hash,
      shortHash: hash.slice(0, 7),
      authorEmail: authorEmail ?? '',
      at,
      committedAt,
      refs: refs ? refs.split(', ').filter(Boolean) : [],
      subject,
      insertions,
      deletions,
      files,
    })
  }

  return commits
}

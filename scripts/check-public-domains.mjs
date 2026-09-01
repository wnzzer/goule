import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const blockedDomains = [
  /debugmode\.cn/i,
  /miaoda\.feishu\.cn/i,
]

const trackedFiles = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean)

const violations = []

for (const file of trackedFiles) {
  let content
  try {
    content = readFileSync(file, 'utf8')
  } catch {
    continue
  }

  // Skip binary files; domain checks are intended for source, config, and docs.
  if (content.includes('\0')) continue

  const lines = content.split(/\r?\n/)
  lines.forEach((line, index) => {
    if (blockedDomains.some((pattern) => pattern.test(line))) {
      violations.push(`${file}:${index + 1}`)
    }
  })
}

if (violations.length > 0) {
  console.error('Disallowed company domains found in tracked files:')
  for (const violation of violations) console.error(`- ${violation}`)
  process.exit(1)
}

console.log('Public-domain check passed.')

# 测试 fixture

本目录下的 `.jsonl` 均由 `scripts/make-fixture.ts` 从真实 session 文件生成，
已剥除全部 `content` / 工具参数与结果 / 思维链，并把 `/Users/<name>` 替换为
`/Users/tester`。

**不得手工放入未经该脚本处理的真实 session 文件。**

若剥除正文后 L1–L4 的测试仍全部通过，即证明这几层确实只依赖元数据 ——
这是设计文档 §10 要求的隐私边界验证。

重新生成：

```bash
bun run scripts/make-fixture.ts ~/.claude/projects/<proj>/<uuid>.jsonl \
  tests/fixtures/claude-code-basic.jsonl 200
```

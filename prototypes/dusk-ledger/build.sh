#!/usr/bin/env bash
# 重新构建原型 bundle：修改 app.jsx / tweaks-panel.jsx 后运行本脚本
set -euo pipefail
cd "$(dirname "$0")"
bun build ./standalone-entry.jsx --outfile app.bundle.js --minify --format iife
echo "app.bundle.js rebuilt"

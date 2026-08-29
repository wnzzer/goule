/**
 * Goule 品牌图标：黄昏表盘（同心落日）+ 收工刻度线 + 末端 commit 菱形。
 * 与 assets/icon.svg 保持同一份图形定义，512 视图坐标系，透明背景。
 * 修改图形时请同步 assets/icon.svg 并运行 scripts/render-icon.ts。
 */
const ICON_MARK = `<g opacity="0.14"><path d="M134 260A122 122 0 0 0 378 260" stroke="#8FE08A" stroke-width="22"/><path d="M178 260A78 78 0 0 0 334 260" stroke="#8FE08A" stroke-width="22"/><path d="M211 260A45 45 0 0 0 301 260Z" fill="#8FE08A"/></g><line x1="96" y1="260" x2="396" y2="260" stroke="#93A0AD" stroke-opacity="0.65" stroke-width="7" stroke-linecap="round"/><path d="M134 260A122 122 0 0 1 378 260" stroke="#8FE08A" stroke-width="22"/><path d="M178 260A78 78 0 0 1 334 260" stroke="#8FE08A" stroke-width="22"/><path d="M211 260A45 45 0 0 1 301 260Z" fill="#8FE08A"/><path d="M416 240L436 260L416 280L396 260Z" fill="#62D6A7"/>`

/** 放进另一个 SVG 里的定位分组，左上角对齐 (x, y)，边长 size。 */
export function gouleIconGroup(x: number, y: number, size: number): string {
  return `<g data-goule-logo="true" transform="translate(${x} ${y}) scale(${size / 512})">${ICON_MARK}</g>`
}

/** HTML 内联使用的独立 svg 元素。 */
export function gouleIconInline(size: number): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${ICON_MARK}</svg>`
}

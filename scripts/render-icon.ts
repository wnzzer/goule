import { Resvg } from "@resvg/resvg-js";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
// 当前启用浅绿色主题款；琥珀色原版保留在 assets/icon.svg
const svg = readFileSync(join(root, "assets", "icon-green.svg"), "utf-8");

for (const size of [512, 256, 128, 64, 32]) {
  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: size } });
  const png = resvg.render().asPng();
  const name = size === 512 ? "icon.png" : `icon-${size}.png`;
  writeFileSync(join(root, "assets", name), png);
  console.log(`assets/${name} (${size}x${size})`);
}

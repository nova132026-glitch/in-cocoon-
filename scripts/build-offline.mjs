import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(projectRoot, "dist");
const outputDir = path.join(projectRoot, "离线运行版");
const templateDir = path.join(projectRoot, "offline-assets");

let html = await readFile(path.join(distDir, "index.html"), "utf8");
const cssMatch = html.match(/<link[^>]+href="([^"]+\.css)"[^>]*>/);
const scriptMatch = html.match(/<script[^>]+src="([^"]+\.js)"[^>]*><\/script>/);

if (!cssMatch || !scriptMatch) {
  throw new Error("没有找到Vite构建后的CSS或JavaScript资源");
}

const resolveBuiltAsset = (relativeUrl) =>
  path.join(distDir, relativeUrl.replace(/^\.\//, ""));
const css = await readFile(resolveBuiltAsset(cssMatch[1]), "utf8");
const javascript = await readFile(resolveBuiltAsset(scriptMatch[1]), "utf8");

const inlineScript = `<script>${javascript.replaceAll("</script>", "<\\/script>")}</script>`;
html = html
  .replace(cssMatch[0], () => `<style>${css}</style>`)
  .replace(scriptMatch[0], "")
  .replace("</body>", () => `  ${inlineScript}\n  </body>`);

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });
await writeFile(path.join(outputDir, "index.html"), html, "utf8");
await cp(path.join(distDir, "videos"), path.join(outputDir, "videos"), {
  recursive: true,
});
await cp(templateDir, outputDir, { recursive: true });

console.log(`离线运行版已生成：${outputDir}`);

import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.join(projectRoot, "离线运行版");
const html = await readFile(path.join(outputDir, "index.html"), "utf8");
const scriptMatch = html.match(/<script>([\s\S]*)<\/script>/);

const checks = {
  inlineStyle: /<style>[\s\S]+<\/style>/.test(html),
  inlineScript: Boolean(scriptMatch),
  externalScript: /<script[^>]+src=/.test(html),
  externalStyle: /<link[^>]+href=/.test(html),
  builtAssetReference: /\.\/assets\/index-/.test(html),
  remoteResource: /(?:src|href)=["']https?:\/\//.test(html),
  localVideo: html.includes("./videos/piano.mp4"),
  scriptAfterRoot:
    html.indexOf('<div id="root"></div>') >= 0 &&
    html.indexOf("<script>") > html.indexOf('<div id="root"></div>'),
};

if (scriptMatch) {
  // 只校验单文件脚本的语法，不在 Node.js 中执行浏览器代码。
  new Function(scriptMatch[1]);
}

await access(path.join(outputDir, "videos", "piano.mp4"));
await access(path.join(outputDir, "启动-macOS.command"), constants.X_OK);
await access(path.join(outputDir, "启动-Windows.bat"));
await access(path.join(outputDir, "启动-Windows.ps1"));

const failed =
  !checks.inlineStyle ||
  !checks.inlineScript ||
  checks.externalScript ||
  checks.externalStyle ||
  checks.builtAssetReference ||
  checks.remoteResource ||
  !checks.localVideo ||
  !checks.scriptAfterRoot;

console.log(JSON.stringify(checks, null, 2));
if (failed) process.exitCode = 1;

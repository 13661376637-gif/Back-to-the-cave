import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, "..");
const outputDir = path.join(projectRoot, "代码截图");
const playwrightPath = "C:/Users/shang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";
const { chromium } = await import(pathToFileURL(playwrightPath).href);

fs.mkdirSync(outputDir, { recursive: true });

function lines(file, start, end) {
  const source = fs.readFileSync(path.join(projectRoot, file), "utf8").split(/\r?\n/);
  return source.slice(start - 1, end).map((text, offset) => ({
    number: start + offset,
    text,
  }));
}

function joinSections(file, sections) {
  const result = [];
  for (const [index, range] of sections.entries()) {
    if (index > 0) result.push({ number: "...", text: "// ..." });
    result.push(...lines(file, range[0], range[1]));
  }
  return result;
}

function escapeHtml(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function highlightCode(value) {
  const paintCode = (part) => escapeHtml(part)
    .replace(/\b(const|let|var|function|return|if|else|for|while|async|await|new|class|import|from|export|true|false|null|undefined)\b/g, '<span class="keyword">$1</span>')
    .replace(/\b(THREE|Math|navigator|window|document|session|renderer|controller|uniforms)\b/g, '<span class="object">$1</span>')
    .replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="number">$1</span>');
  return value.split(/(\/\/.*$|`[^`]*`|"[^"\n]*"|'[^'\n]*')/gm).map((part) => {
    if (part.startsWith("//")) return `<span class="comment">${escapeHtml(part)}</span>`;
    if (/^(?:`|"|')/.test(part)) return `<span class="string">${escapeHtml(part)}</span>`;
    return paintCode(part);
  }).join("") || "&nbsp;";
}

const cards = [
  {
    output: "01-WebXR-手柄输入.png",
    file: "src/webxr.js",
    label: "WEBXR / CONTROLLER INPUT",
    title: "RIGHT TRIGGER ROUTING",
    sections: [[142, 171]],
  },
  {
    output: "02-手电筒-透明光柱.png",
    file: "src/flashlight-node.js",
    label: "THREE.JS / FLASHLIGHT",
    title: "TRANSPARENT DIAMOND BEAM",
    sections: [[28, 59]],
  },
  {
    output: "03-照片揭示-Shader.png",
    file: "src/photo-reveal-game.js",
    label: "WEBGL / SHADER MATERIAL",
    title: "PHOTO REVEAL SPOTLIGHT",
    sections: [[21, 32], [41, 64]],
  },
  {
    output: "04-四关玩法-答题状态机.png",
    file: "src/photo-reveal-game.js",
    label: "GAMEPLAY / LEVEL STATE",
    title: "FOUR LEVELS + ANSWER FLOW",
    sections: [[8, 14], [446, 460], [541, 551]],
  },
  {
    output: "05-录屏UI-水平稳定.png",
    file: "src/game-ui.js",
    label: "VR UI / VIDEO CALIBRATION",
    title: "HEAD-ROLL STABILIZATION",
    sections: [[388, 421]],
  },
];

function renderDocument(card, codeLines) {
  const rows = codeLines.map(({ number, text }) => `
    <div class="line">
      <span class="line-number">${number}</span>
      <code>${highlightCode(text)}</code>
    </div>`).join("");

  return `<!doctype html>
  <html><head><meta charset="utf-8"><style>
    * { box-sizing: border-box; }
    html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; background: #080b12; }
    body { padding: 58px; font-family: "Cascadia Code", "Consolas", monospace; color: #d8e3ef; }
    .editor { height: 100%; overflow: hidden; border: 1px solid #344255; background: #0c111b; box-shadow: 0 22px 60px rgba(0, 0, 0, .48); }
    .bar { height: 74px; display: flex; align-items: center; gap: 18px; padding: 0 28px; border-bottom: 1px solid #263345; background: #101925; }
    .dots { display: flex; gap: 9px; }
    .dot { width: 11px; height: 11px; border-radius: 50%; }
    .dot:nth-child(1) { background: #f06a72; }.dot:nth-child(2) { background: #f4bf4f; }.dot:nth-child(3) { background: #4dd6b4; }
    .meta { display: grid; gap: 5px; letter-spacing: .08em; }
    .label { color: #6dd8dd; font-size: 16px; font-weight: 700; }
    .file { color: #8495aa; font-size: 15px; letter-spacing: 0; }
    .title { margin-left: auto; color: #f1f5fa; font-size: 17px; font-weight: 700; letter-spacing: .06em; }
    .code { height: calc(100% - 74px); overflow: hidden; padding: 30px 28px 34px; }
    .line { display: grid; grid-template-columns: 64px minmax(0, 1fr); min-height: 25px; font-size: 16px; line-height: 1.54; white-space: pre; }
    .line-number { padding-right: 22px; text-align: right; color: #4d5d70; border-right: 1px solid #1e2a38; user-select: none; }
    code { min-width: 0; padding-left: 26px; overflow: hidden; text-overflow: clip; }
    .keyword { color: #d6a4ff; }.object { color: #74d6e7; }.string { color: #b5dc7d; }.number { color: #f4bd76; }.comment { color: #66788d; font-style: italic; }
  </style></head><body>
    <main class="editor">
      <header class="bar"><div class="dots"><i class="dot"></i><i class="dot"></i><i class="dot"></i></div>
      <div class="meta"><div class="label">${card.label}</div><div class="file">${card.file}</div></div><div class="title">${card.title}</div></header>
      <section class="code">${rows}</section>
    </main>
  </body></html>`;
}

const browser = await chromium.launch({
  headless: true,
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });

for (const card of cards) {
  const codeLines = joinSections(card.file, card.sections);
  await page.setContent(renderDocument(card, codeLines), { waitUntil: "load" });
  await page.screenshot({ path: path.join(outputDir, card.output), type: "png" });
}

await browser.close();
console.log(`Exported ${cards.length} code screenshots to ${outputDir}`);

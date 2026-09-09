// Runs the browser-only suite against a temporary local server.
import http from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { extname, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const chrome = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8" };

if (!existsSync(chrome)) throw new Error(`Chrome was not found at ${chrome}. Set CHROME_PATH to run browser tests.`);

const server = http.createServer(async (request, response) => {
  const requestPath = new URL(request.url, `http://${request.headers.host}`).pathname;
  const candidate = resolve(root, `.${normalize(requestPath === "/" ? "/index.html" : requestPath)}`);
  if (!candidate.startsWith(root)) return response.writeHead(403).end("Forbidden");
  try {
    const body = await readFile(candidate);
    response.writeHead(200, { "Content-Type": mime[extname(candidate)] || "application/octet-stream", "Cache-Control": "no-store" }).end(body);
  } catch {
    response.writeHead(404).end("Not found");
  }
});

await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
const { port } = server.address();
const browser = spawn(chrome, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--dump-dom", `http://127.0.0.1:${port}/browser-tests.html`], { windowsHide: true });
let stdout = "";
let stderr = "";
browser.stdout.on("data", (data) => { stdout += data; });
browser.stderr.on("data", (data) => { stderr += data; });
const exitCode = await new Promise((resolveExit) => browser.on("close", resolveExit));
await new Promise((resolveClose) => server.close(resolveClose));

const result = stdout.match(/BROWSER_TESTS:[\s\S]*?<\/pre>/)?.[0].replace(/<[^>]*>/g, "").trim() || "Browser test result marker missing";
console.log(result);
if (exitCode !== 0 || !result.startsWith("BROWSER_TESTS: PASS")) {
  if (stderr.trim()) console.error(stderr.trim());
  process.exitCode = 1;
}

import { spawn } from "node:child_process";
import { existsSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";

const cli = join(process.cwd(), "node_modules", "vinext", "dist", "cli.js");
const outputDirectory = join(process.cwd(), "dist");
rmSync(outputDirectory, { recursive: true, force: true });
const child = spawn(process.execPath, [cli, "build"], {
  cwd: process.cwd(),
  env: process.env,
  stdio: ["inherit", "pipe", "pipe"],
});

let output = "";
for (const stream of [child.stdout, child.stderr]) {
  stream.on("data", (chunk) => {
    const text = chunk.toString();
    output += text;
    (stream === child.stdout ? process.stdout : process.stderr).write(chunk);
  });
}

child.on("close", (code) => {
  const repositoryName = process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "";
  const isProjectPagesBuild =
    process.env.GITHUB_ACTIONS === "true" &&
    repositoryName.length > 0 &&
    !repositoryName.endsWith(".github.io");

  if (isProjectPagesBuild) {
    const nestedAssets = join(outputDirectory, "client", repositoryName, "_next");
    const rootAssets = join(outputDirectory, "client", "_next");
    if (existsSync(nestedAssets)) {
      renameSync(nestedAssets, rootAssets);
      rmSync(join(outputDirectory, "client", repositoryName), { recursive: true, force: true });
    }
  }

  const outputReady =
    existsSync(join(outputDirectory, "client", "index.html")) &&
    existsSync(join(outputDirectory, "client", "data", "events.json"));

  if (code === 0 && outputReady) process.exit(0);
  if (code === 0) {
    console.error("정적 빌드 산출물(index.html 또는 events.json)을 찾지 못했습니다.");
    process.exit(1);
  }

  // vinext beta occasionally trips a libuv cleanup assertion on Windows only
  // after a fully completed static build. Never mask Linux/CI or real failures.
  const windowsCleanupBug =
    process.platform === "win32" &&
    output.includes("Build complete") &&
    outputReady;

  if (windowsCleanupBug) {
    console.warn("\nWindows 후처리 경고를 확인했지만 정적 빌드 산출물은 정상 생성되었습니다.");
    process.exit(0);
  }

  process.exit(code ?? 1);
});

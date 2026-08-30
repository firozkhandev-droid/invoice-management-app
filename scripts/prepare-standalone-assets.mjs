import { cp, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const standaloneDir = path.join(root, ".next", "standalone");
const nextStaticDir = path.join(root, ".next", "static");
const standaloneNextDir = path.join(standaloneDir, ".next");
const standaloneStaticDir = path.join(standaloneNextDir, "static");
const publicDir = path.join(root, "public");
const standalonePublicDir = path.join(standaloneDir, "public");

if (!existsSync(standaloneDir)) {
  console.log("No standalone output found; skipping standalone asset preparation.");
  process.exit(0);
}

if (!existsSync(nextStaticDir)) {
  throw new Error("Next static output was not found at .next/static.");
}

await mkdir(standaloneNextDir, { recursive: true });
await rm(standaloneStaticDir, { recursive: true, force: true });
await cp(nextStaticDir, standaloneStaticDir, { recursive: true });

if (existsSync(publicDir)) {
  await rm(standalonePublicDir, { recursive: true, force: true });
  await cp(publicDir, standalonePublicDir, { recursive: true });
}

console.log("Prepared standalone assets: .next/static and public copied into .next/standalone.");

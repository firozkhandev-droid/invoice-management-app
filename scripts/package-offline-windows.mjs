import { existsSync } from "node:fs";
import { copyFile, cp, mkdir, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const root = process.cwd();
const packageName = "invoice-management-offline-windows";
const distDir = path.join(root, "dist");
const packageDir = path.join(distDir, packageName);
const standaloneDir = path.join(root, ".next", "standalone");
const staticDir = path.join(root, ".next", "static");
const publicDir = path.join(root, "public");
const prismaCli = path.join(root, "node_modules", "prisma", "build", "index.js");

const offlineEnv = {
  ...process.env,
  DATABASE_URL: "file:./offline-data/offline.db",
  UPLOAD_DIR: "offline-data/uploads",
  NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3000",
  AUTH_SECRET: "offline-personal-auth-secret-change-me",
  BANK_FIELD_ENCRYPTION_KEY: "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
  NODE_ENV: "production"
};

function run(command, args, options = {}) {
  const executable = command === "node" ? process.execPath : command;
  const result = spawnSync(executable, args, {
    cwd: root,
    env: offlineEnv,
    encoding: options.capture ? "utf8" : undefined,
    stdio: options.capture ? "pipe" : "inherit",
    shell: false
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    if (options.capture) {
      process.stdout.write(result.stdout || "");
      process.stderr.write(result.stderr || "");
    }
    process.exit(result.status ?? 1);
  }

  return options.capture ? result.stdout : "";
}

async function copyIfExists(from, to) {
  if (existsSync(from)) {
    await cp(from, to, { recursive: true });
  }
}

async function createBlankOfflineDatabase(targetPath) {
  const sql = run(
    "node",
    [
      prismaCli,
      "migrate",
      "diff",
      "--from-empty",
      "--to-schema-datamodel",
      "prisma/schema.offline.prisma",
      "--script"
    ],
    { capture: true }
  ).trim();

  await mkdir(path.dirname(targetPath), { recursive: true });
  await rm(targetPath, { force: true });

  const db = new DatabaseSync(targetPath);
  try {
    db.exec("PRAGMA foreign_keys = OFF;");
    db.exec(sql);
    db.exec("PRAGMA foreign_keys = ON;");
  } finally {
    db.close();
  }
}

function launcherCmd() {
  return `@echo off
setlocal
cd /d "%~dp0"

if not exist "offline-data\\uploads" mkdir "offline-data\\uploads"
if not exist "offline-data\\offline.db" (
  if exist "offline-data\\offline-template.db" (
    copy /Y "offline-data\\offline-template.db" "offline-data\\offline.db" >nul
  ) else (
    echo Offline database is missing.
    echo Restore offline-data\\offline.db from backup or rebuild the package.
    pause
    exit /b 1
  )
)

if exist "runtime\\node.exe" (
  set "NODE_EXE=%~dp0runtime\\node.exe"
) else (
  set "NODE_EXE=node"
)

set "NODE_ENV=production"
set "HOSTNAME=127.0.0.1"
set "PORT=3000"
set "DB_PATH=%~dp0offline-data\\offline.db"
set "DB_PATH=%DB_PATH:\\=/%"
set "DATABASE_URL=file:%DB_PATH%"
set "UPLOAD_DIR=offline-data/uploads"
set "NEXT_PUBLIC_APP_URL=http://127.0.0.1:3000"
set "AUTH_SECRET=offline-personal-auth-secret-change-me"
set "BANK_FIELD_ENCRYPTION_KEY=MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY="

echo.
echo Invoice Management Offline
echo URL: http://127.0.0.1:3000
echo Data: %~dp0offline-data
echo.
echo Keep this window open while using the app.
echo Press Ctrl+C here to stop it.
echo.
start "" "http://127.0.0.1:3000"
"%NODE_EXE%" server.js
pause
`;
}

function resetCmd() {
  return `@echo off
setlocal
cd /d "%~dp0"
echo This will delete the offline database and uploaded files in this package.
choice /C YN /M "Reset offline data"
if errorlevel 2 exit /b 0
del /f /q "offline-data\\offline.db" 2>nul
rmdir /s /q "offline-data\\uploads" 2>nul
mkdir "offline-data\\uploads"
if exist "offline-data\\offline-template.db" (
  copy /Y "offline-data\\offline-template.db" "offline-data\\offline.db" >nul
  echo Data reset to a blank offline database.
) else (
  echo Template database is missing. Re-extract a fresh package to reset.
)
pause
`;
}

function readmeText() {
  return `# Invoice Management Offline for Windows

Double-click \`Start Invoice Management.cmd\`.

The app opens at:

\`\`\`
http://127.0.0.1:3000
\`\`\`

Keep the command window open while using the app. Close it or press Ctrl+C to stop.

## Your Offline Data

- Database: \`offline-data/offline.db\`
- Uploads and generated PDFs: \`offline-data/uploads\`

Back up the full \`offline-data\` folder.

## First Login

Register a local account from the Create account page. This package starts with a blank local database.

## Notes

- This package is for personal offline Windows use.
- It does not need Hostinger or the online MySQL database.
- Do not upload this package folder to public hosting because it contains local personal data after use.
`;
}

await rm(packageDir, { recursive: true, force: true });
await mkdir(packageDir, { recursive: true });

run("node", ["scripts/prepare-offline-schema.mjs"]);
run("node", [prismaCli, "generate", "--schema", "prisma/schema.offline.prisma"]);
run("node", ["scripts/offline.mjs", "build"]);

await cp(standaloneDir, packageDir, { recursive: true });
await mkdir(path.join(packageDir, ".next"), { recursive: true });
await rm(path.join(packageDir, ".next", "static"), { recursive: true, force: true });
await cp(staticDir, path.join(packageDir, ".next", "static"), { recursive: true });
await copyIfExists(publicDir, path.join(packageDir, "public"));
await mkdir(path.join(packageDir, "offline-data", "uploads"), { recursive: true });
const templateDatabasePath = path.join(packageDir, "offline-data", "offline-template.db");
const activeDatabasePath = path.join(packageDir, "offline-data", "offline.db");
await createBlankOfflineDatabase(templateDatabasePath);
await copyFile(templateDatabasePath, activeDatabasePath);

const nodePath = process.execPath;
if (existsSync(nodePath)) {
  await mkdir(path.join(packageDir, "runtime"), { recursive: true });
  await copyFile(nodePath, path.join(packageDir, "runtime", "node.exe"));
}

await writeFile(path.join(packageDir, "Start Invoice Management.cmd"), launcherCmd(), "utf8");
await writeFile(path.join(packageDir, "Reset Offline Data.cmd"), resetCmd(), "utf8");
await writeFile(path.join(packageDir, "README-OFFLINE.md"), readmeText(), "utf8");
await writeFile(
  path.join(packageDir, ".env"),
  [
    "DATABASE_URL=file:./offline-data/offline.db",
    "UPLOAD_DIR=offline-data/uploads",
    "NEXT_PUBLIC_APP_URL=http://127.0.0.1:3000",
    "AUTH_SECRET=offline-personal-auth-secret-change-me",
    "BANK_FIELD_ENCRYPTION_KEY=MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
    ""
  ].join("\n"),
  "utf8"
);

console.log(`Prepared Windows offline package at ${path.relative(root, packageDir)}.`);

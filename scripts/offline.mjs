import { existsSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const root = process.cwd();
const envPath = path.join(root, ".env.offline");
const dataDir = path.join(root, "offline-data");

const defaultEnv = {
  DATABASE_URL: "file:./offline.db",
  UPLOAD_DIR: "offline-data/uploads",
  NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3000",
  AUTH_SECRET: "offline-personal-auth-secret-change-me",
  BANK_FIELD_ENCRYPTION_KEY: "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY="
};

function parseEnv(content) {
  const values = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

async function loadOfflineEnv() {
  const fileEnv = existsSync(envPath) ? parseEnv(await readFile(envPath, "utf8")) : {};
  return {
    ...process.env,
    ...defaultEnv,
    ...fileEnv,
    NODE_ENV: process.env.NODE_ENV || fileEnv.NODE_ENV || "development"
  };
}

function run(command, args, env) {
  const executable = command === "node" ? process.execPath : command;
  const result = spawnSync(executable, args, {
    cwd: root,
    env,
    stdio: "inherit",
    shell: false
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function capture(command, args, env) {
  const executable = command === "node" ? process.execPath : command;
  const result = spawnSync(executable, args, {
    cwd: root,
    env,
    encoding: "utf8",
    shell: false
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.stdout.write(result.stdout || "");
    process.stderr.write(result.stderr || "");
    process.exit(result.status ?? 1);
  }

  return result.stdout;
}

function sqlitePathFromDatabaseUrl(databaseUrl) {
  if (!databaseUrl.startsWith("file:")) {
    throw new Error("Offline DATABASE_URL must use a file: SQLite URL.");
  }

  const filePath = databaseUrl.slice("file:".length).split("?")[0];
  if (path.isAbsolute(filePath)) return filePath;

  return path.resolve(root, "prisma", filePath);
}

function applyOfflineDatabase(env, prismaCli) {
  const databasePath = sqlitePathFromDatabaseUrl(env.DATABASE_URL);
  const databaseExists = existsSync(databasePath);
  const diffArgs = databaseExists
    ? ["migrate", "diff", "--from-url", env.DATABASE_URL, "--to-schema-datamodel", "prisma/schema.offline.prisma", "--script"]
    : ["migrate", "diff", "--from-empty", "--to-schema-datamodel", "prisma/schema.offline.prisma", "--script"];
  const sql = capture("node", [prismaCli, ...diffArgs], env).trim();

  if (!sql || sql.includes("This is an empty migration")) {
    console.log(`Offline database is already up to date at ${path.relative(root, databasePath)}.`);
    return;
  }

  const db = new DatabaseSync(databasePath);
  try {
    db.exec("PRAGMA foreign_keys = OFF;");
    db.exec(sql);
    db.exec("PRAGMA foreign_keys = ON;");
  } finally {
    db.close();
  }

  console.log(`Prepared offline SQLite database at ${path.relative(root, databasePath)}.`);
}

const command = process.argv[2];
const env = await loadOfflineEnv();
const prismaCli = path.join(root, "node_modules", "prisma", "build", "index.js");
const nextCli = path.join(root, "node_modules", "next", "dist", "bin", "next");

await mkdir(path.join(dataDir, "uploads"), { recursive: true });

switch (command) {
  case "schema":
    run("node", ["scripts/prepare-offline-schema.mjs"], env);
    break;
  case "setup":
    run("node", ["scripts/prepare-offline-schema.mjs"], env);
    run("node", [prismaCli, "generate", "--schema", "prisma/schema.offline.prisma"], env);
    applyOfflineDatabase(env, prismaCli);
    break;
  case "dev":
    run("node", ["scripts/prepare-offline-schema.mjs"], { ...env, NODE_ENV: "development" });
    run("node", [prismaCli, "generate", "--schema", "prisma/schema.offline.prisma"], { ...env, NODE_ENV: "development" });
    run("node", [nextCli, "dev"], { ...env, NODE_ENV: "development" });
    break;
  case "build":
    run("node", ["scripts/prepare-offline-schema.mjs"], { ...env, NODE_ENV: "production" });
    run("node", [prismaCli, "generate", "--schema", "prisma/schema.offline.prisma"], { ...env, NODE_ENV: "production" });
    run("node", [nextCli, "build"], { ...env, NODE_ENV: "production" });
    break;
  case "studio":
    run("node", ["scripts/prepare-offline-schema.mjs"], env);
    run("node", [prismaCli, "studio", "--schema", "prisma/schema.offline.prisma"], env);
    break;
  default:
    console.error("Usage: node scripts/offline.mjs <schema|setup|dev|build|studio>");
    process.exit(1);
}

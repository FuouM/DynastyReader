#!/usr/bin/env node

/**
 * Version bumping script for DynastyReader.
 *
 * Updates version across all project manifests:
 *  - package.json
 *  - package-lock.json
 *  - src-tauri/Cargo.toml
 *  - src-tauri/Cargo.lock
 *  - src-tauri/tauri.conf.json
 *  - src/constants.ts
 *
 * Usage:
 *   node scripts/bump-version.js <patch | minor | major | X.Y.Z> [--tag] [--dry-run]
 *   npm run bump -- patch
 *   npm run bump -- 0.4.2 --tag
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const args = process.argv.slice(2);
const isDryRun = args.includes("--dry-run");
const shouldTag = args.includes("--tag") || args.includes("-t");
const cleanArgs = args.filter((a) => !a.startsWith("-"));

const targetArg = cleanArgs[0];

// Read current version from package.json
const pkgPath = path.join(ROOT, "package.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
const currentVersion = pkg.version;

if (!targetArg || targetArg === "help" || targetArg === "--help") {
  console.log(`DynastyReader Version Bumper\n`);
  console.log(`Current version: ${currentVersion}\n`);
  console.log(`Usage:`);
  console.log(`  node scripts/bump-version.js <patch | minor | major | X.Y.Z> [--tag] [--dry-run]`);
  console.log(`\nExamples:`);
  console.log(`  npm run bump -- patch         # Bumps to next patch (e.g. 0.4.1 -> 0.4.2)`);
  console.log(`  npm run bump -- minor         # Bumps to next minor (e.g. 0.4.1 -> 0.5.0)`);
  console.log(`  npm run bump -- 0.4.2         # Explicit version`);
  console.log(`  npm run bump -- 0.4.2 --tag   # Explicit version and create git tag v0.4.2`);
  process.exit(0);
}

function parseSemver(ver) {
  const clean = ver.startsWith("v") ? ver.slice(1) : ver;
  const match = clean.match(/^(\d+)\.(\d+)\.(\d+)(?:-([\w.-]+))?$/);
  if (!match) return null;
  return {
    major: Number.parseInt(match[1], 10),
    minor: Number.parseInt(match[2], 10),
    patch: Number.parseInt(match[3], 10),
    prerelease: match[4] || null,
    clean,
  };
}

const currentSemver = parseSemver(currentVersion);
if (!currentSemver) {
  console.error(`Error: Current version "${currentVersion}" in package.json is not valid semver.`);
  process.exit(1);
}

let nextVersion = "";
if (targetArg === "patch") {
  nextVersion = `${currentSemver.major}.${currentSemver.minor}.${currentSemver.patch + 1}`;
} else if (targetArg === "minor") {
  nextVersion = `${currentSemver.major}.${currentSemver.minor + 1}.0`;
} else if (targetArg === "major") {
  nextVersion = `${currentSemver.major + 1}.0.0`;
} else {
  const parsed = parseSemver(targetArg);
  if (!parsed) {
    console.error(`Error: Invalid version "${targetArg}". Expected semver (e.g. 0.4.2) or patch/minor/major.`);
    process.exit(1);
  }
  nextVersion = parsed.clean;
}

if (nextVersion === currentVersion) {
  console.log(`Version is already ${currentVersion}. Nothing to do.`);
  process.exit(0);
}

console.log(`Bumping version: ${currentVersion} -> ${nextVersion}${isDryRun ? " (DRY RUN)" : ""}\n`);

const filesToUpdate = [
  {
    path: "package.json",
    replace: (content) =>
      content.replace(
        new RegExp(`("version"\\s*:\\s*)"${escapeRegExp(currentVersion)}"`),
        `$1"${nextVersion}"`,
      ),
  },
  {
    path: "package-lock.json",
    replace: (content) => {
      // Top-level version
      let updated = content.replace(
        new RegExp(`("name"\\s*:\\s*"dynasty-reader",\\s*\\n\\s*"version"\\s*:\\s*)"${escapeRegExp(currentVersion)}"`),
        `$1"${nextVersion}"`,
      );
      // packages[""] version
      updated = updated.replace(
        new RegExp(`("packages"\\s*:\\s*\\{\\s*"\\s*"\\s*:\\s*\\{\\s*\\n\\s*"name"\\s*:\\s*"dynasty-reader",\\s*\\n\\s*"version"\\s*:\\s*)"${escapeRegExp(currentVersion)}"`),
        `$1"${nextVersion}"`,
      );
      return updated;
    },
  },
  {
    path: "src-tauri/Cargo.toml",
    replace: (content) =>
      content.replace(
        new RegExp(`(\\[package\\][\\s\\S]*?name\\s*=\\s*"dynasty-scans-reader"[\\s\\S]*?version\\s*=\\s*)"${escapeRegExp(currentVersion)}"`),
        `$1"${nextVersion}"`,
      ),
  },
  {
    path: "src-tauri/Cargo.lock",
    replace: (content) =>
      content.replace(
        new RegExp(`(\\[\\[package\\]\\]\\s*\\nname\\s*=\\s*"dynasty-scans-reader"\\s*\\nversion\\s*=\\s*)"${escapeRegExp(currentVersion)}"`),
        `$1"${nextVersion}"`,
      ),
  },
  {
    path: "src-tauri/tauri.conf.json",
    replace: (content) =>
      content.replace(
        new RegExp(`("version"\\s*:\\s*)"${escapeRegExp(currentVersion)}"`),
        `$1"${nextVersion}"`,
      ),
  },
  {
    path: "src/constants.ts",
    replace: (content) =>
      content.replace(
        new RegExp(`(export\\s+const\\s+APP_VERSION\\s*=\\s*)"${escapeRegExp(currentVersion)}"`),
        `$1"${nextVersion}"`,
      ),
  },
];

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

let hasError = false;
for (const item of filesToUpdate) {
  const fullPath = path.join(ROOT, item.path);
  if (!fs.existsSync(fullPath)) {
    console.error(`  [MISSING] ${item.path}`);
    hasError = true;
    continue;
  }
  const original = fs.readFileSync(fullPath, "utf8");
  const updated = item.replace(original);

  if (original === updated) {
    console.warn(`  [UNMODIFIED] ${item.path} (could not find version "${currentVersion}")`);
    hasError = true;
  } else {
    if (!isDryRun) {
      fs.writeFileSync(fullPath, updated, "utf8");
    }
    console.log(`  ✓ ${item.path}`);
  }
}

if (hasError) {
  console.error(`\nSome files could not be updated. Please check the warnings above.`);
  process.exit(1);
}

console.log(`\nSuccessfully bumped all files to ${nextVersion}!`);

if (shouldTag) {
  const tagName = `v${nextVersion}`;
  if (isDryRun) {
    console.log(`Would create git tag: ${tagName}`);
  } else {
    try {
      execSync(`git tag ${tagName}`, { cwd: ROOT, stdio: "inherit" });
      console.log(`Created git tag: ${tagName}`);
    } catch (err) {
      console.error(`Failed to create git tag:`, err.message);
      process.exit(1);
    }
  }
}

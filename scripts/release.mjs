#!/usr/bin/env node
/**
 * 一键发布脚本。
 *
 * 约束：main 分支禁止直接提交，发布必须走 dev -> PR -> main，
 * npm 包与 GitHub Release 由 CI 在 PR 合并后自动完成。
 *
 * 用法：
 *   npm run release patch     # 0.3.1 -> 0.3.2
 *   npm run release minor     # 0.3.1 -> 0.4.0
 *   npm run release major     # 0.3.1 -> 1.0.0
 *   npm run release 0.5.0     # 显式指定版本号
 *
 * 本脚本只做三件事：跑测试 -> 递增版本号并提交 -> 推送 dev 并创建 PR。
 */

import { execFileSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const PKG_PATH = join(ROOT, "package.json")
const BASE_BRANCH = "dev"
const TARGET_BRANCH = "main"
const REPO_SLUG = "GuoChen-thlg/opencode-auto-provider-models"

/**
 * 执行 shell 命令，实时输出结果
 * @param {string} cmd - 命令
 * @param {string[]} args - 参数列表
 * @returns {string} 命令标准输出（去空白）
 */
function run(cmd, args) {
  return execFileSync(cmd, args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }).trim()
}

/**
 * 打印错误并退出
 * @param {string} msg - 错误信息
 * @returns {never}
 */
function fail(msg) {
  console.error(`\x1b[31m[release] 失败：${msg}\x1b[0m`)
  process.exit(1)
}

/**
 * 解析语义化版本号
 * @param {string} version - 形如 0.3.1
 * @returns {{major: number, minor: number, patch: number}}
 */
function parseVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version)
  if (!match) fail(`package.json 中的 version 不是合法语义化版本：${version}`)
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) }
}

/**
 * 根据发布级别计算新版本号
 * @param {string} current - 当前版本号
 * @param {string} level - patch | minor | major | x.y.z
 * @returns {string} 新版本号
 */
function bumpVersion(current, level) {
  if (/^\d+\.\d+\.\d+$/.test(level)) return level
  const { major, minor, patch } = parseVersion(current)
  if (level === "patch") return `${major}.${minor}.${patch + 1}`
  if (level === "minor") return `${major}.${minor + 1}.0`
  if (level === "major") return `${major + 1}.0.0`
  fail(`未知的发布级别：${level}（应为 patch | minor | major | x.y.z）`)
}

const level = process.argv[2]
if (!level) fail("缺少发布级别，用法：npm run release patch|minor|major|x.y.z")

const pkg = JSON.parse(readFileSync(PKG_PATH, "utf8"))
const currentVersion = pkg.version
const nextVersion = bumpVersion(currentVersion, level)

// 1. 必须在 dev 分支上操作
const branch = run("git", ["rev-parse", "--abbrev-ref", "HEAD"])
if (branch !== BASE_BRANCH) fail(`必须在 ${BASE_BRANCH} 分支上发布，当前在 ${branch}`)

// 2. 工作区必须干净，避免把无关改动带进发布提交
const status = run("git", ["status", "--porcelain"])
if (status) fail(`工作区有未提交改动，先提交或暂存：\n${status}`)

// 3. 发布前跑全部测试
console.log(`\x1b[36m[release] 运行测试...\x1b[0m`)
try {
  execFileSync("npm", ["test"], { cwd: ROOT, stdio: "inherit" })
} catch {
  fail("测试未通过，已中止发布")
}

// 4. 确保本地 dev 与远程一致，避免基于过期代码发布
run("git", ["fetch", "origin", BASE_BRANCH])
const aheadBehind = run("git", ["rev-list", "--left-right", "--count", `origin/${BASE_BRANCH}...HEAD`])
if (aheadBehind) {
  const [behind, ahead] = aheadBehind.split(/\s+/).map(Number)
  if (behind > 0) fail(`本地 ${BASE_BRANCH} 落后远程 ${behind} 个提交，先执行 git pull`)
  if (ahead > 0) run("git", ["push", "origin", BASE_BRANCH])
}

// 5. 改版本号并提交
pkg.version = nextVersion
writeFileSync(PKG_PATH, `${JSON.stringify(pkg, null, 2)}\n`)
run("git", ["add", "package.json"])
run("git", ["commit", "-m", `chore: release v${nextVersion}`])
run("git", ["push", "origin", BASE_BRANCH])

// 6. 创建 PR（已存在则复用）
console.log(`\x1b[36m[release] 创建 PR ${BASE_BRANCH} -> ${TARGET_BRANCH}...\x1b[0m`)
let prUrl = ""
try {
  prUrl = run("gh", [
    "pr", "create",
    "--base", TARGET_BRANCH,
    "--head", BASE_BRANCH,
    "--title", `chore: release v${nextVersion}`,
    "--body", `发布 v${nextVersion}（原版本 v${currentVersion}）。\n\n合并后 CI 自动打 tag、创建 GitHub Release 并发布 npm 包。`,
  ])
} catch {
  const existing = run("gh", ["pr", "list", "--base", TARGET_BRANCH, "--head", BASE_BRANCH, "--json", "url"])
  const parsed = JSON.parse(existing || "[]")
  if (parsed.length > 0) {
    prUrl = parsed[0].url
    console.warn("\x1b[33m[release] PR 已存在，复用现有 PR\x1b[0m")
  } else {
    fail("创建 PR 失败")
  }
}

console.log(`\x1b[32m[release] 完成\x1b[0m`)
console.log(`  版本：v${currentVersion} -> v${nextVersion}`)
console.log(`  PR：${prUrl}`)
console.log(`\n  合并 PR 后 CI 会自动发布到 GitHub Packages。\n  合并后在远程仓库确认：https://github.com/${REPO_SLUG}/releases`)

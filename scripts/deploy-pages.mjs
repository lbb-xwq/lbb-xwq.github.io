#!/usr/bin/env node
/**
 * 把 Next.js 静态导出产物发布到 GitHub Pages。
 *
 * 部署模型：master 放源码，gh-pages 放构建产物（孤立提交，无历史累积）。
 * 为什么不用 GitHub Actions：本机 gh 的 lbb-xwq token 只有 gist/read:org/repo 三个 scope，
 * 没有 workflow 权限，推不了 .github/workflows/*.yml；走分支部署就不需要那个权限。
 *
 * 用法：
 *   npm run deploy
 *
 * 可选环境变量：
 *   PAGES_GH_ACCOUNT  用哪个 gh 账号取 token（默认 lbb-xwq）
 *   PAGES_SKIP_BUILD  设为 1 则复用现有 out/，不重新构建
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REPO = 'lbb-xwq/lbb-xwq.github.io';
const BRANCH = 'gh-pages';
const SITE = 'https://lbb-xwq.github.io/';
const ACCOUNT = process.env.PAGES_GH_ACCOUNT ?? 'lbb-xwq';

/** 跑命令并把输出透传到终端 */
function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { stdio: 'inherit', ...opts });
}

/** 跑命令但捕获输出，出错时把 token 从报错信息里抹掉再抛 */
function capture(cmd, args, opts = {}) {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', ...opts });
  } catch (err) {
    const raw = `${err?.stdout ?? ''}${err?.stderr ?? ''}${err?.message ?? ''}`;
    throw new Error(raw.split(secret).join('***'));
  }
}

let secret = '';

// 1) 构建静态产物
if (process.env.PAGES_SKIP_BUILD === '1') {
  if (!existsSync('out')) throw new Error('PAGES_SKIP_BUILD=1 但没有 out/ 目录');
  console.log('→ 复用现有 out/（PAGES_SKIP_BUILD=1）');
} else {
  console.log('→ npm run build');
  run('npm', ['run', 'build'], { shell: true });
}

// 2) 取 token，不打印
try {
  secret = capture('gh', ['auth', 'token', '-u', ACCOUNT]).trim();
} catch {
  throw new Error(`拿不到 ${ACCOUNT} 的 gh token，先执行：gh auth login -u ${ACCOUNT}`);
}
if (!secret) throw new Error(`拿不到 ${ACCOUNT} 的 gh token，先执行：gh auth login -u ${ACCOUNT}`);

// 3) 产物拷进临时目录，作为一次孤立提交推上去
const dist = mkdtempSync(join(tmpdir(), 'pages-'));
try {
  cpSync('out', dist, { recursive: true });

  // core.autocrlf=false：Windows 上默认会把换行 CRLF 化，字符串里的 token 必须原样进 URL 所以不能动
  const git = (args) => capture('git', ['-c', 'core.autocrlf=false', ...args], { cwd: dist });

  git(['init', '-q', '-b', BRANCH]);
  git(['add', '-A']);
  git([
    '-c',
    'user.name=刘兵兵',
    '-c',
    'user.email=13697004800@163.com',
    'commit',
    '-q',
    '-m',
    `deploy: ${new Date().toISOString()}`,
  ]);
  git(['remote', 'add', 'origin', `https://${ACCOUNT}:${secret}@github.com/${REPO}.git`]);
  // credential.helper= 清空继承来的凭证助手，否则本机 GCM 里存的 lbb-bob 会抢先
  git(['-c', 'credential.helper=', 'push', '-f', 'origin', BRANCH]);
} finally {
  rmSync(dist, { recursive: true, force: true });
}

console.log(`\n✓ 已发布到 ${SITE}（1~2 分钟后生效，CDN 有缓存）`);

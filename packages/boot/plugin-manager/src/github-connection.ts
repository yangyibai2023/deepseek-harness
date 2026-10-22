/** Bounded GitHub repository checks using the installer's Git configuration and environment. */
import { mkdir, mkdtemp, open } from 'node:fs/promises'
import { join } from 'node:path'
import { accessSync, constants } from 'node:fs'
import { delimiter, join as joinPath } from 'node:path'

/**
 * Whether `name` is an executable reachable on PATH — a pure filesystem probe.
 *
 * Never spawns the binary: on macOS, spawning a missing `git` makes the system
 * pop its Xcode Command Line Tools installer, which is exactly what we must avoid.
 */
function hasExecutable(name: string): boolean {
  const dirs = (process.env.PATH ?? '').split(delimiter).filter(dir => dir !== '')
  const exts = process.platform === 'win32'
    ? (process.env.PATHEXT ?? '.EXE;.CMD;.BAT;.COM').split(';')
    : ['']
  for (const dir of dirs) {
    for (const ext of exts) {
      try {
        accessSync(joinPath(dir, name + ext), constants.X_OK)
        return true
      } catch { /* 继续找 */ }
    }
  }
  return false
}

import { execa } from 'execa'
import { scrubbedParentEnv } from '@deepseek-ai/dsh-subprocess'
import { classifyInstallFailure } from './install-failure.ts'
import type { ParsedInstallSpec } from './install-spec.ts'
import type { PackageResult } from './types.ts'

/** Deadline, diagnostics and cancellation for one read-only GitHub check. */
export interface GithubConnectionOptions {
  timeoutMs: number
  outputBytes: number
  signal: AbortSignal
  /** The application-owned package manager's environment, also used by its Git children. */
  env?: Readonly<Record<string, string>>
}

/**
 * Check a GitHub repository before pnpm starts, without downloading or building its package.
 * Git reads the profile's Git and proxy configuration without invoking credential helpers or prompting.
 * Timeout and cancellation terminate its descendants too; pnpm owns authentication and transport fallback.
 * @param spec The parsed installation address; npm packages, local paths and other hosts are not checked.
 * @param dir The profile directory where installation runs.
 * @param options The connection deadline, output bound and operation cancellation.
 * @returns A failed check with bounded output and a complete log at logPath, or undefined for a reachable repository or an unhandled spec.
 */
export async function checkGithubConnection(
  spec: ParsedInstallSpec, dir: string, options: GithubConnectionOptions,
): Promise<PackageResult | undefined> {
  if (spec.kind !== 'git') return undefined
  const host = spec.host.toLowerCase().replace(/:.*$/, '')
  if (host !== 'github.com' && !host.endsWith('.github.com')) return undefined
  /* HeightLab（2026-10-22 用户明确要求「不弹，而不是弹友好提示」）：
   *
   * 这台机器没有 git 时，`execa('git', ...)` 会触发 macOS 的 **Xcode 命令行
   * 工具安装框**（系统级弹窗，我们无法拦截、无法替换文案）。用户实测在
   * 0.4.4 与 0.4.7 都见到过。
   *
   * 既然 git 根本不存在，这次检查必然失败且失败得毫无信息量（pnpm 随后同样
   * 会失败）。所以直接**跳过检查**：不 spawn 任何进程 = 不会弹框。
   * 真正安装失败时由 pnpm 的错误信息呈现，那条路径是我们自己的 UI。
   *
   * 只读 PATH 查找，不执行 git。 */
  if (!hasExecutable('git')) {
    await mkdir(join(dir, '.plugin-manager', 'logs'), { recursive: true, mode: 0o700 }).catch(() => {})
    return undefined
  }
  const repository = spec.spec.replace(/#.*$/s, '')
    .replace(/^github:/i, 'https://github.com/')
    .replace(/^gist:/i, 'https://gist.github.com/')
    .replace(/^git\+/i, '')
  const logRoot = join(dir, '.plugin-manager', 'logs')
  await mkdir(logRoot, { recursive: true, mode: 0o700 })
  const logDir = await mkdtemp(join(logRoot, 'github-connection-'))
  const logPath = join(logDir, 'git.log')
  const log = await open(logPath, 'ax+', 0o600)
  try {
    const result = await execa('git', ['-c', 'credential.helper=', 'ls-remote', '--', repository, 'HEAD'], {
      cwd: dir,
      env: {
        ...scrubbedParentEnv(), ...options.env, LC_ALL: 'C', GIT_TERMINAL_PROMPT: '0',
        GIT_ASKPASS: '', SSH_ASKPASS: '', SSH_ASKPASS_REQUIRE: 'never',
      },
      extendEnv: false,
      stdin: 'ignore', stdout: 'ignore', stderr: { file: logPath, append: true }, buffer: false, reject: false,
      timeout: options.timeoutMs, cancelSignal: options.signal, killDescendants: true, killSignal: 'SIGKILL',
    })
    if (!result.failed) return undefined
    if (result.timedOut) await log.write(`dsh: connection to ${spec.host} timed out after ${String(options.timeoutMs)}ms\n`)
    if ((await log.stat()).size === 0) await log.write(result.shortMessage ?? 'GitHub connection check failed')
    const { size } = await log.stat()
    const bytes = Buffer.alloc(Math.min(size, options.outputBytes))
    await log.read(bytes, 0, bytes.length, size - bytes.length)
    const output = bytes.toString('utf8')
    return {
      exitCode: result.exitCode ?? (result.code === 'ENOENT' ? 127 : 1), output, truncated: size > options.outputBytes, logPath,
      kind: classifyInstallFailure({ log: output, timedOut: result.timedOut }),
    }
  } finally {
    await log.close()
  }
}

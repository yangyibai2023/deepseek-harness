// @vitest-environment jsdom
/**
 * O130 持久层行为门禁（2026-11-27，用户「要做成门禁，不要只写日志」）。
 *
 * 钉住三连修的行为语义（用户 APP 实测驱动的三个真 bug，回退任何一个必红）：
 *   ①「本地有、远端 null」的键必须上行（O104 脏键 bug：pull 误标已推送→永不上行）
 *   ②远端有值的键 pull 覆盖本地后不重复上行（防回环）
 *   ③pull 灌入 hl-project-display-v1 时必须补发 hl:project-display-changed
 *     （APP 容器首渲染后收到数据不重排的时序 bug）
 *   ④写 override 事件触发防抖 push（移动操作即时上行）
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const SYNCED_SAMPLE = 'hl-ops-groups-v1'
const DISPLAY_KEY = 'hl-project-display-v1'

type FetchCall = { url: string; body?: Record<string, unknown> }

function stubEnv(remoteValues: Record<string, string | null>) {
  const calls: FetchCall[] = []
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.startsWith('/hl/ops/store') && init?.method === 'POST') {
      calls.push({ url, body: JSON.parse(String(init.body)) as Record<string, unknown> })
      return new Response(JSON.stringify({ ok: true, savedAt: Date.now(), userId: 'u1' }), { status: 200 })
    }
    if (url.startsWith('/hl/ops/store')) {
      const keys = new URL(url, 'http://x').searchParams.get('keys')?.split(',') ?? []
      const values: Record<string, string | null> = {}
      for (const k of keys) values[k] = remoteValues[k] ?? null
      return new Response(JSON.stringify({ ok: true, savedAt: 1, userId: 'u1', values }), { status: 200 })
    }
    return new Response('{}', { status: 404 })
  }))
  return calls
}

async function freshModule() {
  vi.resetModules()
  return await import('../src/client/skeleton/HeightLabOpsDurability.ts')
}

beforeEach(() => {
  window.localStorage.clear()
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('ops durability cross-container semantics (O130 gates)', () => {
  it('① pushes a key that exists locally but is null on the host (the never-upload bug)', async () => {
    window.localStorage.setItem(DISPLAY_KEY, '{"s1":"w1"}')
    const calls = stubEnv({ [DISPLAY_KEY]: null })
    const m = await freshModule()
    m.startOpsDurability()
    await vi.runAllTimersAsync()
    const post = calls.find(c => c.body !== undefined)
    expect(post).toBeDefined()
    expect((post!.body!.values as Record<string, string>)[DISPLAY_KEY]).toBe('{"s1":"w1"}')
  })

  it('② does not re-upload a key the host already holds (no echo loop)', async () => {
    window.localStorage.setItem(SYNCED_SAMPLE, 'remote-value')
    const calls = stubEnv({ [SYNCED_SAMPLE]: 'remote-value' })
    const m = await freshModule()
    m.startOpsDurability()
    await vi.runAllTimersAsync()
    // 启动链 pull→push：远端已有的键不该出现在任何 POST 的 values 里
    for (const c of calls) {
      const values = (c.body?.values ?? {}) as Record<string, string>
      expect(Object.keys(values)).not.toContain(SYNCED_SAMPLE)
    }
  })

  it('③ dispatches hl:project-display-changed when pull brings a new display override', async () => {
    const calls = stubEnv({ [DISPLAY_KEY]: '{"s2":"w2"}' })
    void calls
    const m = await freshModule()
    const seen = vi.fn()
    window.addEventListener('hl:project-display-changed', seen)
    m.startOpsDurability()
    await vi.runAllTimersAsync()
    expect(window.localStorage.getItem(DISPLAY_KEY)).toBe('{"s2":"w2"}')
    expect(seen).toHaveBeenCalled()
    window.removeEventListener('hl:project-display-changed', seen)
  })

  it('④ a move (display-changed event) triggers the debounced push', async () => {
    window.localStorage.setItem(DISPLAY_KEY, '{"s3":"w3"}')
    const calls = stubEnv({})
    const m = await freshModule()
    m.startOpsDurability()
    await vi.runAllTimersAsync()
    calls.length = 0
    // 模拟「移动到项目」写入 + 事件
    window.localStorage.setItem(DISPLAY_KEY, '{"s3":"w9"}')
    window.dispatchEvent(new CustomEvent('hl:project-display-changed'))
    await vi.runAllTimersAsync()
    const post = calls.find(c => ((c.body?.values ?? {}) as Record<string, string>)[DISPLAY_KEY] === '{"s3":"w9"}')
    expect(post).toBeDefined()
  })
})

/**
 * HeightLab（2026-10-19 用户拍板）：把 ds-bot 的「长期记忆」作为**全局**能力
 * 开放到设置里。
 *
 * 为什么选它：盘完 ds-bot 的 9 个设置页，只有「记忆」是我们原来完全没有的能力
 * （团队外观/Bots/群聊/能力/定时任务都绑定团队语义；用量已单独全局化；密钥已隐
 * 藏）。记忆让 Bot 跨会话记住用户偏好与事实，对个人模式同样有价值。
 *
 * 实现原则同全局用量：**读复用 ds-bot 的实现，不另建一套**。
 *   · 列表/条目 → `window.dshBot.settings.actions.memoryView(botId)`（它自己的
 *     memory 模块，读写同一份 `~/.heightlab/dsh-home/bot/memory/`）；
 *   · 编辑 → 打开 ds-bot 原生的记忆面板（`actions.openMemory(botId)`）。那个弹层
 *     只挂在团队 surface 上，所以点「管理」先切到团队再打开，行为与原生完全一致。
 *
 * 只读展示放在这里，是为了让用户不切模式也能看见「Bot 记住了什么」——记忆是
 * 隐私敏感数据，能看比能改更重要。
 */
import { useCallback, useEffect, useState } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './TeamSettingsSection.module.css'
import {
  ensureDsBotStyles, pollDsBotBridge, readDsBotBridge, type DsBotSettingsBridge,
} from './dsbot-bridge.ts'

interface MemoryEntry {
  text?: string
  topic?: string
  scope?: string
}

interface MemoryBot {
  id: string
  name: string
  role?: string
}

interface MemoryView {
  entries: MemoryEntry[]
  sizes?: { own?: number; team?: number }
}

/** 桥的 actions 是通用函数表，这里只挑我们要用的两个。 */
interface MemoryActions {
  memoryView?: (botId: string) => Promise<MemoryView>
  openMemory?: (botId: string) => void
}

const SHOW_LIMIT = 12

export function GlobalMemorySection(_props: PropsRuntime<'settings.section'>) {
  const [bridge, setBridge] = useState<DsBotSettingsBridge | undefined>(readDsBotBridge)
  const [views, setViews] = useState<Record<string, MemoryView>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | undefined>()

  useEffect(() => { ensureDsBotStyles() }, [bridge])

  useEffect(() => {
    if (bridge !== undefined) return
    return pollDsBotBridge(setBridge)
  }, [bridge])

  // roster 是 ds-bot 的**源**对象，`bots` 只在快照里（团队设置页同样用
  // getSnapshot()，直接读源会得到 undefined——2026-10-19 实测：记忆页一直
  // 停在「正在读取记忆……」）。
  const bots = ((): MemoryBot[] => {
    const roster = bridge?.roster as {
      getSnapshot?: () => { bots?: MemoryBot[] }
      bots?: MemoryBot[]
    } | undefined
    const snapshot = typeof roster?.getSnapshot === 'function' ? roster.getSnapshot() : roster
    return Array.isArray(snapshot?.bots) ? snapshot.bots : []
  })()

  useEffect(() => {
    if (bridge === undefined) return
    // 桥已就绪但没有 Bot：直接结束加载态，否则会永远停在「正在读取记忆……」。
    if (bots.length === 0) {
      setLoading(false)
      return
    }
    const actions = bridge.actions as unknown as MemoryActions
    const view = actions.memoryView
    if (view === undefined) {
      setLoading(false)
      setError('记忆接口不可用（补丁版本过旧，请重启应用）')
      return
    }
    let alive = true
    setLoading(true)
    void Promise.all(bots.map(async (bot): Promise<[string, MemoryView]> => {
      try {
        return [bot.id, await view(bot.id)]
      } catch {
        return [bot.id, { entries: [] }]
      }
    })).then((rows) => {
      if (!alive) return
      const next: Record<string, MemoryView> = {}
      for (const [id, value] of rows) next[id] = value
      setViews(next)
      setLoading(false)
    })
    return () => { alive = false }
    // bots 由 roster 派生；长度变化才重新拉取。
  }, [bridge, bots.length])

  const manage = useCallback((botId: string) => {
    const actions = bridge?.actions as unknown as MemoryActions | undefined
    if (actions?.openMemory === undefined) return
    // 记忆面板只挂在团队 surface 上：先切过去再打开，与原生行为一致。
    try {
      window.localStorage.setItem('ds-bot:surface', 'bot')
    } catch { /* 隐私模式：下面的 reload 会退回默认 surface */ }
    window.dispatchEvent(new CustomEvent('hl:request-team-surface'))
    window.setTimeout(() => { actions.openMemory?.(botId) }, 600)
  }, [bridge])

  if (bridge === undefined) {
    return <div className={css.placeholder}>记忆正在加载……</div>
  }

  return (
    <div className={css.root}>
      <div className={css.usageHint}>
        每个 Bot 都有自己的长期记忆：它在这台电脑上记住的用户偏好、事实和约定，
        跨会话保留。这里只读展示它记住了什么；需要修改时点「管理」。
      </div>
      {error !== undefined && <div className={css.failure} role="alert">{error}</div>}
      {loading && <div className={css.placeholder}>正在读取记忆……</div>}
      {!loading && bots.length === 0 && (
        <div className={css.placeholder}>团队里还没有 Bot。切到「团队」建一个之后，它的记忆会出现在这里。</div>
      )}
      {!loading && bots.map((bot) => {
        const entries = views[bot.id]?.entries ?? []
        const shown = entries.slice(0, SHOW_LIMIT)
        return (
          <section key={bot.id} className={css.memCard}>
            <div className={css.memHead}>
              <span className={css.memName}>{bot.name}</span>
              {bot.role !== undefined && bot.role !== '' && <span className={css.memRole}>{bot.role}</span>}
              <span className={css.memCount}>{entries.length} 条</span>
              <button type="button" className={css.memManage} onClick={() => { manage(bot.id) }}>管理</button>
            </div>
            {entries.length === 0
              ? <div className={css.memEmpty}>还没有记住任何内容。对话里说过的重要偏好会自动沉淀到这里。</div>
              : (
                <ul className={css.memList}>
                  {shown.map((entry, index) => (
                    <li key={index} className={css.memItem}>
                      <span className={css.memDot} aria-hidden="true" />
                      <span>{(entry.text ?? '').slice(0, 240) || '（空条目）'}</span>
                    </li>
                  ))}
                  {entries.length > SHOW_LIMIT && (
                    <li className={css.memMore}>还有 {entries.length - SHOW_LIMIT} 条，点「管理」查看全部</li>
                  )}
                </ul>
              )}
          </section>
        )
      })}
    </div>
  )
}

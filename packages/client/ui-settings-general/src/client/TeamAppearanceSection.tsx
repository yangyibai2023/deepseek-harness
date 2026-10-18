/**
 * HeightLab（2026-10-19 用户拍板）：把 ds-bot 的「外观」设置并入全局设置。
 *
 * 背景：ds-bot 自带的设置面板里 General 页有 主题 / 强调色 / 动画 三项，与
 * 我们全局设置的「外观」（浅色/深色/跟随系统）在观感上撞车，用户要求
 * 「同一个选项不要出现在两个不同的设置里」。因此把它整体搬到全局设置，
 * 团队设置里只留团队专属的页面（Bots / 群聊 / 连接器 / 能力 / 用量 / 密钥 /
 * 反馈）。
 *
 * 数据通道：ds-bot 的偏好存在它自己的 roster.prefs（宿主侧 state.json），
 * 通过 `POST /api/bot {endpoint:'state'}` 读、`{endpoint:'set-prefs'}` 写。
 * 主题列表用 `window.dshBot.themes()` 动态取（它注册了哪些就用哪些），
 * 避免我们硬编码后与插件升级脱节。
 */
import { useEffect, useState } from 'react'
import { SegmentedControl } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './DeveloperToolsRow.module.css'

/** ds-bot 强调色（与它 INKS 表一致；只列它默认展示的 7 档）。 */
const ACCENTS: ReadonlyArray<{ id: string; label: string; ink: string }> = [
  { id: 'deepseek', label: 'DeepSeek 蓝', ink: '#4D6BFE' },
  { id: 'charcoal', label: '炭黑', ink: '#141416' },
  { id: 'graphite', label: '石墨', ink: '#2D2D2D' },
  { id: 'rose', label: '玫红', ink: '#EC2F6B' },
  { id: 'sky', label: '天青', ink: '#0AA8D6' },
  { id: 'tangerine', label: '橘橙', ink: '#FF6900' },
  { id: 'cobalt', label: '钴蓝', ink: '#082DFF' },
]

/** 主题的展示名（ds-bot 内部 id 保持英文，界面上给中文）。 */
const THEME_LABELS: Record<string, string> = {
  deepseek: 'DeepSeek（默认）',
  mono: '单色',
  paper: '纸张',
  moonlight: '月光',
}

const MOTIONS: ReadonlyArray<{ id: 'quiet' | 'normal' | 'lively'; label: string }> = [
  { id: 'quiet', label: '安静' },
  { id: 'normal', label: '正常' },
  { id: 'lively', label: '活泼' },
]

type Prefs = { theme?: string; accent?: string | null; motion?: string }

/** Read the bot roster state (its prefs live there). */
async function readPrefs(): Promise<Prefs | undefined> {
  try {
    const res = await fetch('/api/bot', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ endpoint: 'state', payload: {} }),
    })
    if (!res.ok) return undefined
    const data = await res.json() as { ok?: boolean; value?: { prefs?: Prefs } }
    return data?.ok === true ? data.value?.prefs ?? {} : undefined
  } catch {
    return undefined
  }
}

async function writePrefs(patch: Prefs): Promise<void> {
  try {
    await fetch('/api/bot', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ endpoint: 'set-prefs', payload: patch }),
    })
  } catch { /* 云端不可用：界面保持原值，下次进入再同步 */ }
}

/**
 * Render the team-appearance section (theme / accent / animation).
 * @returns the settings section element tree.
 */
export function TeamAppearanceSection(_props: PropsRuntime<'settings.section'>) {
  const [prefs, setPrefs] = useState<Prefs>({})
  const [themes, setThemes] = useState<string[]>(['deepseek', 'mono', 'paper', 'moonlight'])
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let alive = true
    void readPrefs().then((next) => {
      if (!alive) return
      if (next !== undefined) setPrefs(next)
      setReady(true)
    })
    // 主题清单以 ds-bot 注册的为准（它后续新增主题会自动出现）。
    const hub = (window as unknown as { dshBot?: { themes?: () => string[] } }).dshBot
    try {
      const list = hub?.themes?.()
      if (Array.isArray(list) && list.length > 0) setThemes(list)
    } catch { /* hub 未就绪：用默认清单 */ }
    return () => { alive = false }
  }, [])

  const theme = prefs.theme !== undefined && themes.includes(prefs.theme) ? prefs.theme : themes[0]
  const accent = typeof prefs.accent === 'string' ? prefs.accent : null
  const motion = prefs.motion === 'quiet' || prefs.motion === 'lively' ? prefs.motion : 'normal'

  const pickTheme = (next: string): void => {
    setPrefs(current => ({ ...current, theme: next }))
    void writePrefs({ theme: next })
  }
  const pickAccent = (next: string | null): void => {
    setPrefs(current => ({ ...current, accent: next }))
    void writePrefs({ accent: next })
  }
  const pickMotion = (next: 'quiet' | 'normal' | 'lively'): void => {
    setPrefs(current => ({ ...current, motion: next }))
    void writePrefs({ motion: next })
  }

  if (!ready) return null

  return (
    <div>
      <div className={css.row}>
        <div>
          <div className={css.title}>团队主题</div>
          <div className={css.description}>
            团队模式的配色方案，与上面的浅色/深色各自独立；只影响团队对话。
          </div>
        </div>
        <select
          aria-label="团队主题"
          value={theme}
          onChange={(event) => { pickTheme(event.target.value) }}
          style={{ minWidth: 160 }}
        >
          {themes.map(id => (
            <option key={id} value={id}>{THEME_LABELS[id] ?? id}</option>
          ))}
        </select>
      </div>

      <div className={css.row}>
        <div>
          <div className={css.title}>强调色</div>
          <div className={css.description}>
            未读标记、徽标与品牌图标的强调色；「默认」跟随所选主题。
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            aria-label="默认强调色"
            aria-pressed={accent === null}
            title="默认"
            onClick={() => { pickAccent(null) }}
            style={{
              width: 20, height: 20, borderRadius: '50%', padding: 0, cursor: 'pointer',
              background: 'transparent',
              border: accent === null ? '2px solid var(--dsw-alias-label-primary)' : '1px solid var(--dsw-alias-border-l2)',
            }}
          />
          {ACCENTS.map(item => (
            <button
              key={item.id}
              type="button"
              aria-label={item.label}
              aria-pressed={accent === item.ink}
              title={item.label}
              onClick={() => { pickAccent(item.ink) }}
              style={{
                width: 20, height: 20, borderRadius: '50%', padding: 0, cursor: 'pointer',
                background: item.ink,
                border: accent === item.ink ? '2px solid var(--dsw-alias-label-primary)' : '1px solid var(--dsw-alias-border-l2)',
              }}
            />
          ))}
        </div>
      </div>

      <div className={css.row} style={{ borderBottom: 'none' }}>
        <div>
          <div className={css.title}>团队动画</div>
          <div className={css.description}>
            团队模式里 Bot 头像的动效强度。
          </div>
        </div>
        <SegmentedControl
          id="hl-team-motion"
          label="团队动画"
          value={motion}
          options={MOTIONS.map(item => ({ value: item.id, label: item.label }))}
          onChange={pickMotion}
        />
      </div>
    </div>
  )
}

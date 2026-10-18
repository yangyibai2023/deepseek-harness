/**
 * HeightLab（2026-10-18 用户拍板）：设置 → 通用 里的「个人和团队模式融合」开关。
 *
 * 默认**关闭**：个人模式与团队模式严格隔离，个人页面的工作区列表里不出现
 * ds-bot 的团队工作区。打开后两者融合——团队工作区在个人模式下也可见可点，
 * 点开会自动跳到团队页面（这个跳转行为两种状态下都保留）。
 *
 * 状态存 localStorage（见 ui-workspace 的 fusion.ts），本行只负责读写与文案，
 * 变更通过 `hl:fusion-changed` 广播给工作区列表。
 */
import { useEffect, useState } from 'react'
import { Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './DeveloperToolsRow.module.css'

// 与 ui-workspace 的 fusion.ts 共用同一组键/事件名。这里不跨包 import，避免
// ui-settings-general → ui-workspace 的依赖倒挂；两边只共享字符串契约。
const FUSION_KEY = 'hl.personal-team-fusion'
const FUSION_EVENT = 'hl:fusion-changed'

const readFusion = (): boolean => {
  try {
    return window.localStorage.getItem(FUSION_KEY) === 'on'
  } catch {
    return false
  }
}

const writeFusion = (on: boolean): void => {
  try {
    window.localStorage.setItem(FUSION_KEY, on ? 'on' : 'off')
  } catch { /* 隐私模式：仅内存态 */ }
  window.dispatchEvent(new CustomEvent(FUSION_EVENT, { detail: { fusion: on } }))
}

/**
 * Render the personal/team fusion toggle.
 * @returns the General Settings row.
 */
export function FusionRow(_props: PropsRuntime<'settings.general.item'>) {
  const [on, setOn] = useState(readFusion)
  // 其他窗口/入口改了开关时同步本行显示。
  useEffect(() => {
    const sync = (): void => { setOn(readFusion()) }
    window.addEventListener(FUSION_EVENT, sync)
    return () => { window.removeEventListener(FUSION_EVENT, sync) }
  }, [])
  return (
    <div className={css.row}>
      <div>
        <div className={css.title}>个人和团队模式融合</div>
        <div className={css.description}>
          关闭时个人模式只显示自己的工作区，团队工作区仅在「团队」模式可见。
          打开后团队工作区在个人模式下也可查看，点击会自动切到团队页面。
        </div>
      </div>
      <Switch
        checked={on}
        label="个人和团队模式融合"
        onChange={(next) => { setOn(next); writeFusion(next) }}
      />
    </div>
  )
}

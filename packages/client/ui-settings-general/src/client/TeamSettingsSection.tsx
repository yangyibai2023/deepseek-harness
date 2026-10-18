/**
 * HeightLab（2026-10-19 用户拍板）：把 ds-bot 的团队设置**整页内嵌**进全局设置。
 *
 * 为什么：ds-bot 自带的设置面板与我们的全局设置是两套入口，用户要求「完全
 * 融合」——只留一个入口，团队专属项在「团队专属」分组下、成员专属项在
 * 「成员专属」分组下。
 *
 * 关键设计：**不重写 ds-bot 的页面**，通过补丁暴露的 `window.dshBot.settings`
 * 桥复用它的页面组件与 roster/actions。数据与行为 = ds-bot 本体，不存在两套
 * 状态；它升级新增功能这里自动跟着变。
 *
 * ⚠️ 这些页面用 **ds-bot 模块内的 React 实例**。直接放进我们的 React 树会抛
 * "Invalid hook call"（实测表现：`data-slot-error="settings.section"` 空白）。
 * 因此桥提供 `mount(container, pageId)`，由 **它自己的 ReactDOM** 渲染到我们
 * 提供的容器里——两个 React 实例各管各的 DOM 子树，互不干扰。
 */
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './TeamSettingsSection.module.css'
import { TeamAppearanceSection } from './TeamAppearanceSection.tsx'
import {
  ensureDsBotStyles, pollDsBotBridge, readDsBotBridge, type DsBotSettingsBridge,
} from './dsbot-bridge.ts'

/** Tab order/labels for the team pages (team-facing, Chinese).
 *  「外观」放第一位——它控制的就是团队页面的观感，属于团队设置的一部分。
 *  2026-10-19 用户拍板：连接器与反馈用不到，从横排里隐藏（页面实现仍保留在
 *  ds-bot 桥里，需要时把对应项加回本数组即可恢复）。 */
const APPEARANCE_PAGE = 'appearance'

const PAGES: ReadonlyArray<{ id: string; label: string }> = [
  { id: APPEARANCE_PAGE, label: '外观' },
  { id: 'bots', label: 'Bots' },
  { id: 'groups', label: '群聊' },
  { id: 'capabilities', label: '能力' },
  { id: 'schedules', label: '定时任务' },
  { id: 'usage', label: '用量' },
  { id: 'secrets', label: '密钥' },
]

const FIRST_PAGE = PAGES[0]?.id ?? 'bots'

/** 外观页是我们自己的组件，props 走同一套标准全局属性；这里原样转发。 */
const TeamAppearanceInline = TeamAppearanceSection as unknown as () => ReactNode

/**
 * Render the team settings section: a sub-nav of the eight team pages, each
 * mounted from ds-bot's own implementation into its own React root.
 */
export function TeamSettingsSection(_props: PropsRuntime<'settings.section'>) {
  const [bridge, setBridge] = useState<DsBotSettingsBridge | undefined>(readDsBotBridge)
  const [page, setPage] = useState<string>(FIRST_PAGE)
  // Callback ref, not a plain ref object: the host div only mounts once the
  // bridge is available (the placeholder branch renders before that), so the
  // mount effect must re-run when the element actually appears.
  const [host, setHost] = useState<HTMLDivElement | null>(null)
  const [failure, setFailure] = useState<string | undefined>()

  // ds-bot 的样式表只在它的团队 surface 挂载；个人模式下这些页面会只剩裸文字。
  useEffect(() => { ensureDsBotStyles() }, [bridge])

  // The bridge is published when ds-bot's client applies; poll briefly so
  // opening settings before it lands still works.
  useEffect(() => {
    if (bridge !== undefined) return
    return pollDsBotBridge(setBridge)
  }, [bridge])

  // Mount the active page through the bridge (its own React instance) and
  // unmount the previous one on switch. The appearance page is ours, so it
  // renders in this tree instead.
  const isAppearance = page === APPEARANCE_PAGE
  useEffect(() => {
    if (isAppearance) return
    if (host === null || bridge === undefined) return
    if (bridge.mount === undefined) {
      setFailure('团队设置桥缺少 mount（补丁版本过旧，请重启应用）')
      return
    }
    let dispose: (() => void) | undefined
    try {
      dispose = bridge.mount(host, page)
      // ds-bot 的 ReactDOM 渲染是异步的；这里做一次回读，把「调用成功但没画出
      // 内容」这种情况显性化，而不是留一个空框让人以为卡住。
      const stop = dispose
      const timer = window.setTimeout(() => {
        if ((host.textContent ?? '').trim() === '' && host.childElementCount === 0) {
          setFailure(`「${page}」没有渲染出内容（ds-bot 桥已调用但返回空）`)
        }
      }, 1200)
      dispose = () => {
        window.clearTimeout(timer)
        stop?.()
      }
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error))
    }
    return () => { dispose?.() }
  }, [bridge, page, host, isAppearance])

  return (
    <div className={css.root}>
      <div className={css.subnav} role="tablist" aria-label="团队设置">
        {PAGES.map(item => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={page === item.id}
            className={page === item.id ? `${css.subnavCell} ${css.subnavActive}` : css.subnavCell}
            onClick={() => { setFailure(undefined); setPage(item.id) }}
          >
            {item.label}
          </button>
        ))}
      </div>
      {failure !== undefined && <div className={css.failure} role="alert">{failure}</div>}
      {isAppearance
        ? <TeamAppearanceInline />
        : bridge === undefined
          ? <div className={css.placeholder}>团队设置正在加载……</div>
          : <div ref={setHost} className={css.body} />}
    </div>
  )
}

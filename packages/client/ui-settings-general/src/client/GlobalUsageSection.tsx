/**
 * HeightLab（2026-10-19 用户拍板）：把 ds-bot 的「用量」页作为**全局用量
 * 监测**再加一份到设置菜单，个人模式也能直接看。
 *
 * 为什么不重写：ds-bot 的用量模块扫描的是**本 DSH 的全部会话日志**（按 Bot /
 * agent / 「其他 DSH」归属），不局限于团队模式，本身就是全局台账。这里经
 * `window.dshBot.settings.mount()` 复用同一个页面组件（它自己的 React 实例），
 * 数据与行为跟团队设置里的「用量」完全一致，ds-bot 升级也自动跟随。
 *
 * 团队设置里的「用量」保留不动（用户 2026-10-19 明确要求），两处是同一个
 * 实现、同一份数据，只是入口不同。
 */
import { useEffect, useState } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './TeamSettingsSection.module.css'
import {
  ensureDsBotStyles, pollDsBotBridge, readDsBotBridge, type DsBotSettingsBridge,
} from './dsbot-bridge.ts'

const PAGE_ID = 'usage'

export function GlobalUsageSection(_props: PropsRuntime<'settings.section'>) {
  const [bridge, setBridge] = useState<DsBotSettingsBridge | undefined>(readDsBotBridge)
  const [host, setHost] = useState<HTMLDivElement | null>(null)
  const [failure, setFailure] = useState<string | undefined>()

  useEffect(() => { ensureDsBotStyles() }, [bridge])

  useEffect(() => {
    if (bridge !== undefined) return
    return pollDsBotBridge(setBridge)
  }, [bridge])

  useEffect(() => {
    if (host === null || bridge === undefined) return
    if (bridge.mount === undefined) {
      setFailure('用量页的 ds-bot 桥缺少 mount（补丁版本过旧，请重启应用）')
      return
    }
    let dispose: (() => void) | undefined
    try {
      dispose = bridge.mount(host, PAGE_ID)
      // 回读一次：桥调用成功但页面没画出内容时，显性报错而不是留空框。
      const stop = dispose
      const timer = window.setTimeout(() => {
        if ((host.textContent ?? '').trim() === '' && host.childElementCount === 0) {
          setFailure('用量页没有渲染出内容（ds-bot 桥已调用但返回空）')
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
  }, [bridge, host])

  return (
    <div className={css.root}>
      {failure !== undefined && <div className={css.failure} role="alert">{failure}</div>}
      {bridge === undefined
        ? <div className={css.placeholder}>用量统计正在加载……</div>
        : <div ref={setHost} className={`${css.body} ${css.usageScope}`} />}
    </div>
  )
}

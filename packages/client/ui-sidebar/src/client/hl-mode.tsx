/**
 * HeightLab 2026-08-29（企业版 M3）：左侧边栏「个人 | 团队」模式切换。
 *
 * 交互（用户 2026-08-29 拍板，2026-10-18 改版）：
 * - 所有登录用户可见切换项（云端组织能力降级时隐藏）。
 * - 已属于组织的用户点击「团队」直接进入企业模式。
 * - 不属于组织的用户点击「团队」弹出邀请码输入，加入成功后切企业模式；
 *   失败留在个人版，可随时切回。
 * - **2026-10-18 用户拍板**：本切换同时驱动 ds-bot 的 surface——「团队」= ds-bot
 *   模式，「个人」= 经典 Agent 模式（我们原本的页面）。两者绑成同一个入口，
 *   状态以 ds-bot 的实际 surface 为准（它自己的切换按钮改了也会同步回来）。
 *
 * 数据边界（2026-11-04 更新）：组织功能已整体取消——只有个人/团队两个模式，
 * 「OPC 团队」对所有账号无差别直进，不再查询组织归属。
 * 选择持久化 localStorage（hl.mode / hl.mode.orgId，orgId 恒为空串仅为兼容
 * 旧读取方）并广播 `hl:mode-changed`，品牌槽位插件与模板/专家数据层据此处理。
 */
import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import css from './SidebarRoot.module.css'

export type HlMode = 'personal' | 'enterprise'

const LS_MODE = 'hl.mode'
const LS_ORG = 'hl.mode.orgId'

export function readHlMode(): { mode: HlMode; orgId: string } {
  try {
    const mode = window.localStorage.getItem(LS_MODE)
    const orgId = window.localStorage.getItem(LS_ORG) ?? ''
    return { mode: mode === 'enterprise' ? 'enterprise' : 'personal', orgId }
  } catch {
    return { mode: 'personal', orgId: '' }
  }
}

/* ── ds-bot surface 桥接（2026-10-18）───────────────────────────────────────
 * ds-bot 把「经典 Agent 模式 / 它的模式」存在 localStorage `ds-bot:surface`
 * （值 `agent` / `bot`），只在插件初始化时读一次；它没有对外暴露切换 API，
 * 但两种模式各有一个官方按钮：
 *   · 经典模式里：侧栏底部 `button.bt-return[aria-label="DS Bot"]` → 进它的模式
 *   · 它的模式里：账号按钮 `button.bt-account` → 菜单「切换经典 Agent 模式」
 * 因此优先点官方按钮（瞬时、无刷新）；找不到按钮（插件未装 / 文案变了）时
 * 回退到「写 storage + reload」——这条只依赖存储键，升级后依然成立。
 */
const DSBOT_SURFACE_KEY = 'ds-bot:surface'

export type DsBotSurface = 'agent' | 'bot'

/** ds-bot 是否在场（它的 hub 在两种模式下都注册，可作为插件已加载的信号）。 */
function dsBotPresent(): boolean {
  if (typeof window === 'undefined') return false
  return (window as unknown as { dshBot?: unknown }).dshBot !== undefined
}

/** 读 ds-bot 当前 surface；插件不在场返回 undefined。 */
export function readDsBotSurface(): DsBotSurface | undefined {
  if (!dsBotPresent()) return undefined
  try {
    const raw = window.localStorage.getItem(DSBOT_SURFACE_KEY)
    /* 2026-11-03（0.5.4 FIX-18，用户要求「新用户默认进个人模式」）：
     *
     * 原来未写过时返回 'bot'（团队模式），理由是「ds-bot 自己的 readMode()
     * 默认 'bot'」。但这与 `hl.mode` 的默认值（'personal'）**不一致**，
     * 后果：全新用户首次启动时顶部「OPC 团队」高亮，直接落进团队模式，
     * 而产品预期是**个人模式首页**（文案/图片/视频创作台）。
     *
     * 现在两边对齐：未写过 → 'agent'（个人）。
     * ds-bot 自己的 readMode() 若默认 'bot'，会在它初始化时读同一 key；
     * 若首次启动读到的仍是空，DSH 侧的 surface 由我们的 switchDsBotSurface
     * 主动切到 agent（见 HlModeSwitcher 的挂载逻辑）。
     *
     * 已写过值的用户不受影响（尊重用户选择）。 */
    return raw === 'agent' ? 'agent' : raw === 'bot' ? 'bot' : 'agent'
  } catch {
    return 'agent'
  }
}

const nextFrame = (): Promise<void> => new Promise((resolve) => {
  window.requestAnimationFrame(() => { resolve() })
})

/** 等一小段时间（菜单展开有过渡动画，单帧不够）。 */
const wait = (ms: number): Promise<void> => new Promise((resolve) => {
  window.setTimeout(resolve, ms)
})

/**
 * 切换 ds-bot surface。
 * @param target - `bot` 进它的模式，`agent` 回经典 Agent 模式。
 * @returns 是否发起了一次切换（插件不在场时为 false）。
 */
export async function switchDsBotSurface(target: DsBotSurface): Promise<boolean> {
  if (!dsBotPresent()) return false
  if (readDsBotSurface() === target) return false
  // 2026-11-03（0.5.3）：优先走 hub.setSurface API——个人模式下 bt-return
  // 按钮根本不在 DOM（只在 bot surface 渲染），纯 DOM 点击会落空
  // （用户实测点 OPC 无反应）。hub 缺 API 时退回 DOM 点击后备。
  try {
    const hub = (window as unknown as { dshBot?: { setSurface?: (mode: DsBotSurface) => void } }).dshBot
    if (hub?.setSurface !== undefined) {
      hub.setSurface(target)
      return true
    }
  } catch { /* 后备 DOM 路径 */ }

  if (target === 'bot') {
    const button = document.querySelector<HTMLButtonElement>('button.bt-return')
    if (button !== null) {
      button.click()
      return true
    }
  } else {
    const account = document.querySelector<HTMLButtonElement>('button.bt-account')
    if (account !== null) {
      account.click()
      // 菜单在同一次点击后同步渲染；下一帧再找不到说明结构变了。
      await nextFrame()
      const item = [...document.querySelectorAll<HTMLElement>('button, [role="menuitem"]')]
        .find(el => /切换经典|Switch to classic/i.test(el.textContent))
      if (item !== undefined) {
        item.click()
        return true
      }
      account.click() // 关掉没点中的菜单，保持界面干净
    }
  }

  // 回退：写存储后重载，ds-bot 初始化时会读到新值。
  try {
    window.localStorage.setItem(DSBOT_SURFACE_KEY, target)
  } catch { /* 隐私模式等：只能依赖上面的按钮路径 */ }
  window.location.reload()
  return true
}

/**
 * 打开 DS Bot 设置（用户 2026-10-18：「在我们原来的用户名上方，加一个单独的
 * DSH BOT 设置」）。它没有对外暴露 openSettings，但鲸鱼账号按钮
 * （`button.bt-account`）会弹菜单，「Bot 设置」直达设置页——那里已经包含
 * 外观/主题/强调色/头像动效、Bots、群聊、Connectors、能力、定时任务、用量、
 * Secrets、反馈、关于等全部个性化项。我们只借用同一个入口，保证行为与它原生
 * 一致，且它以后新增设置分区也自动可见。
 * @returns 是否成功打开设置面板。
 */
export async function openDsBotSettings(): Promise<boolean> {
  if (!dsBotPresent()) return false
  // 经典模式下先切到它的模式——设置面板只存在于那个 surface。
  if (readDsBotSurface() !== 'bot') {
    const switched = await switchDsBotSurface('bot')
    if (!switched) return false
    // surface 切换后菜单按钮要等一帧才挂上。
    for (let i = 0; i < 40; i += 1) {
      await nextFrame()
      if (document.querySelector('button.bt-account') !== null) break
    }
  }
  const account = document.querySelector<HTMLButtonElement>('button.bt-account')
  if (account === null) return false
  account.click()
  // 菜单是 `button.bt-account` 后插入的 `.bt-account-menu`，里面是普通 button。
  // 文案随语言变化（英文 "Bot settings" / 中文「Bot 设置」），两种都收。
  for (let i = 0; i < 20; i += 1) {
    await wait(80)
    const menu = document.querySelector('.bt-account-menu')
    const scope = menu ?? document
    const item = [...scope.querySelectorAll<HTMLElement>('button, [role="menuitem"]')]
      .find(el => /bot\s*(设置|settings)/i.test(el.textContent))
    if (item !== undefined) {
      item.click()
      return true
    }
  }
  account.click() // 没找到就收起菜单，不留浮层
  return false
}

export function HlModeSwitcher() {
  const [sel, setSel] = useState(readHlMode)
  /* 2026-11-05（0.5.6）：用户显式切换标志——归位循环看到它立即让位（见下）。 */
  const userTouchedRef = useRef(false)
  // ds-bot 在场时以它的实际 surface 为准：它自己的切换按钮改了也要同步回来，
  // 否则两个入口会各说各话（轮询成本只是一次 localStorage 读）。
  const [surface, setSurface] = useState<DsBotSurface | undefined>(readDsBotSurface)
  /* 2026-11-04（用户澄清，覆盖昨晚 Bug B 的错误修法）：**组织功能已整体取消**。
   * 全世界只有两个模式：个人 / 团队（OPC）。任何账号点「OPC 团队」都直接切换，
   * 没有组织归属检查、没有邀请码、没有「联系管理员」提示——这些概念全部不存在。
   * 昨晚把邀请码面板改成「尚未加入企业团队，请联系管理员」提示仍是组织框架内
   * 的错误修法，本次连同 noOrgNotice/degraded/refreshOrgs 一起移除。 */

  useEffect(() => {
    const id = window.setInterval(() => {
      const next = readDsBotSurface()
      setSurface(current => current === next ? current : next)
    }, 600)
    // 用户在侧栏点了团队工作区里的会话 → 自动切到团队页（保留团队工作区可见，
    // 让用户能手动回看团队对话；个人页的默认工作目录仍由隔离 effect 守住）。
    const onRequestTeam = (): void => { void switchDsBotSurface('bot') }
    window.addEventListener('hl:request-team-surface', onRequestTeam)
    // C 组应用工具层（2026-10-30）：Agent 工具 heightlab_set_app_mode 的执行
    // 通道——走与用户点击完全相同的 enter() 路径（含 ds-bot surface 联动）。
    // 本 effect 依赖为空：enter 引用的是组件作用域函数（闭包稳定，不读会变的
    // state）。2026-11-04：移除 orgId 门槛——组织功能已取消，team 直进。
    const onModeRequest = (event: Event): void => {
      const mode = (event as CustomEvent<{ mode?: unknown }>).detail.mode
      if (mode !== 'personal' && mode !== 'team') return
      if (mode === 'personal') {
        enter('personal', '')
        return
      }
      enter('enterprise', '')
    }
    window.addEventListener('hl:mode-change-request', onModeRequest)
    return () => {
      window.clearInterval(id)
      window.removeEventListener('hl:request-team-surface', onRequestTeam)
      window.removeEventListener('hl:mode-change-request', onModeRequest)
    }
  }, [])

  const enter = (nextMode: HlMode, orgId: string) => {
    setSel({ mode: nextMode, orgId })
    try {
      window.localStorage.setItem(LS_MODE, nextMode)
      window.localStorage.setItem(LS_ORG, orgId)
    } catch { /* 隐私模式等：仅内存态 */ }
    window.dispatchEvent(new CustomEvent('hl:mode-changed', { detail: { mode: nextMode, orgId } }))
  }

  const choose = (mode: HlMode) => {
    // 用户显式切换：立即叫停启动归位循环（0.5.6 抢切换修复）。
    userTouchedRef.current = true
    // L1-B4（0.5.7 核查收窄）：插件未加载的启动窗口内点击 = switchDsBotSurface
    // 直接 false（hub/DOM/reload 三重兜底都够不着），用户看到「点了没反应」。
    // 审计评 P1 偏高（窗口只有几秒且再点一次自愈），修法从简：插件不在场时
    // 轮询等它加载（最多 5s）再切，不引入 reload 之类的重手法。
    const target = mode === 'enterprise' ? 'bot' : 'agent'
    if (!dsBotPresent()) {
      let waited = 0
      const waitPlugin = (): void => {
        if (dsBotPresent()) { void switchDsBotSurface(target); return }
        if (waited >= 5000) return
        waited += 250
        window.setTimeout(waitPlugin, 250)
      }
      waitPlugin()
    } else {
      void switchDsBotSurface(target)
    }
    if (mode === 'personal') {
      enter('personal', '')
      return
    }
    /* 2026-11-04（用户澄清）：组织功能已整体取消——所有账号点「OPC 团队」
     * 无差别直进团队模式。原来这里先查 /hl/org-context，空列表就弹邀请码
     * （0.5.4 前化石 UI）/提示联系管理员（0.5.4 首版错误修法）；我们自己的
     * 账号有组织数据所以从不触发，任何外部用户一撞就现形。 */
    enter('enterprise', '')
  }


  /* 2026-11-04（用户实测：重启后落在了团队页）：**启动归位个人模式**。
   * FIX-18 只解决了「新用户默认值」，但 surface/hl.mode 是持久化的——上次
   * 会话停在团队模式的话，重启仍落团队页。产品语义：个人模式是主页，
   * 团队是显式切换的工作场景，不跨会话保留（与既有铁律「启动必落新会话页」
   * 同一逻辑）。挂载时无条件归位：hl.mode=personal + surface=agent。
   *
   * 2026-11-05（0.5.5 用户实测「退出后重新登录，登录上之后默认跳到 OPC 团队页」）：
   * 原实现只在挂载时**试一次** `switchDsBotSurface('agent')`，而该函数开头是
   * `if (!dsBotPresent()) return false` —— 登录后页面刚重载，ds-bot 插件往往
   * 还没 register，于是这一枪必然落空，且**没有任何重试**。
   * 结果：`ds-bot:surface` 里持久化的 'bot'（用户上次停在团队页）一直生效，
   * 宿主日志实锤 `{"hlSync":true,"stage":"poll-publish-only","surface":"bot"}`
   * 连续多轮 —— 用户就被送进 OPC 团队页。
   *
   * 现在改成**轮询直到成功**：每 500ms 试一次，最多 60 次（30s），
   * 一旦 ds-bot 就绪且 surface 归位到 agent 就停。
   *
   * 2026-11-05（0.5.6，用户+本机 Playwright 实测抢切换）：上面「循环同时校验
   * 当前 surface」的让位设计**只对 agent 成立**——用户在窗口期点「OPC 团队」
   * 后 surface=bot，settle 的判据 `readDsBotSurface() === 'agent'` 不满足，
   * 下一次 500ms 重试会 `switchDsBotSurface('agent')` **把用户抢回个人模式**。
   * 修法：用户任何显式模式切换（choose）置 userTouchedRef，settle 每次迭代
   * 先检查——显式操作永远赢过启动归位。 */
  useEffect(() => {
    enter('personal', '')
    let tries = 0
    let stopped = false
    const settle = (): void => {
      if (stopped || userTouchedRef.current) return
      tries += 1
      // surface 已是 agent：归位完成，停止。
      if (readDsBotSurface() === 'agent') return
      void switchDsBotSurface('agent').then((switched) => {
        if (stopped || userTouchedRef.current) return
        if (switched) return
        /* L1-B5（0.5.7）：归位耗尽不再静默放弃——落宿主日志（/hl/boot-marker
         * 诊断通道），把「归位失败 30 秒」变成可观测事件，而不是用户机黑盒。 */
        if (tries >= 60) {
          try {
            void fetch('/hl/boot-marker', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ hlSettle: true, stage: 'settle-exhausted', tries, surface: readDsBotSurface() }),
            }).catch(() => { /* 非致命 */ })
          } catch { /* 非致命 */ }
          return
        }
        window.setTimeout(settle, 500)
      })
    }
    settle()
    return () => { stopped = true }
  }, [])

  const personalActive = surface === undefined ? sel.mode === 'personal' : surface === 'agent'
  const teamActive = surface === undefined ? sel.mode === 'enterprise' : surface === 'bot'

  return (
    <div>
      <div className={css.hlModeRow} role="group" aria-label="模式切换">
        <button
          type="button"
          className={clsx(css.hlModeSeg, personalActive && css.hlModeSegActive)}
          aria-pressed={personalActive}
          title="个人模式"
          onClick={() => { choose('personal') }}
        >
          个人
        </button>
        {/* 2026-10-27（1024-A6，用户拍板）：悬浮不再显示组织名（曾显示
            「极光物语」，暴露内部组织信息且无必要）。固定为「OPC 团队模式」。 */}
        <button
          type="button"
          className={clsx(css.hlModeSeg, teamActive && css.hlModeSegActive)}
          aria-pressed={teamActive}
          title="OPC 团队模式"
          onClick={() => { choose('enterprise') }}
        >
          OPC 团队
        </button>
      </div>
    </div>
  )
}

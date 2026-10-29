/**
 * Sidebar shell: column geometry and global panel navigation.
 * Collapse is a slide plus crossfade:
 * content freezes at its expanded width (inline style) and fades out in place
 * while the sliding column (AppFrame grid tracks) clips it — nothing reflows
 * mid-slide. At settle the wide-only content unmounts and the upper
 * controls enter the 56px rail from the same horizontal offset (one icon each,
 * same top-down order) on one fade that ends with the slide. The bottom-pinned
 * settings control only fades. The workspace/session browsing region between
 * global panel rows and the foot is the `sidebar.workspaces` registrant's,
 * and the foot holds `sidebar.settings` plus `sidebar.footer.action`; the shell
 * hands them the wide flag (plus an expand request callback for the browser).
 *
 * The column also owns whether the scroll regions nested in it draw a
 * scrollbar at all: the shell tracks the pointer and rebinds ui-theme's
 * scrollbar indirection away while it is elsewhere, so a list the user is not
 * pointing at carries no bar.
 */
import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
// HeightLab（2026-10-17 用户拍板）：侧栏自建行图标统一到原生 panelRow 的
// OutlineRegular 系列——基准是「插件·技能」(IconPluginPinwheelOutlineRegular)
// 与「自动化任务」(IconClockOutlineRegular)：同线条粗细、同视觉重量、同尺寸。
// 原实现「视频创作」用实心 IconSparkleRegular、「资产中心」用
// IconLibraryStroke16（不同族），折叠后三项观感明显不一致。
import {
  IconBrowseOutlineRegular, IconNewChatOutlineRegular, IconPlanOutlineRegular,
  IconWorkspaceTreeOutlineRegular, Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import {
  // HeightLab V31：创意灵感一级入口暂时隐藏（首页输入框下方的视频模板网格
  // 已承接其职责，对标 MiniMax Design）。回滚：取消下面数组里 inspiration
  // 行与第 25 行 import 中的 IconInspirationStroke16 注释即可。
  // IconInspirationStroke16,
  IconPanelLeftStroke16,
  // IconAutomationStroke16,  // HeightLab 2026-10-16：自建「自动化」入口取消（原生自动化任务承接），随条目一并停用
} from './sidebar-icons.tsx'
import { HlModeSwitcher } from './hl-mode.tsx'
import type { InjectFace, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {
  SidebarPanelMetadata, SidebarRootComponentProps, SidebarRootInjected, SidebarSectionOwnerProps,
} from './contract/slots.ts'
import css from './SidebarRoot.module.css'

/** Wide-content unmount delay; matches the 150ms wide-content fade-out. */
const COLLAPSE_SETTLE_MS = 150

/**
 * How long the column's scrollbars stay drawn after the pointer leaves it.
 * The bar is a pointer affordance here, and hiding it on the leave event
 * itself makes it blink out while the pointer is only crossing the column's
 * edge — on the way to the conversation, or around a portalled menu.
 */
const SCROLLBAR_LINGER_MS = 2000

/** Format complete-build metadata for the local brand badge. */
function localBuildVersion(): string | undefined {
  const version = process.env.DSH_CLIENT_VERSION
  if (version === undefined) return undefined
  const commit = process.env.DSH_CLIENT_COMMIT_HASH
  return version
    + (commit === undefined ? '' : `-${commit}`)
    + (process.env.DSH_CLIENT_GIT_DIRTY === 'true' ? '-dirty' : '')
}

type PanelRowProps =
  Pick<SidebarPanelMetadata, 'id' | 'label'>
  & Pick<SidebarSectionOwnerProps, 'wide'>
  & Pick<PropsRuntime<'sidebar'>, 'usePanelInfo'>
  & Pick<InjectFace<SidebarRootInjected>, 'selectPanel'>
  & PropsRenderSlots<'sidebar.panellist'>

/** Each panel row subscribes only to its own selection state. */
function PanelRow({ id, label, wide, usePanelInfo, selectPanel, renderSlot }: PanelRowProps) {
  const active = usePanelInfo(info => info.activePanelId === id)
  return (
    <Tooltip label={label} delayMs={500} disabled={wide}>
      <button
        type="button"
        className={clsx(css.panelRow, active && css.panelActive)}
        aria-label={label}
        aria-current={active ? 'page' : undefined}
        onClick={() => { selectPanel(id) }}
      >
        <span className={css.panelGlyph} aria-hidden="true">
          {renderSlot('sidebar.panellist', { size: wide ? 16 : 18, active }, { only: id })}
        </span>
        {wide && (
          <span className={clsx(css.panelTitle, css.wide)}>
            {label}
          </span>
        )}
      </button>
    </Tooltip>
  )
}

/**
 * Render the sidebar column shell.
 * @param props - composed slot props (runtime share + injected callbacks, contract/slots.ts).
 * @returns the sidebar element tree.
 */
export function SidebarRoot({
  collapsed,
  width,
  startSession,
  toggleSidebar,
  selectPanel,
  usePanels,
  usePanelInfo,
  t,
  renderSlot,
}: SidebarRootComponentProps) {
  const panels = usePanels(snapshot => snapshot)
  // Wide content stays mounted while the collapse animates (fading via
  // .collapsed .wide), unmounts at settle, and remounts right away on expand.
  const [settled, setSettled] = useState(collapsed)
  // HeightLab V26e：hl:start-replication 的消费方已迁移至 ui-workspace
  // （openWorkspace beforeOpen 精确时机：设置复刻模式标记+广播会话就绪），
  // 本组件不再监听——避免与 ui-workspace 路径双重创建会话。

  useEffect(() => {
    if (!collapsed) { setSettled(false); return }
    const timer = window.setTimeout(() => { setSettled(true) }, COLLAPSE_SETTLE_MS)
    return () => { window.clearTimeout(timer) }
  }, [collapsed])
  const wide = !collapsed || !settled

  // Freeze the content at its expanded width while it fades out (collapsed
  // && wide): the sliding column then clips it instead of reflowing it. The
  // rail layout (.collapsed styles) only applies once the fade settles.
  const lastWideWidth = useRef(width)
  if (!collapsed) lastWideWidth.current = width

  // Rail-in only crossfades a live collapse: a refresh straight into the
  // collapsed state renders the rail statically (no delay-hidden icons).
  const everWide = useRef(!collapsed)
  if (!collapsed) everWide.current = true

  // Scrollbars in the column follow the pointer (.quietBars rebinds them
  // away): drawn while it is inside, and for SCROLLBAR_LINGER_MS after it
  // leaves. A pointer that returns within that window cancels the pending
  // hide rather than restarting from a hidden bar.
  const column = useRef<HTMLDivElement>(null)
  const [pointerInside, setPointerInside] = useState(false)
  // HeightLab（2026-10-17）：自建 hub 行（视频创作/资产中心）的选中态跟踪——
  // 与原生 panelActive 同款反馈；关闭 hub/新会话/点面板行时清除。
  const [activeHub, setActiveHub] = useState<string | null>(null)
  const lingerTimer = useRef<number | undefined>(undefined)
  const armLinger = (): void => {
    if (lingerTimer.current !== undefined) return
    lingerTimer.current = window.setTimeout(() => {
      lingerTimer.current = undefined
      setPointerInside(false)
    }, SCROLLBAR_LINGER_MS)
  }
  const cancelLinger = (): void => {
    window.clearTimeout(lingerTimer.current)
    lingerTimer.current = undefined
  }
  // Leaving is decided by the column's BOX, not by DOM containment, and only
  // while the bars are drawn. ui-settings renders its full-viewport panel as a
  // fixed-position DESCENDANT of this column, so a pointer moved onto that
  // panel — or onto the conversation once it closes — fires no `pointerleave`
  // here, and the bars would stay drawn over a column nobody is pointing at.
  // The element's own leave stays as the one signal geometry cannot give: a
  // pointer that leaves the window emits no further moves.
  useEffect(() => {
    const onCloseHub = (): void => { setActiveHub(null) }
    window.addEventListener('hl:close-hub', onCloseHub)
    return () => { window.removeEventListener('hl:close-hub', onCloseHub) }
  }, [])

  // HeightLab（2026-10-19）：底部「更多能力」图标要打开插件面板。那个按钮在
  // HeightLabAccountFoot 里（ui-settings-general），拿不到 layout 服务，因此
  // 由本组件把窗口事件转成 selectPanel —— selectPanel 就在本组件 props 里。
  useEffect(() => {
    const onOpenPanel = (event: Event): void => {
      const panel = (event as CustomEvent<{ panel?: unknown }>).detail?.panel
      if (typeof panel !== 'string' || panel === '') return
      setActiveHub(null)
      selectPanel(panel as Parameters<typeof selectPanel>[0])
    }
    window.addEventListener('hl:open-panel', onOpenPanel)
    return () => { window.removeEventListener('hl:open-panel', onOpenPanel) }
  }, [selectPanel])

  // HeightLab C 组（2026-10-30）：Agent 工具 heightlab_new_chat 的执行通道
  // ——与「新会话」按钮完全同款（清控制台模式标记 + 清 hub/面板 + startSession）。
  useEffect(() => {
    const onNewChat = (): void => {
      window.localStorage.removeItem('hl-console-mode')
      window.dispatchEvent(new CustomEvent('hl:mode-change', { detail: { mode: '' } }))
      setActiveHub(null)
      selectPanel(null)
      startSession()
    }
    window.addEventListener('hl:new-chat-request', onNewChat)
    return () => { window.removeEventListener('hl:new-chat-request', onNewChat) }
  }, [selectPanel, startSession])

  useEffect(() => {
    if (!pointerInside) return
    const onMove = (event: PointerEvent): void => {
      const rect = column.current?.getBoundingClientRect()
      /* v8 ignore next -- the listener only exists while the column is mounted and revealed. */
      if (rect === undefined) return
      const inside = event.clientX >= rect.left && event.clientX < rect.right
        && event.clientY >= rect.top && event.clientY < rect.bottom
      if (inside) cancelLinger()
      else armLinger()
    }
    document.addEventListener('pointermove', onMove)
    return () => {
      document.removeEventListener('pointermove', onMove)
      cancelLinger()
    }
  }, [pointerInside])

  const buildVersion = localBuildVersion()

  return (
    <div
      ref={column}
      className={clsx(
        css.root, !wide && css.collapsed, !wide && everWide.current && css.railIn,
        collapsed && wide && css.fading, !pointerInside && css.quietBars,
      )}
      style={wide ? { width: collapsed ? lastWideWidth.current : width } : undefined}
      onPointerEnter={() => {
        cancelLinger()
        setPointerInside(true)
      }}
      onPointerLeave={() => { armLinger() }}
    >
      <div className={css.logoRow}>
        {/* Expanded, the brand doubles as a New Session shortcut; the
            collapsed rail's logo is the expand toggle below instead. */}
        {wide && (
          <button
            type="button"
            className={clsx(css.brand, css.wide)}
            aria-label={t('session.new.label')}
            onClick={() => {
            // HeightLab 2026-09-19：普通创作入口清除控制台模式标记。
              window.localStorage.removeItem('hl-console-mode')
              window.dispatchEvent(new CustomEvent('hl:mode-change', { detail: { mode: '' } }))
              startSession()
            }}
          >
            <span className={css.brandIdentity} aria-hidden="true">
              <span className={css.brandMark}>
                {/* HeightLab 2026-08-26：黑色胶囊 PNG（透明底），随 build:web
                    进 public→dist；暗色主题由 CSS invert 转白。 */}
                {renderSlot('sidebar.brand.mark', { size: 20 }, { fallback: <img src="/heightlab-logo.png" alt="" width={20} height={20} draggable={false} style={{ width: 20, height: 20, objectFit: 'contain' }} /> })}
              </span>
              <span className={css.brandName}>
                {renderSlot('sidebar.brand.name', {}, {
                  fallback: buildVersion === undefined
                    ? <span className={css.fallbackBrandName}>HEIGHTLAB</span>
                    : (
                      <span className={css.localBuildBrand}>
                        <span className={css.localBuildTitle}>HEIGHTLAB</span>
                        <span className={css.buildVersion}>{buildVersion}</span>
                      </span>
                    ),
                })}
              </span>
            </span>
          </button>
        )}
        {/* Rail resting state is the whale mark; hovering swaps in the panel
            icon (the expand affordance, figma sidebar-hover flow). */}
        <Tooltip label={collapsed ? t('toggle.open') : t('toggle.collapse')} delayMs={500}>
          <button
            type="button"
            className={clsx(css.iconButton, css.toggle)}
            aria-label={collapsed ? t('toggle.open') : t('toggle.collapse')}
            onClick={() => { toggleSidebar() }}
          >
            {!wide && (
              <span className={css.railMark} aria-hidden="true">
                {/* HeightLab 2026-08-26：折叠态胶囊 fallback，同款黑 PNG。 */}
                {renderSlot('sidebar.brand.mark', { size: 24 }, { fallback: <img src="/heightlab-logo.png" alt="" width={24} height={24} draggable={false} style={{ width: 24, height: 24, objectFit: 'contain' }} /> })}
              </span>
            )}
            {/* Rail icons render at 18 (figma rail spec); expanded keeps the glyph-native sizes. */}
            <IconPanelLeftStroke16 className={css.panelIcon} size={wide ? 16 : 18} />
          </button>
        </Tooltip>
      </div>

      {/* HeightLab 2026-08-28（企业版 M3）：营销|办公切换在「新建任务」**上方**，
          仅企业账号渲染；新建任务等其余内容自然下移。
          2026-09-15：迁移时此块被错放到新建任务之后（顺序搬反），此处按稳定线归位。 */}
      {wide && <HlModeSwitcher />}

      {/* HeightLab 2026-10-17：「技能」一级入口并入插件面板（插件·技能合并页，
          页内「技能」标签承载技能中心）；本行删除，入口保留在 git 历史。 */}

      {/* HeightLab V24b：视频创作一级页点「爆款复刻」→ 在这里执行真正的
          进入动作（startSession 在本组件手里；ConversationRoot 只负责关 Hub）。 */}
      {/* handled in useEffect below */}

      {/* HeightLab（2026-10-17 用户拍板）：自建一级行（新建任务/视频创作/资产中心）
          与原生面板行（插件·技能/自动化任务）合并进同一 panelList 容器——
          同款 .panelRow 结构/间距/悬停/选中（panelActive），UI 与反馈完全一致。
          hub 行激活态由 activeHub 跟踪（hl:close-hub / 新会话 / 面板行点击时清除）。 */}
      <nav className={css.panelList} aria-label={t('panels.label')}>
        {(() => {
          const hubRows: readonly { key: string; label: string; Icon: typeof IconPlanOutlineRegular; page: string }[] = [
            // 图标统一到 OutlineRegular（2026-10-17）：「视频创作」用 Plan 型
            // （分镜/计划语义），「资产中心」用 WorkspaceTree 型（目录/资产语义）。
            { key: 'video-studio', label: '视频创作', Icon: IconPlanOutlineRegular, page: 'video-studio' },
            // HeightLab（2026-10-20 用户拍板）：剪辑台是一级入口，紧邻「视频创作」——
            // 语义上「先创作、再成片」连成一条线。它是个人模式里的工具视图，不是
            // 第三套模式，所以不占「个人|团队」那排。
            { key: 'film-studio', label: '智能剪辑台', Icon: IconBrowseOutlineRegular, page: 'film-studio' },
            { key: 'library', label: '资产中心', Icon: IconWorkspaceTreeOutlineRegular, page: 'library' },
          ]
          return (
            <>
              <Tooltip label={t('session.new.label')} delayMs={500} disabled={wide}>
                <button
                  type="button"
                  className={css.panelRow}
                  aria-label={t('session.new.label')}
                  onClick={() => {
                    // HeightLab 2026-09-19：普通创作入口清除控制台模式标记。
                    window.localStorage.removeItem('hl-console-mode')
                    window.dispatchEvent(new CustomEvent('hl:mode-change', { detail: { mode: '' } }))
                    setActiveHub(null)
                    selectPanel(null)
                    startSession()
                  }}
                >
                  <span className={css.panelGlyph} aria-hidden="true">
                    <IconNewChatOutlineRegular size={wide ? 16 : 18} />
                  </span>
                  {wide && <span className={clsx(css.panelTitle, css.wide)}>{t('session.new')}</span>}
                </button>
              </Tooltip>
              {hubRows.map(({ key, label, Icon, page }) => {
                const active = activeHub === key
                return (
                  <Tooltip key={key} label={label} delayMs={500} disabled={wide}>
                    <button
                      type="button"
                      className={clsx(css.panelRow, active && css.panelActive)}
                      aria-label={label}
                      aria-current={active ? 'page' : undefined}
                      onClick={() => {
                        // hub 页先记 pending，供 ConversationRoot 挂载后消费。
                        ;(window as unknown as { __hlPendingHub?: string | null }).__hlPendingHub = page
                        setActiveHub(key)
                        // 2026-10-20 用户拍板：剪辑台要「左影片、右侧边对话」。
                        // 覆盖层只占左侧，右边保持 Chat 视图不动——所以这里
                        // 不切视图、不清会话，天然就是同一段对话。
                        selectPanel(null)
                        window.dispatchEvent(new CustomEvent('hl:open-hub', { detail: { page } }))
                      }}
                    >
                      <span className={css.panelGlyph} aria-hidden="true">
                        <Icon size={wide ? 16 : 18} />
                      </span>
                      {wide && <span className={clsx(css.panelTitle, css.wide)}>{label}</span>}
                    </button>
                  </Tooltip>
                )
              })}
            </>
          )
        })()}
        {panels.map(({ id, label }) => (
          <PanelRow
            key={id}
            id={id}
            label={label}
            wide={wide}
            usePanelInfo={usePanelInfo}
            selectPanel={(id) => { setActiveHub(null); selectPanel(id) }}
            renderSlot={renderSlot}
          />
        ))}
      </nav>

      {/* The browsing region fills the column between the controls and the
          foot in both states; its rail icon column rides the same slot. */}
      <div className={css.regionArea}>
        {renderSlot('sidebar.workspaces', {
          wide,
          expandSidebar: () => { if (collapsed) toggleSidebar() },
        })}
      </div>

      {/* Footer actions stack above Settings in both sidebar widths. */}
      <div className={css.footArea}>
        {/* HeightLab（2026-10-19 用户拍板）：底部「DSH BOT 设置」行已移除——
            团队侧栏顶部第三个圆钮（原折叠按钮位置）已换成齿轮设置入口，
            点开即设置页；折叠仍由上方通用按钮承担。
            恢复 = 还原 ds-bot 补丁里的 collapseButton→settingsButton 替换，
            并恢复 git 历史中的这一行。 */}
        <div className={css.footerActions}>
          {renderSlot('sidebar.footer.action', { wide })}
        </div>
        <div className={css.settingsArea}>
          {renderSlot('sidebar.settings', { wide })}
        </div>
      </div>
    </div>
  )
}

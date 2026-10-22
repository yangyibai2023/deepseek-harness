/**
 * Settings shell and ownerless-copy plugin, browser half: renders the
 * `sidebar.settings` occupant — panel chrome, section navigation, and the
 * onboarding stage — and registers everything on the Settings pages that
 * belongs to no single feature: the trigger/header chrome content,
 * local-document action, General section, and `settings` dictionaries.
 * Feature-owned rows and sections stay with their features.
 * Export discipline: packages/client/AGENTS.md.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the ctx.remote merge and its fixed Host facts.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import { resolveSlotLabel } from '@deepseek-ai/dsh-client-ui-slots'
import { closeTopModal } from '@deepseek-ai/dsh-client-ui-primitives'
// Type-only: the settings slot declarations plus the ctx.configForms Context
// merge. Cross-plugin collaboration goes through the service, never a value
// import (client bundle purity gate).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls ctx.locale into this program.
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {
  SettingsOnboardingStep, SettingsRootInjected, SettingsSectionRow,
} from './shell-contract.ts'
import type { ShortcutCommandId } from '@deepseek-ai/dsh-client-shortcuts/client'
import { createSettingsShellStore } from './shell-store.ts'
import { SettingsRoot } from './SettingsRoot.tsx'
import { HeightLabAccountFoot } from './HeightLabAccountFoot.tsx'
import { HeightLabAccount } from './HeightLabAccount.tsx'
import { HeightLabVoiceAvatar } from './HeightLabVoiceAvatar.tsx'
import { HeightLabAbout } from './HeightLabAbout.tsx'
import { DesktopUpdateBadge } from './DesktopUpdateIndicator.tsx'
import type { DesktopUpdateBridge } from '../types.ts'
import { DesktopUpdateSource } from './desktop-update-source.ts'
import { CloseLabel, HeaderContent, TriggerContent } from './chrome.tsx'
import { GeneralSection } from './GeneralSection.tsx'
import { CurrentVersionRow } from './CurrentVersionRow.tsx'
import { DeveloperToolsRow, type DeveloperToolsRowInjected } from './DeveloperToolsRow.tsx'
import { FusionRow } from './FusionRow.tsx'
import { TeamSettingsSection } from './TeamSettingsSection.tsx'
import { GlobalUsageSection } from './GlobalUsageSection.tsx'
import { GlobalMemorySection } from './GlobalMemorySection.tsx'
import { SettingsDocumentAction } from './SettingsDocumentAction.tsx'
import type { SettingsDocumentActionInjected } from './SettingsDocumentAction.tsx'
import { SettingsDocumentStore } from './settings-document-store.ts'
import { en, zh, type SettingsKey } from './locales.ts'

/**
 * 数字人功能总开关（2026-10-22）。
 *
 * `true` = 已下线（设置页不显示「形象与声音」，talking_head_production 工具不注册）。
 * 改回 `false` 即完整恢复，无需改其它代码。备份见
 * ~/.heightlab/backups/digital-human-retire-20261022-233245/
 */
const HEIGHTLAB_RETIRE_DIGITAL_HUMAN = true

export type {
  CloseLabelProps, HeaderContentProps, TriggerContentProps,
} from './chrome.tsx'
export type {
  GeneralSectionComponentProps,
} from './GeneralSection.tsx'
export type { SettingsDocumentActionInjected, SettingsDocumentActionProps } from './SettingsDocumentAction.tsx'
export type { SettingsDocumentState } from './settings-document-store.ts'
export { SettingsDocumentStore } from './settings-document-store.ts'
export type { SettingsKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Shell chrome + shell-owned General section copy. */
    settings: SettingsKey
  }
}

/** Dictionary namespace owned by this plugin (shell chrome + General copy). */
const NS = 'settings'


/**
 * Required services (cordis fiber inject). The target slots are declared by
 * ui-settings' apply, whose activation order relative to this one is NOT
 * constrained; registrations depend on their slots through `slots.inject()`.
 */
export const inject = ['slots', 'locale', 'connection', 'remote', 'remote.settings', 'configForms', 'shortcuts']

/**
 * Register the `settings` dictionaries, the chrome content, and the General
 * section, each once its slot declaration is on the ledger.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.slots.inject('settings.general.item', () => ctx.slots.register({
    name: 'settings.general.item', id: 'developer-tools', order: 15, locale: NS,
    inject: (): DeveloperToolsRowInjected => ({
      hooks: { developerTools: ctx.configForms.developerTools.enabled },
      setEnabled: enabled => ctx.configForms.developerTools.setEnabled(enabled),
    }),
  }, DeveloperToolsRow))
  // HeightLab（2026-10-18）：个人/团队模式融合开关，默认关闭（严格隔离）。
  ctx.slots.inject('settings.general.item', () => ctx.slots.register({
    name: 'settings.general.item', id: 'personal-team-fusion', order: 20,
  }, FusionRow))
  // Version information follows the core preferences.
  ctx.slots.inject('settings.general.item', () => ctx.slots.register({
    name: 'settings.general.item', id: 'current-version', order: 100, locale: NS,
  }, CurrentVersionRow))
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-settings-general: dictionaries')
  const connection = ctx.get('connection') as ConnectionHandle
  const carrier = (globalThis as typeof globalThis & { dshDesktop?: { protocolVersion: number; updates?: DesktopUpdateBridge } }).dshDesktop
  const desktopUpdate = new DesktopUpdateSource(carrier?.protocolVersion === 1 ? carrier.updates : undefined)
  ctx.effect(() => () => { desktopUpdate.dispose() }, 'ui-settings-general: desktop update carrier')
  ctx.slots.inject('sidebar.toggle.badge', () => ctx.slots.register({
    name: 'sidebar.toggle.badge', locale: NS,
    inject: () => ({ hooks: { desktopUpdate: desktopUpdate.store, connectionState: connection.state } }),
  }, DesktopUpdateBadge))

  // Copy freshness is framework-owned: components read the standard `t`
  // seat, and the nav label is a thunk the owner resolves per render — no
  // locale/change re-registration wiring.
  const t = ctx.locale.bind(NS)
  // The shared ConfigForm mirror updates after document commits and reconnects.
  const documentController = ctx.remote.$host.isLoopback
    ? new SettingsDocumentStore(ctx, ctx.configForms.describe())
    : undefined
  const documentInjected = documentController === undefined
    ? undefined
    : (): SettingsDocumentActionInjected => ({
      controller: documentController,
      hooks: { snapshot: documentController.store },
    })
  ctx.effect(() => () => { documentController?.dispose() }, 'ui-settings-general: document action directory')
  // The settings shell: this package occupies the sidebar-owned hole and
  // declares the settings slots. Ledger → nav-row projection as an observable
  // source (uSES contract: getSnapshot returns the cached rows until the
  // ledger version moves). Labels may be locale-following thunks, so the cache
  // key includes the locale revision and subscribers ride both sources.
  let rowsVersion = -1
  let rowsRevision = -1
  let rows: readonly SettingsSectionRow[] = []
  let onboardingVersion = -1
  let onboardingSteps: readonly SettingsOnboardingStep[] = []
  const shellInjected = (): SettingsRootInjected => ({
    openDesktopUpdate: () => { desktopUpdate.open() },
    reconnect: () => { connection.reconnect() },
    hooks: {
      shortcuts: ctx.shortcuts.catalog,
      desktopUpdate: desktopUpdate.store,
      connectionState: connection.state,
      sections: {
        getSnapshot: () => {
          const version = ctx.slots.getVersion('settings.section')
          const revision = ctx.locale.getSnapshot().revision
          if (version !== rowsVersion || revision !== rowsRevision) {
            rowsVersion = version
            rowsRevision = revision
            rows = ctx.slots.entries('settings.section')
              .map(e => ({
                /* v8 ignore next -- list-slot registration requires id (SlotCore rejects an entry without one) */
                id: e.options.id ?? '',
                order: e.options.order ?? 0,
                label: resolveSlotLabel(e.options.label) ?? '',
                /* HeightLab（2026-10-19）：可选导航分组名，供导航渲染标题与分割线。 */
                group: typeof (e.options as { group?: unknown }).group === 'string'
                  ? (e.options as { group: string }).group
                  : undefined,
              }))
              .sort((a, b) => a.order - b.order)
          }
          return rows
        },
        subscribe: (listener) => {
          const offLedger = ctx.slots.subscribe('settings.section', listener)
          const offLocale = ctx.locale.subscribe(listener)
          return () => {
            offLedger()
            offLocale()
          }
        },
      },
      onboardingSteps: {
        getSnapshot: () => {
          const version = ctx.slots.getVersion('settings.onboarding')
          if (version !== onboardingVersion) {
            onboardingVersion = version
            onboardingSteps = ctx.slots.entries('settings.onboarding')
              .map(e => ({
                /* v8 ignore next -- list-slot registration requires id */
                id: e.options.id ?? '',
                order: e.options.order ?? 0,
              }))
              .sort((a, b) => a.order - b.order)
          }
          return onboardingSteps
        },
        subscribe: listener => ctx.slots.subscribe('settings.onboarding', listener),
      },
    },
  })
  ctx.slots.inject('sidebar.settings', () => {
    const shellHandle = createSettingsShellStore()
    const shellInstance = shellHandle.create()
    const shellStore: typeof shellHandle = { ...shellHandle, create: () => shellInstance }
    const disposeCommand = ctx.shortcuts.register({
      id: 'settings.open' as ShortcutCommandId, label: () => t('shortcut.open'), aliases: ['settings', 'preferences'],
      defaults: {
        'desktop:macos': { code: 'Comma', modifiers: ['primary'] },
        'desktop:windows': { code: 'Comma', modifiers: ['primary'] },
        'desktop:linux': { code: 'Comma', modifiers: ['primary'] },
        'web:macos': { code: 'Comma', modifiers: ['primary', 'alt'] },
        'web:windows': { code: 'Comma', modifiers: ['primary', 'alt'] },
      },
      regions: ['page', 'editable', 'terminal'], modals: ['settings'],
      resolve: ({ modal }) => {
        if (modal !== null && modal !== 'settings') return { status: 'blocked', reason: 'modal' }
        return { status: 'handled', run: () => {
          if (modal === 'settings') closeTopModal(document)
          else shellInstance.actions.open()
        } }
      },
    })

    const disposeSlot = ctx.slots.register({
      name: 'sidebar.settings',
      locale: NS,
      store: shellStore,
      children: {
        'settings.launcher': { kind: 'single', scope: 'root' },
        'settings.trigger': { kind: 'single', scope: 'root' },
        'settings.header': { kind: 'single', scope: 'root' },
        'settings.action': { kind: 'list', scope: 'root' },
        'settings.close': { kind: 'single', scope: 'root' },
        'settings.section': { kind: 'list', scope: 'root' },
        'settings.onboarding': { kind: 'list', scope: 'root' },
      },
      inject: shellInjected,
    }, SettingsRoot)
    return () => { disposeCommand(); disposeSlot() }
  })

  ctx.slots.inject('settings.trigger', () =>
    ctx.slots.register({ name: 'settings.trigger', locale: NS }, TriggerContent))
  // HeightLab：侧栏底部账户行占据 launcher 座位——账户头像+通知/手机，
  // 「设置齿轮不再单独占位」（0.3.x 产品形态）；未占位时 shell 才回退齿轮。
  ctx.slots.inject('settings.launcher', () =>
    ctx.slots.register({ name: 'settings.launcher', locale: NS }, HeightLabAccountFoot))
  ctx.slots.inject('settings.header', () =>
    ctx.slots.register({ name: 'settings.header', locale: NS }, HeaderContent))
  // HeightLab：设置右上角「打开配置文件」入口默认**不注册**——商业封装版不给
  // 用户暴露配置文件（2026-08-16 收口先例，2026-10-16 回植）。
  //
  // 恢复开关是**运行时**全局变量而不是编译期常量：常量（无论函数内还是模块级）
  // 都会被 tsc 判成无重叠比较（TS2367）、被 oxlint 判成恒假分支，只能写成死代码
  // 或干脆删掉。改成读全局属性后，两全其美——排查时在控制台执行
  // `__HL_SHOW_DOCUMENT_ACTION__ = true` 再刷新即可看到入口。
  const showDocumentAction = (globalThis as { __HL_SHOW_DOCUMENT_ACTION__?: boolean })
    .__HL_SHOW_DOCUMENT_ACTION__ === true
  if (documentInjected !== undefined && showDocumentAction) {
    ctx.slots.inject('settings.action', () => ctx.slots.register({
      name: 'settings.action',
      id: 'open-document',
      order: 0,
      locale: NS,
      inject: documentInjected,
    }, SettingsDocumentAction))
  }
  ctx.slots.inject('settings.close', () =>
    ctx.slots.register({ name: 'settings.close', locale: NS }, CloseLabel))
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'general',
    order: 0,
    label: () => t('general.nav'),
    locale: NS,
    children: { 'settings.general.item': { kind: 'list', scope: 'root' } },
  }, GeneralSection))

  // HeightLab（2026-10-19 用户拍板）：团队外观不再单独占一个设置分区——
  // 它控制的就是团队页面的观感，已并入「团队设置」的 9 个横排标签里
  // （见 TeamSettingsSection 的 appearance 页）。设置导航因此回到：
  // 一排通用分区 + 一个「团队专属 → 团队设置」入口。

  // HeightLab（2026-10-19 用户拍板）：团队专属设置整页内嵌——复用 ds-bot 的
  // 实现（经 window.dshBot.settings 桥），不重写、不产生第二套状态。
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'heightlab-team',
    order: 200,
    label: () => '团队设置',
    group: '团队专属',
  } as never, TeamSettingsSection))

  // ── HeightLab 定制 section（自 0.3.x 稳定线迁移；0.2.1 合并时丢失，2026-10-16 回植）──
  // account section（余额 + 充值），紧跟通用设置（0）之后。
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'heightlab-account',
    // 紧跟通用设置（0）之后，排在原生 模型(10)/插件(15)/智能体预设(20) 之前
    order: 5,
    label: () => '账户',
  }, HeightLabAccount))

  // HeightLab（2026-10-19 用户拍板）：ds-bot 的「用量」很好用，复制一份到全局
  // 设置，作为个人模式也能看的用量监测。团队设置里的「用量」保留不动——两处
  // 同一个页面组件、同一份 usage.sqlite 台账，只是入口不同（不产生第二套数据）。
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'heightlab-usage',
    // 紧跟「账户」之后：余额与消耗放在一起看。
    order: 6,
    label: () => '用量',
  }, GlobalUsageSection))

  // HeightLab（2026-10-19 用户拍板）：ds-bot 的「长期记忆」是我们原来没有的
  // 能力，复制一份到全局设置——个人模式也能看每个 Bot 记住了什么。编辑仍用
  // ds-bot 原生面板（切到团队 surface 后打开），数据同一份。
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'heightlab-memory',
    order: 7,
    label: () => '记忆',
  }, GlobalMemorySection))

  /* 数字人功能下线（2026-10-22 用户要求）。
   *
   * 用户原话：「数字人功能下线（做好记录和备份，保持可回滚），相关 agent 提示词
   * 也要改；『声音与形象』改成对话中自动沉淀 + 用 DSH 原生快捷命令调用」。
   *
   * 做法：**代码保留、只摘挂载点**。这样回滚只是把开关改回 false，不需要
   * 从 git 里捞文件。备份与回滚说明见
   * ~/.heightlab/backups/digital-human-retire-20261022-233245/RESTORE.md
   *
   * 为什么不再在设置里手动建形象/声音：这两件事现在由对话自动完成 ——
   * 用户发一张人物图、或一段音频，assetDeposit 自动沉淀进资产库；之后在输入框
   * 用 `@` 就能调用（见 heightlab-asset-reference 的「我的资产」源），
   * 或输入 `/形象` `/声音` 这类 skill 命令。设置页里再放一套手动 CRUD 是
   * 重复入口，且容易与对话产出的资产库不一致。 */
  if (!HEIGHTLAB_RETIRE_DIGITAL_HUMAN) {
    ctx.slots.inject('settings.section', () => ctx.slots.register({
      name: 'settings.section',
      id: 'heightlab-voice-avatar',
      order: 110,
      label: () => '形象与声音',
    }, HeightLabVoiceAvatar))
  }

  // 关于（版本号/检查更新/软件介绍）。
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'heightlab-about',
    order: 120,
    label: () => '关于',
  }, HeightLabAbout))
}

/**
 * Models settings and product-onboarding plugin, browser half. It registers
 * the Models page plus the ordered preview-notice and official-DeepSeek
 * onboarding dialogs, whose UI shares this package's modal wrapper. The Host
 * settings and credential contracts stay behind their existing wire APIs.
 * Export discipline:
 * packages/client/AGENTS.md.
 */
import type {} from '@deepseek-ai/dsh-client-product-analytics/client'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the shell's SlotMap merge (the 'settings.section' entry).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: pulls the ctx.remote merge and the forwarded-event key face
// (settings/credentials invalidations ride the allowlist) into this program.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import { ModelsSection } from './ModelsSection.tsx'
import type { ModelsSectionInjected } from './ModelsSection.tsx'
// HeightLab：上游「预览版说明」弹窗不注册（见 apply 内注释）。
// import { WelcomeNotice } from './WelcomeNotice.tsx'
// import type { WelcomeNoticeInjected } from './WelcomeNotice.tsx'
// import { WelcomeNoticeStore } from './welcome-store.ts'
import { ModelsSettingsStore } from './store.ts'
import { createModelsOperations } from './operations.ts'
import { createSettingsSchemaOperations } from './schema-operations.ts'
import { en, zh, type ModelsKey } from './locales.ts'
// HeightLab：welcome-notice 弹窗不注册，命名空间导入一并移除。
import { Config, ONBOARDING_CONFIG_GLOBAL } from '../onboarding-config.ts'

export type { ModelsSectionInjected, ModelsSectionProps } from './ModelsSection.tsx'
export type { ModelsFooterOwnerProps, ProviderCardExtrasOwnerProps } from './slot-contract.ts'
export type { ModelsKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The Models page + product-onboarding copy. */
    'settings.models': ModelsKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'settings.models'

export type {
  ModelsSettingsState, ProviderDirectoryEntry, ProviderRow,
} from './store.ts'
export type { ModelDiscoveryOutcome, ModelsOperations, SettingsWriteOutcome } from './operations.ts'

/**
 * Refetch the page snapshot only after its first load: an unopened Models
 * page must not fetch on background invalidations.
 * @param controller - the page store.
 */
export function refreshIfLoaded(controller: ModelsSettingsStore): void {
  if (controller.store.getSnapshot().status === 'idle') return
  void controller.load()
}

/**
 * Required services (cordis fiber inject). The target slot is declared by
 * ui-settings' apply, whose activation order relative to this one is NOT
 * constrained; registration depends on each slot through `slots.inject()`.
 */
export const inject = [
  'slots', 'locale', 'remote', 'remote.credentials', 'remote.llm', 'remote.settings', 'remote.session',
  'configForms', 'settingsSchema',
]

/**
 * Register the Models section once the `settings.section` declaration is on
 * the ledger, wire its store to the connection, and keep it fresh on every
 * pushed invalidation (settings, credentials, or provider topology).
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  const page = globalThis as Partial<Record<typeof ONBOARDING_CONFIG_GLOBAL, unknown>>
  const payload = page[ONBOARDING_CONFIG_GLOBAL]
  const configured = Config(payload === undefined ? {} : payload)
  /* 2026-11-09：本变量只服务于已删除的 onboarding 注册（保留 Config 读取，
   * 避免 page-bootstrap 契约漂移；下行 `void` 标记其有意保留）。 */
  const credentialOnboarding = configured.credentialOnboarding && !('dshDesktop' in globalThis)
  void credentialOnboarding
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-settings-models: copy dictionaries')

  const schema = createSettingsSchemaOperations(ctx.settingsSchema)
  // Bound once here, where the Remote namespaces are declared in this plugin's
  // own `inject`; the cards receive callbacks and never a context.
  const operations = createModelsOperations(ctx)
  const controller = new ModelsSettingsStore(ctx, schema, ctx.configForms.describe())
  // Registration-time text (the nav label thunk) and the inject faces share
  // one bound translate; copy freshness rides the locale revision.
  const t = ctx.locale.bind(NS) as ModelsSectionInjected['t']
  const injected = (): ModelsSectionInjected => ({
    controller,
    hooks: { snapshot: controller.store },
    operations,
    schema,
    t,
  })
  /* 2026-11-09：DeepSeekOnboardingDialog 的 inject 闭包随注册一并删除——
   * 该弹窗不再注册（完整根因见文件末尾注释）。组件文件与 automatic 逻辑保留，
   * 将来要恢复上游行为时直接解注释即可。 */
  // HeightLab：不注册上游「预览版说明」welcome 弹窗（0.4.1 无此弹窗，
  // 用户已明确反对）；welcome-store/controller 一并弃用。
  ctx.effect(() => {
    const refreshModels = (): void => { refreshIfLoaded(controller) }
    const disposers = [
      ctx.remote.$on('settings/document-updated', () => { refreshModels() }),
      ctx.remote.$on('credentials/record-updated', refreshModels),
      ctx.remote.$on('credentials/reference-updated', refreshModels),
      ctx.remote.$on('llm/adapters-updated', refreshModels),
      ctx.on('connection/reset', refreshModels),
    ]
    return () => {
      for (const dispose of disposers) dispose()
    }
  }, 'ui-settings-models: pushed invalidations')

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'models',
    order: 10,
    label: () => t('nav'),
    inject: injected,
    children: {
      'settings.models.provider-card': { kind: 'keyed', scope: 'root' },
      'settings.models.footer': { kind: 'list', scope: 'root' },
    },
  }, ModelsSection))
  /* HeightLab 2026-11-09（用户第三次实测复现「Windows 0.5.6 新装机仍弹 API Key」）：
   * **彻底不注册 settings.onboarding**。
   *
   * 为什么之前两轮修复都无效（本次逐层实锤）：
   *   ① 0.4.2 起把 `automatic` 接成 `credentialOnboarding`——但
   *      `SettingsRoot` 的自动弹出判定**根本不读 automatic**：它只看
   *      `ctx.slots.entries('settings.onboarding')` 是否有未完成的 entry，
   *      只要注册了、主会话是空白就 `renderSlot` 全屏弹出。automatic 只控制
   *      **弹窗组件内部**要不要自动 load / 主动 complete。
   *   ② 唯一防线写成 `!('dshDesktop' in globalThis)`，而全仓**从来没有**
   *      任何地方定义 `dshDesktop`（本次 grep 全库零写入点）——这个条件恒为
   *      true，等于没有闸。
   *   ③ `__DSH_MODELS_ONBOARDING__` 这个 page-bootstrap 全局同样无人写入，
   *      `Config` 默认 `credentialOnboarding: true`，所以 automatic 恒 true。
   *   → 新装机首次登录（凭据链未就绪 = credential-missing）必弹；老账号因为
   *     provider-ready 才「看起来正常」。这就是「修了无数轮还在」的原因。
   *
   * 现在直接不注册 entry：没有 entry 就没有 onboarding step，外层自动弹出
   * 路径从结构上不存在。凭据配置能力不受影响——「设置 → 模型」的
   * provider 卡片仍是完整的手动配钥匙入口（用户需要时自己去配）。
   * 恢复上游行为 = 解开本段注释并解决上面的 automatic 语义问题。 */
  // ctx.slots.inject('settings.onboarding', () => ctx.slots.register({
  //   name: 'settings.onboarding',
  //   id: 'deepseek-official',
  //   children: { 'settings.models.sign-in': { kind: 'single', scope: 'root' } },
  //   order: 0,
  //   inject: deepSeekOnboardingInjected,
  // }, DeepSeekOnboardingDialog))
}

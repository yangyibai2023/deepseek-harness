/**
 * ModelSelect: the composer's named model seat (`conversation.input.model`).
 *
 * HeightLab 改版：一级菜单 = 文本模型 / 图片模型 / 视频模型，二级菜单在
 * 右侧展开（与视频制作助手的「形象/模型参数」同款交互）。选择后菜单保持
 * 打开，可继续切换其他分类/模型；关闭走点击外部或 Escape。多模态识别不
 * 单独展示，走系统默认。
 */
import {
  useEffect, useId, useMemo, useRef, useState, useSyncExternalStore,
} from 'react'
import clsx from 'clsx'
import type { ModelReasoningEffort, ModelSelection } from '@deepseek-ai/dsh-api-remotes/client'
import {
  IconChevronDownOutlineRegular, IconWarningOutlineRegular, Menu, Toast,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { MenuEntry, MenuItem } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { ModelSelectInjected } from './slots.ts'
import css from './ModelSelect.module.css'

/** HeightLab：官方托管提供商（走 New API，用户计费）；其余均视为自定义模型。 */
const HEIGHTLAB_OFFICIAL_PROVIDERS: ReadonlySet<string> = new Set(['deepseek-official'])

type ModelCategory = 'text' | 'image' | 'video'

// HeightLab 已确认开放清单（2026-08-18）：其余文本模型一律不展示。
// 2026-09-19 起 deepseek-flash = DeepSeek 官方新名（V4.1-Flash 承载）。
// HeightLab（2026-10-17）：按网关 GET /v1/models 实测清单对齐（24 个模型）。
// 补齐原缺口：deepseek-v4-flash-vision-exp / claude-opus-4-6 / claude-sonnet-4-6 /
// claude-sonnet-5 / gpt-5.4 / gpt-5.6-terra。
// HeightLab（2026-10-17）：清单以**真实探活**为准（/v1/chat/completions 逐模型试调）：
// 200 = 可用；500 = 渠道异常；超时 = 不可达。已剔除 gpt-5.4 / claude-fable-5（500）
// 与 grok-4.5 / gpt-5.6-luna（超时）。补入 MiniMax-M3（200，0.4 元/百万 token，最便宜）。
const TEXT_MODEL_IDS = new Set([
  'LongCat-2.0',
  'MiniMax-M2.7',
  'MiniMax-M2.7-highspeed',
  'MiniMax-M3',
  'MiniMax-M3-highspeed',
  'claude-fable-5',
  'claude-haiku-4-5-20251001',
  'claude-opus-4-5-20251101',
  'claude-opus-4-6',
  'claude-opus-4-7',
  'claude-opus-4-8',
  'claude-opus-5',
  'claude-sonnet-4-6',
  'claude-sonnet-5',
  'deepseek-flash',
  'deepseek-v3.2',
  'deepseek-v4-flash',
  'deepseek-v4-pro',
  'doubao-seed-2.0-code',
  'doubao-seed-2.0-lite',
  'doubao-seed-2.0-pro',
  'gemini-3-flash',
  'gemini-3.1-pro',
  'gemini-3.5-flash',
  'glm-5-turbo',
  'glm-5.1',
  'glm-5.2',
  'gpt-5.4',
  'gpt-5.4-mini',
  'gpt-5.5',
  'gpt-5.6-luna',
  'gpt-5.6-sol',
  'gpt-5.6-terra',
  'grok-4.5',
  'hy3',
  'kimi-k2.6',
  'kimi-k2.7',
  'kimi-k3',
  'mimo-v2.5',
  'mimo-v2.5-pro',
  'qwen3.6-flash',
  'qwen3.6-plus',
  'qwen3.7-plus',
  'step-3.7-flash',
])

// HeightLab（2026-10-17）：网关实测只有 image2 两档；
// image-01 / image-01-live 在 /v1/models 中不存在，已下线。
const IMAGE_MODEL_IDS = new Set(['gpt-image-2', 'gpt-image-2-4k'])
const VIDEO_MODEL_IDS = new Set([
  'MiniMax-H3', 'doubao-seedance-2-0-fast-260128', 'doubao-seedance-2-0-mini-260615',
  'doubao-seedance-2-0-260128', 'doubao-seedance-2-5-260628',
])

function modelCategory(modelId: string): ModelCategory {
  const id = modelId.toLowerCase()
  if (TEXT_MODEL_IDS.has(id)) return 'text'
  if (IMAGE_MODEL_IDS.has(id)) return 'image'
  if (VIDEO_MODEL_IDS.has(id)) return 'video'
  return 'text'
}

/** HeightLab：文本模型按厂商分组（三级菜单的第二级）。 */
const TEXT_PROVIDERS: ReadonlyArray<{ id: string; label: string; match: (id: string) => boolean }> = [
  { id: 'openai', label: 'OpenAI', match: id => id.startsWith('gpt-') },
  { id: 'deepseek', label: 'DeepSeek', match: id => id.startsWith('deepseek-') },
  { id: 'anthropic', label: 'Anthropic (Claude)', match: id => id.startsWith('claude-') },
  { id: 'google', label: 'Google (Gemini)', match: id => id.startsWith('gemini-') },
  { id: 'moonshot', label: 'Moonshot (Kimi)', match: id => id.startsWith('kimi-') },
  { id: 'zhipu', label: '智谱 (GLM)', match: id => id.startsWith('glm-') },
  { id: 'qwen', label: '通义 (Qwen)', match: id => id.startsWith('qwen') },
  { id: 'xai', label: 'xAI (Grok)', match: id => id.startsWith('grok-') },
  { id: 'minimax', label: 'MiniMax', match: id => id.startsWith('minimax-') },
  { id: 'doubao', label: '字节跳动 (豆包)', match: id => id.startsWith('doubao-') },
  { id: 'step', label: '阶跃星辰 (Step)', match: id => id.startsWith('step-') },
  { id: 'xiaomi', label: '小米 (MiMo)', match: id => id.startsWith('mimo-') },
  { id: 'other', label: '其他', match: () => true },
]

function providerFor(modelId: string): { id: string; label: string } {
  const id = modelId.toLowerCase()
  const hit = TEXT_PROVIDERS.find(p => p.match(id))
  return hit === undefined ? { id: 'other', label: '其他' } : { id: hit.id, label: hit.label }
}

const IMAGE_MODEL_LABELS: Record<string, string> = {
  'gpt-image-2': 'image2 1080P',
  'gpt-image-2-4k': 'image2 4K',
}

const VIDEO_MODEL_LABELS: Record<string, string> = {
  'MiniMax-H3': 'MiniMax H3',
}

const CATEGORY_LABELS: ReadonlyArray<{ category: ModelCategory; label: string }> = [
  { category: 'text', label: '文本模型' },
  { category: 'image', label: '图片模型' },
  { category: 'video', label: '视频模型' },
]

const CATEGORY_DEFAULTS: Record<ModelCategory, string> = {
  text: 'deepseek-v4-flash',
  image: 'gpt-image-2',
  video: 'MiniMax-H3',
}

/**
 * HeightLab（2026-10-17 用户拍板，模仿 WorkBuddy）：三档能力模式。
 * 选模式 = 一键落到该档模型；手动选模型 = 显示「自定义」。
 * 路由表刻意保持可改：只需替换 model 字段，不改 UI。
 */
// HeightLab（2026-10-17 二次校准）：白名单全量开放后（24→75），按贵州价格表
// 重排三档——全部实测 200 可用：
//   快速 = gpt-5.6-luna（1 倍率 / 0.4 元）——低价批量档
//   均衡 = claude-sonnet-4-6（0.8 倍率 / 0.32 元）——性价比之王
//   极致 = claude-opus-5（15 倍率 / 6 元）——当前最强推理
const MODE_ROUTES: ReadonlyArray<{ id: string; label: string; model: string }> = [
  { id: 'fast', label: '快速', model: 'gpt-5.6-luna' },
  { id: 'balanced', label: '均衡', model: 'claude-sonnet-4-6' },
  { id: 'max', label: '极致', model: 'claude-opus-5' },
]

/** 分类内模型数不超过该值时用二级（分类 → 模型），否则切三级（分类 → 厂商 → 模型）。 */
const FLAT_MODEL_LIMIT = 12

/** Effort choice row (text models only). */
interface EffortChoice {
  key: string
  effort: string | undefined
  label: string
}

/**
 * HeightLab：输入框只显示型号，不带品牌名。
 * 规则：若模型名以提供商名/提供商 id 开头（大小写不敏感），去掉该前缀及
 * 分隔符；否则原样返回。
 */
export function shortModelLabel(
  name: string,
  providerName: string | undefined,
  providerId: string | undefined,
): string {
  const brands = [providerName, providerId].filter((brand): brand is string =>
    typeof brand === 'string' && brand !== '')
  for (const brand of brands) {
    if (name.toLowerCase().startsWith(brand.toLowerCase())) {
      const rest = name.slice(brand.length).replace(/^[\s\-_:/·.]+/, '')
      if (rest !== '') return rest
    }
  }
  return name
}

// HeightLab 功能开关：boolean 标注宽化字面量（lint 两配置皆过），改 false 即恢复三分类菜单。
const HIDE_MEDIA_MODEL_ROWS: boolean = true

export function ModelSelect(
  { locked, available, directory, load, select, t }:
  ModelSelectInjected & { locked: boolean } & PropsLocale<'model'>,
) {
  const state = useSyncExternalStore(
    fn => directory.subscribe(fn),
    () => directory.getSnapshot(),
  )
  const customModel = state.current !== null && !HEIGHTLAB_OFFICIAL_PROVIDERS.has(state.current.provider)
  const [open, setOpen] = useState(false)
  const [mapping, setMapping] = useState<Record<ModelCategory, string>>({ ...CATEGORY_DEFAULTS })
  const [toast, setToast] = useState<{ seq: number; text: string } | null>(null)
  const toastSeq = useRef(0)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const id = useId()

  const choices = useMemo(() => state.groups.flatMap(group =>
    group.models.map(model => ({
      group,
      model,
      selection: {
        provider: group.id,
        model: model.id,
        ...model.reasoning?.defaultEffort === undefined
          ? {}
          : { reasoningEffort: model.reasoning.defaultEffort },
      } satisfies ModelSelection,
    }))), [state.groups])
  const selectedIndex = state.current === null
    ? -1
    : choices.findIndex(c => c.selection.provider === state.current?.provider && c.selection.model === state.current.model)
  const currentChoice = choices[selectedIndex]
  const reasoning = currentChoice?.model.reasoning
  const effectiveEffort = state.current?.reasoningEffort ?? reasoning?.defaultEffort
  const effortLabel = reasoning === undefined
    ? undefined
    : effectiveEffort === undefined
      ? t('effort.providerDefault')
      : reasoning.efforts.find(level => level.id === effectiveEffort)?.name ?? effectiveEffort
  const effortChoices = useMemo<readonly EffortChoice[]>(() => reasoning === undefined
    ? []
    : [
      ...reasoning.defaultEffort === undefined
        ? [{ key: 'provider-default', effort: undefined, label: t('effort.providerDefault') }]
        : [],
      ...reasoning.efforts.map((effort: ModelReasoningEffort) => ({
        key: `effort:${effort.id}`,
        effort: effort.id,
        label: effort.name,
      })),
    ], [reasoning, t])
  const reload = (): void => {
    load()
  }

  // HeightLab：拉取全局模型映射（文本/图片/视频，全智能体共用）。
  const loadMapping = (): void => {
    void fetch('/hl/model-mapping')
      .then(res => res.json() as Promise<{ ok?: boolean; mapping?: Record<string, unknown> }>)
      .then((data) => {
        const mapping = data.mapping
        if (data.ok === true && mapping !== undefined) {
          setMapping(prev => ({
            text: typeof mapping.text === 'string' ? mapping.text : prev.text,
            image: typeof mapping.image === 'string' ? mapping.image : prev.image,
            video: typeof mapping.video === 'string' ? mapping.video : prev.video,
          }))
        }
      })
      .catch(() => { /* 离线/未登录：用默认值 */ })
  }

  useEffect(() => {
    if (available) {
      reload()
      loadMapping()
    }
  }, [available])

  // HeightLab：把「是否自定义模型」广播给 Agent 选择器。
  useEffect(() => {
    try {
      document.body.dataset.hlCustomModel = customModel ? '1' : '0'
    } catch { /* 非致命 */ }
    window.dispatchEvent(new CustomEvent('hl:model-change', { detail: { custom: customModel } }))
  }, [customModel])

  if (!available) return null

  const show = (): void => {
    setOpen(true)
    reload()
    loadMapping()
  }

  // 0.2.1 合同：select 返回 RemoteResult<void> | undefined（undefined = 本会话无选择权）。
  const settleSelection = (result: Awaited<ReturnType<ModelSelectInjected['select']>>): void => {
    if (result === undefined || result.ok) return
    const { error } = result
    toastSeq.current += 1
    setToast({ seq: toastSeq.current, text: t('error.action', { message: `${error.code}: ${error.message}` }) })
  }

  const persistText = (modelId: string): void => {
    setMapping(prev => ({ ...prev, text: modelId }))
    void fetch('/hl/model-mapping', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: modelId }),
    }).catch(() => { /* 持久化失败不阻塞当前会话选择 */ })
  }

  const chooseText = (selection: ModelSelection): void => {
    // HeightLab 反向校验：自定义模型只能配合「通用助手」使用。
    const targetCustom = !HEIGHTLAB_OFFICIAL_PROVIDERS.has(selection.provider)
    const preset = document.body.dataset.hlAgentPreset
    if (targetCustom && preset !== undefined && preset !== '' && preset !== 'general-assistant') {
      toastSeq.current += 1
      setToast({ seq: toastSeq.current, text: '自定义只支持通用 AI 助手。' })
      return
    }
    persistText(selection.model)
    void select(selection).then(settleSelection)
  }

  const chooseMedia = (media: 'image' | 'video', modelId: string): void => {
    setMapping(prev => ({ ...prev, [media]: modelId }))
    void fetch('/hl/model-mapping', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ [media]: modelId }),
    }).catch(() => { /* 网络失败保持本地选择 */ })
  }

  const chooseEffort = (effort: string | undefined): void => {
    if (state.current === null) return
    const selection: ModelSelection = {
      provider: state.current.provider,
      model: state.current.model,
      ...effort === undefined ? {} : { reasoningEffort: effort },
    }
    void select(selection).then(settleSelection)
  }

  const modelLabel = currentChoice?.model.name ?? t('trigger.fallback')
  // HeightLab（2026-10-17 用户拍板·二次）：恢复 DSH 原生显示——触发按钮用
  // shortModelLabel 去掉品牌前缀（DSH 原生写法），菜单里才显示全名。
  const triggerModelLabel = currentChoice === undefined
    ? modelLabel
    : shortModelLabel(currentChoice.model.name, currentChoice.group.name, currentChoice.group.id)
  const fullLabel = effortLabel === undefined ? modelLabel : `${modelLabel} · ${effortLabel}`
  const triggerAria = currentChoice === undefined
    ? t('trigger.selectAria')
    : effortLabel === undefined
      ? t('trigger.aria', { model: modelLabel })
      : t('trigger.ariaEffort', { model: modelLabel, effort: effortLabel })

  // 自适应菜单：二级能放下（分类 → 模型）就用二级；
  // 放不下（超过 FLAT_MODEL_LIMIT）再切三级（分类 → 厂商 → 模型）。
  // 图片只开放 OpenAI 的 image2 两档；视频只开放 MiniMax-H3。
  const categoryGroups = (category: ModelCategory): readonly MenuItem[] => {
    const catChoices = choices.filter(c => modelCategory(c.model.id) === category)
    const options = catChoices.map((c) => {
      let provider: { id: string; label: string }
      let label: string
      if (category === 'image') {
        provider = { id: 'openai', label: 'OpenAI' }
        label = IMAGE_MODEL_LABELS[c.model.id] ?? c.model.name
      } else if (category === 'video') {
        provider = { id: 'minimax', label: 'MiniMax' }
        label = VIDEO_MODEL_LABELS[c.model.id] ?? c.model.name
      } else {
        provider = providerFor(c.model.id)
        label = c.model.name
      }
      return {
        id: `${category}:${c.model.id}`,
        label,
        provider,
      }
    })

    // 二级模式：分类行直接挂模型列表，只显示模型名（不带厂商前缀）。
    if (options.length <= FLAT_MODEL_LIMIT) {
      return options.map(o => ({
        id: o.id,
        label: o.label,
      }))
    }

    // 三级模式：分类 → 厂商 → 模型。
    const groupMap = new Map<string, { id: string; label: string; submenu: { id: string; label: string }[] }>()
    for (const o of options) {
      const key = `${category}:${o.provider.id}`
      const group = groupMap.get(key) ?? {
        id: key,
        label: o.provider.label,
        submenu: [],
      }
      group.submenu.push({ id: o.id, label: o.label })
      groupMap.set(key, group)
    }
    const order = TEXT_PROVIDERS.map(p => p.id)
    return [...groupMap.values()].sort((a, b) => {
      const ai = order.indexOf(a.id.split(':')[1] ?? '')
      const bi = order.indexOf(b.id.split(':')[1] ?? '')
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
    })
  }

  // HeightLab（2026-10-17）：模式反推——当前模型命中某档路由即显示该档，
  // 否则显示「自定义」。不额外存状态，避免与 session 的模型选择打架。
  const currentModelId = state.current?.model
  const currentMode = MODE_ROUTES.find(route => route.model === currentModelId)

  // HeightLab（2026-10-17 用户拍板）：输入框菜单只留「模型」与「推理等级」两行。
  // 图片/视频模型挪到设置→模型里单独配置（不再让用户每次选）。
  // 菜单标题按要求不写「文本模型」，统一叫「模型」。
  const menuItems: MenuEntry[] = [
    // 模式行排在最前：先选「多快多好」，需要时再手选具体模型。
    {
      id: 'cat:mode',
      label: '模式',
      value: currentMode?.label ?? '自定义',
      submenu: MODE_ROUTES.map(route => ({ id: `mode:${route.id}`, label: route.label })),
    },
    ...(HIDE_MEDIA_MODEL_ROWS
      ? [{
        id: 'cat:text',
        label: '模型',
        value: mapping.text,
        submenu: categoryGroups('text'),
      }]
      : CATEGORY_LABELS.map(({ category, label }) => ({
        id: `cat:${category}`,
        label,
        value: mapping[category],
        submenu: categoryGroups(category),
      }))),
    ...(reasoning === undefined
      ? []
      : [{
        id: 'cat:effort',
        label: '推理等级',
        value: effortLabel,
        submenu: effortChoices.map(level => ({
          id: level.key,
          label: level.label,
        })),
      }]),
  ]

  const selectedIds = [
    ...(currentMode === undefined ? [] : [`mode:${currentMode.id}`]),
    `text:${mapping.text}`,
    `image:${mapping.image}`,
    `video:${mapping.video}`,
    ...(effectiveEffort === undefined
      ? []
      : [`effort:${effectiveEffort}`]),
  ]

  const onSelect = (itemId: string): void => {
    if (itemId.startsWith('mode:')) {
      const modeId = itemId.slice('mode:'.length)
      const route = MODE_ROUTES.find(r => r.id === modeId)
      if (route === undefined) return
      const choice = choices.find(c => c.model.id === route.model)
      if (choice === undefined) return
      chooseText(choice.selection)
      return
    }
    if (itemId.startsWith('text:')) {
      const modelId = itemId.slice('text:'.length)
      const choice = choices.find(c => c.model.id === modelId)
      if (choice === undefined) return
      chooseText(choice.selection)
      return
    }
    if (itemId.startsWith('image:')) {
      chooseMedia('image', itemId.slice('image:'.length))
      return
    }
    if (itemId.startsWith('video:')) {
      chooseMedia('video', itemId.slice('video:'.length))
      return
    }
    if (itemId.startsWith('effort:')) {
      const key = itemId.slice('effort:'.length)
      chooseEffort(effortChoices.find(e => e.key === `effort:${key}`)?.effort)
    }
  }

  return (
    <div ref={rootRef} className={css.root}>
      <Menu
        open={open}
        onClose={() => { setOpen(false) }}
        items={menuItems}
        selectedIds={selectedIds}
        onSelect={onSelect}
        anchor={(
          <button
            ref={triggerRef}
            type="button"
            className={css.trigger}
            aria-label={triggerAria}
            aria-haspopup="menu"
            aria-expanded={open}
            aria-controls={open ? `${id}-menu` : undefined}
            title={fullLabel}
            disabled={locked}
            onClick={() => {
              if (open) setOpen(false)
              else show()
            }}
          >
            <span className={css.triggerLabel}>{triggerModelLabel}</span>
            {effortLabel !== undefined && <span className={css.triggerEffort}>{effortLabel}</span>}
            <IconChevronDownOutlineRegular className={clsx(css.chevron, open && css.chevronOpen)} />
          </button>
        )}
        portal
        closeOnPointerLeave={false}
      />
      {toast !== null && (
        <Toast
          key={toast.seq}
          text={toast.text}
          icon={<IconWarningOutlineRegular />}
          anchor={rootRef.current?.closest<HTMLElement>('[data-composer-card]') ?? null}
          onDone={() => { setToast(null) }}
        />
      )}
    </div>
  )
}

/** HeightLab：图片智能体上下文选项（四个原生胶囊按钮）。
 *
 * 用户选中「图片制作专家」或 Colin 派发给图片专家工作时，输入框中部出现：
 *  - 图像参数：模型（标准 1080P / 高清 4K）、画幅、数量、优化提示词、
 *    输出格式、透明背景
 *  - 风格：摄影写实 / 3D / 插画 / 动漫 / 设计感 / 电商 / 不指定
 *  - 用途模板：头像 / 壁纸 / 海报 / 小红书封面 / … / 不指定
 *  - 参考图模式：文生图 / 图生图修改 / 风格参考 / 角色参考 / 构图参考 /
 *    局部重绘 / 扩图 / 去背景
 *
 * 一级为模块（右侧显示当前值+箭头）、二级为选项（选中带对勾），选择后菜单
 * 保持打开可继续调整，与模型选择框/视频工具栏一致。结果写入用户图片偏好，
 * 工具未显式传参时由网关/MCP 自动生效。空间不足（左右两侧边栏同开）时只显示
 * SVG 图标，其余场景保持「图标+文字」。
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  IconChevronDownOutline14, IconListPenOutline16, IconPaperclipOutline16,
  IconSettingsOutline16, IconSparkle16, Menu,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives'
import css from './ImageToolbar.module.css'

const IMAGE_GENERATOR = 'image-generator'

type ImagePreference = {
  model: string
  ratio: string
  n: number
  promptOptimize: 'auto' | 'none'
  outputFormat: 'png' | 'jpeg'
  background: 'opaque' | 'transparent'
  style: string
  template: string
  referenceMode: string
}

const DEFAULT_PREFERENCE: ImagePreference = {
  model: 'gpt-image-2',
  ratio: '1:1',
  n: 1,
  promptOptimize: 'auto',
  outputFormat: 'png',
  background: 'opaque',
  style: 'none',
  template: 'none',
  referenceMode: 'text',
}

const MODEL_OPTIONS = [
  { id: 'm:gpt-image-2', label: '标准 1080P' },
  { id: 'm:gpt-image-2-4k', label: '高清 4K' },
] as const
const RATIO_OPTIONS = ['1:1', '3:4', '9:16', '16:9', '4:3', '2:3', '3:2', '21:9'] as const
const COUNT_OPTIONS = [1, 2, 4] as const
const PROMPT_OPTIMIZE_OPTIONS = [
  { id: 'opt:auto', label: '自动优化' },
  { id: 'opt:none', label: '不需要优化' },
] as const
const OUTPUT_FORMAT_OPTIONS = [
  { id: 'fmt:png', label: 'PNG' },
  { id: 'fmt:jpeg', label: 'JPEG' },
] as const
const BACKGROUND_OPTIONS = [
  { id: 'bg:opaque', label: '不透明' },
  { id: 'bg:transparent', label: '透明（PNG）' },
] as const

const STYLE_GROUPS: { id: string; label: string; items: { id: string; label: string }[] }[] = [
  {
    id: 'g-photo',
    label: '摄影写实',
    items: [
      { id: 'style:photo-natural', label: '自然光' },
      { id: 'style:photo-cinematic', label: '电影感' },
      { id: 'style:photo-film', label: '胶片' },
      { id: 'style:photo-portrait', label: '人像' },
      { id: 'style:photo-night', label: '夜景' },
    ],
  },
  {
    id: 'g-3d',
    label: '3D',
    items: [
      { id: 'style:3d-c4d', label: 'C4D' },
      { id: 'style:3d-clay', label: '粘土' },
      { id: 'style:3d-lowpoly', label: '低多边形' },
      { id: 'style:3d-glass', label: '玻璃' },
      { id: 'style:3d-metal', label: '金属' },
    ],
  },
  {
    id: 'g-illustration',
    label: '插画',
    items: [
      { id: 'style:illustration-flat', label: '扁平' },
      { id: 'style:illustration-watercolor', label: '水彩' },
      { id: 'style:illustration-chinese', label: '国潮' },
      { id: 'style:illustration-ink', label: '水墨' },
      { id: 'style:illustration-line', label: '线稿' },
      { id: 'style:illustration-picturebook', label: '绘本' },
    ],
  },
  {
    id: 'g-anime',
    label: '动漫',
    items: [
      { id: 'style:anime-2d', label: '二次元' },
      { id: 'style:anime-cyberpunk', label: '赛博朋克' },
      { id: 'style:anime-pixel', label: '像素' },
    ],
  },
  {
    id: 'g-design',
    label: '设计感',
    items: [
      { id: 'style:design-minimal', label: '极简' },
      { id: 'style:design-magazine', label: '杂志' },
      { id: 'style:design-pop', label: '波普' },
      { id: 'style:design-retro', label: '复古' },
      { id: 'style:design-neochinese', label: '新中式' },
    ],
  },
  {
    id: 'g-ecommerce',
    label: '电商',
    items: [
      { id: 'style:ecommerce-white', label: '白底' },
      { id: 'style:ecommerce-scene', label: '场景' },
      { id: 'style:ecommerce-promo', label: '促销' },
    ],
  },
]

const STYLE_LABELS: Record<string, string> = Object.fromEntries(
  STYLE_GROUPS.flatMap(group => group.items.map(item => [item.id.slice('style:'.length), item.label])),
)
const STYLE_GROUP_OF: Record<string, string> = Object.fromEntries(
  STYLE_GROUPS.flatMap(group => group.items.map(item => [item.id.slice('style:'.length), group.id])),
)

const TEMPLATE_OPTIONS = [
  { id: 'template:none', label: '不指定' },
  { id: 'template:avatar', label: '头像' },
  { id: 'template:wallpaper', label: '壁纸' },
  { id: 'template:poster', label: '海报' },
  { id: 'template:xhs-cover', label: '小红书封面' },
  { id: 'template:wechat-cover', label: '公众号头图' },
  { id: 'template:douyin-cover', label: '抖音封面' },
  { id: 'template:ecommerce-main', label: '电商主图' },
  { id: 'template:product-scene', label: '商品场景' },
  { id: 'template:logo', label: 'Logo' },
  { id: 'template:illustration', label: '配图' },
  { id: 'template:sticker', label: '表情包' },
] as const

const REFERENCE_OPTIONS = [
  { id: 'ref:text', label: '文生图' },
  { id: 'ref:edit', label: '图生图修改' },
  { id: 'ref:style', label: '风格参考' },
  { id: 'ref:character', label: '角色参考' },
  { id: 'ref:composition', label: '构图参考' },
  { id: 'ref:inpaint', label: '局部重绘' },
  { id: 'ref:outpaint', label: '扩图' },
  { id: 'ref:remove_bg', label: '去背景' },
] as const

async function getPreference(): Promise<ImagePreference> {
  try {
    const res = await fetch('/hl/image-preference')
    if (!res.ok) return { ...DEFAULT_PREFERENCE }
    const data = await res.json() as Record<string, unknown>
    return {
      model: typeof data.model === 'string' ? data.model : DEFAULT_PREFERENCE.model,
      ratio: typeof data.ratio === 'string' ? data.ratio : DEFAULT_PREFERENCE.ratio,
      n: data.n === 2 || data.n === 4 ? data.n : DEFAULT_PREFERENCE.n,
      promptOptimize: data.promptOptimize === 'none' ? 'none' : 'auto',
      outputFormat: data.outputFormat === 'jpeg' ? 'jpeg' : 'png',
      background: data.background === 'transparent' ? 'transparent' : 'opaque',
      style: typeof data.style === 'string' ? data.style : 'none',
      template: typeof data.template === 'string' ? data.template : 'none',
      referenceMode: typeof data.referenceMode === 'string' ? data.referenceMode : 'text',
    }
  } catch {
    return { ...DEFAULT_PREFERENCE }
  }
}

async function savePreference(patch: Partial<ImagePreference>): Promise<boolean> {
  try {
    const res = await fetch('/hl/image-preference', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    })
    return res.ok
  } catch {
    return false
  }
}

export function ImageToolbar() {
  const [visible, setVisible] = useState(false)
  const [pref, setPref] = useState<ImagePreference>({ ...DEFAULT_PREFERENCE })
  const [openMenu, setOpenMenu] = useState<'params' | 'style' | 'template' | 'reference' | null>(null)
  const barRef = useRef<HTMLDivElement | null>(null)
  const measureRef = useRef<HTMLDivElement | null>(null)
  const [compact, setCompact] = useState(false)

  // 显示条件：用户手动选中图片专家（body dataset）或 Colin 派发中（/hl/current-agent）
  useEffect(() => {
    let cancelled = false
    const tick = (): void => {
      const staged = document.body.dataset.hlAgentPreset
      fetch('/hl/current-agent')
        .then(response => response.json().catch(() => ({})))
        .then((data: { ok?: boolean; id?: string | null }) => {
          if (cancelled) return
          const working = data?.ok === true && typeof data.id === 'string' ? data.id : null
          setVisible(staged === IMAGE_GENERATOR || working === IMAGE_GENERATOR)
        })
        .catch(() => {
          if (!cancelled) setVisible(staged === IMAGE_GENERATOR)
        })
    }
    tick()
    const timer = window.setInterval(tick, 1500)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [])

  // 显示后加载偏好
  useEffect(() => {
    if (!visible) return
    let cancelled = false
    void getPreference().then((next) => {
      if (!cancelled) setPref(next)
    })
    return () => { cancelled = true }
  }, [visible])

  // 空间自适应：与视频工具栏同一套测量逻辑——只有左右两侧边栏同时打开且
  // 确实放不下全展开内容时才切纯图标（compact），其余场景保持「图标+文字」。
  const recalcCompact = useCallback((): void => {
    const host = barRef.current?.parentElement
    const measure = measureRef.current
    if (!host || !measure) return
    const hostWidth = host.getBoundingClientRect().width
    const measureWidth = measure.getBoundingClientRect().width
    if (hostWidth <= 60) return
    // HeightLab：纯空间判定——输入行放不下全展开内容就切紧凑（图标化），
    // 右侧边栏单独展开/窗口变窄同样生效，避免与「当前工作区」重叠。
    setCompact(measureWidth > hostWidth + 8)
  }, [])
  useEffect(() => {
    const frame = requestAnimationFrame(() => recalcCompact())
    const host = barRef.current?.parentElement
    if (!host || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => recalcCompact())
    observer.observe(host)
    const attributeObserver = new MutationObserver(() => recalcCompact())
    attributeObserver.observe(document.body, {
      attributes: true,
      subtree: true,
      attributeFilter: ['data-sidebar-collapsed', 'data-dsh-sidebar-collapsed'],
    })
    const onResize = (): void => recalcCompact()
    window.addEventListener('resize', onResize)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      attributeObserver.disconnect()
      window.removeEventListener('resize', onResize)
    }
  }, [recalcCompact, pref, openMenu])

  const updatePreference = useCallback((patch: Partial<ImagePreference>): void => {
    const next = { ...pref, ...patch }
    setPref(next)
    void savePreference(patch)
  }, [pref])

  const onSelect = (id: string): void => {
    if (id.startsWith('m:')) {
      updatePreference({ model: id.slice(2) })
    } else if (id.startsWith('r:')) {
      updatePreference({ ratio: id.slice(2) })
    } else if (id.startsWith('n:')) {
      const n = Number(id.slice(2))
      if ([1, 2, 4].includes(n)) updatePreference({ n })
    } else if (id.startsWith('opt:')) {
      updatePreference({ promptOptimize: id.slice(4) === 'none' ? 'none' : 'auto' })
    } else if (id.startsWith('fmt:')) {
      const outputFormat = id.slice(4) === 'jpeg' ? 'jpeg' : 'png'
      updatePreference({
        outputFormat,
        ...(outputFormat === 'jpeg' && pref.background === 'transparent' ? { background: 'opaque' as const } : {}),
      })
    } else if (id.startsWith('bg:')) {
      const background = id.slice(3) === 'transparent' ? 'transparent' : 'opaque'
      updatePreference({ background })
    } else if (id.startsWith('style:')) {
      updatePreference({ style: id.slice(6) })
    } else if (id.startsWith('template:')) {
      updatePreference({ template: id.slice(9) })
    } else if (id.startsWith('ref:')) {
      updatePreference({ referenceMode: id.slice(4) })
    }
  }

  if (!visible) return null

  const paramsItems: MenuEntry[] = [
    {
      id: 'p-model',
      label: <>模型 <span style={{ opacity: 0.6 }}>{MODEL_OPTIONS.find(m => m.id === `m:${pref.model}`)?.label ?? '标准 1080P'}</span></>,
      submenu: MODEL_OPTIONS.map(o => ({ id: o.id, label: o.label })),
    },
    {
      id: 'p-ratio',
      label: <>画幅 <span style={{ opacity: 0.6 }}>{pref.ratio}</span></>,
      submenu: RATIO_OPTIONS.map(r => ({ id: `r:${r}`, label: r })),
    },
    {
      id: 'p-count',
      label: <>数量 <span style={{ opacity: 0.6 }}>{`${pref.n} 张`}</span></>,
      submenu: COUNT_OPTIONS.map(n => ({ id: `n:${n}`, label: `${n} 张` })),
    },
    {
      id: 'p-optimize',
      label: <>优化提示词 <span style={{ opacity: 0.6 }}>{pref.promptOptimize === 'none' ? '不需要优化' : '自动优化'}</span></>,
      submenu: PROMPT_OPTIMIZE_OPTIONS.map(o => ({ id: o.id, label: o.label })),
    },
    {
      id: 'p-format',
      label: <>输出格式 <span style={{ opacity: 0.6 }}>{pref.outputFormat === 'jpeg' ? 'JPEG' : 'PNG'}</span></>,
      submenu: OUTPUT_FORMAT_OPTIONS.map(o => ({ id: o.id, label: o.label })),
    },
    {
      id: 'p-background',
      label: <>透明背景 <span style={{ opacity: 0.6 }}>{pref.background === 'transparent' ? '透明' : '不透明'}</span></>,
      submenu: BACKGROUND_OPTIONS.map(o => ({ id: o.id, label: o.label })),
    },
  ]

  const styleItems: MenuEntry[] = [
    ...STYLE_GROUPS.map(group => ({
      id: group.id,
      label: group.label,
      value: STYLE_GROUP_OF[pref.style] === group.id ? (STYLE_LABELS[pref.style] ?? '') : undefined,
      submenu: group.items.map(item => ({ id: item.id, label: item.label })),
    })),
    { id: 'style:none', label: '不指定' },
  ]

  const templateItems: MenuEntry[] = TEMPLATE_OPTIONS.map(o => ({ id: o.id, label: o.label }))
  const referenceItems: MenuEntry[] = REFERENCE_OPTIONS.map(o => ({ id: o.id, label: o.label }))

  const trigger = (label: string, openState: boolean, onToggle: () => void, icon: ReactNode, fullName?: string) => (
    <button
      type="button"
      className={css.trigger}
      aria-expanded={openState}
      aria-haspopup="menu"
      title={fullName ?? label}
      aria-label={fullName ?? label}
      onClick={onToggle}
    >
      <span className={css.triggerIcon}>{icon}</span>
      <span className={css.triggerText}>{label}</span>
      <span className={`${css.chevron} ${openState ? css.chevronOpen : ''}`}>
        <IconChevronDownOutline14 />
      </span>
    </button>
  )

  const paramsTrigger = trigger('参数', openMenu === 'params', () => setOpenMenu(v => v === 'params' ? null : 'params'), <IconSettingsOutline16 />, '图像参数')
  const styleTrigger = trigger('风格', openMenu === 'style', () => setOpenMenu(v => v === 'style' ? null : 'style'), <IconSparkle16 />, '风格')
  const templateTrigger = trigger('用途', openMenu === 'template', () => setOpenMenu(v => v === 'template' ? null : 'template'), <IconListPenOutline16 />, '用途模板')
  const referenceTrigger = trigger('参考', openMenu === 'reference', () => setOpenMenu(v => v === 'reference' ? null : 'reference'), <IconPaperclipOutline16 />, '参考图模式')

  return (
    <>
      <div ref={barRef} className={`${css.toolbar} ${compact ? css.compact : ''}`}>
        <Menu
          open={openMenu === 'params'}
          onClose={() => setOpenMenu(null)}
          items={paramsItems}
          selectedIds={[
            `m:${pref.model}`,
            `r:${pref.ratio}`,
            `n:${pref.n}`,
            `opt:${pref.promptOptimize}`,
            `fmt:${pref.outputFormat}`,
            `bg:${pref.background}`,
          ]}
          onSelect={onSelect}
          anchor={paramsTrigger}
          portal
        />
        <Menu
          open={openMenu === 'style'}
          onClose={() => setOpenMenu(null)}
          items={styleItems}
          selectedIds={[`style:${pref.style}`]}
          onSelect={onSelect}
          anchor={styleTrigger}
          portal
        />
        <Menu
          open={openMenu === 'template'}
          onClose={() => setOpenMenu(null)}
          items={templateItems}
          selectedIds={[`template:${pref.template}`]}
          onSelect={onSelect}
          anchor={templateTrigger}
          portal
        />
        <Menu
          open={openMenu === 'reference'}
          onClose={() => setOpenMenu(null)}
          items={referenceItems}
          selectedIds={[`ref:${pref.referenceMode}`]}
          onSelect={onSelect}
          anchor={referenceTrigger}
          portal
        />
      </div>
      <div ref={measureRef} className={`${css.toolbar} ${css.measure}`} aria-hidden>
        {paramsTrigger}{styleTrigger}{templateTrigger}{referenceTrigger}
      </div>
    </>
  )
}

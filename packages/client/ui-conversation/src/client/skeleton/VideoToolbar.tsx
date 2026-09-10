/** HeightLab：视频智能体上下文选项（模式滑块 + 单菜单）。
 *
 * 用户选中「视频制作专家」或 Colin 派发给视频专家工作时，输入框中部出现
 * 「数字人 | 视频生成」胶囊滑块（选中黑底、未选中白底，与 COLIN 同高）。
 * 左侧菜单按钮按当前模式只显示该模式能调的东西：
 *  - 数字人：形象 / 声音（列表 + 上传新建）
 *    +「字幕包装」（字幕样式/自动包装，仅数字人需要）
 *  - 视频生成：两个按钮——「模型参数」（模型/清晰度/时长/画幅）、
 *    「人物资产」（人物/场景，含上传新建；人物自带形象与声音，
 *    不再单独选择声音）
 * 一级为模块（右侧显示当前值+箭头）、二级为选项（选中带对勾），
 * 选择后菜单保持打开可继续调整，与模型选择框一致。结果写入用户视频偏好，
 * 工具未显式传参时由网关/MCP 自动生效。
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  IconChevronDownOutline14, IconEditOutline16, IconSettingsOutline16,
  IconUserOutline16, Menu,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives'
import css from './VideoToolbar.module.css'

const VIDEO_PRODUCER = 'video-producer'

type VideoPreference = {
  mode: 'avatar' | 'video'
  model: string
  quality: string
  duration: number
  ratio: string
  promptOptimize: 'auto' | 'none'
  inputMode: 'auto' | 'text' | 'first_last' | 'reference'
  avatarReference: string
  voiceReference: string
  characterReference: string
  sceneReference: string
  subtitleStyle: string
  packageEnabled: boolean
}

const DEFAULT_PREFERENCE: VideoPreference = {
  mode: 'video',
  model: 'MiniMax-H3',
  quality: '768P',
  duration: 5,
  ratio: '16:9',
  promptOptimize: 'auto',
  inputMode: 'auto',
  avatarReference: '',
  voiceReference: '',
  characterReference: '',
  sceneReference: '',
  subtitleStyle: 'animated',
  packageEnabled: false,
}

const QUALITY_OPTIONS = [
  { id: 'q:768P', label: '标准 768P' },
  { id: 'q:2K', label: '高清 2K' },
] as const
const MODEL_OPTIONS = [
  { id: 'm:MiniMax-H3', label: 'MiniMax H3' },
  { id: 'm:doubao-seedance-2-0-260128', label: 'Seedance 2.0' },
  { id: 'm:doubao-seedance-2-5-260628', label: 'Seedance 2.5' },
] as const
const DURATION_OPTIONS = [5, 10, 15] as const
const RATIO_OPTIONS = ['16:9', '9:16', '3:4', '1:1', '4:3', '21:9'] as const
const PROMPT_OPTIMIZE_OPTIONS = [
  { id: 'opt:auto', label: '自动优化' },
  { id: 'opt:none', label: '不需要优化' },
] as const
const INPUT_MODE_OPTIONS = [
  { id: 'im:auto', label: '自动识别' },
  { id: 'im:text', label: '文生视频' },
  { id: 'im:first_last', label: '首尾帧' },
  { id: 'im:reference', label: '多图参考' },
] as const
const SUBTITLE_OPTIONS = [
  { id: 'st:simple', label: '简洁' },
  { id: 'st:highlight', label: '高亮' },
  { id: 'st:animated', label: '动效' },
  { id: 'st:none', label: '关闭字幕' },
] as const

interface AvatarItem {
  avatar_reference: string
  name: string | null
  status: string
  preview_url: string
}
interface VoiceItem {
  voice_reference: string
  name: string | null
  status: string
  preview_url: string
}
interface CharacterItem {
  character_reference: string
  name: string | null
  video_url: string
  audio_url: string | null
}
interface SceneItem {
  scene_reference: string
  name: string | null
  image_url: string
}

async function getPreference(): Promise<VideoPreference> {
  try {
    const res = await fetch('/hl/video-preference')
    if (!res.ok) return { ...DEFAULT_PREFERENCE }
    const data = await res.json() as Record<string, unknown>
    return {
      mode: data.mode === 'avatar' ? 'avatar' : 'video',
      model: typeof data.model === 'string' ? data.model : DEFAULT_PREFERENCE.model,
      quality: typeof data.quality === 'string' ? data.quality : DEFAULT_PREFERENCE.quality,
      duration: typeof data.duration === 'number' ? data.duration : DEFAULT_PREFERENCE.duration,
      ratio: typeof data.ratio === 'string' ? data.ratio : DEFAULT_PREFERENCE.ratio,
      promptOptimize: data.promptOptimize === 'none' ? 'none' : 'auto',
      inputMode: (['auto', 'text', 'first_last', 'reference'] as const).includes(
        data.inputMode as never,
      ) ? data.inputMode as 'auto' | 'text' | 'first_last' | 'reference' : 'auto',
      avatarReference: typeof data.avatarReference === 'string' ? data.avatarReference : '',
      voiceReference: typeof data.voiceReference === 'string' ? data.voiceReference : '',
      characterReference: typeof data.characterReference === 'string' ? data.characterReference : '',
      sceneReference: typeof data.sceneReference === 'string' ? data.sceneReference : '',
      subtitleStyle: typeof data.subtitleStyle === 'string' ? data.subtitleStyle : DEFAULT_PREFERENCE.subtitleStyle,
      packageEnabled: data.packageEnabled === true,
    }
  } catch {
    return { ...DEFAULT_PREFERENCE }
  }
}

async function savePreference(patch: Partial<VideoPreference>): Promise<boolean> {
  try {
    const res = await fetch('/hl/video-preference', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    })
    return res.ok
  } catch {
    return false
  }
}

async function listAvatars(): Promise<AvatarItem[]> {
  try {
    const res = await fetch('/hl/avatars')
    if (!res.ok) return []
    const data = await res.json() as { ok?: boolean; items?: AvatarItem[] }
    return Array.isArray(data.items) ? data.items : []
  } catch {
    return []
  }
}

async function listVoices(): Promise<VoiceItem[]> {
  try {
    const res = await fetch('/hl/voices')
    if (!res.ok) return []
    const data = await res.json() as { ok?: boolean; items?: VoiceItem[] }
    return Array.isArray(data.items) ? data.items : []
  } catch {
    return []
  }
}

async function listCharacters(): Promise<CharacterItem[]> {
  try {
    const res = await fetch('/hl/characters')
    if (!res.ok) return []
    const data = await res.json() as { ok?: boolean; items?: CharacterItem[] }
    return Array.isArray(data.items) ? data.items : []
  } catch {
    return []
  }
}

async function listScenes(): Promise<SceneItem[]> {
  try {
    const res = await fetch('/hl/scenes')
    if (!res.ok) return []
    const data = await res.json() as { ok?: boolean; items?: SceneItem[] }
    return Array.isArray(data.items) ? data.items : []
  } catch {
    return []
  }
}

function readyName(name: string | null, reference: string): string {
  return name && name.trim() !== '' ? name : reference
}

export function VideoToolbar() {
  const [visible, setVisible] = useState(false)
  const [pref, setPref] = useState<VideoPreference>({ ...DEFAULT_PREFERENCE })
  const [avatars, setAvatars] = useState<AvatarItem[]>([])
  const [voices, setVoices] = useState<VoiceItem[]>([])
  const [characters, setCharacters] = useState<CharacterItem[]>([])
  const [scenes, setScenes] = useState<SceneItem[]>([])
  const [mode, setMode] = useState<'avatar' | 'video'>(() => {
    try {
      return localStorage.getItem('heightlab.videoToolbarMode') === 'avatar' ? 'avatar' : 'video'
    } catch {
      return 'video'
    }
  })
  const [openMenu, setOpenMenu] = useState<'avatar' | 'gen' | 'pack' | 'asset' | null>(null)
  const [busyAvatar, setBusyAvatar] = useState(false)
  const [busyVoice, setBusyVoice] = useState(false)
  const [busyCharacter, setBusyCharacter] = useState(false)
  const [busyScene, setBusyScene] = useState(false)
  const [characterNameModal, setCharacterNameModal] = useState(false)
  const [characterNameInput, setCharacterNameInput] = useState('')
  const [characterPendingName, setCharacterPendingName] = useState('')
  const avatarInputRef = useRef<HTMLInputElement | null>(null)
  const voiceInputRef = useRef<HTMLInputElement | null>(null)
  const characterInputRef = useRef<HTMLInputElement | null>(null)
  const sceneInputRef = useRef<HTMLInputElement | null>(null)
  const barRef = useRef<HTMLDivElement | null>(null)
  const measureRef = useRef<HTMLDivElement | null>(null)
  const [compact, setCompact] = useState(false)
  // HeightLab：「数字人/视频生成」胶囊缩字（数/视）只跟随左右两侧边栏同时
  // 展开，不跟随窗口空间；参数按钮的图标化仍走纯空间判定。
  const [bothSidebarsOpen, setBothSidebarsOpen] = useState(false)

  // 显示条件：用户手动选中视频专家（body dataset）或 Colin 派发中（/hl/current-agent）
  useEffect(() => {
    let cancelled = false
    const tick = (): void => {
      const staged = document.body.dataset.hlAgentPreset
      fetch('/hl/current-agent')
        .then(response => response.json().catch(() => ({})))
        .then((data: { ok?: boolean; id?: string | null }) => {
          if (cancelled) return
          const working = data?.ok === true && typeof data.id === 'string' ? data.id : null
          setVisible(staged === VIDEO_PRODUCER || working === VIDEO_PRODUCER)
        })
        .catch(() => {
          if (!cancelled) setVisible(staged === VIDEO_PRODUCER)
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
      if (cancelled) return
      setPref(next)
      setMode(next.mode)
    })
    return () => { cancelled = true }
  }, [visible])

  // 数字人模式打开菜单时加载形象/声音
  useEffect(() => {
    if (openMenu !== 'avatar' || mode !== 'avatar') return
    let cancelled = false
    void Promise.all([listAvatars(), listVoices()]).then(([a, v]) => {
      if (cancelled) return
      setAvatars(a)
      setVoices(v)
    })
    return () => { cancelled = true }
  }, [openMenu, mode])

  // 人物资产模式打开菜单时加载人物/声音/场景
  useEffect(() => {
    if (openMenu !== 'asset' || mode !== 'video') return
    let cancelled = false
    void Promise.all([listCharacters(), listVoices(), listScenes()]).then(([c, v, s]) => {
      if (cancelled) return
      setCharacters(c)
      setVoices(v)
      setScenes(s)
    })
    return () => { cancelled = true }
  }, [openMenu, mode])

  const switchMode = (next: 'avatar' | 'video'): void => {
    setMode(next)
    setOpenMenu(null)
    try {
      localStorage.setItem('heightlab.videoToolbarMode', next)
    } catch { /* 非致命 */ }
    void savePreference({ mode: next })
  }

  // HeightLab：新建数字人形象/克隆声音/人物资产/场景 → 直接打开
  // 「设置 → 形象与声音」真正的新建界面（不在输入框内联创建）。
  const openVoiceAvatarSettings = (): void => {
    setOpenMenu(null)
    window.dispatchEvent(new CustomEvent('hl:open-settings-section', {
      detail: { section: 'heightlab-voice-avatar' },
    }))
  }

  // 空间自适应：用隐藏的“全展开”副本测量按钮自然宽度，与输入行可用宽度
  // 比较——空间不够才切换为纯图标（compact），全屏/大窗口保持图标+文字。
  // 「数/视」缩字单独判定：仅当左侧原生侧栏（data-sidebar-collapsed 缺省）
  // 与右侧 better-sidebar（data-dsh-sidebar-collapsed 缺省）同时展开时启用。
  const recalcCompact = useCallback((): void => {
    const host = barRef.current?.parentElement
    const measure = measureRef.current
    if (!host || !measure) return
    const hostWidth = host.getBoundingClientRect().width
    const measureWidth = measure.getBoundingClientRect().width
    if (hostWidth <= 60) return
    setCompact(measureWidth > hostWidth + 8)
    setBothSidebarsOpen(
      document.querySelector('[data-sidebar-collapsed]') === null
      && !document.body.hasAttribute('data-dsh-sidebar-collapsed'),
    )
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
  }, [recalcCompact, mode, pref, openMenu])

  const updatePreference = useCallback((patch: Partial<VideoPreference>): void => {
    const next = { ...pref, ...patch }
    setPref(next)
    void savePreference(patch)
  }, [pref])

  const onSelect = (id: string): void => {
    if (id.startsWith('m:')) {
      updatePreference({ model: id.slice(2) })
    } else if (id.startsWith('q:')) {
      updatePreference({ quality: id.slice(2) })
    } else if (id.startsWith('d:')) {
      const duration = Number(id.slice(2))
      if ([5, 10, 15].includes(duration)) updatePreference({ duration })
    } else if (id.startsWith('r:')) {
      updatePreference({ ratio: id.slice(2) })
    } else if (id.startsWith('opt:')) {
      updatePreference({ promptOptimize: id.slice(4) === 'none' ? 'none' : 'auto' })
    } else if (id.startsWith('im:')) {
      updatePreference({ inputMode: id.slice(3) as 'auto' | 'text' | 'first_last' | 'reference' })
    } else if (id.startsWith('st:')) {
      updatePreference({ subtitleStyle: id.slice(3) })
    } else if (id === 'pkg:on') {
      updatePreference({ packageEnabled: true })
    } else if (id === 'pkg:off') {
      updatePreference({ packageEnabled: false })
    } else if (id === 'create-avatar') {
      avatarInputRef.current?.click()
      return
    } else if (id === 'create-voice') {
      voiceInputRef.current?.click()
      return
    } else if (id === 'clear-avatar') {
      updatePreference({ avatarReference: '' })
      return
    } else if (id === 'clear-voice') {
      updatePreference({ voiceReference: '' })
      return
    } else if (id.startsWith('av:')) {
      updatePreference({ avatarReference: id.slice(3) })
    } else if (id.startsWith('vo:')) {
      updatePreference({ voiceReference: id.slice(3) })
    } else if (id.startsWith('ch:')) {
      updatePreference({ characterReference: id.slice(3) })
    } else if (id.startsWith('sc:')) {
      updatePreference({ sceneReference: id.slice(3) })
    } else if (id === 'clear-character') {
      updatePreference({ characterReference: '' })
      return
    } else if (id === 'clear-scene') {
      updatePreference({ sceneReference: '' })
      return
    } else if (id === 'create-character') {
      setCharacterNameInput('')
      setCharacterNameModal(true)
      return
    } else if (id === 'create-scene') {
      sceneInputRef.current?.click()
      return
    }
  }

  const onAvatarFile = async (file: File | undefined): Promise<void> => {
    if (!file) return
    setBusyAvatar(true)
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result ?? ''))
        reader.onerror = () => reject(new Error('read failed'))
        reader.readAsDataURL(file)
      })
      const res = await fetch('/hl/avatars', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          image_base64: base64,
          image_filename: file.name,
          name: file.name.replace(/\.[^.]+$/, '').slice(0, 30),
        }),
      })
      const data = await res.json() as Record<string, unknown>
      const ref = data.avatar_reference
      const operation = data.operation_reference
      if (!res.ok || typeof ref !== 'string') return
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 8000))
        try {
          const sr = await fetch('/hl/avatars/status', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ avatar_reference: ref, operation_reference: operation }),
          })
          const sd = await sr.json() as { status?: string }
          if (sd.status === 'ready' || sd.status === 'completed' || sd.status === 'failed') break
        } catch { /* 继续轮询 */ }
      }
      setAvatars(await listAvatars())
      updatePreference({ avatarReference: ref })
    } finally {
      setBusyAvatar(false)
      if (avatarInputRef.current) avatarInputRef.current.value = ''
    }
  }

  const onVoiceFile = async (file: File | undefined): Promise<void> => {
    if (!file) return
    setBusyVoice(true)
    try {
      const form = new FormData()
      form.append('audio', file)
      form.append('title', file.name.replace(/\.[^.]+$/, '').slice(0, 30))
      const res = await fetch('/hl/voices', { method: 'POST', body: form })
      const data = await res.json() as Record<string, unknown>
      const ref = data.voice_reference
      if (!res.ok || typeof ref !== 'string') return
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 8000))
        try {
          const sr = await fetch('/hl/voices/status', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ voice_reference: ref }),
          })
          const sd = await sr.json() as { status?: string }
          if (sd.status === 'ready' || sd.status === 'completed' || sd.status === 'failed') break
        } catch { /* 继续轮询 */ }
      }
      setVoices(await listVoices())
      updatePreference({ voiceReference: ref })
    } finally {
      setBusyVoice(false)
      if (voiceInputRef.current) voiceInputRef.current.value = ''
    }
  }

  const onCharacterFile = async (file: File | undefined): Promise<void> => {
    if (!file) return
    setBusyCharacter(true)
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result ?? ''))
        reader.onerror = () => reject(new Error('read failed'))
        reader.readAsDataURL(file)
      })
      const res = await fetch('/hl/characters', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          video_base64: base64,
          filename: file.name,
          name: (characterPendingName.trim() || file.name.replace(/\.[^.]+$/, '')).slice(0, 30),
        }),
      })
      const data = await res.json() as Record<string, unknown>
      const ref = data.character_reference
      if (!res.ok || typeof ref !== 'string') return
      setCharacters(await listCharacters())
      updatePreference({ characterReference: ref })
    } finally {
      setBusyCharacter(false)
      setCharacterPendingName('')
      if (characterInputRef.current) characterInputRef.current.value = ''
    }
  }

  const confirmCharacterName = (): void => {
    setCharacterPendingName(characterNameInput.trim())
    setCharacterNameModal(false)
    characterInputRef.current?.click()
  }

  const onSceneFile = async (file: File | undefined): Promise<void> => {
    if (!file) return
    setBusyScene(true)
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result ?? ''))
        reader.onerror = () => reject(new Error('read failed'))
        reader.readAsDataURL(file)
      })
      const res = await fetch('/hl/scenes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          image_base64: base64,
          filename: file.name,
          name: file.name.replace(/\.[^.]+$/, '').slice(0, 30),
        }),
      })
      const data = await res.json() as Record<string, unknown>
      const ref = data.scene_reference
      if (!res.ok || typeof ref !== 'string') return
      setScenes(await listScenes())
      updatePreference({ sceneReference: ref })
    } finally {
      setBusyScene(false)
      if (sceneInputRef.current) sceneInputRef.current.value = ''
    }
  }

  if (!visible) return null

  const videoGenItems: MenuEntry[] = [
    {
      id: 'g-model',
      label: <>模型 <span style={{ opacity: 0.6 }}>{MODEL_OPTIONS.find(m => m.id === `m:${pref.model}`)?.label ?? 'MiniMax H3'}</span></>,
      submenu: [
        { id: 'm:MiniMax-H3', label: 'MiniMax H3' },
        {
          id: 'm:doubao-seedance-2-0-260128',
          label: (
            <span className={css.item}>
              <span className={css.itemName}>Seedance 2.0</span>
              <span className={css.itemState}>暂未开放</span>
            </span>
          ),
          disabled: true,
        },
        {
          id: 'm:doubao-seedance-2-5-260628',
          label: (
            <span className={css.item}>
              <span className={css.itemName}>Seedance 2.5</span>
              <span className={css.itemState}>暂未开放</span>
            </span>
          ),
          disabled: true,
        },
      ],
    },
    {
      id: 'g-quality',
      label: <>清晰度 <span style={{ opacity: 0.6 }}>{pref.quality === '2K' ? '高清 2K' : '标准 768P'}</span></>,
      submenu: QUALITY_OPTIONS.map(o => ({ id: o.id, label: o.label })),
    },
    {
      id: 'g-duration',
      label: <>时长 <span style={{ opacity: 0.6 }}>{`${pref.duration} 秒`}</span></>,
      submenu: DURATION_OPTIONS.map(d => ({ id: `d:${d}`, label: `${d} 秒` })),
    },
    {
      id: 'g-ratio',
      label: <>画幅 <span style={{ opacity: 0.6 }}>{pref.ratio}</span></>,
      submenu: RATIO_OPTIONS.map(r => ({ id: `r:${r}`, label: r })),
    },
    {
      id: 'g-optimize',
      label: <>优化提示词 <span style={{ opacity: 0.6 }}>{pref.promptOptimize === 'none' ? '不需要优化' : '自动优化'}</span></>,
      submenu: PROMPT_OPTIMIZE_OPTIONS.map(o => ({ id: o.id, label: o.label })),
    },
    {
      id: 'g-input-mode',
      label: <>输入模式 <span style={{ opacity: 0.6 }}>{INPUT_MODE_OPTIONS.find(o => o.id === `im:${pref.inputMode}`)?.label ?? '自动识别'}</span></>,
      submenu: INPUT_MODE_OPTIONS.map(o => ({ id: o.id, label: o.label })),
    },
  ]

  const videoPackItems: MenuEntry[] = [
    {
      id: 'g-subtitle',
      label: <>字幕样式 <span style={{ opacity: 0.6 }}>{SUBTITLE_OPTIONS.find(o => o.id === `st:${pref.subtitleStyle}`)?.label ?? pref.subtitleStyle}</span></>,
      submenu: SUBTITLE_OPTIONS.map(o => ({ id: o.id, label: o.label })),
    },
    {
      id: 'g-package',
      label: <>包装 <span style={{ opacity: 0.6 }}>{pref.packageEnabled ? '自动包装' : '不自动包装'}</span></>,
      submenu: [
        { id: 'pkg:on', label: '自动包装（字幕+品牌条）' },
        { id: 'pkg:off', label: '不自动包装' },
      ],
    },
  ]

  const avatarItems: MenuEntry[] = [
    {
      id: 'a-avatar',
      label: <>形象 <span style={{ opacity: 0.6 }}>{pref.avatarReference
        ? (avatars.find(a => a.avatar_reference === pref.avatarReference)?.name
          ? readyName(avatars.find(a => a.avatar_reference === pref.avatarReference)?.name ?? null, pref.avatarReference)
          : pref.avatarReference)
        : '不使用'}</span></>,
      submenu: [
        { id: 'clear-avatar', label: '不使用形象' },
        ...avatars.map(a => ({
          id: `av:${a.avatar_reference}`,
          label: (
            <span className={css.item}>
              {a.preview_url && <img className={css.itemThumb} src={a.preview_url} alt="" draggable={false} />}
              <span className={css.itemDot} />
              <span className={css.itemName}>{readyName(a.name, a.avatar_reference)}</span>
              {a.status !== 'ready' && <span className={css.itemState}>{a.status === 'training' ? '创建中' : a.status}</span>}
            </span>
          ),
        })),
        { id: 'create-avatar', label: busyAvatar ? '形象创建中…' : '＋ 新建形象（上传照片）', disabled: busyAvatar },
      ],
    },
    {
      id: 'v-voice',
      label: <>声音 <span style={{ opacity: 0.6 }}>{pref.voiceReference
        ? (voices.find(v => v.voice_reference === pref.voiceReference)?.name
          ? readyName(voices.find(v => v.voice_reference === pref.voiceReference)?.name ?? null, pref.voiceReference)
          : pref.voiceReference)
        : '不使用'}</span></>,
      submenu: [
        { id: 'clear-voice', label: '不使用声音' },
        ...voices.map(v => ({
          id: `vo:${v.voice_reference}`,
          label: (
            <span className={css.item}>
              <span className={css.itemThumb} aria-hidden>
                <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
                  <path d="M3 6v4M6 4v8M9 5v6M12 6.5v3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
              </span>
              <span className={css.itemDot} />
              <span className={css.itemName}>{readyName(v.name, v.voice_reference)}</span>
              {v.status !== 'ready' && <span className={css.itemState}>{v.status === 'training' ? '克隆中' : v.status}</span>}
            </span>
          ),
        })),
        { id: 'create-voice', label: busyVoice ? '声音克隆中…' : '＋ 新建声音（上传录音）', disabled: busyVoice },
      ],
    },
  ]

  const videoAssetItems: MenuEntry[] = [
    {
      id: 'c-character',
      label: <>人物 <span style={{ opacity: 0.6 }}>{pref.characterReference
        ? (characters.find(c => c.character_reference === pref.characterReference)?.name
          ? readyName(characters.find(c => c.character_reference === pref.characterReference)?.name ?? null, pref.characterReference)
          : pref.characterReference)
        : '不使用'}</span></>,
      submenu: [
        { id: 'clear-character', label: '不使用人物' },
        ...characters.map(c => ({
          id: `ch:${c.character_reference}`,
          label: (
            <span className={css.item}>
              {c.video_url && (
                <video className={css.itemThumb} src={c.video_url} muted playsInline preload="metadata" />
              )}
              <span className={css.itemDot} />
              <span className={css.itemName}>{readyName(c.name, c.character_reference)}</span>
              {c.audio_url == null && <span className={css.itemState}>无声</span>}
            </span>
          ),
        })),
        {
          id: 'create-character',
          label: busyCharacter ? '人物上传中…' : '＋ 新建人物（录 5-15 秒视频）',
          disabled: busyCharacter,
        },
      ],
    },
    {
      id: 's-scene',
      label: <>场景 <span style={{ opacity: 0.6 }}>{pref.sceneReference
        ? (scenes.find(s => s.scene_reference === pref.sceneReference)?.name
          ? readyName(scenes.find(s => s.scene_reference === pref.sceneReference)?.name ?? null, pref.sceneReference)
          : pref.sceneReference)
        : '不使用'}</span></>,
      submenu: [
        { id: 'clear-scene', label: '不使用场景' },
        ...scenes.map(s => ({
          id: `sc:${s.scene_reference}`,
          label: (
            <span className={css.item}>
              {s.image_url && <img className={css.itemThumb} src={s.image_url} alt="" draggable={false} />}
              <span className={css.itemDot} />
              <span className={css.itemName}>{readyName(s.name, s.scene_reference)}</span>
            </span>
          ),
        })),
        { id: 'create-scene', label: busyScene ? '场景上传中…' : '＋ 新建场景（上传图片）', disabled: busyScene },
      ],
    },
  ]

  const trigger = (label: string, openState: boolean, onToggle: () => void, icon?: ReactNode) => (
    <button
      type="button"
      className={css.trigger}
      aria-expanded={openState}
      aria-haspopup="menu"
      title={label}
      aria-label={label}
      onClick={onToggle}
    >
      {icon !== undefined && <span className={css.triggerIcon}>{icon}</span>}
      <span className={css.triggerText}>{label}</span>
      <span className={`${css.chevron} ${openState ? css.chevronOpen : ''}`}>
        <IconChevronDownOutline14 />
      </span>
    </button>
  )

  const segmentedControl = (compactText: boolean) => (
    <div className={css.segmented} role="tablist" aria-label="视频工具模式">
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'avatar'}
        className={`${css.segment} ${mode === 'avatar' ? css.segmentActive : ''}`}
        onClick={() => switchMode('avatar')}
      >
        {compactText ? '数' : '数字人'}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'video'}
        className={`${css.segment} ${mode === 'video' ? css.segmentActive : ''}`}
        onClick={() => switchMode('video')}
      >
        {compactText ? '视' : '视频生成'}
      </button>
    </div>
  )

  const avatarTrigger = trigger('形象与声音', openMenu === 'avatar', () => setOpenMenu(v => v === 'avatar' ? null : 'avatar'), <IconUserOutline16 />)
  const genTrigger = trigger('模型参数', openMenu === 'gen', () => setOpenMenu(v => v === 'gen' ? null : 'gen'), <IconSettingsOutline16 />)
  const packTrigger = trigger('字幕包装', openMenu === 'pack', () => setOpenMenu(v => v === 'pack' ? null : 'pack'), <IconEditOutline16 />)
  const assetTrigger = trigger('人物资产', openMenu === 'asset', () => setOpenMenu(v => v === 'asset' ? null : 'asset'), <IconUserOutline16 />)
  const segmentedFull = segmentedControl(false)
  const segmentedCompact = segmentedControl(true)

  return (
    <>
      <div ref={barRef} className={`${css.toolbar} ${compact ? css.compact : ''}`}>
        {mode === 'avatar' ? (
          <>
            <Menu
              open={openMenu === 'avatar'}
              onClose={() => setOpenMenu(null)}
              items={avatarItems}
              selectedIds={[
                pref.avatarReference ? `av:${pref.avatarReference}` : 'clear-avatar',
                pref.voiceReference ? `vo:${pref.voiceReference}` : 'clear-voice',
              ]}
              onSelect={(id) => {
                if (id === 'create-avatar' || id === 'create-voice') {
                  openVoiceAvatarSettings()
                  return
                }
                onSelect(id)
              }}
              anchor={avatarTrigger}
              portal
            />
            <Menu
              open={openMenu === 'pack'}
              onClose={() => setOpenMenu(null)}
              items={videoPackItems}
              selectedIds={[`st:${pref.subtitleStyle}`, pref.packageEnabled ? 'pkg:on' : 'pkg:off']}
              onSelect={onSelect}
              anchor={packTrigger}
              portal
            />
          </>
        ) : (
          <>
            <Menu
              open={openMenu === 'gen'}
              onClose={() => setOpenMenu(null)}
              items={videoGenItems}
              selectedIds={[
                `m:${pref.model}`,
                `q:${pref.quality}`,
                `d:${pref.duration}`,
                `r:${pref.ratio}`,
                `opt:${pref.promptOptimize}`,
                `im:${pref.inputMode}`,
              ]}
              onSelect={onSelect}
              anchor={genTrigger}
              portal
            />
            <Menu
              open={openMenu === 'asset'}
              onClose={() => setOpenMenu(null)}
              items={videoAssetItems}
              selectedIds={[
                pref.characterReference ? `ch:${pref.characterReference}` : 'clear-character',
                pref.sceneReference ? `sc:${pref.sceneReference}` : 'clear-scene',
              ]}
              onSelect={(id) => {
                if (id === 'create-character' || id === 'create-scene') {
                  openVoiceAvatarSettings()
                  return
                }
                onSelect(id)
              }}
              anchor={assetTrigger}
              portal
            />
          </>
        )}
        {bothSidebarsOpen ? segmentedCompact : segmentedFull}
        <input
          ref={avatarInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/heic,image/heif"
          hidden
          onChange={(e) => { void onAvatarFile(e.target.files?.[0]) }}
        />
        <input
          ref={voiceInputRef}
          type="file"
          accept="audio/*"
          hidden
          onChange={(e) => { void onVoiceFile(e.target.files?.[0]) }}
        />
        <input
          ref={characterInputRef}
          type="file"
          accept="video/mp4,video/quicktime,video/webm"
          hidden
          onChange={(e) => { void onCharacterFile(e.target.files?.[0]) }}
        />
        <input
          ref={sceneInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/heic,image/heif"
          hidden
          onChange={(e) => { void onSceneFile(e.target.files?.[0]) }}
        />
      </div>
      {characterNameModal && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 2000, display: 'flex',
            alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)',
          }}
          onClick={() => setCharacterNameModal(false)}
        >
          <div
            style={{
              width: 'min(360px, 90vw)', background: 'var(--color-bg-1, #fff)', borderRadius: 14,
              padding: '20px 18px', display: 'flex', flexDirection: 'column', gap: 12,
              boxShadow: '0 16px 60px rgba(0,0,0,0.25)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ fontWeight: 600 }}>创建人物</div>
            <div style={{ fontSize: 12, opacity: 0.65 }}>给这个人物起个名字，方便以后认出来（录一段 5-15 秒正面视频）。</div>
            <input
              autoFocus
              value={characterNameInput}
              placeholder="人物名字（例如：王相宜）"
              maxLength={30}
              style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(127,127,127,0.35)', background: 'transparent', color: 'inherit', fontSize: 13 }}
              onChange={e => setCharacterNameInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') confirmCharacterName() }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button type="button" style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid currentColor', background: 'transparent', cursor: 'pointer', fontSize: 13 }} onClick={() => setCharacterNameModal(false)}>
                取消
              </button>
              <button
                type="button"
                style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #1f6feb', background: '#1f6feb', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
                disabled={characterNameInput.trim() === ''}
                onClick={confirmCharacterName}
              >
                确认并选择视频
              </button>
            </div>
          </div>
        </div>
      )}
      <div ref={measureRef} className={`${css.toolbar} ${css.measure}`} aria-hidden>
        {mode === 'avatar' ? (<>{avatarTrigger}{packTrigger}</>) : (<>{genTrigger}{assetTrigger}</>)}
        {segmentedFull}
      </div>
    </>
  )
}

/**
 * HeightLab 官方提供商的默认模型配置（2026-10-17）。
 *
 * 输入框只保留文本模型 + 推理等级；图片/视频模型改到这里集中配置，
 * 用户不必每次在输入框里选。读写复用宿主 `/hl/model-mapping`（与
 * ModelSelect 同一份真源，避免两套默认值打架）。
 */
import { useCallback, useEffect, useState, type JSX } from 'react'
import styles from './ModelsSection.module.css'

/** 与 ModelSelect 的清单保持一致（网关 GET /v1/models 实测）。 */
const TEXT_OPTIONS: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash' },
  { id: 'deepseek-v4-flash-vision-exp', label: 'DeepSeek V4 Flash Vision' },
  { id: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro' },
  { id: 'deepseek-flash', label: 'DeepSeek Flash' },
  { id: 'claude-opus-4-8', label: 'Claude Opus 4.8' },
  { id: 'claude-sonnet-5', label: 'Claude Sonnet 5' },
  { id: 'claude-fable-5', label: 'Claude Fable 5' },
  { id: 'gpt-5.6-sol', label: 'GPT-5.6 Sol' },
  { id: 'gpt-5.6-terra', label: 'GPT-5.6 Terra' },
  { id: 'gpt-5.6-luna', label: 'GPT-5.6 Luna' },
  { id: 'gpt-5.5', label: 'GPT-5.5' },
  { id: 'gpt-5.4', label: 'GPT-5.4' },
  { id: 'glm-5.2', label: 'GLM-5.2' },
  { id: 'grok-4.5', label: 'Grok-4.5' },
]

const IMAGE_OPTIONS: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'gpt-image-2', label: 'image2 1080P' },
  { id: 'gpt-image-2-4k', label: 'image2 4K' },
]

const VIDEO_OPTIONS: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'MiniMax-H3', label: 'MiniMax H3' },
  { id: 'doubao-seedance-2-5-260628', label: 'Seedance 2.5' },
  { id: 'doubao-seedance-2-0-260128', label: 'Seedance 2.0' },
  { id: 'doubao-seedance-2-0-fast-260128', label: 'Seedance 2.0 Fast' },
  { id: 'doubao-seedance-2-0-mini-260615', label: 'Seedance 2.0 Mini' },
]

interface Mapping {
  text: string
  image: string
  video: string
}

const FALLBACK: Mapping = {
  text: 'deepseek-v4-flash',
  image: 'gpt-image-2',
  video: 'MiniMax-H3',
}

/**
 * 三行下拉，写入同一条 model-mapping 记录。
 * @returns the default-model editor rows.
 */
export function HeightLabModelDefaults(): JSX.Element {
  const [mapping, setMapping] = useState<Mapping>(FALLBACK)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    void fetch('/hl/model-mapping')
      .then(res => res.json() as Promise<{ ok?: boolean; mapping?: Partial<Mapping> }>)
      .then((data) => {
        if (data.ok === true && data.mapping !== undefined) {
          setMapping({
            text: data.mapping.text ?? FALLBACK.text,
            image: data.mapping.image ?? FALLBACK.image,
            video: data.mapping.video ?? FALLBACK.video,
          })
        }
      })
      .catch(() => { /* 未登录：展示默认值 */ })
  }, [])

  // 用函数式更新避免把 mapping 放进依赖（否则 persist 每次重建 → 行组件
  // 重挂 → 触发额外渲染；配合 select 的受控值可形成重渲染循环）。
  const persist = useCallback((patch: Partial<Mapping>): void => {
    setMapping(prev => ({ ...prev, ...patch }))
    setSaving(true)
    void fetch('/hl/model-mapping', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    })
      .then(() => { setSaved(true); window.setTimeout(() => { setSaved(false) }, 1800) })
      .catch(() => { /* 失败保持本地值 */ })
      .finally(() => { setSaving(false) })
  }, [])

  const row = (
    label: string,
    hint: string,
    value: string,
    options: ReadonlyArray<{ id: string; label: string }>,
    key: keyof Mapping,
  ): JSX.Element => (
    <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
      <span style={{ width: 72, color: '#0f172a', fontSize: 13 }}>{label}</span>
      <select
        value={value}
        disabled={saving}
        onChange={(event) => { persist({ [key]: event.target.value }) }}
        style={{ minWidth: 220, padding: '5px 8px', borderRadius: 6, border: '1px solid rgba(0,0,0,.14)', fontSize: 12 }}
      >
        {options.some(option => option.id === value)
          ? null
          : <option value={value}>{value}</option>}
        {options.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
      </select>
      <span style={{ color: '#94a3b8', fontSize: 11 }}>{hint}</span>
    </label>
  )

  return (
    <div className={styles['rowBody'] ?? ''} style={{ padding: '4px 0 8px' }}>
      {row('默认模型', '对话使用', mapping.text, TEXT_OPTIONS, 'text')}
      {row('图片模型', '图片生成使用', mapping.image, IMAGE_OPTIONS, 'image')}
      {row('视频模型', '视频生成使用', mapping.video, VIDEO_OPTIONS, 'video')}
      {saved && <span style={{ color: '#16a34a', fontSize: 11 }}>已保存</span>}
    </div>
  )
}

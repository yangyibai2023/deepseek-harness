/**
 * HeightLab：做同款参数表单（点「做同款」后弹出）。
 *
 * 前端收集模板需要的字段（主题/内容、平台/尺寸、风格、补充说明），
 * 用户填写后直接发送给 Colin/对应专家；不再依赖模型弹窗。
 */

import { useEffect, useState } from 'react'
import type { Recommendation, TemplateCategory } from './HeightLabTemplates.ts'

interface FormField {
  key: string
  type: 'textarea' | 'select'
  required?: boolean
  placeholder?: string
  options?: string[]
}

function fieldsFor(category: TemplateCategory, item?: Recommendation): FormField[] {
  if (item?.cover !== undefined) {
    return [
      { key: '主题/内容', type: 'textarea', required: true, placeholder: '例如：产品名 / 要传达的结论 / 教程主题' },
      { key: '比例', type: 'select', options: ['3:4', '4:3', '16:9', '1:1'] },
      { key: '补充说明', type: 'textarea', placeholder: '可选：副标题/卖点、品牌信息。素材请先上传到聊天（截图或视频），专家会以最近上传的素材为屏幕证据。' },
    ]
  }
  switch (category) {
    case '图片':
      return [
        { key: '主题/内容', type: 'textarea', required: true, placeholder: '例如：卖什么产品 / 分享什么干货 / 要传达的结论' },
        { key: '平台/尺寸', type: 'select', options: ['小红书 3:4', '小红书 1:1', '抖音/视频封面 9:16', '公众号头图', '电商主图 1:1', '海报 16:9', '其他'] },
        { key: '风格', type: 'select', options: ['高饱和撞色', '简约极简', '渐变弥散光', '复古', '新中式', '莫兰迪', '不指定'] },
        { key: '补充说明', type: 'textarea', placeholder: '可选：品牌色、参考链接、禁忌等' },
      ]
    case '视频':
      return [
        { key: '主题/内容', type: 'textarea', required: true, placeholder: '例如：产品卖点 / 口播主题 / 脚本内容' },
        { key: '平台/用途', type: 'select', options: ['抖音口播', '视频号', 'B站', '小红书', '产品演示', '其他'] },
        { key: '时长', type: 'select', options: ['5 秒', '10 秒', '15 秒', '不指定'] },
        { key: '风格', type: 'select', options: ['快节奏卡点', '专业稳重', '生活真实感', '科技感', '不指定'] },
        { key: '补充说明', type: 'textarea', placeholder: '可选：参考视频、品牌元素、禁忌等' },
      ]
    case '文案':
      return [
        { key: '主题/内容', type: 'textarea', required: true, placeholder: '例如：产品/事件/要传达的信息' },
        { key: '平台', type: 'select', options: ['小红书', '抖音', '公众号', '朋友圈', '品牌官网', '其他'] },
        { key: '口吻', type: 'select', options: ['专业', '活泼', '极简', '故事化', '官方', '不指定'] },
        { key: '补充说明', type: 'textarea', placeholder: '可选：字数、要点、对标风格链接等' },
      ]
    case '办公':
      return [
        { key: '主题/内容', type: 'textarea', required: true, placeholder: '例如：本周工作 / 会议议题 / 项目材料' },
        { key: '用途', type: 'select', options: ['周报', '会议纪要', 'PPT 大纲', '邮件', '通知公告', '项目复盘', '其他'] },
        { key: '格式', type: 'select', options: ['简洁分点', '完整长文', '表格', '不指定'] },
        { key: '补充说明', type: 'textarea', placeholder: '可选：重点数据、上级关注点等' },
      ]
    case '术语':
      return [
        { key: '使用场景', type: 'textarea', required: true, placeholder: '例如：给团队讲 / 写在文档里 / 面试准备' },
        { key: '讲解深度', type: 'select', options: ['入门', '进阶', '深入原理'] },
        { key: '补充说明', type: 'textarea', placeholder: '可选：想重点对比的概念等' },
      ]
    default:
      return []
  }
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 99999,
  background: 'rgba(0,0,0,0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 24,
  boxSizing: 'border-box',
}

const cardStyle: React.CSSProperties = {
  width: 'min(460px, 92vw)',
  maxHeight: '86vh',
  overflowY: 'auto',
  background: 'var(--dsw-alias-bg-1, #fff)',
  color: 'var(--dsw-alias-label-primary)',
  borderRadius: 16,
  padding: '20px 20px 16px',
  boxShadow: '0 24px 80px rgba(0,0,0,0.28)',
  boxSizing: 'border-box',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid var(--dsw-alias-border-l3, rgba(127,127,127,0.35))',
  background: 'transparent',
  color: 'inherit',
  fontSize: 13,
  fontFamily: 'inherit',
}

export function TemplateFormModal({ item, category, onClose, onSubmit }: {
  item: Recommendation
  category: TemplateCategory
  onClose: () => void
  onSubmit: (answers: Record<string, string>) => void
}) {
  const fields = fieldsFor(category, item)
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {}
    for (const field of fields) {
      initial[field.key] = field.type === 'select' ? (field.options?.[0] ?? '') : ''
    }
    return initial
  })

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const requiredMissing = fields.some(field => field.required === true && (values[field.key] ?? '').trim() === '')
  const submit = (): void => {
    if (requiredMissing) return
    onSubmit({ ...values })
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={cardStyle} onClick={event => event.stopPropagation()}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>做同款 · {item.title}</div>
        <div style={{ fontSize: 12, color: 'var(--dsw-alias-label-tertiary)', marginBottom: 14 }}>{item.desc}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {fields.map(field => (
            <label key={field.key} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <span style={{ fontSize: 12, fontWeight: 600 }}>
                {field.key}{field.required === true ? '（必填）' : ''}
              </span>
              {field.type === 'textarea' ? (
                <textarea
                  rows={field.key === '主题/内容' || field.key === '使用场景' ? 3 : 2}
                  style={{ ...inputStyle, resize: 'vertical', minHeight: 48 }}
                  placeholder={field.placeholder ?? ''}
                  value={values[field.key] ?? ''}
                  onChange={event => setValues(previous => ({ ...previous, [field.key]: event.target.value }))}
                />
              ) : (
                <select
                  style={inputStyle}
                  value={values[field.key] ?? ''}
                  onChange={event => setValues(previous => ({ ...previous, [field.key]: event.target.value }))}
                >
                  {(field.options ?? []).map(option => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              )}
            </label>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
          <button
            type="button"
            style={{ padding: '7px 16px', borderRadius: 8, border: '1px solid currentColor', background: 'transparent', cursor: 'pointer', fontSize: 13 }}
            onClick={onClose}
          >
            取消
          </button>
          <button
            type="button"
            style={{
              padding: '7px 18px',
              borderRadius: 8,
              border: 'none',
              background: '#111',
              color: '#fff',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
              opacity: requiredMissing ? 0.5 : 1,
            }}
            disabled={requiredMissing}
            onClick={submit}
          >
            开始生成
          </button>
        </div>
      </div>
    </div>
  )
}

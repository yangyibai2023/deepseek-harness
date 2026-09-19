/**
 * HeightLab V31：首页视频模板网格（对标 MiniMax Design 创作灵感区的
 * 卡片语言：大封面 + 时长/角标 + 标题 + 两行描述 + 出品行）。
 *
 * 产品语义（用户拍板 2026-09-20）：这里的「模板」= 平台预置的现成视频——
 * 用户点开即可生成同款、或在片子里替换产品/人物/元素；本质是复刻，只是
 * 「原片是我们提供的」而非用户上传。当前为过渡形态：
 *  - 第一张「爆款复刻」接通真实能力（等价一级页爆款复刻入口）；
 *  - 其余为「即将上线」占位卡，数据结构按终态设计（封面/标题/描述/分类/
 *    时长），接入真实模板库时只换数据不动架构。
 */
import { useEffect, useRef, useState } from 'react'
import css from './HeightLabVideoGrid.module.css'

interface VideoTemplate {
  title: string
  desc: string
  /** 封面（占位期用 CSS 渐变 + 主字；接入模板库后换成真实封面/首帧 + 时长角标）。 */
  cover: string
  coverLabel: string
  /** 占位卡显示「即将上线」角标且不可点击。 */
  comingSoon?: boolean
  category: string
}

const CATEGORIES = ['精选', '带货视频', '产品展示', '品牌广告', 'MV'] as const

const VIDEO_TEMPLATES: VideoTemplate[] = [
  {
    title: '视频复刻 · 爆款同款',
    desc: '上传一条爆款视频，AI 拆解分镜与节奏，一键生成同款带货视频',
    cover: 'linear-gradient(135deg, #1f2937, #111827 55%, #4b5563)',
    coverLabel: '视频复刻',
    category: '精选',
  },
  {
    title: '好物带货短视频',
    desc: '卖点口播 + 场景演示的成熟带货结构，替换产品即可出片',
    cover: 'linear-gradient(135deg, #f97316, #c2410c)',
    coverLabel: '好物带货',
    comingSoon: true,
    category: '精选',
  },
  {
    title: '产品 3D 展示',
    desc: '旋转展示与光影质感的产品短片，突出外观与工艺细节',
    cover: 'linear-gradient(135deg, #0ea5e9, #6366f1)',
    coverLabel: '3D 展示',
    comingSoon: true,
    category: '产品展示',
  },
  {
    title: '品牌广告大片',
    desc: '电影感调色与节奏的品牌宣传模板，适合新品发布与 campaigns',
    cover: 'linear-gradient(135deg, #111827, #7c3aed)',
    coverLabel: '品牌大片',
    comingSoon: true,
    category: '品牌广告',
  },
  {
    title: '爆款 MV 风',
    desc: '卡点剪辑 + 潮流贴纸的音乐短片模板，带动直播间与短视频氛围',
    cover: 'linear-gradient(135deg, #ec4899, #8b5cf6)',
    coverLabel: '爆款 MV',
    comingSoon: true,
    category: 'MV',
  },
  {
    title: '开箱测评',
    desc: '开箱 + 评测 + 总结的标准结构，建立真实可信的种草感',
    cover: 'linear-gradient(135deg, #059669, #34d399)',
    coverLabel: '开箱测评',
    comingSoon: true,
    category: '精选',
  },
]

export function HeightLabVideoGrid() {
  const [category, setCategory] = useState<string>('精选')
  // V31f 运行时探针：挂载 1s 后上报容器与内容的真实几何尺寸到宿主日志
  //（~/.heightlab/logs/dsh-host.log，grep hlVideoGrid），用于远程定位
  // 「模板区不可见/被裁」类问题；确认长期稳定后可撤除。
  const rootRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const el = rootRef.current
      if (el === null) return
      const parent = el.parentElement
      const rect = el.getBoundingClientRect()
      try {
        void fetch('/hl/boot-marker', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            hlVideoGrid: true,
            seatHeight: parent?.getBoundingClientRect().height ?? null,
            seatTop: parent?.getBoundingClientRect().top ?? null,
            gridHeight: rect.height,
            gridTop: rect.top,
            innerHeight: window.innerHeight,
            cards: el.querySelectorAll('button').length,
          }),
        }).catch(() => { /* 非致命 */ })
      } catch { /* 非致命 */ }
    }, 1000)
    return () => { window.clearTimeout(timer) }
  }, [])
  const visible = category === '精选'
    ? VIDEO_TEMPLATES
    : VIDEO_TEMPLATES.filter(item => item.category === category)
  return (
    <div className={css.grid} ref={rootRef}>
      <div className={css.categories}>
        {CATEGORIES.map(item => (
          <button
            key={item}
            type="button"
            className={`${css.chip} ${category === item ? css.chipActive : ''}`}
            onClick={() => { setCategory(item) }}
          >
            {item}
          </button>
        ))}
      </div>
      <div className={css.cards}>
        {visible.length === 0 ? (
          <div className={css.empty}>该分类的模板即将上线，敬请期待</div>
        ) : (
          visible.map(item => (
            <button
              key={item.title}
              type="button"
              className={`${css.card} ${item.comingSoon === true ? css.cardSoon : ''}`}
              onClick={() => {
                // 占位卡不可点；真实能力卡等价一级页「爆款复刻」——
                // 新建复刻会话并展开创作工作台（与视频创作一级页同一动作）。
                if (item.comingSoon === true) return
                window.dispatchEvent(new CustomEvent('hl:start-replication'))
              }}
            >
              <span className={css.cover} style={{ background: item.cover }}>
                <span className={css.coverLabel}>{item.coverLabel}</span>
                {item.comingSoon === true && <span className={css.badge}>即将上线</span>}
              </span>
              <span className={css.title}>{item.title}</span>
              <span className={css.desc}>{item.desc}</span>
              <span className={css.author}>@HeightLab 官方</span>
            </button>
          ))
        )}
      </div>
    </div>
  )
}

/**
 * HeightLab V37：首页视频模板网格（对标 MiniMax Design 创作灵感区的
 * 卡片语言：大封面 + 标题 + 一句描述）。
 *
 * V37（2026-09-23）：模板目录全量接入云镜官方 skill 目录（用户自有服务
 * yunj.video，120 条 / 7 分类，见 HeightLabVideoCatalog.ts）。首卡保留
 * 「视频复刻 · 爆款同款」功能入口（等价一级页爆款复刻，点击进入复刻
 * 工作台）；其余为云镜真实模板卡，点击同样进入复刻工作台并携带模板名。
 * 封面热链云镜 CDN（webp，<img loading=lazy> 懒加载）。
 */
import { useEffect, useRef, useState } from 'react'
import css from './HeightLabVideoGrid.module.css'
import { VIDEO_CATALOG, VIDEO_CATEGORIES } from './HeightLabVideoCatalog.ts'
import { SKILL_BODIES } from './HeightLabSkillBodies.ts'

/** 精选位数量（云镜 order 最前的 N 个 + 首位功能卡）。 */
const FEATURED_COUNT = 12

export function HeightLabVideoGrid() {
  const [category, setCategory] = useState<string>('精选')
  // V38：提示词预览——模板卡「查看提示词」打开对应 skill 正文弹层。
  const [preview, setPreview] = useState<{ name: string; skill: string } | null>(null)
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

  const featured = VIDEO_CATALOG.slice(0, FEATURED_COUNT)
  const visible = category === '精选'
    ? featured
    : VIDEO_CATALOG.filter(item => item.category === category)

  const renderCatalogCard = (item: typeof VIDEO_CATALOG[number]) => (
    <button
      key={item.id}
      type="button"
      className={css.card}
      onClick={() => {
        // 云镜真实模板卡：进入复刻工作台并携带模板名（工作台侧可预填）。
        window.dispatchEvent(new CustomEvent('hl:open-template-console', { detail: { template: item.name, skill: item.skill } }))
      }}
    >
      <span className={css.cover}>
        <img className={css.coverImg} src={item.cover} alt="" loading="lazy" draggable={false}
          style={{ objectPosition: item.pos }} />
        {/* V32 hover 覆盖层（对标页悬停态）：封面压暗 + 居中播放点 + 胶囊。 */}
        <span className={css.hoverShade} aria-hidden>
          <span className={css.playDot}>
            <span className={css.playTri} />
          </span>
          {/* V38：胶囊可点——打开该模板对应 skill 正文预览（阻止冒泡，
              不触发整卡进入工作台）。 */}
          <span
            className={css.promptPill}
            role="button"
            onClick={e => {
              e.stopPropagation()
              setPreview({ name: item.name, skill: item.skill })
            }}
          >
            查看提示词
          </span>
        </span>
      </span>
      <span className={css.title}>{item.name}</span>
      <span className={css.desc}>{item.tagline}</span>
    </button>
  )

  return (
    <div className={css.seat} ref={rootRef}>
      <div className={css.grid}>
        <div className={css.categories}>
          {['精选', ...VIDEO_CATEGORIES].map(item => (
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
          {category === '精选' ? (
            featured.map(renderCatalogCard)
          ) : visible.length === 0 ? (
            <div className={css.empty}>该分类的模板即将上线，敬请期待</div>
          ) : (
            visible.map(renderCatalogCard)
          )}
        </div>
      </div>
      {/* V38：提示词预览弹层——完整 skill 正文 + 一键使用此模板。 */}
      {preview !== null && (
        <div className={css.previewBackdrop} onClick={() => setPreview(null)}>
          <div className={css.previewModal} onClick={e => e.stopPropagation()}>
            <div className={css.previewHead}>
              <div>
                <div className={css.previewTitle}>{preview.name}</div>
                <div className={css.previewSkill}>{SKILL_BODIES[preview.skill]?.title ?? preview.skill}</div>
              </div>
              <button type="button" className={css.previewClose} aria-label="关闭"
                onClick={() => setPreview(null)}>×</button>
            </div>
            <pre className={css.previewBody}>{SKILL_BODIES[preview.skill]?.body ?? '该模板的提示词整理中。'}</pre>
            <div className={css.previewActions}>
              <button type="button" className={css.previewUse}
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('hl:start-replication', { detail: { template: preview.name } }))
                  setPreview(null)
                }}>使用此模板</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

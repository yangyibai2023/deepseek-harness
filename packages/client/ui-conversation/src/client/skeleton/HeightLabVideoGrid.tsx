/**
 * HeightLab V37：首页视频模板网格（对标 MiniMax Design 创作灵感区的
 * 卡片语言：大封面 + 标题 + 一句描述）。
 *
 * V37（2026-09-23）：模板目录全量接入HEIGHTLAB官方 skill 目录（用户自有服务
 * yunj.video，120 条 / 7 分类，见 HeightLabVideoCatalog.ts）。首卡保留
 * 「视频复刻 · 爆款同款」功能入口（等价一级页爆款复刻，点击进入复刻
 * 工作台）；其余为HEIGHTLAB真实模板卡，点击同样进入复刻工作台并携带模板名。
 * 封面热链HEIGHTLAB CDN（webp，<img loading=lazy> 懒加载）。
 */
import { useEffect, useRef, useState } from 'react'
import css from './HeightLabVideoGrid.module.css'
import { VIDEO_CATALOG, VIDEO_CATEGORIES } from './HeightLabVideoCatalog.ts'
import { SKILL_BODIES } from './HeightLabSkillBodies.ts'

/**
 * 「精选」= 固定白名单，**按用户指定顺序**排。
 *
 * 2026-10-21 用户拍板：精选一共两排（4 列 × 2 行 = 8 个），全部放视频创作相关，
 * 且顺序按他给的编号 1、04、05、09、12、37、32、31。
 *
 * 为什么不用「order 最前的 N 个」：那样一旦上游目录调整 order，精选就会漂移；
 * 白名单把选择权显式钉在代码里，目录增删不影响这两排。
 */
const FEATURED_IDS: ReadonlyArray<string> = [
  'skill-test-01-gongdou-daihuo-duanju',        // 1  宫斗带货短剧
  'skill-test-04-zhongwen-shuangju-daihuo',     // 04 中文爽剧带货
  'skill-test-05-shenghuo-weijuchang',          // 05 生活微剧场
  'skill-test-09-maican-zhuliren-shuaimai',     // 09 卖惨主理人亏本甩卖
  'skill-test-12-yongqian-yonghou-fanzhuan',    // 12 用前用后神反转
  'skill-test-37-shangchao-shipai-huojia-qiangjing', // 37 商超实拍货架抢镜
  'skill-test-32-quanpinlei-wanneng-daihuo',    // 32 全品类万能带货
  'skill-test-31-quanneng-zhongcao-nvzhubo',    // 31 全能种草女主播
]

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

  // 白名单顺序优先；目录里若缺某条（上游改名/下线），跳过而不是渲染空卡。
  const featured = FEATURED_IDS
    .map(id => VIDEO_CATALOG.find(item => item.id === id))
    .filter((item): item is typeof VIDEO_CATALOG[number] => item !== undefined)
  const visible = category === '精选'
    ? featured
    : VIDEO_CATALOG.filter(item => item.category === category)

  /**
   * 「聊天」：把模板写进上方输入框，形态与技能中心的「使用」一致——
   * 让 Agent 去读该模板的 skill 全文并按流程执行。用 hl:fill-draft
   * 注入草稿（InputBar 已监听），用户可再补充需求后自行发送。
   */
  const useTemplateInChat = (item: typeof VIDEO_CATALOG[number]): void => {
    // 芯片只显示模板名；prompt 是发送时替换进去的完整指令（用户不可见）。
    const prompt = `请使用创作模板「${item.name}」`
      + `（skill：${item.skill}，可读取 ~/.heightlab/yunj-skills/${item.skill}/SKILL.md 全文），`
      + '严格按该模板的工作流与产出规范执行我的任务：\n'
    window.dispatchEvent(new CustomEvent('hl:insert-template-chip', {
      detail: { label: item.name, prompt, skill: item.skill },
    }))
  }

  /** 「面板」：原整卡点击行为——右侧打开该模板的专属操作面板。 */
  const openTemplatePanel = (item: typeof VIDEO_CATALOG[number]): void => {
    try {
      sessionStorage.setItem('hl-template-console', JSON.stringify({ id: item.id, template: item.name, skill: item.skill }))
    } catch { /* 非致命 */ }
    window.dispatchEvent(new CustomEvent('hl:open-template-console', { detail: { id: item.id, template: item.name, skill: item.skill } }))
  }

  const renderCatalogCard = (item: typeof VIDEO_CATALOG[number]) => (
    <button
      key={item.id}
      type="button"
      className={css.card}
      onClick={() => { openTemplatePanel(item) }}
    >
      <span className={css.cover}>
        <img className={css.coverImg} src={item.cover} alt="" loading="lazy" draggable={false}
          style={{ objectPosition: item.pos }} />
        {/* 2026-10-21 用户拍板：hover 显示两个按钮
            · 「聊天」——把模板作为 skill 写进上方输入框（点发送即执行）
            · 「面板」——打开右侧该模板的操作面板（= 原整卡点击行为）
            文案压到两个字：卡片宽度有限，长文案会挤成一团。 */}
        <span className={css.hoverShade} aria-hidden>
          <span className={css.hoverActions}>
            <button
              type="button"
              className={css.promptPill}
              onClick={(e) => {
                e.stopPropagation()
                useTemplateInChat(item)
              }}
            >
              聊天
            </button>
            <button
              type="button"
              className={`${css.promptPill} ${css.promptPillPrimary}`}
              onClick={(e) => {
                e.stopPropagation()
                openTemplatePanel(item)
              }}
            >
              面板
            </button>
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

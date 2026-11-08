/**
 * HeightLab：创意灵感 / 自动化页面。
 *
 * 由 ConversationRoot 直接渲染在主内容区（替换聊天页，类似 Z Code 的
 * 页面跳转，侧边栏保留）：标题 + 无边框 × 关闭图标；「创意灵感」按分类
 * 展示输入框下方的模板卡片（推荐/文案/图片/视频/办公），整页可滚动。
 */

import { useEffect, useId, useState, type CSSProperties, type ReactNode } from 'react'
import { TEMPLATE_CARDS, TEMPLATE_ORDER, loadTemplateCatalog, templateThumb, type Recommendation, type TemplateCategory } from './HeightLabTemplates.ts'
import { VIDEO_CATALOG } from './HeightLabVideoCatalog.ts'
import { TemplatePreview } from './TemplatePreview.tsx'
import { HeightLabLibraryPage } from './HeightLabLibraryPage.tsx'
import { HeightLabFilmStudio } from './HeightLabFilmStudio.tsx'
import css from './ConversationRoot.module.css'

/* O44：'automation' 是死值（探索证实无人派发、白名单不收）——从联合类型删除。 */
export type HubPage = 'inspiration' | 'library' | 'video-studio' | 'skill-hub' | 'film-studio' | 'lab'

/** HeightLab V24b：视频创作一级页的 8 个模块卡片（第一排流量转化/第二排人设内容）。
 * 0.5.7 模块创作台（2026-11-08 用户拍板「一个功能驾驭多个模板」）：8 模块全部
 * 上线——爆款复刻走专属 FY1 链（hl:start-replication），其余七模块走
 * hl:start-module（新建会话 + 右栏先选模板再进模板工作台）。 */
/* 图标（2026-11-08 第三次校准，用户指出「原生是彩色风格，绝不是线条 SVG」）：
 * 照搬原生 `ui-primitives/plugin-artwork.tsx` 的**固定调色板渐变**体系——
 * 36×36 viewBox、自带品牌色（蓝/紫/绿/青/橙渐变，不跟 currentColor）、
 * useId 生成唯一渐变 id（同一卡片重复渲染不会串色）。这是 DSH 插件页
 * 「子智能体 / Agent 循环 / 网页搜索」那套图标的同款语言。 */
const useArtworkId = (): string => `hl_hub_art_${useId().replaceAll(':', '')}`

const artSvg = { viewBox: '0 0 36 36', fill: 'none', xmlns: 'http://www.w3.org/2000/svg' } as const

/** 爆款复刻：火焰（暖橙→玫红渐变）。 */
const ArtFlame = (): ReactNode => {
  const uid = useArtworkId()
  return (
    <svg {...artSvg} width={36} height={36} aria-hidden="true">
      <path d="M18 5.5c4.4 5.5 8.6 8.8 8.6 15a8.6 8.6 0 1 1-17.2 0c0-3.3 1.7-5.5 3.3-7.7 1.1 3.3 2.2 4.4 3.8 5C16 13.8 16.5 9.5 18 5.5Z" fill={`url(#${uid}a)`} />
      <path d="M18 27.5a4.4 4.4 0 0 0 4.4-4.4c0-2.2-1.6-3.8-4.4-6.6-2.8 2.8-4.4 4.4-4.4 6.6a4.4 4.4 0 0 0 4.4 4.4Z" fill="#FFD9A0" fillOpacity="0.9" />
      <defs>
        <linearGradient id={`${uid}a`} x1="26.6" y1="5.5" x2="11.8" y2="28.5" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFB020" />
          <stop offset="0.55" stopColor="#FF6B4A" />
          <stop offset="1" stopColor="#E23AA0" />
        </linearGradient>
      </defs>
    </svg>
  )
}

/** 达人带货：购物袋（紫→蓝渐变）。 */
const ArtBag = (): ReactNode => {
  const uid = useArtworkId()
  return (
    <svg {...artSvg} width={36} height={36} aria-hidden="true">
      <path d="M7 12.5h22L27 30H9L7 12.5Z" fill={`url(#${uid}a)`} fillOpacity="0.85" />
      <path d="M13.2 13V9.6a4.8 4.8 0 0 1 9.6 0V13" stroke="#7B5BF5" strokeWidth="2.6" strokeLinecap="round" />
      <defs>
        <linearGradient id={`${uid}a`} x1="18" y1="12.5" x2="18" y2="30" gradientUnits="userSpaceOnUse">
          <stop stopColor="#A797FC" />
          <stop offset="1" stopColor="#4561EE" />
        </linearGradient>
      </defs>
    </svg>
  )
}

/** 产品评测：放大镜（青→蓝渐变环）。 */
const ArtSearch = (): ReactNode => {
  const uid = useArtworkId()
  return (
    <svg {...artSvg} width={36} height={36} aria-hidden="true">
      <circle cx="16" cy="16" r="8.2" stroke={`url(#${uid}a)`} strokeWidth="3.4" />
      <path d="m22.2 22.2 6.6 6.6" stroke="#3B82F6" strokeWidth="3.4" strokeLinecap="round" />
      <defs>
        <linearGradient id={`${uid}a`} x1="8" y1="8" x2="24" y2="24" gradientUnits="userSpaceOnUse">
          <stop stopColor="#41E1AC" />
          <stop offset="1" stopColor="#658EFF" />
        </linearGradient>
      </defs>
    </svg>
  )
}

/** 直播切片：播放器（绿→青渐变）。 */
const ArtLive = (): ReactNode => {
  const uid = useArtworkId()
  return (
    <svg {...artSvg} width={36} height={36} aria-hidden="true">
      <rect x="5.5" y="10" width="25" height="17" rx="4" fill={`url(#${uid}a)`} fillOpacity="0.9" />
      <path d="M15.5 16.4 22 18.5l-6.5 2.1v-4.2Z" fill="#FFFFFF" />
      <defs>
        <linearGradient id={`${uid}a`} x1="5.5" y1="10" x2="30.5" y2="27" gradientUnits="userSpaceOnUse">
          <stop stopColor="#45E7A4" />
          <stop offset="1" stopColor="#05909D" />
        </linearGradient>
      </defs>
    </svg>
  )
}

/** IP 口播：麦克风（粉→紫渐变）。 */
const ArtMic = (): ReactNode => {
  const uid = useArtworkId()
  return (
    <svg {...artSvg} width={36} height={36} aria-hidden="true">
      <rect x="14" y="5.5" width="8" height="16" rx="4" fill={`url(#${uid}a)`} />
      <path d="M9.5 19a8.5 8.5 0 0 0 17 0" stroke="#D946A8" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M18 27.5v3.5M13.5 31h9" stroke="#B14BD8" strokeWidth="2.6" strokeLinecap="round" />
      <defs>
        <linearGradient id={`${uid}a`} x1="18" y1="5.5" x2="18" y2="21.5" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FF8FC7" />
          <stop offset="1" stopColor="#B14BD8" />
        </linearGradient>
      </defs>
    </svg>
  )
}

/** 知识讲解：书本（蓝→青渐变）。 */
const ArtBook = (): ReactNode => {
  const uid = useArtworkId()
  return (
    <svg {...artSvg} width={36} height={36} aria-hidden="true">
      <path d="M6 8.5h8.5a4 4 0 0 1 4 4v17a3.2 3.2 0 0 0-3.2-3.2H6V8.5Z" fill={`url(#${uid}a)`} fillOpacity="0.9" />
      <path d="M30 8.5h-8.5a4 4 0 0 0-4 4v17a3.2 3.2 0 0 1 3.2-3.2H30V8.5Z" fill={`url(#${uid}b)`} fillOpacity="0.9" />
      <defs>
        <linearGradient id={`${uid}a`} x1="6" y1="8.5" x2="18.5" y2="29.5" gradientUnits="userSpaceOnUse">
          <stop stopColor="#69B9FF" />
          <stop offset="1" stopColor="#324DE2" />
        </linearGradient>
        <linearGradient id={`${uid}b`} x1="30" y1="8.5" x2="17.5" y2="29.5" gradientUnits="userSpaceOnUse">
          <stop stopColor="#54ECE7" />
          <stop offset="1" stopColor="#4B8CF7" />
        </linearGradient>
      </defs>
    </svg>
  )
}

/** 情景短剧：胶片（橙→红渐变）。 */
const ArtFilm = (): ReactNode => {
  const uid = useArtworkId()
  return (
    <svg {...artSvg} width={36} height={36} aria-hidden="true">
      <rect x="4.5" y="9" width="27" height="18" rx="3.4" fill={`url(#${uid}a)`} fillOpacity="0.9" />
      <path d="M11 9v18M25 9v18" stroke="#FFFFFF" strokeOpacity="0.85" strokeWidth="2.2" />
      <path d="M4.5 15.5h27M4.5 20.5h27" stroke="#FFFFFF" strokeOpacity="0.6" strokeWidth="1.6" />
      <defs>
        <linearGradient id={`${uid}a`} x1="4.5" y1="9" x2="31.5" y2="27" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFC24A" />
          <stop offset="1" stopColor="#F0503C" />
        </linearGradient>
      </defs>
    </svg>
  )
}

/** 访谈视频：双对话气泡（紫→粉渐变）。 */
const ArtChat = (): ReactNode => {
  const uid = useArtworkId()
  return (
    <svg {...artSvg} width={36} height={36} aria-hidden="true">
      <path d="M7.5 9.5h12a3.6 3.6 0 0 1 3.6 3.6v6.4a3.6 3.6 0 0 1-3.6 3.6H12l-4.5 3.6V23a3.6 3.6 0 0 1-3.6-3.6v-6.4A3.6 3.6 0 0 1 7.5 9.5Z" fill={`url(#${uid}a)`} fillOpacity="0.92" />
      <path d="M25 13.5h3.2a3.6 3.6 0 0 1 3.6 3.6v5.2a3.6 3.6 0 0 1-3.6 3.6h-.6v2.8l-3.6-2.8h-1.4" fill={`url(#${uid}b)`} fillOpacity="0.75" />
      <defs>
        <linearGradient id={`${uid}a`} x1="7.5" y1="9.5" x2="23.1" y2="23.1" gradientUnits="userSpaceOnUse">
          <stop stopColor="#A797FC" />
          <stop offset="1" stopColor="#4561EE" />
        </linearGradient>
        <linearGradient id={`${uid}b`} x1="25" y1="13.5" x2="33" y2="24" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FF8FC7" />
          <stop offset="1" stopColor="#A23AE7" />
        </linearGradient>
      </defs>
    </svg>
  )
}

type StudioCard = { name: string; desc: string; svg: ReactNode; moduleId: string }
const STUDIO_CARDS: StudioCard[] = [
  { name: '爆款复刻', desc: '上传对标视频，AI 拆脚本、分镜与钩子，换品换人换文案重生成', svg: <ArtFlame />, moduleId: 'replication' },
  { name: '达人带货', desc: '达人形象 + 商品图，按卖点直接生成种草带货视频', svg: <ArtBag />, moduleId: 'influencer-selling' },
  { name: '产品评测', desc: '开箱、对比、试用与参数解读的真实体验向测评', svg: <ArtSearch />, moduleId: 'product-review' },
  { name: '直播切片', desc: '直播回放自动切金句高光，加字幕标题二次创作', svg: <ArtLive />, moduleId: 'live-clip' },
  { name: 'IP 口播', desc: '固定形象 + 文案生成单人主讲，人设统一、不强制挂品', svg: <ArtMic />, moduleId: 'ip-talk' },
  { name: '知识讲解', desc: '文档知识点转图解讲解、配音与字幕的教程科普', svg: <ArtBook />, moduleId: 'knowledge-tutorial' },
  { name: '情景短剧', desc: '从梗概到分镜的剧情带货与品牌短剧', svg: <ArtFilm />, moduleId: 'drama-short' },
  { name: '访谈视频', desc: '双人对谈与圆桌采访，提纲或录音直接转视频', svg: <ArtChat />, moduleId: 'interview-video' },
]

/* 模块 -> 模板目录条目 id 集（2026-11-07 八模块↔120 条目录映射调研落定，家族
 * 依据见 docs/70-PLANS；同族跨模块允许重叠——主播系同时服务带货与口播）。
 * 点击时按 id 从 VIDEO_CATALOG 取全条目（含封面/skill）传给控制台。 */
const MODULE_TEMPLATE_IDS: Record<string, readonly string[]> = {
  // 达人带货：主播系 + 服装博主/试穿系 + 安利/种草系 + 主理人系
  'influencer-selling': [
    'yj-320-adaptive-scene-host', 'yj-320-car-host', 'yj-320-host-product-showcase', 'yj-320-fashion-store-presenter',
    'yj-320-female-fashion-blogger', 'yj-320-male-fashion-blogger', 'yj-320-male-fashion-first-frame',
    'yj-320-fashion-beat-change', 'yj-320-garment-product-only', 'skill-test-21-nvzhuang-jiefang-shichuan',
    'skill-test-19-nvzhuang-dian-shangshen', 'skill-test-18-nvzhuang-bozhu-chuanda', 'skill-test-20-nanzhuang-xingnan-anli',
    'skill-test-22-chaoliu-nanzhuang-duijing', 'skill-test-31-quanneng-zhongcao-nvzhubo', 'skill-test-14-zhenren-koubei-anli',
    'skill-test-16-jietou-luren-anli', 'skill-test-39-chenei-suishoupai-tongqin-anli', 'skill-test-32-quanpinlei-wanneng-daihuo',
    'yj-320-brand-craftsman', 'yj-320-export-factory-owner', 'yj-320-warehouse-owner', 'yj-320-struggling-creator',
    'yj-320-craftsman-live-clip', 'skill-test-23-pinpai-zhuliren-jiangxin', 'skill-test-09-maican-zhuliren-shuaimai',
  ],
  // 产品评测：开箱/对比实测/横评/痛点/用前用后/证言/探店
  'product-review': [
    'yj-320-unboxing-review', 'skill-test-10-zhenshi-kaixiang-ceping', 'yj-320-comparison-test',
    'skill-test-11-yinghe-hengping-shice', 'yj-320-pain-unbox-review', 'yj-320-pain-first-five-shot',
    'skill-test-35-tongdian-chaixiang-bidan-sanlian', 'skill-test-34-tongdian-baoji-yizhao',
    'skill-test-12-yongqian-yonghou-fanzhuan', 'yj-320-before-after', 'yj-320-testimonial',
    'yj-320-store-reviewer', 'skill-test-03-tandian-daka-zhongcao',
  ],
  // 直播切片：原生/主理人/高光逼单
  'live-clip': [
    'yj-320-live-clip', 'yj-320-craftsman-live-clip', 'skill-test-42-zhibo-qiepian-gaoguang-bidan',
  ],
  // IP 口播：口播系 + 一镜到底 + 主播系（与带货主播系有意重叠）
  'ip-talk': [
    'skill-test-38-jimeng-zixuan-changjing-koubo', 'skill-test-40-jianshenfang-8miao-baofa-koubo',
    'yj-320-gym-one-shot', 'yj-320-warehouse-one-take', 'yj-320-adaptive-scene-host',
    'yj-320-host-product-showcase', 'yj-320-car-host', 'yj-320-fashion-store-presenter',
  ],
  // 知识讲解：沉浸式教程 ×2 + YJ-402 图解全家桶（图解=该模块的讲解载体）
  'knowledge-tutorial': [
    'yj-320-tutorial-howto', 'skill-test-17-chenjin-shoubashou-jiaocheng',
    'yj-402-attribute-guide', 'yj-402-benefits-infographic', 'yj-402-brand-closing-banner',
    'yj-402-components-structure', 'yj-402-feature-matrix', 'yj-402-how-to-use',
    'yj-402-lifestyle-scene', 'yj-402-materials-story', 'yj-402-multi-angle-showcase',
    'yj-402-packaging-detail', 'yj-402-routine-context', 'yj-402-white-background-main',
    'yj-402-wide-hero-banner',
  ],
  // 情景短剧：剧情/宫斗/爽剧/微剧场/冲突/抢购/货架
  'drama-short': [
    'yj-320-dramatic-short', 'yj-320-palace-drama', 'skill-test-01-gongdou-daihuo-duanju',
    'skill-test-04-zhongwen-shuangju-daihuo', 'skill-test-05-shenghuo-weijuchang',
    'skill-test-06-zhalie-chongtu-lanjie', 'yj-320-extreme-conflict', 'yj-320-crowd-rush',
    'yj-320-supermarket-rush', 'skill-test-07-chaoshi-hongqiang-jianlou',
    'skill-test-08-hongqiang-jiaqiang-bidan', 'skill-test-37-shangchao-shipai-huojia-qiangjing',
    'skill-test-25-lingshou-caopanshou-huojia',
  ],
  // 访谈视频：街访四条 + 评论区对话体（双人圆桌暂无直接模板，先以模板集上线）
  'interview-video': [
    'yj-320-street-interview', 'interview-dialogue-video', 'yj-320-fashion-street-interview',
    'skill-test-21-nvzhuang-jiefang-shichuan', 'yj-320-comment-reply', 'skill-test-15-pinglunqu-kaigang-huidui',
  ],
}

/* 2026-11-08（UI 统一·第二次校准，用户在浏览器实测原生「插件·技能」页后
 * 逐项量取**计算样式**，不再靠猜）：
 *
 *   页面 SECTION   padding 0 48px 48px      ← 左右 48px（此前 24-28 太少）
 *   标题区 HEADER  padding 28px 0 0         ← 上方 28px
 *   H1            20px / 500 / lh 28        ← 此前 17/700（过小过粗）
 *   描述          13px / lh 20 / #61666B    ← 与标题**分行**（不是同行！）
 *   分组标题 H3   14px / 500 / lh 22        ← 分组内标题
 *   卡片图标      49×49 / 圆角 16 / 0.5px 边框 rgba(0,0,0,.12)
 *                 / 内部矢量 SVG 36×36 / 线条色 #61666B（**不用 emoji**）
 *   卡片标题      14px / 500（与图标同一行，图标在左侧）
 *   卡片描述      13px / lh 20 / #61666B
 *
 * 关键结构差异（用户指出）：原生是「图标+文字**横向**排布」的行式卡片，
 * 不是我们之前的「图标在上、文字在下」的竖向大卡。副标题（一句话介绍）
 * 原生只出现在标题下方**独立一行**且仅部分页面有——本次保留但降为普通
 * 描述行，与标题分行。
 * 颜色一律 --dsw-alias-* token（暗色跟随）。 */

/* ⚠️ 不能是 position:absolute + inset:0 —— 实测会锚到**视口**而不是内容区，
 * 标题从 x=48 起被左侧栏遮盖（用户实测「标题溢出屏幕」）。改为普通流式
 * 100%×100% 容器，跟随父级（hubOverlay 内容区）自然定位。 */
const hubRootStyle: CSSProperties = {
  width: '100%',
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  background: 'var(--dsw-alias-surface-primary, #fff)',
  overflow: 'hidden',
}

/* 原生 .page：gap 32 / padding `0 clamp(24px,4vw,48px) 48px`（**响应式**内距，
 * 不是固定 48）/ overflow auto；.pageHead 自带 padding-top 28。
 * 我们的 header 与内容分属两个容器，故 header 承担 top 28 + 内距，body 承担
 * 剩余内距 + 48px 底部。 */
const hubPageStyle: CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
  gap: 32,
  /* 2026-11-08（用户实测「标题介绍与第一组挤在一块」）：header 与本容器是
   * 兄弟节点，本容器若无 paddingTop，标题副标与「对标复刻」就贴上了——原生
   * .page 的 gap 32 正好承担这个间距（副标底→组标题顶 = 32）。 */
  padding: '12px clamp(24px, 4vw, 48px) 48px',
  boxSizing: 'border-box',
}

/* ⚠️ 必须带左右内边距！此前只有 paddingTop:28（漏了左右 48），标题直接贴
 * 容器左缘被裁——用户连续两次截图指出「标题溢出」。原生 pageHead 是放在
 * `padding: 0 48px 48px` 的 section 内部的，左右内距由父级提供；我们的
 * header 在 page 容器**之外**，必须自带同样的左右内距。 */
const hubHeaderStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  /* 2026-11-08（用户实测「标题与 tab 行挤在一块」）：header 下补 20px 呼吸
   * 间距——资产中心的「素材管理/知识库」tab 行不再贴标题；视频创作页由
   * hubPageStyle 的 paddingTop 12 补足，副标→首组仍 = 32（与原生一致）。 */
  padding: '28px clamp(24px, 4vw, 48px) 20px',
  maxWidth: 1056, /* 960 内容盒 + 左右 48 内距（clamp 上限） */
  boxSizing: 'border-box',
  flex: 'none',
}

const hubTitleStyle: CSSProperties = {
  fontSize: 20,
  fontWeight: 500,
  lineHeight: '28px',
  margin: 0,
  color: 'var(--dsw-alias-label-primary)',
}

const hubSubtitleStyle: CSSProperties = {
  fontSize: 13,
  lineHeight: '20px',
  color: 'var(--dsw-alias-label-secondary)',
  margin: 0,
}

/* 2026-11-08（第四次校准）：原生插件页是**单列垂直列表**（实测 UL:
 * flex column / gap 2px / 每行 65px），不是多列网格。用户质问「布局对吗」
 * ——这里就是没对的地方。列表 maxWidth 与 header 内容盒一致（960）。 */
/* 2026-11-08（美观版分组，用户拍板「不只是对齐要好看」）：8 模块天然两族——
 * 对标复刻 / 流量转化（带货评测短剧切片）/ 人设与知识（口播讲解访谈）。
 * 照原生 .groupHead/.groupTitle（14px/500/22px）加分组标题，与插件页的
 * 「内置插件配置/实验性插件」同一语言。 */
const STUDIO_GROUPS: ReadonlyArray<{ title: string; modules: readonly string[] }> = [
  { title: '对标复刻', modules: ['replication'] },
  { title: '流量转化', modules: ['influencer-selling', 'product-review', 'drama-short', 'live-clip'] },
  { title: '人设与知识', modules: ['ip-talk', 'knowledge-tutorial', 'interview-video'] },
]

const groupTitleStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 500,
  lineHeight: '22px',
  margin: 0,
  color: 'var(--dsw-alias-label-primary)',
}

const studioGridStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  maxWidth: 960,
}

/* 原生卡片行（实测 PluginManagerPage.module.css）：
 *   .card      margin 0 -8px / radius xl（hover 面超出内容对齐线 8px）
 *   .cardHead  flex row / gap 14 / padding 8px
 *   .cardMain  flex column / gap 4
 *   .cardTitle 14/20/500 单行截断
 *   .cardDesc  13/18 tertiary 单行截断 */
const studioCardStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 14,
  padding: 8,
  margin: '0 -8px',
  border: 'none',
  borderRadius: 'var(--dsw-radius-xl, 20px)',
  background: 'transparent',
  textAlign: 'left',
  boxSizing: 'border-box',
  cursor: 'pointer',
}

const studioIconWrapStyle: CSSProperties = {
  flex: 'none',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 48,
  height: 48,
  borderRadius: 'var(--dsw-radius-lg, 12px)',
  border: '0.5px solid var(--dsw-alias-border-l3, rgba(0,0,0,0.12))',
  background: 'transparent',
  color: 'var(--dsw-alias-label-secondary, #61666B)',
  boxSizing: 'border-box',
}

const studioTextStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
}

const studioNameStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 500,
  lineHeight: '20px',
  color: 'var(--dsw-alias-label-primary)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const studioDescStyle: CSSProperties = {
  fontSize: 13,
  lineHeight: '18px',
  color: 'var(--dsw-alias-label-tertiary)',
  display: '-webkit-box',
  WebkitBoxOrient: 'vertical',
  WebkitLineClamp: 1,
  overflow: 'hidden',
}

/* ── O44 创作中心（2026-11-08 用户拍板）：video-studio 页 = 「创作中心」，
 * 内部四个分页（文案/图片/视频/文档）——**纯产出，策略不做 tab**（中美 16 家
 * 对标 0 先例，决策依据 docs/70-PLANS/2026-11-08-创作中心与策略分层调研.md）。
 * 本批启用 视频/图片/文案 三页；文档（PPT）等用户模板到位再启用，不渲染占位。 */
type CreationTabId = 'copy' | 'image' | 'video' | 'docs'
const VIDEO_TEMPLATE_TOTAL = Object.entries(MODULE_TEMPLATE_IDS)
  .filter(([key]) => key !== 'replication')
  .reduce((sum, [, ids]) => sum + ids.length, 0)

/* 2026-11-08 用户拍板：顺序=文案→图片→视频→文档；文档（PPT）tab 本批启用
 * 结构（模板等用户素材，进入后显示优雅空态——非模块空卡，是用户要求的
 * 结构先行）。 */
const CREATION_TABS: ReadonlyArray<{ id: CreationTabId; label: string; count: number; ready: boolean }> = [
  { id: 'copy', label: '文案', count: 8, ready: true },
  { id: 'image', label: '图片', count: 20, ready: true },
  { id: 'video', label: '视频', count: VIDEO_TEMPLATE_TOTAL, ready: true },
  { id: 'docs', label: 'PPT', count: 0, ready: true },
]

/* ── O44 实验室整页（2026-11-08 用户拍板弃 Dock 抽屉）：与插件·技能页完全
 * 同款布局（H1 + 分组标题 + 行式卡片 + 彩色渐变图标）。两区：
 *   生产工具 = 智能剪辑台（hub 页嵌套打开）/ 自动化任务（原生面板，事件桥）；
 *   实验功能 = 数字人/声音克隆/去水印等真实能力到位再加，不放占位空卡。 */
const LabIconEdit = (): ReactNode => {
  const uid = useArtworkId()
  return (
    <svg {...artSvg} width={36} height={36} aria-hidden="true">
      <rect x="4.5" y="9" width="27" height="18" rx="3.4" fill={`url(#${uid}a)`} fillOpacity="0.9" />
      <path d="m14 14 5 8M19 14l-5 8" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M24.5 11.5v13" stroke="#FFFFFF" strokeOpacity="0.7" strokeWidth="2.2" />
      <defs>
        <linearGradient id={`${uid}a`} x1="4.5" y1="9" x2="31.5" y2="27" gradientUnits="userSpaceOnUse">
          <stop stopColor="#A797FC" />
          <stop offset="1" stopColor="#4561EE" />
        </linearGradient>
      </defs>
    </svg>
  )
}

const LabIconAutomation = (): ReactNode => {
  const uid = useArtworkId()
  return (
    <svg {...artSvg} width={36} height={36} aria-hidden="true">
      <circle cx="18" cy="18" r="6" stroke={`url(#${uid}a)`} strokeWidth="3" />
      <path d="M18 6.5v4M18 25.5v4M6.5 18h4M25.5 18h4M10 10l2.8 2.8M23.2 23.2 26 26M26 10l-2.8 2.8M12.8 23.2 10 26" stroke="#41B9A6" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="18" cy="18" r="2.4" fill="#F0A03C" />
      <defs>
        <linearGradient id={`${uid}a`} x1="12" y1="12" x2="24" y2="24" gradientUnits="userSpaceOnUse">
          <stop stopColor="#54ECE7" />
          <stop offset="1" stopColor="#4B8CF7" />
        </linearGradient>
      </defs>
    </svg>
  )
}

/* 实验室条目两型：hub=嵌套打开另一 hub 页（剪辑台）/ panel=原生面板（自动化）。 */
const LAB_SECTIONS: ReadonlyArray<{
  title: string
  items: ReadonlyArray<{ key: string; name: string; desc: string; svg: ReactNode; target: { kind: 'hub'; page: string } | { kind: 'panel'; panelId: string } }>
}> = [
  {
    title: '生产工具',
    items: [
      { key: 'film-studio', name: '智能剪辑台', desc: '时间轴剪辑、字幕与多轨合成——影片级的精细剪辑工作台', svg: <LabIconEdit />, target: { kind: 'hub', page: 'film-studio' } },
      { key: 'schedules', name: '自动化任务', desc: '定时任务自动执行——到点自动跑内容生产与发布', svg: <LabIconAutomation />, target: { kind: 'panel', panelId: 'schedules' } },
    ],
  },
]

/* ── O44 美观统一（用户拍板）：图片/文案/文档与视频页同款交互——彩色
 * 渐变图标分类卡（点分类→新会话+右栏该组模板网格），行距与视频页完全
 * 统一（studioGridStyle + studioCardStyle）。 */
const ArtCopyStrategy = (): ReactNode => {
  const uid = useArtworkId()
  return (
    <svg {...artSvg} width={36} height={36} aria-hidden="true">
      <circle cx="18" cy="15" r="8" stroke={`url(#${uid}a)`} strokeWidth="2.6" />
      <path d="M18 7v16M10 15h16" stroke={`url(#${uid}a)`} strokeWidth="2" />
      <path d="m13 26 10 6-4.5-6" fill={`url(#${uid}b)`} />
      <defs>
        <linearGradient id={`${uid}a`} x1="10" y1="7" x2="26" y2="23" gradientUnits="userSpaceOnUse">
          <stop stopColor="#69B9FF" />
          <stop offset="1" stopColor="#324DE2" />
        </linearGradient>
        <linearGradient id={`${uid}b`} x1="13" y1="26" x2="23" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FF8FC7" />
          <stop offset="1" stopColor="#B14BD8" />
        </linearGradient>
      </defs>
    </svg>
  )
}

const ArtCopyCreative = (): ReactNode => {
  const uid = useArtworkId()
  return (
    <svg {...artSvg} width={36} height={36} aria-hidden="true">
      <path d="M18 4.5a9.5 9.5 0 0 1 6 16.9c-1.2 1-2 2.2-2 3.6h-8c0-1.4-.8-2.6-2-3.6A9.5 9.5 0 0 1 18 4.5Z" fill={`url(#${uid}a)`} fillOpacity="0.9" />
      <path d="M14.5 28h7M15.5 31h5" stroke="#B14BD8" strokeWidth="2.2" strokeLinecap="round" />
      <path d="m18 9 1.4 3.2 3.4.3-2.6 2.2.8 3.3-3-1.8-3 1.8.8-3.3-2.6-2.2 3.4-.3L18 9Z" fill="#FFF3C4" />
      <defs>
        <linearGradient id={`${uid}a`} x1="8.5" y1="4.5" x2="24" y2="25" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFC24A" />
          <stop offset="1" stopColor="#F0503C" />
        </linearGradient>
      </defs>
    </svg>
  )
}

const ArtCopyProduct = (): ReactNode => {
  const uid = useArtworkId()
  return (
    <svg {...artSvg} width={36} height={36} aria-hidden="true">
      <rect x="6" y="7" width="24" height="22" rx="3" fill={`url(#${uid}a)`} fillOpacity="0.9" />
      <path d="M10 13h10M10 18h16M10 23h13" stroke="#FFFFFF" strokeOpacity="0.85" strokeWidth="2" strokeLinecap="round" />
      <defs>
        <linearGradient id={`${uid}a`} x1="6" y1="7" x2="30" y2="29" gradientUnits="userSpaceOnUse">
          <stop stopColor="#45E7A4" />
          <stop offset="1" stopColor="#0E9888" />
        </linearGradient>
      </defs>
    </svg>
  )
}

const ArtImageEdit = (): ReactNode => {
  const uid = useArtworkId()
  return (
    <svg {...artSvg} width={36} height={36} aria-hidden="true">
      <rect x="4.5" y="8" width="27" height="20" rx="3" stroke={`url(#${uid}a)`} strokeWidth="2.6" />
      <circle cx="13" cy="15" r="2.6" fill="#FFC24A" />
      <path d="m8 24 7-6 5 4 4-3.5 6.5 5.5" stroke="#658EFF" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <defs>
        <linearGradient id={`${uid}a`} x1="4.5" y1="8" x2="31.5" y2="28" gradientUnits="userSpaceOnUse">
          <stop stopColor="#41E1AC" />
          <stop offset="1" stopColor="#658EFF" />
        </linearGradient>
      </defs>
    </svg>
  )
}

const ArtImageInfographic = (): ReactNode => {
  const uid = useArtworkId()
  return (
    <svg {...artSvg} width={36} height={36} aria-hidden="true">
      <rect x="6" y="6" width="24" height="24" rx="3.4" fill={`url(#${uid}a)`} fillOpacity="0.9" />
      <path d="M11 24v-6M17 24v-10M23 24v-7" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" />
      <defs>
        <linearGradient id={`${uid}a`} x1="6" y1="6" x2="30" y2="30" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FF8FC7" />
          <stop offset="1" stopColor="#A23AE7" />
        </linearGradient>
      </defs>
    </svg>
  )
}

const ArtDocsPpt = (): ReactNode => {
  const uid = useArtworkId()
  return (
    <svg {...artSvg} width={36} height={36} aria-hidden="true">
      <rect x="4.5" y="8" width="27" height="17" rx="3" stroke={`url(#${uid}a)`} strokeWidth="2.6" />
      <path d="M18 25v4M13 29h10" stroke="#A23AE7" strokeWidth="2.4" strokeLinecap="round" />
      <path d="m14 13 8 3.5-8 3.5v-7Z" fill={`url(#${uid}b)`} />
      <defs>
        <linearGradient id={`${uid}a`} x1="4.5" y1="8" x2="31.5" y2="25" gradientUnits="userSpaceOnUse">
          <stop stopColor="#A797FC" />
          <stop offset="1" stopColor="#E23AA0" />
        </linearGradient>
        <linearGradient id={`${uid}b`} x1="14" y1="13" x2="22" y2="20" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFC24A" />
          <stop offset="1" stopColor="#F0503C" />
        </linearGradient>
      </defs>
    </svg>
  )
}

/* 分类卡定义（图片/文案/文档）：点分类卡 → hl:start-module（新会话 +
 * 右栏该组模板网格）。文档（PPT）模板等用户素材，进入后显示整理中空态。 */
const COPY_CARDS: ReadonlyArray<{ key: string; name: string; desc: string; svg: ReactNode; ids: readonly string[] }> = [
  { key: 'copy-baseline', name: '策略基底', desc: '品牌事实、语气与客户画像——一切文案的地基', svg: <ArtCopyStrategy />, ids: ['yj-101-brand-dna', 'yj-102-brand-voice', 'yj-103-icp-persona'] },
  { key: 'copy-strategy', name: '创意策略', desc: 'VOC 审计、Hook 引擎、Brief 与创意研究——洞察到协议', svg: <ArtCopyCreative />, ids: ['yj-201-voc-audit', 'yj-202-hook-engine', 'yj-203-creative-brief', 'yj-204-creative-research'] },
  { key: 'copy-product', name: '商品文案', desc: '商品标题、搜索词与卖点短句——直接可上架', svg: <ArtCopyProduct />, ids: ['yj-320-product-seo-support'] },
]

const IMAGE_CARDS: ReadonlyArray<{ key: string; name: string; desc: string; svg: ReactNode; ids: readonly string[] }> = [
  { key: 'image-edit', name: '商品出图与改图', desc: '对标复刻、海报、试穿换装、改字与批量出图', svg: <ArtImageEdit />, ids: ['yj-401-benchmark-replica', 'yj-401-commercial-poster', 'yj-401-custom-batch-edit', 'yj-401-fashion-tryon', 'yj-401-image-text-edit', 'yj-401-original-main-detail', 'yj-401-product-model'] },
  { key: 'image-infographic', name: '商品信息图', desc: '属性指南、卖点图解、场景图与白底主图——13 式信息图', svg: <ArtImageInfographic />, ids: ['yj-402-attribute-guide', 'yj-402-benefits-infographic', 'yj-402-brand-closing-banner', 'yj-402-components-structure', 'yj-402-feature-matrix', 'yj-402-how-to-use', 'yj-402-lifestyle-scene', 'yj-402-materials-story', 'yj-402-multi-angle-showcase', 'yj-402-packaging-detail', 'yj-402-routine-context', 'yj-402-white-background-main', 'yj-402-wide-hero-banner'] },
]

const DOCS_CARDS: ReadonlyArray<{ key: string; name: string; desc: string; svg: ReactNode; ids: readonly string[] }> = [
  { key: 'docs-ppt', name: '演示文稿 PPT', desc: '营销提案与路演 PPT——模板接入中', svg: <ArtDocsPpt />, ids: [] },
]

/** 分类卡点击 → 模块链路（moduleId=分类 key，模板集=组内全部模板）。 */
const openCreationModule = (card: { key: string; name: string; desc: string; svg: ReactNode; ids: readonly string[] }): void => {
  const templates = card.ids
    .map(id => VIDEO_CATALOG.find(item => item.id === id))
    .filter((item): item is (typeof VIDEO_CATALOG)[number] => item !== undefined)
    .map(item => ({
      id: item.id, name: item.name, tagline: item.tagline,
      cover: item.cover,
      ...(item.coverFallback !== undefined ? { coverFallback: item.coverFallback } : {}),
      skill: item.skill,
    }))
  window.dispatchEvent(new CustomEvent('hl:start-module', {
    detail: { moduleId: card.key, name: card.name, desc: card.desc, icon: '', templates },
  }))
  window.dispatchEvent(new CustomEvent('hl:close-hub'))
}

const creationTabsStyle: CSSProperties = {
  display: 'flex',
  gap: 28,
  borderBottom: '1px solid var(--dsw-alias-border-l2)',
}

/* O44：'automation'（死值）与 'skill-hub'（ConversationRoot 在到达本组件前
 * 就分流到 HeightLabSkillHub，永远渲染不到）两个键删除；video-studio 页即
 * 「创作中心」四分页容器；library 一级名改「资料与知识」。 */
const PAGE_TITLES: Partial<Record<HubPage, string>> = {
  'film-studio': '智能剪辑台',
  inspiration: '创意灵感',
  lab: '更多能力',
  library: '资料与知识',
  'video-studio': '创作中心',
}

/* 仅在有明确说明价值时给一行副标题（原生页多数没有；用户已指出「一句话
 * 介绍多余」——此处从六页全给缩减为两页，且与标题分行小字）。 */
const PAGE_SUBTITLES: Partial<Record<HubPage, string>> = {
  lab: '更多生产与实验能力——持续扩充中',
  'video-studio': '文案、图片、视频——选类型，挑模板，一次做齐',
}

const sectionTitleStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 500,
  lineHeight: '22px',
  color: 'var(--dsw-alias-label-primary)',
  margin: '0 0 8px',
}

/* 创意灵感页：模板网格（横向行式，与上面统一） */
const gridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
  gap: '16px 16px',
  maxWidth: 960,
}

const cardStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  minWidth: 0,
  padding: 0,
  border: 'none',
  borderRadius: 12,
  background: 'transparent',
  textAlign: 'left',
  cursor: 'pointer',
}

const thumbStyle: CSSProperties = {
  display: 'block',
  width: '100%',
  aspectRatio: '16 / 10',
  borderRadius: 12,
  objectFit: 'cover',
}

const cardTitleStyle: CSSProperties = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontSize: 14,
  fontWeight: 500,
  lineHeight: '22px',
  color: 'var(--dsw-alias-label-primary)',
}

const cardDescStyle: CSSProperties = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontSize: 13,
  lineHeight: '20px',
  color: 'var(--dsw-alias-label-secondary)',
}

/** Render the page in the main content area (replaces chat view). */
export function HeightLabHubPage({ page, onClose }: { page: HubPage; onClose: () => void }) {
  const [preview, setPreview] = useState<{ item: Recommendation; category: TemplateCategory } | null>(null)
  const [cards, setCards] = useState<Record<TemplateCategory, Recommendation[]>>(TEMPLATE_CARDS)

  // HeightLab：模板热更新——进入页面时拉取服务器目录，失败回退包内默认。
  useEffect(() => {
    let cancelled = false
    void loadTemplateCatalog().then((catalog) => {
      if (!cancelled && catalog !== null) setCards(catalog)
    })
    return () => { cancelled = true }
  }, [])
  const [creationTab, setCreationTab] = useState<CreationTabId>('copy')
  const sameOf = (item: Recommendation, category: TemplateCategory): void => {
    // 做同款：关闭预览回聊天，切换对应专家，并把模板名以胶囊形式插入
    // 输入框文字区（Manus 式）；不发送，用户可继续输入。
    setPreview(null)
    window.dispatchEvent(new CustomEvent('hl:close-hub'))
    window.dispatchEvent(new CustomEvent('hl:use-template', {
      detail: {
        agentPreset: item.agent ?? (category === '图片'
          ? 'image-generator'
          : category === '视频' ? 'video-producer' : 'content-creator'),
        title: item.title,
      },
    }))
  }


  return (
    <div style={hubRootStyle}>
      {/* 2026-10-20 用户要求：一级菜单「剪辑台」以 OpenFilm 原生布局为准——
          它的顶栏就是整个工作区的顶栏，我们不再叠一条自己的标题栏。
          关闭入口挪进 Studio 右上角的浮层里（HeightLabFilmStudio native）。
          其他 hub 页（灵感/资产）保持原样。 */}
      {/* 2026-11-08 用户要求（UI 统一）：删除右上角关闭钮——原生一级页
          （插件·技能 / 自动化 / 设置）都没有，自建页带一个是割裂感来源。
          关闭走侧栏切换或 Esc 即可（原生行为）。 */}
      {/* 原生结构：标题 H1 单独一行；副标题（若有）在其下方小字分行。
          原生一级页没有右上角关闭钮——本次已删除。 */}
      {page === 'film-studio' ? null : (
        <div style={hubHeaderStyle} data-tauri-drag-region="deep">
          <h1 style={hubTitleStyle}>{PAGE_TITLES[page] ?? ''}</h1>
          {PAGE_SUBTITLES[page] !== undefined && <p style={hubSubtitleStyle}>{PAGE_SUBTITLES[page]}</p>}
        </div>
      )}
      {page === 'video-studio' ? (
        <div style={hubPageStyle}>
          {/* O44 创作中心分页栏（原生下划线 tab，同素材/知识库同款）。 */}
          <div style={creationTabsStyle} role="tablist" aria-label="创作类型">
            {CREATION_TABS.filter(tab => tab.ready).map(tab => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={creationTab === tab.id}
                className={creationTab === tab.id ? `${css.libraryTab} ${css.libraryTabActive}` : css.libraryTab}
                onClick={() => { setCreationTab(tab.id) }}
              >
                {tab.label}（{tab.count}）
              </button>
            ))}
          </div>
          {creationTab === 'image' ? (
            /* O44 美观统一（用户拍板）：图片/文案页与视频页同款彩色分类卡
             * （行式 + 渐变图标），点分类 → 新会话 + 右栏该组模板网格。 */
            <>
              {IMAGE_CARDS.map(card => (
                <button
                  key={card.key}
                  type="button"
                  className={css.studioCard}
                  style={studioCardStyle}
                  onClick={() => openCreationModule(card)}
                >
                  <span style={studioIconWrapStyle} aria-hidden="true">{card.svg}</span>
                  <span style={studioTextStyle}>
                    <span style={studioNameStyle}>{card.name}</span>
                    <span style={studioDescStyle}>{card.desc}</span>
                  </span>
                </button>
              ))}
            </>
          ) : creationTab === 'copy' ? (
            <>
              {COPY_CARDS.map(card => (
                <button
                  key={card.key}
                  type="button"
                  className={css.studioCard}
                  style={studioCardStyle}
                  onClick={() => openCreationModule(card)}
                >
                  <span style={studioIconWrapStyle} aria-hidden="true">{card.svg}</span>
                  <span style={studioTextStyle}>
                    <span style={studioNameStyle}>{card.name}</span>
                    <span style={studioDescStyle}>{card.desc}</span>
                  </span>
                </button>
              ))}
            </>
          ) : creationTab === 'docs' ? (
            <>
              {DOCS_CARDS.map(card => (
                <button
                  key={card.key}
                  type="button"
                  className={css.studioCard}
                  style={studioCardStyle}
                  onClick={() => openCreationModule(card)}
                >
                  <span style={studioIconWrapStyle} aria-hidden="true">{card.svg}</span>
                  <span style={studioTextStyle}>
                    <span style={studioNameStyle}>{card.name}</span>
                    <span style={studioDescStyle}>{card.desc}</span>
                  </span>
                </button>
              ))}
            </>
          ) : creationTab === 'video' ? (
            <>
              {STUDIO_GROUPS.map(group => (
                <section key={group.title} style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 960 }}>
                  <h3 style={groupTitleStyle}>{group.title}</h3>
                  <div style={studioGridStyle}>
                    {STUDIO_CARDS.filter(card => group.modules.includes(card.moduleId)).map(card => (
                      <button
                        key={card.name}
                        type="button"
                        className={css.studioCard}
                        style={studioCardStyle}
                        onClick={() => {
                          if (card.moduleId === 'replication') {
                            // 爆款复刻：专属 FY1 云镜链（既有通道，0.5.7 已修工作区解析）。
                            window.dispatchEvent(new CustomEvent('hl:start-replication'))
                            window.dispatchEvent(new CustomEvent('hl:close-hub'))
                            return
                          }
                          /* 0.5.7 模块创作台：把模块元数据 + 按映射取好的模板条目整包
                   * 传给 ui-workspace（建新会话）与右栏控制台（模板选择网格）。 */
                          const templates = (MODULE_TEMPLATE_IDS[card.moduleId] ?? [])
                            .map(id => VIDEO_CATALOG.find(item => item.id === id))
                            .filter((item): item is (typeof VIDEO_CATALOG)[number] => item !== undefined)
                            .map(item => ({
                              id: item.id, name: item.name, tagline: item.tagline,
                              cover: item.cover,
                              ...(item.coverFallback !== undefined ? { coverFallback: item.coverFallback } : {}),
                              skill: item.skill,
                            }))
                          window.dispatchEvent(new CustomEvent('hl:start-module', {
                            detail: { moduleId: card.moduleId, name: card.name, desc: card.desc, icon: '', templates },
                          }))
                          window.dispatchEvent(new CustomEvent('hl:close-hub'))
                        }}
                      >
                        <span style={studioIconWrapStyle} aria-hidden="true">{card.svg}</span>
                        <span style={studioTextStyle}>
                          <span style={studioNameStyle}>{card.name}</span>
                          <span style={studioDescStyle}>{card.desc}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </>
          ) : null}
        </div>
      ) : page === 'inspiration' ? (
        <div style={hubPageStyle}>
          {/* HeightLab：术语分类暂不更新，创意灵感页先隐藏（数据保留）。 */}
          {TEMPLATE_ORDER.filter(category => category !== '术语').map(category => (
            <section key={category}>
              <div style={sectionTitleStyle}>{category}</div>
              <div style={gridStyle}>
                {cards[category].map(item => (
                  <button key={item.title} type="button" style={cardStyle} onClick={() => setPreview({ item, category })}>
                    <img style={thumbStyle} src={templateThumb(item)} alt="" draggable={false} />
                    <span style={cardTitleStyle}>{item.title}</span>
                    <span style={cardDescStyle}>{item.desc}</span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : page === 'lab' ? (
        <div style={hubPageStyle}>
          {LAB_SECTIONS.map(section => (
            <section key={section.title} style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 960 }}>
              <h3 style={groupTitleStyle}>{section.title}</h3>
              <div style={studioGridStyle}>
                {section.items.map(item => (
                  <button
                    key={item.key}
                    type="button"
                    className={css.studioCard}
                    style={studioCardStyle}
                    onClick={() => {
                      if (item.target.kind === 'panel') {
                        /* 原生面板（自动化任务）：事件桥由 SidebarRoot 转发
                         * selectPanel（面板页拿不到 layout 服务），先关本页。 */
                        window.dispatchEvent(new CustomEvent('hl:close-hub'))
                        window.dispatchEvent(new CustomEvent('hl:open-panel', { detail: { panelId: item.target.panelId } }))
                        return
                      }
                      /* hub 页（智能剪辑台）：hub 状态替换 lab→film-studio，
                       * 无竞态（hl:close-hub 链路既有）。 */
                      ;(window as unknown as { __hlPendingHub?: string | null }).__hlPendingHub = item.target.page
                      window.dispatchEvent(new CustomEvent('hl:open-hub', { detail: { page: item.target.page } }))
                    }}
                  >
                    <span style={studioIconWrapStyle} aria-hidden="true">{item.svg}</span>
                    <span style={studioTextStyle}>
                      <span style={studioNameStyle}>{item.name}</span>
                      <span style={studioDescStyle}>{item.desc}</span>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : page === 'film-studio' ? (
        // 入口 (a)：一级菜单「剪辑台」= 主区满幅 Studio + 右侧开一段全新对话。
        // 这就是 OpenFilm 原生的「左影片、右侧边对话」，只是对话从 0 开始。
        <HeightLabFilmStudio onClose={onClose} opensChat />
      ) : page === 'library' ? (
        <HeightLabLibraryPage />
      ) : (
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--dsw-alias-label-tertiary)',
            fontSize: 13,
          }}
        >
          页面建设中…
        </div>
      )}
      {preview !== null && (
        <TemplatePreview
          item={preview.item}
          onClose={() => setPreview(null)}
          onSame={() => sameOf(preview.item, preview.category)}
        />
      )}
    </div>
  )
}

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

export type HubPage = 'inspiration' | 'library' | 'automation' | 'video-studio' | 'skill-hub' | 'film-studio'

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

const hubPageStyle: CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
  gap: 20,
  padding: '32px 48px 48px',
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
  padding: '28px 48px 0',
  maxWidth: 1056, /* 960 内容盒 + 左右 48 内距 */
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

const studioGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
  gap: '8px 32px',
  maxWidth: 960,
}

/* 原生行式卡片：图标 49×49 在左，标题/描述在右（不是竖向大卡）。 */
const studioCardStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 16,
  padding: '12px 0',
  border: 'none',
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
  width: 49,
  height: 49,
  borderRadius: 16,
  border: '0.5px solid var(--dsw-alias-border-l2, rgba(0,0,0,0.12))',
  background: 'transparent',
  color: 'var(--dsw-alias-label-secondary, #61666B)',
  boxSizing: 'border-box',
}

const studioTextStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  minWidth: 0,
}

const studioNameStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 500,
  lineHeight: '22px',
  color: 'var(--dsw-alias-label-primary)',
}

const studioDescStyle: CSSProperties = {
  fontSize: 13,
  lineHeight: '20px',
  color: 'var(--dsw-alias-label-secondary)',
}

const PAGE_TITLES: Record<HubPage, string> = {
  'film-studio': '智能剪辑台',
  'skill-hub': '技能中心',
  inspiration: '创意灵感',
  library: '资产中心',
  automation: '自动化',
  'video-studio': '视频创作',
}

/* 仅在有明确说明价值时给一行副标题（原生页多数没有；用户已指出「一句话
 * 介绍多余」——此处从六页全给缩减为两页，且与标题分行小字）。 */
const PAGE_SUBTITLES: Partial<Record<HubPage, string>> = {
  'video-studio': '选一个创作方向，右侧工作台里挑模板、填素材、一键生成',
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
          <h1 style={hubTitleStyle}>{PAGE_TITLES[page]}</h1>
          {PAGE_SUBTITLES[page] !== undefined && <p style={hubSubtitleStyle}>{PAGE_SUBTITLES[page]}</p>}
        </div>
      )}
      {page === 'video-studio' ? (
        <div style={hubPageStyle}>
          <div style={studioGridStyle}>
            {STUDIO_CARDS.map(card => (
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

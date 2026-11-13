/**
 * HeightLab：运营面板（O49）——「数据概览」纵向平台列表 + 点卡进平台数据面板。
 *
 * 2026-11-10 用户拍板形态（第二次修正后）：
 *   · 四个平台**纵向排列**：抖音 → 视频号 → 小红书 → B站
 *   · 卡片视觉**严格对齐原生**（48×48 图标容器、radius 20 行式卡、
 *     名称 14/500、描述 13/18 tertiary）——与场景创作/技能页同一套语言
 *   · 登录后卡片显示**场景数据 + 增长**（红↑ / 绿↓）
 *   · 点单卡进该平台的**全量数据面板**
 *   · **登录一次不重复弹窗**，只在过期时提示重新登录
 *
 * 数据链路（2026-11-10 第五轮定案，详见 docs/70-PLANS/2026-11-10-运营面板设计方案.md §3.0）：
 *   `hl_ops_api` = 从登录窗口取 cookie（能读 HttpOnly）→ **Rust 侧 reqwest 发请求**。
 *   不在主 WebView 里读跨域 cookie（实测会让主界面整体冻结），也不每次开窗取 DOM。
 *   ⚠️ 所有 hl_ops_* 命令必须在 `src-tauri/build.rs` 的 app_manifest 里列出，
 *      否则 invoke 被 Tauri ACL 静默拒绝（点了毫无反应、控制台不报错）。
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import clsx from 'clsx'
import css from './ConversationRoot.module.css'
import {
  SNAPSHOT_HOURS,
  buildBaseline,
  dueSnapshotHour,
  loadProjects,
  loadRecords,
  mergeSnapshot,
  renderBaselineForPrompt,
  saveRecords,
  type OpsProject,
  type PublishRecord,
} from './HeightLabOpsData.ts'

/* ── 平台定义 ──────────────────────────────────────────────────────────── */

type ProviderId = 'douyin' | 'shipinhao' | 'xhs' | 'bilibili'

interface ProviderDef {
  id: ProviderId
  name: string
  /** 登录页地址（必须命中 Rust 侧 ops_login_url_allowed 白名单） */
  loginUrl: string
  /** 未登录时卡片上的引导文案 */
  loginHint: string
}

const PROVIDERS: readonly ProviderDef[] = [
  { id: 'douyin', name: '抖音', loginUrl: 'https://www.douyin.com/', loginHint: '扫码登录后自动同步' },
  { id: 'shipinhao', name: '视频号', loginUrl: 'https://channels.weixin.qq.com/', loginHint: '扫码登录后自动同步' },
  /* 小红书登录页用 **creator 域**：账号数据 / 粉丝来源接口都在
   * `creator.xiaohongshu.com`，签名由该域页面 JS 生成。若登录窗开在
   * `www.xiaohongshu.com`，页面内 fetch 拿不到签名上下文（2026-11-10 实测）。 */
  { id: 'xhs', name: '小红书', loginUrl: 'https://creator.xiaohongshu.com/', loginHint: '扫码登录后自动同步' },
  { id: 'bilibili', name: 'B站', loginUrl: 'https://www.bilibili.com/', loginHint: '扫码登录后自动同步' },
] as const

/* ── 平台图标（与 HubPage / SkillArtwork 同一套渐变语言） ─────────────── */

const artSvg = { viewBox: '0 0 36 36', fill: 'none', xmlns: 'http://www.w3.org/2000/svg' } as const

/* 2026-11-10 校准（用户实测「svg 大小粗细颜色不一致」）：
 * 原生卡片图标是**描边线稿**（stroke + linearGradient，strokeWidth 2~2.6，viewBox 36），
 * 不是实心填充。实心填充在视觉上明显更重、更粗，与原生放一起就不统一。
 * 以下全部按原生手法重写：只有 stroke，fill 仅用于极小装饰点。 */

const ArtDouyin = ({ uid }: { uid: string }) => (
  <svg {...artSvg} width={36} height={36} aria-hidden="true">
    <path
      d="M20.5 7v13.6a4.3 4.3 0 1 1-4.3-4.3c.5 0 .9.07 1.3.2V10.6a8.6 8.6 0 1 0 6.9 8.4V13.2a6 6 0 0 0 4.1 1.5V10.9a3.7 3.7 0 0 1-3.7-3.9h-4.3Z"
      stroke={`url(#${uid}a)`}
      strokeWidth="2.2"
      strokeLinejoin="round"
    />
    <defs>
      <linearGradient id={`${uid}a`} x1="10" y1="7" x2="27" y2="29" gradientUnits="userSpaceOnUse">
        <stop stopColor="#25F4EE" />
        <stop offset="0.5" stopColor="#3B8BFF" />
        <stop offset="1" stopColor="#FE2C55" />
      </linearGradient>
    </defs>
  </svg>
)

const ArtShipinhao = ({ uid }: { uid: string }) => (
  <svg {...artSvg} width={36} height={36} aria-hidden="true">
    <circle cx="18" cy="18" r="10.5" stroke={`url(#${uid}a)`} strokeWidth="2.4" />
    <path d="M15.4 13.6l7.2 4.4-7.2 4.4v-8.8Z" stroke={`url(#${uid}a)`} strokeWidth="2" strokeLinejoin="round" />
    <defs>
      <linearGradient id={`${uid}a`} x1="7.5" y1="7.5" x2="28.5" y2="28.5" gradientUnits="userSpaceOnUse">
        <stop stopColor="#3FE08A" />
        <stop offset="1" stopColor="#13B8C6" />
      </linearGradient>
    </defs>
  </svg>
)

const ArtXhs = ({ uid }: { uid: string }) => (
  <svg {...artSvg} width={36} height={36} aria-hidden="true">
    <path d="M7 10.5h9.6c1.4 0 2.2.8 2.2 2.2V28c0-1.8-1-2.7-2.7-2.7H7V10.5Z" stroke={`url(#${uid}a)`} strokeWidth="2.2" strokeLinejoin="round" />
    <path d="M29 10.5h-9.6c-1.4 0-2.2.8-2.2 2.2V28c0-1.8 1-2.7 2.7-2.7H29V10.5Z" stroke={`url(#${uid}b)`} strokeWidth="2.2" strokeLinejoin="round" />
    <defs>
      <linearGradient id={`${uid}a`} x1="11" y1="10.5" x2="11" y2="28" gradientUnits="userSpaceOnUse">
        <stop stopColor="#FF5A72" />
        <stop offset="1" stopColor="#E0243D" />
      </linearGradient>
      <linearGradient id={`${uid}b`} x1="25" y1="10.5" x2="25" y2="28" gradientUnits="userSpaceOnUse">
        <stop stopColor="#FF8AA0" />
        <stop offset="1" stopColor="#FF3D5E" />
      </linearGradient>
    </defs>
  </svg>
)

const ArtBilibili = ({ uid }: { uid: string }) => (
  <svg {...artSvg} width={36} height={36} aria-hidden="true">
    <rect x="6.5" y="12" width="23" height="16" rx="3.6" stroke={`url(#${uid}a)`} strokeWidth="2.2" />
    <path d="M12.5 8.2 15.6 12M23.5 8.2 20.4 12" stroke={`url(#${uid}a)`} strokeWidth="2.2" strokeLinecap="round" />
    <path d="M15.2 17.4l6 3-6 3v-6Z" stroke={`url(#${uid}a)`} strokeWidth="1.8" strokeLinejoin="round" />
    <defs>
      <linearGradient id={`${uid}a`} x1="18" y1="8.2" x2="18" y2="28" gradientUnits="userSpaceOnUse">
        <stop stopColor="#5AC8FA" />
        <stop offset="1" stopColor="#2B7CE8" />
      </linearGradient>
    </defs>
  </svg>
)

const ARTWORK: Record<ProviderId, (p: { uid: string }) => ReactNode> = {
  douyin: ArtDouyin,
  shipinhao: ArtShipinhao,
  xhs: ArtXhs,
  bilibili: ArtBilibili,
}

/* ── 与原生严格一致的样式（照抄 HeightLabHubPage 的 studio* 那一组） ────── */

/* 卡片形态（2026-11-10 用户第三次校准）
 * 「做成上一版原来那种卡片的效果，但还是现在这种纵向从上到下排列」——
 * 即：**独立卡片**（有边框、有圆角、有内距、有卡片间隙），而不是原生那种
 * 贴边透明的行。纵向一列排下去，卡片之间留出明显间距。 */
const rowCardStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 16,
  padding: '18px 20px',
  border: '1px solid var(--dsw-alias-border-l2)',
  borderRadius: 'var(--dsw-radius-xl, 16px)',
  background: 'var(--dsw-alias-bg-base)',
  textAlign: 'left',
  boxSizing: 'border-box',
  cursor: 'pointer',
  width: '100%',
  transition: 'border-color 120ms ease, background 120ms ease',
} as const

/** 原生图标容器：48×48 / radius lg / 0.5px 描边 */
const iconWrapStyle = {
  flex: 'none',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 56,
  height: 56,
  borderRadius: 'var(--dsw-radius-lg, 12px)',
  border: '0.5px solid var(--dsw-alias-border-l3, rgba(0,0,0,0.12))',
  background: 'transparent',
  boxSizing: 'border-box',
} as const

const rowTextStyle = {
  flex: 1,
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
} as const

const rowNameStyle = {
  fontSize: 14,
  fontWeight: 500,
  lineHeight: '20px',
  color: 'var(--dsw-alias-label-primary)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const

const rowDescStyle = {
  fontSize: 13,
  lineHeight: '18px',
  color: 'var(--dsw-alias-label-tertiary)',
  display: '-webkit-box',
  WebkitBoxOrient: 'vertical' as const,
  WebkitLineClamp: 1,
  overflow: 'hidden',
} as const

const sectionTitleStyle = {
  fontSize: 14,
  fontWeight: 500,
  lineHeight: '22px',
  color: 'var(--dsw-alias-label-primary)',
  margin: '0 0 8px',
} as const

/* ── Tauri 桥 ──────────────────────────────────────────────────────────── */

interface TauriBridge {
  core?: { invoke?: (cmd: string, args?: unknown) => Promise<unknown> }
  event?: {
    listen?: (event: string, cb: (e: { payload?: unknown }) => void) => Promise<() => void>
  }
}

const tauri = (): TauriBridge | undefined =>
  (globalThis as { __TAURI__?: TauriBridge }).__TAURI__

function invokeWithTimeout<T>(cmd: string, args?: unknown, ms = 25000): Promise<T> {
  const invoke = tauri()?.core?.invoke
  if (typeof invoke !== 'function') {
    return Promise.reject(new Error('当前不是桌面端，无法读取平台数据'))
  }
  return Promise.race([
    invoke(cmd, args) as Promise<T>,
    new Promise<T>((_, reject) => {
      window.setTimeout(() => reject(new Error(`操作超时（${cmd}）`)), ms)
    }),
  ])
}

/* ── 数据模型 ──────────────────────────────────────────────────────────── */

/** 单条指标：值 + 与上次同步相比的变化量 */
interface Metric {
  value: number | null
  /** 正数=增长，负数=下降，null=无对比基准 */
  delta?: number | null
  /** 展示单位/格式（比率转百分比、秒数保留一位） */
  format?: 'int' | 'pct' | 'sec'
  /** 突变守卫标记：true = 本次取到的值可疑，界面上保留旧值并标注「待核」 */
  suspect?: boolean
}

/* 注意：本仓库开启 `exactOptionalPropertyTypes` —— 可选属性不可显式赋 undefined。
 * 因此下面提供 helper 来构造对象，避免在调用处写字面量时踩这个坑。 */
interface PlatformSnapshot {
  /** 账号名（已登录时才有） */
  nickname?: string
  /** 账号 ID */
  accountId?: string
  /** 卡片上展示的场景数据（3 个核心指标） */
  highlights?: { label: string; metric: Metric }[]
  /** 详情页全量指标 */
  details?: { group: string; label: string; metric: Metric }[]
  /** 作品级数据（抖音已通；其他平台后续补） */
  works?: WorkItem[]
  /** 粉丝画像（对标抖音数据中心·粉丝数据，抖音已通） */
  fans?: FanPortrait
  /** 同步时间戳 */
  syncedAt: number
}

/** 构造快照并剔除 undefined 字段（满足 exactOptionalPropertyTypes） */
function makeSnapshot(
  base: { nickname?: string | null; accountId?: string | null; syncedAt: number; works?: WorkItem[]; fans?: FanPortrait },
  highlights: { label: string; metric: Metric }[],
  details: { group: string; label: string; metric: Metric }[],
): PlatformSnapshot {
  const out: PlatformSnapshot = { highlights, details, syncedAt: base.syncedAt }
  if (base.works !== undefined && base.works.length > 0) out.works = base.works
  if (base.fans !== undefined && base.fans !== null) out.fans = base.fans
  if (typeof base.nickname === 'string' && base.nickname !== '') out.nickname = base.nickname
  if (typeof base.accountId === 'string' && base.accountId !== '') out.accountId = base.accountId
  return out
}

/* ── 本地持久化 ────────────────────────────────────────────────────────── */

const STORAGE_KEY = 'hl-ops-snapshots-v2'
/** v1 旧格式（只有基础字段）——迁移用，避免已有登录数据因换键丢失 */
const LEGACY_KEY_V1 = 'hl-ops-accounts-v1'

function loadSnapshots(): Record<string, PlatformSnapshot> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw !== null) {
      /* 清掉历史遗留的 suspect 标记（旧版本会把它写进缓存，
       * 导致「一次误判后永久显示待核」——2026-11-12 实测修复）。 */
      const parsed = JSON.parse(raw) as Record<string, PlatformSnapshot>
      for (const snap of Object.values(parsed)) {
        for (const h of snap.highlights ?? []) delete h.metric.suspect
        for (const d of snap.details ?? []) delete d.metric.suspect
      }
      return parsed
    }
  } catch { /* 落到迁移分支 */ }

  /* 迁移 v1 → v2（2026-11-10：改数据结构换了键，不能让用户已同步的数据消失）。
   * v1 是 { [id]: { nickname, fans, works, likes, following, syncedAt } }。 */
  try {
    const legacyRaw = window.localStorage.getItem(LEGACY_KEY_V1)
    if (legacyRaw === null) return {}
    const legacy = JSON.parse(legacyRaw) as Record<string, Record<string, unknown>>
    const migrated: Record<string, PlatformSnapshot> = {}
    const asNum = (v: unknown): number | null => (typeof v === 'number' ? v : null)
    for (const [id, v] of Object.entries(legacy)) {
      const fans = asNum(v.fans)
      const works = asNum(v.works)
      const likes = asNum(v.likes)
      const following = asNum(v.following)
      migrated[id] = makeSnapshot(
        {
          nickname: typeof v.nickname === 'string' ? v.nickname : null,
          accountId: typeof v.douyinId === 'string' ? v.douyinId : null,
          syncedAt: typeof v.syncedAt === 'number' ? v.syncedAt : Date.now(),
        },
        [
          { label: '粉丝', metric: { value: fans } },
          { label: '作品', metric: { value: works } },
          { label: '获赞', metric: { value: likes } },
        ],
        [
          { group: '账号概览', label: '粉丝', metric: { value: fans } },
          { group: '账号概览', label: '关注', metric: { value: following } },
          { group: '账号概览', label: '作品', metric: { value: works } },
          { group: '账号概览', label: '获赞', metric: { value: likes } },
        ],
      )
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated))
    } catch { /* 非致命 */ }
    return migrated
  } catch {
    return {}
  }
}

/* ── 取数（Rust 侧 HTTP，不碰 WebView 渲染线程） ───────────────────────── */



/**
 * 抖音：`/aweme/v1/web/user/profile/self/` 返回账号资料。
 * 这是实测拿到 status_code:0 的端点（被 reqwest + cookie 调用时同样有效）。
 */
async function fetchDouyin(): Promise<PlatformSnapshot | null> {
  const q = [
    'device_platform=webapp', 'aid=6383', 'channel=channel_pc_web',
    'app_name=douyin_web', 'pc_client_type=1', 'version_code=170400',
    'version_name=17.4.0', 'cookie_enabled=true', 'platform=PC',
  ].join('&')
  const res = await invokeWithTimeout<{
    needLogin?: boolean
    status?: number
    data?: Record<string, unknown>
  }>('hl_ops_api', { provider: 'douyin', path: `/aweme/v1/web/user/profile/self/?${q}` })
  if (res.needLogin === true) return null
  const user = res.data?.user as Record<string, unknown> | undefined
  if (user === undefined) return null

  const num = (v: unknown): number | null => (typeof v === 'number' ? v : null)
  const fans = num(user.follower_count)
  const works = num(user.aweme_count)
  const likes = num(user.total_favorited)
  const following = num(user.following_count)

  /* 2026-11-10 实测：`profile/self` 返回 222 个字段，以下 11 项有真实值且稳定。
   * 作品级指标（单条播放/完播率）走 `/aweme/v1/web/aweme/post/`，该端点要求
   * `a_bogus` 签名，直连返回 403 —— 留待后续在页面上下文内取（见 BACKLOG O49）。 */
  const favoriting = num(user.favoriting_count)
  const friends = num(user.friend_count)
  const mplatformFans = num(user.mplatform_followers_count)
  const moments = num(user.dongtai_count)
  const mixes = num(user.mix_count)

  /* 后台指标（完播率等）——单独一个域、单独一次 POST。
   * 失败不影响主数据（例如创作者中心未开通/权限不足）。 */
  let creator: Awaited<ReturnType<typeof fetchDouyinCreator>> = []
  try {
    creator = await fetchDouyinCreator(7)
  } catch { /* 后台指标拿不到就跳过，不能因此让整个平台同步失败 */ }

  /* 作品级数据（监控与反哺的核心输入）。失败不影响账号数据。 */
  let workList: WorkItem[] = []
  try {
    workList = await fetchDouyinWorks(7)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.warn(`[ops] 作品级数据获取失败: ${msg}`)
    /* 不阻断账号数据同步，但要留痕（界面上「近期作品表现」区块会不显示） */
  }

  /* 粉丝画像（对标抖音数据中心·粉丝数据）。失败不影响其他数据。 */
  let fanData: FanPortrait | null = null
  try {
    fanData = await fetchDouyinFans()
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.warn(`[ops] 粉丝画像获取失败: ${msg}`)
  }

  const creatorDetails = creator.map(c => ({
    group: '近 7 天表现',
    label: c.label,
    metric: (c.format === undefined
      ? { value: c.value }
      : { value: c.value, format: c.format }) as Metric,
  }))

  return makeSnapshot(
    {
      nickname: typeof user.nickname === 'string' ? user.nickname : null,
      accountId: typeof user.unique_id === 'string' && user.unique_id !== ''
        ? user.unique_id
        : (typeof user.short_id === 'string' ? user.short_id : null),
      syncedAt: Date.now(),
      works: workList,
      ...(fanData !== null ? { fans: fanData } : {}),
    },
    /* 卡片摘要：粉丝 / 作品 / 获赞（最能代表账号体量的三个） */
    [
      { label: '粉丝', metric: { value: fans } },
      { label: '作品', metric: { value: works } },
      { label: '获赞', metric: { value: likes } },
    ],
    /* 详情页全量：账号三组 + 后台表现一组 */
    [
      { group: '粉丝与关注', label: '粉丝', metric: { value: fans } },
      { group: '粉丝与关注', label: '关注', metric: { value: following } },
      { group: '粉丝与关注', label: '好友', metric: { value: friends } },
      { group: '粉丝与关注', label: '全平台粉丝', metric: { value: mplatformFans } },
      { group: '内容产出', label: '作品', metric: { value: works } },
      { group: '内容产出', label: '动态', metric: { value: moments } },
      { group: '内容产出', label: '合集', metric: { value: mixes } },
      { group: '互动与收藏', label: '获赞', metric: { value: likes } },
      { group: '互动与收藏', label: '收藏', metric: { value: favoriting } },
      ...creatorDetails,
    ],
  )
}

/**
 * 创作者中心后台指标（完播率等）。2026-11-10 抓包定位：
 *   POST `/janus/douyin/creator/data/overview/dashboard` body `{"recent_days":7}`
 * 返回 13 项指标，每项自带 7 天 trends（可直接做迷你趋势）。
 * 注意这是 **POST + creator.douyin.com** 域，与上面 profile/self 不同域。
 */
async function fetchDouyinCreator(recentDays = 7): Promise<{
  label: string
  value: number | null
  format?: Metric['format']
  trend?: number[]
}[]> {
  const res = await invokeWithTimeout<{
    needLogin?: boolean
    data?: { metrics?: { metric_name?: string; metric_value?: number | null; trends?: { value?: number }[] }[] }
  }>('hl_ops_api', {
    provider: 'douyin',
    path: '/janus/douyin/creator/data/overview/dashboard',
    method: 'POST',
    body: JSON.stringify({ recent_days: recentDays }),
    host: 'creator',
  })
  if (res.needLogin === true) return []
  const metrics = res.data?.metrics ?? []
  /* 2026-11-13 用户要求「有多少展示多少」：**取消白名单过滤**。
   * 原实现只保留 13 个已知指标，接口多返回的全被丢掉——用户看不到。
   * 现在全量接收；已知指标用精确格式，未知指标按名字/取值范围**自动推断**格式，
   * 保证新指标出现时也能正确显示（而不是显示成天文数字或 0.2414）。 */
  const KNOWN_FORMAT: Record<string, Metric['format']> = {
    '播放量': 'int',
    '5秒完播率': 'pct',
    '2秒跳出率': 'pct',
    '平均播放时长': 'sec',
    '净增粉丝': 'int',
    '取关粉丝': 'int',
    '主页访问': 'int',
    '作品点赞': 'int',
    '作品评论': 'int',
    '作品分享': 'int',
    '投稿量': 'int',
    '总粉丝量': 'int',
    '封面点击率': 'pct',
  }
  /** 名字含这些词 → 百分比；含「时长/秒」→ 秒；否则整数 */
  const inferFormat = (name: string, value: number | null): Metric['format'] => {
    const known = KNOWN_FORMAT[name]
    if (known !== undefined) return known
    if (/率|占比|比例|rate|ratio|percent/i.test(name)) return 'pct'
    if (/时长|秒|duration|second/i.test(name)) return 'sec'
    /* 兜底：0~1 之间的小数且带 % 语义的，几乎一定是比率 */
    if (value !== null && value > 0 && value < 1 && Number.isFinite(value)) return 'pct'
    return 'int'
  }
  const out: { label: string; value: number | null; format?: Metric['format']; trend?: number[] }[] = []
  for (const m of metrics) {
    const name = m.metric_name ?? ''
    if (name === '') continue
    const value = typeof m.metric_value === 'number' ? m.metric_value : null
    const item: { label: string; value: number | null; format?: Metric['format']; trend?: number[] } = {
      label: name,
      value,
    }
    item.format = inferFormat(name, value)
    const trend = (m.trends ?? [])
      .map(t => (typeof t.value === 'number' ? t.value : null))
      .filter((v): v is number => v !== null)
    if (trend.length > 0) item.trend = trend
    out.push(item)
  }
  return out
}

/**
 * 抖音作品级数据（2026-11-12 实测打通，**不需要 a_bogus 签名**）
 *
 * 关键发现：`/janus/douyin/creator/data/overview/item_contribution_top`
 * 是**创作者后台**的作品排行接口，走 cookie 直连即可，不用逆向签名。
 * （早前试的 `/aweme/v1/web/aweme/post/` 才需要 a_bogus，那条路已放弃。）
 *
 * dimension 含义（实测）：1=播放量 2=互动量 3=完播率。
 * 三个维度各返回同一批作品的不同指标，按 item_id 合并即得完整作品表。
 */
interface WorkItem {
  itemId: string
  title: string
  publishTime: string
  cover?: string
  plays?: number
  interactions?: number
  completionRate?: number
}

/** 单项分布（性别/年龄/城市/活跃度/兴趣/设备共用） */
interface FanDistItem { label: string; count: number }

/** 粉丝画像（对标抖音数据中心·粉丝数据页）
 *
 * 2026-11-13 用户要求「有多少展示多少」：原实现只取了 6 组分布 + netAdd7，
 * 而接口实际返回 26 个字段。本次把**所有有数据价值的字段全部接上**：
 *   已有：gender / age / city / activeLevels / activeTime / interests / netAdd7
 *   新增：deviceBrands（设备品牌）、fans1 / fans7（1日/7日 取关·主页访问·净增）、
 *         trend7（7 日涨粉趋势曲线）、followerSummary（7/30 日明细）、
 *         clientData（播放/点赞/评论/分享 涨幅）、billboard7（贡献榜）
 */
interface FanPortrait {
  total: number
  gender: FanDistItem[]
  age: FanDistItem[]
  city: FanDistItem[]
  activeLevels: FanDistItem[]
  activeTime: FanDistItem[]
  interests: FanDistItem[]
  /** 近 7 天净增（可能为负） */
  netAdd7?: number
  /** 设备品牌分布（2026-11-13 新增） */
  deviceBrands?: FanDistItem[]
  /** 1 日粉丝变化：取关/主页访问/净增 */
  fans1?: { cancelFans?: number; homeViewFans?: number; netFans?: number }
  /** 7 日粉丝变化：取关/取关涨幅/主页访问/净增 */
  fans7?: { cancelFans?: number; cancelFansIncrRate?: string; homeViewFans?: number; netFans?: number }
  /** 7 日净增趋势（按日期升序），用于折线/迷你图 */
  trend7?: { date: string; value: number }[]
  /** 7 日 / 30 日汇总与每日明细 */
  followerSummary?: { day: number; total: number; daily: { date: number; inc: number }[] }[]
  /** 近 7 天客户端互动：播放/点赞/评论/分享 + 播放涨幅 */
  clientData?: { vv?: number; vvIncrRate?: string; like?: number; comment?: number; share?: number }
  /** 贡献榜（互动最多的用户，含头像/昵称/分数） */
  billboard7?: { nickname: string; score: number; avatar?: string }[]
}

/**
 * 抖音粉丝画像：`GET /janus/douyin/creator/bff/data/fans/summary/v2`
 *
 * 2026-11-12 实测：**GET 即可**（POST 反而 404），cookie 直连、无需签名。
 * 2026-11-13 探测确认：接口返回 26 个字段（`scripts/probe-douyin-apis.mjs` 有完整清单），
 * 本次已全部接入（见 FanPortrait 注释）。
 */
async function fetchDouyinFans(): Promise<FanPortrait | null> {
  const res = await invokeWithTimeout<{ needLogin?: boolean; data?: Record<string, unknown> }>('hl_ops_api', {
    provider: 'douyin',
    path: '/janus/douyin/creator/bff/data/fans/summary/v2',
    host: 'creator',
  })
  if (res.needLogin === true) return null
  const d = res.data
  if (d === undefined || d === null || typeof d !== 'object') return null

  const dist = (key: string, limit: number): FanDistItem[] => {
    const arr = d[key]
    if (!Array.isArray(arr)) return []
    const out: FanDistItem[] = []
    for (const raw of arr.slice(0, limit)) {
      if (raw === null || typeof raw !== 'object') continue
      const it = raw as { label?: unknown; count?: unknown }
      const label = typeof it.label === 'string' ? it.label : ''
      const count = typeof it.count === 'number' ? it.count : NaN
      if (label === '' || !Number.isFinite(count)) continue
      out.push({ label, count })
    }
    return out
  }

  /* 近 7 天净增藏在 follower_summary 数组里（day=7 的 fans_cnt） */
  let netAdd7: number | null = null
  const fs = d['follower_summary']
  if (Array.isArray(fs)) {
    for (const raw of fs) {
      if (raw === null || typeof raw !== 'object') continue
      const e = raw as { day?: unknown; fans_cnt?: unknown }
      if (e.day === 7 && typeof e.fans_cnt === 'number') { netAdd7 = e.fans_cnt; break }
    }
  }

  const total = typeof d['fans_cnt_sum'] === 'number' ? d['fans_cnt_sum'] : null
  if (total === null) return null

  const out: FanPortrait = {
    total,
    gender: dist('gender_distribution', 4),
    age: dist('age_distribution', 10),
    city: dist('city_distribution', 30),
    activeLevels: dist('active_levels', 6),
    activeTime: dist('active_time_range', 24),
    interests: dist('fans_interest_distribution', 15),
  }
  if (netAdd7 !== null) out.netAdd7 = netAdd7

  /* ── 2026-11-13 新增：把接口多返回的字段全部接上 ───────────────────── */

  /* 设备品牌分布（13 项，创作者判断受众消费力的重要参考） */
  const brands = dist('device_brand_distribution', 15)
  if (brands.length > 0) out.deviceBrands = brands

  /* 1 日 / 7 日粉丝变化（取关、主页访问、净增） */
  const numOr = (o: unknown, key: string): number | undefined => {
    if (o === null || typeof o !== 'object') return undefined
    const v = (o as Record<string, unknown>)[key]
    return typeof v === 'number' ? v : undefined
  }
  const strOr = (o: unknown, key: string): string | undefined => {
    if (o === null || typeof o !== 'object') return undefined
    const v = (o as Record<string, unknown>)[key]
    return typeof v === 'string' ? v : undefined
  }
  const f1 = d['fans_data_1']
  if (f1 !== null && typeof f1 === 'object') {
    const item: NonNullable<FanPortrait['fans1']> = {}
    const c = numOr(f1, 'cancel_fans'); if (c !== undefined) item.cancelFans = c
    const h = numOr(f1, 'home_view_fans'); if (h !== undefined) item.homeViewFans = h
    const n = numOr(f1, 'net_fans'); if (n !== undefined) item.netFans = n
    out.fans1 = item
  }
  const f7 = d['fans_data_7']
  if (f7 !== null && typeof f7 === 'object') {
    const item: NonNullable<FanPortrait['fans7']> = {}
    const c = numOr(f7, 'cancel_fans'); if (c !== undefined) item.cancelFans = c
    const r = strOr(f7, 'cancel_fans_incr_rate'); if (r !== undefined) item.cancelFansIncrRate = r
    const h = numOr(f7, 'home_view_fans'); if (h !== undefined) item.homeViewFans = h
    const n = numOr(f7, 'net_fans'); if (n !== undefined) item.netFans = n
    out.fans7 = item
  }

  /* 7 日净增趋势曲线（fans_data_trend_7.net_fans_trend，按 key=日期取值） */
  const trend7Raw = d['fans_data_trend_7']
  if (trend7Raw !== null && typeof trend7Raw === 'object') {
    const arr = (trend7Raw as Record<string, unknown>)['net_fans_trend']
    if (Array.isArray(arr)) {
      const pts: { date: string; value: number }[] = []
      for (const raw of arr) {
        if (raw === null || typeof raw !== 'object') continue
        const e = raw as { key?: unknown; value?: unknown }
        if (typeof e.key === 'string' && typeof e.value === 'number') {
          pts.push({ date: e.key, value: e.value })
        }
      }
      if (pts.length > 0) out.trend7 = pts.sort((a, b) => a.date.localeCompare(b.date))
    }
  }

  /* 7 日 / 30 日汇总 + 每日增量明细 */
  if (Array.isArray(fs)) {
    const summary: NonNullable<FanPortrait['followerSummary']> = []
    for (const raw of fs) {
      if (raw === null || typeof raw !== 'object') continue
      const e = raw as { day?: unknown; fans_cnt?: unknown; fans_cnt_inc?: unknown }
      if (typeof e.day !== 'number' || typeof e.fans_cnt !== 'number') continue
      const daily: { date: number; inc: number }[] = []
      if (Array.isArray(e.fans_cnt_inc)) {
        for (const dd of e.fans_cnt_inc) {
          if (dd === null || typeof dd !== 'object') continue
          const de = dd as { date?: unknown; inc?: unknown }
          if (typeof de.date === 'number' && typeof de.inc === 'number') {
            daily.push({ date: de.date, inc: de.inc })
          }
        }
      }
      summary.push({ day: e.day, total: e.fans_cnt, daily })
    }
    if (summary.length > 0) out.followerSummary = summary.sort((a, b) => a.day - b.day)
  }

  /* 近 7 天客户端互动数据（vv=播放，含涨幅） */
  const cd = d['fans_client_data']
  if (cd !== null && typeof cd === 'object') {
    const item: NonNullable<FanPortrait['clientData']> = {}
    const vv = numOr(cd, 'vv_cnt'); if (vv !== undefined) item.vv = vv
    const vr = strOr(cd, 'vv_cnt_incr_rate'); if (vr !== undefined) item.vvIncrRate = vr
    const lk = numOr(cd, 'like_cnt'); if (lk !== undefined) item.like = lk
    const cm = numOr(cd, 'comment_cnt'); if (cm !== undefined) item.comment = cm
    const sh = numOr(cd, 'share_cnt'); if (sh !== undefined) item.share = sh
    out.clientData = item
  }

  /* 贡献榜（互动最多的用户；avatar 取 url_list[0]） */
  const bb = d['contribution_billboard_7']
  if (bb !== null && typeof bb === 'object') {
    const scores = (bb as Record<string, unknown>)['scores']
    if (Array.isArray(scores) && scores.length > 0) {
      const list: NonNullable<FanPortrait['billboard7']> = []
      for (const raw of scores.slice(0, 10)) {
        if (raw === null || typeof raw !== 'object') continue
        const e = raw as { score?: unknown; user_info?: unknown }
        const score = typeof e.score === 'number' ? e.score : 0
        const ui = e.user_info
        if (ui === null || typeof ui !== 'object') continue
        const u = ui as Record<string, unknown>
        const nick = typeof u['nickname'] === 'string' ? u['nickname'] : ''
        if (nick === '') continue
        let avatar: string | undefined
        const av = u['avatar_larger']
        if (av !== null && typeof av === 'object') {
          const urls = (av as Record<string, unknown>)['url_list']
          if (Array.isArray(urls) && typeof urls[0] === 'string') avatar = urls[0]
        }
        const entry: { nickname: string; score: number; avatar?: string } = { nickname: nick, score }
        if (avatar !== undefined) entry.avatar = avatar
        list.push(entry)
      }
      if (list.length > 0) out.billboard7 = list
    }
  }

  return out
}

async function fetchDouyinWorks(recentDays = 7): Promise<WorkItem[]> {
  const DIMS: { dim: number; key: 'plays' | 'interactions' | 'completionRate' }[] = [
    { dim: 1, key: 'plays' },
    { dim: 2, key: 'interactions' },
    { dim: 3, key: 'completionRate' },
  ]
  const byId = new Map<string, WorkItem>()
  let lastWorkError: string | null = null

  for (const d of DIMS) {
    try {
      const res = await invokeWithTimeout<{
        needLogin?: boolean
        data?: {
          items?: {
            item_id?: string
            title?: string
            publish_time?: string
            metric_value?: string | number
            cover?: { url_list?: string[] }
          }[]
        }
      }>('hl_ops_api', {
        provider: 'douyin',
        path: `/janus/douyin/creator/data/overview/item_contribution_top?dimension=${d.dim}&recent_days=${recentDays}`,
        host: 'creator',
      })
      /* 诊断（2026-11-12 临时）：写入 localStorage 便于外部读取 */
      try {
        const diag = JSON.parse(window.localStorage.getItem('hl-ops-diag') ?? '[]') as unknown[]
        diag.push({
          dim: d.dim,
          keys: Object.keys(res as object),
          items: (res.data?.items ?? []).length,
          dataKeys: res.data !== undefined ? Object.keys(res.data) : null,
          needLogin: res.needLogin,
        })
        window.localStorage.setItem('hl-ops-diag', JSON.stringify(diag.slice(-9)))
      } catch { /* 诊断失败不影响主流程 */ }
      if (res.needLogin === true) continue
      for (const it of res.data?.items ?? []) {
        const id = it.item_id ?? ''
        if (id === '') continue
        const cur = byId.get(id) ?? {
          itemId: id,
          title: (it.title ?? '').slice(0, 80),
          publishTime: it.publish_time ?? '',
        }
        /* 封面：取第一个 url（后续可直接渲染） */
        if (cur.cover === undefined && it.cover?.url_list?.[0] !== undefined) {
          cur.cover = it.cover.url_list[0]
        }
        const raw = it.metric_value
        const val = typeof raw === 'number' ? raw : Number(raw ?? 0)
        if (Number.isFinite(val)) {
          if (d.key === 'completionRate') cur.completionRate = val       // 完播率是比率
          else if (d.key === 'plays') cur.plays = val
          else cur.interactions = val
        }
        byId.set(id, cur)
      }
    } catch (e) {
      /* 2026-11-12 教训：这里原本是空 catch，导致接口失败完全静默——
       * 界面上什么都不显示，连「采不到」都不知道。现在必须留痕。 */
      const msg = e instanceof Error ? e.message : String(e)
      console.warn(`[ops] 作品数据 dimension=${d.dim} 失败: ${msg.slice(0, 140)}`)
      lastWorkError = msg.slice(0, 140)
    }
  }
  const list = [...byId.values()].sort((a, b) => (b.publishTime > a.publishTime ? 1 : -1))
  /* 诊断：把最终结果写盘 */
  try {
    window.localStorage.setItem('hl-ops-works-diag', JSON.stringify({
      listLen: list.length,
      sample: list.slice(0, 2),
      lastWorkError,
    }))
  } catch { /* 忽略 */ }
  console.info(`[ops] 作品数据拉取完成: ${list.length} 条${lastWorkError !== null ? `（最后错误: ${lastWorkError}）` : ''}`)
  if (list.length === 0 && lastWorkError !== null) {
    /* 全部维度都空 → 把原因抛出去，让上层显示「采不到作品数据」而不是静默空白 */
    throw new Error(lastWorkError)
  }
  return list
}

/** B站：官方 `/x/web-interface/nav` 返回 isLogin + uname + mid */
async function fetchBilibili(): Promise<PlatformSnapshot | null> {
  const res = await invokeWithTimeout<{
    needLogin?: boolean
    data?: { code?: number; data?: Record<string, unknown> }
  }>('hl_ops_api', { provider: 'bilibili', path: '/x/web-interface/nav' })
  if (res.needLogin === true) return null
  const body = res.data
  if (body?.code !== 0 || body.data?.isLogin !== true) return null
  const d = body.data
  const num = (v: unknown): number | null => (typeof v === 'number' ? v : null)
  const fans = num(d.follower)
  const following = num(d.following)
  const likes = num(d.like_num)
  return makeSnapshot(
    {
      nickname: typeof d.uname === 'string' ? d.uname : null,
      accountId: typeof d.mid === 'number' ? String(d.mid) : null,
      syncedAt: Date.now(),
    },
    [
      { label: '粉丝', metric: { value: fans } },
      { label: '关注', metric: { value: following } },
      { label: '获赞', metric: { value: likes } },
    ],
    [
      { group: '账号概览', label: '粉丝', metric: { value: fans } },
      { group: '账号概览', label: '关注', metric: { value: following } },
      { group: '账号概览', label: '获赞', metric: { value: likes } },
    ],
  )
}

/**
 * 视频号（2026-11-10 抓包定位，全部实测 errCode:0）
 *
 * 接口族：`/cgi-bin/mmfinderassistant-bin/xxx`，**全部 POST**，且请求体必须带
 * `_log_finder_id`（形如 `v2_xxx@finder`）——这个值每个账号不同，
 * 由 `auth/auth_data` 动态取，不能硬编码。
 *
 * 三个接口各司其职：
 *   `auth/auth_data`                 → 昵称 / 地区 / finderUsername
 *   `statistic/fans_trend`           → 粉丝总数 + 7 日净增（含来源拆分）
 *   `statistic/new_post_total_data`  → 作品播放/点赞/评论/转发/收藏/涨粉
 */
async function fetchShipinhao(): Promise<PlatformSnapshot | null> {
  const nowSec = Math.floor(Date.now() / 1000)
  const base = {
    _log_finder_uin: '',
    rawKeyBuff: '',
    pluginSessionId: null,
    scene: 7,
    reqScene: 7,
  }
  const call = async <T,>(path: string, body: Record<string, unknown>): Promise<T | null> => {
    try {
      const res = await invokeWithTimeout<{ needLogin?: boolean; data?: T }>('hl_ops_api', {
        provider: 'shipinhao',
        path,
        method: 'POST',
        body: JSON.stringify(body),
        host: 'channels',
      })
      if (res.needLogin === true) return null
      return (res.data ?? null) as T | null
    } catch {
      return null
    }
  }

  /* ① 身份：必须先拿到 finderUsername，后面两个接口都依赖它 */
  const auth = await call<{
    errCode?: number
    data?: {
      userAttr?: { nickname?: string; city?: string; province?: string }
      finderUser?: { finderUsername?: string; finderNickname?: string }
    }
  }>('/cgi-bin/mmfinderassistant-bin/auth/auth_data', {
    ...base,
    _log_finder_id: '',
    timestamp: String(Date.now()),
  })
  if (auth?.errCode !== 0) return null
  const finderId = auth.data?.finderUser?.finderUsername ?? ''
  const nickname = auth.data?.userAttr?.nickname
    ?? auth.data?.finderUser?.finderNickname
    ?? null
  if (finderId === '') return null

  const authed = { ...base, _log_finder_id: finderId, timestamp: String(Date.now()) }

  /* ② 粉丝趋势（8 个点，interval=3 即每 3 小时一个切片；末位是最新值） */
  const fans = await call<{
    errCode?: number
    data?: {
      total?: number[]
      add?: number[]
      reduce?: number[]
      netAdd?: number[]
      fansDataByTabtype?: { tabTypeName?: string; total?: number[] }[]
    }
  }>('/cgi-bin/mmfinderassistant-bin/statistic/fans_trend', {
    ...authed,
    startTs: String(nowSec - 7 * 86400),
    endTs: String(nowSec),
    interval: 3,
  })

  /* ③ 作品总数据（按来源 tabType 拆分，取「全部」口径需自行求和，这里取每类之和的末位） */
  const posts = await call<{
    errCode?: number
    data?: {
      dataByTabtype?: {
        tabTypeName?: string
        data?: Record<string, string[]>
      }[]
    }
  }>('/cgi-bin/mmfinderassistant-bin/statistic/new_post_total_data', {
    ...authed,
    startTs: String(nowSec - 7 * 86400),
    endTs: String(nowSec),
    interval: 3,
  })

  /* noUncheckedIndexedAccess：下标取值可能 undefined，必须显式兜底成 null */
  const last = (arr: number[] | undefined): number | null => {
    if (arr === undefined || arr.length === 0) return null
    const v = arr[arr.length - 1]
    return typeof v === 'number' ? v : null
  }
  const sumLast = (key: string): number | null => {
    const list = posts?.data?.dataByTabtype ?? []
    let total = 0
    let seen = false
    for (const tab of list) {
      const arr = tab.data?.[key]
      if (arr === undefined || arr.length === 0) continue
      const v = Number(arr[arr.length - 1])
      if (Number.isFinite(v)) { total += v; seen = true }
    }
    return seen ? total : null
  }

  const fansTotal = last(fans?.data?.total)
  const netAdd = last(fans?.data?.netAdd)
  const adds = last(fans?.data?.add)
  const reduces = last(fans?.data?.reduce)

  /* 粉丝来源拆分（有数据才展示，避免空行） */
  const sourceDetails = (fans?.data?.fansDataByTabtype ?? [])
    .map(t => ({ label: `粉丝来源 · ${t.tabTypeName ?? ''}`, value: last(t.total) }))
    .filter(t => t.value !== null && t.value > 0)

  return makeSnapshot(
    { nickname, accountId: finderId, syncedAt: Date.now() },
    /* 卡片摘要：粉丝 / 新增 / 播放 */
    [
      { label: '粉丝', metric: { value: fansTotal } },
      { label: '新增粉丝', metric: { value: adds } },
      { label: '播放', metric: { value: sumLast('browse') } },
    ],
    [
      { group: '粉丝与关注', label: '粉丝', metric: { value: fansTotal } },
      { group: '粉丝与关注', label: '新增粉丝', metric: { value: adds } },
      { group: '粉丝与关注', label: '取关粉丝', metric: { value: reduces } },
      { group: '粉丝与关注', label: '净增粉丝', metric: { value: netAdd } },
      ...sourceDetails.map(d => ({ group: '粉丝来源', label: d.label, metric: { value: d.value } })),
      { group: '近 7 天作品表现', label: '播放', metric: { value: sumLast('browse') } },
      { group: '近 7 天作品表现', label: '点赞', metric: { value: sumLast('like') } },
      { group: '近 7 天作品表现', label: '评论', metric: { value: sumLast('comment') } },
      { group: '近 7 天作品表现', label: '转发', metric: { value: sumLast('forward') } },
      { group: '近 7 天作品表现', label: '收藏', metric: { value: sumLast('fav') } },
      { group: '近 7 天作品表现', label: '涨粉', metric: { value: sumLast('follow') } },
    ],
  )
}

/**
 * 小红书（2026-11-10 抓包定位）
 *
 * 分两层：
 *   ✅ `/api/galaxy/user/info` —— **无需签名**，直连即可（实测 success:true），
 *      返回昵称 / redId / 简介 / permissions。账号身份这一层用它。
 *   ⚠️ `/api/galaxy/v2/creator/datacenter/*` —— 需要 `x-s`/`x-t` 签名头，
 *      直连返回 **406 Not Acceptable**。签名由页面 JS 生成，
 *      所以数据层必须走**页面内 fetch**（`hl_ops_fetch`），不能走 Rust。
 */
async function fetchXhs(): Promise<PlatformSnapshot | null> {
  /* 账号身份：直连（无需签名） */
  const res = await invokeWithTimeout<{
    needLogin?: boolean
    data?: {
      success?: boolean
      data?: { userName?: string; redId?: string; userId?: string; userDesc?: string }
    }
  }>('hl_ops_api', { provider: 'xhs', path: '/api/galaxy/user/info', host: 'creator' })
  if (res.needLogin === true) return null
  const info = res.data?.data
  if (res.data?.success !== true || info === undefined) return null

  /* 数据层：签名接口，走页面内 fetch。
   *
   * 2026-11-11 用户拍板方案 A：「数据取完后关窗就行了」——
   * 所以**统计没拿到就返回 null**（= 未完成），前端不会关窗、继续轮询；
   * 拿到统计才视为成功并自动关窗。这样保证「窗口关了 = 数据齐了」，
   * 不会出现「登录窗已收，但详情页空空」的观感。
   *
   * 兜底：前端最多轮询 45 次（约 3 分钟），超时后停轮询、窗口留给用户手动关，
   * 不会无限挂着。 */
  const stats = await fetchXhsStatsViaPage()
  if (stats === null || stats.length === 0) return null

  const details: { group: string; label: string; metric: Metric }[] = []
  for (const item of stats) {
    const m: Metric = item.format === undefined
      ? { value: item.value }
      : { value: item.value, format: item.format }
    details.push({ group: item.group, label: item.label, metric: m })
  }

  return makeSnapshot(
    {
      nickname: typeof info.userName === 'string' ? info.userName : null,
      accountId: typeof info.redId === 'string' ? info.redId : null,
      syncedAt: Date.now(),
    },
    /* 卡片摘要：取前三项账号数据（此时 stats 一定非空，否则上面已 return null） */
    stats.filter(s => s.group === '账号数据').slice(0, 3).map(s => ({
      label: s.label,
      metric: { value: s.value },
    })),
    details,
  )
}

/**
 * 小红书数据接口（签名）——必须在**页面上下文**里 fetch。
 *
 * `hl_ops_fetch` 的 kickoff 脚本在 xiaohongshu 页面里执行，页面自带的
 * 请求拦截器会自动补 `x-s`/`x-t`，因此能拿到 200。
 * 两段式回传：kickoff 写 window.__hlOps，readback 同步读回。
 */
async function fetchXhsStatsViaPage(): Promise<
  { group: string; label: string; value: number | null; format?: Metric['format'] }[] | null
> {
  /* 2026-11-11 定案：用**隐藏窗口**取数（hl_ops_fetch_headless）。
   *
   * 为什么不用 hl_ops_fetch：那个要求登录窗已经开着。但用户要求
   * 「登录一次后不再弹窗」——已登录时根本不会开窗，于是拿不到签名上下文。
   * 隐藏窗口正好满足两边：用户看不见，但页面上下文真实、签名照常生成。 */
  const ORIGIN = 'https://creator.xiaohongshu.com'
  const endpoints: { group: string; path: string }[] = [
    { group: '账号数据', path: '/api/galaxy/v2/creator/datacenter/account/base' },
    { group: '粉丝来源', path: '/api/galaxy/v2/creator/datacenter/audience/source/account' },
  ]
  const originJs = JSON.stringify(ORIGIN)
  const kickoff = `
(function () {
  window.__hlOps = { pending: true };
  var parts = [];
  var done = 0;
  var total = ${endpoints.length};
  function finish() { window.__hlOps = { parts: parts }; }
  function grab(i, path) {
    fetch(${originJs} + path, { credentials: 'include', headers: { Accept: 'application/json' } })
      .then(function (r) { return r.json(); })
      .then(function (j) { parts[i] = { path: path, ok: !!(j && j.success), data: j && j.data }; })
      .catch(function (e) { parts[i] = { path: path, ok: false, error: String(e) }; })
      .then(function () { done += 1; if (done >= total) finish(); });
  }
  ${endpoints.map((e, i) => `grab(${i}, ${JSON.stringify(e.path)});`).join('\n  ')}
  return 'kicked';
})()`

  let parsed: unknown = null
  try {
    parsed = await invokeWithTimeout<unknown>('hl_ops_fetch_headless', {
      provider: 'xhs',
      url: `${ORIGIN}/statistics/account?type=overall`,
      kickoff,
      readback: `JSON.stringify(window.__hlOps || { pending: true })`,
    }, 30000)
  } catch {
    return null
  }
  const parts = (parsed as { parts?: { path?: string; ok?: boolean; data?: unknown }[] } | null)?.parts
  if (!Array.isArray(parts)) return null

  const out: { group: string; label: string; value: number | null; format?: Metric['format'] }[] = []
  for (const part of parts) {
    if (part.ok !== true || part.data === undefined) continue
    const group = endpoints.find(e => e.path === part.path)?.group ?? '账号数据'
    /* 数据结构未知时做保守展平：只取「数字」叶子，用父级键当标签。
     * 这样即使接口改版也不会崩，只是标签变技术化。 */
    flattenNumbers(part.data, group, out, 0)
  }
  return out.length > 0 ? out : null
}

/** 把嵌套 JSON 里的数字叶子展平（限深度 3，避免把嵌套数组展开成一堆噪声） */
function flattenNumbers(
  node: unknown,
  group: string,
  out: { group: string; label: string; value: number | null }[],
  depth: number,
): void {
  if (depth > 3 || node === null || typeof node !== 'object') return
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    if (typeof v === 'number' && Number.isFinite(v)) {
      out.push({ group, label: prettifyKey(k), value: v })
    } else if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
      flattenNumbers(v, group, out, depth + 1)
    }
  }
}

/** 把 camelCase / snake_case 的接口字段名转成可读中文（未知字段保留原名） */
function prettifyKey(k: string): string {
  const KNOWN: Record<string, string> = {
    fansCount: '粉丝', fansTotal: '粉丝总数', fans: '粉丝',
    followCount: '关注', likesCount: '获赞', likeCount: '获赞',
    noteCount: '笔记数', notesCount: '笔记数', viewsCount: '观看',
    viewCount: '观看', readCount: '阅读', playCount: '播放',
    collectCount: '收藏', commentCount: '评论', shareCount: '分享',
  }
  return KNOWN[k] ?? k
}

const FETCHERS: Record<ProviderId, () => Promise<PlatformSnapshot | null>> = {
  douyin: fetchDouyin,
  bilibili: fetchBilibili,
  xhs: fetchXhs,
  shipinhao: fetchShipinhao,
}

/* ── 数据可靠性三层防护（2026-11-12） ────────────────────────────────────
 *
 * 背景：平台接口路径是硬编码的，平台改版会**静默失效**（不报错、只显示旧数据）。
 * 三道防线让「不稳定的地方变得可观测」，而不是假装稳定：
 *
 *   ① 契约检查：不只判 HTTP 200，要判**数据结构还对不对**
 *   ② 陈旧标记：syncedAt 超阈值就明说「可能已过期」
 *   ③ 突变守卫：新值可疑（归零/暴跌/暴涨）时**不覆盖旧值**，标「待核」
 * ────────────────────────────────────────────────────────────────────── */

/** 数据超过这个天数就提示「可能已过期」 */
const STALE_DAYS = 3

/** 距上次成功同步过了多少天 */
function ageDays(syncedAt: number): number {
  return (Date.now() - syncedAt) / 86400000
}

/**
 * ① 突变守卫：判断新值是否可疑。
 *
 * 宁可显示「昨天的真数据」，也不显示「今天的假 0」——所以命中可疑时
 * 调用方应**保留旧值**，而不是采纳新值。
 */
function isSuspect(prev: number | null | undefined, next: number | null): boolean {
  if (next === null) return true                       // 空值，视为异常
  if (prev === null || prev === undefined) return false  // 无基线，无法判断

  /* ⚠️ 2026-11-12 实测踩坑：第一版守卫把「净增粉丝 -2」误判成异常，
   * 因为它只看绝对值比例（-2 相对 +27 像"暴跌"）。
   * 修正原则：**只对「单调累积型」指标做暴跌判断**。
   *   · 累积型（粉丝数、作品数、获赞数）：只会增不会减，归零/暴跌必是异常
   *   · 增量型（净增粉丝、播放量、点赞数）：**天然可能为负或为零**，不判
   * 这里用值本身与基线共同判断：两者都非负才走比例规则。 */
  const bothNonNegative = prev >= 0 && next >= 0
  if (!bothNonNegative) return false                   // 有负数参与 → 不按比例判异常

  if (next === 0 && prev > 0) return true              // 累积型突然归零
  if (prev > 0 && next < prev * 0.1) return true       // 跌超 90%
  if (prev > 0 && next > prev * 10) return true        // 涨超 10 倍（刷量/口径变更）
  return false
}

/** 一份快照里的可疑指标名（用于 UI 标注「待核」） */
function suspectsOf(snap: PlatformSnapshot): Set<string> {
  const out = new Set<string>()
  for (const h of snap.highlights ?? []) {
    if (h.metric.suspect === true) out.add(h.label)
  }
  for (const d of snap.details ?? []) {
    if (d.metric.suspect === true) out.add(`${d.group}/${d.label}`)
  }
  return out
}

/* ── 数字与增长渲染 ────────────────────────────────────────────────────── */

function fmtNum(n: number | null | undefined, format?: Metric['format']): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—'
  if (format === 'pct') return `${(n * 100).toFixed(2)}%`
  if (format === 'sec') return `${n.toFixed(1)}s`
  if (Math.abs(n) >= 100000000) return `${(n / 100000000).toFixed(1)}亿`
  if (Math.abs(n) >= 10000) return `${(n / 10000).toFixed(1)}万`
  return n.toLocaleString('zh-CN')
}

/** 增长箭头：**涨=红、跌=绿**（用户 2026-11-10 明确指定，中文财经惯例） */
function DeltaBadge({ delta, format }: { delta: number | null | undefined; format?: Metric['format'] }) {
  if (delta === null || delta === undefined || delta === 0) return null
  const up = delta > 0
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 2,
        marginLeft: 6,
        fontSize: 13,
        lineHeight: '18px',
        fontWeight: 500,
        color: up ? 'var(--dsw-alias-label-error, #E5484D)' : 'var(--dsw-alias-label-success, #30A46C)',
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {up ? '↑' : '↓'}
      {fmtNum(Math.abs(delta), format)}
    </span>
  )
}

/* ── 发布（2026-11-12） ────────────────────────────────────────────────── */

/**
 * 发布表单。**默认只填表不点发布**（安全默认）。
 *
 * 知识来源：复用 `dreammis/social-auto-upload`（MIT）的抖音发布实现，
 * 见 `docs/70-PLANS/复用调研台账.json` 与 `.claude/rules/27-reuse-first.md`。
 *
 * 文件选择：WebView 无法自动应答系统文件选择器，所以这里用 `<input type=file>`
 * 读到本地文件 → base64 传给 Rust → Rust 在页面里构造 File 塞给页面的 input。
 */
function PublishPanel({
  provider,
  providerName,
  onPublished,
}: {
  provider: ProviderId
  providerName: string
  /** 发布成功后回调，用于写入监控记录（2026-11-12） */
  onPublished: (info: { title: string; description: string; tags: string[] }) => void
}) {
  /* 2026-11-12 实测：发布表单很长，展开在详情页底部会让页面过长、
   * 而且用户容易把内容误填到下方的对话输入框。默认折叠，点「发布」才展开。 */
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [tags, setTags] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  const run = async (submit: boolean): Promise<void> => {
    if (file === null) { setResult('请先选择文件'); return }
    if (title.trim() === '') { setResult('请填写标题'); return }
    setBusy(true)
    setResult(null)
    try {
      const buf = await file.arrayBuffer()
      /* base64 编码：分块避免大文件时 String.fromCharCode 爆栈 */
      const bytes = new Uint8Array(buf)
      let bin = ''
      const CHUNK = 0x8000
      for (let i = 0; i < bytes.length; i += CHUNK) {
        bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
      }
      const b64 = btoa(bin)
      const res = await invokeWithTimeout<{
        ok?: boolean
        stage?: string
        reason?: string
        fill?: string
        submit?: string
        intervention?: { needUser?: boolean; kind?: string }
      }>('hl_ops_publish', {
        provider,
        fileBase64: b64,
        fileName: file.name,
        title: title.trim(),
        description: desc,
        tags: tags.split(/[,,]/).map(t => t.trim()).filter(Boolean),
        submit,
      }, 180000)
      if (res.ok === true) {
        if (res.intervention?.needUser === true) {
          const what = res.intervention.kind === 'sms' ? '短信验证码'
            : res.intervention.kind === 'qr' ? '扫码验证'
            : res.intervention.kind === 'cover' ? '封面设置'
            : '平台要求的确认'
          setResult(`内容已提交，但平台要求完成${what}。窗口已置顶，请在那里完成。`)
        } else if (submit) {
          /* 真正提交了 → 写入监控记录，后续按 T+1h/6h/24h/72h/168h 采快照 */
          onPublished({ title: title.trim(), description: desc, tags: tags.split(/[,,]/).map(t => t.trim()).filter(Boolean) })
          setResult('内容已提交。已加入监控列表，之后会自动记录表现。')
        } else {
          setResult('内容已填入窗口，请确认后点击发布。')
        }
      } else {
        setResult(res.reason ?? `未完成（stage=${res.stage ?? '?'}）`)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setResult(`操作失败：${msg.slice(0, 120)}`)
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <section style={{ marginTop: 32, paddingTop: 24, borderTop: '1px solid var(--dsw-alias-border-l2)' }}>
        <button
          type="button"
          onClick={() => { setOpen(true) }}
          style={{ ...secondaryBtnStyle(false), padding: '10px 20px' }}
        >
          发布到{providerName}
        </button>
        <div style={{ fontSize: 13, lineHeight: '20px', color: 'var(--dsw-alias-label-tertiary)', marginTop: 10 }}>
          点开后填写内容，随后在窗口中确认。
        </div>
      </section>
    )
  }

  return (
    <section style={{ marginTop: 32, paddingTop: 24, borderTop: '1px solid var(--dsw-alias-border-l2)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <h3 style={{ ...sectionTitleStyle, margin: 0 }}>发布到{providerName}</h3>
        <button
          type="button"
          onClick={() => { setOpen(false) }}
          style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13, color: 'var(--dsw-alias-label-tertiary)', padding: 0 }}
        >
          收起
        </button>
      </div>
      <div style={{ fontSize: 13, lineHeight: '20px', color: 'var(--dsw-alias-label-tertiary)', marginBottom: 16 }}>
        内容会先填进平台页面，确认无误后由你点击发布。<br />
        平台可能要求完成一次身份验证（如短信验证码），届时窗口会自动出现在最前面。
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 640 }}>
        <input
          type="file"
          accept="video/*"
          onChange={(e) => { setFile(e.target.files?.[0] ?? null) }}
          style={{ fontSize: 13 }}
        />
        <input
          type="text"
          value={title}
          onChange={(e) => { setTitle(e.target.value) }}
          placeholder="标题（最多 30 字）"
          maxLength={30}
          style={fieldStyle}
        />
        <textarea
          value={desc}
          onChange={(e) => { setDesc(e.target.value) }}
          placeholder="正文描述"
          rows={4}
          style={{ ...fieldStyle, resize: 'vertical', fontFamily: 'inherit' }}
        />
        <input
          type="text"
          value={tags}
          onChange={(e) => { setTags(e.target.value) }}
          placeholder="话题标签，用逗号分隔，如：AI,自媒体"
          style={fieldStyle}
        />
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            disabled={busy}
            onClick={() => { void run(false) }}
            style={primaryBtnStyle(busy)}
          >
            {busy ? '处理中…' : '填入页面'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => { void run(true) }}
            style={secondaryBtnStyle(busy)}
          >
            确认发布
          </button>
        </div>
        {result !== null && (
          <div style={{ fontSize: 13, lineHeight: '20px', color: 'var(--dsw-alias-label-secondary)' }}>{result}</div>
        )}
      </div>
    </section>
  )
}

/* ── 监控列表（2026-11-12） ────────────────────────────────────────────── */

/**
 * 已发布内容的监控面板。
 *
 * 展示每条发布记录的 T+N 曲线关键点（1h / 6h / 24h / 72h / 168h）。
 * 数据来源：发布后每次同步账号数据时，自动把对应作品的表现回填进来。
 */
function MonitorPanel({ records }: { records: PublishRecord[] }) {
  if (records.length === 0) {
    return (
      <section style={{ marginTop: 32, paddingTop: 24, borderTop: '1px solid var(--dsw-alias-border-l2)' }}>
        <h3 style={sectionTitleStyle}>发布监控</h3>
        <div style={{ fontSize: 13, lineHeight: '20px', color: 'var(--dsw-alias-label-tertiary)' }}>
          还没有发布记录。从上方发布内容后，这里会自动按 T+1h / 6h / 24h / 72h / 168h 记录表现。
        </div>
      </section>
    )
  }
  return (
    <section style={{ marginTop: 32, paddingTop: 24, borderTop: '1px solid var(--dsw-alias-border-l2)' }}>
      <h3 style={sectionTitleStyle}>发布监控</h3>
      <div style={{ fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-label-tertiary)', marginBottom: 12 }}>
        每条内容按 {SNAPSHOT_HOURS.map(h => `T+${h}h`).join(' / ')} 自动记录表现
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 860 }}>
        {records.slice(0, 10).map(r => {
          const last = r.snapshots[r.snapshots.length - 1]
          const first = r.snapshots[0]
          /* 增长：最早 → 最新 */
          const playsGain = last?.plays !== undefined && first?.plays !== undefined
            ? last.plays - first.plays
            : null
          return (
            <div
              key={r.id}
              style={{
                padding: '12px 14px',
                border: '1px solid var(--dsw-alias-border-l2)',
                borderRadius: 10,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--dsw-alias-label-primary)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.title === '' ? '(无标题)' : r.title}
                </span>
                <span style={{ fontSize: 12, color: 'var(--dsw-alias-label-tertiary)', flex: 'none' }}>
                  {new Date(r.publishedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              {r.snapshots.length === 0 ? (
                <div style={{ fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-label-tertiary)', marginTop: 6 }}>
                  等待首次采样（下次同步账号数据时自动记录）
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 20, marginTop: 8, flexWrap: 'wrap' }}>
                  {r.snapshots.map(sp => (
                    <div key={sp.at} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontSize: 11, color: 'var(--dsw-alias-label-tertiary)' }}>
                        T+{sp.ageHours < 1 ? `${Math.round(sp.ageHours * 60)}m` : `${sp.ageHours.toFixed(0)}h`}
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 500, fontVariantNumeric: 'tabular-nums', color: 'var(--dsw-alias-label-primary)' }}>
                        {fmtNum(sp.plays)}
                      </span>
                    </div>
                  ))}
                  {playsGain !== null && playsGain > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontSize: 11, color: 'var(--dsw-alias-label-tertiary)' }}>增长</span>
                      <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--dsw-alias-label-error, #E5484D)' }}>
                        ↑ {fmtNum(playsGain)}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

/* ── 反哺：带账号数据去写文案（2026-11-12） ───────────────────────────── */

/**
 * 「带账号数据创作」——把账号实测表现编译成 Agent 上下文，开一个新会话。
 *
 * 这是反哺闭环的**第一阶段**（上下文注入）：
 *   · 用户点这个按钮 → 把 `renderBaselineForPrompt()` 的文本
 *     通过 `hl:fill-draft` 写进输入框（不直接发送，用户可继续补充）
 *   · Agent 写文案时就能看到「这个号过去什么内容有效」
 *
 * 为什么用「填入输入框」而不是直接开新会话发送：
 * 用户往往还要补充「这次想写什么」，直接发送会把 Agent 钉死在历史数据上。
 */
function FeedbackButton({ providerName, baselineText }: { providerName: string; baselineText: string | null }) {
  if (baselineText === null) return null
  return (
    <button
      type="button"
      onClick={() => {
        /* 走既有的草稿填充通道（与「做同款」同一个机制） */
        window.dispatchEvent(new CustomEvent('hl:fill-draft', { detail: { text: `${baselineText}\n\n请基于以上账号实测表现，为下一次内容创作给出标题与选题建议。` } }))
        window.dispatchEvent(new CustomEvent('hl:close-hub'))
      }}
      style={{ ...secondaryBtnStyle(false), padding: '10px 20px' }}
    >
      带{providerName}数据去创作
    </button>
  )
}

const fieldStyle = {
  padding: '8px 12px',
  fontSize: 13,
  lineHeight: '20px',
  border: '1px solid var(--dsw-alias-border-l2)',
  borderRadius: 10,
  background: 'var(--dsw-alias-bg-base)',
  color: 'var(--dsw-alias-label-primary)',
  outline: 'none',
  boxSizing: 'border-box',
  width: '100%',
} as const

const primaryBtnStyle = (busy: boolean) => ({
  padding: '8px 18px',
  fontSize: 13,
  lineHeight: '20px',
  fontWeight: 500,
  border: 'none',
  borderRadius: 10,
  background: busy ? 'var(--dsw-alias-fill-l2, #e5e5e5)' : 'var(--dsw-alias-label-primary)',
  color: busy ? 'var(--dsw-alias-label-tertiary)' : 'var(--dsw-alias-bg-base)',
  cursor: busy ? 'default' : 'pointer',
} as const)

const secondaryBtnStyle = (busy: boolean) => ({
  padding: '8px 18px',
  fontSize: 13,
  lineHeight: '20px',
  border: '1px solid var(--dsw-alias-border-l2)',
  borderRadius: 10,
  background: 'transparent',
  color: 'var(--dsw-alias-label-secondary)',
  cursor: busy ? 'default' : 'pointer',
} as const)

/* ── 粉丝画像（2026-11-12，对标抖音数据中心·粉丝数据）──────────────────── */

/** 单组分布的横向条渲染：label + 占比条 + count */
function DistBar({ items, total }: { items: FanDistItem[]; total: number }) {
  const sum = items.reduce((a, b) => a + b.count, 0) || 1
  const max = Math.max(...items.map(i => i.count), 1)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map(it => (
        <div key={it.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 96, flex: 'none', fontSize: 13, lineHeight: '18px', color: 'var(--dsw-alias-label-secondary)', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {it.label}
          </span>
          <span style={{ flex: 1, minWidth: 0, height: 6, borderRadius: 3, background: 'var(--dsw-alias-fill-l2, #eee)', overflow: 'hidden' }}>
            <span style={{ display: 'block', height: '100%', width: `${Math.round((it.count / max) * 100)}%`, borderRadius: 3, background: 'var(--dsw-alias-label-tertiary)' }} />
          </span>
          <span style={{ width: 72, flex: 'none', fontSize: 13, lineHeight: '18px', fontVariantNumeric: 'tabular-nums', color: 'var(--dsw-alias-label-primary)' }}>
            {fmtNum(it.count)}
            <span style={{ marginLeft: 4, fontSize: 11, color: 'var(--dsw-alias-label-tertiary)' }}>
              {total > 0 ? `${Math.round((it.count / sum) * 100)}%` : ''}
            </span>
          </span>
        </div>
      ))}
    </div>
  )
}

/** 粉丝画像分页内容 */
function FanPortraitPanel({ fans }: { fans: FanPortrait }) {
  /* 2026-11-13 诊断日志：把组件实际收到的 fans 打出来，定位「数据在 localStorage
   * 却渲染不出来」的断点。生产上保留 info 级别，不刷屏。 */
  try {
    const keys = Object.keys(fans ?? {})
    const lens = {
      gender: fans?.gender?.length, age: fans?.age?.length, city: fans?.city?.length,
      interests: fans?.interests?.length, activeLevels: fans?.activeLevels?.length,
      deviceBrands: fans?.deviceBrands?.length, trend7: fans?.trend7?.length,
      billboard7: fans?.billboard7?.length,
    }
    console.info('[ops/fans] 组件收到的 fans:', { keys, lens, total: fans?.total })
  } catch { /* 诊断不影响渲染 */ }

  /* 2026-11-13：**防御性归一化**。
   *
   * 踩坑实录：新增的 9 组数据（设备品牌/趋势/榜单…）一直渲染不出来，而数据层
   * 实测 15 个字段全在、bundle 里渲染代码也在。旧快照里某些数组可能缺字段，
   * 组件顶部直接 `.length` / `.reduce()` 会抛错，**React 会静默丢掉该子树
   * 后面的所有兄弟节点**——表现为「新区块永远不出现」，且生产构建无红字。
   *
   * 所以这里统一兜底成安全数组，任何一项异常都不影响后续区块渲染。 */
  const safe = (arr: FanDistItem[] | undefined): FanDistItem[] =>
    Array.isArray(arr) ? arr.filter(x => x !== null && typeof x === 'object' && typeof x.count === 'number') : []
  const city = safe(fans.city)
  const gender = safe(fans.gender)
  const age = safe(fans.age)
  const interests = safe(fans.interests)
  const activeLevels = safe(fans.activeLevels)
  const activeTime = safe(fans.activeTime)
  const deviceBrands = safe(fans.deviceBrands)
  const sumOf = (arr: FanDistItem[]): number => arr.reduce((a, b) => a + b.count, 0)
  const half = Math.ceil(city.length / 2)
  const cityLeft = city.slice(0, half)
  const cityRight = city.slice(half)
  /* 诊断：把上面归一化后的实际项数打出来（生产保留 info）。 */
  try {
    console.info('[ops/fans] 归一化后:', { city: city.length, gender: gender.length, age: age.length, interests: interests.length, activeLevels: activeLevels.length, deviceBrands: deviceBrands.length })
  } catch { /* 诊断不影响渲染 */ }
  return (
    <>
      <section style={{ marginBottom: 28 }}>
        <h3 style={sectionTitleStyle}>粉丝总览</h3>
        <div style={{ display: 'flex', gap: 40, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 96 }}>
            <div style={{ display: 'flex', alignItems: 'baseline' }}>
              <span style={{ fontSize: 22, fontWeight: 600, lineHeight: '28px', color: 'var(--dsw-alias-label-primary)', fontVariantNumeric: 'tabular-nums' }}>
                {fmtNum(fans.total)}
              </span>
              {fans.netAdd7 !== undefined && fans.netAdd7 !== 0 && (
                <DeltaBadge delta={fans.netAdd7} />
              )}
            </div>
            <div style={{ fontSize: 13, lineHeight: '18px', color: 'var(--dsw-alias-label-tertiary)' }}>总粉丝</div>
          </div>
          <div style={{ minWidth: 96 }}>
            <div style={{ display: 'flex', alignItems: 'baseline' }}>
              <span style={{ fontSize: 22, fontWeight: 600, lineHeight: '28px', color: fans.netAdd7 !== undefined && fans.netAdd7 < 0 ? 'var(--dsw-alias-label-success, #30A46C)' : 'var(--dsw-alias-label-error, #E5484D)', fontVariantNumeric: 'tabular-nums' }}>
                {fans.netAdd7 !== undefined ? (fans.netAdd7 > 0 ? `+${fans.netAdd7}` : `${fans.netAdd7}`) : '—'}
              </span>
            </div>
            <div style={{ fontSize: 13, lineHeight: '18px', color: 'var(--dsw-alias-label-tertiary)' }}>近 7 天净增</div>
          </div>
        </div>
      </section>

      {gender.length > 0 && (
        <section style={{ marginBottom: 28 }}>
          <h3 style={sectionTitleStyle}>性别分布</h3>
          <DistBar items={gender} total={sumOf(gender)} />
        </section>
      )}

      {age.length > 0 && (
        <section style={{ marginBottom: 28 }}>
          <h3 style={sectionTitleStyle}>年龄分布</h3>
          <DistBar items={age} total={sumOf(age)} />
        </section>
      )}

      {city.length > 0 && (
        <section style={{ marginBottom: 28 }}>
          <h3 style={sectionTitleStyle}>地域分布 TOP{city.length}</h3>
          <div style={{ display: 'flex', gap: 40, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 280 }}><DistBar items={cityLeft} total={sumOf(city)} /></div>
            {cityRight.length > 0 && <div style={{ flex: 1, minWidth: 280 }}><DistBar items={cityRight} total={sumOf(city)} /></div>}
          </div>
        </section>
      )}

      {interests.length > 0 && (
        <section style={{ marginBottom: 28 }}>
          <h3 style={sectionTitleStyle}>兴趣分布</h3>
          <DistBar items={interests} total={sumOf(interests)} />
        </section>
      )}

      {(activeLevels.length > 0 || activeTime.length > 0) && (
        <section style={{ marginBottom: 28 }}>
          <h3 style={sectionTitleStyle}>活跃度</h3>
          <div style={{ display: 'flex', gap: 40, flexWrap: 'wrap' }}>
            {activeLevels.length > 0 && (
              <div style={{ flex: 1, minWidth: 260 }}>
                <div style={{ fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-label-tertiary)', marginBottom: 8 }}>活跃程度</div>
                <DistBar items={activeLevels} total={sumOf(activeLevels)} />
              </div>
            )}
            {activeTime.length > 0 && (
              <div style={{ flex: 1, minWidth: 260 }}>
                <div style={{ fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-label-tertiary)', marginBottom: 8 }}>活跃时段</div>
                <DistBar items={activeTime} total={sumOf(activeTime)} />
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── 2026-11-13 新增：接口本就返回、此前未展示的 6 组数据 ─────────── */}

      {deviceBrands.length > 0 && (
        <section style={{ marginBottom: 28 }}>
          <h3 style={sectionTitleStyle}>设备品牌</h3>
          <DistBar items={deviceBrands} total={sumOf(deviceBrands)} />
        </section>
      )}

      {(fans.fans1 !== undefined || fans.fans7 !== undefined || fans.clientData !== undefined) && (
        <section style={{ marginBottom: 28 }}>
          <h3 style={sectionTitleStyle}>粉丝变化与互动</h3>
          <div style={{ display: 'flex', gap: 40, flexWrap: 'wrap' }}>
            {/* 1 日 / 7 日粉丝变化 */}
            {[
              { title: '近 1 天', data: fans.fans1 },
              { title: '近 7 天', data: fans.fans7 },
            ].map(({ title, data }) => data === undefined ? null : (
              <div key={title} style={{ minWidth: 200 }}>
                <div style={{ fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-label-tertiary)', marginBottom: 8 }}>{title}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {[
                    { k: '净增粉丝', v: data.netFans, colorBySign: true },
                    { k: '取关粉丝', v: data.cancelFans, colorBySign: false },
                    { k: '主页访问', v: data.homeViewFans, colorBySign: false },
                  ].map(row => row.v === undefined ? null : (
                    <div key={row.k} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13, lineHeight: '18px' }}>
                      <span style={{ color: 'var(--dsw-alias-label-tertiary)' }}>{row.k}</span>
                      <span style={{
                        fontVariantNumeric: 'tabular-nums',
                        color: row.colorBySign && row.v !== 0
                          ? (row.v > 0 ? 'var(--dsw-alias-label-error, #E5484D)' : 'var(--dsw-alias-label-success, #30A46C)')
                          : 'var(--dsw-alias-label-primary)',
                      }}>
                        {row.colorBySign && row.v > 0 ? `+${row.v}` : row.v}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {/* 近 7 天客户端互动 */}
            {fans.clientData !== undefined && (
              <div style={{ minWidth: 200 }}>
                <div style={{ fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-label-tertiary)', marginBottom: 8 }}>近 7 天作品互动</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {[
                    { k: '播放', v: fans.clientData.vv, extra: fans.clientData.vvIncrRate !== undefined ? `涨 ${fans.clientData.vvIncrRate}` : undefined },
                    { k: '点赞', v: fans.clientData.like },
                    { k: '评论', v: fans.clientData.comment },
                    { k: '分享', v: fans.clientData.share },
                  ].map(row => row.v === undefined ? null : (
                    <div key={row.k} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13, lineHeight: '18px' }}>
                      <span style={{ color: 'var(--dsw-alias-label-tertiary)' }}>{row.k}</span>
                      <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--dsw-alias-label-primary)' }}>
                        {fmtNum(row.v)}{row.extra !== undefined && <span style={{ marginLeft: 4, fontSize: 11, color: 'var(--dsw-alias-label-tertiary)' }}>{row.extra}</span>}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* 7 日净增趋势（迷你柱状） */}
      {fans.trend7 !== undefined && fans.trend7.length > 0 && (() => {
        const pts = fans.trend7
        const maxAbs = Math.max(...pts.map(p => Math.abs(p.value)), 1)
        return (
          <section style={{ marginBottom: 28 }}>
            <h3 style={sectionTitleStyle}>7 日净增趋势</h3>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 88 }}>
              {pts.map(p => {
                const h = Math.max(3, Math.round((Math.abs(p.value) / maxAbs) * 56))
                const up = p.value >= 0
                return (
                  <div key={p.date} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 11, color: 'var(--dsw-alias-label-tertiary)', fontVariantNumeric: 'tabular-nums' }}>
                      {p.value > 0 ? `+${p.value}` : p.value}
                    </span>
                    <span style={{
                      display: 'block', width: '100%', maxWidth: 36, height: h, borderRadius: 3,
                      background: up ? 'var(--dsw-alias-label-error, #E5484D)' : 'var(--dsw-alias-label-success, #30A46C)',
                      opacity: 0.85,
                    }} />
                    <span style={{ fontSize: 10, color: 'var(--dsw-alias-label-tertiary)', whiteSpace: 'nowrap' }}>
                      {p.date.slice(5)}
                    </span>
                  </div>
                )
              })}
            </div>
          </section>
        )
      })()}

      {/* 7/30 日累计净增 */}
      {fans.followerSummary !== undefined && fans.followerSummary.length > 0 && (
        <section style={{ marginBottom: 28 }}>
          <h3 style={sectionTitleStyle}>涨粉汇总</h3>
          <div style={{ display: 'flex', gap: 40, flexWrap: 'wrap' }}>
            {fans.followerSummary.map(s => (
              <div key={s.day} style={{ minWidth: 96 }}>
                <div style={{
                  fontSize: 22, fontWeight: 600, lineHeight: '28px', fontVariantNumeric: 'tabular-nums',
                  color: s.total === 0 ? 'var(--dsw-alias-label-primary)'
                    : (s.total > 0 ? 'var(--dsw-alias-label-error, #E5484D)' : 'var(--dsw-alias-label-success, #30A46C)'),
                }}>
                  {s.total > 0 ? `+${s.total}` : s.total}
                </div>
                <div style={{ fontSize: 13, lineHeight: '18px', color: 'var(--dsw-alias-label-tertiary)' }}>
                  近 {s.day} 天净增
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 贡献榜（互动最多的粉丝） */}
      {fans.billboard7 !== undefined && fans.billboard7.length > 0 && (
        <section style={{ marginBottom: 28 }}>
          <h3 style={sectionTitleStyle}>互动贡献榜 TOP{fans.billboard7.length}</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 480 }}>
            {fans.billboard7.map((u, i) => (
              <div key={`${u.nickname}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 22, fontSize: 12, color: 'var(--dsw-alias-label-tertiary)', fontVariantNumeric: 'tabular-nums' }}>{i + 1}</span>
                {u.avatar !== undefined
                  ? <img src={u.avatar} alt="" style={{ width: 26, height: 26, borderRadius: '50%', objectFit: 'cover', flex: 'none' }} />
                  : <span style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--dsw-alias-fill-l2, #eee)', flex: 'none' }} />}
                <span style={{ flex: 1, minWidth: 0, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--dsw-alias-label-primary)' }}>
                  {u.nickname}
                </span>
                <span style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums', color: 'var(--dsw-alias-label-secondary)' }}>
                  {fmtNum(u.score)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  )
}

/* ── 页面 ──────────────────────────────────────────────────────────────── */

interface PlatformState {
  busy?: boolean
  error?: string
}

export function HeightLabOpsPage() {
  const [tab] = useState<'overview'>('overview')
  const [snapshots, setSnapshots] = useState<Record<string, PlatformSnapshot>>(loadSnapshots)
  const [states, setStates] = useState<Record<string, PlatformState>>({})
  const [detail, setDetail] = useState<ProviderId | null>(null)
  const [detailTab, setDetailTab] = useState<DetailTab>('数据概览')
  /* 详情页二级分页（2026-11-12 用户拍板，对标抖音数据中心·信息架构）
   * 顺序 = 抖音官方：总览 → 作品 → 粉丝；发布监控是我们自有能力排最后。 */
  const DETAIL_TABS = ['数据概览', '作品表现', '粉丝画像', '发布监控'] as const
  type DetailTab = typeof DETAIL_TABS[number]
  /* 监控层（2026-11-12）：发布记录 + T+N 快照。与账号快照分开存，
   * 因为它们的生命周期不同——作品会长期跟进，账号数据每次都刷新。 */
  const [records, setRecords] = useState<PublishRecord[]>(() => loadRecords())
  const [projects] = useState<OpsProject[]>(() => loadProjects())
  const loginPromptedRef = useRef(new Set<string>())

  /** 发布成功 → 写入监控记录（供 T+N 采快照与反哺使用） */
  const recordPublish = useCallback(
    (provider: ProviderId, info: { title: string; description: string; tags: string[] }) => {
      const now = Date.now()
      const rec: PublishRecord = {
        id: `pub-${now}-${Math.random().toString(36).slice(2, 8)}`,
        projectId: projects[0]?.id ?? 'default',
        provider,
        title: info.title,
        description: info.description,
        tags: info.tags,
        publishedAt: now,
        snapshots: [],
      }
      setRecords((prev) => {
        const next = [rec, ...prev]
        saveRecords(next)
        return next
      })
    },
    [projects],
  )

  /** 把账号当前作品数据回填到发布记录里（按标题匹配，作为无 ID 时的兜底） */
  useEffect(() => {
    if (records.length === 0) return
    let changed = false
    const next = records.map((r) => {
      /* 只处理还没采满的 */
      if (dueSnapshotHour(r) === null) return r
      const snap = snapshots[r.provider]
      const works = snap?.works ?? []
      /* 平台返回的标题可能被截断，所以用「包含」而不是相等 */
      const hit = works.find((w) => {
        const t = (w.title ?? '').trim()
        return t !== '' && (t.includes(r.title) || r.title.includes(t.slice(0, 20)))
      })
      if (hit === undefined) return r
      changed = true
      return mergeSnapshot(r, {
        itemId: hit.itemId,
        ...(hit.plays !== undefined ? { plays: hit.plays } : {}),
        ...(hit.interactions !== undefined ? { interactions: hit.interactions } : {}),
        ...(hit.completionRate !== undefined ? { completionRate: hit.completionRate } : {}),
      })
    })
    if (changed) {
      setRecords(next)
      saveRecords(next)
    }
    /* 只在快照数据变化时跑，避免死循环 */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(snapshots), records.length])

  /**
   * 同步一个平台（**不弹窗**）。
   *
   * 登录一次不再打扰用户的实现要点：
   *   · 取数走 `hl_ops_api`（Rust 侧 HTTP）——不需要打开任何窗口
   *   · 只有取不到数据时才提示，且同一次会话内只提示一次
   *     （用户明确否决过「每次点卡都弹窗」）
   */
  const syncPlatform = useCallback(async (def: ProviderDef, opts?: { silent?: boolean }) => {
    if (opts?.silent !== true) setStates((s) => ({ ...s, [def.id]: { busy: true } }))
    try {
      const snap = await FETCHERS[def.id]()
      /* ① 契约检查：不只看「有没有返回」，还要看**结构是否仍有意义**。
       * `makeSnapshot` 保证 highlights/details 是数组；这里再确认至少有一条
       * 非空指标——如果平台改版导致字段全空，说明契约已破，不能当成成功。 */
      if (snap !== null) {
        const metrics = [
          ...(snap.highlights ?? []).map(h => h.metric),
          ...(snap.details ?? []).map(d => d.metric),
        ]
        const nonNull = metrics.filter(m => m.value !== null).length
        if (nonNull === 0) {
          setStates((st) => ({
            ...st,
            [def.id]: { ...st[def.id], busy: false, error: '接口返回结构已变化，需要更新适配' },
          }))
          return false
        }
      }
      if (snap === null) {
        setStates((s) => ({ ...s, [def.id]: { busy: false } }))
        return false
      }
      /* 计算增长：与上次快照的同名指标相减（首次无基准 → delta 为 null） */
      setSnapshots((prev) => {
        const old = prev[def.id]
        const withDelta = (metric: Metric, label: string, group?: string): Metric => {
          const oldMetric = group === undefined
            ? old?.highlights?.find((h) => h.label === label)?.metric
            : old?.details?.find((d) => d.label === label && d.group === group)?.metric
          const before = oldMetric?.value
          const now = metric.value
          /* ⚠️ 必须带上 format —— 丢了它「5秒完播率」会显示成 0.241 而不是 24.14%
           * （2026-11-10 实测发现的真实 bug）。 */
          const out: Metric = {
            value: now,
            delta: before !== null && before !== undefined && now !== null ? now - before : null,
          }
          if (metric.format !== undefined) out.format = metric.format
          /* ③ 突变守卫：新值可疑时**保留旧值**并标 suspect，不拿假数字覆盖真数据。
           * 典型场景：接口改版返回 0/null，若无守卫会把「粉丝 3467」写成 0。 */
          if (isSuspect(before, now)) {
            out.value = before ?? null
            out.suspect = true
            out.delta = null
          }
          return out
        }
        const merged: PlatformSnapshot = makeSnapshot(
          {
            nickname: snap.nickname ?? null,
            accountId: snap.accountId ?? null,
            syncedAt: snap.syncedAt,
            /* ⚠️ works 必须在这里就带上 —— 2026-11-12 实测踩了两遍同一个坑：
             * 这个中间层对象漏了 works，后面 `persistable` 里写
             * `merged.works ?? []` 拿到的是空数组，作品数据被静默丢弃。
             * 链路：fetchDouyin → snap(有 works) → merged(❌漏了) → persistable(空) */
            works: snap.works ?? [],
            ...(snap.fans !== undefined ? { fans: snap.fans } : {}),
          },
          (snap.highlights ?? []).map((h) => ({
            label: h.label,
            metric: withDelta(h.metric, h.label),
          })),
          (snap.details ?? []).map((d) => ({
            group: d.group,
            label: d.label,
            metric: withDelta(d.metric, d.label, d.group),
          })),
        )
        /* ③ 的补充：`suspect` 是「本次同步此刻」的判断结果，**不写进缓存**。
         * 否则一旦某次误判，标记会永久留在 localStorage 里，之后即使数据
         * 恢复正常也一直显示「待核」（2026-11-12 实测踩到）。 */
        const stripSuspect = (m: Metric): Metric => {
          const out: Metric = { value: m.value }
          if (m.delta !== undefined) out.delta = m.delta
          if (m.format !== undefined) out.format = m.format
          return out
        }
        const persistable: PlatformSnapshot = makeSnapshot(
          {
            nickname: merged.nickname ?? null,
            accountId: merged.accountId ?? null,
            syncedAt: merged.syncedAt,
            /* ⚠️ 必须带上 works —— 2026-11-12 实测踩到：这里重建对象时漏了它，
             * 导致作品级数据在**写缓存前就被丢掉**（接口明明成功、缓存里却没有
             * works 字段，界面上「近期作品表现」一直不显示）。 */
            works: merged.works ?? [],
            ...(merged.fans !== undefined ? { fans: merged.fans } : {}),
          },
          (merged.highlights ?? []).map(h => ({ label: h.label, metric: stripSuspect(h.metric) })),
          (merged.details ?? []).map(d => ({ group: d.group, label: d.label, metric: stripSuspect(d.metric) })),
        )
        const next = { ...prev, [def.id]: persistable }
        try {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
        } catch { /* 非致命 */ }
        /* 但**返回给 UI 的**要带 suspect，用户才能看到「待核」 */
        return { ...prev, [def.id]: merged }
      })
      setStates((s) => ({ ...s, [def.id]: { busy: false } }))
      return true
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setStates((s) => ({ ...s, [def.id]: { busy: false, error: msg.slice(0, 100) } }))
      return false
    }
  }, [])

  /* 进入页面：对**已有快照**的平台静默刷新（不弹窗、不打扰）；
   * 没有快照的平台不动，等用户点卡时再走登录。 */
  useEffect(() => {
    for (const def of PROVIDERS) {
      if (snapshots[def.id] !== undefined) void syncPlatform(def, { silent: true })
    }
    // 仅挂载时执行一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** 点卡：有快照 → 进详情并刷新；无快照 → 打开登录窗口（只这一次） */
  const onCardClick = useCallback(async (def: ProviderDef) => {
    const hasSnapshot = snapshots[def.id] !== undefined
    if (hasSnapshot) {
      setDetail(def.id)
      setDetailTab('数据概览')
      void syncPlatform(def)
      return
    }
    try {
      await invokeWithTimeout('hl_ops_open_login', { provider: def.id, url: def.loginUrl })
      loginPromptedRef.current.add(def.id)
      setDetail(def.id)
      setDetailTab('数据概览')
      /* 窗口开着时轮询试取（每 5s，最多 3 分钟）——用户扫码成功后自动落地。
       *
       * ⭐ 同步成功就**自动关掉登录窗口**（2026-11-10 用户要求，全平台通用）：
       * 「视频号登录后弹出也隐藏和抖音一样，剩下 B 站、小红书以及后期有其他平台
       *   都一样」——所以这里**不写平台名判断**，任何平台同步成功都关窗，
       *   以后新增平台自动获得同样行为。
       * 关窗失败不影响数据落地（已写 localStorage），只是窗口留着让用户自己关。 */
      /* 轮询节奏（2026-11-10 实测调整）：
       * 原来是 setInterval(5s) 起步——第一次尝试在 5s 后，但小红书页面要
       * 加载完成才有签名上下文，首轮常常取空 → 用户以为「登录了也没数据」。
       * 改为：**先等 6s 让页面就绪 → 立刻试一次 → 之后每 4s 重试**。 */
      let tries = 0
      const attempt = (): void => {
        tries += 1
        void syncPlatform(def).then((ok) => {
          if (ok) {
            window.clearInterval(timer)
            /* 自动收起登录窗（幂等；窗口已被用户关掉时调用也不报错）。
             * ⚠️ 顺序关键：**必须等 syncPlatform 完成后再关**。
             * 小红书的数据接口要走页面内 fetch（页面自带签名），
             * 窗口先关掉就拿不到签名上下文，数据会一直空
             * （2026-11-10 实测踩过：关太快 → 小红书只剩账号名）。 */
            void invokeWithTimeout('hl_ops_close_login', { provider: def.id }, 5000).catch(() => {})
            return
          }
          if (tries >= 45) window.clearInterval(timer)
        })
      }
      const firstDelay = window.setTimeout(attempt, 6000)
      const timer = window.setInterval(attempt, 4000)
      /* 清理：若窗口被用户提前关掉，定时器仍会在 45 次后自行停止 */
      void firstDelay
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setStates((s) => ({ ...s, [def.id]: { busy: false, error: `开窗失败：${msg.slice(0, 80)}` } }))
    }
  }, [snapshots, syncPlatform])

  const detailDef = detail === null ? null : PROVIDERS.find(p => p.id === detail) ?? null

  return (
    /* 布局（2026-11-12 实测两轮修正）
     *
     * 本组件由 `HeightLabHubPage` 渲染，父容器是 `hubRootStyle`
     * （`height:100%; display:flex; flexDirection:column; overflow:hidden`），
     * 与页头 header **并列**。
     *
     * 因此必须用 **`flex: 1` + `minHeight: 0`** 拿「header 之外的剩余高度」——
     * 这是 flex 子项的语义。
     * ⚠️ 不能用 `height: 100%`：那是按父容器**完整高度**算，加上 header 就溢出，
     * 反而把内部滚动条挤没（2026-11-12 实测踩过这一轮）。 */
    /* 2026-11-12 最终方案：改用 **CSS 类**（css.opsRoot / css.opsScroll），
     * 不再用内联 style。原因见 ConversationRoot.module.css 里 .opsScroll 的注释：
     * 原生能滚的容器依赖 `scrollbar-gutter: stable`，内联写不了；且内联
     * 优先级可能被覆盖。这是第 5 轮修复，前 4 轮内联方案全部无效。 */
    <div className={css.opsRoot}>
      <div className={clsx(css.libraryTabs, css.opsTabsFixed)} role="tablist" data-tauri-drag-region="deep">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'overview'}
          className={clsx(css.libraryTab, css.libraryTabActive)}
          onClick={() => { setDetail(null) }}
        >
          数据概览
        </button>
      </div>

      {/* 容器严格照抄原生 hubPageStyle：gap 32 / padding 12 clamp(24,4vw,48) 48 */}
      <div className={css.opsScroll}>
        {detailDef === null ? (
          <>
            <div style={{ fontSize: 13, lineHeight: '20px', color: 'var(--dsw-alias-label-tertiary)', margin: 0 }}>
              登录一次长期有效，数据自动同步；点平台查看完整数据。
            </div>
            <section style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 860 }}>
              {PROVIDERS.map((def) => {
                const snap = snapshots[def.id]
                const st = states[def.id] ?? {}
                const Art = ARTWORK[def.id]
                const uid = `hl_ops_${def.id}`
                const loggedIn = snap !== undefined
                /* ② 陈旧检测：超过 STALE_DAYS 天没成功同步 → 降透明度 + 明确告知
                 * ③ 待核标记：有可疑指标 → 在名称后加黄色小标 */
                const stale = loggedIn && ageDays(snap.syncedAt) > STALE_DAYS
                const suspects = snap !== undefined ? suspectsOf(snap) : new Set<string>()
                return (
                  <button
                    key={def.id}
                    type="button"
                    className={css.studioCard}
                    style={{ ...rowCardStyle, opacity: stale ? 0.6 : 1 }}
                    onClick={() => { void onCardClick(def) }}
                  >
                    <span style={iconWrapStyle} aria-hidden="true">
                      <Art uid={uid} />
                    </span>
                    <span style={rowTextStyle}>
                      <span style={rowNameStyle}>
                        {def.name}
                        {loggedIn && snap.nickname !== undefined ? ` · ${snap.nickname}` : ''}
                        {stale && (
                          <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--dsw-alias-label-warning, #B45309)' }}>
                            数据可能已过期
                          </span>
                        )}
                        {suspects.size > 0 && (
                          <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--dsw-alias-label-warning, #B45309)' }}>
                            {suspects.size} 项待核
                          </span>
                        )}
                      </span>
                      {/* 描述行（原生同款 13/18 tertiary）：有数据时显示场景摘要 + 增长，
                       * 不重复渲染两遍（用户实测「数据重复」）。 */}
                      {st.busy === true ? (
                        <span style={rowDescStyle}>同步中…</span>
                      ) : st.error !== undefined ? (
                        <span style={rowDescStyle}>{st.error}</span>
                      ) : loggedIn ? (
                        <span
                          style={{
                            display: 'flex',
                            gap: 16,
                            flexWrap: 'wrap',
                            fontSize: 13,
                            lineHeight: '18px',
                            color: 'var(--dsw-alias-label-tertiary)',
                          }}
                        >
                          {snap.highlights?.map(h => (
                            <span key={h.label} style={{ display: 'inline-flex', alignItems: 'baseline' }}>
                              <span style={{ color: 'var(--dsw-alias-label-primary)', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                                {fmtNum(h.metric.value, h.metric.format)}
                              </span>
                              <span style={{ marginLeft: 4 }}>{h.label}</span>
                              <DeltaBadge delta={h.metric.delta} format={h.metric.format} />
                            </span>
                          ))}
                        </span>
                      ) : (
                        <span style={rowDescStyle}>{def.loginHint}</span>
                      )}
                    </span>
                  </button>
                )
              })}
            </section>
          </>
        ) : (
          /* 详情页布局（2026-11-12 用户建议「左侧或右侧放竖边栏专门放发布按钮」）
           *
           * 为什么这样改：原来是**竖向堆叠**——账号三组 + 近7天 + 作品列表 +
           * 反哺按钮 + 发布监控 + 发布表单，一路排到底，内容高度远超视口，
           * 于是必须依赖外层滚动；而外层 hero 态被强制 overflow:hidden
           * （2026-09-15 用户要求防输入框晃动），导致滚不动、下方内容看不到。
           *
           * 改成 **左数据 / 右操作** 后：
           *   · 操作类（发布 / 反哺 / 监控入口）固定在右栏，**永远可见**，
           *     不再依赖滚动；
           *   · 左栏只放数据，长度可控，即使溢出也只影响数据区；
           *   · 右栏 sticky，滚动左栏时它不动。
           */
          <div style={{ display: 'flex', gap: 28, alignItems: 'flex-start', minHeight: 0 }}>
            {/* ── 左：数据区 ── */}
            <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
              <button
                type="button"
                onClick={() => setDetail(null)}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13, color: 'var(--dsw-alias-label-secondary)', padding: 0 }}
              >
                ← 数据概览
              </button>
              <span style={{ fontSize: 13, color: 'var(--dsw-alias-label-tertiary)' }}>
                {detailDef.name}
                {snapshots[detailDef.id]?.nickname !== undefined ? ` · ${snapshots[detailDef.id]?.nickname}` : ''}
              </span>
            </div>

            {/* 二级分页栏（对标抖音数据中心：总览/作品/粉丝 + 我们的发布监控）。
             * 视觉复用原生 libraryTabs（与资产空间同款下划线 tab）。 */}
            <div className={css.libraryTabs} role="tablist" style={{ marginBottom: 20 }}>
              {DETAIL_TABS.map(name => (
                <button
                  key={name}
                  type="button"
                  role="tab"
                  aria-selected={detailTab === name}
                  className={clsx(css.libraryTab, detailTab === name && css.libraryTabActive)}
                  onClick={() => { setDetailTab(name) }}
                >
                  {name}
                </button>
              ))}
            </div>

            {(() => {
              const snap = snapshots[detailDef.id]
              if (snap === undefined) {
                return (
                  <div style={{ fontSize: 13, color: 'var(--dsw-alias-label-tertiary)' }}>
                    尚未同步到数据。请在打开的登录窗口里扫码，数据会自动同步。
                  </div>
                )
              }
              const groups = new Map<string, { label: string; metric: Metric }[]>()
              for (const d of snap.details ?? []) {
                const list = groups.get(d.group) ?? []
                list.push({ label: d.label, metric: d.metric })
                groups.set(d.group, list)
              }
              return (
                <>
                  {detailTab === '数据概览' && [...groups.entries()].map(([group, items]) => (
                    <section key={group} style={{ marginBottom: 28 }}>
                      <h3 style={sectionTitleStyle}>{group}</h3>
                      <div style={{ display: 'flex', gap: 40, flexWrap: 'wrap' }}>
                        {items.map(item => (
                          <div key={item.label} style={{ minWidth: 96 }}>
                            <div style={{ display: 'flex', alignItems: 'baseline' }}>
                              <span style={{ fontSize: 22, fontWeight: 600, lineHeight: '28px', color: 'var(--dsw-alias-label-primary)', fontVariantNumeric: 'tabular-nums' }}>
                                {fmtNum(item.metric.value, item.metric.format)}
                              </span>
                              <DeltaBadge delta={item.metric.delta} format={item.metric.format} />
                            </div>
                            <div style={{ fontSize: 13, lineHeight: '18px', color: 'var(--dsw-alias-label-tertiary)' }}>
                              {item.label}
                              {item.metric.suspect === true && (
                                <span style={{ marginLeft: 6, color: 'var(--dsw-alias-label-warning, #B45309)' }}>
                                  待核
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  ))}
                  {/* 作品表现分页（对标抖音数据中心·作品数据）。 */}
                  {detailTab === '作品表现' && (snap.works?.length ?? 0) > 0 && (
                    <section style={{ marginBottom: 28 }}>
                      <h3 style={sectionTitleStyle}>近期作品表现</h3>
                      <div style={{ fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-label-tertiary)', marginBottom: 10 }}>
                        近 7 天有数据的作品 · 按播放量排序
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 860 }}>
                        {[...(snap.works ?? [])]
                          .sort((a, b) => (b.plays ?? 0) - (a.plays ?? 0))
                          .slice(0, 10)
                          .map(w => (
                            <div
                              key={w.itemId}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 12,
                                padding: '10px 12px',
                                border: '1px solid var(--dsw-alias-border-l2)',
                                borderRadius: 10,
                              }}
                            >
                              {w.cover !== undefined && (
                                <img
                                  src={w.cover}
                                  alt=""
                                  style={{ width: 40, height: 54, objectFit: 'cover', borderRadius: 6, flex: 'none' }}
                                />
                              )}
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{
                                  fontSize: 13, lineHeight: '18px',
                                  color: 'var(--dsw-alias-label-primary)',
                                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                }}>
                                  {w.title === '' ? '(无标题)' : w.title}
                                </div>
                                <div style={{ fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-label-tertiary)' }}>
                                  {w.publishTime}
                                </div>
                              </div>
                              <div style={{ display: 'flex', gap: 20, flex: 'none' }}>
                                {w.plays !== undefined && (
                                  <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontSize: 13, fontWeight: 500, fontVariantNumeric: 'tabular-nums', color: 'var(--dsw-alias-label-primary)' }}>
                                      {fmtNum(w.plays)}
                                    </div>
                                    <div style={{ fontSize: 11, color: 'var(--dsw-alias-label-tertiary)' }}>播放</div>
                                  </div>
                                )}
                                {w.interactions !== undefined && (
                                  <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontSize: 13, fontWeight: 500, fontVariantNumeric: 'tabular-nums', color: 'var(--dsw-alias-label-primary)' }}>
                                      {fmtNum(w.interactions)}
                                    </div>
                                    <div style={{ fontSize: 11, color: 'var(--dsw-alias-label-tertiary)' }}>互动</div>
                                  </div>
                                )}
                                {w.completionRate !== undefined && (
                                  <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontSize: 13, fontWeight: 500, fontVariantNumeric: 'tabular-nums', color: 'var(--dsw-alias-label-primary)' }}>
                                      {fmtNum(w.completionRate, 'pct')}
                                    </div>
                                    <div style={{ fontSize: 11, color: 'var(--dsw-alias-label-tertiary)' }}>完播率</div>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                      </div>
                    </section>
                  )}
                  {/* 粉丝画像分页（对标抖音数据中心·粉丝数据，2026-11-12 实测打通） */}
                  {detailTab === '粉丝画像' && (
                    snap.fans === undefined ? (
                      <div style={{ fontSize: 13, color: 'var(--dsw-alias-label-tertiary)' }}>
                        粉丝画像暂未同步到。请稍后点卡片重新同步；若多次失败说明接口已变，需要更新适配。
                      </div>
                    ) : (
                      <FanPortraitPanel fans={snap.fans} />
                    )
                  )}

                  {/* 发布监控分页（我们自有能力，抖音无直接对标） */}
                  {detailTab === '发布监控' && (
                    <MonitorPanel records={records.filter(r => r.provider === detailDef.id)} />
                  )}

                  <div style={{ fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-label-tertiary)', marginTop: 16 }}>
                    同步于 {new Date(snap.syncedAt).toLocaleString('zh-CN')}
                    {ageDays(snap.syncedAt) > STALE_DAYS && (
                      <span style={{ marginLeft: 8, color: 'var(--dsw-alias-label-warning, #B45309)' }}>
                        · 已 {Math.floor(ageDays(snap.syncedAt))} 天未更新，数据可能已过期
                      </span>
                    )}
                  </div>
                </>
              )
            })()}
            </div>

            {/* ── 右：操作栏（固定，不随左栏滚动）── */}
            <aside style={{
              width: 300,
              flex: 'none',
              position: 'sticky',
              top: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}>
              {/* 反哺：把该账号实测表现编译成 Agent 上下文 */}
              <FeedbackButton
                providerName={detailDef.name}
                baselineText={(() => {
                  const snap = snapshots[detailDef.id]
                  const w = snap?.works ?? []
                  if (w.length === 0) return null
                  const b = buildBaseline(detailDef.id, snap?.nickname ?? detailDef.name, w)
                  return renderBaselineForPrompt(b)
                })()}
              />
              {detailDef.id === 'douyin' && (
                <PublishPanel
                  provider={detailDef.id}
                  providerName={detailDef.name}
                  onPublished={(info) => { recordPublish(detailDef.id, info) }}
                />
              )}
            </aside>
          </div>
        )}
      </div>
    </div>
  )
}

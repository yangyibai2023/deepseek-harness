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
 *   注意 所有 hl_ops_* 命令必须在 `src-tauri/build.rs` 的 app_manifest 里列出，
 *      否则 invoke 被 Tauri ACL 静默拒绝（点了毫无反应、控制台不报错）。
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import clsx from 'clsx'
import { IconCheckOutlineRegular, IconCloseOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import css from './ConversationRoot.module.css'
import {
  SNAPSHOT_HOURS,
  backfillDueRecords,
  buildBaseline,
  loadProjects,
  loadRecords,
  renderBaselineForPrompt,
  saveRecords,
  type OpsProject,
  type PublishRecord,
} from './HeightLabOpsData.ts'
import {
  PREDICT_TIERS,
  addRule,
  calibrationStats,
  loadRules,
  predictionHash,
  predictionIntact,
  predictionOpen,
  removeRule,
  retroVerdict,
  ruleSuggestion,
  setRuleStatus,
  snapshotChain,
  verifiedRulesText,
  type PredictTier,
  type RetroResult,
} from './HeightLabOpsRetro.ts'
import { buildActionItems, type OpsActionItem } from './HeightLabOpsActions.ts'
import {
  addFeedback,
  addWatch,
  benchWorkScore,
  formatHotValue,
  hotSignalsFromBench,
  isHotWork,
  asrLibrary,
  loadSignals,
  removeFeedback,
  removeWatch,
  type AsrEntry,
  type HotBoardItem,
} from './HeightLabOpsBench.ts'
import {
  POOL_SOURCE_LABELS,
  addPoolItem,
  loadPool,
  poolPendingCount,
  removePoolItem,
  setPoolStatus,
  type PoolStatus,
} from './HeightLabOpsPool.ts'

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

export const PROVIDERS: readonly ProviderDef[] = [
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
/** 原生图标容器：48×48 / radius lg / 0.5px 描边 */
/* 爆款/警示数据色（功能色例外，集中定义；token 未定义时回落原字面值） */
const HOT_COLOR = 'var(--dsw-alias-label-warning, #F5A524)'
const DANGER_COLOR = 'var(--dsw-alias-label-error, #E5484D)'
const SUCCESS_COLOR = 'var(--dsw-alias-label-success, #30A46C)'

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
export interface PlatformSnapshot {
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

export const STORAGE_KEY = 'hl-ops-snapshots-v2'
/** v1 旧格式（只有基础字段）——迁移用，避免已有登录数据因换键丢失 */
const LEGACY_KEY_V1 = 'hl-ops-accounts-v1'

export function loadSnapshots(): Record<string, PlatformSnapshot> {
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

/**
 * 把一次平台同步结果合并进快照表（纯函数，2026-11-16 抽取）。
 *
 * 页面 syncPlatform 与后台调度器（HeightLabOpsScheduler）共用：
 * 定时采 T+N 必须复用同一套 delta/突变守卫/works 保留逻辑，
 * 否则后台写的数据会静默丢掉作品或与 UI 显示不一致。
 *
 * @returns persistable=写缓存版（剥 suspect）；merged=给 UI 版（带 suspect）
 */
export function computeSyncedSnapshot(
  prev: Record<string, PlatformSnapshot>,
  providerId: string,
  snap: PlatformSnapshot,
): { persistable: Record<string, PlatformSnapshot>; merged: Record<string, PlatformSnapshot> } {
  const old = prev[providerId]
  const stripSuspect = (m: Metric): Metric => {
    const out: Metric = { value: m.value }
    if (m.delta !== undefined) out.delta = m.delta
    if (m.format !== undefined) out.format = m.format
    return out
  }
  const withDelta = (metric: Metric, label: string, group?: string): Metric => {
    const oldMetric = group === undefined
      ? old?.highlights?.find(h => h.label === label)?.metric
      : old?.details?.find(d => d.label === label && d.group === group)?.metric
    const before = oldMetric?.value
    const now = metric.value
    /* 注意 必须带上 format —— 丢了它「5秒完播率」会显示成 0.241 而不是 24.14%
     * （2026-11-10 实测发现的真实 bug）。 */
    const out: Metric = {
      value: now,
      delta: before !== null && before !== undefined && now !== null ? now - before : null,
    }
    if (metric.format !== undefined) out.format = metric.format
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
      /* works 必须在这里就带上 —— 2026-11-12 实测踩过：中间层漏 works，
       * persistable 写 merged.works ?? [] 拿到空数组，作品数据被静默丢弃。 */
      works: snap.works ?? [],
      ...(snap.fans !== undefined ? { fans: snap.fans } : {}),
    },
    (snap.highlights ?? []).map(h => ({ label: h.label, metric: withDelta(h.metric, h.label) })),
    (snap.details ?? []).map(d => ({ group: d.group, label: d.label, metric: withDelta(d.metric, d.label, d.group) })),
  )
  const persistable: PlatformSnapshot = makeSnapshot(
    {
      nickname: merged.nickname ?? null,
      accountId: merged.accountId ?? null,
      syncedAt: merged.syncedAt,
      works: merged.works ?? [],
      ...(merged.fans !== undefined ? { fans: merged.fans } : {}),
    },
    (merged.highlights ?? []).map(h => ({ label: h.label, metric: stripSuspect(h.metric) })),
    (merged.details ?? []).map(d => ({ group: d.group, label: d.label, metric: stripSuspect(d.metric) })),
  )
  return {
    persistable: { ...prev, [providerId]: persistable },
    merged: { ...prev, [providerId]: merged },
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
 *   可直接用 `/api/galaxy/user/info` —— **无需签名**，直连即可（实测 success:true），
 *      返回昵称 / redId / 简介 / permissions。账号身份这一层用它。
 *   注意 `/api/galaxy/v2/creator/datacenter/*` —— 需要 `x-s`/`x-t` 签名头，
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
      readback: 'JSON.stringify(window.__hlOps || { pending: true })',
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

export const FETCHERS: Record<ProviderId, () => Promise<PlatformSnapshot | null>> = {
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

  /* 注意 2026-11-12 实测踩坑：第一版守卫把「净增粉丝 -2」误判成异常，
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
  const [result, setResult] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

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
        tags: tags.split(/[,，]/).map(t => t.trim()).filter(Boolean),
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
          onPublished({ title: title.trim(), description: desc, tags: tags.split(/[,，]/).map(t => t.trim()).filter(Boolean) })
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

  /* 2026-11-14 用户拍板：动作收进页头右侧，取消 300px 右栏。
   * 收起态=一个页头主按钮；点击弹**居中浮层**装表单——既保「永远可点」，
   * 又不占常驻空间；表单也不再平铺在页面里（避免误填进对话输入框）。 */
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => { setOpen(true) }}
        style={primaryBtnStyle(false)}
      >
        发布到{providerName}
      </button>
    )
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.35)' }}
      onClick={() => { setOpen(false) }}
    >
      <section
        onClick={(e) => { e.stopPropagation() }}
        style={{ width: 560, maxWidth: '92vw', maxHeight: '80vh', overflowY: 'auto', background: 'var(--dsw-alias-bg-base)', borderRadius: 16, padding: 20, boxSizing: 'border-box', boxShadow: '0 18px 48px rgba(0,0,0,0.18)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <h3 style={{ ...sectionTitleStyle, margin: 0, flex: 1 }}>发布到{providerName}</h3>
          <button
            type="button"
            onClick={() => { setOpen(false) }}
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13, color: 'var(--dsw-alias-label-tertiary)', padding: 0 }}
          >
            关闭
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
    </div>
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
        {records.slice(0, 10).map((r) => {
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

/* ── 对标库（O57 D2，2026-11-14）──────────────────────────────────────── */

/**
 * 对标账号公开数据采集与文案转写。
 *
 * 数据获取 = **匿名隐藏 WebView**（Tauri `hl_ops_bench_fetch`）：页面 JS 自带全部
 * 反爬凭证（ttwid/a_bogus/bd_ticket_guard），hook 捕获页面自身的
 * `user/post/videos` 响应——带登录态访问他人主页 RENDER_DATA 会返回自己的数据
 * （见 douyin_bypass_technique.md），页面 XHR 按 sec_user_id 参数取目标数据，两者都可用。
 * 口播文案 = 每条视频音频 URL → 云端 whisper 转写（/hl/ops/asr → 网关 → 8002）。
 */
interface BenchWork {
  awemeId: string
  desc: string
  plays?: number | null
  diggs?: number | null
  comments?: number | null
  collects?: number | null
  shares?: number | null
  playUrl?: string | null
  asr?: string
  /* O57 增量采集（2026-11-14）：每条作品的生命周期追踪 */
  firstSeenAt?: number
  lastSeenAt?: number
  /** 本轮采集未再返回（被删/超出条数）——保留存档但标注 */
  missing?: boolean
}
/** 一次采集动作的记录（供「采集历史」展示与增量判断） */
interface BenchRun {
  at: number
  requested: number
  returned: number
  added: number
  updated: number
  missing: number
}
interface BenchAccount {
  link: string
  secUid: string
  nickname: string
  works: BenchWork[]
  syncedAt: number
  /* O57 分组（2026-11-14）：项目分组多对多（复用 hl-projects-v1 的项目 id） */
  groups?: string[]
  /** 采集历史（最近在前，最多保留 20 次） */
  runs?: BenchRun[]
  /** 自动监控开关（对标 tab 可调；调度器按 monitorIntervalH 定时重采） */
  monitor?: boolean
  /** 监控频率（小时，默认 6） */
  monitorIntervalH?: number
}
/** 网关 /api/content-tools/bench-posts 响应（DTK 引擎结构化输出） */
interface BenchPostItem {
  contentId: string
  title: string
  tags: string[]
  webUrl: string
  stats: Record<string, number | null>
  videoUrl: string | null
  author: string
}
interface BenchPostsResponse {
  ok?: boolean
  message?: string
  data?: { items?: BenchPostItem[] }
}

const BENCH_KEY = 'hl-ops-bench-v1'
export function loadBench(): BenchAccount[] {
  try {
    const raw = window.localStorage.getItem(BENCH_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as { accounts?: BenchAccount[] }
      if (Array.isArray(parsed.accounts)) return parsed.accounts
    }
  } catch { /* 损坏重建 */ }
  return []
}
function saveBench(list: BenchAccount[]): void {
  try { window.localStorage.setItem(BENCH_KEY, JSON.stringify({ version: 1, accounts: list })) } catch { /* 满 */ }
}
/* ── 我的账号·多账号扩展（O57，2026-11-14）────────────────────────────────
 * 用户诉求「一家公司有 5 种类型账号，不能都放一块儿」。
 * 现状限制：`hl-ops-snapshots-v2` 是 Record<平台, 快照>——每平台只能 1 个登录会话
 * （creator 后台采集依赖真实登录 cookie，无法用同一会话采多个号）。
 * **纯加法设计（零回归）**：主账号沿用原存储不变；额外账号存独立 key
 * `hl-ops-own-extra-v1`，其中 `kind` 标注数据来源：
 *   - `'session'`：额外登录会话采集（需扫码；保后台独有指标：完播率/2秒跳出/粉丝画像）
 *   - `'public'` ：DTK 公开数据兜底（只需 sec_uid，无后台指标，标注「公开数据模式」）
 * 详情页复用现有 snap 渲染；概览页在主平台卡下方追加额外账号横条。
 */
const OWN_EXTRA_KEY = 'hl-ops-own-extra-v1'
interface OwnExtraAccount {
  id: string
  platform: ProviderId
  /** 账号显示名 */
  nickname: string
  /** douyin sec_uid 等平台稳定 id（public 模式必需） */
  accountRef: string
  /** 数据来源：会话采集（后台全量） or 公开数据（DTK） */
  kind: 'session' | 'public'
  snap: PlatformSnapshot
  /** O57 五轮：账号所属项目（项目 id 数组，多对多） */
  groups?: string[]
}
function loadOwnExtra(): OwnExtraAccount[] {
  try {
    const raw = window.localStorage.getItem(OWN_EXTRA_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as { accounts?: OwnExtraAccount[] }
      if (Array.isArray(parsed.accounts)) return parsed.accounts
    }
  } catch { /* 重建 */ }
  return []
}
function saveOwnExtra(list: OwnExtraAccount[]): void {
  try {
    window.localStorage.setItem(OWN_EXTRA_KEY, JSON.stringify({ version: 1, accounts: list }))
  } catch { /* 满 */ }
}

/* ── 当前概况（O57 四轮，2026-11-14 用户拍板）× 方案 A ──────────────────
 * 结构：左侧精简项目树（只列项目名+账号数，点击筛选） | 右侧数据摘要 + AI 总结。
 * 用户诉求：「第一页应该是总的 AI 总结数据情况」+「支持侧边聊天，根据页面数据聊天」。
 *
 * AI 总结实现：客户端无直调模型能力（DSH 架构：所有 AI 调用都走会话引擎），
 * 因此按钮动作 = 新建会话 + 把该范围数据编成上下文写进输入框 + 自动发送。
 * 会话天然保留在历史里（用户要求「对话记录要保留，就像正常对话」）。
 * 用 hl:fill-draft + hl:send-template 两条既有通道（零渗透）。
 */
interface OverviewRange {
  kind: 'all' | 'project' | 'account'
  projectId?: string
  accountKey?: string
  label: string
}

function buildOpsContext(range: OverviewRange): string {
  const projects = loadO56Projects()
  const bench = loadBench()
  const own = loadOwnExtra()
  const lines: string[] = []

  const projName = (pid: string): string => projects.find(p => p.id === pid)?.name ?? pid
  const inRange = (key: string): boolean => inRangeOf(range, key)

  lines.push(`【运营数据快照 · 范围「${range.label}」· ${new Date().toLocaleString('zh-CN')}】`)

  /* 我的账号（主平台登录态） */
  const snaps = loadSnapshots()
  for (const def of PROVIDERS) {
    const snap = snaps[def.id]
    if (snap === undefined) continue
    if (!inRange(`own:${def.id}`)) continue
    const hl = (snap.highlights ?? []).map(h => `${h.label} ${h.metric.value ?? '—'}`).join(' / ')
    lines.push(`\n[我的账号·${def.name}] ${snap.nickname ?? ''}｜${hl}`)
    const works = (snap.works ?? []).slice(0, 10)
    if (works.length > 0) {
      lines.push('  近期作品：')
      for (const w of works) {
        lines.push(`   · ${String(w.title ?? '(无题)').slice(0, 60)}｜播放 ${w.plays ?? '—'}｜互动 ${w.interactions ?? '—'}`)
      }
    }
  }

  /* 额外自有账号（公开数据模式） */
  for (const acct of own) {
    if (!inRange(`own:${acct.platform}:${acct.accountRef}`)) continue
    const hl = (acct.snap.highlights ?? []).map(h => `${h.label} ${h.metric.value ?? '—'}`).join(' / ')
    lines.push(`\n[我的账号·额外·${acct.nickname}]（${acct.kind === 'public' ? '公开数据模式' : '会话采集'}）｜${hl}`)
  }

  /* 对标账号 */
  for (const acct of bench) {
    if (!inRange(`bench:${acct.secUid || acct.link}`)) continue
    const live = acct.works.filter(w => w.missing !== true)
    const top5 = live.slice().sort((a, b) => (b.plays ?? b.diggs ?? 0) - (a.plays ?? a.diggs ?? 0)).slice(0, 5)
    lines.push(`\n[对标账号] ${acct.nickname}｜${live.length} 条作品｜归属：${(acct.groups ?? []).map(projName).join('、') || '未分组'}`)
    for (const w of top5) {
      lines.push(`   · ${String(w.desc ?? '(无题)').slice(0, 60)}｜播放 ${w.plays ?? '—'} 赞 ${w.diggs ?? '—'} 评 ${w.comments ?? '—'} 藏 ${w.collects ?? '—'}`)
      if (w.asr) lines.push(`     口播：${String(w.asr).slice(0, 160)}`)
    }
  }

  const pid = range.projectId
  lines.push(`\n[项目] ${projects.length} 个｜当前范围项目：${pid !== undefined ? projName(pid) : '全部'}`)
  return lines.join('\n')
}

/** 范围过滤：account 精确匹配；project 看归属；all 全通过（buildOpsContext 与
 * OverviewSection 共用同一判据——此前两处实现完全一致，lint 报 identical-functions）。 */
function inRangeOf(range: OverviewRange, key: string): boolean {
  if (range.kind === 'all') return true
  if (range.kind === 'account') return key === range.accountKey
  return accountGroups(key).includes(range.projectId ?? '')
}

const OPS_SUMMARY_PROMPT = [
  '以上是我这个运营账号（或账号组）的真实实测数据。请作为资深运营顾问，输出一份**结构化运营总结**：',
  '',
  '1. **当前表现**：这个号/这组号现在处于什么水平（用数据说明，不要空话）',
  '2. **核心问题**：最值得警惕的 1-2 个问题是什么（指出具体数据证据）',
  '3. **对标差距**：如果有对标账号，我和它的具体差距在哪',
  '4. **下周行动**：3 条具体可执行的动作（要能直接落到选题/文案/发布节奏）',
  '5. **风险提示**：数据里有没有异常信号（缺失/停滞/断崖）',
].join('\n')

/* ── 今日行动行（2026-11-16，设计 §2.2 主区的单条渲染）──────────────── */

const ACTION_LEVEL_STYLE: Record<OpsActionItem['level'], { dot: string; label: string }> = {
  p0: { dot: 'var(--dsw-alias-label-error, #E5484D)', label: '优先' },
  p1: { dot: HOT_COLOR, label: '关注' },
  p2: { dot: 'var(--dsw-alias-label-tertiary)', label: '建议' },
}

function ActionRow({ item }: { item: OpsActionItem }): React.JSX.Element {
  const ls = ACTION_LEVEL_STYLE[item.level]
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 10 }}>
      <span style={{ width: 8, height: 8, borderRadius: 4, background: ls.dot, flex: 'none' }} title={ls.label} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: 'var(--dsw-alias-label-primary)' }}>{item.title}</div>
        {item.detail !== undefined && (
          <div style={{ fontSize: 11, color: 'var(--dsw-alias-label-tertiary)', marginTop: 2 }}>{item.detail}</div>
        )}
      </div>
      <button
        type="button"
        onClick={() => { window.dispatchEvent(new CustomEvent('hl-ops-goto-tab', { detail: item.target })) }}
        style={{ flex: 'none', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 12, color: 'var(--dsw-alias-label-secondary)', padding: '4px 6px' }}
      >
        去处理 ›
      </button>
    </div>
  )
}

function OverviewSection(): React.JSX.Element {
  const [projects] = useState<ProjectRecord[]>(loadO56Projects)
  const [range, setRange] = useState<OverviewRange>({ kind: 'all', label: '全部账号' })
  const [, setTick] = useState(0)

  useEffect(() => {
    const onChange = (): void => { setTick(v => v + 1) }
    window.addEventListener('hl-projects-changed', onChange)
    window.addEventListener('hl-ops-groups-changed', onChange)
    return () => {
      window.removeEventListener('hl-projects-changed', onChange)
      window.removeEventListener('hl-ops-groups-changed', onChange)
    }
  }, [])

  const snaps = loadSnapshots()
  const bench = loadBench()
  const own = loadOwnExtra()

  /* ── 今日行动队列（2026-11-16，O49 总览主区）────────────────
   * 设计 §2.2：「我现在最该干什么？」——规则在 HeightLabOpsActions.ts，
   * 纯函数确定性生成；动作统一「去处理」→ 切到账号 tab（hl-ops-goto-tab）。 */
  const actionItems = buildActionItems({
    hasAnyData:
      Object.keys(snaps).length > 0 || bench.length > 0 || own.length > 0,
    syncedAts: Object.fromEntries(
      PROVIDERS.flatMap((d) => {
        const s = snaps[d.id]
        return s !== undefined ? [[d.id, s.syncedAt] as const] : []
      }),
    ),
    records: loadRecords(),
    bench: bench.map(b => ({
      worksTotal: b.works.filter(w => w.missing !== true).length,
      withAsr: b.works.filter(w => w.asr !== undefined && w.asr !== '').length,
    })),
  })

  const projCount = (pid: string): number => {
    let n = 0
    for (const def of PROVIDERS) if (snaps[def.id] !== undefined && accountGroups(`own:${def.id}`).includes(pid)) n += 1
    for (const a of own) if (accountGroups(`own:${a.platform}:${a.accountRef}`).includes(pid)) n += 1
    for (const a of bench) if (accountGroups(`bench:${a.secUid || a.link}`).includes(pid)) n += 1
    return n
  }

  /* 摘要数据：按当前 range 过滤 */
  const inRange = (key: string): boolean => inRangeOf(range, key)
  const ownSnaps = PROVIDERS.flatMap((d) => {
    const snap = snaps[d.id]
    return snap !== undefined && inRange(`own:${d.id}`) ? [snap] : []
  })
  const ownExtraIn = own.filter(a => inRange(`own:${a.platform}:${a.accountRef}`))
  const benchIn = bench.filter(a => inRange(`bench:${a.secUid || a.link}`))
  const totalWorks = benchIn.reduce((s, a) => s + a.works.filter(w => w.missing !== true).length, 0)
  const withAsr = benchIn.reduce((s, a) => s + a.works.filter(w => w.asr !== undefined && w.asr !== '').length, 0)
  const allProjects = (range.kind === 'all' || range.accountKey !== undefined)
    ? projects.slice()
    : projects.filter(p => p.id === range.projectId)
  const withSnapshot = ownSnaps.length + ownExtraIn.length
  const totalFans = ownSnaps.reduce((s, snap) => {
    const h = (snap.highlights ?? []).find(x => x.label.includes('粉丝'))
    return s + (typeof h?.metric.value === 'number' ? h.metric.value : 0)
  }, 0)

  /**
   * 让 AI 分析：O57 六轮（2026-11-15 用户拍板）改成**胶囊 + 隐藏上下文**。
   *
   * 原来把 2600+ 字运营数据全文灌进输入框再自动发送——用户要滚屏看一大坨原始数据。
   * 现在与「模板胶囊」同构：输入框只显示一行标签（含范围与时间，便于区分多次分析），
   * 完整上下文 + 五段提示词作为芯片的模型文本藏起来，发送时由 DSH 的 codec 展开。
   * 用户点「让 AI 分析」后**不自动发送**——停在输入框等用户确认/补充，更可控。
   *
   * 注意（2026-11-15 事故）：芯片能插不能发，是因为 `source: 'heightlab-ops'`
   * 没有注册 codec（提交时 serializeReference reject → 草稿静默还原）。codec 现在
   * 由 services/desktop-dsh-bridge/web-plugins/heightlab-ops-reference 提供。
   */
  const startSummary = (): void => {
    const ctx = buildOpsContext(range)
    const stamp = new Date()
    const hhmm = `${String(stamp.getMonth() + 1).padStart(2, '0')}-${String(stamp.getDate()).padStart(2, '0')} ${String(stamp.getHours()).padStart(2, '0')}:${String(stamp.getMinutes()).padStart(2, '0')}`
    const label = `运营快照 · ${range.label} · ${hhmm}`
    /* 11.13 闭环最后一环：已验证经验注入分析上下文 */
    const rules = verifiedRulesText()
    const prompt = `${ctx}${rules !== '' ? `\n\n${rules}` : ''}\n\n${OPS_SUMMARY_PROMPT}`
    window.dispatchEvent(new CustomEvent('hl:close-hub'))
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('hl:insert-ops-chip', { detail: { label, prompt } }))
      /* 插完胶囊后程序化提交（胶囊 + 隐藏全文一起发出） */
      setTimeout(() => { window.dispatchEvent(new CustomEvent('hl:submit-draft')) }, 400)
    }, 300)
  }

  /* 范围选择（2026-11-17 改版）：左侧分组树改顶部 chips 行——账号少时左栏大片
   * 空白（用户实测「太丑太占空间」），chips 含计数、换行自适应，同资产中心
   * 分类栏模式（1108 美观版定稿）。 */
  const chipBase: React.CSSProperties = {
    border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 999, padding: '3px 11px',
    font: 'inherit', fontSize: 12, cursor: 'pointer', background: 'transparent',
    color: 'var(--dsw-alias-label-tertiary)',
  }
  const chipActive: React.CSSProperties = {
    ...chipBase,
    background: 'var(--dsw-alias-interactive-bg-active)',
    color: 'var(--dsw-alias-label-primary)',
    borderColor: 'transparent',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minHeight: 0 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <button
          type="button"
          onClick={() => { setRange({ kind: 'all', label: '全部账号' }) }}
          style={range.kind === 'all' ? chipActive : chipBase}
        >
          全部账号 {PROVIDERS.filter(d => snaps[d.id] !== undefined).length + own.length + bench.length}
        </button>
        {projects.map((p) => {
          const active = range.kind === 'project' && range.projectId === p.id
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => { setRange({ kind: 'project', projectId: p.id, label: p.name }) }}
              style={active ? chipActive : chipBase}
            >
              {p.name} {projCount(p.id)}
            </button>
          )
        })}
        {projects.length === 0 && (
          <span style={{ fontSize: 11.5, color: 'var(--dsw-alias-label-tertiary)' }}>还没有项目分组（在「所有项目」页创建）</span>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h3 style={{ ...sectionTitleStyle, margin: 0, flex: 1 }}>{range.label}</h3>
          <button type="button" onClick={startSummary} style={primaryBtnStyle(false)}>
            让 AI 分析
          </button>
        </div>
        <div style={{ fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-label-tertiary)' }}>
          点「让 AI 分析」→ 新建对话并把这批真实数据交给模型做总结（对话会保留在会话列表）。
        </div>

        {/* ── 今日行动（设计 §2.2 主区：我现在最该干什么？2026-11-16）── */}
        <section>
          <h3 style={{ ...sectionTitleStyle, marginBottom: 10 }}>今日行动</h3>
          {actionItems.length === 0 ? (
            <div style={rowDescStyle}>数据都在有效期内，暂无待办。保持更新节奏即可。</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {actionItems.map(item => (
                <ActionRow key={item.id} item={item} />
              ))}
            </div>
          )}
        </section>

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
          {[
            { label: '自有账号', value: withSnapshot, unit: '个' },
            { label: '对标账号', value: benchIn.length, unit: '个' },
            { label: '对标作品', value: totalWorks, unit: '条' },
            { label: '已有口播文案', value: withAsr, unit: '条' },
            { label: '项目分组', value: allProjects.length, unit: '个' },
            { label: '自有粉丝合计', value: totalFans, unit: '' },
          ].map(item => (
            <div key={item.label} style={{ border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ fontSize: 12, color: 'var(--dsw-alias-label-tertiary)', marginBottom: 6 }}>{item.label}</div>
              <div style={{ fontSize: 22, fontWeight: 600, lineHeight: '28px', color: 'var(--dsw-alias-label-primary)', fontVariantNumeric: 'tabular-nums' }}>
                {item.value > 10000 ? `${(item.value / 10000).toFixed(1)}万` : item.value}
                <span style={{ fontSize: 12, fontWeight: 400, marginLeft: 4, color: 'var(--dsw-alias-label-tertiary)' }}>{item.unit}</span>
              </div>
            </div>
          ))}
        </section>

        <section>
          <h3 style={{ ...sectionTitleStyle, marginBottom: 10 }}>账号清单</h3>
          {benchIn.length === 0 && withSnapshot === 0 && (
            <div style={{ ...rowDescStyle }}>当前范围还没有账号数据。先到「账号」页采一个。</div>
          )}
          {ownSnaps.map((snap, i) => (
            <div key={`own-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid var(--dsw-alias-border-l2)' }}>
              <span style={{ fontSize: 11, color: 'var(--dsw-alias-label-tertiary)', flex: 'none', width: 56 }}>我的账号</span>
              <span style={{ flex: 1, fontSize: 13, color: 'var(--dsw-alias-label-primary)' }}>{snap.nickname ?? '—'}</span>
              <span style={{ fontSize: 12, color: 'var(--dsw-alias-label-tertiary)' }}>
                {(snap.highlights ?? []).map(h => `${h.label} ${h.metric.value ?? '—'}`).join(' · ')}
              </span>
            </div>
          ))}
          {ownExtraIn.map(a => (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid var(--dsw-alias-border-l2)' }}>
              <span style={{ fontSize: 11, color: 'var(--dsw-alias-label-tertiary)', flex: 'none', width: 56 }}>我的账号</span>
              <span style={{ flex: 1, fontSize: 13, color: 'var(--dsw-alias-label-primary)' }}>{a.nickname}</span>
              <span style={{ fontSize: 12, color: 'var(--dsw-alias-label-tertiary)' }}>公开数据模式</span>
            </div>
          ))}
          {benchIn.map(a => (
            <div key={a.secUid || a.link} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid var(--dsw-alias-border-l2)' }}>
              <span style={{ fontSize: 11, color: 'var(--dsw-alias-label-tertiary)', flex: 'none', width: 56 }}>对标账号</span>
              <span style={{ flex: 1, fontSize: 13, color: 'var(--dsw-alias-label-primary)' }}>{a.nickname}</span>
              <span style={{ fontSize: 12, color: 'var(--dsw-alias-label-tertiary)' }}>{a.works.filter(w => w.missing !== true).length} 条作品</span>
            </div>
          ))}
        </section>
      </div>
    </div>
  )
}

/* ── 我的账号·额外账号区（O57，2026-11-14）──────────────────────────────
 * 主平台卡（每平台 1 个登录会话）下方追加：额外自有账号列表 + 添加入口。
 * 添加支持两种来源：①公开数据（DTK，只需主页链接，立即可用）
 *                 ②登录会话采集（提示需扫码——后续版本接多会话）
 */
/* ══════════════════════════════════════════════════════════════════════
 * O57 五轮（2026-11-14 用户拍板 v3/v4 设计稿）：
 *   所有项目页 = 项目手风琴 → 左「我的账号」/ 右「对标账号」→ 列内平台小标题
 *   添加账号 = 一个弹窗（归属 / 项目 / 平台三步 + 实时落位预览）
 *   账号行 = 原生彩色 Artwork + hover ⋯ 菜单（移动到项目 / 转归属 / 移除）
 * 视觉基准全部抄 DSH：ARTWORK 彩色描边渐变、--dsw-alias-* token、
 * sectionTitleStyle/primaryBtnStyle/secondaryBtnStyle/fieldStyle。
 * ══════════════════════════════════════════════════════════════════════ */

/** 统一账号行（四来源归一：主平台登录 / 额外自有 / 对标 / 未登录平台） */
interface UnifiedAccount {
  /** 全局唯一 key = 与 hl-ops-groups-v1 的 accountKey 一致 */
  key: string
  kind: 'own' | 'bench' | 'pending'
  platform: ProviderId
  nickname: string
  /** 主标题下的小字（粉丝/作品等），已格式化 */
  stats: string
  /** 数据可能已过期 */
  stale: boolean
  /** 额外自有账号（public 模式） */
  publicMode?: boolean
  /** 原始引用（点击详情用） */
  source:
    | { type: 'primary'; def: ProviderDef }
    | { type: 'extra'; acct: OwnExtraAccount }
    | { type: 'bench'; acct: BenchAccount }
    | { type: 'pending'; def: ProviderDef }
}

const PLATFORM_ORDER: readonly ProviderId[] = ['douyin', 'shipinhao', 'xhs', 'bilibili']

const PLATFORM_DOT: Record<ProviderId, string> = {
  douyin: 'linear-gradient(135deg,#25F4EE,#FE2C55)',
  shipinhao: '#07c160',
  xhs: '#ff4d6d',
  bilibili: '#00a1d6',
}

function platformName(id: ProviderId): string {
  return PROVIDERS.find(d => d.id === id)?.name ?? id
}

function statsLine(metrics: { label: string; metric: Metric }[]): string {
  return metrics
    .filter(h => h.metric.value !== null && h.metric.value !== undefined)
    .slice(0, 3)
    .map(h => `${h.label} ${fmtNum(h.metric.value, h.metric.format)}`)
    .join(' · ')
}

/** 主平台登录态 → 统一账号（只算已登录的） */
function primaryUnified(snaps: Record<string, PlatformSnapshot>): UnifiedAccount[] {
  const out: UnifiedAccount[] = []
  for (const def of PROVIDERS) {
    const snap = snaps[def.id]
    if (snap === undefined) continue
    out.push({
      key: `own:${def.id}`,
      kind: 'own',
      platform: def.id,
      nickname: snap.nickname ?? def.name,
      stats: statsLine(snap.highlights ?? []),
      stale: ageDays(snap.syncedAt) > STALE_DAYS,
      source: { type: 'primary', def },
    })
  }
  return out
}

function extraUnified(list: OwnExtraAccount[]): UnifiedAccount[] {
  return list.map(acct => ({
    key: `own:${acct.platform}:${acct.accountRef}`,
    kind: 'own' as const,
    platform: acct.platform,
    nickname: acct.nickname,
    stats: statsLine(acct.snap.highlights ?? []),
    stale: ageDays(acct.snap.syncedAt) > STALE_DAYS,
    publicMode: acct.kind === 'public',
    source: { type: 'extra' as const, acct },
  }))
}

function benchUnified(list: BenchAccount[]): UnifiedAccount[] {
  return list.map((acct) => {
    const live = acct.works.filter(w => w.missing !== true)
    const withAsr = live.filter(w => w.asr !== undefined && w.asr !== '').length
    return {
      key: `bench:${acct.secUid || acct.link}`,
      kind: 'bench' as const,
      platform: 'douyin' as ProviderId,
      nickname: acct.nickname,
      stats: `${live.length} 条作品` + (withAsr > 0 ? ` · 文案 ${withAsr} 条` : ''),
      stale: ageDays(acct.syncedAt) > STALE_DAYS,
      source: { type: 'bench' as const, acct },
    }
  })
}

/** 未登录平台（主平台里还没有快照的） */
function pendingUnified(snaps: Record<string, PlatformSnapshot>): UnifiedAccount[] {
  return PROVIDERS.filter(def => snaps[def.id] === undefined).map(def => ({
    key: `pending:${def.id}`,
    kind: 'pending' as const,
    platform: def.id,
    nickname: def.name,
    stats: '点击扫码登录后自动同步',
    stale: false,
    source: { type: 'pending' as const, def },
  }))
}

/* ── 行内 ⋯ 菜单（原生样式） ─────────────────────────────────────────── */
const menuItemStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  width: '100%',
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  textAlign: 'left',
  padding: '7px 9px',
  borderRadius: 7,
  font: 'inherit',
  fontSize: 12.5,
} as const

function AccountRowMenu({ acct, projects, onMove, onRemove, onClose }: {
  acct: UnifiedAccount
  projects: ProjectRecord[]
  onMove: (projectId: string | null) => void
  onRemove: () => void
  onClose: () => void
}): React.JSX.Element {
  const current = accountGroups(acct.key)
  return (
    <div
      onClick={(e) => { e.stopPropagation() }}
      style={{
        position: 'absolute',
        right: 6,
        top: 'calc(100% - 4px)',
        zIndex: 30,
        background: 'var(--dsw-alias-bg-base)',
        border: '1px solid var(--dsw-alias-border-l2)',
        borderRadius: 10,
        boxShadow: '0 10px 28px rgba(0,0,0,.14)',
        padding: 5,
        minWidth: 184,
      }}
    >
      <div style={{ fontSize: 11, color: 'var(--dsw-alias-label-tertiary)', padding: '4px 9px 2px' }}>
        移动到项目（可多选）
      </div>
      {projects.map((p) => {
        const on = current.includes(p.id)
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => { onMove(on ? null : p.id) }}
            style={{ ...menuItemStyle, color: 'var(--dsw-alias-label-primary)' }}
          >
            <span style={{ width: 12, flex: 'none', display: 'inline-flex', alignItems: 'center' }}>
              {on ? <IconCheckOutlineRegular size={12} /> : null}
            </span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
          </button>
        )
      })}
      {projects.length === 0 && (
        <div style={{ fontSize: 11, color: 'var(--dsw-alias-label-tertiary)', padding: '4px 9px 6px' }}>
          先去侧栏建项目
        </div>
      )}
      <div style={{ height: 1, background: 'var(--dsw-alias-border-l2)', margin: '4px 2px' }} />
      <button
        type="button"
        onClick={() => { onRemove(); onClose() }}
        style={{ ...menuItemStyle, color: '#d14343' }}
      >
        {acct.kind === 'pending' ? '从列表隐藏' : '从账号列表移除'}
      </button>
    </div>
  )
}

/* ── 单个账号行（原生 Artwork + 数据 + hover ⋯） ─────────────────────── */
function AccountRow({ acct, projects, onOpen, onChanged, onLogin }: {
  acct: UnifiedAccount
  projects: ProjectRecord[]
  onOpen: (acct: UnifiedAccount) => void
  onChanged: () => void
  onLogin?: (def: ProviderDef) => void
}): React.JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false)
  const [hover, setHover] = useState(false)
  const Art = ARTWORK[acct.platform]
  const uid = `hl_row_${acct.key.replace(/[^a-zA-Z0-9]/g, '_')}`

  const removeAccount = (): void => {
    if (acct.kind === 'bench') {
      saveBench(loadBench().filter(a => `bench:${a.secUid || a.link}` !== acct.key))
    } else if (acct.kind === 'own' && acct.source.type === 'extra') {
      saveOwnExtra(loadOwnExtra().filter(a => `own:${a.platform}:${a.accountRef}` !== acct.key))
    }
    setAccountGroups(acct.key, [])
    onChanged()
  }

  /** 移动到项目：切换该项目的归属（其余归属保留——支持多对多） */
  const moveTo = (projectId: string | null): void => {
    const cur = accountGroups(acct.key)
    if (projectId === null) {
      setAccountGroups(acct.key, [])
    } else {
      setAccountGroups(acct.key, cur.includes(projectId) ? cur.filter(id => id !== projectId) : [...cur, projectId])
    }
    onChanged()
  }

  const rowBorder = acct.kind === 'pending' ? '1px dashed var(--dsw-alias-border-l2)' : '1px solid var(--dsw-alias-border-l2)'
  return (
    <div
      onClick={() => {
        if (acct.kind === 'pending') {
          if (acct.source.type === 'pending' && onLogin !== undefined) onLogin(acct.source.def)
        } else {
          onOpen(acct)
        }
      }}
      onMouseEnter={() => { setHover(true) }}
      onMouseLeave={() => { setHover(false); setMenuOpen(false) }}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        border: rowBorder,
        borderRadius: 10,
        padding: '9px 11px',
        marginBottom: 7,
        cursor: 'pointer',
        background: hover ? 'var(--dsw-alias-interactive-bg-hover)' : 'var(--dsw-alias-bg-base)',
        opacity: acct.stale ? 0.72 : 1,
      }}
    >
      <span style={{ width: 32, height: 32, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }} aria-hidden="true">
        <Art uid={uid} />
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{
            fontSize: 13,
            fontWeight: 500,
            color: acct.kind === 'pending' ? 'var(--dsw-alias-label-secondary)' : 'var(--dsw-alias-label-primary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {acct.nickname}
          </span>
          {acct.stale && (
            <span style={{ fontSize: 10, lineHeight: '15px', padding: '0 5px', borderRadius: 5, color: 'var(--dsw-alias-label-warning, #B45309)', background: 'rgba(180,83,9,.10)', flex: 'none' }}>
              可能已过期
            </span>
          )}
          {acct.publicMode === true && (
            <span style={{ fontSize: 10, lineHeight: '15px', padding: '0 5px', borderRadius: 5, color: 'var(--dsw-alias-label-tertiary)', background: 'rgba(17,17,17,.04)', flex: 'none' }}>
              公开数据
            </span>
          )}
          {acct.kind === 'pending' && (
            <span style={{ fontSize: 10, lineHeight: '15px', padding: '0 5px', borderRadius: 5, color: 'var(--dsw-alias-label-tertiary)', background: 'rgba(17,17,17,.04)', flex: 'none' }}>
              未登录
            </span>
          )}
        </span>
        <span style={{ display: 'block', fontSize: 11, lineHeight: '16px', color: 'var(--dsw-alias-label-tertiary)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {acct.stats}
        </span>
      </span>
      {acct.kind !== 'pending' && (
        <button
          type="button"
          aria-label='更多操作'
          onClick={(e) => { e.stopPropagation(); setMenuOpen(v => !v) }}
          style={{ border: 'none', background: 'transparent', cursor: 'pointer', flex: 'none', color: 'var(--dsw-alias-label-tertiary)', fontSize: 15, lineHeight: 1, padding: '3px 6px', borderRadius: 6, opacity: (hover || menuOpen) ? 1 : 0 }}
        >
          ⋯
        </button>
      )}
      {menuOpen && (
        <AccountRowMenu
          acct={acct}
          projects={projects}
          onMove={moveTo}
          onRemove={removeAccount}
          onClose={() => { setMenuOpen(false) }}
        />
      )}
    </div>
  )
}

/** 列内平台小标题 + 该平台账号 */
function PlatformGroup({ platform, items, projects, onOpen, onChanged, onLogin }: {
  platform: ProviderId
  items: UnifiedAccount[]
  projects: ProjectRecord[]
  onOpen: (acct: UnifiedAccount) => void
  onChanged: () => void
  onLogin?: (def: ProviderDef) => void
}): React.JSX.Element {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 11,
        lineHeight: '16px',
        color: 'var(--dsw-alias-label-tertiary)',
        padding: '2px 2px 5px',
      }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', flex: 'none', background: PLATFORM_DOT[platform] }} />
        {platformName(platform)}
        <span>{items.length}</span>
      </div>
      {items.map(a => (
        <AccountRow
          key={a.key}
          acct={a}
          projects={projects}
          onOpen={onOpen}
          onChanged={onChanged}
          {...(onLogin !== undefined ? { onLogin } : {})}
        />
      ))}
    </div>
  )
}

/** 左右一列（我的 / 对标），内部按平台分组 */
function AccountColumn({ title, items, projects, onOpen, onChanged, onAdd, onLogin }: {
  title: string
  items: UnifiedAccount[]
  projects: ProjectRecord[]
  onOpen: (acct: UnifiedAccount) => void
  onChanged: () => void
  onAdd?: () => void
  onLogin?: (def: ProviderDef) => void
}): React.JSX.Element {
  const byPlat = new Map<ProviderId, UnifiedAccount[]>()
  for (const a of items) {
    const arr = byPlat.get(a.platform) ?? []
    arr.push(a)
    byPlat.set(a.platform, arr)
  }
  const plats = PLATFORM_ORDER.filter(p => byPlat.has(p))
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '2px 2px 8px',
        borderBottom: '1px solid var(--dsw-alias-border-l2)',
        marginBottom: 9,
      }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--dsw-alias-label-primary)' }}>{title}</span>
        <span style={{ fontSize: 11, color: 'var(--dsw-alias-label-tertiary)' }}>{items.length}</span>
        {onAdd !== undefined && (
          <button
            type="button"
            onClick={onAdd}
            style={{
              marginLeft: 'auto',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              font: 'inherit',
              fontSize: 12,
              color: 'var(--dsw-alias-label-tertiary)',
              padding: '2px 6px',
              borderRadius: 6,
            }}
          >
            ＋ 添加
          </button>
        )}
      </div>
      {plats.map(p => (
        <PlatformGroup
          key={p}
          platform={p}
          items={byPlat.get(p) ?? []}
          projects={projects}
          onOpen={onOpen}
          onChanged={onChanged}
          {...(onLogin !== undefined ? { onLogin } : {})}
        />
      ))}
      {items.length === 0 && (
        <div style={{
          border: '1px dashed var(--dsw-alias-border-l2)',
          borderRadius: 10,
          padding: '14px 12px',
          textAlign: 'center',
          fontSize: 12,
          lineHeight: '18px',
          color: 'var(--dsw-alias-label-tertiary)',
        }}>
          这个项目还没有{title}
        </div>
      )}
    </div>
  )
}

/* ── 添加账号弹窗（v4 设计稿落地）───────────────────────────────────────
 * 三个决定：①归属（我的/对标）②项目（chips，默认第一个项目）③平台（点即扫码）
 * 底部实时预览最终落位路径。对标账号走粘链接（平台从域名自动识别）。
 */
function AddAccountModal({ onClose, onAdded, onLogin, initialKind, initialProjectId }: {
  onClose: () => void
  onAdded: () => void
  /** 扫码登录（父级 onCardClick 链路：开窗 → 轮询同步 → 成功自动关窗） */
  onLogin: (def: ProviderDef) => void
  initialKind?: 'own' | 'bench'
  initialProjectId?: string | null
}): React.JSX.Element {
  const projects = loadO56Projects()
  const [kind, setKind] = useState<'own' | 'bench'>(initialKind ?? 'own')
  const [projectId, setProjectId] = useState<string | null>(
    initialProjectId !== undefined ? initialProjectId : (projects[0]?.id ?? null),
  )
  const [platform, setPlatform] = useState<ProviderId>('douyin')
  const [link, setLink] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  const projName = projectId === null ? '未分组' : (projects.find(p => p.id === projectId)?.name ?? projectId)
  const previewPath = `${projName} › ${kind === 'own' ? '我的账号' : '对标账号'} › ${kind === 'own' ? platformName(platform) : '（自动识别）'}`

  /** 对标账号：粘链接 → DTK 采集 → 落库（2026-11-17 核心逻辑抽成
   * collectBenchIntoStore，弹窗与对标 tab 共用一份） */
  const addBench = async (): Promise<void> => {
    setBusy(true)
    const result = await collectBenchIntoStore(link)
    setBusy(false)
    if (result.ok) {
      const secMatch = /\/user\/([A-Za-z0-9_-]{20,})/.exec(link.trim())
      const secUid = secMatch?.[1] ?? ''
      if (projectId !== null) setAccountGroups(`bench:${secUid || link.trim()}`, [projectId])
      onAdded()
      onClose()
      return
    }
    setStatus(result.message)
  }

  /** 我的账号：本版跳到「未登录平台」老链路（扫码窗 + 自动同步 + 自动关窗） */
  const startScan = (): void => {
    const def = PROVIDERS.find(d => d.id === platform)
    if (def === undefined) return
    /* 先把归属写进本地（扫码成功后账号一出现就在正确项目里），再拉起登录窗。
     * onLogin 走父级 onCardClick：开窗 → 轮询同步（6s 后每 4s，最多 45 次）
     * → 同步成功自动关窗（全平台通用，不写平台名判断）。 */
    if (projectId !== null) setAccountGroups(`own:${platform}`, [projectId])
    onAdded()
    onClose()
    onLogin(def)
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 300,
        background: 'rgba(17,17,17,.32)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => { e.stopPropagation() }}
        style={{
          width: 520,
          maxWidth: '100%',
          maxHeight: '88vh',
          overflow: 'auto',
          background: 'var(--dsw-alias-bg-base)',
          borderRadius: 16,
          boxShadow: '0 24px 64px rgba(0,0,0,.24)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 18px 10px' }}>
          <h3 style={{ margin: 0, flex: 1, fontSize: 15, fontWeight: 600, color: 'var(--dsw-alias-label-primary)' }}>
            添加账号
          </h3>
          <button
            type="button"
            onClick={onClose}
            style={{
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              color: 'var(--dsw-alias-label-tertiary)',
              padding: '4px 7px',
              borderRadius: 6,
              display: 'inline-flex',
              alignItems: 'center',
            }}
          >
            <IconCloseOutlineRegular size={14} />
          </button>
        </div>

        <div style={{ padding: '0 18px 4px' }}>
          {/* ① 归属 */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: 'var(--dsw-alias-label-tertiary)', marginBottom: 7 }}>账号归属</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {([
                { id: 'own' as const, t: '我的账号', d: '扫码登录，拿到后台完整数据' },
                { id: 'bench' as const, t: '对标账号', d: '粘主页链接，采公开数据' },
              ]).map((opt) => {
                const on = kind === opt.id
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => { setKind(opt.id) }}
                    style={{
                      flex: 1,
                      textAlign: 'left',
                      border: `1px solid ${on ? 'var(--dsw-alias-label-primary)' : 'var(--dsw-alias-border-l2)'}`,
                      borderRadius: 11,
                      padding: '10px 12px',
                      cursor: 'pointer',
                      font: 'inherit',
                      background: 'var(--dsw-alias-bg-base)',
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--dsw-alias-label-primary)' }}>{opt.t}</div>
                    <div style={{ fontSize: 11, lineHeight: '15px', color: 'var(--dsw-alias-label-tertiary)', marginTop: 1 }}>
                      {opt.d}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* ② 项目 */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: 'var(--dsw-alias-label-tertiary)', marginBottom: 7 }}>
              放到哪个项目 <span style={{ color: '#b0b4b8' }}>（可不选，默认未分组）</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {projects.map((p) => {
                const on = projectId === p.id
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => { setProjectId(on ? null : p.id) }}
                    style={{
                      border: `1px solid ${on ? 'var(--dsw-alias-label-primary)' : 'var(--dsw-alias-border-l2)'}`,
                      background: on ? 'var(--dsw-alias-label-primary)' : 'var(--dsw-alias-bg-base)',
                      color: on ? 'var(--dsw-alias-bg-base)' : 'var(--dsw-alias-label-secondary)',
                      borderRadius: 999,
                      padding: '5px 13px',
                      fontSize: 12.5,
                      cursor: 'pointer',
                      font: 'inherit',
                    }}
                  >
                    {p.name}
                  </button>
                )
              })}
              <button
                type="button"
                onClick={() => { setProjectId(null) }}
                style={{
                  border: `1px solid ${projectId === null ? 'var(--dsw-alias-label-primary)' : 'var(--dsw-alias-border-l2)'}`,
                  background: projectId === null ? 'var(--dsw-alias-label-primary)' : 'var(--dsw-alias-bg-base)',
                  color: projectId === null ? 'var(--dsw-alias-bg-base)' : 'var(--dsw-alias-label-secondary)',
                  borderRadius: 999,
                  padding: '5px 13px',
                  fontSize: 12.5,
                  cursor: 'pointer',
                  font: 'inherit',
                }}
              >
                未分组
              </button>
            </div>
          </div>

          {/* ③ 平台 / 链接 */}
          {kind === 'own' ? (
            <>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: 'var(--dsw-alias-label-tertiary)', marginBottom: 7 }}>
                  选择平台 <span style={{ color: '#b0b4b8' }}>（点一下就开始扫码）</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                  {PROVIDERS.map((def) => {
                    const Art = ARTWORK[def.id]
                    const on = platform === def.id
                    return (
                      <button
                        key={def.id}
                        type="button"
                        onClick={() => { setPlatform(def.id) }}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: 6,
                          border: `1px solid ${on ? 'var(--dsw-alias-label-primary)' : 'var(--dsw-alias-border-l2)'}`,
                          borderRadius: 11,
                          padding: '11px 6px 9px',
                          cursor: 'pointer',
                          font: 'inherit',
                          background: 'var(--dsw-alias-bg-base)',
                        }}
                      >
                        <Art uid={`hl_add_${def.id}`} />
                        <span style={{
                          fontSize: 12,
                          color: on ? 'var(--dsw-alias-label-primary)' : 'var(--dsw-alias-label-secondary)',
                          fontWeight: on ? 500 : 400,
                        }}>
                          {def.name}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
              <div style={{ marginBottom: 16 }}>
                <div style={{
                  border: '1px dashed var(--dsw-alias-border-l2)',
                  borderRadius: 12,
                  padding: 16,
                  background: 'var(--dsw-alias-bg-base)',
                }}>
                  <div style={{ fontSize: 12, lineHeight: '19px', color: 'var(--dsw-alias-label-secondary)' }}>
                    <b style={{ color: 'var(--dsw-alias-label-primary)' }}>用手机「{platformName(platform)}」扫码登录</b>
                    <br />
                    扫码后自动读取账号信息并归位，无需再填任何东西。
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: 'var(--dsw-alias-label-tertiary)', marginBottom: 7 }}>
                粘贴对标账号主页链接
              </div>
              <input
                type="text"
                value={link}
                onChange={(e) => { setLink(e.target.value) }}
                placeholder='https://www.douyin.com/user/...'
                style={fieldStyle}
              />
              <div style={{ fontSize: 11, lineHeight: '16px', color: 'var(--dsw-alias-label-tertiary)', marginTop: 6 }}>
                粘贴后自动识别平台（从域名判断，不用手动选）。
              </div>
            </div>
          )}

          {/* ④ 落位预览 */}
          <div style={{
            borderRadius: 11,
            background: 'rgba(47,109,246,.06)',
            border: '1px solid rgba(47,109,246,.18)',
            padding: '10px 12px',
            fontSize: 12,
            lineHeight: '18px',
            color: 'var(--dsw-alias-label-secondary)',
          }}>
            将添加到 → <b style={{ color: 'var(--dsw-alias-label-primary)' }}>{previewPath}</b>
          </div>
          {status !== null && (
            <div style={{ marginTop: 10, fontSize: 12, color: 'var(--dsw-alias-label-secondary)' }}>{status}</div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 18px 16px' }}>
          <div style={{ flex: 1, fontSize: 11, lineHeight: '16px', color: 'var(--dsw-alias-label-tertiary)' }}>
            {kind === 'own' ? '扫完码会自动落到上面这个位置' : '采集完成后自动落到上面这个位置'}
          </div>
          <button type="button" onClick={onClose} style={secondaryBtnStyle(busy)}>取消</button>
          {kind === 'own' ? (
            <button type="button" style={primaryBtnStyle(busy)} onClick={startScan}>开始扫码</button>
          ) : (
            <button type="button" disabled={busy} style={primaryBtnStyle(busy)} onClick={() => { void addBench() }}>
              {busy ? '采集中…' : '开始采集'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── 「所有项目」页（v3/v4 设计稿落地）────────────────────────────────── */
function AccountsSection({ onOpenUnified, onLogin, platformStates }: {
  onOpenUnified: (acct: UnifiedAccount) => void
  /** 主平台扫码登录（沿用 HeightLabOpsPage.onCardClick 的同步+自动关窗链路） */
  onLogin: (def: ProviderDef) => void
  /** 各平台同步态（busy/error）——显示在页顶 */
  platformStates: Record<string, PlatformState>
}): React.JSX.Element {
  const [projects] = useState<ProjectRecord[]>(loadO56Projects)
  const [tick, setTick] = useState(0)
  const [addOpen, setAddOpen] = useState(false)
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    try {
      const raw = window.localStorage.getItem('hl-ops-group-expand')
      if (raw) return JSON.parse(raw) as Record<string, boolean>
    } catch { /* 忽略 */ }
    return {}
  })

  useEffect(() => {
    const onChange = (): void => { setTick(v => v + 1) }
    window.addEventListener('hl-projects-changed', onChange)
    window.addEventListener('hl-ops-groups-changed', onChange)
    return () => {
      window.removeEventListener('hl-projects-changed', onChange)
      window.removeEventListener('hl-ops-groups-changed', onChange)
    }
  }, [])

  const toggle = (key: string, next: boolean): void => {
    const merged = { ...expanded, [key]: next }
    setExpanded(merged)
    try { window.localStorage.setItem('hl-ops-group-expand', JSON.stringify(merged)) } catch { /* 忽略 */ }
  }
  void tick

  const snaps = loadSnapshots()
  const all: UnifiedAccount[] = [
    ...primaryUnified(snaps),
    ...extraUnified(loadOwnExtra()),
    ...benchUnified(loadBench()),
  ]
  const pending = pendingUnified(snaps)

  const groupsFor = (projectId: string | null): { own: UnifiedAccount[]; bench: UnifiedAccount[] } => {
    const match = (key: string): boolean => {
      const g = accountGroups(key)
      if (projectId === null) return g.length === 0
      return g.includes(projectId)
    }
    return {
      own: all.filter(a => a.kind === 'own' && match(a.key)),
      bench: all.filter(a => a.kind === 'bench' && match(a.key)),
    }
  }

  const renderGroup = (key: string, name: string, projectId: string | null, extra?: UnifiedAccount[]): React.JSX.Element => {
    const { own, bench } = groupsFor(projectId)
    const pendingIn = projectId === null ? (extra ?? []) : []
    const isOpen = expanded[key] ?? (projectId === null && own.length + bench.length > 0)
    return (
      <div key={key} style={{ marginBottom: 8 }}>
        <button
          type="button"
          onClick={() => { toggle(key, !isOpen) }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            width: '100%',
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            font: 'inherit',
            padding: '9px 6px',
            borderRadius: 8,
            textAlign: 'left',
          }}
        >
          <span style={{
            width: 0,
            height: 0,
            flex: 'none',
            transition: 'transform .15s ease',
            transform: isOpen ? 'rotate(90deg)' : 'none',
            borderLeft: '5px solid var(--dsw-alias-label-tertiary)',
            borderTop: '4px solid transparent',
            borderBottom: '4px solid transparent',
          }} />
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--dsw-alias-label-primary)' }}>{name}</span>
          <span style={{ fontSize: 12, color: 'var(--dsw-alias-label-tertiary)' }}>
            {own.length} 个我的账号 · {bench.length} 个对标账号
            {pendingIn.length > 0 ? ` · ${pendingIn.length} 个未登录` : ''}
          </span>
        </button>
        {isOpen && (
          <div style={{ padding: '2px 0 8px 14px' }}>
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              <AccountColumn
                title='我的账号'
                items={[...own, ...pendingIn]}
                projects={projects}
                onOpen={onOpenUnified}
                onChanged={() => { setTick(v => v + 1) }}
                onAdd={() => { setAddOpen(true) }}
                onLogin={onLogin}
              />
              <AccountColumn
                title='对标账号'
                items={bench}
                projects={projects}
                onOpen={onOpenUnified}
                onChanged={() => { setTick(v => v + 1) }}
                onAdd={() => { setAddOpen(true) }}
              />
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 0 10px' }}>
        {Object.entries(platformStates).map(([pid, st]) => {
          if (st.busy !== true && st.error === undefined) return null
          const nm = PROVIDERS.find(d => d.id === pid)?.name ?? pid
          return (
            <span
              key={pid}
              style={{
                fontSize: 12,
                color: st.error !== undefined
                  ? 'var(--dsw-alias-label-warning, #B45309)'
                  : 'var(--dsw-alias-label-tertiary)',
              }}
            >
              {nm}：{st.busy === true ? '同步中…' : String(st.error).slice(0, 40)}
            </span>
          )
        })}
        <span style={{ flex: 1 }} />
        <button type="button" onClick={() => { setAddOpen(true) }} style={primaryBtnStyle(false)}>
          ＋ 添加账号 ▾
        </button>
      </div>
      {projects.map(p => renderGroup(`proj:${p.id}`, p.name, p.id))}
      {renderGroup('ungrouped', '未分组', null, pending)}
      {addOpen && (
        <AddAccountModal
          onClose={() => { setAddOpen(false) }}
          onAdded={() => { setTick(v => v + 1) }}
          onLogin={onLogin}
        />
      )}
    </div>
  )
}

/* ── 项目分组（O57，2026-11-14）：复用 hl-projects-v1，加账号归属 ────────
 * 与 O56 侧栏项目树同一份项目清单——一个项目同时是「对话容器」和「账号容器」，
 * 这样 @ 项目时能一次带全（对话 + 我的账号 + 对标账号 + 品牌档案）。
 * 账号归属存本项目自己的 localStorage（不污染 O56 schema）：
 *   hl-ops-groups-v1 = { version:1, membership: { [accountKey]: projectId[] } }
 * accountKey 形如 "own:douyin:secUid" / "bench:secUid"。
 */
const GROUP_KEY = 'hl-ops-groups-v1'
interface GroupStore {
  version: 1
  membership: Record<string, string[]>
}
function loadGroupStore(): GroupStore {
  try {
    const raw = window.localStorage.getItem(GROUP_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as GroupStore
      if (parsed.version === 1 && parsed.membership) return parsed
    }
  } catch { /* 重建 */ }
  return { version: 1, membership: {} }
}
function saveGroupStore(store: GroupStore): void {
  try { window.localStorage.setItem(GROUP_KEY, JSON.stringify(store)) } catch { /* 满 */ }
  try { window.dispatchEvent(new CustomEvent('hl-ops-groups-changed')) } catch { /* 非浏览器 */ }
}
function accountGroups(key: string): string[] {
  return loadGroupStore().membership[key] ?? []
}
function setAccountGroups(key: string, projectIds: string[]): void {
  const store = loadGroupStore()
  /* 不用 delete（no-dynamic-delete 规则）——重建 membership */
  const next: Record<string, string[]> = {}
  for (const [k, v] of Object.entries(store.membership)) {
    if (k !== key) next[k] = v
  }
  if (projectIds.length > 0) next[key] = projectIds
  store.membership = next
  saveGroupStore(store)
}
/** 复用 O56 的项目清单（sidebar 项目树同一份） */
interface ProjectRecord {
  id: string
  name: string
  createdAt: number
  order: number
}
function loadO56Projects(): ProjectRecord[] {
  try {
    const raw = window.localStorage.getItem('hl-projects-v1')
    if (raw) {
      const parsed = JSON.parse(raw) as { projects?: ProjectRecord[] }
      if (Array.isArray(parsed.projects)) {
        return parsed.projects.slice().sort((a, b) => (a.order || 0) - (b.order || 0) || a.createdAt - b.createdAt)
      }
    }
  } catch { /* 无项目 */ }
  return []
}

/* ── 对标账号增量合并（O57，2026-11-14 用户明确要求）──────────────────
 * 语义：**采集只在已有基础上新增，不从零重来**。
 *   · 已存在作品 → 数据更新为新值，**已转写文案保留**（不重跑 ASR，省钱省时）
 *   · 新出现作品 → 追加（记录 firstSeenAt）
 *   · 本轮未返回   → 标记 missing=true（保留存档，不删）
 *   · 每轮写一条 BenchRun 进 runs（最近 20 条）
 */
function mergeBenchWorks(
  prev: BenchWork[],
  incoming: BenchPostItem[],
): { works: BenchWork[]; added: number; updated: number; missing: number } {
  const now = Date.now()
  const prevMap = new Map(prev.map(w => [w.awemeId, w]))
  let added = 0
  let updated = 0
  for (const it of incoming) {
    const old = prevMap.get(it.contentId)
    if (old === undefined) {
      prevMap.set(it.contentId, {
        awemeId: it.contentId,
        desc: it.title,
        plays: it.stats?.play_count ?? null,
        diggs: it.stats?.digg_count ?? null,
        comments: it.stats?.comment_count ?? null,
        collects: it.stats?.collect_count ?? null,
        shares: it.stats?.share_count ?? null,
        playUrl: it.videoUrl,
        firstSeenAt: now,
        lastSeenAt: now,
      })
      added += 1
    } else {
      /* 数据刷新为新值；asr / firstSeenAt 保留 */
      old.desc = it.title !== '' ? it.title : old.desc
      old.plays = it.stats?.play_count ?? old.plays ?? null
      old.diggs = it.stats?.digg_count ?? old.diggs ?? null
      old.comments = it.stats?.comment_count ?? old.comments ?? null
      old.collects = it.stats?.collect_count ?? old.collects ?? null
      old.shares = it.stats?.share_count ?? old.shares ?? null
      if (it.videoUrl !== null) old.playUrl = it.videoUrl
      old.lastSeenAt = now
      old.missing = false
      updated += 1
    }
  }
  const incomingIds = new Set(incoming.map(i => i.contentId))
  let missing = 0
  for (const w of prevMap.values()) {
    if (!incomingIds.has(w.awemeId) && w.missing !== true) {
      w.missing = true
      missing += 1
    }
  }
  return { works: [...prevMap.values()], added, updated, missing }
}


/**
 * 对标采集落库（2026-11-17 抽取：添加弹窗与对标 tab 共用一份）。
 * 粘链接 → DTK 采集 → mergeBenchWorks 增量合并 → 落 localStorage。
 * 项目组归属由调用方处理（弹窗写项目分组，对标 tab 不干预）。
 *
 * @returns ok=false 时 message 可直接展示给用户
 */
export async function collectBenchIntoStore(url: string): Promise<{ ok: boolean; message: string; nickname?: string }> {
  const trimmed = url.trim()
  if (trimmed === '') return { ok: false, message: '请粘贴对标账号主页链接' }
  const secMatch = /\/user\/([A-Za-z0-9_-]{20,})/.exec(trimmed)
  const secUid = secMatch?.[1] ?? ''
  try {
    const resp = await fetch('/hl/ops/bench-posts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(secUid !== '' ? { sec_user_id: secUid, count: 10 } : { url: trimmed, count: 10 }),
    })
    const payload = (await resp.json().catch(() => null)) as BenchPostsResponse | null
    if (payload?.ok !== true) {
      return { ok: false, message: `采集失败：${String(payload?.message ?? resp.status).slice(0, 140)}` }
    }
    const incoming = payload.data?.items ?? []
    if (incoming.length === 0) return { ok: false, message: '该账号未返回作品。' }
    const existing = loadBench().find(a => a.secUid === secUid || a.link === trimmed)
    const merged = mergeBenchWorks(existing?.works ?? [], incoming)
    const acct: BenchAccount = {
      link: trimmed,
      secUid,
      nickname: incoming[0]?.author ?? existing?.nickname ?? `对标 ${trimmed.slice(-10)}`,
      works: merged.works,
      syncedAt: Date.now(),
      ...(existing?.groups !== undefined ? { groups: existing.groups } : {}),
      ...(existing?.monitor !== undefined ? { monitor: existing.monitor } : {}),
      ...(existing?.monitorIntervalH !== undefined ? { monitorIntervalH: existing.monitorIntervalH } : {}),
      runs: [
        {
          at: Date.now(),
          requested: 10,
          returned: incoming.length,
          added: merged.added,
          updated: merged.updated,
          missing: merged.missing,
        },
        ...(existing?.runs ?? []),
      ].slice(0, 20),
    }
    saveBench([acct, ...loadBench().filter(a => a.secUid !== secUid && a.link !== trimmed)])
    window.dispatchEvent(new CustomEvent('hl-ops-groups-changed'))
    return { ok: true, message: `已采集 ${String(incoming.length)} 条作品`, nickname: acct.nickname }
  } catch (e) {
    return { ok: false, message: `采集失败：${e instanceof Error ? e.message.slice(0, 140) : String(e)}` }
  }
}

/* ── 项目分组（O57，2026-11-14）────────────────────────────────────────────
 * 一个项目 = 账号容器。与 O56 侧栏项目树共用 hl-projects-v1 的项目清单，
 * 所以「@ 项目」能一次带全（对话 + 我的账号 + 对标账号）。
 * 本页职责：看每个项目下挂了哪些账号；给账号分配/移除项目。
 */
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
              {pts.map((p) => {
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


/* ═══ 对标 tab（2026-11-16，O49 核心②）══════════════════════════════ */

const BENCH_ANALYZE_PROMPT = '请分析这个对标账号：1）账号定位与目标受众 2）内容公式（选题/结构/钩子规律）3）优势与可复制点 4）照搬风险与我的差异化建议'

function agoText(at: number): string {
  const h = Math.floor((Date.now() - at) / 3_600_000)
  if (h < 1) return '刚同步'
  if (h < 24) return `${String(h)} 小时前`
  return `${String(Math.floor(h / 24))} 天前`
}

function BenchSection(): React.JSX.Element {
  const [bench, setBench] = useState<BenchAccount[]>(loadBench)
  const [selected, setSelected] = useState<string | null>(null)
  const [sort, setSort] = useState<'score' | 'new' | 'plays'>('score')
  /* 2026-11-17：tab 内直接添加 + 自动监控 + 提取文案 */
  const [addLink, setAddLink] = useState('')
  const [addBusy, setAddBusy] = useState(false)
  const [addStatus, setAddStatus] = useState<string | null>(null)
  const [transcribing, setTranscribing] = useState<string | null>(null)
  const [trStatus, setTrStatus] = useState<string | null>(null)

  useEffect(() => {
    const onChange = (): void => { setBench(loadBench()) }
    window.addEventListener('hl-ops-groups-changed', onChange)
    return () => { window.removeEventListener('hl-ops-groups-changed', onChange) }
  }, [])

  /** 本地改一条对标账号（监控开关/ASR 回填共用），写库+发刷新事件 */
  const patchBench = (key: string, patch: (acct: BenchAccount) => BenchAccount): void => {
    const next = loadBench().map(a => ((a.secUid || a.link) === key ? patch(a) : a))
    saveBench(next)
    setBench(next)
    window.dispatchEvent(new CustomEvent('hl-ops-groups-changed'))
  }

  const addFromLink = async (): Promise<void> => {
    if (addLink.trim() === '') { setAddStatus('请粘贴对标账号主页链接'); return }
    setAddBusy(true)
    setAddStatus('采集中…')
    const result = await collectBenchIntoStore(addLink)
    setAddBusy(false)
    setAddStatus(result.ok ? `${result.message}（${result.nickname ?? ''}）` : result.message)
    if (result.ok) setAddLink('')
  }

  /** 提取文案：DTK 视频 URL → 云端 whisper（600s 上限，按钮转圈不阻塞界面） */
  const transcribe = (acct: BenchAccount, awemeId: string): void => {
    const work = acct.works.find(w => w.awemeId === awemeId)
    const videoUrl = work?.playUrl ?? null
    if (videoUrl === null || videoUrl === '') { setTrStatus('这条作品没有视频地址'); return }
    setTranscribing(awemeId)
    setTrStatus(null)
    fetch('/hl/ops/bench-transcribe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ video_url: videoUrl }),
    })
      .then(r => r.json())
      .then((d) => {
        const text = String(d?.data?.text ?? '').trim()
        if (text === '') { setTrStatus('转写结果为空，可能音频不可用'); return }
        patchBench(acct.secUid || acct.link, a => ({
          ...a,
          works: a.works.map(w => (w.awemeId === awemeId ? { ...w, asr: text.slice(0, 20_000) } : w)),
        }))
      })
      .catch(() => { setTrStatus('转写失败，请稍后重试') })
      .finally(() => { setTranscribing(null) })
  }

  const analyze = (acct: BenchAccount): void => {
    const live = acct.works.filter(w => w.missing !== true)
    const lines = [...live]
      .sort((a, b) => benchWorkScore(b) - benchWorkScore(a))
      .slice(0, 15)
      .map((w, i) => `${String(i + 1)}. ${(w.desc ?? '').slice(0, 40) || '(无标题)'} — 播放 ${String(w.plays ?? '—')} · 赞 ${String(w.diggs ?? '—')} · 评 ${String(w.comments ?? '—')} · 藏 ${String(w.collects ?? '—')} · 转 ${String(w.shares ?? '—')}（综合分 ${String(benchWorkScore(w))}）`)
    const stamp = new Date()
    const hhmm = `${String(stamp.getMonth() + 1).padStart(2, '0')}-${String(stamp.getDate()).padStart(2, '0')} ${String(stamp.getHours()).padStart(2, '0')}:${String(stamp.getMinutes()).padStart(2, '0')}`
    const prompt = `【对标账号 · ${acct.nickname}】共 ${String(live.length)} 条作品，按综合分排序：\n${lines.join('\n')}\n\n${BENCH_ANALYZE_PROMPT}`
    window.dispatchEvent(new CustomEvent('hl:close-hub'))
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('hl:insert-ops-chip', { detail: { label: `对标分析 · ${acct.nickname} · ${hhmm}`, prompt } }))
      setTimeout(() => { window.dispatchEvent(new CustomEvent('hl:submit-draft')) }, 400)
    }, 300)
  }

  const sel = bench.find(b => (b.secUid || b.link) === selected) ?? null

  const addInputStyle: React.CSSProperties = {
    flex: 1, minWidth: 0, height: 32, padding: '0 10px', font: 'inherit', fontSize: 12.5,
    border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 8, background: 'transparent',
    color: 'var(--dsw-alias-label-primary)', outline: 'none',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 }}>
      {/* ── 直接添加（不用跳「所有项目」）── */}
      <div style={{ display: 'flex', gap: 6 }}>
        <input value={addLink} onChange={(e) => { setAddLink(e.target.value) }}
          onKeyDown={(e) => { if (e.key === 'Enter') void addFromLink() }}
          placeholder="粘贴对标账号主页链接，回车采集" style={addInputStyle} />
        <button type="button" disabled={addBusy} onClick={() => { void addFromLink() }} style={primaryBtnStyle(addBusy)}>
          {addBusy ? '采集中…' : '添加对标'}
        </button>
      </div>
      {addStatus !== null && (
        <div style={{ fontSize: 11.5, color: 'var(--dsw-alias-label-tertiary)' }}>{addStatus}</div>
      )}
      {trStatus !== null && (
        <div style={{ fontSize: 11.5, color: 'var(--dsw-alias-label-tertiary)' }}>{trStatus}</div>
      )}

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', minHeight: 0 }}>
        <aside style={{ width: 200, flex: 'none', display: 'flex', flexDirection: 'column', gap: 3 }}>
          <div style={{ fontSize: 11, lineHeight: '16px', color: 'var(--dsw-alias-label-tertiary)', padding: '0 6px 5px' }}>
            对标账号（{bench.length}）
          </div>
          {bench.length === 0 && (
            <div style={{ fontSize: 11, lineHeight: '16px', color: 'var(--dsw-alias-label-tertiary)', padding: '4px 6px' }}>
              粘贴链接添加第一个对标。
            </div>
          )}
          {bench.map((acct) => {
            const key = acct.secUid || acct.link
            const live = acct.works.filter(w => w.missing !== true)
            const hotCount = live.filter(w => isHotWork(w, live)).length
            const active = selected === key
            const monitoring = acct.monitor === true
            return (
              <div
                key={key}
                role="button"
                tabIndex={0}
                onClick={() => { setSelected(active ? null : key) }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSelected(active ? null : key) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, width: '100%', minHeight: 32, padding: '6px 7px',
                  border: 'none', borderRadius: 7, cursor: 'pointer', textAlign: 'left', font: 'inherit',
                  background: active ? 'var(--dsw-alias-interactive-bg-active)' : 'transparent',
                  color: 'var(--dsw-alias-label-primary)',
                }}
              >
                <span style={{ flex: 1, fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{acct.nickname}</span>
                {/* 自动监控开关（行内小钮；调度器按 monitorIntervalH 定时重采） */}
                <span
                  role="checkbox"
                  aria-checked={monitoring}
                  tabIndex={-1}
                  title={monitoring ? `自动监控中 · 每 ${String(acct.monitorIntervalH ?? 6)}h 重采` : '开启自动监控（默认每 6h 重采）'}
                  onClick={(e) => { e.stopPropagation(); patchBench(key, a => ({ ...a, monitor: !monitoring })) }}
                  style={{
                    flex: 'none', fontSize: 10.5, padding: '1px 7px', borderRadius: 999,
                    border: `1px solid ${monitoring ? 'transparent' : 'var(--dsw-alias-border-l2)'}`,
                    background: monitoring ? 'var(--dsw-alias-interactive-bg-active)' : 'transparent',
                    color: monitoring ? 'var(--dsw-alias-label-primary)' : 'var(--dsw-alias-label-tertiary)',
                    cursor: 'pointer', userSelect: 'none',
                  }}
                >
                  ⏰{monitoring ? `${String(acct.monitorIntervalH ?? 6)}h` : '关'}
                </span>
                {hotCount > 0 && <span style={{ fontSize: 10.5, color: HOT_COLOR, flex: 'none' }}>🔥{hotCount}</span>}
              </div>
            )
          })}
        </aside>

        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {sel === null ? (
            <div style={rowDescStyle}>
              点左侧账号看作品墙（爆款角标 = 综合分 ≥ 全账号中位数×2，公式：赞×1+评×3+藏×4+转×5）。
            </div>
          ) : (
            (() => {
              const live = sel.works.filter(w => w.missing !== true)
              const sorted = [...live].sort((a, b) => {
                if (sort === 'score') return benchWorkScore(b) - benchWorkScore(a)
                if (sort === 'plays') return (b.plays ?? 0) - (a.plays ?? 0)
                return (b.firstSeenAt ?? b.lastSeenAt ?? 0) - (a.firstSeenAt ?? a.lastSeenAt ?? 0)
              })
              return (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <h3 style={{ ...sectionTitleStyle, margin: 0, flex: 1 }}>{sel.nickname}</h3>
                    <span style={{ fontSize: 11, color: 'var(--dsw-alias-label-tertiary)' }}>{agoText(sel.syncedAt)} · {live.length} 条作品</span>
                    <button type="button" onClick={() => { analyze(sel) }} style={primaryBtnStyle(false)}>分析作者</button>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {([['score', '综合分'], ['new', '最新'], ['plays', '播放']] as const).map(([k, label]) => (
                      <button key={k} type="button" onClick={() => { setSort(k) }}
                        style={{
                          border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 999, padding: '3px 10px',
                          font: 'inherit', fontSize: 11.5, cursor: 'pointer',
                          background: sort === k ? 'var(--dsw-alias-interactive-bg-active)' : 'transparent',
                          color: sort === k ? 'var(--dsw-alias-label-primary)' : 'var(--dsw-alias-label-tertiary)',
                        }}>
                        {label}
                      </button>
                    ))}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {sorted.map((w) => {
                      const hot = isHotWork(w, live)
                      const hasAsr = w.asr !== undefined && w.asr !== ''
                      const canTranscribe = (w.playUrl ?? '') !== '' && !hasAsr
                      return (
                        <div key={w.awemeId} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderTop: '1px solid var(--dsw-alias-border-l2)', fontSize: 12 }}>
                          {hot && <span style={{ flex: 'none', fontSize: 10.5 }}>🔥</span>}
                          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--dsw-alias-label-primary)' }}>
                            {(w.desc ?? '').slice(0, 40) || '(无标题)'}
                            {hasAsr && <span style={{ marginLeft: 6, fontSize: 10.5, color: 'var(--dsw-alias-label-tertiary)' }}>文案✓</span>}
                          </span>
                          <span style={{ flex: 'none', width: 64, textAlign: 'right', color: 'var(--dsw-alias-label-tertiary)', fontVariantNumeric: 'tabular-nums' }}>播 {(w.plays ?? 0).toLocaleString('zh-CN')}</span>
                          <span style={{ flex: 'none', width: 44, textAlign: 'right', color: 'var(--dsw-alias-label-tertiary)', fontVariantNumeric: 'tabular-nums' }}>赞 {String(w.diggs ?? 0)}</span>
                          <span style={{ flex: 'none', width: 40, textAlign: 'right', color: 'var(--dsw-alias-label-tertiary)', fontVariantNumeric: 'tabular-nums' }}>评 {String(w.comments ?? 0)}</span>
                          <span style={{ flex: 'none', width: 40, textAlign: 'right', color: 'var(--dsw-alias-label-tertiary)', fontVariantNumeric: 'tabular-nums' }}>藏 {String(w.collects ?? 0)}</span>
                          <span style={{ flex: 'none', width: 40, textAlign: 'right', color: 'var(--dsw-alias-label-tertiary)', fontVariantNumeric: 'tabular-nums' }}>转 {String(w.shares ?? 0)}</span>
                          <span style={{ flex: 'none', display: 'flex', gap: 4 }}>
                            {canTranscribe && (
                              <button type="button"
                                disabled={transcribing !== null}
                                onClick={() => { transcribe(sel, w.awemeId) }}
                                style={{ border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 6, padding: '2px 7px', font: 'inherit', fontSize: 10.5, cursor: 'pointer', background: 'transparent', color: 'var(--dsw-alias-label-secondary)' }}>
                                {transcribing === w.awemeId ? '转写中…' : '提取文案'}
                              </button>
                            )}
                            <button type="button"
                              onClick={() => { addPoolItem({ title: (w.desc ?? '').slice(0, 60) || '(无标题)', sourceType: 'bench', sourceRef: w.awemeId, note: `对标「${sel.nickname}」` }) }}
                              style={{ border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 6, padding: '2px 7px', font: 'inherit', fontSize: 10.5, cursor: 'pointer', background: 'transparent', color: 'var(--dsw-alias-label-secondary)' }}>
                              入池
                            </button>
                          </span>
                        </div>
                      )
                    })}
                    {sorted.length === 0 && <div style={rowDescStyle}>这个账号还没有作品数据。</div>}
                  </div>
                </>
              )
            })()
          )}
        </div>
      </div>
    </div>
  )
}

/* ═══ 热点 tab（2026-11-16，O49 核心③）══════════════════════════════ */

const HOTBOARD_CACHE_KEY = 'hl-ops-hotboard-v1'
const HOTBOARD_TTL_MS = 30 * 60_000

function loadHotBoardCache(): { at: number; items: HotBoardItem[] } | null {
  try {
    const raw = window.localStorage.getItem(HOTBOARD_CACHE_KEY)
    if (raw === null) return null
    const parsed = JSON.parse(raw) as { at: number; items: HotBoardItem[] }
    return typeof parsed.at === 'number' && Array.isArray(parsed.items) ? parsed : null
  } catch { return null }
}

function SignalsSection(): React.JSX.Element {
  const [signals, setSignals] = useState(loadSignals)
  const [hot, setHot] = useState<{ at: number; items: HotBoardItem[] } | null>(loadHotBoardCache)
  const [hotState, setHotState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [watchUrl, setWatchUrl] = useState('')
  const [watchNote, setWatchNote] = useState('')
  const [feedbackText, setFeedbackText] = useState('')

  const [benchTick, setBenchTick] = useState(0)
  useEffect(() => {
    const onChange = (): void => { setBenchTick(v => v + 1) }
    window.addEventListener('hl-ops-groups-changed', onChange)
    return () => { window.removeEventListener('hl-ops-groups-changed', onChange) }
  }, [])
  void benchTick   /* 事件驱动的重渲染计数：对标库随 tick 重读 */
  const benchSignals = hotSignalsFromBench(loadBench())

  const refreshHot = (): void => {
    const cached = loadHotBoardCache()
    if (cached !== null && Date.now() - cached.at < HOTBOARD_TTL_MS) {
      setHot(cached)
      return
    }
    setHotState('loading')
    fetch('/hl/ops/hot-board', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ platform: 'douyin' }),
    })
      .then(r => r.json())
      .then((d) => {
        const items = (d?.data?.items ?? []) as HotBoardItem[]
        const next = { at: Date.now(), items }
        setHot(next)
        setHotState('idle')
        try { window.localStorage.setItem(HOTBOARD_CACHE_KEY, JSON.stringify(next)) } catch { /* 满 */ }
      })
      .catch(() => { setHotState('error') })
  }

  useEffect(() => {
    const cached = loadHotBoardCache()
    if (cached === null || Date.now() - cached.at >= HOTBOARD_TTL_MS) refreshHot()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const inputStyle: React.CSSProperties = {
    flex: 1, minWidth: 0, height: 32, padding: '0 10px', font: 'inherit', fontSize: 12.5,
    border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 8, background: 'transparent',
    color: 'var(--dsw-alias-label-primary)', outline: 'none',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <section>
        <h3 style={{ ...sectionTitleStyle, marginBottom: 10 }}>对标高表现</h3>
        {benchSignals.length === 0 ? (
          <div style={rowDescStyle}>近 7 天对标账号没有新爆款。在对标 tab 添加账号并采集后，这里会自动出现信号。</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {benchSignals.slice(0, 10).map(sig => (
              <a key={sig.awemeId} href={sig.webUrl} target="_blank" rel="noreferrer"
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderTop: '1px solid var(--dsw-alias-border-l2)', fontSize: 12.5, textDecoration: 'none', color: 'var(--dsw-alias-label-primary)' }}>
                <span style={{ flex: 'none', fontSize: 10.5, color: HOT_COLOR }}>🔥 {sig.score}</span>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sig.desc || '(无标题)'}</span>
                <span style={{ flex: 'none', fontSize: 11, color: 'var(--dsw-alias-label-tertiary)' }}>{sig.benchNickname} · 播 {(sig.plays ?? 0).toLocaleString('zh-CN')}</span>
              </a>
            ))}
          </div>
        )}
      </section>

      <section>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <h3 style={{ ...sectionTitleStyle, margin: 0, flex: 1 }}>抖音热榜</h3>
          {hot !== null && <span style={{ fontSize: 11, color: 'var(--dsw-alias-label-tertiary)' }}>更新于 {agoText(hot.at)}</span>}
          <button type="button" onClick={refreshHot} style={primaryBtnStyle(false)}>
            {hotState === 'loading' ? '拉取中…' : '刷新'}
          </button>
        </div>
        {hotState === 'error' ? (
          <div style={rowDescStyle}>热榜暂时拉不到（服务端接口未部署或网络问题）。手动关注和用户反馈不受影响。</div>
        ) : hot === null || hot.items.length === 0 ? (
          <div style={rowDescStyle}>{hotState === 'loading' ? '正在拉取热榜…' : '还没有热榜数据，点右上角刷新。'}</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {hot.items.slice(0, 20).map((it, i) => (
              <a key={it.webUrl || i} href={it.webUrl} target="_blank" rel="noreferrer"
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderTop: '1px solid var(--dsw-alias-border-l2)', fontSize: 12.5, textDecoration: 'none', color: 'var(--dsw-alias-label-primary)' }}>
                <span style={{ flex: 'none', width: 22, fontSize: 11, color: (it.rank ?? 99) <= 3 ? DANGER_COLOR : 'var(--dsw-alias-label-tertiary)', fontVariantNumeric: 'tabular-nums' }}>
                  {it.rank === null ? '—' : String(it.rank)}
                </span>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.word}</span>
                {it.hotValue !== null && <span style={{ flex: 'none', fontSize: 11, color: 'var(--dsw-alias-label-tertiary)', fontVariantNumeric: 'tabular-nums' }}>{formatHotValue(it.hotValue)}</span>}
                <button type="button"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); addPoolItem({ title: it.word, sourceType: 'hot', sourceRef: it.webUrl }) }}
                  style={{ flex: 'none', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 6, padding: '1px 6px', font: 'inherit', fontSize: 10.5, cursor: 'pointer', background: 'transparent', color: 'var(--dsw-alias-label-secondary)' }}>
                  入池
                </button>
              </a>
            ))}
          </div>
        )}
      </section>

      <section>
        <h3 style={{ ...sectionTitleStyle, marginBottom: 10 }}>手动关注</h3>
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          <input value={watchUrl} onChange={(e) => { setWatchUrl(e.target.value) }} placeholder="作品/账号链接" style={inputStyle} />
          <input value={watchNote} onChange={(e) => { setWatchNote(e.target.value) }} placeholder="备注（可选）" style={{ ...inputStyle, maxWidth: 140 }} />
          <button type="button" disabled={watchUrl.trim() === ''}
            onClick={() => { setSignals(addWatch(watchUrl, watchNote)); setWatchUrl(''); setWatchNote('') }}
            style={primaryBtnStyle(watchUrl.trim() === '')}>
            添加
          </button>
        </div>
        {signals.watch.length === 0 ? (
          <div style={rowDescStyle}>刷到好东西随手贴进来，攒选题时用。</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {signals.watch.map(w => (
              <div key={w.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderTop: '1px solid var(--dsw-alias-border-l2)', fontSize: 12.5 }}>
                <a href={w.url} target="_blank" rel="noreferrer" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--dsw-alias-label-primary)', textDecoration: 'none' }}>
                  {w.note !== '' ? w.note : w.url}
                </a>
                <span style={{ flex: 'none', fontSize: 11, color: 'var(--dsw-alias-label-tertiary)' }}>{agoText(w.at)}</span>
                <button type="button" onClick={() => { addPoolItem({ title: w.note !== '' ? w.note : w.url, sourceType: 'watch', sourceRef: w.id }) }}
                  style={{ flex: 'none', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 6, padding: '1px 6px', font: 'inherit', fontSize: 10.5, cursor: 'pointer', background: 'transparent', color: 'var(--dsw-alias-label-secondary)' }}>
                  入池
                </button>
                <button type="button" onClick={() => { setSignals(removeWatch(w.id)) }}
                  style={{ flex: 'none', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 11, color: 'var(--dsw-alias-label-tertiary)', padding: '2px 4px' }}>
                  删除
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h3 style={{ ...sectionTitleStyle, marginBottom: 10 }}>用户反馈</h3>
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          <input value={feedbackText} onChange={(e) => { setFeedbackText(e.target.value) }} placeholder="评论/私信里的真实需求，随手记下来" style={inputStyle} />
          <button type="button" disabled={feedbackText.trim() === ''}
            onClick={() => { setSignals(addFeedback(feedbackText)); setFeedbackText('') }}
            style={primaryBtnStyle(feedbackText.trim() === '')}>
            记下
          </button>
        </div>
        {signals.feedback.length === 0 ? (
          <div style={rowDescStyle}>用户的原话是最真实的选题来源。</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {signals.feedback.map(f => (
              <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderTop: '1px solid var(--dsw-alias-border-l2)', fontSize: 12.5 }}>
                <span style={{ flex: 1, minWidth: 0, color: 'var(--dsw-alias-label-primary)' }}>{f.text}</span>
                <span style={{ flex: 'none', fontSize: 11, color: 'var(--dsw-alias-label-tertiary)' }}>{agoText(f.at)}</span>
                <button type="button" onClick={() => { addPoolItem({ title: f.text.slice(0, 60), sourceType: 'feedback', sourceRef: f.id, note: '用户反馈' }) }}
                  style={{ flex: 'none', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 6, padding: '1px 6px', font: 'inherit', fontSize: 10.5, cursor: 'pointer', background: 'transparent', color: 'var(--dsw-alias-label-secondary)' }}>
                  入池
                </button>
                <button type="button" onClick={() => { setSignals(removeFeedback(f.id)) }}
                  style={{ flex: 'none', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 11, color: 'var(--dsw-alias-label-tertiary)', padding: '2px 4px' }}>
                  删除
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

/* ═══ 选题池 tab（2026-11-17，O49 设计 §2.3 贯穿对象）══════════════ */

function PoolSection(): React.JSX.Element {
  const [pool, setPool] = useState(loadPool)
  const [filter, setFilter] = useState<PoolStatus | '全部'>('候选')

  useEffect(() => {
    const onChange = (): void => { setPool(loadPool()) }
    window.addEventListener('hl-ops-groups-changed', onChange)
    return () => { window.removeEventListener('hl-ops-groups-changed', onChange) }
  }, [])

  /* 「去创作」：运营胶囊链路——选题+备注进聊天，用户确认后 AI 开工 */
  const createFrom = (item: { title: string; note: string }): void => {
    const stamp = new Date()
    const hhmm = `${String(stamp.getMonth() + 1).padStart(2, '0')}-${String(stamp.getDate()).padStart(2, '0')} ${String(stamp.getHours()).padStart(2, '0')}:${String(stamp.getMinutes()).padStart(2, '0')}`
    const prompt = `请围绕这个选题帮我创作内容：${item.title}${item.note !== '' ? `\n补充说明：${item.note}` : ''}`
    window.dispatchEvent(new CustomEvent('hl:close-hub'))
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('hl:insert-ops-chip', { detail: { label: `选题 · ${item.title.slice(0, 18)} · ${hhmm}`, prompt } }))
      setTimeout(() => { window.dispatchEvent(new CustomEvent('hl:submit-draft')) }, 400)
    }, 300)
  }

  const shown = pool.filter(i => filter === '全部' || i.status === filter)
  const pending = poolPendingCount(pool)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <h3 style={{ ...sectionTitleStyle, margin: 0, flex: 1 }}>选题池{pending > 0 ? ` · ${String(pending)} 个候选` : ''}</h3>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['候选', '已用', '放弃', '全部'] as const).map(k => (
            <button key={k} type="button" onClick={() => { setFilter(k) }}
              style={{
                border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 999, padding: '3px 10px',
                font: 'inherit', fontSize: 11.5, cursor: 'pointer',
                background: filter === k ? 'var(--dsw-alias-interactive-bg-active)' : 'transparent',
                color: filter === k ? 'var(--dsw-alias-label-primary)' : 'var(--dsw-alias-label-tertiary)',
              }}>
              {k}
            </button>
          ))}
        </div>
      </div>
      {pool.length === 0 ? (
        <div style={rowDescStyle}>
          选题池是空的。在对标作品、热榜、手动关注、用户反馈上点「入池」，好点子会汇聚到这里。
        </div>
      ) : shown.length === 0 ? (
        <div style={rowDescStyle}>这个状态下还没有选题。</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {shown.map(item => (
            <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 0', borderTop: '1px solid var(--dsw-alias-border-l2)', fontSize: 12.5 }}>
              <span style={{
                flex: 'none', fontSize: 10.5, padding: '1px 7px', borderRadius: 999,
                border: '1px solid var(--dsw-alias-border-l2)',
                color: item.status === '候选' ? 'var(--dsw-alias-label-primary)' : 'var(--dsw-alias-label-tertiary)',
              }}>
                {POOL_SOURCE_LABELS[item.sourceType]} · {item.status}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ color: 'var(--dsw-alias-label-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                  {item.title}
                </span>
                {item.note !== '' && (
                  <span style={{ fontSize: 11, color: 'var(--dsw-alias-label-tertiary)' }}>{item.note}</span>
                )}
              </span>
              <span style={{ flex: 'none', fontSize: 11, color: 'var(--dsw-alias-label-tertiary)' }}>{agoText(item.createdAt)}</span>
              <span style={{ flex: 'none', display: 'flex', gap: 4 }}>
                {item.status === '候选' && (
                  <button type="button" onClick={() => { createFrom(item) }}
                    style={{ border: 'none', borderRadius: 6, padding: '3px 9px', font: 'inherit', fontSize: 11, cursor: 'pointer', background: 'var(--dsw-alias-label-primary)', color: 'var(--dsw-alias-bg-base)' }}>
                    去创作
                  </button>
                )}
                {item.status !== '已用' && (
                  <button type="button" onClick={() => { setPool(setPoolStatus(item.id, '已用')) }}
                    style={{ border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 6, padding: '3px 7px', font: 'inherit', fontSize: 11, cursor: 'pointer', background: 'transparent', color: 'var(--dsw-alias-label-secondary)' }}>
                    已用
                  </button>
                )}
                {item.status !== '放弃' && (
                  <button type="button" onClick={() => { setPool(setPoolStatus(item.id, '放弃')) }}
                    style={{ border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 6, padding: '3px 7px', font: 'inherit', fontSize: 11, cursor: 'pointer', background: 'transparent', color: 'var(--dsw-alias-label-secondary)' }}>
                    放弃
                  </button>
                )}
                {item.status !== '候选' && (
                  <button type="button" onClick={() => { setPool(setPoolStatus(item.id, '候选')) }}
                    style={{ border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 6, padding: '3px 7px', font: 'inherit', fontSize: 11, cursor: 'pointer', background: 'transparent', color: 'var(--dsw-alias-label-secondary)' }}>
                    恢复
                  </button>
                )}
                <button type="button" onClick={() => { setPool(removePoolItem(item.id)) }}
                  style={{ border: 'none', borderRadius: 6, padding: '3px 6px', font: 'inherit', fontSize: 11, cursor: 'pointer', background: 'transparent', color: 'var(--dsw-alias-label-tertiary)' }}>
                  删
                </button>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ═══ 内容 tab（2026-11-17，O49 核心④⑤ v1）══════════════════════════
 * v1 范围（务实）：文案库 = 全部已转写口播文案的聚合视图；
 * 拆解 = 13 字段结构化提示词走运营胶囊进聊天（结果在对话里迭代）。
 * 结构化解析入库 + cite 高亮是 v2（需服务端 LLM 管线）。 */

const DECONSTRUCT_PROMPT = `请把上面的口播文案按以下 13 个字段拆解，用 JSON 输出：
topic（主题）/ target_audience（目标受众）/ user_problem（用户痛点）/
hook（前3秒钩子：text+mechanism 为什么有效）/ structure（内容结构：name+span+weight）/
key_turns（关键转折句）/ evidence（论据）/ emotional_mechanisms（情绪机制）/
golden_quotes（金句）/ cta（行动号召）/ comment_triggers（引发评论的点）/
reusable（可借鉴的）/ non_reusable（不该照搬的）。
规则：每个结论必须引用原文片段（cite）；教你学方法，不是抄。`

function ContentSection(): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [benchTick, setBenchTick] = useState(0)
  useEffect(() => {
    const onChange = (): void => { setBenchTick(v => v + 1) }
    window.addEventListener('hl-ops-groups-changed', onChange)
    return () => { window.removeEventListener('hl-ops-groups-changed', onChange) }
  }, [])
  void benchTick

  /* 结构化拆解入库（v2）：走桥端点调 flash，结果存本地库可复查 */
  const [analyzing, setAnalyzing] = useState<string | null>(null)
  const [anaStatus, setAnaStatus] = useState<string | null>(null)
  const analyzeStore = (entry: AsrEntry): void => {
    setAnalyzing(entry.awemeId)
    setAnaStatus(null)
    fetch('/hl/ops/analyze', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: entry.asr, title: entry.desc.slice(0, 40) }),
    })
      .then(r => r.json())
      .then((d) => {
        if (d?.ok === true) {
          setAnaStatus(`已入库（${String(d.id)}，${String(d.fields ?? 13)}/13 字段${d.deduped === true ? '，去重命中' : ''}）。面板重启后内容库可见结构化结果。`)
        } else {
          setAnaStatus(`入库失败：${String(d?.message ?? d?.error ?? '未知')}`)
        }
      })
      .catch(() => { setAnaStatus('入库失败：宿主不可达') })
      .finally(() => { setAnalyzing(null) })
  }

  const library = asrLibrary(loadBench())
  const q = query.trim().toLowerCase()
  const shown = q === ''
    ? library
    : library.filter(e => e.asr.toLowerCase().includes(q) || e.desc.toLowerCase().includes(q))

  const deconstruct = (entry: AsrEntry): void => {
    const stamp = new Date()
    const hhmm = `${String(stamp.getMonth() + 1).padStart(2, '0')}-${String(stamp.getDate()).padStart(2, '0')} ${String(stamp.getHours()).padStart(2, '0')}:${String(stamp.getMinutes()).padStart(2, '0')}`
    const prompt = `【口播文案 · ${entry.benchNickname}「${entry.desc || '无标题'}」】\n${entry.asr}\n\n${DECONSTRUCT_PROMPT}`
    window.dispatchEvent(new CustomEvent('hl:close-hub'))
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('hl:insert-ops-chip', { detail: { label: `拆解 · ${entry.desc.slice(0, 16) || '文案'} · ${hhmm}`, prompt } }))
      setTimeout(() => { window.dispatchEvent(new CustomEvent('hl:submit-draft')) }, 400)
    }, 300)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <h3 style={{ ...sectionTitleStyle, margin: 0, flex: 1 }}>文案库（{library.length}）</h3>
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value) }}
          placeholder="搜索文案内容"
          style={{
            width: 220, height: 30, padding: '0 10px', font: 'inherit', fontSize: 12,
            border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 8, background: 'transparent',
            color: 'var(--dsw-alias-label-primary)', outline: 'none',
          }}
        />
      </div>
      {library.length === 0 ? (
        <div style={rowDescStyle}>
          {anaStatus !== null ? anaStatus : '还没有文案。到「对标」tab 点任意作品的「提取文案」，转写后的口播会汇聚到这里。'}
        </div>
      ) : shown.length === 0 ? (
        <div style={rowDescStyle}>没有匹配「{query}」的文案。</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {shown.map((entry) => {
            const open = expanded === entry.awemeId
            return (
              <div key={entry.awemeId} style={{ borderTop: '1px solid var(--dsw-alias-border-l2)', padding: '9px 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
                  <button type="button" onClick={() => { setExpanded(open ? null : entry.awemeId) }}
                    style={{ flex: 1, minWidth: 0, border: 'none', background: 'transparent', cursor: 'pointer', font: 'inherit', textAlign: 'left', color: 'var(--dsw-alias-label-primary)', padding: 0 }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                      {entry.desc || '(无标题)'}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--dsw-alias-label-tertiary)' }}>
                      {entry.benchNickname} · {entry.asr.length} 字{entry.lastSeenAt > 0 ? ` · ${agoText(entry.lastSeenAt)}` : ''}
                    </span>
                  </button>
                  <button type="button" onClick={() => { deconstruct(entry) }}
                    style={{ flex: 'none', border: 'none', borderRadius: 6, padding: '3px 9px', font: 'inherit', fontSize: 11, cursor: 'pointer', background: 'var(--dsw-alias-label-primary)', color: 'var(--dsw-alias-bg-base)' }}>
                    拆解
                  </button>
                  <button type="button" disabled={analyzing !== null}
                    onClick={() => { analyzeStore(entry) }}
                    style={{ flex: 'none', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 6, padding: '2px 7px', font: 'inherit', fontSize: 10.5, cursor: 'pointer', background: 'transparent', color: 'var(--dsw-alias-label-secondary)' }}>
                    {analyzing === entry.awemeId ? '入库中…' : '拆解入库'}
                  </button>
                  <button type="button"
                    onClick={() => { addPoolItem({ title: entry.desc.slice(0, 60) || '口播文案', sourceType: 'bench', sourceRef: entry.awemeId, note: `文案 · ${entry.benchNickname}` }) }}
                    style={{ flex: 'none', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 6, padding: '2px 7px', font: 'inherit', fontSize: 10.5, cursor: 'pointer', background: 'transparent', color: 'var(--dsw-alias-label-secondary)' }}>
                    入池
                  </button>
                  <a href={entry.playUrl} target="_blank" rel="noreferrer"
                    style={{ flex: 'none', fontSize: 11, color: 'var(--dsw-alias-label-tertiary)', textDecoration: 'none' }}>
                    原作 ↗
                  </a>
                </div>
                {open && (
                  <div style={{ marginTop: 8, fontSize: 12, lineHeight: 1.7, color: 'var(--dsw-alias-label-secondary)', whiteSpace: 'pre-wrap', maxHeight: 260, overflowY: 'auto' }}>
                    {entry.asr}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ═══ 复盘 tab（2026-11-17，O49 核心⑥）══════════════════════════════
 * 设计 §11：发布证据链 + 补录 + 纯规则复盘 + 规则建议审批链 + 经验库。
 * 盲预测锁定（integrity_hash 数据可信体系）诚实留 v2——v1 用账号基线
 * 做对照锚并明确标注。 */

function RetroSection(): React.JSX.Element {
  const [records, setRecords] = useState<PublishRecord[]>(loadRecords)
  const [rules, setRules] = useState(loadRules)
  const [expanded, setExpanded] = useState<string | null>(null)
  /* 补录表单（9.6 工作台外已发布内容） */
  const [addTitle, setAddTitle] = useState('')
  const [addProvider, setAddProvider] = useState<ProviderId>('douyin')
  const [addAt, setAddAt] = useState('')
  const [addStatus, setAddStatus] = useState<string | null>(null)
  /* 盲预测录入（7.9-7.15）：零快照窗口内的四档选择器 */
  const [predicting, setPredicting] = useState<string | null>(null)
  const [predStatus, setPredStatus] = useState<string | null>(null)

  /* 防篡改自检：有盲预测的记录逐个验 hash，不符进 broken 集合（徽标变红） */
  const [brokenPred, setBrokenPred] = useState<ReadonlySet<string>>(new Set())

  useEffect(() => {
    const onChange = (): void => {
      setRecords(loadRecords())
      setRules(loadRules())
    }
    window.addEventListener('hl-ops-groups-changed', onChange)
    return () => { window.removeEventListener('hl-ops-groups-changed', onChange) }
  }, [])

  useEffect(() => {
    let alive = true
    void (async () => {
      const broken = new Set<string>()
      for (const r of records) {
        if (r.prediction !== undefined && !(await predictionIntact(r))) broken.add(r.id)
      }
      if (alive) setBrokenPred(broken)
    })()
    return () => { alive = false }
  }, [records])

  /** 账号基线：该平台快照作品的平均播放（无则 null=数据不足口径） */
  const baselineOf = (provider: ProviderId): number | null => {
    const works = loadSnapshots()[provider]?.works ?? []
    const withPlays = works.filter(w => typeof w.plays === 'number' && (w.plays ?? 0) > 0)
    if (withPlays.length === 0) return null
    return withPlays.reduce((sum, w) => sum + (w.plays ?? 0), 0) / withPlays.length
  }

  const addManual = (): void => {
    if (addTitle.trim() === '') { setAddStatus('请填标题'); return }
    if (addAt === '') { setAddStatus('请选择发布时间'); return }
    const publishedAt = new Date(addAt).getTime()
    if (!Number.isFinite(publishedAt)) { setAddStatus('时间格式不对'); return }
    const rec: PublishRecord = {
      id: `pub-${String(Date.now())}-${Math.random().toString(36).slice(2, 8)}`,
      projectId: 'default',
      provider: addProvider,
      title: addTitle.trim(),
      description: '',
      tags: [],
      publishedAt,
      snapshots: [],
    }
    const next = [rec, ...records]
    saveRecords(next)
    setRecords(next)
    setAddTitle('')
    setAddAt('')
    setAddStatus('已补录，T+N 快照会随账号同步自动回填')
  }

  const retroOf = (rec: PublishRecord): RetroResult => retroVerdict(rec, baselineOf(rec.provider))

  /** 盲预测录入：零快照窗口内允许（7.15 之后永远锁死），写 hash 锁定 */
  const makePrediction = async (rec: PublishRecord, tier: PredictTier): Promise<void> => {
    if (!predictionOpen(rec)) { setPredStatus('首个快照已落地，预测锁定不可补录'); return }
    const madeAt = Date.now()
    const hash = await predictionHash(rec.id, tier, madeAt)
    const next = records.map(r => (r.id === rec.id ? { ...r, prediction: { tier, madeAt, hash } } : r))
    saveRecords(next)
    setRecords(next)
    setPredicting(null)
    setPredStatus(`已锁定预测「${tier}」（integrity_hash ${hash.slice(0, 8)}…）`)
  }

  const suggest = (rec: PublishRecord): void => {
    const item = ruleSuggestion(rec, retroOf(rec))
    if (item === null) { setAddStatus('数据不足，生成不了建议'); return }
    setRules(addRule(item))
  }

  const VERDICT_COLORS: Record<string, string> = {
    起量: HOT_COLOR, 高于: SUCCESS_COLOR, 接近: 'var(--dsw-alias-label-secondary)', 低于: DANGER_COLOR, 数据不足: 'var(--dsw-alias-label-tertiary)',
  }

  const inputStyleR: React.CSSProperties = {
    height: 30, padding: '0 10px', font: 'inherit', fontSize: 12,
    border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 8, background: 'transparent',
    color: 'var(--dsw-alias-label-primary)', outline: 'none',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* ── 发布证据链 + 复盘报告 ── */}
      <section>
        <h3 style={{ ...sectionTitleStyle, marginBottom: 10 }}>发布证据链（{records.length}）</h3>
        {records.length === 0 ? (
          <div style={rowDescStyle}>还没有发布记录。发布后（或下方补录）会按 T+1h/6h/24h/72h/168h 自动采快照。</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {records.map((rec) => {
              const chain = snapshotChain(rec)
              const retro = retroOf(rec)
              const open = expanded === rec.id
              return (
                <div key={rec.id} style={{ borderTop: '1px solid var(--dsw-alias-border-l2)', padding: '9px 0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
                    <button type="button" onClick={() => { setExpanded(open ? null : rec.id) }}
                      style={{ flex: 1, minWidth: 0, border: 'none', background: 'transparent', cursor: 'pointer', font: 'inherit', textAlign: 'left', color: 'var(--dsw-alias-label-primary)', padding: 0 }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                        {rec.title || '(无标题)'}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--dsw-alias-label-tertiary)' }}>
                        {PROVIDERS.find(d => d.id === rec.provider)?.name ?? rec.provider} · {agoText(rec.publishedAt)}发布
                      </span>
                    </button>
                    {/* T+N 证据链圆点：绿=已采 黄=到点待采 灰=未到期 红=错过 */}
                    <span style={{ flex: 'none', display: 'flex', gap: 4 }}>
                      {chain.map(p => (
                        <span key={p.hour} title={`T+${String(p.hour)}h ${p.state}${p.plays !== null ? ` · ${String(p.plays)} 播` : ''}`}
                          style={{ width: 9, height: 9, borderRadius: 5, background: p.state === 'taken' ? SUCCESS_COLOR : p.state === 'due' ? HOT_COLOR : p.state === 'missed' ? DANGER_COLOR : 'var(--dsw-alias-border-l2)' }} />
                      ))}
                    </span>
                    {/* 盲预测：已锁定显 🔒档；零快照窗口内给录入钮（7.15） */}
                    {rec.prediction !== undefined && (
                      <span style={{
                        flex: 'none', fontSize: 11,
                        color: brokenPred.has(rec.id) ? DANGER_COLOR : 'var(--dsw-alias-label-secondary)',
                      }} title={brokenPred.has(rec.id) ? '⚠️ integrity_hash 校验失败：预测可能被篡改' : '盲预测已锁定（integrity_hash 校验通过）'}>
                        {brokenPred.has(rec.id) ? '⚠️预测' : '🔒预测'} {rec.prediction.tier}
                      </span>
                    )}
                    {rec.prediction === undefined && predictionOpen(rec) && (
                      predicting === rec.id ? (
                        <span style={{ flex: 'none', display: 'flex', gap: 3 }}>
                          {PREDICT_TIERS.map(t => (
                            <button key={t} type="button" onClick={() => { void makePrediction(rec, t) }}
                              style={{ border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 6, padding: '1px 6px', font: 'inherit', fontSize: 10.5, cursor: 'pointer', background: 'transparent', color: 'var(--dsw-alias-label-secondary)' }}>
                              {t}
                            </button>
                          ))}
                        </span>
                      ) : (
                        <button type="button" onClick={() => { setPredicting(rec.id) }}
                          style={{ flex: 'none', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 6, padding: '1px 6px', font: 'inherit', fontSize: 10.5, cursor: 'pointer', background: 'transparent', color: 'var(--dsw-alias-label-secondary)' }}>
                          录预测
                        </button>
                      )
                    )}
                    <span style={{ flex: 'none', fontSize: 11.5, fontWeight: 600, color: VERDICT_COLORS[retro.verdict] ?? 'inherit' }}>
                      {retro.verdict}
                      {retro.heat !== null ? ` · ${retro.heat}` : ''}
                    </span>
                    <button type="button" onClick={() => { suggest(rec) }}
                      style={{ flex: 'none', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 6, padding: '2px 7px', font: 'inherit', fontSize: 10.5, cursor: 'pointer', background: 'transparent', color: 'var(--dsw-alias-label-secondary)' }}>
                      生成建议
                    </button>
                  </div>
                  {open && (
                    <div style={{ marginTop: 8, fontSize: 11.5, color: 'var(--dsw-alias-label-tertiary)', lineHeight: 1.8 }}>
                      <div>{retro.basis}{retro.ratio !== null ? `（${retro.ratio.toFixed(2)}×）` : ''}</div>
                      {retro.prediction !== null && (
                        <div>
                          盲预测对照：预测「{retro.prediction.tier}」vs 实际「{retro.verdict}」——
                          {retro.prediction.hit ? '✓ 猜中' : `偏差 ${String(retro.prediction.deviation)} 档`}
                        </div>
                      )}
                      <div>{chain.map(p => `T+${String(p.hour)}h:${p.state === 'taken' ? `${String(p.plays ?? '—')} 播` : { due: '待采', missed: '错过', future: '未到期' }[p.state]}`).join(' · ')}</div>
                      <div style={{ marginTop: 4 }}>对照锚 = 账号基线（作品均播）。盲预测锁定（integrity_hash）随数据可信体系 v2 上线。</div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* ── 补录 ── */}
      <section>
        <h3 style={{ ...sectionTitleStyle, marginBottom: 10 }}>补录已发布内容</h3>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input value={addTitle} onChange={(e) => { setAddTitle(e.target.value) }} placeholder="标题" style={{ ...inputStyleR, flex: 2, minWidth: 0 }} />
          <select value={addProvider} onChange={(e) => { setAddProvider(e.target.value as ProviderId) }} style={{ ...inputStyleR, flex: 'none' }}>
            {PROVIDERS.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <input type="datetime-local" value={addAt} onChange={(e) => { setAddAt(e.target.value) }} style={{ ...inputStyleR, flex: 'none' }} />
          <button type="button" onClick={addManual} style={primaryBtnStyle(false)}>补录</button>
        </div>
        {addStatus !== null && <div style={{ fontSize: 11.5, color: 'var(--dsw-alias-label-tertiary)', marginTop: 6 }}>{addStatus}</div>}
        {predStatus !== null && <div style={{ fontSize: 11.5, color: 'var(--dsw-alias-label-tertiary)', marginTop: 4 }}>{predStatus}</div>}
      </section>

      {/* ── 经验库（规则建议审批链 11.11）── */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <h3 style={{ ...sectionTitleStyle, margin: 0, flex: 1 }}>经验库（{rules.length}）</h3>
          <span style={{ fontSize: 11, color: 'var(--dsw-alias-label-tertiary)' }}>
            {(() => {
              const stats = calibrationStats(records, r => baselineOf(r.provider))
              return stats.judged > 0 ? `盲预测校准率 ${String(stats.hit)}/${String(stats.judged)}（${String(Math.round((stats.hit / stats.judged) * 100))}%）· ` : ''
            })()}
            建议需人工批准才进 AI 分析上下文
          </span>
        </div>
        {rules.length === 0 ? (
          <div style={rowDescStyle}>复盘后点「生成建议」，规则会进这里等你审批。</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {rules.map(r => (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderTop: '1px solid var(--dsw-alias-border-l2)', fontSize: 12.5 }}>
                <span style={{
                  flex: 'none', fontSize: 10.5, padding: '1px 7px', borderRadius: 999,
                  border: '1px solid var(--dsw-alias-border-l2)',
                  color: r.status === '已验证' ? SUCCESS_COLOR : r.status === '待审' ? HOT_COLOR : 'var(--dsw-alias-label-tertiary)',
                }}>
                  {r.status}
                </span>
                <span style={{ flex: 1, minWidth: 0, color: 'var(--dsw-alias-label-primary)' }}>{r.text}</span>
                <span style={{ flex: 'none', display: 'flex', gap: 4 }}>
                  {r.status === '待审' && (
                    <button type="button" onClick={() => { setRules(setRuleStatus(r.id, '已验证')) }}
                      style={{ border: 'none', borderRadius: 6, padding: '2px 8px', font: 'inherit', fontSize: 10.5, cursor: 'pointer', background: 'var(--dsw-alias-label-primary)', color: 'var(--dsw-alias-bg-base)' }}>
                      批准
                    </button>
                  )}
                  {r.status !== '已失效' && (
                    <button type="button" onClick={() => { setRules(setRuleStatus(r.id, '已失效')) }}
                      style={{ border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 6, padding: '2px 7px', font: 'inherit', fontSize: 10.5, cursor: 'pointer', background: 'transparent', color: 'var(--dsw-alias-label-secondary)' }}>
                      失效
                    </button>
                  )}
                  <button type="button" onClick={() => { setRules(removeRule(r.id)) }}
                    style={{ border: 'none', borderRadius: 6, padding: '2px 6px', font: 'inherit', fontSize: 10.5, cursor: 'pointer', background: 'transparent', color: 'var(--dsw-alias-label-tertiary)' }}>
                    删
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

export function HeightLabOpsPage() {
  /* O57 D2（2026-11-14 用户拍板）：页面级双分页——我的账号（原数据概览）/ 对标账号（原对标库） */
  /* O57 四轮（2026-11-14 用户拍板方案 A）：两页——当前概况（洞察优先）/ 账号（我的+对标合并） */
  const [tab, setTab] = useState<'overview' | 'accounts' | 'bench' | 'signals' | 'pool' | 'content' | 'retro'>('overview')
  const [snapshots, setSnapshots] = useState<Record<string, PlatformSnapshot>>(loadSnapshots)
  const [states, setStates] = useState<Record<string, PlatformState>>({})
  const [detail, setDetail] = useState<ProviderId | null>(null)
  /** O57：额外自有账号详情 */
  const [extraDetail, setExtraDetail] = useState<OwnExtraAccount | null>(null)
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


  /** 把账号当前作品数据回填到发布记录里（按标题匹配）。
   * 2026-11-16 逻辑抽成纯函数 backfillDueRecords：页面与后台调度器共用一份。 */
  useEffect(() => {
    const { next, changed } = backfillDueRecords(records, Object.fromEntries(
      Object.entries(snapshots).map(([id, snap]) => [id, snap.works ?? []] as const),
    ))
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
    if (opts?.silent !== true) setStates(s => ({ ...s, [def.id]: { busy: true } }))
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
          setStates(st => ({
            ...st,
            [def.id]: { ...st[def.id], busy: false, error: '接口返回结构已变化，需要更新适配' },
          }))
          return false
        }
      }
      if (snap === null) {
        setStates(s => ({ ...s, [def.id]: { busy: false } }))
        return false
      }
      /* 计算增长/突变守卫/works 保留 → 纯函数 computeSyncedSnapshot
       * （2026-11-16 抽取：页面与后台调度器共用同一份合并逻辑） */
      setSnapshots((prev) => {
        const { persistable, merged } = computeSyncedSnapshot(prev, def.id, snap)
        try {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(persistable))
        } catch { /* 非致命 */ }
        /* 但**返回给 UI 的**要带 suspect，用户才能看到「待核」 */
        return merged
      })
      setStates(s => ({ ...s, [def.id]: { busy: false } }))
      return true
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setStates(s => ({ ...s, [def.id]: { busy: false, error: msg.slice(0, 100) } }))
      return false
    }
  }, [])

  /* 进入页面：对**已有快照**的平台静默刷新（不弹窗、不打扰）；
   * 没有快照的平台不动，等用户点卡时再走登录。 */
  useEffect(() => {
    /* 2026-11-14 stale-while-revalidate：进面板**永远先渲染缓存快照**（loadSnapshots
     * 已是同步读），这里只对**超过新鲜期**的平台做后台静默刷新。
     * 此前每次挂载都全量重拉——xhs 的隐藏窗取数要 9~19s，配合壳侧同步命令
     * （已改 async，见 lib.rs）曾造成每次进面板整窗转圈。5 分钟内视为新鲜跳过，
     * 既保数据常新，又砍掉无谓的隐藏窗与网络轮询。 */
    const FRESH_MS = 5 * 60 * 1000
    for (const def of PROVIDERS) {
      const snap = snapshots[def.id]
      if (snap === undefined) continue
      if (typeof snap.syncedAt === 'number' && Date.now() - snap.syncedAt < FRESH_MS) continue
      void syncPlatform(def, { silent: true })
    }
    // 仅挂载时执行一次（快照初始值来自 localStorage，不参与依赖）
  }, [])

  /** 点卡：有快照 → 进详情并刷新；无快照 → 打开登录窗口（只这一次） */
  /* 后台调度器写完 localStorage 后通知：重读快照状态（2026-11-16）。
   * 面板开着时调度器也在跑，不监听的话 UI 会显示到下次手动刷新前的旧数据。 */
  useEffect(() => {
    const onExternal = (): void => { setSnapshots(loadSnapshots()) }
    window.addEventListener('hl-ops-snapshots-externally-changed', onExternal)
    return () => { window.removeEventListener('hl-ops-snapshots-externally-changed', onExternal) }
  }, [])

  /* 今日行动队列「去处理」→ 切页/深链（2026-11-16 v2）。
   * OverviewSection 里的行动项只发事件，tab/详情状态在父组件。
   * 两种目标：
   *  - { kind: 'accounts' }        只切到账号页
   *  - { kind: 'detail', provider, tab }  直接打开该账号详情 + 二级分页，
   *    并触发一次静默刷新（陈旧数据点开即拉新，与手动点卡同行为）。
   * 与 hl-projects-changed 同模式：自包含子区块 + 父级监听。 */
  useEffect(() => {
    const onGoto = (e: Event): void => {
      const target = (e as CustomEvent<unknown>).detail
      if (target === null || typeof target !== 'object') return
      const t = target as { kind?: string; provider?: string; tab?: string }
      if (t.kind === 'accounts') {
        setTab('accounts')
        setDetail(null)
        return
      }
      if (t.kind === 'detail' && typeof t.provider === 'string') {
        const def = PROVIDERS.find(p => p.id === t.provider)
        if (def === undefined) {
          /* 平台没有对应账号卡（理论上不发生），兜底切账号页 */
          setTab('accounts')
          setDetail(null)
          return
        }
        setTab('accounts')
        setDetail(def.id)
        const tab = t.tab
        if (tab === '数据概览' || tab === '作品表现' || tab === '粉丝画像' || tab === '发布监控') {
          setDetailTab(tab)
        }
        void syncPlatform(def, { silent: true })
      }
    }
    window.addEventListener('hl-ops-goto-tab', onGoto)
    return () => { window.removeEventListener('hl-ops-goto-tab', onGoto) }
  }, [syncPlatform])

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
       * 重点 同步成功就**自动关掉登录窗口**（2026-11-10 用户要求，全平台通用）：
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
             * 注意 顺序关键：**必须等 syncPlatform 完成后再关**。
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
      setStates(s => ({ ...s, [def.id]: { busy: false, error: `开窗失败：${msg.slice(0, 80)}` } }))
    }
  }, [snapshots, syncPlatform])

  const detailDef = detail === null ? null : PROVIDERS.find(p => p.id === detail) ?? null
  /** O57：统一账号行 → 详情页（三种来源分流） */
  const openUnified = useCallback((acct: UnifiedAccount) => {
    if (acct.source.type === 'primary') {
      setDetail(acct.source.def.id)
      setDetailTab('数据概览')
      void syncPlatform(acct.source.def, { silent: true })
    } else if (acct.source.type === 'extra') {
      setExtraDetail(acct.source.acct)
      setDetailTab('数据概览')
    } else if (acct.source.type === 'bench') {
      const b = acct.source.acct
      const live = b.works.filter(w => w.missing !== true)
      const totalDigg = live.reduce((x, w) => x + (w.diggs ?? 0), 0)
      setExtraDetail({
        id: `bench:${b.secUid || b.link}`,
        platform: 'douyin',
        nickname: b.nickname,
        accountRef: b.secUid || b.link,
        kind: 'public',
        snap: {
          nickname: b.nickname,
          accountId: b.secUid || b.link,
          highlights: [
            { label: '作品', metric: { value: live.length } },
            { label: '总赞', metric: { value: totalDigg } },
          ],
          details: [
            { group: '公开数据汇总', label: '作品数', metric: { value: live.length } },
            { group: '公开数据汇总', label: '总点赞', metric: { value: totalDigg } },
          ],
          syncedAt: b.syncedAt,
        },
      })
      setDetailTab('数据概览')
    }
  }, [syncPlatform])

  /* O57：额外账号详情——复用详情页布局（detailDef 用其 platform 对应的 ProviderDef） */
  const extraDetailDef = extraDetail === null ? null : PROVIDERS.find(p => p.id === extraDetail.platform) ?? null
  const activeDetailDef = extraDetailDef ?? detailDef
  const activeSnapshot = extraDetail !== null ? extraDetail.snap : (detailDef !== null ? snapshots[detailDef.id] : undefined)
  void activeSnapshot

  return (
  /* 布局（2026-11-12 实测两轮修正）
     *
     * 本组件由 `HeightLabHubPage` 渲染，父容器是 `hubRootStyle`
     * （`height:100%; display:flex; flexDirection:column; overflow:hidden`），
     * 与页头 header **并列**。
     *
     * 因此必须用 **`flex: 1` + `minHeight: 0`** 拿「header 之外的剩余高度」——
     * 这是 flex 子项的语义。
     * 注意 不能用 `height: 100%`：那是按父容器**完整高度**算，加上 header 就溢出，
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
          className={clsx(css.libraryTab, tab === 'overview' && css.libraryTabActive)}
          onClick={() => { setTab('overview'); setDetail(null) }}
        >
          当前概况
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'accounts'}
          className={clsx(css.libraryTab, tab === 'accounts' && css.libraryTabActive)}
          onClick={() => { setTab('accounts'); setDetail(null) }}
        >
          所有项目
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'bench'}
          className={clsx(css.libraryTab, tab === 'bench' && css.libraryTabActive)}
          onClick={() => { setTab('bench'); setDetail(null) }}
        >
          对标
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'signals'}
          className={clsx(css.libraryTab, tab === 'signals' && css.libraryTabActive)}
          onClick={() => { setTab('signals'); setDetail(null) }}
        >
          热点
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'pool'}
          className={clsx(css.libraryTab, tab === 'pool' && css.libraryTabActive)}
          onClick={() => { setTab('pool'); setDetail(null) }}
        >
          选题池{poolPendingCount(loadPool()) > 0 ? `（${String(poolPendingCount(loadPool()))}）` : ''}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'content'}
          className={clsx(css.libraryTab, tab === 'content' && css.libraryTabActive)}
          onClick={() => { setTab('content'); setDetail(null) }}
        >
          内容
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'retro'}
          className={clsx(css.libraryTab, tab === 'retro' && css.libraryTabActive)}
          onClick={() => { setTab('retro'); setDetail(null) }}
        >
          复盘
        </button>
      </div>

      {/* 容器严格照抄原生 hubPageStyle：gap 32 / padding 12 clamp(24,4vw,48) 48 */}
      <div className={css.opsScroll}>
        {detailDef === null ? (
          tab === 'overview' ? (
            <OverviewSection />
          ) : tab === 'bench' ? (
            <BenchSection />
          ) : tab === 'signals' ? (
            <SignalsSection />
          ) : tab === 'pool' ? (
            <PoolSection />
          ) : tab === 'content' ? (
            <ContentSection />
          ) : tab === 'retro' ? (
            <RetroSection />
          ) : (
            /* O57 五轮（2026-11-14 用户拍板 v3/v4 设计稿）：
             * 项目手风琴 → 左「我的账号」/ 右「对标账号」→ 列内平台小标题 */
            <AccountsSection
              onOpenUnified={(acct) => { openUnified(acct) }}
              onLogin={(def) => { void onCardClick(def) }}
              platformStates={states}
            />
          )
        ) : (
          /* 详情页布局（2026-11-12 用户建议「左侧或右侧放竖边栏专门放发布按钮」）
           * O57：extraDetail（额外自有账号）复用此布局——下文统一用 activeDetailDef/activeSnap。
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
          /* 2026-11-14 用户拍板：右栏取消（动作收进页头），数据区恢复全宽。
           * 原「左数据/右操作」的注释史保留在 git；滚动容器语义不变。 */
          <div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18, position: 'sticky', top: 0, zIndex: 2, background: 'var(--dsw-alias-bg-base)', paddingTop: 6, paddingBottom: 8 }}>
                <button
                  type="button"
                  onClick={() => setDetail(null)}
                  style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13, color: 'var(--dsw-alias-label-secondary)', padding: 0 }}
                >
                  ← 数据概览
                </button>
                <span style={{ fontSize: 13, color: 'var(--dsw-alias-label-tertiary)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {activeDetailDef?.name ?? ''}
                  {activeSnapshot?.nickname !== undefined ? ` · ${activeSnapshot.nickname}` : ''}
                </span>
                {/* 2026-11-14 用户拍板：动作收进页头右侧（原 300px 右栏取消）。
                 * 反哺=描边次要钮；发布=实心主钮（点开弹浮层表单）。 */}
                <FeedbackButton
                  providerName={activeDetailDef?.name ?? ''}
                  baselineText={(() => {
                    const snapH = activeSnapshot
                    const w = snapH?.works ?? []
                    if (w.length === 0) return null
                    const b = buildBaseline(activeDetailDef?.id ?? 'douyin', snapH?.nickname ?? activeDetailDef?.name ?? '', w)
                    return renderBaselineForPrompt(b)
                  })()}
                />
                {activeDetailDef?.id === 'douyin' && extraDetail === null && (
                  <PublishPanel
                    provider={detailDef.id}
                    providerName={activeDetailDef?.name ?? ''}
                    onPublished={(info) => { recordPublish(detailDef.id, info) }}
                  />
                )}
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
                const snap = activeSnapshot
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

            {/* 右栏已取消（2026-11-14 用户拍板）：动作收进页头右侧 */}
          </div>
        )}
      </div>
    </div>
  )
}

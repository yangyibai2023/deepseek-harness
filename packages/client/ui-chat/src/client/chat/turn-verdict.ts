/**
 * HeightLab 回合判决仲裁器（2026-10-17，借鉴 AgentCore「一回合一处判决」）。
 *
 * 问题：一个终态回合可能同时满足多个错误呈现条件（限流 + 部分完成 + 额度不足
 * + 模型不可用 + 账号登出…）。若各组件各写 `if` 各自点亮，用户会同时看到
 * 互斥建议（例如「等待重试」与「去充值」），或者重复的横幅。
 *
 * 解法：所有终态错误先经过本仲裁器算出一个**唯一判决**，各呈现面（气泡错误行 /
 * 输入框上方横幅 / 状态条）只读判决结果做「笨渲染」，不再各自判断。
 *
 * 判决顺序 = 用户能实际采取行动的优先级：
 *   账号问题（登出/未登录） > 额度不足 > 密钥鉴权 > 模型不可用 > 限流 > 一般失败
 * 「用户主动停止」永远不是错误，不产生判决。
 */

/** 判决种类：一处回合只允许一个。 */
export type TurnVerdictKind =
  | 'none'
  | 'signed-out'
  | 'quota'
  | 'auth'
  | 'model-unavailable'
  | 'rate-limited'
  | 'failed'

/** 用户可执行的恢复动作；`none` 表示只能重新发送或等待。 */
export type TurnRecovery = 'sign-in' | 'recharge' | 'settings' | 'wait' | 'resend' | 'none'

/** 仲裁结果：呈现层只读这些字段。 */
export interface TurnVerdict {
  readonly kind: TurnVerdictKind
  readonly recovery: TurnRecovery
  /** 是否在气泡内显示错误行（账号/额度类允许，限流类交给横幅）。 */
  readonly showInBubble: boolean
  /** 是否需要在输入框上方显示可关闭横幅。 */
  readonly showBanner: boolean
  /** 是否提供「复制排查包」入口。 */
  readonly allowDiagnostics: boolean
}

const NONE: TurnVerdict = {
  kind: 'none', recovery: 'none', showInBubble: false, showBanner: false, allowDiagnostics: false,
}

/** 判决优先级表：越靠前越优先（只会命中第一个）。 */
const PRIORITY: readonly { match: (code: string) => boolean; verdict: TurnVerdict }[] = [
  {
    match: code => code === 'ACCOUNT_SIGNED_OUT',
    verdict: { kind: 'signed-out', recovery: 'sign-in', showInBubble: true, showBanner: false, allowDiagnostics: false },
  },
  {
    match: code => code === 'ACCOUNT_SIGN_IN_REQUIRED',
    verdict: { kind: 'signed-out', recovery: 'sign-in', showInBubble: true, showBanner: false, allowDiagnostics: false },
  },
  {
    match: code => code === 'QUOTA' || code === 'ACCOUNT_QUOTA',
    verdict: { kind: 'quota', recovery: 'recharge', showInBubble: true, showBanner: false, allowDiagnostics: false },
  },
  {
    match: code => code === 'AUTH',
    verdict: { kind: 'auth', recovery: 'settings', showInBubble: true, showBanner: true, allowDiagnostics: true },
  },
  {
    match: code => code === 'MODEL_UNAVAILABLE',
    verdict: { kind: 'model-unavailable', recovery: 'settings', showInBubble: true, showBanner: true, allowDiagnostics: true },
  },
  {
    match: code => code === 'RATE_LIMITED' || code === 'RATE_LIMIT' || code === 'UPSTREAM_RATE_LIMITED',
    verdict: { kind: 'rate-limited', recovery: 'wait', showInBubble: false, showBanner: true, allowDiagnostics: true },
  },
]

/**
 * 计算一个终态回合的唯一判决。
 * @param args.code - 失败码（可为空）。
 * @param args.userStopped - 是否用户主动停止（停止不是错误）。
 * @param args.message - 原始错误文本（用于识别未带码的限流场景）。
 * @returns 唯一判决；无失败时返回 `kind: 'none'`。
 */
export function resolveTurnVerdict(args: {
  code?: string | undefined
  userStopped?: boolean | undefined
  message?: string | undefined
}): TurnVerdict {
  if (args.userStopped === true) return NONE
  const code = (args.code ?? '').toUpperCase()
  for (const rule of PRIORITY) {
    if (rule.match(code)) return rule.verdict
  }
  // 未带码时的文本兜底：限流相关措辞统一走「等待」，不再单独弹错误气泡。
  const text = (args.message ?? '').toLowerCase()
  if (/rate.?limit|too many requests|429|限流|请求过于频繁/u.test(text)) {
    return { kind: 'rate-limited', recovery: 'wait', showInBubble: false, showBanner: true, allowDiagnostics: true }
  }
  // 其余终态失败：气泡一处错误行 + 排查包；不额外叠横幅。
  return { kind: 'failed', recovery: 'resend', showInBubble: true, showBanner: false, allowDiagnostics: true }
}

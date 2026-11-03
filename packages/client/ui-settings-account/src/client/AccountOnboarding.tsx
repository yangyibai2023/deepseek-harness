/** Account choice inside the model credential onboarding step. */
import { useEffect } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-settings-models/client'
import type { AccountSectionInjected } from './AccountSection.tsx'
import { SignInDialog } from './SignInDialog.tsx'

/** 是否在「设置 → 模型」页展示上游账号对话框（2026-11-02 用户要求：永不出现）。 */
const SHOW_ACCOUNT_DIALOG_IN_SETTINGS = false

/** @param props - onboarding completion, account state and actions. @returns account dialog while signed out. */
export function AccountOnboarding({ complete, useApiKey, useAccount, useTheme, setOnboarding, showLogin, start, cancel, t }:
  PropsRuntime<'settings.models.sign-in'> & PropsLocale<'settings.account'> & InjectFace<AccountSectionInjected>) {
  const account = useAccount(value => value)
  const colorScheme = useTheme(snapshot => snapshot.active.colorScheme)
  useEffect(() => { setOnboarding(true); return () => { setOnboarding(false) } }, [setOnboarding])
  useEffect(() => { if (account.view?.status === 'credential-stored') complete() }, [account.view?.status, complete])
  if (!account.view || account.view.status === 'credential-stored') return null
  // HeightLab（2026-11-02，0.5.2）：**不在设置-模型页弹登录/API Key 对话框**。
  // 原因：①用户已明确"任何情况下都不要出现配置 API Key 的弹窗"
  //      ②自定义 Key 仅旗舰，非旗舰看到这个入口等于给了绕过路径
  //      ③未登录/凭据缺失应由产品级登录墙处理，而不是上游的账号对话框
  // 可回滚：常量改 true 恢复上游行为（SignInDialog 完整保留，未删任何代码）。
  if (!SHOW_ACCOUNT_DIALOG_IN_SETTINGS) { complete(); return null }
  return <SignInDialog account={account} colorScheme={colorScheme} start={start} cancel={cancel} t={t}
    close={() => { showLogin(false); complete() }} useApiKey={() => { showLogin(false); useApiKey() }} />
}

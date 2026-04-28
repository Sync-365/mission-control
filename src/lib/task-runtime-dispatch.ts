import { join } from 'node:path'
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { config } from '@/lib/config'
import { runCommand, runOpenClaw } from '@/lib/command'
import { callOpenClawGateway } from '@/lib/openclaw-gateway'
import { getAllGatewaySessions } from '@/lib/sessions'
import { parseGatewayHistoryTranscript } from '@/lib/transcript-parser'

export type SupportedTaskRuntime = 'openclaw' | 'hermes' | 'claude' | 'codex'

export interface RuntimeDispatchTask {
  id: number
  title: string
  description: string | null
  priority: string
  assigned_to: string
  workspace_id: number
  agent_name: string
  agent_id: number
  agent_config: string | null
  agent_runtime_type?: string | null
  agent_session_key?: string | null
  metadata?: string | null
}

export interface RuntimeDispatchResult {
  text: string | null
  sessionId: string | null
  runtime: SupportedTaskRuntime
  model?: string | null
  provider?: string | null
  metadata?: Record<string, unknown>
}

function safeJsonParse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function getAgentConfig(task: Pick<RuntimeDispatchTask, 'agent_config'>): Record<string, any> {
  return safeJsonParse<Record<string, any>>(task.agent_config, {})
}

export function resolveTaskRuntime(task: RuntimeDispatchTask): SupportedTaskRuntime {
  const cfg = getAgentConfig(task)
  const raw = String(task.agent_runtime_type || cfg.runtime_type || cfg.runtime || 'openclaw').toLowerCase().trim()
  if (raw === 'hermes' || raw === 'claude' || raw === 'codex') return raw
  return 'openclaw'
}

function resolveTaskWorkingDir(task: RuntimeDispatchTask): string {
  const cfg = getAgentConfig(task)
  const meta = safeJsonParse<Record<string, unknown>>(task.metadata, {})
  const candidates = [
    typeof cfg.cwd === 'string' ? cfg.cwd : null,
    typeof meta.code_location === 'string' ? meta.code_location : null,
    typeof meta.implementation_repo === 'string' ? meta.implementation_repo : null,
    process.env.OPENCLAW_WORKSPACE_DIR || '',
    config.openclawHome ? join(config.openclawHome, 'workspace') : '',
    process.cwd(),
  ].filter((v): v is string => Boolean(v && v.trim()))

  const cwd = candidates[0]
  try {
    mkdirSync(cwd, { recursive: true })
  } catch {
    // Let the runtime surface a clear cwd error if creation is not possible.
  }
  return cwd
}

function parseGatewayJson(raw: string): any | null {
  const trimmed = String(raw || '').trim()
  if (!trimmed) return null
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start < 0 || end < start) return null
  try {
    return JSON.parse(trimmed.slice(start, end + 1))
  } catch {
    return null
  }
}

function parseOpenClawAgentResponse(stdout: string): { text: string | null; sessionId: string | null } {
  try {
    const parsed = JSON.parse(stdout)
    const sessionId: string | null = typeof parsed?.sessionId === 'string'
      ? parsed.sessionId
      : typeof parsed?.session_id === 'string'
        ? parsed.session_id
        : null

    if (parsed?.payloads?.[0]?.text) {
      return { text: parsed.payloads[0].text, sessionId }
    }
    if (parsed?.result) return { text: String(parsed.result), sessionId }
    if (parsed?.output) return { text: String(parsed.output), sessionId }
    return { text: JSON.stringify(parsed, null, 2), sessionId }
  } catch {
    return { text: stdout.trim() || null, sessionId: null }
  }
}

function resolveOpenClawAgentId(task: RuntimeDispatchTask): string {
  const cfg = getAgentConfig(task)
  if (typeof cfg.openclawId === 'string' && cfg.openclawId) return cfg.openclawId
  return task.agent_name
}

function buildMissionControlSessionKey(task: RuntimeDispatchTask): string {
  return `agent:${resolveOpenClawAgentId(task)}:task-${task.id}`
}

function findOpenClawSessionKey(task: RuntimeDispatchTask): string {
  const preferredAgentIds = [
    resolveOpenClawAgentId(task),
    task.agent_name,
  ].filter((value, index, arr): value is string => Boolean(value) && arr.indexOf(value) === index)

  const sessions = getAllGatewaySessions(24 * 60 * 60 * 1000, true)
  const dedicated = buildMissionControlSessionKey(task)
  if (sessions.some((session) => session.key === dedicated)) return dedicated

  return dedicated
}

function getLastAssistantText(messages: unknown[]): string | null {
  const parsed = parseGatewayHistoryTranscript(Array.isArray(messages) ? messages : [], 100)
  for (let i = parsed.length - 1; i >= 0; i -= 1) {
    const msg = parsed[i]
    if (msg.role !== 'assistant') continue
    const text = msg.parts
      .filter((part) => part.type === 'text')
      .map((part) => part.text)
      .join('\n')
      .trim()
    if (text) return text
  }
  return null
}

function countAssistantMessages(messages: unknown[]): number {
  const parsed = parseGatewayHistoryTranscript(Array.isArray(messages) ? messages : [], 200)
  return parsed.filter((msg) => msg.role === 'assistant').length
}

async function waitForSessionReply(sessionKey: string, baselineAssistantCount: number, timeoutMs: number): Promise<{ text: string | null }> {
  const started = Date.now()
  let lastHistoryError: unknown = null
  while ((Date.now() - started) < timeoutMs) {
    try {
      const history = await callOpenClawGateway<{ messages?: unknown[] }>('chat.history', { sessionKey, limit: 50 }, 30000)
      lastHistoryError = null
      const messages = Array.isArray(history?.messages) ? history.messages : []
      const assistantCount = countAssistantMessages(messages)
      if (assistantCount > baselineAssistantCount) {
        return { text: getLastAssistantText(messages) }
      }
    } catch (err) {
      // A busy gateway can transiently time out history reads while the agent is
      // still running. Do not immediately fail the Mission Control task after
      // chat.send has already started the run; keep polling until the overall
      // task timeout expires.
      lastHistoryError = err
    }
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }

  const suffix = lastHistoryError instanceof Error ? ` Last history error: ${lastHistoryError.message}` : ''
  throw new Error(`Timed out waiting for OpenClaw session reply from ${sessionKey}.${suffix}`)
}

function resolveOpenClawModel(task: RuntimeDispatchTask): string | null {
  const cfg = getAgentConfig(task)
  const meta = safeJsonParse<Record<string, unknown>>(task.metadata, {})
  if (typeof meta.dispatch_model === 'string' && meta.dispatch_model) return meta.dispatch_model
  if (typeof meta.model === 'string' && meta.model) return meta.model
  if (typeof cfg.dispatchModel === 'string' && cfg.dispatchModel) return cfg.dispatchModel
  if (typeof cfg.model === 'string' && cfg.model) return cfg.model
  return null
}

function resolveTaskThinking(task: RuntimeDispatchTask): string | null {
  const cfg = getAgentConfig(task)
  const meta = safeJsonParse<Record<string, unknown>>(task.metadata, {})
  if (typeof meta.thinking === 'string' && meta.thinking) return meta.thinking
  if (typeof cfg.thinking === 'string' && cfg.thinking) return cfg.thinking
  if (typeof cfg.thinkingDefault === 'string' && cfg.thinkingDefault) return cfg.thinkingDefault
  if (typeof cfg.reasoningDefault === 'string' && cfg.reasoningDefault) return cfg.reasoningDefault
  return null
}

async function dispatchOpenClaw(task: RuntimeDispatchTask, prompt: string): Promise<RuntimeDispatchResult> {
  const cfg = getAgentConfig(task)
  const meta = safeJsonParse<Record<string, unknown>>(task.metadata, {})
  const targetSession = typeof meta.target_session === 'string' && meta.target_session
    ? meta.target_session
    : typeof task.agent_session_key === 'string' && task.agent_session_key
      ? task.agent_session_key
      : findOpenClawSessionKey(task)

  if (targetSession) {
    const baselineHistory = await callOpenClawGateway<{ messages?: unknown[] }>('chat.history', { sessionKey: targetSession, limit: 50 }, 15000)
    const baselineAssistantCount = countAssistantMessages(Array.isArray(baselineHistory?.messages) ? baselineHistory.messages : [])
    const sendResult = await callOpenClawGateway<any>(
      'chat.send',
      {
        sessionKey: targetSession,
        message: prompt,
        idempotencyKey: `task-dispatch-${task.id}-${Date.now()}`,
        deliver: false,
      },
      125_000,
    )
    const status = String(sendResult?.status || '').toLowerCase()
    if (status !== 'started' && status !== 'ok' && status !== 'in_flight') {
      throw new Error(`chat.send to session ${targetSession} returned status: ${status}`)
    }
    const reply = await waitForSessionReply(targetSession, baselineAssistantCount, Number(cfg.timeoutMs || 600000))
    return {
      text: reply.text,
      sessionId: targetSession,
      runtime: 'openclaw',
      model: typeof cfg.model === 'string' ? cfg.model : null,
      metadata: { delivery: 'session-send' },
    }
  }

  const invokeParams: Record<string, unknown> = {
    message: prompt,
    agentId: resolveOpenClawAgentId(task),
    idempotencyKey: `task-dispatch-${task.id}-${Date.now()}`,
    deliver: false,
  }
  const dispatchModel = resolveOpenClawModel(task)
  const thinking = resolveTaskThinking(task)
  if (dispatchModel) invokeParams.model = dispatchModel
  if (thinking) invokeParams.thinking = thinking

  const finalResult = await runOpenClaw(
    ['gateway', 'call', 'agent', '--expect-final', '--timeout', '120000', '--params', JSON.stringify(invokeParams), '--json'],
    { timeoutMs: 125_000 },
  )
  const finalPayload = parseGatewayJson(finalResult.stdout)
    ?? parseGatewayJson(String((finalResult as any)?.stderr || ''))
  const parsed = parseOpenClawAgentResponse(finalPayload?.result ? JSON.stringify(finalPayload.result) : finalResult.stdout)

  return {
    text: parsed.text,
    sessionId: parsed.sessionId || finalPayload?.result?.meta?.agentMeta?.sessionId || null,
    runtime: 'openclaw',
    model: dispatchModel,
    metadata: { delivery: 'gateway-call' },
  }
}

async function dispatchHermes(task: RuntimeDispatchTask, prompt: string): Promise<RuntimeDispatchResult> {
  const cfg = getAgentConfig(task)
  const dispatchModel = resolveOpenClawModel(task)
  const args = ['-z', prompt]
  const hermesProfile = typeof cfg.hermesProfile === 'string' && cfg.hermesProfile
    ? cfg.hermesProfile
    : typeof cfg.runtime?.profile === 'string' && cfg.runtime.profile
      ? cfg.runtime.profile
      : null
  const hermesProfileDir = typeof cfg.hermesProfileDir === 'string' && cfg.hermesProfileDir
    ? cfg.hermesProfileDir
    : typeof cfg.runtime?.profileDir === 'string' && cfg.runtime.profileDir
      ? cfg.runtime.profileDir
      : hermesProfile
        ? join(config.homeDir, '.hermes', 'profiles', hermesProfile)
        : null

  // Hermes profiles are isolated. If the root Hermes profile is authenticated
  // but the MC-managed runtime profile is not, one-shot task dispatch fails
  // before the agent starts. Copy the root OAuth store into the profile when
  // no profile auth file exists yet; do not overwrite profile-specific auth.
  if (hermesProfileDir) {
    const rootAuth = join(config.homeDir, '.hermes', 'auth.json')
    const profileAuth = join(hermesProfileDir, 'auth.json')
    if (!existsSync(profileAuth) && existsSync(rootAuth)) {
      mkdirSync(hermesProfileDir, { recursive: true })
      copyFileSync(rootAuth, profileAuth)
    }
  }

  if (hermesProfile) args.unshift('--profile', hermesProfile)
  if (dispatchModel) args.push('--model', dispatchModel)
  if (typeof cfg.provider === 'string' && cfg.provider) args.push('--provider', cfg.provider)
  if (typeof cfg.skills === 'string' && cfg.skills) args.push('--skills', cfg.skills)
  if (cfg.yolo === true) args.push('--yolo')
  args.push('--accept-hooks')

  const result = await runCommand('hermes', args, {
    cwd: resolveTaskWorkingDir(task),
    timeoutMs: Number(cfg.timeoutMs || 180000),
  })

  return {
    text: result.stdout.trim() || null,
    sessionId: null,
    runtime: 'hermes',
    model: dispatchModel,
    provider: typeof cfg.provider === 'string' ? cfg.provider : null,
  }
}

async function dispatchClaude(task: RuntimeDispatchTask, prompt: string): Promise<RuntimeDispatchResult> {
  const cfg = getAgentConfig(task)
  const dispatchModel = resolveOpenClawModel(task)
  const args = ['-p', '--output-format', 'json']
  if (dispatchModel) args.push('--model', dispatchModel)
  if (cfg.allowEdits === true || cfg.yolo === true) {
    args.push('--dangerously-skip-permissions')
  }
  args.push(prompt)

  const result = await runCommand('claude', args, {
    cwd: resolveTaskWorkingDir(task),
    timeoutMs: Number(cfg.timeoutMs || 180000),
  })

  const parsed = parseGatewayJson(result.stdout) || safeJsonParse<any>(result.stdout, null)
  return {
    text: parsed?.result ? String(parsed.result).trim() : result.stdout.trim() || null,
    sessionId: typeof parsed?.session_id === 'string' ? parsed.session_id : null,
    runtime: 'claude',
    model: typeof parsed?.model === 'string' ? parsed.model : dispatchModel,
    provider: 'anthropic',
    metadata: parsed ? { raw: parsed } : undefined,
  }
}

async function dispatchCodex(task: RuntimeDispatchTask, prompt: string): Promise<RuntimeDispatchResult> {
  const cfg = getAgentConfig(task)
  const dispatchModel = resolveOpenClawModel(task)
  const args = ['exec', '--skip-git-repo-check', '-C', resolveTaskWorkingDir(task), '--json']
  if (dispatchModel) args.push('--model', dispatchModel)
  if (cfg.allowEdits === true || cfg.yolo === true) {
    args.push('--sandbox', 'workspace-write', '--ask-for-approval', 'never')
  }
  args.push(prompt)

  const result = await runCommand('codex', args, {
    cwd: resolveTaskWorkingDir(task),
    timeoutMs: Number(cfg.timeoutMs || 180000),
  })

  const sessionIdMatch = result.stdout.match(/"thread_id":"([^"]+)"/)
  const jsonLines = result.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('{') && line.endsWith('}'))
  let finalText: string | null = null
  for (const line of jsonLines) {
    try {
      const parsed = JSON.parse(line)
      const text = parsed?.item?.text
      if (typeof text === 'string' && text.trim()) finalText = text.trim()
    } catch {
      // ignore malformed lines
    }
  }

  return {
    text: finalText || result.stdout.trim() || null,
    sessionId: sessionIdMatch?.[1] || null,
    runtime: 'codex',
    model: dispatchModel,
    provider: 'openai',
    metadata: {
      stdoutPreview: result.stdout.slice(0, 1000),
    },
  }
}

export async function dispatchTaskViaRuntime(task: RuntimeDispatchTask, prompt: string): Promise<RuntimeDispatchResult> {
  const runtime = resolveTaskRuntime(task)
  if (runtime === 'hermes') return dispatchHermes(task, prompt)
  if (runtime === 'claude') return dispatchClaude(task, prompt)
  if (runtime === 'codex') return dispatchCodex(task, prompt)
  return dispatchOpenClaw(task, prompt)
}

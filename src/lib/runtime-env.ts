import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { existsSync } from 'node:fs'

import { config } from '@/lib/config'

function parseEnvLine(line: string): { key: string; value: string } | null {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) return null

  const eqIdx = line.indexOf('=')
  if (eqIdx <= 0) return null

  const key = line.slice(0, eqIdx).trim()
  const value = line.slice(eqIdx + 1).trim()
  if (!key) return null
  return { key, value }
}

async function readOpenClawEnvFile(envFilePath: string): Promise<Map<string, string>> {
  try {
    const raw = await readFile(envFilePath, 'utf-8')
    const envMap = new Map<string, string>()
    for (const line of raw.split('\n')) {
      const parsed = parseEnvLine(line)
      if (parsed) envMap.set(parsed.key, parsed.value)
    }
    return envMap
  } catch (error: any) {
    if (error?.code === 'ENOENT') return new Map<string, string>()
    throw error
  }
}

function prependPath(existingPath: string | undefined): string {
  const candidates = [
    '/home/linuxbrew/.linuxbrew/bin',
    '/home/leon/.npm-global/bin',
    '/home/leon/.local/bin',
    '/usr/local/bin',
    '/usr/bin',
    '/bin',
  ].filter(existsSync)
  const parts = [...candidates, ...(existingPath || '').split(':').filter(Boolean)]
  return Array.from(new Set(parts)).join(':')
}

export async function getEffectiveEnvValue(
  key: string,
  options?: { envFilePath?: string }
): Promise<string> {
  const envFilePath = options?.envFilePath || join(config.openclawStateDir, '.env')
  const envMap = await readOpenClawEnvFile(envFilePath)
  const fromFile = envMap.get(key)
  if (typeof fromFile === 'string' && fromFile.length > 0) return fromFile

  const fromProcess = process.env[key]
  if (typeof fromProcess === 'string' && fromProcess.length > 0) return fromProcess

  return ''
}

export async function getRuntimeEnv(
  options?: { envFilePath?: string; extra?: NodeJS.ProcessEnv }
): Promise<NodeJS.ProcessEnv> {
  const envFilePath = options?.envFilePath || join(config.openclawStateDir, '.env')
  const envMap = await readOpenClawEnvFile(envFilePath)
  const runtimeEnv: NodeJS.ProcessEnv = {
    ...process.env,
    ...Object.fromEntries(envMap),
    ...options?.extra,
  }

  runtimeEnv.PATH = prependPath(runtimeEnv.PATH)

  if (!runtimeEnv.GH_TOKEN && runtimeEnv.GITHUB_TOKEN) runtimeEnv.GH_TOKEN = runtimeEnv.GITHUB_TOKEN
  if (!runtimeEnv.GITHUB_TOKEN && runtimeEnv.GH_TOKEN) runtimeEnv.GITHUB_TOKEN = runtimeEnv.GH_TOKEN

  const mcUrl = runtimeEnv.MC_URL || runtimeEnv.MISSION_CONTROL_URL || `http://127.0.0.1:${runtimeEnv.PORT || '4000'}`
  runtimeEnv.MC_URL = mcUrl
  runtimeEnv.MISSION_CONTROL_URL = runtimeEnv.MISSION_CONTROL_URL || mcUrl

  if (!runtimeEnv.MC_API_KEY && runtimeEnv.API_KEY) runtimeEnv.MC_API_KEY = runtimeEnv.API_KEY

  return runtimeEnv
}

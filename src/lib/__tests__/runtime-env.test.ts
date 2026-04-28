import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { getEffectiveEnvValue, getRuntimeEnv } from '../runtime-env'

describe('getEffectiveEnvValue', () => {
  afterEach(() => {
    delete process.env.TEST_RUNTIME_ENV
  })

  it('reads values from the OpenClaw env file before process.env', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'mc-runtime-env-'))
    try {
      const envFilePath = path.join(tmpDir, '.env')
      await writeFile(envFilePath, 'TEST_RUNTIME_ENV=from-file\n', 'utf-8')
      process.env.TEST_RUNTIME_ENV = 'from-process'

      await expect(getEffectiveEnvValue('TEST_RUNTIME_ENV', { envFilePath })).resolves.toBe('from-file')
    } finally {
      await rm(tmpDir, { recursive: true, force: true })
    }
  })

  it('falls back to process.env when the env file does not define the key', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'mc-runtime-env-'))
    try {
      const envFilePath = path.join(tmpDir, '.env')
      await writeFile(envFilePath, 'OTHER_KEY=value\n', 'utf-8')
      process.env.TEST_RUNTIME_ENV = 'from-process'

      await expect(getEffectiveEnvValue('TEST_RUNTIME_ENV', { envFilePath })).resolves.toBe('from-process')
    } finally {
      await rm(tmpDir, { recursive: true, force: true })
    }
  })

  it('returns an empty string when the key is missing everywhere', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'mc-runtime-env-'))
    try {
      const envFilePath = path.join(tmpDir, '.env')
      await writeFile(envFilePath, '', 'utf-8')

      await expect(getEffectiveEnvValue('TEST_RUNTIME_ENV', { envFilePath })).resolves.toBe('')
    } finally {
      await rm(tmpDir, { recursive: true, force: true })
    }
  })

  it('builds a runtime env with shared aliases and Mission Control defaults', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'mc-runtime-env-'))
    try {
      const envFilePath = path.join(tmpDir, '.env')
      await writeFile(envFilePath, 'GITHUB_TOKEN=github-token\n', 'utf-8')

      const env = await getRuntimeEnv({ envFilePath, extra: { PORT: '4999', PATH: '/custom/bin' } as unknown as NodeJS.ProcessEnv })

      expect(env.GITHUB_TOKEN).toBe('github-token')
      expect(env.GH_TOKEN).toBe('github-token')
      expect(env.MC_URL).toBe('http://127.0.0.1:4999')
      expect(env.MISSION_CONTROL_URL).toBe('http://127.0.0.1:4999')
      expect(env.PATH).toContain('/custom/bin')
    } finally {
      await rm(tmpDir, { recursive: true, force: true })
    }
  })
})

import { z } from 'zod'
import { homedir } from 'node:os'
import { join } from 'node:path'

const ConfigSchema = z.object({
  githubToken: z.string().min(1).optional(),
  librariesIoApiKey: z.string().min(1).optional(),
  cacheDir: z.string().min(1),
  cacheTtlSeconds: z.coerce.number().int().positive(),
  rateLimitPerSecond: z.coerce.number().int().positive(),
})

export type Config = z.infer<typeof ConfigSchema>

export const DEFAULT_CONFIG = {
  cacheDir: join(homedir(), '.deadweight', 'cache'),
  cacheTtlSeconds: 3600,
  rateLimitPerSecond: 10,
} as const

/**
 * Loads and validates configuration from environment variables.
 * Falls back to DEFAULT_CONFIG values for optional settings.
 * @throws {ZodError} if DEADWEIGHT_CACHE_TTL or DEADWEIGHT_RATE_LIMIT are non-numeric,
 *   zero, or negative.
 */
export function loadConfig(): Config {
  const raw = {
    githubToken: process.env.GITHUB_TOKEN,
    librariesIoApiKey: process.env.LIBRARIES_IO_API_KEY,
    cacheDir: process.env.DEADWEIGHT_CACHE_DIR ?? DEFAULT_CONFIG.cacheDir,
    cacheTtlSeconds: process.env.DEADWEIGHT_CACHE_TTL ?? DEFAULT_CONFIG.cacheTtlSeconds,
    rateLimitPerSecond: process.env.DEADWEIGHT_RATE_LIMIT ?? DEFAULT_CONFIG.rateLimitPerSecond,
  }
  return ConfigSchema.parse(raw)
}

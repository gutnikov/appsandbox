import type { Env } from '../env.ts'

/** Полная конфигурация для тестов. Реальные секреты сюда не попадают. */
export function testEnv(overrides: Partial<Env> = {}): Env {
  return {
    NODE_ENV: 'test',
    PORT: 3000,
    PUBLIC_BASE_URL: 'https://zerotomvp.xyz',
    GITHUB_CLIENT_ID: 'client-id',
    GITHUB_CLIENT_SECRET: 'client-secret',
    GITHUB_OAUTH_REDIRECT_URI: 'https://zerotomvp.xyz/api/auth/github/callback',
    TEMPLATE_REPO: 'gutnikov/sandbox-template',
    DATABASE_URL: 'postgres://unused',
    SESSION_SECRET: 'test-session-secret-at-least-32-chars',
    REGISTRY_HOST: 'registry.zerotomvp.xyz',
    REGISTRY_TOKEN_KEY: 'unused-in-tests',
    REGISTRY_TOKEN_KID: 'test-key',
    REGISTRY_INTERNAL_URL: 'http://registry.internal:5000',
    ...overrides,
  }
}

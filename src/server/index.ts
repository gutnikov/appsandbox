import { serve } from '@hono/node-server'
import { createApp } from './app.ts'
import { createPool, databaseHealthCheck } from './db/pool.ts'
import { EnvError, env } from './env.ts'
import { loadRegistrySigningKey } from './registry/key.ts'
import { createGitHubJwks } from './registry/oidc.ts'
import { createRegistryRoutes } from './routes/registry.ts'
import { sandboxHostMiddleware } from './routes/sandbox-host.ts'
import { resolveSandboxState } from './sandbox-status/resolve.ts'
import { createProvision } from './sandboxes/provision.ts'
import { findByRepoFullName } from './sandboxes/registry.ts'

async function main() {
  let config
  try {
    config = env()
  } catch (error) {
    if (error instanceof EnvError) {
      console.error(error.message)
      process.exit(1)
    }
    throw error
  }

  const pool = createPool(config.DATABASE_URL)

  const signing = await loadRegistrySigningKey(
    config.REGISTRY_TOKEN_KEY,
    config.REGISTRY_TOKEN_KID,
  )

  const app = createApp({
    env: config,
    healthChecks: [databaseHealthCheck(pool)],
    provision: createProvision({ pool, env: config }),
    sandboxHost: sandboxHostMiddleware({ env: config, pool, signing }),
    sandboxState: (name) => resolveSandboxState({ env: config, pool, signing }, name),
    registryRoutes: createRegistryRoutes({
      env: config,
      jwks: createGitHubJwks(),
      signing,
      lookupSandbox: async (repoFullName) => {
        const row = await findByRepoFullName(pool, repoFullName)
        return row ? { name: row.name, githubLogin: row.github_login } : undefined
      },
    }),
  })

  const server = serve({ fetch: app.fetch, port: config.PORT }, (info) => {
    console.log(`zerotomvp слушает на :${info.port} (${config.NODE_ENV})`)
  })

  const shutdown = () => {
    server.close(() => {
      void pool.end().finally(() => process.exit(0))
    })
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})

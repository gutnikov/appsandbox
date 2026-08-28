import { existsSync } from 'node:fs'

// Тестам нужна та же конфигурация, что и dev-серверу.
if (existsSync('.env')) process.loadEnvFile('.env')

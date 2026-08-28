import { loadSigningKey, type SigningKey } from './token.ts'

const PEM_HEADER = '-----BEGIN'

/**
 * Ключ приезжает через окружение, где многострочный PEM неудобен, поэтому
 * принимаем и base64 от него.
 */
export function decodeKeyMaterial(value: string): string {
  const trimmed = value.trim()
  if (trimmed.startsWith(PEM_HEADER)) return trimmed

  const decoded = Buffer.from(trimmed, 'base64').toString('utf8')
  if (!decoded.trimStart().startsWith(PEM_HEADER)) {
    throw new Error('REGISTRY_TOKEN_KEY: ожидается PKCS#8 PEM или его base64')
  }
  return decoded.trim()
}

export function loadRegistrySigningKey(value: string, kid: string): Promise<SigningKey> {
  return loadSigningKey(decodeKeyMaterial(value), kid)
}

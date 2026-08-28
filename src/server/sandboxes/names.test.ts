import { describe, expect, it } from 'vitest'
import {
  MAX_NAME_LENGTH,
  NAME_PREFIX,
  generateName,
  isValidSandboxName,
  sandboxUrl,
  __wordlistSizes,
} from './names.ts'

describe('generateName', () => {
  it('всегда даёт имя, пригодное и как репозиторий, и как метка DNS', () => {
    for (let i = 0; i < 2000; i += 1) {
      const name = generateName()
      expect(isValidSandboxName(name), name).toBe(true)
      expect(name.startsWith(NAME_PREFIX), name).toBe(true)
      expect(name.length, name).toBeLessThanOrEqual(MAX_NAME_LENGTH)
      expect(name, name).toBe(name.toLowerCase())
    }
  })

  it('имеет вид sandbox-<слово>-<слово>', () => {
    const name = generateName({ random: () => 0 })
    expect(name.split('-')).toHaveLength(3)
  })

  it('с хвостом остаётся корректным и отличается от имени без хвоста', () => {
    const plain = generateName({ random: () => 0 })
    const suffixed = generateName({ random: () => 0, suffix: true })
    expect(isValidSandboxName(suffixed)).toBe(true)
    expect(suffixed.startsWith(plain)).toBe(true)
    expect(suffixed).not.toBe(plain)
  })

  it('детерминирован при заданном источнике случайности', () => {
    const random = () => 3
    expect(generateName({ random })).toBe(generateName({ random }))
  })

  it('опирается на непустые словари', () => {
    expect(__wordlistSizes.adjectives).toBeGreaterThan(64)
    expect(__wordlistSizes.nouns).toBeGreaterThan(64)
  })
})

describe('isValidSandboxName', () => {
  it('принимает корректные имена', () => {
    expect(isValidSandboxName('sandbox-brave-otter')).toBe(true)
    expect(isValidSandboxName('sandbox-brave-otter-a1b2')).toBe(true)
  })

  it('требует префикс: служебные поддомены платформы недостижимы', () => {
    for (const name of ['www', 'api', 'app', 'mail', 'brave-otter']) {
      expect(isValidSandboxName(name), name).toBe(false)
    }
  })

  it('отклоняет некорректные метки DNS', () => {
    for (const name of [
      'sandbox-Brave-Otter',
      'sandbox--otter',
      'sandbox-otter-',
      'sandbox-',
      'sandbox-otter_1',
      `sandbox-${'a'.repeat(MAX_NAME_LENGTH)}`,
    ]) {
      expect(isValidSandboxName(name), name).toBe(false)
    }
  })
})

describe('sandboxUrl', () => {
  it('складывает адрес сэндбокса из имени и апекса', () => {
    expect(sandboxUrl('sandbox-brave-otter', 'zerotomvp.xyz')).toBe(
      'https://sandbox-brave-otter.zerotomvp.xyz',
    )
  })
})

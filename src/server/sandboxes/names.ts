import { randomInt } from 'node:crypto'

/**
 * Имя сэндбокса — одновременно название репозитория и поддомен третьего
 * уровня. Префикс обязателен: он делает структурно невозможным захват
 * служебных поддоменов платформы (www, api, app), поэтому отдельный список
 * запрещённых имён не нужен.
 */
export const NAME_PREFIX = 'sandbox-'

/** Ограничение длины метки DNS. */
export const MAX_NAME_LENGTH = 63

/** Должно совпадать с ограничением sandboxes_name_format_check в миграции. */
const NAME_PATTERN = /^sandbox-[a-z0-9]+(-[a-z0-9]+)*$/

const ADJECTIVES = [
  'amber', 'ancient', 'autumn', 'bold', 'brave', 'brief', 'bright', 'brisk',
  'calm', 'candid', 'cheerful', 'civic', 'clear', 'clever', 'cosmic', 'cozy',
  'crisp', 'curious', 'daring', 'dawn', 'deep', 'dense', 'dewy', 'distant',
  'eager', 'early', 'easy', 'elder', 'electric', 'empty', 'endless', 'even',
  'fair', 'fancy', 'fast', 'fearless', 'fine', 'first', 'flat', 'fluent',
  'fond', 'forest', 'free', 'fresh', 'frosty', 'gentle', 'giant', 'glad',
  'golden', 'grand', 'green', 'happy', 'hidden', 'high', 'holy', 'humble',
  'icy', 'idle', 'jolly', 'keen', 'kind', 'late', 'lazy', 'light',
  'linen', 'little', 'lively', 'lone', 'loud', 'lucky', 'lunar', 'main',
  'mellow', 'merry', 'mighty', 'mild', 'misty', 'modern', 'moral', 'narrow',
  'neat', 'nimble', 'noble', 'northern', 'olive', 'open', 'patient', 'plain',
  'polar', 'proud', 'pure', 'quiet', 'rapid', 'rare', 'ready', 'restless',
  'rich', 'rising', 'rough', 'round', 'royal', 'ruby', 'rustic', 'sacred',
  'sandy', 'shy', 'silent', 'silver', 'simple', 'sleek', 'slim', 'small',
  'smooth', 'snowy', 'soft', 'solar', 'solid', 'sombre', 'spare', 'spring',
  'square', 'steady', 'stellar', 'still', 'stormy', 'sunny', 'swift', 'tall',
  'tender', 'tidy', 'timely', 'tiny', 'true', 'twin', 'urban', 'valiant',
  'velvet', 'vivid', 'warm', 'wandering', 'wide', 'wild', 'winter', 'wise',
] as const

const NOUNS = [
  'acorn', 'alder', 'anchor', 'arbor', 'arrow', 'aspen', 'atlas', 'aurora',
  'badger', 'basin', 'bay', 'beacon', 'bear', 'beech', 'birch', 'bison',
  'bloom', 'boulder', 'branch', 'breeze', 'bridge', 'brook', 'canyon', 'cedar',
  'cliff', 'cloud', 'clover', 'comet', 'compass', 'copper', 'coral', 'cove',
  'crane', 'crater', 'creek', 'crest', 'crow', 'dawn', 'delta', 'dew',
  'dune', 'eagle', 'ember', 'falcon', 'fern', 'field', 'finch', 'fjord',
  'flame', 'fleet', 'flint', 'forest', 'fox', 'garden', 'glacier', 'glade',
  'grove', 'gull', 'harbor', 'hawk', 'haze', 'heron', 'hill', 'hollow',
  'horizon', 'ibis', 'inlet', 'iris', 'island', 'ivory', 'juniper', 'kestrel',
  'lagoon', 'lake', 'lantern', 'lark', 'laurel', 'leaf', 'ledge', 'lily',
  'linden', 'lynx', 'maple', 'marsh', 'meadow', 'mesa', 'mist', 'moss',
  'moth', 'mountain', 'nest', 'nova', 'oak', 'oasis', 'ocean', 'orbit',
  'orchid', 'osprey', 'otter', 'owl', 'palm', 'peak', 'pebble', 'pine',
  'plain', 'plover', 'pond', 'poplar', 'prairie', 'quail', 'quarry', 'rain',
  'raven', 'reef', 'ridge', 'river', 'robin', 'rook', 'sage', 'sail',
  'sequoia', 'shore', 'sky', 'slope', 'sparrow', 'spruce', 'stone', 'stream',
  'summit', 'swallow', 'thistle', 'thrush', 'tide', 'trail', 'tundra', 'valley',
  'vale', 'willow', 'wind', 'wolf', 'woods', 'wren', 'yarrow', 'zephyr',
] as const

/** Источник случайности: возвращает целое из [0, max). */
export type RandomSource = (max: number) => number

const defaultRandom: RandomSource = (max) => randomInt(max)

function pick<T>(items: readonly T[], random: RandomSource): T {
  const item = items[random(items.length)]
  if (item === undefined) throw new Error('Источник случайности вышел за границы списка')
  return item
}

const SUFFIX_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'
const SUFFIX_LENGTH = 4

function makeSuffix(random: RandomSource): string {
  let suffix = ''
  for (let i = 0; i < SUFFIX_LENGTH; i += 1) {
    suffix += SUFFIX_ALPHABET[random(SUFFIX_ALPHABET.length)]
  }
  return suffix
}

export type GenerateNameOptions = {
  random?: RandomSource
  /** Добавить случайный хвост: пространство пар «прилагательное-существительное» конечно. */
  suffix?: boolean
}

export function generateName(options: GenerateNameOptions = {}): string {
  const random = options.random ?? defaultRandom
  const parts: string[] = [pick(ADJECTIVES, random), pick(NOUNS, random)]
  if (options.suffix) parts.push(makeSuffix(random))
  return NAME_PREFIX + parts.join('-')
}

export function isValidSandboxName(name: string): boolean {
  return NAME_PATTERN.test(name) && name.length <= MAX_NAME_LENGTH
}

/** Адрес сэндбокса на платформе. */
export function sandboxUrl(name: string, apexHost: string): string {
  return `https://${name}.${apexHost}`
}

export const __wordlistSizes = { adjectives: ADJECTIVES.length, nouns: NOUNS.length }

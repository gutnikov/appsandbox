import { describe, expect, it } from 'vitest'
import { couldBeSandbox, sandboxNameFromHost } from './state.ts'

describe('имя сэндбокса из хоста', () => {
  it('берёт метку прямо под апексом', () => {
    expect(sandboxNameFromHost('sandbox-brisk-sail.zerotomvp.xyz', 'zerotomvp.xyz')).toBe(
      'sandbox-brisk-sail',
    )
  })

  it('не считает адресом сэндбокса сам апекс', () => {
    expect(sandboxNameFromHost('zerotomvp.xyz', 'zerotomvp.xyz')).toBeUndefined()
  })

  it('игнорирует порт: в разработке он есть, в адресе сэндбокса роли не играет', () => {
    expect(sandboxNameFromHost('sandbox-x.localhost:5173', 'localhost:5173')).toBe('sandbox-x')
  })

  it('не берёт вложенные поддомены', () => {
    expect(sandboxNameFromHost('a.b.zerotomvp.xyz', 'zerotomvp.xyz')).toBeUndefined()
  })

  it('не берёт чужой домен', () => {
    expect(sandboxNameFromHost('sandbox-x.example.com', 'zerotomvp.xyz')).toBeUndefined()
    expect(sandboxNameFromHost('zerotomvp.xyz.evil.com', 'zerotomvp.xyz')).toBeUndefined()
  })

  it('нечувствителен к регистру', () => {
    expect(sandboxNameFromHost('Sandbox-Brisk-Sail.ZeroToMVP.xyz', 'zerotomvp.xyz')).toBe(
      'sandbox-brisk-sail',
    )
  })
})

describe('может ли имя вообще быть сэндбоксом', () => {
  it('пропускает корректные имена', () => {
    expect(couldBeSandbox('sandbox-brisk-sail')).toBe(true)
  })

  it('отсекает служебные имена, не тратя запрос в базу', () => {
    for (const name of ['www', 'api', 'registry', 'app', 'staging']) {
      expect(couldBeSandbox(name), name).toBe(false)
    }
  })
})

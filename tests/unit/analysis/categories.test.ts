import { describe, it, expect } from 'vitest'
import { getCategory, CATEGORY_MAP } from '../../../src/analysis/categories.js'
import type { FunctionalCategory } from '../../../src/analysis/categories.js'

describe('CATEGORY_MAP', () => {
  it('has http-client category with axios', () => {
    expect(CATEGORY_MAP['http-client']).toContain('axios')
  })

  it('has date-time category with moment and dayjs', () => {
    expect(CATEGORY_MAP['date-time']).toContain('moment')
    expect(CATEGORY_MAP['date-time']).toContain('dayjs')
  })

  it('has logger category with winston and pino', () => {
    expect(CATEGORY_MAP['logger']).toContain('winston')
    expect(CATEGORY_MAP['logger']).toContain('pino')
  })

  it('has validation category with zod and joi', () => {
    expect(CATEGORY_MAP['validation']).toContain('zod')
    expect(CATEGORY_MAP['validation']).toContain('joi')
  })

  it('has testing category with jest and vitest', () => {
    expect(CATEGORY_MAP['testing']).toContain('jest')
    expect(CATEGORY_MAP['testing']).toContain('vitest')
  })

  it('has state-management category with redux and zustand', () => {
    expect(CATEGORY_MAP['state-management']).toContain('redux')
    expect(CATEGORY_MAP['state-management']).toContain('zustand')
  })

  it('has utility category with lodash', () => {
    expect(CATEGORY_MAP['utility']).toContain('lodash')
  })

  it('has database category with mongoose and prisma', () => {
    expect(CATEGORY_MAP['database']).toContain('mongoose')
    expect(CATEGORY_MAP['database']).toContain('prisma')
  })

  it('covers all FunctionalCategory values', () => {
    const expectedCategories: FunctionalCategory[] = [
      'http-client', 'date-time', 'utility', 'testing', 'logger',
      'database', 'validation', 'bundler', 'linter', 'framework',
      'state-management', 'css-in-js', 'i18n', 'auth', 'cache',
      'queue', 'crypto', 'parser', 'serialization', 'template', 'other',
    ]
    for (const cat of expectedCategories) {
      if (cat !== 'other') {
        expect(CATEGORY_MAP).toHaveProperty(cat)
      }
    }
  })
})

describe('getCategory', () => {
  it('returns http-client for axios', () => {
    expect(getCategory('axios')).toBe('http-client')
  })

  it('returns http-client for node-fetch', () => {
    expect(getCategory('node-fetch')).toBe('http-client')
  })

  it('returns http-client for got', () => {
    expect(getCategory('got')).toBe('http-client')
  })

  it('returns date-time for moment', () => {
    expect(getCategory('moment')).toBe('date-time')
  })

  it('returns date-time for dayjs', () => {
    expect(getCategory('dayjs')).toBe('date-time')
  })

  it('returns date-time for date-fns', () => {
    expect(getCategory('date-fns')).toBe('date-time')
  })

  it('returns logger for winston', () => {
    expect(getCategory('winston')).toBe('logger')
  })

  it('returns logger for pino', () => {
    expect(getCategory('pino')).toBe('logger')
  })

  it('returns validation for zod', () => {
    expect(getCategory('zod')).toBe('validation')
  })

  it('returns validation for joi', () => {
    expect(getCategory('joi')).toBe('validation')
  })

  it('returns testing for jest', () => {
    expect(getCategory('jest')).toBe('testing')
  })

  it('returns testing for vitest', () => {
    expect(getCategory('vitest')).toBe('testing')
  })

  it('returns state-management for redux', () => {
    expect(getCategory('redux')).toBe('state-management')
  })

  it('returns utility for lodash', () => {
    expect(getCategory('lodash')).toBe('utility')
  })

  it('returns database for mongoose', () => {
    expect(getCategory('mongoose')).toBe('database')
  })

  it('returns database for prisma', () => {
    expect(getCategory('prisma')).toBe('database')
  })

  it('returns other for unknown package', () => {
    expect(getCategory('some-random-package-xyz')).toBe('other')
  })

  it('returns other for empty string', () => {
    expect(getCategory('')).toBe('other')
  })

  it('is case-sensitive (lodash != Lodash)', () => {
    expect(getCategory('Lodash')).toBe('other')
  })
})

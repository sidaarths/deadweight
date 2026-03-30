export type FunctionalCategory =
  | 'http-client'
  | 'date-time'
  | 'utility'
  | 'testing'
  | 'logger'
  | 'database'
  | 'validation'
  | 'bundler'
  | 'linter'
  | 'framework'
  | 'state-management'
  | 'css-in-js'
  | 'i18n'
  | 'auth'
  | 'cache'
  | 'queue'
  | 'crypto'
  | 'parser'
  | 'serialization'
  | 'template'
  | 'other'

export const CATEGORY_MAP: Record<Exclude<FunctionalCategory, 'other'>, readonly string[]> = {
  'http-client': ['axios', 'node-fetch', 'got', 'superagent', 'ky', 'undici', 'request', 'cross-fetch', 'isomorphic-fetch', 'needle'],
  'date-time': ['moment', 'dayjs', 'date-fns', 'luxon', 'temporal-polyfill', 'date-fns-tz', 'moment-timezone'],
  'utility': ['lodash', 'underscore', 'ramda', 'fp-ts', 'rambda', 'lodash-es'],
  'testing': ['jest', 'mocha', 'vitest', 'jasmine', 'ava', 'tape', 'chai', 'sinon', 'supertest', 'nock', 'msw', 'playwright', 'cypress', 'puppeteer'],
  'logger': ['winston', 'pino', 'bunyan', 'log4js', 'debug', 'consola', 'loglevel', 'morgan', 'signale', 'npmlog'],
  'database': ['mongoose', 'sequelize', 'typeorm', 'prisma', 'knex', 'mikro-orm', 'pg', 'mysql2', 'sqlite3', 'redis', 'ioredis', 'mongodb'],
  'validation': ['zod', 'joi', 'yup', 'ajv', 'class-validator', 'io-ts', 'superstruct', 'valibot', 'validator', 'fastest-validator'],
  'bundler': ['webpack', 'rollup', 'parcel', 'vite', 'esbuild', 'tsup', 'swc', 'babel', '@babel/core'],
  'linter': ['eslint', 'tslint', 'prettier', 'stylelint', 'oxlint', 'biome'],
  'framework': ['express', 'fastify', 'koa', 'hapi', 'nest', '@nestjs/core', 'next', 'nuxt', 'remix', 'hono', 'astro'],
  'state-management': ['redux', 'mobx', 'zustand', 'jotai', 'recoil', 'xstate', 'valtio', '@reduxjs/toolkit', 'pinia'],
  'css-in-js': ['styled-components', 'emotion', '@emotion/react', 'linaria', 'stitches', 'vanilla-extract'],
  'i18n': ['i18next', 'react-i18next', 'vue-i18n', 'format-message', 'globalize', 'intl-messageformat'],
  'auth': ['passport', 'jsonwebtoken', 'bcrypt', 'bcryptjs', 'argon2', 'jose', 'oauth2orize', 'express-session'],
  'cache': ['node-cache', 'lru-cache', 'keyv', 'cache-manager', 'memory-cache', 'node-lru-cache'],
  'queue': ['bull', 'bullmq', 'bee-queue', 'agenda', 'kue', 'pg-boss', 'amqplib'],
  'crypto': ['crypto-js', 'node-forge', 'jsencrypt', 'tweetnacl', 'libsodium-wrappers'],
  'parser': ['xml2js', 'fast-xml-parser', 'csv-parse', 'papaparse', 'marked', 'remark', 'unified'],
  'serialization': ['protobufjs', 'avsc', 'msgpack', 'cbor', 'flatbuffers'],
  'template': ['handlebars', 'ejs', 'pug', 'nunjucks', 'mustache', 'liquidjs'],
}

// Build reverse lookup for O(1) lookups
const PACKAGE_TO_CATEGORY = new Map<string, FunctionalCategory>()
for (const [category, packages] of Object.entries(CATEGORY_MAP)) {
  for (const pkg of packages) {
    PACKAGE_TO_CATEGORY.set(pkg, category as FunctionalCategory)
  }
}

export function getCategory(packageName: string): FunctionalCategory {
  return PACKAGE_TO_CATEGORY.get(packageName) ?? 'other'
}

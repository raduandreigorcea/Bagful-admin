import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// vue-tsc does not notice a component used in a template but never imported: Vue
// only warns at runtime and renders an unknown element. That is how Overview lost
// its status pills. Every <PascalCase> tag must have a matching import.

const BUILTIN = new Set(['RouterLink', 'RouterView', 'Transition', 'TransitionGroup', 'KeepAlive', 'Teleport', 'Suspense', 'SignIn'])

function vueFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? vueFiles(join(dir, entry.name)) : entry.name.endsWith('.vue') ? [join(dir, entry.name)] : [],
  )
}

describe('templates', () => {
  it('import every component they use', () => {
    const missing: string[] = []
    for (const file of vueFiles('src')) {
      const source = readFileSync(file, 'utf8')
      const template = source.split('<script')[0] + (source.match(/<template[\s\S]*<\/template>/)?.[0] ?? '')
      const used = new Set([...template.matchAll(/<([A-Z][A-Za-z0-9]+)[\s/>]/g)].map((m) => m[1]))
      for (const name of used) {
        if (BUILTIN.has(name)) continue
        if (!new RegExp(`\\b${name}\\b[^\\n]*from|import[^\\n]*\\b${name}\\b`).test(source)) missing.push(`${file}: ${name}`)
      }
    }
    expect(missing).toEqual([])
  })
})

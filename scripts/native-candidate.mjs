import { createHash } from 'node:crypto'
import { closeSync, lstatSync, openSync, readSync, readdirSync, realpathSync } from 'node:fs'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'

export const target = 'x86_64-pc-windows-msvc'
export const repositories = Object.freeze({
  contracts: 'cirnet-contracts',
  simulator: 'cirnet-simulator',
  hardware: 'cirnet-hardware',
  remote: 'cirnet-remote',
  interface: 'cirnet-interface',
  embedded: 'cirnet-embedded-hardware',
})

const reserved = /^(CON|PRN|AUX|NUL|COM[0-9]|LPT[0-9])(\.|$)/i
export const digestPattern = /^[a-f0-9]{64}$/
export const comparePaths = (a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0

export function sha256(file) {
  const fd = openSync(file, 'r')
  try {
    const hash = createHash('sha256')
    const buffer = Buffer.allocUnsafe(65536)
    let size
    while ((size = readSync(fd, buffer)) > 0) hash.update(buffer.subarray(0, size))
    return hash.digest('hex')
  } finally {
    closeSync(fd)
  }
}

export function fileRecord(file, path) {
  const stat = lstatSync(file)
  if (!stat.isFile()) throw new Error(`Expected an ordinary file: ${file}`)
  return { path, size: stat.size, sha256: sha256(file) }
}

export function windowsSegments(path) {
  const parts = path.split('/')
  if (parts.some(part => !/^[a-zA-Z0-9_-][a-zA-Z0-9_. -]*$/.test(part) ||
      /[. ]$/.test(part) || reserved.test(part))) {
    throw new Error(`Unsafe candidate path: ${path}`)
  }
  return parts
}

export function ordinaryDirectory(path) {
  if (!lstatSync(path).isDirectory()) throw new Error(`Expected an ordinary directory: ${path}`)
  return realpathSync(path)
}

function contains(parent, child) {
  const from = relative(parent, child)
  return from === '' || (!isAbsolute(from) && from !== '..' && !from.startsWith(`..${sep}`))
}

export function externalDirectory(path, roots) {
  if (!isAbsolute(path)) throw new Error(`Expected an absolute output path: ${path}`)
  const directory = ordinaryDirectory(path)
  if (roots.some(root => contains(root, directory) || contains(directory, root))) {
    throw new Error(`Select an output directory separate from all source repositories: ${path}`)
  }
  return directory
}

export function sourceDigest(files) {
  const identity = [...files].sort(comparePaths).map(({ path, size, sha256 }) => [path, size, sha256])
  return createHash('sha256').update(JSON.stringify(identity)).digest('hex')
}

export function artifactInventory(root) {
  ordinaryDirectory(root)
  const files = []
  const seen = new Set()
  function walk(directory, prefix = '') {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = prefix + entry.name
      const key = path.toLowerCase()
      windowsSegments(path)
      if (seen.has(key)) throw new Error(`Duplicate candidate path: ${path}`)
      seen.add(key)
      const full = join(directory, entry.name)
      if (entry.isDirectory()) {
        walk(full, path + '/')
      } else if (path !== 'native-manifest.json') {
        if (/\.(py|pyc|pyd|whl)$/i.test(path) || /(^|\/)python[^/]*\.dll$/i.test(path)) {
          throw new Error(`Unexpected Python runtime file: ${path}`)
        }
        files.push(fileRecord(full, path))
      }
    }
  }
  walk(resolve(root))
  return files.sort(comparePaths)
}

export function verifyInventory(root, expected) {
  const actual = new Map(artifactInventory(root).map(file => [file.path, file]))
  if (!Array.isArray(expected) || expected.length === 0) throw new Error('Missing expected inventory')
  for (const { path, size, sha256: digest } of expected) {
    windowsSegments(path)
    const file = actual.get(path)
    if (file?.size !== size || file?.sha256 !== digest || !digestPattern.test(digest ?? '')) {
      throw new Error(`Missing or modified candidate file: ${path}`)
    }
    actual.delete(path)
  }
  if (actual.size > 0) throw new Error(`Undeclared candidate file: ${actual.keys().next().value}`)
}

import { execFileSync, spawnSync } from 'node:child_process'
import { constants, copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import {
  digestPattern, externalDirectory, fileRecord, ordinaryDirectory, repositories, sourceDigest, target,
} from './native-candidate.mjs'

const workspace = resolve(import.meta.dirname, '../..')
const roots = Object.fromEntries(Object.values(repositories).map(name => [name, ordinaryDirectory(join(workspace, name))]))
const git = (repo, args) => execFileSync('git', ['--no-optional-locks', '-C', repo, ...args],
  { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, windowsHide: true }).trimEnd()

function validateOutput(path) {
  const directory = externalDirectory(dirname(path), Object.values(roots))
  const result = spawnSync('git', ['--no-optional-locks', '-C', directory, 'rev-parse', '--git-dir'],
    { encoding: 'utf8', windowsHide: true })
  if (result.error) throw result.error
  if (result.status === 0 || !/not a git repository/i.test(result.stderr)) {
    throw new Error(`Expected an output path outside Git checkouts and Git directories: ${path}`)
  }
}

function sourceFiles(repo) {
  const tracked = git(repo, ['ls-files', '--cached', '--others', '--exclude-standard', '-z']).split('\0')
  const deleted = new Set(git(repo, ['ls-files', '--deleted', '-z']).split('\0'))
  const seen = new Set()
  return [...new Set(tracked)].filter(path => path && !deleted.has(path)).sort().map(path => {
    const parts = path.split('/')
    if (parts.some(part => !part || /^[.]{1,2}$/.test(part) || part.toLowerCase() === '.git' ||
        /[\\:<>|"?*\x00-\x1f]/.test(part) || /[. ]$/.test(part)) || seen.has(path.toLowerCase())) {
      throw new Error(`Unsafe or duplicate source path: ${path}`)
    }
    seen.add(path.toLowerCase())
    for (let index = 1; index < parts.length; index++) {
      if (!lstatSync(join(repo, ...parts.slice(0, index))).isDirectory()) {
        throw new Error(`Source path traverses a non-directory: ${path}`)
      }
    }
    return fileRecord(join(repo, ...parts), path)
  })
}

function collectSelection() {
  return {
    schemaVersion: 1,
    target,
    repositories: Object.fromEntries(Object.entries(roots).map(([name, repo]) => {
      const files = sourceFiles(repo)
      return [name, {
        baseRevision: git(repo, ['rev-parse', 'HEAD']),
        dirty: Boolean(git(repo, ['status', '--porcelain=v1'])),
        sourceSha256: sourceDigest(files),
        files,
      }]
    })),
  }
}

function stage(selectionFile, destination) {
  if (!isAbsolute(selectionFile) || !isAbsolute(destination)) throw new Error('Select absolute input and output paths')
  validateOutput(destination)
  if (existsSync(destination)) throw new Error('Stage already exists')
  const selection = JSON.parse(readFileSync(selectionFile, 'utf8'))
  if (selection.schemaVersion !== 1 || selection.target !== target ||
      Object.keys(selection.repositories ?? {}).length !== Object.keys(roots).length) {
    throw new Error('Invalid candidate source selection')
  }
  const current = collectSelection()
  for (const [name, expected] of Object.entries(current.repositories)) {
    const locked = selection.repositories[name]
    if (!digestPattern.test(locked?.sourceSha256 ?? '') || !Array.isArray(locked.files) ||
        locked.sourceSha256 !== sourceDigest(locked.files) || locked.sourceSha256 !== expected.sourceSha256) {
      throw new Error(`Selected source differs: ${name}`)
    }
    if (locked.baseRevision !== expected.baseRevision || locked.dirty !== expected.dirty) {
      throw new Error(`Selected Git provenance differs: ${name}`)
    }
  }

  mkdirSync(destination)
  for (const [name, { files }] of Object.entries(current.repositories)) {
    const repo = roots[name]
    for (const record of files) {
      const path = join(destination, name, record.path)
      mkdirSync(dirname(path), { recursive: true })
      copyFileSync(join(repo, record.path), path, constants.COPYFILE_EXCL)
      const copied = fileRecord(path, record.path)
      if (copied.size !== record.size || copied.sha256 !== record.sha256) {
        throw new Error(`Source changed while staging: ${name}/${record.path}`)
      }
    }
  }
}

const [action, selection, output, extra] = process.argv.slice(2)
if (extra !== undefined) throw new Error('Unexpected argument')
if (action === 'lock' && selection && isAbsolute(selection) && !output) {
  validateOutput(selection)
  writeFileSync(selection, JSON.stringify(collectSelection(), null, 2) + '\n', { flag: 'wx' })
} else if (action === 'stage' && selection && output) {
  stage(selection, output)
} else {
  throw new Error('Usage: native-source-selection.mjs lock ABSOLUTE_SELECTION | stage ABSOLUTE_SELECTION ABSOLUTE_DESTINATION')
}

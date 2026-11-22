import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  artifactInventory, fileRecord, sourceDigest, verifyInventory, windowsSegments,
} from './native-candidate.mjs'

test('source identity depends on canonical relative paths and file contents', () => {
  const files = [
    { path: 'src/main.rs', size: 1, sha256: 'a'.repeat(64) },
    { path: 'Cargo.toml', size: 1, sha256: 'b'.repeat(64) },
  ]
  assert.equal(sourceDigest(files), sourceDigest([...files].reverse()))
  assert.notEqual(sourceDigest(files), sourceDigest([{ ...files[0], path: 'src/lib.rs' }, files[1]]))
  assert.notEqual(sourceDigest(files), sourceDigest([{ ...files[0], sha256: 'c'.repeat(64) }, files[1]]))
})

test('candidate paths match the launcher restrictions', () => {
  assert.deepEqual(windowsSegments('web/assets/minified-file.js'), ['web', 'assets', 'minified-file.js'])
  for (const invalid of ['../outside', 'web/../outside', '/absolute', 'C:/root', 'bin/AUX.exe', 'web/x.']) {
    assert.throws(() => windowsSegments(invalid), /Unsafe candidate path/)
  }
})

test('candidate verification requires the exact inventory and digests', t => {
  assert(process.env.CIRNET_ARTIFACTS_SESSION, 'Set CIRNET_ARTIFACTS_SESSION to an external test session')
  const root = mkdtempSync(join(process.env.CIRNET_ARTIFACTS_SESSION, 'candidate-test-'))
  t.after(() => {
    for (const path of ['bin/worker.exe', 'extra.txt', 'python.dll']) {
      rmSync(join(root, path), { force: true })
    }
    rmdirSync(join(root, 'bin'))
    rmdirSync(root)
  })
  mkdirSync(join(root, 'bin'))
  const binary = join(root, 'bin', 'worker.exe')
  writeFileSync(binary, 'worker')
  const inventory = artifactInventory(root)
  assert.deepEqual(inventory, [fileRecord(binary, 'bin/worker.exe')])
  verifyInventory(root, inventory)
  writeFileSync(binary, 'tamper')
  assert.throws(() => verifyInventory(root, inventory), /Missing or modified/)
  writeFileSync(binary, 'worker')
  writeFileSync(join(root, 'python.dll'), 'unexpected')
  assert.throws(() => verifyInventory(root, inventory), /Python runtime/)
  rmSync(join(root, 'python.dll'))
  writeFileSync(join(root, 'extra.txt'), 'unexpected')
  assert.throws(() => verifyInventory(root, inventory), /Undeclared/)
})

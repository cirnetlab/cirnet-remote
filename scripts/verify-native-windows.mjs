import { readFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { digestPattern, fileRecord, target, verifyInventory } from './native-candidate.mjs'

const [directory, digest, extra] = process.argv.slice(2)
if (!isAbsolute(directory ?? '') || !digestPattern.test(digest ?? '') || extra) {
  throw new Error('Usage: node scripts/verify-native-windows.mjs ABSOLUTE_BUNDLE_DIRECTORY MANIFEST_SHA256')
}
const path = join(directory, 'native-manifest.json')
if (fileRecord(path, '').sha256 !== digest) throw new Error('Candidate manifest SHA-256 mismatch')
const manifest = JSON.parse(readFileSync(path, 'utf8'))
if (manifest.schemaVersion !== 1 || manifest.target !== target || manifest.product !== 'cirnet-native-candidate') {
  throw new Error('Unsupported candidate manifest')
}
verifyInventory(directory, manifest.files)
console.log(JSON.stringify({ result: 'PASS', version: manifest.version, files: manifest.files.length, manifestSha256: digest }))

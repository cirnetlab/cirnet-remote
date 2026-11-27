import { execFileSync, spawnSync } from 'node:child_process'
import { constants, copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import {
  digestPattern, externalDirectory, fileRecord, ordinaryDirectory, repositories, sourceDigest, target, verifyInventory,
} from './native-candidate.mjs'

const workspace = resolve(import.meta.dirname, '../..')
const roots = Object.fromEntries(Object.values(repositories).map(name => [name, ordinaryDirectory(join(workspace, name))]))
const gitEnv = { ...process.env, LC_ALL: 'C', LANG: 'C' }
for (const key of Object.keys(gitEnv)) {
  if (/^GIT_(?:DIR|WORK_TREE|COMMON_DIR|INDEX_FILE|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|CONFIG.*|CEILING_DIRECTORIES|DISCOVERY_ACROSS_FILESYSTEM)$/i.test(key)) delete gitEnv[key]
}
const git = (repo, args) => execFileSync('git', ['--no-optional-locks', '-C', repo, ...args],
  { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, windowsHide: true, env: gitEnv }).trimEnd()

function validateOutput(path) {
  const directory = externalDirectory(dirname(path), Object.values(roots))
  const result = spawnSync('git', ['--no-optional-locks', '-C', directory, 'rev-parse', '--git-dir'],
    { encoding: 'utf8', windowsHide: true, env: gitEnv })
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

function checkedSelection(selectionFile) {
  if (!isAbsolute(selectionFile)) throw new Error('Select an absolute source selection path')
  fileRecord(selectionFile, '')
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

  return current
}

function stage(selectionFile, destination) {
  if (!isAbsolute(destination)) throw new Error('Select an absolute output path')
  validateOutput(destination)
  if (existsSync(destination)) throw new Error('Stage already exists')
  const current = checkedSelection(selectionFile)
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

function checkReuse(receiptPath, evidencePath, evidenceSha256, expectedManifestSha256) {
  if (![receiptPath, evidencePath].every(isAbsolute) || !digestPattern.test(evidenceSha256) ||
      !digestPattern.test(expectedManifestSha256)) {
    throw new Error('Reuse requires absolute receipt and evidence paths plus their reviewed digests')
  }
  validateOutput(receiptPath)
  const session = ordinaryDirectory(dirname(receiptPath))
  if (resolve(dirname(receiptPath)) !== session) throw new Error('Expected a canonical candidate session')
  fileRecord(receiptPath, '')
  const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'))
  const directory = ordinaryDirectory(receipt.directory)
  if (directory !== receipt.directory || dirname(directory) !== session || receipt.manifestSha256 !== expectedManifestSha256) {
    throw new Error('Assembly receipt does not identify the reviewed candidate')
  }
  if (receipt.bundle !== directory + '.tar.gz' || fileRecord(receipt.bundle, '').sha256 !== receipt.bundleSha256) {
    throw new Error('Candidate archive differs from the assembly receipt')
  }
  const path = join(directory, 'native-manifest.json')
  if (fileRecord(path, '').sha256 !== expectedManifestSha256) throw new Error('Candidate manifest digest differs')
  const manifest = JSON.parse(readFileSync(path, 'utf8'))
  if (manifest.schemaVersion !== 1 || manifest.product !== 'cirnet-native-candidate' ||
      manifest.status !== 'development-candidate' || manifest.target !== target) throw new Error('Unsupported candidate manifest')
  verifyInventory(directory, manifest.files)
  const selection = checkedSelection(join(directory, 'receipts/source-selection.json'))
  for (const [name, current] of Object.entries(selection.repositories)) {
    const packaged = manifest.repositories?.[name]
    if (!packaged || ['baseRevision', 'dirty', 'sourceSha256'].some(key => packaged[key] !== current[key])) {
      throw new Error('Candidate provenance differs: ' + name)
    }
  }

  const smokeRoot = join(session, 'native-smoke')
  if (resolve(evidencePath) !== evidencePath || ordinaryDirectory(dirname(evidencePath)) !== dirname(evidencePath) ||
      dirname(dirname(evidencePath)) !== smokeRoot || !/^smoke-[a-z0-9]+$/i.test(evidencePath.split(/[\\/]/).at(-2)) ||
      evidencePath.split(/[\\/]/).at(-1) !== 'result.json' ||
      fileRecord(evidencePath, '').sha256 !== evidenceSha256) throw new Error('Expected the pinned packaged verification result from this candidate')
  const evidence = JSON.parse(readFileSync(evidencePath, 'utf8'))
  if (evidence.scope !== 'Windows development host' || evidence.manifestSha256 !== expectedManifestSha256 ||
      evidence.browserVerified !== true || evidence.savedDocument?.restored !== true ||
      evidence.capture?.backupAndRestoreMatch !== true ||
      !evidence.results?.some(step => step.action === 'BrowserVirtualRun' && step.exit === 0)) {
    throw new Error('Candidate is missing successful packaged browser verification')
  }
  if (process.platform !== 'win32' || process.env.VSCMD_ARG_TGT_ARCH !== 'x64' ||
      process.env.PROTOC || process.env.CIRNET_PROTOC_SHA256) {
    throw new Error('Select the x64 MSVC developer PowerShell and the default pinned protoc for candidate reuse')
  }
  const read = (program, args) => execFileSync(program, args, {
    cwd: roots.contracts, encoding: 'utf8', windowsHide: true,
  }).trim()
  const current = {
    // The Contracts assembly receipt records rustc -vV, including its host and commit.
    rust: read('rustc.exe', ['-vV']),
    cargo: read('cargo.exe', ['--version']),
    cmake: read('cmake.exe', ['--version']).split(/\r?\n/, 1)[0],
    msvc: /([\d.]+)[\\/]?$/.exec(process.env.VCToolsInstallDir ?? '')?.[1],
    windowsSdk: /^([\d.]+)[\\/]?$/.exec(process.env.WindowsSDKVersion ?? '')?.[1],
    crt: 'static',
    node: process.version,
    npm: read('cmd.exe', ['/d', '/c', 'npm.cmd --version']),
  }
  const contractsReceipt = JSON.parse(readFileSync(join(directory, 'receipts/contracts-native.json'), 'utf8'))
  if (contractsReceipt.protoc?.provider === 'explicit' ||
      Object.entries(current).some(([key, value]) => !value || manifest.toolchain?.[key] !== value)) {
    throw new Error('Candidate build toolchain differs from the current pinned toolchain')
  }
  console.log(JSON.stringify({ result: 'PASS', directory, manifestSha256: expectedManifestSha256 }))
}

const [action, selection, output, evidenceSha256, manifestSha256, ...extra] = process.argv.slice(2)
if (extra.length || (action !== 'reuse-check' && evidenceSha256 !== undefined)) throw new Error('Unexpected argument')
if (action === 'lock' && selection && isAbsolute(selection) && !output) {
  validateOutput(selection)
  writeFileSync(selection, JSON.stringify(collectSelection(), null, 2) + '\n', { flag: 'wx' })
} else if (action === 'stage' && selection && output) {
  stage(selection, output)
} else if (action === 'check' && selection && !output) {
  checkedSelection(selection)
} else if (action === 'reuse-check' && selection && output) {
  checkReuse(selection, output, evidenceSha256, manifestSha256)
} else {
  throw new Error('Usage: native-source-selection.mjs lock SELECTION | check SELECTION | stage SELECTION DESTINATION | reuse-check RECEIPT EVIDENCE EVIDENCE_SHA256 MANIFEST_SHA256')
}

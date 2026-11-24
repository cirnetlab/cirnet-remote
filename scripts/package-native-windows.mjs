import { execFileSync } from 'node:child_process'
import { constants, copyFileSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { basename, dirname, isAbsolute, join } from 'node:path'
import {
  artifactInventory, ordinaryDirectory, repositories, sha256, target, verifyInventory, windowsSegments,
} from './native-candidate.mjs'

const [session, extra] = process.argv.slice(2)
if (process.platform !== 'win32' || process.arch !== 'x64' || !isAbsolute(session ?? '') || extra) {
  throw new Error('Usage on Windows x64: node scripts/package-native-windows.mjs ABSOLUTE_BUILD_SESSION')
}
const { getArtifactDirectory } = await import(process.env.CIRNET_ARTIFACT_PATHS_MODULE)
if (getArtifactDirectory() !== ordinaryDirectory(session)) throw new Error('Expected the owned build session')

const readJson = path => JSON.parse(readFileSync(path, 'utf8'))
const selectionPath = join(session, 'selection.json')
const selection = readJson(selectionPath)
const sources = join(session, 'src')
const cargoPath = name => join(session, 'target', target, 'release', name + '.exe')
const sourcePath = (role, ...parts) => join(sources, repositories[role], ...parts)
const read = (command, args) => execFileSync(command, args, { encoding: 'utf8', windowsHide: true }).trim()
const contractRoot = join(session, 'contracts')
const contractReceipt = join(contractRoot, 'contracts-native-manifest.json')
const contracts = readJson(contractReceipt)
const sdkDir = join(session, 'sdk')
const sdkReceipt = join(sdkDir, 'native-sdk-receipt.json')
const sdk = readJson(sdkReceipt)
const version = readFileSync(sourcePath('remote', 'Cargo.toml'), 'utf8').match(/^version\s*=\s*"([^"]+)"/m)?.[1]
if (!/^\d+\.\d+\.\d+-dev\.\d+$/.test(version ?? '') ||
    contracts.version !== version || sdk.sdk?.version !== version || contracts.target !== target || contracts.crt !== 'static') {
  throw new Error('Expected matching Windows development versions and a static Contracts package')
}

const nativeCrate = join(session, 'target', 'package', `cirnet-contracts-native-${version}.crate`)
const sdkArchive = join(sdkDir, `cirnet-contracts-${version}.tgz`)
const devArchive = join(sdkDir, `cirnet-artifact-paths-${version}.tgz`)
const openapi = join(session, 'remote-openapi.json')
const embeddedArchive = join(session, `cirnet-embedded-hardware-${version}-native-source.tar.gz`)
const web = sourcePath('interface', 'dist')
const webMetadata = readJson(join(web, 'interface-artifact.json'))
const interfaceSource = selection.repositories[repositories.interface].sourceSha256
const openapiSha256 = sha256(openapi)

if (contracts.crate?.sha256 !== sha256(nativeCrate) || sdk.contracts?.crateSha256 !== contracts.crate.sha256 ||
    sdk.contracts?.manifestSha256 !== sha256(contractReceipt) || sdk.remoteOpenapi?.sha256 !== openapiSha256 ||
    sdk.sdk.sha256 !== sha256(sdkArchive) || webMetadata.sourceFingerprint !== interfaceSource ||
    webMetadata.contractsSha256 !== sdk.sdk.sha256 || webMetadata.contractsCrateSha256 !== contracts.crate.sha256 ||
    webMetadata.remoteOpenapiSha256 !== openapiSha256) {
  throw new Error('Contracts, Remote OpenAPI and Interface build inputs must match the generated artifacts')
}
const tar = join(process.env.SystemRoot, 'System32', 'tar.exe')
const embedded = JSON.parse(read(tar, ['-xOf', embeddedArchive, 'fpga-artifact.json']))
const fpgaSchema = contracts.files.find(file => file.path === 'resources/contracts/fpga-protocol/control.schema.json')
const embeddedSource = selection.repositories[repositories.embedded]
if (embedded.name !== repositories.embedded || embedded.version !== version || embedded.physicalAvailable !== false ||
    embedded.source?.sourceSha256 !== embeddedSource.sourceSha256 ||
    embedded.source?.revision !== embeddedSource.baseRevision || embedded.source?.uncommittedMigration !== embeddedSource.dirty ||
    embedded.contracts?.manifestSha256 !== sha256(contractReceipt) || embedded.contracts?.schemaSha256 !== fpgaSchema?.sha256 ||
    !fpgaSchema || sha256(join(contractRoot, ...windowsSegments(fpgaSchema.path))) !== fpgaSchema.sha256) {
  throw new Error('Embedded Hardware must select the candidate Contracts FPGA protocol schema')
}

const executables = {
  'cirnet-contracts': join(contractRoot, 'bin', 'cirnet-contracts.exe'),
  'cirnet-hardware': cargoPath('cirnet-hardware'),
  'cirnet-remote': cargoPath('cirnet-remote'),
  'cirnet-simulator-worker': join(session, 'sim', 'bin', 'cirnet-simulator-worker.exe'),
}
for (const [name, exe] of Object.entries(executables)) {
  if (name !== 'cirnet-contracts' && read(exe, ['--version']) !== `${name} ${version}`) {
    throw new Error(`Expected ${name} ${version}`)
  }
}
if (read(executables['cirnet-simulator-worker'], ['--protocols']).split(/\r?\n/).join(',') !== 'CNP1,CNP2') {
  throw new Error('Selected Simulator worker must declare CNP1 and CNP2')
}

const inboxDlls = new Set([
  'advapi32.dll', 'api-ms-win-core-synch-l1-2-0.dll', 'bcrypt.dll', 'bcryptprimitives.dll',
  'combase.dll', 'kernel32.dll', 'ntdll.dll', 'shell32.dll', 'ws2_32.dll',
])
const systemDlls = Object.fromEntries(Object.entries(executables).map(([name, exe]) => {
  const listing = read('dumpbin.exe', ['/headers', '/dependents', exe])
  if (!/^\s*8664 machine \(x64\)/m.test(listing)) throw new Error(`Expected x64 executable: ${name}`)
  const dlls = [...new Set([...listing.matchAll(/^\s+([\w.-]+\.dll)\s*$/gim)]
    .map(match => match[1].toLowerCase()))].sort()
  if (!dlls.length || dlls.some(dll => !inboxDlls.has(dll))) {
    throw new Error(`Undeclared Windows dependency in ${name}: ${dlls.join(', ')}`)
  }
  return [name, dlls]
}))

const output = join(session, `cirnet-native-windows-x64-${version}-candidate`)
mkdirSync(output)
function copy(source, relative) {
  if (!lstatSync(source).isFile()) throw new Error(`Expected an ordinary artifact: ${source}`)
  const dest = join(output, ...windowsSegments(relative))
  mkdirSync(dirname(dest), { recursive: true })
  copyFileSync(source, dest, constants.COPYFILE_EXCL)
}
function copyTree(source, prefix) {
  ordinaryDirectory(source)
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const path = join(source, entry.name)
    const relative = `${prefix}/${entry.name}`
    if (entry.isDirectory()) copyTree(path, relative)
    else copy(path, relative)
  }
}
for (const file of contracts.files) {
  const source = join(contractRoot, ...windowsSegments(file.path))
  if (lstatSync(source).size !== file.size || sha256(source) !== file.sha256) {
    throw new Error(`Modified Contracts package file: ${file.path}`)
  }
  copy(source, file.path === 'LICENSE' ? 'licenses/contracts.txt' : file.path)
}
for (const role of ['remote', 'hardware', 'simulator', 'interface', 'embedded']) {
  copy(sourcePath(role, 'LICENSE'), `licenses/${role}.txt`)
}
for (const [name, exe] of Object.entries(executables)) {
  if (name !== 'cirnet-contracts') copy(exe, `bin/${name}.exe`)
}
copyTree(web, 'web')
copy(sourcePath('remote', 'deployment', 'windows-native', 'cirnet-native.ps1'), 'cirnet-native.ps1')
copy(contractReceipt, 'receipts/contracts-native.json')
copy(sdkReceipt, 'receipts/contracts-sdk.json')
copy(selectionPath, 'receipts/source-selection.json')
copy(openapi, 'receipts/remote-openapi.json')
copy(nativeCrate, 'extras/contracts-source.crate')
copy(sdkArchive, `extras/${basename(sdkArchive)}`)
copy(devArchive, `extras/${basename(devArchive)}`)
copy(embeddedArchive, `extras/${basename(embeddedArchive)}`)

const msvc = /([\d.]+)[\\/]?$/.exec(process.env.VCToolsInstallDir ?? '')?.[1]
const windowsSdk = /^([\d.]+)[\\/]?$/.exec(process.env.WindowsSDKVersion ?? '')?.[1]
if (!msvc || !windowsSdk) throw new Error('Use the MSVC developer environment and Windows SDK')
const manifest = {
  schemaVersion: 1,
  product: 'cirnet-native-candidate',
  version,
  target,
  status: 'development-candidate',
  repositories: Object.fromEntries(Object.entries(selection.repositories)
    .map(([name, { baseRevision, dirty, sourceSha256 }]) => [name, { baseRevision, dirty, sourceSha256 }])),
  toolchain: {
    rust: contracts.rustc ?? read('rustc.exe', ['--version']),
    cargo: read('cargo.exe', ['--version']),
    cmake: read('cmake.exe', ['--version']).split(/\r?\n/, 1)[0],
    msvc, windowsSdk, crt: 'static', node: process.version, npm: process.env.CIRNET_CANDIDATE_NPM,
  },
  systemDlls,
  files: artifactInventory(output),
}
const manifestPath = join(output, 'native-manifest.json')
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' })
verifyInventory(output, manifest.files)
const bundle = output + '.tar.gz'
execFileSync(tar, ['-czf', bundle, '-C', output, '.'], { windowsHide: true })
const result = { directory: output, manifestSha256: sha256(manifestPath), bundle, bundleSha256: sha256(bundle) }
writeFileSync(join(session, 'assembly-result.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' })
console.log(JSON.stringify(result))

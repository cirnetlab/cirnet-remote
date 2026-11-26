import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { createWriteStream, lstatSync, mkdtempSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { repositories, sha256 } from './native-candidate.mjs'

const [bundle, hash, browserCache, extra] = process.argv.slice(2)
if (!bundle || !isAbsolute(bundle) || !/^[a-f0-9]{64}$/.test(hash) ||
    (browserCache !== undefined && !isAbsolute(browserCache)) || extra) {
  throw new Error('Usage: node scripts/test-native-windows.mjs ABSOLUTE_BUNDLE MANIFEST_SHA256 [ABSOLUTE_CHROMIUM_CACHE]')
}
const build = dirname(bundle)
const ownership = JSON.parse(readFileSync(join(build, '.cirnet-artifact-session.json'), 'utf8'))
const contractsSource = join(build, 'src', repositories.contracts)
const allocator = join(contractsSource, 'tools/artifact-paths/cirnet_artifact_paths/artifact-paths.mjs')
// A reviewed receipt explicitly selects its existing integration session.
process.env.CIRNET_ARTIFACTS_CONTEXT = process.env.NETCIRCUIT_ARTIFACTS_CONTEXT = JSON.stringify(ownership.context)
process.env.CIRNET_ARTIFACTS_SESSION = process.env.NETCIRCUIT_ARTIFACTS_SESSION = build
process.env.CIRNET_ARTIFACTS_DIR = process.env.NETCIRCUIT_ARTIFACTS_DIR = dirname(build)
const { getArtifactDirectory } = await import(pathToFileURL(allocator).href)
const browserRoot = browserCache ? join(build, 'src', repositories.interface) : undefined
const manifestPath = join(bundle, 'native-manifest.json')
const launcherPath = join(bundle, 'cirnet-native.ps1')
for (const path of [manifestPath, launcherPath]) assert(lstatSync(path).isFile(), `Expected ordinary file: ${path}`)
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const manifestBytes = readFileSync(manifestPath)
assert.equal(digest(manifestBytes), hash, 'Reviewed manifest digest differs')
const manifest = JSON.parse(manifestBytes)
const launcherRecords = manifest.files.filter(file => file.path === 'cirnet-native.ps1')
assert.equal(launcherRecords.length, 1, 'Manifest must identify one launcher')
const launcherBytes = readFileSync(launcherPath)
assert.equal(launcherBytes.length, launcherRecords[0].size, 'Launcher length differs')
assert.equal(digest(launcherBytes), launcherRecords[0].sha256, 'Launcher digest differs')
const session = mkdtempSync(join(getArtifactDirectory('native-smoke'), 'smoke-'))
const install = join(session, 'installed')
const data = join(session, 'data')
const backup = join(session, 'backup')
const restored = join(session, 'restored')
const shell = join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
const origin = 'http://127.0.0.1:14173'
const hardwarePort = '15151'
const hardwareTarget = '127.0.0.1:' + hardwarePort
const devPort = '15173'
const devOrigin = 'http://127.0.0.1:' + devPort
const password = randomBytes(24).toString('base64url')
const results = []
const http = []
const processSnapshots = []
const savedGraph = {
  schema_version: '1.0', circuit_id: 'packaged-native-save',
  modules: [{ id: 'S', type: 'DIGITAL_SWITCH', properties: { state: true } }, { id: 'L', type: 'LED' }],
  connections: [{ source: 'S.OUT', destination: 'L.IN' }],
  metadata: { name: 'Packaged native save', smoke_extension: { retain: [true, 7] } },
}
const childEnv = {
  ...Object.fromEntries(Object.entries(process.env)
    .filter(([name]) => !['path', 'psmodulepath'].includes(name.toLowerCase()))),
  Path: join(process.env.SystemRoot, 'System32'),
  PSModulePath: join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'Modules'),
}

function browserVirtualRun() {
  const web = JSON.parse(readFileSync(join(install, 'web/interface-artifact.json')))
  assert.equal(web.name, repositories.interface)
  assert.equal(web.kind, 'static')
  assert.equal(web.sourceFingerprint, manifest.repositories[repositories.interface].sourceSha256)
  const selection = JSON.parse(readFileSync(join(browserRoot, '.artifacts/selection.json')))
  for (const [role, expected] of [
    ['npm', web.contractsSha256],
    ['dev_npm', manifest.files.find(file => file.path === `extras/cirnet-artifact-paths-${manifest.version}.tgz`)?.sha256],
    ['native_crate', web.contractsCrateSha256], ['remote_openapi', web.remoteOpenapiSha256],
  ]) {
    assert.match(expected ?? '', /^[a-f0-9]{64}$/)
    assert.equal(selection[role].sha256, expected)
    assert.equal(sha256(selection[role].path), expected)
  }
  const result = spawnSync(process.execPath, [join(browserRoot, 'scripts/e2e.mjs'),
    'test-packaged', '--forbid-only', '--grep',
    'real virtual AND circuit|Stop during a real committed Create|hard reload after a committed Create|Component groups, search, real drag placement'], {
    cwd: browserRoot, encoding: 'utf8', windowsHide: true, timeout: 360000,
    env: { ...process.env, CIRNET_E2E_API_TARGET: origin, CIRNET_E2E_ADMIN_PASSWORD: password,
      CIRNET_E2E_STATIC_FINGERPRINT: web.sourceFingerprint, CIRNET_E2E_BROWSER_CACHE: browserCache },
  })
  assert.ifError(result.error)
  const output = (result.stdout + result.stderr).replaceAll(password, '[test credential]')
  writeFileSync(join(session, 'browser-virtual-run.log'), output)
  assert.equal(result.status, 0, output)
  results.push({ action: 'BrowserVirtualRun', exit: result.status })
  const records = output.split(/\r?\n/).filter(line => line.startsWith('{"experimentId":'))
  assert.equal(records.length, 1, 'Expected one browser virtual-capture receipt')
  assert.match(output, /^\s*4 passed\b/m, 'Expected all four installed browser cases to execute')
  const { experimentId, captureId, captureSha256, sampleCount, samples, reconnected, replayedCreate, replayedRun } = JSON.parse(records[0])
  assert.match(experimentId, /^[0-9a-f]{32}$/)
  assert.match(captureId, /^[0-9a-f]{32}$/)
  assert.match(captureSha256, /^[0-9a-f]{64}$/)
  assert.equal(samples.length, sampleCount)
  assert.equal(reconnected, true)
  assert.equal(replayedCreate, 0)
  assert.equal(replayedRun, 0)
  return { experimentId, captureId, captureSha256, sampleCount, samples, reconnected, replayedCreate, replayedRun }
}

function observeProcesses(supervisor, requireWorker) {
  const query = String.raw`
    $parent = [int]$env:CIRNET_SMOKE_PARENT
    $direct = @(Get-CimInstance Win32_Process -Filter "ParentProcessId = $parent" -Property Name,ProcessId,ParentProcessId,ExecutablePath)
    $second = @(foreach($entry in $direct) {
      Get-CimInstance Win32_Process -Filter "ParentProcessId = $($entry.ProcessId)" -Property Name,ProcessId,ParentProcessId,ExecutablePath
    })
    ConvertTo-Json -Compress -InputObject @(@($direct + $second) | Select-Object Name,ProcessId,ParentProcessId,ExecutablePath)
  `
  const result = spawnSync(shell, ['-NoProfile', '-NonInteractive', '-Command', query], {
    env: {...childEnv, CIRNET_SMOKE_PARENT: String(supervisor)}, encoding: 'utf8', timeout: 15000, windowsHide: true,
  })
  assert.ifError(result.error)
  assert.equal(result.status, 0, result.stderr)
  const rows = JSON.parse(result.stdout)
  const programs = ['cirnet-remote.exe', 'cirnet-hardware.exe', 'cirnet-simulator-worker.exe']
  const consoleHost = join(process.env.SystemRoot, 'System32', 'conhost.exe').toLowerCase()
  const ancillary = rows.filter(row => !programs.includes(row.Name))
  for (const row of ancillary) {
    assert.equal(row.ExecutablePath?.toLowerCase(), consoleHost, `Unexpected supervisor descendant: ${row.Name}`)
  }
  for (const name of programs.slice(0, requireWorker ? 3 : 2)) {
    assert(rows.some(row => row.Name === name), `Expected running ${name}`)
  }
  const hardware = rows.find(row => row.Name === programs[1])
  const processes = rows.filter(row => programs.includes(row.Name)).map(row => {
    const expected = manifest.files.find(file => file.path === `bin/${row.Name}`)
    const path = join(install, 'bin', row.Name)
    assert.equal(row.ExecutablePath.toLowerCase(), path.toLowerCase())
    const sha256 = digest(readFileSync(path))
    assert.equal(sha256, expected.sha256)
    assert.equal(row.ParentProcessId, row.Name === programs[2] ? hardware.ProcessId : supervisor)
    return {pid:row.ProcessId, parent:row.ParentProcessId, executable:row.Name, sha256}
  })
  processSnapshots.push({utc: new Date().toISOString(), supervisor, processes,
    consoleHosts: ancillary.map(row => ({pid:row.ProcessId, parent:row.ParentProcessId, executable:row.Name}))})
}

function command(root, action, state, extra = []) {
  return [
    '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', join(root, 'cirnet-native.ps1'), '-Action', action, '-DataDirectory', state,
    '-Port', '14173', '-HardwarePort', hardwarePort, ...extra,
  ]
}

function run(root, action, state, extra = [], env = {}, expected = 0) {
  const output = spawnSync(shell, command(root, action, state, extra), {
    encoding: 'utf8', env: { ...childEnv, ...env }, timeout: 135000, windowsHide: true,
  })
  assert.ifError(output.error)
  writeFileSync(join(session, `${results.length}-${action}.log`), output.stdout + output.stderr)
  if (expected === 0) assert.equal(output.status, 0, `${action}: ${output.stdout}\n${output.stderr}`)
  else assert.notEqual(output.status, 0, `${action} should fail closed`)
  if (expected instanceof RegExp) assert.match(output.stdout + output.stderr, expected)
  results.push({ action, exit: output.status })
  return output.stdout
}

async function request(path, status, options = {}) {
  const response = await fetch(origin + path, { ...options, signal: AbortSignal.timeout(8000) })
  http.push({utc: new Date().toISOString(), method: options.method ?? 'GET', path, status: response.status,
    requestId: response.headers.get('x-request-id')})
  if (response.status !== status) {
    assert.equal(response.status, status, `${options.method ?? 'GET'} ${path}: ${await response.text()}`)
  }
  return response
}

async function ready(process, isReady) {
  for (let i = 0; i < 120; i++) {
    if (process.exitCode !== null) throw new Error('Native supervisor exited before readiness')
    try {
      if (isReady() && (await fetch(origin + '/api/health', { signal: AbortSignal.timeout(500) })).ok) return
    } catch {
      // Startup has not opened the application socket yet.
    }
    await delay(250)
  }
  throw new Error('Native supervisor readiness timeout')
}

async function withInstance(state, callback, extra = []) {
  const log = createWriteStream(join(session, `supervisor-${results.length}.log`))
  const child = spawn(shell, command(install, 'Start', state, extra), {
    env: childEnv, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  })
  const ended = new Promise((resolve, reject) => {
    child.on('error', reject)
    child.on('exit', resolve)
  })
  child.stdout.pipe(log, { end: false })
  child.stderr.pipe(log, { end: false })
  let output = ''
  child.stdout.on('data', chunk => { output += chunk.toString() })
  try {
    await ready(child, () => output.includes(`CIRNET_NATIVE_READY=${origin}`))
    await callback(child.pid)
  } finally {
    if (child.exitCode === null) {
      run(install, 'Stop', state)
    }
    const exit = await ended
    log.end()
    assert.equal(exit, 0, 'Supervisor did not confirm clean shutdown')
    const snapshot = processSnapshots.find(entry => entry.supervisor === child.pid)
    if (snapshot) {
      for (const { pid, executable } of snapshot.processes) {
        assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' }, `${executable} is still running after Stop`)
      }
      snapshot.exitedAfterStop = true
    }
  }
}

function credential(response, payload) {
  const cookies = response.headers.getSetCookie()
  assert(cookies.some(value => value.startsWith('cirnet_session=') && /HttpOnly/i.test(value)))
  assert(!cookies.some(value => value.startsWith('netcircuit_session=')))
  assert.equal(typeof payload.csrf_token, 'string')
  return { Cookie: cookies.map(value => value.split(';')[0]).join('; '),
    Origin: origin, 'X-CIRNET-CSRF': payload.csrf_token, 'Content-Type': 'application/json' }
}

async function login() {
  const guest = await request('/api/auth/session', 200)
  const response = await request('/api/auth/login', 200, {
    method: 'POST', headers: credential(guest, await guest.json()),
    body: JSON.stringify({ username: 'e2e_admin', password }),
  })
  const session = await response.json()
  assert.equal(session.principal.role, 'ADMIN')
  return credential(response, session)
}

run(bundle, 'Install', data, ['-InstallDirectory', install, '-ManifestSha256', '0'.repeat(64)], {}, 1)
run(bundle, 'Install', data, ['-InstallDirectory', install, '-ManifestSha256', hash])
const worker = join(install, 'bin/cirnet-simulator-worker.exe')
const parkedWorker = join(session, 'reviewed-worker.exe')
const workerRejection = /Missing or modified artifact: bin\/cirnet-simulator-worker\.exe/
renameSync(worker, parkedWorker)
try {
  run(install, 'Doctor', data, [], {}, workerRejection)
  const changed = readFileSync(parkedWorker)
  changed[changed.length - 1] ^= 1
  writeFileSync(worker, changed, {flag:'wx'})
  run(install, 'Doctor', data, [], {}, workerRejection)
} finally {
  renameSync(parkedWorker, worker)
}
const rpcSchema = manifest.files.find(record => record.path.startsWith('resources/contracts/') && record.path.endsWith('.proto'))
assert(rpcSchema, 'Missing the canonical RPC schema from the installed inventory')
const schemaPath = join(install, rpcSchema.path)
const schemaBytes = readFileSync(schemaPath)
const changedSchema = Buffer.from(schemaBytes)
changedSchema[0] ^= 1
try {
  writeFileSync(schemaPath, changedSchema)
  run(install, 'Doctor', data, [], {}, /Missing or modified artifact: .*\.proto/)
} finally {
  writeFileSync(schemaPath, schemaBytes)
}
run(install, 'Doctor', data)
run(install, 'Migrate', data)
assert.match(run(install, 'Migrate', data), /"applied":0/)
run(install, 'BootstrapAdmin', data, ['-Username', 'e2e_admin'], { CIRNET_BOOTSTRAP_PASSWORD: password })
run(install, 'Doctor', data)
let project, document, capture
await withInstance(data, async supervisor => {
  const hardware = spawnSync(join(install, 'bin/cirnet-remote.exe'), ['--check-hardware'], {
    encoding: 'utf8', windowsHide: true, timeout: 8000,
    env: { ...childEnv, CIRNET_HARDWARE_GRPC_TARGET: hardwareTarget },
  })
  assert.ifError(hardware.error)
  assert.equal(hardware.status, 0, hardware.stderr)
  assert.deepEqual(JSON.parse(hardware.stdout), { status: 'ok', station_id: 'virtual-station-01' })
  results.push({ action: 'HardwareRpc', exit: hardware.status })
  run(install, 'Maintenance', data, ['-DryRun'], {}, 1)
  const home = await request('/', 200)
  assert.match(home.headers.get('content-type'), /text\/html/)
  const html = await home.text()
  const module = /src="(\/assets\/[^"]+\.js)"/.exec(html)?.[1]
  assert(module, 'Packaged index has no JavaScript entrypoint')
  assert.match((await request(module, 200)).headers.get('content-type'), /text\/javascript/)
  await request('/assets/not-a-real-file.js', 404)
  const openapi = await (await request('/openapi.json', 200)).json()
  assert.equal(openapi.info.version, manifest.version)
  assert(!Object.hasOwn(openapi.paths, '/api/assignments'))
  assert(openapi.paths['/api/v2/assignments'].get)
  await request('/api/projects', 401)
  const headers = await login()
  await request('/api/v2/circuits/validate', 422, {method: 'POST', headers, body: '{"schema_version":"1.0"}'})
  const deniedDev = await request('/api/v2/circuits/validate', 403, {
    method: 'POST', headers: { ...headers, Origin: devOrigin }, body: '{"schema_version":"1.0"}',
  })
  assert.equal((await deniedDev.json()).code, 'ORIGIN_REJECTED')
  await request('/api/assignments', 404, { headers })
  await request('/api/v2/assignments', 200, { headers })
  await request('/api/projects', 401, { headers: { Cookie: headers.Cookie.replace('cirnet_session=', 'netcircuit_session=') } })
  const { 'X-CIRNET-CSRF': csrf, ...withoutCsrf } = headers
  await request('/api/projects', 403, {
    method: 'POST', headers: { ...withoutCsrf, 'X-CSRF-Token': csrf }, body: '{"name":"Rejected"}',
  })
  await request('/api/projects', 403, {
    method: 'POST', headers: { ...headers, Origin: 'http://127.0.0.1:1' }, body: '{"name":"Rejected"}',
  })
  project = await (await request('/api/projects', 201, {
    method: 'POST', headers, body: '{"name":"Packaged native smoke"}',
  })).json()
  assert.equal(project.name, 'Packaged native smoke')
  assert.match(await (await request(`/projects/${project.project_id}`, 200)).text(), /<script/)
  document = await (await request(`/api/v2/projects/${project.project_id}/circuits`, 201, {
    method: 'POST', headers, body: JSON.stringify({ name: savedGraph.metadata.name, graph: savedGraph }),
  })).json()
  assert.equal(document.revision, 1)
  assert.deepEqual(document.graph, savedGraph)
  assert.deepEqual(await (await request(`/api/v2/circuits/${document.document_id}`, 200, { headers })).json(), document)
  const documentRoute = `/projects/${project.project_id}/circuits/${document.document_id}`
  assert.match(await (await request(documentRoute, 200)).text(), /<script/)
  const stations = await (await request('/api/stations', 200, { headers })).json()
  assert(JSON.stringify(stations).includes('virtual'))
  if (browserRoot) capture = browserVirtualRun()
  observeProcesses(supervisor, Boolean(browserRoot))
})
assert.match(run(install, 'Maintenance', data, ['-DryRun']), /"dry_run":true/)
run(install, 'Maintenance', data)
run(install, 'Backup', data, ['-Snapshot', backup])
run(install, 'Restore', restored, ['-Snapshot', backup])
if (capture) {
  const name = `${capture.captureId}.ncap`
  const bytes = readFileSync(join(data, 'captures', name))
  assert(bytes.length > 0)
  assert.equal(digest(bytes), capture.captureSha256, 'Stored NCAP differs from the browser payload')
  for (const root of [backup, restored]) assert.deepEqual(readFileSync(join(root, 'captures', name)), bytes)
  Object.assign(capture, { size: bytes.length, sha256: digest(bytes), backupAndRestoreMatch: true })
}
await withInstance(restored, async supervisor => {
  const headers = await login()
  await request('/api/v2/circuits/validate', 422, {
    method: 'POST', headers: { ...headers, Origin: devOrigin }, body: '{"schema_version":"1.0"}',
  })
  const persisted = await (await request(`/api/projects/${project.project_id}`, 200, { headers })).json()
  assert.equal(persisted.name, project.name)
  assert.deepEqual(await (await request(`/api/v2/circuits/${document.document_id}`, 200, { headers })).json(), document)
  observeProcesses(supervisor, false)
}, ['-DevPort', devPort])
writeFileSync(join(session, 'result.json'), JSON.stringify({
  scope: 'Windows development host', browserVerified: Boolean(browserRoot), manifestSha256: hash, results, processSnapshots, http,
  savedDocument: { projectId: project.project_id, documentId: document.document_id,
    revision: document.revision, graph: document.graph, restored: true },
  capture,
}, null, 2))
console.log(JSON.stringify({ result: 'PASS', evidence: session }))

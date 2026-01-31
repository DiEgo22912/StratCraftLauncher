#!/usr/bin/env node
// Run assembled Forge client for testing (offline username)
// Usage: node run-client-test.js <versionId> <username> [serverAddress]

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const crypto = require('crypto');

function offlineUuid(username) {
    const base = `OfflinePlayer:${username}`;
    const hash = crypto.createHash('md5').update(base, 'utf8').digest();
    hash[6] = (hash[6] & 0x0f) | 0x30;
    hash[8] = (hash[8] & 0x3f) | 0x80;
    const hex = hash.toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function isWindows() {
    return process.platform === 'win32';
}

function ruleMatchesOS(rule) {
    if (!rule?.os?.name) return true;
    return rule.os.name === (isWindows() ? 'windows' : process.platform);
}

function isAllowedByRules(rules) {
    if (!Array.isArray(rules) || rules.length === 0) return true;
    let allowed = false;
    let matched = false;
    for (const rule of rules) {
        if (!ruleMatchesOS(rule)) continue;
        matched = true;
        if (rule.action === 'allow') allowed = true;
        if (rule.action === 'disallow') allowed = false;
    }
    return matched ? allowed : false;
}

function flattenArgs(items) {
    const out = [];
    if (!Array.isArray(items)) return out;
    for (const item of items) {
        if (typeof item === 'string') {
            out.push(item);
            continue;
        }
        if (item?.rules && !isAllowedByRules(item.rules)) continue;
        if (Array.isArray(item?.values)) out.push(...item.values);
        else if (Array.isArray(item?.value)) out.push(...item.value);
        else if (typeof item?.value === 'string') out.push(item.value);
    }
    return out;
}

function substituteArgs(args, vars) {
    return args
        .map((arg) => {
            let replaced = arg;
            for (const [key, value] of Object.entries(vars)) {
                replaced = replaced.replaceAll(`\${${key}}`, String(value));
            }
            return replaced;
        })
        .filter((arg) => !/\$\{[^}]+\}/.test(arg));
}

// Java detection helpers: synchronous for simple CLI flow
const { spawnSync } = require('child_process');
function getJavaMajorVersion(javaExe) {
    try {
        const sp = spawnSync(javaExe, ['-version'], { encoding: 'utf8' });
        const out = (sp.stderr || '') + (sp.stdout || '');
        const m = out.match(/version "(\d+)(?:\.(\d+))?/);
        if (!m) return null;
        return parseInt(m[1], 10);
    } catch (e) {
        return null;
    }
}

function probeCandidates() {
    const tried = new Set();
    const candidates = [];
    if (process.env.JAVA_HOME) {
        candidates.push(path.join(process.env.JAVA_HOME, 'bin', isWindows() ? 'javaw.exe' : 'java'));
        candidates.push(path.join(process.env.JAVA_HOME, 'bin', isWindows() ? 'java.exe' : 'java'));
    }
    // PATH names
    candidates.push(isWindows() ? 'javaw' : 'java');
    candidates.push('java');
    // common Windows install locations
    if (isWindows()) {
        const roots = ['C:\\Program Files\\Eclipse Adoptium', 'C:\\Program Files\\AdoptOpenJDK', 'C:\\Program Files\\Amazon Corretto', 'C:\\Program Files\\Zulu', 'C:\\Program Files\\Java'];
        for (const r of roots) {
            try {
                if (!fs.existsSync(r)) continue;
                for (const name of fs.readdirSync(r)) {
                    const p = path.join(r, name, 'bin', 'javaw.exe');
                    candidates.push(p);
                }
            } catch (e) { }
        }
    }

    for (const c of candidates) {
        if (!c || tried.has(c)) continue;
        tried.add(c);
    }
    return Array.from(tried);
}

function findSuitableJavaSync() {
    const candidates = probeCandidates();
    let best = null;
    for (const c of candidates) {
        let exe = c;
        // if just 'java' or 'javaw' rely on PATH
        if (exe === 'java' || exe === 'javaw') exe = exe; // leave as-is
        else if (!fs.existsSync(exe)) continue;
        const v = getJavaMajorVersion(exe);
        if (!v) continue;
        // prefer exact 17, otherwise pick highest < 21
        if (v === 17) return exe;
        if (v >= 17 && v < 21) {
            if (!best) best = exe;
            else {
                const bestV = getJavaMajorVersion(best);
                if (v > bestV) best = exe;
            }
        }
    }
    return best;
}

function buildClasspath(version, versionJarPath, mcDir) {
    const libs = version?.libraries || [];
    const classpath = [];
    const missing = [];
    const libBase = path.join(mcDir, 'libraries');
    for (const lib of libs) {
        if (lib?.rules && !isAllowedByRules(lib.rules)) continue;
        const relPath = lib?.downloads?.artifact?.path || lib?.artifact?.path;
        if (!relPath) continue;
        const usesPrefix = relPath.startsWith('libraries/') || relPath.startsWith('libraries\\');
        const fullPath = usesPrefix ? path.join(mcDir, relPath) : path.join(libBase, relPath);
        if (fs.existsSync(fullPath)) classpath.push(fullPath);
        else missing.push(relPath);
    }
    if (versionJarPath && fs.existsSync(versionJarPath)) classpath.push(versionJarPath);
    return { classpath, missing };
}

async function main() {
    const versionId = process.argv[2] || 'forge-1.20.1-47.4.16';
    const username = process.argv[3] || 'test';
    const serverAddress = process.argv[4] || '';
    const base = path.join(__dirname, 'client-files', versionId);
    if (!fs.existsSync(base)) {
        console.error('Assembled client not found:', base);
        process.exit(1);
    }
    const versionJsonPath = path.join(base, 'versions', versionId, `${versionId}.json`);
    const versionJarPath = path.join(base, 'versions', versionId, `${versionId}.jar`);
    if (!fs.existsSync(versionJsonPath) || !fs.existsSync(versionJarPath)) {
        console.error('Version files missing in assembled client');
        process.exit(1);
    }
    const version = JSON.parse(fs.readFileSync(versionJsonPath, 'utf8'));
    const { classpath, missing } = buildClasspath(version, versionJarPath, base);
    if (missing.length > 0) {
        console.warn('Missing libraries (some platform natives may be skipped):', missing.slice(0, 10));
    }

    const instanceDir = path.join(__dirname, 'instances', versionId);
    if (!fs.existsSync(instanceDir)) fs.mkdirSync(instanceDir, { recursive: true });

    const vars = {
        auth_player_name: username,
        version_name: version.id || versionId,
        game_directory: instanceDir,
        assets_root: path.join(base, 'assets'),
        assets_index_name: version.assets || version.assetIndex?.id || 'legacy',
        auth_uuid: offlineUuid(username),
        auth_access_token: '0',
        clientid: '0',
        auth_xuid: '0',
        user_type: 'mojang',
        version_type: version.type || 'release',
        natives_directory: path.join(instanceDir, 'natives'),
        classpath: classpath.join(isWindows() ? ';' : ':'),
        classpath_separator: isWindows() ? ';' : ':',
        library_directory: path.join(base, 'libraries')
    };

    function sanitizeArgs(arr) {
        const out = [];
        for (let i = 0; i < (arr || []).length; i++) {
            // if -cp / -classpath / -p is present but next arg is missing or still contains an unsubstituted ${...}, skip both
            if ((arr[i] === '-cp' || arr[i] === '-classpath' || arr[i] === '-p')) {
                const next = arr[i + 1];
                if (!next || next.trim() === '' || /\$\{[^}]+\}/.test(next)) { i++; continue; }
            }
            out.push(arr[i]);
        }
        return out;
    }

    let jvmArgs = sanitizeArgs(substituteArgs(flattenArgs(version?.arguments?.jvm), vars));
    const gameArgs = substituteArgs(flattenArgs(version?.arguments?.game), vars);
    if (serverAddress) gameArgs.push('--quickPlayMultiplayer', serverAddress);

    // sanitize game args: remove flags that require a value when value is missing
    const flagsWithRequiredValue = new Set(['--width', '--height', '--assetIndex', '--assetsDir', '--gameDir', '--username', '--version', '--uuid', '--accessToken', '--clientId', '--xuid', '--userType', '--versionType', '--launchTarget', '--fml.forgeVersion', '--fml.mcVersion', '--fml.forgeGroup', '--fml.mcpVersion', '--quickPlayPath', '--quickPlaySingleplayer', '--quickPlayMultiplayer', '--quickPlayRealms']);
    function sanitizeGameArgs(arr) {
        const out = [];
        const booleanFlagsToRemove = new Set(['--demo']);
        for (let i = 0; i < (arr || []).length; i++) {
            const a = arr[i];
            // drop boolean flags that cause demo/other unwanted modes
            if (booleanFlagsToRemove.has(a)) {
                console.log('Removed boolean game flag:', a);
                continue;
            }
            if (flagsWithRequiredValue.has(a)) {
                const nxt = arr[i + 1];
                if (!nxt || nxt.startsWith('--')) { i++; continue; }
                out.push(a);
                out.push(nxt);
                i++;
                continue;
            }
            out.push(a);
        }
        return out;
    }
    const sanitizedGameArgs = sanitizeGameArgs(gameArgs);
    console.log('jvmArgs (raw):', jvmArgs.join(' '));
    console.log('gameArgs (sanitized):', sanitizedGameArgs.join(' '));
    if (isWindows()) {
        const macOnly = ['-XstartOnFirstThread'];
        const removed = [];
        jvmArgs = jvmArgs.filter(a => { if (macOnly.includes(a)) { removed.push(a); return false; } return true; });
        if (removed.length) console.log('Removed mac-only jvm args on Windows:', removed);
    }

    // support optional override: --java <javaHomeOrExe>
    const extra = process.argv.slice(4);
    let javaOverride = null;
    for (let i = 0; i < extra.length; i++) {
        if (extra[i] === '--java' && extra[i + 1]) {
            javaOverride = extra[i + 1];
            i++;
        }
    }

    // automatic selection: prefer an installed Java 17; fall back to JAVA_HOME or PATH
    let javaCmd = null;
    if (javaOverride) {
        javaOverride = javaOverride.replace(/^\s*"+|"+\s*$/g, '').trim();
        if (path.basename(javaOverride).toLowerCase().startsWith('java')) javaCmd = javaOverride;
        else javaCmd = path.join(javaOverride, 'bin', isWindows() ? 'javaw.exe' : 'java');
        if (!fs.existsSync(javaCmd)) {
            console.error('Specified java not found:', javaCmd);
            process.exit(2);
        }
        console.log('Using java from override:', javaCmd);
    } else {
        const found = findSuitableJavaSync();
        if (found) {
            javaCmd = found;
            console.log('Auto-selected Java:', javaCmd, 'version', getJavaMajorVersion(javaCmd));
        } else if (process.env.JAVA_HOME) {
            javaCmd = path.join(process.env.JAVA_HOME, 'bin', isWindows() ? 'javaw.exe' : 'java');
            console.warn('No Java17 found automatically; falling back to JAVA_HOME:', javaCmd);
        } else {
            javaCmd = isWindows() ? 'javaw' : 'java';
            console.warn('No Java17 found. Using system java (may be incompatible):', javaCmd, '\nRecommend installing Java 17 or setting JAVA_HOME.');
        }
    }

    const args = [
        `-Xms2G`,
        `-Xmx6G`,
        ...jvmArgs,
        `-Djava.library.path=${vars.natives_directory}`,
        version.mainClass,
        ...sanitizedGameArgs
    ];

    console.log('Running:', javaCmd, args.slice(0, 5).join(' '), '...');
    // use pipes so we capture JVM stderr/stdout and keep Node responsive
    const child = spawn(javaCmd, args, { cwd: instanceDir, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', (chunk) => process.stdout.write(chunk));
    child.stderr.on('data', (chunk) => process.stderr.write(chunk));
    child.on('error', (err) => {
        console.error('Failed to spawn Java process:', err);
    });
    child.on('exit', (code, signal) => {
        console.log('Client process exited with code', code, 'signal', signal);
        if (code !== 0) console.warn('Non-zero exit, check stderr above for details');
    });
    console.log('Launched client PID', child.pid);
}

main().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});

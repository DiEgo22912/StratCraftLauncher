#!/usr/bin/env node
// Assemble a client instance from a local Minecraft directory
// Usage: node assemble-from-local.js <mc_dir> <versionPattern>

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function copyRecursive(src, dest) {
    if (!fs.existsSync(src)) return;
    const stat = fs.statSync(src);
    if (stat.isDirectory()) {
        if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
        for (const name of fs.readdirSync(src)) {
            copyRecursive(path.join(src, name), path.join(dest, name));
        }
    } else {
        const ddir = path.dirname(dest);
        if (!fs.existsSync(ddir)) fs.mkdirSync(ddir, { recursive: true });
        fs.copyFileSync(src, dest);
    }
}

function findVersionDir(versionsDir, pattern) {
    if (!fs.existsSync(versionsDir)) return null;
    const entries = fs.readdirSync(versionsDir, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name);
    if (!pattern) return entries[0] || null;
    // try exact match
    for (const e of entries) {
        if (e.toLowerCase() === pattern.toLowerCase()) return e;
    }
    // try contains
    const normalized = pattern.toLowerCase();
    for (const e of entries) {
        if (e.toLowerCase().includes(normalized)) return e;
    }
    // regex fallback
    try {
        const rx = new RegExp(pattern, 'i');
        for (const e of entries) if (rx.test(e)) return e;
    } catch (e) { }
    return null;
}

async function main() {
    const mcDir = process.argv[2] || process.env.MC_DIR || path.join(process.env.APPDATA || '~', '.minecraft');
    const pattern = process.argv[3] || '1.20.1.*forge.*47.4.16';
    const workspace = path.join(__dirname);
    const clientFilesRoot = path.join(workspace, 'client-files');
    if (!fs.existsSync(mcDir)) {
        console.error('Minecraft dir not found:', mcDir);
        process.exit(1);
    }
    const versionsDir = path.join(mcDir, 'versions');
    const versionId = findVersionDir(versionsDir, pattern);
    if (!versionId) {
        console.error('Could not find matching version in', versionsDir, 'pattern=', pattern);
        process.exit(2);
    }
    console.log('Found version:', versionId);
    const srcVersionDir = path.join(versionsDir, versionId);
    const tgt = path.join(clientFilesRoot, versionId);
    // Clean target
    if (fs.existsSync(tgt)) {
        console.log('Removing existing target', tgt);
        fs.rmSync(tgt, { recursive: true, force: true });
    }
    fs.mkdirSync(tgt, { recursive: true });

    // Copy version files
    copyRecursive(srcVersionDir, path.join(tgt, 'versions', versionId));

    // Copy entire libraries directory from local Minecraft (ensures all jars are present)
    const srcLibraries = path.join(mcDir, 'libraries');
    if (fs.existsSync(srcLibraries)) {
        console.log('Copying whole libraries folder...');
        copyRecursive(srcLibraries, path.join(tgt, 'libraries'));
    } else {
        console.warn('No local libraries folder found, falling back to referenced libraries');
        // fallback: copy referenced ones (existing logic)
        const versionJsonPath = path.join(srcVersionDir, `${versionId}.json`);
        let versionJson = null;
        if (fs.existsSync(versionJsonPath)) {
            versionJson = JSON.parse(fs.readFileSync(versionJsonPath, 'utf8'));
        }
        if (versionJson && Array.isArray(versionJson.libraries)) {
            for (const lib of versionJson.libraries) {
                if (lib?.rules && lib.rules.some(r => r.action === 'disallow')) continue;
                const relPath = lib?.downloads?.artifact?.path || lib?.artifact?.path;
                if (!relPath) continue;
                const srcLibPath = path.join(mcDir, relPath.startsWith('libraries/') ? relPath : path.join('libraries', relPath));
                const dstLibPath = path.join(tgt, 'libraries', relPath);
                if (fs.existsSync(srcLibPath)) {
                    copyRecursive(srcLibPath, dstLibPath);
                } else {
                    console.warn('Library not found locally, skipping', relPath);
                }
            }
        }
    }

    // Copy assets (indexes and objects) - to be safe copy entire assets
    const srcAssets = path.join(mcDir, 'assets');
    if (fs.existsSync(srcAssets)) {
        copyRecursive(srcAssets, path.join(tgt, 'assets'));
    }

    // Copy mods, config, resourcepacks, options
    const extras = ['mods', 'config', 'resourcepacks', 'saves', 'options.txt', 'launcher_profiles.json'];
    for (const name of extras) {
        const src = path.join(mcDir, name);
        if (fs.existsSync(src)) copyRecursive(src, path.join(tgt, name));
    }

    // Copy natives if present
    const natives = path.join(mcDir, 'natives');
    if (fs.existsSync(natives)) copyRecursive(natives, path.join(tgt, 'natives'));

    console.log('Assembled client at', tgt);

    // Create an archive and client-manifest.json (cross-platform)
    try {
        const zipName = `StratCraftClient-${versionId}.zip`;
        const distDir = path.join(__dirname, 'dist');
        if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true });
        const zipPath = path.join(distDir, zipName);

        if (process.platform === 'win32') {
            console.log('Packaging using PowerShell Compress-Archive...');
            const ps = spawnSync('powershell', ['-NoProfile', '-Command', `Compress-Archive -Path "${tgt}\\*" -DestinationPath "${zipPath}" -Force`], { stdio: 'inherit' });
            if (ps.status !== 0) throw new Error('Compress-Archive failed');
        } else {
            console.log('Packaging using zip');
            const z = spawnSync('zip', ['-r', zipPath, '.'], { cwd: tgt, stdio: 'inherit' });
            if (z.status !== 0) throw new Error('zip failed');
        }

        // compute sha512 and size
        const stat = fs.statSync(zipPath);
        const size = stat.size;
        const crypto = require('crypto');
        const sh = crypto.createHash('sha512');
        const data = fs.readFileSync(zipPath);
        sh.update(data);
        const sha512 = sh.digest('base64');

        const manifest = {
            version: versionId,
            type: 'archive',
            archive: {
                url: zipName,
                sha512: sha512,
                size: size
            },
            notes: 'Built locally',
            published: new Date().toISOString()
        };
        const manifestPath = path.join(distDir, 'client-manifest.json');
        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
        console.log('Created', zipPath);
        console.log('Created manifest', manifestPath);
    } catch (e) {
        console.error('Error building archive/manifest:', e.message || e);
        process.exit(1);
    }

    console.log('Done.');
}

main().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});

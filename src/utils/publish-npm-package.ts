import fs from 'fs';
import path from 'path';
import childProcess from 'child_process';
import { log, logWarn, logError } from './log';
import { spawnSyncLogged } from './process';
import { fetchPackageVersions, officialNpmRegistryUrl } from './npm-registry';
import { INpmPackage, IPackageJson } from './npm-package';
import { mapRecord, isString } from './language-helpers';

export interface IPublishNpmPackageOptions {
    npmPackage: INpmPackage;
    /** @default false */
    dryRun?: boolean;
    /** @default 'latest' */
    tag?: string;
    /** @default '.' */
    distDir?: string;
    /** @default 'https://registry.npmjs.org/' */
    registryUrl?: string;
    /** @default undefined */
    token?: string;
}

export async function publishNpmPackage({
    npmPackage,
    tag = 'latest',
    dryRun = false,
    distDir = '.',
    registryUrl = officialNpmRegistryUrl,
    token
}: IPublishNpmPackageOptions): Promise<void> {
    const { directoryPath, packageJson } = npmPackage;
    const { name: packageName, version: packageVersion, scripts = {} } = packageJson;
    if (packageJson.private) {
        logWarn(`${packageName}: private. skipping.`);
        return;
    }
    const distDirectoryPath = path.join(directoryPath, distDir);
    const filesToRestore = new Map<string, string>();

    try {
        const versions = await fetchPackageVersions(packageName, registryUrl, token);
        if (!versions.includes(packageVersion)) {
            const publishArgs = ['publish', '--registry', registryUrl];
            if (dryRun) {
                publishArgs.push('--dry-run');
            }
            if (tag !== 'latest') {
                publishArgs.push('--tag', tag);
            }
            const rootSpawnOptions: childProcess.SpawnSyncOptions = {
                cwd: directoryPath,
                stdio: 'inherit',
                shell: true
            };

            if (distDirectoryPath === directoryPath) {
                spawnSyncLogged('npm', publishArgs, rootSpawnOptions, packageName);
            } else {
                if (isString(scripts.prepare)) {
                    spawnSyncLogged('npm', ['run', 'prepare'], rootSpawnOptions, packageName);
                }
                if (isString(scripts.prepublishOnly)) {
                    spawnSyncLogged('npm', ['run', 'prepublishOnly'], rootSpawnOptions, packageName);
                }
                if (isString(scripts.prepack)) {
                    spawnSyncLogged('npm', ['run', 'prepack'], rootSpawnOptions, packageName);
                }

                const distPackageJsonPath = path.join(distDirectoryPath, 'package.json');
                const distSpawnOptions: childProcess.SpawnSyncOptions = {
                    cwd: distDirectoryPath,
                    stdio: 'inherit',
                    shell: true
                };

                const distPackageJsonContents = fs.readFileSync(distPackageJsonPath, 'utf8');
                const distPackageJson = JSON.parse(distPackageJsonContents) as IPackageJson;
                if (distPackageJson.scripts) {
                    delete distPackageJson.scripts.prepare;
                    delete distPackageJson.scripts.prepublishOnly;
                    delete distPackageJson.scripts.prepack;
                    filesToRestore.set(distPackageJsonPath, distPackageJsonContents);
                    fs.writeFileSync(distPackageJsonPath, JSON.stringify(distPackageJson, null, 2));
                }
                spawnSyncLogged('npm', publishArgs, distSpawnOptions, packageName);
            }
            log(`${packageName}: done.`);
        } else {
            logWarn(`${packageName}: ${packageVersion} is already published. skipping.`);
        }
    } catch (error) {
        logError(`${packageName}: error while publishing: ${error?.stack || error}.`);
    } finally {
        for (const [filePath, fileContents] of filesToRestore) {
            fs.writeFileSync(filePath, fileContents);
        }
        filesToRestore.clear();
    }
}

export async function overridePackageJsons(packages: INpmPackage[], commitHash: string): Promise<Map<string, string>> {
    const filesToRestore = new Map<string, string>();

    const packageToVersion = new Map<string, string>(
        packages.map(({ packageJson }) => [packageJson.name, `${packageJson.version}-${commitHash.slice(0, 7)}`])
    );

    const getVersionRequest = (packageName: string, currentRequest: string) =>
        packageToVersion.get(packageName) ?? currentRequest;

    for (const { packageJson, packageJsonPath, packageJsonContent } of packages) {
        const { name: packageName, dependencies, devDependencies } = packageJson;
        packageJson.version = packageToVersion.get(packageName)!;
        if (dependencies) {
            packageJson.dependencies = mapRecord(dependencies, getVersionRequest);
        }
        if (devDependencies) {
            packageJson.devDependencies = mapRecord(devDependencies, getVersionRequest);
        }

        log(`${packageName}: updating versions in package.json`);
        filesToRestore.set(packageJsonPath, packageJsonContent);

        await fs.promises.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2));
    }
    return filesToRestore;
}

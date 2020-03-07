import http from 'http';
import https from 'https';
import fs from 'fs';
import { publishNpmPackage, overridePackageJsons } from '../utils/publish-npm-package';
import { resolveDirectoryContext, childPackagesFromContext } from '../utils/directory-context';
import { uriToIdentifier, officialNpmRegistryUrl } from '../utils/npm-registry';
import { loadNpmConfig } from '../utils/npm-config';
import { currentGitCommitHash } from '../utils/git';
import { isSecureUrl } from '../utils/http';

export interface SnapshotOptions {
    directoryPath: string;
    /** @default false */
    dryRun?: boolean;
    /** @default '.' */
    contents: string;
    /** @default .npmrc or official npm registry */
    registryUrl?: string;
    /** @default 'next' */
    tag?: string;
}

export async function snapshot({
    directoryPath,
    dryRun,
    contents,
    registryUrl: forcedRegistry,
    tag = 'next'
}: SnapshotOptions): Promise<void> {
    const directoryContext = await resolveDirectoryContext(directoryPath);
    const packages = childPackagesFromContext(directoryContext);
    const commitHash = currentGitCommitHash();
    if (!commitHash) {
        throw new Error(`cannot determine git commit hash for ${directoryPath}`);
    }
    const npmConfig = await loadNpmConfig(directoryPath);
    const registryUrl = forcedRegistry ?? npmConfig.registry ?? officialNpmRegistryUrl;
    const registryKey = uriToIdentifier(registryUrl);
    const token = npmConfig[`${registryKey}:_authToken`];
    const agent = isSecureUrl(registryUrl) ? new https.Agent({ keepAlive: true }) : new http.Agent({ keepAlive: true });

    const filesToRestore = await overridePackageJsons(packages, commitHash);
    const failedPublishes = new Set<string>();

    for (const npmPackage of packages) {
        try {
            await publishNpmPackage({
                tag,
                npmPackage,
                dryRun,
                distDir: contents,
                registryUrl,
                token,
                agent
            });
        } catch {
            failedPublishes.add(npmPackage.packageJson.name!);
        }
    }
    agent.destroy();
    for (const [filePath, fileContents] of filesToRestore) {
        await fs.promises.writeFile(filePath, fileContents);
    }
    filesToRestore.clear();

    if (failedPublishes.size) {
        throw new Error(`some packages failed publishing: ${Array.from(failedPublishes).join(', ')}`);
    }
}

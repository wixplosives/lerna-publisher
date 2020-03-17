import fs from 'fs';
import path from 'path';
import os from 'os';
import findUp from 'find-up';
import { parseIni } from './ini';
import { fileExists } from './fs';

interface LoadNpmConfigOptions {
    basePath?: string;
}

export async function loadNpmConfig({ basePath }: LoadNpmConfigOptions = {}): Promise<Record<string, string>> {
    const config: Record<string, string> = {};

    const userNpmConfigPath = path.join(os.homedir(), '.npmrc');
    if (await fileExists(userNpmConfigPath)) {
        const userNpmConfigContents = await fs.promises.readFile(userNpmConfigPath, 'utf8');
        Object.assign(config, parseIni(userNpmConfigContents));
    }

    const projectNpmConfigPath = await findUp('.npmrc', { cwd: basePath });
    if (projectNpmConfigPath !== undefined && projectNpmConfigPath !== userNpmConfigPath) {
        const projectNpmConfigContents = await fs.promises.readFile(projectNpmConfigPath, 'utf8');
        Object.assign(config, parseIni(projectNpmConfigContents));
    }

    // replace referenced env variables with actual values
    for (const [key, value] of Object.entries(config)) {
        config[key] = replaceEnvVarReferences(value);
    }
    return config;
}

const envExpression = /(\\*)\$\{([^}]+)\}/g;
function replaceEnvVarReferences(value: string) {
    return value.replace(envExpression, (orig, esc, envKey) => {
        if (esc.length && esc.length % 2) {
            return orig;
        }
        const envVarValue = process.env[envKey];
        if (envVarValue === undefined) {
            throw Error(`Environment variable "${envKey}" is referenced, but isn't set.`);
        }
        return envVarValue;
    });
}

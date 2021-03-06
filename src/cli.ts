/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import path from 'path';
import { Command } from 'commander';
import type { PackageJson } from 'type-fest';
import { reportProcessError } from './utils/process';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { name, version, description } = require('../package.json') as PackageJson;

process.on('unhandledRejection', reportProcessError);
process.on('uncaughtException', reportProcessError);

const program = new Command(name);
program
  .command('publish [target]')
  .description('publish unpublished packages')
  .option('--dry-run', 'no actual publishing (passed to npm as well)', false)
  .option('--contents <name>', 'subdirectory to publish (similar to lerna publish --contents)', '.')
  .option('--registry <url>', 'npm registry to use')
  .option('--tag <tag>', 'tag to use for published version', 'latest')
  .action(async (targetPath: string, { dryRun, contents, registry, tag }) => {
    try {
      const { publish } = await import('./commands/publish');

      await publish({
        directoryPath: path.resolve(targetPath || ''),
        dryRun,
        distDir: contents,
        registryUrl: registry,
        tag,
      });
    } catch (e) {
      reportProcessError(e);
    }
  });

program
  .command('upgrade [target]')
  .description('upgrade dependencies and devDependencies of all packages')
  .option('--dry-run', 'no actual upgrading (just the fetching process)', false)
  .option('--registry <url>', 'npm registry to use')
  .action(async (targetPath: string, { dryRun, registry }) => {
    try {
      const { upgrade } = await import('./commands/upgrade');

      await upgrade({
        directoryPath: path.resolve(targetPath || ''),
        dryRun,
        registryUrl: registry,
      });
    } catch (e) {
      reportProcessError(e);
    }
  });

program.version(version!, '-v, --version').description(description!).parse();

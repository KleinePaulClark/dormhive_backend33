import 'dotenv/config';
import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { access, rename, rm, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';

const dumpPath = fileURLToPath(new URL('../../../dormhive_restore.sql', import.meta.url));

async function findDumpExecutable() {
  if (process.env.MYSQLDUMP_PATH) return process.env.MYSQLDUMP_PATH;
  if (process.platform === 'win32') {
    for (const candidate of [
      'C:\\xampp\\mysql\\bin\\mysqldump.exe',
      'C:\\xampp2\\mysql\\bin\\mysqldump.exe'
    ]) {
      try {
        await access(candidate);
        return candidate;
      } catch {
        // Continue checking the standard XAMPP locations.
      }
    }
  }
  return 'mysqldump';
}

export async function exportDatabase() {
  const { DATABASE_HOST, DATABASE_PORT, DATABASE_USER, DATABASE_PASSWORD, DATABASE_NAME } = process.env;
  if (!DATABASE_USER || !DATABASE_NAME) {
    throw new Error('DATABASE_USER and DATABASE_NAME must be set to export the database.');
  }

  const temporaryPath = `${dumpPath}.${process.pid}.tmp`;
  const executable = await findDumpExecutable();
  const args = [
    '--host', DATABASE_HOST || 'localhost',
    '--port', DATABASE_PORT || '3306',
    '--user', DATABASE_USER,
    '--single-transaction',
    '--routines',
    '--triggers',
    '--events',
    '--default-character-set=utf8mb4',
    '--databases', DATABASE_NAME
  ];

  if (process.env.DATABASE_SSL === 'true') args.push('--ssl');

  await rm(temporaryPath, { force: true });

  const dump = spawn(executable, args, {
    env: { ...process.env, MYSQL_PWD: DATABASE_PASSWORD ?? '' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let stderr = '';
  dump.stderr.setEncoding('utf8');
  dump.stderr.on('data', (chunk) => {
    if (stderr.length < 8192) stderr += chunk.slice(0, 8192 - stderr.length);
  });

  const processDone = new Promise((resolve, reject) => {
    dump.once('error', reject);
    dump.once('close', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`mysqldump exited with ${signal ? `signal ${signal}` : `code ${code}`}.${stderr ? ` ${stderr.trim()}` : ''}`));
    });
  });

  try {
    await Promise.all([
      pipeline(dump.stdout, createWriteStream(temporaryPath)),
      processDone
    ]);

    if ((await stat(temporaryPath)).size === 0) {
      throw new Error('mysqldump produced an empty file.');
    }

    await rename(temporaryPath, dumpPath);
    console.log(`Database exported to ${dumpPath}`);
  } catch (error) {
    dump.kill();
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  exportDatabase().catch((error) => {
    console.error('Database export failed:', error);
    process.exitCode = 1;
  });
}

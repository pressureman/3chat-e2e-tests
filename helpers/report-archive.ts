import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import path from 'node:path';

type ZipArchive = NodeJS.ReadWriteStream & {
  directory(dirpath: string, destpath: string): ZipArchive;
  finalize(): Promise<void>;
};

type ZipArchiveConstructor = new (options: { zlib: { level: number } }) => ZipArchive;

function safeArchiveName(value: string): string {
  return value.replace(/[^a-z0-9._-]+/gi, '_').replace(/^_+|_+$/g, '') || 'e2e-report';
}

function commonParentDir(paths: string[]): string {
  const [first, ...rest] = paths.map((inputPath) => path.resolve(inputPath));
  const firstParts = first.split(path.sep);
  let sharedLength = firstParts.length - 1;

  for (const currentPath of rest) {
    const parts = currentPath.split(path.sep);
    let index = 0;
    while (index < sharedLength && firstParts[index] === parts[index]) {
      index += 1;
    }
    sharedLength = index;
  }

  return firstParts.slice(0, sharedLength).join(path.sep) || path.sep;
}

async function assertReportDirectory(reportDir: string): Promise<string> {
  const absoluteReportDir = path.resolve(reportDir);
  const stat = await fs.stat(absoluteReportDir).catch(() => undefined);
  if (!stat) {
    throw new Error(`Report directory does not exist: ${absoluteReportDir}`);
  }
  if (!stat.isDirectory()) {
    throw new Error(`Report path is not a directory: ${absoluteReportDir}`);
  }

  return absoluteReportDir;
}

export async function archiveReportDirectories(
  reportDirs: string[],
  archiveBaseName?: string,
): Promise<string> {
  const uniqueDirs = Array.from(new Set(reportDirs.map((reportDir) => reportDir.trim()).filter(Boolean)));
  if (!uniqueDirs.length) {
    throw new Error('No report directories were provided for archiving.');
  }

  const absoluteReportDirs = await Promise.all(uniqueDirs.map(assertReportDirectory));
  const outputParentDir = absoluteReportDirs.length === 1
    ? path.dirname(absoluteReportDirs[0])
    : commonParentDir(absoluteReportDirs);
  const defaultArchiveName = absoluteReportDirs.length === 1
    ? path.basename(absoluteReportDirs[0])
    : `e2e-report-${Date.now()}`;
  const archivePath = path.join(outputParentDir, `${safeArchiveName(archiveBaseName || defaultArchiveName)}.zip`);

  await fs.mkdir(outputParentDir, { recursive: true });
  const archiverModule = await import('archiver');
  const ZipArchiveClass = (archiverModule as unknown as { ZipArchive: ZipArchiveConstructor }).ZipArchive;

  return new Promise<string>((resolve, reject) => {
    const output = createWriteStream(archivePath);
    const archive = new ZipArchiveClass({ zlib: { level: 9 } });

    output.on('close', () => resolve(archivePath));
    output.on('error', reject);
    archive.on('warning', reject);
    archive.on('error', reject);

    archive.pipe(output);

    for (const reportDir of absoluteReportDirs) {
      const entryName = absoluteReportDirs.length === 1
        ? path.basename(reportDir)
        : path.relative(outputParentDir, reportDir);
      archive.directory(reportDir, entryName);
    }

    archive.finalize().catch(reject);
  });
}

export async function archiveReportDirectory(reportDir: string): Promise<string> {
  return archiveReportDirectories([reportDir]);
}

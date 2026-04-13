import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const MAX_TREE_LINES = 160;
const MAX_PREVIEW_CHARS = 1800;
const MAX_PREVIEW_FILES = 6;
const MAX_README_CHARS = 5000;
const EXCLUDED_DIRS = new Set([
  '.git',
  '.github',
  '.venv',
  '__pycache__',
  'node_modules',
  'dist',
  'build',
  '.next',
  '.turbo',
  '.pytest_cache',
]);
const TEXT_EXTENSIONS = new Set([
  '.md',
  '.rst',
  '.txt',
  '.py',
  '.ipynb',
  '.json',
  '.yaml',
  '.yml',
  '.toml',
  '.ini',
  '.cfg',
  '.sh',
]);

export type RepoPreview = {
  path: string;
  content: string;
};

export type RepoContext = {
  repoUrl: string;
  repoSlug: string;
  repoPath: string;
  readmeMarkdown: string;
  summary: string;
  treeLines: string[];
  importantPaths: string[];
  previews: RepoPreview[];
};

type GitHubRepoRef = {
  owner: string;
  repo: string;
  normalizedUrl: string;
  repoSlug: string;
};

function stripHtmlTags(value: string): string {
  return value.replace(/<[^>]+>/g, ' ');
}

export function normalizeReadmeMarkdown(value: string): string {
  return value
    .replace(/<img\b[^>]*>/gi, '')
    .replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_match, href, text) => {
      const label = stripHtmlTags(text).replace(/\s+/g, ' ').trim() || href;
      return `[${label}](${href})`;
    })
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(?:div|span|p|section|article|main|figure|figcaption)\b[^>]*>/gi, '\n')
    .replace(/<\/?(?:strong|b|em|i|code)\b[^>]*>/gi, '')
    .replace(/<\/?[^>]+>/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function isTextFile(filePath: string): boolean {
  return (
    TEXT_EXTENSIONS.has(path.extname(filePath).toLowerCase()) ||
    path.basename(filePath) === 'Dockerfile'
  );
}

function getRepoStorageRoot(): string {
  return path.resolve(process.cwd(), 'data', 'ilde', 'repos');
}

function parseGitHubRepoUrl(rawUrl: string): GitHubRepoRef {
  let parsed: URL;

  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('Repository URL must be a valid URL');
  }

  if (parsed.hostname !== 'github.com' && parsed.hostname !== 'www.github.com') {
    throw new Error('Only public GitHub repository URLs are supported');
  }

  const parts = parsed.pathname
    .replace(/\.git$/i, '')
    .split('/')
    .filter(Boolean);

  if (parts.length < 2) {
    throw new Error('Repository URL must include an owner and repository name');
  }

  const owner = parts[0];
  const repo = parts[1];

  return {
    owner,
    repo,
    normalizedUrl: `https://github.com/${owner}/${repo}.git`,
    repoSlug: `${owner}/${repo}`,
  };
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function cloneRepo(normalizedUrl: string, targetPath: string): Promise<void> {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await execFileAsync(
    'git',
    ['clone', '--depth', '1', '--single-branch', normalizedUrl, targetPath],
    { timeout: 120000 },
  );
}

async function collectTreeLines(
  rootPath: string,
  relativePath = '',
  lines: string[] = [],
): Promise<string[]> {
  if (lines.length >= MAX_TREE_LINES) {
    return lines;
  }

  const currentPath = relativePath ? path.join(rootPath, relativePath) : rootPath;
  const entries = await fs.readdir(currentPath, { withFileTypes: true });
  const sortedEntries = entries
    .filter((entry) => !EXCLUDED_DIRS.has(entry.name))
    .sort((left, right) => {
      if (left.isDirectory() && !right.isDirectory()) {
        return -1;
      }
      if (!left.isDirectory() && right.isDirectory()) {
        return 1;
      }
      return left.name.localeCompare(right.name);
    });

  for (const entry of sortedEntries) {
    if (lines.length >= MAX_TREE_LINES) {
      break;
    }

    const childRelativePath = relativePath ? path.join(relativePath, entry.name) : entry.name;
    lines.push(entry.isDirectory() ? `${childRelativePath}/` : childRelativePath);

    if (entry.isDirectory()) {
      await collectTreeLines(rootPath, childRelativePath, lines);
    }
  }

  return lines;
}

function scorePath(relativePath: string): number {
  const normalizedPath = relativePath.toLowerCase();
  let score = 0;

  if (/readme/.test(normalizedPath)) {
    score += 80;
  }
  if (/train|main|run|experiment/.test(normalizedPath)) {
    score += 70;
  }
  if (/dag|gflownet|graph|posterior|model|policy/.test(normalizedPath)) {
    score += 55;
  }
  if (/dataset|data|env|environment/.test(normalizedPath)) {
    score += 35;
  }
  if (/requirements|setup|pyproject|dockerfile/.test(normalizedPath)) {
    score += 30;
  }
  if (normalizedPath.endsWith('.py')) {
    score += 20;
  }
  if (normalizedPath.split('/').length <= 2) {
    score += 10;
  }

  return score;
}

async function readTextFile(
  rootPath: string,
  relativePath: string,
  limit: number,
): Promise<string> {
  const absolutePath = path.join(rootPath, relativePath);
  const file = await fs.readFile(absolutePath, 'utf8');
  return file.slice(0, limit).trim();
}

async function findReadme(rootPath: string, treeLines: string[]): Promise<string> {
  const readmePath =
    treeLines.find((line) => /^readme\./i.test(path.basename(line))) ??
    treeLines.find((line) => /\/readme\./i.test(line));

  if (!readmePath) {
    return '';
  }

  try {
    const readmeMarkdown = await readTextFile(rootPath, readmePath, MAX_README_CHARS);
    return normalizeReadmeMarkdown(readmeMarkdown);
  } catch {
    return '';
  }
}

export function summarizeReadme(
  repoSlug: string,
  readmeMarkdown: string,
  importantPaths: string[],
): string {
  const paragraphs = readmeMarkdown
    .split(/\n\s*\n/)
    .map((paragraph) =>
      paragraph
        .replace(/[#>*`]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter((paragraph) => paragraph.length > 18 && !/^https?:\/\//i.test(paragraph));

  if (paragraphs[0]) {
    return paragraphs[0].slice(0, 320);
  }

  if (importantPaths.length > 0) {
    return `${repoSlug} exposes important entry points in ${importantPaths.slice(0, 3).join(', ')}.`;
  }

  return `${repoSlug} is available for repository inspection.`;
}

async function buildPreviews(rootPath: string, treeLines: string[]): Promise<RepoPreview[]> {
  const candidatePaths = treeLines
    .filter((line) => !line.endsWith('/') && isTextFile(line))
    .sort((left, right) => scorePath(right) - scorePath(left))
    .slice(0, MAX_PREVIEW_FILES);

  const previews = await Promise.all(
    candidatePaths.map(async (relativePath) => ({
      path: relativePath,
      content: await readTextFile(rootPath, relativePath, MAX_PREVIEW_CHARS),
    })),
  );

  return previews.filter((preview) => preview.content.length > 0);
}

export async function ensureRepoContext(rawUrl: string): Promise<RepoContext> {
  const repoRef = parseGitHubRepoUrl(rawUrl);
  const repoStorageRoot = getRepoStorageRoot();
  const repoPath = path.join(repoStorageRoot, `${repoRef.owner}__${repoRef.repo}`);
  const repoExists = await pathExists(repoPath);

  if (!repoExists) {
    await cloneRepo(repoRef.normalizedUrl, repoPath);
  }

  const treeLines = await collectTreeLines(repoPath);
  const importantPaths = treeLines
    .filter((line) => !line.endsWith('/'))
    .sort((left, right) => scorePath(right) - scorePath(left))
    .slice(0, 8);
  const readmeMarkdown = await findReadme(repoPath, treeLines);
  const previews = await buildPreviews(repoPath, treeLines);

  return {
    repoUrl: repoRef.normalizedUrl,
    repoSlug: repoRef.repoSlug,
    repoPath,
    readmeMarkdown,
    summary: summarizeReadme(repoRef.repoSlug, readmeMarkdown, importantPaths),
    treeLines,
    importantPaths,
    previews,
  };
}

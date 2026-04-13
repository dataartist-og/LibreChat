import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { closeKernelSession, executeInKernel } from './kernel';

describe('dialog kernel', () => {
  const dialogId = 'dialog-kernel-spec';

  afterEach(() => {
    closeKernelSession(dialogId);
  });

  it('preserves python state across executions in the same dialog session', async () => {
    const first = await executeInKernel(dialogId, 'value = 41\nprint("ready")\nvalue');
    const second = await executeInKernel(dialogId, 'value + 1');

    expect(first.stdout).toContain('ready');
    expect(first.result?.repr).toBe('41');
    expect(second.result?.repr).toBe('42');
  });

  it('binds repo_root when a repo working directory is provided', async () => {
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'dialog-kernel-repo-'));
    const result = await executeInKernel(
      dialogId,
      'from pathlib import Path\n(Path(repo_root).name, Path(dialog_cwd).name)',
      repoRoot,
    );

    expect(result.error).toBeNull();
    expect(result.result?.repr).toContain(path.basename(repoRoot));
  });

  it('blocks unsafe imports and write-capable file access', async () => {
    const importResult = await executeInKernel(dialogId, 'import subprocess');
    const writeResult = await executeInKernel(
      dialogId,
      'open("forbidden.txt", "w").write("blocked")',
    );

    expect(importResult.error).toContain("Import of 'subprocess' is not allowed");
    expect(writeResult.error).toContain('open() is restricted to read-only modes');
  });
});

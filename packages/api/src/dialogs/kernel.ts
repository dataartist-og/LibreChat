import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';

type KernelResponse = {
  requestId: string;
  stdout: string;
  stderr: string;
  result: { repr: string } | null;
  error: string | null;
  traceback: string | null;
};

type KernelSession = {
  process: ChildProcessWithoutNullStreams;
  outputBuffer: string;
  pending: Map<
    string,
    {
      resolve: (value: KernelResponse) => void;
      reject: (error: Error) => void;
      timer: NodeJS.Timeout;
    }
  >;
};

const sessions = new Map<string, KernelSession>();

const workerScript = `
import ast
import contextlib
import io
import json
import os
import sys
import traceback

globals_ns = {"__name__": "__main__"}
FORBIDDEN_IMPORT_ROOTS = {"subprocess", "socket", "requests", "urllib", "pip", "httpx"}
FORBIDDEN_CALLS = {
    "__import__",
    "eval",
    "exec",
    "compile",
    "breakpoint",
    "input",
    "os.system",
    "os.remove",
    "os.unlink",
    "os.rmdir",
    "shutil.rmtree",
    "shutil.move",
    "shutil.copytree",
}
FORBIDDEN_METHOD_NAMES = {
    "write_text",
    "write_bytes",
    "unlink",
    "mkdir",
    "rmdir",
    "rename",
    "replace",
    "touch",
}

def _attr_chain(node):
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        parent = _attr_chain(node.value)
        return f"{parent}.{node.attr}" if parent else node.attr
    return None

class SafetyVisitor(ast.NodeVisitor):
    def __init__(self):
        self.errors = []

    def visit_Import(self, node):
        for alias in node.names:
            root = alias.name.split(".", 1)[0]
            if root in FORBIDDEN_IMPORT_ROOTS:
                self.errors.append(f"Import of '{alias.name}' is not allowed in dialog study mode")
        self.generic_visit(node)

    def visit_ImportFrom(self, node):
        if node.module:
            root = node.module.split(".", 1)[0]
            if root in FORBIDDEN_IMPORT_ROOTS:
                self.errors.append(f"Import of '{node.module}' is not allowed in dialog study mode")
        self.generic_visit(node)

    def visit_Call(self, node):
        target = _attr_chain(node.func)
        if target in FORBIDDEN_CALLS:
            self.errors.append(f"Call to '{target}' is not allowed in dialog study mode")
        elif isinstance(node.func, ast.Attribute) and node.func.attr in FORBIDDEN_METHOD_NAMES:
            self.errors.append(
                f"Call to '{node.func.attr}' is not allowed in dialog study mode"
            )
        self.generic_visit(node)

def validate_code(code):
    parsed = ast.parse(code, mode="exec")
    visitor = SafetyVisitor()
    visitor.visit(parsed)
    if visitor.errors:
        raise PermissionError("; ".join(dict.fromkeys(visitor.errors)))
    return parsed

def read_only_open(*args, **kwargs):
    mode = kwargs.get("mode")
    if mode is None and len(args) >= 2:
        mode = args[1]
    mode = (mode or "r").strip()
    if any(flag in mode for flag in ("w", "a", "x", "+")):
        raise PermissionError("open() is restricted to read-only modes in dialog study mode")
    return open(*args, **kwargs)

def run(code, cwd=None):
    if cwd:
        os.chdir(cwd)
        globals_ns["repo_root"] = cwd
        globals_ns["dialog_cwd"] = cwd
    globals_ns["open"] = read_only_open

    stdout_stream = io.StringIO()
    stderr_stream = io.StringIO()
    result = None
    error = None
    tb = None

    with contextlib.redirect_stdout(stdout_stream), contextlib.redirect_stderr(stderr_stream):
        try:
            parsed = validate_code(code)
            if parsed.body and isinstance(parsed.body[-1], ast.Expr):
                expr = ast.Expression(parsed.body[-1].value)
                module = ast.Module(body=parsed.body[:-1], type_ignores=[])
                exec(compile(module, "<dialog-cell>", "exec"), globals_ns, globals_ns)
                result = eval(compile(expr, "<dialog-cell>", "eval"), globals_ns, globals_ns)
            else:
                exec(compile(parsed, "<dialog-cell>", "exec"), globals_ns, globals_ns)
        except Exception as exc:
            error = f"{exc.__class__.__name__}: {exc}"
            tb = traceback.format_exc()

    response = {
        "stdout": stdout_stream.getvalue(),
        "stderr": stderr_stream.getvalue(),
        "result": None if result is None else {"repr": repr(result)},
        "error": error,
        "traceback": tb,
    }
    return response

for line in sys.stdin:
    payload = json.loads(line)
    response = run(payload.get("code", ""), payload.get("cwd"))
    response["requestId"] = payload.get("requestId")
    sys.stdout.write(json.dumps(response) + "\\n")
    sys.stdout.flush()
`;

let workerPathPromise: Promise<string> | null = null;

function createKernelError(message: string): Error {
  return new Error(`[dialog kernel] ${message}`);
}

async function ensureWorkerPath(): Promise<string> {
  if (!workerPathPromise) {
    workerPathPromise = (async () => {
      const rootPath = path.join(os.tmpdir(), 'librechat-dialog-kernel');
      await fs.mkdir(rootPath, { recursive: true });
      const scriptPath = path.join(rootPath, 'worker.py');
      await fs.writeFile(scriptPath, workerScript, 'utf8');
      return scriptPath;
    })();
  }

  return workerPathPromise;
}

function attachOutputListener(session: KernelSession) {
  session.process.stdout.on('data', (chunk: Buffer) => {
    session.outputBuffer += chunk.toString('utf8');
    const lines = session.outputBuffer.split('\n');
    session.outputBuffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.trim()) {
        continue;
      }

      let parsed: KernelResponse;

      try {
        parsed = JSON.parse(line) as KernelResponse;
      } catch {
        continue;
      }

      const pending = session.pending.get(parsed.requestId);
      if (!pending) {
        continue;
      }

      clearTimeout(pending.timer);
      session.pending.delete(parsed.requestId);
      pending.resolve(parsed);
    }
  });

  session.process.once('exit', () => {
    const pendingRequests = Array.from(session.pending.values());
    session.pending.clear();
    pendingRequests.forEach((pending) => {
      clearTimeout(pending.timer);
      pending.reject(createKernelError('Python session exited unexpectedly'));
    });
  });
}

async function createKernelSession(dialogId: string): Promise<KernelSession> {
  const scriptPath = await ensureWorkerPath();
  const processHandle = spawn('python3', ['-u', scriptPath], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const session: KernelSession = {
    process: processHandle,
    outputBuffer: '',
    pending: new Map(),
  };

  processHandle.stderr.on('data', () => undefined);
  attachOutputListener(session);
  sessions.set(dialogId, session);

  return session;
}

async function getKernelSession(dialogId: string): Promise<KernelSession> {
  const existingSession = sessions.get(dialogId);
  if (existingSession) {
    return existingSession;
  }

  return createKernelSession(dialogId);
}

export async function executeInKernel(
  dialogId: string,
  code: string,
  cwd?: string | null,
  timeoutMs = 30000,
): Promise<KernelResponse> {
  const session = await getKernelSession(dialogId);
  const requestId = crypto.randomUUID();

  return await new Promise<KernelResponse>((resolve, reject) => {
    const timer = setTimeout(() => {
      session.pending.delete(requestId);
      session.process.kill('SIGKILL');
      sessions.delete(dialogId);
      reject(createKernelError('Python execution timed out'));
    }, timeoutMs);

    session.pending.set(requestId, { resolve, reject, timer });
    session.process.stdin.write(`${JSON.stringify({ requestId, code, cwd: cwd ?? null })}\n`);
  });
}

export function closeKernelSession(dialogId: string): void {
  const session = sessions.get(dialogId);
  if (!session) {
    return;
  }

  session.process.kill('SIGKILL');
  sessions.delete(dialogId);
}

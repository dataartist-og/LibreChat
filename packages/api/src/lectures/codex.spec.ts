import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { StudyCodex, codexEnvironment, codexThreadConfig, completeCodexJson } from './codex';

let directory: string;
let previousBinary: string | undefined;

async function fixture(mode: 'chatgpt' | 'apiKey' | 'tool' | 'mcp' = 'chatgpt'): Promise<string> {
  const binary = join(directory, 'codex');
  const log = join(directory, 'requests.jsonl');
  await writeFile(
    binary,
    `#!${process.execPath}
const readline = require('node:readline');
const fs = require('node:fs');
const line = readline.createInterface({input:process.stdin});
const send = (m) => process.stdout.write(JSON.stringify(m)+'\\n');
line.on('line', text => {
  const m=JSON.parse(text); if(!m.method)return;
  fs.appendFileSync(${JSON.stringify(log)},JSON.stringify(m)+'\\n');
  const responses={
    initialize:{},
    'account/read':{account:{type:${JSON.stringify(mode === 'apiKey' ? 'apiKey' : 'chatgpt')}}},
    'config/read':{config:{mcp_servers:{dangerous:{command:'ignored'}}}},
    'thread/start':{thread:{id:'test-thread'},modelProvider:'openai',sandbox:{type:'readOnly'}},
    'mcpServerStatus/list':{data:${mode === 'mcp' ? '[{tools:{bad:{}}}]' : '[]'}},
    'thread/realtime/start':{},
    'thread/realtime/stop':{},
    'turn/start':{}
  };
  if(m.id!=null)send({id:m.id,result:responses[m.method]||{}});
  if(m.method==='turn/start'){
    if(${JSON.stringify(mode)}==='tool'){send({id:500,method:'item/tool/call',params:{}});return;}
    send({method:'item/completed',params:{item:{type:'agentMessage',text:'{"ok":true}',phase:'final_answer'}}});
    send({method:'turn/completed',params:{turn:{status:'completed'}}});
  }
  if(m.method==='thread/realtime/start')send({method:'thread/realtime/sdp',params:{sdp:'v=0\\r\\nm=audio 9 UDP/TLS/RTP/SAVPF 111\\r\\n'}});
});
`,
    { mode: 0o700 },
  );
  process.env.LECTURE_CODEX_BINARY = binary;
  return log;
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'study-codex-test-'));
  previousBinary = process.env.LECTURE_CODEX_BINARY;
});
afterEach(async () => {
  if (previousBinary) {
    process.env.LECTURE_CODEX_BINARY = previousBinary;
  } else {
    delete process.env.LECTURE_CODEX_BINARY;
  }
  await rm(directory, { recursive: true, force: true });
});

it('never passes API or proxy credentials into the subscription child', () => {
  const environment = codexEnvironment({
    HOME: '/home/study',
    PATH: '/bin',
    OPENAI_API_KEY: 'secret',
    OPENAI_BASE_URL: 'https://custom.example',
    AZURE_API_KEY: 'secret',
  });
  expect(environment).toEqual({ HOME: '/home/study', PATH: '/bin' });
});

it('disables configured MCP tools as well as shell, code execution, plugins and memory', () => {
  const config = codexThreadConfig(['filesystem', 'computer-use']);
  expect(config['mcp_servers.filesystem.enabled']).toBe(false);
  expect(config['mcp_servers.computer-use.enabled']).toBe(false);
  for (const feature of ['shell_tool', 'code_mode', 'plugins', 'apps', 'memories', 'multi_agent']) {
    expect(config[`features.${feature}`]).toBe(false);
  }
  expect(() => codexThreadConfig(['ambiguous.server'])).toThrow('unsupported MCP configuration');
});

it('requires managed ChatGPT authentication before any model turn', async () => {
  const log = await fixture('apiKey');
  await expect(completeCodexJson([{ role: 'user', content: 'Return JSON.' }])).rejects.toThrow(
    'Sign in to Codex with ChatGPT',
  );
  expect(await readFile(log, 'utf8')).not.toContain('turn/start');
});

it('uses an ephemeral read-only thread without environments and returns validated JSON', async () => {
  const log = await fixture();
  await expect(completeCodexJson([{ role: 'user', content: 'Return JSON.' }])).resolves.toBe(
    '{"ok":true}',
  );
  const calls = (await readFile(log, 'utf8'))
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  const thread = calls.find((call) => call.method === 'thread/start');
  expect(thread.params).toMatchObject({
    ephemeral: true,
    sandbox: 'read-only',
    environments: [],
    dynamicTools: [],
    runtimeWorkspaceRoots: [],
  });
  expect(thread.params.config['mcp_servers.dangerous.enabled']).toBe(false);
});

it('fails closed if the native thread still exposes MCP tools', async () => {
  const log = await fixture('mcp');
  await expect(completeCodexJson([{ role: 'user', content: 'Return JSON.' }])).rejects.toThrow(
    'disable external tools',
  );
  expect(await readFile(log, 'utf8')).not.toContain('turn/start');
});

it('rejects server-initiated tool requests instead of executing them', async () => {
  await fixture('tool');
  await expect(completeCodexJson([{ role: 'user', content: 'Return JSON.' }])).rejects.toThrow(
    'unavailable tool',
  );
});

it('negotiates the subscription WebRTC transport and closes it', async () => {
  const log = await fixture();
  const client = await StudyCodex.open();
  const answer = await client.startVoice('v=0\r\nm=audio', 'Discuss the supplied paper.');
  expect(answer).toContain('m=audio');
  await client.stopVoice();
  const text = await readFile(log, 'utf8');
  expect(text).toContain('"type":"webrtc"');
  expect(text).toContain('"version":"v3"');
  expect(text).toContain('thread/realtime/stop');
});

it('reserves process capacity atomically across concurrent starts', async () => {
  await fixture();
  const results = await Promise.allSettled(Array.from({ length: 7 }, () => StudyCodex.open()));
  try {
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(6);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
  } finally {
    for (const result of results) {
      if (result.status === 'fulfilled') {
        result.value.close();
      }
    }
  }
});

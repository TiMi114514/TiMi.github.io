/**
 * Integration smoke test for the RAGFlow client.
 *
 *   npx tsx scripts/test-ragflow.ts
 *
 * Loads .env.local the same way `next dev` does.
 */
import fs from 'node:fs';
import { getRagflowConfig, listRagflowDocuments, ragflowChat } from '../lib/ragflow';

if (fs.existsSync('.env.local')) {
  for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && !(match[1] in process.env)) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
    }
  }
}

const cfg = getRagflowConfig();

async function main() {
  if (!cfg.apiKey || !cfg.chatId) {
    throw new Error('Set NEXT_PUBLIC_RAGFLOW_API_KEY and NEXT_PUBLIC_RAGFLOW_CHAT_ID first.');
  }

  console.log('baseUrl  :', cfg.baseUrl);
  console.log('chatId   :', cfg.chatId);
  console.log('datasets :', cfg.datasetId.split(',').length);
  console.log('mode     :', cfg.mode);

  // 1. Archive
  const papers = await listRagflowDocuments(cfg);
  console.log('\narchive documents:', papers.length);
  for (const paper of papers.slice(0, 4)) {
    console.log(' -', paper.subject, '|', paper.year, '|', paper.title, '|', paper.size);
  }

  // 2. Native chat (with citations + session id)
  let deltas = 0;
  let sessionId: string | undefined;
  const native = await ragflowChat(
    { ...cfg, mode: 'native' },
    [{ role: 'user', content: 'What is osmosis? Answer in one sentence.' }],
    {
      onDelta: () => {
        deltas += 1;
      },
      onSessionId: (id) => {
        sessionId = id;
      },
    },
  );
  console.log('\nnative answer:', native.content.slice(0, 180));
  console.log('native deltas:', deltas, '| session:', Boolean(sessionId));
  console.log('native citations:', native.citations.slice(0, 3));

  // 3. Follow up in the same session
  const followUp = await ragflowChat(
    { ...cfg, mode: 'native' },
    [{ role: 'user', content: 'And what is active transport?' }],
    { sessionId },
  );
  console.log('\nfollow-up answer:', followUp.content.slice(0, 160));

  // 4. OpenAI-compatible mode
  const openai = await ragflowChat(
    { ...cfg, mode: 'openai' },
    [{ role: 'user', content: 'What is the function of the cell membrane?' }],
    {},
  );
  console.log('\nopenai answer:', openai.content.slice(0, 180));
}

main().catch((error) => {
  console.error('TEST FAILED:', error.message);
  process.exitCode = 1;
});

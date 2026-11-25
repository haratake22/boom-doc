#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join, dirname, extname } from 'node:path';
import { createRequire } from 'node:module';
import { chromium } from '@playwright/test';
import { marked } from 'marked';
import sanitize from 'sanitize-html';
import toDocx from '@turbodocx/html-to-docx';

const root = dirname(import.meta.dirname);
const require = createRequire(import.meta.url);
const [command, input, output, orderFile] = process.argv.slice(2);
function run(exe: string, args: string[], cwd: string, env = process.env) {
  const result = spawnSync(exe, args, { cwd, env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw Error(exe + ' failed');
}
function readOrder(path: string): string[] {
  const text = readFileSync(path, 'utf8');
  let order: unknown;
  try { order = JSON.parse(text); }
  catch (cause) { throw Error(`Invalid JSON in order file: ${path}`, {cause}); }
  if (!Array.isArray(order) || !order.every(title => typeof title === 'string'))
    throw Error(`Expected an array of test titles in order file: ${path}`);
  return order;
}
if (command === 'generate' && input && output) {
  const order = orderFile ? readOrder(orderFile) : [];
  const dir = mkdtempSync(join(tmpdir(), 'boom-doc-'));
  try {
    const record = join(dir, 'run.json');
    run(process.execPath, [require.resolve('@playwright/test/cli'), 'test', '--config', resolve(input),
      '--reporter', join(import.meta.dirname, 'reporter' + extname(import.meta.filename))], process.cwd(), {...process.env, BOOM_RECORD: record});
    run('go', ['run', './internal/manual', 'generate', record, resolve(output), ...order], root);
  } finally { rmSync(dir, {recursive:true, force:true}); }
} else if (command === 'export' && input && output) {
  const format = extname(output).toLowerCase();
  if (!['.html', '.pdf', '.docx'].includes(format))
    throw Error(`Unsupported output format: ${output}. Expected .html, .pdf or .docx`);
  const body = sanitize(await marked.parse(readFileSync(input, 'utf8')), {
    allowedTags: [...sanitize.defaults.allowedTags, 'img'],
    transformTags: { img: (_, attrs) => {
      if (!/^assets\/[a-f0-9]{64}\.png$/.test(attrs.src ?? '')) throw Error('Expected a generated asset: ' + attrs.src);
      return {tagName:'img', attribs:{alt:attrs.alt ?? '', src:'data:image/png;base64,' +
        readFileSync(resolve(dirname(input), attrs.src)).toString('base64')}};
    } }, allowedSchemesByTag: {img:['data']},
  });
  const html = '<!doctype html><html lang="ja"><meta charset="utf-8"><title>操作マニュアル</title><style>img{max-width:100%;height:auto}body{font-family:sans-serif}</style><body>' + body + '</body></html>';
  switch (format) {
    case '.html': writeFileSync(output, html); break;
    case '.docx': writeFileSync(output, await toDocx(html)); break;
    case '.pdf': {
      const browser = await chromium.launch({channel:process.env.BOOM_BROWSER_CHANNEL});
      try { const page = await browser.newPage({javaScriptEnabled:false}); await page.setContent(html); await page.pdf({path:output,format:'A4'}); }
      finally { await browser.close(); }
      break;
    }
  }
} else { throw Error('generate <playwright.config.ts> <output-dir> [order.json] | export <manual.md> <output-file>'); }

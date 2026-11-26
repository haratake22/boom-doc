import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import JSZip from 'jszip';
import { chromium } from '@playwright/test';
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test('install the packed CLI, generate, update and export a consumer manual', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'boom-consumer-'));
  t.after(() => rmSync(dir, {recursive:true, force:true}));
  const npmPath = process.env.npm_execpath;
  assert.ok(npmPath, 'Run this test with npm test');
  const npm = (args: string[], cwd: string) => execFileSync(process.execPath, [npmPath, ...args], {cwd, encoding:'utf8'});
  const [pack]: { filename: string; files: { path: string }[] }[] = JSON.parse(npm(['pack','--json','--pack-destination',dir], process.cwd()));
  assert.ok(pack.files.some(f => f.path === 'LICENSE'));
  assert.ok(!pack.files.some(f => f.path === 'TASKS.md'));
  writeFileSync(join(dir,'package.json'), '{"private":true,"type":"module"}');
  npm(['install',join(dir,pack.filename)], dir);
  writeFileSync(join(dir,'playwright.config.ts'), "export default {use:{channel:process.env.BOOM_BROWSER_CHANNEL}}");
  writeFileSync(join(dir,'manual.spec.ts'), `
    import { test } from 'boom-doc/fixture';
    test('Settings', async ({page, manualStep}, info) => {
      const label = process.env.LABEL;
      test.skip(process.env.RUN_MODE === 'skip');
      await page.setContent('<button style="color:' + (process.env.BUTTON_COLOR ?? 'black') + '">' + label + '</button>');
      await manualStep(label, () => page.getByRole('button', {name:label}).click());
      if (process.env.RUN_MODE === 'fail' || (process.env.RUN_MODE === 'retry' && info.retry === 0))
        throw Error('Simulated failed attempt');
    });`);
  const cli = (args: string[], label='Save', mode='normal', color='black') => execFileSync(process.execPath, [npmPath, 'exec', '--offline', '--', 'boom-doc', ...args],
    {cwd:dir, env:{...process.env, LABEL:label, RUN_MODE:mode, BUTTON_COLOR:color}, stdio:'pipe'});
  const generate = (label = 'Save', mode = 'normal', color = 'black') => cli(['generate','playwright.config.ts','manual'],label,mode,color);
  const path = join(dir,'manual/manual.md');
  const read = (p: string) => readFileSync(p,'utf8');
  writeFileSync(join(dir,'order.json'), JSON.stringify(['Settings']));
  cli(['generate','playwright.config.ts','manual','order.json']);
  assert.match(read(path), /1\. Save/);
  const note = '初回のみ管理者に連絡してください。';
  const label = '設定を保存';
  const edited = read(path) + '\n' + note + '\n';
  writeFileSync(path,edited);
  generate();
  assert.equal(read(path), edited);
  const base = join(dir,'manual/.boom-base.md');
  const original = read(base);
  for (const [order, message] of [
    ['[', /Error: Invalid JSON in order file: order.json/],
    ['[42]', /Error: Expected an array of test titles in order file: order.json/],
    ['["Unknown"]', /unknown or repeated chapter: Unknown/],
  ] as const) {
    writeFileSync(join(dir,'order.json'),order);
    assert.throws(() => cli(['generate','playwright.config.ts','manual','order.json']),message);
    assert.equal(read(path),edited);
    assert.equal(read(base),original);
  }

  const missingImage = 'assets/' + '0'.repeat(64) + '.png';
  for (const [ext, image, error] of [
    ['txt', missingImage, /Error: Unsupported output format: .*out\.txt/],
    ['html', 'unknown.png', /Error: Expected a generated asset: unknown\.png/],
    ['html', missingImage, /ENOENT:.*0{64}\.png/],
    ['pdf', missingImage, /ENOENT:.*0{64}\.png/],
    ['docx', missingImage, /ENOENT:.*0{64}\.png/],
  ] as const) {
    const source = edited + '\n![missing](' + image + ')\n';
    writeFileSync(path,source);
    const destination = 'manual/out.' + ext;
    const previousOutput = Buffer.from([0, 127, 255]);
    writeFileSync(join(dir,destination),previousOutput);
    assert.throws(() => cli(['export','manual/manual.md',destination]),error);
    assert.deepEqual(readFileSync(join(dir,destination)),previousOutput);
    assert.equal(read(path),source);
    assert.equal(read(base),original);
  }
  writeFileSync(path,edited);
  for (const mode of ['fail','skip']) {
    assert.throws(() => generate('Unfinished',mode));
    assert.equal(read(path),edited);
    assert.equal(read(base),original);
  }

  // Only the screenshot changes: the image link is replaced and the note is kept.
  const assetOf = (text: string) => text.match(/\((assets\/[a-f0-9]{64}\.png)\)/)?.[1];
  const oldAsset = assetOf(edited);
  assert.ok(oldAsset);
  generate('Save','normal','red');
  const recolored = read(path);
  const newAsset = assetOf(recolored);
  assert.ok(newAsset && newAsset !== oldAsset, 'the screenshot must change');
  assert.equal(recolored, edited.replace(oldAsset, newAsset));
  assert.notDeepEqual(readFileSync(join(dir,'manual',newAsset)), readFileSync(join(dir,'manual',oldAsset)));
  assert.equal(read(base), original.replace(oldAsset, newAsset));

  // A missing manual or baseline stops the update and keeps the remaining file.
  for (const [missing, kept] of [[base, path], [path, base]]) {
    const content = read(missing);
    const keptContent = read(kept);
    rmSync(missing);
    assert.throws(() => generate(), /manual and baseline must both exist/);
    assert.equal(read(kept), keptContent);
    assert.throws(() => readFileSync(missing), /ENOENT/);
    writeFileSync(missing, content);
  }

  writeFileSync(join(dir,'playwright.config.ts'), "export default {retries:1,use:{channel:process.env.BOOM_BROWSER_CHANNEL}}");
  generate(label,'retry');
  assert.equal(read(path).split('1. ' + label).length,2);
  assert.ok(read(path).includes(note));
  const asset = read(path).match(/\((assets\/[a-f0-9]{64}\.png)\)/);
  assert.ok(asset);
  const png = readFileSync(join(dir,'manual',asset[1]));
  for (const ext of ['html','pdf','docx']) {
    cli(['export','manual/manual.md','manual/out.' + ext]);
  }
  const browser = await chromium.launch({channel:process.env.BOOM_BROWSER_CHANNEL});
  try {
    const page = await browser.newPage();
    await page.setContent(read(join(dir,'manual/out.html')));
    const text = await page.locator('body').innerText();
    assert.ok(text.includes(label) && text.includes(note), 'HTML body');
    assert.equal(await page.locator('img').getAttribute('src'), 'data:image/png;base64,' + png.toString('base64'));
  } finally { await browser.close(); }

  const docx = await JSZip.loadAsync(readFileSync(join(dir,'manual/out.docx')));
  const xml = await docx.file('word/document.xml')!.async('string');
  assert.ok(xml.includes(label) && xml.includes(note), 'Word body');
  assert.match(xml, /<a:blip\b[^>]*r:embed=/);
  const [media] = docx.file(/^word\/media\/.*\.png$/);
  assert.ok(media);
  assert.deepEqual(await media.async('nodebuffer'), png);

  const loading = getDocument({data:new Uint8Array(readFileSync(join(dir,'manual/out.pdf')))});
  try {
    const pdf = await loading.promise;
    let text = '';
    let hasImage = false;
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number);
      for (const item of (await page.getTextContent()).items) if ('str' in item) text += item.str;
      hasImage ||= (await page.getOperatorList()).fnArray.includes(OPS.paintImageXObject);
    }
    assert.ok(text.includes(label) && text.includes(note), 'PDF body: ' + text);
    assert.ok(hasImage, 'PDF must draw the screenshot');
  } finally { await loading.destroy(); }

  const conflict = read(path).replace('1. ' + label,'1. Edited');
  writeFileSync(path,conflict);
  const previous = read(base);
  assert.throws(() => generate('Confirm'), /could not merge/);
  assert.equal(read(path),conflict);
  assert.equal(read(base),previous);
});

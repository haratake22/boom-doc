import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test('install the packed CLI, generate, update and export a consumer manual', t => {
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
      await page.setContent('<button>' + label + '</button>');
      await manualStep(label, () => page.getByRole('button', {name:label}).click());
      if (process.env.RUN_MODE === 'fail' || (process.env.RUN_MODE === 'retry' && info.retry === 0))
        throw Error('Simulated failed attempt');
    });`);
  const cli = (args: string[], label='Save', mode='normal') => execFileSync(process.execPath, [npmPath, 'exec', '--offline', '--', 'boom-doc', ...args],
    {cwd:dir, env:{...process.env, LABEL:label, RUN_MODE:mode}, stdio:'pipe'});
  const generate = (label = 'Save', mode = 'normal') => cli(['generate','playwright.config.ts','manual'],label,mode);
  const path = join(dir,'manual/manual.md');
  const read = (p: string) => readFileSync(p,'utf8');
  writeFileSync(join(dir,'order.json'), JSON.stringify(['Settings']));
  cli(['generate','playwright.config.ts','manual','order.json']);
  assert.match(read(path), /1\. Save/);
  const edited = read(path) + '\nUser note.\n';
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
  writeFileSync(join(dir,'playwright.config.ts'), "export default {retries:1,use:{channel:process.env.BOOM_BROWSER_CHANNEL}}");
  generate('Submit','retry');
  assert.equal(read(path).match(/1\. Submit/g)?.length,1);
  assert.match(read(path), /1\. Submit/);
  assert.match(read(path), /User note/);
  for (const ext of ['html','pdf','docx']) {
    cli(['export','manual/manual.md','manual/out.' + ext]);
    assert.ok(statSync(join(dir,'manual/out.' + ext)).size > 0);
  }
  const conflict = read(path).replace('1. Submit','1. Edited');
  writeFileSync(path,conflict);
  const previous = read(base);
  assert.throws(() => generate('Confirm'), /could not merge/);
  assert.equal(read(path),conflict);
  assert.equal(read(base),previous);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ManualReporter from '../reporter.ts';

function recordPath(t) {
  const dir = mkdtempSync(join(tmpdir(), 'boom-reporter-'));
  const previous = process.env.BOOM_RECORD;
  const path = join(dir, 'record.json');
  process.env.BOOM_RECORD = path;
  t.after(() => {
    if (previous === undefined) delete process.env.BOOM_RECORD;
    else process.env.BOOM_RECORD = previous;
    rmSync(dir, {recursive:true, force:true});
  });
  return path;
}

test('successful retry records only its manual attachments, in operation order', t => {
  const path = recordPath(t);
  const reporter = new ManualReporter();
  const chapter = {id:'settings', title:'Settings'};
  const png = path + '.png';
  writeFileSync(png, Buffer.from([2]));
  const result = {startTime:new Date(42), attachments:[
    {name:'boom-doc:Open', body:Buffer.from([1])},
    {name:'trace', path:'unused'},
    {name:'boom-doc:Save', path:png},
  ]};
  reporter.onTestEnd(chapter, {status:'failed', attachments:[{name:'boom-doc:discarded', path:'unused'}]});
  reporter.onTestEnd(chapter, {...result, status:'passed'});
  reporter.onTestEnd({id:'other',title:'Unannotated'}, {...result, status:'passed', attachments:[]});
  reporter.onEnd({status:'passed'});
  assert.deepEqual(JSON.parse(readFileSync(path)), [{title:'Settings', start:42, steps:[
    {title:'Open',image:'AQ=='}, {title:'Save',image:'Ag=='},
  ]}]);
});

for (const [status, overall] of [['failed','failed'], ['skipped','passed'], ['interrupted','interrupted']]) {
  test('preserve the previous record after a ' + status + ' test', t => {
    const path = recordPath(t);
    writeFileSync(path, 'previous record');
    const reporter = new ManualReporter();
    reporter.onTestEnd({id:'a',title:'Passed'}, {status:'passed',startTime:new Date(),attachments:[
      {name:'boom-doc:Done',body:Buffer.from([1])},
    ]});
    reporter.onTestEnd({id:'b'}, {status});
    reporter.onEnd({status:overall});
    assert.equal(readFileSync(path,'utf8'), 'previous record');
  });
}

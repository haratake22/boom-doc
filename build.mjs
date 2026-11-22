import { readFileSync, writeFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

for (const name of ['cli', 'fixture', 'reporter']) {
  writeFileSync(name + '.js', stripTypeScriptTypes(readFileSync(name + '.ts', 'utf8')));
}

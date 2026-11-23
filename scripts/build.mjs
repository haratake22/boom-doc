import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

mkdirSync('dist', {recursive: true});
for (const name of ['cli', 'fixture', 'reporter']) {
  writeFileSync('dist/' + name + '.js', stripTypeScriptTypes(readFileSync('src/' + name + '.ts', 'utf8')));
}

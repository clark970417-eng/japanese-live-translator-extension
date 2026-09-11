import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../x-content.js',import.meta.url),'utf8');
const body={};const locate=vm.runInNewContext(source.slice(source.indexOf('  function composerToolbar'),source.indexOf('  function addComposer'))+'\ncomposerToolbar',{document:{body}});
test('X reply control mounts outside clipped editor next to its own toolbar',()=>{
 const toolbar={};const outer={parentElement:body,querySelectorAll:()=>[{}],querySelector:()=>toolbar};
 const clipped={parentElement:outer,querySelectorAll:()=>[{}],querySelector:()=>null};
 assert.equal(locate({parentElement:clipped}),toolbar);
});
test('X composer does not steal a toolbar from another open reply editor',()=>{
 const unrelated={parentElement:body,querySelectorAll:()=>[{},{}],querySelector:()=>({})};
 assert.equal(locate({parentElement:unrelated}),null);
});

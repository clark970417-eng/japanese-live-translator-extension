import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';

test('native installer preserves another browser extension origin',async()=>{
 const home=await mkdtemp(join(tmpdir(),'jtl-install-'));
 const folder=join(home,'Library/Application Support/Google/Chrome/NativeMessagingHosts');
 await mkdir(folder,{recursive:true});
 const target=join(folder,'org.jtl.companion.json');
 const oldId='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',nextId='bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
 await writeFile(target,JSON.stringify({allowed_origins:[`chrome-extension://${oldId}/`]}));
 const result=spawnSync('python3',['desktop/install.py','--extension-id',nextId],{cwd:process.cwd(),env:{...process.env,HOME:home},encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
 const manifest=JSON.parse(await readFile(target,'utf8'));
 assert.deepEqual(manifest.allowed_origins,[`chrome-extension://${oldId}/`,`chrome-extension://${nextId}/`]);
});

test('relay imports without the optional OpenCC package',()=>{
 const code="import importlib.util; s=importlib.util.spec_from_file_location('relay','desktop/relay.py'); m=importlib.util.module_from_spec(s); s.loader.exec_module(m); assert m.OpenCC is None";
 const result=spawnSync('python3',['-I','-c',code],{cwd:process.cwd(),encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
});

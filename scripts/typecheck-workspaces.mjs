import fs from 'node:fs';import{spawnSync}from'node:child_process';import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');let failed=false;
for(const group of ['packages','apps'])for(const entry of fs.readdirSync(path.join(root,group),{withFileTypes:true})) {
 if(!entry.isDirectory())continue;const directory=path.join(root,group,entry.name);
 if(!fs.existsSync(path.join(directory,'tsconfig.json')))continue;
 const source=path.join(directory,'src');const files=fs.existsSync(source)?fs.readdirSync(source,{recursive:true}):[];
 if(!files.some(f=>/\.(ts|tsx)$/.test(String(f)))){console.log(`${group}/${entry.name}: sin fuentes TypeScript; pendiente de implementación (no se valida).`);continue;}
 console.log(`${group}/${entry.name}: typecheck`);
 const result=spawnSync(process.execPath,[path.join(root,'node_modules/typescript/bin/tsc'),'--noEmit'],{cwd:directory,stdio:'inherit'});
 if(result.error){console.error(result.error.message);failed=true;}else if(result.status!==0)failed=true;
}
process.exitCode=failed?1:0;

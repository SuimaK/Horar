import fs from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import standalone from 'ajv/dist/standalone/index.js';
import {build} from 'esbuild';
const schemas={validateCorrectionV201:'method_correction_v201.schema.json',validateCareerV19:'career_case_v19.schema.json',validateIntentV17:'question_intent_v17.schema.json',validateRelationshipV18:'relationship_case_v18.schema.json',validateReviewV16:'expert_path_review_v16.schema.json'};
const ajv=new Ajv2020({strict:false,allErrors:true,code:{source:true}});
for(const [name,file] of Object.entries(schemas))ajv.addSchema(JSON.parse(fs.readFileSync(new URL('../schemas/'+file,import.meta.url))),name);
const raw=new URL('./.semantic-validators.cjs',import.meta.url);
fs.writeFileSync(raw,standalone(ajv,Object.fromEntries(Object.keys(schemas).map(k=>[k,k]))));
try{await build({entryPoints:[raw.pathname],bundle:true,platform:'browser',format:'esm',minify:true,outfile:new URL('../src/generated/semantic-validators.mjs',import.meta.url).pathname});}finally{fs.unlinkSync(raw);}

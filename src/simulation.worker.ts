import { simulate } from './engine/hydraulics';
self.onmessage=e=>{try{self.postMessage({result:simulate(e.data)});}catch(err){self.postMessage({error:err instanceof Error?err.message:String(err)});}};

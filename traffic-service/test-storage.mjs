export function memoryStorage(records=new Map()){
 const storage={
  async get(key){return structuredClone(records.get(key));},
  async put(key,value){if(typeof key==='object'){for(const [k,v] of Object.entries(key))records.set(k,structuredClone(v));}else records.set(key,structuredClone(value));},
  async list({prefix='',startAfter='',limit=1000}={}){return new Map([...records].sort(([a],[b])=>a<b?-1:a>b?1:0).filter(([k])=>k.startsWith(prefix)&&k>startAfter).slice(0,limit).map(([k,v])=>[k,structuredClone(v)]));},
  async delete(keys){let n=0;for(const key of Array.isArray(keys)?keys:[keys])n+=records.delete(key)?1:0;return n;},
  async transaction(fn){const copy=new Map(structuredClone([...records]));const result=await fn(memoryStorage(copy));records.clear();for(const [k,v] of copy)records.set(k,v);return result;}
 };return storage;
}

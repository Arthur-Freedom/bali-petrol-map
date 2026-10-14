const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync('dist/owner-session.js','utf8');
test('OAuth handle is removed from URL immediately and only opaque handles are remembered',()=>{
 for(const value of ['remembered.'+'a'.repeat(43),'ghu_private-token']){
  let replaced='',saved=new Map();const context={URLSearchParams,location:{hash:'#owner-session='+value,pathname:'/bali-petrol-map/',search:''},history:{replaceState:(a,b,url)=>replaced=url},localStorage:{getItem:()=>null,setItem:(k,v)=>saved.set(k,v)},sessionStorage:{getItem:()=>null},window:{},addEventListener:()=>{}};
  vm.runInNewContext(source,context);assert.equal(replaced,'/bali-petrol-map/');assert.equal(context.window.PetrolOwner.get(),value.startsWith('remembered.')?value:'');assert.equal(saved.size,value.startsWith('remembered.')?1:0);
 }
});
test('session code precedes every external asset in the HTML',()=>{
 const html=fs.readFileSync('dist/index.html','utf8');assert.ok(html.indexOf('src="owner-session.js')<html.indexOf('href="https://'));assert.ok(html.indexOf('src="owner-session.js')<html.indexOf('src="https://'));
});

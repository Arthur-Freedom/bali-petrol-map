import Pbf from 'pbf';
// Synthetic road crossing the test station. Never stores provider observations.
export function fixtureTile(x,y,center=[115.2143216,-8.7918632]){
 const n=2**15,local=p=>[Math.round(((p[0]+180)/360*n-x)*4096),Math.round(((1-Math.asinh(Math.tan(p[1]*Math.PI/180))/Math.PI)/2*n-y)*4096)];
 const a=local([center[0]-.005,center[1]]),b=local([center[0]+.005,center[1]]),zz=v=>v<0?-v*2-1:v*2;
 const p=new Pbf();p.writeMessage(3,(_,layer)=>{
  layer.writeStringField(1,'Traffic flow');layer.writeVarintField(15,2);layer.writeVarintField(5,4096);
  for(const key of ['road_category','relative_speed'])layer.writeStringField(3,key);
  layer.writeMessage(4,(_,v)=>v.writeStringField(1,'primary'),null);
  layer.writeMessage(4,(_,v)=>v.writeDoubleField(3,.2),null);
  layer.writeMessage(2,(_,f)=>{f.writeVarintField(3,2);f.writePackedVarint(2,[0,0,1,1]);f.writePackedVarint(4,[9,zz(a[0]),zz(a[1]),10,zz(b[0]-a[0]),zz(b[1]-a[1])]);},null);
 },null);return p.finish();
}

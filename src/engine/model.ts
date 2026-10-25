import { z } from 'zod';
import { solarSchema } from './solar';
const num = (min: number, max: number) => z.number().finite().min(min).max(max);
export const pipeSchema = z.object({ id:z.string(), from:z.string(), to:z.string(), label:z.string(), diameter:num(1,500), length:num(0.001,10000), roughness:num(0,5), elbows:num(0,100), tees:num(0,100), valves:num(0,100), extraK:num(0,100000), material:z.string(), enabled:z.boolean() });
export const nodeSchema = z.object({id:z.string(), label:z.string(), kind:z.enum(['source','junction','tower']), elevation:num(-20,100), x:num(-10000,10000), y:num(-10000,10000)});
export const towerSchema = z.object({id:z.string(), x:num(0,100), y:num(0,100), height:num(0.1,20), diameter:num(50,1000), target:num(0.001,100)});
export const projectSchema = z.object({
 version:z.literal(1), name:z.string().max(100), room:z.object({length:num(1,100),width:num(1,100),spacing:num(0.1,10),aisle:num(0,10),columns:num(1,40).int(),requested:num(1,400).int()}),
 towers:z.array(towerSchema).min(1).max(400), obstacles:z.array(z.object({id:z.string(),x:num(0,100),y:num(0,100),width:num(.1,20),length:num(.1,20)})).max(100),
 defaults:z.object({height:num(.1,20),diameter:num(50,1000),target:num(.001,100),mainID:num(1,500),mainNominal:num(1,500),branchID:num(1,500),lateralID:num(1,500),mainLength:num(.1,1000),nozzleK:num(0,100000),manifolds:z.union([z.literal(1),z.literal(2)])}),
 pump:z.object({model:z.string().max(100),maxFlow:num(.1,10000),maxHead:num(.1,1000),ratedW:num(1,100000),suctionLift:num(0,20),hours:num(0,24),efficiency:num(0,1),count:z.union([z.literal(1),z.literal(2)]),arrangement:z.enum(['parallel','series']),curveMode:z.enum(['estimate','manual','missing']),curve:z.array(z.object({flow:num(0,10000),head:num(0,1000)})).max(100)}),
 mode:z.enum(['recirculating','once-through','sealed']), returnPipe:z.object({diameter:num(1,500),length:num(.1,1000),drop:num(.001,10),roughness:num(0,5),k:num(0,1000)}),
 limits:z.object({minVelocity:num(0,5),maxVelocity:num(.1,20),maxFriction:num(.1,100)}),
 nodes:z.array(nodeSchema).min(2).max(500),pipes:z.array(pipeSchema).min(1).max(1500),solar:solarSchema.optional()
});
export type Project = z.infer<typeof projectSchema>;
export type Pipe = z.infer<typeof pipeSchema>;
export type HNode = z.infer<typeof nodeSchema>;
export type Tower = z.infer<typeof towerSchema>;
export type CurvePoint = {flow:number;head:number};

export function makeLayout(p:Project):Tower[] {
 const {length,width,spacing,aisle,columns,requested}=p.room;
 const towers:Tower[]=[];
 const radius=p.defaults.diameter/2000;
 for(let row=0; row<400 && towers.length<requested; row++) {
  const y=.65+row*spacing;
  if(y+radius>width-.9) break;
  for(let col=0;col<columns && towers.length<requested;col++) {
   const x=.65+col*spacing+(col>=Math.ceil(columns/2)?aisle:0);
   if(x+radius>length-.3) continue;
   const t={id:`T${String(towers.length+1).padStart(3,'0')}`,x,y,height:p.defaults.height,diameter:p.defaults.diameter,target:p.defaults.target};
   if(canPlace(p,t,towers)) towers.push(t);
  }
 }
 return towers;
}
export function canPlace(p:Project,t:Tower,others=p.towers):boolean {
 const r=t.diameter/2000;
 return t.x>=r && t.y>=r && t.x+r<=p.room.length && t.y+r<=p.room.width &&
  equipmentRects(p).every(o=>!(t.x+r>o.x&&t.x-r<o.x+o.width&&t.y+r>o.y&&t.y-r<o.y+o.length)) &&
  others.every(o=>o.id===t.id || Math.hypot(o.x-t.x,o.y-t.y)>=(o.diameter+t.diameter)/2000+.02) &&
  p.obstacles.every(o=>!(t.x+r>o.x&&t.x-r<o.x+o.width&&t.y+r>o.y&&t.y-r<o.y+o.length));
}
export function equipmentRects(p:Project){return [{x:.48,y:p.room.width-.97,width:1.05,length:.67},{x:1.73,y:p.room.width-.82,width:.44,length:.44}];}
export function obstacleFits(p:Project,o:Project['obstacles'][number]){
 const overlaps=(v:{x:number;y:number;width:number;length:number})=>o.x<v.x+v.width&&o.x+o.width>v.x&&o.y<v.y+v.length&&o.y+o.length>v.y;
 return o.x>=0&&o.y>=0&&o.x+o.width<=p.room.length&&o.y+o.length<=p.room.width&&
  !equipmentRects(p).some(overlaps)&&!p.obstacles.some(v=>v.id!==o.id&&overlaps(v))&&
  p.towers.every(t=>{const r=t.diameter/2000;return !(t.x+r>o.x&&t.x-r<o.x+o.width&&t.y+r>o.y&&t.y-r<o.y+o.length);});
}
export function newPipe(id:string,from:string,to:string,label:string,diameter:number,length:number):Pipe {
 return {id,from,to,label,diameter,length,roughness:.0015,elbows:2,tees:1,valves:0,extraK:0,material:'PVC',enabled:true};
}
/** Lumped row manifolds. Each tower has its own physical-resistance lateral. */
export function buildNetwork(p:Project):Pick<Project,'nodes'|'pipes'> {
 const nodes:HNode[]=[{id:'pump',label:'Pump discharge',kind:'source',elevation:0,x:30,y:220}];
 const pipes:Pipe[]=[];
 for(let m=0;m<p.defaults.manifolds;m++){
  nodes.push({id:`M${m}`,label:`Manifold ${m+1}`,kind:'junction',elevation:0,x:240,y:100+m*400});
  pipes.push(newPipe(`main${m}`,'pump',`M${m}`,`Main ${m+1} · nominal ${p.defaults.mainNominal} mm`,p.defaults.mainID,p.defaults.mainLength));
 }
 const ys=[...new Set(p.towers.map(t=>Math.round(t.y*10)/10))].sort((a,b)=>a-b);
 ys.forEach((y,i)=>{
  const row=p.towers.filter(t=>Math.round(t.y*10)/10===y),m=i%p.defaults.manifolds;
  const rid=`R${i}`;
  nodes.push({id:rid,label:`Row ${i+1}`,kind:'junction',elevation:0,x:470,y:50+i*145});
  pipes.push(newPipe(`branch${i}`,`M${m}`,rid,`Branch ${i+1}`,p.defaults.branchID,.5+Math.abs(p.room.width-.6-y)));
  row.forEach((t,j)=>{
   nodes.push({id:t.id,label:t.id,kind:'tower',elevation:p.mode==='sealed'?0:t.height,x:740+(j%5)*140,y:30+i*145+Math.floor(j/5)*60});
   const pipe=newPipe(`inlet-${t.id}`,rid,t.id,`Lateral ${t.id}`,p.defaults.lateralID,t.height+t.x);
   pipe.extraK=p.defaults.nozzleK;
   pipes.push(pipe);
  });
 });
 return {nodes,pipes};
}
export function createExample():Project {
 const p:Project={version:1,name:'100-tower pilot farm',room:{length:10,width:10,spacing:.8,aisle:1,columns:10,requested:100},towers:[],obstacles:[],defaults:{height:3,diameter:200,target:.5,mainID:27.2,mainNominal:32,branchID:20,lateralID:6,mainLength:3,nozzleK:10,manifolds:1},pump:{model:'INGCO CPM7508',maxFlow:110,maxHead:30,ratedW:750,suctionLift:0,hours:16,efficiency:0,count:1,arrangement:'parallel',curveMode:'estimate',curve:[]},mode:'recirculating',returnPipe:{diameter:63,length:12,drop:.3,roughness:.0015,k:3},limits:{minVelocity:.1,maxVelocity:2,maxFriction:5},nodes:[],pipes:[]};
 p.towers=makeLayout(p); Object.assign(p,buildNetwork(p)); return p;
}
export function parseProject(raw:unknown):Project {
 const p=projectSchema.parse(raw);
 const ids=new Set(p.nodes.map(n=>n.id));
 if(p.nodes.some(n=>n.id.startsWith('_'))||p.pipes.some(e=>e.id.startsWith('_')||e.id==='return')) throw Error('IDs beginning with underscore and pipe ID return are reserved for the return model.');
 if(ids.size!==p.nodes.length||new Set(p.pipes.map(e=>e.id)).size!==p.pipes.length||new Set(p.towers.map(t=>t.id)).size!==p.towers.length) throw Error('Component IDs must be unique.');
 if(p.nodes.filter(n=>n.kind==='source').length!==1) throw Error('Use exactly one pump discharge source.');
 if(p.pipes.some(e=>!ids.has(e.from)||!ids.has(e.to)||e.from===e.to)) throw Error('A pipe has an invalid connection.');
 if(p.pipes.some(e=>p.nodes.find(n=>n.id===e.from)?.kind==='tower'||p.nodes.find(n=>n.id===e.to)?.kind==='source')) throw Error('Supply pipes must run from the pump or junctions toward junctions or tower outlets. Configure the return separately.');
 if(p.obstacles.some(o=>!obstacleFits(p,o))) throw Error('An obstacle overlaps equipment, a tower, another obstacle, or the room boundary.');
 if(p.towers.some(t=>!canPlace(p,t))) throw Error('Towers overlap a tower, an obstacle, or the room boundary.');
 if(p.nodes.filter(n=>n.kind==='tower').length!==p.towers.length||p.towers.some(t=>!p.nodes.some(n=>n.id===t.id&&n.kind==='tower'))) throw Error('Every physical tower must have exactly one hydraulic outlet. Rebuild network.');
 if(p.limits.minVelocity>=p.limits.maxVelocity) throw Error('Minimum velocity must be lower than maximum velocity.');
 return p;
}

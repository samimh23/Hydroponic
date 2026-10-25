import { parseProject, type Project, type Pipe, type CurvePoint } from './model';
export const G=9.80665, RHO=998.2, NU=1.004e-6;
export const lpmToSI=(q:number)=>q/60000;
export const siToLpm=(q:number)=>q*60000;
export const headToKpa=(h:number)=>RHO*G*h/1000;
export const kpaToHead=(p:number)=>p*1000/(RHO*G);
export const staticHead=(outlet:number,reservoir:number,sealed=false)=>sealed?0:Math.max(0,outlet-reservoir);
export function frictionFactor(re:number,relativeRoughness:number):number {
 if(re<=0) return 0;
 if(re<=2000) return 64/re;
 const turbulent=(r:number)=>.25/Math.log10(relativeRoughness/3.7+5.74/r**.9)**2;
 if(re>=4000) return turbulent(re);
 return 64/2000+(turbulent(4000)-64/2000)*(re-2000)/2000;
}
export function pipeLoss(pipe:Pipe,flow:number) {
 if(!Number.isFinite(flow)||pipe.diameter<=0||pipe.length<=0) throw Error('Pipe diameter and length must be positive; flow must be finite.');
 const d=pipe.diameter/1000, area=Math.PI*d*d/4,velocity=Math.abs(flow)/area,re=velocity*d/NU;
 const f=frictionFactor(re,pipe.roughness/1000/d);
 const k=pipe.extraK+pipe.elbows*.9+pipe.tees*.6+pipe.valves*.2;
 const friction=f*pipe.length/d*velocity*velocity/(2*G),minor=k*velocity*velocity/(2*G);
 return {velocity,re,f,friction,minor,head:friction+minor,pressure:headToKpa(friction+minor)};
}
function invert(pipe:Pipe,h:number) {
 if(Math.abs(h)<1e-12) return 0;
 let lo=0,hi=.001;
 for(let i=0;pipeLoss(pipe,hi).head<Math.abs(h)&&i<30;i++) hi*=2;
 for(let i=0;i<32;i++){const mid=(lo+hi)/2;if(pipeLoss(pipe,mid).head>Math.abs(h))hi=mid;else lo=mid;}
 return Math.sign(h)*(lo+hi)/2;
}
function linearSolve(a:number[][],b:number[]):number[] {
 const n=b.length, m=a.map((row,i)=>[...row,b[i]]);
 for(let k=0;k<n;k++){
  let best=k; for(let i=k+1;i<n;i++) if(Math.abs(m[i][k])>Math.abs(m[best][k]))best=i;
  [m[k],m[best]]=[m[best],m[k]];
  if(Math.abs(m[k][k])<1e-16)throw Error('Singular network: check disconnected junctions and closed pipes.');
  for(let i=k+1;i<n;i++){const r=m[i][k]/m[k][k];for(let j=k;j<=n;j++)m[i][j]-=r*m[k][j];}
 }
 const x=Array(n).fill(0);for(let i=n-1;i>=0;i--){let s=m[i][n];for(let j=i+1;j<n;j++)s-=m[i][j]*x[j];x[i]=s/m[i][i];}return x;
}
export type NetworkSolution={heads:Record<string,number>;flows:Record<string,number>;total:number;residual:number;iterations:number};
export function gaugePressure(p:Project,s:NetworkSolution,id:string){
 const elevation=p.towers.find(t=>t.id===id)?.height??p.nodes.find(n=>n.id===id)?.elevation??0;
 return headToKpa(s.heads[id]-elevation-(p.mode==='sealed'?0:p.pump.suctionLift));
}
function physicalNetwork(p:Project){
 if(p.mode!=='sealed')return {networkNodes:p.nodes,networkPipes:p.pipes};
 return {
  networkNodes:[...p.nodes.map(n=>n.kind==='tower'?{...n,kind:'junction' as const}:n),{id:'_return',label:'Return collector',kind:'junction' as const,elevation:0,x:0,y:0},{id:'_sink',label:'Reservoir',kind:'tower' as const,elevation:0,x:0,y:0}],
  networkPipes:[...p.pipes,...p.towers.map(t=>({...newPipeForReturn(p),id:`_down-${t.id}`,from:t.id,to:'_return',diameter:t.diameter,length:t.height,extraK:1})),{...newPipeForReturn(p),from:'_return',to:'_sink'}]
 };
}
export function checkConnectivity(p:Project){
 const source=p.nodes.find(n=>n.kind==='source');if(!source)throw Error('Pump discharge source is missing.');
 const visited=new Set([source.id]);let changed=true;
 while(changed){changed=false;for(const e of p.pipes.filter(e=>e.enabled)){if(visited.has(e.from)&&!visited.has(e.to)){visited.add(e.to);changed=true;}if(visited.has(e.to)&&!visited.has(e.from)){visited.add(e.from);changed=true;}}}
 const disconnected=p.nodes.filter(n=>!visited.has(n.id));if(disconnected.length)throw Error(`Disconnected network: ${disconnected.slice(0,4).map(n=>n.label).join(', ')}. Connect them or rebuild the network.`);
 if(!p.nodes.some(n=>n.kind==='tower'))throw Error('At least one atmospheric tower outlet is required.');
}
/** Damped nodal Newton solver. Unknown total heads enforce continuity at every junction. */
export function solveNetwork(p:Project,sourceHead:number,maxIterations=70):NetworkSolution {
 const {networkNodes,networkPipes}=physicalNetwork(p);
 const pipes=networkPipes.filter(e=>e.enabled),unknown=networkNodes.filter(n=>n.kind==='junction'),index=new Map(unknown.map((n,i)=>[n.id,i]));
 const source=p.nodes.find(n=>n.kind==='source')!;
 const fixed:Record<string,number>={};networkNodes.forEach(n=>{if(n.kind!=='junction')fixed[n.id]=n.kind==='source'?sourceHead:n.elevation+(p.mode==='sealed'?0:p.pump.suctionLift);});
 const minSink=Math.min(...networkNodes.filter(n=>n.kind==='tower').map(n=>fixed[n.id]));
 // Below all atmospheric outlets the dry network has an exact zero-flow solution.
 // Solving that flat, one-sided outlet condition with Newton is unnecessary and ill-conditioned.
 if(sourceHead<=minSink){const heads={...fixed};unknown.forEach(n=>heads[n.id]=sourceHead);return {heads,flows:Object.fromEntries(pipes.map(e=>[e.id,0])),total:0,residual:0,iterations:0};}
 let x=unknown.map(()=>minSink+.65*(sourceHead-minSink));
 const evaluate=(values:number[],jacobian=false)=>{
  const heads={...fixed};unknown.forEach((n,i)=>heads[n.id]=values[i]);
  const residual=Array(unknown.length).fill(0),a=unknown.map(()=>Array(unknown.length).fill(0)),flows:Record<string,number>={};
  for(const pipe of pipes){
   const h=heads[pipe.from]-heads[pipe.to];
   // Atmospheric tower outlets do not supply reverse water into the network.
   const isOutlet=networkNodes.find(n=>n.id===pipe.to)?.kind==='tower';
   const q=isOutlet&&h<=0?0:invert(pipe,h);flows[pipe.id]=q;
   const i=index.get(pipe.from),j=index.get(pipe.to);
   if(i!==undefined)residual[i]+=q;if(j!==undefined)residual[j]-=q;
   if(jacobian){
    const dq=Math.max(Math.abs(q)*.001,1e-9),abs=Math.abs(q);
    const derivative=(pipeLoss(pipe,abs+dq).head-pipeLoss(pipe,Math.max(0,abs-dq)).head)/(abs<dq?dq+abs:2*dq);
    const conductance=isOutlet&&h<0?1e-12:1/Math.max(derivative,1e-6);
    if(i!==undefined)a[i][i]+=conductance;if(j!==undefined)a[j][j]+=conductance;
    if(i!==undefined&&j!==undefined){a[i][j]-=conductance;a[j][i]-=conductance;}
   }
  }
  return {heads,flows,residual,a,norm:Math.max(0,...residual.map(Math.abs))};
 };
 for(let it=0;it<maxIterations;it++){
  const s=evaluate(x,true);
  if(s.norm<2e-10){
   let total=0;for(const e of pipes){if(e.from===source.id)total+=s.flows[e.id];if(e.to===source.id)total-=s.flows[e.id];}
   return {heads:s.heads,flows:s.flows,total,residual:s.norm,iterations:it};
  }
  const dx=linearSolve(s.a,s.residual.map(v=>-v));
  let step=1, candidate=x.map((v,i)=>v+dx[i]);
  for(let ls=0;ls<18 && evaluate(candidate).norm>s.norm;ls++){step*=.5;candidate=x.map((v,i)=>v+step*dx[i]);}
  x=candidate;
 }
 throw Error(`Network did not converge after ${maxIterations} iterations. Check connections, outlet elevations, and extreme pipe restrictions.`);
}
export function pumpCurve(p:Project):CurvePoint[]{
 if(p.pump.curveMode==='missing')throw Error('Operating point unknown: no pump performance curve. Enter a table or explicitly choose the illustrative estimate.');
 const c=p.pump.curveMode==='manual'?[...p.pump.curve].sort((a,b)=>a.flow-b.flow):Array.from({length:31},(_,i)=>({flow:p.pump.maxFlow*i/30,head:p.pump.maxHead*(1-(i/30)**2)}));
 if(c.length<2||c.some((v,i)=>i>0&&(v.flow<=c[i-1].flow||v.head>=c[i-1].head)))throw Error('Pump table needs at least two points with strictly increasing flow and decreasing head.');
 return c.map(v=>({flow:v.flow*(p.pump.count===2&&p.pump.arrangement==='parallel'?2:1),head:v.head*(p.pump.count===2&&p.pump.arrangement==='series'?2:1)}));
}
export function curveHead(curve:CurvePoint[],q:number):number|null {
 if(q<curve[0].flow-1e-8||q>curve.at(-1)!.flow+1e-8)return null;
 if(q<=curve[0].flow)return curve[0].head;
 for(let i=1;i<curve.length;i++)if(q<=curve[i].flow){const a=curve[i-1],b=curve[i];return a.head+(b.head-a.head)*(q-a.flow)/(b.flow-a.flow);}
 return curve.at(-1)!.head;
}
export type Simulation={flow:number;head:number;pressure:number;static:number;frictionHead:number;minorHead:number;energyResidual:number;hydraulicW:number;electricalW:number|null;kwhDay:number|null;ratedKwhDay:number;demand:number;coverage:number;minFlow:number;maxFlow:number;imbalance:number;nearestFlow:number;farthestFlow:number;returned:number;returnCapacity:number;solution:NetworkSolution;pipeResults:(ReturnType<typeof pipeLoss>&{id:string;label:string;flow:number;from:string;to:string})[];towerResults:{id:string;flow:number;target:number;pressure:number;head:number}[];chart:{flow:number;system:number|null;pump:number|null}[];warnings:string[];curve:CurvePoint[]};
export function simulate(input:Project,withChart=true):Simulation {
 const p=parseProject(input);checkConnectivity(p);const curve=pumpCurve(p);
 const maxH=curve[0].head,minH=curve.at(-1)!.head;
 const low=solveNetwork(p,minH),high=solveNetwork(p,maxH);
 if(siToLpm(low.total)>curve.at(-1)!.flow+1e-4 || siToLpm(high.total)<curve[0].flow-1e-4)throw Error('No operating point inside the supplied pump curve. Add measured curve points covering this system; no extrapolation was made.');
 let lo=minH,hi=maxH,head=(lo+hi)/2,solution=low;
 for(let i=0;i<30;i++){
  head=(lo+hi)/2;solution=solveNetwork(p,head);const q=siToLpm(solution.total);
  const hp=curveHead(curve,q);
  if(hp===null){if(q>curve.at(-1)!.flow)hi=head;else lo=head;continue;}
  if(hp>head)lo=head;else hi=head;
 }
 const flow=siToLpm(solution.total);
 if(flow<1e-5)throw Error('Pump cannot overcome the outlet elevation: no forward flow. Reduce static lift or select a pump with adequate shutoff head.');
 const pipeResults=physicalNetwork(p).networkPipes.filter(e=>e.enabled).map(e=>({...pipeLoss(e,solution.flows[e.id]),id:e.id,label:e.label,flow:siToLpm(solution.flows[e.id]),from:e.from,to:e.to}));
 const towerResults=p.towers.map(t=>{
  const inlet=p.pipes.filter(e=>e.enabled&&e.to===t.id),q=inlet.reduce((s,e)=>s+siToLpm(solution.flows[e.id]),0);
  // Terminal is atmospheric. Pressure before the aggregate lateral is shown separately in pipe results.
  return {id:t.id,flow:q,target:t.target,pressure:p.mode==='sealed'?headToKpa(solution.heads[t.id]-t.height):0,head:solution.heads[t.id]};
 });
 const demand=p.towers.reduce((s,t)=>s+t.target,0),coverage=towerResults.filter(t=>t.flow>=t.target).length/p.towers.length*100;
 const minFlow=Math.min(...towerResults.map(t=>t.flow)),maxFlow=Math.max(...towerResults.map(t=>t.flow));
 const staticContribution=p.mode==='sealed'?0:p.towers.reduce((s,t)=>s+(towerResults.find(v=>v.id===t.id)!.flow/flow)*(t.height+p.pump.suctionLift),0);
 const frictionHead=pipeResults.reduce((s,e)=>s+Math.abs(e.flow)/flow*e.friction,0),minorHead=pipeResults.reduce((s,e)=>s+Math.abs(e.flow)/flow*e.minor,0);
 const energyResidual=head-staticContribution-frictionHead-minorHead;
 const sorted=[...p.towers].sort((a,b)=>Math.hypot(a.x-1.95,a.y-(p.room.width-.6))-Math.hypot(b.x-1.95,b.y-(p.room.width-.6))),nearestFlow=towerResults.find(t=>t.id===sorted[0].id)!.flow,farthestFlow=towerResults.find(t=>t.id===sorted.at(-1)!.id)!.flow;
 const rp=newPipeForReturn(p);const returnCapacity=siToLpm(invert(rp,p.returnPipe.drop));
 const returned=p.mode==='once-through'?0:p.mode==='sealed'?flow:Math.min(flow,returnCapacity);
 const hydraulicW=RHO*G*solution.total*head,electricalW=p.pump.efficiency>0?hydraulicW/p.pump.efficiency:null;
 const warnings:string[]=[];
 if(p.pump.curveMode==='estimate')warnings.push('Manufacturer curve missing. Operating point is an illustrative estimate from H = Hmax × (1 − (Q/Qmax)²), not a validated INGCO performance curve.');
 else warnings.push('Pump table is user-entered; its manufacturer provenance has not been verified.');
 if(coverage<100)warnings.push(`${p.towers.length-Math.round(coverage/100*p.towers.length)} towers are below their individual flow target.`);
 if(demand>flow)warnings.push('Required flow exceeds the predicted supply at the operating point.');
 if(demand>curve.at(-1)!.flow)warnings.push('Required flow exceeds the maximum flow covered by the combined pump curve.');
 if(Math.max(...p.towers.map(t=>t.height))>maxH&&p.mode!=='sealed')warnings.push('Tower static lift exceeds pump shutoff head.');
 const vbad=pipeResults.filter(e=>e.velocity<p.limits.minVelocity||e.velocity>p.limits.maxVelocity);
 if(vbad.length)warnings.push(`${vbad.length} pipe segments have velocity outside ${p.limits.minVelocity}–${p.limits.maxVelocity} m/s.`);
 if(pipeResults.some(e=>e.friction>p.limits.maxFriction))warnings.push(`Friction exceeds ${p.limits.maxFriction} m in a segment; the selected network may be undersized.`);
 if(p.mode==='recirculating'&&returnCapacity<flow)warnings.push('Gravity return capacity estimate is below supply. Reservoir return may back up; a steady recirculation balance is not established.');
 if(p.mode==='sealed')warnings.push('Sealed-loop experiment: elevation is recovered; this is not the normal atmospheric falling-film tower arrangement. Check pressure and cavitation at the high point.');
 if(p.pump.suctionLift>8)warnings.push('Suction lift exceeds the user-supplied 8 m limit.');
 if(p.pump.suctionLift>0)warnings.push('Suction lift adds to static head. Suction-pipe losses and NPSH are not modeled; add upstream losses to the main pipe and verify with the pump supplier.');
 if(electricalW!==null&&electricalW>p.pump.ratedW*p.pump.count)warnings.push('Efficiency-based electrical estimate exceeds combined rated input power. Verify pump and efficiency data.');
 warnings.push('Unverified: lumped row manifolds, nozzle K, pipe dimensions, fitting coefficients, 20 °C water, and full-bore gravity return estimate. Validate with field measurements.');
 const chart:Simulation['chart']=[];
 const chartStart=p.mode==='sealed'?minH:Math.max(minH,Math.min(...p.towers.map(t=>t.height+p.pump.suctionLift)));
 if(withChart)for(let i=0;i<=24;i++){
  const h=chartStart+(maxH-chartStart)*i/24,s=solveNetwork(p,h),q=siToLpm(s.total);
  chart.push({flow:q,system:h,pump:null});
 }
 if(withChart)curve.forEach(v=>chart.push({flow:v.flow,system:null,pump:v.head}));
 chart.sort((a,b)=>a.flow-b.flow);
 return {flow,head,pressure:headToKpa(head),static:staticContribution,frictionHead,minorHead,energyResidual,hydraulicW,electricalW,kwhDay:electricalW===null?null:electricalW/1000*p.pump.hours,ratedKwhDay:p.pump.ratedW*p.pump.count/1000*p.pump.hours,demand,coverage,minFlow,maxFlow,imbalance:(maxFlow-minFlow)/(flow/p.towers.length)*100,nearestFlow,farthestFlow,returned,returnCapacity,solution,pipeResults,towerResults,chart,warnings,curve};
}
function newPipeForReturn(p:Project):Pipe {return {id:'return',from:'outlets',to:'reservoir',label:'Gravity return',diameter:p.returnPipe.diameter,length:p.returnPipe.length,roughness:p.returnPipe.roughness,elbows:0,tees:0,valves:0,extraK:p.returnPipe.k,material:'PVC',enabled:true};}

import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { InstancedMesh, Object3D, Quaternion, Vector3 } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Pause, Play, Focus, Expand, Droplets, Maximize2, Minimize2, Sun, Settings2 } from 'lucide-react';
import type { Project } from './engine/model';
import type { Simulation } from './engine/hydraulics';
import { fmt } from './components';
import { defaultSolar,solarPosition,towerShadow,clockTime,type SolarSettings } from './engine/solar';
import SolarPanel from './SolarPanel';
import { SunLighting,GreenhouseFrame,NorthMarker,ShadowTrace } from './SunScene';

type Point = [number,number,number];
type FlowRoute = { points:Point[]; particles:number; speed:number };
const SUPPLY='#208fae', WATER='#39c6f4', RETURN='#ba8a42';

function Pipe({from,to,radius=.025,color=SUPPLY}:{from:Point;to:Point;radius?:number;color?:string}){
 const geometry=useMemo(()=>{
  const a=new Vector3(...from),b=new Vector3(...to),direction=b.clone().sub(a);
  return {length:direction.length(),position:a.add(b).multiplyScalar(.5),rotation:new Quaternion().setFromUnitVectors(new Vector3(0,1,0),direction.normalize())};
 },[...from,...to]);
 if(geometry.length<.00001)return null;
 return <mesh position={geometry.position} quaternion={geometry.rotation}><cylinderGeometry args={[radius,radius,geometry.length,8]}/><meshStandardMaterial color={color} roughness={.45}/></mesh>;
}

/** Moving markers show direction only; speed is intentionally illustrative, not particle tracking. */
function FlowParticles({routes,color,playing}:{routes:FlowRoute[];color:string;playing:boolean}){
 const mesh=useRef<InstancedMesh>(null),phase=useRef(0);
 const prepared=useMemo(()=>routes.map(route=>{
  const points=route.points.map(p=>new Vector3(...p)),lengths=points.slice(1).map((p,i)=>p.distanceTo(points[i]));
  return {...route,points,lengths,total:lengths.reduce((a,b)=>a+b,0)};
 }),[routes]);
 const scratch=useMemo(()=>new Object3D(),[]),count=routes.reduce((n,r)=>n+r.particles,0);
 useFrame((_,delta)=>{
  if(!mesh.current)return;if(playing)phase.current+=delta;
  let index=0;
  for(const route of prepared)for(let i=0;i<route.particles;i++){
   let distance=(phase.current*route.speed+i*route.total/route.particles)%Math.max(route.total,.0001),segment=0;
   while(segment<route.lengths.length-1&&distance>route.lengths[segment]){distance-=route.lengths[segment];segment++;}
   scratch.position.copy(route.points[segment]).lerp(route.points[segment+1],Math.min(1,distance/Math.max(route.lengths[segment],.0001)));
   scratch.scale.setScalar(.045);scratch.updateMatrix();mesh.current.setMatrixAt(index++,scratch.matrix);
  }
  mesh.current.instanceMatrix.needsUpdate=true;
 });
 if(!count)return null;
 return <instancedMesh ref={mesh} args={[undefined,undefined,count]} frustumCulled={false}><sphereGeometry args={[1,7,5]}/><meshBasicMaterial color={color}/></instancedMesh>;
}

function CameraControls({p,selected,focus,reset}:{p:Project;selected:string;focus:'farm'|'tower';reset:number}){
 const {camera,gl}=useThree(),controls=useRef<OrbitControls|null>(null);
 useEffect(()=>{const c=new OrbitControls(camera,gl.domElement);c.maxPolarAngle=Math.PI/2-.025;c.minDistance=.8;c.maxDistance=200;c.enableDamping=true;controls.current=c;return()=>{c.dispose();controls.current=null;};},[camera,gl]);
 useEffect(()=>{
  const tower=p.towers.find(t=>t.id===selected),c=controls.current;if(!c)return;
  if(focus==='tower'&&tower){c.target.set(tower.x,tower.height*.58,tower.y);camera.position.set(tower.x+3.1,tower.height+1.5,tower.y+3.4);}
  else{const size=Math.max(p.room.length,p.room.width),h=Math.max(...p.towers.map(t=>t.height));c.target.set(p.room.length/2,h*.45,p.room.width/2);camera.position.set(p.room.length*.5+size*.9,h+size*.8,p.room.width*.5+size*1.05);}
  c.update();
 },[camera,p.room.length,p.room.width,selected,focus,reset]);
 useFrame(()=>controls.current?.update());
 return null;
}

export default function Farm3D({p,onSolarChange,result,selected,onSelect}:{p:Project;onSolarChange:(s:SolarSettings)=>void;result:Simulation|null;selected:string;onSelect:(s:string)=>void}){
 const [playing,setPlaying]=useState(true),[cutaway,setCutaway]=useState(true),[focus,setFocus]=useState<'farm'|'tower'>('farm');
 const [expanded,setExpanded]=useState(false),[cameraReset,setCameraReset]=useState(0);
 const [shadowMode,setShadowMode]=useState(false),[sunSettingsOpen,setSunSettingsOpen]=useState(true),[dayPlaying,setDayPlaying]=useState(false);
 const solar=p.solar??defaultSolar(),showInterior=cutaway&&!shadowMode;
 const solarRef=useRef(solar),solarChangeRef=useRef(onSolarChange);solarRef.current=solar;solarChangeRef.current=onSolarChange;
 useEffect(()=>{if(!dayPlaying||!shadowMode)return;const id=setInterval(()=>{const s=solarRef.current;solarChangeRef.current({...s,minute:(s.minute+5)%1440});},200);return()=>clearInterval(id);},[dayPlaying,shadowMode]);
 useEffect(()=>{const exit=(e:KeyboardEvent)=>{if(e.key==='Escape')setExpanded(false);};window.addEventListener('keydown',exit);return()=>window.removeEventListener('keydown',exit);},[]);
 const selectedTower=p.towers.find(t=>t.id===selected),flow=result?.towerResults.find(t=>t.id===selected)?.flow;
 const sun=solarPosition(solar),shadow=towerShadow(selectedTower?.height??p.defaults.height,sun);
 const headerHeight=Math.max(...p.towers.map(t=>t.height))+.35,back=p.room.width-.6;
 const rows=useMemo(()=>[...new Set(p.towers.map(t=>Math.round(t.y*100)/100))].map(y=>({y,towers:p.towers.filter(t=>Math.round(t.y*100)/100===y)})),[p.towers]);
 const inletOpen=(id:string)=>(result?.towerResults.find(t=>t.id===id)?.flow??0)>0;
 const supplyRoutes:FlowRoute[]=useMemo(()=>{
  if(!result)return [];
  return [
   {points:[[1,.4,back],[1.95,.4,back],[.25,.4,back],[.25,headerHeight,back],[.25,headerHeight,rows[0]?.y??.4]],particles:12,speed:1},
   ...rows.map(row=>({points:[[.25,headerHeight,row.y],[Math.max(...row.towers.map(t=>t.x)),headerHeight,row.y]] as Point[],particles:6,speed:.85})),
   ...p.towers.filter(t=>inletOpen(t.id)).map(t=>({points:[[t.x,headerHeight,t.y],[t.x,t.height,t.y],[t.x,.13,t.y]] as Point[],particles:5,speed:.55}))
  ];
 },[p.towers,result,headerHeight,back,rows]);
 const returnRoutes:FlowRoute[]=useMemo(()=>{
  if(!result||p.mode==='once-through'||result.returned<=0)return [];
  return [...rows.map(row=>({points:[[Math.max(...row.towers.map(t=>t.x)),.12,row.y],[.35,.12,row.y]] as Point[],particles:5,speed:.65})),{points:[[.35,.12,rows[0]?.y??.4],[.35,.12,back],[1,.4,back]] as Point[],particles:8,speed:.8}];
 },[rows,back,result,p.mode]);
 return <div className={`farm3d ${expanded?'farm3d-expanded':''}`} role={expanded?'dialog':undefined} aria-modal={expanded||undefined} aria-label="3D top-fed hydroponic farm with animated downward water flow"><div className="farm3d-controls"><button className="btn btn-sm" onClick={()=>setPlaying(!playing)}>{playing?<Pause size={13}/>:<Play size={13}/>} {playing?'Pause water':'Animate water'}</button><label className="farm3d-cutaway"><input type="checkbox" className="checkbox checkbox-sm" checked={showInterior} disabled={shadowMode} onChange={e=>setCutaway(e.target.checked)}/>See inside towers</label><button className="btn btn-sm" disabled={!selectedTower} onClick={()=>{setFocus('tower');setCameraReset(n=>n+1);}}><Focus size={13}/>Focus tower</button><button className="btn btn-sm" onClick={()=>{setFocus('farm');setCameraReset(n=>n+1);}}><Expand size={13}/>Whole farm</button><button className="btn btn-sm" onClick={()=>{setShadowMode(!shadowMode);setDayPlaying(false);if(!shadowMode){if(!p.solar)onSolarChange(solar);setExpanded(true);setFocus('farm');setCameraReset(n=>n+1);}}}><Sun size={13}/>{shadowMode?'Water view':'Sun & shadows'}</button><button className="btn btn-sm" onClick={()=>setExpanded(!expanded)}>{expanded?<Minimize2 size={13}/>:<Maximize2 size={13}/>} {expanded?'Exit large view':'Expand 3D'}</button></div>
 <Canvas shadows={shadowMode} camera={{position:[15,12,16],fov:43}}><color attach="background" args={['#edf3ef']}/><>{shadowMode?<><SunLighting p={p} s={solar}/><GreenhouseFrame p={p} s={solar}/><NorthMarker p={p} s={solar}/><ShadowTrace p={p} s={solar} selected={selected}/></>:<><ambientLight intensity={1.8}/><directionalLight position={[8,15,4]} intensity={2}/></>}</><CameraControls p={p} selected={selected} focus={focus} reset={cameraReset}/><gridHelper args={[Math.max(p.room.length,p.room.width),Math.max(p.room.length,p.room.width),'#9fb8a7','#d0ded3']} position={[p.room.length/2,.005,p.room.width/2]}/><mesh receiveShadow={shadowMode} rotation={[-Math.PI/2,0,0]} position={[p.room.length/2,-.025,p.room.width/2]}><planeGeometry args={[p.room.length,p.room.width]}/><meshStandardMaterial color="#e8eee6"/></mesh>
 <Pipe from={[1,.4,back]} to={[1.95,.4,back]} radius={.045}/><Pipe from={[1.95,.4,back]} to={[.25,.4,back]} radius={.04}/><Pipe from={[.25,.4,back]} to={[.25,headerHeight,back]} radius={.04}/><Pipe from={[.25,headerHeight,back]} to={[.25,headerHeight,Math.min(...p.towers.map(t=>t.y))]} radius={.04}/>
 {rows.map(row=><group key={row.y}><Pipe from={[.25,headerHeight,row.y]} to={[Math.max(...row.towers.map(t=>t.x)),headerHeight,row.y]} radius={.027}/><Pipe from={[.35,.12,row.y]} to={[Math.max(...row.towers.map(t=>t.x)),.12,row.y]} radius={.03} color={RETURN}/></group>)}
 <Pipe from={[.35,.12,Math.min(...p.towers.map(t=>t.y))]} to={[.35,.12,back]} radius={.04} color={RETURN}/><Pipe from={[.35,.12,back]} to={[1,.4,back]} radius={.04} color={RETURN}/>
 {p.towers.map(t=><group key={t.id} position={[t.x,0,t.y]} onClick={e=>{e.stopPropagation();onSelect(t.id);}}>
  <mesh castShadow={shadowMode} receiveShadow={shadowMode} position={[0,t.height/2,0]}><cylinderGeometry args={[t.diameter/2000,t.diameter/2000,t.height,12,1,true]}/><meshStandardMaterial color={selected===t.id?'#d4c079':'#f4f3df'} transparent={showInterior} opacity={showInterior?.32:1} depthWrite={!showInterior}/></mesh>
  <mesh castShadow={shadowMode} receiveShadow={shadowMode} position={[0,.06,0]}><cylinderGeometry args={[t.diameter/1700,t.diameter/1700,.1,16]}/><meshStandardMaterial color={selected===t.id?'#ca9d3f':'#8b9b85'}/></mesh>
  <Pipe from={[0,headerHeight,0]} to={[0,t.height+.02,0]} radius={.018}/>
  <mesh position={[0,t.height+.025,0]}><cylinderGeometry args={[.065,.03,.06,12]}/><meshStandardMaterial color={SUPPLY}/></mesh>
  {showInterior&&inletOpen(t.id)&&<mesh castShadow={shadowMode} receiveShadow={shadowMode} position={[0,t.height/2,0]}><cylinderGeometry args={[.015,.025,Math.max(.01,t.height-.12),7]}/><meshBasicMaterial color={WATER} transparent opacity={.35}/></mesh>}

  {Array.from({length:5},(_,i)=><mesh castShadow={shadowMode} receiveShadow={shadowMode} key={i} position={shadowMode?[(t.diameter/2000+Math.max(0,(solar.canopyDiameter-t.diameter/1000)*.1))*Math.cos(i*2.4),.3+i*(t.height-.4)/5,(t.diameter/2000+Math.max(0,(solar.canopyDiameter-t.diameter/1000)*.1))*Math.sin(i*2.4)]:[t.diameter/2000+.035,.3+i*(t.height-.4)/5,0]} rotation={[0,i*1.4,.6]}><sphereGeometry args={[shadowMode?Math.max(.01,(solar.canopyDiameter-t.diameter/1000)*.4):.11,5,4]}/><meshStandardMaterial color="#528a57"/></mesh>)}
 </group>)}
 <mesh position={[1,.32,back]} onClick={()=>onSelect('reservoir')}><boxGeometry args={[1.05,.64,.67]}/><meshStandardMaterial color="#83b9c0" transparent opacity={.4}/></mesh><mesh position={[1,.42,back]}><boxGeometry args={[.95,.05,.57]}/><meshStandardMaterial color={WATER} transparent opacity={.75}/></mesh>
 <mesh position={[1.95,.22,back]} onClick={()=>onSelect('pump')}><cylinderGeometry args={[.22,.22,.4,16]}/><meshStandardMaterial color="#9aab61"/></mesh>
 {p.obstacles.map(o=><mesh castShadow={shadowMode} receiveShadow={shadowMode} key={o.id} position={[o.x+o.width/2,.4,o.y+o.length/2]}><boxGeometry args={[o.width,.8,o.length]}/><meshStandardMaterial color="#a9ab9d"/></mesh>)}
 <FlowParticles routes={shadowMode?[]:supplyRoutes} color={WATER} playing={playing}/><FlowParticles routes={shadowMode?[]:returnRoutes} color="#efb14a" playing={playing}/>
 </Canvas>{shadowMode&&sunSettingsOpen&&<SolarPanel s={solar} onChange={onSolarChange} height={selectedTower?.height??p.defaults.height} playing={dayPlaying} onPlay={()=>setDayPlaying(!dayPlaying)}/>}
{shadowMode?<div className="solar-summary"><strong><Sun size={14}/>{clockTime(solar.minute)} · {solar.date}</strong><span>Sun {fmt(sun.elevation)}° high · azimuth {fmt(sun.azimuth,0)}° true</span><span>{selectedTower?.id??'Tower'} ground shadow: {shadow?fmt(shadow.length,2)+' m':'no direct sun'}</span><input aria-label="Quick sun time" className="range range-xs" type="range" min="0" max="1439" step="5" value={solar.minute} onChange={e=>onSolarChange({...solar,minute:+e.target.value})}/><div className="solar-summary-buttons"><button className="btn btn-sm" onClick={()=>setDayPlaying(!dayPlaying)}>{dayPlaying?<Pause size={12}/>:<Play size={12}/>} {dayPlaying?'Pause day':'Play day'}</button><button className="btn btn-sm" onClick={()=>setSunSettingsOpen(!sunSettingsOpen)}><Settings2 size={12}/>{sunSettingsOpen?'Hide settings':'Sun settings'}</button></div><small>North arrow is true north. Orientation/frame/cover remain provisional until checked. Shadows show geometry, not available crop light.</small></div>:<div className="farm3d-flow-card"><strong><Droplets size={14}/>Water enters at the top</strong><span>Reservoir → pump → overhead supply → tower tops</span><span>Water falls inside each tower → floor return → reservoir</span>{selectedTower&&<b>{selectedTower.id} · {fmt(selectedTower.height)} m tall · {flow!==undefined?`${fmt(flow,3)} L/min predicted`:'awaiting hydraulic result'}</b>}<small>Blue = supply & downward water · amber = return. Animation speed and visible pipe widths are illustrative.</small></div>}</div>;
}

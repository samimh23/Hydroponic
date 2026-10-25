import { useEffect,useMemo } from 'react';
import { CanvasTexture,DoubleSide,Object3D,Quaternion,Vector3 } from 'three';
import type { Project } from './engine/model';
import { solarPosition,towerShadow,type SolarSettings } from './engine/solar';

function Beam({a,b,width}:{a:[number,number,number];b:[number,number,number];width:number}){
 const props=useMemo(()=>{const x=new Vector3(...a),y=new Vector3(...b),d=y.clone().sub(x);return {length:d.length(),center:x.add(y).multiplyScalar(.5),q:new Quaternion().setFromUnitVectors(new Vector3(0,1,0),d.normalize())};},[...a,...b]);
 return <mesh castShadow receiveShadow position={props.center} quaternion={props.q}><cylinderGeometry args={[width/2,width/2,props.length,8]}/><meshStandardMaterial color="#8a9793" roughness={.65}/></mesh>;
}
export function GreenhouseFrame({p,s}:{p:Project;s:SolarSettings}){
 if(s.environment!=='greenhouse'||!s.frameEnabled)return null;
 const L=p.room.length,W=p.room.width,e=s.eaveHeight,r=s.ridgeHeight,spacing=s.frameSpacing;
 const bays=Array.from({length:Math.ceil(W/spacing)+1},(_,i)=>Math.min(W,i*spacing));
 const theta=Math.atan2(r-e,L/2),slope=Math.hypot(L/2,r-e);
 return <group>
 {bays.map((z,i)=><group key={i}><Beam a={[0,0,z]} b={[0,e,z]} width={s.frameWidth}/><Beam a={[L,0,z]} b={[L,e,z]} width={s.frameWidth}/><Beam a={[0,e,z]} b={[L/2,r,z]} width={s.frameWidth}/><Beam a={[L/2,r,z]} b={[L,e,z]} width={s.frameWidth}/></group>)}
 <Beam a={[0,e,0]} b={[0,e,W]} width={s.frameWidth}/><Beam a={[L,e,0]} b={[L,e,W]} width={s.frameWidth}/><Beam a={[L/2,r,0]} b={[L/2,r,W]} width={s.frameWidth}/>
 {[{x:L/4,angle:theta},{x:3*L/4,angle:-theta}].map(v=><mesh key={v.x} position={[v.x,(e+r)/2,W/2]} rotation={[0,0,v.angle]}><boxGeometry args={[slope,.006,W]}/><meshStandardMaterial color="#a9d4db" side={DoubleSide} transparent opacity={.07} depthWrite={false}/></mesh>)}
 </group>;
}
export function SunLighting({p,s}:{p:Project;s:SolarSettings}){
 const sun=solarPosition(s),radius=Math.max(p.room.length,p.room.width)+Math.max(...p.towers.map(t=>t.height))*2,distance=radius*4;
 const center=useMemo(()=>new Vector3(p.room.length/2,0,p.room.width/2),[p.room.length,p.room.width]);
 const target=useMemo(()=>{const o=new Object3D();o.position.copy(center);return o;},[center]);
 const direction=new Vector3(sun.direction.x,sun.direction.y,sun.direction.z),position=center.clone().addScaledVector(direction,distance);
 const transmission=s.environment==='greenhouse'?s.transmission:1;
 return <><primitive object={target}/><ambientLight intensity={sun.aboveHorizon?.38:.065}/><directionalLight position={position} target={target} intensity={sun.aboveHorizon?3*transmission:0} color={sun.elevation<15?'#ffd8ad':'#fff9eb'} castShadow shadow-mapSize-width={2048} shadow-mapSize-height={2048} shadow-camera-left={-radius} shadow-camera-right={radius} shadow-camera-top={radius} shadow-camera-bottom={-radius} shadow-camera-near={.1} shadow-camera-far={distance*2} shadow-bias={-.00005} shadow-normalBias={.015}/>{sun.aboveHorizon&&<mesh position={center.clone().addScaledVector(direction,radius*.65)}><sphereGeometry args={[.22,16,12]}/><meshBasicMaterial color="#ffd369"/></mesh>}<mesh rotation={[-Math.PI/2,0,0]} position={[p.room.length/2,-.04,p.room.width/2]} receiveShadow><planeGeometry args={[p.room.length+40,p.room.width+40]}/><meshStandardMaterial color={sun.aboveHorizon?'#dadac7':'#313e42'}/></mesh></>;
}
function NorthText({position}:{position:Vector3}){
 const texture=useMemo(()=>{const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;const ctx=canvas.getContext('2d')!;ctx.fillStyle='#285846';ctx.font='bold 90px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('N',64,64);return new CanvasTexture(canvas);},[]);
 useEffect(()=>()=>texture.dispose(),[texture]);
 return <sprite position={position} scale={[.55,.55,.55]}><spriteMaterial map={texture} transparent depthTest={false}/></sprite>;
}
export function NorthMarker({p,s}:{p:Project;s:SolarSettings}){
 const bearing=-s.planBearing*Math.PI/180,origin=useMemo(()=>new Vector3(p.room.length+1,.05,p.room.width/2),[p.room.length,p.room.width]),direction=useMemo(()=>new Vector3(Math.sin(bearing),0,-Math.cos(bearing)),[bearing]);
 return <group><arrowHelper args={[direction,origin,1.6,0x285846,.35,.2]}/><NorthText position={origin.clone().addScaledVector(direction,1.95)}/></group>;
}
export function ShadowTrace({p,s,selected}:{p:Project;s:SolarSettings;selected:string}){
 const t=p.towers.find(t=>t.id===selected);if(!t)return null;const shadow=towerShadow(t.height,solarPosition(s));if(!shadow)return null;
 const direction=new Vector3(shadow.dx,0,shadow.dz).normalize();
 return <arrowHelper args={[direction,new Vector3(t.x,.02,t.y),Math.min(shadow.length,80),0xad6b20,Math.min(.25,shadow.length*.15),.1]}/>;
}

import { z } from 'zod';
const finite=(min:number,max:number)=>z.number().finite().min(min).max(max);
export const solarSchema=z.object({
 siteName:z.string().max(100),latitude:finite(-89.9,89.9),longitude:finite(-180,180),utcOffset:finite(-12,14),
 date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value=>{try{parseSolarDate(value);return true;}catch{return false;}},'Use a real date between 1900 and 2100.'),minute:finite(0,1439),planBearing:finite(0,360),orientationConfirmed:z.boolean(),
 environment:z.enum(['outdoor','greenhouse','indoor']),canopyDiameter:finite(.1,3),
 frameEnabled:z.boolean(),eaveHeight:finite(.5,30),ridgeHeight:finite(.5,40),frameSpacing:finite(.5,10),frameWidth:finite(.02,.5),
 transmission:finite(.01,1),geometryConfirmed:z.boolean(),coverConfirmed:z.boolean()
}).refine(s=>s.ridgeHeight>=s.eaveHeight,{message:'Ridge height must be at least the eave height.',path:['ridgeHeight']});
export type SolarSettings=z.infer<typeof solarSchema>;
export const defaultSolar=():SolarSettings=>({siteName:'Reference demo greenhouse',latitude:40,longitude:0,utcOffset:0,date:'2026-10-25',minute:720,planBearing:0,orientationConfirmed:false,environment:'greenhouse',canopyDiameter:.5,frameEnabled:true,eaveHeight:3.8,ridgeHeight:4.8,frameSpacing:2,frameWidth:.06,transmission:.85,geometryConfirmed:false,coverConfirmed:false});
const rad=Math.PI/180,deg=180/Math.PI,mod=(x:number,n:number)=>(x%n+n)%n;
export function parseSolarDate(date:string){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw Error('Use a valid date in YYYY-MM-DD format.');
 const [y,m,d]=date.split('-').map(Number),time=Date.UTC(y,m-1,d),check=new Date(time);
 if(y<1900||y>2100||check.getUTCFullYear()!==y||check.getUTCMonth()!==m-1||check.getUTCDate()!==d)throw Error('Choose a real calendar date between 1900 and 2100.');
 return {year:y,day:Math.floor((time-Date.UTC(y,0,1))/86400000)+1,days:y%4===0&&(y%100!==0||y%400===0)?366:365};
}
/** NOAA fractional-year solar approximation. East-positive longitude; explicit local UTC offset. Geometric elevation (no refraction). */
export function solarPosition(input:SolarSettings){
 const s=solarSchema.parse(input),date=parseSolarDate(s.date),gamma=2*Math.PI/date.days*(date.day-1+(s.minute/60-12)/24);
 const equationTime=229.18*(.000075+.001868*Math.cos(gamma)-.032077*Math.sin(gamma)-.014615*Math.cos(2*gamma)-.040849*Math.sin(2*gamma));
 const declination=.006918-.399912*Math.cos(gamma)+.070257*Math.sin(gamma)-.006758*Math.cos(2*gamma)+.000907*Math.sin(2*gamma)-.002697*Math.cos(3*gamma)+.00148*Math.sin(3*gamma);
 const solarMinute=mod(s.minute+equationTime+4*s.longitude-60*s.utcOffset,1440),hourAngle=(solarMinute/4-180)*rad,lat=s.latitude*rad;
 const sinElevation=Math.sin(lat)*Math.sin(declination)+Math.cos(lat)*Math.cos(declination)*Math.cos(hourAngle);
 const elevation=Math.asin(Math.max(-1,Math.min(1,sinElevation)))*deg;
 const azimuth=mod(Math.atan2(Math.sin(hourAngle),Math.cos(hourAngle)*Math.sin(lat)-Math.tan(declination)*Math.cos(lat))*deg+180,360);
 const relative=(azimuth-s.planBearing)*rad,horizontal=Math.cos(elevation*rad);
 const direction={x:horizontal*Math.sin(relative),y:Math.sin(elevation*rad),z:-horizontal*Math.cos(relative)};
 return {elevation,azimuth,direction,equationTime,declination:declination*deg,aboveHorizon:elevation>0};
}
export function towerShadow(height:number,sun:ReturnType<typeof solarPosition>){
 if(!Number.isFinite(height)||height<=0)throw Error('Shadow height must be positive.');
 if(!sun.aboveHorizon)return null;
 const dx=-height*sun.direction.x/sun.direction.y,dz=-height*sun.direction.z/sun.direction.y;
 return {dx,dz,length:Math.hypot(dx,dz),bearing:mod(sun.azimuth+180,360)};
}
export function daySummary(s:SolarSettings){
 const hourly=Array.from({length:24},(_,hour)=>{const sun=solarPosition({...s,minute:hour*60});return {hour,...sun};});
 const samples=Array.from({length:97},(_,i)=>({minute:Math.min(1439,i*15),elevation:solarPosition({...s,minute:Math.min(1439,i*15)}).elevation}));
 let sunrise:number|null=null,sunset:number|null=null;
 for(let i=1;i<samples.length;i++)if((samples[i-1].elevation>0)!==(samples[i].elevation>0)){
  let lo=samples[i-1].minute,hi=samples[i].minute;
  for(let j=0;j<14;j++){const mid=(lo+hi)/2,value=solarPosition({...s,minute:mid}).elevation;if((value>0)===(samples[i-1].elevation>0))lo=mid;else hi=mid;}
  if(samples[i-1].elevation<=0)sunrise=(lo+hi)/2;else sunset=(lo+hi)/2;
 }
 const noonSun=solarPosition({...s,minute:720}),solarNoon=mod(720-4*s.longitude-noonSun.equationTime+s.utcOffset*60,1440);
 return {hourly,sunrise,sunset,solarNoon,polarDay:samples.every(v=>v.elevation>0),polarNight:samples.every(v=>v.elevation<=0)};
}
export function clockTime(minute:number|null){if(minute===null)return '—';const total=mod(Math.round(minute),1440);return `${String(Math.floor(total/60)).padStart(2,'0')}:${String(total%60).padStart(2,'0')}`;}
export function solarCSV(s:SolarSettings,height:number){return ['local_time,utc_offset_h,date,sun_elevation_deg,sun_azimuth_true_deg,pole_height_m,ground_shadow_length_m,shadow_bearing_true_deg',...daySummary(s).hourly.map(v=>{const shadow=towerShadow(height,v);return [clockTime(v.hour*60),s.utcOffset,s.date,v.elevation.toFixed(3),v.azimuth.toFixed(3),height,shadow?.length.toFixed(3)??'',shadow?.bearing.toFixed(3)??''].join(',');})].join('\r\n');}

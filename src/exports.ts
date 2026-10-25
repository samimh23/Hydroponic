import type { Project } from './engine/model';
import type { Simulation } from './engine/hydraulics';
import { gaugePressure } from './engine/hydraulics';
export function download(filename:string,data:string|Blob,mime='text/plain'){
 const url=URL.createObjectURL(typeof data==='string'?new Blob([data],{type:mime}):data),a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export function layoutSVG():string{
 const el=document.getElementById('farm-plan');if(!el)throw Error('Switch to the 2D plan before exporting.');
 const copy=el.cloneNode(true) as SVGSVGElement;copy.setAttribute('xmlns','http://www.w3.org/2000/svg');copy.setAttribute('width','1400');copy.setAttribute('height','1400');return new XMLSerializer().serializeToString(copy);
}
export async function exportPNG(){const svg=layoutSVG(),url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));try{const img=new Image();await new Promise<void>((resolve,reject)=>{img.onload=()=>resolve();img.onerror=()=>reject(Error('Could not render floor plan.'));img.src=url;});const canvas=document.createElement('canvas');canvas.width=1800;canvas.height=1800;const ctx=canvas.getContext('2d')!;ctx.fillStyle='#ffffff';ctx.fillRect(0,0,1800,1800);ctx.drawImage(img,0,0,1800,1800);const blob=await new Promise<Blob|null>(res=>canvas.toBlob(res,'image/png'));if(blob)download('hydrotower-layout.png',blob);}finally{URL.revokeObjectURL(url);}}
export function resultsCSV(p:Project,r:Simulation){
 const rows:unknown[][]=[['type','id','from','to','flow_L_min','target_L_min','velocity_m_s','friction_m','fittings_m','pressure_kPa','data_source'],['operating_point',p.pump.model,'','',r.flow,'','','','',r.pressure,p.pump.curveMode==='estimate'?'illustrative approximate curve':'user-entered curve'],...r.towerResults.map(t=>['tower',t.id,'','',t.flow,t.target,'','','',t.pressure,'engineering estimate']),...r.pipeResults.map(e=>['pipe',e.id,e.from,e.to,e.flow,'',e.velocity,e.friction,e.minor,e.pressure,'engineering estimate']),['return','gravity-return','','',r.returned,'','','','','','capacity estimate; not a drainage design']];
 return rows.map(row=>row.map(v=>`"${String(v??'').replaceAll('"','""')}"`).join(',')).join('\r\n');
}
export function engineeringReport(p:Project,r:Simulation){
 const f=(n:number,d=3)=>n.toFixed(d),area=p.room.length*p.room.width;
 return `HYDROTOWER · PRELIMINARY ENGINEERING SUMMARY
${p.name}
Generated: ${new Date().toISOString()}

DESIGN BASIS
Room: ${p.room.length} × ${p.room.width} m (${area} m²)
Towers: ${p.towers.length}; default height ${p.defaults.height} m; body diameter ${p.defaults.diameter} mm
Demand: ${f(r.demand,2)} L/min; individual targets are scenario inputs, not crop recommendations.
Mode: ${p.mode}; ${p.defaults.manifolds} distribution manifold(s)
Main: nominal ${p.defaults.mainNominal} mm; actual entered ID ${p.defaults.mainID} mm
Branch ID ${p.defaults.branchID} mm; lateral ID ${p.defaults.lateralID} mm
Water: density 998.2 kg/m³, kinematic viscosity 1.004e-6 m²/s (20 °C)

PUMP DATA & PROVENANCE
Model: ${p.pump.model}; ${p.pump.count} pump(s), ${p.pump.arrangement}
Single-pump limits: ${p.pump.maxFlow} L/min maximum flow, ${p.pump.maxHead} m maximum head.
These limits are NOT simultaneously achievable operating values.
Default CPM7508 rating: 750 W / 1 HP, 220–240 V, 50 Hz; manufacturer catalog corroborates flow/head/input rating.
User-supplied maximum suction lift: 8 m. Configured lift: ${p.pump.suctionLift} m. NPSH not calculated.
Catalog: https://ingco.com.pa/bombas/
Curve source: ${p.pump.curveMode==='estimate'?'ILLUSTRATIVE ENGINEERING ESTIMATE. H = Hmax × (1 − (Q/Qmax)²). Endpoints do not establish the true curve. No invented point is manufacturer data.':'USER-ENTERED TABLE. Provenance has not been verified; linear interpolation only within table bounds.'}
${p.pump.curveMode==='manual'?p.pump.curve.map(v=>`  ${v.flow} L/min, ${v.head} m`).join('\n'):''}

PREDICTED OPERATING POINT (${p.pump.curveMode==='estimate'?'UNVALIDATED ESTIMATE':'USER CURVE'})
Supply: ${f(r.flow,2)} L/min / ${f(r.flow*60,0)} L/hour
Pump differential head: ${f(r.head)} m; differential pressure equivalent ${f(r.pressure,2)} kPa
Flow-weighted static contribution: ${f(r.static)} m (tallest tower: ${f(Math.max(...p.towers.map(t=>t.height)))} m)
Flow-weighted friction / fitting contributions: ${f(r.frictionHead)} / ${f(r.minorHead)} m
Energy budget residual: ${r.energyResidual.toExponential(3)} m
Pump hydraulic power: ${f(r.hydraulicW,1)} W
Assumed wire-to-water efficiency: ${p.pump.efficiency>0?f(p.pump.efficiency*100,1)+'%':'not provided'}
Estimated electrical input: ${r.electricalW===null?'UNKNOWN':f(r.electricalW,1)+' W'}
Schedule: ${p.pump.hours} hours/day (steady on-state; startup transients not simulated)
Estimated electrical energy: ${r.kwhDay===null?'UNKNOWN; enter an efficiency':f(r.kwhDay,2)+' kWh/day'}
Separate rated-input scenario: ${f(r.ratedKwhDay,2)} kWh/day; not measured consumption.
Targets met: ${f(r.coverage,1)}% of towers
Lowest/highest tower flow: ${f(r.minFlow)} / ${f(r.maxFlow)} L/min
Range imbalance (max−min)/mean: ${f(r.imbalance,1)}%
Closest/farthest by floor-plan distance from the pump: ${f(r.nearestFlow)} / ${f(r.farthestFlow)} L/min
Projected reservoir return: ${f(r.returned,2)} L/min; estimated gravity capacity ${f(r.returnCapacity,2)} L/min
${r.returned<r.flow&&p.mode!=='once-through'?'Return-limited: no stable recirculating mass balance is established.':p.mode==='once-through'?'Once-through: no recirculation assumed.':'Supply and projected return balance; neglecting uptake, evaporation and leaks.'}

FORMULAS & SOLVER
SI units internally: Q in m³/s, D and L in metres; inputs/outputs convert explicitly.
v = Q / (πD²/4); Re = vD/ν
Darcy–Weisbach: hf = f(L/D)v²/(2g)
f = 64/Re below Re 2000; Swamee–Jain above Re 4000; linear transition between.
Minor loss hm = ΣK v²/(2g); elbow K=0.9, tee K=0.6, valve K=0.2 (editable extra K).
Pressure p = ρg(H−z); hydraulic power = ρgQHpump
Electrical power = hydraulic power / entered wire-to-water efficiency.
Identical series pumps add heads at equal Q; parallel pumps add flow at equal H.
Damped nodal Newton iterations enforce ΣQ=0 at each junction, then head bisection finds Hpump(Q)=Hsystem(Q).
Maximum junction residual: ${r.solution.residual.toExponential(3)} m³/s; final network iterations: ${r.solution.iterations}.
Default rows are lumped branches with individual length-dependent laterals; no equal-flow constraint.
Atmospheric return loses pressure recovery; count tower rise once, not twice. A sealed loop includes a common return resistance with zero net static rise.
Gravity return is a full-bore Darcy capacity estimate from the entered drop, not a partially filled drainage calculation.
Hydraulic reference: https://usepa.github.io/EPANET2.2/3_network_model.html

WARNINGS & ASSUMPTIONS
${r.warnings.map(w=>'• '+w).join('\n')}
Nominal diameter is a label. Actual ID drives all calculations. PVC SDR presets are dimensional estimates, not certified pipe schedules.
No plant uptake, evaporation, nutrient viscosity correction, transient/water-hammer, pump minimum-flow, NPSH, clogging, reservoir level dynamics or thermal model.
This is a preliminary design aid. Field measurements and manufacturer engineering data are required before construction or pump selection.

PIPE RESULTS (SIGNED FLOWS FOLLOW FROM→TO)
${r.pipeResults.map(e=>`${e.label} [${e.id}] ${e.from} → ${e.to}: Q=${f(e.flow)} L/min, v=${f(e.velocity)} m/s, hf=${f(e.friction)} m, hm=${f(e.minor)} m, Δp=${f(e.pressure)} kPa, entrance p=${f(gaugePressure(p,r.solution,e.from))} kPa`).join('\n')}

INDIVIDUAL TOWER RESULTS
${r.towerResults.map(t=>`${t.id}: target ${f(t.target)} L/min, delivered ${f(t.flow)} L/min, inlet ${f(t.pressure)} kPa gauge, ${t.flow>=t.target?'MEETS':'BELOW'} target`).join('\n')}
`;
}

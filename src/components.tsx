import { useEffect, useState, type ReactNode } from 'react';
import { Info } from 'lucide-react';
export function Field({label,value,onChange,unit,min=0,max=10000,step=.1,help}:{label:string;value:number;onChange:(v:number)=>void;unit?:string;min?:number;max?:number;step?:number;help?:string}) {
 const [draft,setDraft]=useState(String(value));useEffect(()=>setDraft(String(value)),[value]);
 const valid=draft!==''&&Number.isFinite(Number(draft))&&+draft>=min&&+draft<=max;
 return <label className="field"><span>{label}{help&&<span className="tooltip tooltip-left" data-tip={help}><Info size={12}/></span>}</span><div className={`number-field ${!valid?'invalid':''}`}><input aria-label={label} className="input input-sm" type="number" value={draft} min={min} max={max} step={step} onChange={e=>{setDraft(e.target.value);const v=+e.target.value;if(e.target.value!==''&&Number.isFinite(v)&&v>=min&&v<=max)onChange(v);}} onBlur={()=>{if(!valid)setDraft(String(value));}}/>{unit&&<small>{unit}</small>}</div>{!valid&&<small className="text-error">Enter {min}–{max}</small>}</label>;
}
export function Select({label,value,onChange,children}:{label:string;value:string|number;onChange:(v:string)=>void;children:ReactNode}){return <label className="field"><span>{label}</span><select aria-label={label} className="select select-sm" value={value} onChange={e=>onChange(e.target.value)}>{children}</select></label>;}
export function Section({title,number,children}:{title:string;number?:string;children:ReactNode}){return <section className="param-section"><div className="section-title">{number&&<span>{number}</span>}<h3>{title}</h3></div>{children}</section>;}
export function Metric({label,value,unit,detail}:{label:string;value:string;unit:string;detail:string}){return <div className="metric"><span className="eyebrow">{label}</span><div><strong>{value}</strong><span>{unit}</span></div><small>{detail}</small></div>;}
export const fmt=(v:number,d=1)=>Number.isFinite(v)?v.toLocaleString('en-GB',{maximumFractionDigits:d,minimumFractionDigits:d}):'—';

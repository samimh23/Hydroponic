import { describe,it,expect } from 'vitest';
import { defaultSolar,solarPosition,towerShadow,daySummary,parseSolarDate } from './solar';
describe('solar geometry',()=>{
 it('approximates the published NREL SPA example within the fractional-year method tolerance',()=>{
  // NREL SPA report: 2003-10-17 12:30:30 UTC−7, 39.742476°N, 105.1786°W.
  // Reference apparent zenith 50.11162°, azimuth 194.34024°; this implementation is geometric and approximate.
  const sun=solarPosition({...defaultSolar(),latitude:39.742476,longitude:-105.1786,utcOffset:-7,date:'2003-10-17',minute:750.5});
  expect(sun.elevation).toBeCloseTo(39.88838,0);expect(Math.abs(sun.azimuth-194.34024)).toBeLessThan(1);
 });
 it('casts a height/tan(elevation) shadow opposite the sun',()=>{
  const sun={...solarPosition(defaultSolar()),elevation:45,azimuth:90,aboveHorizon:true,direction:{x:Math.SQRT1_2,y:Math.SQRT1_2,z:0}};
  const shadow=towerShadow(3,sun)!;expect(shadow.length).toBeCloseTo(3);expect(shadow.dx).toBeCloseTo(-3);expect(shadow.bearing).toBe(270);
 });
 it('has no direct-sun shadow below the horizon',()=>{const sun=solarPosition({...defaultSolar(),minute:0});expect(sun.aboveHorizon).toBe(false);expect(towerShadow(3,sun)).toBeNull();});
 it('rotates plan coordinates without changing the true sun position or shadow length',()=>{
  const a=solarPosition(defaultSolar()),b=solarPosition({...defaultSolar(),planBearing:90});expect(a.azimuth).toBeCloseTo(b.azimuth);expect(b.direction.x).toBeCloseTo(a.direction.z);expect(b.direction.z).toBeCloseTo(-a.direction.x);expect(towerShadow(3,a)!.length).toBeCloseTo(towerShadow(3,b)!.length);
 });
 it('uses explicit UTC offset consistently',()=>{const a=solarPosition({...defaultSolar(),minute:720,utcOffset:1}),b=solarPosition({...defaultSolar(),minute:660,utcOffset:0});expect(Math.abs(a.elevation-b.elevation)).toBeLessThan(.03);expect(Math.abs(a.azimuth-b.azimuth)).toBeLessThan(.03);});
 it('makes winter noon shadows longer than summer at the reference site',()=>{const s=defaultSolar(),winter=towerShadow(3,solarPosition({...s,date:'2026-12-21',minute:735}))!,summer=towerShadow(3,solarPosition({...s,date:'2026-06-21',minute:735}))!;expect(winter.length).toBeGreaterThan(5);expect(summer.length).toBeLessThan(1);});
 it('finds sunrise before noon and sunset after noon at the site',()=>{const d=daySummary(defaultSolar());expect(d.sunrise).not.toBeNull();expect(d.sunset).not.toBeNull();expect(d.sunrise!).toBeLessThan(d.solarNoon);expect(d.sunset!).toBeGreaterThan(d.solarNoon);});
 it('handles leap years, invalid dates, polar day and polar night',()=>{expect(parseSolarDate('2024-02-29').days).toBe(366);expect(()=>parseSolarDate('2026-02-29')).toThrow();expect(()=>solarPosition({...defaultSolar(),latitude:95})).toThrow();expect(daySummary({...defaultSolar(),latitude:80,date:'2026-06-21'}).polarDay).toBe(true);expect(daySummary({...defaultSolar(),latitude:80,date:'2026-12-21'}).polarNight).toBe(true);});
});

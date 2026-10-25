# Hydroponic — HydroTower Studio

A local hydroponic tower-farm designer, hydraulic calculator, and 3D sun/shadow preview. React + TypeScript + Vite, Tailwind/daisyUI, React Flow, Three.js, and Recharts. No account, paid API, or backend is required to run the app.

## Run on Windows 11

Install Node.js 22.12+ or a newer supported LTS version, then run in PowerShell:

```powershell
git clone https://github.com/samimh23/Hydroponic.git
cd Hydroponic
npm.cmd ci
npm.cmd run dev
```

Open the local URL Vite prints, normally http://127.0.0.1:5173/. Keep the terminal running while using the app. Add `?view=3d` to open the 3D view directly. `npm.cmd` avoids PowerShell script execution-policy issues.

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run preview
```

`npm.cmd run sample` regenerates the 100-tower hydraulic example report and CSV. Installation requires internet access; simulation runs locally afterward.

## Features

- Proposed 100-tower layout in a 10 × 10 m room, with editable dimensions, spacing, aisle, height, body diameter, and individual irrigation targets.
- 2D tower selection, movement, addition and deletion; obstacle placement; collision checks and floor-area accounting.
- Orbitable 3D towers, top-fed overhead distribution, animated downward water flow and gravity return, cutaway view, tower focus, and enlarged workspace.
- Editable supply network with junctions, parallel branches and cross-connections. Pipes have actual internal diameter, length, roughness, fitting counts and additional loss coefficient.
- Pump/system operating-point calculation, individual tower flows, pipe velocities, losses, power and diagnostics.
- Identical pumps in series or parallel, one or two generated distribution manifolds, demand scenarios and operating hours.
- User-entered pump curves, an explicitly illustrative estimate, or missing-curve mode with no fabricated operating point.
- Browser-local persistence, JSON import/export, SVG/PNG floor plans, hydraulic CSV results, and printable engineering summaries.
- Solar date/time slider, day animation, summer/winter presets, true-north orientation, greenhouse frame parameters, canopy-size scenario, geometric shadows and hourly CSV export.

## Getting started

1. Edit growing-space parameters and click **Generate layout**. The fit count reports how many requested towers were placed. Generating a layout replaces generated hydraulic connections.
2. Select or drag a tower to change geometry or its individual target. Spacing and aisle values are layout proposals, not validated crop-clearance or accessibility requirements.
3. Open **Hydraulic Network**. Connect supply handles, add junctions, and select pipes to edit properties. Diagram-node movement alone does not change pipe length. Select the reservoir to configure the return; **Show return** reveals the loop.
4. Generated pipe defaults recalculate when edited. Rebuilding the network replaces custom connections. Inspect physical lengths after substantial layout changes.
5. Open **Pump Performance** to enter actual flow/head points as numeric `flow L/min, head m` rows. Flow must increase and head decrease. The solver does not extrapolate beyond a table.
6. Open **Reports** for pipe/tower results, formulas, assumptions and warnings. Browser print can save a PDF. Layout SVG/PNG export requires the 2D view.
7. In **3D view**, choose **Sun & shadows**. Enter the site's coordinates, UTC offset, date and plan bearing, then verify greenhouse/canopy dimensions and cover data. Use **Play day**, the time slider, or seasonal presets. Escape exits the enlarged view.

## Hydraulic calculation model

SI units internally. Water defaults: density 998.2 kg/m³, kinematic viscosity 1.004e−6 m²/s at 20 °C, gravity 9.80665 m/s².

- Darcy–Weisbach losses, laminar Darcy factor `64/Re`, Swamee–Jain turbulent approximation, and linear transition from Reynolds numbers 2000 to 4000.
- Minor losses `K v²/(2g)`. Default elbow, tee and valve coefficients are 0.9, 0.6 and 0.2, plus editable additional K. These are assumptions, not certified fitting data.
- A damped nodal Newton solver enforces junction flow continuity. Head bisection finds the pump/system intersection. Flow follows resistance; it is not forced equal between towers.
- Default topology has shared mains, lumped row branches and individual unequal-length laterals. Add successive junctions for detailed branch takeoffs.
- Top-fed atmospheric towers require elevation head once per cycle. An open gravity return does not recover pressure energy. Experimental sealed-loop mode includes return resistance with zero net static elevation contribution.
- Gravity return capacity is a full-bore Darcy estimate using the entered drop, not a complete partially filled drainage calculation.
- Hydraulic power is `ρgQH`. Electrical power requires wire-to-water efficiency. Rated input × operating hours is a separate scenario, not measured consumption.
- Nominal pipe size is a label; actual internal diameter drives calculations. OD/SDR presets estimate dimensions and do not certify a commercial pipe schedule.

Invalid, disconnected, non-convergent or out-of-curve cases produce diagnostics and clear previous results.

## INGCO CPM7508 data

The example uses separate limits of 110 L/min maximum flow and 30 m maximum head, rated input 750 W / 1 HP, and 220–240 V / 50 Hz. The [INGCO regional catalog](https://ingco.com.pa/bombas/) lists these ratings. Maximum suction lift of 8 m was supplied with the original brief; NPSH is not calculated.

**110 L/min at 30 m is not an established duty point. No manufacturer pump curve has been supplied or validated.** The initial estimate is `H = Hmax × (1 − (Q/Qmax)²)`, interpolated through 31 illustrative samples. No generated point is manufacturer data. Actual pump capacity and suitability require measured/manufacturer curve data and installation measurements.

## Solar and greenhouse model

The public app starts at a **reference demo location: 40° N, 0° E, UTC+0**, not a real user's farm. Replace the location and UTC offset before using site results. Project-specific farm coordinates and site files are intentionally excluded from this repository.

The engine uses [NOAA fractional-year solar equations](https://gml.noaa.gov/grad/solcalc/solareqns.PDF), east-positive longitude and an explicit UTC offset. Elevation is geometric, without atmospheric refraction. Vertical pole shadow length is `height / tan(solar elevation)`, opposite the sun. No direct-sun shadow is reported below the geometric horizon.

Plan bearing is the true bearing of the top of the 2D plan: 0° north, 90° east, 180° south, 270° west. The 3D north marker follows that bearing.

The optional greenhouse is an illustrative gable-roof frame over the room footprint, with ridge along plan Y. Default eave height 3.8 m, ridge height 4.8 m, frame spacing 2 m, member diameter 0.06 m, canopy diameter 0.5 m and cover transmission 85% are **unverified scenarios**, not site measurements. Roof geometry is transparent; scalar transmission attenuates direct light in the preview. Bodies, illustrative crop leaves, frame members and obstacles cast shadows. Visually exaggerated plumbing does not cast shadows.

Clouds, diffuse sky light, cover haze/refraction, angle-dependent transmission, dirt, condensation, terrain and nearby buildings/trees are not modeled. Shadow maps cover a finite area; long shadows can extend beyond it. No PPFD, DLI, crop-light sufficiency or yield prediction is claimed. Indoor roof/windows are not modeled. Near-horizon shadows are especially sensitive to refraction and terrain. Use actual cover-product data; see [UMass greenhouse-cover guidance](https://www.umass.edu/agriculture-food-environment/greenhouse-floriculture/fact-sheets/plastic-greenhouse-film-update).

## Validation and limitations

The test suite has 21 hydraulic and 8 solar cases covering analytical losses, conversions, static lift, serial/parallel/mesh networks, junction and energy balance, curve intersection and bounds, solver failures, solar reference angles, shadow geometry, plan rotation, UTC offset, seasons, invalid dates and polar day/night. Tests validate software behavior, not the missing pump curve or an installed farm.

This is an MVP and preliminary design aid. It does not model plant biology, access/canopy-clearance requirements, detailed tower internals, reservoir sizing or level transients, evaporation, uptake, leaks, clogging, water hammer, NPSH, variable-speed pumps, unequal pump combinations, automatic CAD routing or measured lighting. Validate with site measurements and manufacturer engineering data before construction or equipment selection.

Hydraulic reference: [US EPA EPANET 2.2 network model](https://usepa.github.io/EPANET2.2/3_network_model.html). This project uses an independent solver; it is not the EPANET engine or an EPANET-validated application.

## Source map

- `src/engine/model.ts`: project schema, collision checks, layouts and default network.
- `src/engine/hydraulics.ts`: physics, network solver, pump intersection and diagnostics.
- `src/engine/solar.ts`: solar geometry, shadows, daily summaries and CSV.
- `src/engine/*.test.ts`: calculation tests.
- `src/simulation.worker.ts`: hydraulic computation off the UI thread.
- `src/Layout.tsx`, `src/Farm3D.tsx`, `src/Network.tsx`, `src/Performance.tsx`: design and simulation views.
- `src/SolarPanel.tsx`, `src/SunScene.tsx`: solar controls and greenhouse rendering.
- `src/exports.ts`: project/results exports and report text.
- `examples/`: generic 100-tower hydraulic project, report and CSV.

Keep private site projects in `local-projects/` or name them `*.project.local.json`; both are ignored by Git. Browser storage and downloaded projects stay on your device unless you share them.

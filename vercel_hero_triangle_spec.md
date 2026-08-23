# Vercel Hero Triangle — Technical Specification Sheet

> **Source of truth**: All data in this document was extracted at runtime from `https://vercel.com` on 2026-08-20 using Playwright + WebGPU API interception. Zero values are mocked or assumed.

---

## 1. Architecture & Rendering Pipeline

### 1.1 Runtime Environment

| Property | Value |
|---|---|
| **Rendering API** | WebGPU (WGSL shaders) — **not** WebGL |
| **Execution context** | Web Worker (Turbopack worker chunk) |
| **Canvas element** | `<canvas data-triangle-led-4-hero-canvas="true">` |
| **Canvas context** | `HTMLCanvasElement: 2d` (worker renders to offscreen, blits via 2D context) |
| **Resolution** | 822 × 548 px (captured at 1× DPR viewport) |
| **DPR scaling** | `screen.w` uniform = device pixel ratio (1.0 captured) |
| **Aspect ratio** | 3:2 (enforced by CSS `aspect-[3/2]`) |
| **Framework** | Next.js React Server Components (Flight stream) |

### 1.2 Component Hierarchy

```
HeroLayoutClient       (Module 495073) — Container, resize/drop logic
├── HeroShaderLayer    (Module 658454) — WebGPU renderer, canvas lifecycle
├── HeroClient         (Module 576099) — Interactive navigation hover states
├── ScrambleText       (Module 48518)  — Animated subtitle text
│   Phrases: ["For coding agents", "To ship apps and agents", "Automated by agents"]
├── DeployNowCtaButton (Module 207317) — Primary CTA
└── HeroDropActiveFade (Module 937738) — Drag-drop overlay
```

### 1.3 SSR Fallback

Before WebGPU hydration, the static fallback renders:

- **Light mode**: An SVG `<polygon>` with equilateral triangle vertices at `points="0,-0.1524 -0.1320,0.0762 0.1320,0.0762"` (normalized coordinates), `fill="#000"`, scaled via `scale-[1.6]` (mobile) / `scale-[1.3]` (desktop).
- **Dark mode**: Two preloaded WebP images (`fallback-dark-glow-mobile.webp`, `fallback-dark-glow-desktop.webp`) composited with `mix-blend-mode: luminosity`, overlaid with a tiling noise texture (`fallback-dark-noise.webp`, 70x70px tile, `mix-blend-mode: multiply`, `opacity: 0.42`).

### 1.4 Six-Pass WGSL Shader Pipeline

The renderer executes 7 shader modules in 6 logical passes:

| Pass | Shader | Purpose | Key Inputs |
|---|---|---|---|
| **1. Light Source / LED SDF** | Shader 0 | Renders the 72 LED emitters as oriented rectangles clipped to the triangle SDF. Outputs a signed-distance-field alpha mask. | `Config` uniform, `Led[72]` storage buffer |
| **2. LED Emitter Color** | Shader 1 | Per-LED instanced quads emitting colored light. Clips to triangle edge via `led_clip.x`. Outputs additive `vec4f(k, 0.0)`. | Same `Config`, `Led[72]` with brightness/color |
| **3. Radiance Ray Tracing** | Shader 2 | Traces 24 jittered rays from each pixel toward the triangle edges, accumulating light color with exponential distance attenuation. | `Config{tri_a_b, tri_c_target, params}`, `light_sources_tex` |
| **4. Floor Compositing (Dark)** | Shader 3 | Final compositing: blends floor noise, sampled radiance (bicubic B-spline upsampled), Lottes tonemapping, OKLab color mixing, edge fade, particle overlay. | 16-field `Config`, `radiance_tex`, `light_sources_tex`, `floor_noise_tex`, `particle_tex` |
| **5. Floor Compositing (Light/Color)** | Shader 4 | Alternative compositing pass with `LightGlow` uniform (16xvec4f), Catmull-Rom radiance upsampling, AO via smooth half-plane distances, per-edge OKLab tinting. | `Config` (9 vec4f), `LightGlow` (16 vec4f), `particle_tex` |
| **6. Floor Noise Generation** | Shader 5 | Procedural noise texture via `fract(sin(dot(...)))` hash at 3 octaves. | Vertex index only |
| **7. Particle Rendering** | Shader 6 | Instanced particle points with `fade_in` and `intensity_t` interpolants. | `ParticleUniform{origin_scale_strength, rt_size}` |

---

## 2. Mathematical Models & Shaders

### 2.1 Triangle Geometry

#### SDF (Signed Distance Field)

All shaders share a common `triangle_sdf` function:

```wgsl
fn triangle_sdf(p: vec2f, a: vec2f, b: vec2f, c: vec2f) -> f32 {
    let e = min(
        segment_distance(p, a, b),
        min(segment_distance(p, b, c), segment_distance(p, c, a))
    );
    return select(e, -e, inside_triangle(p, a, b, c));
}
```

Where `inside_triangle` uses the sign-of-cross-product winding test.

#### Extracted Triangle Vertices (pixel coordinates at 822x548)

| Vertex | Position |
|---|---|
| **Top** | `(411.0, 175.338)` |
| **Bottom-Left** | `(325.556, 323.331)` |
| **Bottom-Right** | `(496.444, 323.331)` |
| **Center** | `(411.0, 274.0)` |

Derived from `buffer_20_floats[0..7]`:
- `triangle.x` = 411 (center x)
- `triangle.y` = 274 (center y)  
- `triangle.z` = 98.662 (half-height, computed: `274 - 175.338`)
- `triangle.w` = 85.444 (half-width, computed: `411 - 325.556`)

#### Constants

| Constant | Value | Shader |
|---|---|---|
| `OCCLUDER_INSET_PX` | `4.0` | Shader 0 |
| `OCCLUDER_INTERIOR_MARGIN` | `4.0` | Shader 3 |
| `AO_CORNER_SMOOTH` | `0.25` | Shader 4 |
| `LED_COUNT` | `72u` | Shader 0, 1 |
| `MAX_RAYS` | `24u` | Shader 2 |
| `JITTER_AMPLITUDE` | `0.7` | Shader 2 |
| `FLOOR_NOISE_SIZE` | `500` | Shader 3 |
| `FLOOR_NOISE_DENSITY` | `2.0` | Shader 3 |

### 2.2 Lighting & Optics

#### Tone Mapping — Lottes (Active)

```wgsl
const TONEMAP: u32 = TONEMAP_LOTTES; // = 2u

fn lottes_tonemap(a: vec3f) -> vec3f {
    let b = 1.6;    // contrast
    let c = 0.977;  // shoulder
    let d = 8.0;    // hdr_max
    let e = 0.18;   // midIn
    let f = 0.267;  // midOut
    let g = (-pow(e,b) + pow(d,b)*f) / ((pow(d,b*c) - pow(e,b*c)) * f);
    let h = (pow(d,b*c)*pow(e,b) - pow(d,b)*pow(e,b*c)*f) / ((pow(d,b*c) - pow(e,b*c)) * f);
    return pow(a, vec3f(b)) / (pow(a, vec3f(b*c)) * g + h);
}
```

Final gamma: `pow(result, vec3f(1.0 / 2.2))`

#### OKLab Color Space Matrices

```wgsl
// Linear RGB -> OKLab (inverse cube-root step)
const OK_INV_B = mat3x3<f32>(
    0.4121656120, 0.2118591070, 0.0883097947,
    0.5362752080, 0.6807189584, 0.2818474174,
    0.0514575653, 0.1074065790, 0.6302613616
);

// OKLab -> Linear RGB (cube step)
const OK_FWD_B = mat3x3<f32>(
    4.0767245293, -1.2681437731, -0.0041119885,
   -3.3072168827,  2.6093323231, -0.7034763098,
    0.2307590544, -0.3411344290,  1.7068625689
);
```

Conversions: `to_oklab(rgb) = sign(M*rgb) * pow(abs(M*rgb), 1/3)`, `from_oklab(lab) = M_inv * (lab^3)`

#### ACES Matrices (Available but not active)

```wgsl
const ACES_INPUT_MAT = mat3x3<f32>(
    0.59719, 0.07600, 0.02840,
    0.35458, 0.90834, 0.13383,
    0.04823, 0.01566, 0.83777
);
const ACES_OUTPUT_MAT = mat3x3<f32>(
     1.60475, -0.10208, -0.00327,
    -0.53108,  1.10813, -0.07276,
    -0.07367, -0.00605,  1.07602
);
```

#### Radiance Ray Tracing (Shader 2)

For each pixel outside the triangle:
1. Compute the **angular interval** subtended by the triangle from the pixel.
2. Cast `MAX_RAYS = 24` evenly-spaced rays within that arc, with IGN (Interleaved Gradient Noise) jitter of amplitude `0.7`.
3. For each ray, find intersection with a triangle edge via `ray_segment_t` (2D ray-segment parametric intersection).
4. At the hit point, sample the `light_sources_tex` for the LED color.
5. Attenuate by: `pow(max(distance * target_scale, 1.0), -params.y) * exp(-params.x * distance)`
6. Accumulate and divide by `MAX_RAYS`, multiply by `params.z`.

Extracted `params` from `buffer_20_floats`:
- `params.x` (absorption) = `0.003650`
- `params.y` (distance falloff) = `1.0`
- `params.z` (intensity) = `50.0`
- `params.w` (threshold) = `0.001`

#### Radiance Upsampling

- **Shader 3 (Dark)**: B-spline (Mitchell-Netravali, B=1, C=0) 4x4 kernel.
- **Shader 4 (Light/Color)**: Catmull-Rom 4x4 kernel.

#### Floor Compositing

The floor is composited in OKLab space:

```wgsl
// Background base = floor noise * tunables.y (albedo)
let bg = vec3f(mix(tunables.y, tunables.y * 0.5, noise * grain_scale));

// Blend light sources in OKLab
if (light_intensity > 0.0) {
    result = from_oklab(mix(to_oklab(bg), to_oklab(light.rgb), light_intensity));
}

// Apply radiance with 3-zone glow (near, middle, glow)
let near_glow  = pow(remap(luma, near.z, near.w), params.x) * near.y * toggles.x;
let middle_glow = pow(remap(sdf, ...), middle.x) * middle.y * smoothstep(...) * toggles.y;
let far_glow   = pow(remap(luma, glow.z, glow.w), params.z) * glow.x * toggles.z;

// Lottes tonemap -> gamma correct -> contrast adjust -> edge fade
```

### 2.3 Particle & LED Array

#### 72-LED Emitter Positions

LEDs are arranged along the three edges of the triangle. Each LED is an oriented rectangle rendered as 2 triangles (6 vertices).

**Left edge** (LEDs 0-23, top to bottom-left):

| LED | Center X | Center Y |
|---|---|---|
| 0 | 404.2 | 185.5 |
| 1 | 399.9 | 194.5 |
| 2 | 396.9 | 199.7 |
| 3 | 393.9 | 205.0 |
| 4 | 390.9 | 210.2 |
| 5 | 387.9 | 215.4 |
| 6 | 384.9 | 220.6 |
| 7 | 381.8 | 225.8 |
| 8 | 378.8 | 231.1 |
| 9 | 375.8 | 236.3 |
| 10 | 372.8 | 241.5 |
| 11 | 369.8 | 246.7 |
| 12 | 366.8 | 251.9 |
| 13 | 363.8 | 257.2 |
| 14 | 360.7 | 262.4 |
| 15 | 357.7 | 267.6 |
| 16 | 354.7 | 272.8 |
| 17 | 351.7 | 278.1 |
| 18 | 348.7 | 283.3 |
| 19 | 345.7 | 288.5 |
| 20 | 342.7 | 293.7 |
| 21 | 339.6 | 298.9 |
| 22 | 336.6 | 304.2 |
| 23 | 330.9 | 312.3 |

**Bottom edge** (LEDs 24-47, left to right):

| LED | Center X | Center Y |
|---|---|---|
| 24 | 337.8 | 324.2 |
| 25 | 347.7 | 323.3 |
| 26 | 353.7 | 323.3 |
| 27 | 359.8 | 323.3 |
| 28 | 365.8 | 323.3 |
| 29 | 371.8 | 323.3 |
| 30 | 377.8 | 323.3 |
| 31 | 383.9 | 323.3 |
| 32 | 389.9 | 323.3 |
| 33 | 395.9 | 323.3 |
| 34 | 402.0 | 323.3 |
| 35 | 408.0 | 323.3 |
| 36 | 414.0 | 323.3 |
| 37 | 420.0 | 323.3 |
| 38 | 426.1 | 323.3 |
| 39 | 432.1 | 323.3 |
| 40 | 438.1 | 323.3 |
| 41 | 444.2 | 323.3 |
| 42 | 450.2 | 323.3 |
| 43 | 456.2 | 323.3 |
| 44 | 462.2 | 323.3 |
| 45 | 468.3 | 323.3 |
| 46 | 474.3 | 323.3 |
| 47 | 484.2 | 324.2 |

**Right edge** (LEDs 48-71, bottom-right to top):

| LED | Center X | Center Y |
|---|---|---|
| 48 | 491.1 | 312.3 |
| 49 | 485.4 | 304.2 |
| 50 | 482.4 | 298.9 |
| 51 | 479.3 | 293.7 |
| 52 | 476.3 | 288.5 |
| 53 | 473.3 | 283.3 |
| 54 | 470.3 | 278.1 |
| 55 | 467.3 | 272.8 |
| 56 | 464.3 | 267.6 |
| 57 | 461.3 | 262.4 |
| 58 | 458.2 | 257.2 |
| 59 | 455.2 | 251.9 |
| 60 | 452.2 | 246.7 |
| 61 | 449.2 | 241.5 |
| 62 | 446.2 | 236.3 |
| 63 | 443.2 | 231.1 |
| 64 | 440.2 | 225.8 |
| 65 | 437.1 | 220.6 |
| 66 | 434.1 | 215.4 |
| 67 | 431.1 | 210.2 |
| 68 | 428.1 | 205.0 |
| 69 | 425.1 | 199.7 |
| 70 | 422.1 | 194.5 |
| 71 | 417.8 | 185.5 |

#### LED Vertex Format

Each vertex is a 6-float stride: `[position.x, position.y, local.x, local.y, led_index, padding]`

- `local.x` / `local.y` encode the oriented rectangle's basis vectors (magnitude approx 3.514 x 7.985 px)
- LED rectangles are approximately **7.03 x 15.97 px** each
- Corner LEDs (0, 23, 24, 47, 48, 71) have 9 vertices (3 triangles) for a slightly different shape

#### LED Runtime Data (Storage Buffer)

In the shader, each LED is a `struct Led { pos_brightness: vec4f, color: vec4f }`:
- `pos_brightness.xy` = position
- `pos_brightness.z` = brightness (0.0-1.0)
- `pos_brightness.w` = orientation angle (radians)
- `color.rgb` = emitter color

The brightness is used to interpolate the emitter intensity:
```wgsl
let j = mix(cfg.tunables.y, cfg.tunables.z, brightness);
let k = led.color.rgb * cfg.tunables.x * j;
```

#### Particle System (Shader 6)

```wgsl
struct ParticleUniform {
    origin_scale_strength: vec4f,  // xy=origin, z=scale, w=strength
    rt_size: vec4f,                // xy=render_target_size, z=base_intensity, w=enable
};
```

Extracted values:
- `origin` = `(0, 0)`
- `scale` = `1.0`
- `strength` = `0.0` (particles inactive at capture)
- `rt_size` = `(822, 548)`
- `base_intensity` = `0.0867` (approx 1/11.54)
- `frame_rate` = `60`

---

## 3. State Machine & Interaction

### 3.1 Uniform Buffer Layout

#### `buffer_28_floats` -> Maps to `Config` for Shaders 3/4

| Index | Field | Static Value | Notes |
|---|---|---|---|
| 0 | `screen.x` | `822` | Canvas width |
| 1 | `screen.y` | `548` | Canvas height |
| 2 | `screen.z` -> **`time`** | **Varies** | Elapsed time (seconds) |
| 3 | `screen.w` | `1` | DPR |
| 4 | `triangle.x` | `411` | Center X |
| 5 | `triangle.y` | `274` | Center Y |
| 6 | `triangle.z` | `1` | -- |
| 7 | `triangle.w` | `28` | -- |
| 8-11 | `culling` | `(1, 1, 1, 0)` | Enable flags |
| 12 | `radiance_fit[0]` | `1` | -- |
| 13 | **`radiance_fit[1]`** | **Varies** | Oscillating glow parameter |
| 14 | `radiance_fit[2]` | `1.02` | -- |
| 15 | `radiance_fit[3]` | `3.843` | -- |
| 16 | `sim_transform.x` | `411` | Transform origin X |
| 17 | `sim_transform.y` | `274` | Transform origin Y |
| 18 | `sim_transform.z` | `108.556` | Transform scale X |
| 19 | `sim_transform.w` | `94.012` | Transform scale Y |
| 20-21 | -- | `(1, 1)` | -- |
| 22-23 | -- | `(2.821, 7.686)` | -- |
| 24-25 | -- | `(2, 2)` | -- |
| 26-27 | -- | `(0, 0)` | -- |

#### `buffer_64_floats` -> Maps to `LightGlow` for Shader 4

| Index | Field | Value | Notes |
|---|---|---|---|
| 0-3 | `near` | `(0.268, 4.0, 0.0, 20.0)` | Near-field glow params |
| 4-7 | `middle` | `(3.3, 1.6, 0.5, 0.0)` | Mid-range glow params |
| 8-11 | `glow` | `(1.2, *, 0.0, 3.0)` | Far glow; `glow.y` [idx 9] **oscillates** |
| 12-15 | `params` | `(8.0, 3.95, 0.71, 41.0)` | Power curves, thresholds |
| 16-19 | `toggles` | `(1.0, 1.0, 1.0, 1.06)` | Feature enable flags |
| 20-23 | `ao` | `(0.18, 0.8, 4.0, 1.0)` | Primary AO |
| 24-27 | `ao2` | `(0.15, 0.14, 1.6, 1.0)` | Secondary AO |
| 28-31 | `ao3` | `(0.21, 0.18, 3.8, 1.0)` | Tertiary AO |
| 32-35 | `edgeRed` | `(0.804, 0.739, 0.701, 2.5)` | Left edge OKLab tint + power |
| 36-39 | `edgeGreen` | `(0.808, 0.834, 0.755, 0.0)` | Bottom edge OKLab tint |
| 40-43 | `edgeBlue` | `(0.677, 0.725, 0.906, 0.0)` | Right edge OKLab tint |
| 44-47 | `nearColor` | `(0.116, 0.2, 0.36, 4.0)` | -- |
| 48-51 | `middleColor` | `(5.3, 0.34, 0.0, 0.0)` | -- |
| 52-55 | `glowColor` | `(0.45, 0.0, 0.0, 1.25)` | -- |
| 56-59 | `paramsColor` | `(1.95, 3.95, 0.22, 0.0)` | -- |
| 60-63 | `togglesColor` | `(1.0, 1.0, 1.0, 1.58)` | -- |

### 3.2 Click State Transitions

Only **3 values** change across clicks. The animation is driven by a continuous `time` uniform, not discrete click states:

| Click | `time` (b28[2]) | `floor_albedo` (b28[13]) | `glow.y` (b64[9]) |
|---|---|---|---|
| 0 | 1.7085 | 0.2673 | 0.9258 |
| 1 | 2.2289 | 0.0881 | 0.0767 |
| 2 | 2.7491 | 0.2717 | 0.9234 |
| 3 | 3.2695 | 0.0883 | 0.0766 |
| 4 | 3.7897 | 0.2717 | 0.9235 |

#### Observations

1. **Time advances ~0.52s per click** (captures were taken with 500ms delay between clicks).
2. **`floor_albedo` and `glow.y` oscillate** between two states:
   - **High state**: `floor_albedo ~ 0.27`, `glow.y ~ 0.92` (clicks 0, 2, 4)
   - **Low state**: `floor_albedo ~ 0.088`, `glow.y ~ 0.077` (clicks 1, 3)
3. This is **not a click-driven state machine** -- it is a **continuous time-based animation**. The oscillation is likely a `sin(time)` or `smoothstep` cycle. The LED brightness and colors animate continuously; clicks happen to sample different phases.
4. The `glow.y` field controls the interpolation between `LightGlow.near`/`LightGlow.nearColor` in the shader (`let d = clamp(lg.glow.y, 0.0, 1.0)`), switching between monochrome and per-edge-tinted rendering.

#### Invariant State (Does Not Change on Click)

- `buffer_20_floats` (radiance tracer config): **fully static**
- `buffer_8_floats` (particle uniform): **fully static**
- `buffer_2700_floats` (LED vertex positions): **fully static**
- All 64 values of `buffer_64_floats` except index 9: **fully static**
- All 28 values of `buffer_28_floats` except indices 2 and 13: **fully static**

---

## 4. DOM Structure & CSS Tokens

### 4.1 CSS Custom Properties

Defined on the `<section>` element:

```css
--hero-canvas-max: 720px;
--hero-zoom-freeze-h: 560px;
--hero-shader-y-offset: 20px;
```

### 4.2 Key Data Attributes

| Attribute | Element | Purpose |
|---|---|---|
| `data-hero-static-fallback="triangle-led-4"` | Fallback wrapper | SSR fallback identifier |
| `data-hero-drop-active="false"` | `group/hero` div | Drag-and-drop state |
| `data-hero-drop-staging="false"` | `group/hero` div | Deploy staging animation |
| `data-triangle-led-4-hero-canvas="true"` | `<canvas>` | Canvas identifier (client-only) |

### 4.3 Canvas Container CSS

```css
/* Positioning */
.canvas-container {
    position: absolute;
    left: 50%;
    top: calc(50% + var(--hero-shader-y-offset, 0px));
    transform: translate(-50%, -50%);
}

/* Sizing */
.canvas-container {
    height: min(125vw, 400px);        /* mobile */
    aspect-ratio: 3 / 2;
    max-width: 100vw;
}
@container (min-width: 1024px) {      /* desktop */
    height: 100%;
    max-height: var(--hero-canvas-max);
    max-width: min(calc(1.5 * var(--hero-canvas-max)), 100vw);
}
```

### 4.4 Canvas Element

```html
<canvas
    data-triangle-led-4-hero-canvas="true"
    class="absolute inset-0 block h-full w-full opacity-0 transition-opacity ease-linear duration-1200"
    width="822"
    height="548"
    style="opacity: 1;">
</canvas>
```

The canvas fades in with a 1200ms `ease-linear` opacity transition after WebGPU initialization.

### 4.5 Hero Section Structure

```html
<section 
  class="relative flex min-h-[min(calc(100svh-var(--header-height)),1100px)] flex-col select-none" 
  style="--hero-canvas-max:720px;--hero-zoom-freeze-h:560px;--hero-shader-y-offset:20px" 
  data-cdp-scope='{"name":"hero"}'>

  <div class="relative flex min-h-0 flex-1 flex-col justify-center">
    <div 
      class="group/hero relative flex min-h-0 flex-1 flex-col items-center justify-center ..."
      data-hero-drop-active="false" 
      data-hero-drop-staging="false">

      <!-- Triangle / Canvas Holder & Fallback Layer -->
      <div class="pointer-events-none z-0 relative flex-1 w-full min-h-0 ...">
        <div class="absolute left-1/2 top-[calc(50%+var(--hero-shader-y-offset,0px))] ...">
          <div aria-hidden="true" class="absolute inset-0 transition-opacity duration-700 ...">
            <!-- Light Mode SVG -->
            <!-- Dark Mode Fallback Images -->
            <!-- WebGPU Canvas (injected client-side) -->
          </div>
        </div>
      </div>

      <!-- Hero Header Copy -->
      <header class="relative z-10 ...">
        <h1>Agentic Infrastructure</h1>
        <!-- ScrambleText subtitle -->
        <!-- CTAs: "Deploy now" + "Talk to sales" -->
      </header>

      <!-- Capabilities Nav (desktop only) -->
      <div class="hidden ... @lg:block">
        <nav aria-label="Platform capabilities">
          <!-- "For coding agents", "To ship apps and agents", "Automated by agents" -->
        </nav>
      </div>

    </div>
  </div>
</section>
```

---

## 5. Implementation Guide

### 5.1 WebGPU Canvas Setup

```javascript
// 1. Create canvas and get WebGPU adapter
const canvas = document.createElement('canvas');
canvas.width = 822;
canvas.height = 548;

const adapter = await navigator.gpu.requestAdapter();
const device = await adapter.requestDevice();

// 2. Configure the canvas context
const context = canvas.getContext('webgpu');
context.configure({
    device,
    format: navigator.gpu.getPreferredCanvasFormat(),
    alphaMode: 'premultiplied',
});
```

### 5.2 Uniform Buffer Creation

```javascript
// Config buffer (28 floats = 112 bytes, padded to 128)
const configBuffer = device.createBuffer({
    size: 128,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});

// LightGlow buffer (64 floats = 256 bytes)
const lightGlowBuffer = device.createBuffer({
    size: 256,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});

// LED storage buffer (72 LEDs x 8 floats x 4 bytes = 2304 bytes)
const ledBuffer = device.createBuffer({
    size: 72 * 8 * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
});

// LED vertex buffer (2700 floats = 10800 bytes)
const ledVertexBuffer = device.createBuffer({
    size: 2700 * 4,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
});
```

### 5.3 Render Pass Structure

```javascript
function render(time) {
    // Update time uniform
    configData[2] = time;
    device.queue.writeBuffer(configBuffer, 0, configData);

    const encoder = device.createCommandEncoder();

    // Pass 1: LED SDF mask -> lightSourcesTexture
    // Pass 2: LED emitter color -> lightSourcesTexture (additive)
    // Pass 3: Radiance ray trace -> radianceTexture
    // Pass 4: Floor noise -> floorNoiseTexture
    // Pass 5: Particles -> particleTexture
    // Pass 6: Final compositing -> canvas

    device.queue.submit([encoder.finish()]);
    requestAnimationFrame(render);
}
```

### 5.4 Shader Module Registration

```javascript
// Create all 7 shader modules
const shaderModules = shaderSources.map(source =>
    device.createShaderModule({ code: source })
);

// Create render pipelines for each pass
// Pass 1 (LED SDF): fullscreen triangle, output R32Float
// Pass 2 (LED Color): instanced quads (450 vertices, 72 instances), additive blend
// Pass 3 (Radiance): fullscreen triangle, output RGBA16Float
// Pass 4 (Noise): fullscreen triangle, output R8Unorm
// Pass 5 (Particles): instanced points, output R8Unorm
// Pass 6 (Composite): fullscreen triangle, output to swapchain
```

### 5.5 Key Implementation Notes

1. **Fullscreen Triangle**: Shaders 0, 2, 3, 4, 5 all use the same fullscreen-triangle vertex shader:
   ```wgsl
   var b = array<vec2f, 3>(vec2f(-1.0, -3.0), vec2f(-1.0, 1.0), vec2f(3.0, 1.0));
   ```
   This renders a single oversized triangle covering the entire viewport (a common WebGPU optimization over a quad).

2. **Texture Intermediates**: The pipeline requires intermediate render targets:
   - `lightSourcesTexture` (Pass 1+2 output, Pass 3+6 input)
   - `radianceTexture` (Pass 3 output, Pass 6 input)
   - `floorNoiseTexture` (Pass 4 output, Pass 6 input)
   - `particleTexture` (Pass 5 output, Pass 6 input)

3. **Animation Loop**: Update `time` uniform every frame. LED brightness and colors are animated on the CPU and written to the storage buffer each frame.

4. **DPR Scaling**: Multiply canvas `width`/`height` by `devicePixelRatio`, pass DPR as `screen.w` uniform, and CSS-scale the canvas to logical size.

---

## 6. Raw Data Files

| File | Size | Contents |
|---|---|---|
| `extracted_vercel_triangle.json` | 448 KB | Full shader sources + complete uniform buffers (all 2700 LED floats, all click states) |
| `extracted_shaders.json` | 41 KB | Shader sources + truncated uniform samples |
| `extract.js` | 8 KB | Playwright extraction script with WebGPU API hooks |
| `view-source_https___vercel.com.html` | 917 KB | Full HTML source of vercel.com |

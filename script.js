/*********************
 * RESPONSIVE WARNING *
 *********************/

const responsiveWarning = document.getElementById("responsive-warning");
const responsiveDesign = true;

if (!responsiveDesign && window.innerWidth <= 768) {
  responsiveWarning.classList.add("show");
}

/**********************
 * CONFIG + QUALITY    *
 **********************/

const DEFAULT_CONFIG = {
  color: "#4d4d4d",
  bgColorLight: "#f5f5f5",
  bgColorDark: "#020408",
  speed: 1.0,
  waveHeight: 1.0,
  // "auto" | "low" | "medium" | "high"
  quality: "auto",
};

const QUALITY_TIERS = {
  low: { layers: 4, dprCap: 1.0, targetFps: 30, precision: "mediump" },
  medium: { layers: 6, dprCap: 1.0, targetFps: 60, precision: "mediump" },
  high: { layers: 7, dprCap: 2.0, targetFps: 60, precision: "highp" },
};

// Ordered for one-way auto-downgrade walk.
const QUALITY_ORDER = ["high", "medium", "low"];
const CONFIG_STORAGE_KEY = "xmb-wave-config";

function loadStoredConfig() {
  try {
    const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveStoredConfig(cfg) {
  try {
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(cfg));
  } catch {
    /* storage disabled or quota exceeded */
  }
}

function detectQuality() {
  const ua = navigator.userAgent || "";
  if (/Mobi|Android|iPhone|iPad/.test(ua)) return "low";

  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 8;

  if (cores < 4 || mem <= 4) return "medium";
  return "high";
}

function resolveTier(quality) {
  if (quality === "auto") return detectQuality();
  if (QUALITY_TIERS[quality]) return quality;
  return "high";
}

function hexToRgb(hex) {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex);
  if (!m) return [0.3, 0.3, 0.3];
  return [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255];
}

// Compose final config: defaults <- author overrides <- user-saved overrides.
const authorConfig =
  window.XMBWaveConfig && typeof window.XMBWaveConfig === "object" ? window.XMBWaveConfig : {};
const storedConfig = loadStoredConfig();
const config = { ...DEFAULT_CONFIG, ...authorConfig, ...storedConfig };
let effectiveTier = resolveTier(config.quality);

/*******************************
 * XMB WAVE BACKGROUND BEHAVIOR *
 *******************************/

const body = document.body;

const canvas = document.getElementById("webgl-canvas");
const context = canvas.getContext("webgl");

if (!context) {
  console.error("WebGL not supported");
} else {
  // The shader emits (waveColor, intensity) per pixel; standard alpha blending
  // composites it over the canvas clearColor (= bg color).
  context.enable(context.BLEND);
  context.blendFunc(context.SRC_ALPHA, context.ONE_MINUS_SRC_ALPHA);
}

let shaderProgram = null;
let vertexShader = null;
let timeUniformLocation = null;
let resolutionUniformLocation = null;
let baseColorUniformLocation = null;
let speedMulUniformLocation = null;
let amplitudeMulUniformLocation = null;
let positionAttribLocation = null;

// DPR-aware canvas sizing. CSS sizing keeps the canvas viewport-filling;
// canvas.width/height set the pixel buffer at the tier's DPR cap.
function resizeCanvas() {
  const tier = QUALITY_TIERS[effectiveTier];
  const dpr = Math.min(window.devicePixelRatio || 1, tier.dprCap);
  canvas.width = Math.max(1, Math.floor(window.innerWidth * dpr));
  canvas.height = Math.max(1, Math.floor(window.innerHeight * dpr));
  if (context) {
    context.viewport(0, 0, canvas.width, canvas.height);
    if (resolutionUniformLocation) pushResolutionUniform();
  }
}

let resizeScheduled = false;
window.addEventListener("resize", () => {
  if (resizeScheduled) return;
  resizeScheduled = true;
  requestAnimationFrame(() => {
    resizeScheduled = false;
    resizeCanvas();
  });
});

// Vertex shader (passthrough).
const vertexShaderSource = `
attribute vec2 aVertexPosition;
void main() {
    gl_Position = vec4(aVertexPosition, 0.0, 1.0);
}
`;

// Fragment shader source is generated per quality tier so we can vary
// the precision qualifier and drop trailing wave layers on low-end devices.
function buildFragmentShader(precision, layers) {
  const optionalLayers = [
    "	intensity += calcWave(uv, 0.3, 0.36, 0.07, 0.0, 0.3, 0.1, 17.0, true);",
    "	intensity += calcWave(uv, 0.5, 0.46, 0.07, 0.0, 0.3, 0.05, 23.0, true);",
    "	intensity += calcWave(uv, 0.2, 0.58, 0.05, 0.0, 0.3, 0.2, 15.0, true);",
  ];
  const extraLines = optionalLayers.slice(0, Math.max(0, layers - 4)).join("\n");

  return `precision ${precision} float;

// Elapsed time in seconds.
uniform float uTime;
// Viewport resolution.
uniform vec2  uResolution;
// Customizable wave color (alpha-blended over the canvas bg).
uniform vec3  uBaseColor;
// Global speed multiplier.
uniform float uSpeedMul;
// Global amplitude (wave height) multiplier.
uniform float uAmplitudeMul;

const float waveWidthFactor = 1.5;

float calcWave(
	vec2 uv,
	float speed,
	float frequency,
	float amplitude,
	float phaseShift,
	float verticalOffset,
	float lineWidth,
	float sharpness,
	bool invertFalloff
) {
	float t = uTime * uSpeedMul;
	float amp = amplitude * uAmplitudeMul;

	float angle = t * speed * frequency * -1.0 + (phaseShift + uv.x) * 2.0;
	float waveY = sin(angle) * amp + verticalOffset;
	float deltaY = waveY - uv.y;
	float distanceVal = distance(waveY, uv.y);

	if (invertFalloff) {
		if (deltaY > 0.0) {
			distanceVal = distanceVal * 4.0;
		}
	} else {
		if (deltaY < 0.0) {
			distanceVal = distanceVal * 4.0;
		}
	}

	float smoothVal = smoothstep(lineWidth * waveWidthFactor, 0.0, distanceVal);
	return pow(smoothVal, sharpness);
}

void main() {
	vec2 uv = gl_FragCoord.xy / uResolution;

	float intensity = 0.0;
	intensity += calcWave(uv, 0.2, 0.20, 0.20, 0.0, 0.5, 0.1, 15.0, false);
	intensity += calcWave(uv, 0.4, 0.40, 0.15, 0.0, 0.5, 0.1, 17.0, false);
	intensity += calcWave(uv, 0.3, 0.60, 0.15, 0.0, 0.5, 0.05, 23.0, false);
	intensity += calcWave(uv, 0.1, 0.26, 0.07, 0.0, 0.3, 0.1, 17.0, true);
${extraLines}

	intensity = clamp(intensity, 0.0, 1.0);
	if (intensity <= 0.001) discard;

	// Emit unpremultiplied (waveColor, intensity); GL blends it over the bg.
	gl_FragColor = vec4(uBaseColor, intensity);
}`;
}

// Compile shader and log errors.
function compileShader(source, type) {
  const shader = context.createShader(type);
  context.shaderSource(shader, source);
  context.compileShader(shader);

  if (!context.getShaderParameter(shader, context.COMPILE_STATUS)) {
    console.error("Shader error:", context.getShaderInfoLog(shader));
    context.deleteShader(shader);
    return null;
  }

  return shader;
}

function buildProgramForTier(tierName) {
  const tier = QUALITY_TIERS[tierName];
  const fs = compileShader(
    buildFragmentShader(tier.precision, tier.layers),
    context.FRAGMENT_SHADER,
  );
  if (!fs) return null;

  const program = context.createProgram();
  context.attachShader(program, vertexShader);
  context.attachShader(program, fs);
  context.linkProgram(program);
  // Flag for deletion now; GL frees it when the owning program is deleted.
  context.deleteShader(fs);

  if (!context.getProgramParameter(program, context.LINK_STATUS)) {
    console.error("Link error:", context.getProgramInfoLog(program));
    return null;
  }

  return program;
}

function fetchUniformLocations() {
  timeUniformLocation = context.getUniformLocation(shaderProgram, "uTime");
  resolutionUniformLocation = context.getUniformLocation(shaderProgram, "uResolution");
  baseColorUniformLocation = context.getUniformLocation(shaderProgram, "uBaseColor");
  speedMulUniformLocation = context.getUniformLocation(shaderProgram, "uSpeedMul");
  amplitudeMulUniformLocation = context.getUniformLocation(shaderProgram, "uAmplitudeMul");
}

function bindQuadAttribute() {
  positionAttribLocation = context.getAttribLocation(shaderProgram, "aVertexPosition");
  context.enableVertexAttribArray(positionAttribLocation);
  context.vertexAttribPointer(positionAttribLocation, 2, context.FLOAT, false, 0, 0);
}

function initializeWebGL() {
  vertexShader = compileShader(vertexShaderSource, context.VERTEX_SHADER);
  shaderProgram = buildProgramForTier(effectiveTier);
  if (!shaderProgram) return;
  context.useProgram(shaderProgram);

  // Full-screen quad buffer.
  const buffer = context.createBuffer();
  context.bindBuffer(context.ARRAY_BUFFER, buffer);
  const verts = new Float32Array([-1.0, -1.0, 1.0, -1.0, -1.0, 1.0, 1.0, 1.0]);
  context.bufferData(context.ARRAY_BUFFER, verts, context.STATIC_DRAW);

  bindQuadAttribute();
  fetchUniformLocations();
}

// Swap program when the active quality tier changes.
function recompileShader() {
  const newProgram = buildProgramForTier(effectiveTier);
  if (!newProgram) return;

  if (shaderProgram) context.deleteProgram(shaderProgram);
  shaderProgram = newProgram;
  context.useProgram(shaderProgram);

  bindQuadAttribute();
  fetchUniformLocations();
  pushAllUniforms();
}

/******************
 * UNIFORM PUSH    *
 ******************/

function pushColorUniform() {
  const [r, g, b] = hexToRgb(config.color);
  context.uniform3f(baseColorUniformLocation, r, g, b);
}

function pushSpeedUniform() {
  context.uniform1f(speedMulUniformLocation, config.speed);
}

function pushAmplitudeUniform() {
  context.uniform1f(amplitudeMulUniformLocation, config.waveHeight);
}

function pushResolutionUniform() {
  context.uniform2f(resolutionUniformLocation, canvas.width, canvas.height);
}

function pushAllUniforms() {
  pushColorUniform();
  pushSpeedUniform();
  pushAmplitudeUniform();
  pushResolutionUniform();
}

/******************
 * RENDER LOOP     *
 ******************/

let lastFrameMs = 0;
let frameBudget = 1000 / QUALITY_TIERS[effectiveTier].targetFps;
let paused = false;
let pauseStartMs = 0;
// Offset subtracted from timeMs so uTime doesn't jump after a pause.
let pauseAccumulatedMs = 0;

const fpsTimes = [];
const fpsDeltas = [];
let fpsSumDelta = 0;
const FPS_HISTORY_MS = 2000;
let downgradeWindowStart = 0;

function recordFrameSample(timeMs, delta) {
  fpsTimes.push(timeMs);
  fpsDeltas.push(delta);
  fpsSumDelta += delta;
  while (fpsTimes.length && timeMs - fpsTimes[0] > FPS_HISTORY_MS) {
    fpsTimes.shift();
    fpsSumDelta -= fpsDeltas.shift();
  }
  return fpsTimes.length ? 1000 / (fpsSumDelta / fpsTimes.length) : 0;
}

function renderFrame(timeMs) {
  requestAnimationFrame(renderFrame);

  if (paused || !shaderProgram) return;

  const delta = lastFrameMs ? timeMs - lastFrameMs : frameBudget;
  // Allow 10% slack so a 60 fps target isn't locked at 59 fps by jitter.
  if (lastFrameMs && delta < frameBudget * 0.9) return;

  if (lastFrameMs) {
    const avgFps = recordFrameSample(timeMs, delta);
    maybeAutoDowngrade(timeMs, avgFps);
    if (debugIndicator) updateDebugIndicator(avgFps);
  }
  lastFrameMs = timeMs;

  const animMs = timeMs - pauseAccumulatedMs;
  context.clear(context.COLOR_BUFFER_BIT);
  context.uniform1f(timeUniformLocation, animMs * 0.001);
  context.drawArrays(context.TRIANGLE_STRIP, 0, 4);
}

// One-way: only auto-downgrades on sustained slowness; never re-upgrades.
function maybeAutoDowngrade(timeMs, avgFps) {
  if (config.quality !== "auto") return;
  if (fpsTimes.length < 20) return;

  const target = QUALITY_TIERS[effectiveTier].targetFps;

  if (avgFps < target * 0.7) {
    if (!downgradeWindowStart) downgradeWindowStart = timeMs;
    if (timeMs - downgradeWindowStart >= 3000) {
      const idx = QUALITY_ORDER.indexOf(effectiveTier);
      if (idx >= 0 && idx < QUALITY_ORDER.length - 1) {
        const next = QUALITY_ORDER[idx + 1];
        console.info(
          `[XMBWave] Auto-downgrade ${effectiveTier} -> ${next} (avg ${avgFps.toFixed(1)} fps)`,
        );
        applyTier(next);
      }
      downgradeWindowStart = 0;
    }
  } else {
    downgradeWindowStart = 0;
  }
}

function applyTier(tierName) {
  if (!QUALITY_TIERS[tierName]) return;
  effectiveTier = tierName;
  frameBudget = 1000 / QUALITY_TIERS[tierName].targetFps;
  recompileShader();
  resizeCanvas();
  fpsTimes.length = 0;
  fpsDeltas.length = 0;
  fpsSumDelta = 0;
  downgradeWindowStart = 0;
  lastFrameMs = 0;
}

/******************
 * VISIBILITY      *
 ******************/

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    if (!paused) {
      paused = true;
      pauseStartMs = performance.now();
    }
  } else if (paused) {
    paused = false;
    pauseAccumulatedMs += performance.now() - pauseStartMs;
    lastFrameMs = 0;
  }
});

/******************
 * SETTINGS PANEL  *
 ******************/

let settingsPanel = null;
let settingsBtn = null;
const settingsRefs = {};

function buildSettingsPanel() {
  settingsBtn = document.getElementById("settings-btn");

  settingsPanel = document.createElement("aside");
  settingsPanel.id = "settings-panel";
  settingsPanel.innerHTML = `
		<div class="settings-row">
			<label for="settings-color">Wave color</label>
			<input type="color" id="settings-color">
		</div>
		<div class="settings-row">
			<label for="settings-bg-color">Background <span id="settings-bg-mode"></span></label>
			<input type="color" id="settings-bg-color">
		</div>
		<div class="settings-row">
			<label for="settings-speed">Speed <span id="settings-speed-val"></span></label>
			<input type="range" id="settings-speed" min="0.1" max="3" step="0.05">
		</div>
		<div class="settings-row">
			<label for="settings-wave-height">Wave height <span id="settings-wave-height-val"></span></label>
			<input type="range" id="settings-wave-height" min="0.1" max="2" step="0.05">
		</div>
		<div class="settings-row">
			<label for="settings-quality">Quality</label>
			<select id="settings-quality">
				<option value="auto">Auto</option>
				<option value="low">Low</option>
				<option value="medium">Medium</option>
				<option value="high">High</option>
			</select>
		</div>
		<button id="settings-reset" type="button">Reset to defaults</button>
	`;
  document.querySelector("main").appendChild(settingsPanel);

  settingsRefs.color = document.getElementById("settings-color");
  settingsRefs.bgColor = document.getElementById("settings-bg-color");
  settingsRefs.bgMode = document.getElementById("settings-bg-mode");
  settingsRefs.speed = document.getElementById("settings-speed");
  settingsRefs.speedVal = document.getElementById("settings-speed-val");
  settingsRefs.waveHeight = document.getElementById("settings-wave-height");
  settingsRefs.waveHeightVal = document.getElementById("settings-wave-height-val");
  settingsRefs.quality = document.getElementById("settings-quality");
  settingsRefs.reset = document.getElementById("settings-reset");

  settingsBtn.addEventListener("click", () => {
    const isOpen = settingsPanel.classList.toggle("show");
    settingsBtn.setAttribute("aria-expanded", isOpen ? "true" : "false");
  });

  const inputs = [
    { ref: "color", evt: "input", make: (v) => ({ color: v }) },
    {
      ref: "bgColor",
      evt: "input",
      make: (v) => ({
        [body.classList.contains("dark-mode") ? "bgColorDark" : "bgColorLight"]: v,
      }),
    },
    { ref: "speed", evt: "input", make: (v) => ({ speed: parseFloat(v) }) },
    {
      ref: "waveHeight",
      evt: "input",
      make: (v) => ({ waveHeight: parseFloat(v) }),
    },
    { ref: "quality", evt: "change", make: (v) => ({ quality: v }) },
  ];
  for (const { ref, evt, make } of inputs) {
    settingsRefs[ref].addEventListener(evt, (e) => updateConfig(make(e.target.value)));
  }
  settingsRefs.reset.addEventListener("click", () => updateConfig({ ...DEFAULT_CONFIG }));
}

function syncUIFromConfig() {
  if (!settingsRefs.color) return;
  settingsRefs.color.value = config.color;
  settingsRefs.speed.value = String(config.speed);
  settingsRefs.speedVal.textContent = `${Number(config.speed).toFixed(2)}x`;
  settingsRefs.waveHeight.value = String(config.waveHeight);
  settingsRefs.waveHeightVal.textContent = `${Number(config.waveHeight).toFixed(2)}x`;
  settingsRefs.quality.value = config.quality;
  syncBgPicker();
}

/******************
 * CONFIG UPDATE   *
 ******************/

let saveTimer = 0;
function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = 0;
    saveStoredConfig(config);
  }, 150);
}

const CONFIG_EFFECTS = [
  { keys: ["waveColorLight", "waveColorDark"], run: pushColorUniform },
  { keys: ["speed"], run: pushSpeedUniform },
  { keys: ["waveHeight"], run: pushAmplitudeUniform },
  { keys: ["bgColorLight", "bgColorDark"], run: applyBgColor },
  { keys: ["quality"], run: () => applyTier(resolveTier(config.quality)) },
];

function updateConfig(partial) {
  const changed = {};
  for (const k of Object.keys(partial)) {
    if (partial[k] !== config[k]) {
      config[k] = partial[k];
      changed[k] = true;
    }
  }
  if (Object.keys(changed).length === 0) return;

  scheduleSave();
  for (const { keys, run } of CONFIG_EFFECTS) {
    if (keys.some((k) => changed[k])) run();
  }
  syncUIFromConfig();
}

/******************
 * DEBUG INDICATOR *
 ******************/

// Enabled with ?debug=1 in the URL — handy for verifying the FPS watchdog.
let debugIndicator = null;

function maybeBuildDebugIndicator() {
  if (!/[?&]debug=1/.test(location.search)) return;
  debugIndicator = document.createElement("div");
  debugIndicator.id = "debug-indicator";
  debugIndicator.style.cssText =
    "position:fixed;bottom:1rem;left:50%;transform:translateX(-50%);padding:0.25rem 0.5rem;background:rgba(0,0,0,0.6);color:#fff;font-family:monospace;font-size:0.75rem;border-radius:0.25rem;z-index:1000;pointer-events:none;";
  document.body.appendChild(debugIndicator);
}

function updateDebugIndicator(avgFps) {
  debugIndicator.textContent = `FPS ${avgFps.toFixed(0)} | tier ${effectiveTier} | q ${config.quality}`;
}

/******************
 * PUBLIC API      *
 ******************/

window.XMBWave = {
  updateConfig,
  getConfig: () => ({ ...config }),
  getEffectiveTier: () => effectiveTier,
  getDefaults: () => ({ ...DEFAULT_CONFIG }),
};

/***********************
 * MODE TOGGLE BEHAVIOR *
 ***********************/

const toggleModeBtn = document.getElementById("toggle-mode-btn");

// The active mode's bg color drives both the body bg and the canvas clearColor
// so the wave sits over an opaque, fully-controllable background.
function applyBgColor() {
  const isDark = body.classList.contains("dark-mode");
  const bgColor = isDark ? config.bgColorDark : config.bgColorLight;
  body.style.backgroundColor = bgColor;
  responsiveWarning.style.backgroundColor = bgColor;
  if (context) {
    const [r, g, b] = hexToRgb(bgColor);
    context.clearColor(r, g, b, 1.0);
  }
}

function syncBgPicker() {
  if (!settingsRefs.bgColor) return;
  const isDark = body.classList.contains("dark-mode");
  settingsRefs.bgColor.value = isDark ? config.bgColorDark : config.bgColorLight;
  if (settingsRefs.bgMode) {
    settingsRefs.bgMode.textContent = isDark ? "(dark)" : "(light)";
  }
}

function applyMode(mode) {
  body.classList.remove("light-mode", "dark-mode");
  body.classList.add(mode);

  const icon = mode === "dark-mode" ? "bi-sun-fill" : "bi-moon-stars-fill";
  toggleModeBtn.innerHTML = `<i class="bi ${icon}"></i>`;

  applyBgColor();
  syncBgPicker();
}

/******************
 * BOOT            *
 ******************/

if (context) {
  initializeWebGL();
  resizeCanvas();
}
buildSettingsPanel();
maybeBuildDebugIndicator();
syncUIFromConfig();

let savedMode = localStorage.getItem("mode");
if (savedMode === null) savedMode = "light-mode";
applyMode(savedMode);

if (context) {
  pushAllUniforms();
  requestAnimationFrame(renderFrame);
}

toggleModeBtn.addEventListener("click", () => {
  const newMode = body.classList.contains("light-mode") ? "dark-mode" : "light-mode";
  applyMode(newMode);
  localStorage.setItem("mode", newMode);
});

if (context) {
  pushAllUniforms();
  requestAnimationFrame(renderFrame);
}

toggleModeBtn.addEventListener("click", () => {
  const newMode = body.classList.contains("light-mode") ? "dark-mode" : "light-mode";
  applyMode(newMode);
  localStorage.setItem("mode", newMode);
});

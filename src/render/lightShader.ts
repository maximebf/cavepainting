// Full-screen shader: lights the rock wall and the paint with the torch.
// iChannel0 = rock albedo, iChannel1 = normal.xy + height, iChannel2 = paint layer.

export const LIGHT_FRAG = /* glsl */ `
precision highp float;

uniform vec2 resolution;
uniform float time;
uniform sampler2D iChannel0;
uniform sampler2D iChannel1;
uniform sampler2D iChannel2;

uniform vec3 uTorch;       // flame x, y (px, y down) and height above the wall
uniform float uIntensity;  // flicker
uniform float uRadius;
uniform float uPaintFlipY;
uniform vec3 uAmbient;
uniform vec3 uTorchColor;
uniform float uExposure;
uniform float uBump;

varying vec2 fragCoord;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec2 px = vec2(fragCoord.x, resolution.y - fragCoord.y);
  vec2 uv = px / resolution;

  vec3 albedo = texture2D(iChannel0, uv).rgb;
  vec3 nh = texture2D(iChannel1, uv).rgb;
  vec2 nxy = (nh.xy * 2.0 - 1.0) * uBump;
  vec3 n = normalize(vec3(nxy, sqrt(max(0.05, 1.0 - dot(nxy, nxy)))));
  float h = nh.b;

  vec2 puv = uPaintFlipY > 0.5 ? vec2(uv.x, 1.0 - uv.y) : uv;
  vec4 paint = texture2D(iChannel2, puv);
  float a = clamp(paint.a, 0.0, 1.0);
  a = 1.0 - (1.0 - a) * (1.0 - a); // pigment is opaque where it is thick
  vec3 pc = paint.a > 0.002 ? paint.rgb / paint.a : vec3(0.0);

  // Thin pigment only catches on the raised grain; thick layers fill the hollows.
  float grain = hash(floor(px * 0.75));
  float catchy = smoothstep(0.05, 0.6, h + a * 0.85 - 0.25 + grain * 0.12);
  a *= mix(0.62, 1.0, catchy);

  // Pigment soaks into the stone: the rock's own light and dark still show through.
  float lum = dot(albedo, vec3(0.299, 0.587, 0.114));
  vec3 painted = pc * (0.8 + 0.4 * lum);
  vec3 base = mix(albedo, painted, a);

  // A pigment layer fills the finest pits of the stone.
  n = normalize(mix(n, vec3(0.0, 0.0, 1.0), a * 0.35));

  // Torch light.
  vec3 toL = vec3(uTorch.xy - px, uTorch.z - h * 70.0);
  float dist = length(toL);
  vec3 L = toL / dist;
  float ndl = dot(n, L);
  float diff = max(0.0, (ndl + 0.45) / 1.45);
  float att = uIntensity / (1.0 + (dist * dist) / (uRadius * uRadius));
  // Damp limestone has a faint sheen; dry pigment is matte.
  vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
  float spec = pow(max(dot(n, H), 0.0), 28.0) * 0.18 * (1.0 - a);
  // Hollows stay darker even when lit (ambient occlusion from height).
  float ao = mix(0.55, 1.0, smoothstep(0.0, 0.7, h));

  vec3 light = uAmbient * ao + uTorchColor * diff * att * ao;
  vec3 col = base * light + uTorchColor * spec * att;

  col = 1.0 - exp(-col * uExposure);

  // Smoky vignette.
  vec2 c = uv - 0.5;
  col *= 1.0 - 0.3 * smoothstep(0.35, 0.85, length(c * vec2(1.1, 1.3)));
  // Film grain to avoid banding in the dark.
  col += (hash(px + fract(time)) - 0.5) * 0.012;

  gl_FragColor = vec4(col, 1.0);
}
`;

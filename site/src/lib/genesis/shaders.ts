export const particleVertex = /* glsl */ `
uniform float uProgress;
uniform float uTime;
uniform vec2 uPointer;
uniform float uSize;
uniform float uPixelRatio;
attribute vec3 aHome;
attribute vec3 aTarget;
attribute float aRand;
attribute float aRole; // 1.0 = structural (forms the mark), 0.0 = ambient (fades out)
varying float vAlpha;
varying float vRole;

void main() {
  vRole = aRole;

  // staggered per-particle convergence
  float pr = clamp((uProgress - aRand * 0.25) / 0.75, 0.0, 1.0);
  pr = pr * pr * (3.0 - 2.0 * pr);

  // living drift around the home position
  vec3 home = aHome;
  float t = uTime * 0.15 + aRand * 6.2831;
  home += vec3(sin(t), cos(t * 1.1), sin(t * 0.7)) * 0.12;

  float structural = step(0.5, aRole);
  float conv = structural * pr;
  vec3 pos = mix(home, aTarget, conv);

  // pointer parallax, stronger for nearer particles
  pos.xy += uPointer * (0.18 + pos.z * 0.04);

  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;

  float grow = mix(1.0, 1.7, pr);
  float size = uSize * mix(1.0, grow, structural);
  gl_PointSize = size * uPixelRatio * (28.0 / -mv.z);

  float upRamp = mix(0.22, 1.0, pr);
  float downRamp = (1.0 - uProgress) * 0.45;
  vAlpha = mix(downRamp, upRamp, structural);
}
`;

export const particleFragment = /* glsl */ `
precision highp float;
varying float vAlpha;
varying float vRole;
uniform vec3 uColorDim;
uniform vec3 uColorBright;

void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5) discard;
  float a = smoothstep(0.5, 0.0, d) * vAlpha;
  vec3 col = mix(uColorDim, uColorBright, vRole);
  gl_FragColor = vec4(col, a);
}
`;

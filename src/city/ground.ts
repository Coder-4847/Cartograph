import * as THREE from 'three';
import { BG } from './world.ts';

const VERT = /* glsl */ `
  varying vec3 vW;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const FRAG = /* glsl */ `
  uniform vec3 uBg;
  uniform vec3 uAccent;
  uniform float uRadius;
  uniform float uReveal;
  varying vec3 vW;
  void main() {
    vec2 p = vW.xz;
    float r = length(p);
    // 20-unit grid, hairlines
    vec2 g = abs(fract(p / 20.0 - 0.5) - 0.5) / fwidth(p / 20.0);
    float line = 1.0 - min(min(g.x, g.y), 1.0);
    float fade = exp(-pow(r / (uRadius * 1.3), 2.0));
    vec3 col = uBg;
    col += vec3(0.03, 0.033, 0.048) * line * fade;
    col += uAccent * 0.05 * exp(-pow(r / (uRadius * 0.9), 2.0)) * uReveal;
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

/** Infinite-feeling dark floor: faint grid and a soft accent glow under the city. */
export class Ground {
  readonly mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;

  constructor(scene: THREE.Scene) {
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uBg: { value: new THREE.Color(BG) },
        uAccent: { value: new THREE.Color('#7b83ff') },
        uRadius: { value: 100 },
        uReveal: { value: 1 },
      },
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000).rotateX(-Math.PI / 2), this.mat);
    this.mesh.position.y = -0.62;
    scene.add(this.mesh);
  }

  setRadius(r: number): void {
    this.mat.uniforms.uRadius.value = r;
  }

  setReveal(v: number): void {
    this.mat.uniforms.uReveal.value = v;
  }
}

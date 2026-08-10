import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js";

const canvas = document.querySelector("#cat-layer");
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
renderer.setClearColor(0x000000, 0);
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(0, innerWidth, innerHeight, 0, 1, 2000);
camera.position.z = 1000;

scene.add(new THREE.HemisphereLight(0xfff4d8, 0x3d285f, 2.4));
const keyLight = new THREE.DirectionalLight(0xffffff, 3.2);
keyLight.position.set(-3, 6, 8);
scene.add(keyLight);

const cat = new THREE.Group();
scene.add(cat);

const orange = new THREE.MeshStandardMaterial({ color: 0xf28b42, roughness: 0.72 });
const darkOrange = new THREE.MeshStandardMaterial({ color: 0xb8522f, roughness: 0.8 });
const cream = new THREE.MeshStandardMaterial({ color: 0xfff4d8, roughness: 0.65 });
const charcoal = new THREE.MeshStandardMaterial({ color: 0x272038, roughness: 0.55 });
const pink = new THREE.MeshStandardMaterial({ color: 0xdf536d, roughness: 0.65 });

function mesh(geometry, material, position, parent = cat) {
  const part = new THREE.Mesh(geometry, material);
  part.position.set(...position);
  parent.add(part);
  return part;
}

const body = mesh(new THREE.SphereGeometry(0.38, 24, 16), orange, [0, 0.58, 0]);
body.scale.set(0.9, 1.18, 0.72);

const chest = mesh(new THREE.SphereGeometry(0.22, 20, 14), cream, [0, 0.62, 0.27]);
chest.scale.set(0.8, 1.22, 0.36);

const head = mesh(new THREE.SphereGeometry(0.34, 28, 18), orange, [0, 1.15, 0.02]);
head.scale.set(1, 0.9, 0.92);

function ear(x, angle) {
  const part = mesh(new THREE.ConeGeometry(0.18, 0.43, 4), orange, [x, 1.48, 0]);
  part.rotation.z = angle;
  part.rotation.y = Math.PI / 4;
  return part;
}
ear(-0.21, 0.12);
ear(0.21, -0.12);

const muzzleLeft = mesh(new THREE.SphereGeometry(0.12, 16, 10), cream, [-0.09, 1.08, 0.29]);
const muzzleRight = mesh(new THREE.SphereGeometry(0.12, 16, 10), cream, [0.09, 1.08, 0.29]);
muzzleLeft.scale.z = 0.52;
muzzleRight.scale.z = 0.52;

for (const x of [-0.13, 0.13]) {
  const eye = mesh(new THREE.SphereGeometry(0.038, 12, 8), charcoal, [x, 1.24, 0.31]);
  eye.scale.y = 1.25;
}

const nose = mesh(new THREE.ConeGeometry(0.055, 0.08, 3), pink, [0, 1.12, 0.405]);
nose.rotation.x = Math.PI / 2;
nose.rotation.z = Math.PI;

const legs = [-0.2, 0.2].map((x) => {
  const leg = mesh(new THREE.CapsuleGeometry(0.09, 0.29, 6, 12), orange, [x, 0.22, 0.05]);
  mesh(new THREE.SphereGeometry(0.105, 16, 10), cream, [0, -0.22, 0.05], leg)
    .scale.set(1.15, 0.65, 1.25);
  return leg;
});

const tailCurve = new THREE.CatmullRomCurve3([
  new THREE.Vector3(-0.25, 0.55, -0.1),
  new THREE.Vector3(-0.55, 0.65, -0.06),
  new THREE.Vector3(-0.63, 0.98, 0),
  new THREE.Vector3(-0.48, 1.12, 0.03),
]);
const tail = mesh(new THREE.TubeGeometry(tailCurve, 24, 0.075, 10, false), darkOrange, [0, 0, 0]);

const shadowMaterial = new THREE.MeshBasicMaterial({
  color: 0x120a23,
  opacity: 0.38,
  transparent: true,
  depthWrite: false,
});
const shadow = mesh(new THREE.CircleGeometry(0.43, 32), shadowMaterial, [0, 0.04, -0.5]);
shadow.scale.y = 0.28;

let width = 0;
let height = 0;
function resize() {
  width = innerWidth;
  height = innerHeight;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setSize(width, height, false);
  camera.right = width;
  camera.top = height;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
resize();

window.cat3D = {
  render(player, board, now, moving) {
    const screenX = board.originX + (player.x - player.y) * board.tileWidth / 2;
    const screenY = board.originY + (player.x + player.y) * board.tileHeight / 2;
    const stride = moving ? Math.sin(now / 90) : 0;
    const scale = board.tileWidth * 0.48;

    cat.position.set(screenX, screenY - scale * 0.04 + Math.abs(stride) * scale * 0.035, 0);
    cat.scale.setScalar(scale);
    cat.rotation.y = (player.facingX - player.facingY < 0 ? -1 : 1) * 0.24;
    legs[0].rotation.z = stride * 0.16;
    legs[1].rotation.z = -stride * 0.16;
    tail.rotation.z = Math.sin(now / 310) * 0.08;
    shadow.material.opacity = 0.38 - Math.abs(stride) * 0.08;

    renderer.render(scene, camera);
  },
};

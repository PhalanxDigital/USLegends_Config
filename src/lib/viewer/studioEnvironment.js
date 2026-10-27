/**
 * A virtual photo studio used only for reflections (image-based lighting): a dark room with
 * softboxes and long strip lights, like a car photography stage. Glossy paint picks up the
 * strips as crisp highlight lines, which is what gives the Sketchfab version its look.
 *
 * Units are arbitrary; PMREMGenerator turns this scene into an environment map. The car faces +X.
 * Light values above 1 are intentional (HDR): they keep highlights bright after tone mapping.
 */
import * as THREE from 'three';

export function createStudioEnvironment({ intensity = 1 } = {}) {
  const scene = new THREE.Scene();
  // studio lights read slightly cool, like the daylight-balanced softboxes in the original renders
  const COOL = new THREE.Color(0.94, 1.0, 1.04);
  const unlit = (value, side = THREE.FrontSide) =>
    new THREE.MeshBasicMaterial({ color: COOL.clone().multiplyScalar(value * intensity), side, toneMapped: false });

  // dark room, with a slightly lighter floor so lower body panels pick up a gray bounce
  const room = new THREE.Mesh(new THREE.BoxGeometry(40, 16, 40), unlit(0.02, THREE.BackSide));
  room.position.y = 6;
  scene.add(room);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), unlit(0.035));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1.9;
  scene.add(floor);

  const light = (w, h, value, position, target = [0, 0, 0]) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), unlit(value, THREE.DoubleSide));
    m.position.set(...position);
    m.lookAt(...target);
    scene.add(m);
  };
  // big overhead softbox, long along the car
  light(14, 5, 4.2, [0, 13.5, 0]);
  // long strip lights on both sides, angled down at the car: the highlight lines on the doors
  light(16, 1.1, 9, [0, 6, 11], [0, 1, 0]);
  light(16, 1.1, 9, [0, 6, -11], [0, 1, 0]);
  light(16, 0.5, 4, [0, 2.2, 13], [0, 1, 0]);
  light(16, 0.5, 4, [0, 2.2, -13], [0, 1, 0]);
  // front and rear panels
  light(9, 6, 1.6, [17, 5, 0], [0, 1, 0]);
  light(9, 6, 1.0, [-17, 5, 0], [0, 1, 0]);
  // a small warm accent behind the camera side for life in the chrome
  const warm = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.25, 0.9).multiplyScalar(intensity), side: THREE.DoubleSide, toneMapped: false }));
  warm.position.set(12, 7, 12);
  warm.lookAt(0, 0, 0);
  scene.add(warm);
  return scene;
}

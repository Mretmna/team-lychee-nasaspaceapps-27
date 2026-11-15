"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { LocationSelection, RegionShape } from "@/types/track";

interface GlobeProps {
  selection: LocationSelection;
  shape: RegionShape;
  onSelect: (selection: LocationSelection) => void;
}

const RADIUS = 1.6;

function toVector(latitude: number, longitude: number, radius = RADIUS) {
  const phi = THREE.MathUtils.degToRad(90 - latitude);
  const theta = THREE.MathUtils.degToRad(longitude + 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

function fromVector(point: THREE.Vector3) {
  const normalized = point.clone().normalize();
  const latitude = 90 - THREE.MathUtils.radToDeg(Math.acos(normalized.y));
  const longitude = THREE.MathUtils.radToDeg(Math.atan2(normalized.z, -normalized.x)) - 180;
  return {
    latitude: Math.round(latitude * 10) / 10,
    longitude: Math.round((((longitude + 540) % 360) - 180) * 10) / 10,
  };
}

function makeGridLine(points: THREE.Vector3[], material: THREE.LineBasicMaterial) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  return new THREE.Line(geometry, material);
}

export function Globe({ selection, shape, onSelect }: GlobeProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const onSelectRef = useRef(onSelect);
  const initialSelectionRef = useRef(selection);
  const shapeRef = useRef(shape);
  const [available, setAvailable] = useState(true);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    initialSelectionRef.current = selection;
    shapeRef.current = shape;
    mountRef.current?.querySelector("canvas")?.setAttribute("aria-label", shape === "full" ? "Interactive globe. Drag or click to choose a center for later region selections. The entire map is selected for sound." : `Interactive globe. Drag or click to choose the center of the ${shape} selection; scroll to zoom.`);
    if (cameraRef.current && controlsRef.current) {
      const distance = cameraRef.current.position.length();
      cameraRef.current.position.copy(toVector(selection.latitude, selection.longitude).normalize().multiplyScalar(distance));
      controlsRef.current.update();
    }
  }, [selection, shape]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    } catch {
      window.requestAnimationFrame(() => setAvailable(false));
      return;
    }

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(0, 0.25, 5.4);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.setAttribute("aria-label", shapeRef.current === "full" ? "Interactive globe. The entire map is selected for sound." : `Interactive globe with a ${shapeRef.current} selection. Drag or click to choose its center; scroll to zoom.`);
    renderer.domElement.setAttribute("role", "img");
    mount.appendChild(renderer.domElement);

    const globeMaterial = new THREE.MeshPhongMaterial({
      color: 0xffffff,
      emissive: 0x071922,
      emissiveIntensity: 0.22,
      shininess: 16,
      transparent: true,
      opacity: 0.98,
    });
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(RADIUS, 64, 48), globeMaterial);
    scene.add(sphere);

    let disposed = false;
    new THREE.TextureLoader().load("/earth-atmos-2048.jpg", (texture) => {
      if (disposed) {
        texture.dispose();
        return;
      }
      texture.colorSpace = THREE.SRGBColorSpace;
      globeMaterial.map = texture;
      globeMaterial.needsUpdate = true;
    });

    const gridMaterial = new THREE.LineBasicMaterial({ color: 0xc9e7db, transparent: true, opacity: 0.22 });
    for (let latitude = -60; latitude <= 60; latitude += 30) {
      const points: THREE.Vector3[] = [];
      for (let longitude = -180; longitude <= 180; longitude += 4) points.push(toVector(latitude, longitude, RADIUS + 0.006));
      scene.add(makeGridLine(points, gridMaterial));
    }
    for (let longitude = -150; longitude < 180; longitude += 30) {
      const points: THREE.Vector3[] = [];
      for (let latitude = -90; latitude <= 90; latitude += 3) points.push(toVector(latitude, longitude, RADIUS + 0.006));
      scene.add(makeGridLine(points, gridMaterial));
    }

    scene.add(new THREE.HemisphereLight(0xd8fbf3, 0x102733, 2.4));
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.3);
    keyLight.position.set(-3, 4, 5);
    scene.add(keyLight);

    const controls = new OrbitControls(camera, renderer.domElement);
    cameraRef.current = camera;
    controlsRef.current = controls;
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.minDistance = 3.5;
    controls.maxDistance = 7;
    controls.rotateSpeed = 0.55;
    controls.zoomSpeed = 0.7;
    camera.position.copy(toVector(initialSelectionRef.current.latitude, initialSelectionRef.current.longitude).normalize().multiplyScalar(5.4));
    controls.update();
    const updateRing = () => {
      const ring = ringRef.current;
      if (!ring) return;
      if (shapeRef.current === "full") return;
      const distance = camera.position.length();
      const angularRadius = Math.min((initialSelectionRef.current.radiusKm ?? 500) / 6371.0088, Math.acos(RADIUS / distance));
      const focalLength = mount.clientHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
      const projectedRadius = focalLength * RADIUS * Math.sin(angularRadius) / (distance - RADIUS * Math.cos(angularRadius));
      const diameter = Math.max(8, projectedRadius * 2);
      ring.style.width = `${diameter}px`;
      ring.style.height = `${diameter}px`;
    };
    const updateSelectionFromView = () => {
      const next = fromVector(camera.position);
      const current = initialSelectionRef.current;
      if (Math.abs(next.latitude - current.latitude) < 0.05 && Math.abs(next.longitude - current.longitude) < 0.05) return;
      const selected = { name: "Selected area", ...next, radiusKm: current.radiusKm ?? 500 };
      initialSelectionRef.current = selected;
      onSelectRef.current(selected);
    };
    controls.addEventListener("end", updateSelectionFromView);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let downPosition = { x: 0, y: 0 };
    const handlePointerDown = (event: PointerEvent) => {
      downPosition = { x: event.clientX, y: event.clientY };
    };
    const handlePointerUp = (event: PointerEvent) => {
      if (Math.hypot(event.clientX - downPosition.x, event.clientY - downPosition.y) > 6) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObject(sphere)[0];
      if (!hit) return;
      const coordinates = fromVector(hit.point);
      onSelectRef.current({ name: "Selected area", ...coordinates, radiusKm: initialSelectionRef.current.radiusKm ?? 500 });
    };
    renderer.domElement.addEventListener("pointerdown", handlePointerDown);
    renderer.domElement.addEventListener("pointerup", handlePointerUp);

    let frame = 0;
    const resize = () => {
      const width = mount.clientWidth;
      const height = mount.clientHeight;
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
      updateRing();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    resize();
    const animate = () => {
      controls.update();
      updateRing();
      renderer.render(scene, camera);
      frame = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
      renderer.domElement.removeEventListener("pointerup", handlePointerUp);
      controls.removeEventListener("end", updateSelectionFromView);
      controls.dispose();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => material.dispose());
        }
      });
      globeMaterial.map?.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      cameraRef.current = null;
      controlsRef.current = null;
    };
  }, []); // Selection updates use the area ref; rebuilding WebGL would be wasteful.

  if (!available) {
    return (
      <div className="globe-fallback" role="status">
        <span>3D globe unavailable</span>
        <p>Choose a preset or enter coordinates below. The listening experience still works.</p>
      </div>
    );
  }

  return <div className="globe-canvas" ref={mountRef}><div className={`globe-selection-ring${shape === "square" ? " is-square" : ""}${shape === "full" ? " is-full" : ""}`} ref={ringRef} aria-hidden="true" /></div>;
}

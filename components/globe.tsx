"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { LocationSelection } from "@/types/track";

interface GlobeProps {
  selection: LocationSelection;
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

export function Globe({ selection, onSelect }: GlobeProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const markerRef = useRef<THREE.Mesh | null>(null);
  const areaRef = useRef<THREE.LineLoop | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const onSelectRef = useRef(onSelect);
  const initialSelectionRef = useRef(selection);
  const [available, setAvailable] = useState(true);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    markerRef.current?.position.copy(toVector(selection.latitude, selection.longitude, RADIUS + 0.08));
    if (cameraRef.current && controlsRef.current) {
      const distance = cameraRef.current.position.length();
      cameraRef.current.position.copy(toVector(selection.latitude, selection.longitude).normalize().multiplyScalar(distance));
      controlsRef.current.update();
    }
    const area = areaRef.current;
    if (!area) return;
    area.visible = Boolean(selection.radiusKm);
    if (!selection.radiusKm) return;
    const center = toVector(selection.latitude, selection.longitude, 1).normalize();
    const east = new THREE.Vector3(0, 1, 0).cross(center).normalize();
    if (east.lengthSq() < 0.01) east.set(1, 0, 0);
    const north = center.clone().cross(east).normalize();
    const angle = Math.min(Math.PI, selection.radiusKm / 6371);
    const points = Array.from({ length: 96 }, (_, index) => {
      const bearing = (index / 96) * Math.PI * 2;
      return center.clone().multiplyScalar(Math.cos(angle))
        .addScaledVector(east, Math.sin(angle) * Math.cos(bearing))
        .addScaledVector(north, Math.sin(angle) * Math.sin(bearing))
        .normalize().multiplyScalar(RADIUS + 0.025);
    });
    area.geometry.dispose();
    area.geometry = new THREE.BufferGeometry().setFromPoints(points);
  }, [selection]);

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
    renderer.domElement.setAttribute("aria-label", "Interactive globe. Drag to rotate, scroll to zoom, or click to select coordinates.");
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

    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(0.065, 24, 16),
      new THREE.MeshBasicMaterial({ color: 0xf5b544 }),
    );
    marker.position.copy(toVector(initialSelectionRef.current.latitude, initialSelectionRef.current.longitude, RADIUS + 0.08));
    markerRef.current = marker;
    scene.add(marker);

    const area = new THREE.LineLoop(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0xf5b544, transparent: true, opacity: 0.9 }),
    );
    area.visible = false;
    areaRef.current = area;
    scene.add(area);

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
      onSelectRef.current({ name: "Selected point", ...coordinates });
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
    };
    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    resize();
    const animate = () => {
      controls.update();
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
      markerRef.current = null;
      areaRef.current = null;
      cameraRef.current = null;
      controlsRef.current = null;
    };
  }, []); // Selection updates use the marker ref; rebuilding WebGL would be wasteful.

  if (!available) {
    return (
      <div className="globe-fallback" role="status">
        <span>3D globe unavailable</span>
        <p>Choose a preset or enter coordinates below. The listening experience still works.</p>
      </div>
    );
  }

  return <div className="globe-canvas" ref={mountRef} />;
}

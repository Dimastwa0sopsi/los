import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Vehicle, playerDrive } from '../game/vehicles';
import { testDriveCollision, testDriveSeconds } from '../game/testDrive';
import { VEHICLES } from '../game/data';
import type { Game } from '../game/game';
import './test-drive.css';

type Control = 'left' | 'right' | 'gas' | 'brake' | 'handbrake';

/** Изолированная сцена: не создаёт автомобиль в мире и не меняет сохранение. */
export function TestDrive({ g, type, color, close }: { g: Game; type: string; color: string; close: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const held = useRef(new Set<Control>());
  const onClose = useRef(close); onClose.current = close;
  const [seconds, setSeconds] = useState(300);
  const [speed, setSpeed] = useState(0);
  const [error, setError] = useState('');
  useEffect(() => {
    const el = host.current; if (!el || !VEHICLES[type]) return;
    g.input.releaseAll();
    const priorInput = g.input.enabled; g.input.enabled = false;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power' }); }
    catch { setError('Не удалось открыть площадку. Вернитесь в автосалон.'); return () => { g.input.enabled = priorInput; }; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setClearColor(0x96c8e3); el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x7c8d75, 2));
    const sun = new THREE.DirectionalLight(0xffffff, 1.5); sun.position.set(25, 45, 18); scene.add(sun);
    const materials: THREE.Material[] = [];
    const geometries: THREE.BufferGeometry[] = [];
    const box = (x:number, y:number, z:number, w:number, h:number, d:number, color:number) => {
      const geo = new THREE.BoxGeometry(w,h,d), mat = new THREE.MeshLambertMaterial({ color });
      geometries.push(geo); materials.push(mat); const mesh = new THREE.Mesh(geo, mat); mesh.position.set(x,y,z); scene.add(mesh);
    };
    box(0,-0.12,0,100,0.2,100,0x64804e);
    box(0,0.01,0,82,0.04,82,0x454f54);
    // Белая разметка и ограждения обозначают отдельную мини-площадку.
    for (let p=-30; p<=30; p+=10) { box(0,0.045,p,0.2,0.02,5,0xece9d8); box(p,0.045,-34,5,0.02,0.2,0xf7f3e7); }
    for (const side of [-1,1]) { box(side*42,0.6,0,1,1.2,86,0xd9e0e5); box(0,0.6,side*42,86,1.2,1,0xd9e0e5); }
    for (const x of [-20,20]) for (const z of [-20,0,20]) { box(x,0.2,z,0.6,0.4,0.6,0xf97316); box(x,0.47,z,0.3,0.15,0.3,0xf8fafc); }
    const collision = testDriveCollision();
    const car = new Vehicle(type, 'deco', color); car.place(0, -15, 0); car.hasDriver = true; car.addDummyDriver(); scene.add(car.model.group);
    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 400);
    camera.position.set(0, 3.5 + car.spec.hei, -15 - Math.max(10, car.spec.len * 2));
    const resize = () => { const w = el.clientWidth, h = el.clientHeight; if (!w || !h) return; renderer.setSize(w,h); camera.aspect = w/h; camera.updateProjectionMatrix(); };
    resize(); window.addEventListener('resize', resize);
    const keys: Record<string, Control> = { KeyW:'gas', ArrowUp:'gas', KeyS:'brake', ArrowDown:'brake', KeyA:'left', ArrowLeft:'left', KeyD:'right', ArrowRight:'right', Space:'handbrake' };
    const key = (e: KeyboardEvent) => {
      if (e.code === 'Escape' || e.code === 'KeyF') { e.preventDefault(); e.stopImmediatePropagation(); if (e.type === 'keydown' && !e.repeat) onClose.current(); return; }
      const control = keys[e.code]; if (!control) return;
      e.preventDefault(); e.stopImmediatePropagation(); if (e.type === 'keydown') held.current.add(control); else held.current.delete(control);
    };
    const blur = () => held.current.clear();
    window.addEventListener('keydown', key, true); window.addEventListener('keyup', key, true); window.addEventListener('blur', blur);
    let frame = 0, last = performance.now(), start = last, lastUi = 0, stopped = false;
    const render = (now: number) => {
      if (stopped) return;
      const left = testDriveSeconds(start, now);
      if (!left) { onClose.current(); return; }
      const dt = Math.min(0.05, Math.max(0, (now-last)/1000)); last = now;
      const h = held.current;
      playerDrive(car, { throttle:h.has('gas')?1:0, brake:h.has('brake')?1:0, steer:(h.has('right')?1:0)-(h.has('left')?1:0), handbrake:h.has('handbrake'), wheelie:false, up:0 }, dt, collision, false, () => false);
      car.sync();
      const forward = car.forward(), dist = Math.max(10, car.spec.len * 2);
      const desired = new THREE.Vector3(car.x - forward.x * dist, 3.5 + car.spec.hei, car.z - forward.z * dist);
      camera.position.lerp(desired, Math.min(1, dt * 5)); camera.lookAt(car.x, 1, car.z);
      if (now-lastUi > 200) { setSeconds(left); setSpeed(Math.round(Math.abs(car.speed)*3.6)); lastUi=now; }
      renderer.render(scene,camera); frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    return () => {
      stopped = true; cancelAnimationFrame(frame); window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', key, true); window.removeEventListener('keyup', key, true); window.removeEventListener('blur', blur);
      held.current.clear(); g.input.enabled = priorInput; g.input.releaseAll();
      car.model.dispose(); geometries.forEach(geo=>geo.dispose()); materials.forEach(mat=>mat.dispose()); renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
    };
  }, [g,type,color]);
  const control = (label:string, name:Control) => <button type="button" onPointerDown={e=>{ e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); held.current.add(name); }} onPointerUp={()=>held.current.delete(name)} onPointerCancel={()=>held.current.delete(name)} onLostPointerCapture={()=>held.current.delete(name)}>{label}</button>;
  return <div className="td-overlay" onPointerDown={e=>e.stopPropagation()}>
    <div className="td-canvas" ref={host}/>
    <div className="td-bar"><span>🚗 {VEHICLES[type]?.name} · {speed} км/ч · {Math.floor(seconds/60)}:{String(seconds%60).padStart(2,'0')}</span><button type="button" onClick={close}>Завершить ✕</button></div>
    {error && <div className="td-error">{error}</div>}
    <div className="td-left">{control('◀','left')}{control('▶','right')}</div>
    <div className="td-right">{control('РУЧНИК','handbrake')}{control('ТОРМ','brake')}{control('ГАЗ','gas')}</div>
    <div className="td-hint">WASD / стрелки · пробел — ручник · F или Esc — закончить</div>
  </div>;
}

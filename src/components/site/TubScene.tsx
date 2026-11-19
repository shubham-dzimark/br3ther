"use client";

import { useEffect, useRef, useState } from "react";
import { GLYPHS, GAP } from "./glyphs";

/*
 * The No.3 tub in WebGL (three.js): a black body with a printed label, a ridged
 * lid in the flavour's colour and a soft contact shadow. There are no product
 * photographs, so the product is modelled rather than faked.
 *
 * One responsibility: show the tub. Scroll scenes drive it through the
 * controller (progress turns it and lifts the lid). It renders only while on
 * screen and the tab is visible, caps the pixel ratio, frees everything on
 * unmount, and falls back to the poster image without WebGL, after a lost
 * context, or with reduced motion (one static frame).
 */
export type TubController = {
  /** 0..1 along the owning scroll scene. */
  setProgress: (p: number) => void;
};


type Props = {
  flavour?: string;
  /** The lid's colour for this flavour (set per flavour in the admin). */
  lid?: string;
  controllerRef?: React.MutableRefObject<TubController | null>;
  /** Slow turn when nothing is driving it. */
  idleSpin?: boolean;
  /** Pointer tilt. */
  interactive?: boolean;
  className?: string;
  poster?: string;
  label?: string;
  /** Printed under the flavour, e.g. "300 G  ·  30 SERVINGS". */
  detail?: string;
};

export function TubScene({
  flavour = "Unflavoured",
  lid = "#ecece8",
  controllerRef,
  idleSpin = true,
  interactive = true,
  className,
  poster = "/site/tub-poster.png",
  label = "No.3 Daily Blend tub",
  detail = "300 G  ·  30 SERVINGS",
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<{ setFlavour: (f: string, lid: string) => void } | null>(null);
  const [failed, setFailed] = useState(false);
  const currentFlavour = useRef(flavour);
  const currentLid = useRef(lid);
  const currentDetail = useRef(detail);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let cleanup = () => {};

    (async () => {
      const THREE = await import("three");
      const { RoomEnvironment } = await import("three/examples/jsm/environments/RoomEnvironment.js");
      if (disposed) return;

      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      let renderer: InstanceType<typeof THREE.WebGLRenderer>;
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
      } catch {
        setFailed(true);
        return;
      }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;
      const canvas = renderer.domElement;
      canvas.setAttribute("aria-hidden", "true");
      // Hidden until the first frame is drawn, then faded in (no flash of an empty canvas).
      canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;opacity:0;transition:opacity .6s cubic-bezier(.22,1,.36,1)";
      host.appendChild(canvas);

      const scene = new THREE.Scene();
      const pmrem = new THREE.PMREMGenerator(renderer);
      const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      scene.environment = envTex;

      const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
      camera.position.set(0, 0.35, 7.4);
      camera.lookAt(0, 0, 0);

      const key = new THREE.DirectionalLight(0xffffff, 1.4);
      key.position.set(-3, 4, 4);
      scene.add(key);
      const rim = new THREE.DirectionalLight(0xffffff, 0.9);
      rim.position.set(4, 2, -3);
      scene.add(rim);

      const disposables: { dispose: () => void }[] = [envTex, pmrem];
      const track = <T extends { dispose: () => void }>(o: T) => (disposables.push(o), o);

      // ---- body (lathe profile, y from -0.9 to 0.62) ----
      const prof = [
        [0, -0.9], [0.82, -0.9], [0.92, -0.885], [0.965, -0.84], [0.985, -0.76],
        [1.0, 0.5], [0.99, 0.58], [0.96, 0.62], [0.94, 0.63], [0.94, 0.74], [0, 0.74],
      ].map(([x, y]) => new THREE.Vector2(x, y));
      const bodyGeo = track(new THREE.LatheGeometry(prof, 160));
      const bodyMat = track(
        new THREE.MeshPhysicalMaterial({ color: 0x101010, roughness: 0.42, metalness: 0, clearcoat: 0.55, clearcoatRoughness: 0.4 }),
      );
      const tub = new THREE.Group();
      tub.add(new THREE.Mesh(bodyGeo, bodyMat));

      // ---- label (canvas texture on a thin open cylinder) ----
      const labelCanvas = document.createElement("canvas");
      labelCanvas.width = 2048;
      labelCanvas.height = 768;
      const lctx = labelCanvas.getContext("2d")!;
      const labelTex = track(new THREE.CanvasTexture(labelCanvas));
      labelTex.colorSpace = THREE.SRGBColorSpace;
      labelTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

      const drawWord = (letters: (keyof typeof GLYPHS)[], cx: number, top: number, cap: number) => {
        const s = cap / 120;
        const total = letters.reduce((n, l, i) => n + GLYPHS[l].w + (i < letters.length - 1 ? GAP : 0), 0);
        let x = cx - (total * s) / 2;
        for (const l of letters) {
          const g = GLYPHS[l];
          lctx.save();
          lctx.translate(x, top);
          lctx.scale(s, s);
          for (const p of g.paths) lctx.fill(new Path2D(p.d), p.evenodd ? "evenodd" : "nonzero");
          lctx.restore();
          x += (g.w + GAP) * s;
        }
      };
      const drawLabel = (flav: string) => {
        const W = labelCanvas.width;
        const H = labelCanvas.height;
        lctx.clearRect(0, 0, W, H);
        lctx.fillStyle = "#f4f4f1";
        const cx = W / 2;
        drawWord(["B", "R", "3", "T", "H", "R"], cx, 150, 150);
        lctx.font = "800 64px 'Red Hat Display', Arial, sans-serif";
        lctx.textAlign = "center";
        lctx.fillText("NO.3 DAILY BLEND", cx, 400);
        lctx.font = "500 44px 'Red Hat Text', Arial, sans-serif";
        lctx.fillText(flav.toUpperCase(), cx, 480);
        lctx.fillStyle = "rgba(244,244,241,0.7)";
        lctx.font = "500 34px 'Red Hat Text', Arial, sans-serif";
        lctx.fillText(`${currentDetail.current}  ·  DEMO PRODUCT`, cx, 610);

        // The back panel (the label's two ends meet behind the tub).
        const back = (bx: number) => {
          lctx.textAlign = "center";
          lctx.fillStyle = "#f4f4f1";
          lctx.font = "800 46px 'Red Hat Display', Arial, sans-serif";
          lctx.fillText("PER 10 G SCOOP", bx, 170);
          lctx.font = "500 34px 'Red Hat Text', Arial, sans-serif";
          const rows = ["Creatine monohydrate  3 g", "Electrolytes  600 mg", "Magnesium  150 mg", "Vitamin D3  25 µg", "Added sugar  0 g"];
          rows.forEach((r, i) => lctx.fillText(r, bx, 250 + i * 56));
          lctx.fillStyle = "rgba(244,244,241,0.7)";
          lctx.font = "500 28px 'Red Hat Text', Arial, sans-serif";
          lctx.fillText("ONE SCOOP IN 300 ML WATER, ONCE A DAY", bx, 590);
        };
        back(0);
        back(W);
        labelTex.needsUpdate = true;
      };
      // The scene builds asynchronously; read the latest flavour, not the one from the first render.
      drawLabel(currentFlavour.current);
      const labelGeo = track(new THREE.CylinderGeometry(1.006, 1.006, 1.14, 160, 1, true, Math.PI, Math.PI * 2));
      const labelMat = track(new THREE.MeshStandardMaterial({ map: labelTex, transparent: true, roughness: 0.55 }));
      const labelMesh = new THREE.Mesh(labelGeo, labelMat);
      labelMesh.position.y = -0.14;
      tub.add(labelMesh);

      // ---- lid ----
      const lid = new THREE.Group();
      const lidMat = track(
        new THREE.MeshPhysicalMaterial({ color: new THREE.Color(currentLid.current), roughness: 0.5, clearcoat: 0.3 }),
      );
      const lidGeo = track(new THREE.CylinderGeometry(1.04, 1.045, 0.3, 160));
      const lidBody = new THREE.Mesh(lidGeo, lidMat);
      lid.add(lidBody);
      const ridgeGeo = track(new THREE.BoxGeometry(0.035, 0.24, 0.03));
      const ridges = new THREE.InstancedMesh(ridgeGeo, lidMat, 96);
      const m = new THREE.Matrix4();
      for (let i = 0; i < 96; i++) {
        const a = (i / 96) * Math.PI * 2;
        m.makeRotationY(-a);
        m.setPosition(Math.sin(a) * 1.05, 0, Math.cos(a) * 1.05);
        ridges.setMatrixAt(i, m);
      }
      lid.add(ridges);
      // the squared 3 debossed on the lid top
      const topCanvas = document.createElement("canvas");
      topCanvas.width = topCanvas.height = 512;
      const tctx = topCanvas.getContext("2d")!;
      tctx.fillStyle = "rgba(0,0,0,0.16)";
      tctx.translate(256 - 0.5 * 82 * 1.6, 256 - 0.5 * 120 * 1.6);
      tctx.scale(1.6, 1.6);
      for (const p of GLYPHS["3"].paths) tctx.fill(new Path2D(p.d));
      const topTex = track(new THREE.CanvasTexture(topCanvas));
      const topGeo = track(new THREE.CircleGeometry(0.98, 96));
      const topMat = track(new THREE.MeshStandardMaterial({ map: topTex, transparent: true, roughness: 0.6 }));
      const top = new THREE.Mesh(topGeo, topMat);
      top.rotation.x = -Math.PI / 2;
      top.position.y = 0.151;
      lid.add(top);
      const LID_Y = 0.79;
      lid.position.y = LID_Y;
      tub.add(lid);

      // ---- contact shadow (the 3D object's floor shadow, not a UI shadow) ---- taste-skill-ignore
      const shCanvas = document.createElement("canvas");
      shCanvas.width = shCanvas.height = 256;
      const sctx = shCanvas.getContext("2d")!;
      const grad = sctx.createRadialGradient(128, 128, 10, 128, 128, 128);
      grad.addColorStop(0, "rgba(0,0,0,0.42)");
      grad.addColorStop(1, "rgba(0,0,0,0)");
      sctx.fillStyle = grad;
      sctx.fillRect(0, 0, 256, 256);
      const shTex = track(new THREE.CanvasTexture(shCanvas));
      const shGeo = track(new THREE.PlaneGeometry(3.4, 3.4));
      const shMat = track(new THREE.MeshBasicMaterial({ map: shTex, transparent: true, depthWrite: false }));
      const shadow = new THREE.Mesh(shGeo, shMat); // taste-skill-ignore: 3D contact shadow
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.y = -0.905;
      scene.add(shadow);

      scene.add(tub);

      // ---- state ----
      let progress = 0;
      let spin = 0;
      let tiltX = 0, tiltY = 0, tTiltX = 0, tTiltY = 0;
      const targetLid = new THREE.Color(currentLid.current);
      let dirty = true;
      const smooth = (a: number, b: number, x: number) => {
        const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
        return t * t * (3 - 2 * t);
      };

      let baseZ = 7.4;
      const resize = () => {
        const w = host.clientWidth, h = host.clientHeight;
        if (!w || !h) return;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        // keep the whole tub (and a lifted lid) in frame at any aspect
        baseZ = w / h < 0.8 ? 7.4 / (w / h / 0.8) : 7.4;
        camera.position.z = baseZ;
        camera.updateProjectionMatrix();
        dirty = true;
      };
      const ro = new ResizeObserver(resize);
      ro.observe(host);
      resize();

      let visible = true;
      const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) kick(); }, { rootMargin: "100px" });
      io.observe(host);

      const onPointer = (e: PointerEvent) => {
        if (!interactive || e.pointerType !== "mouse") return;
        tTiltY = (e.clientX / window.innerWidth - 0.5) * 0.35;
        tTiltX = (e.clientY / window.innerHeight - 0.5) * 0.16;
        kick();
      };
      const onBlur = () => { tTiltX = tTiltY = 0; kick(); };
      window.addEventListener("pointermove", onPointer, { passive: true });
      window.addEventListener("blur", onBlur);

      let raf = 0;
      let last = performance.now();
      const frame = (now: number) => {
        raf = 0;
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        if (!reduce && idleSpin) { spin += dt * 0.22; dirty = true; }
        tiltX += (tTiltX - tiltX) * 0.08;
        tiltY += (tTiltY - tiltY) * 0.08;
        const lidC = lidMat.color;
        if (Math.abs(lidC.r - targetLid.r) + Math.abs(lidC.g - targetLid.g) + Math.abs(lidC.b - targetLid.b) > 0.002) {
          // time-based, so the lid lands in ~0.4 s at any frame rate
          lidC.lerp(targetLid, 1 - Math.exp(-dt * 8));
          dirty = true;
        }
        const lift = smooth(0.42, 0.72, progress);
        tub.rotation.y = 0.12 + spin + progress * Math.PI * 1.5 + tiltY;
        tub.rotation.x = tiltX;
        lid.position.y = LID_Y + lift * 0.62;
        // An open lid rises above the closed tub's frame: ease the camera back
        // and aim a little higher so the whole lid stays in view.
        camera.position.z = baseZ * (1 + lift * 0.2);
        camera.position.y = 0.35 + lift * 0.3;
        camera.lookAt(0, lift * 0.32, 0);
        lid.rotation.x = -lift * 0.32;
        lid.rotation.z = lift * 0.12;
        renderer.render(scene, camera);
        const settling = Math.abs(tTiltX - tiltX) + Math.abs(tTiltY - tiltY) > 0.001;
        if (visible && !document.hidden && ((!reduce && idleSpin) || settling || dirty)) {
          dirty = false;
          raf = requestAnimationFrame(frame);
        }
      };
      const kick = () => {
        if (!raf && visible && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(frame); }
      };
      const onVis = () => { if (!document.hidden) kick(); };
      document.addEventListener("visibilitychange", onVis);

      const onLost = (e: Event) => { e.preventDefault(); setFailed(true); };
      canvas.addEventListener("webglcontextlost", onLost);

      if (controllerRef) {
        controllerRef.current = {
          setProgress: (p: number) => { progress = Math.min(1, Math.max(0, p)); dirty = true; kick(); },
        };
      }
      apiRef.current = {
        setFlavour: (f: string, c: string) => { targetLid.set(c); drawLabel(f); dirty = true; kick(); },
      };

      // label fonts may arrive after the first draw
      document.fonts?.ready.then(() => { if (!disposed) { drawLabel(currentFlavour.current); dirty = true; kick(); } });

      kick();
      // Show the canvas once a frame is on it, and tell the page loader the tub is ready.
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (disposed) return;
        canvas.style.opacity = "1";
        window.dispatchEvent(new CustomEvent("br3thr:tub-ready"));
      }));

      cleanup = () => {
        cancelAnimationFrame(raf);
        ro.disconnect();
        io.disconnect();
        window.removeEventListener("pointermove", onPointer);
        window.removeEventListener("blur", onBlur);
        document.removeEventListener("visibilitychange", onVis);
        canvas.removeEventListener("webglcontextlost", onLost);
        ridges.dispose();
        disposables.forEach((d) => d.dispose());
        renderer.dispose();
        canvas.remove();
        if (controllerRef) controllerRef.current = null;
        apiRef.current = null;
      };
    })();

    return () => {
      disposed = true;
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    currentFlavour.current = flavour;
    currentLid.current = lid;
    currentDetail.current = detail;
    apiRef.current?.setFlavour(flavour, lid);
  }, [flavour, lid, detail]);

  return (
    <div
      ref={hostRef}
      className={className}
      role="img"
      aria-label={`${label}, ${flavour}`}
      style={{ position: "relative", width: "100%", height: "100%" }}
    >
      {failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={poster}
          alt=""
          aria-hidden="true"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", mixBlendMode: "multiply" }}
        />
      ) : null}
    </div>
  );
}


export type DustEffectOptions = {
  duration?: number;
  step?: number;
  /** Collapse layout height while particles finish (leave). Default true. */
  collapse?: boolean;
  onStart?: () => void;
};

type Particle = {
  x: number;
  y: number;
  r: number;
  r2: number;
  color: string;
};

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

function ensureDustLayerStyle(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById("dust-effect-style")) return;
  const style = document.createElement("style");
  style.id = "dust-effect-style";
  style.textContent = `
    canvas.dust-layer {
      position: fixed;
      left: 0;
      top: 0;
      pointer-events: none;
      z-index: 9999;
      overflow: visible;
    }
  `;
  document.head.appendChild(style);
}

/** Clone DOM into SVG foreignObject and paint to canvas (no html2canvas). */
async function rasterizeDOM(el: HTMLElement, scale: number): Promise<HTMLCanvasElement> {
  const rect = el.getBoundingClientRect();
  const clone = el.cloneNode(true) as HTMLElement;
  const original = [el, ...el.querySelectorAll("*")];
  const copies = [clone, ...clone.querySelectorAll("*")];

  copies.forEach((node, i) => {
    const source = original[i];
    if (!(node instanceof HTMLElement) || !(source instanceof Element)) return;
    const cs = getComputedStyle(source);
    let css = "";
    for (const key of cs) css += `${key}:${cs.getPropertyValue(key)};`;
    node.setAttribute("style", css);
  });

  clone.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
  clone.style.margin = "0";
  clone.style.width = `${rect.width}px`;
  clone.style.height = `${rect.height}px`;
  // Source may be temporarily hidden for the transition; force a visible snapshot.
  clone.style.visibility = "visible";
  clone.style.opacity = "1";
  clone.style.pointerEvents = "none";

  const xml = new XMLSerializer().serializeToString(clone);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${rect.width * scale}" height="${rect.height * scale}" viewBox="0 0 ${rect.width} ${rect.height}"><foreignObject width="100%" height="100%">${xml}</foreignObject></svg>`;

  const image = new Image();
  image.decoding = "sync";
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await image.decode();

  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(rect.width * scale);
  canvas.height = Math.ceil(rect.height * scale);
  canvas.getContext("2d")!.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function sampleParticles(source: ImageData, W: number, H: number, s: number): Particle[] {
  const particles: Particle[] = [];
  for (let gy = 0; gy < H; gy += s) {
    for (let gx = 0; gx < W; gx += s) {
      const seed = Math.abs(Math.sin(gx * 12.9898 + gy * 78.233) * 43758.5453) % 1;
      const x = Math.min(W - 1, Math.round(gx + seed * s));
      const y = Math.min(H - 1, Math.round(gy + ((seed * 7) % 1) * s));
      const i = (y * W + x) * 4;
      if (source.data[i + 3]! < 18) continue;
      particles.push({
        x,
        y,
        r: seed,
        r2: Math.abs(Math.sin(seed * 91.7)) * 1,
        color: `rgb(${source.data[i]},${source.data[i + 1]},${source.data[i + 2]})`,
      });
    }
  }
  return particles;
}

function drawParticle(
  ctx: CanvasRenderingContext2D,
  p: Particle,
  px: number,
  py: number,
  size: number,
  age: number,
): void {
  if (p.r < 0.22) {
    ctx.beginPath();
    ctx.arc(px, py, size * 0.48, 0, Math.PI * 2);
    ctx.fill();
  } else if (p.r < 0.7) {
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(p.r * 5 + age * 2);
    ctx.fillRect(-size / 2, -size * 0.22, size, size * 0.44);
    ctx.restore();
  } else {
    ctx.fillRect(px, py, size * (1 + age * 1.8), Math.max(1, size * 0.28));
  }
}

function collapseElement(el: HTMLElement, duration: number): Promise<void> {
  const height = el.getBoundingClientRect().height;
  const styles = getComputedStyle(el);
  const marginBottom = Number.parseFloat(styles.marginBottom) || 0;
  const marginTop = Number.parseFloat(styles.marginTop) || 0;
  const paddingTop = Number.parseFloat(styles.paddingTop) || 0;
  const paddingBottom = Number.parseFloat(styles.paddingBottom) || 0;

  el.style.overflow = "hidden";
  el.style.boxSizing = "border-box";
  el.style.pointerEvents = "none";

  return el
    .animate(
      [
        {
          height: `${height}px`,
          marginTop: `${marginTop}px`,
          marginBottom: `${marginBottom}px`,
          paddingTop: `${paddingTop}px`,
          paddingBottom: `${paddingBottom}px`,
          borderWidth: styles.borderWidth,
        },
        {
          height: "0px",
          marginTop: "0px",
          marginBottom: "0px",
          paddingTop: "0px",
          paddingBottom: "0px",
          borderWidth: "0",
        },
      ],
      {
        duration,
        easing: "cubic-bezier(.4,0,.2,1)",
        fill: "forwards",
      },
    )
    .finished.then(() => undefined)
    .catch(() => undefined);
}

function expandElement(el: HTMLElement, duration: number): Promise<void> {
  const height = el.getBoundingClientRect().height;
  if (height <= 0) return Promise.resolve();

  const styles = getComputedStyle(el);
  const marginBottom = Number.parseFloat(styles.marginBottom) || 0;
  const marginTop = Number.parseFloat(styles.marginTop) || 0;
  const paddingTop = Number.parseFloat(styles.paddingTop) || 0;
  const paddingBottom = Number.parseFloat(styles.paddingBottom) || 0;

  el.style.overflow = "hidden";
  el.style.boxSizing = "border-box";
  el.style.height = "0px";
  el.style.marginTop = "0px";
  el.style.marginBottom = "0px";
  el.style.paddingTop = "0px";
  el.style.paddingBottom = "0px";

  return el
    .animate(
      [
        {
          height: "0px",
          marginTop: "0px",
          marginBottom: "0px",
          paddingTop: "0px",
          paddingBottom: "0px",
        },
        {
          height: `${height}px`,
          marginTop: `${marginTop}px`,
          marginBottom: `${marginBottom}px`,
          paddingTop: `${paddingTop}px`,
          paddingBottom: `${paddingBottom}px`,
        },
      ],
      {
        duration,
        easing: "cubic-bezier(.22,1,.36,1)",
        fill: "forwards",
      },
    )
    .finished.then(() => {
      el.style.overflow = "";
      el.style.boxSizing = "";
      el.style.height = "";
      el.style.marginTop = "";
      el.style.marginBottom = "";
      el.style.paddingTop = "";
      el.style.paddingBottom = "";
      el.getAnimations().forEach((a) => a.cancel());
    })
    .catch(() => undefined);
}

/**
 * Dissolve a DOM node into canvas particles (leave / remove).
 * Element is hidden immediately; optional height collapse starts mid-flight.
 */
export async function dustVanish(
  el: HTMLElement,
  { duration = 1100, step = 3, collapse = true, onStart = () => {} }: DustEffectOptions = {},
): Promise<void> {
  if (typeof document === "undefined" || prefersReducedMotion()) {
    onStart();
    return;
  }

  ensureDustLayerStyle();
  const rect = el.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) {
    onStart();
    return;
  }

  const scale = Math.min(window.devicePixelRatio || 1, 2);
  let shot: HTMLCanvasElement;
  try {
    shot = await rasterizeDOM(el, scale);
  } catch {
    onStart();
    return;
  }

  const layer = document.createElement("canvas");
  layer.className = "dust-layer";
  layer.width = shot.width + Math.round(170 * scale);
  layer.height = shot.height + Math.round(100 * scale);
  layer.style.width = `${layer.width / scale}px`;
  layer.style.height = `${layer.height / scale}px`;
  layer.style.transform = `translate(${rect.left}px,${rect.top - 50}px)`;
  document.body.append(layer);

  const ctx = layer.getContext("2d")!;
  const source = shot.getContext("2d")!.getImageData(0, 0, shot.width, shot.height);
  const W = shot.width;
  const H = shot.height;
  const s = Math.max(2, Math.round(step * scale));
  const particles = sampleParticles(source, W, H, s);

  el.style.visibility = "hidden";
  onStart();

  const start = performance.now();
  const dissolveEnd = 0.64;
  let collapseStarted = false;
  let collapsePromise: Promise<void> = Promise.resolve();

  await new Promise<void>((resolve) => {
    function frame(now: number) {
      const t = Math.min(1, (now - start) / duration);
      const wave = Math.min(1, t / dissolveEnd);
      const smooth = wave * wave * (3 - 2 * wave);
      const edge = W * (1 - smooth);

      if (collapse && !collapseStarted && t >= 0.52) {
        collapseStarted = true;
        collapsePromise = collapseElement(el, duration * 0.3);
      }

      ctx.clearRect(0, 0, layer.width, layer.height);
      if (edge > 0) {
        ctx.drawImage(
          shot,
          0,
          0,
          Math.ceil(edge),
          H,
          0,
          Math.round(50 * scale),
          Math.ceil(edge),
          H,
        );
      }

      for (const p of particles) {
        const born = ((W - p.x) / W) * dissolveEnd * 0.94;
        const lifetime = 1 - born;
        const age = (t - born) / lifetime;
        if (age <= 0 || age >= 1) continue;

        const motion = 1 - Math.pow(1 - age, 2.2);
        const fade = Math.pow(1 - age, 1.25);
        const wind = (35 + 115 * p.r) * scale;
        const px = p.x + motion * wind + Math.sin(age * 5 + p.r * 11) * (3 + 9 * p.r2) * scale;
        const py =
          p.y +
          50 * scale -
          motion * (10 + 58 * p.r2) * scale +
          Math.sin(age * Math.PI * 2 + p.r * 8) * 7 * scale;
        const size = s * (0.35 + 0.9 * p.r2) * (1 - age * 0.62);
        ctx.globalAlpha = fade;
        ctx.fillStyle = p.color;
        drawParticle(ctx, p, px, py, size, age);
      }

      ctx.globalAlpha = 1;
      if (t < 1) requestAnimationFrame(frame);
      else resolve();
    }
    requestAnimationFrame(frame);
  });

  await collapsePromise;
  layer.remove();
}

/**
 * Assemble a DOM node from particles (enter / restore).
 * Element stays hidden until particles settle, then fades in.
 */
export async function dustAssemble(
  el: HTMLElement,
  { duration = 1000, step = 3, collapse = true, onStart = () => {} }: DustEffectOptions = {},
): Promise<void> {
  if (typeof document === "undefined" || prefersReducedMotion()) {
    onStart();
    return;
  }

  ensureDustLayerStyle();
  const rect = el.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) {
    onStart();
    return;
  }

  const scale = Math.min(window.devicePixelRatio || 1, 2);
  el.style.visibility = "hidden";

  let shot: HTMLCanvasElement;
  try {
    shot = await rasterizeDOM(el, scale);
  } catch {
    el.style.visibility = "";
    onStart();
    return;
  }

  const layer = document.createElement("canvas");
  layer.className = "dust-layer";
  layer.width = shot.width + Math.round(170 * scale);
  layer.height = shot.height + Math.round(100 * scale);
  layer.style.width = `${layer.width / scale}px`;
  layer.style.height = `${layer.height / scale}px`;
  layer.style.transform = `translate(${rect.left}px,${rect.top - 50}px)`;
  document.body.append(layer);

  const ctx = layer.getContext("2d")!;
  const source = shot.getContext("2d")!.getImageData(0, 0, shot.width, shot.height);
  const W = shot.width;
  const H = shot.height;
  const s = Math.max(2, Math.round(step * scale));
  const particles = sampleParticles(source, W, H, s);

  onStart();

  const expandPromise = collapse ? expandElement(el, duration * 0.35) : Promise.resolve();
  const start = performance.now();
  const assembleStart = 0.12;
  const assembleEnd = 0.78;

  await new Promise<void>((resolve) => {
    function frame(now: number) {
      const t = Math.min(1, (now - start) / duration);
      // Reverse dissolve: solid edge grows from left as particles settle.
      const wave = Math.max(0, Math.min(1, (t - assembleStart) / (assembleEnd - assembleStart)));
      const smooth = wave * wave * (3 - 2 * wave);
      const edge = W * smooth;

      ctx.clearRect(0, 0, layer.width, layer.height);
      if (edge > 0) {
        ctx.drawImage(
          shot,
          0,
          0,
          Math.ceil(edge),
          H,
          0,
          Math.round(50 * scale),
          Math.ceil(edge),
          H,
        );
      }

      for (const p of particles) {
        const settleAt = assembleStart + (p.x / W) * (assembleEnd - assembleStart) * 0.94;
        const lifetime = Math.max(0.18, settleAt);
        const age = 1 - Math.min(1, Math.max(0, t / lifetime));
        if (age <= 0 || p.x <= edge) continue;

        const motion = age;
        const fade = Math.pow(age, 0.85);
        const wind = (35 + 115 * p.r) * scale;
        const px = p.x + motion * wind + Math.sin(age * 5 + p.r * 11) * (3 + 9 * p.r2) * scale;
        const py =
          p.y +
          50 * scale -
          motion * (10 + 58 * p.r2) * scale +
          Math.sin(age * Math.PI * 2 + p.r * 8) * 7 * scale;
        const size = s * (0.35 + 0.9 * p.r2) * (0.4 + age * 0.6);
        ctx.globalAlpha = fade;
        ctx.fillStyle = p.color;
        drawParticle(ctx, p, px, py, size, 1 - age);
      }

      ctx.globalAlpha = 1;
      if (t < 1) requestAnimationFrame(frame);
      else resolve();
    }
    requestAnimationFrame(frame);
  });

  await expandPromise;
  el.style.visibility = "";
  layer.remove();
}

export function canUseDustEffect(): boolean {
  return typeof document !== "undefined" && !prefersReducedMotion();
}

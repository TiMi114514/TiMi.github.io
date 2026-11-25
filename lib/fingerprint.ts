/**
 * Lightweight browser fingerprint (no third-party library).
 *
 * Combines stable, low-entropy signals — screen, timezone, language, platform,
 * hardware concurrency, a canvas render and WebGL renderer — and hashes them
 * with SHA-256. Used only so admins can spot the same device across sessions.
 */

export type FingerprintComponents = {
  platform: string;
  languages: string;
  timezone: string;
  screen: string;
  colorDepth: number;
  pixelRatio: number;
  cores: number;
  memory: number | null;
  touch: number;
  webgl: string;
  canvas: string;
};

export type Fingerprint = { hash: string; components: FingerprintComponents };

let cached: Promise<Fingerprint> | null = null;

function canvasSignal(): string {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 220;
    canvas.height = 40;
    const ctx = canvas.getContext('2d');
    if (!ctx) return 'none';
    ctx.textBaseline = 'top';
    ctx.font = "16px 'Arial'";
    ctx.fillStyle = '#f60';
    ctx.fillRect(100, 1, 62, 20);
    ctx.fillStyle = '#069';
    ctx.fillText('A-Level Hub ∂x 🙂', 2, 15);
    ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
    ctx.fillText('A-Level Hub ∂x 🙂', 4, 17);
    return canvas.toDataURL().slice(-64);
  } catch {
    return 'blocked';
  }
}

function webglSignal(): string {
  try {
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')) as
      | WebGLRenderingContext
      | null;
    if (!gl) return 'none';
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const vendor = info ? gl.getParameter(info.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR);
    const renderer = info
      ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL)
      : gl.getParameter(gl.RENDERER);
    return `${vendor} / ${renderer}`.slice(0, 160);
  } catch {
    return 'blocked';
  }
}

async function sha256(text: string): Promise<string> {
  try {
    const bytes = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, 32);
  } catch {
    // crypto.subtle needs a secure context; fall back to a simple 53-bit hash.
    let h1 = 0xdeadbeef;
    let h2 = 0x41c6ce57;
    for (let i = 0; i < text.length; i += 1) {
      const ch = text.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
  }
}

export function getFingerprint(): Promise<Fingerprint> {
  if (cached) return cached;
  cached = (async () => {
    const nav = navigator as Navigator & { deviceMemory?: number };
    const components: FingerprintComponents = {
      platform: nav.platform || 'unknown',
      languages: (nav.languages ?? [nav.language]).join(','),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown',
      screen: `${window.screen.width}x${window.screen.height}`,
      colorDepth: window.screen.colorDepth,
      pixelRatio: Math.round((window.devicePixelRatio || 1) * 100) / 100,
      cores: nav.hardwareConcurrency || 0,
      memory: typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null,
      touch: nav.maxTouchPoints || 0,
      webgl: webglSignal(),
      canvas: canvasSignal(),
    };
    const hash = await sha256(JSON.stringify(components));
    return { hash, components };
  })();
  return cached;
}

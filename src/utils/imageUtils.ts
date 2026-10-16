
// Helper to resize image to exact custom dimensions (Client-side)
export const resizeToCustomSize = (srcDataUrl: string, width: number, height: number): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('No canvas context'));

      // Draw "Cover" style (preserving aspect ratio, cropping edges)
      const scale = Math.max(width / img.width, height / img.height);
      const x = (width - img.width * scale) / 2;
      const y = (height - img.height * scale) / 2;

      ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = reject;
    img.src = srcDataUrl;
  });
};

// Optimization Helper: Resize to max dimension and compress
export const optimizeBase64Image = (
  base64Str: string, 
  maxDimension: number = 1024, 
  quality: number = 0.8
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      let width = img.width;
      let height = img.height;

      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) {
        resolve(base64Str);
        return;
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, width, height);

      // Check if image has transparency to avoid destroying alpha cutouts
      let hasAlpha = false;
      const isPotentiallyTransparent = 
        base64Str.startsWith('data:image/png') || 
        base64Str.startsWith('data:image/webp') || 
        !base64Str.startsWith('data:image/');

      if (isPotentiallyTransparent) {
        try {
          const imgData = ctx.getImageData(0, 0, width, height).data;
          // Step by 4 to inspect alpha channel (byte 3, 7, 11...)
          // Alpha < 250 indicates partial or complete transparency
          for (let i = 3; i < imgData.length; i += 4) {
            if (imgData[i] < 250) {
              hasAlpha = true;
              break;
            }
          }
        } catch (e) {
          // If canvas is tainted or getImageData fails, fallback to mime detection
          if (base64Str.startsWith('data:image/png') || base64Str.startsWith('data:image/webp')) {
            hasAlpha = true;
          }
        }
      }

      if (hasAlpha) {
        // Preserve transparent cutouts (PNG for lossless transparency, WebP if original was WebP)
        const mimeType = base64Str.startsWith('data:image/webp') ? 'image/webp' : 'image/png';
        resolve(canvas.toDataURL(mimeType, quality));
      } else {
        resolve(canvas.toDataURL('image/jpeg', quality));
      }
    };
    img.onerror = (e) => {
        console.warn("Image optimization failed, using original", e);
        resolve(base64Str);
    };
    img.src = base64Str;
  });
};

// Create a composite for outpainting: Place source image in center of new canvas with Zoom and Pan
export const createCompositeImage = (
  srcDataUrl: string,
  targetWidth: number,
  targetHeight: number,
  zoom: number = 1.0, 
  panX: number = 0,   
  panY: number = 0    
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('No canvas context'));

      ctx.save();
      ctx.filter = 'blur(40px) brightness(0.9)'; 
      ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
      ctx.restore();

      const scaleW = targetWidth / img.width;
      const scaleH = targetHeight / img.height;
      const baseScale = Math.min(scaleW, scaleH);
      const finalScale = baseScale * zoom;
      const drawW = img.width * finalScale;
      const drawH = img.height * finalScale;
      const x = ((targetWidth - drawW) / 2) + panX;
      const y = ((targetHeight - drawH) / 2) + panY;

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, x, y, drawW, drawH);
      
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = reject;
    img.src = srcDataUrl;
  });
};

// --- Color Space Helpers ---
const rgbToHsv = (r: number, g: number, b: number) => {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s, v = max;
  const d = max - min;
  s = max === 0 ? 0 : d / max;
  if (max !== min) {
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return { h: h * 360, s, v };
};

const hexToRgb = (hex: string) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 255, g: 0, b: 255 };
};

/**
 * Transparent NEO v2 (SteamSafe Ultra Matting)
 * Professional Background Removal, Multi-Point Sampling & Achromatic Neutralization
 */
export const removeBackgroundNeo = (
  srcDataUrl: string,
  config: {
    keyColor?: string,
    tolBg: number,
    tolEdge: number,
    softRadius: number,
    decontamStrength: number,
    preserveTrueMagenta: boolean,
    fxMode: boolean,
    removeHoles: boolean,
    healingPower: number,
    steamSafe?: boolean,
    neutralizeStrength?: number,
    alphaBias?: number
  }
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) { reject(new Error('No context')); return; }
      ctx.drawImage(img, 0, 0);
      
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      const w = canvas.width;
      const h = canvas.height;
      const totalPixels = w * h;
      
      const visited = new Uint8Array(totalPixels);
      const isBackground = new Uint8Array(totalPixels);
      const alphaMatte = new Float32Array(totalPixels);

      // --- Pass 0: Multi-Point Perimeter & Corner Calibration ---
      let hexKey = config.keyColor || "#FFFFFF";
      const userKeyRgb = hexToRgb(hexKey);

      // Sample a 5x5 patch at a coordinate to avoid single-pixel noise
      const samplePatch = (cx: number, cy: number) => {
        let pr = 0, pg = 0, pb = 0, count = 0;
        for (let dy = -2; dy <= 2; dy++) {
          const sy = Math.max(0, Math.min(h - 1, cy + dy));
          for (let dx = -2; dx <= 2; dx++) {
            const sx = Math.max(0, Math.min(w - 1, cx + dx));
            const p = (sy * w + sx) * 4;
            pr += data[p];
            pg += data[p + 1];
            pb += data[p + 2];
            count++;
          }
        }
        return { r: pr / count, g: pg / count, b: pb / count };
      };

      const cornerTL = samplePatch(2, 2);
      const cornerTR = samplePatch(w - 3, 2);
      const cornerBL = samplePatch(2, h - 3);
      const cornerBR = samplePatch(w - 3, h - 3);

      // Auto-detect dominant chroma key (Magenta, Green, or User Key)
      const detectChroma = (c: { r: number, g: number, b: number }) => {
        const isMagenta = c.r > 190 && c.b > 190 && c.g < 120;
        const isGreen = c.g > 190 && c.r < 120 && c.b < 120;
        if (isMagenta) return { r: 255, g: 0, b: 255 };
        if (isGreen) return { r: 0, g: 255, b: 0 };
        return null;
      };

      const detectedCornerChroma = detectChroma(cornerTL) || detectChroma(cornerTR) || detectChroma(cornerBL) || detectChroma(cornerBR);
      const effectiveKeyRgb = detectedCornerChroma || userKeyRgb;
      const keyHsv = rgbToHsv(effectiveKeyRgb.r, effectiveKeyRgb.g, effectiveKeyRgb.b);

      // Bilinear background color field to handle subtle top-to-bottom lighting gradients
      const getExpectedBg = (x: number, y: number) => {
        const u = w > 1 ? x / (w - 1) : 0;
        const v = h > 1 ? y / (h - 1) : 0;
        const r = (1 - u) * (1 - v) * cornerTL.r + u * (1 - v) * cornerTR.r + (1 - u) * v * cornerBL.r + u * v * cornerBR.r;
        const g = (1 - u) * (1 - v) * cornerTL.g + u * (1 - v) * cornerTR.g + (1 - u) * v * cornerBL.g + u * v * cornerBR.g;
        const b = (1 - u) * (1 - v) * cornerTL.b + u * (1 - v) * cornerTR.b + (1 - u) * v * cornerBL.b + u * v * cornerBR.b;
        return { r, g, b };
      };

      // Perceptual distance (ITU-R BT.601 weighted)
      const getDist = (p: number, x: number, y: number) => {
        const idx = p * 4;
        const bg = getExpectedBg(x, y);
        const dr = data[idx] - bg.r;
        const dg = data[idx + 1] - bg.g;
        const db = data[idx + 2] - bg.b;
        return Math.sqrt(dr * dr * 0.299 + dg * dg * 0.587 + db * db * 0.114);
      };

      // --- Pass 1: BFS Boundary Isolation ---
      const tolBg = config.tolBg ?? 60;
      const tolEdge = Math.max(tolBg + 5, config.tolEdge ?? 75);
      const queue: number[] = [];
      let head = 0;

      const pushBoundary = (x: number, y: number) => {
        const p = y * w + x;
        if (!visited[p] && getDist(p, x, y) <= tolBg) {
          visited[p] = 1;
          queue.push(p);
        }
      };

      // Seed all 4 edges
      for (let x = 0; x < w; x++) { pushBoundary(x, 0); pushBoundary(x, h - 1); }
      for (let y = 0; y < h; y++) { pushBoundary(0, y); pushBoundary(w - 1, y); }

      while (head < queue.length) {
        const p = queue[head++];
        isBackground[p] = 1;
        alphaMatte[p] = 0;
        const x = p % w, y = Math.floor(p / w);

        if (x > 0) pushBoundary(x - 1, y);
        if (x < w - 1) pushBoundary(x + 1, y);
        if (y > 0) pushBoundary(x, y - 1);
        if (y < h - 1) pushBoundary(x, y + 1);
      }

      // --- Pass 2: Intelligent Trapped Hole Healing ---
      if (config.removeHoles) {
        const minHoleSize = Math.max(8, Math.floor(6 + (config.healingPower * 0.2)));
        const holeTolerance = tolBg * 1.08;

        for (let i = 0; i < totalPixels; i++) {
          const ix = i % w, iy = Math.floor(i / w);
          if (!visited[i] && getDist(i, ix, iy) <= holeTolerance) {
            const island: number[] = [];
            const islandQueue: number[] = [i];
            let islandHead = 0;
            visited[i] = 1;

            let islandSumDist = 0;
            while (islandHead < islandQueue.length) {
              const p = islandQueue[islandHead++];
              island.push(p);
              const x = p % w, y = Math.floor(p / w);
              islandSumDist += getDist(p, x, y);

              const neighbors = [
                x > 0 ? p - 1 : -1,
                x < w - 1 ? p + 1 : -1,
                y > 0 ? p - w : -1,
                y < h - 1 ? p + w : -1
              ];

              for (const n of neighbors) {
                if (n >= 0 && !visited[n]) {
                  const nx = n % w, ny = Math.floor(n / w);
                  if (getDist(n, nx, ny) <= holeTolerance) {
                    visited[n] = 1;
                    islandQueue.push(n);
                  }
                }
              }
            }

            // Protect small character details (eyes, teeth, metallic studs)
            // Only erase enclosed regions that are true background holes
            const avgDist = islandSumDist / island.length;
            if (island.length >= minHoleSize && avgDist <= tolBg * 0.95) {
              for (const p of island) {
                isBackground[p] = 1;
                alphaMatte[p] = 0;
              }
            }
          }
        }
      }

      // --- Pass 3: Morphological Anti-Aliased Edge Softening ---
      const bias = (config.alphaBias || 0) / 100;
      const softRadius = Math.max(1, Math.min(5, Math.round(config.softRadius || 2)));
      const edgeBand = new Uint8Array(totalPixels);

      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = y * w + x;
          if (isBackground[i]) continue;

          // Default full opacity for foreground
          alphaMatte[i] = 1.0;

          // Check if within softRadius of background
          let nearBg = false;
          for (let ry = -softRadius; ry <= softRadius && !nearBg; ry++) {
            const ny = y + ry;
            if (ny < 0 || ny >= h) continue;
            for (let rx = -softRadius; rx <= softRadius; rx++) {
              const nx = x + rx;
              if (nx < 0 || nx >= w) continue;
              if (isBackground[ny * w + nx]) {
                nearBg = true;
                break;
              }
            }
          }

          if (nearBg) {
            edgeBand[i] = 1;
            const d = getDist(i, x, y);
            if (d < tolEdge) {
              const range = Math.max(1, tolEdge - tolBg);
              const factor = Math.max(0, Math.min(1, (d - tolBg) / range));
              // Hermite S-Curve for smooth anti-aliased edge transition
              const smoothT = factor * factor * (3 - 2 * factor);
              alphaMatte[i] = Math.max(0, Math.min(1, smoothT + (1 - smoothT) * bias));
            }
          }
        }
      }

      // Sub-pixel 3x3 Gaussian smoothing on the edge transition band to eliminate pixel staircasing
      const smoothedAlpha = new Float32Array(alphaMatte);
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const i = y * w + x;
          if (edgeBand[i] && alphaMatte[i] > 0 && alphaMatte[i] < 1) {
            const sum =
              alphaMatte[i - w - 1] * 0.0625 + alphaMatte[i - w] * 0.125 + alphaMatte[i - w + 1] * 0.0625 +
              alphaMatte[i - 1] * 0.125 + alphaMatte[i] * 0.25 + alphaMatte[i + 1] * 0.125 +
              alphaMatte[i + w - 1] * 0.0625 + alphaMatte[i + w] * 0.125 + alphaMatte[i + w + 1] * 0.0625;
            smoothedAlpha[i] = sum;
          }
        }
      }

      // --- Pass 4: Chroma Defringing & SteamSafe Achromatic Neutralization ---
      const decontam = (config.decontamStrength ?? 85) / 100;
      const steamSafe = config.steamSafe ?? true;
      const neutStrength = (config.neutralizeStrength ?? 85) / 100;

      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = y * w + x;
          const idx = i * 4;
          const a = smoothedAlpha[i];

          if (a <= 0.005) {
            data[idx + 3] = 0;
            continue;
          }

          let r = data[idx];
          let g = data[idx + 1];
          let b = data[idx + 2];
          const bg = getExpectedBg(x, y);

          // Straight Alpha Unblending (Chroma Spill Suppression)
          if (a < 1.0) {
            const effAlpha = Math.max(0.12, a);
            const factor = (1 - a) * decontam;
            r = (r - factor * bg.r) / (1 - factor * (1 - effAlpha));
            g = (g - factor * bg.g) / (1 - factor * (1 - effAlpha));
            b = (b - factor * bg.b) / (1 - factor * (1 - effAlpha));
          }

          // SteamSafe: Achromatic Neutralization on residual fringe pixels
          if (steamSafe && a < 0.75) {
            const hsv = rgbToHsv(r, g, b);
            const hueDist = Math.min(Math.abs(hsv.h - keyHsv.h), 360 - Math.abs(hsv.h - keyHsv.h));

            if (hueDist < 50 && hsv.s > 0.05) {
              const lum = r * 0.299 + g * 0.587 + b * 0.114;
              const isSparks = (hsv.h > 15 && hsv.h < 75 && hsv.s > 0.5);
              if (!isSparks) {
                const k = neutStrength * (1 - a);
                r = r * (1 - k) + lum * k;
                g = g * (1 - k) + lum * k;
                b = b * (1 - k) + lum * k;
              }
            }
          }

          // FX Mode Glow Guard: protect bright ethereal particle effects
          if (config.fxMode) {
            const lum = r * 0.299 + g * 0.587 + b * 0.114;
            if (lum > 195 && a < 0.55) {
              const glowAlpha = Math.min(1.0, a + ((lum - 195) / 60) * 0.6);
              data[idx + 3] = Math.round(glowAlpha * 255);
            } else {
              data[idx + 3] = Math.round(a * 255);
            }
          } else {
            data[idx + 3] = Math.round(a * 255);
          }

          data[idx] = Math.max(0, Math.min(255, Math.round(r)));
          data[idx + 1] = Math.max(0, Math.min(255, Math.round(g)));
          data[idx + 2] = Math.max(0, Math.min(255, Math.round(b)));
        }
      }

      ctx.putImageData(imageData, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = reject;
    img.src = srcDataUrl;
  });
};

/**
 * AI-Assisted Background & Hole Removal (Unified Standard)
 * Delegates to Ultra Matting engine with sensible defaults
 */
export const removeBackground = (
  srcDataUrl: string, 
  tolerance: number = 60, 
  removeHoles: boolean = true,
  healing: number = 100,
  keyColor?: string
): Promise<string> => {
  return removeBackgroundNeo(srcDataUrl, {
    keyColor: keyColor || "#FFFFFF",
    tolBg: tolerance,
    tolEdge: tolerance + 15,
    softRadius: 3,
    decontamStrength: 85,
    preserveTrueMagenta: false,
    fxMode: false,
    removeHoles: removeHoles,
    healingPower: healing,
    steamSafe: true,
    neutralizeStrength: 85,
    alphaBias: 10
  });
};

export const base64ToBlobUrl = (base64: string): string => {
  if (!base64 || !base64.startsWith('data:')) return base64;
  try {
    const parts = base64.split(',');
    const mime = parts[0].match(/:(.*?);/)?.[1] || 'image/png';
    const bstr = atob(parts[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    const blob = new Blob([u8arr], { type: mime });
    return URL.createObjectURL(blob);
  } catch (e) {
    console.error("Failed to convert base64 to blob URL", e);
    return base64;
  }
};

export const blobUrlToBase64 = async (url: string): Promise<string> => {
  if (url.startsWith('data:')) return url;
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    
    // Memory optimization: if the image is large, we should optimize it before returning
    // to prevent DataCloneError in performance.measure or state updates
    if (base64.length > 1024 * 1024) { // > 1MB
       return await optimizeBase64Image(base64, 1024, 0.8);
    }
    
    return base64;
  } catch (e) {
    console.error("Failed to convert blob URL to base64", e);
    throw e;
  }
};

export const generateSpriteSheetGrid = (
  imageUrls: string[],
  columns: number = 4
): Promise<string> => {
  return new Promise((resolve, reject) => {
    if (imageUrls.length === 0) return reject(new Error("No images provided"));

    const images: HTMLImageElement[] = [];
    let loadedCount = 0;

    const onImageLoad = () => {
      loadedCount++;
      if (loadedCount === imageUrls.length) {
        // All images loaded, draw to canvas
        const firstImg = images[0];
        const frameWidth = firstImg.width;
        const frameHeight = firstImg.height;
        const rows = Math.ceil(imageUrls.length / columns);

        const canvas = document.createElement('canvas');
        canvas.width = frameWidth * columns;
        canvas.height = frameHeight * rows;
        const ctx = canvas.getContext('2d');

        if (!ctx) return reject(new Error("Could not get canvas context"));

        images.forEach((img, index) => {
          const col = index % columns;
          const row = Math.floor(index / columns);
          ctx.drawImage(img, col * frameWidth, row * frameHeight, frameWidth, frameHeight);
        });

        resolve(canvas.toDataURL('image/png'));
      }
    };

    imageUrls.forEach((url, i) => {
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      img.onload = onImageLoad;
      img.onerror = () => reject(new Error(`Failed to load image at index ${i}`));
      img.src = url;
      images[i] = img;
    });
  });
};

export const sliceImageIntoTiles = (
  imageUrl: string,
  rows: number,
  cols: number
): Promise<string[]> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      const tileWidth = Math.floor(img.width / cols);
      const tileHeight = Math.floor(img.height / rows);
      const tiles: string[] = [];

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const canvas = document.createElement('canvas');
          canvas.width = tileWidth;
          canvas.height = tileHeight;
          const ctx = canvas.getContext('2d');
          if (!ctx) continue;

          ctx.drawImage(
            img,
            c * tileWidth,
            r * tileHeight,
            tileWidth,
            tileHeight,
            0,
            0,
            tileWidth,
            tileHeight
          );
          tiles.push(canvas.toDataURL('image/png'));
        }
      }
      resolve(tiles);
    };
    img.onerror = reject;
    img.src = imageUrl;
  });
};

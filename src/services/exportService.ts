
import JSZip from 'jszip';
import { HistoryEntry, ExportConfig, GameContext, ResizeItem, WorkspaceTab } from "../types";
import { APP_NAME, APP_VERSION } from "../constants";
import { generateSpriteSheetGrid, sliceImageIntoTiles, resizeToCustomSize } from '../utils/imageUtils';

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

const urlToBlob = async (url: string): Promise<Blob> => {
  if (!url) throw new Error("URL is empty");
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch image: ${response.statusText}`);
  return await response.blob();
};

export const exportSingleImage = (imageDataUrl: string, filename: string) => {
  const link = document.createElement('a');
  link.href = imageDataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

/**
 * Advanced Project Export
 * Iterates through selected tabs and organizes them into character-specific folders.
 */
export const exportProjectBatch = async (tabs: WorkspaceTab[], config: ExportConfig) => {
  const zip = new JSZip();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const baseName = `${APP_NAME}_Project_${timestamp}`;

  // Use selected tabs if provided, otherwise all tabs
  const selectedTabs = config.selectedTabIds && config.selectedTabIds.length > 0 
    ? tabs.filter(t => config.selectedTabIds.includes(t.id))
    : tabs;

  for (const tab of selectedTabs) {
    // Generate a unique safe name for the character folder
    const safeCharName = (tab.characterName || tab.name || "Untitled").replace(/[^a-z0-9]/gi, '_');
    const folder = zip.folder(safeCharName);
    if (!folder) continue;

    if (tab.mode === 'gacha') {
       // Export Gacha Slots for Character Bible
       for (const asset of tab.gachaAssets) {
          if (asset.imageUrl && config.includeImage) {
             try {
                const blob = await urlToBlob(asset.imageUrl);
                const safeAssetName = (asset.name || "asset").replace(/[^a-z0-9]/gi, '_');
                folder.file(`${safeAssetName}.png`, blob);
             } catch (e) {
                console.error(`Failed to export asset ${asset.name} for ${safeCharName}`, e);
             }
          }
       }
    } else {
       // Export main result image for other workspace modes
       if (tab.generatedImage && config.includeImage) {
          try {
             const blob = await urlToBlob(tab.generatedImage);
             folder.file(`main_result.png`, blob);
          } catch (e) {
             console.error(`Failed to export main image for ${safeCharName}`, e);
          }
       }
    }

    // Include metadata for each character tab
    if (config.includePrompts) {
       const metadata = {
          character_info: {
             name: tab.characterName,
             subtitle: tab.characterSubtitle,
             race: tab.characterRace,
             gender: tab.characterGender,
             traits: tab.characterTraits,
          },
          workspace_info: {
             mode: tab.mode,
             style_id: tab.selectedStyleId,
             aspect_ratio: tab.selectedAspectRatio,
             size: tab.selectedSize,
             base_prompt: tab.prompt
          },
          export_info: {
             app: APP_NAME,
             version: APP_VERSION,
             timestamp: new Date().toISOString()
          }
       };
       folder.file('character_metadata.json', JSON.stringify(metadata, null, 2));
    }
  }

  // Add global project context if requested
  if (config.includeProjectContext) {
     const projectMeta = {
        project_name: baseName,
        total_tabs: selectedTabs.length,
        tabs: selectedTabs.map(t => ({ id: t.id, name: t.name, mode: t.mode }))
     };
     zip.file('project_overview.json', JSON.stringify(projectMeta, null, 2));
  }

  const content = await zip.generateAsync({ type: "blob" });
  downloadBlob(content, `${baseName}.zip`);
};

export const exportZip = async (
  entry: HistoryEntry,
  config: ExportConfig,
  gameContext?: GameContext,
  currentImageOverride?: string | null
) => {
  const timestamp = new Date(entry.timestamp).toISOString().replace(/[:.]/g, '-');
  const baseName = `${APP_NAME}_${entry.mode}_${timestamp}`;
  const imageToExport = currentImageOverride || entry.thumbnailUrl;

  const zip = new JSZip();
  if (config.includeImage && imageToExport) {
    try {
      const blob = await urlToBlob(imageToExport);
      zip.file(`${baseName}_result.png`, blob);
    } catch (e) {
       console.error("ZIP single image export failed", e);
    }
  }

  if (config.includePrompts) {
    const metadata = { 
       app: APP_NAME, 
       version: APP_VERSION, 
       mode: entry.mode, 
       user_prompt: entry.userPrompt,
       full_prompt: entry.fullPrompt,
       timestamp: entry.timestamp
    };
    zip.file(`metadata.json`, JSON.stringify(metadata, null, 2));
  }

  const content = await zip.generateAsync({ type: "blob" });
  downloadBlob(content, `${baseName}.zip`);
};

export const exportSessionImages = async (images: string[], baseName: string) => {
  if (!images || images.length === 0) return;
  const zip = new JSZip();
  const folder = zip.folder("batch_export");
  if (folder) {
    for (let i = 0; i < images.length; i++) {
      try {
        const blob = await urlToBlob(images[i]);
        folder.file(`${baseName}_${i + 1}.png`, blob);
      } catch (e) {
         console.error(`Batch image ${i} export failed`, e);
      }
    }
  }
  const content = await zip.generateAsync({ type: "blob" });
  downloadBlob(content, `${baseName}_batch.zip`);
};

export const exportResizeBatch = async (queue: ResizeItem[]) => {
  const completedItems = queue.filter(item => item.status === 'done' && item.resultUrl);
  if (completedItems.length === 0) return;
  const zip = new JSZip();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const folder = zip.folder(`resize_batch_${timestamp}`);
  if (!folder) return;
  for (const item of completedItems) {
    if (item.resultUrl) {
      try {
        const blob = await urlToBlob(item.resultUrl);
        const safeName = (item.name || "untitled").replace(/[^a-z0-9]/gi, '_').toLowerCase();
        folder.file(`resized_${safeName}.png`, blob);
      } catch (e) {
         console.error(`Resize batch item ${item.id} failed`, e);
      }
    }
  }
  const content = await zip.generateAsync({ type: "blob" });
  downloadBlob(content, `resize_batch_${timestamp}.zip`);
};

export const generateUnitySpriteSheetMeta = (
  sheetWidth: number,
  sheetHeight: number,
  frameWidth: number,
  frameHeight: number,
  columns: number,
  totalFrames: number,
  baseName: string
): string => {
  let spriteSheetEntries = '';
  
  for (let i = 0; i < totalFrames; i++) {
    const col = i % columns;
    const row = Math.floor(i / columns);
    const unityY = sheetHeight - (row + 1) * frameHeight;
    const unityX = col * frameWidth;
    const frameId = `${baseName}_${i}`;

    spriteSheetEntries += `    - serializedVersion: 2
      name: ${frameId}
      rect:
        serializedVersion: 2
        x: ${unityX}
        y: ${unityY}
        width: ${frameWidth}
        height: ${frameHeight}
      alignment: 0
      pivot: {x: 0.5, y: 0.5}
      border: {x: 0, y: 0, z: 0, w: 0}
      outline: []
      physicsShape: []
      tessellationDetail: 0
      bones: []
      spriteID: ${Math.random().toString(16).substring(2, 34).padEnd(32, '0')}
      internalID: ${10000000 + i}
      vertices: []
      indices: 
      edges: []
      weights: []
`;
  }

  return `fileFormatVersion: 2
guid: ${Math.random().toString(16).substring(2, 34).padEnd(32, '0')}
TextureImporter:
  internalIDToNameTable: []
  externalObjects: {}
  serializedVersion: 13
  mipmaps:
    mipMapMode: 0
    enableMipMap: 0
    sRGBTexture: 1
    linearTexture: 0
    fadeOut: 0
    borderMipMap: 0
    mipMapsPreservesCoverage: 0
    alphaTestReferenceValue: 0.5
    mipMapFadeDistanceStart: 1
    mipMapFadeDistanceEnd: 3
  bumpmap:
    convertToNormalMap: 0
    externalNormalMap: 0
    heightScale: 0.25
    normalMapFilter: 0
  isReadable: 0
  streamingMipmaps: 0
  streamingMipmapsPriority: 0
  vTOnly: 0
  ignoreMasterTextureLimit: 0
  grayScaleToAlpha: 0
  generateCubemap: 6
  cubemapConvolution: 0
  seamlessCubemap: 0
  textureFormat: 1
  maxTextureSize: 4096
  textureSettings:
    serializedVersion: 2
    filterMode: 0
    aniso: 1
    mipBias: 0
    wrapU: 1
    wrapV: 1
    wrapW: 1
  nPOTScale: 0
  lightmap: 0
  compressionQuality: 50
  spriteMode: 2
  spriteExtrude: 1
  spriteMeshType: 1
  alignment: 0
  spritePivot: {x: 0.5, y: 0.5}
  spritePixelsToUnits: 100
  spriteBorder: {x: 0, y: 0, z: 0, w: 0}
  spriteGenerateFallbackPhysicsShape: 1
  alphaUsage: 1
  alphaIsTransparency: 1
  spriteTessellationDetail: -1
  textureType: 8
  textureShape: 1
  singleChannelComponent: 0
  flipbook: 0
  platformSettings: []
  spriteSheet:
    serializedVersion: 2
    sprites:
${spriteSheetEntries}
    outline: []
    physicsShape: []
    bones: []
    spriteID: 
    internalID: 0
    vertices: []
    indices: 
    edges: []
    weights: []
    secondaryTextures: []
    nameFileIdTable: {}
  spritePackingTag: 
  pSDRemoveMatte: 0
  pSDShowRemoveMatteOption: 0
  userData: 
  assetBundleName: 
  assetBundleVariant: 
`;
};

export const generateGodotSpriteFramesTres = (
  framesCount: number,
  baseName: string,
  fps: number = 8
): string => {
  let extResources = '';
  let frameRefs = '';

  for (let i = 0; i < framesCount; i++) {
    const resId = `ext_frame_${i + 1}`;
    extResources += `[ext_resource type="Texture2D" path="res://${baseName}/${i + 1}_frame.png" id="${resId}"]\n`;
    frameRefs += `{\n"duration": 1.0,\n"texture": ExtResource("${resId}")\n}${i < framesCount - 1 ? ',' : ''}\n`;
  }

  return `[gd_resource type="SpriteFrames" format=3]

${extResources}
[resource]
animations = [{
"frames": [
${frameRefs}],
"loop": true,
"name": &"default",
"speed": ${fps}.0
}]
`;
};

export const generatePrintReadyCardSheet = async (
  cardImageUrls: string[],
  cardWidthPx: number = 750,
  cardHeightPx: number = 1050,
  cols: number = 3,
  rows: number = 3
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const margin = 80;
    const gap = 24;
    const sheetW = margin * 2 + cols * cardWidthPx + (cols - 1) * gap;
    const sheetH = margin * 2 + rows * cardHeightPx + (rows - 1) * gap;

    const canvas = document.createElement('canvas');
    canvas.width = sheetW;
    canvas.height = sheetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return reject(new Error('No canvas context'));

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, sheetW, sheetH);

    const maxCards = cols * rows;
    const itemsToDraw = cardImageUrls.slice(0, maxCards);
    let loaded = 0;

    if (itemsToDraw.length === 0) {
      return resolve(canvas.toDataURL('image/png'));
    }

    itemsToDraw.forEach((url, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const x = margin + col * (cardWidthPx + gap);
      const y = margin + row * (cardHeightPx + gap);

      const img = new Image();
      img.crossOrigin = 'Anonymous';
      img.onload = () => {
        ctx.drawImage(img, x, y, cardWidthPx, cardHeightPx);

        // Crop marks
        ctx.strokeStyle = '#64748B';
        ctx.lineWidth = 1;
        ctx.setLineDash([6, 6]);

        const tick = 20;
        // TL
        ctx.beginPath(); ctx.moveTo(x - tick, y); ctx.lineTo(x, y); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x, y - tick); ctx.lineTo(x, y); ctx.stroke();
        // TR
        ctx.beginPath(); ctx.moveTo(x + cardWidthPx, y); ctx.lineTo(x + cardWidthPx + tick, y); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x + cardWidthPx, y - tick); ctx.lineTo(x + cardWidthPx, y); ctx.stroke();
        // BL
        ctx.beginPath(); ctx.moveTo(x - tick, y + cardHeightPx); ctx.lineTo(x, y + cardHeightPx); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x, y + cardHeightPx); ctx.lineTo(x, y + cardHeightPx + tick); ctx.stroke();
        // BR
        ctx.beginPath(); ctx.moveTo(x + cardWidthPx, y + cardHeightPx); ctx.lineTo(x + cardWidthPx + tick, y + cardHeightPx); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x + cardWidthPx, y + cardHeightPx); ctx.lineTo(x + cardWidthPx, y + cardHeightPx + tick); ctx.stroke();

        ctx.setLineDash([]);

        loaded++;
        if (loaded === itemsToDraw.length) {
          resolve(canvas.toDataURL('image/png'));
        }
      };
      img.onerror = () => {
        loaded++;
        if (loaded === itemsToDraw.length) {
          resolve(canvas.toDataURL('image/png'));
        }
      };
      img.src = url;
    });
  });
};

export const exportSpriteSheet = async (frames: any[], baseName: string) => {
  const completedFrames = frames.filter(f => f.url && f.status === 'done');
  if (completedFrames.length === 0) return;
  const zip = new JSZip();
  const folder = zip.folder(baseName);
  if (!folder) return;

  // Add individual frames
  for (let i = 0; i < completedFrames.length; i++) {
    const frame = completedFrames[i];
    if (frame.url) {
      try {
        const blob = await urlToBlob(frame.url);
        const safeName = (frame.prompt || `frame_${i + 1}`).replace(/[^a-z0-9]/gi, '_').toLowerCase().substring(0, 30);
        folder.file(`${i + 1}_${safeName}.png`, blob);
      } catch (e) {
         console.error(`Sprite frame ${frame.id} export failed`, e);
      }
    }
  }

  // Add unified grid image + Game Engine Presets (Unity .meta & Godot .tres)
  try {
    const imageUrls = completedFrames.map(f => f.url);
    const gridDataUrl = await generateSpriteSheetGrid(imageUrls, 4);
    const gridBlob = await urlToBlob(gridDataUrl);
    folder.file(`${baseName}_grid.png`, gridBlob);

    // Get frame dimensions from the first frame
    const firstImg = new Image();
    firstImg.src = completedFrames[0].url;
    await new Promise((res) => { firstImg.onload = res; firstImg.onerror = res; });
    const frameW = firstImg.width || 256;
    const frameH = firstImg.height || 256;
    const sheetW = frameW * 4;
    const sheetH = frameH * Math.ceil(completedFrames.length / 4);

    // Unity 2D Meta Preset
    const unityMeta = generateUnitySpriteSheetMeta(sheetW, sheetH, frameW, frameH, 4, completedFrames.length, baseName);
    folder.file(`${baseName}_grid.png.meta`, unityMeta);

    // Godot 4.x SpriteFrames Preset
    const godotTres = generateGodotSpriteFramesTres(completedFrames.length, baseName, 8);
    folder.file(`${baseName}_animations.tres`, godotTres);
  } catch (e) {
    console.error("Failed to generate sprite sheet presets for ZIP", e);
  }

  const content = await zip.generateAsync({ type: "blob" });
  downloadBlob(content, `${baseName}.zip`);
};

export const exportSpriteSheetGrid = async (frames: any[], baseName: string) => {
  const completedFrames = frames.filter(f => f.url && f.status === 'done');
  if (completedFrames.length === 0) return;
  
  try {
    const imageUrls = completedFrames.map(f => f.url);
    const gridDataUrl = await generateSpriteSheetGrid(imageUrls);
    const link = document.createElement('a');
    link.href = gridDataUrl;
    link.download = `${baseName}_grid.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (e) {
    console.error("Failed to export sprite sheet grid", e);
  }
};

export const exportTileset = async (
  imageUrl: string,
  rows: number,
  cols: number,
  baseName: string,
  tileSize: number = 64
) => {
  try {
    const tiles = await sliceImageIntoTiles(imageUrl, rows, cols);
    const zip = new JSZip();
    const folder = zip.folder(`${baseName}_tileset`);
    if (!folder) return;

    for (let i = 0; i < tiles.length; i++) {
      // Resize tile to desired export size
      const resizedTile = await resizeToCustomSize(tiles[i], tileSize, tileSize);
      const blob = await urlToBlob(resizedTile);
      const row = Math.floor(i / cols);
      const col = i % cols;
      folder.file(`tile_r${row}_c${col}.png`, blob);
    }

    const content = await zip.generateAsync({ type: "blob" });
    downloadBlob(content, `${baseName}_tileset.zip`);
  } catch (e) {
    console.error("Failed to export tileset", e);
  }
};

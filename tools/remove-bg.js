// One-off tool: strip the studio background out of the product photos in images/
// so the rackets can sit on the card colour like a proper cut-out.
//
//   node tools/remove-bg.js
//
// Strategy: flood fill inward from the image borders, matching pixels that are
// close to the sampled backdrop colour. Only the *connected* backdrop is
// cleared, so light areas inside the racket (white grip, pale logos) survive.
// Edges are softened with a partial alpha ramp instead of a hard cutoff.

import { mkdir, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SRC_DIR = join(ROOT, "images");
const OUT_DIR = join(ROOT, "images", "cutout");

const FILES = [
  "pink 1.JPG", "pink 2.JPG", "pink 3.JPG", "pink 4.JPG",
  "blue 1.JPG", "blue 2.JPG", "blue 3.JPG", "blue 4.JPG", "blue 5.JPG", "blue 6.JPG"
];

// How far a pixel may drift from the backdrop colour and still count as
// background (0-441 distance in RGB), and the band over which alpha ramps.
const HARD_MATCH = 55;   // distance <= this -> fully transparent
const SOFT_MATCH = 120;  // distance >= this -> fully opaque
const MAX_SIZE = 1000;   // cap the long edge so the file stays web-sized

function distance(a, b) {
  const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function solveBackdrop(rgb, width, height, channels) {
  // Sample a frame of border pixels and take their median — robust against a
  // stray dark pixel on the edge skewing the result.
  const samples = [[], [], []];
  const step = Math.max(1, Math.floor(Math.min(width, height) / 120));
  const push = (x, y) => {
    const i = (y * width + x) * channels;
    samples[0].push(rgb[i]);
    samples[1].push(rgb[i + 1]);
    samples[2].push(rgb[i + 2]);
  };
  for (let x = 0; x < width; x += step) { push(x, 0); push(x, height - 1); }
  for (let y = 0; y < height; y += step) { push(0, y); push(width - 1, y); }

  return samples.map(list => {
    list.sort((a, b) => a - b);
    return list[Math.floor(list.length / 2)];
  });
}

async function cutout(file) {
  const source = join(SRC_DIR, file);
  const image = sharp(source).rotate(); // honour EXIF orientation
  const meta = await image.metadata();
  const { data, info } = await image
    .resize({ width: MAX_SIZE, height: MAX_SIZE, fit: "inside", withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  const backdrop = solveBackdrop(data, width, height, channels);

  // Flood fill from every border pixel, walking 4-connected neighbours.
  const visited = new Uint8Array(width * height);
  const queue = [];
  for (let x = 0; x < width; x++) { queue.push(x, (height - 1) * width + x); }
  for (let y = 0; y < height; y++) { queue.push(y * width, y * width + width - 1); }

  let head = 0;
  while (head < queue.length) {
    const index = queue[head++];
    if (visited[index]) continue;
    visited[index] = 1;

    const i = index * channels;
    const pixel = [data[i], data[i + 1], data[i + 2]];
    if (distance(pixel, backdrop) > SOFT_MATCH) continue; // solid object, stop here

    const dist = distance(pixel, backdrop);
    // Feather: hard-matched pixels vanish, the ramp band fades out.
    const alpha = dist <= HARD_MATCH
      ? 0
      : Math.round(255 * (dist - HARD_MATCH) / (SOFT_MATCH - HARD_MATCH));
    data[i + 3] = Math.min(data[i + 3], alpha);

    const x = index % width;
    const y = (index / width) | 0;
    if (x > 0) queue.push(index - 1);
    if (x < width - 1) queue.push(index + 1);
    if (y > 0) queue.push(index - width);
    if (y < height - 1) queue.push(index + width);
  }

  // Kill the pale fringe. Pixels just inside the shape are a blend of object
  // and backdrop, so they read as a white outline against a dark card. For any
  // semi-transparent edge pixel, un-blend it against the backdrop (the inverse
  // of the compositing maths) so its colour becomes the object's own.
  for (let i = 0; i < data.length; i += channels) {
    const a = data[i + 3];
    if (a === 0 || a === 255) continue;
    const av = a / 255;
    for (let c = 0; c < 3; c++) {
      const observed = data[i + c];
      const repair = (observed - backdrop[c] * (1 - av)) / av;
      data[i + c] = Math.max(0, Math.min(255, Math.round(repair)));
    }
  }

  // Trim the now-empty border so the racket fills the frame without extra air.
  const name = file.replace(/\.JPG$/i, ".png");
  const buffer = await sharp(data, { raw: { width, height, channels } })
    .png({ compressionLevel: 9 })
    .trim({ threshold: 1 })
    .toBuffer();

  await writeFile(join(OUT_DIR, name), buffer);
  const outMeta = await sharp(buffer).metadata();
  console.log(`  ${file} -> ${name}  (${width}x${height} -> ${outMeta.width}x${outMeta.height}, ${(buffer.length / 1024).toFixed(0)} KB)`);
}

await mkdir(OUT_DIR, { recursive: true });
console.log(`Removing backgrounds into ${OUT_DIR}\n`);
for (const file of FILES) {
  try {
    await cutout(file);
  } catch (error) {
    console.error(`  FAILED ${file}: ${error.message}`);
    process.exitCode = 1;
  }
}
console.log("\nDone.");

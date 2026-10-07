import crypto from 'node:crypto';

/** Accept the original file or the existing CDN's explicitly identified optimization. */
export function verifyPublishedPhoto(bytes, expected, contentType, polishedHeader) {
  if (!expected || bytes.length < 100) return false;
  const image = Buffer.from(bytes);
  const type = contentType?.split(';')[0];
  const signatureMatches = type === 'image/jpeg'
    ? image[0] === 255 && image[1] === 216 && image[2] === 255 && image.at(-2) === 255 && image.at(-1) === 217
    : type === 'image/png'
      ? image.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : type === 'image/webp' && image.subarray(0, 4).toString() === 'RIFF' && image.subarray(8, 12).toString() === 'WEBP';
  if (!signatureMatches) return false;
  if (crypto.createHash('sha256').update(image).digest('hex') === expected.sha256) return true;
  const originalSize = polishedHeader?.match(/(?:^|,)\s*orig_size=(\d+)/)?.[1];
  return /^(ok|webp)(,|$)/.test(polishedHeader ?? '') && Number(originalSize) === expected.bytes;
}

/** Image-only changes. No application screen imports the demo catalog. */
export function planProductImages(products, catalog, webOrigin) {
  const origin = new URL(webOrigin);
  if (origin.protocol !== 'https:' || origin.username || origin.password) throw new Error('HTTPS web origin required');
  const codes = new Set();
  return catalog.map(entry => {
    if (codes.has(entry.code) || !/^[a-f0-9]{16}\.(jpg|png|webp)$/.test(entry.file)) throw new Error('Invalid or duplicate image catalog entry');
    codes.add(entry.code);
    const matches = products.filter(product => product.code === entry.code);
    if (matches.length !== 1 || matches[0].name !== entry.name) throw new Error(`Catalog mismatch: ${entry.code}`);
    const product = matches[0];
    const imageUrl = new URL('/product-images/' + entry.file, origin).href;
    return { id: product.id, code: product.code, imageUrl, currentImageUrl: product.imageUrl ?? null, changed: product.imageUrl !== imageUrl, product };
  });
}

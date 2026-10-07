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

export const CANDY_CATEGORIES = [
  'Paletas',
  'Caramelos',
  'Gomitas',
  'Chocolates',
  'Dulces tradicionales',
  'Dulces enchilados',
  'Galletas',
  'Botanas',
  'Bebidas',
  'Malvaviscos',
  'Chicles',
  'Dulces para eventos',
  'Temporada',
  'Confitería',
  'Otros dulces',
];
/** Read existing persisted description metadata; never writes a category field. */
export function productClassification(description: string | null | undefined): string {
  const label = description?.match(/Clasificación comercial:\s*([^\.\n]+)/i)?.[1]?.trim();
  if (label === 'Dulces') return 'Dulces tradicionales';
  return label && CANDY_CATEGORIES.includes(label) ? label : '';
}

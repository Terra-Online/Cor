const ATLOS_CDN_BASE = 'https://cdn.opendfieldmap.org/_dev/endfield/atlos';

export function reportItemAsset(key: string): string {
  return `${ATLOS_CDN_BASE}/assets/images/item/${key}.webp`;
}

export function reportCategoryAsset(key: string): string {
  return `${ATLOS_CDN_BASE}/assets/images/category/${key}.svg`;
}

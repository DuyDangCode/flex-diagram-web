/**
 * Generates deterministic Stable IDs for diagram nodes.
 * e.g., "Auth Service" -> "auth-service"
 */
export function generateStableId(name: string): string {
  const trimmed = name.trim().toLowerCase();
  // Replace non-alphanumeric characters (excluding underscores and hyphens) with hyphens
  const slug = trimmed
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove diacritics
    .replace(/[^a-z0-9_]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (slug.length > 0) {
    return slug;
  }

  // Fallback if the name contained only special characters (e.g., "???")
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash |= 0;
  }
  return `node-${Math.abs(hash).toString(16)}`;
}

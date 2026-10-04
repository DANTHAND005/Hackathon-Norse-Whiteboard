// "ase 420" -> "ASE420"
export const normalizeTag = s => s.toUpperCase().replace(/\s+/g, '')

// Alphabetical, with numbers in numeric order (ASE230, ASE420, MAT185).
export const sortTags = list => [...(list || [])].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))

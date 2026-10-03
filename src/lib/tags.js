// "ase 420" -> "ASE420"
export const normalizeTag = s => s.toUpperCase().replace(/\s+/g, '')

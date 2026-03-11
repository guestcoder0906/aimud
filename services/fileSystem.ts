import { FileMap, FileMetadata } from '../types';

export class FileSystem {
  private files: FileMap = {};
  private metadata: FileMetadata = {};
  private readonly STORAGE_KEY_FILES = 'aimud_files';
  private readonly STORAGE_KEY_META = 'aimud_metadata';

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage() {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY_FILES);
      if (stored) {
        this.files = JSON.parse(stored);
      }
      const storedMeta = localStorage.getItem(this.STORAGE_KEY_META);
      if (storedMeta) {
        this.metadata = JSON.parse(storedMeta);
      }
    } catch (e) {
      console.error('Failed to load files:', e);
    }
  }

  private saveToStorage() {
    try {
      localStorage.setItem(this.STORAGE_KEY_FILES, JSON.stringify(this.files));
      localStorage.setItem(this.STORAGE_KEY_META, JSON.stringify(this.metadata));
    } catch (e) {
      console.error('Failed to save files:', e);
    }
  }

  write(filename: string, content: string, displayName: string | null = null) {
    this.files[filename] = content;
    if (displayName) {
      this.metadata[filename] = { displayName };
    } else if (!this.metadata[filename]) {
      this.metadata[filename] = { displayName: this.generateDisplayName(filename) };
    }
    this.saveToStorage();
  }

  private generateDisplayName(filename: string): string {
    let name = filename.replace(/\.txt$/, '');
    name = name.replace(/_/g, ' ');
    name = name.replace(/\s+\d+$/, '');
    return name;
  }

  getDisplayName(filename: string): string {
    let base = filename.replace(/\.txt|\.json/g, '');

    // Remove target() syntax
    base = base.replace(/target\(.*?\)(?:\[(.*?)\])?/g, (match, inner) => inner || '');

    // Remove hide[] syntax
    base = base.replace(/hide\[(.*?)\]/g, '$1');

    return base.trim() || filename;
  }

  read(filename: string): string | null {
    return this.files[filename] || null;
  }

  exists(filename: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.files, filename);
  }

  delete(filename: string) {
    delete this.files[filename];
    delete this.metadata[filename];
    this.saveToStorage();
  }

  list(): string[] {
    return Object.keys(this.files).sort();
  }

  getAll(): FileMap {
    return { ...this.files };
  }

  exportState(): { files: FileMap, metadata: FileMetadata } {
    return { files: { ...this.files }, metadata: { ...this.metadata } };
  }

  importState(state: { files: FileMap, metadata: FileMetadata }) {
    this.files = state.files;
    this.metadata = state.metadata;
    this.saveToStorage();
  }

  clear() {
    this.files = {};
    this.metadata = {};
    localStorage.removeItem(this.STORAGE_KEY_FILES);
    localStorage.removeItem(this.STORAGE_KEY_META);
  }

  findFileByReference(ref: string): string | null {
    if (this.exists(ref)) return ref;
    if (this.exists(ref + '.txt')) return ref + '.txt';

    const refLower = ref.toLowerCase();
    const refSlug = refLower.replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

    // 1. Case-insensitive exact match on filename
    for (const filename of Object.keys(this.files)) {
      if (filename.toLowerCase() === refLower || filename.toLowerCase() === refLower + '.txt') {
        return filename;
      }
    }

    // 2. Case-insensitive exact match on display name
    for (const [filename, meta] of Object.entries(this.metadata)) {
      if (meta.displayName && meta.displayName.toLowerCase() === refLower) {
        return filename;
      }
    }

    // 3. Slugified match on filename
    for (const filename of Object.keys(this.files)) {
      const fileSlug = filename.toLowerCase().replace(/\.txt$/, '').replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
      if (fileSlug === refSlug) {
        return filename;
      }
    }

    // 4. Partial match on display name
    for (const [filename, meta] of Object.entries(this.metadata)) {
      if (meta.displayName) {
        const displayLower = meta.displayName.toLowerCase();
        if (displayLower.includes(refLower) || (displayLower.length >= 3 && refLower.includes(displayLower))) {
          return filename;
        }
      }
    }

    // 5. Partial match on filename
    for (const filename of Object.keys(this.files)) {
      const fileLower = filename.toLowerCase();
      const nameWithoutExt = fileLower.replace(/\.txt$/, '');
      if (fileLower.includes(refLower) || (nameWithoutExt.length >= 3 && refLower.includes(nameWithoutExt))) {
        return filename;
      }
    }

    // 6. Full text search as fallback
    for (const [filename, content] of Object.entries(this.files)) {
      if (typeof content === 'string' && content.toLowerCase().includes(refLower)) {
        return filename;
      }
    }

    return null;
  }
}
export interface Point {
  x: number;
  y: number;
}

export interface BrushSettings {
  size: number;
  hardness: number; // 0 to 1
  opacity: number; // 0 to 1
  isCloneSourceSet: boolean;
  sourcePoint: Point | null;
}

export interface FileData {
  file: File;
  type: 'image' | 'pdf';
  mimeType: string;
  name: string;
  pageCount: number;
  currentPage: number; // 1-based index
  originalDimensions: { width: number; height: number };
}

export interface EditAction {
  type: 'stroke';
  pageIndex: number;
  imageData: ImageData; // Snapshot of the canvas for that page
}

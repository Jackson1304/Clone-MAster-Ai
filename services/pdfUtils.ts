import * as pdfjsLib from 'pdfjs-dist';
import { jsPDF } from 'jspdf';

// Handle ESM interop: sometimes pdfjsLib is the module, sometimes it has a default export
const pdfjs = (pdfjsLib as any).default || pdfjsLib;

// Initialize the worker.
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js`;

export const loadPdfDocument = async (file: File): Promise<any> => {
  const arrayBuffer = await file.arrayBuffer();
  // use the resolved pdfjs instance
  const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
  return loadingTask.promise;
};

export const renderPdfPage = async (
  pdf: any, 
  pageNumber: number, 
  scale: number = 2 // Higher scale for better editing quality
): Promise<HTMLCanvasElement> => {
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error("Could not get canvas context");

  const renderContext = {
    canvasContext: ctx,
    viewport: viewport,
  };

  await page.render(renderContext).promise;
  return canvas;
};

export const exportPdf = async (
  originalFile: File,
  editedPages: Map<number, string> // Map of pageIndex (0-based) to dataURL
): Promise<Blob> => {
  const pdfDoc = await loadPdfDocument(originalFile);
  const totalPages = pdfDoc.numPages;
  
  // Create a new PDF with 'pt' units to match PDF coordinate system
  // We don't assume A4. We will add pages with specific dimensions.
  const doc = new jsPDF({
    orientation: 'p',
    unit: 'pt',
    autoPaging: false
  });
  
  // Iterate through all pages
  for (let i = 1; i <= totalPages; i++) {
    const page = await pdfDoc.getPage(i);
    // Get the exact original viewport dimensions (scale 1.0)
    const viewport = page.getViewport({ scale: 1.0 });
    const width = viewport.width;
    const height = viewport.height;

    // Add a new page matching the original dimensions
    // We handle orientation manually by passing width/height
    doc.addPage([width, height], width > height ? 'l' : 'p');

    let imgData: string;
    const editedDataUrl = editedPages.get(i - 1); // Map uses 0-based index

    if (editedDataUrl) {
      // Page was edited.
      // Optimizing: Convert PNG (from canvas) to JPEG for size reduction
      const img = await new Promise<HTMLImageElement>((resolve) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.src = editedDataUrl!;
      });
      
      const tmpCanvas = document.createElement('canvas');
      tmpCanvas.width = img.width;
      tmpCanvas.height = img.height;
      const tmpCtx = tmpCanvas.getContext('2d');
      if (tmpCtx) {
        // Fill white background for transparency
        tmpCtx.fillStyle = '#FFFFFF'; 
        tmpCtx.fillRect(0, 0, tmpCanvas.width, tmpCanvas.height);
        tmpCtx.drawImage(img, 0, 0);
        // Export as JPEG with 0.75 quality for good balance of size/quality
        imgData = tmpCanvas.toDataURL('image/jpeg', 0.75);
      } else {
        imgData = editedDataUrl;
      }
    } else {
      // Page was NOT edited. 
      // Render original page to image.
      // Use scale=2 for high quality rasterization, but display at scale=1 size.
      const canvas = await renderPdfPage(pdfDoc, i, 2.0);
      imgData = canvas.toDataURL('image/jpeg', 0.75);
    }

    // addImage(data, format, x, y, width, height)
    // We stretch the image (which might be scale 2x pixels) to fit the page (scale 1x pts)
    doc.addImage(imgData, 'JPEG', 0, 0, width, height);
  }

  // Delete the initial default page (index 1) which was created by new jsPDF()
  // Since we added pages *after* it (indices 2, 3, ...), deleting 1 makes 2 become 1.
  doc.deletePage(1);

  return doc.output('blob');
};
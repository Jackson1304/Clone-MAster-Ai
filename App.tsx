import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Upload, 
  Download, 
  Undo, 
  RotateCcw, 
  ChevronLeft, 
  ChevronRight, 
  FileText, 
  Image as ImageIcon,
  AlertCircle,
  Brush
} from 'lucide-react';
import { Toolbar } from './components/Toolbar';
import { Button } from './components/Button';
import { BrushSettings, FileData, Point } from './types';
import { loadPdfDocument, renderPdfPage, exportPdf } from './services/pdfUtils';
import { jsPDF } from 'jspdf';

const MAX_HISTORY = 20;

const App: React.FC = () => {
  // --- State ---
  const [fileData, setFileData] = useState<FileData | null>(null);
  const [pdfDoc, setPdfDoc] = useState<any>(null); // pdfjs type
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Brush State
  const [brushSettings, setBrushSettings] = useState<BrushSettings>({
    size: 50,
    hardness: 0.5,
    opacity: 1.0,
    isCloneSourceSet: false,
    sourcePoint: null
  });

  // Canvas Refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null); // For cursor
  const sourceCanvasRef = useRef<HTMLCanvasElement | null>(null); // Immutable copy of current state for sampling
  const historyRef = useRef<ImageData[]>([]);

  // Interaction State
  const isDrawing = useRef(false);
  const isAltDown = useRef(false);
  const lastPoint = useRef<Point | null>(null);
  const currentHistoryIndex = useRef(-1);

  // Storage for edited pages (Page Index -> DataURL)
  // This allows us to navigate away and come back to edited state
  const editedPagesRef = useRef<Map<number, string>>(new Map());

  // --- File Handling ---

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError(null);
    setFileData(null);
    historyRef.current = [];
    currentHistoryIndex.current = -1;
    editedPagesRef.current.clear();
    setBrushSettings(prev => ({ ...prev, isCloneSourceSet: false, sourcePoint: null }));

    try {
      const fileName = file.name.toLowerCase();
      
      // Check for PDF by MIME type or extension
      if (file.type === 'application/pdf' || fileName.endsWith('.pdf')) {
        const doc = await loadPdfDocument(file);
        setPdfDoc(doc);
        setFileData({
          file,
          type: 'pdf',
          mimeType: 'application/pdf',
          name: file.name,
          pageCount: doc.numPages,
          currentPage: 1,
          originalDimensions: { width: 0, height: 0 } // Will set on render
        });
      } else if (file.type.startsWith('image/') || fileName.endsWith('.jpg') || fileName.endsWith('.jpeg') || fileName.endsWith('.png')) {
        const img = new Image();
        const objectUrl = URL.createObjectURL(file);
        
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
          img.src = objectUrl;
        });

        // Determine correct mime type if browser didn't give it (e.g. from extension)
        let mime = file.type;
        if (!mime || mime === '') {
           if (fileName.endsWith('.jpg') || fileName.endsWith('.jpeg')) mime = 'image/jpeg';
           else if (fileName.endsWith('.png')) mime = 'image/png';
        }

        setFileData({
          file,
          type: 'image',
          mimeType: mime,
          name: file.name,
          pageCount: 1,
          currentPage: 1,
          originalDimensions: { width: img.width, height: img.height }
        });
        
        // Initial Draw
        initCanvasWithImage(img);
      } else if (fileName.endsWith('.pptx') || fileName.endsWith('.ppt')) {
         // PPTX Placeholder logic as per plan
         setError("PowerPoint editing requires server-side processing which is disabled in this demo. Please convert your slides to PDF or Images first.");
         setLoading(false);
         return;
      } else {
        throw new Error("Unsupported file format. Please upload a JPG, PNG, or PDF.");
      }
    } catch (err: any) {
      console.error(err);
      setError("Failed to load file. " + (err.message || "Unknown error"));
    } finally {
      setLoading(false);
    }
  };

  const initCanvasWithImage = (imgOrCanvas: HTMLImageElement | HTMLCanvasElement) => {
    const canvas = canvasRef.current;
    const overlay = overlayRef.current;
    if (!canvas || !overlay) return;

    // Set dimensions
    canvas.width = imgOrCanvas.width;
    canvas.height = imgOrCanvas.height;
    overlay.width = imgOrCanvas.width;
    overlay.height = imgOrCanvas.height;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(imgOrCanvas, 0, 0);
      saveToHistory(); // Initial state
      updateSourceCanvas(); // Prepare for cloning
    }
  };

  // --- PDF Navigation ---

  const renderCurrentPage = useCallback(async () => {
    if (!fileData || !canvasRef.current) return;

    // Save current page state before switching?
    // We do this in the page change handler usually, but here we just render
    
    setLoading(true);
    try {
      // Check if we have an edited version in memory
      const pageIndex = fileData.currentPage - 1;
      const storedState = editedPagesRef.current.get(pageIndex);

      if (storedState) {
        const img = new Image();
        img.src = storedState;
        await new Promise(r => { img.onload = r; });
        initCanvasWithImage(img);
      } else {
        // Render fresh from PDF
        if (fileData.type === 'pdf' && pdfDoc) {
          const renderedCanvas = await renderPdfPage(pdfDoc, fileData.currentPage);
          initCanvasWithImage(renderedCanvas);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [fileData?.currentPage, fileData?.type, pdfDoc]);

  // Effect to trigger render when page changes
  useEffect(() => {
    if (fileData) {
      // Clear history when changing pages to avoid confusion, 
      // or implement complex multi-page history (too complex for this demo)
      historyRef.current = [];
      currentHistoryIndex.current = -1;
      setBrushSettings(prev => ({...prev, isCloneSourceSet: false, sourcePoint: null}));
      renderCurrentPage();
    }
  }, [fileData?.currentPage, fileData?.file]); // Render when page or file changes


  const changePage = (delta: number) => {
    if (!fileData) return;
    
    // Save current state before leaving
    if (canvasRef.current) {
      const pageIndex = fileData.currentPage - 1;
      editedPagesRef.current.set(pageIndex, canvasRef.current.toDataURL());
    }

    const newPage = Math.max(1, Math.min(fileData.pageCount, fileData.currentPage + delta));
    setFileData(prev => prev ? ({ ...prev, currentPage: newPage }) : null);
  };

  // --- Canvas Logic (The Core) ---

  const updateSourceCanvas = () => {
    if (!canvasRef.current) return;
    // Create a backup of the current state to sample from
    const backup = document.createElement('canvas');
    backup.width = canvasRef.current.width;
    backup.height = canvasRef.current.height;
    const ctx = backup.getContext('2d');
    ctx?.drawImage(canvasRef.current, 0, 0);
    sourceCanvasRef.current = backup;
  };

  const saveToHistory = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    
    // If we are in the middle of history (undid something), truncate future
    if (currentHistoryIndex.current < historyRef.current.length - 1) {
      historyRef.current = historyRef.current.slice(0, currentHistoryIndex.current + 1);
    }

    historyRef.current.push(imageData);
    if (historyRef.current.length > MAX_HISTORY) {
      historyRef.current.shift();
    } else {
      currentHistoryIndex.current++;
    }
  };

  const handleUndo = () => {
    if (currentHistoryIndex.current > 0) {
      currentHistoryIndex.current--;
      const imageData = historyRef.current[currentHistoryIndex.current];
      const ctx = canvasRef.current?.getContext('2d');
      if (ctx && imageData) {
        ctx.putImageData(imageData, 0, 0);
        updateSourceCanvas(); // Important: source must match displayed canvas for consistency or revert to old? 
        // Actually for Clone Stamp, usually you want to sample from the *visible* pixels.
      }
    }
  };

  const getCanvasCoordinates = (e: React.MouseEvent | React.TouchEvent): Point | null => {
    const canvas = overlayRef.current; // Use overlay as it's same size and on top
    if (!canvas) return null;
    
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;

    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  };

  // --- Painting Logic ---

  const paint = (currentPos: Point) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const sourceCanvas = sourceCanvasRef.current;
    
    if (!canvas || !ctx || !sourceCanvas || !brushSettings.sourcePoint) return;
  };

  // Need a ref for the clone offset for the current stroke
  const cloneOffset = useRef<{x: number, y: number} | null>(null);

  const handleMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
    if (!fileData) return;
    const pos = getCanvasCoordinates(e);
    if (!pos) return;

    if (isAltDown.current) {
      // Set Source
      setBrushSettings(prev => ({
        ...prev,
        isCloneSourceSet: true,
        sourcePoint: pos
      }));
      // Force cursor redraw to show source target immediately
      drawCursor(pos);
      return;
    }

    if (!brushSettings.isCloneSourceSet || !brushSettings.sourcePoint) {
      alert("Please hold Alt + Click to select a source area first.");
      return;
    }

    isDrawing.current = true;
    lastPoint.current = pos;

    // Calculate offset for this stroke
    // sourcePoint is where we sample FROM.
    // pos is where we paint TO.
    cloneOffset.current = {
      x: brushSettings.sourcePoint.x - pos.x,
      y: brushSettings.sourcePoint.y - pos.y
    };
    
    // Perform initial dot
    doPaint(pos);
  };

  const doPaint = (pos: Point) => {
    const ctx = canvasRef.current?.getContext('2d');
    const sourceCtx = sourceCanvasRef.current?.getContext('2d');
    if (!ctx || !sourceCtx || !cloneOffset.current) return;

    const { size, hardness, opacity } = brushSettings;
    const radius = size / 2;

    // We want to draw from source to dest.
    const sx = pos.x + cloneOffset.current.x;
    const sy = pos.y + cloneOffset.current.y;

    // Optimization: Create a small temporary canvas for the brush tip
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = size;
    tempCanvas.height = size;
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return;

    // 1. Draw the image chunk from source to temp canvas
    tempCtx.drawImage(
      sourceCanvasRef.current!, 
      sx - radius, sy - radius, size, size, // Source rect
      0, 0, size, size // Dest rect on temp canvas
    );

    // 2. Apply Hardness (Radial Mask)
    tempCtx.globalCompositeOperation = 'destination-in';
    const gradient = tempCtx.createRadialGradient(radius, radius, radius * hardness, radius, radius, radius);
    gradient.addColorStop(0, 'rgba(0,0,0,1)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    tempCtx.fillStyle = gradient;
    tempCtx.fillRect(0, 0, size, size);

    // 3. Draw temp brush to main canvas
    ctx.globalAlpha = opacity;
    ctx.drawImage(tempCanvas, pos.x - radius, pos.y - radius);
    ctx.globalAlpha = 1.0; // Reset
  };

  // Interpolate for smooth strokes
  const handleMouseMove = (e: React.MouseEvent | React.TouchEvent) => {
    const pos = getCanvasCoordinates(e);
    if (!pos) return;
    
    // Update cursor overlay
    drawCursor(pos);

    if (!isDrawing.current || !lastPoint.current || !cloneOffset.current) return;

    // Interpolation distance (step size = roughly 1/4 brush size for smoothness)
    const dist = Math.hypot(pos.x - lastPoint.current.x, pos.y - lastPoint.current.y);
    const step = Math.max(1, brushSettings.size * 0.15); // Performance tweak

    const angle = Math.atan2(pos.y - lastPoint.current.y, pos.x - lastPoint.current.x);

    for (let i = 0; i < dist; i += step) {
      const x = lastPoint.current.x + (Math.cos(angle) * i);
      const y = lastPoint.current.y + (Math.sin(angle) * i);
      doPaint({x, y});
    }
    
    lastPoint.current = pos;
  };

  const handleMouseUp = () => {
    if (isDrawing.current) {
      isDrawing.current = false;
      saveToHistory();
      // Important: Update the source canvas to include the new changes?
      updateSourceCanvas();
    }
  };

  // --- Cursor Rendering ---
  const drawCursor = (pos: Point) => {
    const canvas = overlayRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Critical: Calculate Scale to ensure line width is visible on high-res images
    const rect = canvas.getBoundingClientRect();
    // How many canvas pixels equal one screen pixel?
    const scale = canvas.width / rect.width;
    
    // Set a consistent line width in SCREEN pixels (e.g., 2px)
    // If 1 screen pixel = 4 canvas pixels, we need line width 8.
    const lineWidth = Math.max(1, 2 * scale);

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw Source Target if set and not drawing
    if (brushSettings.isCloneSourceSet && brushSettings.sourcePoint && !isDrawing.current && cloneOffset.current) {
       // Optional: Could draw a marker where the source is currently sampling from
    }

    // Draw Brush Outline
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, brushSettings.size / 2, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth = lineWidth; 
    ctx.stroke();
    
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, brushSettings.size / 2, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)'; // Double outline for visibility on any bg
    ctx.lineWidth = lineWidth; 
    // Trick: offset line dash
    ctx.setLineDash([lineWidth * 4, lineWidth * 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw Source Crosshair if Alt is held
    if (isAltDown.current) {
      const crossSize = 10 * scale;
      ctx.beginPath();
      ctx.moveTo(pos.x - crossSize, pos.y);
      ctx.lineTo(pos.x + crossSize, pos.y);
      ctx.moveTo(pos.x, pos.y - crossSize);
      ctx.lineTo(pos.x, pos.y + crossSize);
      ctx.strokeStyle = '#00ff00';
      ctx.lineWidth = lineWidth;
      ctx.stroke();
    }
  };

  // --- Global Keyboard Listeners ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Alt') {
        isAltDown.current = true;
        // Don't change native cursor, our overlay handles it
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        handleUndo();
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Alt') {
        isAltDown.current = false;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // --- Export ---
  const handleExport = async () => {
    if (!fileData) return;
    setLoading(true);
    
    try {
      // Save current page state first
      if (canvasRef.current) {
        const pageIndex = fileData.currentPage - 1;
        // Store the DataURL. NOTE: For in-app navigation we keep PNG (lossless) to avoid generation loss.
        editedPagesRef.current.set(pageIndex, canvasRef.current.toDataURL());
      }

      if (fileData.type === 'image') {
        const link = document.createElement('a');
        link.download = `edited_${fileData.name}`;
        
        // Export single image with optimal settings based on original file type
        if (fileData.mimeType === 'image/jpeg' || fileData.mimeType === 'image/jpg') {
          // Export as JPEG with 0.92 quality (High)
          link.href = canvasRef.current!.toDataURL('image/jpeg', 0.92);
        } else {
          // Export as PNG (Lossless)
          link.href = canvasRef.current!.toDataURL('image/png');
        }
        
        link.click();
      } else if (fileData.type === 'pdf') {
        const blob = await exportPdf(fileData.file, editedPagesRef.current);
        const link = document.createElement('a');
        link.download = `edited_${fileData.name}`;
        link.href = URL.createObjectURL(blob);
        link.click();
      }
    } catch (e) {
      console.error(e);
      alert("Export failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen w-full bg-[#1e1e1e] text-white select-none">
      
      {/* --- Top Header --- */}
      <header className="h-14 bg-[#252525] border-b border-[#333] flex items-center justify-between px-4 z-10">
        <div className="flex items-center gap-2">
          <div className="bg-blue-600 p-1.5 rounded-md">
            <Brush size={20} className="text-white" />
          </div>
          <h1 className="font-bold text-lg tracking-tight">CloneMaster <span className="text-blue-500 font-light">Web</span></h1>
        </div>

        {fileData && (
          <div className="flex items-center gap-4 bg-[#1a1a1a] px-4 py-1.5 rounded-full border border-[#333]">
             {fileData.type === 'pdf' ? <FileText size={14} className="text-red-400"/> : <ImageIcon size={14} className="text-blue-400"/>}
             <span className="text-sm text-gray-300 max-w-[200px] truncate">{fileData.name}</span>
          </div>
        )}

        <div className="flex items-center gap-2">
          <input 
            type="file" 
            id="fileUpload" 
            className="hidden" 
            accept=".jpg,.jpeg,.png,.pdf,.pptx" 
            onChange={handleFileUpload}
          />
          <Button variant="secondary" onClick={() => document.getElementById('fileUpload')?.click()} icon={<Upload size={16}/>}>
            Open File
          </Button>
          <Button variant="secondary" onClick={handleUndo} disabled={!fileData} icon={<Undo size={16}/>}>
            Undo
          </Button>
          <Button variant="primary" onClick={handleExport} disabled={!fileData} icon={<Download size={16}/>}>
            Export
          </Button>
        </div>
      </header>

      {/* --- Main Workspace --- */}
      <div className="flex flex-1 overflow-hidden">
        
        {/* Toolbar */}
        <Toolbar settings={brushSettings} onUpdateSettings={(s) => setBrushSettings(prev => ({...prev, ...s}))} />

        {/* Canvas Area */}
        <div className="flex-1 relative flex flex-col">
          
          {/* Top Bar for Zoom/Nav? For now just Nav */}
          {fileData && fileData.pageCount > 1 && (
            <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-20 flex items-center gap-3 bg-[#252525] px-3 py-2 rounded-lg shadow-xl border border-[#444]">
              <button 
                onClick={() => changePage(-1)}
                disabled={fileData.currentPage <= 1}
                className="p-1 hover:bg-[#333] rounded disabled:opacity-30 transition"
              >
                <ChevronLeft size={20}/>
              </button>
              <span className="text-sm font-mono">{fileData.currentPage} / {fileData.pageCount}</span>
              <button 
                onClick={() => changePage(1)}
                disabled={fileData.currentPage >= fileData.pageCount}
                className="p-1 hover:bg-[#333] rounded disabled:opacity-30 transition"
              >
                <ChevronRight size={20}/>
              </button>
            </div>
          )}

          {/* Canvas Wrapper */}
          <div className="flex-1 overflow-auto canvas-container relative flex items-center justify-center p-8">
            {loading && (
               <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 z-50 backdrop-blur-sm">
                 <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                 <p className="text-sm font-medium text-blue-400">Processing...</p>
               </div>
            )}
            
            {error && (
              <div className="absolute inset-0 flex items-center justify-center z-40">
                <div className="bg-[#2a2a2a] p-6 rounded-lg shadow-2xl border border-red-900/50 max-w-md text-center">
                  <AlertCircle size={48} className="mx-auto text-red-500 mb-4"/>
                  <h3 className="text-xl font-bold text-white mb-2">Error</h3>
                  <p className="text-gray-400 mb-4">{error}</p>
                  <Button onClick={() => document.getElementById('fileUpload')?.click()}>Try Another File</Button>
                </div>
              </div>
            )}

            {!fileData && !loading && !error && (
               <div className="text-center text-gray-500">
                 <div className="mb-4 bg-[#252525] inline-block p-6 rounded-full shadow-inner">
                   <Upload size={48} className="text-gray-600" />
                 </div>
                 <h2 className="text-xl font-semibold text-gray-300 mb-2">No File Loaded</h2>
                 <p className="max-w-xs mx-auto mb-6">Upload an Image or PDF to start removing watermarks.</p>
                 <Button onClick={() => document.getElementById('fileUpload')?.click()}>Browse Files</Button>
               </div>
            )}

            {/* 
              We use w-fit h-fit to ensure the div wraps the canvas exactly, 
              so that the absolute overlay (width: 100%) matches the visible canvas size perfectly.
            */}
            <div className={`relative shadow-2xl w-fit h-fit ${!fileData ? 'hidden' : 'block'}`}>
              <canvas 
                ref={canvasRef}
                className="block bg-white cursor-none pointer-events-none" 
                style={{ maxWidth: '100%', maxHeight: '80vh' }}
              />
              <canvas 
                ref={overlayRef}
                className="absolute top-0 left-0 pointer-events-auto cursor-none touch-none"
                style={{ width: '100%', height: '100%' }} // CSS scaling to match visible size
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onTouchStart={handleMouseDown}
                onTouchMove={handleMouseMove}
                onTouchEnd={handleMouseUp}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
import React from 'react';
import { Brush, Crosshair, HelpCircle } from 'lucide-react';
import { BrushSettings } from '../types';

interface ToolbarProps {
  settings: BrushSettings;
  onUpdateSettings: (settings: Partial<BrushSettings>) => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({ settings, onUpdateSettings }) => {
  return (
    <div className="w-72 bg-[#252525] border-r border-[#333] flex flex-col h-full text-sm">
      <div className="p-4 border-b border-[#333]">
        <h2 className="text-gray-100 font-semibold mb-1 flex items-center gap-2">
          <Brush size={16} /> Clone Stamp Tool
        </h2>
        <p className="text-gray-500 text-xs">Remove watermarks efficiently.</p>
      </div>

      <div className="p-4 space-y-6 overflow-y-auto flex-1">
        
        {/* Status Indicator */}
        <div className={`p-3 rounded-md border ${settings.isCloneSourceSet ? 'bg-green-900/20 border-green-800' : 'bg-yellow-900/20 border-yellow-800'}`}>
          <div className="flex items-start gap-2">
            <Crosshair className={`w-4 h-4 mt-0.5 ${settings.isCloneSourceSet ? 'text-green-500' : 'text-yellow-500'}`} />
            <div>
              <p className={`font-medium ${settings.isCloneSourceSet ? 'text-green-500' : 'text-yellow-500'}`}>
                {settings.isCloneSourceSet ? 'Source Active' : 'No Source Set'}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                {settings.isCloneSourceSet 
                  ? 'Drag to paint.' 
                  : 'Hold Alt + Click on a clean area to pick a source.'}
              </p>
            </div>
          </div>
        </div>

        {/* Brush Size */}
        <div className="space-y-2">
          <div className="flex justify-between">
            <label className="text-gray-300">Size</label>
            <span className="text-gray-400">{settings.size}px</span>
          </div>
          <input
            type="range"
            min="5"
            max="300"
            value={settings.size}
            onChange={(e) => onUpdateSettings({ size: parseInt(e.target.value) })}
            className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-blue-500"
          />
        </div>

        {/* Hardness */}
        <div className="space-y-2">
          <div className="flex justify-between">
            <label className="text-gray-300">Hardness</label>
            <span className="text-gray-400">{Math.round(settings.hardness * 100)}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={settings.hardness}
            onChange={(e) => onUpdateSettings({ hardness: parseFloat(e.target.value) })}
            className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-blue-500"
          />
        </div>

        {/* Opacity */}
        <div className="space-y-2">
          <div className="flex justify-between">
            <label className="text-gray-300">Opacity</label>
            <span className="text-gray-400">{Math.round(settings.opacity * 100)}%</span>
          </div>
          <input
            type="range"
            min="0.1"
            max="1"
            step="0.05"
            value={settings.opacity}
            onChange={(e) => onUpdateSettings({ opacity: parseFloat(e.target.value) })}
            className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-blue-500"
          />
        </div>

        <div className="pt-6 border-t border-[#333]">
           <h3 className="text-gray-400 font-medium mb-3 flex items-center gap-2">
             <HelpCircle size={14}/> Instructions
           </h3>
           <ul className="text-xs text-gray-500 space-y-2 list-disc list-inside">
             <li>Use <b>Alt + Click</b> to select a clean area (source) next to the watermark.</li>
             <li>Release Alt.</li>
             <li>Click and drag over the watermark to cover it with the source pixels.</li>
             <li>Adjust <b>Hardness</b> to blend edges smoothly.</li>
           </ul>
        </div>

      </div>
    </div>
  );
};

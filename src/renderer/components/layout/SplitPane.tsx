/**
 * SplitPane Component
 * Resizable split pane layout
 */

import React, { useState, useCallback, useEffect } from 'react';

interface SplitPaneProps {
  left: React.ReactNode;
  right: React.ReactNode;
  defaultSplit?: number;
  minLeft?: number;
  minRight?: number;
}

export const SplitPane: React.FC<SplitPaneProps> = ({
  left,
  right,
  defaultSplit = 50,
  minLeft = 300,
  minRight = 350,
}) => {
  const [split, setSplit] = useState(() => {
    const saved = localStorage.getItem('splitPane');
    return saved ? parseFloat(saved) : defaultSplit;
  });
  const [isDragging, setIsDragging] = useState(false);
  
  const handleMouseDown = useCallback(() => {
    setIsDragging(true);
  }, []);
  
  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    localStorage.setItem('splitPane', split.toString());
  }, [split]);
  
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;
    
    const container = document.getElementById('split-container');
    if (!container) return;
    
    const rect = container.getBoundingClientRect();
    const newSplit = ((e.clientX - rect.left) / rect.width) * 100;
    
    const minLeftPercent = (minLeft / rect.width) * 100;
    const minRightPercent = (minRight / rect.width) * 100;
    
    if (newSplit >= minLeftPercent && newSplit <= 100 - minRightPercent) {
      setSplit(newSplit);
    }
  }, [isDragging, minLeft, minRight]);
  
  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
    return undefined;
  }, [isDragging, handleMouseMove, handleMouseUp]);
  
  return (
    <div 
      id="split-container"
      className="flex h-full"
      style={{ cursor: isDragging ? 'col-resize' : 'default' }}
    >
      {/* Left Panel */}
      <div style={{ width: `${split}%` }} className="h-full overflow-hidden">
        {left}
      </div>
      
      {/* Divider */}
      <div
        className="w-1 bg-vscode-border hover:bg-vscode-accent cursor-col-resize transition-colors"
        onMouseDown={handleMouseDown}
      />
      
      {/* Right Panel */}
      <div style={{ width: `${100 - split}%` }} className="h-full overflow-hidden">
        {right}
      </div>
    </div>
  );
};

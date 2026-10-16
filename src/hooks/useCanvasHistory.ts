import { useState, useRef, useEffect, useCallback } from 'react';
import { WorkspaceTab } from '../types';

export interface CanvasSnapshot {
  frameElements?: any[];
  poseData?: any;
  safeZone?: any;
  outpaintConfig?: any;
  timestamp: number;
}

const MAX_HISTORY_STEPS = 50;

export const useCanvasHistory = (
  activeTab: WorkspaceTab | null,
  updateActiveTab: (updates: Partial<WorkspaceTab> | ((prev: WorkspaceTab) => Partial<WorkspaceTab>)) => void
) => {
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const undoStackRef = useRef<CanvasSnapshot[]>([]);
  const redoStackRef = useRef<CanvasSnapshot[]>([]);
  const isPerformingHistoryAction = useRef(false);

  const syncStackState = () => {
    setCanUndo(undoStackRef.current.length > 0);
    setCanRedo(redoStackRef.current.length > 0);
  };

  /**
   * Pushes a new snapshot onto the undo stack before applying mutations
   */
  const pushCanvasSnapshot = useCallback((tabOverride?: WorkspaceTab) => {
    if (isPerformingHistoryAction.current) return;
    const tab = tabOverride || activeTab;
    if (!tab) return;

    const snapshot: CanvasSnapshot = {
      frameElements: tab.frameElements ? JSON.parse(JSON.stringify(tab.frameElements)) : [],
      poseData: tab.poseData ? JSON.parse(JSON.stringify(tab.poseData)) : null,
      safeZone: tab.safeZone ? { ...tab.safeZone } : null,
      outpaintConfig: (tab as any).outpaintConfig ? JSON.parse(JSON.stringify((tab as any).outpaintConfig)) : null,
      timestamp: Date.now()
    };

    undoStackRef.current.push(snapshot);
    if (undoStackRef.current.length > MAX_HISTORY_STEPS) {
      undoStackRef.current.shift();
    }
    // Any new action clears future redo
    redoStackRef.current = [];
    syncStackState();
  }, [activeTab]);

  /**
   * Step backwards (Undo)
   */
  const handleCanvasUndo = useCallback(() => {
    if (undoStackRef.current.length === 0 || !activeTab) return;

    isPerformingHistoryAction.current = true;

    // Current state becomes the top of redo stack
    const currentState: CanvasSnapshot = {
      frameElements: activeTab.frameElements ? JSON.parse(JSON.stringify(activeTab.frameElements)) : [],
      poseData: activeTab.poseData ? JSON.parse(JSON.stringify(activeTab.poseData)) : null,
      safeZone: activeTab.safeZone ? { ...activeTab.safeZone } : null,
      outpaintConfig: (activeTab as any).outpaintConfig ? JSON.parse(JSON.stringify((activeTab as any).outpaintConfig)) : null,
      timestamp: Date.now()
    };
    redoStackRef.current.push(currentState);

    // Pop previous state
    const previousState = undoStackRef.current.pop()!;

    updateActiveTab((prev) => ({
      ...prev,
      frameElements: previousState.frameElements ?? prev.frameElements,
      poseData: previousState.poseData ?? prev.poseData,
      safeZone: previousState.safeZone ?? prev.safeZone,
      ...(previousState.outpaintConfig ? { outpaintConfig: previousState.outpaintConfig } : {})
    }));

    setTimeout(() => {
      isPerformingHistoryAction.current = false;
      syncStackState();
    }, 50);
  }, [activeTab, updateActiveTab]);

  /**
   * Step forwards (Redo)
   */
  const handleCanvasRedo = useCallback(() => {
    if (redoStackRef.current.length === 0 || !activeTab) return;

    isPerformingHistoryAction.current = true;

    const currentState: CanvasSnapshot = {
      frameElements: activeTab.frameElements ? JSON.parse(JSON.stringify(activeTab.frameElements)) : [],
      poseData: activeTab.poseData ? JSON.parse(JSON.stringify(activeTab.poseData)) : null,
      safeZone: activeTab.safeZone ? { ...activeTab.safeZone } : null,
      outpaintConfig: (activeTab as any).outpaintConfig ? JSON.parse(JSON.stringify((activeTab as any).outpaintConfig)) : null,
      timestamp: Date.now()
    };
    undoStackRef.current.push(currentState);

    const nextState = redoStackRef.current.pop()!;

    updateActiveTab((prev) => ({
      ...prev,
      frameElements: nextState.frameElements ?? prev.frameElements,
      poseData: nextState.poseData ?? prev.poseData,
      safeZone: nextState.safeZone ?? prev.safeZone,
      ...(nextState.outpaintConfig ? { outpaintConfig: nextState.outpaintConfig } : {})
    }));

    setTimeout(() => {
      isPerformingHistoryAction.current = false;
      syncStackState();
    }, 50);
  }, [activeTab, updateActiveTab]);

  // Global Keyboard Listener for Ctrl+Z / Ctrl+Y
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is currently typing in an input or textarea
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }

      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const isCmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

      if (isCmdOrCtrl && e.key.toLowerCase() === 'z') {
        if (e.shiftKey) {
          // Ctrl+Shift+Z => Redo
          e.preventDefault();
          handleCanvasRedo();
        } else {
          // Ctrl+Z => Undo
          e.preventDefault();
          handleCanvasUndo();
        }
      } else if (isCmdOrCtrl && e.key.toLowerCase() === 'y') {
        // Ctrl+Y => Redo
        e.preventDefault();
        handleCanvasRedo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleCanvasUndo, handleCanvasRedo]);

  return {
    pushCanvasSnapshot,
    handleCanvasUndo,
    handleCanvasRedo,
    canUndo,
    canRedo
  };
};

import React, { useState, useEffect, useRef } from 'react';
import {
  Shuffle,
  Trash2,
  Plus,
  Download,
  Image as ImageIcon,
  Palette,
  Scissors,
  MessageSquare,
  HelpCircle,
  Settings2,
  Maximize2,
  Columns,
  RefreshCw,
  Info,
  Layers,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Sparkles,
  Unlock,
  Lock,
  Upload,
  ExternalLink
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// Models, helpers, and types
import {
  CanvasRatio,
  Panel,
  BoardStyleConfig,
  Onomatopoeia,
  SpeechBubble,
  PanelEffectType,
  BubbleType,
  CustomSticker,
  PanelImage
} from './types';
import {
  insetPolygon,
  getCentroid,
  getBoundingBox,
  getSvgPointsString,
  getPolygonArea
} from './utils/geometry';
import {
  generateRandomLayout,
  getCanvasDimensions,
  getPresetTemplates,
  DUMMY_COLORS
} from './utils/presets';

interface Point {
  x: number;
  y: number;
}

export default function App() {
  // Page configurations
  const [ratio, setRatio] = useState<CanvasRatio>('portrait');
  const [zoom, setZoom] = useState<number>(1); // Screen scale zoom for viewing comfort

  // Layout Styles (with showPrompts removed/hidden by default to avoid storyboard overlays)
  const [config, setConfig] = useState<BoardStyleConfig>({
    panelCount: 5,
    slantIntensity: 0.5,
    gutterWidth: 10,
    borderWidth: 6,
    borderColor: '#0f172a', // Slate 900
    backgroundColor: '#ffffff', // Outer board background
    panelBgColor: '#fafafa', // Inner board background
    showPrompts: false,
    selectedTemplate: '动感斜切分格 (Dynamic Slant 5P)'
  });

  // State: Generated Panels
  const [panels, setPanels] = useState<Panel[]>([]);
  const [selectedPanelId, setSelectedPanelId] = useState<string | null>(null);

  // Sound fx and Bubble creation helpers
  const [newOnomText, setNewOnomText] = useState('轰！');
  const [newOnomStyle, setNewOnomStyle] = useState<'impact' | 'grunge' | 'brush' | 'chubby'>('impact');
  const [newOnomColor, setNewOnomColor] = useState('#ef4444');

  const [newBubbleText, setNewBubbleText] = useState('发生了什么事情？！');
  const [newBubbleType, setNewBubbleType] = useState<BubbleType>('normal');

  // Status for PNG compiling process
  const [exporting, setExporting] = useState(false);

  // SVG dimensions
  const dims = getCanvasDimensions(ratio);

  // Ref to the SVG element for responsive tracking
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Track active dragging items
  const [activeDrag, setActiveDrag] = useState<{
    type: 'bubble' | 'onom' | 'panel_image' | 'custom_sticker';
    panelId: string;
    index: number;
    dragStartSvgX: number;
    dragStartSvgY: number;
    initialX: number;
    initialY: number;
    svgRect: { left: number; top: number; width: number; height: number };
  } | null>(null);

  // Divider dragging state
  const [activeDividerDrag, setActiveDividerDrag] = useState<{
    dividerId: string;
    type: 'horizontal' | 'vertical';
    dragStartPageX: number;
    dragStartPageY: number;
    matchedVertices: { panelId: string; vertexIdx: number; pointRef: 'p1' | 'p2' }[];
    initialVerticesMap: { [panelId: string]: Point[] };
  } | null>(null);

  // Temporary Gallery state
  const [gallery, setGallery] = useState<{ id: string; src: string }[]>([
    { id: 'pres-1', src: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=450&auto=format&fit=crop&q=70' },
    { id: 'pres-2', src: 'https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5?w=450&auto=format&fit=crop&q=70' },
    { id: 'pres-3', src: 'https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=450&auto=format&fit=crop&q=70' }
  ]);
  const [dragOverPanelId, setDragOverPanelId] = useState<string | null>(null);

  // Core Initializer: generate standard random board
  const handleRandomize = (overrideCount?: number, overrideConfig?: Partial<BoardStyleConfig>) => {
    // Merge latest config factors natively
    const currentConfig = { ...config, ...overrideConfig };
    const currentCount = overrideCount !== undefined ? overrideCount : currentConfig.panelCount;

    // Generate raw grid layouts (original vertices)
    const rawPanels = generateRandomLayout(ratio, {
      ...currentConfig,
      panelCount: currentCount,
      showPrompts: false // story prompts removed/hidden
    });

    // Run geometric margin offset shrinkage
    const calculatedPanels = rawPanels.map((p, idx) => {
      const inset = insetPolygon(p.originalVertices, currentConfig.gutterWidth / 2);
      const c = getCentroid(inset);
      
      // Inject some starting absolute-positioned speech balloons/sound effects
      let bubbles: SpeechBubble[] = [];
      let onomas: Onomatopoeia[] = [];

      if (idx === -1 && currentCount >= 3) {
        bubbles = [{
          text: '这是哪里？',
          x: Math.round(c.x),
          y: Math.round(c.y - 70),
          type: 'thought',
          scale: 1.0
        }];
      } else if (idx === -1 && currentCount >= 3) {
        onomas = [{
          text: '啪嗒！',
          x: Math.round(c.x + 40),
          y: Math.round(c.y + 20),
          rotate: -15,
          scale: 1.15,
          style: 'chubby',
          color: '#3b82f6',
          borderColor: '#ffffff'
        }];
      }

      return {
        ...p,
        insetVertices: inset,
        bubbles,
        onomatopoeias: onomas,
        effectDensity: 50,
        effectIntensity: 2.0,
        effectFocusSize: 50,
        effectCenterX: 0,
        effectCenterY: 0,
        effectColor: currentConfig.borderColor,
        effectAngle: 45,
        customStickers: []
      };
    });

    setPanels(calculatedPanels);
    // Auto select first panel
    if (calculatedPanels.length > 0) {
      setSelectedPanelId(calculatedPanels[0].id);
    } else {
      setSelectedPanelId(null);
    }
  };

  // Re-run insets whenever gutters shift
  useEffect(() => {
    if (panels.length === 0) {
      handleRandomize();
      return;
    }
    const updated = panels.map(p => ({
      ...p,
      insetVertices: insetPolygon(p.originalVertices, config.gutterWidth / 2)
    }));
    setPanels(updated);
  }, [config.gutterWidth]);

  // Handle ratio changes - requires full regenerate
  useEffect(() => {
    handleRandomize();
  }, [ratio]);

  // Get active selected panel object references
  const selectedPanel = panels.find(p => p.id === selectedPanelId) || null;

  // Manual split function for selected panel (interactive split)
  const handleManualSplit = (direction: 'vertical' | 'horizontal') => {
    if (!selectedPanel) return;

    // Use split logic
    const { x, y, w: tw, h: th } = getBoundingBox(selectedPanel.originalVertices);
    
    // Middle split with a bit of randomness
    const splitRatio = 0.45 + Math.random() * 0.1;
    let A: { x: number; y: number };
    let B: { x: number; y: number };

    const slantStrength = config.slantIntensity;

    if (direction === 'vertical') {
      const splitX = x + tw * splitRatio;
      const slant = (Math.random() * 2 - 1) * slantStrength * tw * 0.15;
      A = { x: splitX - slant, y: y - 50 };
      B = { x: splitX + slant, y: y + th + 50 };
    } else {
      const splitY = y + th * splitRatio;
      const slant = (Math.random() * 2 - 1) * slantStrength * th * 0.15;
      A = { x: x - 50, y: splitY - slant };
      B = { x: x + tw + 50, y: splitY + slant };
    }

    import('./utils/geometry').then(({ splitPolygon }) => {
      const [leftPoly, rightPoly] = splitPolygon(selectedPanel.originalVertices, A, B);
      if (leftPoly.length >= 3 && rightPoly.length >= 3) {
        // Create 2 new panels
        const panel1: Panel = {
          id: `panel-split-a-${Date.now()}`,
          originalVertices: leftPoly,
          insetVertices: insetPolygon(leftPoly, config.gutterWidth / 2),
          name: `${selectedPanel.name} (左)`,
          color: selectedPanel.color,
          effect: selectedPanel.effect,
          onomatopoeias: [...selectedPanel.onomatopoeias],
          bubbles: [...selectedPanel.bubbles],
          effectDensity: selectedPanel.effectDensity ?? 50,
          effectIntensity: selectedPanel.effectIntensity ?? 2.0,
          effectFocusSize: selectedPanel.effectFocusSize ?? 50,
          effectCenterX: selectedPanel.effectCenterX ?? 0,
          effectCenterY: selectedPanel.effectCenterY ?? 0,
          image: selectedPanel.image ? { ...selectedPanel.image } : undefined,
          customStickers: [...(selectedPanel.customStickers || [])]
        };

        const panel2: Panel = {
          id: `panel-split-b-${Date.now()}`,
          originalVertices: rightPoly,
          insetVertices: insetPolygon(rightPoly, config.gutterWidth / 2),
          name: `${selectedPanel.name} (右)`,
          color: DUMMY_COLORS[Math.floor(Math.random() * DUMMY_COLORS.length)],
          effect: 'none',
          onomatopoeias: [],
          bubbles: [],
          effectDensity: 50,
          effectIntensity: 2.0,
          effectFocusSize: 50,
          effectCenterX: 0,
          effectCenterY: 0,
          customStickers: []
        };

        // Remove old panel, inject both new split panels
        const newPanels = panels.filter(p => p.id !== selectedPanel.id);
        const nextPanels = [...newPanels, panel1, panel2];
        setPanels(nextPanels);
        setSelectedPanelId(panel1.id);
        setConfig(prev => ({ ...prev, panelCount: nextPanels.length }));
      }
    });
  };

  // Delete selected panel, and attempt to merge the boundary back or just trim
  const handleDeletePanel = () => {
    if (panels.length <= 1 || !selectedPanel) return;
    const remaining = panels.filter(p => p.id !== selectedPanel.id);
    setPanels(remaining);
    setSelectedPanelId(remaining[0].id);
    setConfig(prev => ({ ...prev, panelCount: remaining.length }));
  };

  // Quick preset template application
  const handleApplyPresetTemplate = (pCount: number, slant: number, gutter: number, name: string) => {
    setConfig(prev => ({
      ...prev,
      panelCount: pCount,
      slantIntensity: slant,
      gutterWidth: gutter,
      selectedTemplate: name
    }));

    // Generate immediate layout using parameters directly
    setTimeout(() => {
      const raw = generateRandomLayout(ratio, {
        ...config,
        panelCount: pCount,
        slantIntensity: slant,
        gutterWidth: gutter,
        showPrompts: false
      });
      const final = raw.map(p => ({
        ...p,
        insetVertices: insetPolygon(p.originalVertices, gutter / 2),
        effectDensity: 50,
        effectIntensity: 2.0,
        effectFocusSize: 50,
        effectCenterX: 0,
        effectCenterY: 0,
        effectColor: config.borderColor,
        effectAngle: 45,
        customStickers: []
      }));
      setPanels(final);
      if (final.length > 0) setSelectedPanelId(final[0].id);
    }, 40);
  };

  // Add individual speech bubbles to selected panel using absolute board coordinates (centroid)
  const addSpeechBubble = () => {
    if (!selectedPanel) return;
    const c = getCentroid(selectedPanel.insetVertices);
    const bubble: SpeechBubble = {
      text: newBubbleText,
      x: Math.round(c.x), // Placed on centroid absolutely!
      y: Math.round(c.y),
      type: newBubbleType,
      scale: 1.0
    };
    const updated = panels.map(p => {
      if (p.id === selectedPanel.id) {
        return {
          ...p,
          bubbles: [...(p.bubbles || []), bubble]
        };
      }
      return p;
    });
    setPanels(updated);
    setNewBubbleText(''); // reset input
  };

  // Add individual sound effect stickers using absolute coordinates (centroid)
  const addOnomatopoeia = () => {
    if (!selectedPanel) return;
    const c = getCentroid(selectedPanel.insetVertices);
    const onom: Onomatopoeia = {
      text: newOnomText,
      x: Math.round(c.x), // Placed on centroid absolutely!
      y: Math.round(c.y),
      rotate: Math.round((Math.random() * 40) - 20), // random slant
      scale: 1.2,
      style: newOnomStyle,
      color: newOnomColor,
      borderColor: '#ffffff'
    };
    const updated = panels.map(p => {
      if (p.id === selectedPanel.id) {
        return {
          ...p,
          onomatopoeias: [...(p.onomatopoeias || []), onom]
        };
      }
      return p;
    });
    setPanels(updated);
    setNewOnomText('砰！'); // default next
  };

  // Upload custom stickers handler
  const handleStickerUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedPanel || !e.target.files?.[0]) return;
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = (event) => {
      const src = event.target?.result as string;
      const c = getCentroid(selectedPanel.insetVertices);
      const sticker: CustomSticker = {
        id: `sticker-${Date.now()}-${Math.random()}`,
        src,
        x: Math.round(c.x),
        y: Math.round(c.y),
        scale: 0.6,
        rotate: 0
      };
      
      const updated = panels.map(p => {
        if (p.id === selectedPanel.id) {
          const stickers = p.customStickers || [];
          return {
            ...p,
            customStickers: [...stickers, sticker]
          };
        }
        return p;
      });
      setPanels(updated);
    };
    reader.readAsDataURL(file);
    e.target.value = ''; // clear input
  };

  // Upload illustration inside panel
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedPanel || !e.target.files?.[0]) return;
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = (event) => {
      const src = event.target?.result as string;
      const c = getCentroid(selectedPanel.insetVertices);
      const bbox = getBoundingBox(selectedPanel.insetVertices);
      
      const updated = panels.map(p => {
        if (p.id === selectedPanel.id) {
          return {
            ...p,
          image: {
                  src,
                  x: Math.round(bbox.x),
                  y: Math.round(bbox.y),
                  width: Math.round(bbox.w),
                  height: Math.round(bbox.h),
              scale: 1.0,
              rotate: 0,
              isUnlocked: false // Locked in panel by default
            } as PanelImage
          };
        }
        return p;
      });
      setPanels(updated);
    };
    reader.readAsDataURL(file);
    e.target.value = ''; // clear input
  };

  // Edit fields inside selected panel
  const updateBubbleText = (bubbleIdx: number, val: string) => {
    const updated = panels.map(p => {
      if (p.id === selectedPanelId) {
        const bubbles = [...p.bubbles];
        if (bubbles[bubbleIdx]) {
          bubbles[bubbleIdx].text = val;
        }
        return { ...p, bubbles };
      }
      return p;
    });
    setPanels(updated);
  };

  const updateOnomText = (onomIdx: number, val: string) => {
    const updated = panels.map(p => {
      if (p.id === selectedPanelId) {
        const onomatopoeias = [...p.onomatopoeias];
        if (onomatopoeias[onomIdx]) {
          onomatopoeias[onomIdx].text = val;
        }
        return { ...p, onomatopoeias };
      }
      return p;
    });
    setPanels(updated);
  };

  const deleteBubble = (idx: number) => {
    const updated = panels.map(p => {
      if (p.id === selectedPanelId) {
        return {
          ...p,
          bubbles: p.bubbles.filter((_, bIdx) => bIdx !== idx)
        };
      }
      return p;
    });
    setPanels(updated);
  };

  const deleteOnom = (idx: number) => {
    const updated = panels.map(p => {
      if (p.id === selectedPanelId) {
        return {
          ...p,
          onomatopoeias: p.onomatopoeias.filter((_, oIdx) => oIdx !== idx)
        };
      }
      return p;
    });
    setPanels(updated);
  };

  // Drag handles starting coordinates in page viewport coordinates
  const handleDragStart = (
    e: React.MouseEvent | React.TouchEvent,
    type: 'bubble' | 'onom' | 'panel_image' | 'custom_sticker',
    panelId: string,
    index: number,
    initialX: number,
    initialY: number
  ) => {
    e.stopPropagation();
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    
    let clientX = 0;
    let clientY = 0;
    if ('touches' in e) {
      if (e.touches.length === 0) return;
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
      // Prevent default to disable page panning during dragging on mobile
      if (e.cancelable) {
        e.preventDefault();
      }
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    const svgRect = {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height
    };

    // Map screen mouse pixel (clientX, clientY) to internal SVG viewbox pixels
    const svgX = ((clientX - svgRect.left) / svgRect.width) * dims.w;
    const svgY = ((clientY - svgRect.top) / svgRect.height) * dims.h;

    setActiveDrag({
      type,
      panelId,
      index,
      dragStartSvgX: svgX,
      dragStartSvgY: svgY,
      initialX,
      initialY,
      svgRect
    });
  };

  // High-performance global window-level dragging to prevent lags or lost tracking
  useEffect(() => {
    if (!activeDrag) return;

    const handleGlobalMove = (e: MouseEvent | TouchEvent) => {
      let clientX = 0;
      let clientY = 0;
      if ('touches' in e) {
        if (e.touches.length === 0) return;
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
        if (e.cancelable) {
          e.preventDefault();
        }
      } else {
        clientX = e.clientX;
        clientY = e.clientY;
      }

      const { svgRect } = activeDrag;
      const svgX = ((clientX - svgRect.left) / svgRect.width) * dims.w;
      const svgY = ((clientY - svgRect.top) / svgRect.height) * dims.h;

      const deltaX = svgX - activeDrag.dragStartSvgX;
      const deltaY = svgY - activeDrag.dragStartSvgY;

      const newX = Math.round(activeDrag.initialX + deltaX);
      const newY = Math.round(activeDrag.initialY + deltaY);

      setPanels(prev => prev.map(p => {
        if (p.id === activeDrag.panelId) {
          if (activeDrag.type === 'bubble') {
            const bubbles = [...p.bubbles];
            if (bubbles[activeDrag.index]) {
              bubbles[activeDrag.index] = { ...bubbles[activeDrag.index], x: newX, y: newY };
            }
            return { ...p, bubbles };
          } else if (activeDrag.type === 'onom') {
            const onomas = [...p.onomatopoeias];
            if (onomas[activeDrag.index]) {
              onomas[activeDrag.index] = { ...onomas[activeDrag.index], x: newX, y: newY };
            }
            return { ...p, onomatopoeias: onomas };
          } else if (activeDrag.type === 'panel_image') {
            if (p.image) {
              return {
                ...p,
                image: { ...p.image, x: newX, y: newY }
              };
            }
          } else if (activeDrag.type === 'custom_sticker') {
            const stickers = [...(p.customStickers || [])];
            if (stickers[activeDrag.index]) {
              stickers[activeDrag.index] = { ...stickers[activeDrag.index], x: newX, y: newY };
            }
            return { ...p, customStickers: stickers };
          }
        }
        return p;
      }));
    };

    const handleGlobalUp = () => {
      setActiveDrag(null);
    };

    // Use passive: false to allow e.preventDefault() to block standard scrolling during dragging on mobile
    window.addEventListener('mousemove', handleGlobalMove, { passive: false });
    window.addEventListener('mouseup', handleGlobalUp, { passive: true });
    window.addEventListener('touchmove', handleGlobalMove, { passive: false });
    window.addEventListener('touchend', handleGlobalUp, { passive: true });

    return () => {
      window.removeEventListener('mousemove', handleGlobalMove);
      window.removeEventListener('mouseup', handleGlobalUp);
      window.removeEventListener('touchmove', handleGlobalMove);
      window.removeEventListener('touchend', handleGlobalUp);
    };
  }, [activeDrag, dims.w, dims.h]);

  // Global hook listener for dragging grid divider lines
  useEffect(() => {
    if (!activeDividerDrag) return;

    const handleGlobalMove = (e: MouseEvent | TouchEvent) => {
      if (!svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      
      let clientX = 0;
      let clientY = 0;
      if ('touches' in e) {
        if (e.touches.length === 0) return;
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
        if (e.cancelable) e.preventDefault();
      } else {
        clientX = e.clientX;
        clientY = e.clientY;
      }

      const scaleX = dims.w / rect.width;
      const scaleY = dims.h / rect.height;

      const deltaPageX = clientX - activeDividerDrag.dragStartPageX;
      const deltaPageY = clientY - activeDividerDrag.dragStartPageY;

      const deltaSvgX = deltaPageX * scaleX;
      const deltaSvgY = deltaPageY * scaleY;

      setPanels(prev => {
        return prev.map(p => {
          const initialVerts = activeDividerDrag.initialVerticesMap[p.id];
          if (!initialVerts) return p;

          const nextVerts = initialVerts.map((v, vIdx) => {
            const match = activeDividerDrag.matchedVertices.find(
              m => m.panelId === p.id && m.vertexIdx === vIdx
            );

            if (match) {
              if (activeDividerDrag.type === 'horizontal') {
                const newY = Math.max(10, Math.min(dims.h - 10, v.y + deltaSvgY));
                return { ...v, y: newY };
              } else {
                const newX = Math.max(10, Math.min(dims.w - 10, v.x + deltaSvgX));
                return { ...v, x: newX };
              }
            }
            return v;
          });

          const nextInset = insetPolygon(nextVerts, config.gutterWidth / 2);

          return {
            ...p,
            originalVertices: nextVerts,
            insetVertices: nextInset
          };
        });
      });
    };

    const handleGlobalUp = () => {
      setActiveDividerDrag(null);
    };

    window.addEventListener('mousemove', handleGlobalMove, { passive: false });
    window.addEventListener('mouseup', handleGlobalUp, { passive: true });
    window.addEventListener('touchmove', handleGlobalMove, { passive: false });
    window.addEventListener('touchend', handleGlobalUp, { passive: true });

    return () => {
      window.removeEventListener('mousemove', handleGlobalMove);
      window.removeEventListener('mouseup', handleGlobalUp);
      window.removeEventListener('touchmove', handleGlobalMove);
      window.removeEventListener('touchend', handleGlobalUp);
    };
  }, [activeDividerDrag, dims.w, dims.h, config.gutterWidth]);

  // Extracts dynamic dividing line segments from panels original vertices
  const getDividers = () => {
    const dividers: any[] = [];
    const edgeClosenessThreshold = 15; // px

    const rawEdges: { panelId: string; v1Idx: number; v2Idx: number; p1: Point; p2: Point }[] = [];
    panels.forEach(p => {
      const verts = p.originalVertices;
      const n = verts.length;
      for (let i = 0; i < n; i++) {
        const p1 = verts[i];
        const p2 = verts[(i + 1) % n];

        // Check boundary
        const onLeft = Math.abs(p1.x) < 3 && Math.abs(p2.x) < 3;
        const onRight = Math.abs(p1.x - dims.w) < 3 && Math.abs(p2.x - dims.w) < 3;
        const onTop = Math.abs(p1.y) < 3 && Math.abs(p2.y) < 3;
        const onBottom = Math.abs(p1.y - dims.h) < 3 && Math.abs(p2.y - dims.h) < 3;

        if (!onLeft && !onRight && !onTop && !onBottom) {
          rawEdges.push({
            panelId: p.id,
            v1Idx: i,
            v2Idx: (i + 1) % n,
            p1,
            p2
          });
        }
      }
    });

    const visited = new Set<string>();

    rawEdges.forEach((edge, idx) => {
      const key = `${edge.panelId}-${edge.v1Idx}`;
      if (visited.has(key)) return;

      const matches = [edge];
      visited.add(key);

      for (let j = idx + 1; j < rawEdges.length; j++) {
        const other = rawEdges[j];
        const otherKey = `${other.panelId}-${other.v1Idx}`;
        if (visited.has(otherKey)) continue;

        const matchNormal = 
          Math.hypot(edge.p1.x - other.p1.x, edge.p1.y - other.p1.y) < edgeClosenessThreshold &&
          Math.hypot(edge.p2.x - other.p2.x, edge.p2.y - other.p2.y) < edgeClosenessThreshold;

        const matchReversed = 
          Math.hypot(edge.p1.x - other.p2.x, edge.p1.y - other.p2.y) < edgeClosenessThreshold &&
          Math.hypot(edge.p2.x - other.p1.x, edge.p2.y - other.p1.y) < edgeClosenessThreshold;

        if (matchNormal || matchReversed) {
          matches.push(other);
          visited.add(otherKey);
        }
      }

      let avgX1 = 0, avgY1 = 0, avgX2 = 0, avgY2 = 0;
      matches.forEach(m => {
        const isReversed = Math.hypot(edge.p1.x - m.p2.x, edge.p1.y - m.p2.y) < edgeClosenessThreshold;
        if (isReversed) {
          avgX1 += m.p2.x;
          avgY1 += m.p2.y;
          avgX2 += m.p1.x;
          avgY2 += m.p1.y;
        } else {
          avgX1 += m.p1.x;
          avgY1 += m.p1.y;
          avgX2 += m.p2.x;
          avgY2 += m.p2.y;
        }
      });

      const c = matches.length;
      const p1 = { x: avgX1 / c, y: avgY1 / c };
      const p2 = { x: avgX2 / c, y: avgY2 / c };

      const dx = Math.abs(p1.x - p2.x);
      const dy = Math.abs(p1.y - p2.y);
      const type = dx > dy ? 'horizontal' : 'vertical';

      const matchedVertices: any[] = [];
      panels.forEach(p => {
        p.originalVertices.forEach((v, vIdx) => {
          const d1 = Math.hypot(v.x - p1.x, v.y - p1.y);
          const d2 = Math.hypot(v.x - p2.x, v.y - p2.y);
          if (d1 < edgeClosenessThreshold) {
            matchedVertices.push({ panelId: p.id, vertexIdx: vIdx, pointRef: 'p1' });
          } else if (d2 < edgeClosenessThreshold) {
            matchedVertices.push({ panelId: p.id, vertexIdx: vIdx, pointRef: 'p2' });
          }
        });
      });

      dividers.push({
        id: `divider-${idx}-${Date.now()}`,
        p1,
        p2,
        type,
        matchedVertices
      });
    });

    return dividers;
  };

  // Helper to place gallery item into any grid slot
  const applyGalleryImageToPanel = (src: string, panelId: string) => {
    setPanels(prev => prev.map(p => {
      if (p.id === panelId) {
        const c = getCentroid(p.insetVertices);
        return {
          ...p,
          image: {
            src,
            x: Math.round(c.x - 175),
            y: Math.round(c.y - 125),
            width: 350,
            height: 250,
            scale: 1.0,
            rotate: 0,
            isUnlocked: false
          }
        };
      }
      return p;
    }));
  };

  // Keep empty helper for prop validation / reference safety if used elsewhere
  const handleMouseMove = () => {};
  const handleMouseUp = () => {};

  // Download SVG
  const handleDownloadSVG = () => {
    const svgElement = document.getElementById('manga-canvas');
    if (!svgElement) return;

    setExporting(true);

    setTimeout(() => {
      const liveSvgElement = document.getElementById('manga-canvas');
      if (liveSvgElement) {
        const data = new XMLSerializer().serializeToString(liveSvgElement);
        const svgBlob = new Blob([data], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(svgBlob);

        const link = document.createElement('a');
        link.href = url;
        link.download = `comic-panels-${ratio}-${Date.now()}.svg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }
      setExporting(false);
    }, 100);
  };

  // Download high-resolution PNG
  const handleDownloadPNG = () => {
    const svgElement = document.getElementById('manga-canvas');
    if (!svgElement) return;

    setExporting(true);

    setTimeout(() => {
      const liveSvgElement = document.getElementById('manga-canvas');
      if (liveSvgElement) {
        const data = new XMLSerializer().serializeToString(liveSvgElement);
        const svgBlob = new Blob([data], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(svgBlob);

        const img = new window.Image();
        img.src = url;

        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = dims.w * 2; // Export at 2x resolution
          canvas.height = dims.h * 2;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.fillStyle = config.backgroundColor || '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

            const imgURL = canvas.toDataURL('image/png');
            const link = document.createElement('a');
            link.href = imgURL;
            link.download = `comic-layout-${ratio}-${Date.now()}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
          }
          URL.revokeObjectURL(url);
          setExporting(false);
        };

        img.onerror = () => {
          setExporting(false);
        };
      } else {
        setExporting(false);
      }
    }, 100);
  };

  return (
    <div className="min-h-screen bg-[#FDFCF9] text-stone-900 flex flex-col font-sans selection:bg-stone-900 selection:text-stone-50">
      {/* Dynamic Header */}
      <header className="border-b border-stone-200/80 bg-white/95 backdrop-blur-md sticky top-0 z-40 px-6 py-4.5 flex flex-wrap items-center justify-between gap-4 shadow-[0_2px_12px_-4px_rgba(28,25,23,0.03)]">
        <div className="flex items-center gap-3">
          <div className="border border-stone-900 bg-stone-950 text-stone-50 px-2.5 py-1.5 font-mono tracking-widest text-xs uppercase font-extrabold flex items-center gap-1.5 shadow-sm">
            <Columns className="w-4 h-4 text-white" />
            <span>MangaGrid</span>
          </div>
          <div>
            <h1 className="text-base font-bold font-serif text-stone-900 tracking-tight flex items-center gap-1.5 leading-tight">
              <span>漫画格子生成器</span>
              <span className="text-[10px] font-mono font-normal tracking-wider text-stone-400 border border-stone-200 rounded px-1.5 py-[2px] bg-stone-50 uppercase">No.01</span>
              <span className="text-[11px] font-sans font-medium text-stone-500 border-l border-stone-200 pl-2 ml-0.5">
  制作者：shiemezz9
</span>
<a
  href="https://shiemezz9.github.io/text-layout-generator/"
  target="_blank"
  rel="noreferrer"
  className="text-[11px] font-sans font-semibold text-stone-700 hover:text-stone-950 border border-stone-200 hover:border-stone-400 bg-white px-2 py-[2px] rounded inline-flex items-center gap-1 transition-colors"
>
  <span>文字排版生成器</span>
  <ExternalLink className="w-3 h-3" />
</a>
            </h1>
            <p className="text-[11px] font-sans text-stone-500 mt-0.5 animate-pulse">支持斜角裁切、图层解锁、无边际自由拖拽贴纸、及特技线条密度自由度调节</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Zoom Controls */}
          <div className="flex items-center bg-stone-100 rounded border border-stone-200 p-[3px] text-xs">
            <button
              onClick={() => setZoom(z => Math.max(0.4, z - 0.1))}
              className="p-1 px-1.5 hover:bg-white rounded-sm text-stone-600 hover:text-stone-900 transition-colors cursor-pointer"
              title="缩小预览"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="px-2 text-stone-500 font-mono w-12 text-center text-[11px]">{Math.round(zoom * 100)}%</span>
            <button
              onClick={() => setZoom(z => Math.min(1.5, z + 0.1))}
              className="p-1 px-1.5 hover:bg-white rounded-sm text-stone-600 hover:text-stone-900 transition-colors cursor-pointer"
              title="放大预览"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            onClick={() => handleRandomize()}
            className="flex items-center gap-1.5 px-4 py-2 bg-stone-900 hover:bg-stone-800 text-stone-50 font-semibold rounded-sm text-xs tracking-wider uppercase transition shadow-sm cursor-pointer"
          >
            <Shuffle className="w-3.5 h-3.5 text-white" />
            <span>随机生成分格</span>
          </button>

          <button
            onClick={handleDownloadSVG}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-stone-50 text-stone-800 rounded-sm text-xs font-semibold border border-stone-300 transition shadow-[0_1px_3px_rgba(0,0,0,0.05)] cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-stone-600" />
            <span>导出 SVG</span>
          </button>

          <button
            onClick={handleDownloadPNG}
            disabled={exporting}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-stone-800 hover:bg-stone-700 disabled:opacity-50 text-stone-50 rounded-sm text-xs font-semibold transition shadow-sm cursor-pointer"
          >
            {exporting ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-white" />
            ) : (
              <ImageIcon className="w-3.5 h-3.5 text-white" />
            )}
            <span>{exporting ? '正在编译图片...' : '导出高精 PNG'}</span>
          </button>
        </div>
      </header>

      {/* Main Workspace Layout */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        
        {/* Left Side: Layout Preset & Style Configs */}
        <aside className="w-full lg:w-80 bg-white border-b lg:border-b-0 lg:border-r border-stone-200/85 p-6 overflow-y-auto space-y-6 flex-shrink-0">
          
          {/* Canvas Proportions / Ratio */}
          <div className="space-y-3">
            <h3 className="text-[10px] font-mono font-bold text-stone-400 uppercase tracking-widest flex items-center gap-2">
              <Maximize2 className="w-3.5 h-3.5 text-stone-500" />
              <span>画布纸张高宽比</span>
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'portrait', label: '纵向单页 (4:5)', desc: '标准单页漫画' },
                { id: 'square', label: '正方形 (1:1)', desc: '社媒贴图尺寸' },
                { id: 'landscape', label: '横向视效 (16:9)', desc: '宽屏电影分镜' },
                { id: 'tall', label: 'Webtoon 长条', desc: '垂直条漫风格' }
              ].map(opt => (
                <button
                  key={opt.id}
                  onClick={() => setRatio(opt.id as CanvasRatio)}
                  className={`p-3 rounded text-left border transition-all flex flex-col justify-between cursor-pointer ${
                    ratio === opt.id
                      ? 'bg-stone-50 border-stone-900 text-stone-900 font-medium shadow-[0_1px_4px_rgba(0,0,0,0.03)]'
                      : 'border-stone-200 bg-white hover:bg-stone-50/50 text-stone-500 hover:text-stone-800'
                  }`}
                >
                  <span className="text-xs font-bold leading-tight font-sans">{opt.label}</span>
                  <span className="text-[10px] text-stone-400 tracking-tight mt-1">{opt.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Preset Layout Templates */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-[10px] font-mono font-bold text-stone-400 uppercase tracking-widest flex items-center gap-2">
                <Columns className="w-3.5 h-3.5 text-stone-500" />
                <span>分格模版预设</span>
              </h3>
            </div>
            <div className="space-y-2">
              {getPresetTemplates(ratio).map((tpl, i) => (
                <button
                  key={i}
                  onClick={() => handleApplyPresetTemplate(tpl.panels, tpl.slant, tpl.gutter, tpl.name)}
                  className={`w-full py-2 px-3.5 text-left rounded text-xs border transition-all flex items-center justify-between cursor-pointer ${
                    config.selectedTemplate === tpl.name
                      ? 'bg-stone-900 text-white font-semibold border-stone-900 shadow-sm'
                      : 'border-stone-200 hover:border-stone-300 bg-white text-stone-600 hover:text-stone-900'
                  }`}
                >
                  <span className="truncate">{tpl.name}</span>
                  <ChevronRight className="w-3 h-3 flex-shrink-0 text-stone-400" />
                </button>
              ))}
            </div>
          </div>

          {/* Styles Custom Settings */}
          <div className="space-y-4 pt-4 border-t border-stone-200">
            <h3 className="text-[10px] font-mono font-bold text-stone-400 uppercase tracking-widest flex items-center gap-2">
              <Settings2 className="w-3.5 h-3.5 text-stone-500" />
              <span>布局细节参数调节</span>
            </h3>

            {/* Slider: Panel Count */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-stone-500 font-medium">随机分格个数</span>
                <span className="font-mono text-stone-900 font-semibold text-xs">{config.panelCount} 格</span>
              </div>
              <input
                type="range"
                min="1"
                max="8"
                step="1"
                value={config.panelCount}
                onChange={e => {
                  const val = parseInt(e.target.value);
                  setConfig(prev => ({ ...prev, panelCount: val }));
                  handleRandomize(val);
                }}
                className="w-full h-1 bg-stone-250 rounded appearance-none cursor-pointer accent-stone-900"
              />
            </div>

            {/* Slider: Slant Intensity */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-stone-500 font-medium">倾斜切割斜率 (Slant)</span>
                <span className="font-mono text-stone-950 font-bold text-xs">{(config.slantIntensity * 100).toFixed(0)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="1.2"
                step="0.05"
                value={config.slantIntensity}
                onChange={e => {
                  const val = parseFloat(e.target.value);
                  setConfig(prev => ({ ...prev, slantIntensity: val, selectedTemplate: '自定义' }));
                  // Fixed background slant bug: directly call randomize on input to regenerate grids with new slant on the fly!
                  handleRandomize(undefined, { slantIntensity: val, selectedTemplate: '自定义' });
                }}
                className="w-full h-1 bg-stone-250 rounded appearance-none cursor-pointer accent-stone-900 animate-pulse"
              />
            </div>

            {/* Slider: Gutter width */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-stone-500 font-medium">格间缝隙大小 (Gutter)</span>
                <span className="font-mono text-stone-900 font-semibold text-xs">{config.gutterWidth} px</span>
              </div>
              <input
                type="range"
                min="0"
                max="32"
                step="2"
                value={config.gutterWidth}
                onChange={e => {
                  const val = parseInt(e.target.value);
                  setConfig(prev => ({ ...prev, gutterWidth: val, selectedTemplate: '自定义' }));
                }}
                className="w-full h-1 bg-stone-250 rounded appearance-none cursor-pointer accent-stone-900"
              />
            </div>

            {/* Slider: Border width */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-stone-500 font-medium">格子外框线条粗细</span>
                <span className="font-mono text-stone-900 font-semibold text-xs">{config.borderWidth} px</span>
              </div>
              <input
                type="range"
                min="0"
                max="16"
                step="1"
                value={config.borderWidth}
                onChange={e => {
                  const val = parseInt(e.target.value);
                  setConfig(prev => ({ ...prev, borderWidth: val }));
                }}
                className="w-full h-1 bg-stone-250 rounded appearance-none cursor-pointer accent-stone-900"
              />
            </div>

            {/* Theme Colors */}
            <div className="space-y-2">
              <span className="text-xs text-stone-500 font-medium">纸张布面背景色</span>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                {[
                  { label: '温润白卡', bg: '#ffffff', outline: '#0f172a' },
                  { label: '仿古发黄', bg: '#fef3c7', outline: '#1e293b' },
                  { label: '极简水泥', bg: '#fafafa', outline: '#334155' },
                  { label: '暗黑星河', bg: '#090d16', outline: '#ffffff' }
                ].map((th, i) => (
                  <button
                    key={i}
                    onClick={() => setConfig(prev => ({
                      ...prev,
                      backgroundColor: th.bg,
                      borderColor: th.outline
                    }))}
                    className="p-1.5 px-2 bg-stone-50 border border-stone-200 hover:border-stone-300 rounded flex items-center justify-between gap-1 text-left cursor-pointer transition-colors"
                  >
                    <span className="truncate text-stone-700 font-sans">{th.label}</span>
                    <div className="flex items-center gap-[4px] flex-shrink-0">
                      <div className="w-2.5 h-2.5 rounded-full border border-stone-300" style={{ backgroundColor: th.bg }} />
                      <div className="w-2.5 h-2.5 rounded-full border border-stone-300" style={{ backgroundColor: th.outline }} />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Guide Information */}
          <div className="p-4 bg-stone-50 border border-stone-150/70 text-[11px] leading-relaxed text-stone-600 rounded space-y-2.5">
            <div className="flex items-center gap-1 font-semibold text-stone-700">
              <Info className="w-3.5 h-3.5 text-stone-600" />
              <span>新版功能操作指南：</span>
            </div>
            <p>1. <b>切割斜率：</b>拖动倾斜切割斜率滑杆，分格的倾斜形态将会立刻进行重构并实时展现！</p>
            <p>2. <b>精美台词气泡与声音贴纸：</b>点击格子添加，在右侧面板配置。可直接在中央画布上用鼠标<b>在任意处自由拖拽定位</b>！</p>
            <p>3. <b>格子内图片上传：</b>选择格子后上传，默认加载在对应格子内部被切掉多余部分。可通过<b>「解锁图片」</b>一键将位置在底层解开，进行全画幅大图底衬和跨界，并一键透明格子背景！</p>
            <p>4. <b>自主上传图案贴纸：</b>在最右下角支持上传外部 PNG 贴图（自动透明背景），配合气泡框随意拖拽！</p>
          </div>

          {/* Draggable Temporary Gallery UI Section (Item 5) */}
          <div className="space-y-3 pt-4 border-t border-stone-200">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-stone-500 flex items-center gap-1">
                <ImageIcon className="w-3.5 h-3.5 text-stone-600" />
                <span>临时备选素材库 (点拽即入格)</span>
              </span>
              <span className="text-[9px] bg-amber-50 text-amber-700 border border-amber-200/80 px-1.5 py-0.5 font-sans font-bold uppercase">
                多图上传/拖放
              </span>
            </div>

            {/* Custom drag & drop multiple files box */}
            <label className="border border-dashed border-stone-300 bg-[#FFFDF9] hover:bg-stone-50/70 p-3 flex flex-col items-center justify-center cursor-pointer transition text-center group rounded-none">
              <Upload className="w-5 h-5 text-stone-400 group-hover:text-stone-600 transition mb-1" />
              <span className="text-[11px] font-semibold text-stone-700">点击或将本地多图拖放到此</span>
              <span className="text-[9px] text-stone-400">支持一次性批量选择 JPG/PNG/WEBP</span>
              <input
                type="file"
                multiple
                accept="image/*"
                className="hidden"
                onChange={e => {
                  if (e.target.files) {
                    const filesArray = Array.from(e.target.files);
                    filesArray.forEach(file => {
                      const reader = new FileReader();
                      reader.onload = (event) => {
                        if (event.target?.result) {
                          setGallery(prev => [
                            ...prev,
                            { id: `gallery-${Date.now()}-${Math.random()}`, src: event.target!.result as string }
                          ]);
                        }
                      };
                      reader.readAsDataURL(file as File);
                    });
                  }
                }}
              />
            </label>

            {/* Gallery list view */}
            {gallery.length === 0 ? (
              <div className="text-[10px] text-stone-400 text-center py-4 bg-stone-50 border border-stone-150">
                暂无备选图，点击上方按钮上传或引入。
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2 max-h-[175px] overflow-y-auto pr-1">
                {gallery.map(item => (
                  <div
                    key={item.id}
                    draggable
                    onDragStart={e => {
                      e.dataTransfer.setData('text/plain', item.src);
                      e.dataTransfer.effectAllowed = 'copy';
                    }}
                    onClick={() => {
                      if (selectedPanelId) {
                        applyGalleryImageToPanel(item.src, selectedPanelId);
                      }
                    }}
                    className={`relative aspect-[4/3] bg-stone-150 border border-stone-250 cursor-grab active:cursor-grabbing hover:border-amber-500 hover:ring-1 hover:ring-amber-500 group select-none overflow-hidden`}
                    title="【拖拽】此图到对应漫画格，或【选中格子后点击它】直接插入"
                  >
                    <img
                      src={item.src}
                      alt="Gallery item"
                      className="w-full h-full object-cover pointer-events-none"
                    />
                    
                    {/* Tiny hover helper badge */}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-[8px] text-white transition-opacity font-bold">
                      拖动/点选
                    </div>

                    {/* Delete thumbnail bubble */}
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        setGallery(prev => prev.filter(g => g.id !== item.id));
                      }}
                      className="absolute top-0.5 right-0.5 bg-stone-900/80 text-white w-3.5 h-3.5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600 text-[8px] font-bold"
                      title="删除此素材"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>

        {/* Center Canvas Viewer */}
        <main className="flex-1 bg-[#F5F4EE] overflow-auto p-4 md:p-8 flex items-center justify-center relative min-h-[400px]">
          {/* Inner zoom container wrapper */}
          <div
            className="transition-transform duration-200 ease-out"
            style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}
          >
            {/* SVG board frame container */}
            <div
              className="bg-white rounded-none shadow-[0_22px_55px_rgba(28,25,23,0.12)] relative overflow-hidden flex items-center justify-center"
              style={{
                width: `${dims.w}px`,
                height: `${dims.h}px`,
                maxWidth: '92vw',
                maxHeight: '85vh',
                border: `${config.borderWidth || 8}px solid ${config.borderColor}`
              }}
            >
              {panels.length === 0 ? (
                <div className="flex flex-col items-center justify-center text-stone-400 gap-2 p-10 font-sans">
                  <RefreshCw className="w-6 h-6 animate-spin text-stone-400" />
                  <span className="text-xs">正在初始化画布格子中...</span>
                </div>
              ) : (
                <svg
                  id="manga-canvas"
                  ref={svgRef}
                  viewBox={`0 0 ${dims.w} ${dims.h}`}
                  className="w-full h-full select-none"
                  style={{ backgroundColor: config.backgroundColor }}
                >
                  {/* SVG Definitions for clipping-paths, grid overlays, and halftone screen textures */}
                  <defs>
                    {/* Render custom reactive patterns for screentone density/intensity per panel */}
                    {panels.map(p => {
                      const dens = 42 - (p.effectDensity ?? 50) * 0.28; // mapped density range: dots distance ~3 to ~40
                      const intensity = (p.effectIntensity ?? 2.0) * 0.75;
                      const size = Math.max(3.5, Math.min(42, dens));
                      const radius = Math.max(0.2, Math.min(size / 2 - 0.1, intensity));
                      return (
                        <g key={`pat-${p.id}`}>
                          <pattern id={`screentone-${p.id}`} width={size} height={size} patternUnits="userSpaceOnUse">
                            <circle cx={size/2} cy={size/2} r={radius} fill={p.effectColor || config.borderColor} opacity="0.32" />
                          </pattern>
                          <pattern id={`sketch-${p.id}`} width={Math.max(6, size * 1.5)} height={Math.max(6, size * 1.5)} patternTransform={`rotate(${p.effectAngle ?? 45})`} patternUnits="userSpaceOnUse">
                            <line x1="0" y1="0" x2="0" y2={Math.max(6, size * 1.5)} stroke={p.effectColor || config.borderColor} strokeWidth={Math.max(0.4, intensity * 0.45)} opacity="0.35" />
                          </pattern>
                        </g>
                      );
                    })}

                    <pattern id="bubble-thought-pattern" width="6" height="6" patternUnits="userSpaceOnUse">
                      <circle cx="3" cy="3" r="1" fill="#cbd5e1" opacity="0.4" />
                    </pattern>

                    {/* Every panel has its own clipPath generated based on its layout bounds */}
                    {panels.map(p => (
                      <clipPath id={`clip-${p.id}`} key={`clip-${p.id}`}>
                        <polygon points={getSvgPointsString(p.insetVertices)} />
                      </clipPath>
                    ))}
                  </defs>

                  {/* Layer 3: 最底层 (Uploaded Images and panel solid backgrounds) */}
                  {/* A background layout paper block */}
                  <rect width={dims.w} height={dims.h} fill={config.backgroundColor} className="pointer-events-none" />

                  {/* Render solid backgrounds of each panel */}
                  {panels.map(p => {
                    if (p.color && p.color !== 'transparent') {
                      return (
                        <g key={`panel-solid-bg-${p.id}`} clipPath={`url(#clip-${p.id})`}>
                          <polygon
                            points={getSvgPointsString(p.insetVertices)}
                            fill={p.color || config.panelBgColor}
                            className="pointer-events-none"
                          />
                        </g>
                      );
                    }
                    return null;
                  })}

                  {/* Render uploaded image: locked (clipped inside panel) or unlocked (free floating) */}
                  {panels.map(p => {
                    if (!p.image) return null;
                    if (p.image.isUnlocked) {
                      return (
                        <g
                          key={`bg-image-unlocked-${p.id}`}
                          className="cursor-move"
                          onMouseDown={(e) => handleDragStart(e, 'panel_image', p.id, 0, p.image!.x, p.image!.y)}
                          onTouchStart={(e) => handleDragStart(e, 'panel_image', p.id, 0, p.image!.x, p.image!.y)}
                        >
                          <image
                            href={p.image.src}
                            transform={`translate(${p.image.x}, ${p.image.y}) rotate(${p.image.rotate}, ${p.image.width / 2}, ${p.image.height / 2}) scale(${p.image.scale})`}
                            width={p.image.width}
                            height={p.image.height}
                            preserveAspectRatio="xMidYMid slice"
                          />
                        </g>
                      );
                    } else {
                      return (
                        <g key={`bg-image-locked-wrapper-${p.id}`} clipPath={`url(#clip-${p.id})`}>
                          <g
                            className="cursor-move"
                            onMouseDown={(e) => handleDragStart(e, 'panel_image', p.id, 0, p.image!.x, p.image!.y)}
                            onTouchStart={(e) => handleDragStart(e, 'panel_image', p.id, 0, p.image!.x, p.image!.y)}
                          >
                            <image
                              href={p.image.src}
                              transform={`translate(${p.image.x}, ${p.image.y}) rotate(${p.image.rotate}, ${p.image.width / 2}, ${p.image.height / 2}) scale(${p.image.scale})`}
                              width={p.image.width}
                              height={p.image.height}
                              preserveAspectRatio="xMidYMid meet"
                            />
                          </g>
                        </g>
                      );
                    }
                  })}

                  {/* Layer 2: 中层 （带白色底的纸张，漫画框的部分镂空，以及最上层的黑色边框颜色与特技层） */}
                  {(() => {
                    const pPolyToSubpath = (vertices: { x: number; y: number }[]) => {
                      if (vertices.length === 0) return '';
                      return 'M ' + vertices.map(v => `${v.x},${v.y}`).join(' L ') + ' Z';
                    };
                    const paperPathD = `M 0,0 L ${dims.w},0 L ${dims.w},${dims.h} L 0,${dims.h} Z ` +
                      panels.map(p => pPolyToSubpath(p.insetVertices)).join(' ');

                    return (
                      <path
                        d={paperPathD}
                        fill={config.backgroundColor}
                        fillRule="evenodd"
                        className="pointer-events-none"
                      />
                    );
                  })()}

                  {/* Render each panel's overlay patterns, board outlines, and interaction drag areas on Layer 2 */}
                  {panels.map((p) => {
                    const isSelected = selectedPanelId === p.id;
                    const c = getCentroid(p.insetVertices);
                    const bbox = getBoundingBox(p.insetVertices);

                    return (
                      <g key={`panel-effects-borders-group-${p.id}`}>
                        {/* Dynamic aesthetic filters and speed lines overlays inside the panel hole */}
                        <g clipPath={`url(#clip-${p.id})`}>
                          {p.effect === 'screentone' && (
                            <polygon
                              points={getSvgPointsString(p.insetVertices)}
                              fill={`url(#screentone-${p.id})`}
                              className="pointer-events-none"
                            />
                          )}

                          {p.effect === 'speedlines_h' && (
                            <g className="pointer-events-none opacity-40">
                              {Array.from({ length: Math.round(p.effectDensity ?? 50) }).map((_, li) => {
                                const yPos = bbox.y + (bbox.h / Math.round(p.effectDensity ?? 50)) * li;
                                const strokeW = (Math.random() * 0.8 + 0.2) * (p.effectIntensity ?? 2.0);
                                const offsetStart = Math.random() * 80;
                                const shiftX = ((p.effectCenterX ?? 0) / 100) * bbox.w;
                                const shiftY = ((p.effectCenterY ?? 0) / 100) * bbox.h;
                                return (
                                  <line
                                    key={li}
                                    x1={bbox.x + offsetStart + shiftX}
                                    y1={yPos + shiftY}
                                    x2={bbox.x + bbox.w - Math.random() * 80 + shiftX}
                                    y2={yPos + shiftY}
                                    stroke={p.effectColor || config.borderColor}
                                    strokeWidth={strokeW}
                                  />
                                );
                              })}
                            </g>
                          )}

                          {p.effect === 'speedlines_v' && (
                            <g className="pointer-events-none opacity-40">
                              {Array.from({ length: Math.round(p.effectDensity ?? 50) }).map((_, li) => {
                                const xPos = bbox.x + (bbox.w / Math.round(p.effectDensity ?? 50)) * li;
                                const strokeW = (Math.random() * 0.8 + 0.2) * (p.effectIntensity ?? 2.0);
                                const offsetStart = Math.random() * 80;
                                const shiftX = ((p.effectCenterX ?? 0) / 100) * bbox.w;
                                const shiftY = ((p.effectCenterY ?? 0) / 100) * bbox.h;
                                return (
                                  <line
                                    key={li}
                                    x1={xPos + shiftX}
                                    y1={bbox.y + offsetStart + shiftY}
                                    x2={xPos + shiftX}
                                    y2={bbox.y + bbox.h - Math.random() * 80 + shiftY}
                                    stroke={p.effectColor || config.borderColor}
                                    strokeWidth={strokeW}
                                  />
                                );
                              })}
                            </g>
                          )}

                          {p.effect === 'radial_burst' && (
                            <g className="pointer-events-none">
                              {(() => {
                                const lineCount = Math.round(p.effectDensity ?? 70);
                                const intensity = p.effectIntensity ?? 2.0;
                                const centerX = c.x + ((p.effectCenterX ?? 0) / 100) * bbox.w;
                                const centerY = c.y + ((p.effectCenterY ?? 0) / 100) * bbox.h;
                                return Array.from({ length: lineCount }).map((_, li) => {
                                  const angle = (li * 2 * Math.PI) / lineCount;
                                  const radOuter = Math.max(bbox.w, bbox.h) * 1.3;
                                  const focusSize = p.effectFocusSize ?? 50;
                                  const baseRatio = Math.max(0.01, 1 - focusSize / 100);
                                  let radInner = radOuter * baseRatio * (0.75 + Math.random() * 0.5);
                                  if (radInner > radOuter * 0.95) {
                                    radInner = radOuter * 0.95;
                                  }
                                  const x1 = centerX + Math.cos(angle) * radOuter;
                                  const y1 = centerY + Math.sin(angle) * radOuter;
                                  const x2 = centerX + Math.cos(angle) * radInner;
                                  const y2 = centerY + Math.sin(angle) * radInner;

                                  // Dynamic tapering widths: thick at outside edge, extremely sharp near center focus
                                  const wOuter = (Math.random() * 0.8 + 0.3) * intensity * 2.2;
                                  const wInner = wOuter * 0.08; // 92% thinner at the center focus

                                  const halfWOuter = wOuter / 2;
                                  const halfWInner = wInner / 2;

                                  const sinVal = Math.sin(angle);
                                  const cosVal = Math.cos(angle);

                                  const xA = x1 - halfWOuter * sinVal;
                                  const yA = y1 + halfWOuter * cosVal;

                                  const xB = x1 + halfWOuter * sinVal;
                                  const yB = y1 - halfWOuter * cosVal;

                                  const xC = x2 + halfWInner * sinVal;
                                  const yC = y2 - halfWInner * cosVal;

                                  const xD = x2 - halfWInner * sinVal;
                                  const yD = y2 + halfWInner * cosVal;

                                  const pts = `${xA.toFixed(1)},${yA.toFixed(1)} ${xB.toFixed(1)},${yB.toFixed(1)} ${xC.toFixed(1)},${yC.toFixed(1)} ${xD.toFixed(1)},${yD.toFixed(1)}`;

                                  return (
                                    <polygon
                                      key={li}
                                      points={pts}
                                      fill={p.effectColor || config.borderColor}
                                      opacity="0.95"
                                    />
                                  );
                                });
                              })()}
                            </g>
                          )}

                          {p.effect === 'sketch_lines' && (
                            <polygon
                              points={getSvgPointsString(p.insetVertices)}
                              fill={`url(#sketch-${p.id})`}
                              className="pointer-events-none"
                            />
                          )}
                        </g>

                        {/* Solid manga panel borders (black/custom color outer frame) */}
                        <polygon
                          points={getSvgPointsString(p.insetVertices)}
                          fill="none"
                          stroke={config.borderColor}
                          strokeWidth={config.borderWidth}
                          className="pointer-events-none"
                        />

                        {/* Terracotta/bronze selection highlight border overlay when selected */}
                        {(isSelected && !exporting) && (
                          <polygon
                            points={getSvgPointsString(p.insetVertices)}
                            fill="none"
                            stroke="#9e5932"
                            strokeWidth="4"
                            className="pointer-events-none"
                            style={{ strokeDasharray: '6,4' }}
                          />
                        )}

                        {/* Render active gallery drag over highlight feedback */}
                        {dragOverPanelId === p.id && (
                          <polygon
                            points={getSvgPointsString(p.insetVertices)}
                            fill="rgba(245, 158, 11, 0.18)"
                            stroke="#f59e0b"
                            strokeWidth="5"
                            className="pointer-events-none"
                          />
                        )}
 
                        {/* Interactive Invisible Click & Drag Surface to Select Panel and Smoothly Drag the Underlying Image */}
                        <polygon
                          points={getSvgPointsString(p.insetVertices)}
                          fill="transparent"
                          className={`cursor-pointer ${p.image ? 'cursor-grab active:cursor-grabbing' : ''}`}
                          onClick={() => setSelectedPanelId(p.id)}
                          onMouseDown={(e) => {
                            setSelectedPanelId(p.id);
                            if (p.image) {
                              handleDragStart(e, 'panel_image', p.id, 0, p.image.x, p.image.y);
                            }
                          }}
                          onTouchStart={(e) => {
                            setSelectedPanelId(p.id);
                            if (p.image) {
                              handleDragStart(e, 'panel_image', p.id, 0, p.image.x, p.image.y);
                            }
                          }}
                          onDragOver={(e) => e.preventDefault()}
                          onDragEnter={() => setDragOverPanelId(p.id)}
                          onDragLeave={() => setDragOverPanelId(null)}
                          onDrop={(e) => {
                            e.preventDefault();
                            setDragOverPanelId(null);
                            const src = e.dataTransfer.getData('text/plain');
                            if (src) {
                              applyGalleryImageToPanel(src, p.id);
                            }
                          }}
                        />
                      </g>
                    );
                  })}

                  {/* Render draggable dividing lines */}
                  {getDividers().map((div) => {
                    const isHoriz = div.type === 'horizontal';
                    return (
                      <line
                        key={div.id}
                        x1={div.p1.x}
                        y1={div.p1.y}
                        x2={div.p2.x}
                        y2={div.p2.y}
                        stroke="transparent"
                        strokeWidth={14}
                        className={`cursor-pointer ${isHoriz ? 'hover:stroke-amber-500/30 cursor-ns-resize' : 'hover:stroke-amber-500/30 cursor-ew-resize'}`}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          const initialMap: { [panelId: string]: Point[] } = {};
                          panels.forEach(p => {
                            initialMap[p.id] = p.originalVertices.map(v => ({ ...v }));
                          });
                          setActiveDividerDrag({
                            dividerId: div.id,
                            type: div.type,
                            dragStartPageX: e.clientX,
                            dragStartPageY: e.clientY,
                            matchedVertices: div.matchedVertices,
                            initialVerticesMap: initialMap
                          });
                        }}
                        onTouchStart={(e) => {
                          if (e.touches.length === 0) return;
                          e.stopPropagation();
                          const initialMap: { [panelId: string]: Point[] } = {};
                          panels.forEach(p => {
                            initialMap[p.id] = p.originalVertices.map(v => ({ ...v }));
                          });
                          setActiveDividerDrag({
                            dividerId: div.id,
                            type: div.type,
                            dragStartPageX: e.touches[0].clientX,
                            dragStartPageY: e.touches[0].clientY,
                            matchedVertices: div.matchedVertices,
                            initialVerticesMap: initialMap
                          });
                        }}
                      />
                    );
                  })}

                  {/* Level 5: DRAGGABLE SOUND EFFECTS, BALLOONS AND CUSTOM GRAPHICS STICKERS */}
                  {panels.map(p => {
                    const isSelected = selectedPanelId === p.id;
                    const c = getCentroid(p.insetVertices);
                    const bbox = getBoundingBox(p.insetVertices);

                    return (
                      <g key={`overlays-${p.id}`}>
                        {/* Sound Effects drag overlays */}
                        {p.onomatopoeias.map((on, oni) => {
                          const posX = on.x;
                          const posY = on.y;
                          
                          let textFill = on.color;
                          let textStroke = on.borderColor || '#ffffff';
                          let strokeWidth = '5px';
                          let fontFamily = 'Impact, sans-serif, system-ui';
                          let slantStyle = 'italic';
                          let fontWeight = '900';

                          if (on.style === 'chubby') {
                            fontFamily = 'Comic Sans MS, cursive, system-ui';
                            strokeWidth = '6px';
                            fontWeight = 'bold';
                          } else if (on.style === 'grunge') {
                            textFill = '#7f1d1d';
                            textStroke = '#fef3c7';
                            strokeWidth = '4px';
                          } else if (on.style === 'brush') {
                            fontFamily = 'cursive, system-ui';
                            slantStyle = 'normal';
                            textFill = '#111827';
                            textStroke = '#fafafa';
                            strokeWidth = '4px';
                          }

                          return (
                            <g
                              key={`onom-${oni}`}
                              transform={`translate(${posX}, ${posY}) rotate(${on.rotate}) scale(${on.scale})`}
                              className="cursor-move"
                              onMouseDown={(e) => handleDragStart(e, 'onom', p.id, oni, on.x, on.y)}
                              onTouchStart={(e) => handleDragStart(e, 'onom', p.id, oni, on.x, on.y)}
                            >
                              {(isSelected && !exporting) && (
                                <circle r="22" fill="none" stroke="#9e5932" strokeWidth="1.5" strokeDasharray="3,3" opacity="0.4" />
                              )}
                              <text
                                textAnchor="middle"
                                dominantBaseline="middle"
                                fill={textStroke}
                                stroke={textStroke}
                                strokeWidth="12"
                                strokeLinejoin="round"
                                fontSize="32"
                                fontFamily={fontFamily}
                                fontStyle={slantStyle}
                                fontWeight={fontWeight}
                                opacity="0.8"
                              >
                                {on.text}
                              </text>
                              <text
                                textAnchor="middle"
                                dominantBaseline="middle"
                                fill={textFill}
                                stroke={textStroke}
                                strokeWidth={strokeWidth}
                                strokeLinejoin="round"
                                fontSize="32"
                                fontFamily={fontFamily}
                                fontStyle={slantStyle}
                                fontWeight={fontWeight}
                              >
                                {on.text}
                              </text>
                              <text
                                textAnchor="middle"
                                dominantBaseline="middle"
                                fill={textFill}
                                fontSize="32"
                                fontFamily={fontFamily}
                                fontStyle={slantStyle}
                                fontWeight={fontWeight}
                              >
                                {on.text}
                              </text>
                            </g>
                          );
                        })}

                        {/* Speech Bubble dragging layers */}
                        {p.bubbles.map((ub, ubi) => {
                          const posX = ub.x;
                          const posY = ub.y;
                          const bubbleScale = ub.scale;

                          const lines = ub.text.split('\n');
                          const fontSize = 12;
                          const lineH = 15;
                          const blockH = lines.length * lineH;
                          
                          const textLength = Math.max(...lines.map(l => l.length));
                          // Approx width computation based on Chinese / English ratio
                          const bubbleW = Math.max(70, textLength * 12 + 20);
                          const bubbleH = Math.max(45, blockH + 18);

                          return (
                            <g
                              key={`bubble-${ubi}`}
                              transform={`translate(${posX}, ${posY}) scale(${bubbleScale})`}
                              className="cursor-move"
                              onMouseDown={(e) => handleDragStart(e, 'bubble', p.id, ubi, ub.x, ub.y)}
                              onTouchStart={(e) => handleDragStart(e, 'bubble', p.id, ubi, ub.x, ub.y)}
                            >
                              {/* Option A: Normal speech bubble */}
                              {ub.type === 'normal' && (
                                <g>
                                  <polygon
                                    points={`-12,12 -5,24 10,10`}
                                    fill="#ffffff"
                                    stroke={config.borderColor}
                                    strokeWidth="3.5"
                                    strokeLinejoin="round"
                                  />
                                  <rect
                                    x={-bubbleW / 2}
                                    y={-bubbleH / 2}
                                    width={bubbleW}
                                    height={bubbleH}
                                    rx="22"
                                    ry="16"
                                    fill="#ffffff"
                                    stroke={config.borderColor}
                                    strokeWidth="3.5"
                                    strokeLinejoin="round"
                                  />
                                  <polygon
                                    points={`-9,10 -4,21 8,8`}
                                    fill="#ffffff"
                                  />
                                </g>
                              )}

                              {/* Option B: Thought cloud balloon */}
                              {ub.type === 'thought' && (
                                <g>
                                  <circle cx="-16" cy="24" r="3.5" fill="#ffffff" stroke={config.borderColor} strokeWidth="2.5" />
                                  <circle cx="-25" cy="30" r="2.5" fill="#ffffff" stroke={config.borderColor} strokeWidth="2" />
                                  <g>
                                    <ellipse cx="0" cy="0" rx={bubbleW / 2 + 3} ry={bubbleH / 2 + 1} fill="#ffffff" stroke={config.borderColor} strokeWidth="3" />
                                    <ellipse cx={-bubbleW / 3} cy="-4" rx="16" ry="12" fill="#ffffff" stroke={config.borderColor} strokeWidth="3" />
                                    <ellipse cx={bubbleW / 3} cy="4" rx="15" ry="12" fill="#ffffff" stroke={config.borderColor} strokeWidth="3" />
                                    <ellipse cx="-4" cy={-bubbleH / 3} rx="16" ry="10" fill="#ffffff" stroke={config.borderColor} strokeWidth="3" />
                                    <ellipse cx="4" cy={bubbleH / 3} rx="15" ry="10" fill="#ffffff" stroke={config.borderColor} strokeWidth="3" />
                                    <ellipse cx="0" cy="0" rx={bubbleW / 2 - 2} ry={bubbleH / 2 - 2} fill="#ffffff" />
                                    <ellipse cx={-bubbleW / 3} cy="-4" rx="14" ry="10" fill="#ffffff" />
                                    <ellipse cx={bubbleW / 3} cy="4" rx="13" ry="10" fill="#ffffff" />
                                  </g>
                                </g>
                              )}

                              {/* Option C: Spiky action shock star */}
                              {ub.type === 'action' && (
                                <g>
                                  <polygon
                                    points={(() => {
                                      const spikeCount = 18;
                                      const pts = [];
                                      const rxOuter = bubbleW / 2 + 12;
                                      const ryOuter = bubbleH / 2 + 10;
                                      const rxInner = bubbleW / 2 - 6;
                                      const ryInner = bubbleH / 2 - 5;

                                      for (let i = 0; i < spikeCount; i++) {
                                        const angle = (i * 2 * Math.PI) / spikeCount;
                                        const ox = Math.cos(angle) * rxOuter;
                                        const oy = Math.sin(angle) * ryOuter;
                                        pts.push(`${ox.toFixed(1)},${oy.toFixed(1)}`);
                                        
                                        const nextAngle = angle + Math.PI / spikeCount;
                                        const ix = Math.cos(nextAngle) * rxInner;
                                        const iy = Math.sin(nextAngle) * ryInner;
                                        pts.push(`${ix.toFixed(1)},${iy.toFixed(1)}`);
                                      }
                                      return pts.join(' ');
                                    })()}
                                    fill="#fef08a" // Yellow shocking fill
                                    stroke={config.borderColor}
                                    strokeWidth="3.5"
                                    strokeLinejoin="miter"
                                  />
                                </g>
                              )}

                              {/* Speech text strings */}
                              <g transform={`translate(0, -${(lines.length - 1) * (lineH / 2)})`}>
                                {lines.map((ln, lni) => (
                                  <text
                                    key={lni}
                                    x="0"
                                    y={lni * lineH}
                                    textAnchor="middle"
                                    fill="#000000"
                                    fontSize={fontSize}
                                    fontWeight="bold"
                                    fontFamily="system-ui, sans-serif"
                                    dominantBaseline="middle"
                                  >
                                    {ln}
                                  </text>
                                ))}
                              </g>
                            </g>
                          );
                        })}

                        {/* Draggable Custom Uploaded Graphic Stickers */}
                        {(p.customStickers || []).map((st, sti) => {
                          return (
                            <g
                              key={st.id}
                              transform={`translate(${st.x}, ${st.y}) scale(${st.scale}) rotate(${st.rotate})`}
                              className="cursor-move"
                              onMouseDown={(e) => handleDragStart(e, 'custom_sticker', p.id, sti, st.x, st.y)}
                              onTouchStart={(e) => handleDragStart(e, 'custom_sticker', p.id, sti, st.x, st.y)}
                            >
                              <image
                                href={st.src}
                                x={-80}
                                y={-80}
                                width={160}
                                height={160}
                                preserveAspectRatio="xMidYMid contain"
                              />
                              {(isSelected && !exporting) && (
                                <rect
                                  x={-81}
                                  y={-81}
                                  width={162}
                                  height={162}
                                  fill="none"
                                  stroke="#9e5932"
                                  strokeWidth="1.5"
                                  strokeDasharray="4,4"
                                />
                              )}
                            </g>
                          );
                        })}
                      </g>
                    );
                  })}
                </svg>
              )}
            </div>
          </div>
        </main>

        {/* Right Side: Active Panel Editor Drawer (Full Customizability) */}
        <aside className="w-full lg:w-96 bg-white border-t lg:border-t-0 lg:border-l border-stone-200/85 p-6 overflow-y-auto space-y-6 flex-shrink-0 text-stone-800">
          
          <div className="space-y-4">
            <h2 className="text-[11px] font-mono font-bold text-stone-400 flex items-center gap-2 pb-2.5 border-b border-stone-150 uppercase tracking-widest leading-none">
              <Layers className="w-3.5 h-3.5 text-stone-600" />
              <span>本漫画格细节美化编辑器</span>
            </h2>

            {selectedPanel ? (
              <div className="space-y-5">
                {/* Panel Info label */}
                <div className="bg-stone-50 p-4 rounded-none border border-stone-150/70 flex items-center justify-between font-sans">
                  <div>
                    <span className="text-[10px] text-stone-400 font-mono font-bold block uppercase tracking-wide">
                      Currently Editing
                    </span>
                    <span className="text-sm font-bold text-stone-800">
                      {selectedPanel.name}
                    </span>
                  </div>
                  
                  {/* Delete panel button */}
                  <div className="flex gap-1">
                    <button
                      onClick={handleDeletePanel}
                      disabled={panels.length <= 1}
                      className="p-1.5 bg-[#FFFDF9] hover:bg-red-50 border border-stone-200/80 hover:border-red-200 disabled:opacity-30 rounded-none text-stone-500 hover:text-red-750 transition cursor-pointer"
                      title="删除此分格"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Sub-Split Panel Controls */}
                <div className="space-y-2 font-sans">
                  <span className="text-[11px] font-mono font-bold tracking-wider uppercase text-stone-400 block pb-1">
                    对此分格继续人工分割裁切:
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => handleManualSplit('vertical')}
                      className="py-1.5 px-3 rounded-none bg-stone-50 border border-stone-200 hover:bg-stone-100/50 text-stone-700 text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
                    >
                      <Scissors className="w-3.5 h-3.5 rotate-90 text-stone-400" />
                      <span>左右分裂格子</span>
                    </button>
                    <button
                      onClick={() => handleManualSplit('horizontal')}
                      className="py-1.5 px-3 rounded-none bg-stone-50 border border-stone-200 hover:bg-stone-100/50 text-stone-700 text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
                    >
                      <Scissors className="w-3.5 h-3.5 text-stone-400" />
                      <span>上下分裂格子</span>
                    </button>
                  </div>
                </div>

                {/* Grid Color */}
                <div className="space-y-2 font-sans">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-mono font-bold tracking-wider uppercase text-stone-400 block pb-1">
                      此分格背景底色:
                    </span>
                    {/* Clear backgrounds to transparent button */}
                    <button
                      onClick={() => {
                        const updated = panels.map(p => ({ ...p, color: 'transparent' }));
                        setPanels(updated);
                      }}
                      className="text-[10px] bg-red-50 text-red-700 hover:bg-red-100 font-bold border border-red-200 px-2 py-0.5 rounded cursor-pointer transition-colors"
                      title="一键使所有格子的背景色都变成完全透明"
                    >
                      一键透明所有格子
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {DUMMY_COLORS.map(col => (
                      <button
                        key={col}
                        onClick={() => {
                          const updated = panels.map(p => p.id === selectedPanel.id ? { ...p, color: col } : p);
                          setPanels(updated);
                        }}
                        className={`w-6 h-6 rounded-full border transition-transform cursor-pointer ${
                          selectedPanel.color === col ? 'scale-115 ring-2 ring-[#9e5932] border-transparent' : 'border-stone-250'
                        }`}
                        style={{ backgroundColor: col }}
                        title={col}
                      />
                    ))}
                    {/* Transparent choice option */}
                    <button
                      onClick={() => {
                        const updated = panels.map(p => p.id === selectedPanel.id ? { ...p, color: 'transparent' } : p);
                        setPanels(updated);
                      }}
                      className={`w-6 h-6 rounded-full border border-dashed transition-transform cursor-pointer flex items-center justify-center text-[8px] text-stone-400 ${
                        selectedPanel.color === 'transparent' ? 'scale-115 ring-2 ring-[#9e5932] border-transparent' : 'border-stone-300'
                      }`}
                      title="透明"
                    >
                      透
                    </button>
                    <input
                      type="color"
                      value={selectedPanel.color === 'transparent' ? '#ffffff' : selectedPanel.color}
                      onChange={e => {
                        const updated = panels.map(p => p.id === selectedPanel.id ? { ...p, color: e.target.value } : p);
                        setPanels(updated);
                      }}
                      className="w-6 h-6 p-0 bg-transparent border-0 rounded cursor-pointer"
                    />
                  </div>
                </div>

                {/* Screentones & Action lines effects */}
                <div className="space-y-3 font-sans">
                  <span className="text-[11px] font-mono font-bold tracking-wider uppercase text-stone-400 block pb-1">
                    背景特技线 / 漫画滤镜网点:
                  </span>
                  <div className="grid grid-cols-2 gap-1.5 text-xs">
                    {[
                      { id: 'none', label: '纯净白板' },
                      { id: 'screentone', label: '░ Screentone 网点纸' },
                      { id: 'speedlines_h', label: '激斗横向特技线' },
                      { id: 'speedlines_v', label: '下坠落体垂直线' },
                      { id: 'radial_burst', label: '💥 极速冲击波' },
                      { id: 'sketch_lines', label: '速写阴影手绘感' }
                    ].map(eff => (
                      <button
                        key={eff.id}
                        onClick={() => {
                          const updated = panels.map(p =>
                            p.id === selectedPanel.id ? { ...p, effect: eff.id as PanelEffectType } : p
                          );
                          setPanels(updated);
                        }}
                        className={`py-1.5 px-2.5 text-left rounded-none border transition text-stone-600 cursor-pointer ${
                          selectedPanel.effect === eff.id
                            ? 'bg-stone-900 border-stone-900 text-white font-bold'
                            : 'border-stone-200 bg-[#FFFDF9] hover:bg-stone-50'
                        }`}
                      >
                        {eff.label}
                      </button>
                    ))}
                  </div>

                  {/* Sliders for active effects parameters (Item 3) */}
                  {selectedPanel.effect !== 'none' && (
                    <div className="bg-stone-50 p-3.5 border border-stone-200 space-y-3 font-sans rounded shadow-[inset_0_1px_3px_rgba(0,0,0,0.02)]">
                      <div className="flex items-center gap-1 text-[11px] text-stone-800 font-extrabold pb-1.5 border-b border-stone-200/60 uppercase">
                        <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                        <span>调节当前背景效果拟真度</span>
                      </div>
                      
                      {/* Density adjusting slider */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-[11px] font-mono text-stone-500">
                          <span>网点/纸张/条线数量密度:</span>
                          <span className="font-bold text-stone-900">{selectedPanel.effectDensity ?? 50}</span>
                        </div>
                        <input
                          type="range"
                          min="8"
                          max="125"
                          step="2"
                          value={selectedPanel.effectDensity ?? 50}
                          onChange={e => {
                            const val = parseInt(e.target.value);
                            setPanels(prev => prev.map(p => p.id === selectedPanel.id ? { ...p, effectDensity: val } : p));
                          }}
                          className="w-full h-1 bg-stone-200 rounded appearance-none cursor-pointer accent-stone-700"
                        />
                      </div>

                      {/* Intensity adjusting slider */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-[11px] font-mono text-stone-500">
                          <span>线条最粗度 / 网点半径/ 纸感:</span>
                          <span className="font-bold text-stone-900">{(selectedPanel.effectIntensity ?? 2.0).toFixed(1)}</span>
                        </div>
                        <input
                          type="range"
                          min="0.5"
                          max="25.0"
                          step="0.5"
                          value={selectedPanel.effectIntensity ?? 2.0}
                          onChange={e => {
                            const val = parseFloat(e.target.value);
                            setPanels(prev => prev.map(p => p.id === selectedPanel.id ? { ...p, effectIntensity: val } : p));
                          }}
                          className="w-full h-1 bg-stone-200 rounded appearance-none cursor-pointer accent-stone-700"
                        />
                      </div>

                      {/* Optional custom slant angle slider exclusively for hand-drawn sketch lines */}
                      {selectedPanel.effect === 'sketch_lines' && (
                        <div className="space-y-1 pt-2 border-t border-stone-200/60">
                          <div className="flex justify-between text-[11px] font-mono text-stone-500">
                            <span>速写阴影倾斜角度:</span>
                            <span className="font-bold text-stone-900">{selectedPanel.effectAngle ?? 45}°</span>
                          </div>
                          <input
                            type="range"
                            min="-180"
                            max="180"
                            step="5"
                            value={selectedPanel.effectAngle ?? 45}
                            onChange={e => {
                              const val = parseInt(e.target.value);
                              setPanels(prev => prev.map(p => p.id === selectedPanel.id ? { ...p, effectAngle: val } : p));
                            }}
                            className="w-full h-1 bg-stone-200 rounded appearance-none cursor-pointer accent-stone-700"
                          />
                        </div>
                      )}

                      {/* Dynamic Offset coordinates for burst as well as horizontal & vertical lines (Item 1) */}
                      {(selectedPanel.effect === 'radial_burst' || selectedPanel.effect === 'speedlines_h' || selectedPanel.effect === 'speedlines_v') && (
                        <div className="space-y-3 pt-2 border-t border-stone-200/60">
                          {/* Concentration (focus size) slider - Radial burst only */}
                          {selectedPanel.effect === 'radial_burst' && (
                            <div className="space-y-1">
                              <div className="flex justify-between text-[11px] font-mono text-stone-500">
                                <span>冲击波聚拢程度 (中心盲区):</span>
                                <span className="font-bold text-stone-900">{selectedPanel.effectFocusSize ?? 50}%</span>
                              </div>
                              <input
                                type="range"
                                min="0"
                                max="100"
                                step="2"
                                value={selectedPanel.effectFocusSize ?? 50}
                                onChange={e => {
                                  const val = parseInt(e.target.value);
                                  setPanels(prev => prev.map(p => p.id === selectedPanel.id ? { ...p, effectFocusSize: val } : p));
                                }}
                                className="w-full h-1 bg-stone-200 rounded appearance-none cursor-pointer accent-stone-700"
                              />
                            </div>
                          )}

                          <div className="grid grid-cols-2 gap-2.5 pt-1">
                            <div className="space-y-1">
                              <span className="text-[10px] font-mono text-stone-500 block">特技偏移/偏心 X: {selectedPanel.effectCenterX ?? 0}%</span>
                              <input
                                type="range"
                                min="-90"
                                max="90"
                                step="2"
                                value={selectedPanel.effectCenterX ?? 0}
                                onChange={e => {
                                  const val = parseInt(e.target.value);
                                  setPanels(prev => prev.map(p => p.id === selectedPanel.id ? { ...p, effectCenterX: val } : p));
                                }}
                                className="w-full h-1 bg-stone-200 rounded accent-stone-750"
                              />
                            </div>
                            <div className="space-y-1">
                              <span className="text-[10px] font-mono text-stone-500 block">特技偏移/偏心 Y: {selectedPanel.effectCenterY ?? 0}%</span>
                              <input
                                type="range"
                                min="-90"
                                max="90"
                                step="2"
                                value={selectedPanel.effectCenterY ?? 0}
                                onChange={e => {
                                  const val = parseInt(e.target.value);
                                  setPanels(prev => prev.map(p => p.id === selectedPanel.id ? { ...p, effectCenterY: val } : p));
                                }}
                                className="w-full h-1 bg-stone-200 rounded accent-stone-750"
                              />
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Optional custom Color selector for background effects (Item 3) */}
                      <div className="space-y-2 pt-2 border-t border-stone-200/60 font-sans">
                        <span className="text-[11px] font-mono text-stone-500 block">特技图案前景色:</span>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {['#000000', '#4b5563', '#9ca3af', '#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#ffffff'].map(col => (
                            <button
                              key={col}
                              type="button"
                              onClick={() => {
                                setPanels(prev => prev.map(p => p.id === selectedPanel.id ? { ...p, effectColor: col } : p));
                              }}
                              className={`w-5 h-5 rounded-sm border cursor-pointer ${
                                (selectedPanel.effectColor || config.borderColor) === col
                                  ? 'ring-2 ring-stone-900 border-transparent scale-110'
                                  : 'border-stone-300'
                              }`}
                              style={{ backgroundColor: col }}
                              title={col}
                            />
                          ))}
                          <input
                            type="color"
                            value={selectedPanel.effectColor || config.borderColor}
                            onChange={e => {
                              const val = e.target.value;
                              setPanels(prev => prev.map(p => p.id === selectedPanel.id ? { ...p, effectColor: val } : p));
                            }}
                            className="w-5 h-5 p-0 bg-transparent border-0 rounded cursor-pointer"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Grid Image Upload Controls (Item 6) */}
                <div className="space-y-2.5 pt-4 border-t border-stone-150 font-sans">
                  <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-stone-500 block">
                    🏞️ 上传图片到此漫画格内:
                  </span>
                  
                  {selectedPanel.image ? (
                    <div className="bg-stone-50 p-3.5 border border-stone-200 space-y-3.5 rounded-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-stone-700 font-bold border-l-2 border-amber-600 pl-1.5">插画大图已连结</span>
                        <button
                          onClick={() => {
                            setPanels(prev => prev.map(p => p.id === selectedPanel.id ? { ...p, image: undefined } : p));
                          }}
                          className="text-[10px] text-red-650 border border-red-200 hover:border-red-300 font-bold px-1.5 py-0.5 rounded bg-white hover:bg-red-50 cursor-pointer text-stone-700 hover:text-red-600"
                        >
                          删除此图
                        </button>
                      </div>

                      {/* Toggle Locked vs Unlocked positions (Item 6) */}
                      <button
                        onClick={() => {
                          setPanels(prev => prev.map(p => {
                            if (p.id === selectedPanel.id && p.image) {
                              return {
                                ...p,
                                image: { ...p.image, isUnlocked: !p.image.isUnlocked }
                              };
                            }
                            return p;
                          }));
                        }}
                        className={`w-full py-2 px-3 text-left rounded text-xs font-bold transition flex items-center gap-1.5 border cursor-pointer ${
                          selectedPanel.image.isUnlocked
                            ? 'bg-amber-100 text-amber-800 border-amber-300 shadow-[0_1px_4px_rgba(245,158,11,0.15)]'
                            : 'bg-stone-50 text-stone-600 border-stone-250 hover:bg-stone-100'
                        }`}
                      >
                        {selectedPanel.image.isUnlocked ? (
                          <>
                            <Unlock className="w-4 h-4 text-amber-600 shrink-0" />
                            <div className="text-left">
                              <span className="block font-extrabold text-[11px] leading-tight text-amber-900">图层已解锁 (可在底层自由拖拽)</span>
                              <span className="block text-[9px] text-amber-700 font-normal">图片可以在漫画分格线背面下方随意移动</span>
                            </div>
                          </>
                        ) : (
                          <>
                            <Lock className="w-4 h-4 text-stone-400 shrink-0" />
                            <div className="text-left">
                              <span className="block font-bold text-[11px] leading-tight text-stone-700">常规锁定 (限在格框内被裁切)</span>
                              <span className="block text-[9px] text-stone-400 font-normal">图片范围被锁在对应的漫画格内，可在里面微调</span>
                            </div>
                          </>
                        )}
                      </button>

                      {/* Transform fine-tune sliders */}
                      <div className="space-y-2.5 text-[11px] text-stone-500 pt-1.5 border-t border-stone-200/50">
                        <div className="space-y-1">
                          <div className="flex justify-between">
                            <span>微调比例体积:</span>
                            <span className="font-mono font-bold text-stone-900">{selectedPanel.image.scale.toFixed(2)}x</span>
                          </div>
                          <input
                            type="range"
                            min="0.1"
                            max="3.5"
                            step="0.05"
                            value={selectedPanel.image.scale}
                            onChange={e => {
                              const val = parseFloat(e.target.value);
                              setPanels(prev => prev.map(p => {
                                if (p.id === selectedPanel.id && p.image) {
                                  return { ...p, image: { ...p.image, scale: val } };
                                }
                                return p;
                              }));
                            }}
                            className="w-full h-1 bg-stone-200 rounded accent-stone-700"
                          />
                        </div>

                        <div className="space-y-1">
                          <div className="flex justify-between">
                            <span>微调平面旋转:</span>
                            <span className="font-mono font-bold text-stone-900">{selectedPanel.image.rotate}°</span>
                          </div>
                          <input
                            type="range"
                            min="-180"
                            max="180"
                            step="2"
                            value={selectedPanel.image.rotate}
                            onChange={e => {
                              const val = parseInt(e.target.value);
                              setPanels(prev => prev.map(p => {
                                if (p.id === selectedPanel.id && p.image) {
                                  return { ...p, image: { ...p.image, rotate: val } };
                                }
                                return p;
                              }));
                            }}
                            className="w-full h-1 bg-stone-200 rounded accent-stone-700"
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <label className="border-2 border-dashed border-stone-200 hover:border-stone-400 bg-stone-50/50 p-4 rounded text-center flex flex-col items-center justify-center gap-1.5 cursor-pointer hover:bg-white transition animate-none">
                      <Upload className="w-5 h-5 text-stone-400" />
                      <span className="text-xs font-bold text-stone-700">加载本地漫画插图</span>
                      <span className="text-[10px] text-stone-400">支持拖入本地图档 base64 极速渲染</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageUpload}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>

                {/* Speech Bubble manager section */}
                <div className="space-y-3 pt-4 border-t border-stone-150">
                  <div className="flex items-center justify-between font-sans">
                    <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-stone-500 flex items-center gap-1.5">
                      <MessageSquare className="w-3.5 h-3.5 text-stone-400" />
                      对话台词气泡贴纸 ({selectedPanel.bubbles.length})
                    </span>
                  </div>

                  {/* Bubble List inside selected panel */}
                  {selectedPanel.bubbles.length > 0 && (
                    <div className="space-y-3 bg-stone-50 p-3 rounded-none border border-stone-150">
                      {selectedPanel.bubbles.map((bb, bIdx) => (
                        <div key={bIdx} className="space-y-2 border-b border-stone-200.5 pb-2.5 last:border-0 last:pb-0 font-sans">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] text-stone-400 uppercase font-mono font-semibold">
                              对话气泡 #{bIdx + 1} ({bb.type === 'normal' ? '常规说' : bb.type === 'action' ? '震撼' : '默念心'})
                            </span>
                            <button
                              onClick={() => deleteBubble(bIdx)}
                              className="p-1 hover:bg-red-50 text-stone-450 hover:text-red-700 rounded transition cursor-pointer"
                              title="删除此气泡"
                            >
                              <Trash2 className="w-3" />
                            </button>
                          </div>

                          <textarea
                            value={bb.text}
                            rows={1.5}
                            onChange={e => updateBubbleText(bIdx, e.target.value)}
                            className="w-full bg-white border border-stone-200 rounded-none p-1.5 text-xs text-stone-850 focus:outline-none focus:border-stone-400 font-sans"
                          />

                          {/* Fine tuning sliders */}
                          <div className="grid grid-cols-2 gap-2 text-[10px] text-stone-500">
                            <div className="space-y-1">
                              <span>横轴绝对位置 X: {bb.x} px</span>
                              <input
                                type="range"
                                min="10"
                                max={dims.w - 10}
                                step="2"
                                value={bb.x}
                                onChange={e => {
                                  const val = parseInt(e.target.value);
                                  setPanels(prev => prev.map(p => {
                                    if (p.id === selectedPanel.id) {
                                      const bubbles = [...p.bubbles];
                                      if (bubbles[bIdx]) bubbles[bIdx].x = val;
                                      return { ...p, bubbles };
                                    }
                                    return p;
                                  }));
                                }}
                                className="w-full h-0.5 bg-stone-200 accent-stone-700"
                              />
                            </div>
                            <div className="space-y-1">
                              <span>纵轴绝对位置 Y: {bb.y} px</span>
                              <input
                                type="range"
                                min="10"
                                max={dims.h - 10}
                                step="2"
                                value={bb.y}
                                onChange={e => {
                                  const val = parseInt(e.target.value);
                                  setPanels(prev => prev.map(p => {
                                    if (p.id === selectedPanel.id) {
                                      const bubbles = [...p.bubbles];
                                      if (bubbles[bIdx]) bubbles[bIdx].y = val;
                                      return { ...p, bubbles };
                                    }
                                    return p;
                                  }));
                                }}
                                className="w-full h-0.5 bg-stone-200 accent-stone-700"
                              />
                            </div>
                          </div>

                          <div className="flex items-center justify-between text-[10px] text-stone-500">
                            <span>气泡尺寸调整:</span>
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => {
                                  setPanels(prev => prev.map(p => {
                                    if (p.id === selectedPanel.id) {
                                      const bubbles = [...p.bubbles];
                                      if (bubbles[bIdx]) bubbles[bIdx].scale = Math.max(0.4, bubbles[bIdx].scale - 0.1);
                                      return { ...p, bubbles };
                                    }
                                    return p;
                                  }));
                                }}
                                className="w-5 h-5 bg-white border border-stone-200 flex items-center justify-center font-bold hover:bg-stone-50 rounded cursor-pointer"
                              >
                                -
                              </button>
                              <span className="font-mono min-w-[24px] text-center">{bb.scale.toFixed(1)}x</span>
                              <button
                                onClick={() => {
                                  setPanels(prev => prev.map(p => {
                                    if (p.id === selectedPanel.id) {
                                      const bubbles = [...p.bubbles];
                                      if (bubbles[bIdx]) bubbles[bIdx].scale = Math.min(2.5, bubbles[bIdx].scale + 0.1);
                                      return { ...p, bubbles };
                                    }
                                    return p;
                                  }));
                                }}
                                className="w-5 h-5 bg-white border border-stone-200 flex items-center justify-center font-bold hover:bg-stone-50 rounded cursor-pointer"
                              >
                                +
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add Bubble controls */}
                  <div className="space-y-2.5 bg-stone-50 p-3.5 rounded-none border border-stone-150 font-sans">
                    <div className="flex gap-1 overflow-x-auto pb-1 text-[10px]">
                      {[
                        { id: 'normal', label: '💬 对话框' },
                        { id: 'thought', label: '💭 独白心声' },
                        { id: 'action', label: '💥 震撼波' }
                      ].map(type => (
                        <button
                          key={type.id}
                          onClick={() => setNewBubbleType(type.id as BubbleType)}
                          className={`flex-1 py-1 px-1.5 font-bold text-center border transition rounded-none cursor-pointer text-nowrap ${
                            newBubbleType === type.id
                              ? 'bg-stone-900 border-stone-900 text-stone-50'
                              : 'border-stone-200 text-stone-500 hover:text-stone-700 bg-white'
                          }`}
                        >
                          {type.label}
                        </button>
                      ))}
                    </div>

                    <div className="flex gap-1.5 pt-0.5">
                      <input
                        type="text"
                        value={newBubbleText}
                        onChange={e => setNewBubbleText(e.target.value)}
                        placeholder="台词文本..."
                        className="flex-1 bg-white border border-stone-200 rounded-none px-2 py-1.5 text-xs text-stone-800 placeholder-stone-400 focus:outline-none focus:border-stone-400"
                        onKeyDown={e => {
                          if (e.key === 'Enter') addSpeechBubble();
                        }}
                      />
                      <button
                        onClick={addSpeechBubble}
                        className="py-1 px-3 bg-stone-900 hover:bg-stone-850 text-white text-xs font-bold rounded-none flex items-center gap-1 transition cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>派发</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Onomatopoeias Sound effect controls */}
                <div className="space-y-3 pt-4 border-t border-stone-150">
                  <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-stone-500 flex items-center gap-1.5">
                    <HelpCircle className="w-3.5 h-3.5 text-stone-400" />
                    高爆卡通拟声词贴纸 ({selectedPanel.onomatopoeias.length})
                  </span>

                  {/* Sound FX List */}
                  {selectedPanel.onomatopoeias.length > 0 && (
                    <div className="space-y-3 bg-stone-50 p-3 rounded-none border border-stone-150">
                      {selectedPanel.onomatopoeias.map((on, onIdx) => (
                        <div key={onIdx} className="space-y-2 border-b border-stone-200 pb-2.5 last:border-0 last:pb-0 font-sans">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] text-stone-400 font-mono font-semibold">
                              声音贴纸 #{onIdx + 1} ({on.style === 'impact' ? '硬汉斜' : '卡通圈'})
                            </span>
                            <button
                              onClick={() => deleteOnom(onIdx)}
                              className="p-1 hover:bg-red-50 text-stone-400 hover:text-red-700 rounded transition cursor-pointer"
                              title="删除此声音"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>

                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={on.text}
                              onChange={e => updateOnomText(onIdx, e.target.value)}
                              className="flex-1 bg-white border border-stone-200 rounded-none px-2 py-1 text-xs text-stone-800 focus:outline-none"
                            />
                            <input
                              type="color"
                              value={on.color}
                              onChange={e => {
                                setPanels(prev => prev.map(p => {
                                  if (p.id === selectedPanel.id) {
                                    const onomatopoeias = [...p.onomatopoeias];
                                    if (onomatopoeias[onIdx]) onomatopoeias[onIdx].color = e.target.value;
                                    return { ...p, onomatopoeias };
                                  }
                                  return p;
                                }));
                              }}
                              className="w-7 h-6 p-0 bg-transparent shrink-0 cursor-pointer"
                            />
                          </div>

                          {/* Coordinates adjustment */}
                          <div className="grid grid-cols-2 gap-2 text-[10px] text-stone-500">
                            <div className="space-y-1">
                              <span>横轴绝对位置 X: {on.x} px</span>
                              <input
                                type="range"
                                min="10"
                                max={dims.w - 10}
                                step="2"
                                value={on.x}
                                onChange={e => {
                                  const val = parseInt(e.target.value);
                                  setPanels(prev => prev.map(p => {
                                    if (p.id === selectedPanel.id) {
                                      const onomatopoeias = [...p.onomatopoeias];
                                      if (onomatopoeias[onIdx]) onomatopoeias[onIdx].x = val;
                                      return { ...p, onomatopoeias };
                                    }
                                    return p;
                                  }));
                                }}
                                className="w-full h-0.5 bg-stone-200 accent-stone-700"
                              />
                            </div>
                            <div className="space-y-1">
                              <span>纵轴绝对位置 Y: {on.y} px</span>
                              <input
                                type="range"
                                min="10"
                                max={dims.h - 10}
                                step="2"
                                value={on.y}
                                onChange={e => {
                                  const val = parseInt(e.target.value);
                                  setPanels(prev => prev.map(p => {
                                    if (p.id === selectedPanel.id) {
                                      const onomatopoeias = [...p.onomatopoeias];
                                      if (onomatopoeias[onIdx]) onomatopoeias[onIdx].y = val;
                                      return { ...p, onomatopoeias };
                                    }
                                    return p;
                                  }));
                                }}
                                className="w-full h-0.5 bg-stone-200 accent-stone-700"
                              />
                            </div>
                          </div>

                          {/* Slant & Size */}
                          <div className="grid grid-cols-2 gap-2 text-[11px] text-stone-500">
                            <div className="flex justify-between items-center bg-white border border-stone-200 px-1.5 py-1">
                              <span>倾斜旋转:</span>
                              <input
                                type="number"
                                value={on.rotate}
                                onChange={e => {
                                  const val = parseInt(e.target.value) || 0;
                                  setPanels(prev => prev.map(p => {
                                    if (p.id === selectedPanel.id) {
                                      const onomatopoeias = [...p.onomatopoeias];
                                      if (onomatopoeias[onIdx]) onomatopoeias[onIdx].rotate = val;
                                      return { ...p, onomatopoeias };
                                    }
                                    return p;
                                  }));
                                }}
                                className="w-8 text-[10px] bg-transparent text-right text-stone-855 font-bold outline-none font-mono"
                              />
                            </div>
                            <div className="flex justify-between items-center bg-white border border-stone-200 px-1.5 py-1">
                              <span>大小比率:</span>
                              <input
                                type="number"
                                step="0.1"
                                value={on.scale}
                                onChange={e => {
                                  const val = parseFloat(e.target.value) || 1.0;
                                  setPanels(prev => prev.map(p => {
                                    if (p.id === selectedPanel.id) {
                                      const onomatopoeias = [...p.onomatopoeias];
                                      if (onomatopoeias[onIdx]) onomatopoeias[onIdx].scale = val;
                                      return { ...p, onomatopoeias };
                                    }
                                    return p;
                                  }));
                                }}
                                className="w-8 text-[10px] bg-transparent text-right text-stone-855 font-bold outline-none font-mono"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Creator Form for new Onomatopoeias */}
                  <div className="space-y-2.5 bg-stone-50 p-3.5 rounded-none border border-stone-150 font-sans">
                    <div className="grid grid-cols-4 gap-1 text-[10px] text-center font-bold">
                      {[
                        { id: 'impact', label: '硬斜粗' },
                        { id: 'chubby', label: '圆卡通' },
                        { id: 'grunge', label: '破坏斑驳' },
                        { id: 'brush', label: '水墨风' }
                      ].map(st => (
                        <button
                          key={st.id}
                          onClick={() => setNewOnomStyle(st.id as any)}
                          className={`py-1 rounded-none border transition cursor-pointer text-nowrap ${
                            newOnomStyle === st.id
                              ? 'bg-stone-900 border-stone-900 text-stone-50'
                              : 'border-stone-200 text-stone-500 hover:text-stone-700 bg-white'
                          }`}
                        >
                          {st.label}
                        </button>
                      ))}
                    </div>

                    <div className="flex flex-wrap gap-1 text-[11px]">
                      {['轰！', '啪！', '咻！', '咚！', '哈！', '哔咚！'].map(fx => (
                        <button
                          key={fx}
                          onClick={() => setNewOnomText(fx)}
                          className="px-2.5 py-0.5 rounded-none bg-white border border-stone-200 hover:bg-stone-50 text-stone-700 font-bold transition cursor-pointer"
                        >
                          {fx}
                        </button>
                      ))}
                    </div>

                    <div className="flex gap-1.5 pt-0.5">
                      <input
                        type="text"
                        value={newOnomText}
                        onChange={e => setNewOnomText(e.target.value)}
                        placeholder="自定义拟声字..."
                        className="flex-1 bg-white border border-stone-200 rounded-none px-2 py-1.5 text-xs text-stone-800 placeholder-stone-400 focus:outline-none focus:border-stone-400"
                        onKeyDown={e => {
                          if (e.key === 'Enter') addOnomatopoeia();
                        }}
                      />
                      <input
                        type="color"
                        value={newOnomColor}
                        onChange={e => setNewOnomColor(e.target.value)}
                        className="w-7 h-7 p-0 bg-transparent shrink-0 cursor-pointer"
                      />
                      <button
                        onClick={addOnomatopoeia}
                        className="py-1 px-3 bg-stone-900 hover:bg-stone-850 text-white text-xs font-bold rounded-none flex items-center gap-1 transition cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>贴满</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Upload Custom Graphic Stickers panel (Item 7) */}
                <div className="space-y-3 pt-4 border-t border-stone-150">
                  <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-stone-500 flex items-center gap-1.5">
                    <Palette className="w-3.5 h-3.5 text-amber-600 animate-spin" style={{ animationDuration: '6s' }} />
                    添加上传自定义图案贴纸 ({selectedPanel.customStickers?.length || 0})
                  </span>

                  {/* List Custom Stickers */}
                  {selectedPanel.customStickers && selectedPanel.customStickers.length > 0 && (
                    <div className="space-y-3 bg-stone-50 p-3 rounded-none border border-stone-150">
                      {selectedPanel.customStickers.map((st, sIdx) => (
                        <div key={st.id} className="space-y-2 border-b border-stone-200 pb-2.5 last:border-0 last:pb-0 font-sans">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] text-stone-405 font-mono font-semibold">
                              自定义贴图 #{sIdx + 1}
                            </span>
                            <button
                              onClick={() => {
                                setPanels(prev => prev.map(p => {
                                  if (p.id === selectedPanel.id) {
                                    return {
                                      ...p,
                                      customStickers: (p.customStickers || []).filter((_, idx) => idx !== sIdx)
                                    };
                                  }
                                  return p;
                                }));
                              }}
                              className="p-1 hover:bg-red-50 text-stone-400 hover:text-red-700 rounded transition cursor-pointer"
                              title="删除贴图"
                            >
                              <Trash2 className="w-3" />
                            </button>
                          </div>

                          <div className="flex items-center gap-3">
                            <img src={st.src} alt="" className="w-10 h-10 object-contain border border-stone-250 bg-white" />
                            <div className="flex-1 space-y-1.5 text-[10px] text-stone-500">
                              
                              {/* Drag positions details in X-Y */}
                              <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1">
                                  <span>轴位置 X: {st.x} px</span>
                                  <input
                                    type="range"
                                    min="10"
                                    max={dims.w - 10}
                                    step="2"
                                    value={st.x}
                                    onChange={e => {
                                      const val = parseInt(e.target.value);
                                      setPanels(prev => prev.map(p => {
                                        if (p.id === selectedPanel.id && p.customStickers) {
                                          const stickers = [...p.customStickers];
                                          if (stickers[sIdx]) stickers[sIdx].x = val;
                                          return { ...p, customStickers: stickers };
                                        }
                                        return p;
                                      }));
                                    }}
                                    className="w-full h-0.5 bg-stone-200"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <span>轴位置 Y: {st.y} px</span>
                                  <input
                                    type="range"
                                    min="10"
                                    max={dims.h - 10}
                                    step="2"
                                    value={st.y}
                                    onChange={e => {
                                      const val = parseInt(e.target.value);
                                      setPanels(prev => prev.map(p => {
                                        if (p.id === selectedPanel.id && p.customStickers) {
                                          const stickers = [...p.customStickers];
                                          if (stickers[sIdx]) stickers[sIdx].y = val;
                                          return { ...p, customStickers: stickers };
                                        }
                                        return p;
                                      }));
                                    }}
                                    className="w-full h-0.5 bg-stone-200"
                                  />
                                </div>
                              </div>

                              <div className="space-y-1">
                                <span className="block">贴纸大小比例: {st.scale.toFixed(2)}x</span>
                                <input
                                  type="range"
                                  min="0.1"
                                  max="2.5"
                                  step="0.05"
                                  value={st.scale}
                                  onChange={e => {
                                    const val = parseFloat(e.target.value);
                                    setPanels(prev => prev.map(p => {
                                      if (p.id === selectedPanel.id && p.customStickers) {
                                        const stickers = [...p.customStickers];
                                        if (stickers[sIdx]) stickers[sIdx].scale = val;
                                        return { ...p, customStickers: stickers };
                                      }
                                      return p;
                                    }));
                                  }}
                                  className="w-full h-1 bg-stone-200 rounded accent-stone-700"
                                />
                              </div>

                              <div className="space-y-1">
                                <span className="block">平面倾斜角度: {st.rotate}°</span>
                                <input
                                  type="range"
                                  min="-180"
                                  max="180"
                                  step="2"
                                  value={st.rotate}
                                  onChange={e => {
                                    const val = parseInt(e.target.value);
                                    setPanels(prev => prev.map(p => {
                                      if (p.id === selectedPanel.id && p.customStickers) {
                                        const stickers = [...p.customStickers];
                                        if (stickers[sIdx]) stickers[sIdx].rotate = val;
                                        return { ...p, customStickers: stickers };
                                      }
                                      return p;
                                    }));
                                  }}
                                  className="w-full h-1 bg-stone-200 rounded accent-stone-700"
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Upload Sticker plus box */}
                  <label className="border-2 border-dashed border-stone-250 hover:border-stone-400 bg-stone-50/50 p-3.5 rounded text-center flex flex-col items-center justify-center gap-1.5 cursor-pointer hover:bg-white transition font-sans">
                    <Plus className="w-4 h-4 text-stone-500" />
                    <span className="text-xs font-bold text-stone-700">导入 PNG 透明底贴图</span>
                    <span className="text-[10px] text-stone-400">贴图会自动叠在最顶层，支持鼠标和触控拖曳</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleStickerUpload}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>
            ) : (
              <div className="h-44 flex flex-col items-center justify-center text-stone-500 text-center text-xs p-6 bg-[#FEFDF9] rounded-none border border-dashed border-stone-200/80 gap-2 font-sans">
                <Layers className="w-6 h-6 text-stone-300 animate-bounce" />
                <span className="font-serif font-bold text-stone-700 text-xs">空的选择状态</span>
                <p className="text-[10px] text-stone-400 max-w-[200px] leading-relaxed">
                  点击画布中任意漫画格，激活专属该格子的贴纸派发、底色透明、本地大插图连结、及特技参数调节功能！
                </p>
              </div>
            )}
          </div>
        </aside>

      </div>
    </div>
  );
}

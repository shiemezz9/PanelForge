export type CanvasRatio = 'portrait' | 'square' | 'landscape' | 'tall';

export type PanelEffectType = 'none' | 'screentone' | 'speedlines_h' | 'speedlines_v' | 'burst' | 'sketch_lines' | 'radial_burst';

export type BubbleType = 'normal' | 'thought' | 'action';

export interface Point {
  x: number;
  y: number;
}

export interface Onomatopoeia {
  text: string;
  x: number; // Now represents absolute SVG coordinate 0 to width
  y: number; // Now represents absolute SVG coordinate 0 to height
  rotate: number; // angle in degrees
  scale: number; // size factor
  style: 'impact' | 'grunge' | 'brush' | 'chubby';
  color: string;
  borderColor: string;
}

export interface SpeechBubble {
  text: string;
  x: number; // Now represents absolute SVG coordinate 0 to width
  y: number; // Now represents absolute SVG coordinate 0 to height
  type: BubbleType;
  scale: number;
}

export interface PanelImage {
  src: string; // base64 representation of uploaded image content
  x: number;   // absolute position inside or outside
  y: number;
  width: number;
  height: number;
  scale: number;
  rotate: number;
  isUnlocked: boolean; // if false: clipped inside panel. If true: floating, rendering below all panel grids
}

export interface CustomSticker {
  id: string;
  src: string; // base64 representation
  x: number; // absolute coordinate
  y: number; // absolute coordinate
  scale: number;
  rotate: number;
}

export interface Panel {
  id: string;
  originalVertices: Point[]; // vertices defining the split bounds
  insetVertices: Point[];    // vertices defining the actual visible panel frame (after padding/gutters)
  name: string;
  color: string; // solid color
  effect: PanelEffectType;
  storyPrompt?: string; // e.g. "主角发现神秘力量"
  onomatopoeias: Onomatopoeia[];
  bubbles: SpeechBubble[];
  effectDensity?: number;
  effectIntensity?: number;
  effectFocusSize?: number;
  effectCenterX?: number;
  effectCenterY?: number;
  effectColor?: string; // custom color of background effects
  effectAngle?: number; // custom slant angle of effects (e.g. sketch shadows)
  image?: PanelImage;
  customStickers?: CustomSticker[];
}

export interface BoardStyleConfig {
  panelCount: number;
  slantIntensity: number; // 0 to 1
  gutterWidth: number; // 0 to 32px
  borderWidth: number; // 0 to 16px
  borderColor: string;
  backgroundColor: string; // background paper / grid outline
  panelBgColor: string; // fallback panel fill
  showPrompts: boolean;
  selectedTemplate: string;
}


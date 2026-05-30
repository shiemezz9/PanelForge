import { Point, Panel, BoardStyleConfig, CanvasRatio } from '../types';
import { splitPolygon, ensureCCW, cleanDuplicates, getPolygonArea } from './geometry';

/**
 * Returns canvas dimensions based on chosen ratio
 */
export function getCanvasDimensions(ratio: CanvasRatio): { w: number; h: number } {
  switch (ratio) {
    case 'square':
      return { w: 800, h: 800 };
    case 'landscape':
      return { w: 1000, h: 600 };
    case 'tall':
      return { w: 600, h: 1200 };
    case 'portrait':
    default:
      return { w: 800, h: 1000 };
  }
}

/**
 * Story Prompts Themes for inspiration
 */
export const STORY_THEMES = [
  {
    title: '急速追逐 (The High-Speed Chase)',
    prompts: [
      '起：小巷转角，一个神秘的风衣人影闪过。',
      '承：刺耳的警笛声响起，雨夜中警车飞驰鸣笛。',
      '转：前路竟是死胡同！神秘人纵身凌空跃起，使出绝技！',
      '合：原来那是高墙上的猫咪，正懒洋洋地打着哈欠。',
      '终：危机解除，夜色恢复宁静。'
    ]
  },
  {
    title: '迟到大危机 (Late for school!)',
    prompts: [
      '起：清晨和煦的阳光照进卧室，闹钟静静摆着。',
      '承：咖啡刚泡好，热气腾升，一派祥和温馨。',
      '转：猛一抬眼，时钟指向8:50！而第一节课9:00准时开始！',
      '合：嘴里叼着厚吐司面包，以极限速度夺门狂奔！',
      '终：最终踩点滑入教室，呼哧喘气。'
    ]
  },
  {
    title: '神秘礼盒 (Mystery Unboxing)',
    prompts: [
      '起：家门口放着一个刻满怪异浮雕的黑色木盒。',
      '承：划开封条，两手微微颤抖，深吸一口气。',
      '转：打开盖子的瞬间，一道刺眼夺目的圣光爆发渲染！',
      '合：探出脑袋的居然是一只迷你小幼龙，冲着你眨了眨眼。',
      '终：从此家里多了一只爱吃薯片的奇特宠物。'
    ]
  },
  {
    title: '樱花林剑决 (Samurai Showdown)',
    prompts: [
      '起：两名剑客在纷飞的落樱中默默对峙，风声鹤唳。',
      '承：右手缓缓搭上腰间的剑柄，刀刃发出细微寒芒。',
      '转：一阵劲风刮过，万叶旋卷！一道闪电般的银光划破天空！',
      '合：两人错身而过，背对站立。空中的花瓣被完美切成两半。',
      '终：收刀入鞘，深藏功与名。'
    ]
  },
  {
    title: '魔法学徒 (The Sorcerer Apprentice)',
    prompts: [
      '起：魔法学院角落，学徒正在尝试古老的漂浮咒。',
      '承：魔杖颤动，蓝色星尘围着沉重的汤锅旋转跳跃。',
      '转：哈啾！一个冷不防打喷嚏，法力失控雷光瞬间大作！',
      '合：砰！满脸黑灰，大锅稳稳卡住了导师的头上。',
      '终：下周的图书馆卫生又要由你来承包了。'
    ]
  }
];

export const DUMMY_COLORS = [
  '#ffffff', // Base comic white
  '#fafafa', // Minimal off-white
  '#f5f5f7', // Slate white
  '#fef3c7', // Retro warm parchment
  '#fee2e2', // Soft red
  '#e0f2fe', // Soft blue
  '#f0fdf4'  // Soft green
];

/**
 * Generates initial story prompts for generated panels
 */
export function getStoryPromptsForPanels(count: number): string[] {
  const theme = STORY_THEMES[Math.floor(Math.random() * STORY_THEMES.length)];
  const results: string[] = [];
  for (let i = 0; i < count; i++) {
    const promptIndex = Math.min(i, theme.prompts.length - 1);
    results.push(theme.prompts[promptIndex]);
  }
  return results;
}

/**
 * Generates randomly split panel definitions based on style configuration
 */
export function generateRandomLayout(
  ratio: CanvasRatio,
  config: BoardStyleConfig
): Panel[] {
  const { w, h } = getCanvasDimensions(ratio);

  // Define initial root rectangle vertices
  const rootVertices: Point[] = [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h }
  ];

  interface TempPanel {
    vertices: Point[];
  }

  let list: TempPanel[] = [{ vertices: rootVertices }];

  // Splitting loop to reach desired target count
  for (let step = 0; step < config.panelCount - 1; step++) {
    // Find the panel with the largest area to split next
    let largestIdx = 0;
    let maxArea = -1;

    for (let i = 0; i < list.length; i++) {
      const area = Math.abs(getPolygonArea(list[i].vertices));
      if (area > maxArea) {
        maxArea = area;
        largestIdx = i;
      }
    }

    const target = list[largestIdx];
    
    // Choose direction based on aspect ratio
    const xs = target.vertices.map(v => v.x);
    const ys = target.vertices.map(v => v.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    const tw = maxX - minX;
    const th = maxY - minY;
    const aspect = tw / th;

    let direction: 'vertical' | 'horizontal';
    if (aspect > 1.4) {
      direction = 'vertical';
    } else if (aspect < 0.72) {
      direction = 'horizontal';
    } else {
      direction = Math.random() > 0.5 ? 'vertical' : 'horizontal';
    }

    // Split ratio (between 0.38 and 0.62 for neat proportions)
    const splitRatio = 0.38 + Math.random() * 0.24;

    let A: Point;
    let B: Point;

    if (direction === 'vertical') {
      const splitX = minX + tw * splitRatio;
      const slant = (Math.random() * 2 - 1) * config.slantIntensity * tw * 0.16;
      A = { x: splitX - slant, y: minY - 40 };
      B = { x: splitX + slant, y: maxY + 40 };
    } else {
      const splitY = minY + th * splitRatio;
      const slant = (Math.random() * 2 - 1) * config.slantIntensity * th * 0.16;
      A = { x: minX - 40, y: splitY - slant };
      B = { x: maxX + 40, y: splitY + slant };
    }

    const [leftPoly, rightPoly] = splitPolygon(target.vertices, A, B);

    // If split yields valid pieces, replace the parent
    if (leftPoly.length >= 3 && rightPoly.length >= 3) {
      list.splice(largestIdx, 1, { vertices: leftPoly }, { vertices: rightPoly });
    } else {
      // Degenerated split, let's try the alternative split direction
      const altDir = direction === 'vertical' ? 'horizontal' : 'vertical';
      let altA: Point, altB: Point;
      
      if (altDir === 'vertical') {
        const splitX = minX + tw * 0.5;
        altA = { x: splitX, y: minY - 40 };
        altB = { x: splitX, y: maxY + 40 };
      } else {
        const splitY = minY + th * 0.5;
        altA = { x: minX - 40, y: splitY };
        altB = { x: maxX + 40, y: splitY };
      }

      const [altLeft, altRight] = splitPolygon(target.vertices, altA, altB);
      if (altLeft.length >= 3 && altRight.length >= 3) {
        list.splice(largestIdx, 1, { vertices: altLeft }, { vertices: altRight });
      } else {
        // Fallback: If split is completely failing, stop splitting or continue
        break;
      }
    }
  }

  // Get prompts
  const storyPrompts = config.showPrompts ? getStoryPromptsForPanels(list.length) : [];

  // Map to full Panel definition, applying custom inset gutters
  return list.map((item, idx) => {
    return {
      id: `panel-${idx}-${Date.now()}`,
      originalVertices: item.vertices,
      insetVertices: item.vertices, // default, will be adjusted in state update
      name: `分格 ${idx + 1}`,
      color: DUMMY_COLORS[idx % DUMMY_COLORS.length],
      effect: 'none',
      storyPrompt: storyPrompts[idx] || undefined,
      onomatopoeias: [],
      bubbles: []
    };
  });
}

/**
 * Returns preset presets for templates
 */
export function getPresetTemplates(ratio: CanvasRatio): { name: string; panels: number; slant: number; gutter: number }[] {
  return [
    { name: '单格插画 (Splash 1P)', panels: 1, slant: 0, gutter: 0 },
    { name: '经典四格漫画 (Yonkoma 4P)', panels: 4, slant: 0, gutter: 14 },
    { name: '动感斜切分格 (Dynamic Slant 5P)', panels: 5, slant: 0.6, gutter: 10 },
    { name: ' cinematic叙事 (Cinematic 3P)', panels: 3, slant: 0.25, gutter: 15 },
    { name: '悬疑多段剪辑 (Suspense 6P)', panels: 6, slant: 0.5, gutter: 8 },
    { name: '热血格斗拼板 (Action Shonen 7P)', panels: 7, slant: 0.8, gutter: 12 }
  ];
}

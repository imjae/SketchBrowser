import Svg, { Path } from 'react-native-svg';

const paths = {
  pen: 'M15 5l4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15l-1 6 5-2',
  browse: 'M8 13V5a1.5 1.5 0 0 1 3 0v7-9a1.5 1.5 0 0 1 3 0v9-7a1.5 1.5 0 0 1 3 0v7-3a1.5 1.5 0 0 1 3 0v6c0 5-3 7-7 7-3 0-5-2-6-4l-3-5a1.7 1.7 0 0 1 3-2l2 2',
  underline: 'M6 3v7a6 6 0 0 0 12 0V3M4 21h16',
  highlighter: 'M5 14l9-11 7 6-10 10-6-5zM5 14l-2 6 6-2M3 22h18',
  eraser: 'M14 3l7 7-10 10H6l-4-4L14 3zM8 10l7 7M11 20h11',
  back: 'M15 5l-7 7 7 7', forward: 'M9 5l7 7-7 7',
  chevronUp: 'M5 15l7-7 7 7', chevronDown: 'M5 9l7 7 7-7',
  maximize: 'M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5',
  minimize: 'M3 8h5V3M21 8h-5V3M8 21v-5H3M16 21v-5h5',
  reload: 'M20 7v5h-5M20 12a8 8 0 1 0-2 6', home: 'M3 11l9-8 9 8M5 10v11h5v-7h4v7h5V10',
  library: 'M3 4h5v17H3zM10 4h4v17h-4zM16 5l4-1 3 16-4 1z',
  undo: 'M8 5l-5 5 5 5M3 10h10a7 7 0 0 1 7 7v3', redo: 'M16 5l5 5-5 5M21 10H11a7 7 0 0 0-7 7v3',
  check: 'M5 12l4 4L20 5', globe: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M3 12h18M12 3c-5 5-5 13 0 18 5-5 5-13 0-18',
  lock: 'M6 10h12v11H6zM8 10V7a4 4 0 0 1 8 0v3M12 14v3', arrow: 'M5 12h14M13 6l6 6-6 6', close: 'M6 6l12 12M18 6L6 18',
  note: 'M5 3h10l4 4v14H5zM14 3v5h5M8 12h8M8 16h5', save: 'M4 3h13l4 4v14H3V3h1M7 3v6h9V3M7 21v-8h10v8',
} as const;

export type IconName = keyof typeof paths;
export function Icon({ name, size = 20, color = '#737d73' }: { name: IconName; size?: number; color?: string }) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d={paths[name]} stroke={color} strokeWidth={1.65} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>;
}

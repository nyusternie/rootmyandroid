// apps/android/icons.tsx — vector icons (react-native-svg 15.16.1, pinned).
// BrandIcon ports the sitewide SU-robot favicon glyph (Base.astro header /
// public/icon.svg: green Android body, red cape, yellow SU diamond) so the
// app header matches the web brand; letters omitted at this size per the
// favicon convention. Nav glyphs mirror the web footer icon set — same
// stroke language, color passed in so active/inactive share the theme.
import Svg, { Circle, Path, Rect, Text as SvgText } from 'react-native-svg';

export function BrandIcon({ size = 26 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M6.8 12.6 3.6 20.8c1.6-0.9 2.6-1.2 3.4-1.3z" fill="#e23a3a" />
      <Path d="M17.2 12.6l3.2 8.2c-1.6-0.9-2.6-1.2-3.4-1.3z" fill="#e23a3a" />
      <Path d="M9.1 6.2 7.7 4.1M14.9 6.2l1.4-2.1" stroke="#3ddc84" strokeWidth={1.1} strokeLinecap="round" />
      <Path d="M6.5 11a5.5 5.5 0 0 1 11 0z" fill="#3ddc84" />
      <Circle cx={9.7} cy={8.6} r={0.85} fill="#0d0f12" />
      <Circle cx={14.3} cy={8.6} r={0.85} fill="#0d0f12" />
      <Rect x={6.5} y={12.4} width={11} height={5.4} rx={1.6} fill="#3ddc84" />
      <Rect x={4.4} y={12.4} width={1.7} height={4.6} rx={0.85} fill="#3ddc84" />
      <Rect x={17.9} y={12.4} width={1.7} height={4.6} rx={0.85} fill="#3ddc84" />
      <Path d="M12 12.6l2.8 2.8-2.8 2.8-2.8-2.8z" fill="#f7d154" />
      <SvgText
        x={12}
        y={16.35}
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize={2.7}
        fontWeight={900}
        fill="#e23a3a"
        textAnchor="middle"
        letterSpacing={-0.1}
      >
        SU
      </SvgText>
      <Rect x={8.6} y={17.9} width={2.4} height={3.4} rx={1.2} fill="#3ddc84" />
      <Rect x={13} y={17.9} width={2.4} height={3.4} rx={1.2} fill="#3ddc84" />
    </Svg>
  );
}

export type NavIconName = 'scan' | 'devices' | 'backups' | 'tools';

/** Stroke glyphs — 24 viewBox, strokeWidth 2, same shapes as the web
 * footer icons; `color` carries the theme (active/inactive). */
export function NavIcon({ name, color, size = 22 }: { name: NavIconName; color: string; size?: number }) {
  const stroke = {
    stroke: color,
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {name === 'scan' && (
        <>
          <Path d="M4 8V4h4M20 8V4h-4M4 16v4h4M20 16v4h-4" {...stroke} />
          <Circle cx={12} cy={12} r={1.6} fill={color} />
        </>
      )}
      {name === 'devices' && (
        <>
          <Rect x={7} y={3} width={10} height={18} rx={2} {...stroke} />
          <Path d="M11 18h2" {...stroke} />
        </>
      )}
      {name === 'backups' && (
        <Path d="M7 18h10a4 4 0 0 0 .8-7.9A6 6 0 0 0 6.2 8.7 4.5 4.5 0 0 0 7 18z" {...stroke} />
      )}
      {name === 'tools' && (
        <>
          <Rect x={3} y={4} width={18} height={16} rx={2} {...stroke} />
          <Path d="M7 9l3 3-3 3M12.5 15H17" {...stroke} />
        </>
      )}
    </Svg>
  );
}

/** Account glyph — head + shoulders, same stroke language as the nav icons
 * (owner request 2026-11-13: the header Account button becomes an icon). */
export function UserIcon({ color, size = 20 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={8} r={4} stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M4 20c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

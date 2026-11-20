import type { NodeType } from '../run';

export const NODE_LABEL: Record<NodeType, string> = {
  fight: 'Fight',
  rest: 'Rest',
  shop: 'Shop',
  treasure: 'Treasure',
  boss: 'Boss',
};

export const NODE_GLYPH: Record<NodeType, string> = {
  fight: '⚔',
  rest: '☾',
  shop: '¤',
  treasure: '◆',
  boss: '☠',
};

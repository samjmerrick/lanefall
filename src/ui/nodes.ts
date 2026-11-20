import type { NodeType } from '../run';

export const NODE_LABEL: Record<NodeType, string> = {
  fight: 'Fight',
  elite: 'Elite',
  event: 'Event',
  rest: 'Rest',
  shop: 'Shop',
  treasure: 'Treasure',
  boss: 'Boss',
};

export const NODE_GLYPH: Record<NodeType, string> = {
  fight: '⚔',
  elite: '♛',
  event: '?',
  rest: '☾',
  shop: '¤',
  treasure: '◆',
  boss: '☠',
};

// Static placeholder data for the M0 match screen. Replaced by engine state in M2.
export type FactionId = 'ember' | 'tide' | 'grove' | 'bastion' | 'dusk';

export interface PlaceholderCard {
  id: string;
  name: string;
  faction: FactionId;
  cost: number;
  power?: number;
  health?: number;
}

export const LANES = [
  { id: 'left', name: 'Left', effect: '+1 Power here', icon: '▲' },
  { id: 'centre', name: 'Centre', effect: 'Overflow ×2', icon: '✕' },
  { id: 'right', name: 'Right', effect: '2 units per side', icon: '‖' },
] as const;

export const HAND: PlaceholderCard[] = [
  { id: 'ember-spark', name: 'Spark Runner', faction: 'ember', cost: 1, power: 2, health: 1 },
  { id: 'bastion-squire', name: 'Shield Squire', faction: 'bastion', cost: 2, power: 1, health: 4 },
  { id: 'ember-bolt', name: 'Cinder Bolt', faction: 'ember', cost: 2 },
  { id: 'bastion-captain', name: 'Wall Captain', faction: 'bastion', cost: 3, power: 3, health: 4 },
  { id: 'ember-brute', name: 'Ash Brute', faction: 'ember', cost: 4, power: 6, health: 3 },
];

export const OPPONENT_UNITS: Record<string, (PlaceholderCard | null)[]> = {
  left: [
    { id: 'dusk-shade', name: 'Shade', faction: 'dusk', cost: 1, power: 1, health: 2 },
    null,
    null,
    null,
  ],
  centre: [null, null, null, null],
  right: [
    { id: 'tide-wisp', name: 'Wisp', faction: 'tide', cost: 2, power: 2, health: 2 },
    { id: 'tide-crab', name: 'Crab', faction: 'tide', cost: 1, power: 1, health: 3 },
    null,
    null,
  ],
};

export const PLAYER_UNITS: Record<string, (PlaceholderCard | null)[]> = {
  left: [null, null, null, null],
  centre: [
    { id: 'bastion-recruit', name: 'Recruit', faction: 'bastion', cost: 1, power: 1, health: 2 },
    null,
    null,
    null,
  ],
  right: [null, null, null, null],
};

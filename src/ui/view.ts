// The board as shown on screen. Built from engine state when idle, and stepped forward by engine
// events while a round animates. The UI never decides results: it only replays what the engine reported.
import {
  getCard,
  unitMaxHealth,
  unitPower,
  type GameEvent,
  type GameState,
  type LaneIndex,
  type PlayerId,
} from '../engine';

export interface ViewUnit {
  uid: number;
  cardId: string;
  owner: PlayerId;
  power: number;
  health: number;
  damage: number;
  barrier: boolean;
}

export interface ViewLane {
  effectId: string;
  revealed: boolean;
  slots: [(ViewUnit | null)[], (ViewUnit | null)[]];
}

export interface BoardView {
  lanes: [ViewLane, ViewLane, ViewLane];
  hp: [number, number];
}

export function viewFromState(s: GameState): BoardView {
  return {
    hp: [s.players[0].hp, s.players[1].hp],
    lanes: s.lanes.map((lane, i) => ({
      effectId: lane.effectId,
      revealed: lane.revealed,
      slots: lane.slots.map((side) =>
        side.map((unit, slot) =>
          unit
            ? {
                uid: unit.uid,
                cardId: unit.cardId,
                owner: unit.owner,
                power: unitPower(s, { unit, lane: i as LaneIndex, slot }),
                health: unitMaxHealth(s, { unit, lane: i as LaneIndex, slot }),
                damage: unit.damage,
                barrier: unit.barrier,
              }
            : null,
        ),
      ) as ViewLane['slots'],
    })) as BoardView['lanes'],
  };
}

function mapUnits(v: BoardView, uid: number, f: (u: ViewUnit) => ViewUnit | null): BoardView {
  return {
    ...v,
    lanes: v.lanes.map((lane) => ({
      ...lane,
      slots: lane.slots.map((side) => side.map((u) => (u && u.uid === uid ? f(u) : u))),
    })) as BoardView['lanes'],
  };
}

function findView(v: BoardView, uid: number): { unit: ViewUnit; lane: LaneIndex } | null {
  for (let lane = 0; lane < 3; lane++)
    for (const side of v.lanes[lane]!.slots)
      for (const u of side) if (u?.uid === uid) return { unit: u, lane: lane as LaneIndex };
  return null;
}

function newUnit(uid: number, cardId: string, owner: PlayerId): ViewUnit {
  const card = getCard(cardId);
  return {
    uid,
    cardId,
    owner,
    power: card.power ?? 0,
    health: card.health ?? 1,
    damage: 0,
    barrier: card.keywords.includes('barrier'),
  };
}

function withUnitAt(
  v: BoardView,
  lane: LaneIndex,
  owner: PlayerId,
  slot: number,
  unit: ViewUnit | null,
): BoardView {
  const lanes = [...v.lanes] as BoardView['lanes'];
  const slots = lanes[lane].slots.map((side) => [...side]) as ViewLane['slots'];
  slots[owner][slot] = unit;
  lanes[lane] = { ...lanes[lane], slots };
  return { ...v, lanes };
}

export function applyEvent(v: BoardView, e: GameEvent): BoardView {
  switch (e.type) {
    case 'UnitPlaced':
    case 'UnitSummoned':
      return withUnitAt(v, e.lane, e.player, e.slot, newUnit(e.uid, e.cardId, e.player));
    case 'UnitMoved': {
      const found = findView(v, e.uid);
      if (!found) return v;
      const cleared = mapUnits(v, e.uid, () => null);
      return withUnitAt(cleared, e.to, found.unit.owner, e.slot, found.unit);
    }
    case 'UnitBuffed':
      return mapUnits(v, e.uid, (u) => ({ ...u, power: u.power + e.power, health: u.health + e.health }));
    case 'DamageDealt':
      return mapUnits(v, e.uid, (u) => ({ ...u, damage: u.damage + e.amount }));
    case 'BarrierBroken':
      return mapUnits(v, e.uid, (u) => ({ ...u, barrier: false }));
    case 'KeywordGranted':
      return e.keyword === 'barrier' ? mapUnits(v, e.uid, (u) => ({ ...u, barrier: true })) : v;
    case 'UnitHealed':
      return mapUnits(v, e.uid, (u) => ({ ...u, damage: Math.max(0, u.damage - e.amount) }));
    case 'UnitDied':
      return mapUnits(v, e.uid, () => null);
    case 'HeroDamaged': {
      const hp = [...v.hp] as BoardView['hp'];
      hp[e.player] -= e.amount;
      return { ...v, hp };
    }
    case 'HeroHealed': {
      const hp = [...v.hp] as BoardView['hp'];
      hp[e.player] += e.amount;
      return { ...v, hp };
    }
    case 'LaneRevealed': {
      const lanes = [...v.lanes] as BoardView['lanes'];
      lanes[e.lane] = { ...lanes[e.lane], revealed: true };
      return { ...v, lanes };
    }
    default:
      return v;
  }
}

/** How long each event holds the screen, in ms at normal speed. */
export function eventDuration(e: GameEvent): number {
  switch (e.type) {
    case 'CardRevealed':
      return 500;
    case 'LaneCombat':
      return 550;
    case 'LaneRevealed':
      return 500;
    case 'HeroDamaged':
    case 'HeroHealed':
      return 300;
    case 'UnitDied':
      return 220;
    case 'UnitPlaced':
    case 'UnitSummoned':
    case 'UnitMoved':
      return 200;
    case 'DamageDealt':
    case 'UnitHealed':
    case 'UnitBuffed':
    case 'BarrierBroken':
      return 120;
    case 'RoundStarted':
      return 350;
    default:
      return 0;
  }
}

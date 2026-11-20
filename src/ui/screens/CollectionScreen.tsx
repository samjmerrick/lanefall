import { collectibleCards } from '../../engine';
import { ownedCards, useApp } from '../app';
import { useMatch } from '../store';
import { CardBrowser } from './CardBrowser';
import { ScreenFrame } from './common';

export function CollectionScreen() {
  const profile = useApp((s) => s.profile);
  const showDetail = useMatch((s) => s.showDetail);
  const owned = ownedCards(profile);
  return (
    <ScreenFrame title={`Collection · ${owned.size}/${collectibleCards().length}`} label="Collection">
      <CardBrowser owned={owned} onTap={showDetail} />
    </ScreenFrame>
  );
}

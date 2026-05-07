import type { CroquisSessionItem } from '../../../shared/types';

export const formatSeconds = (value: number) => {
  const seconds = Math.max(0, Math.floor(value));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${remainder.toString().padStart(2, '0')}`;
};

export const shuffleItems = (items: CroquisSessionItem[]) => {
  const bundles = items.reduce<CroquisSessionItem[][]>((nextBundles, item) => {
    if (nextBundles.length > 0) {
      const lastBundle = nextBundles[nextBundles.length - 1];
      const lastItem = lastBundle[lastBundle.length - 1];

      if (lastItem.assetId === item.assetId) {
        lastBundle.push(item);
        return nextBundles;
      }
    }

    nextBundles.push([item]);
    return nextBundles;
  }, []);

  for (let index = bundles.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [bundles[index], bundles[swapIndex]] = [bundles[swapIndex], bundles[index]];
  }

  return bundles.flat();
};

export const timestampNow = () => new Date().toISOString();

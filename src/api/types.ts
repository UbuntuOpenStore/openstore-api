import { SerializedPackage } from 'db/package/types';

export type DiscoverHighlight = {
  id: string;
  image: string;
  description: string;
  app: SerializedPackage;
}

export type DiscoverCategory = {
  name: string;
  tagline: string;
  referral: string;
  ids: string[];
  apps: SerializedPackage[];
}

export type DiscoverData = {
  highlights: DiscoverHighlight[];
  categories: DiscoverCategory[];
  highlight: DiscoverHighlight;
}

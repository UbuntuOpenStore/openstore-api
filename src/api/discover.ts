/* eslint-disable no-param-reassign */
import shuffle from 'shuffle-array';
import express, { type Request, type Response } from 'express';

import { Package } from 'db/package';
import { Architecture, DEFAULT_CHANNEL, Channel, PackageType } from 'db/package/types';
import { RatingCount } from 'db/rating_count';
import { success, getData, getDataArray, setLang, gettext, config, asyncErrorWrapper } from 'utils';
import { serializeRatings } from 'db/package/methods';
import discoverJSON from './json/discover_apps.json';
import { type DiscoverHighlight, type DiscoverData } from './types';

const router = express.Router();

const discoverCache: { [key: string]: DiscoverData } = {};
const discoverDate: { [key: string]: Date } = {};

const NEW_AND_UPDATED = 'New and Updated Apps';
const POPULAR = 'Most Loved';

/**
 * Set the highlighted app list in the discover data
 */
async function getHighlights(
  discover: DiscoverData,
  channel: Channel,
  architecture: Architecture,
  frameworks: string[],
  apiVersion?: number,
) {
  const highlights = await Package.findByFilters({
    ids: discover.highlights.map((highlight) => highlight.id),
    channel,
    architectures: [architecture, Architecture.ALL],
    frameworks,
    published: true,
  });

  discover.highlights = discover.highlights.map((highlight) => {
    const highlightedApp = highlights.find((app) => app.id === highlight.id);

    if (!highlightedApp) {
      return null;
    }

    return {
      ...highlight,
      image: config.server.host + highlight.image,
      app: highlightedApp.serialize(architecture, channel, frameworks, apiVersion),
    };
  }).filter(Boolean) as DiscoverHighlight[];

  // Deprecated, for backwards compatibility
  discover.highlight = discover.highlights[0];
}

/**
 * Set the new and updated in the discover data.
 */
async function getNewAndUpdatedApps(
  discover: DiscoverData,
  channel: Channel,
  architecture: Architecture,
  frameworks: string[],
  apiVersion?: number,
) {
  const [newApps, updatedApps] = await Promise.all([
    Package.findByFilters({
      published: true,
      channel,
      architectures: [architecture, Architecture.ALL],
      frameworks,
      nsfw: [null, false],
      types: [PackageType.APP],
    }, '-published_date', 8),

    Package.findByFilters({
      published: true,
      channel,
      architectures: [architecture, Architecture.ALL],
      frameworks,
      nsfw: [null, false],
      types: [PackageType.APP],
    }, '-updated_date', 8),
  ]);

  const newAndUpdatedCategory = discover.categories.find((category) => (category.name === NEW_AND_UPDATED));

  // Get the 10 latest updated or published apps
  let newAndUpdatedApps = newApps.concat(updatedApps);
  newAndUpdatedApps = newAndUpdatedApps.filter((app, pos) => {
    return newAndUpdatedApps.findIndex((a) => a.id === app.id) === pos;
  });

  newAndUpdatedApps.sort((a, b) => {
    if (a.updated_date! > b.updated_date!) {
      return -1;
    }

    if (a.updated_date! < b.updated_date!) {
      return 1;
    }

    return 0;
  });

  newAndUpdatedCategory!.apps = newAndUpdatedApps.slice(0, 10)
    .map((app) => app.serialize(architecture, channel, frameworks, apiVersion));
}

/**
 * Set the apps in the categories in the discover data.
 */
async function getCategoryApps(
  discover: DiscoverData,
  channel: Channel,
  architecture: Architecture,
  frameworks: string[],
  apiVersion?: number,
) {
  const discoverCategoriesApps = await Promise.all(discover.categories.map((category) => {
    if (category.ids.length === 0) {
      return [];
    }

    return Package.findByFilters({
      ids: category.ids,
      channel,
      architectures: [architecture, Architecture.ALL],
      frameworks,
      published: true,
    });
  }));

  discover.categories = discover.categories.map((category, index) => {
    const apps = discoverCategoriesApps[index].map((app) => app.serialize(architecture, channel, frameworks, apiVersion));

    return {
      ...category,
      ids: shuffle(category.ids),
      apps: shuffle(apps),
    };
  });
}

/**
 * Set the popular apps in the discover data.
 */
async function getPopularApps(
  discover: DiscoverData,
  channel: Channel,
  architecture: Architecture,
  frameworks: string[],
  apiVersion?: number,
) {
  const popularApps = await Package.findByFilters({
    published: true,
    channel,
    architectures: [architecture, Architecture.ALL],
    frameworks,
    nsfw: [null, false],
    types: [PackageType.APP],
  }, '-calculated_rating', 8);

  const popularCategory = discover.categories.find((category) => (category.name === POPULAR));
  popularCategory!.apps = popularApps.map((app) => app.serialize(architecture, channel, frameworks, apiVersion));
}

/**
 * Refresh the ratings in the cached discover data
 */
async function refreshRatings(discover: DiscoverData) {
  const ids = discover.categories.reduce<string[]>((accumulator, category) => {
    return [...accumulator, ...category.ids];
  }, []).concat(discover.highlights.map((highlight) => highlight.id));

  const ratingCounts = await RatingCount.getCountsByIds(ids);

  discover.highlights = discover.highlights.map((app) => {
    return {
      ...app,
      ratings: serializeRatings(ratingCounts[app.id]),
    };
  });
  discover.highlight = discover.highlights[0];

  discover.categories = discover.categories.map((category) => {
    return {
      ...category,
      apps: category.apps.map((app) => {
        return {
          ...app,
          ratings: serializeRatings(ratingCounts[app.id]),
        };
      }),
    };
  });
}

/**
 * Get highlighted apps based on the data in ./json/discover_apps.json
 * This consists of a list of highlighted apps that have a banner image
 * and a list of categories that have several apps inside of them.
 * There are two static categories: one for new and updated apps
 * and one for popular apps.
 */
router.get('/', asyncErrorWrapper(async (req: Request, res: Response) => {
  const frameworks = getDataArray(req, 'frameworks', []);

  let channel = getData(req, 'channel', DEFAULT_CHANNEL).toLowerCase() as Channel;
  if (!Object.values(Channel).includes(channel)) {
    channel = DEFAULT_CHANNEL;
  }

  let architecture = getData(req, 'architecture', Architecture.ARMHF).toLowerCase() as Architecture;
  if (!Object.values(Architecture).includes(architecture)) {
    architecture = Architecture.ARMHF;
  }

  const cacheKey = `${channel}-${architecture}-${JSON.stringify(frameworks)}`;

  const now = new Date();
  if (
    !discoverDate[cacheKey] ||
    (now.getTime() - discoverDate[cacheKey].getTime()) > 600000 ||
    !discoverCache[cacheKey]
  ) { // Cache miss (10 minutes)
    const discover: DiscoverData = JSON.parse(JSON.stringify(discoverJSON));
    await getHighlights(discover, channel, architecture, frameworks, req.apiVersion);
    await getCategoryApps(discover, channel, architecture, frameworks, req.apiVersion);
    await getNewAndUpdatedApps(discover, channel, architecture, frameworks, req.apiVersion);
    await getPopularApps(discover, channel, architecture, frameworks, req.apiVersion);

    discover.categories = discover.categories.filter((category) => (category.apps.length > 0));
    discover.categories = discover.categories.map((category) => {
      return {
        ...category,
        ids: category.apps.map((app) => app.id),
      };
    });

    discoverCache[cacheKey] = discover;
    discoverDate[cacheKey] = now;

    const lang = getData(req, 'lang');
    setLang(lang);

    const cloneDiscover: DiscoverData = JSON.parse(JSON.stringify(discover));
    cloneDiscover.categories = cloneDiscover.categories.map((category) => {
      return {
        ...category,
        name: gettext(category.name),
        tagline: category.tagline ? gettext(category.tagline) : '',
      };
    });

    success(res, cloneDiscover);
  }
  else { // Cache hit
    const discover: DiscoverData = JSON.parse(JSON.stringify(discoverCache[cacheKey]));
    await refreshRatings(discover);

    success(res, discover);
  }
}, 'Unable to fetch discovery data at this time'));

export default router;

import shuffle from 'shuffle-array';
import express, { Request, Response } from 'express';

import PackageRepo from 'db/package/repo';
import { Architecture, DEFAULT_CHANNEL, Channel, PackageType, SerializedPackage } from 'db/package/types';
import { RatingCount } from 'db/rating_count';
import { serialize, serializeRatings } from 'db/package/serializer';
import { success, error, getData, getDataArray, captureException, logger, setLang, gettext, config } from 'utils';
import discoverJSON from './json/discover_apps.json';
import { DiscoverHighlight, DiscoverData } from './types';

// TODO remove this when system settings properly sends frameworks
import defaultFrameworks from './json/default_frameworks.json';

const router = express.Router();

const discoverCache: { [key: string]: DiscoverData } = {};
const discoverDate: { [key: string]: Date } = {};

const NEW_AND_UPDATED = 'New and Updated Apps';
const POPULAR = 'Most Loved';

function checkFramework(discover: DiscoverData, frameworks: string[]) {
  if (frameworks && frameworks.length > 0) {
    /* eslint-disable-next-line no-param-reassign */
    discover.categories.forEach((category) => {
      /* eslint-disable-next-line no-param-reassign */
      category.apps = category.apps.filter((app) => {
        return frameworks.includes(app.framework);
      });
      /* eslint-disable-next-line no-param-reassign */
      category.ids = category.apps.map((app) => app.id);
    });
  }

  return discover;
}

// TODO return slim version of the pkg json
router.get('/', async(req: Request, res: Response) => {
  const frameworks = getDataArray(req, 'frameworks', defaultFrameworks);

  let channel = getData(req, 'channel', DEFAULT_CHANNEL).toLowerCase();
  if (!Object.values(Channel).includes(channel)) {
    channel = DEFAULT_CHANNEL;
  }

  let architecture = getData(req, 'architecture', Architecture.ARMHF).toLowerCase();
  if (!Object.values(Architecture).includes(architecture)) {
    architecture = Architecture.ARMHF;
  }

  const cacheKey = `${channel}-${architecture}`;

  const now = new Date();
  if (
    !discoverDate[cacheKey] ||
    (now.getTime() - discoverDate[cacheKey].getTime()) > 600000 ||
    !discoverCache[cacheKey]
  ) { // Cache miss (10 minutes)
    const discover: DiscoverData = JSON.parse(JSON.stringify(discoverJSON));

    try {
      const [highlights, discoverCategoriesApps] = await Promise.all([
        PackageRepo.find({
          ids: discover.highlights.map((highlight) => highlight.id),
          channel,
          architectures: [architecture, Architecture.ALL],
          published: true,
        }),

        Promise.all(discover.categories.map((category) => {
          if (category.ids.length === 0) {
            return [];
          }

          return PackageRepo.find({
            ids: category.ids,
            channel,
            architectures: [architecture, Architecture.ALL],
            published: true,
          });
        })),
      ]);

      const [newApps, updatedApps, popularApps] = await Promise.all([
        PackageRepo.find({
          published: true,
          channel,
          architectures: [architecture, Architecture.ALL],
          nsfw: [null, false],
          types: [PackageType.APP],
        }, '-published_date', 8),

        PackageRepo.find({
          published: true,
          channel,
          architectures: [architecture, Architecture.ALL],
          nsfw: [null, false],
          types: [PackageType.APP],
        }, '-updated_date', 8),

        PackageRepo.find({
          published: true,
          channel,
          architectures: [architecture, Architecture.ALL],
          nsfw: [null, false],
          types: [PackageType.APP],
        }, '-calculated_rating', 8),
      ]);

      discover.highlights = discover.highlights.map((highlight) => {
        const highlightedApp = highlights.find((app) => app.id == highlight.id);

        if (!highlightedApp) {
          return null;
        }

        return {
          ...highlight,
          image: config.server.host + highlight.image,
          app: serialize(highlightedApp, false, architecture, req.apiVersion),
        };
      }).filter(Boolean) as DiscoverHighlight[];

      // Deprecated, for backwards compatibility
      discover.highlight = discover.highlights[0];

      discover.categories = discover.categories.map((category, index) => {
        const apps = discoverCategoriesApps[index].map((app) => serialize(app, false, architecture, req.apiVersion) as SerializedPackage);

        return {
          ...category,
          ids: shuffle(category.ids),
          apps: shuffle(apps),
        };
      });

      const newAndUpdatedCategory = discover.categories.find((category) => (category.name == NEW_AND_UPDATED));
      const popularCategory = discover.categories.find((category) => (category.name == POPULAR));

      // Get the 10 latest updated or published apps
      let newAndUpdatedApps = newApps.concat(updatedApps);
      newAndUpdatedApps = newAndUpdatedApps.filter((app, pos) => {
        return newAndUpdatedApps.findIndex((a) => a.id == app.id) == pos;
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
        .map((app) => serialize(app, false, architecture, req.apiVersion) as SerializedPackage);
      popularCategory!.apps = popularApps.map((app) => serialize(app, false, architecture, req.apiVersion) as SerializedPackage);

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

      let cloneDiscover: DiscoverData = JSON.parse(JSON.stringify(discover));
      cloneDiscover = checkFramework(cloneDiscover, frameworks);
      cloneDiscover.categories = cloneDiscover.categories.map((category) => {
        return {
          ...category,
          name: gettext(category.name),
          tagline: category.tagline ? gettext(category.tagline) : '',
        };
      });

      success(res, cloneDiscover);
    }
    catch (err) {
      logger.error('Error processing discovery');
      captureException(err, req.originalUrl);
      error(res, 'Unable to fetch discovery data at this time');
    }
  }
  else { // Cache hit
    let discover: DiscoverData = JSON.parse(JSON.stringify(discoverCache[cacheKey]));
    discover = checkFramework(discover, frameworks);

    const ids = discover.categories.reduce<string[]>((accumulator, category) => {
      return [...accumulator, ...category.ids];
    }, []).concat(discover.highlights.map((highlight) => highlight.id));

    const ratingCounts = await RatingCount.getCountsByIds(ids);

    discover.highlight.app.ratings = serializeRatings(ratingCounts[discover.highlights[0].id]);
    discover.highlights = discover.highlights.map((app) => {
      return {
        ...app,
        ratings: serializeRatings(ratingCounts[app.id]),
      };
    });

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

    success(res, discover);
  }
});

export default router;

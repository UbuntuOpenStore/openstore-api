import shuffle from 'shuffle-array';
import express, { Request, Response } from 'express';

import Package from 'db/package/model';
import PackageRepo from 'db/package/repo';
import RatingCountRepo from 'db/rating_count/repo';
import { serialize, serializeRatings } from 'db/package/serializer';
import config from 'utils/config';
import { success, error, getData, getDataArray, captureException } from 'utils/helpers';
import logger from 'utils/logger';
import * as translations from 'utils/translations';
import discoverJSON from './json/discover_apps.json';

// TODO remove this when system settings properly sends frameworks
import defaultFrameworks from './json/default_frameworks.json';

const router = express.Router();

// TODO fix types
const discoverCache: { [key: string]: any } = {};
const discoverDate: { [key: string]: any } = {};

const NEW_AND_UPDATED = 'New and Updated Apps';
const POPULAR = 'Most Loved';

function checkFramework(discover, frameworks) {
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

  let channel = getData(req, 'channel', Package.DEFAULT_CHANNEL).toLowerCase();
  if (!Package.CHANNELS.includes(channel)) {
    channel = Package.DEFAULT_CHANNEL;
  }

  let architecture = getData(req, 'architecture', Package.ARMHF).toLowerCase();
  if (!Package.ARCHITECTURES.includes(architecture)) {
    architecture = Package.ARMHF;
  }

  const cacheKey = `${channel}-${architecture}`;

  const now = new Date();
  if (
    !discoverDate[cacheKey] ||
    (now.getTime() - discoverDate[cacheKey].getTime()) > 600000 ||
    !discoverCache[cacheKey]
  ) { // Cache miss (10 minutes)
    // TODO fix types
    const discover: { highlights: any[], categories: any[], highlight: any } = JSON.parse(JSON.stringify(discoverJSON));

    try {
      const [highlights, discoverCategoriesApps, newApps, updatedApps, popularApps] = await Promise.all([
        PackageRepo.find({
          ids: discover.highlights.map((highlight) => highlight.id),
          channel,
          architectures: [architecture, Package.ALL],
          published: true,
        }),

        Promise.all(discover.categories.map((category) => {
          if (category.ids.length === 0) {
            return [];
          }

          return PackageRepo.find({
            ids: category.ids,
            channel,
            architectures: [architecture, Package.ALL],
            published: true,
          });
        })),

        PackageRepo.find({
          published: true,
          channel,
          architectures: [architecture, Package.ALL],
          nsfw: [null, false],
          types: 'app',
        }, '-published_date', 8),

        PackageRepo.find({
          published: true,
          channel,
          architectures: [architecture, Package.ALL],
          nsfw: [null, false],
          types: 'app',
        }, '-updated_date', 8),

        PackageRepo.find({
          published: true,
          channel,
          architectures: [architecture, Package.ALL],
          nsfw: [null, false],
          types: 'app',
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
      }).filter(Boolean);

      // Deprecated, for backwards compatibility
      discover.highlight = discover.highlights[0];

      discover.categories = discover.categories.map((category, index) => {
        const apps = discoverCategoriesApps[index].map((app) => serialize(app, false, architecture, req.apiVersion));

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

      newAndUpdatedCategory.apps = newAndUpdatedApps.slice(0, 10).map((app) => serialize(app, false, architecture, req.apiVersion));
      popularCategory.apps = popularApps.map((app) => serialize(app, false, architecture, req.apiVersion));

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
      translations.setLang(lang);

      let cloneDiscover = JSON.parse(JSON.stringify(discover));
      cloneDiscover = checkFramework(cloneDiscover, frameworks);
      cloneDiscover.categories = cloneDiscover.categories.map((category) => {
        return {
          ...category,
          name: translations.gettext(category.name),
          tagline: category.tagline ? translations.gettext(category.tagline) : '',
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
    let discover = JSON.parse(JSON.stringify(discoverCache[cacheKey]));
    discover = checkFramework(discover, frameworks);

    const ids = discover.categories.reduce((accumulator, category) => {
      return [...accumulator, ...category.ids];
    }, []).concat(discover.highlights.map((highlight) => highlight.id));

    const ratingCounts = await RatingCountRepo.findByIds(ids);

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

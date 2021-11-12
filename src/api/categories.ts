import express, { Request, Response } from 'express';

import { DEFAULT_CHANNEL, Channel } from 'db/package/types';
import PackageRepo from 'db/package/repo';
import config from 'utils/config';
import logger from 'utils/logger';
import { success, error, captureException, getData } from 'utils/helpers';
import * as translations from 'utils/translations';
import categoryIcons from './json/category_icons.json';

const categoryNames = Object.keys(categoryIcons);
const router = express.Router();

router.get('/', async(req: Request, res: Response) => {
  translations.setLang(getData(req, 'lang'));

  let channel = getData(req, 'channel', DEFAULT_CHANNEL);
  if (!Object.values(Channel).includes(channel)) {
    channel = DEFAULT_CHANNEL;
  }

  try {
    let categories = categoryNames.map((category) => {
      return {
        name: category,
        count: 0,
      };
    });

    if (!req.query.all) {
      categories = (await PackageRepo.categoryStats([channel])).map((stats) => {
        return {
          ...stats,
          name: stats._id,
        };
      });
    }

    const categoriesResponse = categories.filter((category) => !!category.name)
      .map((category) => {
        return {
          category: category.name,
          translation: translations.gettext(category.name),
          count: category.count,
          icon: config.server.host + categoryIcons[category.name],
        };
      });

    success(res, categoriesResponse);
  }
  catch (err) {
    logger.error('Error fetching categories');
    captureException(err, req.originalUrl);
    error(res, 'Could not fetch category list at this time');
  }
});

export default router;

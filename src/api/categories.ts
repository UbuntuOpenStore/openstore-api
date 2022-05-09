import express, { Request, Response } from 'express';

import { DEFAULT_CHANNEL, Channel } from 'db/package/types';
import { Package } from 'db/package';
import { setLang, gettext, config, success, getData, asyncErrorWrapper } from 'utils';
import categoryIcons from './json/category_icons.json';

const categoryNames = Object.keys(categoryIcons);
const router = express.Router();

router.get('/', asyncErrorWrapper(async(req: Request, res: Response) => {
  setLang(getData(req, 'lang'));

  let channel = getData(req, 'channel', DEFAULT_CHANNEL);
  if (!Object.values(Channel).includes(channel)) {
    channel = DEFAULT_CHANNEL;
  }

  let categories = categoryNames.map((category) => {
    return {
      name: category,
      count: 0,
    };
  });

  if (!req.query.all) {
    categories = (await Package.categoryStats([channel])).map((stats) => {
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
        translation: gettext(category.name),
        count: category.count,
        icon: config.server.host + (categoryIcons as { [key: string]: string })[category.name],
      };
    });

  success(res, categoriesResponse);
}, 'Could not fetch category list at this time'));

export default router;

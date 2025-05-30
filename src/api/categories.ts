import express, { type Request, type Response } from 'express';

import { Package } from 'db/package';
import { setLang, gettext, config, success, getData, asyncErrorWrapper } from 'utils';
import categoryIcons from './json/category_icons.json';
import { handleChannel } from 'utils/channels';

const categoryNames = Object.keys(categoryIcons);
const router = express.Router();

/**
 * Returns a list of available categories that apps can belong to.
 */
router.get('/', asyncErrorWrapper(async (req: Request, res: Response) => {
  setLang(getData(req, 'lang'));

  const channel = handleChannel(getData(req, 'channel'));
  let categories = categoryNames.map((category) => {
    return {
      name: category,
      count: 0,
    };
  });

  if (!req.query.all) {
    // By default we only return categories that have apps. The `all` flag tells us to return everything.

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
        slug: category.name.toLowerCase().replace('& ', '').replace(/ /g, '-'),
      };
    });

  success(res, categoriesResponse);
}, 'Could not fetch category list at this time'));

export default router;

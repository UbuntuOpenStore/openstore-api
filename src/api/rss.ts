import RSS from 'rss';
import express, { Request, Response } from 'express';

import PackageRepo from 'db/package/repo';
import { iconUrl } from 'db/package/serializer';
import { logger, config, error, captureException } from 'utils';

const router = express.Router();

function titleCase(value: string) {
  return value.replace(/_/g, ' ').replace(/\w\S*/g, (txt) => {
    return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
  });
}

async function generateFeed(req: Request, res: Response, updates: boolean) {
  const feed = new RSS({
    title: updates ? 'Updated Apps in the OpenStore' : 'New Apps in the OpenStore',
    description: updates ? 'Cool updates for Ubuntu Touch apps' : 'The hottest new apps for Ubuntu Touch',
    feed_url: `${config.server.host}/rss/${updates ? 'updates' : 'new'}.xml`,
    site_url: config.server.host,
    image_url: `${config.server.host}/logo.png`,
    ttl: 240, // 4 hours
  });

  try {
    const sort = updates ? '-updated_date' : '-published_date';
    const pkgs = await PackageRepo.find({ published: true }, sort, 10);

    pkgs.forEach((pkg) => {
      let changelog = '';
      let description = pkg.description ? `<br/>${pkg.description}` : '';
      let title = `New ${titleCase(pkg.types[0])}: ${pkg.name}`;
      if (updates) {
        changelog = pkg.changelog ? `<br/><br/>Changelog:<br/>${pkg.changelog}` : '';
        changelog = changelog.replace('\n', '<br/>');
        description = pkg.description ? `<br/><br/>Description:<br/>${pkg.description}` : '';

        if (pkg.published_date !== pkg.updated_date) {
          title = `Updated ${titleCase(pkg.types[0])}: ${pkg.name}`;
        }
      }

      const url = `${config.server.host}/app/${pkg.id}`;

      feed.item({
        title,
        url,
        description: `<a href="${url}"><img src="${iconUrl(pkg)}" /></a>${changelog}${description}`,
        author: pkg.author,
        date: pkg.updated_date!,
        custom_elements: [{ tagline: pkg.tagline ? pkg.tagline : '' }],
      });
    });
  }
  catch (err) {
    logger.error('RSS feed error', err);
    captureException(err, req.originalUrl);
    return error(res, 'There was an error generating the RSS feed');
  }

  res.header('Content-Type', 'text/xml');
  return res.send(feed.xml({ indent: true }));
}

router.get('/new.xml', (req: Request, res: Response) => {
  generateFeed(req, res, false);
});

router.get('/updates.xml', async(req: Request, res: Response) => {
  generateFeed(req, res, true);
});

router.get('/', (req: Request, res: Response) => {
  res.redirect(301, '/feeds');
});

export default router;

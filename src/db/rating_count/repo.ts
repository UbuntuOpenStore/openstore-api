import RatingCount from './model';
import { RatingCountDoc } from './types';

export default {
  async findByIds(ids: string[]) {
    const query = { package_id: { $in: ids } };

    const ratingCounts = await RatingCount.find(query).exec();

    return ratingCounts.reduce((accumulation: { [key: string]: RatingCountDoc[] }, ratingCount: RatingCountDoc) => {
      const value = accumulation[ratingCount.package_id] ? [...accumulation[ratingCount.package_id], ratingCount] : [ratingCount];

      return {
        ...accumulation,
        [ratingCount.package_id]: value,
      };
    }, {});
  },
};

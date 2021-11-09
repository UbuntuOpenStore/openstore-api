import RatingCount from './model';

export default {
  async findByIds(ids) {
    const query = { package_id: { $in: ids } };

    const ratingCounts = await RatingCount.find(query).exec();

    return ratingCounts.reduce((accumulation, ratingCount) => {
      const value = accumulation[ratingCount.package_id] ? [...accumulation[ratingCount.package_id], ratingCount] : [ratingCount];

      return {
        ...accumulation,
        [ratingCount.package_id]: value,
      };
    }, {});
  },
};

#!/usr/bin/env node

import path from 'path';
import fs from 'fs';
import { GetTextComment, po } from 'gettext-parser';
import categoryIcons from '../api/json/category_icons.json';
import discoverJSON from '../api/json/discover_apps.json';
import { DiscoverData } from '../api/types';

const discoverApps = discoverJSON as DiscoverData;

let strings = Object.keys(categoryIcons);
strings.push('Download from the');
strings.push('');

strings = strings.concat(discoverApps.categories.flatMap((category) => {
  const categoryStrings = [category.name];
  if (category.tagline) {
    categoryStrings.push(category.tagline);
  }

  return categoryStrings;
}));

const potFileName = path.join(__dirname, '../../po/openstore-web.pot');
const potContent = fs.readFileSync(potFileName, 'utf-8');
const potFile = po.parse(potContent);

// Clean up old translations - Don't do this as we might bring back categories again
/*
Object.keys(potFile.translations['']).forEach((key) => {
    if (!strings.includes(key)) {
        delete potFile.translations[''][key];
    }
});
*/

discoverApps.categories.forEach((category) => {
  potFile.translations[''][category.name] = {
    msgid: category.name,
    msgstr: [''],
    comments: {
      translator: 'Discovery section category name',
    } as GetTextComment,
  };

  if (category.tagline) {
    potFile.translations[''][category.tagline] = {
      msgid: category.tagline,
      msgstr: [''],
      comments: {
        translator: `Discovery section category tagline for "${category.name}"`,
      } as GetTextComment,
    };
  }
});

const output = po.compile(potFile);
fs.writeFileSync(potFileName, output);

console.log('Updated the pot file');

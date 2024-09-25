import Gettext from 'node-gettext';
import fs from 'fs';
import path from 'path';

const gettextParse = import('gettext-parser');
const gt = new Gettext();

const langs: string[] = [];
const poDir = path.join(__dirname, '../../po');
fs.readdirSync(poDir).forEach(async (poFile: string) => {
  if (poFile.endsWith('.po')) {
    const lang = poFile.replace('.po', '');
    const fileName = path.join(poDir, poFile);
    const content = fs.readFileSync(fileName, 'utf-8');
    const parsed = (await gettextParse).po.parse(content);

    langs.push(lang);
    gt.addTranslations(lang, 'messages', parsed);
  }
});

export function setLang(lang: string) {
  if (lang) {
    let checkLang = lang;
    if (!langs.includes(checkLang) && checkLang.includes('_')) {
      checkLang = checkLang.split('_')[0];
    }

    if (langs.includes(checkLang)) {
      gt.setLocale(checkLang);
    }
    else {
      gt.setLocale('en_US');
    }
  }
  else {
    gt.setLocale('en_US');
  }
}

export const gettext = gt.gettext.bind(gt);

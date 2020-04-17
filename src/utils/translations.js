const Gettext = require('node-gettext');
const po = require('gettext-parser').po;
const fs = require('fs');
const path = require('path');

const gt = new Gettext();

let langs = [];
let poDir = path.join(__dirname, '../../po');
fs.readdirSync(poDir).forEach((poFile) => {
    if (poFile.endsWith('.po')) {
        let lang = poFile.replace('.po', '');
        let fileName = path.join(poDir, poFile);
        let content = fs.readFileSync(fileName, 'utf-8');
        let parsed = po.parse(content);

        langs.push(lang);
        gt.addTranslations(lang, 'messages', parsed);
    }
});

module.exports = {
    setLang(lang) {
        if (lang) {
            if (langs.indexOf(lang) == -1 && lang.indexOf('_') > -1) {
                lang = lang.split('_')[0];
            }

            if (langs.indexOf(lang) > -1) {
                gt.setLocale(lang);
            }
            else {
                gt.setLocale('en_US');
            }
        }
        else {
            gt.setLocale('en_US');
        }
    },
    gettext: gt.gettext.bind(gt),
};

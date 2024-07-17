'use strict';

const { basename } = require('path');
const { promisify } = require('util');
const execFile = promisify(require('child_process').execFile);

/**
 * @typedef {{ name: string, family: string, glyphs: string }} ParsedIMFont
 * @typedef {{ cssFontFamily: string, imFontName: string }} Font
 */

/** @param {string} output */
function parseConvertListFont(output) {
  const re = /^ {2}Font: (?<name>.+)\n(?<attrs>(?: {4}.+\n)+)/gm;
  let fMatch;
  const fonts = [];
  while ((fMatch = re.exec(output))) {
    const attrRE = / {4}(?<attr>\w+): (?<val>.+)\n/g;
    let aMatch;
    /** @type {Record<string, string>} */
    const attrs = {};
    if (!fMatch.groups) continue;
    while ((aMatch = attrRE.exec(fMatch.groups.attrs))) {
      if (!aMatch.groups) continue;
      attrs[aMatch.groups.attr] = aMatch.groups.val;
    }
    if (attrs.family && attrs.glyphs) {
      fonts.push({
        name: fMatch.groups.name,
        family: attrs.family,
        glyphs: attrs.glyphs,
      });
    }
  }
  return fonts;
}

/** @param {ParsedIMFont[]} fontList */
function boldOnly(fontList) {
  return fontList.filter(
    ({ name, glyphs }) =>
      /Bold$/.test(name) || /Bold\.[a-zA-Z]+$/.test(glyphs || '')
  );
}

/** @param {ParsedIMFont[]} fontList */
function noCJK(fontList) {
  return fontList.filter(({ family }) => !(family || '').includes('CJK'));
}

/** @param {ParsedIMFont} font */
function inferFamily({ family, glyphs }) {
  return family === 'unknown'
    ? basename(glyphs || '')
        .replace(/(?:[- ]?Bold)?\.[a-z]+$/, '')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
    : family;
}

/** @param {ParsedIMFont[]} fontList */
function normalizeProps(fontList) {
  return fontList.map(f => ({
    imFontName: f.name,
    cssFontFamily: inferFamily(f),
  }));
}

/** @param {Font[]} fontList */
function sortByFamily(fontList) {
  return fontList.sort((a, b) => {
    const al = a.cssFontFamily.toLowerCase();
    const bl = b.cssFontFamily.toLowerCase();
    return al < bl ? -1 : al > bl ? 1 : 0;
  });
}

async function listFonts() {
  const res = await execFile('convert', ['-list', 'font']).catch(e => e);
  return parseConvertListFont(res.stdout);
}

async function listBoldFonts() {
  return sortByFamily(normalizeProps(boldOnly(noCJK(await listFonts()))));
}
exports.listBoldFonts = listBoldFonts;

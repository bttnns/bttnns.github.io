#!/usr/bin/env node
// Renames the site's CSS classes to short random names for the deploy, and
// checks afterwards that nothing a visitor reads was changed on the way.
//
//   rename <src> <out> <map.json>
//       Copy <src> to <out>, renaming every class in the stylesheets and in
//       the class="" attributes of the pages. Nothing else is rewritten: not
//       text, not alt or title or meta content, not scripts.
//   verify <map.json> <src> <dist> [copied-dir...]
//       Fail unless every page in <dist> still carries the same elements,
//       attributes and text as <src> (classes aside), and every other file,
//       and every copied-dir, is byte for byte the same.
//
// Both sides are read with real parsers (postcss for CSS, parse5 for HTML),
// never by searching for a class name as a word: a class called "portrait"
// must not touch the word "portrait" in a sentence.

import fs from 'node:fs';
import path from 'node:path';
import { randomInt } from 'node:crypto';
import postcss from 'postcss';
import selectorParser from 'postcss-selector-parser';
import { parse } from 'parse5';

// Classes that keep their names because site.js refers to them from string
// literals (.ln, .drift, ".term-body pre") or by a same-named id
// (theme-toggle). Scripts are never rewritten, so a class a script uses must
// be listed here; rename fails if it finds one that is not.
const KEEP = new Set(['ln', 'drift', 'term-body', 'theme-toggle']);

const NAME_LENGTH = 6;
const LETTERS = 'abcdefghijklmnopqrstuvwxyz';
const LETTERS_AND_DIGITS = LETTERS + '0123456789';

// Elements whose text is shown or run exactly as written.
const EXACT_TEXT = new Set(['pre', 'textarea', 'script', 'style']);

class CheckFailed extends Error {}

function fail(message) {
  throw new CheckFailed(message);
}

function filesUnder(dir, rel = '') {
  return fs.readdirSync(path.join(dir, rel), { withFileTypes: true })
    .sort((a, b) => (a.name < b.name ? -1 : 1))
    .flatMap((entry) => {
      const child = path.join(rel, entry.name);
      return entry.isDirectory() ? filesUnder(dir, child) : [child];
    });
}

// ---- CSS ------------------------------------------------------------------

// Calls visit(classNode) for every class selector in the stylesheet.
// Keyframe steps ("from", "50%") are not selectors and are left alone.
function eachCssClass(root, visit) {
  root.walkRules((rule) => {
    if (rule.parent.type === 'atrule' && /keyframes$/i.test(rule.parent.name)) return;
    const selector = selectorParser((selectors) => selectors.walkClasses(visit))
      .processSync(rule.selector, { lossless: true });
    if (selector !== rule.selector) rule.selector = selector;
  });
}

function renameCss(text, names) {
  const root = postcss.parse(text);
  eachCssClass(root, (node) => {
    if (names.has(node.value)) node.value = names.get(node.value);
  });
  return root.toString();
}

function cssClasses(text) {
  const found = new Set();
  eachCssClass(postcss.parse(text), (node) => found.add(node.value));
  return found;
}

// The text a stylesheet puts on the page: its content: "..." values.
function cssContentStrings(text) {
  const found = new Set();
  postcss.parse(text).walkDecls(/^content$/i, (decl) => {
    found.add(decl.value.trim().replace(/'/g, '"'));
  });
  return [...found].sort();
}

// ---- HTML -----------------------------------------------------------------

function eachElement(node, visit) {
  if (node.tagName) visit(node);
  for (const child of node.childNodes ?? []) eachElement(child, visit);
  if (node.content) eachElement(node.content, visit); // <template>
}

// `value` is a class attribute's value as written, with its quotes if any.
function renameTokens(value, names) {
  return value.replace(/[^\s"']+/g, (token) => names.get(token) ?? token);
}

// Rewrites the value of each class attribute in place and leaves every other
// byte of the page as it was.
function renameHtml(text, names, file) {
  const edits = [];
  eachElement(parse(text, { sourceCodeLocationInfo: true }), (element) => {
    if (element.tagName === 'style') {
      fail(`${file}: has a <style> block. Its selectors would not be renamed; move the rules to a stylesheet.`);
    }
    const span = element.sourceCodeLocation?.attrs?.class;
    if (!span) return;
    const raw = text.slice(span.startOffset, span.endOffset);
    const match = /^(class\s*=\s*)("[^"]*"|'[^']*'|[^\s"'=<>`]+)$/i.exec(raw);
    if (!match) return; // a bare "class" with no value
    const value = match[2];
    if (value.includes('&')) fail(`${file}: class attribute ${raw} uses a character reference; write the name out.`);
    edits.push({ at: span.startOffset + match[1].length, old: value, new: renameTokens(value, names) });
  });
  let out = '';
  let from = 0;
  for (const edit of edits.sort((a, b) => a.at - b.at)) {
    out += text.slice(from, edit.at) + edit.new;
    from = edit.at + edit.old.length;
  }
  return out + text.slice(from);
}

// A page as a flat list of what a browser, a screen reader or a crawler gets
// from it: the doctype, every element with its attributes, and every piece of
// text. Comments are dropped, and outside <pre>, <textarea>, <script> and
// <style> runs of whitespace count as one space, because the minifier may
// remove both. Class names are passed through `names`.
function pageContents(text, names) {
  const out = [];
  let pendingText = null;
  const flushText = (exact) => {
    if (pendingText === null) return;
    const shown = exact ? pendingText : pendingText.replace(/\s+/g, ' ').trim();
    if (shown) out.push(`text ${JSON.stringify(shown)}`);
    pendingText = null;
  };
  const visit = (node, exact) => {
    if (node.nodeName === '#text') {
      pendingText = (pendingText ?? '') + node.value;
      return;
    }
    if (node.nodeName === '#comment') return;
    flushText(exact);
    if (node.nodeName === '#documentType') {
      out.push(`<!doctype ${node.name}>`);
      return;
    }
    let inside = exact;
    if (node.tagName) {
      // The minifier tightens the viewport list ("a, b" to "a,b"), which no
      // one reads and browsers treat the same. Nothing else gets this pass.
      const viewport = node.tagName === 'meta' &&
        node.attrs.some(({ name, value }) => name === 'name' && value.toLowerCase() === 'viewport');
      const attrs = node.attrs.map(({ name, value }) => {
        if (viewport && name === 'content') value = value.replace(/\s+/g, '');
        if (name !== 'class') return `${name}=${JSON.stringify(value)}`;
        const tokens = value.split(/\s+/).filter(Boolean).map((token) => names.get(token) ?? token);
        return `class=${JSON.stringify(tokens.join(' '))}`;
      }).sort();
      out.push(`<${[node.tagName, ...attrs].join(' ')}>`);
      inside = exact || EXACT_TEXT.has(node.tagName);
    }
    for (const child of node.content?.childNodes ?? node.childNodes ?? []) visit(child, inside);
    flushText(inside);
    if (node.tagName) out.push(`</${node.tagName}>`);
  };
  visit(parse(text), false);
  return out;
}

function comparePages(file, before, after, names) {
  const want = pageContents(before, names);
  const got = pageContents(after, new Map());
  const length = Math.max(want.length, got.length);
  for (let i = 0; i < length; i++) {
    if (want[i] === got[i]) continue;
    fail(`${file}: the built page differs from the source.\n` +
         `  source: ${want[i] ?? '(nothing more)'}\n` +
         `  built:  ${got[i] ?? '(nothing more)'}`);
  }
}

// ---- scripts --------------------------------------------------------------

// Scripts are copied untouched, so a renamed class that a script still asks
// for by its old name would silently stop matching. Catch the two ways a
// script names a class: as a selector (".name") or as a whole string ("name").
function classUsedByScript(js, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![\\w-])\\.${escaped}(?![\\w-])|(["'\`])${escaped}\\1`).test(js);
}

// ---- commands -------------------------------------------------------------

function randomName(taken) {
  for (;;) {
    let name = LETTERS[randomInt(LETTERS.length)];
    while (name.length < NAME_LENGTH) name += LETTERS_AND_DIGITS[randomInt(LETTERS_AND_DIGITS.length)];
    if (!taken.has(name)) return name;
  }
}

function rename(src, out, mapFile) {
  const files = filesUnder(src);
  const read = (file) => fs.readFileSync(path.join(src, file), 'utf8');
  const stylesheets = files.filter((file) => file.endsWith('.css'));
  const pages = files.filter((file) => file.endsWith('.html'));
  const scripts = files.filter((file) => file.endsWith('.js'));

  const classes = new Set(stylesheets.flatMap((file) => [...cssClasses(read(file))]));
  const taken = new Set([...classes, ...KEEP]);
  const names = new Map();
  for (const name of [...classes].sort()) {
    if (KEEP.has(name)) continue;
    const short = randomName(taken);
    taken.add(short);
    names.set(name, short);
  }
  const back = new Map([...names].map(([name, short]) => [short, name]));

  for (const file of scripts) {
    const js = read(file);
    for (const name of names.keys()) {
      if (classUsedByScript(js, name)) {
        fail(`${file} refers to the class "${name}", which would be renamed. Add it to KEEP in site-classes.mjs.`);
      }
    }
  }

  fs.rmSync(out, { recursive: true, force: true });
  fs.cpSync(src, out, { recursive: true });
  const rewrite = (file, renamer) => {
    const before = read(file);
    const after = renamer(before, names, file);
    // Self-check: renaming back must give the source again, byte for byte.
    if (renamer(after, back, file) !== before) fail(`${file}: renaming the classes changed more than class names.`);
    fs.writeFileSync(path.join(out, file), after);
  };
  for (const file of stylesheets) rewrite(file, renameCss);
  for (const file of pages) rewrite(file, renameHtml);

  fs.writeFileSync(mapFile, JSON.stringify(Object.fromEntries(names), null, 2) + '\n');
  console.log(`Renamed ${names.size} classes in ${stylesheets.length} stylesheet(s) and ${pages.length} page(s); kept ${[...KEEP].join(', ')}.`);
}

function verify(mapFile, src, dist, copiedDirs) {
  const names = new Map(Object.entries(JSON.parse(fs.readFileSync(mapFile, 'utf8'))));
  let pages = 0;
  let others = 0;
  const built = (file) => {
    const target = path.join(dist, file);
    if (!fs.existsSync(target)) fail(`${file}: missing from the built site.`);
    return fs.readFileSync(target);
  };

  for (const file of filesUnder(src)) {
    const before = fs.readFileSync(path.join(src, file));
    const after = built(file);
    if (file.endsWith('.html')) {
      comparePages(file, before.toString('utf8'), after.toString('utf8'), names);
      pages++;
    } else if (file.endsWith('.css')) {
      const want = cssContentStrings(before.toString('utf8'));
      const got = cssContentStrings(after.toString('utf8'));
      if (want.join('\n') !== got.join('\n')) {
        fail(`${file}: the text the stylesheet shows differs.\n  source: ${want.join(' ')}\n  built:  ${got.join(' ')}`);
      }
    } else if (file.endsWith('.js')) {
      // Rewritten by the script obfuscator; rename never touches scripts.
    } else {
      if (!before.equals(after)) fail(`${file}: changed by the build.`);
      others++;
    }
  }

  for (const dir of copiedDirs) {
    for (const file of filesUnder(dir)) {
      const name = path.join(path.basename(dir), file);
      if (!fs.readFileSync(path.join(dir, file)).equals(built(name))) fail(`${name}: changed by the build.`);
      others++;
    }
  }
  console.log(`Checked ${pages} built page(s) against the source, and ${others} other file(s) byte for byte: only class names changed.`);
}

const [command, ...args] = process.argv.slice(2);
try {
  if (command === 'rename' && args.length === 3) rename(...args);
  else if (command === 'verify' && args.length >= 3) verify(args[0], args[1], args[2], args.slice(3));
  else {
    console.error('usage: site-classes.mjs rename <src> <out> <map.json>\n' +
                  '       site-classes.mjs verify <map.json> <src> <dist> [copied-dir...]');
    process.exit(2);
  }
} catch (error) {
  if (!(error instanceof CheckFailed)) throw error;
  console.error(`site-classes: ${error.message}`);
  process.exit(1);
}

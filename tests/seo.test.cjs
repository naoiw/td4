'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const productionUrl = 'https://naoiw.github.io/td4/';
const educationUrl = productionUrl + 'assets/education/';
const main = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const education = fs.readFileSync(path.join(root, 'assets/education/index.html'), 'utf8');

function schema(source) {
  const match = source.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(match, 'JSON-LD structured data must be present');
  return JSON.parse(match[1]);
}

test('production pages have distinct crawlable metadata and canonical URLs', () => {
  for (const [source, url] of [[main, productionUrl], [education, educationUrl]]) {
    assert.match(source, /<html lang="ja">/);
    assert.match(source, /<meta name="description" content="[^"]+">/);
    assert.match(source, /<meta property="og:title" content="[^"]+">/);
    assert.match(source, /<meta property="og:description" content="[^"]+">/);
    assert.ok(source.includes('<link rel="canonical" href="' + url + '">'));
    assert.ok(source.includes('<meta property="og:url" content="' + url + '">'));
    assert.doesNotMatch(source, /<meta name="robots" content="noindex/);
  }
  assert.match(main, /<meta name="google-site-verification" content="[A-Za-z0-9_-]+">/, 'Google Search Console verification tag is present on the production page');
  assert.equal((main.match(/name="google-site-verification"/g) || []).length, 1, 'verification tag is not duplicated');
  assert.match(main, /<title>TD4 4bit CPU エミュレータ/);
  assert.match(education, /<title>TD4 4bit CPUの仕組みと命令セット/);
  assert.match(main, /<h2 id="aboutTd4Title">TD4 4bit CPUエミュレータとは<\/h2>/);
  assert.match(main, /href="assets\/education\/">TD4の仕組み/);
});

test('structured data describes a real free web application and its public documentation', () => {
  const app = schema(main);
  assert.equal(app['@type'], 'WebApplication');
  assert.equal(app.url, productionUrl);
  assert.equal(app.isAccessibleForFree, true);
  assert.equal(app.offers.price, '0');
  assert.equal(app.applicationCategory, 'EducationalApplication');
  assert.ok(!('aggregateRating' in app), 'do not invent user ratings');
  const article = schema(education);
  assert.equal(article['@type'], 'TechArticle');
  assert.equal(article.url, educationUrl);
  assert.equal(article.author.name, 'naoiw');
});

test('production sitemap lists only the two canonical public pages', () => {
  const xml = fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8');
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
  assert.deepEqual(urls, [productionUrl, educationUrl]);
  assert.doesNotMatch(xml, /\/develop\//);
  const workflow = fs.readFileSync(path.join(root, '.github/workflows/deploy-pages.yml'), 'utf8');
  assert.match(workflow, /cp production\/sitemap\.xml publish\/sitemap\.xml/);
  assert.match(workflow, /noindex,follow/);
  assert.match(workflow, /publish\/develop\/assets\/education\/index\.html/);
  assert.match(workflow, /publish\/develop\/index\.html/);
});

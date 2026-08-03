/**
 * Cite from URL (SPEC.md §3.4): extract author/date/title/site from a fetched
 * page. Extraction order: JSON-LD → OpenGraph/meta tags → <title>/heuristics.
 * Unextractable fields become placeholders.
 */

export interface CiteMeta {
  author?: string;
  site?: string;
  /** ISO-ish date string */
  date?: string;
  title?: string;
  url: string;
}

export function formatDateMDY(iso: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (m) return `${parseInt(m[2], 10)}-${parseInt(m[3], 10)}-${m[1]}`;
  const d = new Date(iso);
  if (!isNaN(d.getTime())) {
    return `${d.getMonth() + 1}-${d.getDate()}-${d.getFullYear()}`;
  }
  return null;
}

export function buildCiteLine(meta: CiteMeta, placeholder: string): string {
  const author = meta.author?.trim() || `${placeholder} ${placeholder}`;
  const quals = meta.site?.trim() || placeholder;
  const date = meta.date ? formatDateMDY(meta.date) ?? placeholder : placeholder;
  const title = (meta.title?.trim() || placeholder).replace(/"/g, "'");
  return `${author}, ${quals}, ${date}, "${title}," ${meta.url}`;
}

type JsonLdNode = Record<string, unknown>;

function collectJsonLdNodes(value: unknown, acc: JsonLdNode[]): void {
  if (Array.isArray(value)) {
    for (const v of value) collectJsonLdNodes(v, acc);
    return;
  }
  if (value && typeof value === "object") {
    const node = value as JsonLdNode;
    acc.push(node);
    if (node["@graph"]) collectJsonLdNodes(node["@graph"], acc);
  }
}

function authorName(author: unknown): string | undefined {
  if (typeof author === "string") return author;
  if (Array.isArray(author)) {
    for (const a of author) {
      const n = authorName(a);
      if (n) return n;
    }
    return undefined;
  }
  if (author && typeof author === "object") {
    const n = (author as JsonLdNode)["name"];
    if (typeof n === "string") return n;
  }
  return undefined;
}

export function extractCiteMeta(html: string, url: string): CiteMeta {
  const meta: CiteMeta = { url };
  const doc = new DOMParser().parseFromString(html, "text/html");

  // 1. JSON-LD
  const nodes: JsonLdNode[] = [];
  doc.querySelectorAll('script[type="application/ld+json"]').forEach((s) => {
    try {
      collectJsonLdNodes(JSON.parse(s.textContent ?? ""), nodes);
    } catch {
      /* malformed JSON-LD is common; ignore */
    }
  });
  for (const node of nodes) {
    const type = node["@type"];
    const types = Array.isArray(type) ? type : [type];
    if (!types.some((t) => typeof t === "string" && /article|report|posting/i.test(t))) {
      continue;
    }
    meta.author = meta.author ?? authorName(node["author"]);
    const date = node["datePublished"] ?? node["dateCreated"];
    if (!meta.date && typeof date === "string") meta.date = date;
    const headline = node["headline"];
    if (!meta.title && typeof headline === "string") meta.title = headline;
    const pub = node["publisher"];
    if (!meta.site && pub && typeof pub === "object") {
      const n = (pub as JsonLdNode)["name"];
      if (typeof n === "string") meta.site = n;
    }
  }

  // 2. meta tags
  const content = (sel: string): string | undefined =>
    doc.querySelector(sel)?.getAttribute("content")?.trim() || undefined;
  meta.author =
    meta.author ?? content('meta[name="author"]') ?? content('meta[property="article:author"]');
  meta.date =
    meta.date ??
    content('meta[property="article:published_time"]') ??
    content('meta[name="date"]') ??
    content('meta[name="publish-date"]');
  meta.title =
    meta.title ??
    content('meta[property="og:title"]') ??
    content('meta[name="twitter:title"]');
  meta.site = meta.site ?? content('meta[property="og:site_name"]');

  // 3. fallbacks
  if (!meta.title) {
    const t = doc.querySelector("title")?.textContent?.trim();
    if (t) meta.title = t;
  }
  if (!meta.site) {
    try {
      meta.site = new URL(url).hostname.replace(/^www\./, "");
    } catch {
      /* leave unset */
    }
  }
  // drop authors that are clearly not people (URLs, site names)
  if (meta.author && /https?:\/\//.test(meta.author)) meta.author = undefined;
  return meta;
}

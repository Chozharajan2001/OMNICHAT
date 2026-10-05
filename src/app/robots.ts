import type { MetadataRoute } from "next";

/**
 * OmniChat is a private, single-user workspace behind a login: every page it
 * serves is either gated or meaningless without a session, so there is nothing
 * here worth crawling. Disallowing everything also stops a search engine from
 * indexing a deployment someone stood up for themselves.
 *
 * No sitemap is published on purpose -- a sitemap of /login and /register would
 * be asserting that those are the pages people should land on.
 */
export default function robots(): MetadataRoute.Robots {
    return {
        rules: [{ userAgent: "*", disallow: "/" }],
    };
}

// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { parseSearchHtml } from "../../src/api/search-parser";

describe("api/search-parser - parseSearchHtml", () => {
  const SAMPLE_HTML = `
    <dl class="chapter-list">
      <dd>
        <a class="name" href="/series/bloom_into_you">Bloom Into You</a>
        <small class="author"><a href="/authors/nakatani_nio">Nakatani Nio</a></small>
        <small class="released">released May 15, 2018</small>
        <span class="tags">
          <a class="label" href="/tags/school_life">School Life</a>
          <a class="label" href="/tags/drama">Drama</a>
        </span>
      </dd>
      <dd>
        <a class="name" href="/chapters/citrus_ch01">Citrus Ch. 1</a>
        <small><a href="/authors/saburouta">Saburouta</a></small>
        <span class="tags">
          <a class="label" href="/tags/romance">Romance</a>
        </span>
      </dd>
    </dl>
    <div class="pagination">
      <ul>
        <li class="active"><span>1</span></li>
        <li><a href="/search?q=test&page=2">2</a></li>
        <li><a href="/search?q=test&page=3">3</a></li>
        <li class="next"><a href="/search?q=test&page=2">Next &rsaquo;</a></li>
        <li class="last"><a href="/search?q=test&page=25">Last &raquo;</a></li>
      </ul>
    </div>
  `;

  it("parses search items and tags accurately", () => {
    const page = parseSearchHtml(SAMPLE_HTML, "test", 1);
    expect(page.items.length).toBe(2);

    const s1 = page.items[0];
    expect(s1.title).toBe("Bloom Into You");
    expect(s1.kind).toBe("series");
    expect(s1.permalink).toBe("bloom_into_you");
    expect(s1.author?.name).toBe("Nakatani Nio");
    expect(s1.tags.map((t) => t.name)).toEqual(["School Life", "Drama"]);

    const c1 = page.items[1];
    expect(c1.title).toBe("Citrus Ch. 1");
    expect(c1.kind).toBe("chapter");
    expect(c1.permalink).toBe("citrus_ch01");
  });

  it("extracts totalPages from Last link href even when text is non-numeric", () => {
    const page = parseSearchHtml(SAMPLE_HTML, "test", 1);
    expect(page.currentPage).toBe(1);
    expect(page.totalPages).toBe(25);
  });
});

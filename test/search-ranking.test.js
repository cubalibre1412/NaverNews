const test = require("node:test");
const assert = require("node:assert/strict");

const {
  scoreNaverNewsItem,
  rankNaverNewsItems
} = require("../server");

test("exact keyword phrase in the title ranks ahead of summary-only matches", () => {
  const items = [
    {
      title: "오늘의 식품 업계 동향",
      summary: "풀무원 식품의 신제품 소식",
      url: "https://example.com/summary"
    },
    {
      title: "풀무원 식품 신제품 출시",
      summary: "신제품을 소개했다",
      url: "https://example.com/title"
    }
  ];

  const ranked = rankNaverNewsItems(items, "풀무원 식품", 20);

  assert.equal(ranked[0].url, "https://example.com/title");
  assert.ok(ranked[0].score > ranked[1].score);
  assert.deepEqual(ranked[0].matchedTerms, ["풀무원", "식품"]);
});

test("ranking is capped at 20 and duplicate URLs are removed", () => {
  const items = Array.from({ length: 25 }, (_, index) => ({
    title: `풀무원 기사 ${index}`,
    summary: "",
    url: `https://example.com/${index}`
  }));
  items.push({ ...items[0] });

  const ranked = rankNaverNewsItems(items, "풀무원", 30);

  assert.equal(ranked.length, 20);
  assert.equal(new Set(ranked.map((item) => item.url)).size, 20);
});

test("Latin keywords use token matches instead of partial word matches", () => {
  const partial = scoreNaverNewsItem({ title: "Paid service", summary: "" }, "AI");
  const exact = scoreNaverNewsItem({ title: "AI service", summary: "" }, "AI");

  assert.equal(partial.score, 0);
  assert.ok(exact.score > partial.score);
});

test("equal scores preserve Naver's original order", () => {
  const ranked = rankNaverNewsItems([
    { title: "기타 뉴스", summary: "", url: "https://example.com/first" },
    { title: "다른 뉴스", summary: "", url: "https://example.com/second" }
  ], "풀무원", 20);

  assert.deepEqual(ranked.map((item) => item.url), [
    "https://example.com/first",
    "https://example.com/second"
  ]);
});


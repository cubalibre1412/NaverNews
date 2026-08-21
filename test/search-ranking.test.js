const test = require("node:test");
const assert = require("node:assert/strict");

const {
  isWeekdaySeoul,
  isSimilarArticle,
  selectDigestResults,
  scoreNaverNewsItem,
  rankNaverNewsItems
} = require("../server");

test("scheduled delivery uses Korean weekdays", () => {
  assert.equal(isWeekdaySeoul(new Date("2026-08-21T00:00:00Z")), true);
  assert.equal(isWeekdaySeoul(new Date("2026-08-22T00:00:00Z")), false);
  assert.equal(isWeekdaySeoul(new Date("2026-08-23T23:30:00Z")), true);
});

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
  const topics = [
    "해외공장", "이사회개편", "지배구조보고서", "친환경포장", "식물성단백질",
    "스마트물류", "신규브랜드", "냉동식품", "주주총회", "감사위원회",
    "해외수출", "연구개발", "공급망관리", "사회공헌", "탄소감축",
    "제품리콜", "품질인증", "온라인판매", "임원인사", "사업보고서",
    "공장증설", "배당정책", "원재료가격", "신제품출시", "협력사상생"
  ];
  const items = topics.map((topic, index) => ({
    title: `풀무원 ${topic}`,
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

test("similar coverage from different publishers is treated as duplicate content", () => {
  const first = {
    title: "풀무원헬스케어, 갈아만든 채소 클렌즈 토마토&당근 출시",
    summary: "풀무원헬스케어가 국산 토마토와 당근을 가열하지 않고 껍질째 통째로 갈아 넣은 신제품을 출시했다. 식이섬유와 원물의 맛을 담은 제품이다."
  };
  const second = {
    title: "풀무원헬스케어 '갈아만든 채소 클렌즈 토마토·당근' 선봬",
    summary: "풀무원헬스케어는 국산 토마토와 당근을 가열하지 않은 채 껍질째 통째로 갈아 넣은 신제품을 선보였다. 식이섬유와 원물 본연의 맛을 담았다."
  };
  const unrelated = {
    title: "풀무원, 사외이사 중심의 이사회 운영 강화",
    summary: "풀무원이 지배구조 개선을 위해 이사회 내 위원회 구성을 개편했다."
  };

  assert.equal(isSimilarArticle(first, second), true);
  assert.equal(isSimilarArticle(first, unrelated), false);
});

test("digest result count is capped globally instead of once per keyword", () => {
  const topics = [
    "해외공장", "이사회개편", "지배구조보고서", "친환경포장", "식물성단백질",
    "스마트물류", "신규브랜드", "냉동식품", "주주총회", "감사위원회",
    "해외수출", "연구개발", "공급망관리", "사회공헌", "탄소감축",
    "제품리콜", "품질인증", "온라인판매", "임원인사", "사업보고서",
    "공장증설", "배당정책", "원재료가격", "신제품출시", "협력사상생"
  ];
  const results = [0, 1, 2, 3].map((keywordIndex) => ({
    keyword: `키워드${keywordIndex}`,
    items: topics.slice(keywordIndex * 6, keywordIndex * 6 + 7).map((topic, itemIndex) => ({
      title: `${topic} 관련 단독 보도`,
      summary: `${topic}에 관한 서로 다른 상세 내용과 배경을 설명하는 기사입니다.`,
      url: `https://example.com/${keywordIndex}/${itemIndex}`,
      score: 100 - keywordIndex * 10 - itemIndex
    }))
  }));

  const selected = selectDigestResults(results, 20);
  const items = selected.flatMap((result) => result.items);

  assert.equal(items.length, 20);
});

test("digest removes similar articles across different keywords", () => {
  const results = [
    {
      keyword: "풀무원",
      items: [{
        title: "풀무원, 춘천 얼음공장 글로벌 해썹 획득",
        summary: "풀무원이 춘천 얼음공장의 글로벌 해썹 인증을 획득해 해외 진출 기반을 마련했다. 인증은 식품 안전 관리 역량을 평가한다.",
        url: "https://publisher-a.example/article",
        score: 92
      }]
    },
    {
      keyword: "거버넌스",
      items: [{
        title: "풀무원 춘천 얼음공장, 글로벌 HACCP 인증 획득",
        summary: "풀무원 춘천 얼음공장이 글로벌 해썹 인증을 획득하며 해외 시장 진출 기반을 마련했다. 식품 안전 관리 역량을 인정받았다.",
        url: "https://publisher-b.example/news",
        score: 88
      }]
    }
  ];

  const selected = selectDigestResults(results, 20);

  assert.equal(selected.flatMap((result) => result.items).length, 1);
  assert.equal(selected[0].items[0].url, "https://publisher-a.example/article");
});


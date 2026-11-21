import assert from "node:assert/strict";
import test from "node:test";
import { rankProjectItemsWithEvidence } from "../../project-relevance.ts";
import { projectRetrievalCases, projectRetrievalCorpus } from "../evaluations/fixtures/project-retrieval-cases.mjs";

function legacyOverlapScore(query, candidate) {
  const tokens = query.toLocaleLowerCase().split(/[^a-z0-9]+/).filter(token => token.length > 1);
  const text = candidate.toLocaleLowerCase();
  return tokens.reduce((score, token) => score + (text.includes(token) ? 1 : 0), 0);
}

test("retrieval benchmark: BM25 finds each annotated relevant project file in the top three", () => {
  const results = projectRetrievalCases.map(item => {
    const ranked = rankProjectItemsWithEvidence(projectRetrievalCorpus, item.query, {
      getText: file => file.path + " " + file.text,
    });
    const topThree = ranked.slice(0, 3);
    return {
      id: item.id,
      expected: item.relevant,
      actual: topThree.map(entry => entry.item.id),
      matched: item.relevant.some(id => topThree.some(entry => entry.item.id === id)),
    };
  });
  const misses = results.filter(result => !result.matched);
  assert.deepEqual(misses, [], JSON.stringify(results, null, 2));
});

test("retrieval benchmark: BM25 top-three recall is no worse than legacy term overlap and includes evidence", () => {
  let bm25Hits = 0;
  let legacyHits = 0;
  for (const item of projectRetrievalCases) {
    const bm25 = rankProjectItemsWithEvidence(projectRetrievalCorpus, item.query, {
      getText: file => file.path + " " + file.text,
    });
    const legacy = [...projectRetrievalCorpus].sort((a, b) =>
      legacyOverlapScore(item.query, b.path + " " + b.text) -
      legacyOverlapScore(item.query, a.path + " " + a.text)
    );
    if (item.relevant.some(id => bm25.slice(0, 3).some(entry => entry.item.id === id))) bm25Hits++;
    if (item.relevant.some(id => legacy.slice(0, 3).some(entry => entry.id === id))) legacyHits++;
    assert.ok(bm25[0]?.matchedTerms.length, "top BM25 result should expose matched-term evidence");
  }
  assert.equal(bm25Hits, projectRetrievalCases.length);
  assert.ok(bm25Hits >= legacyHits);
});

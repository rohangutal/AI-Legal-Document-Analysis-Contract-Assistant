"""Provider-neutral hybrid retrieval and citation construction."""

from __future__ import annotations

import math
import re
from collections import Counter
from collections.abc import Mapping, Sequence


_LEGAL_SYNONYMS: dict[str, tuple[str, ...]] = {
    "terminat": ("terminat", "expir", "cancel", "breach", "notic", "renew", "end"),
    "liabil": ("liabil", "indemnif", "damag", "cap", "limit", "exposur", "loss"),
    "indemnif": ("indemnif", "liabil", "harmless", "defend", "claim", "hold"),
    "pay": ("pay", "invoic", "fee", "due", "compen", "bill", "charg", "rate"),
    "payment": ("pay", "invoic", "fee", "due", "compen", "bill", "charg", "rate"),
    "confidenti": ("confidenti", "disclosur", "secret", "propriet", "nda"),
    "oblig": ("shall", "must", "requir", "agre", "covenant", "perform"),
    "summar": ("contract", "agreement", "parti", "scope", "term", "servic", "provid"),
    "risk": ("liabil", "indemnif", "damag", "breach", "penalti", "unlimit", "exposur"),
    "disput": ("governing", "law", "jurisdict", "arbitr", "court", "venu"),
}


def hybrid_search(
    query: str,
    chunks: Sequence[Mapping[str, object]],
    *,
    top_k: int = 5,
    similarity_threshold: float = 0.0,
    metadata_filters: Mapping[str, object] | None = None,
    query_embedding: Sequence[float] | None = None,
) -> list[dict[str, object]]:
    """Rank chunks with keyword relevance plus optional cosine similarity.

    Database-backed vector search can pass precomputed embeddings here. When
    embeddings are absent, keyword-only retrieval remains deterministic and
    useful for local development and tests.
    """
    if top_k < 1:
        raise ValueError("top_k must be positive")
    terms = _terms(query)
    filtered = [chunk for chunk in chunks if _matches_filters(chunk, metadata_filters)]
    scored: list[dict[str, object]] = []
    seen_ids: set[str] = set()

    for chunk in filtered:
        content = str(chunk.get("content", ""))
        keyword_score = _keyword_score(terms, content)
        vector_score = _cosine(query_embedding, chunk.get("embedding"))
        score = (0.65 * keyword_score) + (0.35 * vector_score if query_embedding else 0.0)
        if score >= similarity_threshold and score > 0:
            result = dict(chunk)
            result["score"] = round(score, 6)
            result["citation"] = build_citation(result)
            scored.append(result)
            seen_ids.add(str(result.get("chunk_id", "")))

    scored = sorted(scored, key=lambda item: (-float(item["score"]), str(item.get("chunk_id", ""))))

    # If the user asked a broad or legal query and few/no chunks matched,
    # supply top representative contract chunks so the Agentic RAG has real context.
    if len(scored) < min(top_k, len(filtered)):
        lowered_q = query.lower()
        is_broad = any(k in lowered_q for k in ("summar", "what", "all", "provid", "contract", "review", "detail", "tell", "explain", "risk", "obligat"))
        if is_broad or not scored:
            for chunk in filtered:
                cid = str(chunk.get("chunk_id", ""))
                if cid not in seen_ids:
                    res = dict(chunk)
                    res["score"] = 0.15
                    res["citation"] = build_citation(res)
                    scored.append(res)
                    seen_ids.add(cid)
                    if len(scored) >= top_k:
                        break

    return scored[:top_k]


def build_citation(chunk: Mapping[str, object]) -> str:
    document = chunk.get("document_name") or "Source document"
    page = f"Page {chunk['page_number']}" if chunk.get("page_number") else "Page unavailable"
    section = chunk.get("section_number") or chunk.get("section_title") or "Section unavailable"
    return f"{document} — {page} — Section {section} — Chunk {chunk.get('chunk_id', 'unknown')}"


def _terms(value: str) -> set[str]:
    base_terms = {_normalize_term(term) for term in re.findall(r"[a-z0-9]{3,}", value.lower())}
    expanded = set(base_terms)
    for term in base_terms:
        for prefix, syns in _LEGAL_SYNONYMS.items():
            if term.startswith(prefix) or prefix.startswith(term):
                for syn in syns:
                    expanded.add(_normalize_term(syn))
    return expanded


def _normalize_term(term: str) -> str:
    """Apply small, dependency-free normalization for legal query variants."""
    if len(term) > 6 and term.endswith("ion"):
        return term[:-3]
    if len(term) > 5 and term.endswith("ing"):
        return term[:-3]
    if len(term) > 5 and term.endswith("ed"):
        return term[:-2]
    if len(term) > 4 and term.endswith("s"):
        return term[:-1]
    if len(term) > 5 and term.endswith("e"):
        return term[:-1]
    return term


def _keyword_score(query_terms: set[str], content: str) -> float:
    if not query_terms:
        return 0.0
    counts = Counter(_terms(content))
    overlap = sum(min(counts[term], 3) for term in query_terms)
    return min(1.0, overlap / math.sqrt(len(query_terms) * max(len(counts), 1)))


def _cosine(left: Sequence[float] | None, right: object) -> float:
    if left is None or not isinstance(right, Sequence) or not right:
        return 0.0
    values = [float(value) for value in right]
    if len(left) != len(values):
        return 0.0
    numerator = sum(float(a) * b for a, b in zip(left, values))
    denominator = math.sqrt(sum(float(a) ** 2 for a in left) * sum(value**2 for value in values))
    return numerator / denominator if denominator else 0.0


def _matches_filters(chunk: Mapping[str, object], filters: Mapping[str, object] | None) -> bool:
    return not filters or all(chunk.get(key) == value for key, value in filters.items())

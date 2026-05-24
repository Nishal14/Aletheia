"""
External knowledge fetchers: arXiv and Wikipedia.
No API keys required — both use free public APIs.
"""
import httpx
import xml.etree.ElementTree as ET
from typing import List, Optional
import logging
import re

logger = logging.getLogger(__name__)

ARXIV_NS = "http://www.w3.org/2005/Atom"


async def fetch_arxiv(query: str, max_results: int = 5) -> List[dict]:
    """Search arXiv and return paper metadata + abstracts."""
    url = "https://export.arxiv.org/api/query"
    # If the query looks like a specific paper title (quoted or title-cased),
    # search title field first; otherwise search all fields.
    is_title_search = query.startswith('"') or query.istitle() or len(query.split()) <= 4
    search_query = f'ti:"{query}"' if is_title_search else f"all:{query}"
    params = {
        "search_query": search_query,
        "start": 0,
        "max_results": max_results,
        "sortBy": "relevance",
    }
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.get(url, params=params)
            r.raise_for_status()
    except Exception as e:
        logger.error(f"arXiv fetch error: {e}")
        return []

    try:
        root = ET.fromstring(r.text)
    except ET.ParseError as e:
        logger.error(f"arXiv XML parse error: {e}")
        return []

    papers = []
    for entry in root.findall(f"{{{ARXIV_NS}}}entry"):
        def get(tag: str) -> str:
            el = entry.find(f"{{{ARXIV_NS}}}{tag}")
            return el.text.strip() if el is not None and el.text else ""

        arxiv_id = get("id").split("/abs/")[-1].split("v")[0]
        title = re.sub(r"\s+", " ", get("title"))
        abstract = re.sub(r"\s+", " ", get("summary"))
        published = get("published")[:10]
        authors = ", ".join(
            a.find(f"{{{ARXIV_NS}}}name").text
            for a in entry.findall(f"{{{ARXIV_NS}}}author")
            if a.find(f"{{{ARXIV_NS}}}name") is not None
        )

        text = (
            f"Title: {title}\n"
            f"Authors: {authors}\n"
            f"Published: {published}\n"
            f"ArXiv ID: {arxiv_id}\n\n"
            f"Abstract:\n{abstract}"
        )
        papers.append({
            "id": arxiv_id,
            "title": title,
            "authors": authors,
            "published": published,
            "abstract": abstract,
            "text": text,
            "source": f"arxiv:{arxiv_id}",
        })

    return papers


async def fetch_wikipedia(title: str, max_chars: int = 80_000) -> Optional[dict]:
    """Fetch a Wikipedia article's full plain-text content."""
    url = "https://en.wikipedia.org/w/api.php"
    params = {
        "action": "query",
        "titles": title,
        "prop": "extracts",
        "format": "json",
        "explaintext": True,
        "redirects": True,
    }
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.get(url, params=params)
            r.raise_for_status()
            data = r.json()
    except Exception as e:
        logger.error(f"Wikipedia fetch error: {e}")
        return None

    pages = data.get("query", {}).get("pages", {})
    page = next(iter(pages.values()), {})

    if page.get("missing") is not None or "extract" not in page:
        return None

    resolved_title = page.get("title", title)
    content = page["extract"][:max_chars]

    return {
        "title": resolved_title,
        "text": f"Wikipedia: {resolved_title}\n\n{content}",
        "source": f"wikipedia:{resolved_title.replace(' ', '_')}",
        "chars": len(content),
    }

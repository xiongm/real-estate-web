from urllib.parse import quote
import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from ..auth import require_admin_access
from ..config import MAPBOX_ACCESS_TOKEN

router = APIRouter()

MAPBOX_ENDPOINT = "https://api.mapbox.com/geocoding/v5/mapbox.places"

@router.get("/mapbox/autocomplete")
async def mapbox_autocomplete(
    query: str = Query(..., min_length=2, max_length=120),
    limit: int = Query(5, ge=1, le=10),
    ctx=Depends(require_admin_access),
):
    if not MAPBOX_ACCESS_TOKEN:
        raise HTTPException(status_code=503, detail="Mapbox token is not configured")
    encoded_query = quote(query)
    url = f"{MAPBOX_ENDPOINT}/{encoded_query}.json"
    params = {
        "autocomplete": "true",
        "limit": str(limit),
        "access_token": MAPBOX_ACCESS_TOKEN,
    }
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            response = await client.get(url, params=params)
            if response.status_code != 200:
                raise HTTPException(status_code=502, detail="Failed to fetch suggestions from Mapbox")
            payload = response.json()
    except HTTPException:
        raise
    except Exception as exc:  # pragma: no cover - network errors
        raise HTTPException(status_code=502, detail="Unable to reach Mapbox") from exc

    suggestions = []
    for feature in payload.get("features", []):
        place_name = feature.get("place_name")
        if not place_name:
            continue
        center = feature.get("center") or [None, None]
        suggestions.append(
            {
                "label": place_name,
                "latitude": center[1] if len(center) == 2 else None,
                "longitude": center[0] if len(center) == 2 else None,
            }
        )
    return {"query": query, "suggestions": suggestions}

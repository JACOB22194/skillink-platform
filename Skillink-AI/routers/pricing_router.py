from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from services.pricing_service import predict_price, get_supported_categories, get_supported_experiences

router = APIRouter(prefix="/pricing", tags=["Pricing"])


class PricingRequest(BaseModel):
    category:   str
    experience: str  # Beginner | Intermediate | Expert


class PricingResponse(BaseModel):
    min:              float
    max:              float
    avg:              float
    matched_category: str
    exact_match:      bool
    experience:       str


@router.post("/recommend", response_model=PricingResponse)
def recommend_price(req: PricingRequest):
    if not req.category.strip():
        raise HTTPException(status_code=400, detail="category is required")
    if not req.experience.strip():
        raise HTTPException(status_code=400, detail="experience is required")
    return predict_price(req.category, req.experience)


@router.get("/categories")
def list_categories():
    return {"categories": get_supported_categories()}


@router.get("/experiences")
def list_experiences():
    return {"experiences": get_supported_experiences()}
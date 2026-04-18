import os
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from transformers import pipeline

# 1. Setup logging so we can see the "Internal Dialogue" of the server
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

ml_state = {}

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("--- STARTING LIFESPAN ---")
    
    # Get the token and STRIP any hidden spaces or newlines
    raw_token = os.environ.get("HF_TOKEN", "")
    hf_token = raw_token.strip() 
    
    if not hf_token:
        logger.error("SYSTEM ERROR: HF_TOKEN is empty inside Python!")
        raise RuntimeError("HF_TOKEN missing.")

    # Log the token length to verify it's not being cut off
    logger.info(f"Token detected. Length: {len(hf_token)} characters.")

    try:
        logger.info("Attempting to fetch model: Yaq0ub49/bert_results_balanced")
        
        # 2. Loading the pipeline with the cleaned token
        ml_state["classifier"] = pipeline(
            "text-classification", 
            model="Yaq0ub49/bert_results_balanced", 
            token=hf_token, # Handing the key to the gatekeeper
            top_k=None 
        )
        logger.info("SUCCESS: Model loaded and ready for traffic.")
        
    except Exception as e:
        logger.error(f"HF HUB ERROR: {str(e)}")
        raise RuntimeError(f"Could not load model: {e}")
    
    yield
    ml_state.clear()
    logger.info("--- SHUTTING DOWN: Memory Cleared ---")

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class TextRequest(BaseModel):
    text: str

@app.post("/analyze")
def analyze_text(request: TextRequest):
    # Pass text to the model parked in memory
    prediction = ml_state["classifier"](request.text)[0]
    return {"status": "success", "result": prediction}
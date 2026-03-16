from typing import List

from fastapi import Depends, FastAPI
from sqlalchemy.orm import Session

import models
import schemas
from db import SessionLocal, engine

# This line is the magic. It creates the tables in the database when the server starts.
models.Base.metadata.create_all(bind=engine)

app = FastAPI()
app = FastApi()
# dependency

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@app.get("/")
def read_root():
    return {"message": "Skillink API and Database are officially connected!"}


@app.get("/users", response_model=List[models.User])
def read_users(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return db.query(models.User).offset(skip).limit(limit).all()

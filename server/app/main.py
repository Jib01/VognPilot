from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.v1 import auth, scan, grocery

app = FastAPI(
    title="VognPilot API",
    description="Backend for VognPilot Smart Grocery Scanner",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(scan.router, prefix="/api/v1/scan", tags=["scan"])
app.include_router(grocery.router, prefix="/api/v1/groceries", tags=["groceries"])

@app.get("/")

def read_root():
    return {"message": "Welcome to VognPilot API"}

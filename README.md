# VognPilot 🛒

A mobile-first grocery shopping companion designed for expats and shoppers in Denmark. VognPilot scans supermarket shelves to translate Danish product labels, convert DKK prices to EUR, track Danish return deposits (Pant), and help you stay on budget.

---

## Key Features

- **Live Shelf Scanning & OCR:** Point your camera at any grocery shelf. The app detects individual items, highlights prices, and maps products with precise bounding boxes.
- **Label Translation & EUR Conversion:** Translates Danish grocery terms into English or Italian in real time, with automatic DKK $\rightarrow$ EUR conversion (fixed 1 € ≈ 7.46 kr).
- **Dietary & Nutrition Checks:** Highlights Organic (*Ø-mærke*), Vegan, Vegetarian, Lactose-free, and Gluten-free items, along with key macro breakdowns (protein, fat, sugars per 100g).
- **Pant Deposit Tracking:** Automatically detects returnable bottle/can fees (*Pant A, B, C*) and factors them into your subtotal.
- **Offline-First Cart & Budget:** Local IndexedDB storage powered by Dexie.js keeps your shopping list and budget progress responsive even with spotty supermarket reception.

---

## Tech Stack

- **Frontend:** Next.js (App Router), React, TypeScript, Tailwind CSS, Lucide Icons, Dexie.js (IndexedDB)
- **Backend:** Python, FastAPI, Uvicorn, SQLModel / SQLAlchemy, Asyncpg
- **Database:** PostgreSQL
- **Vision & AI:** Google Gemini Vision API
- **Deployment & DevOps:** Vercel (Client), Render (Backend & DB), Docker

---

## Architecture Overview

```text
[ Mobile Browser / Client (Next.js PWA) ]
                  │
                  │  Multipart Image Upload & Preferences
                  ▼
      [ Backend API (FastAPI) ]
         │               │
         │ Cached Hash   ▼
         │ / PostgreSQL  [ Google Gemini Vision API ]
         ▼               (Shelf detection, Danish OCR & Tags)
  [ PostgreSQL DB ]
```

---

## Getting Started

### Prerequisites

- **Node.js** (v18+)
- **Python** (3.11+)
- **Docker & Docker Compose** (optional, for local PostgreSQL)
- **Google Gemini API Key**

---

### Local Setup

#### 1. Clone the repository
```bash
git clone https://github.com/Jib01/VognPilot.git
cd VognPilot
```

#### 2. Start PostgreSQL
```bash
docker compose up -d db
```

#### 3. Backend Setup (FastAPI)
```bash
cd server
python -m venv .venv

# Windows
.venv\Scripts\activate
# macOS/Linux
source .venv/bin/activate

pip install -r requirements.txt
```

Create a `.env` file in the `server/` directory:
```env
DATABASE_URL=postgresql+asyncpg://postgres:password@localhost:5433/vognpilot
GEMINI_API_KEY=your_gemini_api_key
MOCK_VISION=false
```

Start the backend server:
```bash
uvicorn app.main:app --reload --port 8000
```
API Documentation will be accessible at: `http://localhost:8000/docs`

#### 4. Frontend Setup (Next.js)
In a separate terminal:
```bash
cd client
npm install
npm run dev
```

The web application will run at: `http://localhost:3000`

---

## Production Deployment

- **Client:** Deployed on Vercel.
- **Server & Database:** Hosted on Render with managed PostgreSQL.

---

## License

This project is licensed under the MIT License.
